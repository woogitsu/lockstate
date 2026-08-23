-- pgTAP tests for RLS ownership boundaries and the create_save_version()
-- optimistic-concurrency/idempotency RPC.
--
-- EXECUTED two ways, 19/19 assertions each:
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
select plan(19);

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

reset role;

select * from finish();
rollback;
