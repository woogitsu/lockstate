-- pgTAP tests for RLS ownership boundaries and the create_save_version()
-- optimistic-concurrency/idempotency RPC.
--
-- EXECUTED against PostgreSQL 16.13 + pgTAP 1.3.2 via `pnpm verify:sql`
-- (scripts/verify-supabase-sql.mjs), which prepares a scratch database
-- with scripts/sql/supabase-compat-harness.sql. That harness supplies only
-- the roles, default grants and `auth` slice this SQL references -- it is
-- not Supabase, so these results prove the SQL and not the hosted
-- platform's identity layer. `supabase test db` against the real local
-- stack remains the stronger check and has not been run.

begin;
select plan(16);

-- Two auth.users rows to test cross-owner isolation. Supabase's local
-- stack ships pgTAP plus a populated auth schema; inserting directly into
-- auth.users is the standard way to seed fixtures for RLS pgTAP tests.
-- Unverified assumption (see file header): if the local stack's auth.users
-- has additional NOT NULL columns without defaults, add them here.
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

-- This assertion previously expected `conflict`, contradicting the
-- contract the function's own header documents ("a resubmission of a
-- checksum already recorded for this prison is treated as a successful
-- idempotent replay"). The function is the side that is implementable:
-- `save_versions_prison_checksum_unique` means identical content cannot
-- exist twice under one prison, so falling through to the create path
-- would raise a unique violation rather than produce a second row. The
-- test was never run, so the disagreement went unnoticed.
--
-- OPEN QUESTION for #20, deliberately not decided here: a client that
-- pushes unchanged content at revision N+1 is told `idempotent_replay` at
-- revision N, so `PrisonSyncEngine` records itself as synced one revision
-- ahead of the cloud and hits a spurious conflict on its next push.
-- Resolving that means changing what the checksum identifies, not fixing
-- this test.
select results_eq(
  $$ select status, revision from public.create_save_version(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2, 1, 'checksum-rev-1', '{}'::jsonb, null, 2
     ) $$,
  $$ values ('idempotent_replay'::text, 1) $$,
  'resubmitting already-stored content at a different revision replays it rather than duplicating the row'
);

select results_eq(
  $$ select status, revision from public.create_save_version(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 1, 'checksum-rev-1', '{"tick": 0}'::jsonb, null, 10
     ) $$,
  $$ values ('idempotent_replay'::text, 1) $$,
  'resubmitting the exact same accepted content is an idempotent replay, not a conflict or a duplicate row'
);

select results_eq(
  $$ select status, revision from public.create_save_version(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2, 1, 'checksum-rev-2', '{"tick": 1}'::jsonb, null, 12
     ) $$,
  $$ values ('created'::text, 2) $$,
  'a correctly-sequenced N -> N+1 save succeeds after a conflict was reported'
);

select is(
  (select count(*)::int from public.save_versions where prison_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  2,
  'exactly two versions exist: the conflict/replay attempts never inserted extra rows'
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
