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
-- THE SECOND STALENESS DIRECTION, and why it exists. A constraint is not the
-- only thing these reasons assert. Every reason below also says who can write
-- the column, and that half went stale first: `prisons.created_at` and
-- `profiles.created_at` kept reasons reading `CLIENT-WRITABLE ... Open finding
-- #194` after 20260824140000 revoked exactly those grants, and this suite
-- stayed green throughout, because the rule above fires when a column gains a
-- *constraint*, never when it loses a *grant*. So each allow-list entry now
-- declares `client_writable` as a boolean and the catalog decides whether it is
-- true -- the same `has_column_privilege` reading suite 003 takes for the
-- `default now()` columns, applied here to the prose that was drifting.
-- Suite 003's rule is about which timestamps a client may write at all; this
-- one is about whether this suite's own reasons still describe the schema.
--
-- SCOPE, and what is excluded by type rather than by decision. `uuid` and
-- `boolean` columns are not scanned: their domains are already exactly what the
-- contract permits (128 bits, or two values), so there is nothing a constraint
-- could add. Every type whose domain is *wider* than its contract is in scope:
-- `integer`, `bigint`, `smallint`, `numeric`, `double precision`, and
-- `timestamp with time zone`.
--
-- WHAT THIS SUITE DOES NOT ASSERT, AND WHERE THAT IS ASSERTED INSTEAD. Not
-- that any bound is the right number, and not that any constraint refuses
-- anything. This one asserts coverage and accountability, which no other suite
-- holds.
--
-- This paragraph used to end "suites 001, 002, 004 and 006 do that for the
-- columns they created", and that was false for nine of the thirteen
-- constraint objects named below. It was found by mutation rather than by
-- reading: every CHECK in `public` was dropped and re-added under the same name
-- over the same `conkey` with a predicate admitting everything
-- (`check (num_nonnulls(<same columns>) >= 0)`), and nine of these thirteen
-- survived with all 287 assertions green -- `entitlement_events_quantity_check`
-- (the SQL half of `MAX_SAVE_SLOTS_PER_GRANT`),
-- `entitlement_events_schema_version_check`, `challenge_definitions_window`,
-- `entitlement_events_expiry_after_occurrence`,
-- `challenge_definitions_version_check`,
-- `prisons_current_revision_non_negative`, `prisons_slot_index_positive`,
-- `save_versions_revision_positive` and
-- `save_versions_byte_size_non_negative`. This suite cannot see that, and it is
-- right not to try: an in-place rewrite leaves the catalog entry it reads
-- looking identical. #280 recorded the in-place-rewrite gap as a residual, and
-- this sentence was the half of that residual that was untrue.
--
-- Where each of the thirteen is now driven, in both directions, verified by
-- mutating each one alone and watching the named assertion go red:
--
--   suite 001  prisons_slot_index_positive, prisons_current_revision_non_negative,
--              save_versions_revision_positive, save_versions_byte_size_non_negative
--   suite 002  entitlement_events_quantity_check, entitlement_events_schema_version_check,
--              entitlement_events_expiry_after_occurrence, challenge_definitions_window,
--              challenge_definitions_version_check,
--              challenge_submissions_challenge_version_check,
--              challenge_submissions_ranked_score_finite
--   suite 006  save_versions_save_schema_version_check, user_settings_schema_version_check
--
-- Suite 004 is no longer named here: it drives capacity arithmetic, not any
-- constraint object this suite declares.
--
-- WHAT REMAINS OPEN, stated as a subject rather than as a tally so that adding
-- a column cannot silently make it false. The mapping above is a LIST, and a
-- list is exactly what this suite is shaped not to be: a scalar column added
-- tomorrow gets a `mechanism` row here, this suite's rule confirms the object
-- exists and constrains the column, and nothing anywhere will drive it. There
-- is no rule that can demand a behavioural probe -- a probe needs a value, and
-- only a person knows which value is one past the bound -- so the honest
-- statement is that coverage is enforced and refusal is remembered. An
-- `unconstrained-by-decision` entry has nothing to drive by construction.
--
-- EXECUTED against plain PostgreSQL via `pnpm verify:sql`.

begin;
select plan(12);

-- --- The declaration --------------------------------------------------

create temporary table constrained_columns (
  tbl text not null,
  col text not null,
  mechanism text not null,
  object_name text,
  -- Required for `unconstrained-by-decision` and NULL otherwise. A reason is
  -- what separates "nobody got to this" from "this is right"; the assertion
  -- below refuses an empty one.
  reason text,
  -- Also required for `unconstrained-by-decision` and NULL otherwise: the
  -- reason's claim about who may write the column, stated as a fact the catalog
  -- can contradict. See "THE SECOND STALENESS DIRECTION" in the header.
  client_writable boolean
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
  ('telemetry_events',      'consent_version',         'range-check', 'telemetry_events_consent_version_check', null),

  -- The retention audit's three counted columns (20260904090000, ADR 0046
  -- section 7 item 1). `retention_days` is bounded ABOVE as well as below and
  -- that is the one worth reading twice: a run recorded with 100,000 days is a
  -- run that retained everything, and an audit trail should not be able to
  -- describe one as retention. `deleted_count` is the count the DELETE itself
  -- reported, so its floor is the only bound available -- there is no ceiling
  -- on how many rows a window may legitimately reach.
  ('telemetry_retention_runs', 'run_id',              'range-check', 'telemetry_retention_runs_run_id_check', null),
  ('telemetry_retention_runs', 'retention_days',      'range-check', 'telemetry_retention_runs_retention_days_check', null),
  ('telemetry_retention_runs', 'deleted_count',       'range-check', 'telemetry_retention_runs_deleted_count_check', null),

  -- `claimed_occurred_at` is the client's `occurredAt` in epoch milliseconds,
  -- deliberately a `bigint` and not a `timestamptz` so that no retention window
  -- can key on it (ADR 0046 section 7 item 1: the wire schema is
  -- `z.number().int().min(0)` with no upper bound, from an unauthenticated
  -- endpoint, so a batch dated the year 4000 is admissible). Bounded at
  -- `Number.MAX_SAFE_INTEGER`, the ceiling `z.number().int()` can actually
  -- carry and the same one `tickSchema` uses.
  ('telemetry_events',      'claimed_occurred_at',     'range-check', 'telemetry_events_claimed_occurred_at_check', null),

  -- The two sample rates. Both are `double precision` bounded to [0, 1], which
  -- refuses NaN and both infinities for free -- every comparison against NaN is
  -- false -- so neither needs the separate `finite-check`
  -- `challenge_submissions.ranked_score` carries. `registry_sample_rate` is the
  -- receiver's own registry value and the only one an aggregate may weight by;
  -- `claimed_sample_rate` is the caller's claim and is named so that nothing
  -- multiplies by it (ADR 0046 section 7 item 7).
  ('telemetry_events',      'registry_sample_rate',    'range-check', 'telemetry_events_registry_sample_rate_check', null),
  ('telemetry_events',      'claimed_sample_rate',     'range-check', 'telemetry_events_claimed_sample_rate_check', null),

  -- Pinned rather than bounded, and there are now two. The ledger's schema
  -- version is part of ADR 0008's event contract, so a new version needs a
  -- migration by design; `telemetry_events.schema_version` is pinned because
  -- `telemetryEnvelopeSchema` declares `z.literal(TELEMETRY_SCHEMA_VERSION)`,
  -- so the ingest refuses anything but 1 before the column is reached and a
  -- range here would be looser than the code that feeds it. The two other
  -- `*_schema_version` columns are ranges for the opposite reason -- a pin
  -- would refuse a version before the migration admitting it could exist.
  ('entitlement_events',    'schema_version',          'pinned-literal', 'entitlement_events_schema_version_check', null),
  ('telemetry_events',      'schema_version',          'pinned-literal', 'telemetry_events_schema_version_check', null),

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

  -- The retention audit's two timestamps, constrained against each other by
  -- `telemetry_retention_runs_window` for exactly the reason the two rows above
  -- are: a `cutoff` at or after `ran_at` is a run that deleted rows it had just
  -- accepted, and that is a property of their ordering rather than of where
  -- either sits in the calendar. Note that neither is an
  -- `unconstrained-by-decision` entry even though both are server-written: they
  -- are genuinely constrained, so declaring them unconstrained would fail this
  -- suite's own "no column recorded as unconstrained has quietly gained a
  -- constraint" rule.
  ('telemetry_retention_runs', 'ran_at',              'relational-check', 'telemetry_retention_runs_window', null),
  ('telemetry_retention_runs', 'cutoff',              'relational-check', 'telemetry_retention_runs_window', null);

-- Unconstrained, with reasons, and each one declaring whether a client role can
-- write it. Two distinct kinds, and the difference matters: the first kind is
-- settled, the second is an open finding.
insert into constrained_columns (tbl, col, mechanism, object_name, reason, client_writable) values
  -- (a) Server-defaulted and unreachable from either client role. An absolute
  --     bound on a timestamp is a product question -- is a challenge opening in
  --     the year 4000 wrong? -- and these cannot be set by anyone the contract
  --     does not already trust.
  ('challenge_definitions', 'published_at',  'unconstrained-by-decision', null,
   'Server-defaulted; INSERT is service_role only. An absolute calendar bound would be a product decision, and no client can reach this column.', false),
  ('challenge_submissions', 'submitted_at',  'unconstrained-by-decision', null,
   'Server-defaulted; no client or service_role grant. Written only through submit_challenge_evidence().', false),
  ('challenge_submissions', 'verified_at',   'unconstrained-by-decision', null,
   'Written only by the verifier''s four-column service_role UPDATE grant. Nullable by design until a verdict exists.', false),
  ('entitlement_events',    'recorded_at',   'unconstrained-by-decision', null,
   'Server-defaulted; no client or service_role grant. Written only through record_entitlement_event().', false),
  ('entitlements',          'granted_at',    'unconstrained-by-decision', null,
   'Server-defaulted; no client or service_role grant. Written only by the ledger recompute.', false),
  ('entitlements',          'updated_at',    'unconstrained-by-decision', null,
   'Server-defaulted; no client or service_role grant. Written only by the ledger recompute.', false),
  ('save_versions',         'created_at',    'unconstrained-by-decision', null,
   'Server-defaulted; no client grant. Written only through create_save_version().', false),

  -- (a2) The same kind, but they arrived here by being fixed rather than by
  --      being designed that way. Both sat under (b) as client-writable --
  --      correctly until 20260824140000 (#194) revoked the table-level grants
  --      that reached them, and wrongly on every run after, because a reason
  --      naming a grant was something this suite had no way to read. That is
  --      what `client_writable` is for.
  ('prisons',               'created_at',    'unconstrained-by-decision', null,
   'Server-defaulted; not client-writable since 20260824140000, which revoked the table-level INSERT and re-granted INSERT per column without created_at. The UPDATE grant never covered it.', false),
  ('profiles',              'created_at',    'unconstrained-by-decision', null,
   'Server-defaulted; not client-writable since 20260824140000, which replaced this table''s table-level INSERT and UPDATE grants with per-column lists that omit created_at.', false),

  -- (b) These three were group (b) -- "client-writable, and that is a finding
  --     rather than a decision" -- for as long as #194's `updated_at` half was
  --     open, and the note here said the entries "move to a real mechanism when
  --     that half is acted on". 20260826130000 acted on it, and this is what
  --     moving looks like: the server stamps all three from a
  --     `BEFORE INSERT OR UPDATE` trigger and none of them is in a client
  --     grant, so `client_writable` is now false and the last assertion in this
  --     suite is what forced the flip. Group (b) is empty; nothing in this
  --     schema is now recorded as unconstrained *and* client-writable.
  --
  --     Still `unconstrained-by-decision` rather than a mechanism, and the
  --     distinction is the point: a trigger decides *who writes* the column,
  --     not what range it may hold. An absolute calendar bound on a timestamp
  --     is the same product question group (a) declines to answer, and it is
  --     now declined for the same reason -- no client can reach the column.
  ('prisons',               'updated_at',    'unconstrained-by-decision', null,
   'Server-stamped by prisons_stamp_updated_at since 20260826130000 (#194), which also revoked the grants that reached it. An absolute calendar bound would be a product decision.', false),
  ('profiles',              'updated_at',    'unconstrained-by-decision', null,
   'Server-stamped by profiles_stamp_updated_at since 20260826130000 (#194); the per-column INSERT and UPDATE grants no longer name it.', false),
  ('user_settings',         'updated_at',    'unconstrained-by-decision', null,
   'Server-stamped by user_settings_stamp_updated_at since 20260826130000 (#194), which replaced this table''s table-level INSERT and UPDATE with per-column lists that omit it.', false),

  -- (a3) The telemetry ingest's server stamp (20260904090000, ADR 0046
  --      section 7 item 1). Group (a)'s shape exactly: `default now()`, no
  --      grant for any role, and the only writer is a SECURITY DEFINER
  --      function that never names the column -- so an ingest record's own
  --      `receivedAt`, which the Worker does send, is ignored rather than
  --      honoured. Suite 012 drives that direction by sending one dated 1970.
  --      An absolute calendar bound is the same product question group (a)
  --      declines, and it is declined here for the stronger reason: the value
  --      is `now()` by construction.
  ('telemetry_events',      'received_at',   'unconstrained-by-decision', null,
   'Server-defaulted with now(); no grant for any role, and record_telemetry_events() never names the column, so an ingest record''s claimed receivedAt is ignored. It is the only time value a retention window may key on (ADR 0046 section 7 item 1).', false);

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

-- --- ...nor in the direction that actually went stale ------------------
--
-- Every reason above also claims who may write the column, and a grant can
-- change without a constraint appearing: 20260824140000 revoked the grants that
-- reached `prisons.created_at` and `profiles.created_at` and the two reasons
-- kept saying `CLIENT-WRITABLE` for as long as nobody read them. So the claim
-- is declared as a boolean and compared against the catalog, and both
-- directions fail -- a column that loses its client grants, and one that gains
-- them. `is distinct from` carries the null half of the rule too: a constrained
-- entry that declares client-writability, or an unconstrained one that omits
-- it, is as much a defect as a wrong value.
select is_empty(
  $$ select b.tbl || '.' || b.col
     from constrained_columns b
     where b.client_writable is distinct from (
       case when b.mechanism = 'unconstrained-by-decision' then
         has_column_privilege('authenticated', 'public.' || b.tbl, b.col, 'INSERT')
           or has_column_privilege('authenticated', 'public.' || b.tbl, b.col, 'UPDATE')
           or has_column_privilege('anon', 'public.' || b.tbl, b.col, 'INSERT')
           or has_column_privilege('anon', 'public.' || b.tbl, b.col, 'UPDATE')
       end) $$,
  'every unconstrained entry declares client-writability and the grants still agree with it'
);

select * from finish();
rollback;
