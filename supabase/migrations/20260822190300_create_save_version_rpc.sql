-- Optimistic concurrency + idempotent resume for cloud saves, as one
-- atomic operation. This is the only way prisons.current_version_id/
-- current_revision or save_versions rows are ever written -- see the
-- REVOKEs in the two preceding migrations.
--
-- `p_new_revision` must be exactly `current_revision + 1`; anything else
-- is a conflict the caller must resolve (never a silent overwrite, never
-- a silent "latest wins").
--
-- A save attempt is identified by (prison, revision, checksum) -- not by
-- content alone. Resubmitting the same checksum *at the same revision* is
-- an idempotent replay, so retrying an upload whose response was lost but
-- which actually committed is always safe. Because the lookup is keyed on
-- the revision the caller asked for, a replay can only ever report back
-- that same revision: client and cloud cannot end up disagreeing about
-- which revision committed.
--
-- Keying idempotency on the checksum alone -- the original design -- broke
-- exactly there. A prison that legitimately returns to an earlier state (a
-- player undoing a build) resubmits an old checksum at a *new* revision,
-- and was answered with a replay of the old one: the pointer never
-- advanced, the client recorded itself as synced at a revision the cloud
-- had never reached, and its next push conflicted for no reason. Content
-- recurring in a save history is normal; a revert is not the same event as
-- a retry, and only the revision distinguishes them.
--
-- KNOWN, ACCEPTED RISK: `checksum` is #18's diagnostic 64-bit
-- (non-cryptographic) canonical-JSON hash, reused here as half of the
-- idempotency key. Two *different* payloads whose hashes collide would be
-- treated as replays of each other, silently dropping the second -- but
-- only when they collide within one prison AND at the same revision
-- number, which a client produces at most once. If that ever stops being
-- acceptable, replace the checksum half with a client-generated attempt
-- UUID rather than widening checksum's own hash width, since checksum's
-- job (corruption detection, docs/PERSISTENCE.md) is unrelated to this one.
--
-- OPEN QUESTION, recorded and deliberately not decided here -- see
-- docs/CLOUD_SAVE.md, "Open question: no database-tier bound on free-tier
-- storage". `p_byte_size` is recorded, never bounded, and the length of
-- `p_payload` is not checked either, so the storage one anonymous identity
-- can consume is unbounded at the tier that is actually authoritative.
-- Capacity/abuse rather than confidentiality: every ownership check below
-- is unaffected.
create or replace function public.create_save_version(
  p_prison_id uuid,
  p_new_revision int,
  p_save_schema_version int,
  p_checksum text,
  p_payload jsonb,
  p_storage_path text,
  p_byte_size int
) returns table (
  status text, -- 'created' | 'conflict' | 'idempotent_replay'
  version_id uuid,
  revision int,
  checksum text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_current_revision int;
  v_current_version_id uuid;
  v_current_checksum text;
  v_new_version_id uuid;
  v_existing_id uuid;
begin
  if p_new_revision <= 0 then
    raise exception 'revision must be positive';
  end if;
  if (p_payload is null) = (p_storage_path is null) then
    raise exception 'exactly one of payload/storage_path is required';
  end if;

  -- Row lock serializes concurrent calls for the SAME prison so the
  -- idempotency check and the conflict check below cannot race with
  -- another call for this prison; calls for other prisons are unaffected.
  select owner_id, current_revision, current_version_id
    into v_owner, v_current_revision, v_current_version_id
  from public.prisons
  where id = p_prison_id
  for update;

  if not found then
    raise exception 'prison % does not exist', p_prison_id;
  end if;

  -- SECURITY DEFINER bypasses RLS entirely, so this explicit check is the
  -- only thing standing between an authenticated caller and any prison.
  -- `IS DISTINCT FROM` (not `<>`) so a NULL auth.uid() (no resolvable JWT
  -- subject) fails closed instead of an ordinary NULL-comparison making
  -- the whole condition UNKNOWN and silently skipping the check.
  if v_owner is distinct from auth.uid() then
    raise exception 'not authorized for prison %', p_prison_id using errcode = '42501';
  end if;

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

-- Explicit revoke-then-grant: never rely on a function's default
-- PUBLIC-executable privilege for something this sensitive.
--
-- `anon` and `service_role` are named as well as PUBLIC, matching
-- submit_challenge_evidence(). Revoking from PUBLIC does not take away a
-- role's *own* grant, and on a project created before Supabase stopped
-- auto-exposing new entities in `public` both of them have one. Under
-- today's default the two spellings are equivalent, which is exactly why
-- the inconsistency was invisible -- and why it mattered: an `anon` caller
-- who could still reach this function would fail closed on the
-- `auth.uid()` check, but only after taking a `SELECT ... FOR UPDATE` row
-- lock, and the two distinct messages ("prison % does not exist" versus
-- "not authorized for prison %") would tell an unauthenticated prober
-- whether a given prison UUID exists. The boundary belongs at the
-- privilege check.
--
-- `service_role` gets nothing here for a different reason: a cloud save is
-- client-authoritative state (ADR 0008's authority table), this RPC
-- derives its authorization from auth.uid(), and no trusted path writes
-- saves. supabase/tests/003_data_api_grants.test.sql pins that.
revoke all on function public.create_save_version(uuid, int, int, text, jsonb, text, int)
  from public, anon, service_role;
grant execute on function public.create_save_version(uuid, int, int, text, jsonb, text, int) to authenticated;
