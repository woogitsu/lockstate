-- pgTAP tests for the constraints suites 007 and 008 structurally cannot
-- cover: the ones that are not about a single column.
--
-- WHY THIS SUITE EXISTS. Suites 007 and 008 are coverage rules keyed **one
-- row per column** -- every `text`/`jsonb`/`bytea` column must name the object
-- that bounds it, every numeric and timestamp column must name a constraint or
-- carry a reason. That shape is right for what those suites are about and it
-- has a blind spot with a hard edge: a constraint that relates two columns
-- belongs to neither of them, so it is the declared object for no row, so
-- dropping it fails nothing.
--
-- Measured against `pnpm verify:sql`, one drop at a time. **Every one of these
-- passed 233/233** before this file existed:
--
--   * `save_versions_exactly_one_location` -- the payload/storage_path
--     exclusivity `docs/CLOUD_SAVE.md` calls the model of the hybrid split;
--   * `entitlement_events_provider_pair` -- the two halves of the webhook
--     idempotency key must be both present or both absent;
--   * `entitlement_events_webhook_requires_provider` -- a `payment-webhook`
--     row without a provider is a payment event with no idempotency key at
--     all, which is ADR 0008 threat T6's mitigation missing;
--   * `challenge_submissions_verified_has_score` -- a `verified` row with no
--     `ranked_score`;
--   * `challenge_submissions_rejected_has_code` -- a `rejected` row with no
--     `rejection_code`;
--   * `prisons_owner_slot_unique` -- two prisons at the same slot index for
--     one owner, which a client can attempt directly through its own INSERT
--     grant.
--
-- The same drops on a single-column constraint are caught, and that asymmetry
-- is the finding rather than the individual constraints: it is a property of
-- how 007 and 008 enumerate, not of anyone forgetting a case.
--
-- WHAT THIS SUITE ASSERTS, and deliberately what it does not.
--
-- The inventory below is `name : type : the columns it covers`, read from
-- `pg_constraint`. It is NOT `pg_get_constraintdef` text. Pinning the rendered
-- definition would catch a rewrite that keeps the name, and it would also make
-- this suite fail on a PostgreSQL version that renders a predicate
-- differently -- the failure mode suite 003's header rules out for its own
-- aggregates, and this schema is run on 16.13 and on 18.6. Name, type and
-- `conkey` are catalog facts rather than rendered text, so they are stable
-- across both. What that leaves uncovered is a constraint rewritten in place
-- under the same name over the same columns; suites 006, 007 and 008 hold that
-- for every column they declare, and the behavioural probes below hold it for
-- the six above.
--
-- `contype` is restricted to `c`/`u`/`p`/`f` for the same portability reason:
-- PostgreSQL 17 added NOT NULL constraints to `pg_constraint` as `contype =
-- 'n'`, so including them would make this inventory differ between 16 and 18
-- for a reason that has nothing to do with this schema.
--
-- EXECUTED against plain PostgreSQL 16.13 + pgTAP 1.3.2 via `pnpm
-- verify:sql`. NOT executed against the real Supabase local stack or a hosted
-- project; see docs/CLOUD_SAVE.md, "What has and has not been executed".

begin;
select plan(10);

-- --- The inventory ------------------------------------------------------
--
-- `replace(..., e'\r', '')` guards the multi-line literal against a Windows
-- checkout with `core.autocrlf = true`, for the reason suites 003, 005 and
-- 009 give for the same guard.
select is(
  (select string_agg(
            c.relname || ':' || k.conname || ':' || k.contype::text || ':'
              || coalesce((select string_agg(a.attname, '+' order by a.attname)
                             from unnest(k.conkey) as ck(attnum)
                             join pg_attribute a
                               on a.attrelid = k.conrelid and a.attnum = ck.attnum), '<none>'),
            e'\n' order by c.relname, k.conname)
     from pg_constraint k
     join pg_class c on c.oid = k.conrelid
     join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where k.contype in ('c', 'u', 'p', 'f')),
  replace($expected$challenge_definitions:challenge_definitions_challenge_id_check:c:challenge_id
challenge_definitions:challenge_definitions_definition_bytes_check:c:definition
challenge_definitions:challenge_definitions_definition_hash_check:c:definition_hash
challenge_definitions:challenge_definitions_pkey:p:challenge_id+version
challenge_definitions:challenge_definitions_signature_bytes_check:c:signature
challenge_definitions:challenge_definitions_version_check:c:version
challenge_definitions:challenge_definitions_window:c:closes_at+opens_at
challenge_submissions:challenge_submissions_challenge_id_challenge_version_fkey:f:challenge_id+challenge_version
challenge_submissions:challenge_submissions_challenge_id_check:c:challenge_id
challenge_submissions:challenge_submissions_challenge_version_check:c:challenge_version
challenge_submissions:challenge_submissions_claimed_metrics_bytes_check:c:claimed_metrics
challenge_submissions:challenge_submissions_evidence_hash_check:c:evidence_hash
challenge_submissions:challenge_submissions_pkey:p:submission_id
challenge_submissions:challenge_submissions_ranked_score_finite:c:ranked_score
challenge_submissions:challenge_submissions_rejected_has_code:c:rejection_code+verification_status
challenge_submissions:challenge_submissions_rejection_code_check:c:rejection_code
challenge_submissions:challenge_submissions_unique_evidence_digest:u:challenge_id+challenge_version+evidence_digest
challenge_submissions:challenge_submissions_user_id_fkey:f:user_id
challenge_submissions:challenge_submissions_verification_status_check:c:verification_status
challenge_submissions:challenge_submissions_verified_has_score:c:ranked_score+verification_status
entitlement_events:entitlement_events_actor_id_check:c:actor_id
entitlement_events:entitlement_events_actor_kind_check:c:actor_kind
entitlement_events:entitlement_events_capability_check:c:capability
entitlement_events:entitlement_events_event_type_check:c:event_type
entitlement_events:entitlement_events_expiry_after_occurrence:c:expires_at+occurred_at
entitlement_events:entitlement_events_pkey:p:event_id
entitlement_events:entitlement_events_product_id_check:c:product_id
entitlement_events:entitlement_events_provider_check:c:provider
entitlement_events:entitlement_events_provider_event_id_check:c:provider_event_id
entitlement_events:entitlement_events_provider_pair:c:provider+provider_event_id
entitlement_events:entitlement_events_quantity_check:c:quantity
entitlement_events:entitlement_events_reason_check:c:reason
entitlement_events:entitlement_events_schema_version_check:c:schema_version
entitlement_events:entitlement_events_source_check:c:source
entitlement_events:entitlement_events_user_id_fkey:f:user_id
entitlement_events:entitlement_events_webhook_requires_provider:c:provider+source
entitlements:entitlements_key_check:c:key
entitlements:entitlements_pkey:p:key+user_id
entitlements:entitlements_user_id_fkey:f:user_id
entitlements:entitlements_value_bytes_check:c:value
prisons:prisons_current_revision_non_negative:c:current_revision
prisons:prisons_current_version_fk:f:current_version_id
prisons:prisons_display_name_check:c:display_name
prisons:prisons_game_version_check:c:game_version
prisons:prisons_owner_id_fkey:f:owner_id
prisons:prisons_owner_slot_unique:u:owner_id+slot_index
prisons:prisons_pkey:p:id
prisons:prisons_slot_index_positive:c:slot_index
profiles:profiles_display_name_check:c:display_name
profiles:profiles_id_fkey:f:id
profiles:profiles_pkey:p:id
save_versions:save_versions_byte_size_non_negative:c:byte_size
save_versions:save_versions_checksum_length_check:c:checksum
save_versions:save_versions_exactly_one_location:c:payload+storage_path
save_versions:save_versions_pkey:p:id
save_versions:save_versions_prison_id_fkey:f:prison_id
save_versions:save_versions_prison_revision_unique:u:prison_id+revision
save_versions:save_versions_revision_positive:c:revision
save_versions:save_versions_save_schema_version_check:c:save_schema_version
save_versions:save_versions_storage_path_shape:c:storage_path
telemetry_events:telemetry_events_attributes_bytes_check:c:attributes
telemetry_events:telemetry_events_attributes_is_object:c:attributes
telemetry_events:telemetry_events_category_check:c:category
telemetry_events:telemetry_events_claimed_occurred_at_check:c:claimed_occurred_at
telemetry_events:telemetry_events_claimed_sample_rate_check:c:claimed_sample_rate
telemetry_events:telemetry_events_consent_version_check:c:consent_version
telemetry_events:telemetry_events_environment_check:c:environment
telemetry_events:telemetry_events_event_id_check:c:event_id
telemetry_events:telemetry_events_name_check:c:name
telemetry_events:telemetry_events_pkey:p:event_id
telemetry_events:telemetry_events_registry_sample_rate_check:c:registry_sample_rate
telemetry_events:telemetry_events_release_build_version_check:c:release_build_version
telemetry_events:telemetry_events_release_commit_check:c:release_commit
telemetry_events:telemetry_events_schema_version_check:c:schema_version
telemetry_events:telemetry_events_session_id_check:c:session_id
telemetry_retention_runs:telemetry_retention_runs_category_check:c:category
telemetry_retention_runs:telemetry_retention_runs_deleted_count_check:c:deleted_count
telemetry_retention_runs:telemetry_retention_runs_keyed_on_check:c:keyed_on
telemetry_retention_runs:telemetry_retention_runs_pkey:p:run_id
telemetry_retention_runs:telemetry_retention_runs_retention_days_check:c:retention_days
telemetry_retention_runs:telemetry_retention_runs_run_by_check:c:run_by
telemetry_retention_runs:telemetry_retention_runs_run_id_check:c:run_id
telemetry_retention_runs:telemetry_retention_runs_window:c:cutoff+ran_at
user_settings:user_settings_payload_bytes_check:c:payload
user_settings:user_settings_pkey:p:user_id
user_settings:user_settings_schema_version_check:c:settings_schema_version
user_settings:user_settings_user_id_fkey:f:user_id$expected$, e'\r', ''),
  'every CHECK, UNIQUE, PRIMARY KEY and FOREIGN KEY in public is the one its migration writes, over the columns it writes it over'
);

-- --- The six the per-column suites cannot reach, driven -----------------
--
-- Probed as the table owner, which is the strongest writer there is: if it
-- cannot get past the constraint, no client role can. Five of the six are
-- unreachable from either client role anyway (suite 003 pins the grants that
-- make that so); the sixth, `prisons_owner_slot_unique`, is reachable from a
-- client and is driven through the client role below.

insert into auth.users (id, email) values
  ('0c0c0c0c-0c0c-0c0c-0c0c-0c0c0c0c0c0c', 'constraints@example.test');

insert into public.prisons (id, owner_id, game_version, slot_index) values
  ('0c0c0c0c-1111-1111-1111-111111111111', '0c0c0c0c-0c0c-0c0c-0c0c-0c0c0c0c0c0c', 'lockstate-0.0.0', 0);

insert into public.challenge_definitions
  (challenge_id, version, definition, definition_hash, signature, opens_at, closes_at, published_at)
values ('challenge.constraint-probe', 1, '{"id":"challenge.constraint-probe"}'::jsonb, '00cc00cc00cc00cc',
        '{"algorithm":"ed25519","keyId":"key.test","value":"AAAA"}'::jsonb,
        now() - interval '1 day', now() + interval '1 day', now() - interval '1 day');

-- `save_versions_exactly_one_location`. `create_save_version()` refuses the
-- same two shapes with `P0001` before it inserts, so this is the half that
-- holds for a writer that is not that function -- a backfill, an importer, or
-- the Storage-backed writer the JSONB-vs-Storage decision has not produced.
select throws_ok(
  $$ insert into public.save_versions (prison_id, revision, save_schema_version, checksum, payload, storage_path, byte_size)
     values ('0c0c0c0c-1111-1111-1111-111111111111', 1, 1, 'bothlocations01', '{"tick":0}'::jsonb,
             '0c0c0c0c-0c0c-0c0c-0c0c-0c0c0c0c0c0c/1.json', 10) $$,
  '23514',
  null,
  'a save version carrying BOTH a payload and a storage path is refused by the table, not only by the RPC'
);

select throws_ok(
  $$ insert into public.save_versions (prison_id, revision, save_schema_version, checksum, payload, storage_path, byte_size)
     values ('0c0c0c0c-1111-1111-1111-111111111111', 1, 1, 'nolocation00001', null, null, 10) $$,
  '23514',
  null,
  'and so is one carrying neither: "exactly one location" is a property of the row'
);

-- `entitlement_events_provider_pair`. `record_entitlement_event()` branches on
-- `p_provider is not null` alone, so a caller supplying a provider without an
-- event id would take the deduplicating branch and look it up against NULL --
-- which matches nothing, every time. The constraint is what stops the row
-- rather than the function.
select throws_ok(
  $$ insert into public.entitlement_events
       (user_id, product_id, capability, event_type, source, quantity, provider, provider_event_id,
        occurred_at, actor_kind, actor_id, reason)
     values ('0c0c0c0c-0c0c-0c0c-0c0c-0c0c0c0c0c0c', 'product.save-slots.plus-5', 'save-slots',
             'grant', 'promotional', 5, 'provider.test', null, now(), 'system', 'probe', 'half a key') $$,
  '23514',
  null,
  'half of the provider idempotency pair is refused: a provider with no event id keys nothing'
);

-- `entitlement_events_webhook_requires_provider`. ADR 0008 threat T6's
-- mitigation is "(provider, provider_event_id) uniqueness", and a
-- `payment-webhook` row with a null provider is outside the partial index
-- entirely -- so without this constraint the one source that MUST be
-- deduplicated is the one that could arrive without a key.
select throws_ok(
  $$ insert into public.entitlement_events
       (user_id, product_id, capability, event_type, source, quantity,
        occurred_at, actor_kind, actor_id, reason)
     values ('0c0c0c0c-0c0c-0c0c-0c0c-0c0c0c0c0c0c', 'product.save-slots.plus-5', 'save-slots',
             'grant', 'payment-webhook', 5, now(), 'provider', 'probe', 'no provider named') $$,
  '23514',
  null,
  'a payment-webhook event with no provider is refused: the one source that must be deduplicated cannot arrive unkeyed'
);

-- `challenge_submissions_verified_has_score` and
-- `..._rejected_has_code`. Both describe the verdict the trusted verifier
-- writes through its four-column UPDATE grant, and neither has any other
-- enforcement: `enforce_challenge_verification_transition()` checks that the
-- verdict is one-way and that the evidence is unchanged, and says nothing
-- about the verdict being complete.
select throws_ok(
  $$ insert into public.challenge_submissions
       (user_id, challenge_id, challenge_version, evidence_hash, evidence, claimed_metrics,
        verification_status, verified_at)
     values ('0c0c0c0c-0c0c-0c0c-0c0c-0c0c0c0c0c0c', 'challenge.constraint-probe', 1, '00cc00cc00cc00c1',
             '{"k":1}'::jsonb, '{}'::jsonb, 'verified', now()) $$,
  '23514',
  null,
  'a verified submission with no ranked score is refused, so a verdict cannot be half-written'
);

select throws_ok(
  $$ insert into public.challenge_submissions
       (user_id, challenge_id, challenge_version, evidence_hash, evidence, claimed_metrics,
        verification_status)
     values ('0c0c0c0c-0c0c-0c0c-0c0c-0c0c0c0c0c0c', 'challenge.constraint-probe', 1, '00cc00cc00cc00c2',
             '{"k":2}'::jsonb, '{}'::jsonb, 'rejected') $$,
  '23514',
  null,
  'a rejected submission with no rejection code is refused, so "why" is never absent from a refusal'
);

-- The admission that keeps the two above honest: a complete verdict is still
-- accepted, so the pair bounds the shape of a verdict rather than forbidding
-- one.
select lives_ok(
  $$ insert into public.challenge_submissions
       (user_id, challenge_id, challenge_version, evidence_hash, evidence, claimed_metrics,
        verification_status, ranked_score, verified_at)
     values ('0c0c0c0c-0c0c-0c0c-0c0c-0c0c0c0c0c0c', 'challenge.constraint-probe', 1, '00cc00cc00cc00c3',
             '{"k":3}'::jsonb, '{}'::jsonb, 'verified', 12.5, now()) $$,
  'a complete verdict -- verified with a score, and a timestamp -- is still admitted'
);

-- `prisons_owner_slot_unique`, the one of the six a client can reach: the
-- INSERT grant on `prisons` is deliberately retained (ADR 0013), so a client
-- can attempt a second prison at a slot index it already holds.
-- `create_prison()` answers that case with `slot_taken` and suite 004 asserts
-- that, but the status comes from the function's own `exists` check -- this is
-- the constraint underneath it, driven through the grant.

select set_config('request.jwt.claim.sub', '0c0c0c0c-0c0c-0c0c-0c0c-0c0c0c0c0c0c', true);
set local role authenticated;

select is(current_user::text, 'authenticated', 'the slot-collision probe below runs as the client role');

select throws_ok(
  $$ insert into public.prisons (owner_id, game_version, slot_index)
     values ('0c0c0c0c-0c0c-0c0c-0c0c-0c0c0c0c0c0c', 'lockstate-0.0.0', 0) $$,
  '23505',
  null,
  'a second prison at a slot index this owner already holds is refused by the table, not only by create_prison()'
);

reset role;

select * from finish();
rollback;
