-- pgTAP tests for the two prison-id existence oracles closed by
-- 20260826090000_close_prison_id_existence_oracles.sql (issues #340, #343).
--
-- WHAT THIS SUITE IS FOR. `create_save_version()` used to answer "prison X
-- does not exist" (`P0001`) and "not authorized for prison X" (`42501`)
-- differently, so a caller holding an id could learn whether it named a live
-- prison belonging to somebody else. `create_prison()` used to let a
-- caller-supplied id that collides with any existing row escape as a raw
-- `23505 duplicate key value violates unique constraint "prisons_pkey"`
-- carrying `DETAIL: Key (id)=(…) already exists.` Both are the shape
-- 20260824110100 removed from `submit_challenge_evidence()`, and suite 002's
-- "the unpublished-challenge oracle" section is the model this one follows.
--
-- HOW INDISTINGUISHABILITY IS ASSERTED, because "both raise 42501" is not
-- it. Two things had to be got right, and each shaped the suite:
--
--   1. THE ANSWER IS COMPARED WHOLE, not by SQLSTATE. Both of
--      `create_prison()`'s answers were *already* `23505` before the fix;
--      they differed in the message and in the `DETAIL` field. A test that
--      checked only the SQLSTATE would have passed against the defect. So
--      `pg_temp.*_answer()` below captures `RETURNED_SQLSTATE`,
--      `MESSAGE_TEXT` and `PG_EXCEPTION_DETAIL` together -- the three things
--      PostgREST surfaces as `code`, `message` and `details` -- and every
--      assertion is against that whole string. `[detail: <none>]` in each
--      expected value is load-bearing: it is what asserts no id is echoed
--      into the structured field a log collector keeps.
--
--   2. THE PROBES DIFFER IN NOTHING BUT THE FACT UNDER TEST. Both messages
--      echo the caller-supplied id, so probing two *different* ids would
--      produce two different strings for a reason that has nothing to do
--      with the oracle. Each pair therefore holds the id constant:
--
--        * for `create_save_version()`, the SAME id is asked twice -- once
--          when no such row exists, and once after a row with that exact id
--          has been inserted for another account. Nothing else about the
--          call changes. This is suite 002's construction.
--        * for `create_prison()`, the same id cannot be absent and present,
--          so the constant is the ROW and the variable is the ASKER: one id
--          owned by account B is probed by account A (a foreign id) and by
--          account B (its own duplicate). If the refusal depended in any way
--          on who is asking relative to who owns the row, these two would
--          differ.
--
-- Both halves of each pair are compared to the same spelled-out literal,
-- which is transitively stronger than comparing them to each other: it pins
-- the text as well as the equality. This is the one place in these suites
-- where matching the message is right rather than brittle -- the message
-- *is* the security property. Everywhere else they assert the SQLSTATE and
-- leave the wording free.
--
-- WHAT THIS SUITE DOES NOT REACH, stated so the green is not read as more
-- than it is:
--
--   * The `prisons_owner_slot_unique` re-raise branch in `create_prison()`'s
--     handler. That constraint is `(owner_id, slot_index)` and the
--     `slot_taken` guard tests exactly the same condition one statement
--     earlier, so no single-session call can pass the guard and violate the
--     constraint -- it needs a second writer holding no advisory lock (the
--     direct client INSERT grant ADR 0013 retains, or a backfill). A pgTAP
--     suite is one session. This is the same limitation
--     20260824110000:300-320 records for its own `unique_violation` handler,
--     and it is recorded here rather than papered over: deleting that
--     `raise;` and the `CONSTRAINT_NAME` test around it leaves this suite
--     green. What IS asserted is the other direction -- that a `prisons_pkey`
--     collision does reach the merged refusal and does not surface the
--     constraint name -- which is what fails if the discrimination is
--     removed in the other direction.
--   * Anything about PostgREST. That `code`/`message`/`details` reach a
--     client is `pnpm verify:stack`'s territory; this suite asserts the
--     three fields the transport reads from.
--
-- EXECUTED via `pnpm verify:sql` against plain PostgreSQL 16.13 + pgTAP
-- 1.3.2 (scripts/sql/supabase-compat-harness.sql). NOT run against the real
-- Supabase local stack or a hosted project. The harness emulates the roles,
-- default privileges and `auth` slice this SQL references and nothing else;
-- `auth.uid()` is fed by `set_config`, not by a JWT.
--
-- RED-PROOFED: run against the schema WITHOUT
-- 20260826090000_close_prison_id_existence_oracles.sql, this suite fails 10
-- of its 14 assertions, and the diagnostics are the two oracles verbatim --
-- `have: P0001: prison dddddddd-… does not exist` against
-- `have: 42501: not authorized for prison dddddddd-…` for #340, and
-- `have: 23505: duplicate key value violates unique constraint
-- "prisons_pkey" [detail: Key (id)=(bbbbbbbb-…) already exists.]` for #343.
-- The pull request quotes that output in full. The four that pass without
-- the migration are exactly the four legitimate-path assertions (6, 7, 13,
-- 14), which is the correct result: this change is not supposed to alter
-- them. A security assertion nobody has watched fail is not an assertion.

begin;
select plan(14);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'oracle-a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'oracle-b@example.test');

-- Seeded as postgres (bypasses RLS) so the ownership fixtures do not depend
-- on the INSERT policies, matching suite 001.
--
-- Account A's own prison, at slot 0. Account B's prison at slot 5 is the row
-- both halves of the `create_prison()` pair collide with.
insert into public.prisons (id, owner_id, game_version, slot_index) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'lockstate-0.0.0', 0),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'lockstate-0.0.0', 5);

-- The whole client-visible answer to one `create_save_version()` call, as
-- one string. `GET STACKED DIAGNOSTICS` rather than `sqlerrm` alone because
-- `PG_EXCEPTION_DETAIL` is where the pre-fix `create_prison()` put the
-- foreign id, and a helper that could not see it would be blind to half of
-- what #343 reports.
--
-- Arguments other than the prison id are fixed and valid: revision 1 is
-- `current_revision + 1` for a fresh prison, the checksum is sixteen hex
-- characters (`prisons`/`save_versions` column bounds, 20260824101000), and
-- exactly one of payload/storage_path is supplied. So every difference
-- between two calls is the prison id and nothing else.
create function pg_temp.save_version_answer(p_prison_id uuid) returns text
language plpgsql as $$
declare
  v_status text;
  v_state text;
  v_message text;
  v_detail text;
begin
  select status into v_status from public.create_save_version(
    p_prison_id, 1, 1, 'aaaabbbbccccdddd', '{"probe":true}'::jsonb, null, 16);
  return 'status=' || v_status;
exception when others then
  get stacked diagnostics
    v_state = returned_sqlstate,
    v_message = message_text,
    v_detail = pg_exception_detail;
  return format('%s: %s [detail: %s]', v_state, v_message, coalesce(nullif(v_detail, ''), '<none>'));
end;
$$;

create function pg_temp.create_prison_answer(p_prison_id uuid, p_slot_index int) returns text
language plpgsql as $$
declare
  v_status text;
  v_state text;
  v_message text;
  v_detail text;
begin
  select status into v_status from public.create_prison(
    p_prison_id, 'lockstate-0.0.0', p_slot_index, null);
  return 'status=' || v_status;
exception when others then
  get stacked diagnostics
    v_state = returned_sqlstate,
    v_message = message_text,
    v_detail = pg_exception_detail;
  return format('%s: %s [detail: %s]', v_state, v_message, coalesce(nullif(v_detail, ''), '<none>'));
end;
$$;

-- --- #340: create_save_version() and a prison that is not yours ---------

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;

-- `dddddddd-…` exists nowhere yet.
select is(
  pg_temp.save_version_answer('dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  '42501: prison dddddddd-dddd-4ddd-8ddd-dddddddddddd is not available for save versions [detail: <none>]',
  'a prison id that does not exist is refused with a message that says nothing about existence'
);

reset role;

-- The same id now exists, owned by the *other* account. Nothing else about
-- the call changes -- same function, same arguments, same caller.
insert into public.prisons (id, owner_id, game_version, slot_index)
values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '22222222-2222-2222-2222-222222222222', 'lockstate-0.0.0', 1);

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;

select is(
  pg_temp.save_version_answer('dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  '42501: prison dddddddd-dddd-4ddd-8ddd-dddddddddddd is not available for save versions [detail: <none>]',
  'and once that prison exists owned by another account, the answer is byte-identical: the oracle is closed'
);

-- The two wordings the defect used, named explicitly so a future edit that
-- re-splits the branches fails here rather than in review.
--
-- Each is asserted against the probe that used to produce it, which matters
-- for the red proof: aimed at the wrong half, an assertion here passes
-- against the defect and proves nothing. "does not exist" was the answer for
-- an ABSENT row, so this probe names `eeeeeeee-…`, which is never inserted
-- anywhere in this suite; `dddddddd-…` is present by now and would have
-- produced the other wording.
select doesnt_match(
  pg_temp.save_version_answer('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
  'does not exist',
  'the refusal never reports non-existence: that wording was half of the #340 oracle'
);

-- "not authorized for prison X" was the answer for a row owned by somebody
-- else, so this one stays on `dddddddd-…`, which is now exactly that.
select doesnt_match(
  pg_temp.save_version_answer('dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  'not authorized',
  'nor the ownership wording that was the other half'
);

reset role;

-- Fails closed with no resolvable JWT subject, and lands on the SAME answer.
-- This is the assertion that guards the one subtle part of the fix: the
-- ownership check moved from `v_owner is distinct from auth.uid()` -- chosen
-- so a NULL identity could not make the comparison UNKNOWN and skip the
-- check -- into the lookup's WHERE clause, where a NULL `auth.uid()` makes
-- `owner_id = v_caller` UNKNOWN for every row instead. Same fail-closed
-- outcome, reached a different way, so it needs its own probe.
select set_config('request.jwt.claim.sub', '', true);
set local role authenticated;

select is(
  pg_temp.save_version_answer('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  '42501: prison aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa is not available for save versions [detail: <none>]',
  'a caller with no resolvable identity is refused for a real prison too, with the same answer'
);

reset role;

-- --- #340: the legitimate path still works -----------------------------

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;

select is(
  pg_temp.save_version_answer('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'status=created',
  'the owner can still create a save version on their own prison, with the status the union declares'
);

-- And the branch below the merged refusal is still reachable: the same call
-- again is the caller's own earlier attempt at the same revision.
select is(
  pg_temp.save_version_answer('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'status=idempotent_replay',
  'and the idempotent-replay branch below the refusal is still reached'
);

reset role;

-- --- #343: create_prison() and an id that is already taken -------------
--
-- `bbbbbbbb-…` is account B's prison, at slot 5. Both probes name it and ask
-- for slot 3, which neither account occupies, so both pass the
-- `at_slot_limit` and `slot_taken` guards and reach the insert. The only
-- difference between them is who is asking.

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;

select is(
  pg_temp.create_prison_answer('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 3),
  '42501: prison id bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb is not available [detail: <none>]',
  'an id belonging to another account is refused uniformly, with no constraint name and no DETAIL'
);

reset role;

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
set local role authenticated;

select is(
  pg_temp.create_prison_answer('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 3),
  '42501: prison id bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb is not available [detail: <none>]',
  'and the owner of that very row gets the byte-identical answer: the refusal does not depend on who asks'
);

-- The three fragments the raw `23505` carried. All asserted against the
-- OWNER's probe, so a fix that special-cased "yours" would fail here.
select doesnt_match(
  pg_temp.create_prison_answer('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 3),
  'duplicate key',
  'the refusal is not a raw constraint violation'
);

select doesnt_match(
  pg_temp.create_prison_answer('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 3),
  'already exists',
  'and it never says a row with that id already exists'
);

select doesnt_match(
  pg_temp.create_prison_answer('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 3),
  'prisons_pkey',
  'and it does not name the index it collided with'
);

reset role;

-- --- #343: the legitimate paths still work -----------------------------

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;

-- A fresh id at a free slot: the handler must not misfire on a call that
-- collides with nothing.
select is(
  pg_temp.create_prison_answer('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 2),
  'status=created',
  'a caller creating their own prison with a fresh id still succeeds, with the status the union declares'
);

-- Precedence is unchanged: account A occupies slot 0, so naming a colliding
-- id AND an occupied slot is still answered on the slot, never on the id.
-- The id refusal must stay below both owner-scoped guards -- a caller learns
-- less this way, not more.
select is(
  pg_temp.create_prison_answer('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 0),
  'status=slot_taken',
  'the owner-scoped slot_taken guard still takes precedence over the id refusal'
);

reset role;

select * from finish();
rollback;
