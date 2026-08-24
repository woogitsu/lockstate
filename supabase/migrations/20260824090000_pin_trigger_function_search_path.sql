-- The four trigger functions: the two of them that never pinned
-- `search_path`, and the default `PUBLIC EXECUTE` that all four kept
-- (issue #105 finding 10).
--
-- "The two that never pinned it" is relative to the functions that pin one
-- at all. Three functions in this schema deliberately do not -- the
-- constant-returning limit helpers `base_save_slot_capacity()`,
-- `max_save_slot_capacity()` and `max_save_payload_bytes()`, which are
-- `language sql immutable` one-liners naming no relation, type or function.
-- After this migration those three are the only unpinned functions in
-- `public`, and suite 005 asserts that list exactly rather than leaving it
-- implied.
--
-- Nothing here changes what any role can legitimately do. Both changes
-- close a path that no code in this repository uses, and both are now
-- pinned by assertions so they cannot silently come back --
-- supabase/tests/005_function_security_declarations.test.sql for the
-- declarations, supabase/tests/003_data_api_grants.test.sql for the
-- privileges. The suite asserted neither before this change, which is
-- #105 finding 5 and the reason that suite exists.
--
-- EXECUTED against plain PostgreSQL 16.13 + pgTAP 1.3.2 via `pnpm
-- verify:sql`. NOT executed against the real Supabase local stack or a
-- hosted project -- both need resources this change was produced without;
-- see docs/CLOUD_SAVE.md, "What has and has not been executed".

-- --- 1. The two trigger functions that omitted the pinned search_path ---
--
-- Every SECURITY DEFINER function in this schema spells out
-- `search_path = public, pg_temp`, with `pg_temp` last, for the reason
-- submit_challenge_evidence() states in full: when `pg_temp` is not named,
-- PostgreSQL searches the temporary schema *first* for relation and type
-- names, which is the classic SECURITY DEFINER hijack and what Supabase's
-- own `function_search_path_mutable` linter flags.
--
-- These two are SECURITY INVOKER, so they are not that hijack: a caller who
-- plants `pg_temp.entitlement_events` and fires this trigger already runs as
-- themselves and gains nothing. They are pinned anyway, for two reasons that
-- are about the declaration rather than about today's body. First, a trigger
-- body is edited under the assumption that the resolution rules match every
-- other function here, and the two that differ are exactly where that
-- assumption is wrong. Second, `enforce_prison_slot_capacity()` in
-- 20260823100000_bound_free_tier_capacity.sql shows a trigger function in
-- this schema becoming SECURITY DEFINER, at which point the omission would
-- be the live hijack -- and the migration that makes that change is not
-- where anyone will remember to add a `set` clause.
--
-- `create or replace` here, rather than an `alter function ... set
-- search_path`, keeps the whole declaration in one readable place; the
-- bodies below are byte-identical to the originals.

-- Originally 20260823090000_create_entitlement_events.sql.
create or replace function public.reject_entitlement_event_update()
returns trigger
language plpgsql
-- `pg_temp` explicitly last; see submit_challenge_evidence() for why.
set search_path = public, pg_temp
as $$
begin
  raise exception 'entitlement_events is append-only; append a compensating event instead of editing %', old.event_id;
end;
$$;

-- Originally 20260823090100_create_challenge_tables.sql.
create or replace function public.enforce_challenge_verification_transition()
returns trigger
language plpgsql
-- `pg_temp` explicitly last; see submit_challenge_evidence() for why.
set search_path = public, pg_temp
as $$
begin
  if old.verification_status <> 'pending' and new.verification_status <> old.verification_status then
    raise exception 'challenge submission % is already %, and cannot be re-verified', old.submission_id, old.verification_status;
  end if;
  if new.evidence_hash <> old.evidence_hash or new.evidence <> old.evidence then
    raise exception 'challenge evidence is immutable once submitted (%).', old.submission_id;
  end if;
  return new;
end;
$$;

-- --- 2. The default PUBLIC EXECUTE on all four trigger functions --------
--
-- A function with no explicit ACL is executable by `PUBLIC`, and Supabase's
-- `alter default privileges ... revoke execute on functions` only drops the
-- three Data API roles' *own* grant -- it leaves PostgreSQL's built-in
-- PUBLIC EXECUTE intact. Read back from the catalog before this migration,
-- these four were the only functions in `public` whose `proacl` was still
-- null, and `has_function_privilege` therefore answered true for `anon`,
-- `authenticated` and `service_role` on all four.
--
-- VERIFIED BY EXECUTION, not assumed: a trigger's EXECUTE grant is not what
-- the trigger mechanism consults. After these revokes,
-- `has_function_privilege('authenticated', 'enforce_prison_slot_capacity()',
-- 'EXECUTE')` is false and the slot cap still refuses the sixth prison with
-- `LS001` inserted as `authenticated`; the same holds for the other three
-- (see the pull request for #105 findings 5/10/3 for the transcript).
-- PL/pgSQL also refuses to run a trigger function outside a trigger
-- ("trigger functions can only be called as triggers"), so the grant was
-- never a Data API surface either. Revoking it is therefore not a
-- functional change; it removes a privilege that means nothing today and
-- would mean something the moment one of these bodies was reworked into a
-- callable helper.
--
-- Spelled the same way as every other function privilege in this schema:
-- `public` first, then each role by name, because a revoke from PUBLIC does
-- not take away a role's own default grant on a project created before
-- Supabase stopped auto-exposing new entities in `public`.
revoke all on function public.reject_entitlement_event_update()
  from public, anon, authenticated, service_role;
revoke all on function public.enforce_challenge_verification_transition()
  from public, anon, authenticated, service_role;
revoke all on function public.enforce_prison_slot_capacity()
  from public, anon, authenticated, service_role;
revoke all on function public.enforce_save_version_size()
  from public, anon, authenticated, service_role;
