# Cloud save: schema, RLS, sync and conflicts

This document covers issue #20: the Supabase-backed cloud persistence
model built on top of `docs/PERSISTENCE.md`'s save envelope (#18) and
`src/persistence/local/`'s local-first repository (#19).

## What has and has not been executed

This work was originally produced in a sandbox with no working database,
so every file under `supabase/` was shipped as reviewed-by-inspection
design. That gap is now closed except where noted:

- **Executed against the real Supabase local stack:** the first nine
  migrations in `supabase/migrations/` and the first four pgTAP suites in
  `supabase/tests/` — 89 assertions, all passing (19/19, 25/25, 19/19,
  26/26) — under Supabase CLI 2.115.0, with GoTrue, PostgREST, Storage and
  Realtime running:
  ```bash
  supabase start && supabase db reset && supabase test db
  ```
  This closes the outstanding verification item that #20 and #36 both
  carried, and it earned its keep immediately: the first run failed on the
  *first assertion* of suite 001 and exposed defect 4 below.

  **The #105 hardening is not in that run.** Eleven migrations now postdate
  it — `20260824090000` and `20260824090100` for findings 5, 10 and 3 (see
  "Declarations, not only privileges" below), `20260824100000` and
  `20260824100100` for findings 1 and 2, `20260824101000` for finding 4 and
  `20260824120000` for its trusted-tier remainder and
  `20260824130000` for the scalar columns neither reached (see "Size
  bounds, not only shapes" below), `20260824140000` for the server
  timestamps a client could stamp (see "The server's timestamps are the
  server's" below), then `20260824110000`,
  `20260824110100` and `20260824110200` for findings 6, 7, 9 and 11 — along
  with every suite change that came with them, and all of it has been
  executed only against plain PostgreSQL. The counts above are the
  stack-run counts, not today's. `pnpm verify:sql` is at 232 assertions
  (37/37, 88/88, 28/28, 26/26, 8/8, 23/23, 11/11, 11/11), measured on the run that
  produced this line; re-running `supabase test db` is what would raise the
  stack figure to match.
- **Executed through GoTrue and PostgREST:** `pnpm verify:stack`
  (`scripts/verify-supabase-stack.mjs`, 48/48 checks against a running
  stack). The pgTAP suites feed `auth.uid()` with `set_config`, so they
  cannot prove the step every policy here rests on — that GoTrue mints an
  identity and PostgREST turns its JWT into the `authenticated` role
  carrying that `sub`. This script does: it signs in anonymously twice and
  drives the whole cloud-save contract over HTTP, including the ownership
  boundary between the two identities. It also settles what "Anonymous
  identity upgrade" below asks for — a CLI-level auth flow check rather
  than a row-level SQL one. Since the security review it additionally
  drives the trusted (`service_role`) paths with the local stack's secret
  key, which is the only place PostgREST's mapping of that credential onto
  the role is exercised at all.
- **Executed against plain PostgreSQL 16.13/18.6 + pgTAP:** every
  migration and every suite via `pnpm verify:sql` — 232 assertions — which
  prepares a scratch database with
  `scripts/sql/supabase-compat-harness.sql`. This is the only path the
  #105 hardening has run on. That harness
  supplies only the client roles, Supabase's default privileges and the
  slice of the `auth` schema this SQL references; it emulates no GoTrue,
  JWT verification, PostgREST, Storage or Realtime. It needs no Docker and
  stays the fast check, but it is not a substitute for the stack run — see
  defect 4 for what an emulator that is *more* permissive than the platform
  costs. It is also the check that runs in CI, after
  `scripts/provision-postgres.sh`, so a change to this schema cannot reach
  `main` unexecuted again — see `docs/TESTING.md` for the provisioning
  contract. The stack run needs Docker and stays a local, manual gate.
- **Not executed:** `SupabaseCloudSaveClient`'s behaviour against a real
  database (`src/persistence/cloud/supabase-client.ts`); a pure-JS fake
  asserting RLS, grants or RPC semantics would test the fake, not the
  contract. `verify:stack` at least exercises the same HTTP contract that
  client speaks. One narrower claim *is* now unit-tested, because it is a
  property of the query this repository builds rather than of the database:
  `tests/unit/persistence-cloud-supabase-client.test.ts` drives the client
  through a PostgREST stand-in that applies the `.eq()` filters it is given,
  and pins that both save-version reads are scoped to their prison (see
  "Every save-version read is scoped to its prison" below). It asserts
  nothing about ownership, roles or policies.
- **Not attempted:** the JSONB-vs-Storage payload benchmark and any real
  upload/download/restore timing. The local stack makes this newly
  possible, but it is a benchmark of its own rather than a by-product of
  this verification. See "Storage placement" below.
- **Applied, but not exercised, on a *hosted* Supabase project:** the first
  nine migrations are applied to the hosted staging project as of
  2026-08-23 (`docs/DEPLOYMENT.md`, "Database migrations"), so that much of
  the DDL has now run there. None of the checks above has. The local stack
  runs the same images, but nothing here has exercised a real project's
  networking, quotas or connection pooling.
- **Not applied anywhere but a scratch database:** the seven #105 hardening
  migrations — `20260824090000_pin_trigger_function_search_path.sql`,
  `20260824090100_revoke_client_truncate.sql`,
  `20260824100000_bind_challenge_evidence_to_payload.sql`,
  `20260824100100_harden_submit_challenge_evidence.sql`,
  `20260824110000_generalize_entitlement_idempotency.sql`,
  `20260824110100_close_challenge_definition_oracle.sql` and
  `20260824110200_validate_save_version_storage_path.sql`. They are all
  newer than the hosted apply above, so the hosted project still carries the
  pre-#105 declarations, grants, constraints and function bodies until they
  are pushed. Two of them can refuse to apply on a populated project rather
  than applying silently, which is deliberate and is what their headers
  describe: the ledger's natural-key index if two provider-less
  `entitlement_events` rows are identical in every recorded field, and the
  `save_versions_storage_path_shape` CHECK if any row already carries a
  non-null `storage_path`. Neither deletes anything; both name the query
  that answers whether the condition holds.
  `20260824150000_revoke_trusted_truncate.sql` (#163) is newer still and is
  in the same position: a single `REVOKE`, applied to a scratch database
  only, so whatever `TRUNCATE` the hosted project grants `service_role` is
  untouched until it is pushed — and what that is remains unverified, since
  every grant observed here is the harness's model of Supabase's defaults.
- **Fully implemented and unit-tested:** `PrisonSyncEngine`,
  `resolveSyncConflict` and `MemoryCloudSaveClient`
  (`src/persistence/cloud/`) — the client-side sync/conflict policy is
  pure TypeScript, including a two-concurrent-pushes test.

### Running the local stack

`supabase/config.toml` is committed. It holds no secrets: every provider
credential in it is an `env(...)` reference, and the local stack's keys are
generated by the CLI at `supabase start`, never stored in the repository.
These settings in it are deliberate rather than left at their defaults, and
each carries its reasoning as a comment in the file:

- `project_id = "lockstate"` — the default is the working directory name,
  which is not stable across worktrees.
- `[auth] enable_anonymous_sign_ins = true` — anonymous auth is this
  project's identity model rather than an optional extra.
- `[auth] site_url` and `additional_redirect_urls` — the `supabase init`
  defaults pointed at port 3000, which nothing in this repository serves.
  They now list the origins a local run answers on: 5173 (`pnpm dev`) and
  5183 (`pnpm test:browser`). Inert today, because anonymous sign-in
  performs no redirect and email confirmations are off; it matters the day
  an OAuth provider or a magic link is added (issue #138).
- `[db.seed] enabled = false` with `sql_paths = []` — `supabase init` left
  seeding enabled against `./seed.sql`, a file this repository does not
  have. The pgTAP suites in `supabase/tests/` create their fixtures inside
  the test transaction and roll them back, so there is nothing to seed.

The Supabase CLI is installed as a standalone binary and deliberately *not*
as a devDependency: `AGENTS.md` forbids adding a dependency for something
that is not one. The local stack's PostgreSQL listens on 54322, so it does
not collide with a system PostgreSQL on 5432.

## Defects found by executing this schema

The first three were invisible while the SQL was never run; the fourth was
invisible until it was run on the real thing.

1. **`create_save_version()` failed on every call.** Its `returns table
   (... revision int, checksum text)` declares OUT parameters whose names
   collide with the columns in the idempotency lookup, so PostgreSQL
   raised `42702 column reference "revision" is ambiguous` before any
   branch was taken — the only write path for a cloud save could not
   succeed. Fixed by table-qualifying the lookup.

2. **The column-level `REVOKE` on `prisons` did nothing.** PostgreSQL
   cannot subtract a single column's privilege out of a table-level
   grant, and Supabase's default grant was table-level `ALL`, so
   `has_table_privilege('authenticated', 'prisons', 'UPDATE')` stayed
   true: an owner could `PATCH` `current_revision` directly and bypass
   optimistic concurrency entirely — exactly the multi-device data-loss
   scenario this design exists to prevent. Fixed by revoking the
   table-level privilege and granting back only the editable columns.

3. **The pgTAP suite asserted a contract the schema cannot implement.**
   One case expected a stale-checksum resubmission to be reported as a
   conflict, while the function's own header documents it as an idempotent
   replay; `save_versions_prison_checksum_unique` made the test's version
   unimplementable without changing what the checksum identifies. The test
   was corrected to the documented behaviour, and the consequence for
   `PrisonSyncEngine` was recorded as an open question rather than
   silently redesigned inside a defect fix. **That open question is now
   resolved** — see "Why a save attempt is identified by revision *and*
   checksum" below.

4. **No table in this schema was reachable through the Data API at all.**
   Every migration here only ever *revoked*; not one granted the
   `SELECT`/`INSERT`/`UPDATE`/`DELETE` its RLS policies presuppose, because
   Supabase used to hand `anon`/`authenticated` table-level `ALL` on every
   new `public` table. It no longer does. The CLI (and Studio, at cloud
   project creation) now runs

   ```sql
   alter default privileges for role postgres in schema public
     revoke select, insert, update, delete on tables
     from anon, authenticated, service_role;
   ```

   leaving those roles `TRUNCATE, REFERENCES, TRIGGER, MAINTAIN` and nothing
   the Data API can serve. That was written as though the residue were
   inert, and one of the four is not: see "Declarations, not only
   privileges" below for what `TRUNCATE` reaches past.
   `supabase/config.toml` documents the escape hatch
   (`[api] auto_expose_new_tables = true`) as deprecated, with the field
   removed on 2026-10-30 — so this is not a local-stack quirk to work
   around but the permanent behaviour.

   The effect was total: `supabase test db` failed on the very first
   assertion of suite 001 with `42501 permission denied for table prisons`,
   and again in 002 with `permission denied for table entitlement_events`.
   A player could not have listed their own prisons, pulled a save, read
   their settings, seen their entitlements or read a challenge definition.
   Every policy in `supabase/migrations/` was unreachable code.

   Fixed by granting each table exactly the privileges its policies need,
   next to those policies. The existing `REVOKE`s are kept — they are no-ops
   under the current default and are what keeps the boundary closed on a
   project that sets `auto_expose_new_tables = true` or predates the change.
   `supabase/tests/003_data_api_grants.test.sql` pins the resulting matrix
   exactly, so an over-grant fails as loudly as a missing one.

   **The compatibility harness had been certifying the defect.** It
   reproduced Supabase's old `grant all` default and not the newer revoke,
   which made it *more* permissive than the platform — the one direction in
   which an emulator is actively dangerous. 36/36 assertions passed against
   something no real project could run. The harness now copies the CLI's
   revoke statements verbatim, and installs pgTAP into an `extensions`
   schema the way Supabase does, so `public` contains only this schema's own
   objects.

   Two smaller things fell out of the same investigation:
   `submit_challenge_evidence` relied on a function's default `PUBLIC`
   `EXECUTE` — which Supabase's `revoke execute on functions` does *not*
   remove — so `anon` could call it and be stopped only by the function's
   own `auth.uid() is null` check; it now uses the same explicit
   revoke-then-grant as `create_save_version`. And the suite's long-standing
   note that inserting into `auth.users` with just `(id, email)` was an
   unverified assumption is resolved: GoTrue's `auth.users` has 35 columns,
   of which only `id`, `is_sso_user` and `is_anonymous` are `NOT NULL`, and
   the latter two default to false.

Several assertions in suite 001 were also passing or failing for the
wrong reason: pgTAP's two-argument `throws_ok` compares the error
*message* rather than taking a description, and RLS makes a foreign
`UPDATE`/`DELETE` match zero rows instead of raising. Both are corrected.

## What an adversarial review of that fix then found

Defect 4 was fixed by granting `anon` and `authenticated` what their
policies need. A security review of *that* change found the mirror image
of the same mistake and four smaller ones. All are fixed here; the two
trusted-service ones are described in full in
[TRUSTED_SERVICES.md](./TRUSTED_SERVICES.md).

5. **`service_role` was granted nothing either, so the trusted half of the
   product was dead.** Supabase's revoke names `service_role` alongside
   `anon` and `authenticated`, and `BYPASSRLS` confers no table or function
   privilege — it decides which *rows* a role sees, never whether it may
   touch the table. Queried on the running stack, `service_role` held no
   DML on any of the eight tables and `EXECUTE` on none of the four
   functions. A payment webhook calling `record_entitlement_event` would
   have got `42501`; no challenge submission could ever have left
   `'pending'`, so `challenge_leaderboard` would have been permanently
   empty. Nothing failed, because no assertion had ever asked about
   `service_role`.

6. **`create_save_version`'s `REVOKE` was narrower than
   `submit_challenge_evidence`'s.** One revoked from `public`, the other
   from `public, anon`. Under today's defaults they are equivalent, which
   is why suite 003 passed either way — but on a project created before
   Supabase stopped auto-exposing new entities, a role keeps its *own*
   default grant through a revoke from `PUBLIC`. An `anon` caller that
   still reached `create_save_version` would fail closed on the
   `auth.uid()` check, but only after taking a `SELECT … FOR UPDATE` row
   lock, and the two distinct messages (`prison % does not exist` versus
   `not authorized for prison %`) are an existence oracle for prison
   UUIDs. Both now revoke from `public, anon, service_role`.

7. **The harness still contained the exact anti-pattern this work exists to
   remove.** `scripts/sql/supabase-compat-harness.sql` did `grant select on
   auth.users to authenticated, service_role`. The real thing grants none
   of the three Data API roles anything on `auth.users` (verified: the
   table is owned by `supabase_auth_admin`, and its ACL names only
   `supabase_auth_admin`, `dashboard_user` and `postgres`). Nothing
   depended on it — foreign keys enforce themselves with the constraint's
   rights, not the caller's — so it was latent, but it broke the rule the
   harness header states, and being more permissive than the platform is
   the one direction that certifies defects. Removed.

8. **`search_path` was inconsistent across the `SECURITY DEFINER`
   functions.** `create_save_version` set `public, pg_temp`; the other
   three set only `public`. When `pg_temp` is not listed, PostgreSQL
   searches it *first* for relation and type names — the classic
   `SECURITY DEFINER` hijack, and what Supabase's own
   `function_search_path_mutable` linter flags. No exploit was constructible
   (every reference in all four is schema-qualified), but
   `submit_challenge_evidence` is reachable by any anonymously-signed-in
   user and runs as the table owner. All four now spell out
   `search_path = public, pg_temp`.

A fifth finding was a policy defect rather than a privilege one — the
challenge read policy published unopened challenges — and is described in
[TRUSTED_SERVICES.md](./TRUSTED_SERVICES.md).

The regression pins that would have caught these are now in
`supabase/tests/003_data_api_grants.test.sql`: schema-wide privilege sweeps
for all three roles instead of `anon` alone, a schema-wide assertion that
every `public` table has RLS enabled, and a `relkind` filter that no longer
skips materialized views, partitioned tables and foreign tables. Suite 002
additionally runs every trusted step under `set local role service_role`
rather than as the privileged role the suite is invoked with, which is what
makes those assertions load-bearing at all.

## Size bounds, not only shapes

#105 finding 4 read as narrow — *"ADR 0013's 4 MiB bound covers only
`save_versions.payload`; every other client-writable text/jsonb column is
unbounded"* — and the shape underneath it is worth stating, because it is not
"nobody bounded anything". The convention **does** exist and is applied
consistently from `20260823090000` onward: `entitlement_events` bounds five
text columns at 128 characters (200 for `reason`), `challenge_definitions`
bounds `challenge_id` the same way, and both hash columns carry
`~ '^[0-9a-f]{16}$'`. What has none of it is the four tables created on
`20260822190*`, which predate it. `20260824101000_bound_client_writable_columns.sql`
brings them up to the same convention rather than inventing a second one.

Reproduced as `authenticated` before that migration, every probe inside an
explicit `begin; … rollback;` with `select current_user` read back:

| column | accepted before |
| --- | --- |
| `user_settings.payload` | 8,388,620 bytes |
| `user_settings.settings_schema_version` | `-2147483648` |
| `profiles.display_name` | 1,048,576 characters |
| `prisons.game_version` | 1,048,576 characters |
| `prisons.display_name` | 1,048,576 characters |
| `save_versions.checksum` | 524,288 characters, through `create_save_version()` |
| `challenge_submissions.claimed_metrics` | 4,194,316 bytes, through `submit_challenge_evidence()` |

Two of those rows deserve to be read twice.

**The 4 MiB save bound measures one column, not the row.** Measured: a single
accepted `save_versions` row carried 4,194,252 bytes of `payload` *and*
4,194,304 characters of `checksum` — 8,388,556 bytes of text in a row whose
`byte_size` recorded 4,194,252 against a limit of 4,194,304. The trigger
overwrites `p_byte_size` with `octet_length(new.payload::text)`, which is the
right thing to do about a lying caller and says nothing about the rest of the
row. `checksum` is now bounded, so the row's bound is the sum of its columns'
bounds rather than one column's.

**`claimed_metrics` walked around the evidence bound.** `20260824100000` caps
`challenge_submissions.evidence` at 8,000,000 bytes. Measured: the same RPC
call stored 4,194,316 bytes in `claimed_metrics` beside 58 bytes of
`evidence`. A bound a sibling column steps around is the "control that reads
as protection" shape this repository keeps finding, so that column is bounded
in the same migration even though it belongs to a later table — the fix is a
table constraint and touches no function body.

**Every ceiling is derived from a contract in `src/`, not picked**, so that
SQL refuses nothing a legitimate caller may send. That direction is the same
one `20260824100000` took when it capped evidence at 8,000,000 rather than at
ADR 0013's 4 MiB: `challengeLimitsSchema` already permits more, and a
database that refuses what the TypeScript contract admits is a defect rather
than hardening.

| column | bound | where the number comes from |
| --- | --- | --- |
| `profiles.display_name`, `prisons.display_name` | NULL or 1–128 characters | every other bounded text column in this schema uses 128; `>= 1` refuses the empty string, which would be a second spelling of NULL |
| `prisons.game_version` | 1–128 characters | `identifierSchema`'s own `.min(1).max(128)` (`src/simulation/protocol/types.ts`) |
| `save_versions.checksum` | 1–64 characters | 4× the 16 hex characters `computeSaveChecksum` produces, leaving room for a wider digest |
| `user_settings.payload` | ≤ 65,536 bytes of `payload::text` | the shipped defaults serialize to 792 bytes (718 for `DEFAULT_INPUT_SETTINGS` over its 7 keyboard bindings, 47 for `DEFAULT_ACCESSIBILITY_SETTINGS`), so this is ~82× the real payload, and 1/64th of ADR 0013's save bound — settings are not a save, and this table exists so they never ride inside one |
| `user_settings.settings_schema_version` | ≥ 1 | bounded rather than pinned; see below |
| `challenge_submissions.challenge_id` | 1–128 characters | identical to `challenge_definitions_challenge_id_check` on the identical vocabulary |
| `challenge_submissions.claimed_metrics` | ≤ 32,768 bytes | 3.3× the 10,049 bytes the TypeScript contract can produce (`MAX_EVIDENCE_METRICS = 64` keys of a 128-character identifier and a number serializing to at most 24 characters) |

Three choices in that table are worth their reasons.

**`game_version` and `checksum` get lengths, not regexes**, even though both
have exact TypeScript contracts and even though this schema already regexes
two hash columns. Copying `identifierSchema`'s character class or
`^[0-9a-f]{16}$` into SQL would put one rule in two places — the defect class
issues #93 and #123 are about — and a later move to a wider digest would then
refuse a legitimate save until a migration caught up. What the format pin
would buy is narrow: a client that stores a malformed checksum fails its own
next restore, which is self-harm rather than a boundary crossing. What the
finding is about is size, and a length bound closes it completely.

**`settings_schema_version` is bounded, not pinned**, unlike
`entitlement_events_schema_version_check`'s `= 1`. That pin is right where it
is, because the ledger's schema version is part of ADR 0008's event contract,
so a new version needs a migration by design. Nothing says the same of the
settings payload, and pinning it would make a client that writes version 2
fail on a constraint before the migration admitting version 2 could exist.

**`save_versions.storage_path` is not in this migration** — its bound and its
shape belong to #105 finding 11 and arrived with
`20260824110200_validate_save_version_storage_path.sql`.

Two columns worth naming as *not* covered, because they are unbounded and the
finding's own wording excludes them: `entitlements.key`/`value` and
`challenge_definitions.definition`/`signature` are written only by
`SECURITY DEFINER` functions and hold no grant for either client role, so
they are trusted-tier surface rather than client-writable. They should still
be bounded; that is a separate piece of work, not a silent omission.

`supabase/tests/006_client_writable_column_bounds.test.sql` asserts every
bound in **both** directions — refusing a value past the ceiling *and*
admitting one exactly at it. The second half is not padding: it is what fails
if a later change tightens a bound below what a caller may legitimately send.

### The trusted-tier remainder, and why it needed no ADR

`20260824120000_bound_trusted_tier_columns.sql` (#189) closes the five columns
the finding's own wording excluded, because they are reachable only through a
`SECURITY DEFINER` function or a `service_role` grant:

| column | bound | derivation |
| --- | --- | --- |
| `entitlements.key` | 1–128 characters | the convention every id-shaped text column here uses |
| `entitlements.value` | ≤ 4,096 bytes | `entitlementRowValueSchema` is `.strict()` over two integers, ~60 bytes; ~68× headroom |
| `challenge_definitions.definition` | ≤ 65,536 bytes | `challengeDefinitionSchema`'s two `.max(64)` identifier allow-lists dominate it at ~17.5 KB; ~3.7× |
| `challenge_definitions.signature` | ≤ 4,096 bytes | `challengeSignatureSchema` is at most ~700 bytes; ~5.8× |
| `challenge_submissions.rejection_code` | NULL or 1–128 characters | `ChallengeRejectionCode` is a closed 23-member union whose longest members are 27 characters |

An oversized value in any of the five needs a bug in the trusted tier or a
compromised key rather than a hostile client. That is defence in depth, not a
reachable hole, and it is worth stating rather than dressing up: neither client
role holds a grant on `entitlements`, `challenge_definitions` is empty because
the Z2 publisher ADR 0008 deliberately does not build does not exist, and
`rejection_code` is written by the verifier's own four-column UPDATE grant.

**The ADR question, and why the answer differs from #163.** ADR 0008 treats
`service_role` as trusted, so constraining it looks like an authority decision
— which is exactly why #163 (`service_role` can `TRUNCATE` the append-only
ledger) went to the ADR for a ruling rather than being fixed inside a
migration. It has since been ruled on: ADR 0008 §2 now states that the trusted
tier holds no `TRUNCATE`, and
`20260824150000_revoke_trusted_truncate.sql` implements it. The distinction
that made the two cases different survives the ruling: `TRUNCATE` **removes an
authority** ADR 0008 had not decided the trusted tier should have, which is why
it needed the ADR, while a size bound **asserts an invariant the trusted tier's
own contract already satisfies**, which is why this one did not. This schema has
done the latter since `20260823090000` — `entitlement_events` is written only by
`record_entitlement_event()`, a `SECURITY DEFINER` function, and carries five
`char_length` bounds. `20260824120000` follows that precedent rather than
setting a new one.

**One choice left open**, recorded in #189 rather than guessed: `entitlements.key`
could be *pinned* to `'save-slots'` instead of bounded, since that is the only
key the code writes and its sibling `entitlement_events.capability` already
carries exactly that pin. What stops it is that nothing in this schema states
whether `entitlements.key` and `entitlement_events.capability` are the same
vocabulary. If they are, the pin is right and the two constraints should
reference each other; if `entitlements` is meant to project several capability
kinds while the ledger records one, the pin breaks on the second capability. The
length closes the size hole either way.

Two columns *look* bounded and are not, which is why that inventory was read
constraint by constraint rather than by matching column names against
constraint text: `challenge_definitions_definition_hash_check` is a regex on
`definition_hash`, and a `LIKE '%definition%'` scan reads it as bounding
`definition`; and `challenge_submissions_rejected_has_code` requires a rejected
row to *have* a code while saying nothing about its length.

### Coverage is a rule now, not a list

`supabase/tests/007_column_bound_coverage.test.sql` enumerates every
`text`/`jsonb`/`json`/`bytea` column in `public` from `pg_attribute` and
requires each to be declared with the mechanism that bounds it and the catalog
object implementing it — and requires that object to exist and to touch that
column. **Every such column is now covered, with nothing left over**, by one of
five mechanisms this schema already used:

| mechanism | what it is | example |
| --- | --- | --- |
| `length-check` | `char_length()`/`octet_length()` in a CHECK | 19 columns |
| `regex-check` | an anchored fixed-width regex | `definition_hash`, `evidence_hash` |
| `value-set-check` | a closed value set or a pinned literal — stronger than a length, because the set is finite | `verification_status`, `actor_kind`, `event_type`, `source`, `capability` |
| `row-trigger` | a BEFORE ROW trigger raising `LS002`/`LS003`, used where the refusal must carry measured/limit numbers a CHECK cannot | `save_versions.payload`, `challenge_submissions.evidence` |
| `generated-column` | fixed width by construction | `evidence_digest`, `sha256(jsonb_send(evidence))` |

Three directions fail: a column added with no bound is in no declaration; a
bound that is dropped leaves its declared object missing; and a declaration for
a column that no longer exists goes stale loudly. The mechanism is *declared*
rather than inferred from constraint text on purpose — a single regex would have
to recognise four shapes, and getting it wrong permissively is the exact failure
the suite exists to prevent. What the catalog is asked is only whether the named
object exists and constrains the named column in the declared way; the
enumeration, which is the part that must not be a list, comes from
`pg_attribute`.

It asserts no ceiling is the *right* number and no bound refuses anything —
suites 002 and 006 do that, in both directions, for the columns they created.

### The scalar columns, and the one that could take first place

`20260824130000_bound_scalar_columns.sql` (#191) covers what neither of the
above reached: numeric and timestamp columns. An integer cannot be unbounded in
the storage-exhaustion sense, but it can hold nonsense —
`user_settings.settings_schema_version` accepted `-2147483648` until
`20260824101000`, which is the precedent that this is not hypothetical.

Three columns had no check of any kind:

| column | now | why this number |
| --- | --- | --- |
| `save_versions.save_schema_version` | `>= 1` | `schemaVersionSchema = z.number().int().positive()`. **Bounded, not pinned** to `SAVE_SCHEMA_VERSION` (4 since #259): the column records the payload's version *as stored*, and a V1, V2 or V3 row is legitimate history the migration chain still reads, so a pin would refuse the past as well as the future. `20260824130000_bound_scalar_columns.sql`'s own comment says 3, which was current when that migration was authored — an applied migration is a historical artefact and is not edited afterwards |
| `challenge_submissions.challenge_version` | `>= 1` | the identical constraint `challenge_definitions_version_check` already places on the same vocabulary |
| `challenge_submissions.ranked_score` | NULL or finite | see below |

`save_schema_version` is LATENT for a reason worth naming: nothing reads it back
for dispatch — the migration chain is driven by the version inside the envelope,
not by the row. It goes live the moment any code trusts the column instead of
the payload, which is exactly what a column with that name invites.

**`ranked_score` is the interesting one.** It is `double precision`, so its
domain includes `NaN` and both infinities, and PostgreSQL orders `NaN` **above
every other float value — above `Infinity`**. Measured:

```
select v from (values ('NaN'::float8),(100),(5),('Infinity'::float8),
                      ('-Infinity'::float8)) t(v) order by v desc;
 -->  NaN, Infinity, 100, 5, -Infinity
```

`challenge_submissions_ranking_idx` is `(challenge_id, challenge_version,
ranked_score)`, so a single `NaN` takes permanent first place by the access path
that index exists to serve.

LATENT, and precisely why: `public.challenge_leaderboard` has every grant
revoked from `anon`, `authenticated` *and* `service_role`, because ADR 0009
gates public ranking on a privacy decision that has not been made. What makes it
live is granting that read — a decision already queued rather than a
hypothetical one.

**This check is not redundant with the TypeScript side, which is the part worth
noticing.** `claimedMetrics` — the client's *claim* — is
`z.record(identifierSchema, z.number().finite())`. But `ranked_score` is written
from the verifier's own computed outcome,
`outcome.metrics[definition.objective.metricId]`, where `metrics` is typed
`Readonly<Record<string, number>>` with no finiteness validation anywhere on
that path and `=== undefined` as the only guard. `NaN` is a `number`. So the
claim is checked for finiteness and the computed score is not, and this
constraint is the sole finiteness check on the path that actually writes the
column. Tightening the TypeScript side needs a rejection code for "the replay
produced a non-finite metric", which is a contract decision recorded in #191.

The predicate is two strict comparisons rather than a helper because PostgreSQL
has no `isfinite` for `double precision` — and note that the idiom from other
languages does **not** work here: PostgreSQL defines `NaN = NaN` as **true**, so
a self-equality test admits `NaN`. Verified by mutation: replacing the bound with
`ranked_score = ranked_score` lets both `NaN` and `Infinity` through.

`supabase/tests/008_scalar_column_constraint_coverage.test.sql` makes this
coverage a rule too, with one difference from suite 007 that matters. A text
column can always be bounded; a scalar column legitimately may not be. So this
suite has an allow-list — and the allow-list is the interesting part:

* every entry must carry a **reason** long enough not to be a placeholder;
* an entry **fails if the column later gains a constraint**, so acting on a
  finding forces the entry to be reclassified rather than left asserting a state
  that is no longer true.

`uuid` and `boolean` columns are excluded by type rather than by decision: their
domains are already exactly what the contract permits, so there is nothing a
constraint could add.

**Five of the twelve allow-list entries record an open finding rather than a
settled decision.** `prisons.created_at`/`updated_at`,
`profiles.created_at`/`updated_at` and `user_settings.updated_at` are
**client-writable** — a client can set them at insert time and walk `updated_at`
backwards, reproduced in **#194**. `prisons` even states the intent and enforces
it in one direction only: its UPDATE grant deliberately excludes `created_at`,
while the table-level INSERT grant covers it. Those entries move to a real
mechanism when #194 is acted on, and the suite fails if they are not.

## A client write that could never succeed

`SupabaseCloudSaveClient.registerPrison` inserted `{id, game_version,
slot_index}` straight into `prisons`. `owner_id` is `not null` with **no
default**, and the insert policy is `auth.uid() = owner_id`. Executed against the
real schema, as `authenticated` with a real `auth.uid()`:

```
ERROR:  new row violates row-level security policy for table "prisons"
```

RLS refuses the row **before** the NOT NULL check ever runs, because
`auth.uid() = NULL` evaluates to NULL rather than true and a `WITH CHECK` that is
not true fails. So the error even named the wrong thing — it points at the policy
rather than at the missing column. It failed 100% of the time, for every caller,
on every project; there was no configuration under which it worked (#192).

**Why nothing caught it.** Three greps for `registerPrison` return the interface
declaration and its two implementations and no call site at all, and
`PrisonSyncEngine` is constructed only in tests, always with
`MemoryCloudSaveClient` — which stores into a `Map`, needs no `owner_id`, and so
**succeeds on exactly the arguments the real client fails on**. The double and
the real client disagreed about whether the method worked at all, and only the
double was ever run. That is the same shape `RoomSystem` had before #181 deleted
it, and it is what this document already acknowledges one line above: a pure-JS
fake asserting RLS would test the fake.

**The fix is `create_prison()`, not an added `owner_id`.** Two properties #105
verified belong to the RPC and cannot belong to an insert: the owner is
`auth.uid()` and nothing else — there is no forgeable owner parameter — and it
fails closed with `42501 an authenticated identity is required`.
`20260822190100_create_prisons.sql` already calls it "the front door that answers
with a discriminated status instead of an exception".

**`registerPrison` therefore returns a status rather than `void`**, which is the
one decision this needed. `at-slot-limit` is a thing a player has to be told, and
`docs/TRUSTED_SERVICES.md` commits to read-only degradation rather than an opaque
failure at the free-tier cap; throwing on a non-`created` status would have kept
the old signature while losing exactly the information ADR 0013 built the status
to carry. `used` and `capacity` come back with it, so a caller can say "5 of 5"
rather than "no".

The cap fires on both paths either way — ADR 0013 put it on a trigger precisely
so it does not depend on one blessed door, and
`supabase/tests/004_free_tier_capacity.test.sql` drives that refusal through the
client's own INSERT grant, which is why #194 made that grant per column rather
than revoking it.

`MemoryCloudSaveClient` now answers in the same vocabulary, so the double and the
real client agree on the contract by construction. It deliberately does **not**
model the free-tier cap: that is `account_save_slot_capacity` over the
`entitlements` projection, and inventing a number in a test double would be a
second implementation of a rule ADR 0013 put in one place.

### The half of that disagreement a test can hold

`tests/foundation/rpc-status-vocabulary-contract.test.ts` asserts that every
status each RPC can return is exactly the set the client's row type names, in
both directions. A `switch` over a status union is exhaustive to `tsc`, so a
status the database can return and the client does not name falls through it
**silently** — returning `undefined` from a function typed to return an outcome,
at runtime, in production, with no compile error. The reverse is dead code that
reads as handling something.

Stated plainly so the green is not read as more than it is: **this would not have
caught #192.** It checks the return path, not the request — not that the client
sends the right arguments, that a column it writes exists, or that a policy
admits the row. Those need a running PostgREST, which is `pnpm verify:stack`'s
job and is in no CI gate (#105 owner check 4). What it closes is the neighbouring
gap, which is the half that can be closed without a stack.

## The server's timestamps are the server's

`20260824140000_protect_server_timestamps.sql` (#194) closes the `created_at`
half of what the #191 inventory turned up. Reproduced as `authenticated` before
it, inside `begin; … rollback;` with `current_user` read back:

```
insert into public.profiles (id, created_at, updated_at)
  values (…, '1970-01-01T00:00:00Z', '4000-01-01T00:00:00Z');
-->  created_at 1970-01-01 | updated_at 4000-01-01

insert into public.prisons (owner_id, game_version, slot_index, created_at, updated_at)
  values (…, 'lockstate-dev', 0, '4000-01-01T00:00:00Z', '1970-01-01T00:00:00Z');
-->  created_at 4000-01-01 | updated_at 1970-01-01

update public.profiles set updated_at = '1900-01-01T00:00:00Z' where …;
-->  updated_at 1900-01-01
```

So `default now()` was a suggestion rather than a fact, and `updated_at` could
be walked **backwards**.

**The sharpest part is that `prisons` already stated this intent and enforced it
in one direction only.** Its UPDATE grant comment says a client "has no reason
to rewrite … a creation timestamp" and the grant excludes `created_at` — while
the `grant select, insert, delete` on the line above it covered every column, so
the insert path set it anyway. The rule was stated, correct, and held on one of
the two write paths.

Both tables now grant INSERT per column. `prisons` gets
`(id, owner_id, game_version, display_name, slot_index, updated_at)` — matching
its UPDATE list plus identity, with `created_at` and both pointer columns absent.
`owner_id` **must** be granted: the insert policy is `auth.uid() = owner_id` and
the column has no default, so a client has to supply it. `profiles`, which had no
column-level treatment at all, gets `(id, display_name, updated_at)` for INSERT
and `(display_name, updated_at)` for UPDATE.

**It has to be revoke-then-grant, and that is now proved rather than asserted.**
The prisons migration has always claimed that a column-level `REVOKE` cannot
subtract a privilege out of a table-level grant. Verified by mutation: replacing
`revoke insert on public.prisons` with `revoke insert (created_at) on
public.prisons` leaves the client able to write `created_at`, and five
assertions across two suites catch it.

**Scope: `created_at` only.** Whether a client may stamp its own `updated_at` is
a real decision and it is #194's open half — `prisons` grants it on purpose, and
the alternative is a `before update` trigger, which is a choice about whether
anything is ever to trust that column for ordering. Every `updated_at` keeps
exactly the privileges it had, so `user_settings` needed no change at all: it has
no `created_at`.

**Nothing broke**, verified rather than assumed: no code in `src/` writes any of
these columns. Both cloud writes now go through a `SECURITY DEFINER` RPC, which
bypasses column grants entirely — `uploadVersion` through
`create_save_version()`, and `registerPrison` through `create_prison()` since
#192. (When this migration landed, `registerPrison` still wrote
`{id, game_version, slot_index}` directly, and was broken for an unrelated
reason; see "A client write that could never succeed" below.) Suite 004 still drives the free-tier slot cap through the client's own
INSERT, which is why that grant was made per column rather than revoked in favour
of `create_prison()`: ADR 0013 argues the cap is a count invariant of the table,
enforced by a trigger on every write path rather than by one blessed door.

### And a rule, because an inventory found this rather than a test

`supabase/tests/003_data_api_grants.test.sql` pins the whole privilege surface
exhaustively — and it passed throughout, because it pins **what the grants are**,
not **what they ought to be**. That is the right thing for a grant suite to do,
and it is why the next table created with a table-level grant would have
re-opened this silently.

So that suite now also carries a rule: a column whose default is `now()` is the
server's statement about when something happened, and **no client role may write
it** unless an allow-list says otherwise with a reason. Both directions fail — a
`default now()` column that becomes client-writable is caught unless listed, and
a listed column that stops being client-writable is caught too, so acting on
#194's open half forces the entry out rather than leaving it asserting something
untrue. Three entries remain, all three `updated_at`, all three citing that open
decision.

## Declarations, not only privileges

A later migration-by-migration audit (#105) executed this schema again and
found the confidentiality boundary sound — no cross-tenant access on any of
the eight tables for either client role, `create_save_version` and
`create_prison` both authorizing internally, and a deliberate `pg_temp`
hijack attempt against `create_prison` failing to exploit. Three of its
findings were about the gate rather than the schema, and are fixed here.

**The suite pinned every privilege and no declaration.** Suite 003 compares
the whole privilege surface exactly, for all three roles, and read back
neither `pg_proc.prosecdef` nor `pg_proc.proconfig`. So dropping
`set search_path = public, pg_temp` from any `SECURITY DEFINER` function
passed all 89 assertions, even though defect 8 above exists precisely
because that pinning matters, and three migrations argue for it in their own
comments. `supabase/tests/005_function_security_declarations.test.sql` now
reads both properties out of the catalog: an exhaustive matrix over every
function in `public`, plus rules — that every `SECURITY DEFINER` function and
every trigger function pins a path, that every pinned path is exactly
`public, pg_temp`, that `pg_temp` is *positionally* last, and that the only
unpinned functions are the four constant-returning limit helpers (three from
ADR 0013 plus `max_challenge_evidence_bytes()`, added for #105 finding 1 —
this sentence said "three" until #105 findings 6, 7, 9 and 11 re-read it). Stating
them as rules over `pg_proc` rather than as a list is the point: a
`SECURITY DEFINER` function added tomorrow with no pinned path fails, rather
than being merely un-asserted.

**Two trigger functions omitted the pinned path, and all four kept
PostgreSQL's default `PUBLIC EXECUTE`.**
`reject_entitlement_event_update()` and
`enforce_challenge_verification_transition()` were the exceptions;
`20260824090000_pin_trigger_function_search_path.sql` pins both, bodies
unchanged, and revokes the ambient `EXECUTE` from `PUBLIC` and all three
roles on all four. They were the only functions in `public` whose `proacl`
was still null, which is why `has_function_privilege` answered true for
every role on them. Whether the revoke breaks a trigger was checked by
execution rather than reasoned about: with `EXECUTE` held by nobody, the
slot cap still refuses a sixth prison inserted as `authenticated` (`LS001`),
the payload bound still refuses an oversized save (`LS002`), the append-only
trigger still refuses an `UPDATE` as `service_role`, and the verification
transition still refuses a re-verification as `service_role`. A trigger's
firing does not consult the `EXECUTE` grant.

**`TRUNCATE` was in the residue defect 4 called inert.** Supabase's default
privileges `grant all on tables` and then revoke only the four DML
privileges, so `anon` and `authenticated` held `TRUNCATE` on every table in
`public`. It ignores RLS entirely, so every `auth.uid()` policy here is
irrelevant to it, and it fires no row trigger, so
`entitlement_events_no_update` — the control that makes the ledger
append-only even for the table owner — does not run.
`20260824090100_revoke_client_truncate.sql` revokes it from both client
roles, and suite 003 sweeps the schema for it.

**What is harness-only, stated as such.** The `TRUNCATE` grant and its
consequence were observed on `scripts/sql/supabase-compat-harness.sql`,
whose job is to model Supabase's default privileges — `\dp public.*` showed
`anon=Dxt` and `authenticated=…Dxt` on all eight tables, and `truncate table
public.entitlement_events` as `authenticated`, inside an explicit
transaction block, emptied the ledger. **Whether the hosted project's grants
match is unverified**, and #105 asks the owner to run `\dp public.*` against
it. The revoke landed anyway because it is harmless either way: nothing in
this repository truncates anything, and PostgREST exposes no verb that
reaches `TRUNCATE`. `service_role` held the same ambient `TRUNCATE` and was
deliberately untouched there, because whether the trusted role should be able
to empty a table it holds no `DELETE` grant on was a boundary question ADR
0008's authority table did not answer. #163 put it to the owner and it is
now answered: the trusted tier holds no `TRUNCATE` either. ADR 0008 §2
records the ruling, `20260824150000_revoke_trusted_truncate.sql` revokes it,
and suite 003's sweep covers all three roles rather than the two client ones.
The same harness-only caveat applies to that revoke, for the same reason and
with the same consequence: `\dp public.*` there showed `D` for `service_role`
on all eight tables (`Dxt` on five, `rDxt` on `challenge_submissions` and
`entitlement_events`, `arDxt` on `challenge_definitions`), whether the hosted
project matches is unverified, and a revoke of a privilege that is not held is
a no-op.

## Schema (`supabase/migrations/`)

| Table | Purpose | Ownership |
| --- | --- | --- |
| `profiles` | One row per `auth.users` identity (anonymous or upgraded). Created lazily, not by an on-signup trigger. | `id = auth.uid()` |
| `prisons` | One row per cloud save slot. `current_version_id`/`current_revision` are the only mutable pointer, advanced exclusively by `create_save_version()`. Multiple prisons per owner from the start — never a one-per-user table. | `owner_id = auth.uid()` |
| `save_versions` | Immutable generations, mirroring the local repository's generation model (#19). Never updated after insert; `unique (prison_id, revision)`. Content is deliberately not unique on its own — see below. | indirect, via `prisons.owner_id` |
| `user_settings` | Cloud-synced input/accessibility preferences (`src/input/storage.ts`), deliberately outside any prison payload. | `user_id = auth.uid()` |
| `entitlements` | Paid save-slot expansion etc. Client-readable, never client-writable — see "Trusted mutations" below. | `user_id = auth.uid()`, SELECT only |

### Why a table-level policy is not enough for `prisons.current_version_id`

RLS `USING`/`WITH CHECK` clauses only ever check *row* ownership, not which
*columns* an `UPDATE` touches. An owner-scoped `UPDATE` policy on `prisons`
would otherwise let a normal PostgREST `PATCH` bypass optimistic
concurrency entirely by writing `current_revision` directly.

The fix is **revoke-then-grant**, not a column-level `REVOKE`. PostgreSQL
cannot subtract one column's privilege out of a table-level grant, so on any
project where `authenticated` holds table-level `UPDATE`,
`revoke update (current_revision) on prisons from authenticated` leaves it
intact and changes nothing. `prisons` therefore revokes `UPDATE` outright
and grants back only `(display_name, game_version, slot_index, updated_at)`,
leaving `create_save_version()` — `SECURITY DEFINER`, with its own
`auth.uid()` check inside — as the only path able to advance the pointer
columns.

Since defect 4, that `REVOKE` is a no-op on a current project, which never
granted table-level `UPDATE` in the first place. It stays because the thing
it closes is a *default*: it must remain closed on a project that sets
`[api] auto_expose_new_tables = true`, and on any project created before the
default changed. The grant of the four editable columns is what does the
positive work in both cases.

`save_versions` goes further: `authenticated`/`anon` get `SELECT` and no
insert/update/delete grant at all, so immutability doesn't depend on a
trigger the client could reason its way around.

## Optimistic concurrency and idempotent resume (`create_save_version`)

One `SECURITY DEFINER` RPC (`supabase/migrations/
20260822190300_create_save_version_rpc.sql`) is the sole write path for a
cloud save:

1. Locks the `prisons` row (`SELECT ... FOR UPDATE`), serializing concurrent
   calls for the *same* prison without affecting other prisons.
2. Checks `auth.uid() = owner_id` itself — `SECURITY DEFINER` bypasses RLS,
   so this explicit check is the only thing standing between an
   authenticated caller and any prison row.
3. If a `save_versions` row already exists for
   `(prison_id, revision, checksum)`, returns it as `idempotent_replay` —
   retrying an upload whose response was lost, but which actually
   committed, is always safe and never creates a duplicate version.
4. Otherwise, accepts the new version only if `p_new_revision = current_revision + 1`
   ("N → N+1 only when N remains current"); anything else — behind or
   ahead — is reported as `conflict`, never silently applied.

`envelope.revision` (#18) *is* this revision counter: the client always
sends its own envelope's `revision` as `p_new_revision`, so there is no
second, parallel revision concept to keep in sync.

### Why a save attempt is identified by revision *and* checksum

Idempotency was originally keyed on content alone: `unique (prison_id,
checksum)` plus a lookup on `(prison_id, checksum)`. That conflates two
different events.

A **retry** is one save attempt sent twice because the first response was
lost. A **revert** is a *new* save attempt whose content happens to match
an earlier one, because the player undid a build. Under content-only
identity the two are indistinguishable, and the RPC answered the revert
with a replay of the *older* revision: the prison pointer never advanced,
`PrisonSyncEngine.push` reported `already-synced` at a revision the cloud
had never reached, and the client's next push arrived at `current + 2` and
was rejected as a conflict it had no way to explain.

Identity therefore includes the revision. `save_versions_prison_checksum_unique`
is gone — content legitimately recurs in a save history — and the lookup
matches `(prison_id, revision, checksum)`. Three consequences:

- A replay returns `p_new_revision` **by construction**, so client and
  cloud can no longer disagree about which revision committed.
- Recurring content at a new revision is a new version, and the pointer
  advances normally.
- *Different* content at an already-occupied revision is not a replay; it
  falls through to the conflict branch, which is the correct answer, since
  another device's save already holds that revision.

It also narrows the accepted 64-bit collision risk documented in the RPC
header: two colliding payloads must now collide *at the same revision
number*, which a client produces at most once, rather than anywhere in a
prison's entire history.

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

### Every save-version read is scoped to its prison

Both reads of `save_versions` in `SupabaseCloudSaveClient` filter on
`prison_id` as well as the row id: `downloadVersion` always did, and
`getPrisonState` does since #105 finding 13, which found the asymmetry.

**What that is not.** It is not a confidentiality fix, and describing it as
one would be inventing a consequence. `save_versions` is RLS-protected
through `prisons.owner_id`, and #105 verified by execution — as a second
`authenticated` subject, with affected-row counts captured — that no
cross-tenant read exists on this table for either client role. An unscoped
read by id could therefore only ever have returned a row the caller already
owned.

**What it is.** Defence in depth against a same-owner id mix-up: a stale,
swapped or corrupted `prisons.current_version_id` pointing at another of the
same owner's prisons. Unscoped, `getPrisonState` reported that other
prison's `revision` and `checksum` as this prison's cloud state, which
`PrisonSyncEngine` then used to sequence the next push — so the failure mode
was a wrong baseline (a spurious conflict, or a push sequenced against
another prison's revision), not a leak. Scoped, the pointer fails loudly
instead: `.single()` finds no row and the call throws.

`.single()` is deliberately kept rather than relaxed to `.maybeSingle()`. A
pointer that does not resolve *inside its own prison* is a broken invariant,
and reporting it as "this prison has no cloud version" would let `push`
proceed from revision 0.

### Conflict resolution — user-facing choices, never automatic

`resolveSyncConflict(choice, cloudCurrent)` maps an explicit user choice to
the next action; it never resolves anything on its own:

| Choice | Action | Meaning |
| --- | --- | --- |
| `keep-local` | `retry-push` at `cloudCurrent.revision + 1` | Re-upload the same local content against the now-known real baseline. Still goes through the same `create_save_version` conflict check — not a bypass. |
| `keep-cloud` | `pull-and-adopt` | Download and locally adopt the cloud version. This overwrites local state, but only after explicit user confirmation — not silent last-write-wins. |
| `duplicate` | `duplicate-as-new-prison` | Keep the local content as a **new** prison; the original cloud prison and its history are untouched. |
| `cancel` | `cancel` | Do nothing. |

Nothing presents these choices or calls `push`/`pull` — this issue stops at
the policy layer, same as #19 stopped at the repository layer. The save UI
that #19's follow-up wiring did produce (`src/ui/save-panel.ts` over
`SessionController`) drives the *local* repository only; `SessionController`
touches Supabase nowhere, and no module in `src/ui/` imports
`src/persistence/cloud/`.

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
a GoTrue-level auth flow, not a row-level SQL behavior.

`pnpm verify:stack` is that CLI-level auth flow check. Against the real
local stack it confirms that `signInAnonymously` issues a session whose
`sub` claim reaches `auth.uid()` unchanged, that two anonymous sign-ins are
two genuinely isolated identities, and that a prison created by one is
invisible to the other. What it does **not** yet cover is the upgrade step
itself (`linkIdentity`/`updateUser` preserving the `id`); that needs an
email or OAuth provider configured locally and is the obvious next
extension of the script.

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

**`storage_path` has a shape, and it is not a bucket layout** (issue #105
finding 11, `20260824110200_validate_save_version_storage_path.sql`). The
column was `text` with no constraint at all, and `create_save_version()`
passes `p_storage_path` through untouched, so an authenticated caller
driving the RPC directly had `/etc/passwd`, `../../../../etc/shadow`,
another account's uuid prefix, a URL, a percent-encoded traversal, the
empty string and a 1 MiB path all accepted and stored verbatim. Two
controls now apply, and they answer with two different SQLSTATEs:

- `save_versions_storage_path_shape`, a CHECK — the path must be a
  lowercase-hex UUID followed by at least one further segment, each segment
  starting with an alphanumeric and continuing in `[A-Za-z0-9._-]`, at most
  512 characters. That makes `..` and `.` unrepresentable *as segments*,
  and excludes absolute paths, empty segments, backslashes, whitespace,
  control characters, `%` and every URL punctuation mark. Violations are
  `23514`.
- `save_versions_enforce_storage_prefix`, a `BEFORE INSERT` trigger — the
  first segment must be the uuid of the account that owns the prison, read
  from `public.prisons`, because a well-formed path under *someone else's*
  prefix satisfies every rule above. Violations are **`LS004`**, distinct
  from `LS001`, `LS002` and `LS003`. A BEFORE-row trigger runs before CHECK
  constraints are evaluated, so a path that is both foreign and malformed
  is answered as a prefix failure.

**No Storage bucket or policy exists in `supabase/migrations/`, and this
did not add one.** Choosing a bucket, its visibility and its object layout
is the decision this section says is not made; the constraint is on the
shape only, depth and naming under the prefix are left open, and today it
constrains a column that nothing writes — `uploadVersion` sends
`p_storage_path: null` on every call. What it buys is that the shape is
decided and asserted before the first writer exists rather than remembered
afterwards.

## Credential/environment setup (no secrets)

`.env.example` already declares `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` — the browser must only ever hold the
publishable/anon key, never a service-role key (`AGENTS.md`,
`docs/ARCHITECTURE.md` "Security"). Nothing in this issue's code reads a
service-role key or any other secret; `create_save_version` runs
server-side as `SECURITY DEFINER`, which is how privileged writes happen
without a service-role key ever reaching the client.

`supabase/config.toml` is now committed, so running the stack locally is
just: install the Supabase CLI (standalone binary — not a devDependency),
then `supabase start`. The CLI generates the local keys itself on each
start; they are dev-only shared defaults and they are not stored in this
repository. No service-role key is stored here and `src/` has no path to
one. One check does handle a service-role credential: `pnpm verify:stack`
drives the trusted (`service_role`) paths, and it reads both the
publishable key and the local stack's secret key from `supabase status` at
run time rather than holding either, aborts unless the API is on loopback
so a secret key cannot be pointed at a hosted project, and never prints
any part of a value — see "What has and has not been executed" above.

## Free-tier capacity is bounded at the database tier (issue #57)

This used to be an open question here, recorded by the security review and
deliberately not fixed inside a privilege change. It is now answered by
[ADR 0013](./adr/0013-free-tier-cloud-save-capacity.md), and the answer is
partly decided and partly proposed -- **the ADR is `Proposed`, not
`Accepted`**, and the split matters.

The problem it closes. `[auth] enable_anonymous_sign_ins = true` is this
project's identity model, so `authenticated` is effectively "anyone who can
make an HTTP request" — a new identity costs one call to `/auth/v1/signup`.
Against that, `prisons_insert_own` capped *who* may insert and never *how
many*, and `create_save_version` recorded `p_byte_size` without ever
checking it or the length of `p_payload`, so the two need not have agreed at
all. It is a **capacity and abuse** concern, not a confidentiality one: no
data crosses an ownership boundary, and every check that protects one
player's data from another is untouched.

| Limit | State | Where the number lives |
| --- | --- | --- |
| 5 free slots, ceiling 50 total | **Decided already** — an existing product rule (`README.md`, `BASE_SAVE_SLOTS`/`MAX_TOTAL_SAVE_SLOTS`). #57 only makes it authoritative. | `public.base_save_slot_capacity()`, `public.max_save_slot_capacity()` |
| 4 MiB per stored save version | **Proposed, pending approval.** Implemented with the proposed figure. | `public.max_save_payload_bytes()` |
| 20 retained revisions per prison | **Proposed. Not implemented** — needs a pruner. | — |
| 256 MiB of payload per account | **Proposed. Not implemented** — depends on the two above. | — |

How it is enforced:

- **`prisons_enforce_slot_capacity`**, a `BEFORE INSERT OR UPDATE OF
  owner_id` trigger, counts an owner's prisons under a per-owner advisory
  lock (a plain count-then-insert is a race) and refuses with SQLSTATE
  `LS001`. Capacity comes from `public.entitlements` — the projection the
  client may read and may not write — via
  `public.account_save_slot_capacity()`, never from anything the client
  sends.
- **`public.create_prison()`** is the front door: `SECURITY DEFINER`, owner
  taken from `auth.uid()` with no parameter to forge, returning a
  discriminated `status` of `created` / `at_slot_limit` / `slot_taken` plus
  `used_slots` and `capacity` — the same shape `create_save_version()`
  already uses for `conflict`, and what a "4 of 5 slots used" surface needs.
  The trigger still fires underneath it; that redundancy is the point, and
  it is why `INSERT` on `prisons` is deliberately still granted.
- **`save_versions_enforce_size`**, a `BEFORE INSERT` trigger, measures the
  stored payload, **overwrites the caller's `byte_size` claim with the
  measurement**, and refuses anything over the limit with `LS002`.
  `byte_size` is a fact now rather than an assertion.

Both refusals are distinguishable rather than opaque. Measured against the
running stack, PostgREST maps these user-defined SQLSTATEs to **HTTP 400**
and returns `{"code":"LS001","details":"used_slots=5 capacity=5", …}`.

**Over-capacity degrades read-only.** The triggers fire on creation and on
nothing else, so an account that loses capacity — refund, chargeback,
expiry — keeps every prison it has, keeps listing them, keeps pulling them
and keeps saving to them. Only creating another slot is refused. That is the
same commitment [TRUSTED_SERVICES.md](./TRUSTED_SERVICES.md) makes for the
client-side projection, asserted in
`supabase/tests/004_free_tier_capacity.test.sql` and over HTTP in
`pnpm verify:stack`.

Two things are explicitly **not** closed. Revision history is still
unbounded within a bounded slot (ADR 0013 §5–§6), and anonymous-identity
churn — GoTrue signup rate limits, cleanup of abandoned anonymous accounts
— is a separate lever that #57 names and this work records rather than
implements (ADR 0013 §7).

## What is out of scope here

Payments/paid-slot checkout; trusting client-submitted values for
leaderboards; realtime collaborative simulation; automatic destructive
conflict resolution (every conflict requires the explicit choices above);
revision-history depth, a total-bytes-per-account cap and
anonymous-identity churn (all three proposed but deliberately not
implemented — see ADR 0013 §5–§7).
