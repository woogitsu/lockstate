-- pgTAP tests for the row level security POLICIES themselves: the catalog
-- surface (which policies exist, on what, for whom, saying what), and the
-- behaviour each one produces in both directions.
--
-- WHY THIS SUITE EXISTS. Suite 003 asserts that every table in `public` has
-- RLS *enabled* and pins the grant surface exhaustively. Neither of those
-- reads a policy. A policy is the other half of the control: a grant decides
-- whether a role may touch the table at all, RLS-enabled decides whether
-- policies are consulted, and the policy decides which rows come back. Until
-- this file existed the whole 233-assertion suite asserted the first two and
-- almost nothing about the third, and the gap was not theoretical -- it was
-- measured, one mutation at a time, on a scratch database prepared by
-- `pnpm verify:sql`. Every one of these passed 233/233:
--
--   * `alter policy save_versions_select_own ... using (true)` -- every
--     signed-in identity reads every cloud save payload in the database;
--   * `alter policy challenge_submissions_select_own ... using (true)`;
--   * `alter policy user_settings_select_own ... using (true)`;
--   * `alter policy entitlements_select_own ... using (true)`;
--   * `alter policy profiles_select_own ... using (true)`;
--   * `alter policy prisons_update_own_metadata ... using (true) with check (true)`;
--   * `alter policy profiles_insert_own ... with check (true)`;
--   * `alter policy user_settings_insert_own ... with check (true)`;
--   * `drop policy profiles_select_own`, `drop policy entitlements_select_own`,
--     `drop policy entitlement_events_select_own`,
--     `drop policy user_settings_delete_own`, `drop policy prisons_delete_own`.
--
-- With `[auth] enable_anonymous_sign_ins = true` the `authenticated` role is
-- effectively anyone, so the `using (true)` half of that list is the whole
-- confidentiality boundary of this schema, and it was unasserted.
--
-- TWO SHAPES OF GAP, and this suite closes both because they fail
-- differently:
--
--   * **A widened predicate** needs an ISOLATION assertion -- a second
--     account reading the first account's row and getting nothing.
--   * **A deleted policy** needs a REACHABILITY assertion -- the owner
--     reading their own row and getting it. An isolation assertion alone
--     cannot see a dropped policy, because RLS with no policy denies
--     everything and a cross-account read still returns zero rows. That is
--     exactly why `entitlement_events_select_own` could be dropped with the
--     suite green while widening it was caught: suite 002 asserts that a
--     different account reads none of the ledger, and nothing asserted that
--     the owner reads their own.
--
-- WHAT IS ASSERTED AS A RULE RATHER THAN AS A LIST, following suites 005,
-- 007 and 008: a policy added tomorrow is covered by the rules in section A
-- whether or not anyone remembers to add a case for it here.
--
-- ONE POLICY CANNOT BE PROBED BEHAVIOURALLY, and it is said out loud rather
-- than left for a reader to assume it was: `prisons_update_own_metadata`.
-- PostgreSQL applies the SELECT policies to the rows an UPDATE has to read,
-- so a foreign UPDATE on `prisons` is already refused by
-- `prisons_select_own` before the UPDATE policy is consulted -- measured:
-- widening the UPDATE policy to `using (true) with check (true)` leaves
-- suite 001's "the foreign UPDATE/DELETE left the owner's prison untouched"
-- green, because that assertion is testing the SELECT policy a second time.
-- No probe can separate the two while the SELECT policy is the narrower of
-- them, so the UPDATE policy is held by the catalog matrix in section A and
-- by nothing else, and that is the honest description of its coverage.
--
-- SECTION C is the other end of the same contract. Every ownership predicate
-- above reads a column that is a foreign key into `auth.users`, and
-- `docs/TRUSTED_SERVICES.md` ("Data retention and account deletion") plus
-- `20260823090000_create_entitlement_events.sql` both rest on those keys
-- cascading -- the ledger has no DELETE grant for any role precisely because
-- account deletion is expected to reach it that way. Nothing executed it.
--
-- EXECUTED against plain PostgreSQL 16.13 + pgTAP 1.3.2 via `pnpm
-- verify:sql`, with every role-switched probe inside this file's explicit
-- transaction block and `current_user` read back as an assertion (a
-- `set local role` outside a transaction block silently no-ops and leaves
-- the session privileged). NOT executed against the real Supabase local
-- stack or a hosted project; see docs/CLOUD_SAVE.md, "What has and has not
-- been executed".

begin;
select plan(25);

-- --- Section A: the catalog surface -----------------------------------

-- One row per policy, naming everything a policy decides: the table, the
-- command, permissive-vs-restrictive, the roles it applies to, and both
-- expressions. This is the assertion that fails when a policy is dropped,
-- added, widened, narrowed, re-scoped to a role or switched between
-- permissive and restrictive.
--
-- The expressions are whitespace-normalised because `pg_get_expr` renders
-- `save_versions_select_own`'s EXISTS subquery across four lines, which would
-- otherwise put newlines inside rows of a newline-separated aggregate. Any
-- change to a predicate still changes its normalised text.
--
-- `replace(..., e'\r', '')` on the expectation is not cosmetic, and is here
-- for the reason suites 003 and 005 give for the same guard: a Windows
-- checkout with `core.autocrlf = true` stores this file with CRLF endings,
-- which puts a carriage return inside the dollar-quoted literal while
-- `string_agg(..., e'\n')` produces none.
select is(
  (select string_agg(
            c.relname || ':' || p.polname
              || ':' || case p.polcmd
                          when 'r' then 'select' when 'a' then 'insert'
                          when 'w' then 'update' when 'd' then 'delete'
                          when '*' then 'all' else 'unknown' end
              || ':' || case when p.polpermissive then 'permissive' else 'restrictive' end
              || ':' || coalesce((select string_agg(r.rolname, '+' order by r.rolname)
                                    from unnest(p.polroles) as pr(oid)
                                    join pg_roles r on r.oid = pr.oid), 'PUBLIC')
              || ':using=' || coalesce(btrim(regexp_replace(pg_get_expr(p.polqual, p.polrelid), '\s+', ' ', 'g')), '<none>')
              || ':check=' || coalesce(btrim(regexp_replace(pg_get_expr(p.polwithcheck, p.polrelid), '\s+', ' ', 'g')), '<none>'),
            e'\n' order by c.relname, p.polname)
     from pg_policy p
     join pg_class c on c.oid = p.polrelid
     join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'),
  replace($expected$challenge_definitions:challenge_definitions_public_read:select:permissive:PUBLIC:using=((published_at <= now()) AND (opens_at <= now())):check=<none>
challenge_submissions:challenge_submissions_select_own:select:permissive:PUBLIC:using=(auth.uid() = user_id):check=<none>
entitlement_events:entitlement_events_select_own:select:permissive:PUBLIC:using=(auth.uid() = user_id):check=<none>
entitlements:entitlements_select_own:select:permissive:PUBLIC:using=(auth.uid() = user_id):check=<none>
prisons:prisons_delete_own:delete:permissive:PUBLIC:using=(auth.uid() = owner_id):check=<none>
prisons:prisons_insert_own:insert:permissive:PUBLIC:using=<none>:check=((auth.uid() = owner_id) AND (current_version_id IS NULL) AND (current_revision = 0))
prisons:prisons_select_own:select:permissive:PUBLIC:using=(auth.uid() = owner_id):check=<none>
prisons:prisons_update_own_metadata:update:permissive:PUBLIC:using=(auth.uid() = owner_id):check=(auth.uid() = owner_id)
profiles:profiles_insert_own:insert:permissive:PUBLIC:using=<none>:check=(auth.uid() = id)
profiles:profiles_select_own:select:permissive:PUBLIC:using=(auth.uid() = id):check=<none>
profiles:profiles_update_own:update:permissive:PUBLIC:using=(auth.uid() = id):check=(auth.uid() = id)
save_versions:save_versions_select_own:select:permissive:PUBLIC:using=(EXISTS ( SELECT 1 FROM prisons WHERE ((prisons.id = save_versions.prison_id) AND (prisons.owner_id = auth.uid())))):check=<none>
user_settings:user_settings_delete_own:delete:permissive:PUBLIC:using=(auth.uid() = user_id):check=<none>
user_settings:user_settings_insert_own:insert:permissive:PUBLIC:using=<none>:check=(auth.uid() = user_id)
user_settings:user_settings_select_own:select:permissive:PUBLIC:using=(auth.uid() = user_id):check=<none>
user_settings:user_settings_update_own:update:permissive:PUBLIC:using=(auth.uid() = user_id):check=(auth.uid() = user_id)$expected$, e'\r', ''),
  'every policy in public is exactly the one its migration writes: same table, command, kind, roles and both expressions'
);

-- Vacuity guard, for the reason suites 003, 007 and 008 carry one: three of
-- the four rules below are satisfied by an empty scan, so a query that
-- stopped finding policies would read as total compliance.
select cmp_ok(
  (select count(*)::int
     from pg_policy p
     join pg_class c on c.oid = p.polrelid
     join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'),
  '>=',
  16,
  'the scan found the policies it claims to cover; an empty enumeration would satisfy every rule below'
);

-- Suite 003 asserts `relrowsecurity` on every table. Enabled with no policy
-- is a different state and a different failure: RLS with no policy denies
-- every row to every non-owning role, so the table becomes unreadable
-- instead of unprotected. That fails closed, which is why it needs its own
-- assertion -- it is the one RLS mistake that never shows up as a leak.
--
-- TWO TABLES ARE EXCLUDED, and they are named rather than pattern-matched, the
-- way `challenge_definitions_public_read` is named in the identity rule below.
-- `public.telemetry_events` (20260904090000, ADR 0046) is the first table in
-- this schema for which deny-all is the **intent**: no role holds any
-- privilege on it, its single write path is a SECURITY DEFINER function that
-- runs as the table owner and therefore bypasses RLS, and ADR 0046 requires
-- "no RLS policy granting `anon` or `authenticated` any verb". RLS is enabled
-- on it for one purpose -- so that a later migration granting a client role
-- SELECT gets deny-all instead of every row -- and a `using (false)` policy
-- written only to satisfy this assertion would be an object that protects
-- nothing, which is the "control that reads as protection" shape this
-- repository keeps finding.
--
-- `public.telemetry_retention_runs` (same migration) is the second, on exactly
-- the same ground and with one addition of its own: it is the audit trail of a
-- deletion, so a read grant on it would tell a reader when telemetry was
-- deleted and how much -- which is a second capability for a credential whose
-- whole point is that it has one. Its only writer is
-- `enforce_telemetry_retention()`, which is SECURITY DEFINER and runs as the
-- owner.
--
-- **This comment read "ONE TABLE IS EXCLUDED" until 2026-09-04**, when the
-- owner ruled for a fourth object and the retention job landed as a function
-- and this audit table. The count is the part that changed; the argument for
-- excluding a deliberate deny-all is unedited.
--
-- What the exclusion costs: if either table is ever meant to become readable,
-- nothing here notices that it has no policy. What holds that instead is
-- suite 012's assertions that no role can read either of them, which fail in
-- the same change that grants one.
select is(
  (select string_agg(c.relname, ' ' order by c.relname)
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relrowsecurity
      and c.relname not in ('telemetry_events', 'telemetry_retention_runs')
      and not exists (select 1 from pg_policy p where p.polrelid = c.oid)),
  null,
  'every RLS-enabled table in public except the two deliberate deny-all telemetry tables carries at least one policy'
);

-- The literal the challenge read policy used to be. `using (true)` on a
-- table with a `grant select ... to authenticated` hands every row to every
-- signed-in visitor, and with anonymous sign-in on that is every visitor.
-- Stated over the catalog so it holds for a policy nobody has written yet.
select is(
  (select string_agg(c.relname || '.' || p.polname, ' ' order by c.relname, p.polname)
     from pg_policy p
     join pg_class c on c.oid = p.polrelid
     join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where btrim(coalesce(pg_get_expr(p.polqual, p.polrelid), '')) = 'true'
       or btrim(coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')) = 'true'),
  null,
  'no policy in public admits every row unconditionally'
);

-- Two properties that are invisible in a per-table reading and change what
-- every other policy means. A RESTRICTIVE policy ANDs with the permissive
-- ones instead of ORing, so adding one silently narrows a table nobody
-- edited; and a policy scoped `to service_role` (or to any named role)
-- applies to that role alone, so the same predicate protects a different
-- set of callers than it appears to. This schema writes neither, and the
-- matrix above pins today's list -- this is the rule that covers tomorrow's.
select is(
  (select string_agg(c.relname || '.' || p.polname, ' ' order by c.relname, p.polname)
     from pg_policy p
     join pg_class c on c.oid = p.polrelid
     join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where not p.polpermissive
       or p.polroles <> '{0}'::oid[]),
  null,
  'every policy in public is permissive and applies to PUBLIC, so no role sees a different rule from the one written'
);

-- Every policy here is an ownership check, and an ownership check that does
-- not read the caller's identity is not one. The single exception is named
-- rather than pattern-matched, the way suite 005 names the four unpinned
-- limit helpers: `challenge_definitions_public_read` is identity-free on
-- purpose, because a signed definition is meant to be readable by anyone
-- once it has been published and has opened.
select is(
  (select string_agg(c.relname || '.' || p.polname, ' ' order by c.relname, p.polname)
     from pg_policy p
     join pg_class c on c.oid = p.polrelid
     join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where p.polname <> 'challenge_definitions_public_read'
      and coalesce(pg_get_expr(p.polqual, p.polrelid), '') || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
          not like '%auth.uid()%'),
  null,
  'every policy except the published-definition read names auth.uid(), so no ownership rule forgets whose row it is'
);

-- --- Section B: what those policies actually do -----------------------
--
-- Two accounts, and a full set of rows for the first one. Seeded as the
-- privileged role the suite is invoked with, so the fixtures do not depend
-- on the INSERT policies the reads below are meant to isolate.

insert into auth.users (id, email) values
  ('0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a', 'policy-a@example.test'),
  ('0b0b0b0b-0b0b-0b0b-0b0b-0b0b0b0b0b0b', 'policy-b@example.test');

insert into public.profiles (id, display_name) values
  ('0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a', 'account A');

insert into public.user_settings (user_id, settings_schema_version, payload) values
  ('0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a', 1, '{"bindings":{}}'::jsonb);

-- Two prisons: one to delete through `prisons_delete_own`, and one to leave
-- standing so the cascade probe in section C has a prison AND a save version
-- to remove. `prisons_current_version_fk` has no ON DELETE action of its
-- own, so a prison carrying a pointer is the case worth exercising.
insert into public.prisons (id, owner_id, game_version, slot_index) values
  ('0a0a0a0a-1111-1111-1111-111111111111', '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a', 'lockstate-0.0.0', 0),
  ('0a0a0a0a-2222-2222-2222-222222222222', '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a', 'lockstate-0.0.0', 1);

insert into public.save_versions (prison_id, revision, save_schema_version, checksum, payload, byte_size) values
  ('0a0a0a0a-2222-2222-2222-222222222222', 1, 1, 'policyprobe00001', '{"tick":0}'::jsonb, 11);
update public.prisons
   set current_version_id = (select id from public.save_versions
                              where prison_id = '0a0a0a0a-2222-2222-2222-222222222222'),
       current_revision = 1
 where id = '0a0a0a0a-2222-2222-2222-222222222222';

insert into public.challenge_definitions
  (challenge_id, version, definition, definition_hash, signature, opens_at, closes_at, published_at)
values ('challenge.policy-probe', 1, '{"id":"challenge.policy-probe"}'::jsonb, '00ff00ff00ff00ff',
        '{"algorithm":"ed25519","keyId":"key.test","value":"AAAA"}'::jsonb,
        now() - interval '1 day', now() + interval '1 day', now() - interval '1 day');

insert into public.challenge_submissions
  (user_id, challenge_id, challenge_version, evidence_hash, evidence, claimed_metrics)
values ('0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a', 'challenge.policy-probe', 1, '0a0a0a0a0a0a0a0a',
        '{"challengeId":"challenge.policy-probe","challengeVersion":1,"commands":[]}'::jsonb,
        '{"score":1}'::jsonb);

-- The ledger event goes through the trusted path, as `service_role`, so the
-- projection it writes is the one the real webhook would produce rather than
-- a hand-inserted row.
set local role service_role;
select lives_ok(
  $$ select * from public.record_entitlement_event(
       '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a', 'product.save-slots.plus-5', 'save-slots', 'grant',
       'payment-webhook', 5, 'provider.test', 'evt-policy-probe', now() - interval '1 hour',
       'provider', 'provider.test', 'purchase-completed', null) $$,
  'the trusted path seeds one ledger event and the projection derived from it'
);
reset role;

-- --- Reachability: the owner can read every row that is theirs ---------
--
-- This is the half a cross-account assertion cannot hold. RLS with no policy
-- denies everything, so dropping a policy leaves an isolation assertion
-- passing and only a reachability assertion fails.

select set_config('request.jwt.claim.sub', '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a', true);
set local role authenticated;

select is(current_user::text, 'authenticated', 'the owner-side probes below run as the client role, not as the owner of the tables');

select is(
  (select count(*)::int from public.profiles where id = '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a'),
  1,
  'profiles_select_own is reachable: an account reads its own profile'
);

select is(
  (select count(*)::int from public.user_settings where user_id = '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a'),
  1,
  'user_settings_select_own is reachable: an account reads its own settings'
);

select is(
  (select count(*)::int from public.entitlements where user_id = '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a'),
  1,
  'entitlements_select_own is reachable: an account reads the projection its capacity comes from'
);

-- The audit trail whose whole justification is that a player can see it:
-- "an entitlement a player cannot see the reason for is indistinguishable
-- from one we invented" (20260823090000). Suite 002 asserts that somebody
-- else cannot read it; this is the assertion that the owner can.
select is(
  (select count(*)::int from public.entitlement_events where user_id = '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a'),
  1,
  'entitlement_events_select_own is reachable: an account reads its own audit trail'
);

-- --- prisons_delete_own, which nothing drove in either direction -------
--
-- The delete runs here, as the client role; the assertion that follows reads
-- the result back after `reset role`, as the privileged role this suite is
-- invoked with. Reading it back as the client would be ambiguous -- a row a
-- DELETE policy refused and a row a SELECT policy hides both count zero --
-- and an RLS-exempt reader tells the two apart. The second prison is left
-- standing for section C.

delete from public.prisons where id = '0a0a0a0a-1111-1111-1111-111111111111';

reset role;

select is(
  (select count(*)::int from public.prisons
    where id = '0a0a0a0a-1111-1111-1111-111111111111'),
  0,
  'prisons_delete_own is reachable: the prison the owner deleted is gone, read back by an RLS-exempt role'
);

-- --- Isolation: a second account reads none of it ---------------------
--
-- Each of these is a `using (true)` mutation that passed the whole suite
-- before this file existed. `save_versions` is the one that matters most:
-- the payload column is the player's entire prison.

select set_config('request.jwt.claim.sub', '0b0b0b0b-0b0b-0b0b-0b0b-0b0b0b0b0b0b', true);
set local role authenticated;

select is(current_user::text, 'authenticated', 'the isolation probes below run as a second client identity');

select is(
  (select count(*)::int from public.profiles where id = '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a'),
  0,
  'a different account reads none of another account''s profile'
);

select is(
  (select count(*)::int from public.save_versions
    where prison_id = '0a0a0a0a-2222-2222-2222-222222222222'),
  0,
  'a different account reads none of another account''s save versions -- the payload is the whole prison'
);

select is(
  (select count(*)::int from public.entitlements where user_id = '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a'),
  0,
  'a different account reads none of another account''s entitlement projection'
);

select is(
  (select count(*)::int from public.challenge_submissions
    where user_id = '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a'),
  0,
  'a different account reads none of another account''s challenge submissions'
);

select is(
  (select count(*)::int from public.user_settings
    where user_id = '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a'),
  0,
  'a different account reads none of another account''s cloud-synced settings'
);

reset role;

-- --- user_settings_delete_own, last, because it removes the row above --
--
-- Back as the first account, deliberately after the isolation block: the
-- settings row has to survive long enough to be the thing account B fails to
-- read, and a table whose primary key is `user_id` cannot hold a second row
-- to spare.

select set_config('request.jwt.claim.sub', '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a', true);
set local role authenticated;

select is(current_user::text, 'authenticated', 'the settings delete below runs as the owning client identity');

delete from public.user_settings where user_id = '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a';

reset role;

select is(
  (select count(*)::int from public.user_settings
    where user_id = '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a'),
  0,
  'user_settings_delete_own is reachable: the row the account deleted is gone, read back by an RLS-exempt role'
);

-- --- Section C: the other end of ownership ----------------------------
--
-- Every predicate in section A reads a column that is a foreign key into
-- `auth.users`. `docs/TRUSTED_SERVICES.md` ("Data retention and account
-- deletion") and `20260823090000_create_entitlement_events.sql` both rest on
-- those keys cascading: the ledger deliberately grants DELETE to nobody
-- *because* account deletion is expected to reach it through the cascade. So
-- the cascade is a documented control, and it was executed by nothing.

select cmp_ok(
  (select count(*)::int
     from pg_constraint k
     join pg_class c on c.oid = k.conrelid
     join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where k.contype = 'f' and k.confrelid = 'auth.users'::regclass),
  '>=',
  6,
  'the scan found the account-owned tables it claims to cover'
);

select is(
  (select string_agg(c.relname, ' ' order by c.relname)
     from pg_constraint k
     join pg_class c on c.oid = k.conrelid
     join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where k.contype = 'f'
      and k.confrelid = 'auth.users'::regclass
      and k.confdeltype <> 'c'),
  null,
  'every foreign key into auth.users cascades on delete, so no table can outlive the account that owns its rows'
);

-- And the behaviour, once, through the prison that still carries a
-- `current_version_id`: `prisons_current_version_fk` has no ON DELETE action,
-- so this is the case where the cascade has to remove a prison and the save
-- version its own pointer references within one statement.
select lives_ok(
  $$ delete from auth.users where id = '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a' $$,
  'deleting the account succeeds even though one of its prisons points at one of its save versions'
);

select is(
  (select (select count(*)::int from public.prisons where owner_id = '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a')
        + (select count(*)::int from public.save_versions where prison_id = '0a0a0a0a-2222-2222-2222-222222222222')
        + (select count(*)::int from public.profiles where id = '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a')
        + (select count(*)::int from public.entitlements where user_id = '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a')
        + (select count(*)::int from public.entitlement_events where user_id = '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a')
        + (select count(*)::int from public.challenge_submissions where user_id = '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a')),
  0,
  'the cascade removed every row the account owned: prisons, save versions, profile, projection, ledger and submissions'
);

select * from finish();
rollback;
