-- pgTAP tests for the size bounds on client-writable text and jsonb columns
-- (issue #105 finding 4, migration 20260824101000).
--
-- WHAT THIS SUITE IS FOR. Suite 004 asks whether the right person can create
-- an unlimited *number* of rows. This one asks whether they can make one row
-- unlimited in *size*. With `[auth] enable_anonymous_sign_ins = true` the
-- `authenticated` role is effectively anyone, so an unbounded column is a
-- storage-exhaustion primitive that costs one signup call -- which is how the
-- audit in #105 came to store a 33 MB `user_settings.payload`.
--
-- Two properties are asserted for every bound, in both directions:
--
--   * the bound REFUSES a value past the ceiling; and
--   * the bound ADMITS a value exactly at the ceiling.
--
-- The second half is not padding. A database that refuses what the
-- TypeScript contract permits is a defect, not hardening -- which is why
-- 20260824100000 capped challenge evidence at 8,000,000 bytes rather than at
-- ADR 0013's 4 MiB, and why each ceiling below is derived from the
-- corresponding contract in `src/` rather than picked. If a later change
-- tightens a bound below what a caller may legitimately send, the
-- at-the-ceiling assertion is what fails.
--
-- TWO THINGS THIS SUITE DELIBERATELY DOES NOT ASSERT.
--
--   * `save_versions.storage_path`'s bound and shape belong to #105 finding
--     11 and are asserted by the suite that lands with it.
--   * The refusals here are ordinary `23514` check violations, not the
--     distinguishable `LS00x` codes suite 004 pins. That is the right shape:
--     LS001/LS002 exist because a capacity refusal must carry used/capacity
--     numbers the client can render, whereas "this column is too long" needs
--     no negotiation. Whether PostgREST turns a `23514` into an actionable
--     4xx is untested here, exactly as suite 004 records for LS001.
--
-- EXECUTED against plain PostgreSQL via `pnpm verify:sql`. As in every other
-- suite here, `auth.uid()` is fed by `set_config` rather than by a JWT, so
-- nothing below proves GoTrue mints the identity these policies read.

begin;
select plan(23);

insert into auth.users (id, email) values
  ('77777777-7777-7777-7777-777777777777', 'bounds@example.test');

-- Published as the table owner, because the challenge probes at the end need a
-- definition the client role can actually reach. Nothing here asserts anything
-- about publication; suite 002 owns that.
insert into public.challenge_definitions
  (challenge_id, version, definition, definition_hash, signature, opens_at, closes_at, published_at)
values
  ('challenge.bounds', 1, '{"k":1}'::jsonb, repeat('a', 16), '{"s":1}'::jsonb,
   now() - interval '1 day', now() + interval '1 day', now() - interval '1 day');

select set_config('request.jwt.claim.sub', '77777777-7777-7777-7777-777777777777', true);
set local role authenticated;

-- --- The role every assertion below runs as --------------------------
--
-- Read back rather than assumed: `set local role` outside a transaction
-- block silently no-ops, and the audit in #105 records that as the way an
-- interrogation like this produces a false clean.

select is(current_user::text, 'authenticated', 'every probe below runs as the client role, not as the owner');

-- --- user_settings.payload -------------------------------------------
--
-- The column that held 8,388,620 bytes before this bound. The ceiling is
-- 65,536 bytes of `payload::text`; the shipped defaults serialize to 792.

select throws_ok(
  $$ insert into public.user_settings (user_id, settings_schema_version, payload)
     values ('77777777-7777-7777-7777-777777777777', 1,
             jsonb_build_object('junk', repeat('x', 65536))) $$,
  '23514',
  null,
  'a settings payload past 64 KiB is refused'
);

select lives_ok(
  $$ insert into public.user_settings (user_id, settings_schema_version, payload)
     values ('77777777-7777-7777-7777-777777777777', 1,
             jsonb_build_object('k', repeat('y', 65536 - 9))) $$,
  'a settings payload exactly at 64 KiB is admitted'
);

select is(
  (select octet_length(payload::text) from public.user_settings
    where user_id = '77777777-7777-7777-7777-777777777777'),
  65536,
  'the admitted payload really is at the ceiling, so the assertion above is not passing on a small value'
);

-- --- user_settings.settings_schema_version ---------------------------
--
-- Accepted -2147483648 before this bound. Bounded as positive rather than
-- pinned to a value, unlike the ledger's `schema_version = 1`: nothing makes
-- the settings schema version part of a contract a migration must move.

select throws_ok(
  $$ update public.user_settings set settings_schema_version = 0
      where user_id = '77777777-7777-7777-7777-777777777777' $$,
  '23514',
  null,
  'a non-positive settings schema version is refused'
);

select lives_ok(
  $$ update public.user_settings set settings_schema_version = 2
      where user_id = '77777777-7777-7777-7777-777777777777' $$,
  'a schema version above the one shipped today is still admitted, so the bound is not a pin'
);

-- --- profiles.display_name -------------------------------------------
--
-- Nullable, and written by nothing in `src/` -- so this bound is on what the
-- Data API permits, not on what the application does. Both ends matter: the
-- empty string is refused because it would be a second spelling of NULL.

select throws_ok(
  $$ insert into public.profiles (id, display_name)
     values ('77777777-7777-7777-7777-777777777777', repeat('n', 129)) $$,
  '23514',
  null,
  'a display name past 128 characters is refused'
);

select throws_ok(
  $$ insert into public.profiles (id, display_name)
     values ('77777777-7777-7777-7777-777777777777', '') $$,
  '23514',
  null,
  'an empty display name is refused rather than stored as a second spelling of NULL'
);

select lives_ok(
  $$ insert into public.profiles (id, display_name)
     values ('77777777-7777-7777-7777-777777777777', repeat('n', 128)) $$,
  'a display name exactly at 128 characters is admitted'
);

select lives_ok(
  $$ update public.profiles set display_name = null
      where id = '77777777-7777-7777-7777-777777777777' $$,
  'NULL is still admitted, so the bound did not make the column required'
);

-- --- prisons.game_version and prisons.display_name -------------------
--
-- `game_version` carries `identifierSchema` values, whose own bound is
-- `.min(1).max(128)`. The length is enforced and the character class is not:
-- copying that regex into SQL would put one rule in two places.

select throws_ok(
  $$ insert into public.prisons (owner_id, game_version, slot_index)
     values ('77777777-7777-7777-7777-777777777777', repeat('v', 129), 0) $$,
  '23514',
  null,
  'a game version past 128 characters is refused'
);

select throws_ok(
  $$ insert into public.prisons (owner_id, game_version, display_name, slot_index)
     values ('77777777-7777-7777-7777-777777777777', 'lockstate-dev', repeat('p', 129), 0) $$,
  '23514',
  null,
  'a prison display name past 128 characters is refused'
);

select lives_ok(
  $$ insert into public.prisons (owner_id, game_version, display_name, slot_index)
     values ('77777777-7777-7777-7777-777777777777', repeat('v', 128), repeat('p', 128), 0) $$,
  'a game version and display name exactly at 128 characters are admitted'
);

-- --- save_versions.checksum ------------------------------------------
--
-- Reached only through create_save_version(), which accepted a 524,288-
-- character checksum. The bound is a length rather than the contract's exact
-- `^[0-9a-f]{16}$`, so that the save format's checksum shape stays declared in
-- one place; 64 characters leaves room for a wider digest.
--
-- The refusal arrives as a check violation from inside a SECURITY DEFINER
-- function, which is the point: the RPC measures the payload and says nothing
-- about the rest of the row, so the column has to hold the line itself.

select lives_ok(
  $$ select public.create_prison('88888888-8888-8888-8888-888888888888'::uuid, 'lockstate-dev', 1) $$,
  'a prison exists to hang the save-version probes on'
);

select throws_ok(
  $$ select public.create_save_version('88888888-8888-8888-8888-888888888888'::uuid, 1, 3,
       repeat('c', 65), '{"tick": 0}'::jsonb, null, 11) $$,
  '23514',
  null,
  'a checksum past 64 characters is refused, even though the RPC never looks at it'
);

select lives_ok(
  $$ select public.create_save_version('88888888-8888-8888-8888-888888888888'::uuid, 1, 3,
       repeat('c', 64), '{"tick": 0}'::jsonb, null, 11) $$,
  'a checksum exactly at 64 characters is admitted'
);

-- --- The row is bounded, not just its largest column -----------------
--
-- Before this migration a single accepted `save_versions` row carried
-- 4,194,252 bytes of payload *and* 4,194,304 characters of checksum: twice
-- ADR 0013's bound in a row whose `byte_size` recorded half of it. This
-- asserts the arithmetic that replaced it -- the stored checksum cannot
-- contribute more than 64 characters to a row the payload bound sizes.

select cmp_ok(
  (select max(char_length(checksum)) from public.save_versions
    where prison_id = '88888888-8888-8888-8888-888888888888'),
  '<=',
  64,
  'no stored checksum can add more than 64 characters to a row the payload bound already sizes'
);

-- --- challenge_submissions.claimed_metrics ---------------------------
--
-- The bound that closes a hole in another bound. 20260824100000 caps
-- `evidence` at 8,000,000 bytes; measured before this migration, the same RPC
-- call stored 4,194,316 bytes in `claimed_metrics` beside 58 bytes of
-- `evidence`, so the cap was walked around rather than defeated. The ceiling
-- is 32,768 bytes -- 3.3x the largest value the TypeScript contract can
-- produce (64 keys of a 128-character identifier and a number that serializes
-- to at most 24 characters, i.e. 10,049 bytes).

select throws_ok(
  $$ select public.submit_challenge_evidence('challenge.bounds', 1, repeat('a', 16),
       '{"challengeId":"challenge.bounds","challengeVersion":1}'::jsonb,
       jsonb_build_object('junk', repeat('m', 32768))) $$,
  '23514',
  null,
  'a claimed-metrics record past 32 KiB is refused, so the evidence bound cannot be walked around'
);

select lives_ok(
  $$ select public.submit_challenge_evidence('challenge.bounds', 1, repeat('a', 16),
       '{"challengeId":"challenge.bounds","challengeVersion":1}'::jsonb,
       jsonb_build_object('k', repeat('m', 32768 - 9))) $$,
  'a claimed-metrics record exactly at 32 KiB is admitted'
);

select is(
  (select octet_length(claimed_metrics::text) from public.challenge_submissions
    where challenge_id = 'challenge.bounds'),
  32768,
  'the admitted metrics record really is at the ceiling'
);

select cmp_ok(
  10049,
  '<=',
  32768,
  'the ceiling clears what the TypeScript contract can produce, so SQL refuses nothing a legitimate caller may send'
);

-- --- save_versions.save_schema_version (issue #191) -------------------
--
-- Client-supplied through create_save_version(), whose TypeScript contract is
-- `schemaVersionSchema = z.number().int().positive()`
-- (`src/simulation/protocol/types.ts:52`). Before 20260824130000 the column had
-- no check at all, so `-5` or `0` was storable on a row whose payload is a
-- perfectly valid V3 save.
--
-- Bounded rather than pinned to `SAVE_SCHEMA_VERSION` (currently 3): the column
-- records the schema version of the payload *as stored*, and a V1 or V2 row is
-- legitimate history the migration chain still reads. The second assertion is
-- the guard on that -- a pin would pass the first and fail it.

select throws_ok(
  $$ select public.create_save_version('88888888-8888-8888-8888-888888888888'::uuid, 2, 0,
       repeat('c', 16), '{"tick": 0}'::jsonb, null, 11) $$,
  '23514',
  null,
  'a non-positive save schema version is refused'
);

select lives_ok(
  $$ select public.create_save_version('88888888-8888-8888-8888-888888888888'::uuid, 2, 1,
       repeat('c', 16), '{"tick": 0}'::jsonb, null, 11) $$,
  'schema version 1 is still admitted, so the bound did not pin the column to the version shipped today'
);


select * from finish();
rollback;
