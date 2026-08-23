-- Free-tier cloud-save capacity, bounded at the database tier (issue #57,
-- ADR 0013).
--
-- WHY THIS EXISTS. `supabase/config.toml` sets
-- `[auth] enable_anonymous_sign_ins = true` because anonymous auth is this
-- project's identity model (docs/CLOUD_SAVE.md). The consequence is easy to
-- lose sight of: the `authenticated` role is effectively "anyone who can
-- make an HTTP request", since a fresh identity costs one unauthenticated
-- call to /auth/v1/signup. Against that, nothing here bounded what a single
-- identity could store: `prisons_insert_own` caps *who* may insert, never
-- *how many*, and `create_save_version()` recorded `p_byte_size` without
-- ever checking it or the actual length of `p_payload` -- the two need not
-- even have agreed.
--
-- This is a capacity, cost and abuse concern, not a confidentiality one. No
-- data crosses an ownership boundary and every `auth.uid()` check that
-- protects one player's data from another is untouched by this migration.
--
-- WHAT IS DECIDED AND WHAT IS PROPOSED. The five-free-slots rule is an
-- existing, documented product decision (README.md,
-- src/services/entitlements/products.ts `BASE_SAVE_SLOTS`), as is the
-- absolute ceiling of 50 (`MAX_TOTAL_SAVE_SLOTS`). Enforcing them here is
-- not a new decision; it is making an existing rule authoritative in the
-- only tier that actually is. The per-save byte bound is NOT decided: ADR
-- 0013 proposes it pending human approval, which is why its number lives in
-- exactly one function below -- approving a different figure is a one-line
-- change, not a migration rewrite.
--
-- WHY A TRIGGER RATHER THAN "ONLY AN RPC". See ADR 0013 for the full
-- argument. In short: a `SECURITY DEFINER` create-slot RPC only bounds
-- anything once the direct `INSERT` path is closed, so the RPC alone makes
-- the cap contingent on a grant staying revoked, whereas the invariant
-- "an owner never holds more prisons than their capacity" is a property of
-- the table and belongs on every write path to it. Both exist here: the
-- trigger is the enforcement, and `create_prison()` is the front door that
-- answers with a discriminated status instead of an exception, the way
-- `create_save_version()` already answers a conflict.

-- --- The numbers, each in exactly one place ---------------------------
--
-- These are `immutable` so they inline into the callers below; changing a
-- figure is a `create or replace` of a single one-line function.

-- DECIDED. The free tier, per README.md and `BASE_SAVE_SLOTS`.
create or replace function public.base_save_slot_capacity() returns int
language sql immutable parallel safe
as $$ select 5 $$;

-- DECIDED. The absolute ceiling on any computed capacity, per
-- `MAX_TOTAL_SAVE_SLOTS`. recompute_entitlement_projection() already clamps
-- the *granted* half at 45; this clamps the total, so a bug or a hostile
-- event stream inflates capacity by at most this much and never without
-- bound.
create or replace function public.max_save_slot_capacity() returns int
language sql immutable parallel safe
as $$ select 50 $$;

-- PROPOSED, PENDING HUMAN APPROVAL (ADR 0013). 4 MiB per stored save
-- version. The largest tier in docs/PERSISTENCE.md's measured envelopes is
-- comfortably under this and a small prison is 66.0 KiB, so this is roughly
-- an order of magnitude of headroom over anything the game produces today
-- while still bounding the worst case a hostile client can force into a
-- single JSONB row. It is deliberately the only number in this file that a
-- reviewer is being asked to sign off on, and it is deliberately a lone
-- function so that signing off on a different figure costs one line.
--
-- It also interacts with the still-open JSONB-vs-Storage question
-- (docs/CLOUD_SAVE.md, "Storage placement"): a payload approaching this
-- bound is exactly the signal that the Storage path is needed, and this
-- bound is not a substitute for deciding that threshold.
create or replace function public.max_save_payload_bytes() returns int
language sql immutable parallel safe
as $$ select 4194304 $$;

-- --- Capacity for one account ----------------------------------------
--
-- Read from `public.entitlements`, the server-authoritative projection
-- recomputed from the append-only ledger -- never from anything the client
-- sends. ADR 0008 §4: "the server re-checks at the point of effect", and a
-- projection the client can only read is the only capacity input allowed to
-- count here.
--
-- SECURITY DEFINER so the answer does not depend on the RLS visibility of
-- whatever role happens to be inserting, and EXECUTE is revoked from all
-- four roles below: the only callers are the trigger and the RPC in this
-- file, both of which reach it as the owning role. A client that wants to
-- know its own capacity reads `entitlements` directly under its own policy.
--
-- `jsonb_typeof(...) = 'number'` makes a malformed projection fail closed to
-- the free tier rather than raising `22P02` in the middle of an insert.
create or replace function public.account_save_slot_capacity(p_user_id uuid) returns int
language sql stable security definer
set search_path = public, pg_temp
as $$
  select least(
    public.max_save_slot_capacity(),
    public.base_save_slot_capacity() + coalesce((
      select greatest(0, (e.value ->> 'grantedSaveSlots')::int)
      from public.entitlements e
      where e.user_id = p_user_id
        and e.key = 'save-slots'
        and jsonb_typeof(e.value -> 'grantedSaveSlots') = 'number'
    ), 0)
  )
$$;

revoke all on function public.account_save_slot_capacity(uuid)
  from public, anon, authenticated, service_role;

-- The three constants are readable by a signed-in client and by nobody
-- else. They are already published in README.md and
-- src/services/entitlements/products.ts, so this reveals nothing, and it
-- buys something real: a client can ask the server what the limit is and
-- say "this save is too large" before spending a 4 MiB upload finding out.
-- That is ADR 0008's own shape -- the UI is the convenience, the server is
-- the check -- and it is why `account_save_slot_capacity(uuid)` above is
-- NOT in this list: it takes another account's id and would answer for it.
revoke all on function public.base_save_slot_capacity() from public, anon, service_role;
revoke all on function public.max_save_slot_capacity() from public, anon, service_role;
revoke all on function public.max_save_payload_bytes() from public, anon, service_role;
grant execute on function public.base_save_slot_capacity() to authenticated;
grant execute on function public.max_save_slot_capacity() to authenticated;
grant execute on function public.max_save_payload_bytes() to authenticated;

-- --- The slot cap -----------------------------------------------------
--
-- A CHECK constraint cannot count sibling rows, so the invariant "an owner
-- holds at most `account_save_slot_capacity(owner)` prisons" has to be a
-- trigger. It fires on INSERT, and on an UPDATE that moves a row to another
-- owner -- no client role holds an UPDATE grant on `owner_id` (see the
-- prisons migration), so the second is defence in depth against a future
-- grant rather than a live path.
--
-- THE COUNT IS TAKEN UNDER A LOCK. "Count, then insert" is a race: two
-- concurrent inserts at the fifth slot both read four and both succeed. The
-- transaction-scoped advisory lock is keyed on the owner, so it serializes
-- only that account's slot creations and leaves every other account
-- unaffected -- the same shape as `create_save_version()`'s `SELECT ... FOR
-- UPDATE` on one prison row. There is no row to lock here, because the row
-- that would conflict does not exist yet.
--
-- WHAT IT DELIBERATELY DOES NOT DO. It never fires on SELECT, UPDATE of
-- metadata, DELETE, or on `create_save_version()`. An account that ends up
-- over capacity -- a refund, a chargeback, an expiring grant -- keeps every
-- prison it has, keeps listing them, keeps pulling them and keeps saving to
-- them. Only *creating* another slot is blocked. That is the same
-- degradation `docs/TRUSTED_SERVICES.md` commits to for entitlements, and
-- ADR 0008 threat T7 says so explicitly: over-capacity degrades read-only,
-- never deletes saves.
create or replace function public.enforce_prison_slot_capacity()
returns trigger
language plpgsql
security definer
-- `pg_temp` explicitly last; see submit_challenge_evidence() for why every
-- SECURITY DEFINER function in this schema spells it out.
set search_path = public, pg_temp
as $$
declare
  v_capacity int;
  v_used int;
begin
  -- An UPDATE that leaves the owner alone consumes no new capacity, and
  -- counting here would include the row itself and refuse an account that
  -- is exactly at its limit.
  if tg_op = 'UPDATE' and new.owner_id = old.owner_id then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text, 0));

  v_capacity := public.account_save_slot_capacity(new.owner_id);
  select count(*) into v_used from public.prisons p where p.owner_id = new.owner_id;

  if v_used >= v_capacity then
    raise exception 'save slot limit reached: % of % slots are in use', v_used, v_capacity
      using errcode = 'LS001',
            detail = format('used_slots=%s capacity=%s', v_used, v_capacity),
            hint = 'Existing prisons stay listable, pullable and playable; only creating another slot is blocked.';
  end if;

  return new;
end;
$$;

drop trigger if exists prisons_enforce_slot_capacity on public.prisons;
create trigger prisons_enforce_slot_capacity
  before insert or update of owner_id on public.prisons
  for each row execute function public.enforce_prison_slot_capacity();

-- --- The per-save payload bound ---------------------------------------
--
-- Same reasoning about placement: `create_save_version()` is the only write
-- path to `save_versions` today, but the bound is a property of the row, so
-- it lives with the row and holds for any future path (a backfill, an
-- admin tool, a Storage-backed writer) without anyone having to remember it.
--
-- IT ALSO CLOSES THE `p_byte_size` LIE. The column used to record whatever
-- the caller claimed, which need not have matched the payload at all. For a
-- JSONB-backed version the trigger now *measures* the stored bytes and
-- overwrites the claim, so the column is a fact rather than an assertion,
-- and the bound is applied to the measurement rather than to the claim. A
-- Storage-backed row has nothing to measure here, so its `byte_size` stays
-- the caller's figure and is bounded as such -- which is one more reason
-- the JSONB-vs-Storage threshold (docs/CLOUD_SAVE.md) needs deciding.
create or replace function public.enforce_save_version_size()
returns trigger
language plpgsql
-- No SECURITY DEFINER: this function touches nothing but NEW, so it needs
-- no privilege the writer does not already have.
set search_path = public, pg_temp
as $$
declare
  v_limit int := public.max_save_payload_bytes();
  v_measured int;
begin
  if new.payload is not null then
    v_measured := octet_length(new.payload::text);
    new.byte_size := v_measured;
  else
    v_measured := new.byte_size;
  end if;

  if v_measured > v_limit then
    raise exception 'save payload is % bytes; the limit is % bytes', v_measured, v_limit
      using errcode = 'LS002',
            detail = format('byte_size=%s limit=%s', v_measured, v_limit),
            hint = 'Existing versions are unaffected; only this upload is refused.';
  end if;

  return new;
end;
$$;

drop trigger if exists save_versions_enforce_size on public.save_versions;
create trigger save_versions_enforce_size
  before insert on public.save_versions
  for each row execute function public.enforce_save_version_size();

-- A claimed size can no longer be negative either. This one *can* be a
-- CHECK, because it looks at a single row.
alter table public.save_versions
  add constraint save_versions_byte_size_non_negative check (byte_size >= 0);

-- --- The front door ---------------------------------------------------
--
-- `create_prison()` is to slot creation what `create_save_version()` is to
-- saving: the trusted entry point that performs the capacity re-check ADR
-- 0008 §4 requires at the point of effect, and answers with a discriminated
-- `status` rather than an exception.
--
-- WHY A STATUS AND NOT ONLY AN ERROR. "You are at your slot limit" is a
-- normal, expected, actionable outcome -- the same class of thing as the
-- `conflict` status `create_save_version()` already returns -- and the sync
-- engine and UI have to tell it apart from "something broke". The trigger's
-- `LS001` is distinguishable too (PostgREST surfaces the SQLSTATE as
-- `code`), but a status is the contract a caller should be written against,
-- and the numbers that come back with it -- `used_slots` and `capacity` --
-- are what a "4 of 5 slots used, buy more?" surface needs.
--
-- The trigger still fires underneath this function. That is deliberate
-- redundancy, not an oversight: it is what makes the invariant true of the
-- table rather than true of one caller.
--
-- `p_prison_id` is caller-supplied so a client can create the cloud slot
-- with the prison id its local repository already uses; passing null lets
-- the database generate one.
create or replace function public.create_prison(
  p_prison_id uuid,
  p_game_version text,
  p_slot_index int,
  p_display_name text default null
) returns table (
  status text, -- 'created' | 'at_slot_limit' | 'slot_taken'
  prison_id uuid,
  slot_index int,
  used_slots int,
  capacity int
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_capacity int;
  v_used int;
  v_new_id uuid;
begin
  -- SECURITY DEFINER bypasses RLS, so this explicit check is the only thing
  -- standing between a caller and the `prisons` table -- exactly the rule
  -- create_save_version() follows. There is no `p_owner_id` parameter at
  -- all: the owner is the JWT subject and nothing else, so there is no
  -- argument to forge.
  if v_owner is null then
    raise exception 'an authenticated identity is required to create a prison' using errcode = '42501';
  end if;
  if p_slot_index is null or p_slot_index < 0 then
    raise exception 'slot_index must be a non-negative integer';
  end if;

  -- Same lock, same key and the same reason as the trigger: without it two
  -- concurrent calls at the last free slot both count one short.
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 0));

  v_capacity := public.account_save_slot_capacity(v_owner);
  -- Every column reference below is table-qualified. `prison_id`,
  -- `slot_index` and `capacity` are OUT parameter names from the `returns
  -- table (...)` above, and PL/pgSQL resolves an unqualified reference to
  -- the variable -- the `42702 column reference "revision" is ambiguous`
  -- defect that made create_save_version() fail on every call.
  select count(*) into v_used from public.prisons p where p.owner_id = v_owner;

  if v_used >= v_capacity then
    return query select 'at_slot_limit'::text, null::uuid, p_slot_index, v_used, v_capacity;
    return;
  end if;

  if exists (select 1 from public.prisons p where p.owner_id = v_owner and p.slot_index = p_slot_index) then
    return query select 'slot_taken'::text, null::uuid, p_slot_index, v_used, v_capacity;
    return;
  end if;

  insert into public.prisons (id, owner_id, game_version, display_name, slot_index)
  values (coalesce(p_prison_id, gen_random_uuid()), v_owner, p_game_version, p_display_name, p_slot_index)
  returning public.prisons.id into v_new_id;

  return query select 'created'::text, v_new_id, p_slot_index, v_used + 1, v_capacity;
end;
$$;

-- Explicit revoke-then-grant, spelled the same way as
-- create_save_version(): never rely on a function's default PUBLIC EXECUTE,
-- and name `anon` and `service_role` as well as PUBLIC, because a revoke
-- from PUBLIC does not take away a role's own default grant on a project
-- created before Supabase stopped auto-exposing new entities.
--
-- `service_role` gets nothing for the same reason it gets nothing on
-- create_save_version(): a cloud save is client-authoritative state (ADR
-- 0008's authority table), and this function derives its authorization from
-- auth.uid(), which a trusted caller does not have.
revoke all on function public.create_prison(uuid, text, int, text)
  from public, anon, service_role;
grant execute on function public.create_prison(uuid, text, int, text) to authenticated;
