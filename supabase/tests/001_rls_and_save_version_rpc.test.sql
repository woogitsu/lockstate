-- pgTAP tests for RLS ownership boundaries and the create_save_version()
-- optimistic-concurrency/idempotency RPC.
--
-- NOT EXECUTED in this session: there is no Docker/Supabase CLI available
-- in this sandbox (starting the Docker daemon was blocked by the
-- environment's own safety policy). Run with:
--   supabase start
--   supabase test db
-- See docs/CLOUD_SAVE.md for the full picture; treat this file as
-- reviewed-by-inspection design, not verified evidence, until it has
-- actually been run once against a local Supabase stack.
begin;
select plan(15);

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

select throws_ok(
  $$ update public.prisons set current_revision = 999 where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'even the owner cannot write current_revision directly (column-level REVOKE)'
);

select throws_ok(
  $$ update public.prisons set current_version_id = gen_random_uuid() where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'even the owner cannot write current_version_id directly (column-level REVOKE)'
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

select throws_ok(
  $$ update public.prisons set display_name = 'hijacked' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'a different user cannot update another owner''s prison'
);

select throws_ok(
  $$ delete from public.prisons where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'a different user cannot delete another owner''s prison'
);

select throws_ok(
  $$ select * from public.create_save_version(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 1, 'deadbeefdeadbeef', '{}'::jsonb, null, 2
     ) $$,
  'a different user cannot advance another owner''s prison through the RPC either'
);

reset role;

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

select results_eq(
  $$ select status, revision from public.create_save_version(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2, 1, 'checksum-rev-1', '{}'::jsonb, null, 2
     ) $$,
  $$ values ('conflict'::text, 1) $$,
  'reusing a checksum from a different (stale) revision attempt is still a conflict, not silently accepted as that older revision'
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
  'save_versions has no direct client-facing insert path, only create_save_version()'
);

reset role;

select * from finish();
rollback;
