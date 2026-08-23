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
-- It is deliberately NOT in supabase/tests/, so `supabase test db` never
-- picks it up and tries to recreate a schema the real stack already owns.

create extension if not exists pgtap;
create extension if not exists pgcrypto;

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

-- Supabase grants full table privileges to the client roles by default and
-- relies on RLS plus explicit REVOKEs to constrain them. Reproducing the
-- grant is essential: without it a REVOKE in a migration would "pass" for
-- the wrong reason.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

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
