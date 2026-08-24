-- pgTAP tests for the trusted-services schema added by issue #36:
-- the append-only entitlement ledger, its derived projection, and the
-- challenge definition/submission tables.
--
-- EXECUTED two ways: `supabase test db` against the REAL Supabase local
-- stack (CLI 2.115.0), and `pnpm verify:sql` against plain PostgreSQL
-- 16.13 + pgTAP 1.3.2 and 18.6 + pgTAP 1.3.4 via
-- scripts/sql/supabase-compat-harness.sql.
--
-- The first real-stack run failed here at "a different account cannot read
-- someone else's audit trail" with `42501 permission denied for table
-- entitlement_events` -- not because isolation was broken, but because the
-- table had no SELECT grant at all, so the entitlement UI could never have
-- worked. See docs/CLOUD_SAVE.md and supabase/tests/003_data_api_grants.test.sql.
--
-- EVERY TRUSTED STEP BELOW RUNS AS `service_role`, not as the privileged
-- role the suite is invoked with. That distinction is the whole point: this
-- suite used to exercise the Z2 paths as the superuser running the tests,
-- which succeeds no matter what `service_role` holds -- and it held nothing
-- at all, so the payment-webhook path and the challenge verifier were both
-- dead on a real project while 17/17 passed here. `set local role
-- service_role` is what makes these assertions load-bearing.
--
-- The harness is still not Supabase, and neither run proves that GoTrue
-- mints the identity these policies read; `auth.uid()` is fed here by
-- `set_config`. See scripts/verify-supabase-stack.mjs for that step.
--
-- The twenty-two assertions added for issue #105 findings 1 and 2 -- the
-- "Evidence integrity" and "Account binding" sections -- have been executed
-- only on plain PostgreSQL 16.13 + pgTAP 1.3.2 via `pnpm verify:sql`, and so
-- have the two evidence bodies changed further down. The stack run needs
-- container images that were not reachable when they were written.
--
-- The same is true of the twenty-nine added for issue #105 findings 6, 7
-- and 9: "Ledger idempotency beyond the payment webhook" (nineteen) and
-- "The definition oracle" (ten). `pnpm verify:sql` reports 76/76 for this
-- suite.

begin;
select plan(83);

insert into auth.users (id, email) values
  ('33333333-3333-3333-3333-333333333333', 'entitled@example.test'),
  ('44444444-4444-4444-4444-444444444444', 'other@example.test');

-- --- Entitlement ledger: client write paths do not exist ---
--
-- `throws_ok` is used in its four-argument form throughout: assert the
-- SQLSTATE (42501 = insufficient_privilege, P0001 = raise_exception from
-- our own triggers) and leave the message free, so a Postgres wording
-- change cannot break the suite while the security property stays
-- asserted. The two-argument form would compare the *message*, not act as
-- a description.

select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
set local role authenticated;

select throws_ok(
  $$ insert into public.entitlement_events
       (user_id, product_id, capability, event_type, source, quantity, occurred_at, actor_kind, actor_id, reason)
     values ('33333333-3333-3333-3333-333333333333', 'product.save-slots.plus-5', 'save-slots',
             'grant', 'promotional', 5, now(), 'system', 'self', 'self-granted') $$,
  '42501',
  null,
  'an authenticated client cannot append to the entitlement ledger'
);

select throws_ok(
  $$ select public.record_entitlement_event(
       '33333333-3333-3333-3333-333333333333', 'product.save-slots.plus-5', 'save-slots', 'grant',
       'promotional', 5, null, null, now(), 'system', 'self', 'self-granted', null) $$,
  '42501',
  null,
  'an authenticated client cannot execute record_entitlement_event'
);

select throws_ok(
  $$ update public.entitlements set value = '{"grantedSaveSlots": 45, "ledgerRevision": 1}'::jsonb
     where user_id = '33333333-3333-3333-3333-333333333333' $$,
  '42501',
  null,
  'an authenticated client cannot write its own entitlement projection'
);

reset role;

-- --- Trusted path: append + recompute ---
--
-- As `service_role`, the role a Supabase Edge Function or Cloudflare Worker
-- actually holds. Before the grant added to the entitlement-events
-- migration, every call below raised `42501 permission denied for function
-- record_entitlement_event`: BYPASSRLS decides which rows the trusted role
-- sees, never whether it may execute anything.

set local role service_role;

select is(
  (select status from public.record_entitlement_event(
     '33333333-3333-3333-3333-333333333333', 'product.save-slots.plus-5', 'save-slots', 'grant',
     'payment-webhook', 5, 'provider.test', 'evt-1', now() - interval '1 hour',
     'provider', 'provider.test', 'purchase-completed via provider.test', null)),
  'applied',
  'the trusted path records a grant'
);

select is(
  (select status from public.record_entitlement_event(
     '33333333-3333-3333-3333-333333333333', 'product.save-slots.plus-5', 'save-slots', 'grant',
     'payment-webhook', 5, 'provider.test', 'evt-1', now() - interval '1 hour',
     'provider', 'provider.test', 'purchase-completed via provider.test', null)),
  'duplicate',
  'redelivering the same provider event is idempotent'
);

-- Also the dedup pre-check `processEntitlementWebhook` performs before it
-- writes (src/services/entitlements/webhook.ts findByProviderEvent): the
-- trusted role has to be able to read the ledger it appends to.
select is(
  (select count(*)::int from public.entitlement_events where user_id = '33333333-3333-3333-3333-333333333333'),
  1,
  'the redelivered event wrote no second ledger row, and the trusted role can read the ledger'
);

-- The projection is deliberately outside the trusted role's reach: it is
-- written only inside record_entitlement_event(), which runs as the table
-- owner. Reading it back is therefore an operator/owner action.
select throws_ok(
  $$ select value from public.entitlements
      where user_id = '33333333-3333-3333-3333-333333333333' $$,
  '42501',
  null,
  'the trusted role writes the projection only through the RPC, and cannot read the table directly'
);

reset role;

select is(
  (select value ->> 'grantedSaveSlots' from public.entitlements
    where user_id = '33333333-3333-3333-3333-333333333333' and key = 'save-slots'),
  '5',
  'the projection reflects the folded ledger'
);

select throws_ok(
  $$ update public.entitlement_events set quantity = 45
     where user_id = '33333333-3333-3333-3333-333333333333' $$,
  'P0001',
  null,
  'the ledger is append-only even for a privileged connection'
);

-- A refund revokes; the projection returns to the free tier.
set local role service_role;

select is(
  (select status from public.record_entitlement_event(
     '33333333-3333-3333-3333-333333333333', 'product.save-slots.plus-5', 'save-slots', 'revoke',
     'payment-webhook', 5, 'provider.test', 'evt-2', now() - interval '30 minutes',
     'provider', 'provider.test', 'refund-issued via provider.test', null)),
  'applied',
  'a refund is recorded as a revocation'
);

reset role;

select is(
  (select value ->> 'grantedSaveSlots' from public.entitlements
    where user_id = '33333333-3333-3333-3333-333333333333' and key = 'save-slots'),
  '0',
  'revocation removes the granted capacity'
);

select is(
  (select value ->> 'ledgerRevision' from public.entitlements
    where user_id = '33333333-3333-3333-3333-333333333333' and key = 'save-slots'),
  '2',
  'ledgerRevision counts every folded event, including the revocation'
);

-- --- Ledger visibility ---

select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
set local role authenticated;

select is(
  (select count(*)::int from public.entitlement_events
    where user_id = '33333333-3333-3333-3333-333333333333'),
  0,
  'a different account cannot read someone else''s audit trail'
);

reset role;

-- --- Ledger idempotency beyond the payment webhook --------------------
--
-- Issue #105 findings 6 and 7, and 20260824110000 is the migration.
-- `entitlement_events_provider_event_key` is partial (`where provider is
-- not null`), so before that migration the ONLY deduplicated path was the
-- payment webhook: three identical `promotional` calls returned `applied`
-- three times and the projection went to `grantedSaveSlots: 15`. The same
-- replay under `support-adjustment` and `migration` produced two rows each.
--
-- WHAT THIS SECTION CANNOT ASSERT, said here rather than left to be
-- assumed. Finding 7 is a *race*: a redelivery arriving while the original
-- is still in flight used to raise `23505` instead of answering
-- `duplicate`. A pgTAP suite is one session, so no assertion below
-- exercises two concurrent callers -- that was demonstrated with two
-- parallel `psql` sessions, before and after, and the transcript is in the
-- pull request for #105 findings 6, 7, 9 and 11. What IS asserted here is
-- the machinery the fix rests on: that the advisory lock exists and is
-- keyed on the event rather than on the call, which is the part a future
-- edit could silently delete.

insert into auth.users (id, email) values ('55555555-5555-5555-5555-555555555555', 'promo@example.test');

-- Baseline for the two advisory-lock assertions below. Deltas rather than
-- absolute counts, because the whole suite is one transaction and
-- `submit_challenge_evidence()` takes advisory locks of its own further
-- down: an absolute count would couple these assertions to everything that
-- runs before them.
create temp table ledger_lock_baseline as
select count(*)::int as held
from pg_locks
where locktype = 'advisory' and pid = pg_backend_pid();

set local role service_role;

-- Three byte-identical promotional grants -- #105 finding 6's
-- demonstration, replayed against the fixed function.
select is(
  (select status from public.record_entitlement_event(
     '55555555-5555-5555-5555-555555555555', 'product.save-slots.plus-5', 'save-slots', 'grant',
     'promotional', 5, null, null, '2026-08-01T00:00:00Z'::timestamptz,
     'system', 'promo-bot', 'launch promo', null)),
  'applied',
  'a promotional grant with no provider key is recorded'
);

select is(
  (select status from public.record_entitlement_event(
     '55555555-5555-5555-5555-555555555555', 'product.save-slots.plus-5', 'save-slots', 'grant',
     'promotional', 5, null, null, '2026-08-01T00:00:00Z'::timestamptz,
     'system', 'promo-bot', 'launch promo', null)),
  'duplicate',
  'replaying it is a duplicate, not a second grant: the ledger key is no longer webhook-only'
);

-- The third call, because #105's demonstration was three and a fix that
-- only caught the second would be a fix nobody should trust.
select is(
  (select status from public.record_entitlement_event(
     '55555555-5555-5555-5555-555555555555', 'product.save-slots.plus-5', 'save-slots', 'grant',
     'promotional', 5, null, null, '2026-08-01T00:00:00Z'::timestamptz,
     'system', 'promo-bot', 'launch promo', null)),
  'duplicate',
  'and the third replay too'
);

-- The contract is not only "no second row": it is "return the ORIGINAL
-- outcome". A `duplicate` carrying a different id would be the shape #105
-- finding 2 found on the challenge path.
select is(
  (select event_id from public.record_entitlement_event(
     '55555555-5555-5555-5555-555555555555', 'product.save-slots.plus-5', 'save-slots', 'grant',
     'promotional', 5, null, null, '2026-08-01T00:00:00Z'::timestamptz,
     'system', 'promo-bot', 'launch promo', null)),
  (select e.event_id from public.entitlement_events e
    where e.user_id = '55555555-5555-5555-5555-555555555555'),
  'the duplicate answer carries the original event_id, so a redelivered webhook can report what happened'
);

select is(
  (select count(*)::int from public.entitlement_events
    where user_id = '55555555-5555-5555-5555-555555555555'),
  1,
  'four calls describing one fact wrote one ledger row'
);

reset role;

-- The projection is the reason a duplicate row is not merely untidy: it is
-- folded, so a replayed grant used to inflate capacity. 15 before the fix.
select is(
  (select value ->> 'grantedSaveSlots' from public.entitlements
    where user_id = '55555555-5555-5555-5555-555555555555' and key = 'save-slots'),
  '5',
  'the replays did not inflate the derived capacity: five slots, not fifteen'
);

-- One lock for four calls describing one event. This is what fails if the
-- `pg_advisory_xact_lock` line is deleted (delta 0) or if it is ever keyed
-- on something per-call rather than on the dedup key (delta 4).
select is(
  (select count(*)::int from pg_locks where locktype = 'advisory' and pid = pg_backend_pid())
    - (select held from ledger_lock_baseline),
  1,
  'the four calls took exactly one advisory lock between them: it is keyed on the event, not on the call'
);

set local role service_role;

-- The escape hatch the natural key leaves open, and the reason the key
-- includes `occurred_at` and `reason`: two genuinely separate facts differ
-- in at least one field a human reading the audit trail can see.
select is(
  (select status from public.record_entitlement_event(
     '55555555-5555-5555-5555-555555555555', 'product.save-slots.plus-5', 'save-slots', 'grant',
     'promotional', 5, null, null, '2026-08-02T00:00:00Z'::timestamptz,
     'system', 'promo-bot', 'launch promo', null)),
  'applied',
  'the same grant at a different occurred_at is a different fact, and is recorded'
);

select is(
  (select status from public.record_entitlement_event(
     '55555555-5555-5555-5555-555555555555', 'product.save-slots.plus-5', 'save-slots', 'grant',
     'promotional', 5, null, null, '2026-08-01T00:00:00Z'::timestamptz,
     'system', 'promo-bot', 'second launch promo', null)),
  'applied',
  'and so is the same grant recorded for a different reason: the audit text is part of the key'
);

reset role;

select is(
  (select count(*)::int from pg_locks where locktype = 'advisory' and pid = pg_backend_pid())
    - (select held from ledger_lock_baseline),
  3,
  'two further events took two further locks: the lock serializes one event, not the whole ledger'
);

set local role service_role;

-- `support-adjustment`, named in #105 finding 6 alongside the other two.
select is(
  (select status from public.record_entitlement_event(
     '55555555-5555-5555-5555-555555555555', 'product.save-slots.plus-5', 'save-slots', 'grant',
     'support-adjustment', 5, null, null, '2026-08-03T00:00:00Z'::timestamptz,
     'staff', 'agent-7', 'goodwill', null)),
  'applied',
  'a support adjustment is recorded'
);

select is(
  (select status from public.record_entitlement_event(
     '55555555-5555-5555-5555-555555555555', 'product.save-slots.plus-5', 'save-slots', 'grant',
     'support-adjustment', 5, null, null, '2026-08-03T00:00:00Z'::timestamptz,
     'staff', 'agent-7', 'goodwill', null)),
  'duplicate',
  'a support agent clicking twice does not grant twice'
);

select is(
  (select status from public.record_entitlement_event(
     '55555555-5555-5555-5555-555555555555', 'product.save-slots.legacy', 'save-slots', 'grant',
     'migration', 3, null, null, '2026-08-04T00:00:00Z'::timestamptz,
     'system', 'import', 'legacy import', null)),
  'applied',
  'a migration event is recorded'
);

select is(
  (select status from public.record_entitlement_event(
     '55555555-5555-5555-5555-555555555555', 'product.save-slots.legacy', 'save-slots', 'grant',
     'migration', 3, null, null, '2026-08-04T00:00:00Z'::timestamptz,
     'system', 'import', 'legacy import', null)),
  'duplicate',
  'and a re-run of an import does not grant twice either'
);

-- The expiring case exercises the other side of the nullable column in the
-- key. A NULL `expires_at` -- every assertion above -- needs `nulls not
-- distinct` on the index and `is not distinct from` in the lookup; a
-- non-null one needs neither, and would pass even if both were wrong.
select is(
  (select status from public.record_entitlement_event(
     '55555555-5555-5555-5555-555555555555', 'product.save-slots.plus-5', 'save-slots', 'grant',
     'promotional', 5, null, null, '2026-08-05T00:00:00Z'::timestamptz,
     'system', 'promo-bot', 'trial', '2026-09-05T00:00:00Z'::timestamptz)),
  'applied',
  'an expiring promotional grant is recorded'
);

select is(
  (select status from public.record_entitlement_event(
     '55555555-5555-5555-5555-555555555555', 'product.save-slots.plus-5', 'save-slots', 'grant',
     'promotional', 5, null, null, '2026-08-05T00:00:00Z'::timestamptz,
     'system', 'promo-bot', 'trial', '2026-09-05T00:00:00Z'::timestamptz)),
  'duplicate',
  'and replaying it is a duplicate: the expiry is part of the key, on both sides of NULL'
);

-- The pre-existing caller-supplied key still works, and still works for a
-- source that is not `payment-webhook` -- which is what makes the natural
-- key a backstop for callers that forget one rather than a replacement for
-- it. `entitlement_events_webhook_requires_provider` requires the pair FOR
-- `payment-webhook` and forbids it for nobody.
select is(
  (select status from public.record_entitlement_event(
     '55555555-5555-5555-5555-555555555555', 'product.save-slots.plus-5', 'save-slots', 'grant',
     'promotional', 5, 'promo.campaign', 'campaign-x', '2026-08-06T00:00:00Z'::timestamptz,
     'system', 'promo-bot', 'campaign x', null)),
  'applied',
  'a promotional event may carry the provider idempotency pair'
);

select is(
  (select status from public.record_entitlement_event(
     '55555555-5555-5555-5555-555555555555', 'product.save-slots.plus-5', 'save-slots', 'grant',
     'promotional', 5, 'promo.campaign', 'campaign-x', '2026-08-07T00:00:00Z'::timestamptz,
     'system', 'promo-bot', 'campaign x, described differently', null)),
  'duplicate',
  'and when it does, that key wins: a redelivery differing in every other field is still the same event'
);

reset role;

-- The table tier, probed as the privileged role this suite runs as -- which
-- owns the table and is exempt from RLS. The index, not the function, is
-- what makes the property true of the DATA: a future backfill or importer
-- inherits it without having to remember the rule.
select throws_ok(
  $$ insert into public.entitlement_events
       (user_id, product_id, capability, event_type, source, quantity, occurred_at, actor_kind, actor_id, reason)
     values ('55555555-5555-5555-5555-555555555555', 'product.save-slots.plus-5', 'save-slots',
             'grant', 'promotional', 5, '2026-08-01T00:00:00Z'::timestamptz, 'system', 'promo-bot', 'launch promo') $$,
  '23505',
  null,
  'a privileged direct insert of an identical provider-less event is refused by the index, not by the RPC'
);

-- --- Challenges ---
--
-- Three definitions covering the whole visibility window: one open, one
-- that has not opened yet, and one that has already closed.

insert into public.challenge_definitions
  (challenge_id, version, definition, definition_hash, signature, opens_at, closes_at, published_at)
values (
  'challenge.first-intake', 1, '{"id":"challenge.first-intake"}'::jsonb, '0123456789abcdef',
  '{"algorithm":"ed25519","keyId":"key.test","value":"AAAA"}'::jsonb,
  now() - interval '1 day', now() + interval '1 day', now() - interval '2 days'
), (
  -- Staged ahead of time: published in the future AND opening in the
  -- future, so neither bound of the read policy is satisfied.
  'challenge.sealed', 1, '{"id":"challenge.sealed","seed":"the-secret-seed"}'::jsonb, '00112233445566aa',
  '{"algorithm":"ed25519","keyId":"key.test","value":"BBBB"}'::jsonb,
  now() + interval '1 day', now() + interval '2 days', now() + interval '1 day'
), (
  'challenge.finished', 1, '{"id":"challenge.finished"}'::jsonb, '00112233445566bb',
  '{"algorithm":"ed25519","keyId":"key.test","value":"CCCC"}'::jsonb,
  now() - interval '3 days', now() - interval '1 day', now() - interval '4 days'
);

-- The read policy is a *fairness* control, not decoration. `definition`
-- holds the seed, the objectives and the scoring rule; a `using (true)`
-- policy handed all of that to anyone with the publishable key before the
-- challenge opened, which is a head start measured in days.

set local role anon;

select is(
  (select count(*)::int from public.challenge_definitions where challenge_id = 'challenge.sealed'),
  0,
  'a signed-out visitor cannot read a challenge that has not opened yet'
);

select is(
  (select count(*)::int from public.challenge_definitions where challenge_id = 'challenge.first-intake'),
  1,
  'a signed-out visitor can read a challenge that is open'
);

-- `closes_at` is deliberately not a bound: past results stay independently
-- verifiable against the bytes that were signed.
select is(
  (select count(*)::int from public.challenge_definitions where challenge_id = 'challenge.finished'),
  1,
  'a closed challenge stays readable so its results remain verifiable'
);

reset role;

-- Signing in changes who you are, never what is public. `authenticated` is
-- effectively "anyone" here, because anonymous sign-in is enabled.
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
set local role authenticated;

select is(
  (select count(*)::int from public.challenge_definitions where challenge_id = 'challenge.sealed'),
  0,
  'signing in does not reveal an unopened challenge either'
);

reset role;

select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
set local role authenticated;

select throws_ok(
  $$ insert into public.challenge_submissions
       (user_id, challenge_id, challenge_version, evidence_hash, evidence, claimed_metrics,
        verification_status, ranked_score)
     values ('33333333-3333-3333-3333-333333333333', 'challenge.first-intake', 1, 'fedcba9876543210',
             '{}'::jsonb, '{"score":9999}'::jsonb, 'verified', 9999) $$,
  '42501',
  null,
  'a client cannot insert an already-verified submission'
);

-- The evidence body names the challenge and version it was played
-- against, because `submit_challenge_evidence()` now refuses a payload that
-- disagrees with the row it is being filed under (issue #105 finding 1,
-- 20260824100100_harden_submit_challenge_evidence.sql). It used to be
-- `{"commands":[]}` here, which is exactly the shape #105's third
-- demonstration exploited -- and the assertion passed either way, which is
-- why the cross-field checks get their own assertions further down.
select is(
  (select status from public.submit_challenge_evidence(
     'challenge.first-intake', 1, 'fedcba9876543210',
     '{"challengeId":"challenge.first-intake","challengeVersion":1,"commands":[]}'::jsonb,
     '{"score":10}'::jsonb)),
  'submitted',
  'the RPC accepts evidence from an authenticated caller'
);

select is(
  (select verification_status from public.challenge_submissions where evidence_hash = 'fedcba9876543210'),
  'pending',
  'submitted evidence starts unverified'
);

select is(
  (select status from public.submit_challenge_evidence(
     'challenge.first-intake', 1, 'fedcba9876543210',
     '{"challengeId":"challenge.first-intake","challengeVersion":1,"commands":[]}'::jsonb,
     '{"score":10}'::jsonb)),
  'duplicate',
  'identical evidence cannot be submitted twice'
);

reset role;

-- --- The verifier, as the role that will actually run it ---
--
-- Unlike the entitlement ledger there is no SECURITY DEFINER function for
-- this step: advancing a submission out of 'pending' is a plain table
-- write by the trusted role (ADR 0009 step 6). Before the grants added to
-- the challenge migration it raised `42501 permission denied for table
-- challenge_submissions`, which means no submission could ever have been
-- verified and `challenge_leaderboard` would have stayed empty forever.

set local role service_role;

select lives_ok(
  $$ update public.challenge_submissions
        set verification_status = 'verified', ranked_score = 10, verified_at = now()
      where evidence_hash = 'fedcba9876543210' $$,
  'the trusted verifier can record a verdict'
);

-- The UPDATE grant is column-scoped, so a compromised verifier cannot
-- re-point a submission at another account or rewrite the evidence it
-- claims to have replayed -- the privilege check refuses before the
-- immutability trigger is even reached.
select throws_ok(
  $$ update public.challenge_submissions set user_id = '44444444-4444-4444-4444-444444444444'
      where evidence_hash = 'fedcba9876543210' $$,
  '42501',
  null,
  'the trusted verifier cannot reassign a submission to another account'
);

select throws_ok(
  $$ insert into public.challenge_submissions
       (user_id, challenge_id, challenge_version, evidence_hash, evidence, claimed_metrics)
     values ('33333333-3333-3333-3333-333333333333', 'challenge.first-intake', 1, '00ff00ff00ff00ff',
             '{}'::jsonb, '{"score":1}'::jsonb) $$,
  '42501',
  null,
  'the trusted verifier cannot manufacture a submission on a player''s behalf'
);

-- Verification is a one-way door, even for the trusted role.
select throws_ok(
  $$ update public.challenge_submissions set verification_status = 'rejected', rejection_code = 'metrics-mismatch'
     where evidence_hash = 'fedcba9876543210' $$,
  'P0001',
  null,
  'a settled submission cannot be re-verified'
);

reset role;

-- --- Evidence integrity: the key is the payload, not the claim ---
--
-- Issue #105 findings 1 and 2, one assertion per demonstration the audit
-- executed, plus the properties the fix rests on.
--
-- WHY THESE ARE HERE AND NOT ONLY IN THE MIGRATION'S COMMENTS. The
-- constraint being replaced --
-- `challenge_submissions_unique_evidence (challenge_id, challenge_version,
-- evidence_hash)` -- said in its own comment that "resubmitting identical
-- evidence, or replaying someone else's capture, cannot create a second
-- ranked row (ADR 0008 threat T3)", and this suite passed while three
-- `submitted` rows held byte-identical evidence under three fabricated
-- hashes. A constraint that names a contract and enforces a different one
-- is the defect; a suite that asserts the name rather than the behaviour is
-- how it survived.
--
-- Each assertion below drives the refusal through the tier that is
-- supposed to own it. Where the property belongs to the table rather than
-- to `submit_challenge_evidence()`, the probe writes directly as the
-- privileged role the suite is invoked with, which is the strongest caller
-- there is -- if it cannot get past the constraint or the trigger, no
-- client role can.

select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
set local role authenticated;

-- #105's fail-closed shape, now spelled like create_prison(): an
-- unauthenticated caller is refused on identity with `42501`, not with the
-- `P0001` a validation failure raises.
select set_config('request.jwt.claim.sub', '', true);

select throws_ok(
  $$ select public.submit_challenge_evidence(
       'challenge.first-intake', 1, '0f0f0f0f0f0f0f0f',
       '{"challengeId":"challenge.first-intake","challengeVersion":1,"commands":[]}'::jsonb,
       '{"score":1}'::jsonb) $$,
  '42501',
  null,
  'evidence cannot be submitted without an authenticated identity'
);

select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);

-- #105 DEMONSTRATION 3: evidence whose own challengeId disagreed with the
-- row it was filed under. The verifier compares evidence against the
-- definition it is *handed*, so a row filed under the wrong challenge is a
-- row the verifier will verify against the wrong definition.
select throws_ok(
  $$ select public.submit_challenge_evidence(
       'challenge.first-intake', 1, '0f0f0f0f0f0f0f0f',
       '{"challengeId":"challenge.finished","challengeVersion":1,"commands":[]}'::jsonb,
       '{"score":1}'::jsonb) $$,
  'P0001',
  null,
  'evidence naming another challenge cannot be filed under this one'
);

select throws_ok(
  $$ select public.submit_challenge_evidence(
       'challenge.first-intake', 1, '0f0f0f0f0f0f0f0f',
       '{"challengeId":"challenge.first-intake","challengeVersion":99,"commands":[]}'::jsonb,
       '{"score":1}'::jsonb) $$,
  'P0001',
  null,
  'evidence naming another version of this challenge cannot be filed under this one'
);

select throws_ok(
  $$ select public.submit_challenge_evidence(
       'challenge.first-intake', 1, '0f0f0f0f0f0f0f0f', '{"commands":[]}'::jsonb, '{"score":1}'::jsonb) $$,
  'P0001',
  null,
  'evidence that names no challenge at all is refused rather than adopted by the row'
);

-- A version that is not a number reaches the same refusal rather than the
-- `22P02` its `::numeric` cast would raise. The type check is written first
-- so the cast is never reached, which relies on `or` short-circuiting --
-- true here and not promised by PostgreSQL, so it is asserted rather than
-- assumed. Either way the row is refused; only the message differs.
select throws_ok(
  $$ select public.submit_challenge_evidence(
       'challenge.first-intake', 1, '0f0f0f0f0f0f0f0f',
       '{"challengeId":"challenge.first-intake","challengeVersion":"1"}'::jsonb, '{"score":1}'::jsonb) $$,
  'P0001',
  null,
  'a challengeVersion that is not a number is refused by the type check, not by the numeric cast'
);

-- The same check, fed a JSON `null` rather than an object.
select throws_ok(
  $$ select public.submit_challenge_evidence(
       'challenge.first-intake', 1, '0f0f0f0f0f0f0f0f', 'null'::jsonb, '{"score":1}'::jsonb) $$,
  'P0001',
  null,
  'evidence that is a JSON null rather than an object is refused'
);

-- And fed an SQL NULL, where the NULL-safe comparisons matter:
-- `jsonb_typeof(NULL)` is NULL, so a `<>` comparison evaluates to UNKNOWN,
-- the `if` does not fire and that check silently passes -- the mistake
-- `create_save_version()` documents about `auth.uid()`.
--
-- WHAT THIS PINS, MEASURED RATHER THAN ASSUMED: that a NULL payload is
-- refused with `P0001` before it reaches the table, not *which* check
-- refuses it. Rewriting the object check's `is distinct from` as `<>` was
-- tried, and this suite stayed green -- because the `challengeId` check on
-- the next lines is NULL-safe too and raises the same SQLSTATE. So the
-- object check is a message-quality check rather than an independent
-- control, which is what its migration now says; the NULL-safety of the
-- cross-field checks is the property, and it is this assertion plus the two
-- above it that hold it.
select throws_ok(
  $$ select public.submit_challenge_evidence(
       'challenge.first-intake', 1, '0f0f0f0f0f0f0f0f', null::jsonb, '{"score":1}'::jsonb) $$,
  'P0001',
  null,
  'evidence that is SQL NULL is refused by a NULL-safe check, not waved through as UNKNOWN'
);

-- #105 DEMONSTRATION 1: three `submitted` rows holding byte-identical
-- evidence under three fabricated hashes. The claimed hash differs on
-- every call below; the payload does not.
select is(
  (select status from public.submit_challenge_evidence(
     'challenge.first-intake', 1, 'aaaaaaaaaaaaaaaa',
     '{"challengeId":"challenge.first-intake","challengeVersion":1,"commands":[{"tick":1,"sequence":1,"payload":{}}]}'::jsonb,
     '{"score":7}'::jsonb)),
  'submitted',
  'the first submission of a run is recorded'
);

select is(
  (select status from public.submit_challenge_evidence(
     'challenge.first-intake', 1, 'bbbbbbbbbbbbbbbb',
     '{"challengeId":"challenge.first-intake","challengeVersion":1,"commands":[{"tick":1,"sequence":1,"payload":{}}]}'::jsonb,
     '{"score":7}'::jsonb)),
  'duplicate',
  'the same evidence under a second fabricated hash is a duplicate, not a second row'
);

select is(
  (select status from public.submit_challenge_evidence(
     'challenge.first-intake', 1, 'cccccccccccccccc',
     '{"challengeId":"challenge.first-intake","challengeVersion":1,"commands":[{"tick":1,"sequence":1,"payload":{}}]}'::jsonb,
     '{"score":7}'::jsonb)),
  'duplicate',
  'and under a third: the caller''s hash keys nothing'
);

select is(
  (select count(*)::int from public.challenge_submissions
    where evidence = '{"challengeId":"challenge.first-intake","challengeVersion":1,"commands":[{"tick":1,"sequence":1,"payload":{}}]}'::jsonb),
  1,
  '#105 finding 1''s three fabricated hashes now produce one row, not three'
);

-- The digest is canonical because `jsonb` is: key order and whitespace are
-- normalized on input, so a re-serialized capture is the same key. This is
-- the property that makes the constraint worth anything -- without it,
-- pretty-printing the payload would be a bypass.
select is(
  (select status from public.submit_challenge_evidence(
     'challenge.first-intake', 1, 'dddddddddddddddd',
     '{"challengeVersion":1,  "commands":[{"payload":{},"sequence":1,"tick":1}],   "challengeId":"challenge.first-intake"}'::jsonb,
     '{"score":7}'::jsonb)),
  'duplicate',
  'reordering keys and adding whitespace does not produce a new dedup key'
);

-- The converse, and the reason the claim can stay in the table: reusing an
-- already-stored `evidence_hash` for *different* evidence is accepted,
-- because the claim no longer keys anything. Under the old constraint this
-- was a way to deny an honest submitter their row.
select is(
  (select status from public.submit_challenge_evidence(
     'challenge.first-intake', 1, 'aaaaaaaaaaaaaaaa',
     '{"challengeId":"challenge.first-intake","challengeVersion":1,"commands":[{"tick":2,"sequence":1,"payload":{}}]}'::jsonb,
     '{"score":8}'::jsonb)),
  'submitted',
  'a different run submitted under an already-stored claimed hash is accepted: the claim keys nothing'
);

-- #105 DEMONSTRATION 2: an 8,388,619-byte evidence blob accepted. The
-- bound is on the table, so both the RPC and a direct write hit it, and it
-- is asserted at the boundary rather than at a round number -- an
-- off-by-one in either direction fails here.
select is(
  (select status from public.submit_challenge_evidence(
     'challenge.first-intake', 1, 'eeeeeeeeeeeeeeee',
     jsonb_build_object('challengeId', 'challenge.first-intake', 'challengeVersion', 1,
                        'blob', repeat('x', 7999924)),
     '{"score":9}'::jsonb)),
  'submitted',
  'evidence measuring exactly the limit is accepted: the bound is inclusive'
);

select throws_ok(
  $$ select public.submit_challenge_evidence(
       'challenge.first-intake', 1, 'ffffffffffffffff',
       jsonb_build_object('challengeId', 'challenge.first-intake', 'challengeVersion', 1,
                          'blob', repeat('x', 7999925)),
       '{"score":9}'::jsonb) $$,
  'LS003',
  null,
  'one byte over the limit is refused with LS003, distinct from LS001 and LS002'
);

reset role;

-- --- The table tier, probed as the privileged role ---
--
-- Everything above went through `submit_challenge_evidence()`. These four
-- bypass it entirely, as the role the suite runs as -- which owns the table
-- and is exempt from RLS -- so they assert that the properties hold of the
-- data rather than of one caller.
--
-- The first of them also has to run here rather than above:
-- `max_challenge_evidence_bytes()` is executable by nobody (issue #105
-- finding 1's migration says why), so `authenticated` cannot name it in an
-- assertion, and supabase/tests/003_data_api_grants.test.sql is what pins
-- that.

select is(
  (select octet_length(evidence::text) from public.challenge_submissions
    where evidence_hash = 'eeeeeeeeeeeeeeee'),
  public.max_challenge_evidence_bytes(),
  'the accepted payload measures exactly max_challenge_evidence_bytes(), so the measure is octet_length(evidence::text)'
);

select throws_ok(
  $$ insert into public.challenge_submissions
       (user_id, challenge_id, challenge_version, evidence_hash, evidence, claimed_metrics)
     values ('33333333-3333-3333-3333-333333333333', 'challenge.first-intake', 1, '1010101010101010',
             '{"challengeId":"challenge.first-intake","challengeVersion":1,"commands":[{"tick":1,"sequence":1,"payload":{}}]}'::jsonb,
             '{"score":7}'::jsonb) $$,
  '23505',
  null,
  'byte-identical evidence is refused by the constraint even for a privileged writer'
);

select throws_ok(
  $$ insert into public.challenge_submissions
       (user_id, challenge_id, challenge_version, evidence_hash, evidence, claimed_metrics)
     values ('33333333-3333-3333-3333-333333333333', 'challenge.first-intake', 1, '1010101010101010',
             jsonb_build_object('challengeId', 'challenge.first-intake', 'challengeVersion', 1,
                                'blob', repeat('x', 7999925)),
             '{"score":9}'::jsonb) $$,
  'LS003',
  null,
  'the payload ceiling is the table''s, not the RPC''s: a privileged direct write is refused too'
);

-- The strongest property of the fix, and the reason it is a generated
-- column rather than a trigger-maintained one: the key cannot be supplied
-- by anybody, including the owner of the table.
select throws_ok(
  $$ insert into public.challenge_submissions
       (user_id, challenge_id, challenge_version, evidence_hash, evidence, claimed_metrics, evidence_digest)
     values ('33333333-3333-3333-3333-333333333333', 'challenge.first-intake', 1, '1010101010101010',
             '{"challengeId":"challenge.first-intake","challengeVersion":1,"commands":[{"tick":9,"sequence":1,"payload":{}}]}'::jsonb,
             '{"score":7}'::jsonb, sha256('spoofed'::bytea)) $$,
  '428C9',
  null,
  'evidence_digest cannot be written directly, so no writer can choose its own dedup key'
);

-- --- Account binding (issue #105 finding 2) ---
--
-- "Whoever submits a captured blob first is ranked for it." The row above
-- belongs to account 3333; account 4444 now submits the same capture.
--
-- What changes here is the *answer*, and it is the part that was an
-- account-binding defect rather than a dedup defect: the old code replied
-- `duplicate` together with the other account's `submission_id` -- the
-- primary key of a row `challenge_submissions_select_own` deliberately
-- hides -- so the one path whose job is to bind a submission to an account
-- handed one account another account's row id.
--
-- What does NOT change is who holds the row: the key is global (ADR 0008
-- threat T3 is "replaying someone else's evidence", and a per-account key
-- would let every account hold a ranked row for one capture), so the first
-- submitter still holds it. The database can bind a row to the account
-- that submitted it; it cannot know which account *played* the run,
-- because nothing in the evidence says. That residual needs an ADR 0009
-- evidence-format amendment and is reported, not decided here.

select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
set local role authenticated;

select is(
  (select status from public.submit_challenge_evidence(
     'challenge.first-intake', 1, '2020202020202020',
     '{"challengeId":"challenge.first-intake","challengeVersion":1,"commands":[{"tick":1,"sequence":1,"payload":{}}]}'::jsonb,
     '{"score":7}'::jsonb)),
  'conflict',
  'another account submitting a captured run is told conflict, not duplicate'
);

select is(
  (select submission_id from public.submit_challenge_evidence(
     'challenge.first-intake', 1, '2020202020202020',
     '{"challengeId":"challenge.first-intake","challengeVersion":1,"commands":[{"tick":1,"sequence":1,"payload":{}}]}'::jsonb,
     '{"score":7}'::jsonb)),
  null::uuid,
  'and is handed no submission_id at all, rather than the other account''s row id'
);

reset role;

select is(
  (select user_id::text from public.challenge_submissions
    where evidence = '{"challengeId":"challenge.first-intake","challengeVersion":1,"commands":[{"tick":1,"sequence":1,"payload":{}}]}'::jsonb),
  '33333333-3333-3333-3333-333333333333',
  'the capture still has exactly one row, owned by the account that submitted first'
);

-- --- The definition oracle (issue #105 finding 9) ----------------------
--
-- `submit_challenge_evidence()` is SECURITY DEFINER, so it reads
-- `challenge_definitions` as the owner and is exempt from
-- `challenge_definitions_public_read`. It used to answer 'unknown challenge
-- X version N' for a definition that does not exist and 'challenge X
-- version N is not open for submissions' for one that exists but is hidden
-- -- an existence oracle for the unpublished pipeline, queryable one guessed
-- id at a time by any anonymously-signed-in identity. 20260824110100 is the
-- migration.
--
-- HOW INDISTINGUISHABILITY IS ASSERTED, because "both raise P0001" is not
-- it: the same challenge id is asked twice, once when no such row exists
-- and once after an unpublished row with that exact id has been inserted,
-- and BOTH are compared to the same spelled-out message. This is the one
-- place in these suites where matching the message is right rather than
-- brittle: the message *is* the security property. Everywhere else they
-- assert the SQLSTATE and leave the wording free.
-- `p_marker` only exists so the one call that is supposed to be ACCEPTED
-- carries evidence no earlier assertion in this suite has already stored:
-- the dedup key is a digest of the payload, so a byte-identical
-- resubmission would correctly answer `duplicate` and the accept path would
-- go unasserted.
create function pg_temp.submission_answer(p_challenge_id text, p_version int, p_marker text default 'probe')
returns text
language plpgsql as $$
declare
  v_status text;
begin
  select status into v_status from public.submit_challenge_evidence(
    p_challenge_id, p_version, '3f3f3f3f3f3f3f3f',
    jsonb_build_object('challengeId', p_challenge_id, 'challengeVersion', p_version,
                       'commands', '[]'::jsonb, 'marker', p_marker),
    '{"score":1}'::jsonb);
  return 'status=' || v_status;
exception when others then
  return sqlstate || ': ' || sqlerrm;
end;
$$;

-- Two more definitions, so each half of the read policy is exercised on its
-- own: `challenge.staged` is OPEN but not published (the half that used to
-- accept a submission outright), `challenge.upcoming` is published but has
-- not opened (the half that used to say "not open").
insert into public.challenge_definitions
  (challenge_id, version, definition, definition_hash, signature, opens_at, closes_at, published_at)
values (
  'challenge.staged', 1, '{"id":"challenge.staged"}'::jsonb, '00112233445566cc',
  '{"algorithm":"ed25519","keyId":"key.test","value":"DDDD"}'::jsonb,
  now() - interval '1 day', now() + interval '1 day', now() + interval '1 day'
), (
  'challenge.upcoming', 1, '{"id":"challenge.upcoming"}'::jsonb, '00112233445566dd',
  '{"algorithm":"ed25519","keyId":"key.test","value":"EEEE"}'::jsonb,
  now() + interval '1 day', now() + interval '2 days', now() - interval '1 day'
);

select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
set local role authenticated;

select is(
  pg_temp.submission_answer('challenge.oracle-probe', 1),
  'P0001: challenge challenge.oracle-probe version 1 is not available for submissions',
  'a challenge id that does not exist is refused with a message that says nothing about existence'
);

reset role;

-- The same id now exists, staged and hidden by both bounds of the read
-- policy. Nothing else about the call changes.
insert into public.challenge_definitions
  (challenge_id, version, definition, definition_hash, signature, opens_at, closes_at, published_at)
values (
  'challenge.oracle-probe', 1, '{"id":"challenge.oracle-probe","seed":"the-secret-seed"}'::jsonb, '00112233445566ee',
  '{"algorithm":"ed25519","keyId":"key.test","value":"FFFF"}'::jsonb,
  now() + interval '1 day', now() + interval '2 days', now() + interval '1 day'
);

select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
set local role authenticated;

select is(
  pg_temp.submission_answer('challenge.oracle-probe', 1),
  'P0001: challenge challenge.oracle-probe version 1 is not available for submissions',
  'and once that definition exists but is unpublished, the answer is byte-identical: the oracle is closed'
);

select is(
  (select count(*)::int from public.challenge_definitions where challenge_id = 'challenge.oracle-probe'),
  0,
  'the caller cannot read that definition either, which is the disclosure the two answers above must not undo'
);

-- The half that was not only an oracle: an OPEN but unpublished definition
-- used to return `status=submitted`, so a row was keyed and ranked against a
-- definition no client was allowed to read.
select is(
  pg_temp.submission_answer('challenge.staged', 1),
  'P0001: challenge challenge.staged version 1 is not available for submissions',
  'an open but unpublished definition no longer accepts a submission, and is not distinguishable from an absent one'
);

select is(
  pg_temp.submission_answer('challenge.upcoming', 1),
  'P0001: challenge challenge.upcoming version 1 is not available for submissions',
  'a published definition that has not opened gets the same answer: `opens_at` is enforced by the lookup now'
);

select is(
  pg_temp.submission_answer('challenge.first-intake', 99),
  'P0001: challenge challenge.first-intake version 99 is not available for submissions',
  'a non-existent version of a visible challenge gets it too'
);

-- WHAT STAYS DISTINGUISHABLE, and why it is not the finding reappearing.
select is(
  pg_temp.submission_answer('challenge.finished', 1),
  'P0001: challenge challenge.finished version 1 is closed for submissions',
  'a definition that is published, has opened and has closed gets its own answer, which a legitimate client needs'
);

-- ...because reaching that branch requires satisfying the read policy, so
-- the caller who saw it can read the row -- `closes_at` included -- for
-- itself. This assertion is what makes the one above safe.
select is(
  (select count(*)::int from public.challenge_definitions where challenge_id = 'challenge.finished'),
  1,
  'the closed answer is only ever produced for a row the caller can SELECT, so it discloses nothing new'
);

-- And the normal path still works, as the same helper, so the section that
-- proves refusals cannot be passing because everything refuses.
select is(
  pg_temp.submission_answer('challenge.first-intake', 1, 'accepts-through-the-same-helper'),
  'status=submitted',
  'a published, open definition still accepts a submission through the same helper'
);

reset role;

-- The predicate this fix duplicates is the read policy's, and the
-- duplication is structural: a SECURITY DEFINER function cannot have RLS
-- applied to itself, and inside one the invoker IS the owner, so a
-- `security_invoker` view does not help either. This asserts the policy as
-- the catalog renders it, so widening or narrowing the read rule fails here
-- and has to come back to `submit_challenge_evidence()`.
select is(
  (select pg_get_expr(polqual, polrelid)
     from pg_policy
    where polrelid = 'public.challenge_definitions'::regclass
      and polname = 'challenge_definitions_public_read'),
  '((published_at <= now()) AND (opens_at <= now()))',
  'the read policy is still exactly the predicate submit_challenge_evidence() copies into its lookup'
);

-- --- Trusted-tier column bounds (issue #189) --------------------------
--
-- The three tables above are written only by `SECURITY DEFINER` functions or
-- by `service_role` grants, so an oversized value here needs a bug in the
-- trusted tier or a compromised key rather than a hostile client -- defence in
-- depth, not a reachable hole, and worth stating as such. It is asserted for
-- the same reason `entitlement_events` has carried five `char_length` bounds
-- since 20260823090000: a size bound writes down an invariant the trusted
-- tier's own TypeScript contract already satisfies, so a bug cannot silently
-- violate it. That is a different act from `TRUNCATE` (#163), which would
-- *remove* an authority ADR 0008 may have meant the trusted tier to have.
--
-- Both directions, as in suite 006: each bound refuses a value past the
-- ceiling and admits one exactly at it. The admit half is what fails if a
-- later change tightens a ceiling below what the contract can produce.
--
-- Probed as the table owner, deliberately: these paths are unreachable from
-- either client role, so `set local role` would prove nothing here beyond what
-- suite 003 already pins about the grants.

select throws_ok(
  $$ insert into public.entitlements (user_id, key, value)
     values ('11111111-1111-1111-1111-111111111111', repeat('k', 129), '{}'::jsonb) $$,
  '23514',
  null,
  'an entitlement key past 128 characters is refused'
);

select throws_ok(
  $$ insert into public.entitlements (user_id, key, value)
     values ('11111111-1111-1111-1111-111111111111', 'save-slots',
             jsonb_build_object('junk', repeat('v', 4096))) $$,
  '23514',
  null,
  'an entitlement value past 4 KiB is refused'
);

-- A real seeded identity here, not the fabricated id the two refusals above
-- use: those assert SQLSTATE `23514` specifically, so a foreign-key failure
-- (`23503`) would not satisfy them, but an admission has to get past the key.
-- The primary key is `(user_id, key)`, so a 128-character key cannot collide
-- with the row the ledger recompute already wrote for this account.
select lives_ok(
  $$ insert into public.entitlements (user_id, key, value)
     values ('55555555-5555-5555-5555-555555555555', repeat('k', 128),
             jsonb_build_object('k', repeat('v', 4096 - 9))) $$,
  'an entitlement key at 128 characters and a value at exactly 4 KiB are admitted'
);

select throws_ok(
  $$ insert into public.challenge_definitions
       (challenge_id, version, definition, definition_hash, signature, opens_at, closes_at)
     values ('challenge.bound', 1, jsonb_build_object('junk', repeat('d', 65536)),
             repeat('f', 16), '{"s":1}'::jsonb, now(), now() + interval '1 day') $$,
  '23514',
  null,
  'a challenge definition body past 64 KiB is refused'
);

select throws_ok(
  $$ insert into public.challenge_definitions
       (challenge_id, version, definition, definition_hash, signature, opens_at, closes_at)
     values ('challenge.bound', 1, '{"k":1}'::jsonb, repeat('f', 16),
             jsonb_build_object('junk', repeat('s', 4096)), now(), now() + interval '1 day') $$,
  '23514',
  null,
  'a challenge definition signature past 4 KiB is refused'
);

select lives_ok(
  $$ insert into public.challenge_definitions
       (challenge_id, version, definition, definition_hash, signature, opens_at, closes_at)
     values ('challenge.bound', 1, jsonb_build_object('k', repeat('d', 65536 - 9)),
             repeat('f', 16), jsonb_build_object('k', repeat('s', 4096 - 9)),
             now(), now() + interval '1 day') $$,
  'a definition body at exactly 64 KiB and a signature at exactly 4 KiB are admitted'
);

-- `rejection_code` is nullable, and the existing `..._rejected_has_code`
-- constraint only requires a rejected row to *have* one. The bound is on its
-- length, and NULL must stay admissible or every non-rejected row would fail.
select is(
  (select count(*)::int from pg_constraint
    where conrelid = 'public.challenge_submissions'::regclass
      and conname = 'challenge_submissions_rejection_code_check'
      and pg_get_constraintdef(oid) ilike '%is null%'),
  1,
  'the rejection-code bound admits NULL, so it does not make the column required'
);


select * from finish();
rollback;
