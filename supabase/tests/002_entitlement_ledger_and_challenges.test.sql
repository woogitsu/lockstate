-- pgTAP tests for the trusted-services schema added by issue #36:
-- the append-only entitlement ledger, its derived projection, and the
-- challenge definition/submission tables.
--
-- EXECUTED two ways, 17/17 assertions each: `supabase test db` against the
-- REAL Supabase local stack (CLI 2.115.0), and `pnpm verify:sql` against
-- plain PostgreSQL 16.13 + pgTAP 1.3.2 and 18.6 + pgTAP 1.3.4 via
-- scripts/sql/supabase-compat-harness.sql.
--
-- The first real-stack run failed here at "a different account cannot read
-- someone else's audit trail" with `42501 permission denied for table
-- entitlement_events` -- not because isolation was broken, but because the
-- table had no SELECT grant at all, so the entitlement UI could never have
-- worked. See docs/CLOUD_SAVE.md and supabase/tests/003_data_api_grants.test.sql.
--
-- The harness is still not Supabase, and neither run proves that GoTrue
-- mints the identity these policies read; `auth.uid()` is fed here by
-- `set_config`. See scripts/verify-supabase-stack.mjs for that step.

begin;
select plan(17);

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

select is(
  (select count(*)::int from public.entitlement_events where user_id = '33333333-3333-3333-3333-333333333333'),
  1,
  'the redelivered event wrote no second ledger row'
);

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
select is(
  (select status from public.record_entitlement_event(
     '33333333-3333-3333-3333-333333333333', 'product.save-slots.plus-5', 'save-slots', 'revoke',
     'payment-webhook', 5, 'provider.test', 'evt-2', now() - interval '30 minutes',
     'provider', 'provider.test', 'refund-issued via provider.test', null)),
  'applied',
  'a refund is recorded as a revocation'
);

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

-- --- Challenges ---

insert into public.challenge_definitions
  (challenge_id, version, definition, definition_hash, signature, opens_at, closes_at)
values (
  'challenge.first-intake', 1, '{"id":"challenge.first-intake"}'::jsonb, '0123456789abcdef',
  '{"algorithm":"ed25519","keyId":"key.test","value":"AAAA"}'::jsonb,
  now() - interval '1 day', now() + interval '1 day'
);

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

select is(
  (select status from public.submit_challenge_evidence(
     'challenge.first-intake', 1, 'fedcba9876543210', '{"commands":[]}'::jsonb, '{"score":10}'::jsonb)),
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
     'challenge.first-intake', 1, 'fedcba9876543210', '{"commands":[]}'::jsonb, '{"score":10}'::jsonb)),
  'duplicate',
  'identical evidence cannot be submitted twice'
);

reset role;

-- Verification is a one-way door, even for the trusted role.
update public.challenge_submissions
   set verification_status = 'verified', ranked_score = 10, verified_at = now()
 where evidence_hash = 'fedcba9876543210';

select throws_ok(
  $$ update public.challenge_submissions set verification_status = 'rejected', rejection_code = 'metrics-mismatch'
     where evidence_hash = 'fedcba9876543210' $$,
  'P0001',
  null,
  'a settled submission cannot be re-verified'
);

select * from finish();
rollback;
