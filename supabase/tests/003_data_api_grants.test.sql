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
-- The per-table and per-role comparisons compare only the four DML
-- privileges, because REFERENCES, TRIGGER and MAINTAIN (which exists only
-- on PostgreSQL 17+) are ambient defaults that carry no Data API meaning,
-- and folding them into those aggregates would make this suite fail on a
-- server-version difference instead of on a privilege change.
--
-- TRUNCATE used to be dismissed with them, and is not one of them (issue
-- #105 finding 3, issue #163). Supabase's default privileges `grant all on
-- tables` and then revoke only the four DML privileges, so every table in
-- `public` started out TRUNCATE-able by all three of `anon`,
-- `authenticated` and `service_role` -- and TRUNCATE ignores row level
-- security completely and fires no row trigger, so it reaches past every
-- `auth.uid()` policy here *and* past the append-only trigger that makes
-- `entitlement_events` immutable. It gets its own schema-wide sweep below
-- rather than a place in the DML aggregates, which keeps this suite
-- portable across server versions while still asserting the one residual
-- privilege that means something.
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
-- `pnpm verify:sql`. The two assertions added for issue #105 finding 3 and
-- finding 10 -- the TRUNCATE sweep and the PUBLIC function-grant sweep --
-- have been executed only on plain PostgreSQL 16.13 + pgTAP 1.3.2 via
-- `pnpm verify:sql`; the stack run needs container images that were not
-- reachable when they were written. The same is true of #163's widening of
-- the TRUNCATE sweep to `service_role`.

begin;
select plan(28);

-- Alphabetical because the aggregates below order by privilege name:
-- DELETE, INSERT, SELECT, UPDATE.
create function pg_temp.dml_privs(p_role text, p_table text) returns text
language sql stable as $$
  select string_agg(p, ',' order by p)
  from unnest(array['DELETE', 'INSERT', 'SELECT', 'UPDATE']) as p
  where has_table_privilege(p_role, p_table, p)
$$;

-- --- Cloud save (issue #20) ---

-- No table-level INSERT or UPDATE: both are granted per column below, so a
-- client cannot write `created_at`. 20260824140000 (#194) revoked them after
-- finding that a client could set a profile's creation timestamp to 1970 and
-- its `updated_at` to the year 4000, and walk `updated_at` backwards.
select is(
  pg_temp.dml_privs('authenticated', 'public.profiles'),
  'SELECT',
  'profiles: no table-level INSERT or UPDATE -- both are per column, so created_at is unreachable'
);

select is(
  (select string_agg(a.attname, ',' order by a.attname)
     from pg_attribute a
    where a.attrelid = 'public.profiles'::regclass
      and a.attnum > 0 and not a.attisdropped
      and has_column_privilege('authenticated', a.attrelid, a.attnum, 'INSERT')),
  'display_name,id,updated_at',
  'profiles: the granted-back INSERT columns are exactly what a client supplies -- created_at absent'
);

select is(
  (select string_agg(a.attname, ',' order by a.attname)
     from pg_attribute a
    where a.attrelid = 'public.profiles'::regclass
      and a.attnum > 0 and not a.attisdropped
      and has_column_privilege('authenticated', a.attrelid, a.attnum, 'UPDATE')),
  'display_name,updated_at',
  'profiles: the granted-back UPDATE columns are the editable metadata -- id and created_at absent'
);

select is(
  pg_temp.dml_privs('authenticated', 'public.prisons'),
  'DELETE,SELECT',
  'prisons: no table-level INSERT or UPDATE -- both are per column'
);

-- A client's INSERT is deliberately retained rather than revoked in favour of
-- create_prison(). ADR 0013 argues the case: the slot cap is a count
-- invariant of this table, so it is enforced by a trigger that holds on
-- every write path, and does not depend on this grant staying revoked.
-- supabase/tests/004_free_tier_capacity.test.sql is what makes that
-- load-bearing -- it drives the refusal through this very grant.
--
-- What changed in 20260824140000 (#194) is its *granularity*, not its
-- existence: it is now granted per column, because a table-level INSERT
-- covers every column and so let a client set `created_at` -- the one thing
-- the UPDATE grant below had already been written to prevent.

select is(
  (select string_agg(a.attname, ',' order by a.attname)
     from pg_attribute a
    where a.attrelid = 'public.prisons'::regclass
      and a.attnum > 0 and not a.attisdropped
      and has_column_privilege('authenticated', a.attrelid, a.attnum, 'INSERT')),
  'display_name,game_version,id,owner_id,slot_index,updated_at',
  'prisons: the granted-back INSERT columns match the UPDATE list plus identity -- created_at and both pointer columns absent'
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

-- `replace(..., e'\r', '')` on the expectation, here and in the sweep
-- below, is not cosmetic. These are the only two assertions in the
-- repository whose expected value is a MULTI-LINE literal, and a Windows
-- checkout with `core.autocrlf = true` stores this file with CRLF endings,
-- which puts a carriage return inside the dollar-quoted string while
-- `string_agg(..., e'\n')` produces none. Both assertions then fail on
-- every platform-default Windows clone -- with a `have`/`want` diff that
-- looks identical, because the stray CR is invisible in the terminal. The
-- suite exists to assert privileges; it must not also assert the line
-- endings of its own source file.
select is(
  (select string_agg(c.relname || ':' || p, e'\n' order by c.relname, p)
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     cross join unnest(array['DELETE', 'INSERT', 'SELECT', 'UPDATE']) as p
    where n.nspname = 'public'
      and c.relkind in ('r', 'v', 'm', 'p', 'f')
      and has_table_privilege('authenticated', c.oid, p)),
  replace($expected$challenge_definitions:SELECT
challenge_submissions:SELECT
entitlement_events:SELECT
entitlements:SELECT
prisons:DELETE
prisons:SELECT
profiles:SELECT
save_versions:SELECT
user_settings:DELETE
user_settings:INSERT
user_settings:SELECT
user_settings:UPDATE$expected$, e'\r', ''),
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
  replace($expected$challenge_definitions:INSERT
challenge_definitions:SELECT
challenge_submissions:SELECT
entitlement_events:SELECT$expected$, e'\r', ''),
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

-- --- TRUNCATE (issue #105 finding 3, issue #163) ---
--
-- The privilege the DML aggregates above deliberately do not compare, and
-- the reason it is asserted on its own is in this file's header: TRUNCATE
-- ignores RLS and fires no row trigger, so a single statement reaches past
-- every ownership policy in this schema and past the append-only trigger on
-- `entitlement_events`. Observed on the compatibility harness before
-- 20260824090100_revoke_client_truncate.sql: `\dp public.*`
-- showed `anon=Dxt` and `authenticated=...Dxt` on all eight tables, and
-- `truncate table public.entitlement_events` as `authenticated`, inside an
-- explicit transaction block, emptied the ledger while the same session's
-- `update` was refused.
--
-- Schema-wide and role-parameterised for the same reason the RLS assertion
-- above is: the mistake is one of omission. A table added later inherits the
-- ambient TRUNCATE from Supabase's default privileges, and the revoke in
-- that migration expanded at execution time over the relations that existed
-- then -- so this is what fails, rather than a per-table case somebody also
-- has to remember to write.
--
-- All three roles, not only the two client-facing ones. This sweep covered
-- `anon` and `authenticated` only, because #105 finding 3 named only them
-- and the trusted tier's case was a boundary question rather than an
-- oversight. #163 settled it: `20260824150000_revoke_trusted_truncate.sql`
-- revokes the same ambient privilege from `service_role`, and ADR 0008
-- section 2 records the ruling. The same observation was made of
-- `service_role` on the harness before that migration -- `t | f | f` for
-- TRUNCATE, DELETE, UPDATE on `entitlement_events`, and `truncate table
-- public.entitlement_events` inside an explicit transaction block emptied a
-- ledger the append-only trigger had just refused to let the table owner
-- edit.
select is(
  (select string_agg(r.role || ':' || c.relname, ' ' order by r.role, c.relname)
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     cross join unnest(array['anon', 'authenticated', 'service_role']) as r(role)
    where n.nspname = 'public'
      and c.relkind in ('r', 'v', 'm', 'p', 'f')
      and has_table_privilege(r.role, c.oid, 'TRUNCATE')),
  null,
  'no Data API role may TRUNCATE anything in public: it would ignore RLS and fire no row trigger'
);

-- --- Callable RPCs ---
--
-- Every function in `public` is swept, trigger functions included. They used
-- to be excluded, on the grounds that they keep PostgreSQL's built-in PUBLIC
-- EXECUTE (Supabase's `revoke execute on functions` default only drops the
-- roles' own grant) while PL/pgSQL refuses to run one outside a trigger, so
-- they were not a Data API surface. That was true and it made the exclusion
-- self-fulfilling: the sweeps could not have seen a trigger function's
-- privileges change, because the filter existed to hide the privilege they
-- had. 20260824090000_pin_trigger_function_search_path.sql revokes it
-- (issue #105 finding 10) -- verified there by execution not to affect
-- whether a trigger fires -- so all four now hold EXECUTE for nobody and the
-- filter has nothing left to exclude. Removing it makes the three sweeps
-- below assert that, and makes a future re-grant fail here.
--
-- The expected values are unchanged by the removal, which is the point: a
-- filter whose removal changes no expectation was hiding something that
-- should have been zero all along.

-- Three of these six are constant-returning helpers added by ADR 0013
-- (`base_save_slot_capacity`, `max_save_slot_capacity`,
-- `max_save_payload_bytes`). They are deliberately readable so a client can
-- ask the server what the limits are and warn before spending a 4 MiB
-- upload finding out; they publish nothing that README.md and
-- src/services/entitlements/products.ts do not already state.
--
-- `account_save_slot_capacity(uuid)` is deliberately ABSENT: it takes an
-- account id and would answer for somebody else's. It is SECURITY DEFINER
-- and reached only from the capacity trigger and create_prison(), both of
-- which run as the owning role.
select is(
  (select string_agg(p.proname, ' ' order by p.proname)
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  'base_save_slot_capacity create_prison create_save_version max_save_payload_bytes max_save_slot_capacity submit_challenge_evidence',
  'authenticated may call exactly the three RPCs that check auth.uid() themselves, plus the three published limit constants'
);

select is(
  (select string_agg(p.proname, ' ' order by p.proname)
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
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
      and has_function_privilege('service_role', p.oid, 'EXECUTE')),
  'record_entitlement_event',
  'service_role may call exactly one RPC: the Z3 -> Z2 payment-webhook write path'
);

-- A grant to PUBLIC is invisible to the three sweeps above for the same
-- reason it is invisible to the table sweeps: `has_function_privilege()`
-- reports it for every role at once, so each of them looks merely generous
-- rather than wrong. The table version of this assertion exists further up;
-- this is its function counterpart, and it is what the four trigger
-- functions would have failed before issue #105 finding 10 was fixed.
--
-- `coalesce(p.proacl, acldefault('f', p.proowner))` is load-bearing, and is
-- the reason the table assertion's plain `aclexplode(c.relacl)` cannot be
-- copied here. A function with no explicit ACL has a NULL `proacl`, and
-- `aclexplode(NULL)` yields no rows -- so a bare `aclexplode(p.proacl)`
-- reports nothing for precisely the functions that still carry
-- PostgreSQL's *default* PUBLIC EXECUTE, which is the only way this grant
-- ever arises here. Expanding the default explicitly is what makes the
-- assertion see it.
select is(
  (select string_agg(p.proname || ':' || a.privilege_type, ' ' order by p.proname, a.privilege_type)
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as a
    where n.nspname = 'public'
      and a.grantee = 0),
  null,
  'no function in public is executable by PUBLIC, including the ones that never had an explicit ACL'
);

-- --- Server-defaulted timestamps are the server's (issue #194) --------
--
-- Shaped as a rule, not a list, for the reason suites 005, 007, 008 and 009 are:
-- the four columns #194 found were client-writable were found by an inventory,
-- not by a failing test, because this suite pins **what the grants are** rather
-- than **what they ought to be**. That is the right thing for a grant suite to
-- do, and it is why the next table created with a table-level grant would have
-- re-opened this silently.
--
-- The rule: a column whose default is `now()` is the server's statement about
-- when something happened, so no client role may write it -- unless this
-- allow-list says otherwise, with a reason.
--
-- Both directions fail: a `default now()` column that becomes client-writable
-- is caught unless it is listed, and a listed column that stops being
-- client-writable is caught too, so acting on #194's open half forces the entry
-- out rather than leaving it asserting something untrue.

create temporary table client_writable_timestamps (tbl text, col text, reason text);

insert into client_writable_timestamps (tbl, col, reason) values
  ('prisons', 'updated_at',
   'Granted on purpose by 20260822190100. Whether a client may stamp its own updated_at is #194''s open half; the alternative is a before-update trigger, and that choice decides whether anything may trust this column for ordering.'),
  ('profiles', 'updated_at',
   'Retained by 20260824140000, which scoped itself to created_at. Same open decision as prisons.updated_at, in #194.'),
  ('user_settings', 'updated_at',
   'Retained by 20260824140000. This table has no created_at, so updated_at was its only affected column and the migration deliberately changed nothing here. #194.');

-- Vacuity guard: the sweep below is satisfied by an empty scan, so a query
-- that stopped finding `default now()` columns would read as compliance.
select cmp_ok(
  (select count(*)::int
     from pg_attribute a
     join pg_class c on c.oid = a.attrelid
     join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
     join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
      and pg_get_expr(d.adbin, d.adrelid) = 'now()'),
  '>=',
  10,
  'the sweep found the server-defaulted timestamp columns it claims to cover'
);

select is_empty(
  $$ select c.relname || '.' || a.attname
       from pg_attribute a
       join pg_class c on c.oid = a.attrelid
       join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
       join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
        and pg_get_expr(d.adbin, d.adrelid) = 'now()'
        and (has_column_privilege('authenticated', a.attrelid, a.attnum, 'INSERT')
             or has_column_privilege('authenticated', a.attrelid, a.attnum, 'UPDATE')
             or has_column_privilege('anon', a.attrelid, a.attnum, 'INSERT')
             or has_column_privilege('anon', a.attrelid, a.attnum, 'UPDATE'))
        and not exists (select 1 from client_writable_timestamps w
                         where w.tbl = c.relname and w.col = a.attname) $$,
  'no server-defaulted timestamp is writable by a client role without a recorded reason'
);

select is_empty(
  $$ select w.tbl || '.' || w.col from client_writable_timestamps w
      where not exists (
        select 1
          from pg_attribute a
          join pg_class c on c.oid = a.attrelid
          join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
         where c.relname = w.tbl and a.attname = w.col
           and a.attnum > 0 and not a.attisdropped
           and (has_column_privilege('authenticated', a.attrelid, a.attnum, 'INSERT')
                or has_column_privilege('authenticated', a.attrelid, a.attnum, 'UPDATE'))) $$,
  'every allow-listed timestamp is still client-writable, so an entry cannot outlive the state it describes'
);

select is_empty(
  $$ select tbl || '.' || col from client_writable_timestamps where char_length(reason) < 60 $$,
  'every allow-listed timestamp carries a reason rather than a placeholder'
);


select * from finish();
rollback;
