-- pgTAP tests for RLS ownership boundaries and the create_save_version()
-- optimistic-concurrency/idempotency RPC.
--
-- EXECUTED two ways. The first 19 assertions have been run both ways,
-- 19/19 each. Everything added since has been run only the second way,
-- because the stack run needs container images that were not reachable when
-- they were written: the thirteen for issue #105 finding 11 (the
-- "storage_path" section), the five for issue #194's `created_at` half, the
-- six for its `updated_at` half (the two server-timestamp sections), the eight
-- for the scalar CHECKs suite 008 names and nothing exercised, and the three
-- pinning #340's two-branch refusal (the last two sections).
-- `pnpm verify:sql` reports 54/54 for this suite. That figure is what drifted
-- before -- it read 32/32 for as long as nobody re-ran it after #194 -- so
-- treat it as a claim to check rather than as a fact to trust.
--
--   * `supabase test db` against the REAL Supabase local stack (CLI 2.115.0,
--     PostgreSQL 17 + pgTAP, with GoTrue, PostgREST, Storage and Realtime
--     running). Running it there for the first time found that no migration
--     in this repository ever granted the Data API roles the privileges its
--     RLS policies presuppose -- the first assertion below failed with
--     `42501 permission denied for table prisons`. See docs/CLOUD_SAVE.md.
--   * `pnpm verify:sql` (scripts/verify-supabase-sql.mjs) against plain
--     PostgreSQL 16.13 + pgTAP 1.3.2 and 18.6 + pgTAP 1.3.4, via
--     scripts/sql/supabase-compat-harness.sql.
--
-- The harness is still not Supabase: it emulates the roles, default
-- privileges and `auth` slice this SQL references, and nothing else. What
-- neither run can prove is that GoTrue mints the identity these policies
-- read -- `auth.uid()` is fed here by `set_config`, not by a JWT. That step
-- is covered by `pnpm verify:stack` (scripts/verify-supabase-stack.mjs),
-- which drives the same contract through /auth/v1 and /rest/v1.

begin;
select plan(54);

-- Two auth.users rows to test cross-owner isolation. Inserting directly
-- into auth.users is the standard way to seed fixtures for RLS pgTAP tests.
--
-- VERIFIED against the real stack, resolving what used to be an unverified
-- assumption here: GoTrue's auth.users has 35 columns, and the only two
-- besides `id` that are NOT NULL -- `is_sso_user` and `is_anonymous` -- both
-- default to false. `(id, email)` is therefore sufficient, and no additional
-- columns need adding.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'user-a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'user-b@example.test');

-- Seed as postgres (bypasses RLS) so ownership fixtures don't depend on
-- the INSERT policies under test.
insert into public.prisons (id, owner_id, game_version, slot_index)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'lockstate-0.0.0', 0);

-- --- RLS: prisons, as the owner (user A) ---

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;

select is(
  (select count(*)::int from public.prisons where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1,
  'owner can select their own prison'
);

-- `throws_ok` is used in its four-argument form throughout: pgTAP's
-- two-argument form compares the *error message*, it does not take a
-- description, so `throws_ok(sql, 'some prose')` asserts something nobody
-- intended. Assert the SQLSTATE (42501 = insufficient_privilege) and leave
-- the message free.
select throws_ok(
  $$ update public.prisons set current_revision = 999 where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '42501',
  null,
  'even the owner cannot write current_revision directly'
);

select throws_ok(
  $$ update public.prisons set current_version_id = gen_random_uuid() where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '42501',
  null,
  'even the owner cannot write current_version_id directly'
);

reset role;

-- --- RLS: prisons, as a different user (user B) ---

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
set local role authenticated;

select is(
  (select count(*)::int from public.prisons where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0,
  'a different user cannot select another owner''s prison (row hidden by RLS, not an error)'
);

-- RLS hides the row rather than rejecting the statement, so a foreign
-- UPDATE/DELETE succeeds while matching nothing. Asserting an exception
-- here would assert the wrong behaviour; what matters is that no row moved.
select lives_ok(
  $$ update public.prisons set display_name = 'hijacked' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'a foreign UPDATE is not an error -- RLS simply matches no row'
);

select lives_ok(
  $$ delete from public.prisons where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'a foreign DELETE is not an error -- RLS simply matches no row'
);

select throws_ok(
  $$ select * from public.create_save_version(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 1, 'deadbeefdeadbeef', '{}'::jsonb, null, 2
     ) $$,
  '42501',
  null,
  'a different user cannot advance another owner''s prison through the RPC either'
);

reset role;

-- Neither statement above touched anything: checked as a role that can see
-- the row, since user B cannot select it to prove that for itself.
select is(
  (select display_name is null and current_revision = 0 from public.prisons where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  true,
  'the foreign UPDATE/DELETE left the owner''s prison untouched'
);

-- --- create_save_version(): the trusted path for advancing current_* ---

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;

select results_eq(
  $$ select status, revision from public.create_save_version(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 1, 'checksum-rev-1', '{"tick": 0}'::jsonb, null, 10
     ) $$,
  $$ values ('created'::text, 1) $$,
  'first save at revision 1 succeeds when current_revision is 0'
);

select is(
  (select current_revision from public.prisons where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1,
  'the prison pointer actually advances to the new revision'
);

select results_eq(
  $$ select status, revision from public.create_save_version(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 3, 1, 'checksum-skip-ahead', '{}'::jsonb, null, 2
     ) $$,
  $$ values ('conflict'::text, 1) $$,
  'skipping ahead to revision 3 when current is 1 is reported as a conflict, not applied'
);

-- The genuine retry-after-lost-response case: same revision, same content.
select results_eq(
  $$ select status, revision from public.create_save_version(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 1, 'checksum-rev-1', '{"tick": 0}'::jsonb, null, 10
     ) $$,
  $$ values ('idempotent_replay'::text, 1) $$,
  'resubmitting the exact same accepted content at the same revision is an idempotent replay, not a conflict or a duplicate row'
);

-- Regression pin for the defect this suite previously only documented: an
-- earlier design keyed idempotency on the checksum alone, so a prison that
-- legitimately returned to an earlier state (a player undoing a build)
-- resubmitted an old checksum at a NEW revision and was answered with a
-- replay of the OLD one. The pointer never advanced, the client recorded
-- itself as synced at a revision the cloud had never reached, and its next
-- push conflicted for no reason. Recurring content is a new revision.
select results_eq(
  $$ select status, revision from public.create_save_version(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2, 1, 'checksum-rev-1', '{"tick": 0}'::jsonb, null, 10
     ) $$,
  $$ values ('created'::text, 2) $$,
  'content matching an earlier revision is a new revision, not a replay of that earlier one'
);

select is(
  (select current_revision from public.prisons where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  2,
  'the pointer advances for recurring content too -- the client is never told it is synced ahead of the cloud'
);

select is(
  (select count(*)::int from public.save_versions
    where prison_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and checksum = 'checksum-rev-1'),
  2,
  'the same content can occupy two revisions: identity is (prison, revision, checksum), not content alone'
);

-- Different content at a revision that is already taken is not a replay
-- either; the caller is told the cloud's real head so it can rebase.
select results_eq(
  $$ select status, revision from public.create_save_version(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2, 1, 'checksum-other-device', '{"tick": 9}'::jsonb, null, 12
     ) $$,
  $$ values ('conflict'::text, 2) $$,
  'different content at an already-occupied revision is a conflict, never a replay and never a duplicate'
);

select results_eq(
  $$ select status, revision from public.create_save_version(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 3, 1, 'checksum-rev-3', '{"tick": 1}'::jsonb, null, 12
     ) $$,
  $$ values ('created'::text, 3) $$,
  'a correctly-sequenced N -> N+1 save succeeds after a conflict was reported'
);

select is(
  (select count(*)::int from public.save_versions where prison_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  3,
  'exactly three versions exist: the conflict/replay attempts never inserted extra rows'
);

select throws_ok(
  $$ insert into public.save_versions (prison_id, revision, save_schema_version, checksum, payload, byte_size)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 5, 1, 'direct-insert', '{}'::jsonb, 2) $$,
  '42501',
  null,
  'save_versions has no direct client-facing insert path, only create_save_version()'
);

-- --- storage_path: a shape, and a prefix it cannot escape --------------
--
-- Issue #105 finding 11. Every refusal below was an ACCEPTED, stored row
-- before 20260824110200_validate_save_version_storage_path.sql -- the
-- column was `text` with no constraint of any kind and the RPC passes
-- `p_storage_path` straight through -- so each of these is one of that
-- finding's demonstrations, driven through the tier that owns it.
--
-- The two tiers answer with two different SQLSTATEs, and which one fires is
-- not arbitrary: a BEFORE-row trigger runs before CHECK constraints are
-- evaluated, so a path whose first segment is not the owning account is
-- refused by the trigger (`LS004`) even when it is also malformed, and
-- `23514` is what a path with the RIGHT prefix and the WRONG shape gets.
-- The cases below are chosen to reach each of them deliberately rather than
-- incidentally.
--
-- NOTHING IN THIS SECTION IS REACHABLE BY THIS REPOSITORY'S CLIENT.
-- `SupabaseCloudSaveClient.uploadVersion` sends `p_storage_path: null` on
-- every call and `downloadVersion` throws on any row that has one, because
-- there is still no Storage bucket anywhere in `supabase/migrations/` --
-- ADR 0013 keeps the JSONB-vs-Storage threshold a candidate, so the bucket
-- is deliberately not invented. These assertions pin the column's contract
-- before its first writer exists.

-- Absolute: the first segment of `/etc/passwd` is the empty string, so it
-- is not this account's prefix.
select throws_ok(
  $$ select * from public.create_save_version(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 4, 1, 'checksum-abs', null, '/etc/passwd', 10) $$,
  'LS004',
  null,
  'an absolute storage path is refused: it does not live under the owner prefix'
);

select throws_ok(
  $$ select * from public.create_save_version(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 4, 1, 'checksum-traversal', null, '../../../../etc/shadow', 10) $$,
  'LS004',
  null,
  'a traversal out of every prefix is refused'
);

-- The strongest of the eight probes, because it satisfies every rule in the
-- shape CHECK: escaping a per-owner prefix does not need traversal syntax
-- when another owner's prefix can simply be named. User B's id is a real
-- account in this suite, not a fabricated uuid.
select throws_ok(
  $$ select * from public.create_save_version(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 4, 1, 'checksum-foreign', null,
       '22222222-2222-2222-2222-222222222222/prison/1.json', 10) $$,
  'LS004',
  null,
  'a well-formed path under ANOTHER account''s prefix is refused: the prefix must be the owner''s own'
);

select throws_ok(
  $$ select * from public.create_save_version(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 4, 1, 'checksum-empty', null, '', 10) $$,
  'LS004',
  null,
  'the empty string is refused rather than stored as a path'
);

-- Percent-encoded traversal: refused here as a prefix failure, and it could
-- never reach the shape check either, because `%` is not in the alphabet.
-- Both matter -- a consumer that URL-decodes before using the value is the
-- reason to exclude `%` at all.
select throws_ok(
  $$ select * from public.create_save_version(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 4, 1, 'checksum-encoded', null, '%2e%2e%2fetc%2fpasswd', 10) $$,
  'LS004',
  null,
  'a percent-encoded traversal is refused before anything gets a chance to decode it'
);

-- From here on the prefix is the owner's own, so the trigger passes and the
-- shape CHECK is what answers.
select throws_ok(
  $$ select * from public.create_save_version(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 4, 1, 'checksum-inner-traversal', null,
       '11111111-1111-1111-1111-111111111111/../22222222-2222-2222-2222-222222222222/1.json', 10) $$,
  '23514',
  null,
  'a traversal INSIDE the owner prefix is refused by the shape: `..` cannot be a segment'
);

select throws_ok(
  $$ select * from public.create_save_version(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 4, 1, 'checksum-empty-segment', null,
       '11111111-1111-1111-1111-111111111111//1.json', 10) $$,
  '23514',
  null,
  'an empty segment is refused: `//` cannot match a segment that must start with an alphanumeric'
);

select throws_ok(
  $$ select * from public.create_save_version(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 4, 1, 'checksum-prefix-only', null,
       '11111111-1111-1111-1111-111111111111', 10) $$,
  '23514',
  null,
  'the bare prefix is not an object key: at least one further segment is required'
);

-- The 1 MiB path from #105 finding 11 was stored in full. The bound is
-- asserted at the boundary rather than at a round number, so an off-by-one
-- in either direction fails here: 36 characters of uuid + 1 separator + 476
-- is 513.
select throws_ok(
  $$ select * from public.create_save_version(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 4, 1, 'checksum-too-long', null,
       '11111111-1111-1111-1111-111111111111/' || repeat('a', 476), 10) $$,
  '23514',
  null,
  'one character over 512 is refused, so a megabyte-long path cannot be stored'
);

select results_eq(
  $$ select status, revision from public.create_save_version(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 4, 1, 'checksum-exactly-512', null,
       '11111111-1111-1111-1111-111111111111/' || repeat('a', 475), 10) $$,
  $$ values ('created'::text, 4) $$,
  'a path measuring exactly 512 characters is accepted: the bound is inclusive'
);

-- What the constraint is FOR: the layout under the owner prefix is
-- deliberately unconstrained beyond the alphabet, because depth, naming and
-- extension belong to the Storage decision ADR 0013 has not made.
select results_eq(
  $$ select status, revision from public.create_save_version(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 5, 1, 'checksum-nested', null,
       '11111111-1111-1111-1111-111111111111/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/0000000005.json.zst', 10) $$,
  $$ values ('created'::text, 5) $$,
  'a nested path under the owner prefix is accepted, including dots inside a segment'
);

reset role;

-- --- The table tier, probed as the privileged role ---------------------
--
-- Everything above went through `create_save_version()`. These two bypass
-- it entirely, as the role this suite runs as -- which owns the table and is
-- exempt from RLS -- so they assert that both halves hold of the DATA and
-- not of one caller. A future backfill or importer inherits them.
select throws_ok(
  $$ insert into public.save_versions (prison_id, revision, save_schema_version, checksum, storage_path, byte_size)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 6, 1, 'direct-foreign-prefix',
             '22222222-2222-2222-2222-222222222222/1.json', 10) $$,
  'LS004',
  null,
  'the per-owner prefix is the table''s, not the RPC''s: a privileged direct write is refused too'
);

select throws_ok(
  $$ insert into public.save_versions (prison_id, revision, save_schema_version, checksum, storage_path, byte_size)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 6, 1, 'direct-bad-shape',
             '11111111-1111-1111-1111-111111111111/.env', 10) $$,
  '23514',
  null,
  'and so is the shape: a dot-file segment is refused for a privileged writer as well'
);

-- --- A client cannot stamp the server's creation timestamps (#194) -----
--
-- The grant surface is pinned exhaustively in suite 003; this is the behaviour
-- that surface produces. Before 20260824140000 both of these inserts succeeded:
-- a client set `profiles.created_at` to 1970 and `prisons.created_at` to the
-- year 4000, reproduced as `authenticated` with `current_user` read back.
--
-- The refusal is `42501`, not a check violation: this is a privilege boundary
-- rather than a value one. That distinction matters for the paired admissions
-- below -- they are what fails if a later change revokes too much.

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;

select is(current_user::text, 'authenticated', 'the four assertions below run as the client role');

select throws_ok(
  $$ insert into public.profiles (id, display_name, created_at)
     values ('11111111-1111-1111-1111-111111111111', 'A', '1970-01-01T00:00:00Z') $$,
  '42501',
  null,
  'a client naming profiles.created_at is refused on the privilege, not on the value'
);

select lives_ok(
  $$ insert into public.profiles (id, display_name)
     values ('11111111-1111-1111-1111-111111111111', 'A') $$,
  'the same insert without created_at succeeds, so the revoke did not take the whole write path with it'
);

select throws_ok(
  $$ insert into public.prisons (owner_id, game_version, slot_index, created_at)
     values ('11111111-1111-1111-1111-111111111111', 'lockstate-0.0.0', 7,
             '4000-01-01T00:00:00Z') $$,
  '42501',
  null,
  'a client naming prisons.created_at is refused -- the intent the UPDATE grant already stated, now held on the insert path too'
);

select lives_ok(
  $$ insert into public.prisons (owner_id, game_version, slot_index)
     values ('11111111-1111-1111-1111-111111111111', 'lockstate-0.0.0', 8) $$,
  'the same insert without created_at succeeds, so suite 004 still drives the slot cap through this grant'
);

-- --- ...nor its update timestamps, and the server keeps them current (#194) ---
--
-- #194's open half, decided in 20260826130000 and recorded as a rule in ADR
-- 0008 section 2. Two properties, and the second is the one the decision turned
-- on rather than the first.
--
-- The refusal is the same privilege boundary as `created_at` above: `42501`,
-- because the column is out of every client grant. This schema refuses rather
-- than silently corrects for the same reason it refuses `current_revision` at
-- the top of this file -- a silently corrected value is one the client believes
-- it set and the server did not.
--
-- The stamping is the half that makes the column mean anything. `default now()`
-- fires on INSERT and never again, so before the trigger an UPDATE that did not
-- name `updated_at` left it at the insert value: reproduced as `authenticated`,
-- `payload` moved to `{"a": 2}` while `updated_at` stayed at 2020-01-01. The
-- column was not merely untrustworthy, it was stale. The last two assertions
-- below are what would fail if the trigger were dropped and the grants left as
-- they are -- which would read as a tightening and would leave the column
-- frozen at its insert value forever.
select throws_ok(
  $$ insert into public.user_settings (user_id, settings_schema_version, payload, updated_at)
     values ('11111111-1111-1111-1111-111111111111', 1, '{}'::jsonb,
             '4000-01-01T00:00:00Z') $$,
  '42501',
  null,
  'a client naming user_settings.updated_at is refused on the privilege'
);

select lives_ok(
  $$ insert into public.user_settings (user_id, settings_schema_version, payload)
     values ('11111111-1111-1111-1111-111111111111', 1, '{"a": 1}'::jsonb) $$,
  'the same insert without updated_at succeeds, so the revoke did not take the write path with it'
);

select throws_ok(
  $$ update public.user_settings set updated_at = '1900-01-01T00:00:00Z'
      where user_id = '11111111-1111-1111-1111-111111111111' $$,
  '42501',
  null,
  'and a client cannot walk it backwards afterwards -- the reproduction in #194, now refused'
);

-- The stamp itself. `now()` is the transaction timestamp and this suite is one
-- transaction, so no wall-clock comparison can say anything here; what is
-- asserted is the property the trigger exists for -- an UPDATE that never
-- mentions `updated_at` moves it off a value the row already held.
--
-- Getting a row into that state is itself the first assertion. The obvious way
-- to plant a stale value is a privileged UPDATE, and it does not work: the
-- trigger has no exempt path, so the table owner's write is stamped too. That
-- is worth asserting rather than working around silently -- `entitlement_events`
-- is append-only *including for the table owner* by the same mechanism, and a
-- trigger that a privileged connection could route around would be a weaker
-- control than the grants it sits beside.
reset role;
update public.user_settings set updated_at = '2020-01-01T00:00:00Z'
  where user_id = '11111111-1111-1111-1111-111111111111';

select is(
  (select updated_at = now() from public.user_settings
    where user_id = '11111111-1111-1111-1111-111111111111'),
  true,
  'even the table owner cannot plant a stale updated_at: the trigger has no exempt write path'
);

-- So the trigger is disabled to plant it, which needs the table owner and is
-- therefore unreachable from either client role.
alter table public.user_settings disable trigger user_settings_stamp_updated_at;
update public.user_settings set updated_at = '2020-01-01T00:00:00Z'
  where user_id = '11111111-1111-1111-1111-111111111111';
alter table public.user_settings enable trigger user_settings_stamp_updated_at;

select is(
  (select updated_at from public.user_settings
    where user_id = '11111111-1111-1111-1111-111111111111'),
  '2020-01-01T00:00:00Z'::timestamptz,
  'the stale value is planted, so the assertion below is not passing on a row that was already current'
);

set local role authenticated;
update public.user_settings set payload = '{"a": 2}'::jsonb
  where user_id = '11111111-1111-1111-1111-111111111111';

select is(
  (select updated_at = now() from public.user_settings
    where user_id = '11111111-1111-1111-1111-111111111111'),
  true,
  'an UPDATE that never names updated_at still moves it to now(): the column is the server''s, and current'
);

reset role;

-- --- The four scalar CHECKs suite 008 names and nothing exercised ------
--
-- Suite 008 asserts that these constraint objects EXIST and cover the columns
-- they claim to; its header used to add that "suites 001, 002, 004 and 006"
-- assert what they refuse. They did not, for nine of the thirteen objects that
-- suite names -- four of them on this suite's two tables. Measured: every CHECK
-- in `public` was dropped and re-added under the same name over the same
-- `conkey` with a predicate admitting everything
-- (`check (num_nonnulls(<same columns>) >= 0)`), and all 287 assertions stayed
-- green for these four. A coverage rule reads the catalog, and an in-place
-- rewrite leaves the catalog entry looking identical -- so the gap is in this
-- suite rather than in that one (#280 recorded it as a residual).
--
-- Both directions, the shape the storage_path section above already uses: one
-- past the bound must be refused, and the value exactly at it must be admitted.
-- The admitting half is what makes the refusing half non-vacuous -- a
-- constraint rewritten to refuse *everything* would pass a `throws_ok` alone.
--
-- Probed as the privileged role, for the reason the storage_path section gives:
-- no client role can write `current_revision` or reach `save_versions` at all,
-- so the client tier cannot distinguish a bound that holds from one that is
-- merely unreachable. A backfill or an importer is who these hold against.

insert into auth.users (id, email) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'scalar-bounds@example.test');

-- `prisons_slot_index_positive`. `slot_index >= 0`, so -1 is one past the bound
-- and 0 is exactly at it. Zero is a real slot rather than a sentinel -- suite
-- 004 creates prisons from `generate_series(0, 4)` -- which is why the floor is
-- `>= 0` and not `> 0`, and why the admitting half is worth asserting.
select throws_ok(
  $$ insert into public.prisons (id, owner_id, game_version, slot_index)
     values ('bbbbbbbb-0000-0000-0000-000000000001',
             'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'lockstate-0.0.0', -1) $$,
  '23514',
  null,
  'a negative slot index is refused: a slot that cannot be addressed is not a slot'
);

select lives_ok(
  $$ insert into public.prisons (id, owner_id, game_version, slot_index)
     values ('bbbbbbbb-0000-0000-0000-000000000001',
             'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'lockstate-0.0.0', 0) $$,
  'slot index 0 is admitted: the floor is inclusive, which is what makes the first free slot usable'
);

-- `prisons_current_revision_non_negative`. `current_revision >= 0`, and 0 is
-- the value a prison is created at -- the first assertion of the RPC section
-- above depends on it ("first save at revision 1 succeeds when current_revision
-- is 0"), so admitting 0 is not a formality.
select throws_ok(
  $$ insert into public.prisons (id, owner_id, game_version, slot_index, current_revision)
     values ('bbbbbbbb-0000-0000-0000-000000000002',
             'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'lockstate-0.0.0', 1, -1) $$,
  '23514',
  null,
  'a negative current_revision is refused: the pointer counts saves, and there is no save before the first'
);

select lives_ok(
  $$ insert into public.prisons (id, owner_id, game_version, slot_index, current_revision)
     values ('bbbbbbbb-0000-0000-0000-000000000002',
             'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'lockstate-0.0.0', 1, 0) $$,
  'current_revision 0 is admitted: that is the state every new prison starts in'
);

-- `save_versions_revision_positive`. `revision > 0`, so 0 is one past the bound
-- and 1 is exactly at it. This one is strict where the two above are not, and
-- deliberately: revision 0 would collide with the `current_revision = 0` a
-- prison holds before its first save, so "the cloud is at revision 0" has to
-- keep meaning "there is nothing here".
select throws_ok(
  $$ insert into public.save_versions (prison_id, revision, save_schema_version, checksum, payload, byte_size)
     values ('bbbbbbbb-0000-0000-0000-000000000001', 0, 1, 'scalar-probe-r0', '{"tick":0}'::jsonb, 10) $$,
  '23514',
  null,
  'a save version at revision 0 is refused: revision 0 is the empty state, not a stored save'
);

select lives_ok(
  $$ insert into public.save_versions (prison_id, revision, save_schema_version, checksum, payload, byte_size)
     values ('bbbbbbbb-0000-0000-0000-000000000001', 1, 1, 'scalar-probe-r1', '{"tick":0}'::jsonb, 10) $$,
  'revision 1 is admitted, so the floor is exactly where the first save lands'
);

-- `save_versions_byte_size_non_negative`. Reachable only on the Storage-backed
-- path, and that is a property of the schema rather than of this test:
-- `enforce_save_version_size()` *measures* a JSONB payload and overwrites
-- `byte_size` with the measurement, so a negative claim on a JSONB row is
-- corrected before the CHECK ever sees it. A Storage-backed row has nothing to
-- measure, so its `byte_size` stays the caller's figure -- which is exactly
-- what 20260823100000's header says, and exactly why the claim still needs
-- bounding. The path is the owner's own so the `LS004` prefix trigger passes
-- and this constraint is what answers.
select throws_ok(
  $$ insert into public.save_versions (prison_id, revision, save_schema_version, checksum, storage_path, byte_size)
     values ('bbbbbbbb-0000-0000-0000-000000000001', 2, 1, 'scalar-probe-neg',
             'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/probe.json', -1) $$,
  '23514',
  null,
  'a negative byte_size is refused on the one path that keeps the caller''s figure rather than measuring it'
);

select lives_ok(
  $$ insert into public.save_versions (prison_id, revision, save_schema_version, checksum, storage_path, byte_size)
     values ('bbbbbbbb-0000-0000-0000-000000000001', 2, 1, 'scalar-probe-zero',
             'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/probe.json', 0) $$,
  'a byte_size of exactly 0 is admitted: an empty object is a legitimate size, and the floor is inclusive'
);

-- --- create_save_version()'s two refusals for one question (#340) ------
--
-- WHAT THIS SECTION PINS, AND WHY IT LOOKS BACKWARDS. `create_save_version()`
-- answers "is this prison yours?" and "does this prison exist?" with two
-- different SQLSTATEs and two different messages
-- (20260822190300_create_save_version_rpc.sql:96 and :105), while the RLS
-- policy on the same table refuses to answer the second question at all -- the
-- foreign row simply is not visible. That is an existence oracle, it is filed
-- as #340, and this suite could not see it: the assertion above uses
-- `throws_ok(..., '42501', null, ...)`, which reads the SQLSTATE and leaves the
-- message free, and no assertion in any of the eleven suites called this
-- function with a prison id that does not exist. #340's proposed merged
-- refusal applied verbatim left all 287 green.
--
-- Suite 002 pins the fixed version of exactly this shape for the challenge RPC
-- ("a challenge id that does not exist is refused with a message that says
-- nothing about existence"), and the honest thing here would be to assert that
-- shape and let it fail until the migration lands. It is not asserted that way
-- for one reason and it is worth stating: the fix is a migration, this agent
-- may not write one, and a suite that is red on `main` is a gate nobody reads.
-- pgTAP's `todo` is the idiom for exactly that and it does not survive this
-- harness -- `select todo(...)` emits `not ok N - … # TODO`, and
-- `scripts/verify-supabase-sql.mjs`'s TAP parser matches `/^not ok \d+/` with
-- no TODO exemption, so the whole run goes red anyway (verified). Nor is there
-- a precedent for it: `todo` appears in none of the eleven suites.
--
-- So today's two-branch behaviour is pinned instead, messages included. That is
-- deliberately a pin on a DEFECT, and it is written to be impossible to
-- misread as approval: the migration that merges these two branches MUST
-- update these three assertions, and cannot land silently. The first two are
-- what #340 fixes; the third is what makes it a disclosure rather than a
-- cosmetic inconsistency, and it stays true either way.

create function pg_temp.save_version_answer(p_prison_id uuid)
returns text
language plpgsql as $$
declare
  v_status text;
begin
  select status into v_status from public.create_save_version(
    p_prison_id, 1, 1, 'oracle-probe-0001', '{"tick": 0}'::jsonb, null, 10);
  return 'status=' || v_status;
exception when others then
  return sqlstate || ': ' || sqlerrm;
end;
$$;

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
set local role authenticated;

select is(
  pg_temp.save_version_answer('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  '42501: not authorized for prison aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'TODAY: a prison that exists and belongs to someone else is refused with 42501 and a message naming the prison (#340 -- this assertion must change when the two branches merge)'
);

select is(
  pg_temp.save_version_answer('99999999-9999-9999-9999-999999999999'),
  'P0001: prison 99999999-9999-9999-9999-999999999999 does not exist',
  'TODAY: a prison that does not exist is refused with a DIFFERENT sqlstate and a message that says so -- the two answers together are the oracle #340 reports'
);

select is(
  (select count(*)::int from public.prisons where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0,
  'and the same caller cannot see that prison through RLS at all, which is what makes the pair above a disclosure rather than a wording inconsistency'
);

reset role;


select * from finish();
rollback;
