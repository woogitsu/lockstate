-- `create_save_version()` and `create_prison()` stop answering the question
-- `prisons_select_own` refuses to answer: whether a given prison id exists
-- on a row the caller does not own (issues #340 and #343).
--
-- Both are the defect `20260824110100_close_challenge_definition_oracle.sql`
-- removed from `submit_challenge_evidence()`, in the two other SECURITY
-- DEFINER entry points `authenticated` can reach. That migration closed the
-- class for challenge definitions and the same reasoning was never carried
-- across; `20260822190300`'s own privilege block (`:163-169`) names this
-- oracle in `create_save_version()` and closed it by revoking `anon`, which
-- removes one role from the caller set and nothing else. With
-- `[auth] enable_anonymous_sign_ins = true` in `supabase/config.toml` and
-- ADR 0013's Context recording that `authenticated` is therefore
-- "effectively 'anyone who can make an HTTP request'", the prober that
-- comment describes is one `/auth/v1/signup` call away from being inside
-- the privilege boundary the comment relies on. The boundary does not
-- belong only at the privilege check; it belongs in the shape of the
-- refusal.
--
-- WHAT WAS WRONG, by execution, against the schema `pnpm verify:sql` builds
-- (PostgreSQL 16.13 + pgTAP 1.3.2, ten suites, 268 assertions green before
-- this file). Two seeded accounts; every probe as `authenticated` with
-- `select current_user, auth.uid()` read back as
-- `authenticated | 11111111-…`. Prison `bbbbbbbb-…` exists and is owned by
-- account `22222222-…`; prison `aaaaaaaa-…` is the prober's own;
-- `cccccccc-…` exists nowhere. Each probe was run through a helper that
-- captures the whole client-visible answer -- SQLSTATE, message and the
-- `DETAIL` field PostgREST surfaces as `details` -- rather than only the
-- line psql prints:
--
--   create_save_version, foreign prison  -> 42501 'not authorized for prison bbbbbbbb-…'      DETAIL <none>
--   create_save_version, absent prison   -> P0001 'prison cccccccc-… does not exist'          DETAIL <none>
--   create_prison, foreign id            -> 23505 'duplicate key value violates unique
--                                                  constraint "prisons_pkey"'                 DETAIL 'Key (id)=(bbbbbbbb-…) already exists.'
--   create_prison, own existing id       -> 23505 same message                                DETAIL 'Key (id)=(aaaaaaaa-…) already exists.'
--   create_prison, fresh id              -> status = 'created'
--
-- #340 is the first pair: two messages and two SQLSTATEs, so a caller who
-- holds an id learns whether it is a live prison belonging to somebody else.
-- #343 is the third row against the fifth: the collision escapes the status
-- union entirely as a raw `23505`, and the id arrives echoed in a `DETAIL`
-- field -- which is where a foreign uuid ends up in a log line next to the
-- account that probed for it, exactly the thing `20260824110200:228-231`
-- declines to do for `LS004`.
--
-- Both are CONFIRMATION oracles rather than discovery oracles, and stating
-- that keeps the fix proportionate: `prisons.id` is `uuid`, and since #338
-- the producer mints `crypto.randomUUID()`, so 122 random bits are not
-- enumerable. What they answer is "this id in my hand is a live prison that
-- is not mine", which is precisely the fact `prisons_select_own` exists to
-- withhold. Neither leaks row *content*: the same sessions' direct
-- `select count(*) from public.prisons` returned 1 (the caller's own) and a
-- foreign `delete` removed nothing. What crossed the boundary was existence.
--
-- WHAT THIS CHANGES.
--
-- `create_save_version()`: the lookup applies `prisons_select_own`'s own
-- predicate -- `owner_id = auth.uid()` -- so "no such prison" and "a prison
-- exists that is not yours" stop being two states the function can be in.
-- There is one `not found`, and therefore one `raise`. The two branches are
-- not merely reworded to match: they are gone, which is the difference
-- `20260824110100` insists on, because two statements sharing a wording are
-- one careless edit away from drifting apart.
--
--   42501 'prison % is not available for save versions'
--
-- `create_prison()`: the unique violation is caught and turned into one
-- refusal that says the same thing whoever owns the colliding row.
--
--   42501 'prison id % is not available'
--
-- WHY THE HANDLER AND NOT A PRE-CHECK, which is the shape #343 proposes
-- (`if exists (select 1 from public.prisons p where p.id = p_prison_id)`,
-- under the advisory lock the function already holds). A pre-check would be
-- a *second* place that produces this answer, and the whole point of
-- `20260824110100:190-195` is that "the way to make two answers identical
-- forever is for there to be one answer". Handler-only leaves exactly one
-- `raise` for this outcome, reached by every colliding call.
--
-- It is also the only one of the two that is correct here, and that is not
-- the usual relationship. `20260824110000:162-171` describes a pre-check
-- plus a handler where "the lock is the fast path; the handler is the
-- correct one", because its advisory lock is keyed on the dedup key and so
-- serializes the callers that could collide. This function's lock is keyed
-- on `v_owner` (`hashtextextended(v_owner::text, 0)`), and a primary-key
-- collision is by definition **cross-owner** in the interesting case: two
-- callers racing the same id take two *different* advisory locks, both
-- pass any pre-check, and one of them lands on the index regardless. A
-- pre-check would therefore have been a fast path for the case that does
-- not matter and no path at all for the case that does.
--
-- THE SECOND-ORDER PROBLEM, stated because a uniform refusal is easy to get
-- wrong in a way that moves an oracle instead of closing it: the refusal
-- for "this id belongs to another account" must be indistinguishable from
-- the refusal for the caller's *own* duplicate, or the fix hands back the
-- same bit through a new door. Three things make them one answer here, and
-- the third is the one that actually settles it:
--
--   1. One `raise` statement, reached from one handler, so there is no
--      second wording to keep in step.
--   2. The handler never looks at `owner_id`. It reads `CONSTRAINT_NAME`
--      from the diagnostics and nothing else, so ownership is not a value
--      the branch can be taken on.
--   3. The message interpolates only `p_prison_id` -- a value the caller
--      supplied in the call it is being answered about, which is
--      `20260824110100:197`'s reasoning: repeating a caller's own argument
--      back to it discloses nothing. No `DETAIL` is attached, so the
--      structured field the id used to arrive in is now empty.
--
-- Asserted rather than argued:
-- supabase/tests/011_refusal_indistinguishability.test.sql compares the whole
-- client-visible answer -- SQLSTATE, message text and `DETAIL` together --
-- between the foreign-row probe and the absent-row probe for
-- `create_save_version()`, and between the foreign-id probe and the
-- own-id probe for `create_prison()`, and requires them equal. A test that
-- only checked the SQLSTATE would have passed against `create_prison()`
-- *before* this migration, since both `23505`s already agreed; the message
-- and the `DETAIL` are where they differed.
--
-- WHY `42501` FOR BOTH, and not a new `LS0xx`. `20260824110100` sets the
-- rule: giving the merged branch its own SQLSTATE "would hand a prober a
-- machine-readable marker for the branch whose whole purpose is to be
-- uninformative", and `LS001`-`LS004` exist because a legitimate client has
-- to act differently on them. `42501` is already what both functions raise
-- for "no", so the merged refusal adds no new marker at all -- it lands on
-- the code `create_save_version()`'s authorization branch already used and
-- the code `create_prison()` already uses for a missing identity. Collapsing
-- onto the *more* specific of #340's two codes is also what keeps a
-- legitimate caller able to tell "not yours" from a validation error.
--
-- WHY `create_prison()` RAISES INSTEAD OF RETURNING AN `id_taken` STATUS,
-- which is what #343 asks for. Stated plainly because it is a deliberate
-- departure from the issue rather than an oversight:
--
--   * The status union is a CROSS-SURFACE contract, not a SQL-local one.
--     `tests/foundation/rpc-status-vocabulary-contract.test.ts` asserts, in
--     both directions, that the statuses this body can return are exactly
--     the statuses `CreatePrisonRow` declares in
--     `src/persistence/cloud/supabase-client.ts`. A fourth status in this
--     file alone fails that gate -- correctly, and that is the gate working
--     as designed. #343 says as much: "the client branch ships with it".
--     Shipping the SQL half alone would either break the gate or require
--     editing a client this change is not scoped to touch.
--   * The security defect does not need it. An exception already closes the
--     oracle; the status is an *ergonomics* improvement, letting
--     `PrisonSyncEngine` tell "this will never work" from "the connection
--     dropped" instead of bucketing both as `{ status: 'error' }`.
--   * A legitimate caller has a legitimate way to get the answer. #343's own
--     first bullet says it: "a caller that wants to know whether it already
--     registered its own prison reads `prisons` under its own policy, where
--     the answer is legitimate."
--
-- So the oracle closes here and the fourth status remains open work, with
-- the SQL and the client landing together. The status would be a *widening*
-- of what this function tells a caller and is safe to add later; nothing
-- in this file has to be revisited to add it.
--
-- WHAT IS DELIBERATELY STILL DISTINGUISHABLE, and why it is not the finding
-- reappearing.
--
--   * `create_prison()` still refuses a colliding id rather than pretending
--     to succeed, so a caller still learns that *some* row holds the id it
--     named. That is not closable while `prisons.id` is a global primary key
--     and the id is caller-supplied -- and both are deliberate
--     (`20260823100000:264-266`: "so a client can create the cloud slot with
--     the prison id its local repository already uses"; ADR 0016-era
--     local-first reasoning is recorded in docs/CLOUD_SAVE.md). What is
--     closed is everything above that floor: whose row it is, the
--     constraint name, and the `DETAIL` echo.
--   * `create_prison()` still answers `at_slot_limit` and `slot_taken`
--     before it reaches the insert, and both are computed purely from rows
--     `owner_id = v_owner` -- the caller's own. Their precedence over the id
--     refusal is unchanged, which is why
--     supabase/tests/004_free_tier_capacity.test.sql's existing
--     `slot_taken` and `at_slot_limit` assertions still hold: a caller at
--     its limit, or naming a slot it already occupies, is answered on that
--     basis and never reaches the collision at all. Less information, not
--     more.
--   * `create_save_version()`'s `conflict` status still reports
--     `current_revision`, `current_version_id` and the current checksum --
--     now only ever for a prison the caller owns, since the branch is
--     unreachable for any other row.
--   * A `prisons_owner_slot_unique` violation is RE-RAISED unchanged rather
--     than folded into the merged refusal. That constraint is
--     `(owner_id, slot_index)`, so it can only ever be violated by the
--     caller's own rows and its `DETAIL` names the caller's own owner id and
--     slot -- nothing foreign. Folding it in would report "id not available"
--     for a write refused for an unrelated reason, which is the mistake
--     `20260824110000:315-320` names when it declines to answer `duplicate`
--     on a second pass. Discriminating on `CONSTRAINT_NAME` rather than on
--     SQLSTATE alone is what keeps the two apart, and it matters because
--     `prisons` carries two unique constraints, not one.
--
-- RESIDUAL RISK, recorded rather than left to be discovered. The
-- `select … for update` in `create_save_version()` now filters on
-- `owner_id`, so it takes no lock on a foreign row -- which removes a
-- side channel `20260822190300:163-169` had noticed and left open ("only
-- after taking a `SELECT ... FOR UPDATE` row lock"). A blocking-time
-- channel through `create_prison()`'s advisory lock remains in principle,
-- since that lock is keyed on the caller's own owner id; it is not
-- introduced here and is not reachable by naming a foreign prison.
--
-- WHY BOTH FUNCTIONS IN ONE MIGRATION. They are one defect with one
-- remedy, reported as two issues because they are two functions. Landing
-- them apart would leave the repository asserting the merged answer for one
-- entry point while the other still distinguishes, and a reviewer of either
-- half would have to reconstruct the other to judge it.
--
-- Both bodies are reproduced IN FULL and otherwise unedited -- the
-- validation, the advisory lock, the row lock, the idempotency lookup, the
-- conflict branch, the capacity and slot checks and every status -- so this
-- file is the whole current definition of each function rather than a diff
-- a reader has to apply, which is the convention `20260824110100` follows.
-- The only changes are the ones described above.
--
-- NO DATA MIGRATES. Two function bodies and two message strings. `prisons`
-- and `save_versions` are untouched, no constraint is added or validated,
-- and no privilege changes -- the REVOKE/GRANT pairs at the end of each
-- section restate the existing ACL rather than altering it.
--
-- EXECUTED against plain PostgreSQL 16.13 + pgTAP 1.3.2 via
-- `pnpm verify:sql`. NOT executed against the real Supabase local stack or
-- a hosted project; see docs/CLOUD_SAVE.md, "What has and has not been
-- executed".

-- --- create_save_version(): one answer for a prison that is not yours ---

create or replace function public.create_save_version(
  p_prison_id uuid,
  p_new_revision int,
  p_save_schema_version int,
  p_checksum text,
  p_payload jsonb,
  p_storage_path text,
  p_byte_size int
) returns table (
  -- Unchanged at three values, and deliberately so: `20260822190300:46-52`
  -- records that `SupabaseCloudSaveClient.uploadVersion` switches over them
  -- exhaustively with no default, so a status added here alone is a silent
  -- `undefined` in the client. The refusal below is an exception for that
  -- reason among others.
  status text, -- 'created' | 'conflict' | 'idempotent_replay'
  version_id uuid,
  revision int,
  checksum text
)
language plpgsql
security definer
-- `pg_temp` explicitly last, as in every SECURITY DEFINER function in this
-- schema; 20260823090100:207-215 carries the full argument and
-- supabase/tests/005_function_security_declarations.test.sql is what fails
-- if it is dropped or reordered.
set search_path = public, pg_temp
as $$
declare
  -- Resolved once, into a local, so the lookup below compares every
  -- candidate row against one value rather than re-entering `auth.uid()`
  -- per row. `auth.uid()` is STABLE, so this is a readability choice and
  -- not a correctness one.
  --
  -- `v_owner` is gone. It existed only to be compared against `auth.uid()`
  -- one statement after it was read, and that comparison has moved into the
  -- lookup's own WHERE clause -- which is the entire fix. Keeping the
  -- variable would leave a reader looking for the ownership check that used
  -- to follow it.
  v_caller uuid := auth.uid();
  v_current_revision int;
  v_current_version_id uuid;
  v_current_checksum text;
  v_new_version_id uuid;
  v_existing_id uuid;
begin
  -- Argument validation first, and unchanged. Both of these are decided
  -- from the arguments alone, so they are reached identically whatever
  -- prison was named -- a prober sending malformed arguments learns nothing
  -- about `p_prison_id` from either.
  if p_new_revision <= 0 then
    raise exception 'revision must be positive';
  end if;
  if (p_payload is null) = (p_storage_path is null) then
    raise exception 'exactly one of payload/storage_path is required';
  end if;

  -- Row lock serializes concurrent calls for the SAME prison so the
  -- idempotency check and the conflict check below cannot race with
  -- another call for this prison; calls for other prisons are unaffected.
  --
  -- THE `owner_id` PREDICATE IS THE FIX FOR #340. It is
  -- `prisons_select_own`'s own expression (`auth.uid() = owner_id`,
  -- 20260822190100:30-32), applied by hand because this function is
  -- SECURITY DEFINER and therefore exempt from the policy -- the same
  -- structural duplication `20260824110100` explains for the challenge read
  -- policy, and for the same reason: there is no way to make a row-
  -- visibility rule apply to a function running as the table's owner, and a
  -- `security_invoker` view does not help because inside a definer function
  -- the invoker *is* the owner.
  --
  -- A prison this caller could not have SELECTed is a prison this function
  -- must behave as if it had never heard of. Filtering here rather than
  -- comparing afterwards is what makes that true of the function's
  -- *behaviour* and not just of its wording: there is no state in which the
  -- row was found but rejected, so there is nothing for a second message to
  -- describe.
  --
  -- IT ALSO FAILS CLOSED ON A NULL IDENTITY, which is what the old
  -- `v_owner is distinct from auth.uid()` was chosen for (`<>` would make
  -- the condition UNKNOWN and skip the check). With no resolvable JWT
  -- subject `v_caller` is NULL, `owner_id = v_caller` is UNKNOWN for every
  -- row including the caller's own, the lookup finds nothing, and the
  -- refusal below fires. Same outcome, one fewer branch.
  --
  -- And it takes no lock on a row the caller does not own: an unqualified
  -- `for update` locked the foreign row first and refused second, which
  -- `20260822190300:163-169` noticed and left in place.
  select current_revision, current_version_id
    into v_current_revision, v_current_version_id
  from public.prisons
  where id = p_prison_id
    and owner_id = v_caller
  for update;

  -- ONE `raise` FOR BOTH CASES, deliberately: "no such prison" and "a
  -- prison exists that is not yours" must be indistinguishable, and the way
  -- to make two answers identical forever is for there to be one answer.
  -- The message says nothing about existence in either direction and echoes
  -- back only the id the caller itself supplied.
  if not found then
    raise exception 'prison % is not available for save versions', p_prison_id
      using errcode = '42501';
  end if;

  -- Everything from here down is reachable only for a prison this caller
  -- owns, and is unchanged from 20260822190300.
  --
  -- Table-qualified on purpose: `revision` and `checksum` are also OUT
  -- parameter names from this function's `returns table (...)`, and
  -- PL/pgSQL resolves an unqualified reference to the variable, raising
  -- `42702 column reference "revision" is ambiguous` at runtime. Without
  -- the alias this statement -- which runs on every call, before any
  -- branch -- makes the function fail outright.
  --
  -- Matching on the revision as well as the checksum is what keeps a replay
  -- honest: the row returned is the caller's own earlier attempt at this
  -- exact revision, so the reported revision is p_new_revision by
  -- construction. A row at this revision holding *different* content is not
  -- a replay at all -- it falls through to the conflict branch below, which
  -- is the correct answer, since someone else's save already occupies it.
  select sv.id into v_existing_id
  from public.save_versions sv
  where sv.prison_id = p_prison_id
    and sv.revision = p_new_revision
    and sv.checksum = p_checksum;

  if found then
    return query select 'idempotent_replay'::text, v_existing_id, p_new_revision, p_checksum;
    return;
  end if;

  if p_new_revision <> v_current_revision + 1 then
    select sv.checksum into v_current_checksum
    from public.save_versions sv
    where sv.id = v_current_version_id;

    return query select 'conflict'::text, v_current_version_id, v_current_revision, v_current_checksum;
    return;
  end if;

  insert into public.save_versions (prison_id, revision, save_schema_version, checksum, payload, storage_path, byte_size)
  values (p_prison_id, p_new_revision, p_save_schema_version, p_checksum, p_payload, p_storage_path, p_byte_size)
  returning id into v_new_version_id;

  update public.prisons
    set current_version_id = v_new_version_id,
        current_revision = p_new_revision,
        updated_at = now()
  where id = p_prison_id;

  return query select 'created'::text, v_new_version_id, p_new_revision, p_checksum;
end;
$$;

-- Privileges restated rather than assumed, as everywhere else in this
-- schema: `create or replace function` preserves the ACL, and a reader of
-- this file should not have to open an earlier migration to learn who may
-- call it. Unchanged: `authenticated` only. `anon` and `service_role` are
-- named alongside PUBLIC because a revoke from PUBLIC does not remove a
-- role's own default grant on a project created before Supabase stopped
-- auto-exposing new entities in `public`.
--
-- The revoke is no longer load-bearing against the oracle
-- `20260822190300:163-169` described -- the refusal itself is now uniform,
-- so an `anon` caller who reached this function would learn nothing from it
-- either. It stays because `anon` still has no business advancing a cloud
-- save, and `service_role` still gets nothing because a cloud save is
-- client-authoritative state (ADR 0008's authority table) and this function
-- derives its authorization from `auth.uid()`, which a trusted caller does
-- not have. supabase/tests/003_data_api_grants.test.sql pins that.
revoke all on function public.create_save_version(uuid, int, int, text, jsonb, text, int)
  from public, anon, service_role;
grant execute on function public.create_save_version(uuid, int, int, text, jsonb, text, int) to authenticated;

-- --- create_prison(): one answer for an id that is already taken ---

create or replace function public.create_prison(
  p_prison_id uuid,
  p_game_version text,
  p_slot_index int,
  p_display_name text default null
) returns table (
  -- Still three, for the reason set out in this file's header: a fourth
  -- status is a cross-surface contract that
  -- tests/foundation/rpc-status-vocabulary-contract.test.ts checks against
  -- `CreatePrisonRow`, and it has to land with the client branch that
  -- handles it. The id collision is answered with an exception here.
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
  -- Which unique index the insert actually violated. `prisons` has two --
  -- `prisons_pkey` on `(id)` and `prisons_owner_slot_unique` on
  -- `(owner_id, slot_index)` (20260822190100:23) -- so `unique_violation`
  -- alone does not say which invariant was broken, and only one of them is
  -- the oracle being closed.
  v_constraint text;
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
  --
  -- Note what it does NOT serialize, since the handler below depends on it:
  -- the key is this owner's id, so two callers from two accounts racing the
  -- same `p_prison_id` take two different locks and both reach the insert.
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 0));

  v_capacity := public.account_save_slot_capacity(v_owner);
  -- Every column reference below is table-qualified. `prison_id`,
  -- `slot_index` and `capacity` are OUT parameter names from the `returns
  -- table (...)` above, and PL/pgSQL resolves an unqualified reference to
  -- the variable -- the `42702 column reference "revision" is ambiguous`
  -- defect that made create_save_version() fail on every call.
  select count(*) into v_used from public.prisons p where p.owner_id = v_owner;

  -- Both guards below read only rows `owner_id = v_owner` -- the caller's
  -- own -- and both keep their precedence over the collision refusal, which
  -- is why 004_free_tier_capacity.test.sql's existing `at_slot_limit` and
  -- `slot_taken` assertions are unaffected by this migration.
  if v_used >= v_capacity then
    return query select 'at_slot_limit'::text, null::uuid, p_slot_index, v_used, v_capacity;
    return;
  end if;

  if exists (select 1 from public.prisons p where p.owner_id = v_owner and p.slot_index = p_slot_index) then
    return query select 'slot_taken'::text, null::uuid, p_slot_index, v_used, v_capacity;
    return;
  end if;

  -- THE HANDLER IS THE FIX FOR #343. Unguarded, this insert answered a
  -- caller-supplied id that already existed with a raw
  -- `23505 duplicate key value violates unique constraint "prisons_pkey"`
  -- carrying `DETAIL: Key (id)=(<the id>) already exists.` -- an outcome
  -- outside the status union above, and a confirmation that a prison row
  -- exists which `prisons_select_own` refuses to show this caller.
  --
  -- There is deliberately no pre-`select` for the collision. One `raise`
  -- for this outcome means one wording that cannot drift, and a pre-check
  -- would not even be the fast path here: the advisory lock above is keyed
  -- on the caller's own owner id, so the cross-owner race -- the case that
  -- matters -- passes any pre-check and lands on the index anyway. See this
  -- file's header.
  begin
    insert into public.prisons (id, owner_id, game_version, display_name, slot_index)
    values (coalesce(p_prison_id, gen_random_uuid()), v_owner, p_game_version, p_display_name, p_slot_index)
    returning public.prisons.id into v_new_id;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;

    -- ONE `raise` FOR BOTH CASES, deliberately: "that id belongs to another
    -- account" and "you already registered that id yourself" must be
    -- indistinguishable, and the way to make two answers identical forever
    -- is for there to be one answer. This branch never reads `owner_id`, so
    -- ownership is not a value it can be taken on, and the message
    -- interpolates only the id the caller itself supplied -- which tells the
    -- caller nothing it did not already know. No `DETAIL` is attached, so
    -- the structured field PostgREST surfaces as `details`, and that the id
    -- used to arrive in, is empty.
    --
    -- `42501` rather than a new `LS0xx` for the reason
    -- `20260824110100` gives: a distinct SQLSTATE would be a machine-
    -- readable marker for the branch whose whole purpose is to be
    -- uninformative. It is also already this function's code for "no".
    --
    -- A NULL `p_prison_id` can only reach here through a `gen_random_uuid()`
    -- collision, and renders as `<NULL>`; no caller-supplied id is involved
    -- in that case, so nothing is disclosed by it.
    if v_constraint = 'prisons_pkey' then
      raise exception 'prison id % is not available', p_prison_id
        using errcode = '42501';
    end if;

    -- Anything else is `prisons_owner_slot_unique`, which is
    -- `(owner_id, slot_index)` and therefore violable only by this caller's
    -- own rows -- its `DETAIL` names the caller's own owner id and slot,
    -- nothing foreign. Reachable despite the `slot_taken` guard above by a
    -- writer that holds no advisory lock: the direct client INSERT grant
    -- ADR 0013 deliberately retains, or a future backfill. `raise` with no
    -- arguments re-raises the original error unchanged, SQLSTATE, message
    -- and DETAIL included, which preserves exactly what this function did
    -- before. Reporting "id not available" for it would name the wrong
    -- invariant -- the mistake `20260824110000:315-320` declines to make.
    raise;
  end;

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
