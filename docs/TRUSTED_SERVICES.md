# Trusted services: threat model, challenges and entitlements

This document covers issue #36's trusted-service half: what Lockstate
refuses to believe from a browser, where the boundary sits, and how
verified challenges and account entitlements work across it. The decisions
behind it are [ADR 0008](./adr/0008-trusted-service-boundary.md) (boundary
and threat model) and [ADR 0009](./adr/0009-challenge-verification-strategy.md)
(verification strategy). Telemetry has its own document,
[TELEMETRY.md](./TELEMETRY.md); localization has
[LOCALIZATION.md](./LOCALIZATION.md).

## What was and was not executed

- **Fully implemented and unit-tested:** everything under `src/services/`.
  It is pure TypeScript with injected ports, so the verification pipeline,
  ledger fold, webhook processing, projection policy, telemetry controls
  and localization runtime are all exercised in Node
  (`tests/unit/services-*.test.ts`).
- **Executed against a real PostgreSQL 16 + pgTAP:** the migrations in
  `supabase/migrations/` and `supabase/tests/002_entitlement_ledger_and_challenges.test.sql`
  (17/17 assertions). Reproduce with:
  ```bash
  # Debian/Ubuntu: apt-get install postgresql-16 postgresql-16-pgtap
  pnpm verify:sql               # as a superuser role, or set DATABASE_URL
  ```
  `scripts/verify-supabase-sql.mjs` applies every migration in order and
  runs every pgTAP suite against a scratch database prepared by
  `scripts/sql/supabase-compat-harness.sql`.
- **Still NOT executed:** anything against the real Supabase stack. The
  harness emulates only the roles, default grants and the slice of the
  `auth` schema our SQL references. It reproduces no GoTrue behaviour, no
  JWT verification, no PostgREST, no Storage and no Realtime, so it proves
  the SQL and proves nothing about how the hosted platform issues the
  identity those policies read. `supabase start && supabase db reset &&
  supabase test db` remains the stronger check and has never been run:
  the Docker daemon starts fine in the environments used so far, but image
  layers cannot be pulled (the registry CDN is blocked by network policy),
  so the local stack cannot come up.
- **Deliberately not built:** the deployed server functions themselves (the
  Edge Function/Worker handlers), a payment provider integration, a replay
  runner and a telemetry ingestion endpoint. Each is either out of scope
  for #36 or gated on a decision this issue does not make.

## Known failing suite: `001_rls_and_save_version_rpc.test.sql` (issue #20)

`pnpm verify:sql` currently exits non-zero, and **not because of anything
in issue #36**. Running #20's SQL for the first time surfaced two defects
in the already-merged cloud-save schema. They are recorded here because the
command is red until someone fixes them; the fix belongs to #20, not to
this issue.

1. **`create_save_version()` fails on every call.** Its `returns table
   (... revision int, checksum text)` declares OUT parameters whose names
   collide with the columns used in
   `select id, revision ... where prison_id = p_prison_id and checksum = p_checksum`.
   PostgreSQL raises `42702 column reference "revision" is ambiguous`
   before any branch is taken, so the only write path for a cloud save
   cannot succeed. Fix: alias the table (`from public.save_versions sv`)
   and qualify the references, or declare `#variable_conflict use_column`.

2. **The column-level `REVOKE` on `prisons` does not do what the migration
   says.** `has_table_privilege('authenticated','public.prisons','UPDATE')`
   is `true` after the migration: Supabase's default grant is table-level
   `ALL`, and PostgreSQL cannot subtract a single column's privilege from a
   table-level grant. An authenticated owner can therefore `PATCH` their own
   `current_revision`/`current_version_id` directly and bypass the
   optimistic-concurrency check that #20 exists to enforce — the exact
   multi-device data-loss scenario `docs/CLOUD_SAVE.md` claims is closed.
   Fix: `revoke update on public.prisons from authenticated, anon;` first,
   then `grant update (<allowed columns>) ...`.

Three further assertions in that suite (5, 6 and 7) are test-authoring
mistakes rather than schema defects: RLS makes a non-matching `UPDATE`/
`DELETE` affect zero rows instead of raising, and `throws_ok`'s two-argument
form compares the *message* rather than acting as a description — the same
mistake #36's own suite made and corrected.

## Trust zones

| Zone | Runtime | Trusted for |
| --- | --- | --- |
| Z0 | Browser: renderer, worker, IndexedDB, local caches | nothing |
| Z1 | Browser carrying a Supabase JWT | identity only |
| Z2 | Edge Function / Worker / `SECURITY DEFINER` SQL | server-authoritative state |
| Z3 | Provider webhook delivered to a Z2 endpoint | only what its signature proves |

Full authority table and the twelve modelled threats (T1–T12) are in
ADR 0008. The rule they all reduce to: **a JWT proves who is asking, never
that what they claim is true.**

## Verified challenges (`src/services/challenges/`)

### Definitions are signed; evidence is bound to them
A `ChallengeDefinition` fixes the scenario, seed, objective metric, tick
and evidence budgets, the allowed build/content versions and the
submission window. It is published signed, and
`authenticateChallengeDefinition()` verifies that signature through an
injected verifier (real Ed25519 verification is `crypto.subtle`, not
something this repository reimplements). A definition that does not verify
is unusable — not "usable but unranked" — because every downstream check
trusts the limits the definition itself declares.

Evidence carries `definitionHash`, so a submission is bound to the exact
definition body it was played against, not merely to an id/version pair.

### Evidence is the command stream
`ChallengeEvidence` is the ordered command stream (`tick`, `sequence`,
`payload`), periodic canonical state-hash checkpoints, the final state
hash and the claimed metrics. Command payloads are validated as generic
JSON at this boundary and decoded by the replay runner with the worker's
own protocol decoder — pinning the command union into the evidence schema
would invalidate every stored submission each time a command type is added,
for no security gain.

### Verification order (cheapest first, fail closed)
`verifyChallengeSubmission()`:

1. schema (strict, unknown fields rejected);
2. identity — challenge id, version, definition hash;
3. compatibility — build allow-list, content allow-list, config hash, seed,
   submission window;
4. budget — evidence bytes, command count, tick count;
5. structure — monotonic ticks, strictly increasing sequences, no command
   after the final tick, mandatory checkpoint cadence;
6. duplicate evidence (optional port);
7. replay through `ChallengeReplayRunner`;
8. agreement — every checkpoint, the final hash and the claimed metrics.

Each failure has its own code (`build-not-allowed`,
`final-state-hash-mismatch`, `metrics-mismatch`, …) so "your build is too
old" is never confused with "these hashes disagree with the replay".

### Ranking tiers
`verified` (replayed and agreeing) is the only tier eligible for public
ranking. `unverified` — structurally valid, not replayed — is a personal
result. `rejected` is not stored as a result at all. The tier is
server-assigned; `challenge_submissions.verification_status` has no client
write grant and can only leave `'pending'` once.

### Before a public leaderboard exists
ADR 0009 gates public ranking on: a real replay runner, measured evidence
sizes and replay times from real scenarios (#33), a security review of the
submission endpoint, and an explicit decision about what a leaderboard row
reveals about a player. Until then `public.challenge_leaderboard` exposes
verified scores with **no account identity**, and no role is granted to
read it.

## Entitlements (`src/services/entitlements/`)

### Ledger first, projection second
`entitlement_events` is append-only and is the source of truth;
`entitlements` is a derived projection recomputed from it. Each event
records the *resolved* capability and quantity, so replaying history never
depends on today's product catalog — a catalog edit cannot retroactively
change what an account was granted.

`foldEntitlementEvents()` is the deterministic fold: ordered by
`(occurredAt, eventId)`, duplicate event ids ignored, revocations clamped
at zero, expiry evaluated at fold time, and the total clamped to
`MAX_TOTAL_SAVE_SLOTS`. `recompute_entitlement_projection()` mirrors that
loop in SQL step for step — deliberately not a set-based
`sum(grants) - sum(revokes)`, which disagrees with the ordered fold
whenever a revocation precedes the grant it offsets.

`buildEntitlementAuditTrail()` answers "why does this account have this
capacity" with every event, its before/after balance, its actor and reason,
including events that did **not** apply and why.

### Only the server can grant
- `entitlements` and `entitlement_events`: SELECT-own policies only, and
  the default INSERT/UPDATE/DELETE grants are revoked outright.
- `record_entitlement_event()` and `recompute_entitlement_projection()`:
  `EXECUTE` revoked from `public`, `anon` and `authenticated`.
- A trigger rejects any UPDATE to the ledger; corrections are appended as
  compensating events. DELETE is left only to the `auth.users` cascade, so
  account deletion still works.
- `processEntitlementWebhook()` verifies the provider signature over the
  **raw body before parsing it**, then validates, checks the product,
  bounds the quantity, rejects stale events, deduplicates on
  `(provider, providerEventId)` and only then appends.

The payment provider is not chosen (out of scope pending commercial/legal
review), so the webhook contract is provider-agnostic and the signature
check is an injected port.

### Offline degradation
The client keeps an `EntitlementProjection` (`grantedSaveSlots`,
`ledgerRevision`, `verifiedAt`). `verifiedAt` is when a trusted read last
*confirmed* it, not when the grant happened.

| Age of confirmation | Tier | Capacity |
| --- | --- | --- |
| ≤ 24 h | `verified` | free + paid |
| ≤ 30 days | `cached` | free + paid, labelled unverified |
| > 30 days, absent, or dated implausibly into the future | `base` | free tier only |

Every unhappy path lands on the free tier: the client can lose paid
capacity offline, never invent it. A cached projection is re-validated and
clamped on load, and a cache belonging to another account is discarded.

**Losing capacity never destroys data.** `evaluateSaveSlotAccess()` blocks
*creating* new slots while over capacity and reports how many slots are
over; existing prisons stay playable
(`existingSlotsRemainPlayable`, asserted by test). Deleting or locking a
player's prisons because a cache expired would be a far worse failure than
briefly showing an over-capacity account.

The projection is advisory in any case: the trusted function that creates a
cloud slot re-checks capacity server-side, so a forged local cache buys a
misleading UI, not a right.

## Data retention and account deletion

- Ledger rows are retained for the life of the account: they are the
  financial audit trail. They are removed by the `auth.users` cascade when
  an account is deleted.
- Challenge submissions are retained for the life of the account and cascade
  the same way. Evidence is immutable once submitted.
- Telemetry retention and deletion are covered in [TELEMETRY.md](./TELEMETRY.md).
- Nothing in this layer stores payment card data, billing addresses or any
  provider PII; the ledger holds a provider name and the provider's own
  event id, nothing else about the transaction.

## What this issue deliberately did not do

Choose a payment provider or ship checkout; publish a leaderboard;
implement the replay runner; deploy any server function; build a
telemetry ingestion endpoint; or translate the game.
