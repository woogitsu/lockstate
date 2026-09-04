-- pgTAP tests that EVERY text/jsonb/bytea column in `public` is bounded, by a
-- named mechanism, with nothing left over (issues #189, #105 finding 4).
--
-- WHAT THIS SUITE IS FOR, AND WHY IT IS SHAPED AS A RULE.
--
-- Suite 006 asserts the seven bounds 20260824101000 created, in both
-- directions, and says nothing about columns it did not touch. That is a list,
-- and a list cannot notice a column added tomorrow. #105 finding 5 is the same
-- lesson from the privilege side: the suite pinned every privilege
-- exhaustively and read no function declaration, so dropping a pinned
-- `search_path` passed all 89 assertions. Its fix enumerated `pg_proc` instead
-- of naming functions, and that is what this suite does for columns.
--
-- The rule: every `text`/`jsonb`/`json`/`bytea` column in `public` must appear
-- exactly once in `bounded_columns` below, naming the mechanism that bounds it
-- and the catalog object that implements it -- and that object must actually
-- exist. So:
--
--   * a column added with no bound **fails**, because it is in no declaration;
--   * a bound that is dropped **fails**, because its declared object is gone;
--   * a declaration for a column that no longer exists **fails**, so the table
--     below cannot go stale silently.
--
-- WHY THE MECHANISM IS DECLARED RATHER THAN INFERRED. A single regex over
-- `pg_get_constraintdef` would have to recognise four different shapes, and
-- getting it wrong in the permissive direction is exactly the failure this
-- suite exists to prevent -- a scan that reads *something* about a column as a
-- size bound when it is not one. Two live examples of that trap, both real:
--
--   * `challenge_definitions_definition_hash_check` is a regex on
--     `definition_hash`; a `LIKE '%definition%'` scan reads it as bounding
--     `definition`, which it does not.
--   * `challenge_submissions_rejected_has_code` requires a rejected row to
--     *have* a `rejection_code` and says nothing about its length.
--
-- So the judgment of "what counts as bounded" is written down here where it can
-- be read and argued with, and what the catalog is asked is only whether the
-- named object exists and touches the named column. The enumeration -- the part
-- that must not be a list -- comes from `pg_attribute`.
--
-- FIVE MECHANISMS, all of them already in this schema:
--
--   * `length-check`      -- `char_length()`/`octet_length()` in a CHECK.
--   * `regex-check`       -- an anchored fixed-width regex in a CHECK.
--   * `value-set-check`   -- a closed value set or a pinned literal in a CHECK.
--                            Stronger than a length: the set is finite.
--   * `row-trigger`       -- a BEFORE ROW trigger raising LS002/LS003. Used
--                            where the refusal must carry measured/limit
--                            numbers a client can render, which a CHECK cannot.
--   * `generated-column`  -- fixed width by construction.
--
-- WHAT THIS SUITE DOES NOT ASSERT. It does not check that any ceiling is the
-- *right* number, nor that a bound refuses anything. Suite 006 does that for
-- the seven columns it created, in both directions. This one asserts coverage,
-- which is the property no other suite holds.
--
-- EXECUTED against plain PostgreSQL via `pnpm verify:sql`.

begin;
select plan(11);

-- --- The declaration ---------------------------------------------------

create temporary table bounded_columns (
  tbl text not null,
  col text not null,
  mechanism text not null,
  -- The catalog object implementing it: a constraint name, a trigger name, or
  -- NULL for `generated-column`, which is a property of the column itself.
  object_name text
);

insert into bounded_columns (tbl, col, mechanism, object_name) values
  -- profiles / prisons / user_settings / save_versions (20260824101000, #105 finding 4)
  ('profiles',              'display_name',        'length-check', 'profiles_display_name_check'),
  ('prisons',               'display_name',        'length-check', 'prisons_display_name_check'),
  ('prisons',               'game_version',        'length-check', 'prisons_game_version_check'),
  ('user_settings',         'payload',             'length-check', 'user_settings_payload_bytes_check'),
  ('save_versions',         'checksum',            'length-check', 'save_versions_checksum_length_check'),

  -- save_versions.storage_path (20260824110200, #105 finding 11)
  ('save_versions',         'storage_path',        'length-check', 'save_versions_storage_path_shape'),

  -- save_versions.payload: ADR 0013's 4 MiB bound. A trigger rather than a
  -- CHECK because LS002 must carry the measured size and the limit, and
  -- because it overwrites the caller's claimed `p_byte_size` with a measured
  -- value on the way past.
  ('save_versions',         'payload',             'row-trigger',  'save_versions_enforce_size'),

  -- entitlement_events (20260823090000): the precedent for bounding a
  -- trusted-tier-only table at all.
  ('entitlement_events',    'actor_id',            'length-check', 'entitlement_events_actor_id_check'),
  ('entitlement_events',    'product_id',          'length-check', 'entitlement_events_product_id_check'),
  ('entitlement_events',    'provider',            'length-check', 'entitlement_events_provider_check'),
  ('entitlement_events',    'provider_event_id',   'length-check', 'entitlement_events_provider_event_id_check'),
  ('entitlement_events',    'reason',              'length-check', 'entitlement_events_reason_check'),
  ('entitlement_events',    'actor_kind',          'value-set-check', 'entitlement_events_actor_kind_check'),
  ('entitlement_events',    'event_type',          'value-set-check', 'entitlement_events_event_type_check'),
  ('entitlement_events',    'source',             'value-set-check', 'entitlement_events_source_check'),
  ('entitlement_events',    'capability',          'value-set-check', 'entitlement_events_capability_check'),

  -- entitlements (20260824120000, #189)
  ('entitlements',          'key',                 'length-check', 'entitlements_key_check'),
  ('entitlements',          'value',               'length-check', 'entitlements_value_bytes_check'),

  -- challenge_definitions
  ('challenge_definitions', 'challenge_id',        'length-check', 'challenge_definitions_challenge_id_check'),
  ('challenge_definitions', 'definition',          'length-check', 'challenge_definitions_definition_bytes_check'),
  ('challenge_definitions', 'signature',           'length-check', 'challenge_definitions_signature_bytes_check'),
  ('challenge_definitions', 'definition_hash',     'regex-check',  'challenge_definitions_definition_hash_check'),

  -- challenge_submissions
  ('challenge_submissions', 'challenge_id',        'length-check', 'challenge_submissions_challenge_id_check'),
  ('challenge_submissions', 'claimed_metrics',     'length-check', 'challenge_submissions_claimed_metrics_bytes_check'),
  ('challenge_submissions', 'rejection_code',      'length-check', 'challenge_submissions_rejection_code_check'),
  ('challenge_submissions', 'evidence_hash',       'regex-check',  'challenge_submissions_evidence_hash_check'),
  ('challenge_submissions', 'verification_status', 'value-set-check', 'challenge_submissions_verification_status_check'),
  ('challenge_submissions', 'evidence',            'row-trigger',  'challenge_submissions_enforce_evidence_size'),
  ('challenge_submissions', 'evidence_digest',     'generated-column', null),

  -- telemetry_events (20260904090000, ADR 0046). The whole table is
  -- trusted-tier-only -- no role holds any privilege on it and the single
  -- write path is a SECURITY DEFINER function -- and it is bounded anyway, for
  -- the reason `entitlement_events` is: the bound is what stops a second write
  -- path added later from being the one that stores 33 MB. `attributes` is the
  -- one that could: it is free-form `jsonb` fed from an unauthenticated
  -- endpoint, and 12 KiB is `MAX_ENVELOPE_BYTES` from
  -- src/worker/telemetry-ingest.ts, so the column cannot hold more than the
  -- endpoint admits for the entire envelope it belongs to.
  --
  -- `release_commit` is the only nullable text column in the set, matching
  -- `releaseIdentitySchema`'s `commit: identifierSchema.optional()`.
  ('telemetry_events',      'event_id',             'length-check', 'telemetry_events_event_id_check'),
  ('telemetry_events',      'name',                 'length-check', 'telemetry_events_name_check'),
  ('telemetry_events',      'session_id',           'length-check', 'telemetry_events_session_id_check'),
  ('telemetry_events',      'release_build_version','length-check', 'telemetry_events_release_build_version_check'),
  ('telemetry_events',      'release_commit',       'length-check', 'telemetry_events_release_commit_check'),
  ('telemetry_events',      'attributes',           'length-check', 'telemetry_events_attributes_bytes_check'),
  ('telemetry_events',      'category',             'value-set-check', 'telemetry_events_category_check'),
  ('telemetry_events',      'environment',          'value-set-check', 'telemetry_events_environment_check');

-- --- The enumeration, from the catalog rather than from a list ---------

create temporary view scanned_columns as
  select c.relname as tbl, a.attname as col,
         format_type(a.atttypid, a.atttypmod) as typ,
         a.attgenerated as generated
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  where c.relkind = 'r'
    and format_type(a.atttypid, a.atttypmod) in ('text', 'jsonb', 'json', 'bytea');

-- Vacuity guard first: every assertion below is satisfied by an empty scan, so
-- a broken enumeration would read as total compliance.
select cmp_ok(
  (select count(*)::int from scanned_columns),
  '>=',
  20,
  'the scan found the columns it claims to cover; an empty enumeration would satisfy every assertion below'
);

-- --- Coverage, in both directions -------------------------------------

select is_empty(
  $$ select tbl || '.' || col from scanned_columns
     except
     select tbl || '.' || col from bounded_columns $$,
  'every text/jsonb/bytea column in public is declared with a bounding mechanism'
);

select is_empty(
  $$ select tbl || '.' || col from bounded_columns
     except
     select tbl || '.' || col from scanned_columns $$,
  'every declared column still exists, so this table cannot go stale silently'
);

select is_empty(
  $$ select tbl || '.' || col from bounded_columns group by 1 having count(*) > 1 $$,
  'no column is declared twice, so a second entry cannot vouch for a mechanism that was removed'
);

-- --- The mechanism vocabulary is closed -------------------------------

select is_empty(
  $$ select distinct mechanism from bounded_columns
     where mechanism not in ('length-check', 'regex-check', 'value-set-check', 'row-trigger', 'generated-column') $$,
  'every declared mechanism is one of the five this schema actually uses, so a typo cannot invent one'
);

select is_empty(
  $$ select tbl || '.' || col from bounded_columns
     where (mechanism = 'generated-column') <> (object_name is null) $$,
  'a generated column names no object and every other mechanism names one'
);

-- --- Each declared object exists and touches its column ---------------

select is_empty(
  $$ select b.tbl || '.' || b.col || ' -> ' || b.object_name
     from bounded_columns b
     where b.mechanism in ('length-check', 'regex-check', 'value-set-check')
       and not exists (
         select 1 from pg_constraint k
         where k.conrelid = ('public.' || b.tbl)::regclass
           and k.contype = 'c'
           and k.conname = b.object_name
       ) $$,
  'every declared check constraint exists on the table it is declared for'
);

-- Named object exists is not enough: a constraint could be renamed onto a
-- different column, or rewritten to bound something else, and still be found by
-- name. The word boundary matters -- `char_length(definition_hash)` must not
-- satisfy a claim about `definition`.
select is_empty(
  $$ select b.tbl || '.' || b.col || ' -> ' || b.object_name
     from bounded_columns b
     join pg_constraint k
       on k.conrelid = ('public.' || b.tbl)::regclass
      and k.contype = 'c' and k.conname = b.object_name
     where b.mechanism in ('length-check', 'regex-check', 'value-set-check')
       and pg_get_constraintdef(k.oid) !~ ('(^|[^A-Za-z0-9_])' || b.col || '([^A-Za-z0-9_]|$)') $$,
  'every declared check constraint actually mentions the column it is declared for'
);

-- And it constrains it in the declared way. A `length-check` whose definition
-- carries no length function is not a length check, whatever it is named.
select is_empty(
  $$ select b.tbl || '.' || b.col || ' -> ' || b.mechanism
     from bounded_columns b
     join pg_constraint k
       on k.conrelid = ('public.' || b.tbl)::regclass
      and k.contype = 'c' and k.conname = b.object_name
     where (b.mechanism = 'length-check'
              and pg_get_constraintdef(k.oid) !~ ('(char_length|octet_length)\(\(?' || b.col || '[^A-Za-z0-9_]'))
        or (b.mechanism = 'regex-check' and pg_get_constraintdef(k.oid) !~ '~')
        or (b.mechanism = 'value-set-check'
              and pg_get_constraintdef(k.oid) !~ '= ANY' and pg_get_constraintdef(k.oid) !~ '= ''') $$,
  'each check constraint constrains its column in the way its mechanism claims'
);

-- --- Triggers and generated columns ----------------------------------

select is_empty(
  $$ select b.tbl || '.' || b.col || ' -> ' || b.object_name
     from bounded_columns b
     where b.mechanism = 'row-trigger'
       and not exists (
         select 1 from pg_trigger t
         where t.tgrelid = ('public.' || b.tbl)::regclass
           and not t.tgisinternal
           and t.tgname = b.object_name
       ) $$,
  'every declared row trigger exists on the table it is declared for'
);

select is_empty(
  $$ select b.tbl || '.' || b.col
     from bounded_columns b
     join scanned_columns s on s.tbl = b.tbl and s.col = b.col
     where b.mechanism = 'generated-column' and s.generated = '' $$,
  'every column declared as generated really is generated, so its width is fixed by construction'
);

select * from finish();
rollback;
