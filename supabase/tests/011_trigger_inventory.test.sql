-- pgTAP tests for the trigger inventory of `public`, and for the rule that
-- every `updated_at` column in this schema is stamped by the server.
--
-- WHY THIS SUITE EXISTS, and it is the same argument suite 010 makes about
-- multi-column constraints. #280 audited the schema's controls against the
-- suite by mutation -- removing each control and counting the failures -- and
-- found policies uncovered (F1, F2, F6) and multi-column constraints uncovered
-- (F4). It did not look at triggers, and triggers were uncovered too. Measured
-- here, by the same method, on the tree #280 was filed against: dropping
-- `prisons_stamp_updated_at` left every suite green, and narrowing a
-- `before insert or update` trigger to `before update` -- losing exactly the
-- write path 20260824140000 exists to close -- left every suite green as well.
-- Six triggers existed before this suite and `pg_trigger` was read by one
-- assertion in the whole repository, in suite 007, and only to confirm that a
-- named trigger exists.
--
-- The second failure is the interesting one, because it is this repository's
-- signature defect shape applied to its own fix: a control stated for two write
-- paths and enforced on one. 20260824140000's header says so in as many words
-- about `created_at`, and the assertions written beside 20260826130000's
-- trigger could not see it happen to `updated_at`. That is what assertion 2
-- below is for -- the timing, the events and the column list of every trigger,
-- not the fact that a trigger with the right name exists.
--
-- WHAT IS DELIBERATELY NOT PINNED. The trigger *function bodies*. Suite 005
-- pins their declarations (definer rights, `search_path`) and the behavioural
-- probes at the end of this file plus suites 001, 002 and 004 drive what they
-- do; pinning `pg_get_triggerdef` text or a `prosrc` hash would fail on a
-- whitespace edit and on a server version that renders the definition
-- differently, which is the trade suite 010 refuses for `pg_get_constraintdef`
-- and refuses here for the same reason.
--
-- **Residual, stated:** a trigger rewritten in place under the same name, on
-- the same table, with the same timing, events and column list is invisible to
-- the inventory. What holds that is the behavioural coverage: the four probes
-- at the end of this file for the stamp, and suites 002 and 004 for the other
-- six triggers.
--
-- EXECUTED against plain PostgreSQL 16.13 + pgTAP 1.3.2 via `pnpm verify:sql`.
-- NOT executed against the real Supabase local stack or a hosted project; see
-- docs/CLOUD_SAVE.md, "What has and has not been executed".

begin;
select plan(6);

insert into auth.users (id, email) values
  ('aaaaaaa1-0000-0000-0000-000000000001', 'trigger-inventory@example.test');

-- --- The inventory ------------------------------------------------------
--
-- `tgtype` is a bitmask: 1 = FOR EACH ROW, 2 = BEFORE, 4 = INSERT, 8 = DELETE,
-- 16 = UPDATE, 32 = TRUNCATE. Decoded rather than compared as a number, so a
-- failure names the property that changed instead of an integer nobody can
-- read. `tgattr` is the `UPDATE OF (columns)` list and is rendered as `*` when
-- empty, because "every column" and "one column nobody named" are the
-- difference between a trigger that fires and one that does not.
--
-- `tgisinternal` excludes the triggers PostgreSQL creates for foreign key and
-- deferred constraint enforcement. Those are pinned by suite 010's foreign-key
-- inventory, from `pg_constraint`, which is where they are declared.
create temporary view scanned_triggers as
  select c.relname as tbl,
         t.tgname as trg,
         case when (t.tgtype & 2) <> 0 then 'BEFORE' else 'AFTER' end as timing,
         case when (t.tgtype & 1) <> 0 then 'ROW' else 'STATEMENT' end as lvl,
         concat_ws(',',
           case when (t.tgtype & 4) <> 0 then 'INSERT' end,
           case when (t.tgtype & 8) <> 0 then 'DELETE' end,
           case when (t.tgtype & 16) <> 0 then 'UPDATE' end,
           case when (t.tgtype & 32) <> 0 then 'TRUNCATE' end) as events,
         p.proname as fn,
         coalesce(
           (select string_agg(a.attname, ',' order by a.attname)
              from pg_attribute a
             where a.attrelid = c.oid and a.attnum = any(t.tgattr::int[])),
           '*') as cols
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    join pg_proc p on p.oid = t.tgfoid
   where not t.tgisinternal;

select cmp_ok(
  (select count(*)::int from scanned_triggers),
  '>=',
  9,
  'the scan found the triggers it claims to cover; an empty enumeration would satisfy the matrix below'
);

-- `replace(..., e'\r', '')` on the expectation for the reason suites 003 and
-- 005 give: a Windows checkout with `core.autocrlf = true` puts a carriage
-- return inside the dollar-quoted literal that `string_agg(..., e'\n')` never
-- produces, and the resulting diff is invisible in a terminal.
select is(
  (select string_agg(
            tbl || '.' || trg || ': ' || timing || ' ' || events
              || ' FOR EACH ' || lvl || ' -> ' || fn || '(' || cols || ')',
            e'\n' order by tbl, trg)
     from scanned_triggers),
  replace($expected$challenge_submissions.challenge_submissions_enforce_evidence_size: BEFORE INSERT FOR EACH ROW -> enforce_challenge_evidence_size(*)
challenge_submissions.challenge_submissions_verification_transition: BEFORE UPDATE FOR EACH ROW -> enforce_challenge_verification_transition(*)
entitlement_events.entitlement_events_no_update: BEFORE UPDATE FOR EACH ROW -> reject_entitlement_event_update(*)
prisons.prisons_enforce_slot_capacity: BEFORE INSERT,UPDATE FOR EACH ROW -> enforce_prison_slot_capacity(owner_id)
prisons.prisons_stamp_updated_at: BEFORE INSERT,UPDATE FOR EACH ROW -> stamp_updated_at(*)
profiles.profiles_stamp_updated_at: BEFORE INSERT,UPDATE FOR EACH ROW -> stamp_updated_at(*)
save_versions.save_versions_enforce_size: BEFORE INSERT FOR EACH ROW -> enforce_save_version_size(*)
save_versions.save_versions_enforce_storage_prefix: BEFORE INSERT FOR EACH ROW -> enforce_save_version_storage_prefix(*)
user_settings.user_settings_stamp_updated_at: BEFORE INSERT,UPDATE FOR EACH ROW -> stamp_updated_at(*)$expected$, e'\r', ''),
  'every trigger in public is the one its migration writes: same table, timing, events, level, function and UPDATE OF column list'
);

-- --- The rule ADR 0008 section 2 now states -----------------------------
--
-- Shaped as a rule rather than three cases, for the reason suites 003 and 005
-- to 010 are: the three columns #194 found were found by an inventory, not by a
-- failing test, and a fourth table added tomorrow with an `updated_at` and a
-- `default now()` would have been just as invisible. The rule is that
-- **authority over a row is not authority over the record of when it was
-- written** -- so every `updated_at` in `public` is stamped by the server on
-- both write paths, unless the allow-list below says who writes it instead,
-- with a reason.
--
-- Both directions fail, the same construction suite 003's `default now()`
-- allow-list uses: an unstamped and unlisted column fails, and a listed column
-- that gains a stamp trigger fails too, so an entry cannot outlive the state it
-- describes.
create temporary table unstamped_updated_at (tbl text, col text, reason text);

insert into unstamped_updated_at (tbl, col, reason) values
  ('entitlements', 'updated_at',
   'Written explicitly as now() by record_entitlement_event()''s upsert (20260823090000:184-194), which is the only write path: the table holds no INSERT or UPDATE grant for any of the three Data API roles, and the projection is recomputed rather than edited. A trigger would stamp a value that function already sets.');

select is_empty(
  $$ select c.relname || '.' || a.attname
       from pg_attribute a
       join pg_class c on c.oid = a.attrelid
       join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      where c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
        and a.attname = 'updated_at'
        and not exists (
          select 1 from scanned_triggers s
           where s.tbl = c.relname
             and s.fn = 'stamp_updated_at'
             and s.timing = 'BEFORE'
             and s.lvl = 'ROW'
             and s.events = 'INSERT,UPDATE'
             and s.cols = '*')
        and not exists (select 1 from unstamped_updated_at w
                         where w.tbl = c.relname and w.col = a.attname) $$,
  'every updated_at in public is stamped by the server on both write paths, or is allow-listed with a reason'
);

select is_empty(
  $$ select w.tbl || '.' || w.col from unstamped_updated_at w
      where exists (select 1 from scanned_triggers s
                     where s.tbl = w.tbl and s.fn = 'stamp_updated_at') $$,
  'no allow-listed column has quietly gained a stamp trigger, so an entry cannot outlive the state it describes'
);

-- --- The behaviour, on both write paths and all three tables ------------
--
-- The INSERT half needs a privileged writer, and that is the point rather than
-- a workaround. `updated_at` is out of every client grant, so no client role
-- can name it on an INSERT and no client probe can distinguish a trigger that
-- fires on INSERT from the `default now()` that would supply the same value.
-- The table owner can name it, so the owner is who plants a value the trigger
-- has to overwrite -- which also asserts that the stamp has no exempt write
-- path, the property `entitlement_events`' append-only trigger relies on too.
--
-- `now()` is the transaction timestamp and this suite is one transaction, so
-- the comparison is against `now()` rather than against a wall clock.
insert into public.profiles (id, updated_at)
  values ('aaaaaaa1-0000-0000-0000-000000000001', '2020-01-01T00:00:00Z');
insert into public.prisons (id, owner_id, game_version, slot_index, updated_at)
  values ('aaaaaaa1-0000-0000-0000-000000000002',
          'aaaaaaa1-0000-0000-0000-000000000001', 'lockstate-0.0.0', 0,
          '2020-01-01T00:00:00Z');
insert into public.user_settings (user_id, settings_schema_version, payload, updated_at)
  values ('aaaaaaa1-0000-0000-0000-000000000001', 1, '{"a": 1}'::jsonb,
          '2020-01-01T00:00:00Z');

select is(
  (select string_agg(t, ' ' order by t) from (
     select 'profiles=' || (updated_at = now())::text as t from public.profiles
      where id = 'aaaaaaa1-0000-0000-0000-000000000001'
     union all
     select 'prisons=' || (updated_at = now())::text from public.prisons
      where id = 'aaaaaaa1-0000-0000-0000-000000000002'
     union all
     select 'user_settings=' || (updated_at = now())::text from public.user_settings
      where user_id = 'aaaaaaa1-0000-0000-0000-000000000001') as r),
  'prisons=true profiles=true user_settings=true',
  'an INSERT naming updated_at is overwritten with now() on all three tables: the stamp holds on the insert path too'
);

-- And the UPDATE half, from a stale value the trigger has to be disabled to
-- plant -- which no client role can do, because `alter table ... disable
-- trigger` needs the table owner.
alter table public.prisons disable trigger prisons_stamp_updated_at;
alter table public.profiles disable trigger profiles_stamp_updated_at;
alter table public.user_settings disable trigger user_settings_stamp_updated_at;
update public.prisons set updated_at = '2020-01-01T00:00:00Z'
  where id = 'aaaaaaa1-0000-0000-0000-000000000002';
update public.profiles set updated_at = '2020-01-01T00:00:00Z'
  where id = 'aaaaaaa1-0000-0000-0000-000000000001';
update public.user_settings set updated_at = '2020-01-01T00:00:00Z'
  where user_id = 'aaaaaaa1-0000-0000-0000-000000000001';
alter table public.prisons enable trigger prisons_stamp_updated_at;
alter table public.profiles enable trigger profiles_stamp_updated_at;
alter table public.user_settings enable trigger user_settings_stamp_updated_at;

update public.prisons set display_name = 'renamed'
  where id = 'aaaaaaa1-0000-0000-0000-000000000002';
update public.profiles set display_name = 'renamed'
  where id = 'aaaaaaa1-0000-0000-0000-000000000001';
update public.user_settings set payload = '{"a": 2}'::jsonb
  where user_id = 'aaaaaaa1-0000-0000-0000-000000000001';

select is(
  (select string_agg(t, ' ' order by t) from (
     select 'profiles=' || (updated_at = now())::text as t from public.profiles
      where id = 'aaaaaaa1-0000-0000-0000-000000000001'
     union all
     select 'prisons=' || (updated_at = now())::text from public.prisons
      where id = 'aaaaaaa1-0000-0000-0000-000000000002'
     union all
     select 'user_settings=' || (updated_at = now())::text from public.user_settings
      where user_id = 'aaaaaaa1-0000-0000-0000-000000000001') as r),
  'prisons=true profiles=true user_settings=true',
  'an UPDATE that never names updated_at still moves it off a planted 2020 value on all three tables'
);

select * from finish();
rollback;
