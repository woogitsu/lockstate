# ADR 0009: Bounded Verification Strategy for Challenges and Leaderboards

## Status
Accepted — implementation gated (see "Gates before public ranking")

## Context
Issue #36 requires that a verification strategy be chosen *before* any
implementation claims a leaderboard is fair. [ADR 0008](./0008-trusted-service-boundary.md)
established that a client-reported score is worth nothing; it did not say
what replaces it.

Lockstate has one large advantage here and one large constraint.

The advantage: the simulation is already deterministic by contract
(`docs/DETERMINISM.md`, [ADR 0004](./0004-deterministic-kernel.md)) — fixed
50 ms ticks, explicit system order, seeded named RNG streams, canonical
state hashing (`deterministicStateHash`). A recorded command stream plus a
seed *is* the run; re-executing it must reproduce the same state hash, or
determinism itself is broken.

The constraint: an open-ended sandbox session can last many real hours and
produce a command stream far too large to submit, store or re-execute for
every player. Verifying arbitrary free play is not affordable and is not
what a leaderboard needs.

## Decision

### Verified results exist only inside constrained challenge scenarios
A challenge is a **bounded scenario**: fixed starting conditions, a fixed
seed, a declared objective and a hard tick limit. Free-play sandbox
sessions are never publicly ranked. This is what makes replay verification
affordable — the maximum cost of verifying a submission is a property of
the challenge definition, known before anyone plays it.

### Evidence is the command stream, not the outcome
A submission carries a `ChallengeEvidence` payload
(`src/services/challenges/evidence.ts`):

- the challenge id **and** challenge definition version,
- the build version, content-catalog version and a config hash,
- the seed the run was played with,
- the ordered command stream (`tick`, `sequence`, `payload`), which is the
  same protocol shape the worker already accepts,
- periodic **checkpoint hashes** (canonical state hash every N ticks),
- the final state hash and the claimed metrics,
- an evidence hash over all of the above.

The claimed score is present only so it can be *contradicted*. Rank is
computed from replay output, never from the claim.

### Verification pipeline (fail-closed, cheapest checks first)
`verifyChallengeSubmission()` runs, in order:

1. **Schema** — strict parse; unknown fields reject.
2. **Definition authenticity** — the definition's signature is verified
   against a published public key; the evidence's declared definition hash
   must equal the canonical hash of the definition being verified against.
3. **Compatibility** — build version and content version must be in the
   definition's allow-lists, and the config hash must match. An
   incompatible submission is *rejected, not adapted*: replaying a stream
   under different content rules produces a different game.
4. **Budget** — command count, evidence bytes and tick count must be within
   the definition's declared limits. This bounds verification cost before
   any execution.
5. **Structure** — ticks/sequences strictly ordered, non-negative, within
   the tick limit; seed matches; submission window open.
6. **Replay** — a trusted headless runner re-executes the stream and
   returns its own state hash, checkpoint hashes and metrics.
7. **Agreement** — every checkpoint hash, the final hash and the claimed
   metrics must match the replay's own output. The replay's metrics are
   what gets ranked.

Steps 1–5 and 7 are pure, deterministic and unit-tested now; step 6 is a
port (`ChallengeReplayRunner`) so the pipeline is complete and testable
before a server-side runner exists.

### Ranking tiers
| Tier | Meaning | Visibility |
| --- | --- | --- |
| `verified` | Full pipeline passed | Eligible for public ranking |
| `unverified` | Structurally valid, replay not (yet) performed | Personal/private only — never publicly ranked |
| `rejected` | Any check failed, with a specific code | Not stored as a result |

The tier is server-assigned. A client can never submit a row that is
already `verified`; the database column is not client-writable at all
(`supabase/migrations/…_create_challenge_tables.sql`).

### Determinism drift is a rejection, not a repair
If a replay disagrees with evidence produced by an allowed build, that is
either cheating or a determinism bug — both must surface. The submission is
rejected with `final-state-hash-mismatch` / `checkpoint-hash-mismatch` and
the mismatch is diagnostic signal, never silently accepted.

## Alternatives considered

- **Trust client-reported scores.** Rejected by ADR 0008 and explicitly out
  of scope in issue #36.
- **Server-side authoritative play for challenges** (client sends inputs
  live, server simulates). Strongest guarantee, rejected for now: it needs
  a hosted simulation runtime, breaks offline attempts, and duplicates the
  worker's execution model. Deterministic replay gets most of the guarantee
  at a fraction of the cost, *because* the kernel is already deterministic.
- **Statistical anomaly detection only** (outlier scores flagged). Rejected
  as a primary control — it cannot distinguish an excellent player from a
  modest cheater — but kept as a cheap secondary layer once real
  distributions exist.
- **Cryptographically signing results in the client.** Rejected outright:
  any key shipped to the browser is the attacker's key. Signatures are used
  only in the trustworthy direction (server signs definitions, client
  verifies).

## Gates before public ranking
Public ranking may not be enabled until all of the following exist:

1. a trusted headless replay runner implementing `ChallengeReplayRunner`
   against the real kernel, running in Z2;
2. real challenge scenarios (issue #33) with measured evidence sizes and
   replay times, and budgets set from those measurements — the current
   limits are conservative defaults, not benchmarked values;
3. a security review of the submission endpoint (rate limits, abuse,
   account-scoping, storage cost);
4. a decision on what a leaderboard row exposes publicly (account display
   name policy is a privacy question, not a technical one).

Until then, the layer may compute and display *personal* verified results
and reject invalid ones — it may not present a public ranking.

## Consequences
- Challenge scenarios must be authored as bounded, seeded, tick-limited
  definitions from the start; an unbounded "challenge" is not rankable.
- Determinism becomes a *product* guarantee, not only an engineering one:
  breaking it invalidates stored evidence. Definition allow-lists are how a
  determinism-affecting build change retires old submissions explicitly.
- Evidence size is a real budget. If a scenario's stream is too large to
  submit, the scenario is wrong for ranking — not the pipeline.
