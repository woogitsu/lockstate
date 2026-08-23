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
- **Executed against the real Supabase local stack:** every migration in
  `supabase/migrations/` and all four pgTAP suites in `supabase/tests/`,
  under Supabase CLI 2.115.0 with GoTrue, PostgREST, Storage and Realtime
  running. Reproduce with:
  ```bash
  supabase start && supabase db reset && supabase test db
  ```
  The first such run found a defect that had been invisible to every earlier
  check, and the security audit of that run found a second — see "Defects
  this tooling found" below.
- **Also executed against a plain PostgreSQL 16/18 + pgTAP:** the same
  migrations and suites. First run on 16.13 + pgTAP 1.3.2, since also on
  18.6 + pgTAP 1.3.4 — no major version is required or pinned. Reproduce
  with:
  ```bash
  scripts/provision-postgres.sh # installs whichever major the distro ships
  pnpm verify:sql               # as a superuser role, or set DATABASE_URL
  ```
  `scripts/verify-supabase-sql.mjs` applies every migration in order and
  runs every pgTAP suite against a scratch database prepared by
  `scripts/sql/supabase-compat-harness.sql`. This path needs no Docker, so
  it is what CI runs on every pull request; it stays the fast check and is
  not a substitute for the stack run above, which is a local manual gate.
- **Executed through the platform's own front doors:** `pnpm verify:stack`
  (`scripts/verify-supabase-stack.mjs`) drives a running local stack over
  HTTP — anonymous sign-in via `/auth/v1`, then the cloud-save contract, its
  ownership boundaries and the signed-out read surface via `/rest/v1`. This
  is the only check that proves GoTrue actually mints the identity
  `auth.uid()` reads; the pgTAP suites fake it with `set_config`.
- **Still NOT executed:** anything against a hosted Supabase *project*. The
  local stack runs the same GoTrue/PostgREST/Storage images, but nothing
  here has exercised a real project's networking, quotas or connection
  pooling.
- **Deliberately not built:** the deployed server functions themselves (the
  Edge Function/Worker handlers), a payment provider integration, a replay
  runner and a telemetry ingestion endpoint. Each is either out of scope
  for #36 or gated on a decision this issue does not make.

## Defects this tooling found in the cloud-save schema (#20)

Running #20's SQL for the first time — with the runner added here — showed
that the schema merged for issue #20 did not work: `create_save_version()`
raised `42702 column reference "revision" is ambiguous` on every call, and
the column-level `REVOKE` on `prisons` could not narrow Supabase's
table-level grant, leaving optimistic concurrency bypassable by a direct
`PATCH`. Both are fixed on `main` (PR #52) and documented in
[CLOUD_SAVE.md](./CLOUD_SAVE.md).

Running it on the real Supabase stack then found a fourth defect that the
harness had actively hidden, and that affected this issue's tables too:
`entitlement_events`, `entitlements`, `challenge_definitions` and
`challenge_submissions` had no Data API `SELECT` grant, so every policy
above them was unreachable code. See CLOUD_SAVE.md for the full account and
`supabase/tests/003_data_api_grants.test.sql` for the regression pin.

The general lesson is worth keeping, in both directions: every one of those
defects was invisible for as long as the SQL was only reviewed — and an
emulator that is *more* permissive than the thing it emulates does not just
fail to catch a defect, it certifies one.

## Defects the security review of that fix found

Granting `anon` and `authenticated` what their policies need left the
mirror-image hole open. Two of the findings were this issue's own; the
others are in [CLOUD_SAVE.md](./CLOUD_SAVE.md).

**The entire Z2 write path was dead.** No migration granted `service_role`
anything. Supabase's revoke names it alongside the two client roles, and
`BYPASSRLS` — which the trusted role does have — decides which *rows* a
role sees, never whether it may touch the table at all. Queried on the
running stack, `service_role` held no DML on any of the eight tables and
`EXECUTE` on none of the four functions. Concretely: a signature-verified
payment webhook calling `record_entitlement_event` would have got `42501`,
so no purchase could ever have been honoured; and no challenge submission
could have been advanced out of `'pending'`, so `challenge_leaderboard`
was structurally guaranteed to stay empty. Every assertion passed, because
none of them had ever mentioned `service_role`, and the pgTAP suite ran the
trusted steps as the privileged role that invokes it — which succeeds
regardless of what `service_role` holds.

The fix grants the minimum each trusted path actually performs, per table
and per function, next to the client grants:

| Object | `service_role` | Why |
| --- | --- | --- |
| `challenge_definitions` | `SELECT`, `INSERT` | publish a signed definition; read the one being replayed against, including a staged one the client policy hides |
| `challenge_submissions` | `SELECT`, `UPDATE (verification_status, rejection_code, ranked_score, verified_at)` | read pending evidence; record the verdict. Column-scoped so a compromised verifier cannot reassign a submission or rewrite the evidence |
| `entitlement_events` | `SELECT` | the webhook's `findByProviderEvent` dedup pre-check, and staff audit |
| `record_entitlement_event()` | `EXECUTE` | the Z3 → Z2 write path itself |
| everything else | *nothing* | cloud saves are client-authoritative (ADR 0008); `entitlements` is a projection written only inside the RPC as the table owner; `recompute_entitlement_projection` is an internal step of that RPC, not an entry point |

**`challenge_definitions` published unopened challenges.** The read policy
was `using (true)` while the table carries `opens_at`, `closes_at` and
`published_at`. `submit_challenge_evidence` enforces the submission window;
a *read* is not a submission, so anyone holding the publishable key could
`GET /rest/v1/challenge_definitions?select=*` and take the full signed
`definition` — seed, objectives, scoring — for a challenge that had not
opened, solve it offline at leisure and submit the moment it did. The
policy is now `published_at <= now() and opens_at <= now()`:
`published_at` is the staging switch, `opens_at` is the fairness one, and
`closes_at` is deliberately *not* a bound so past results stay
independently verifiable against the bytes that were signed.

The visibility rule this implements — **nobody sees a seed before everybody
does** — costs the client the ability to pre-download a definition ahead of
its opening moment. That is the intended trade and is stated here rather
than left implicit, because a future "prefetch tomorrow's challenge"
feature would have to reopen it deliberately, with the head start it
implies made explicit.

Both are now pinned. `supabase/tests/003_data_api_grants.test.sql` sweeps
all three roles schema-wide instead of `anon` alone, asserts that every
`public` table has RLS enabled, and covers materialized views, partitioned
tables and foreign tables. `supabase/tests/002_…` runs every trusted step
under `set local role service_role`. `scripts/verify-supabase-stack.mjs`
drives the trusted paths over HTTP with the local stack's secret key, which
is the only place PostgREST's mapping of that credential onto the role is
exercised at all.

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
- `record_entitlement_event()`: `EXECUTE` revoked from `public`, `anon` and
  `authenticated`, then granted to `service_role` and to nothing else. That
  grant is not a formality — without it the function is unreachable by the
  only caller it has, which is exactly the state this schema shipped in
  until the security review; see "Defects the security review of that fix
  found" above.
- `recompute_entitlement_projection()`: `EXECUTE` revoked from all four
  roles including `service_role`. It is an internal step of the function
  above, reached as the table owner through `SECURITY DEFINER`, never an
  entry point; a separate grant would only add a way to rewrite the
  projection with no ledger append behind it.
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

The projection is advisory in any case: a forged local cache is meant to
buy a misleading UI, not a right, because the point of effect re-checks
capacity.

**That re-check now exists** (issue #57,
[ADR 0012](./adr/0012-free-tier-cloud-save-capacity.md)). It did not when
this paragraph was first written, which is why it used to overclaim: slot
creation was a plain `INSERT` into `prisons` under `prisons_insert_own`,
which enforces ownership and nothing about capacity, and
`create_save_version()` placed no bound on payload size — so an
over-capacity account was stopped by the client alone.

Two triggers and one RPC close it, and capacity is read from the
`entitlements` projection above rather than from anything the client sends:

- `prisons_enforce_slot_capacity` counts an owner's prisons under a
  per-owner advisory lock and refuses with SQLSTATE `LS001`. It is a
  trigger rather than only an RPC because the invariant belongs to the
  table, not to one caller — the same reasoning as
  `entitlement_events_no_update` above.
- `public.create_prison()` is the front door and returns a discriminated
  `status` (`created` / `at_slot_limit` / `slot_taken`) with `used_slots`
  and `capacity`, so "you are at your slot limit" is never confused with
  "something broke".
- `save_versions_enforce_size` measures the stored payload, overwrites the
  caller's `byte_size` claim with the measurement, and refuses anything over
  `public.max_save_payload_bytes()` with `LS002`.

The degradation shape this section promises is what the schema now does:
the triggers fire on *creation* and on nothing else, so an over-capacity
account keeps every prison, keeps listing and pulling them, and keeps saving
to them. `supabase/tests/004_free_tier_capacity.test.sql` asserts exactly
that, including after a revocation leaves an account holding seven prisons
with an entitlement to five.

**The 4 MiB per-save figure is proposed, not accepted** — ADR 0012 is in
`Proposed` status and names the three numbers a reviewer is being asked to
sign off on. Revision-history depth and a total-bytes-per-account cap are
proposed and deliberately unimplemented, and anonymous-identity churn stays
a separate lever (GoTrue rate limits, cleanup of abandoned anonymous
accounts) that #57 names and ADR 0012 records rather than closes.

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

Save-slot capacity at the database tier *was* on this list and no longer is:
issue #57 and ADR 0012 close it, as described under "Offline degradation".
