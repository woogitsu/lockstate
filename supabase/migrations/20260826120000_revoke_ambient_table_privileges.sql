-- Revoke the last ambient privileges Supabase's default privileges hand the
-- three Data API roles, and stop the default handing them back on the next
-- table (issue #280 finding F14, and the class that finding sits inside).
--
-- EXECUTED against plain PostgreSQL 16.13 + pgTAP 1.3.2 via `pnpm verify:sql`,
-- and pinned by the schema-wide sweeps in
-- supabase/tests/003_data_api_grants.test.sql. NOT executed against the real
-- Supabase local stack or a hosted project; see docs/CLOUD_SAVE.md, "What has
-- and has not been executed".
--
-- WHAT WAS LEFT. `20260824090100` and `20260824150000` revoked `TRUNCATE` from
-- the client roles and then from `service_role`, on the ruling ADR 0008 §2 now
-- records. `REFERENCES` and `TRIGGER` come from the same `grant all on tables`
-- and were left behind, dismissed by
-- supabase/tests/003_data_api_grants.test.sql:25-29 as "ambient defaults that
-- carry no Data API meaning". Read back from the catalog before this migration,
-- every table carried them for every role:
--
--   prisons | {root=arwdDxt/root,anon=xt/root,authenticated=rdxt/root,service_role=xt/root}
--
-- That dismissal was applied to `TRUNCATE` too, and `TRUNCATE` turned out to be
-- #105 finding 3 and #163. For these two it does hold today, but only
-- conditionally, and the condition is asserted nowhere:
--
--   * `TRIGGER` permits `CREATE TRIGGER`, which additionally needs `EXECUTE` on
--     a trigger function and `CREATE` on a schema to define one.
--   * `REFERENCES` permits a foreign key *into* the table from a table you own,
--     which needs `CREATE` on a schema to have a table at all.
--
-- Read back on the harness: `has_schema_privilege('anon', 'public', 'CREATE')`
-- and the same for `authenticated` and `service_role` are all `f`, so both are
-- inert there. #116 and #163 already ask the owner for `\dn+ public` on the
-- hosted project, which is what decides whether they are inert there. The
-- revoke lands regardless, because a privilege whose harmlessness depends on a
-- second privilege nobody asserts is not a privilege this schema wants to hold.
--
-- THE RULING. #280 §5 put the question to the owner: do the client and trusted
-- tiers keep `REFERENCES` and `TRIGGER` on tables they hold no DML on? The
-- answer is the same one #163 gave for `TRUNCATE` -- revoke it, symmetrically,
-- across the whole schema -- and ADR 0008 §2 now records it beside that one,
-- generalised so it answers the next ambient privilege without a third ruling.
-- COST, and it is the reason this was cheap to decide: nothing in this
-- repository creates a trigger or a foreign key at runtime, and PostgREST
-- exposes no verb that reaches either. No code path loses a capability it was
-- using.
--
-- THE PART #280 DID NOT FIND, and it is the more durable half. Both TRUNCATE
-- revokes note that `on all tables in schema public` expands at execution time,
-- so a table added later inherits the ambient privilege again, and both point
-- at suite 003's schema-wide sweep as the thing that fails when it does.
-- Executed: that is true. A table appended to the previous migration --
-- `create table public.newly_added_table (...)`, RLS enabled, one own-row
-- policy, `grant select ... to authenticated` -- failed suite 003 assertion 20
-- ("no Data API role may TRUNCATE anything in public") on the next run.
--
-- But the sweep catches it *after* the table exists, and the fix a reader then
-- applies is a fourth `revoke truncate on all tables`. The default privilege
-- itself is what keeps regenerating the defect, and it can be revoked once:
--
--   select defaclobjtype, defaclacl from pg_default_acl;   -- before
--    r | {anon=Dxt/root,authenticated=Dxt/root,service_role=Dxt/root}
--    S | {anon=w/root,authenticated=w/root,service_role=w/root}
--
-- `D` is TRUNCATE, `x` REFERENCES, `t` TRIGGER -- on every table created in
-- `public` from now on. Executed before this migration: a freshly created table
-- came out `{root=arwdDxt/root,anon=Dxt/root,authenticated=Dxt/root,service_role=Dxt/root}`
-- and `has_table_privilege('anon', ..., 'TRUNCATE')` was `t`. After the
-- statements below, both `pg_default_acl` rows are gone and a freshly created
-- table and sequence come out with a null ACL -- owner only.
--
-- The sequence row is #280 finding F15's other half. F15 observes that suite
-- 003's grant sweeps filter `relkind in ('r','v','m','p','f')` and so never
-- look at sequences, and that this is vacuous only while no sequence exists
-- (every key here is a `uuid`). The `S` default above is what makes it stop
-- being vacuous: Supabase grants `all` on sequences and revokes only
-- `usage, select`, leaving `UPDATE` -- which is `setval`. The first
-- `bigserial` or identity column would arrive with all three roles able to
-- rewind its counter. Revoking the default closes that before there is
-- anything to close, and suite 003 now sweeps sequences too so the assertion
-- is not merely a comment.
--
-- MAINTAIN is version-guarded rather than skipped. It exists from PostgreSQL 17
-- and this schema is run on 16 and 18 (docs/TESTING.md), so naming it
-- unconditionally is a syntax error on 16 -- which is why #280 left it out. A
-- `do` block reading `server_version_num` names it only where it exists, and it
-- is worth naming: MAINTAIN carries `LOCK TABLE` in the stronger modes as well
-- as VACUUM/ANALYZE/CLUSTER/REINDEX, so on 18 it is the one remaining ambient
-- privilege with an availability cost rather than none.
--
-- WHAT IS NOT CLOSED, stated so it is not read as closed. A default privilege
-- is per (grantor role, schema). These statements are issued by whichever role
-- runs the migration -- `root` on the harness, `postgres` on a hosted project --
-- which is also the role that creates the tables here, so they cover every
-- table this repository's migrations add. A table created in `public` by some
-- *other* role (a dashboard session owned by `supabase_admin`, say) draws on
-- that role's defaults instead. Suite 003's sweeps are schema-wide and
-- role-parameterised, so such a table still fails them; the default privilege
-- narrows how often that can happen, it does not replace the sweep.

-- The nine relations that exist now. `challenge_leaderboard` is a view and
-- already holds no grant for any of the three roles (20260823090100); the
-- revoke is harmless on it and naming `all tables` is what makes the statement
-- a rule rather than a list.
revoke references, trigger on all tables in schema public
  from anon, authenticated, service_role;

do $$
begin
  if current_setting('server_version_num')::int >= 170000 then
    execute 'revoke maintain on all tables in schema public'
         || ' from anon, authenticated, service_role';
  end if;
end
$$;

-- And every table and sequence added after this migration.
alter default privileges in schema public
  revoke truncate, references, trigger on tables from anon, authenticated, service_role;

alter default privileges in schema public
  revoke update on sequences from anon, authenticated, service_role;

do $$
begin
  if current_setting('server_version_num')::int >= 170000 then
    execute 'alter default privileges in schema public'
         || ' revoke maintain on tables from anon, authenticated, service_role';
  end if;
end
$$;
