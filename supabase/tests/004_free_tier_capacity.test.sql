-- pgTAP tests for the database-tier bound on free-tier cloud-save capacity
-- (issue #57, ADR 0013): the slot cap, the per-save payload bound, the
-- distinguishable refusals, and the read-only degradation that must survive
-- both.
--
-- WHAT THIS SUITE IS FOR. Every other check in this repository asks "can
-- the wrong person touch this?". This one asks "can the *right* person
-- touch it without limit?" -- because with
-- `[auth] enable_anonymous_sign_ins = true` the `authenticated` role is
-- effectively anyone, so "the owner may do it" and "anyone may do it" are
-- the same sentence for anything that is not also bounded. Before ADR 0013
-- nothing here bounded slot count or payload size at all: the five-free-slots
-- rule lived only in src/services/entitlements/products.ts, which ADR 0008
-- classifies as untrusted, and `p_byte_size` was recorded rather than
-- enforced.
--
-- Two properties are asserted in every shape they can fail:
--
--   * the cap REFUSES, and refuses distinguishably -- SQLSTATE LS001/LS002
--     carrying the numbers, never an opaque constraint violation;
--   * the cap DEGRADES READ-ONLY -- an over-capacity account keeps every
--     prison it has, keeps listing them, keeps pulling them and keeps
--     saving to them. Only creating another slot is refused. That is what
--     docs/TRUSTED_SERVICES.md commits to and ADR 0008 threat T7 requires.
--
-- EXECUTED against the real Supabase local stack (`supabase db reset &&
-- supabase test db`, CLI 2.115.0) and against plain PostgreSQL via
-- `pnpm verify:sql`. Neither proves that GoTrue mints the identity these
-- checks read -- `auth.uid()` is fed here by `set_config` -- nor that
-- PostgREST turns SQLSTATE LS001 into a response a client can act on.
-- `pnpm verify:stack` (scripts/verify-supabase-stack.mjs) covers both.
--
-- The seven in "The absolute ceiling, and the clamp that applies it" have been
-- run only the plain-PostgreSQL way; the stack run needs container images that
-- were not reachable when they were written. `pnpm verify:sql` reports 33/33
-- for this suite -- a claim to check rather than a fact to trust.

begin;
select plan(33);

insert into auth.users (id, email) values
  ('55555555-5555-5555-5555-555555555555', 'free-tier@example.test'),
  ('66666666-6666-6666-6666-666666666666', 'paid-tier@example.test');

-- --- The capacity calculation itself ---------------------------------

select is(
  public.account_save_slot_capacity('55555555-5555-5555-5555-555555555555'),
  5,
  'an account with no entitlement row gets exactly the free tier, and the free tier is five'
);

select is(
  public.account_save_slot_capacity('00000000-0000-0000-0000-000000000000'),
  5,
  'an unknown account resolves to the free tier rather than to null, so the cap fails closed'
);

-- --- One statement cannot outrun a per-row count ----------------------
--
-- The bypass the application tier cannot see, and the reason this is the
-- first thing asserted: a BEFORE ROW trigger must observe the rows its own
-- statement has already inserted, or ten rows in one INSERT would sail past
-- a cap that refuses ten separate ones. It does, the sixth row raises, and
-- the whole statement rolls back. If that ever stops being true, this is
-- how it gets noticed.

select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
set local role authenticated;

select throws_ok(
  $$ insert into public.prisons (owner_id, game_version, slot_index)
     select '55555555-5555-5555-5555-555555555555', 'lockstate-0.0.0', g
     from generate_series(0, 9) as g $$,
  'LS001',
  null,
  'a single ten-row INSERT is refused: the count inside the trigger sees its own statement''s rows'
);

select is(
  (select count(*)::int from public.prisons where owner_id = '55555555-5555-5555-5555-555555555555'),
  0,
  'and it left nothing behind -- the refusal is atomic, not five-of-ten'
);

-- --- Five slots is ordinary use, not a refusal ------------------------

select lives_ok(
  $$ insert into public.prisons (owner_id, game_version, slot_index)
     select '55555555-5555-5555-5555-555555555555', 'lockstate-0.0.0', g
     from generate_series(0, 4) as g $$,
  'the owner creates five slots without hindrance -- the cap bounds abuse, not play'
);

select is(
  (select count(*)::int from public.prisons where owner_id = '55555555-5555-5555-5555-555555555555'),
  5,
  'five prisons exist'
);

-- --- The sixth is refused, distinguishably ----------------------------
--
-- `throws_ok` in its four-argument form: assert the SQLSTATE and leave the
-- message free. LS001 is a user-defined SQLSTATE class (the SQL standard
-- reserves classes beginning 0-4 and A-H; the rest are implementation
-- defined), chosen precisely so this is not confusable with 23514 "violates
-- check constraint" or with any Postgres-internal failure. A caller can act
-- on it, which is the whole requirement.

select throws_ok(
  $$ insert into public.prisons (owner_id, game_version, slot_index)
     values ('55555555-5555-5555-5555-555555555555', 'lockstate-0.0.0', 5) $$,
  'LS001',
  null,
  'a sixth slot is refused by the database, not by the client'
);

-- The same refusal through the front door, as a discriminated status
-- rather than an exception -- the shape create_save_version() already uses
-- for `conflict`, and the shape a UI needs to say "5 of 5 slots used".
select results_eq(
  $$ select status, prison_id, used_slots, capacity
       from public.create_prison(null, 'lockstate-0.0.0', 6, 'sixth') $$,
  $$ values ('at_slot_limit'::text, null::uuid, 5, 5) $$,
  'create_prison() reports the limit as a status carrying used/capacity, not as an opaque failure'
);

-- --- Over capacity degrades READ-ONLY ---------------------------------

select is(
  (select count(*)::int from public.prisons where owner_id = '55555555-5555-5555-5555-555555555555'),
  5,
  'at the ceiling, every existing prison is still listable'
);

select results_eq(
  $$ select status, revision from public.create_save_version(
       (select p.id from public.prisons p
         where p.owner_id = '55555555-5555-5555-5555-555555555555' and p.slot_index = 0),
       1, 1, 'checksum-at-ceiling', '{"tick": 0}'::jsonb, null, 10
     ) $$,
  $$ values ('created'::text, 1) $$,
  'at the ceiling, an existing prison is still saveable -- the cap blocks creating, never playing'
);

select is(
  (select count(*)::int from public.save_versions sv
     join public.prisons p on p.id = sv.prison_id
    where p.owner_id = '55555555-5555-5555-5555-555555555555'),
  1,
  'at the ceiling, that save is still pullable'
);

-- --- The payload bound ------------------------------------------------
--
-- Both cases are expressed in terms of public.max_save_payload_bytes()
-- rather than a literal, so approving a different figure in ADR 0013 stays
-- the one-line change it is meant to be. A jsonb string's text
-- representation is the string plus two quote characters, so `limit - 2`
-- characters land exactly on the limit and `limit` characters land two
-- bytes over it.

select lives_ok(
  $$ select * from public.create_save_version(
       (select p.id from public.prisons p
         where p.owner_id = '55555555-5555-5555-5555-555555555555' and p.slot_index = 1),
       1, 1, 'checksum-exactly-at-limit',
       to_jsonb(repeat('x', public.max_save_payload_bytes() - 2)), null, 10
     ) $$,
  'a payload of exactly the limit is accepted: the bound is inclusive, and the off-by-one is asserted rather than assumed'
);

select throws_ok(
  $$ select * from public.create_save_version(
       (select p.id from public.prisons p
         where p.owner_id = '55555555-5555-5555-5555-555555555555' and p.slot_index = 2),
       1, 1, 'checksum-over-limit',
       to_jsonb(repeat('x', public.max_save_payload_bytes())), null, 10
     ) $$,
  'LS002',
  null,
  'a payload two bytes over the limit is refused with its own SQLSTATE, distinct from the slot cap'
);

-- p_byte_size used to be recorded and never enforced, so it need not have
-- agreed with the payload at all: a row could claim ten bytes and hold ten
-- megabytes. It is measured server-side now and the claim is discarded.
select is(
  (select sv.byte_size from public.save_versions sv
     join public.prisons p on p.id = sv.prison_id
    where p.owner_id = '55555555-5555-5555-5555-555555555555'
      and sv.checksum = 'checksum-at-ceiling'),
  octet_length('{"tick": 0}'::jsonb::text),
  'byte_size is the measured size of the stored payload, not the size the caller claimed'
);

reset role;

-- --- Paid capacity comes from the server-authoritative projection ------
--
-- Granted through the real trusted path, as `service_role`, so this depends
-- on the same privileges a payment webhook would hold. Two distinct
-- occurred_at values because foldEntitlementEvents() and
-- recompute_entitlement_projection() both order by (occurred_at, event_id),
-- and a tie would be broken by a random uuid.

set local role service_role;
select lives_ok(
  $$ select * from public.record_entitlement_event(
       '66666666-6666-6666-6666-666666666666', 'product.save-slots.plus-5', 'save-slots', 'grant',
       'payment-webhook', 5, 'provider.test', 'evt-capacity-1', now() - interval '2 hours',
       'provider', 'provider.test', 'purchase-completed', null) $$,
  'the trusted path grants five additional slots'
);
reset role;

select is(
  public.account_save_slot_capacity('66666666-6666-6666-6666-666666666666'),
  10,
  'the cap reads paid capacity from the entitlements projection, so a purchase actually raises it'
);

select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', true);
set local role authenticated;

select lives_ok(
  $$ insert into public.prisons (owner_id, game_version, slot_index)
     select '66666666-6666-6666-6666-666666666666', 'lockstate-0.0.0', g
     from generate_series(0, 5) as g $$,
  'a paid account creates six slots where a free one could create five'
);

-- The limit branch is checked before the slot-collision branch, so this
-- case is only reachable for an account with capacity left -- which is why
-- it is asserted here rather than against the capped account above.
select results_eq(
  $$ select status, prison_id, used_slots, capacity
       from public.create_prison(null, 'lockstate-0.0.0', 0, 'duplicate') $$,
  $$ values ('slot_taken'::text, null::uuid, 6, 10) $$,
  'create_prison() distinguishes "that slot index is taken" from "you have no slots left"'
);

select results_eq(
  $$ select status, slot_index, used_slots, capacity
       from public.create_prison(null, 'lockstate-0.0.0', 7, 'seventh') $$,
  $$ values ('created'::text, 7, 7, 10) $$,
  'create_prison() creates the slot when capacity allows, and reports the resulting usage'
);

-- Deliberately a separate statement from the call above: the row the RPC
-- inserts is not visible to the snapshot of the statement that called it,
-- so folding these two into one query would assert NULL and look like a
-- broken function rather than a broken test.
select is(
  (select p.owner_id from public.prisons p where p.slot_index = 7),
  '66666666-6666-6666-6666-666666666666'::uuid,
  'create_prison() takes no owner argument: the row belongs to auth.uid(), so there is nothing to forge'
);

reset role;

-- --- Losing capacity never destroys data ------------------------------
--
-- The refund/chargeback/expiry case (ADR 0008 threat T7). The account holds
-- seven prisons and is about to be entitled to five.

set local role service_role;
select lives_ok(
  $$ select * from public.record_entitlement_event(
       '66666666-6666-6666-6666-666666666666', 'product.save-slots.plus-5', 'save-slots', 'revoke',
       'support-adjustment', 5, null, null, now() - interval '1 hour',
       'staff', 'staff.test', 'refund issued', null) $$,
  'the grant is revoked through the same ledger, as a compensating event'
);
reset role;

select is(
  public.account_save_slot_capacity('66666666-6666-6666-6666-666666666666'),
  5,
  'capacity falls back to the free tier once the grant is revoked'
);

select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', true);
set local role authenticated;

select is(
  (select count(*)::int from public.prisons where owner_id = '66666666-6666-6666-6666-666666666666'),
  7,
  'ALL SEVEN prisons survive the revocation: nothing is deleted, hidden or locked'
);

select results_eq(
  $$ select status, revision from public.create_save_version(
       (select p.id from public.prisons p
         where p.owner_id = '66666666-6666-6666-6666-666666666666' and p.slot_index = 5),
       1, 1, 'checksum-over-capacity', '{"tick": 7}'::jsonb, null, 11
     ) $$,
  $$ values ('created'::text, 1) $$,
  'an over-capacity account can still save an existing prison -- over-capacity is read-only degradation, not a lockout'
);

select throws_ok(
  $$ insert into public.prisons (owner_id, game_version, slot_index)
     values ('66666666-6666-6666-6666-666666666666', 'lockstate-0.0.0', 8) $$,
  'LS001',
  null,
  'and the one thing that is actually blocked is blocked: creating another slot'
);

reset role;

-- --- No identity, no slot ---------------------------------------------

select set_config('request.jwt.claim.sub', '', true);
set local role authenticated;

select throws_ok(
  $$ select * from public.create_prison(null, 'lockstate-0.0.0', 0) $$,
  '42501',
  null,
  'create_prison() fails closed without a resolvable identity, the same way create_save_version() does'
);

reset role;

-- --- The absolute ceiling, and the clamp that applies it --------------
--
-- ADR 0013 states capacity as `least(50, 5 + grantedSaveSlots)`, and
-- src/services/entitlements/products.ts calls the 50 "an absolute ceiling ...
-- applied to every computed capacity -- including one folded from a real server
-- ledger and one restored from a tampered local cache (threat T5)". The SQL is
-- the authoritative copy of that rule, and until now nothing asserted either
-- half of it: `max_save_slot_capacity()` appeared in this repository's suites
-- only in grant inventories (003) and declaration inventories (005), never its
-- value and never its effect. Both `max_save_slot_capacity 50 -> 999` and
-- deleting the `least()` from `account_save_slot_capacity()` left all 287
-- assertions green.
--
-- The section above already reads capacity at 5 and at 10, so what is missing
-- is the top: the number itself, and a capacity computation that the ceiling
-- has to bite on.

select is(
  public.max_save_slot_capacity(),
  50,
  'the absolute ceiling is 50, which is the figure ADR 0013 and MAX_TOTAL_SAVE_SLOTS both state'
);

insert into auth.users (id, email) values
  ('77777777-7777-7777-7777-777777777777', 'ceiling@example.test');

-- Through the real trusted path first, at the largest grant the ledger admits:
-- `entitlement_events_quantity_check` caps one event at 25, so 50 slots take
-- two events. `recompute_entitlement_projection()` clamps the *granted* half at
-- 45 (20260823090000:182), so this account's projection reads 45 and its
-- capacity reads 5 + 45 = 50 -- the two clamps meeting exactly, which is why
-- this assertion alone cannot tell them apart and the tampered projection below
-- is the one that can.
set local role service_role;
select lives_ok(
  $$ select * from public.record_entitlement_event(
       '77777777-7777-7777-7777-777777777777', 'product.save-slots.plus-5', 'save-slots', 'grant',
       'payment-webhook', 25, 'provider.test', 'evt-ceiling-1', now() - interval '4 hours',
       'provider', 'provider.test', 'purchase-completed', null) $$,
  'the trusted path grants the largest quantity one event may carry'
);
select lives_ok(
  $$ select * from public.record_entitlement_event(
       '77777777-7777-7777-7777-777777777777', 'product.save-slots.plus-5', 'save-slots', 'grant',
       'payment-webhook', 25, 'provider.test', 'evt-ceiling-2', now() - interval '3 hours',
       'provider', 'provider.test', 'purchase-completed', null) $$,
  'and a second event of the same size, so fifty slots have genuinely been granted'
);
reset role;

select is(
  (select (value ->> 'grantedSaveSlots')::int from public.entitlements
    where user_id = '77777777-7777-7777-7777-777777777777' and key = 'save-slots'),
  45,
  'the projection clamps the granted half at 45, so fifty granted slots are recorded as forty-five'
);

select is(
  public.account_save_slot_capacity('77777777-7777-7777-7777-777777777777'),
  50,
  'and capacity reads 50: five free plus the forty-five the projection kept'
);

-- The half the ledger cannot reach, and the one the ceiling exists for. ADR
-- 0008 threat T5 is a projection that is wrong -- a bug in the recompute, a
-- restore from a bad backup, a future writer that forgets the clamp -- and the
-- `least()` in `account_save_slot_capacity()` is what bounds the damage to this
-- number instead of to whatever the row says. Written directly rather than
-- through the ledger for exactly that reason: the ledger's own clamp would
-- otherwise be doing the work and this assertion would prove nothing about the
-- ceiling. Reproduced live at `{"grantedSaveSlots": 100000}`.
update public.entitlements
   set value = '{"grantedSaveSlots": 100000, "ledgerRevision": 99}'::jsonb
 where user_id = '77777777-7777-7777-7777-777777777777' and key = 'save-slots';

select is(
  (select (value ->> 'grantedSaveSlots')::int from public.entitlements
    where user_id = '77777777-7777-7777-7777-777777777777' and key = 'save-slots'),
  100000,
  'the projection now claims a hundred thousand slots, so the assertion below is not passing on a row that was already sane'
);

select is(
  public.account_save_slot_capacity('77777777-7777-7777-7777-777777777777'),
  50,
  'capacity is still 50: the ceiling is applied to every computed capacity, including one folded from a projection that is wrong (ADR 0008 T5)'
);

select * from finish();
rollback;
