-- pgTAP tests for the Data API privilege surface: exactly which tables,
-- columns and functions in `public` the browser-facing roles (`anon`,
-- `authenticated`) can reach at all.
--
-- Why this suite exists. Every RLS policy in this schema answers "which
-- rows", never "may this role touch the table". Supabase used to grant
-- `anon`/`authenticated` table-level ALL on every new `public` table, so
-- the second question answered itself and the migrations only ever needed
-- REVOKEs. That default is gone: the CLI now runs
--
--   alter default privileges for role postgres in schema public
--     revoke select, insert, update, delete on tables
--     from anon, authenticated, service_role;
--
-- (and the same for sequences/functions) unless
-- `[api] auto_expose_new_tables = true` is set -- a field supabase/config.toml
-- documents as deprecated and removed on 2026-10-30. Running this schema on
-- the real local stack for the first time found every table unreachable:
-- `42501 permission denied for table prisons` on the very first assertion of
-- 001. See docs/CLOUD_SAVE.md, "Defects found by executing this schema".
--
-- Each assertion below pins an exact privilege set rather than "at least
-- these", so an accidental over-grant fails just as loudly as a missing one.
-- Only the four DML privileges are compared: TRUNCATE/REFERENCES/TRIGGER --
-- and MAINTAIN, which exists only on PostgreSQL 17+ -- are ambient defaults
-- that carry no Data API meaning, and pinning them would make this suite
-- fail on a server-version difference instead of a privilege change.
--
-- EXECUTED against the real Supabase local stack (`supabase test db`,
-- CLI 2.115.0) and against plain PostgreSQL 18.6 + pgTAP 1.3.4 via
-- `pnpm verify:sql`.

begin;
select plan(13);

-- Alphabetical because the aggregates below order by privilege name:
-- DELETE, INSERT, SELECT, UPDATE.
create function pg_temp.dml_privs(p_role text, p_table text) returns text
language sql stable as $$
  select string_agg(p, ',' order by p)
  from unnest(array['DELETE', 'INSERT', 'SELECT', 'UPDATE']) as p
  where has_table_privilege(p_role, p_table, p)
$$;

-- --- Cloud save (issue #20) ---

select is(
  pg_temp.dml_privs('authenticated', 'public.profiles'),
  'INSERT,SELECT,UPDATE',
  'profiles: a client creates and edits its own profile, and never deletes one'
);

select is(
  pg_temp.dml_privs('authenticated', 'public.prisons'),
  'DELETE,INSERT,SELECT',
  'prisons: no table-level UPDATE -- the pointer columns are advanced only by create_save_version()'
);

select is(
  (select string_agg(a.attname, ',' order by a.attname)
     from pg_attribute a
    where a.attrelid = 'public.prisons'::regclass
      and a.attnum > 0
      and not a.attisdropped
      and has_column_privilege('authenticated', a.attrelid, a.attnum, 'UPDATE')),
  'display_name,game_version,slot_index,updated_at',
  'prisons: the granted-back UPDATE columns are exactly the editable metadata'
);

select is(
  pg_temp.dml_privs('authenticated', 'public.save_versions'),
  'SELECT',
  'save_versions: readable, never writable -- immutability is the absence of a write grant'
);

select is(
  pg_temp.dml_privs('authenticated', 'public.user_settings'),
  'DELETE,INSERT,SELECT,UPDATE',
  'user_settings: fully client-owned, unlike everything else here'
);

-- --- Trusted services (issue #36) ---

select is(
  pg_temp.dml_privs('authenticated', 'public.entitlements'),
  'SELECT',
  'entitlements: a derived projection the client reads and never writes'
);

select is(
  pg_temp.dml_privs('authenticated', 'public.entitlement_events'),
  'SELECT',
  'entitlement_events: a player can audit its own ledger but cannot append to it'
);

select is(
  pg_temp.dml_privs('authenticated', 'public.challenge_definitions'),
  'SELECT',
  'challenge_definitions: signed and read-only'
);

select is(
  pg_temp.dml_privs('authenticated', 'public.challenge_submissions'),
  'SELECT',
  'challenge_submissions: written only through submit_challenge_evidence()'
);

select is(
  pg_temp.dml_privs('authenticated', 'public.challenge_leaderboard'),
  null,
  'challenge_leaderboard: unreachable until ADR 0009 decides what a public ranking row may reveal'
);

-- --- anon ---
--
-- One assertion over the whole schema rather than one per table: what
-- matters is that a signed-out visitor reaches nothing except the signed
-- challenge definitions, and a new table that forgets to exclude anon
-- should fail here without anyone remembering to add a case.

select is(
  (select string_agg(c.relname || ':' || p, ' ' order by c.relname, p)
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     cross join unnest(array['DELETE', 'INSERT', 'SELECT', 'UPDATE']) as p
    where n.nspname = 'public'
      and c.relkind in ('r', 'v')
      and has_table_privilege('anon', c.oid, p)),
  'challenge_definitions:SELECT',
  'anon reaches exactly one relation in public: the offline-verifiable challenge definitions'
);

-- --- Callable RPCs ---
--
-- Trigger functions are excluded: they keep PostgreSQL's built-in PUBLIC
-- EXECUTE (Supabase's `revoke execute on functions` default only drops the
-- roles' own grant), but PL/pgSQL refuses to run one outside a trigger, so
-- they are not a Data API surface. Everything else is.

select is(
  (select string_agg(p.proname, ' ' order by p.proname)
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype <> 'pg_catalog.trigger'::regtype
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  'create_save_version submit_challenge_evidence',
  'authenticated may call exactly the two RPCs that check auth.uid() themselves'
);

select is(
  (select string_agg(p.proname, ' ' order by p.proname)
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype <> 'pg_catalog.trigger'::regtype
      and has_function_privilege('anon', p.oid, 'EXECUTE')),
  null,
  'anon may call nothing: every RPC here needs an identity'
);

select * from finish();
rollback;
