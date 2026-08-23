# Cloud save: schema, RLS, sync and conflicts

This document covers issue #20: the Supabase-backed cloud persistence
model built on top of `docs/PERSISTENCE.md`'s save envelope (#18) and
`src/persistence/local/`'s local-first repository (#19).

## What has and has not been executed

This work was originally produced in a sandbox with no working database,
so every file under `supabase/` was shipped as reviewed-by-inspection
design. That gap is now partly closed:

- **Executed:** every migration in `supabase/migrations/` and
  `supabase/tests/001_rls_and_save_version_rpc.test.sql` (16/16
  assertions), against PostgreSQL 16.13 + pgTAP 1.3.2 via
  `pnpm verify:sql`. Running them for the first time found three defects
  in this design — see "Defects found by executing this schema" below.
  The same suites are green on PostgreSQL 18.6 + pgTAP 1.3.4, and
  `pnpm verify:sql` now runs in CI after `scripts/provision-postgres.sh`,
  so a change to this schema cannot reach `main` unexecuted again. See
  `docs/TESTING.md` for the provisioning contract.
- **Still not executed:** anything against the real Supabase stack.
  `pnpm verify:sql` prepares a plain Postgres with
  `scripts/sql/supabase-compat-harness.sql`, which supplies only the
  client roles, Supabase's default table grants and the slice of the
  `auth` schema this SQL references. It emulates no GoTrue, JWT
  verification, PostgREST, Storage or Realtime, so a green run proves the
  SQL and proves nothing about how the hosted platform issues the identity
  these policies read. Run `supabase start && supabase db reset &&
  supabase test db` before treating the platform behaviour as verified.
- **Not executed:** `SupabaseCloudSaveClient` (`src/persistence/cloud/
  supabase-client.ts`) still has no automated test; a pure-JS fake would
  test the fake, not the contract.
- **Not attempted:** the JSONB-vs-Storage payload benchmark and any real
  upload/download/restore timing. Both need an actual Supabase project.
  See "Storage placement" below.
- **Fully implemented and unit-tested:** `PrisonSyncEngine`,
  `resolveSyncConflict` and `MemoryCloudSaveClient`
  (`src/persistence/cloud/`) — the client-side sync/conflict policy is
  pure TypeScript, including a two-concurrent-pushes test.

## Defects found by executing this schema

All three were invisible while the SQL was never run:

1. **`create_save_version()` failed on every call.** Its `returns table
   (... revision int, checksum text)` declares OUT parameters whose names
   collide with the columns in the idempotency lookup, so PostgreSQL
   raised `42702 column reference "revision" is ambiguous` before any
   branch was taken — the only write path for a cloud save could not
   succeed. Fixed by table-qualifying the lookup.

2. **The column-level `REVOKE` on `prisons` did nothing.** PostgreSQL
   cannot subtract a single column's privilege out of a table-level
   grant, and Supabase's default grant is table-level `ALL`, so
   `has_table_privilege('authenticated', 'prisons', 'UPDATE')` stayed
   true: an owner could `PATCH` `current_revision` directly and bypass
   optimistic concurrency entirely — exactly the multi-device data-loss
   scenario this design exists to prevent. Fixed by revoking the
   table-level privilege and granting back only the editable columns.

3. **The pgTAP suite asserted a contract the schema cannot implement.**
   One case expected a stale-checksum resubmission to be reported as a
   conflict, while the function's own header documents it as an idempotent
   replay; `save_versions_prison_checksum_unique` makes the test's version
   unimplementable without changing what the checksum identifies. The test
   now asserts the documented behaviour, and the consequence for
   `PrisonSyncEngine` is recorded as an open question in the suite.

Several assertions in that suite were also passing or failing for the
wrong reason: pgTAP's two-argument `throws_ok` compares the error
*message* rather than taking a description, and RLS makes a foreign
`UPDATE`/`DELETE` match zero rows instead of raising. Both are corrected.

## Schema (`supabase/migrations/`)

| Table | Purpose | Ownership |
| --- | --- | --- |
| `profiles` | One row per `auth.users` identity (anonymous or upgraded). Created lazily, not by an on-signup trigger. | `id = auth.uid()` |
| `prisons` | One row per cloud save slot. `current_version_id`/`current_revision` are the only mutable pointer, advanced exclusively by `create_save_version()`. Multiple prisons per owner from the start — never a one-per-user table. | `owner_id = auth.uid()` |
| `save_versions` | Immutable generations, mirroring the local repository's generation model (#19). Never updated after insert; `unique (prison_id, revision)` and `unique (prison_id, checksum)`. | indirect, via `prisons.owner_id` |
| `user_settings` | Cloud-synced input/accessibility preferences (`src/input/storage.ts`), deliberately outside any prison payload. | `user_id = auth.uid()` |
| `entitlements` | Paid save-slot expansion etc. Client-readable, never client-writable — see "Trusted mutations" below. | `user_id = auth.uid()`, SELECT only |

### Why a table-level policy is not enough for `prisons.current_version_id`

RLS `USING`/`WITH CHECK` clauses only ever check *row* ownership, not which
*columns* an `UPDATE` touches. An owner-scoped `UPDATE` policy on `prisons`
would otherwise let a normal PostgREST `PATCH` bypass optimistic
concurrency entirely by writing `current_revision` directly.

The fix is **revoke-then-grant**, not a column-level `REVOKE`. PostgreSQL
cannot subtract one column's privilege out of a table-level grant, and
Supabase grants table-level `ALL` by default, so
`revoke update (current_revision) on prisons from authenticated` leaves the
table-level `UPDATE` intact and changes nothing. `prisons` therefore
revokes `UPDATE` outright and grants back only
`(display_name, game_version, slot_index, updated_at)`, leaving
`create_save_version()` — `SECURITY DEFINER`, with its own `auth.uid()`
check inside — as the only path able to advance the pointer columns.

`save_versions` goes further: `authenticated`/`anon` get no
insert/update/delete grant on it at all, so immutability doesn't depend on
a trigger the client could reason its way around. That table-level revoke
was always effective; only the column-level one on `prisons` was not.

## Optimistic concurrency and idempotent resume (`create_save_version`)

One `SECURITY DEFINER` RPC (`supabase/migrations/
20260822190300_create_save_version_rpc.sql`) is the sole write path for a
cloud save:

1. Locks the `prisons` row (`SELECT ... FOR UPDATE`), serializing concurrent
   calls for the *same* prison without affecting other prisons.
2. Checks `auth.uid() = owner_id` itself — `SECURITY DEFINER` bypasses RLS,
   so this explicit check is the only thing standing between an
   authenticated caller and any prison row.
3. If a `save_versions` row already exists for `(prison_id, checksum)`,
   returns it as `idempotent_replay` — retrying an upload whose response
   was lost, but which actually committed, is always safe and never
   creates a duplicate version.
4. Otherwise, accepts the new version only if `p_new_revision = current_revision + 1`
   ("N → N+1 only when N remains current"); anything else — behind or
   ahead — is reported as `conflict`, never silently applied.

`envelope.revision` (#18) *is* this revision counter: the client always
sends its own envelope's `revision` as `p_new_revision`, so there is no
second, parallel revision concept to keep in sync.

## Sync policy (`src/persistence/cloud/`)

`PrisonSyncEngine.push`/`.pull` are the only two operations, against a
storage-agnostic `CloudSaveClient` interface (mirroring `LocalSaveStore`
from #19) so all policy is unit-testable with `MemoryCloudSaveClient`
without a real Supabase project:

- `push` uploads an envelope and reports one of: `uploaded`,
  `already-synced` (idempotent replay), a `conflict` carrying the cloud's
  actual current version, or `not-registered`/`error`.
- `pull` downloads the cloud's current version and runs it through
  `decodeSaveEnvelope` (#18: schema + migration + checksum) before the
  caller can trust it — an invalid or future-schema cloud payload is
  rejected the same way a corrupt local generation is (#19).

### Conflict resolution — user-facing choices, never automatic

`resolveSyncConflict(choice, cloudCurrent)` maps an explicit user choice to
the next action; it never resolves anything on its own:

| Choice | Action | Meaning |
| --- | --- | --- |
| `keep-local` | `retry-push` at `cloudCurrent.revision + 1` | Re-upload the same local content against the now-known real baseline. Still goes through the same `create_save_version` conflict check — not a bypass. |
| `keep-cloud` | `pull-and-adopt` | Download and locally adopt the cloud version. This overwrites local state, but only after explicit user confirmation — not silent last-write-wins. |
| `duplicate` | `duplicate-as-new-prison` | Keep the local content as a **new** prison; the original cloud prison and its history are untouched. |
| `cancel` | `cancel` | Do nothing. |

There is no session/save UI yet to actually present these choices or call
`push`/`pull`/the local repository together — this issue stops at the
policy layer, same as #19 stopped at the repository layer.

## Anonymous identity upgrade

Supabase's built-in anonymous auth (`supabase.auth.signInAnonymously()`)
creates a real `auth.users` row; linking a permanent identity later
(`linkIdentity`/`updateUser`) keeps that **same** `id`. Every foreign key
in this schema (`prisons.owner_id`, `profiles.id`, `user_settings.user_id`,
`entitlements.user_id`) points at `auth.users.id`, so upgrading an account
requires no data migration or extra step here — existing prisons simply
continue to belong to the same, now-permanent, identity. This is a
property of Supabase's anonymous-auth design, not something this schema
implements itself; it is not exercised by a pgTAP test here because it is
a GoTrue-level auth flow, not a row-level SQL behavior — verify it with a
manual or CLI-level auth flow test, not `supabase test db`.

## Storage placement (JSONB vs. Supabase Storage): candidate, not decided

`save_versions.payload`/`storage_path` model a hybrid split (the
`save_versions_exactly_one_location` check constraint enforces exactly one
is set), but **no threshold is chosen yet** — issue #20's own acceptance
criteria require it to come from a benchmark ("JSONB versus Storage
payloads across representative sizes/compression options"), which needs a
live Supabase project this environment does not have.
`SupabaseCloudSaveClient.downloadVersion` deliberately throws if it ever
encounters a `storage_path`-backed row, rather than silently only
half-supporting it. This mirrors `docs/ARCHITECTURE.md`'s existing
"candidate until benchmarked" treatment of chunk size — do not treat the
schema's mere ability to represent a Storage-backed row as an accepted
policy.

## Credential/environment setup (no secrets)

`.env.example` already declares `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` — the browser must only ever hold the
publishable/anon key, never a service-role key (`AGENTS.md`,
`docs/ARCHITECTURE.md` "Security"). Nothing in this issue's code reads a
service-role key or any other secret; `create_save_version` runs
server-side as `SECURITY DEFINER`, which is how privileged writes happen
without a service-role key ever reaching the client. To actually run the
migrations/tests locally: install the Supabase CLI, run `supabase init`
(if `supabase/config.toml` does not already exist) to generate a
CLI-version-correct config, then `supabase start`.

## What is out of scope here

Payments/paid-slot checkout; trusting client-submitted values for
leaderboards; realtime collaborative simulation; automatic destructive
conflict resolution (every conflict requires the explicit choices above).
