-- Optimistic concurrency + idempotent resume for cloud saves, as one
-- atomic operation. This is the only way prisons.current_version_id/
-- current_revision or save_versions rows are ever written -- see the
-- REVOKEs in the two preceding migrations.
--
-- `p_new_revision` must be exactly `current_revision + 1`; anything else
-- is a conflict the caller must resolve (never a silent overwrite, never
-- a silent "latest wins"). A resubmission of a checksum already recorded
-- for this prison is treated as a successful idempotent replay rather
-- than a conflict or a duplicate row, so retrying an upload whose
-- response was lost (but which actually committed) is always safe.
--
-- KNOWN, ACCEPTED RISK: `checksum` is #18's diagnostic 64-bit
-- (non-cryptographic) canonical-JSON hash, reused here as the idempotency
-- key. A genuine hash collision between two *different* payloads for the
-- same prison would make this function treat the second, different save
-- as an idempotent replay of the first and silently drop it -- the one
-- scenario this design does not protect against. At 64 bits this needs
-- billions of saves for a prison before it becomes a realistic risk
-- (birthday bound), but if that stops being acceptable, replace the
-- idempotency key with a client-generated attempt UUID stored alongside
-- checksum rather than widening checksum's own hash width, since
-- checksum's job (corruption detection, docs/PERSISTENCE.md) is
-- unrelated to this one.
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
  v_existing_revision int;
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
  select sv.id, sv.revision into v_existing_id, v_existing_revision
  from public.save_versions sv
  where sv.prison_id = p_prison_id and sv.checksum = p_checksum;

  if found then
    return query select 'idempotent_replay'::text, v_existing_id, v_existing_revision, p_checksum;
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
revoke all on function public.create_save_version(uuid, int, int, text, jsonb, text, int) from public;
grant execute on function public.create_save_version(uuid, int, int, text, jsonb, text, int) to authenticated;
