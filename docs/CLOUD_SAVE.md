# Cloud save: schema, RLS, sync and conflicts

This document covers issue #20: the Supabase-backed cloud persistence
model built on top of `docs/PERSISTENCE.md`'s save envelope (#18) and
`src/persistence/local/`'s local-first repository (#19).

## What could and could not be executed in this environment

This work was produced in a sandbox with no Docker daemon and no
Supabase CLI available (starting the Docker daemon was blocked by the
sandbox's own safety policy, and no live Supabase project/credentials
exist here). That materially changes what counts as verified evidence
for this issue specifically:

- **Not executed, reviewed by inspection only:** every file under
  `supabase/migrations/` and `supabase/tests/`. They have never been
  applied to a real or local Postgres instance. Run them with:
  ```bash
  supabase start
  supabase db reset   # applies every migration in order
  supabase test db    # runs supabase/tests/*.sql
  ```
  before trusting this schema/RLS/RPC design as verified, and before
  closing any acceptance criterion that depends on it.
- **Not executed:** `SupabaseCloudSaveClient` (`src/persistence/cloud/
  supabase-client.ts`) has no automated test, for the same reason
  `IndexedDbLocalSaveStore` was untested before #19 added
  `fake-indexeddb` — except there is no equivalent narrow, pure-JS way to
  fake Postgres RLS/`SECURITY DEFINER` semantics; a fake here would test
  the fake, not this contract.
- **Not attempted at all:** the JSONB-vs-Storage payload benchmark and any
  real upload/download/restore timing. Both require an actual Supabase
  project. See "Storage placement" below.
- **Fully implemented and unit-tested, no external dependency needed:**
  `PrisonSyncEngine`, `resolveSyncConflict` and `MemoryCloudSaveClient`
  (`src/persistence/cloud/`) — the client-side sync/conflict policy is
  pure TypeScript and is tested the same way #19's repository policy was,
  including a two-concurrent-pushes test.

Treat this as a substantial design-and-code slice, not a closed issue.

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
concurrency entirely by writing `current_revision` directly. Each
migration that needs this narrows Supabase's default per-table grant with
an explicit column-level `REVOKE UPDATE (...) ... FROM authenticated`,
leaving `create_save_version()` — `SECURITY DEFINER`, with its own
`auth.uid()` check inside — as the only path able to advance those
columns. `save_versions` goes further: `authenticated`/`anon` get no
insert/update/delete grant on it at all, so immutability doesn't depend on
a trigger the client could reason its way around.

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
