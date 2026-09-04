-- pgTAP tests for the telemetry ingest destination and its retention rule
-- (20260904090000_create_telemetry_events.sql, ADR 0046): two tables, two
-- SECURITY DEFINER functions, and the dedicated least-privilege role.
--
-- **The retention half was added on 2026-09-04**, when the owner ruled for a
-- fourth object; the sentence above named three objects until then. Section D
-- is that half, and section A gained the six refusals that keep the ingest
-- role out of it.
--
-- WHY THIS SUITE EXISTS, AND WHAT IT REFUSES TO DO. Every claim the migration
-- makes about a privilege is driven **by trying to violate it as the role it is
-- about**, not by reading the grant back. Suite 003 reads grants and is right
-- to: it pins the surface exhaustively. What it cannot do is notice a role it
-- does not name, and it did not -- `telemetry_ingest` was created and all 35
-- assertions in that suite stayed green, measured on the run that added it.
-- `docs/DEPLOYMENT.md`'s pre-merge checklist item 4 predicted precisely that
-- and asked for the role to be added there; it is, and this file is the other
-- half: `has_table_privilege(...)` returning false and `42501 permission
-- denied` are different statements, and only the second one is a fact about
-- what happens.
--
-- THE ONE THING THAT MATTERS MOST HERE. The credential this role represents
-- sits behind an **unauthenticated public endpoint**. The mistake it exists to
-- make impossible is a `service_role` key in that position: `service_role` may
-- call `record_entitlement_event()` -- the paid-entitlement write path -- and
-- bypasses RLS, so that substitution puts the whole database behind the
-- endpoint. Section A drives both halves as the roles themselves: the ingest
-- role cannot reach anything but its one function, and `service_role` cannot
-- call that function at all. The wrong credential does not merely carry too
-- much authority; it does not work.
--
-- WHICH ROLE EACH SECTION RUNS AS, and why:
--
--   * **A -- as `telemetry_ingest`, `service_role`, `authenticated`, `anon`.**
--     Privilege refusals. These have to be role-switched or they assert
--     nothing.
--   * **B -- as the table owner.** The function's batch bounds and the
--     columns' bounds. Probed as the strongest writer there is, which is suite
--     010's argument for the same choice: "if it cannot get past the
--     constraint, no client role can." Every one of these is unreachable from
--     any client role anyway -- section A is what establishes that.
--   * **C -- as `telemetry_ingest`.** One accepted batch, end to end through
--     the grant, so that section A's wall of refusals cannot be passing
--     because the role can do nothing at all.
--   * **D -- as the table owner.** The retention job: which rows a window
--     reaches, and what the audit row says about it. As the owner for the same
--     reason section B is, and additionally because ageing a row is something
--     only the owner can do -- `received_at` is `default now()` on a table with
--     no INSERT grant, so a genuinely old row has to be planted by the
--     strongest writer there is, standing in for the passage of time.
--
-- `set local role` INSIDE this file's explicit transaction block, with
-- `current_user` read back as an assertion every time, for the reason
-- 20260824101000 and suites 009 and 010 all record: a `set local role` outside
-- a transaction block silently no-ops and leaves the session privileged, which
-- is how an audit in #105 nearly produced a false clean.
--
-- EXECUTED against plain PostgreSQL 16.13 + pgTAP 1.3.2 via `pnpm verify:sql`.
-- NOT executed against the real Supabase local stack or a hosted project, and
-- the migration under test is applied nowhere; see docs/CLOUD_SAVE.md, "What
-- has and has not been executed".

begin;
select plan(89);

-- pgTAP lives in the `extensions` schema (scripts/sql/supabase-compat-harness.sql
-- puts it there so that suite 003's "the Data API surface of `public` is
-- exactly ours" assertion is not defeated by ~1000 pgtap functions), and
-- calling `throws_ok` needs USAGE on that schema. `telemetry_ingest` has none
-- -- correctly, it needs none -- so the suite grants it for the duration of
-- this transaction and the ROLLBACK at the bottom takes it away again.
--
-- Stated rather than buried, because a privilege granted inside a privilege
-- test deserves a sentence: schema USAGE on `extensions` confers no privilege
-- on any relation or function in `public`, so nothing section A asserts is
-- weakened by it. It is the assertion framework's requirement, not the
-- subject's.
grant usage on schema extensions to telemetry_ingest;

-- One canonical accepted record, with hooks for overriding the envelope and
-- the record around it. Built as a helper rather than repeated as a literal so
-- that a probe below differs from an accepted batch in exactly one field --
-- which is the whole content of a bound assertion.
--
-- The values are the shapes `src/services/telemetry/` actually produces:
-- `eventId` is `${sessionId}-${counter}` (pipeline.ts), `name` is a registered
-- event from `DEFAULT_TELEMETRY_EVENTS`, `sampleRate` is that event's
-- registry default of 1 (diagnostics are unsampled because a crash is rare and
-- always interesting), and `receivedAt` is present and absurd on purpose --
-- see the stamp assertions in section B.
create function pg_temp.ingest_record(
  p_envelope jsonb default '{}'::jsonb,
  p_record jsonb default '{}'::jsonb
) returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'receivedAt', 0,
    'environment', 'staging',
    'registrySampleRate', 1,
    'claimedSampleRate', 1,
    'claimedOccurredAt', 1756900000000::bigint,
    'envelope', jsonb_build_object(
      'schemaVersion', 1,
      'eventId', 'sess-a-1',
      'name', 'diagnostic.unhandled-error',
      'category', 'diagnostics',
      'occurredAt', 1756900000000::bigint,
      'sessionId', 'sess-a',
      'release', jsonb_build_object(
        'buildVersion', 'lockstate-0.0.0',
        'environment', 'staging',
        'commit', 'abc0123'
      ),
      'consentVersion', 1,
      'sampleRate', 1,
      'attributes', jsonb_build_object('errorMessage', 'boom')
    ) || p_envelope
  ) || p_record
$$;

create function pg_temp.ingest_batch(p_envelope jsonb default '{}'::jsonb, p_record jsonb default '{}'::jsonb)
returns jsonb
language sql
immutable
as $$ select jsonb_build_array(pg_temp.ingest_record(p_envelope, p_record)) $$;

-- ============================================================================
-- Section A: what each role can and cannot do, established by doing it
-- ============================================================================

set local role telemetry_ingest;

select is(
  current_user::text,
  'telemetry_ingest',
  'the ingest-role probes below really run as telemetry_ingest, not as a privileged session'
);

-- The table it writes to, and the four verbs. **No SELECT** is the one worth
-- reading twice: an append-only ingest that can read back what it wrote is a
-- read path, and this credential is the one an unauthenticated endpoint holds.
select throws_ok(
  $$ select 1 from public.telemetry_events $$,
  '42501',
  null,
  'the ingest role cannot read telemetry_events: the only credential behind the public endpoint is write-only'
);

select throws_ok(
  $$ insert into public.telemetry_events
       (event_id, schema_version, name, category, session_id, environment,
        release_build_version, consent_version, registry_sample_rate,
        claimed_sample_rate, claimed_occurred_at, attributes)
     values ('direct-1', 1, 'diagnostic.unhandled-error', 'diagnostics', 's', 'staging',
             'lockstate-0.0.0', 1, 1, 1, 0, '{}'::jsonb) $$,
  '42501',
  null,
  'the ingest role cannot INSERT directly: a second write path could skip the function''s batch bounds'
);

select throws_ok(
  $$ update public.telemetry_events set name = 'edited' $$,
  '42501',
  null,
  'the ingest role cannot UPDATE: a stored row is not editable by the thing that stored it'
);

select throws_ok(
  $$ delete from public.telemetry_events $$,
  '42501',
  null,
  'the ingest role cannot DELETE: retention is the deletion authority, not the ingest'
);

-- TRUNCATE gets its own assertion for the reason 20260824090100 and
-- 20260824150000 give: it ignores row level security entirely and fires no row
-- trigger, so a single statement reaches past every control on a table.
select throws_ok(
  $$ truncate table public.telemetry_events $$,
  '42501',
  null,
  'the ingest role cannot TRUNCATE telemetry_events: it would ignore RLS and fire no row trigger'
);

-- Nothing else in the schema, sampled at the two places it would hurt most: a
-- table holding player data, and the entitlement write path a `service_role`
-- key would have reached. Suite 003's sweep for this role is the exhaustive
-- version; these two are the readable failure.
select throws_ok(
  $$ select 1 from public.prisons $$,
  '42501',
  null,
  'the ingest role cannot read prisons: nothing about cloud save is reachable with this credential'
);

select throws_ok(
  $$ select public.record_entitlement_event(
       '00000000-0000-0000-0000-000000000001'::uuid, 'product.save-slots.plus-5',
       'save-slots', 'grant', 'promotional', 5, null, null, now(),
       'system', 'probe', 'reachability probe', null) $$,
  '42501',
  null,
  'the ingest role cannot call record_entitlement_event: the paid-entitlement write path is not behind the public endpoint'
);

-- --- The retention job, and its audit trail ----------------------------
--
-- The second half of "this role may do exactly one thing", and the reason it
-- is driven here rather than read off a grant: the retention function
-- (20260904090000 section 6) is the only other entry point in this schema that
-- touches `telemetry_events`, and it DELETES from it. EXECUTE on it, held by
-- the credential behind an unauthenticated public endpoint, would let anything
-- that can reach that endpoint erase up to ninety days of diagnostics with one
-- statement -- and, worse, write audit rows saying the erasure was routine.
--
-- The audit table gets the same four verbs plus TRUNCATE, because reading it is
-- a capability of its own: it says when telemetry was deleted and how much,
-- which is a second thing a one-thing credential does not get.
select throws_ok(
  $$ select public.enforce_telemetry_retention() $$,
  '42501',
  null,
  'the ingest role cannot run the retention job: the credential behind the public endpoint cannot erase what it wrote'
);

select throws_ok(
  $$ select 1 from public.telemetry_retention_runs $$,
  '42501',
  null,
  'the ingest role cannot read the retention audit: when telemetry was deleted and how much is not the ingest''s to know'
);

select throws_ok(
  $$ insert into public.telemetry_retention_runs
       (category, keyed_on, retention_days, cutoff, deleted_count)
     values ('diagnostics', 'received_at', 90, now() - interval '90 days', 0) $$,
  '42501',
  null,
  'the ingest role cannot write an audit row: a forged run record is how a deletion that never happened looks compliant'
);

select throws_ok(
  $$ update public.telemetry_retention_runs set deleted_count = 0 $$,
  '42501',
  null,
  'the ingest role cannot edit an audit row: an audit trail the audited party can rewrite is not one'
);

select throws_ok(
  $$ delete from public.telemetry_retention_runs $$,
  '42501',
  null,
  'the ingest role cannot delete an audit row either'
);

select throws_ok(
  $$ truncate table public.telemetry_retention_runs $$,
  '42501',
  null,
  'and it cannot TRUNCATE the audit table: that would ignore RLS and fire no row trigger, which is why it gets its own assertion'
);

reset role;

-- The substitution the whole design exists to refuse.
set local role service_role;

select is(
  current_user::text,
  'service_role',
  'the service_role probe below really runs as service_role'
);

select throws_ok(
  $$ select public.record_telemetry_events('[]'::jsonb) $$,
  '42501',
  null,
  'service_role cannot call record_telemetry_events at all: a Worker wired with a service-role key stores nothing rather than storing too much'
);

select throws_ok(
  $$ select public.enforce_telemetry_retention() $$,
  '42501',
  null,
  'and service_role cannot run the retention job: the trusted tier holds no erase path here, the way ADR 0008 gives it no TRUNCATE anywhere'
);

reset role;

set local role authenticated;
select is(current_user::text, 'authenticated', 'the authenticated probe below really runs as authenticated');
select throws_ok(
  $$ select public.record_telemetry_events('[]'::jsonb) $$,
  '42501',
  null,
  'a signed-in browser identity cannot call the ingest function: the browser posts to the endpoint, never to the database'
);
select throws_ok(
  $$ select public.enforce_telemetry_retention() $$,
  '42501',
  null,
  'nor the retention job: a signed-in visitor -- which with anonymous sign-in is any visitor -- cannot delete other players'' diagnostics'
);
reset role;

set local role anon;
select is(current_user::text, 'anon', 'the anon probe below really runs as anon');
select throws_ok(
  $$ select public.record_telemetry_events('[]'::jsonb) $$,
  '42501',
  null,
  'anon cannot call the ingest function either, so a published anon key is not a telemetry write path'
);
select throws_ok(
  $$ select public.enforce_telemetry_retention() $$,
  '42501',
  null,
  'and anon cannot run the retention job, so the published anon key is not a delete path either'
);
reset role;

-- The role's own attributes, which no grant expresses. A LOGIN role with a
-- password would be a credential this repository could ship; `nologin` is what
-- keeps "how the Worker becomes this role" a deploy decision (AGENTS.md
-- reservation 3) rather than a line in a migration.
select is(
  (select rolcanlogin::text || ' ' || rolsuper::text || ' ' || rolcreaterole::text || ' '
          || rolcreatedb::text || ' ' || rolbypassrls::text || ' ' || rolinherit::text
     from pg_roles where rolname = 'telemetry_ingest'),
  'false false false false false false',
  'telemetry_ingest cannot log in and holds no role attribute: no password ships here, and it does not bypass RLS'
);

-- Membership is the privilege path a grant sweep does not see. If
-- `telemetry_ingest` were granted `service_role` -- or if `authenticated` were
-- granted `telemetry_ingest` -- every assertion above would still pass while
-- the boundary was gone.
select is(
  (select string_agg(m.rolname || '<-' || g.rolname, ' ' order by m.rolname, g.rolname)
     from pg_auth_members am
     join pg_roles m on m.oid = am.roleid
     join pg_roles g on g.oid = am.member
    where m.rolname = 'telemetry_ingest' or g.rolname = 'telemetry_ingest'),
  null,
  'telemetry_ingest is a member of no role and no role is a member of it, so nothing reaches it or through it by inheritance'
);

-- ============================================================================
-- Section B: the function and the table, probed as the table owner
-- ============================================================================

select is(
  (select count(*)::int from pg_roles
    where rolname = current_user and rolsuper),
  1,
  'section B runs as a privileged session: every refusal below is one the strongest possible writer cannot get past'
);

-- --- The structural claims ADR 0046 makes about the table ---------------
--
-- "**no `user_id` column at all**, so the *direct* join in item 3 is
-- structurally impossible rather than merely forbidden." Asserted as the
-- absence of any account-shaped column AND of any foreign key, because a
-- foreign key into `auth.users` under a different name would be the same
-- defect with better spelling.
select is(
  (select string_agg(a.attname, ' ' order by a.attname)
     from pg_attribute a
    where a.attrelid = 'public.telemetry_events'::regclass
      and a.attnum > 0 and not a.attisdropped
      and (a.attname ~ '(user|account|owner|profile)' or a.atttypid = 'uuid'::regtype)),
  null,
  'telemetry_events carries no account-shaped column and no uuid at all, so ADR 0046 item 3''s join has nothing to join on'
);

select is(
  (select string_agg(k.conname, ' ' order by k.conname)
     from pg_constraint k
    where k.conrelid = 'public.telemetry_events'::regclass
      and k.contype = 'f'),
  null,
  'telemetry_events has no foreign key, so no later view or policy can reach an account through one'
);

-- --- The batch bounds, which are the function's job ---------------------

select throws_ok(
  $$ select public.record_telemetry_events('{"events": []}'::jsonb) $$,
  '22023',
  null,
  'a batch that is not a JSON array is refused rather than coerced'
);

select throws_ok(
  $$ select public.record_telemetry_events('[]'::jsonb) $$,
  '22023',
  null,
  'an empty batch is refused: the Worker rejects one before it gets here, so an empty array means a different caller'
);

-- `MAX_INGEST_BATCH_SIZE` = 32, from src/worker/telemetry-ingest.ts. Both
-- directions, because a bound that refuses 33 and also refuses 32 is not this
-- bound.
select throws_ok(
  $$ select public.record_telemetry_events(
       (select jsonb_agg(pg_temp.ingest_record(jsonb_build_object('eventId', 'sess-b-' || i)))
          from generate_series(1, 33) as i)) $$,
  '54000',
  null,
  'a batch of 33 is refused: MAX_INGEST_BATCH_SIZE is 32 and the database is not looser than the endpoint'
);

select lives_ok(
  $$ select public.record_telemetry_events(
       (select jsonb_agg(pg_temp.ingest_record(jsonb_build_object('eventId', 'sess-c-' || i)))
          from generate_series(1, 32) as i)) $$,
  'a batch of exactly 32 is accepted, so the bound refuses nothing the endpoint admits'
);

-- `MAX_INGEST_BODY_BYTES` = 32 * 12288 + 1024 = 394240. The guard for a caller
-- sending 32 records that are each individually admissible and collectively
-- enormous -- the shared schema bounds a field, never a batch. Note the
-- SQLSTATE: this refusal happens in the function, before any column constraint
-- is reached, which is what makes it a *batch* bound rather than 32 field
-- bounds firing one at a time.
select throws_ok(
  $$ select public.record_telemetry_events(
       (select jsonb_agg(pg_temp.ingest_record(jsonb_build_object(
                 'eventId', 'sess-d-' || i,
                 'attributes', jsonb_build_object('errorMessage', repeat('x', 20000)))))
          from generate_series(1, 32) as i)) $$,
  '54000',
  null,
  'a 32-record batch over 394240 bytes is refused by the function before any row is examined'
);

-- The Worker refuses a batch whose wire `environment` disagrees with an
-- envelope's `release.environment` (`environment-mismatch`), because there is
-- no single right answer to store. Only one column is stored, so the function
-- re-runs that check rather than trusting an upstream guard to have run.
select throws_ok(
  $$ select public.record_telemetry_events(
       pg_temp.ingest_batch('{}'::jsonb, '{"environment": "production"}'::jsonb)) $$,
  '22023',
  null,
  'a record whose two statements about its environment disagree is refused here, not only at the endpoint'
);

-- --- The server stamp, and the replay ----------------------------------

-- The canonical record carries `"receivedAt": 0` -- 1 January 1970 -- because
-- `TelemetryIngestRecord` really does carry a `receivedAt` and the store
-- implementation will really send it. ADR 0046 section 7 item 1 requires the
-- stored value to be the server's and unsettable from the body, so the only
-- way to establish that is to send a hostile one and read back what landed.
select lives_ok(
  $$ select public.record_telemetry_events(pg_temp.ingest_batch()) $$,
  'the canonical record is accepted, so the stamp assertions below are about a row that exists'
);

select is(
  (select (received_at = now())::text from public.telemetry_events where event_id = 'sess-a-1'),
  'true',
  'a record claiming receivedAt = 0 is stored with the database''s now(): the body cannot set the retention clock'
);

select is(
  (select claimed_occurred_at from public.telemetry_events where event_id = 'sess-a-1'),
  1756900000000::bigint,
  'the client''s occurredAt is stored as claimed_occurred_at -- kept as a claim, in a column no retention window can key on'
);

-- A batch dated the year 4000 is admitted by `telemetryEnvelopeSchema`
-- (`z.number().int().min(0)`, no upper bound) and is the exact defeat ADR 0046
-- section 7 item 1 corrects: a retention window keyed on the client's value
-- would never reach it. Stored, and `received_at` is still now().
select lives_ok(
  $$ select public.record_telemetry_events(pg_temp.ingest_batch(
       jsonb_build_object('eventId', 'sess-a-4000', 'occurredAt', 64060588800000::bigint),
       jsonb_build_object('claimedOccurredAt', 64060588800000::bigint))) $$,
  'an event claiming to have occurred in the year 4000 is accepted rather than rejected: the claim is data, not a clock'
);

select is(
  (select (received_at = now())::text from public.telemetry_events where event_id = 'sess-a-4000'),
  'true',
  'and its received_at is still now(), so the 90/90/30 windows a retention job reads are unreachable from the body'
);

-- Idempotent replay (ADR 0046: "keyed by the client's `event_id` for
-- idempotent replays"). Two properties in one probe: the second call inserts
-- nothing, and -- the part retention depends on -- it does not move the
-- existing row's `received_at`, because `do nothing` contains no UPDATE.
-- `lives_ok` first, and it is the assertion that catches the mutation. Without
-- `on conflict (event_id) do nothing` the replay raises `23505 duplicate key`,
-- which aborts the transaction and every remaining assertion with it -- so the
-- suite fails on a plan mismatch rather than naming the defect. Measured: 30 of
-- 61 assertions ran. This turns that into one readable failure.
select lives_ok(
  $$ select public.record_telemetry_events(pg_temp.ingest_batch()) $$,
  'a replayed batch does not raise: on conflict do nothing is what makes a client retry idempotent rather than an error'
);

select is(
  (select public.record_telemetry_events(pg_temp.ingest_batch())),
  0,
  'a replayed batch inserts nothing and says so: the client retries, and a retry is not a second event'
);

select is(
  (select count(*)::int from public.telemetry_events where event_id = 'sess-a-1'),
  1,
  'and the replay left exactly one row, so a retrying client cannot inflate an aggregate'
);

-- --- The column bounds, each by trying to violate it -------------------
--
-- One field at a time, against the canonical record that is otherwise
-- accepted, so each failure names the bound it is about rather than "something
-- in this batch".

select throws_ok(
  $$ select public.record_telemetry_events(pg_temp.ingest_batch(
       jsonb_build_object('eventId', repeat('e', 129)))) $$,
  '23514',
  null,
  'an event_id of 129 characters is refused: identifierSchema caps every identifier at 128'
);

select throws_ok(
  $$ select public.record_telemetry_events(pg_temp.ingest_batch(
       jsonb_build_object('eventId', 'sess-e-1', 'name', repeat('n', 129)))) $$,
  '23514',
  null,
  'an event name of 129 characters is refused'
);

select throws_ok(
  $$ select public.record_telemetry_events(pg_temp.ingest_batch(
       jsonb_build_object('eventId', 'sess-e-2', 'sessionId', repeat('s', 129)))) $$,
  '23514',
  null,
  'a session id of 129 characters is refused'
);

select throws_ok(
  $$ select public.record_telemetry_events(pg_temp.ingest_batch(
       jsonb_build_object('eventId', 'sess-e-3', 'release',
         jsonb_build_object('buildVersion', repeat('b', 129), 'environment', 'staging')))) $$,
  '23514',
  null,
  'a build version of 129 characters is refused'
);

-- The empty string, which would be a second spelling of "no commit" beside
-- NULL -- 20260824101000's argument for `profiles.display_name`.
select throws_ok(
  $$ select public.record_telemetry_events(pg_temp.ingest_batch(
       jsonb_build_object('eventId', 'sess-e-4', 'release',
         jsonb_build_object('buildVersion', 'lockstate-0.0.0', 'environment', 'staging', 'commit', '')))) $$,
  '23514',
  null,
  'an empty commit is refused: absence is spelled NULL and nothing else'
);

-- ...and the same field absent is fine, because `releaseIdentitySchema`
-- declares `commit: identifierSchema.optional()`. The pair is what makes the
-- bound above a bound rather than a requirement.
select lives_ok(
  $$ select public.record_telemetry_events(pg_temp.ingest_batch(
       jsonb_build_object('eventId', 'sess-e-5', 'release',
         jsonb_build_object('buildVersion', 'lockstate-0.0.0', 'environment', 'staging')))) $$,
  'a record with no commit at all is accepted: the field is optional in releaseIdentitySchema and nullable here'
);

select throws_ok(
  $$ select public.record_telemetry_events(pg_temp.ingest_batch(
       jsonb_build_object('eventId', 'sess-e-6', 'category', 'marketing'))) $$,
  '23514',
  null,
  'a category outside the three telemetryCategorySchema declares is refused: the set is closed, not merely bounded'
);

select throws_ok(
  $$ select public.record_telemetry_events(pg_temp.ingest_batch(
       jsonb_build_object('eventId', 'sess-e-7', 'release',
         jsonb_build_object('buildVersion', 'lockstate-0.0.0', 'environment', 'preview')),
       jsonb_build_object('environment', 'preview'))) $$,
  '23514',
  null,
  'an environment outside the three TELEMETRY_ENVIRONMENTS declares is refused, even when the record agrees with its envelope'
);

select throws_ok(
  $$ select public.record_telemetry_events(pg_temp.ingest_batch(
       jsonb_build_object('eventId', 'sess-e-8', 'schemaVersion', 2))) $$,
  '23514',
  null,
  'schema_version 2 is refused: telemetryEnvelopeSchema pins it with z.literal, so a range here would be looser than the client'
);

select throws_ok(
  $$ select public.record_telemetry_events(pg_temp.ingest_batch(
       jsonb_build_object('eventId', 'sess-e-9', 'consentVersion', 0))) $$,
  '23514',
  null,
  'consent version 0 is refused: there is no "not yet asked" value, because absence means that'
);

-- The two sample rates. `1.5` is out of range and `NaN` is the shape that
-- would otherwise sort above Infinity in any index -- 20260824130000 measured
-- that on `challenge_submissions.ranked_score`. A bounded float needs no
-- second `isfinite` check, because every comparison against NaN is false.
select throws_ok(
  $$ select public.record_telemetry_events(pg_temp.ingest_batch(
       jsonb_build_object('eventId', 'sess-e-10'),
       jsonb_build_object('claimedSampleRate', 1.5))) $$,
  '23514',
  null,
  'a claimed sample rate above 1 is refused'
);

select throws_ok(
  $$ select public.record_telemetry_events(pg_temp.ingest_batch(
       jsonb_build_object('eventId', 'sess-e-11'),
       jsonb_build_object('claimedSampleRate', 'NaN'))) $$,
  '23514',
  null,
  'a claimed sample rate of NaN is refused by the range alone: every comparison against NaN is false'
);

select throws_ok(
  $$ select public.record_telemetry_events(pg_temp.ingest_batch(
       jsonb_build_object('eventId', 'sess-e-12'),
       jsonb_build_object('registrySampleRate', -0.1))) $$,
  '23514',
  null,
  'a negative registry sample rate is refused: this is the only rate an aggregate may weight by, so its range is load-bearing'
);

select throws_ok(
  $$ select public.record_telemetry_events(pg_temp.ingest_batch(
       jsonb_build_object('eventId', 'sess-e-13'),
       jsonb_build_object('claimedOccurredAt', -1))) $$,
  '23514',
  null,
  'a negative claimed occurrence is refused'
);

select throws_ok(
  $$ select public.record_telemetry_events(pg_temp.ingest_batch(
       jsonb_build_object('eventId', 'sess-e-14'),
       jsonb_build_object('claimedOccurredAt', 9007199254740992::bigint))) $$,
  '23514',
  null,
  'a claimed occurrence past Number.MAX_SAFE_INTEGER is refused: the bound is the ceiling z.number().int() can carry'
);

-- `attributes`, which is the column the external audit's 33 MB finding was
-- about one table over (`user_settings.payload`). Bounded at
-- `MAX_ENVELOPE_BYTES` = 12288, so it cannot hold more than the endpoint
-- admits for the whole envelope it belongs to.
select throws_ok(
  $$ select public.record_telemetry_events(pg_temp.ingest_batch(
       jsonb_build_object('eventId', 'sess-e-15',
         'attributes', jsonb_build_object('errorMessage', repeat('x', 12289))))) $$,
  '23514',
  null,
  'attributes over 12288 bytes are refused: the bound is MAX_ENVELOPE_BYTES, and the audit''s 33 MB class does not reappear here'
);

-- ...and the worst case the shared schema can actually produce is accepted,
-- which is the direction 20260824101000 states as the convention: "Every bound
-- below is chosen so that SQL refuses nothing the TypeScript contract can
-- produce." `MAX_TELEMETRY_ATTRIBUTES` = 24 entries of a 128-character key
-- (`identifierSchema`) and a `MAX_TELEMETRY_STRING_LENGTH` = 200-character
-- value, which `jsonb::text` renders as 8,064 bytes.
select lives_ok(
  $$ select public.record_telemetry_events(pg_temp.ingest_batch(
       jsonb_build_object('eventId', 'sess-e-16',
         'attributes', (select jsonb_object_agg(
                                 substr(repeat('k', 128), 1, 127) || chr(97 + i),
                                 repeat('v', 200))
                          from generate_series(0, 23) as i)))) $$,
  'the largest attributes record telemetryEnvelopeSchema admits -- 24 keys of 128 characters with 200-character values -- is accepted'
);

select cmp_ok(
  (select octet_length(attributes::text) from public.telemetry_events where event_id = 'sess-e-16'),
  '=',
  8064,
  'and it measures 8064 bytes, so the 12288 ceiling sits 1.5x above the worst case the contract can build'
);

select throws_ok(
  $$ select public.record_telemetry_events(pg_temp.ingest_batch(
       jsonb_build_object('eventId', 'sess-e-17', 'attributes', jsonb_build_array(1, 2)))) $$,
  '23514',
  null,
  'attributes that are an array rather than an object are refused: every read of this column assumes a record of names'
);

-- Two different absences, and they are refused by two different controls,
-- which is why both are here. A JSON `null` reaches the column as jsonb
-- `null` -- a value, not an absence -- so NOT NULL does not fire and the
-- `jsonb_typeof = 'object'` constraint is what refuses it. That constraint
-- exists for exactly this case: without it the column would hold a jsonb
-- `null` that every reader would treat as an attribute record.
select throws_ok(
  $$ select public.record_telemetry_events(pg_temp.ingest_batch(
       jsonb_build_object('eventId', 'sess-e-18', 'attributes', null))) $$,
  '23514',
  null,
  'attributes explicitly null are refused by the jsonb_typeof constraint: JSON null is a value and NOT NULL never sees it'
);

-- ...and the key genuinely absent, which is the one NOT NULL catches, because
-- `->` on a missing key is SQL NULL.
select throws_ok(
  $$ select public.record_telemetry_events(
       jsonb_build_array(pg_temp.ingest_record(jsonb_build_object('eventId', 'sess-e-19'))
                         #- '{envelope,attributes}')) $$,
  '23502',
  null,
  'a record with no attributes key at all is refused by NOT NULL: an event with no attributes sends {}, not nothing'
);

-- The two shapes `UNSTORABLE_TEXT` exists for, refused by the column TYPE
-- rather than by any constraint. src/worker/telemetry-ingest.ts says why it
-- strips them client-side: "PostgreSQL `text` and `jsonb` cannot represent it;
-- an insert carrying one errors." That is asserted here rather than taken on
-- trust, and it is what turns the Worker's regex from a taste into the thing
-- that answers a caller `400` instead of `502`.
select throws_ok(
  $$ select '{"a":"\u0000"}'::jsonb $$,
  '22P05',
  null,
  'jsonb cannot represent U+0000, which is the storability fact UNSTORABLE_TEXT is built on'
);

select throws_ok(
  $$ select '{"a":"\ud800"}'::jsonb $$,
  '22P02',
  null,
  'jsonb cannot represent an unpaired UTF-16 surrogate either, which is UNSTORABLE_TEXT''s second shape'
);

-- --- The pinned search_path, driven rather than read -------------------
--
-- Suite 005 asserts from `pg_proc` that this function pins `public, pg_temp`
-- with `pg_temp` last. This is the behavioural half: a caller plants a
-- `telemetry_events` in the temporary schema -- the classic SECURITY DEFINER
-- hijack `20260824090000_pin_trigger_function_search_path.sql` exists to close
-- -- and the definer's write still lands in `public`.
--
-- **Honest about the mechanism**: the function body writes
-- `insert into public.telemetry_events`, fully qualified, so qualification is
-- the primary defence and the pin is the belt. This probe drives the
-- combination, which is the property that matters; what it cannot separate is
-- which of the two did the work. The pin is kept regardless, because the next
-- edit to this body is written under the assumption that name resolution here
-- matches every other function in the schema.
create temporary table telemetry_events (event_id text, hijacked boolean);

select lives_ok(
  $$ select public.record_telemetry_events(pg_temp.ingest_batch(
       jsonb_build_object('eventId', 'sess-hijack-1'))) $$,
  'the function still runs with a telemetry_events planted in pg_temp'
);

select is(
  (select count(*)::int from pg_temp.telemetry_events),
  0,
  'and the planted pg_temp.telemetry_events received nothing: the definer''s write is not redirectable'
);

select is(
  (select count(*)::int from public.telemetry_events where event_id = 'sess-hijack-1'),
  1,
  'the row landed in public.telemetry_events, which is where the definer''s rights apply'
);

drop table pg_temp.telemetry_events;

-- ============================================================================
-- Section C: the grant works, end to end, as the role that holds it
-- ============================================================================
--
-- Without this, every refusal in section A could be passing because the role
-- can do nothing whatsoever -- which would be a different schema with the same
-- test results. The batch is an inline literal rather than the helper, because
-- the helper lives in `pg_temp` and the point of this section is that the role
-- needs nothing but its one EXECUTE.

set local role telemetry_ingest;

select is(
  current_user::text,
  'telemetry_ingest',
  'the accepted-batch probe below really runs as telemetry_ingest'
);

select is(
  (select public.record_telemetry_events($batch$[
     {"receivedAt": 0,
      "environment": "production",
      "registrySampleRate": 0.1,
      "claimedSampleRate": 0.1,
      "claimedOccurredAt": 1756900000001,
      "envelope": {"schemaVersion": 1, "eventId": "sess-live-1",
                   "name": "performance.tick-budget", "category": "performance",
                   "occurredAt": 1756900000001, "sessionId": "sess-live",
                   "release": {"buildVersion": "lockstate-0.0.0", "environment": "production"},
                   "consentVersion": 1, "sampleRate": 0.1,
                   "attributes": {"actorCount": 240, "tickMs": 3.5}}}
   ]$batch$::jsonb)),
  1,
  'telemetry_ingest can append one validated batch through its single EXECUTE grant, holding no table privilege at all'
);

reset role;

-- ...and what it appended is a row it cannot read, which is the whole shape of
-- the credential. Read back as the owner.
select is(
  (select name || ' ' || category || ' ' || environment || ' ' || registry_sample_rate::text
     from public.telemetry_events where event_id = 'sess-live-1'),
  'performance.tick-budget performance production 0.1',
  'the row the ingest role wrote is present and correct, read back by the owner rather than by the writer'
);

-- ============================================================================
-- Section D: the retention job deletes what the promise says, and records it
-- ============================================================================
--
-- 20260904090000 sections 5-7, ADR 0046 section 7 item 1, and ADR 0008 section
-- 3 step 6. Probed as the table owner, for suite 010's reason: section A has
-- already established that no other role can reach any of this.
--
-- HOW A ROW IS AGED, AND WHY IT TAKES THE OWNER. `received_at` is
-- `default now()` on a table with no INSERT grant for any role, and the insert
-- function never names the column -- which is the property the stamp
-- assertions above are about. So the only way to produce a row that is
-- genuinely old is to insert one directly as the owner with an explicit
-- `received_at`, which is what the plant below does. That is not a hole in the
-- design being exploited; it is the strongest writer there is, standing in for
-- the passage of time, and it is the only writer that could.
--
-- `now()` is the transaction's start time, so every interval below is measured
-- against one fixed instant and the boundaries do not drift while the suite
-- runs.
--
-- WHAT IS PLANTED, and every row exists to make one assertion fail if a window
-- moves:
--
--   diagnostics (90 days)   -89d  survives   -91d  deleted   -45d  survives
--   performance (90 days)   -89d  survives   -91d  deleted   -45d  survives
--   gameplay    (30 days)   -29d  survives   -31d  deleted   -45d  DELETED
--
-- The three rows at -45d are the ones that separate the windows behaviourally:
-- one instant, three categories, two survivals and one deletion. **Two of the
-- three windows are identical -- 90 and 90 -- so "the three windows differ" is
-- not a property this schema has and no assertion below claims it.** What is
-- asserted instead is the pair of facts that are true: `gameplay` differs from
-- the other two behaviourally at -45d, and the audit rows read exactly
-- 90/30/90 by category, which is what fails if any one of the three numbers is
-- edited.
--
-- Plus the two rows ADR 0046 section 7 item 1 is entirely about, one in each
-- direction:
--
--   * `ret-diag-future-claim` -- `received_at` 200 days ago, and a
--     `claimed_occurred_at` of the year 4000. **It must be deleted.** A window
--     keyed on the client's claim would keep it for ever, which is the defeat
--     that item corrects.
--   * `ret-diag-1970-claim` -- `received_at` now, `claimed_occurred_at` of 0.
--     **It must survive.** A window keyed on the client's claim would delete a
--     row that arrived seconds ago. This is the mirror of the assertion above
--     and it is here because the two together pin the KEY: one of them fails
--     whichever way round a mis-keyed window is written.

select is(
  (select count(*)::int from pg_roles where rolname = current_user and rolsuper),
  1,
  'section D runs as a privileged session, so the deletions below are the owner''s and not a role escalation'
);

insert into public.telemetry_events
  (event_id, name, category, session_id, environment, release_build_version,
   consent_version, registry_sample_rate, claimed_sample_rate,
   claimed_occurred_at, attributes, received_at)
values
  ('ret-diag-inside',  'diagnostic.unhandled-error', 'diagnostics', 'ret', 'staging',
   'lockstate-0.0.0', 1, 1, 1, 1756900000000, '{}'::jsonb, now() - interval '89 days'),
  ('ret-diag-outside', 'diagnostic.unhandled-error', 'diagnostics', 'ret', 'staging',
   'lockstate-0.0.0', 1, 1, 1, 1756900000000, '{}'::jsonb, now() - interval '91 days'),
  ('ret-diag-mid',     'diagnostic.unhandled-error', 'diagnostics', 'ret', 'staging',
   'lockstate-0.0.0', 1, 1, 1, 1756900000000, '{}'::jsonb, now() - interval '45 days'),
  ('ret-perf-inside',  'performance.tick-budget', 'performance', 'ret', 'staging',
   'lockstate-0.0.0', 1, 1, 1, 1756900000000, '{}'::jsonb, now() - interval '89 days'),
  ('ret-perf-outside', 'performance.tick-budget', 'performance', 'ret', 'staging',
   'lockstate-0.0.0', 1, 1, 1, 1756900000000, '{}'::jsonb, now() - interval '91 days'),
  ('ret-perf-mid',     'performance.tick-budget', 'performance', 'ret', 'staging',
   'lockstate-0.0.0', 1, 1, 1, 1756900000000, '{}'::jsonb, now() - interval '45 days'),
  ('ret-game-inside',  'gameplay.scenario-completed', 'gameplay', 'ret', 'staging',
   'lockstate-0.0.0', 1, 1, 1, 1756900000000, '{}'::jsonb, now() - interval '29 days'),
  ('ret-game-outside', 'gameplay.scenario-completed', 'gameplay', 'ret', 'staging',
   'lockstate-0.0.0', 1, 1, 1, 1756900000000, '{}'::jsonb, now() - interval '31 days'),
  ('ret-game-mid',     'gameplay.scenario-completed', 'gameplay', 'ret', 'staging',
   'lockstate-0.0.0', 1, 1, 1, 1756900000000, '{}'::jsonb, now() - interval '45 days'),
  -- Old arrival, absurd claim: the row a window keyed on the claim never reaches.
  ('ret-diag-future-claim', 'diagnostic.unhandled-error', 'diagnostics', 'ret', 'staging',
   'lockstate-0.0.0', 1, 1, 1, 64060588800000, '{}'::jsonb, now() - interval '200 days'),
  -- Fresh arrival, 1970 claim: the row a window keyed on the claim deletes at once.
  ('ret-diag-1970-claim', 'diagnostic.unhandled-error', 'diagnostics', 'ret', 'staging',
   'lockstate-0.0.0', 1, 1, 1, 0, '{}'::jsonb, now());

-- The rows already in the table from sections B and C all carry
-- `received_at = now()`, so nothing below can be satisfied by them: they are
-- inside every window by construction. Asserted rather than assumed, because
-- the deleted counts further down are exact.
select is(
  (select count(*)::int from public.telemetry_events
    where event_id not like 'ret-%' and received_at < now() - interval '1 second'),
  0,
  'every row this suite stored earlier arrived at now(), so the exact counts below are about the planted rows alone'
);

-- One run. The returned rows are the audit rows -- the function's `returning *`
-- is where they come from -- so this table holds both halves of the contract.
create temporary table retention_run_1 as
  select * from public.enforce_telemetry_retention();

select is(
  (select count(*)::int from retention_run_1),
  3,
  'one run produced one row per category: a single row saying "retention ran" would not say which of three windows was applied to what'
);

-- The rule, as the audit records it. This is the assertion that fails when a
-- window is edited -- change 30 to 90 and it names the category that moved.
select is(
  (select string_agg(category || ':' || retention_days::text, ' ' order by category)
     from retention_run_1),
  'diagnostics:90 gameplay:30 performance:90',
  'the audit rows carry docs/TELEMETRY.md''s three windows exactly: 90 days for diagnostics, 90 for performance, 30 for gameplay'
);

-- The key, as the audit records it. The CHECK on the column refuses any other
-- literal, so this asserts the function wrote the pinned one rather than
-- omitting it.
select is(
  (select string_agg(distinct keyed_on, ' ') from retention_run_1),
  'received_at',
  'every audit row names received_at as the column the window ran over, which is ADR 0046 section 7 item 1''s whole correction'
);

-- The boundary, recomputed against the rule it claims. A `cutoff` that does not
-- equal `ran_at - retention_days` is an audit row describing a run that did
-- something else.
select is(
  (select count(*)::int from retention_run_1
    where cutoff <> ran_at - make_interval(days => retention_days)),
  0,
  'every audit row''s cutoff is exactly its own ran_at minus its own retention_days, so the boundary is not a separate claim'
);

select is(
  (select string_agg(distinct run_by, ' ') from retention_run_1),
  current_user::text,
  'the audit row names the role the deletion actually ran as, from the column default rather than from an argument'
);

-- The count, which is the part of the audit that can be wrong without anything
-- else being wrong. Planted deletions: diagnostics loses -91d and the
-- future-claim row, performance loses -91d, gameplay loses -31d and -45d.
select is(
  (select string_agg(category || ':' || deleted_count::text, ' ' order by category)
     from retention_run_1),
  'diagnostics:2 gameplay:2 performance:1',
  'the audit row says the truth about how many rows stopped existing, per category, counted by the DELETE itself'
);

-- ...and the audit table holds those same rows, not a second rendering of them.
--
-- **Counted as three MATCHES rather than as zero mismatches, and the first
-- draft of this assertion was the second shape.** Measured: a mutation that
-- returned the counts to the caller and never wrote the audit row -- which is
-- precisely the defect ADR 0008 section 3 step 6 is about -- left the
-- zero-mismatch version green, because an empty join has no mismatching rows.
-- That is `docs/TESTING.md`'s vacuity trap and suites 003, 007, 008, 009 and
-- 010 all carry a guard against it; this is the same guard inside one
-- assertion. Re-measured after the change: the same mutation now fails here as
-- well as at the run count below.
select is(
  (select count(*)::int from public.telemetry_retention_runs t
     join retention_run_1 r on r.run_id = t.run_id
    where (t.category, t.keyed_on, t.retention_days, t.cutoff, t.deleted_count)
       is not distinct from (r.category, r.keyed_on, r.retention_days, r.cutoff, r.deleted_count)),
  3,
  'all three rows the function returned are in the audit table with the same values: the rows come from the INSERT''s own RETURNING, so a return with no write fails here'
);

-- --- What survived and what did not ------------------------------------

select is(
  (select string_agg(event_id, ' ' order by event_id) from public.telemetry_events
    where event_id in ('ret-diag-inside', 'ret-perf-inside', 'ret-game-inside')),
  'ret-diag-inside ret-game-inside ret-perf-inside',
  'a row one day inside its category''s window survives, in all three categories'
);

select is(
  (select count(*)::int from public.telemetry_events
    where event_id in ('ret-diag-outside', 'ret-perf-outside', 'ret-game-outside')),
  0,
  'a row one day outside its category''s window is gone, in all three categories'
);

-- The window separation, at one instant. -45d is inside 90 and outside 30, so
-- this one line of expectation is the behavioural difference between the
-- gameplay window and the other two.
select is(
  (select string_agg(event_id, ' ' order by event_id) from public.telemetry_events
    where event_id in ('ret-diag-mid', 'ret-perf-mid', 'ret-game-mid')),
  'ret-diag-mid ret-perf-mid',
  'at 45 days the gameplay row is gone and the diagnostics and performance rows are not: the 30-day window is a different window'
);

-- The property ADR 0046 section 7 item 1 exists for, in both directions.
select is(
  (select count(*)::int from public.telemetry_events where event_id = 'ret-diag-future-claim'),
  0,
  'a row claiming to have occurred in the year 4000 is deleted anyway, because the window keys on received_at and not on the claim'
);

select is(
  (select count(*)::int from public.telemetry_events where event_id = 'ret-diag-1970-claim'),
  1,
  'and a row that arrived now while claiming 1970 survives: a window keyed on the claim would have deleted it, which is the mirror of the assertion above'
);

-- --- A second run, immediately ------------------------------------------
--
-- Retention is not idempotent in the sense a replay is -- it deletes whatever
-- has aged out since -- but a run over an already-clean window must delete
-- nothing and must still say so. A job that only records the runs that found
-- something is a job whose silence is ambiguous.
create temporary table retention_run_2 as
  select * from public.enforce_telemetry_retention();

select is(
  (select sum(deleted_count)::bigint from retention_run_2),
  0::bigint,
  'a second run over the same window deletes nothing: the first run took everything that had aged out'
);

select is(
  (select count(*)::int from retention_run_2),
  3,
  'and it still writes one audit row per category, so "nothing was deleted" is recorded rather than inferred from an absent row'
);

select is(
  (select count(*)::int from public.telemetry_retention_runs),
  6,
  'the audit table holds both runs: it is append-only in practice because nothing in this schema updates or deletes from it'
);

-- --- What the audit table deliberately cannot hold ----------------------
--
-- An audit of a privacy deletion that copies the deleted rows into a second
-- table has deleted nothing. The column set is pinned here, not only in the
-- migration's comment, so that adding a `payload`, an `attributes` or an
-- `event_id` column to "make the audit useful" fails a test.
select is(
  (select string_agg(a.attname, ' ' order by a.attname)
     from pg_attribute a
    where a.attrelid = 'public.telemetry_retention_runs'::regclass
      and a.attnum > 0 and not a.attisdropped),
  'category cutoff deleted_count keyed_on ran_at retention_days run_by run_id',
  'the audit table holds counts, boundaries and the rule -- and no part of any row it deleted'
);

select * from finish();
rollback;
