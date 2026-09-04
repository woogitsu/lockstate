-- pgTAP tests for the *declarations* of every function in `public`, read
-- back from `pg_proc`: which functions run as their definer
-- (`prosecdef`), and what `search_path` each one pins (`proconfig`).
--
-- WHY THIS SUITE EXISTS (issue #105, findings 5 and 10). Suite 003 pins the
-- privilege surface exhaustively -- every table, column and function, for
-- all three Supabase roles -- and until this file existed the suite as a
-- whole asserted nothing about either of the two declaration properties
-- that make a `SECURITY DEFINER` function safe. Dropping `set search_path =
-- public, pg_temp` from any of them, or reordering it to put `pg_temp`
-- first, passed all 89 assertions. Three migrations argue in their own
-- comments that the pinning is load-bearing; an audit confirmed by
-- execution that it is effective (a deliberate `pg_temp` hijack -- planting
-- `pg_temp.prisons`, `pg_temp.entitlements` and shadowed constant
-- functions, then re-running `create_prison()` -- failed to exploit). What
-- was missing was anything stopping a future edit removing it. A gate that
-- names a contract and does not test it is the defect being fixed here, so
-- these assertions are deliberately catalog-driven rather than a list of
-- the functions that exist today.
--
-- WHAT `pg_temp` LAST BUYS, restated once here because the ordering is the
-- whole point and an assertion on a string is easy to weaken by accident.
-- When `pg_temp` is not named at all, PostgreSQL searches the temporary
-- schema *first* for relation and type names -- so a caller who can create
-- a temporary table can shadow a table the definer's body names
-- unqualified. Naming it last puts it after `public`, which is the entire
-- mitigation; naming it first would reintroduce exactly the default this
-- pinning exists to override. `public, pg_temp` is also the spelling
-- Supabase's own `function_search_path_mutable` linter looks for.
--
-- EXECUTED against plain PostgreSQL 16.13 + pgTAP 1.3.2 via
-- `pnpm verify:sql`. Unlike suites 001-004 this one has NOT been run
-- against the real Supabase local stack (`supabase test db`) -- it was
-- written where those container images are unreachable. It reads only
-- `pg_proc`, which the harness does not emulate and cannot get wrong, so
-- the exposure is smaller than for a privilege assertion; it is still an
-- unexecuted path and docs/CLOUD_SAVE.md says so.

begin;
select plan(8);

-- Extracts the `search_path` a function pins, or null when it pins none.
-- `proconfig` is a `text[]` of `name=value` strings and is null -- not
-- empty -- for a function with no `SET` clause at all, which is why the
-- `coalesce` is here rather than a bare `unnest`.
create function pg_temp.pinned_search_path(p_oid oid) returns text
language sql stable as $$
  select substring(setting from 'search_path=(.*)$')
  from unnest(coalesce((select p.proconfig from pg_proc p where p.oid = p_oid), array[]::text[])) as setting
  where setting like 'search_path=%'
$$;

-- --- The exhaustive pin ------------------------------------------------
--
-- One row per function in `public`, naming both declaration properties.
-- This is the assertion that fails when a function is added, removed,
-- switched between `SECURITY DEFINER` and `SECURITY INVOKER`, or has its
-- pinned path changed in any way -- including the two mutations the rule
-- assertions below name individually.
--
-- `replace(..., e'\r', '')` on the expectation is not cosmetic: a Windows
-- checkout with `core.autocrlf = true` stores this file with CRLF endings,
-- which puts a carriage return inside the dollar-quoted literal while
-- `string_agg(..., e'\n')` produces none. The same guard is on the two
-- multi-line expectations in suite 003, for the same reason.
select is(
  (select string_agg(
            p.proname
            || ':' || case when p.prosecdef then 'definer' else 'invoker' end
            || ':' || coalesce(pg_temp.pinned_search_path(p.oid), '<unpinned>'),
            e'\n' order by p.proname)
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'),
  replace($expected$account_save_slot_capacity:definer:public, pg_temp
base_save_slot_capacity:invoker:<unpinned>
create_prison:definer:public, pg_temp
create_save_version:definer:public, pg_temp
enforce_challenge_evidence_size:definer:public, pg_temp
enforce_challenge_verification_transition:invoker:public, pg_temp
enforce_prison_slot_capacity:definer:public, pg_temp
enforce_save_version_size:invoker:public, pg_temp
enforce_save_version_storage_prefix:definer:public, pg_temp
max_challenge_evidence_bytes:invoker:<unpinned>
max_save_payload_bytes:invoker:<unpinned>
max_save_slot_capacity:invoker:<unpinned>
recompute_entitlement_projection:definer:public, pg_temp
record_entitlement_event:definer:public, pg_temp
record_telemetry_events:definer:public, pg_temp
reject_entitlement_event_update:invoker:public, pg_temp
stamp_updated_at:invoker:public, pg_temp
submit_challenge_evidence:definer:public, pg_temp$expected$, e'\r', ''),
  'every function in public declares exactly the definer rights and pinned search_path its migration states'
);

-- --- The rules, one readable failure each ------------------------------
--
-- The matrix above is complete; these are not redundant with it in the way
-- that matters. Each one is a *rule* stated over the catalog, so it holds
-- for a function nobody has added yet, and it fails with the offending
-- function's name rather than with a thirteen-line diff. That is the same
-- division suite 003 draws between its per-table cases and its schema-wide
-- sweeps.

select is(
  (select string_agg(p.proname, ' ' order by p.proname)
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and pg_temp.pinned_search_path(p.oid) is null),
  null,
  'every SECURITY DEFINER function in public pins a search_path'
);

select is(
  (select string_agg(p.proname, ' ' order by p.proname)
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype = 'pg_catalog.trigger'::regtype
      and pg_temp.pinned_search_path(p.oid) is null),
  null,
  'every trigger function in public pins a search_path, including the SECURITY INVOKER ones'
);

select is(
  (select string_agg(p.proname || ' pins ' || pg_temp.pinned_search_path(p.oid), ' / ' order by p.proname)
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and pg_temp.pinned_search_path(p.oid) is not null
      and pg_temp.pinned_search_path(p.oid) <> 'public, pg_temp'),
  null,
  'every pinned search_path in public is exactly `public, pg_temp` -- one spelling, so a reader never has to compare two'
);

-- Stated positionally as well as by equality, because "pg_temp last" is
-- the property, not the literal. An assertion that only compared the whole
-- string could be "fixed" by a future migration that widened the path and
-- updated the expectation without noticing it had moved `pg_temp`.
select is(
  (select string_agg(p.proname || ' pins ' || pg_temp.pinned_search_path(p.oid), ' / ' order by p.proname)
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and pg_temp.pinned_search_path(p.oid) is not null
      and btrim(
            (string_to_array(pg_temp.pinned_search_path(p.oid), ','))[
              array_length(string_to_array(pg_temp.pinned_search_path(p.oid), ','), 1)
            ]
          ) <> 'pg_temp'),
  null,
  'pg_temp is the LAST entry of every pinned search_path, so the temporary schema is searched after public and never before it'
);

-- The catalog and the list of deliberate exceptions must agree. Without
-- this, a newly added function with no pinned path would merely be
-- un-asserted by the two rules above -- which is the exact shape of the
-- finding this suite closes. Adding a function here is a decision a
-- reviewer has to see.
--
-- These four are `language sql immutable` one-liners returning a
-- constant (`select 5`). They are SECURITY INVOKER, they name no relation,
-- type or function, and they are inlined by the planner, so there is
-- nothing for a temporary schema to shadow. That is why they are excluded
-- rather than pinned -- and it is a property of their bodies, so if one of
-- them ever grows a table reference it needs a pinned path and this
-- assertion is where that gets noticed.
--
-- `max_challenge_evidence_bytes()` (issue #105 finding 1,
-- 20260824100000_bind_challenge_evidence_to_payload.sql) is the fourth. It
-- is the same shape as the three ADR 0013 helpers and is exempt for the
-- same reason; unlike them it is callable by nobody, which
-- supabase/tests/003_data_api_grants.test.sql pins rather than this file.
select is(
  (select string_agg(p.proname, ' ' order by p.proname)
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and pg_temp.pinned_search_path(p.oid) is null),
  'base_save_slot_capacity max_challenge_evidence_bytes max_save_payload_bytes max_save_slot_capacity',
  'the only functions in public without a pinned search_path are the four constant-returning limit helpers'
);

-- `proconfig` can carry any GUC, not only `search_path`. A `SET role`, a
-- `SET row_security = off` or a per-function `SET` of anything else on a
-- SECURITY DEFINER function is a privilege decision, and this schema has
-- made none of them.
select is(
  (select string_agg(p.proname || ':' || setting, ' ' order by p.proname, setting)
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     cross join lateral unnest(coalesce(p.proconfig, array[]::text[])) as setting
    where n.nspname = 'public'
      and setting not like 'search_path=%'),
  null,
  'no function in public pins any setting other than search_path'
);

-- The six client- or trusted-callable RPCs are the ones whose definer
-- rights are the security control, so their `prosecdef` is worth naming as
-- a set and not only inside the matrix above. Three trigger functions are
-- here too, and for two distinct reasons.
--
-- Two of them call a limit helper that is executable by nobody, so invoker
-- rights would make the invariant depend on the writer holding a grant no
-- role has: `enforce_prison_slot_capacity` reads `entitlements` through
-- `account_save_slot_capacity()` (ADR 0013), and
-- `enforce_challenge_evidence_size` reads `max_challenge_evidence_bytes()`
-- (issue #105 finding 1).
--
-- The third, `enforce_save_version_storage_prefix` (issue #105 finding 11),
-- is definer for a reason of its own: it reads `public.prisons` to learn
-- which account owns the version being written, and an invoker-rights
-- trigger would enforce the per-owner prefix only for writers who happen to
-- hold SELECT on that table -- and would see only the rows that table's RLS
-- policy shows them, which for a trusted importer is none of the ones it
-- needs to validate against.
--
-- The tenth, `record_telemetry_events` (20260904090000, ADR 0046), is definer
-- so that the telemetry ingest's dedicated role can hold EXECUTE on it and no
-- table privilege at all: the write runs as the table owner, so
-- `telemetry_ingest` needs neither INSERT on `telemetry_events` nor the right
-- to read back what it wrote. Its pinned `search_path` is doing the same work
-- as every other entry here and is driven behaviourally in suite 012, which
-- plants a `pg_temp.telemetry_events` and asserts the row lands in the real
-- table.
select is(
  (select string_agg(p.proname, ' ' order by p.proname)
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef),
  'account_save_slot_capacity create_prison create_save_version enforce_challenge_evidence_size '
    || 'enforce_prison_slot_capacity enforce_save_version_storage_prefix '
    || 'recompute_entitlement_projection record_entitlement_event record_telemetry_events '
    || 'submit_challenge_evidence',
  'exactly ten functions run with their definer''s rights, and each one is a documented trusted path'
);

select * from finish();
rollback;
