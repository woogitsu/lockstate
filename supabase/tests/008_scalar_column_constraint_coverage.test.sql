-- pgTAP tests that every numeric and timestamp column in `public` either
-- carries a constraint or is accounted for with a reason (issue #191).
--
-- WHAT THIS SUITE IS FOR. Suite 007 does this for `text`/`jsonb`/`bytea`, where
-- the concern is size and every column turned out to be coverable. Here the
-- concern is different and so is the answer: an integer cannot be unbounded in
-- the storage-exhaustion sense, but it can hold nonsense --
-- `user_settings.settings_schema_version` accepted `-2147483648` until
-- 20260824101000 -- and a timestamp legitimately may be unconstrained. So this
-- suite has an escape hatch suite 007 does not need, and the escape hatch is
-- the interesting part: an entry there must carry a reason, and it fails if the
-- column later gains a constraint. An allow-list that cannot go stale is worth
-- having; one that can is worse than none.
--
-- SCOPE, and what is excluded by type rather than by decision. `uuid` and
-- `boolean` columns are not scanned: their domains are already exactly what the
-- contract permits (128 bits, or two values), so there is nothing a constraint
-- could add. Every type whose domain is *wider* than its contract is in scope:
-- `integer`, `bigint`, `smallint`, `numeric`, `double precision`, and
-- `timestamp with time zone`.
--
-- WHAT THIS SUITE DOES NOT ASSERT. Not that any bound is the right number, and
-- not that any constraint refuses anything -- suites 001, 002, 004 and 006 do
-- that for the columns they created. This one asserts coverage and
-- accountability, which no other suite holds.
--
-- EXECUTED against plain PostgreSQL via `pnpm verify:sql`.

begin;
select plan(11);

-- --- The declaration --------------------------------------------------

create temporary table constrained_columns (
  tbl text not null,
  col text not null,
  mechanism text not null,
  object_name text,
  -- Required for `unconstrained-by-decision` and NULL otherwise. A reason is
  -- what separates "nobody got to this" from "this is right"; the assertion
  -- below refuses an empty one.
  reason text
);

insert into constrained_columns (tbl, col, mechanism, object_name, reason) values
  -- Integers with a range. Every one of these bounds a counter, an index, a
  -- size or a schema version at its natural floor.
  ('challenge_definitions', 'version',                 'range-check', 'challenge_definitions_version_check', null),
  ('challenge_submissions', 'challenge_version',       'range-check', 'challenge_submissions_challenge_version_check', null),
  ('entitlement_events',    'quantity',                'range-check', 'entitlement_events_quantity_check', null),
  ('prisons',               'current_revision',        'range-check', 'prisons_current_revision_non_negative', null),
  ('prisons',               'slot_index',              'range-check', 'prisons_slot_index_positive', null),
  ('save_versions',         'byte_size',               'range-check', 'save_versions_byte_size_non_negative', null),
  ('save_versions',         'revision',                'range-check', 'save_versions_revision_positive', null),
  ('save_versions',         'save_schema_version',     'range-check', 'save_versions_save_schema_version_check', null),
  ('user_settings',         'settings_schema_version', 'range-check', 'user_settings_schema_version_check', null),

  -- Pinned rather than bounded, and deliberately the only one: the ledger's
  -- schema version is part of ADR 0008's event contract, so a new version needs
  -- a migration by design. The two other `*_schema_version` columns are ranges
  -- for the opposite reason -- a pin would refuse a version before the
  -- migration admitting it could exist.
  ('entitlement_events',    'schema_version',          'pinned-literal', 'entitlement_events_schema_version_check', null),

  -- The one float. `double precision` admits NaN and both infinities, and
  -- PostgreSQL orders NaN above every other float -- above Infinity -- so on
  -- `challenge_submissions_ranking_idx` a single NaN takes permanent first
  -- place. See 20260824130000 for the measurement.
  ('challenge_submissions', 'ranked_score',            'finite-check', 'challenge_submissions_ranked_score_finite', null),

  -- Timestamps constrained against each other rather than absolutely. This is
  -- the right shape for them: what makes a window wrong is its ordering, not
  -- its position in the calendar.
  ('challenge_definitions', 'opens_at',                'relational-check', 'challenge_definitions_window', null),
  ('challenge_definitions', 'closes_at',               'relational-check', 'challenge_definitions_window', null),
  ('entitlement_events',    'occurred_at',             'relational-check', 'entitlement_events_expiry_after_occurrence', null),
  ('entitlement_events',    'expires_at',              'relational-check', 'entitlement_events_expiry_after_occurrence', null),

  -- Unconstrained, with reasons. Two distinct kinds, and the difference
  -- matters: the first kind is settled, the second is an open finding.
  --
  -- (a) Server-defaulted and unreachable from either client role. An absolute
  --     bound on a timestamp is a product question -- is a challenge opening in
  --     the year 4000 wrong? -- and these cannot be set by anyone the contract
  --     does not already trust.
  ('challenge_definitions', 'published_at',  'unconstrained-by-decision', null,
   'Server-defaulted; INSERT is service_role only. An absolute calendar bound would be a product decision, and no client can reach this column.'),
  ('challenge_submissions', 'submitted_at',  'unconstrained-by-decision', null,
   'Server-defaulted; no client or service_role grant. Written only through submit_challenge_evidence().'),
  ('challenge_submissions', 'verified_at',   'unconstrained-by-decision', null,
   'Written only by the verifier''s four-column service_role UPDATE grant. Nullable by design until a verdict exists.'),
  ('entitlement_events',    'recorded_at',   'unconstrained-by-decision', null,
   'Server-defaulted; no client or service_role grant. Written only through record_entitlement_event().'),
  ('entitlements',          'granted_at',    'unconstrained-by-decision', null,
   'Server-defaulted; no client or service_role grant. Written only by the ledger recompute.'),
  ('entitlements',          'updated_at',    'unconstrained-by-decision', null,
   'Server-defaulted; no client or service_role grant. Written only by the ledger recompute.'),
  ('save_versions',         'created_at',    'unconstrained-by-decision', null,
   'Server-defaulted; no client grant. Written only through create_save_version().'),

  -- (b) Client-writable, and that is a finding rather than a decision. A
  --     client can set these at insert time and walk `updated_at` backwards --
  --     reproduced in #194. They are listed here so this suite records the open
  --     finding instead of reading as though the state were intended; the
  --     entries move to a real mechanism when #194 is acted on.
  ('prisons',               'created_at',    'unconstrained-by-decision', null,
   'CLIENT-WRITABLE at insert time and not by intent: the prisons UPDATE grant deliberately excludes created_at, but the table-level INSERT grant covers it. Open finding #194.'),
  ('prisons',               'updated_at',    'unconstrained-by-decision', null,
   'CLIENT-WRITABLE by explicit grant. Whether a client may set its own updated_at is the decision in #194; a client-supplied value cannot be trusted for ordering.'),
  ('profiles',              'created_at',    'unconstrained-by-decision', null,
   'CLIENT-WRITABLE via table-level INSERT and UPDATE; no column-level treatment exists on this table. Open finding #194.'),
  ('profiles',              'updated_at',    'unconstrained-by-decision', null,
   'CLIENT-WRITABLE via table-level INSERT and UPDATE. Open finding #194.'),
  ('user_settings',         'updated_at',    'unconstrained-by-decision', null,
   'CLIENT-WRITABLE via table-level INSERT and UPDATE. Open finding #194.');

-- --- The enumeration, from the catalog --------------------------------

create temporary view scanned_scalars as
  select c.relname as tbl, a.attname as col,
         format_type(a.atttypid, a.atttypmod) as typ
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  where c.relkind = 'r'
    and format_type(a.atttypid, a.atttypmod) in
      ('integer', 'bigint', 'smallint', 'numeric', 'double precision', 'timestamp with time zone');

select cmp_ok(
  (select count(*)::int from scanned_scalars),
  '>=',
  20,
  'the scan found the columns it claims to cover; an empty enumeration would satisfy every assertion below'
);

-- --- Coverage, in both directions -------------------------------------

select is_empty(
  $$ select tbl || '.' || col from scanned_scalars
     except
     select tbl || '.' || col from constrained_columns $$,
  'every numeric and timestamp column in public is declared, either with a mechanism or with a reason'
);

select is_empty(
  $$ select tbl || '.' || col from constrained_columns
     except
     select tbl || '.' || col from scanned_scalars $$,
  'every declared column still exists, so this table cannot go stale silently'
);

select is_empty(
  $$ select tbl || '.' || col from constrained_columns group by 1 having count(*) > 1 $$,
  'no column is declared twice'
);

-- --- The vocabulary is closed, and the shapes are consistent ----------

select is_empty(
  $$ select distinct mechanism from constrained_columns
     where mechanism not in
       ('range-check', 'pinned-literal', 'finite-check', 'relational-check', 'unconstrained-by-decision') $$,
  'every declared mechanism is one of the five this schema uses, so a typo cannot invent one'
);

select is_empty(
  $$ select tbl || '.' || col from constrained_columns
     where (mechanism = 'unconstrained-by-decision') <> (object_name is null) $$,
  'an unconstrained column names no object and every constrained one names one'
);

select is_empty(
  $$ select tbl || '.' || col from constrained_columns
     where (mechanism = 'unconstrained-by-decision') <> (reason is not null) $$,
  'exactly the unconstrained columns carry a reason'
);

-- A reason has to say something. Sixty characters is not a quality bar, but it
-- refuses `'TODO'`, which is the failure mode an allow-list actually has.
select is_empty(
  $$ select tbl || '.' || col from constrained_columns
     where mechanism = 'unconstrained-by-decision' and char_length(reason) < 60 $$,
  'every reason is long enough to be a reason rather than a placeholder'
);

-- --- Each declared object exists and constrains its column ------------

select is_empty(
  $$ select b.tbl || '.' || b.col || ' -> ' || b.object_name
     from constrained_columns b
     where b.mechanism <> 'unconstrained-by-decision'
       and not exists (
         select 1 from pg_constraint k
         where k.conrelid = ('public.' || b.tbl)::regclass
           and k.contype = 'c' and k.conname = b.object_name
       ) $$,
  'every declared constraint exists on the table it is declared for'
);

-- Existing by name is not enough: a constraint could be rewritten to touch a
-- different column and keep its name. The word boundary matters so that
-- `challenge_version` cannot vouch for `version`.
select is_empty(
  $$ select b.tbl || '.' || b.col || ' -> ' || b.object_name
     from constrained_columns b
     join pg_constraint k
       on k.conrelid = ('public.' || b.tbl)::regclass
      and k.contype = 'c' and k.conname = b.object_name
     where b.mechanism <> 'unconstrained-by-decision'
       and pg_get_constraintdef(k.oid) !~ ('(^|[^A-Za-z0-9_])' || b.col || '([^A-Za-z0-9_]|$)') $$,
  'every declared constraint actually mentions the column it is declared for'
);

-- --- The allow-list cannot go stale in the useful direction -----------
--
-- The direction that matters: a column listed as unconstrained which later
-- gains a constraint must fail, so acting on #194 forces its entries to be
-- reclassified rather than left saying the state is unconstrained.
select is_empty(
  $$ select b.tbl || '.' || b.col
     from constrained_columns b
     where b.mechanism = 'unconstrained-by-decision'
       and exists (
         select 1 from pg_constraint k
         where k.conrelid = ('public.' || b.tbl)::regclass
           and k.contype = 'c'
           and pg_get_constraintdef(k.oid) ~ ('(^|[^A-Za-z0-9_])' || b.col || '([^A-Za-z0-9_]|$)')
       ) $$,
  'no column recorded as unconstrained has quietly gained a constraint'
);

select * from finish();
rollback;
