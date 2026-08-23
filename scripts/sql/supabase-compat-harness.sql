-- Supabase compatibility harness for running the migrations and pgTAP
-- tests against a PLAIN PostgreSQL server (see scripts/verify-supabase-sql.mjs).
--
-- WHAT THIS IS: the minimum Supabase-provided database context our SQL
-- depends on -- the client-facing roles, the default table grants Supabase
-- applies, and the slice of the `auth` schema our foreign keys and RLS
-- policies reference.
--
-- WHAT THIS IS NOT: Supabase. It emulates no GoTrue behaviour, no JWT
-- verification, no PostgREST, no Storage and no Realtime. A green run here
-- proves the SQL itself -- syntax, constraints, triggers, functions,
-- privilege arithmetic and the RLS policies as evaluated by Postgres --
-- and proves nothing about how the hosted platform issues the identity
-- those policies read. `supabase test db` against the real local stack
-- remains the stronger check; this is what can be run when the container
-- images for that stack are unavailable.
--
-- THE RULE THIS FILE LEARNED THE HARD WAY: an emulator may be stricter than
-- the thing it emulates, never more permissive. It once reproduced only
-- Supabase's default table GRANTs and not the REVOKE that now follows them,
-- so it certified a schema that a real project could not serve a single
-- request from. When Supabase's own defaults change, this file changes with
-- them; see docs/CLOUD_SAVE.md, "Defects found by executing this schema".
--
-- It is deliberately NOT in supabase/tests/, so `supabase test db` never
-- picks it up and tries to recreate a schema the real stack already owns.

-- Supabase keeps extensions out of `public` -- pgTAP, pgcrypto and the rest
-- live in a dedicated `extensions` schema that is on the search_path. Doing
-- the same here is not cosmetic: `create extension pgtap` in `public` adds
-- its own views and ~1000 functions to the schema whose Data API surface
-- supabase/tests/003_data_api_grants.test.sql asserts is exactly ours, and
-- would make that suite fail against the harness while passing against the
-- real stack.
create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;
create extension if not exists pgcrypto with schema extensions;

do $$
begin
  execute format('alter database %I set search_path = public, extensions', current_database());
end
$$;
set search_path = public, extensions;

-- Roles Supabase creates. `authenticated`/`anon` are the client-facing
-- roles our REVOKEs target; `service_role` is the trusted server role.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;

-- Supabase's default privileges for the Data API roles, reproduced exactly.
--
-- The GRANT half matters because without it a REVOKE in a migration would
-- "pass" for the wrong reason. The REVOKE half matters just as much, and
-- this harness originally got it wrong: Supabase no longer auto-exposes
-- new entities in `public`. The CLI runs a `revoke-api-privileges.sql`
-- step ("Revoke default privileges for the Data API roles on schema public
-- so new tables require explicit GRANTs. Mirrors Studio's behaviour at
-- cloud project creation.") whose three statements are copied verbatim
-- below. `[api] auto_expose_new_tables = true` restores the legacy
-- behaviour and is documented in supabase/config.toml as deprecated and
-- removed on 2026-10-30, so the revoked state is the one to model.
--
-- Emulating only the GRANT made this harness *more* permissive than the
-- platform, which is the dangerous direction: it hid the fact that no
-- migration here ever granted the SELECT/INSERT/UPDATE/DELETE its RLS
-- policies presuppose, so every table was unreachable on a real project
-- while 36/36 assertions passed here. See docs/CLOUD_SAVE.md.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

alter default privileges in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;
alter default privileges in schema public
  revoke execute on functions from anon, authenticated, service_role;

-- auth schema: only the surface our migrations touch.
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  created_at timestamptz not null default now()
);

create or replace function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;
