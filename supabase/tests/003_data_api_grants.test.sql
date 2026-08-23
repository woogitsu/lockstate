-- pgTAP tests for the whole `public` privilege surface: exactly which
-- tables, columns and functions each Supabase role -- `anon`,
-- `authenticated` and the trusted `service_role` -- can reach at all, plus
-- the row-level security that decides what a reachable table then shows.
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
-- WHAT THE FIRST VERSION OF THIS SUITE MISSED, and why each gap is now a
-- schema-wide sweep rather than another per-table case:
--
--   * It never queried `service_role`. No migration granted the trusted
--     role anything, BYPASSRLS confers no table or function privilege, and
--     so the entire Z2 half of issue #36 was dead -- a payment webhook
--     calling `record_entitlement_event` would have got `42501`, and no
--     challenge submission could ever have left 'pending'. Nothing failed
--     because nothing asked.
--   * It never checked `pg_class.relrowsecurity`. The failure mode
--     inverted when Supabase stopped auto-exposing tables: the next table
--     added here will deliberately carry `grant select ... to
--     authenticated`, so forgetting `alter table ... enable row level
--     security` would hand every logged-in user every row -- and, with
--     anonymous sign-in on, "logged in" means anyone -- while every
--     assertion still passed.
--   * The schema-wide sweep existed only for `anon`, which is the role
--     that holds almost nothing. `authenticated` is where the real grants
--     live and had no sweep at all, so a new table's grants were pinned
--     only if someone remembered to add a case.
--   * `relkind in ('r','v')` skipped materialized views ('m'), partitioned
--     tables ('p') and foreign tables ('f'), any of which is a perfectly
--     ordinary way to expose data through PostgREST.
--
-- EXECUTED against the real Supabase local stack (`supabase test db`,
-- CLI 2.115.0) and against plain PostgreSQL 18.6 + pgTAP 1.3.4 via
-- `pnpm verify:sql`.

begin;
select plan(19);

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

-- --- Row level security ---
--
-- Nothing above this line looks at RLS, and for as long as Supabase
-- auto-exposed every new `public` table that was survivable: a table with
-- no grant was unreachable whatever its RLS said. It is not survivable
-- now. Every table added from here on will carry a deliberate `grant
-- select ... to authenticated`, so a missing `enable row level security`
-- is the difference between "each player sees their own rows" and "every
-- signed-in visitor sees every row" -- with `enable_anonymous_sign_ins`,
-- every visitor at all. This assertion is schema-wide because the mistake
-- is one of omission, and an omission cannot be caught by a per-table case
-- somebody also has to remember to write.
--
-- Only 'r'/'p' are considered: those are the relkinds that can carry RLS.

select is(
  (select string_agg(c.relname, ' ' order by c.relname)
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity),
  null,
  'every table in public has row level security enabled'
);

-- --- Schema-wide sweeps, one per role ---
--
-- The per-table cases above give a readable failure; these give an
-- exhaustive one. A new table, view, materialized view or partitioned
-- table that grants a role anything fails here whether or not anyone
-- remembered to add a case for it, and so does a grant that quietly
-- widens. `relkind` covers ordinary tables, views, materialized views,
-- partitioned tables and foreign tables -- every kind PostgREST will
-- happily serve.

select is(
  (select string_agg(c.relname || ':' || p, ' ' order by c.relname, p)
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     cross join unnest(array['DELETE', 'INSERT', 'SELECT', 'UPDATE']) as p
    where n.nspname = 'public'
      and c.relkind in ('r', 'v', 'm', 'p', 'f')
      and has_table_privilege('anon', c.oid, p)),
  'challenge_definitions:SELECT',
  'anon reaches exactly one relation in public: the challenge definitions, and only the rows its policy publishes'
);

select is(
  (select string_agg(c.relname || ':' || p, e'\n' order by c.relname, p)
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     cross join unnest(array['DELETE', 'INSERT', 'SELECT', 'UPDATE']) as p
    where n.nspname = 'public'
      and c.relkind in ('r', 'v', 'm', 'p', 'f')
      and has_table_privilege('authenticated', c.oid, p)),
  $expected$challenge_definitions:SELECT
challenge_submissions:SELECT
entitlement_events:SELECT
entitlements:SELECT
prisons:DELETE
prisons:INSERT
prisons:SELECT
profiles:INSERT
profiles:SELECT
profiles:UPDATE
save_versions:SELECT
user_settings:DELETE
user_settings:INSERT
user_settings:SELECT
user_settings:UPDATE$expected$,
  'authenticated reaches exactly the relations the client half of this schema needs'
);

-- The trusted role (ADR 0008 zone Z2). BYPASSRLS decides which *rows* it
-- sees; these are the only tables it may touch at all. Everything the
-- browser owns -- profiles, prisons, save_versions, user_settings -- and
-- the derived `entitlements` projection are absent on purpose: no trusted
-- path writes a cloud save, and the projection is written only inside
-- record_entitlement_event(), which runs as the table owner.
select is(
  (select string_agg(c.relname || ':' || p, e'\n' order by c.relname, p)
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     cross join unnest(array['DELETE', 'INSERT', 'SELECT', 'UPDATE']) as p
    where n.nspname = 'public'
      and c.relkind in ('r', 'v', 'm', 'p', 'f')
      and has_table_privilege('service_role', c.oid, p)),
  $expected$challenge_definitions:INSERT
challenge_definitions:SELECT
challenge_submissions:SELECT
entitlement_events:SELECT$expected$,
  'service_role reaches exactly the four trusted-path privileges, and holds no table-level UPDATE anywhere'
);

-- The verifier's write, which the sweep above cannot show because
-- has_table_privilege() is false for a column-only grant.
select is(
  (select string_agg(a.attname, ',' order by a.attname)
     from pg_attribute a
    where a.attrelid = 'public.challenge_submissions'::regclass
      and a.attnum > 0
      and not a.attisdropped
      and has_column_privilege('service_role', a.attrelid, a.attnum, 'UPDATE')),
  'ranked_score,rejection_code,verification_status,verified_at',
  'challenge_submissions: the trusted role may write the verdict columns and nothing else'
);

-- A grant to PUBLIC is invisible to all three sweeps above, because
-- has_table_privilege() reports it for every role at once and would make
-- each of them look merely generous rather than wrong.
select is(
  (select string_agg(c.relname || ':' || a.privilege_type, ' ' order by c.relname, a.privilege_type)
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     cross join lateral aclexplode(c.relacl) as a
    where n.nspname = 'public'
      and c.relkind in ('r', 'v', 'm', 'p', 'f')
      and a.grantee = 0),
  null,
  'nothing in public is granted to PUBLIC, so the per-role sweeps above are the whole story'
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

-- The trusted role's single entry point. `recompute_entitlement_projection`
-- is deliberately absent: it is an internal step of the function below,
-- and SECURITY DEFINER means the nested call runs as the owner, so a
-- separate grant would only add a way to rewrite the projection without a
-- ledger append behind it. The two player RPCs are absent because both
-- derive their authorization from auth.uid(), which a trusted caller does
-- not have.
select is(
  (select string_agg(p.proname, ' ' order by p.proname)
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype <> 'pg_catalog.trigger'::regtype
      and has_function_privilege('service_role', p.oid, 'EXECUTE')),
  'record_entitlement_event',
  'service_role may call exactly one RPC: the Z3 -> Z2 payment-webhook write path'
);

select * from finish();
rollback;
