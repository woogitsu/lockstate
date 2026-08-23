#!/usr/bin/env node
/**
 * End-to-end check of the cloud-save contract against a RUNNING Supabase
 * local stack, through the same two front doors the browser uses: GoTrue
 * (`/auth/v1`) and PostgREST (`/rest/v1`).
 *
 * Why this exists alongside scripts/verify-supabase-sql.mjs. That script and
 * the pgTAP suites prove the SQL: constraints, triggers, privilege
 * arithmetic and the RLS policies as Postgres evaluates them, with the
 * subject faked by `set_config('request.jwt.claim.sub', ...)`. They cannot
 * prove the step before that -- that GoTrue mints an identity, that
 * PostgREST turns its JWT into the `authenticated` role with a `sub` claim,
 * and that `auth.uid()` therefore returns the player who made the request.
 * Every policy in supabase/migrations/ is built on that step, and until this
 * script ran it had never been executed anywhere.
 *
 * It also exercises the anonymous sign-in that docs/CLOUD_SAVE.md names as
 * this project's identity model -- a flow that is GoTrue behaviour, not
 * row-level SQL, so `supabase test db` structurally cannot cover it.
 *
 * ON THE FREE-TIER CAPACITY BOUND (issue #57, ADR 0012). The pgTAP suite
 * proves the cap in SQL. Only this script can prove the two things a client
 * depends on: that a DIRECT PostgREST insert into `prisons` -- not merely
 * the create_prison() RPC -- is refused, and that PostgREST turns the
 * refusal into an HTTP 400 carrying `code: "LS001"` rather than a 500 that
 * a browser would have to treat as "something broke".
 *
 * ON THE SERVICE-ROLE KEY. This script originally used only the
 * publishable/anon key and said so. It now also drives the trusted server
 * paths (ADR 0008 zone Z2) with the local stack's secret key, because a
 * security audit found that no migration granted `service_role` anything
 * and *nothing anywhere noticed*: the payment-webhook RPC and the challenge
 * verifier were both unreachable on a real project. The pgTAP suites now
 * run those steps under `set local role service_role`, but only this script
 * can prove the other half -- that PostgREST maps a service-role
 * credential onto that role at all.
 *
 * The rules that keep this safe are unchanged and enforced below:
 * both keys are read from `supabase status` at runtime, so no credential
 * is stored in this repository; the run aborts unless the API is on
 * loopback, so a secret key can never be pointed at a hosted project by
 * accident; and no key is ever printed. None of this reaches shipped code
 * -- AGENTS.md's "no service-role key in client code" is about
 * `src/`, and `src/` still has no path to one.
 *
 * Usage:
 *   supabase start
 *   node scripts/verify-supabase-stack.mjs
 *
 * Requires: the Supabase CLI on PATH and a started local stack. This is
 * deliberately not part of `pnpm test`: it needs Docker, so it is the check
 * you run when changing supabase/, not on every commit.
 */
import { execFileSync } from 'node:child_process';

function readStackEnvironment() {
  let raw;
  try {
    raw = execFileSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    throw new Error('`supabase status` failed — start the local stack first with `supabase start`.');
  }

  const values = new Map();
  for (const line of raw.split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match !== null) values.set(match[1], match[2].replace(/^"(.*)"$/, '$1'));
  }

  const apiUrl = values.get('API_URL');
  // Prefer the publishable key; ANON_KEY is the legacy JWT form of the same
  // browser-safe credential and is what older CLI versions report.
  const publishableKey = values.get('PUBLISHABLE_KEY') ?? values.get('ANON_KEY');
  // Same pairing on the trusted side: SECRET_KEY is current, SERVICE_ROLE_KEY
  // the legacy JWT form.
  const secretKey = values.get('SECRET_KEY') ?? values.get('SERVICE_ROLE_KEY');
  if (apiUrl === undefined || publishableKey === undefined || secretKey === undefined) {
    throw new Error('`supabase status` reported no API_URL/PUBLISHABLE_KEY/SECRET_KEY — is the stack running?');
  }

  // A secret key must never leave the machine that generated it. The local
  // stack always publishes on loopback, so anything else means `supabase
  // status` is describing a project this script must not touch.
  const host = new URL(apiUrl).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '[::1]') {
    throw new Error(`refusing to run against a non-local API (${host}); this script is for the local stack only.`);
  }

  return { apiUrl, publishableKey, secretKey };
}

const checks = [];
function check(description, condition, detail) {
  checks.push({ description, ok: condition === true, detail });
  console.log(`  ${condition === true ? '✓' : '✗'} ${description}${condition === true || detail === undefined ? '' : `\n      ${detail}`}`);
}

/** The `sub` claim is the whole point of this script: it becomes auth.uid(). */
function subjectOf(accessToken) {
  const payload = accessToken.split('.')[1];
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).sub;
}

async function main() {
  const { apiUrl, publishableKey, secretKey } = readStackEnvironment();
  console.log(`Verifying the running stack at ${apiUrl}\n`);

  const anonymousHeaders = { apikey: publishableKey, 'Content-Type': 'application/json' };
  const asUser = (session) => ({ ...anonymousHeaders, Authorization: `Bearer ${session.access_token}` });
  // What a Supabase Edge Function or Cloudflare Worker would hold. PostgREST
  // reads the key's role claim and does the equivalent of `set role
  // service_role`, so every request made this way is subject to exactly the
  // grants supabase/tests/003_data_api_grants.test.sql pins.
  const trustedHeaders = { apikey: secretKey, Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' };

  async function signInAnonymously() {
    const response = await fetch(`${apiUrl}/auth/v1/signup`, {
      method: 'POST',
      headers: anonymousHeaders,
      body: JSON.stringify({ data: {} }),
    });
    const session = await response.json();
    if (typeof session.access_token !== 'string') {
      throw new Error(`anonymous sign-in failed (${response.status}): ${JSON.stringify(session)}`);
    }
    return session;
  }

  function headersFor(session, trusted) {
    if (trusted === true) return trustedHeaders;
    return session === undefined ? anonymousHeaders : asUser(session);
  }

  async function rest(path, { session, trusted, method = 'GET', body, prefer } = {}) {
    const response = await fetch(`${apiUrl}/rest/v1/${path}`, {
      method,
      headers: {
        ...headersFor(session, trusted),
        ...(prefer === undefined ? {} : { Prefer: prefer }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    return { status: response.status, body: text === '' ? null : JSON.parse(text) };
  }

  console.log('GoTrue: anonymous identity');
  const playerA = await signInAnonymously();
  const playerB = await signInAnonymously();
  const subjectA = subjectOf(playerA.access_token);
  const subjectB = subjectOf(playerB.access_token);
  check('anonymous sign-in issues a session with a subject claim', typeof subjectA === 'string' && subjectA.length > 0);
  check('two anonymous sign-ins are two distinct identities', subjectA !== subjectB);
  check('the anonymous user is flagged as such by GoTrue', playerA.user?.is_anonymous === true, JSON.stringify(playerA.user?.is_anonymous));

  console.log('\nPostgREST: the JWT subject reaches auth.uid()');
  const created = await rest('prisons', {
    session: playerA,
    method: 'POST',
    prefer: 'return=representation',
    body: { owner_id: subjectA, game_version: 'lockstate-0.0.0', slot_index: 0 },
  });
  check(
    'the owner can insert a prison whose owner_id is its own JWT subject',
    created.status === 201,
    `${created.status} ${JSON.stringify(created.body)}`,
  );
  const prisonId = created.body?.[0]?.id;

  const foreignInsert = await rest('prisons', {
    session: playerA,
    method: 'POST',
    body: { owner_id: subjectB, game_version: 'lockstate-0.0.0', slot_index: 1 },
  });
  check(
    'inserting a prison owned by somebody else is refused by the RLS check',
    foreignInsert.status === 403,
    `${foreignInsert.status} ${JSON.stringify(foreignInsert.body)}`,
  );

  console.log('\nPostgREST: create_save_version is the only write path');
  const firstSave = await rest('rpc/create_save_version', {
    session: playerA,
    method: 'POST',
    body: {
      p_prison_id: prisonId,
      p_new_revision: 1,
      p_save_schema_version: 1,
      p_checksum: 'checksum-rev-1',
      p_payload: { tick: 0 },
      p_storage_path: null,
      p_byte_size: 10,
    },
  });
  check('a first save at revision 1 is created', firstSave.body?.[0]?.status === 'created', JSON.stringify(firstSave.body));

  const replay = await rest('rpc/create_save_version', {
    session: playerA,
    method: 'POST',
    body: {
      p_prison_id: prisonId,
      p_new_revision: 1,
      p_save_schema_version: 1,
      p_checksum: 'checksum-rev-1',
      p_payload: { tick: 0 },
      p_storage_path: null,
      p_byte_size: 10,
    },
  });
  check('retrying the same attempt replays it', replay.body?.[0]?.status === 'idempotent_replay', JSON.stringify(replay.body));

  const conflict = await rest('rpc/create_save_version', {
    session: playerA,
    method: 'POST',
    body: {
      p_prison_id: prisonId,
      p_new_revision: 3,
      p_save_schema_version: 1,
      p_checksum: 'checksum-skip-ahead',
      p_payload: { tick: 5 },
      p_storage_path: null,
      p_byte_size: 10,
    },
  });
  check('skipping a revision is reported as a conflict', conflict.body?.[0]?.status === 'conflict', JSON.stringify(conflict.body));

  const patch = await rest(`prisons?id=eq.${prisonId}`, {
    session: playerA,
    method: 'PATCH',
    body: { current_revision: 999 },
  });
  check(
    'a PATCH of current_revision is refused even for the owner',
    patch.status === 403,
    `${patch.status} ${JSON.stringify(patch.body)}`,
  );

  const rename = await rest(`prisons?id=eq.${prisonId}`, {
    session: playerA,
    method: 'PATCH',
    body: { display_name: 'Blockhouse' },
  });
  check('a PATCH of editable metadata still works', rename.status === 204, `${rename.status} ${JSON.stringify(rename.body)}`);

  const directInsert = await rest('save_versions', {
    session: playerA,
    method: 'POST',
    body: { prison_id: prisonId, revision: 9, save_schema_version: 1, checksum: 'direct', payload: {}, byte_size: 2 },
  });
  check(
    'a direct insert into save_versions is refused',
    directInsert.status === 401 || directInsert.status === 403,
    `${directInsert.status} ${JSON.stringify(directInsert.body)}`,
  );

  console.log('\nPostgREST: ownership isolation across two real identities');
  const ownerRead = await rest('prisons?select=id,current_revision,display_name', { session: playerA });
  check(
    'the owner reads back its prison at the advanced revision',
    ownerRead.body?.length === 1 && ownerRead.body[0].current_revision === 1 && ownerRead.body[0].display_name === 'Blockhouse',
    JSON.stringify(ownerRead.body),
  );

  const strangerRead = await rest('prisons?select=id', { session: playerB });
  check('a different identity sees no prison at all', strangerRead.body?.length === 0, JSON.stringify(strangerRead.body));

  const strangerVersions = await rest('save_versions?select=id', { session: playerB });
  check('a different identity sees no save version either', strangerVersions.body?.length === 0, JSON.stringify(strangerVersions.body));

  const strangerRpc = await rest('rpc/create_save_version', {
    session: playerB,
    method: 'POST',
    body: {
      p_prison_id: prisonId,
      p_new_revision: 2,
      p_save_schema_version: 1,
      p_checksum: 'hostile',
      p_payload: { tick: 99 },
      p_storage_path: null,
      p_byte_size: 10,
    },
  });
  check(
    'a different identity cannot advance the prison through the RPC',
    strangerRpc.status === 403 && strangerRpc.body?.code === '42501',
    `${strangerRpc.status} ${JSON.stringify(strangerRpc.body)}`,
  );

  console.log('\nPostgREST: the signed-out surface');
  const signedOutPrisons = await rest('prisons?select=id');
  check(
    'a signed-out visitor cannot reach prisons',
    signedOutPrisons.status === 401 || signedOutPrisons.status === 403,
    `${signedOutPrisons.status} ${JSON.stringify(signedOutPrisons.body)}`,
  );

  const signedOutRpc = await rest('rpc/create_save_version', {
    method: 'POST',
    body: {
      p_prison_id: prisonId,
      p_new_revision: 2,
      p_save_schema_version: 1,
      p_checksum: 'signed-out',
      p_payload: { tick: 1 },
      p_storage_path: null,
      p_byte_size: 10,
    },
  });
  check(
    'a signed-out visitor cannot reach create_save_version at all',
    signedOutRpc.status === 401 || signedOutRpc.status === 403 || signedOutRpc.status === 404,
    `${signedOutRpc.status} ${JSON.stringify(signedOutRpc.body)}`,
  );

  // --- The trusted server role (ADR 0008 zone Z2) -----------------------
  //
  // Everything below runs with the secret key, the way an Edge Function or
  // a Cloudflare Worker would. None of it was exercised anywhere before: no
  // migration granted `service_role` a single privilege, and `BYPASSRLS`
  // grants none, so the whole zone was dead on a real project while every
  // check here passed.
  console.log('\nPostgREST: the trusted server role publishes challenges');
  const openChallenge = {
    challenge_id: `challenge.open-${Date.now()}`,
    version: 1,
    definition: { id: 'open', seed: 'visible' },
    definition_hash: '0123456789abcdef',
    signature: { algorithm: 'ed25519', keyId: 'key.local', value: 'AAAA' },
    opens_at: new Date(Date.now() - 3_600_000).toISOString(),
    closes_at: new Date(Date.now() + 3_600_000).toISOString(),
  };
  const sealedChallenge = {
    challenge_id: `challenge.sealed-${Date.now()}`,
    version: 1,
    // The thing the read policy exists to protect: an unopened seed.
    definition: { id: 'sealed', seed: 'the-secret-seed' },
    definition_hash: 'fedcba9876543210',
    signature: { algorithm: 'ed25519', keyId: 'key.local', value: 'BBBB' },
    opens_at: new Date(Date.now() + 86_400_000).toISOString(),
    closes_at: new Date(Date.now() + 172_800_000).toISOString(),
    published_at: new Date(Date.now() + 86_400_000).toISOString(),
  };

  const publishedOpen = await rest('challenge_definitions', {
    trusted: true,
    method: 'POST',
    body: openChallenge,
  });
  check(
    'the trusted role can publish a challenge definition',
    publishedOpen.status === 201,
    `${publishedOpen.status} ${JSON.stringify(publishedOpen.body)}`,
  );

  const publishedSealed = await rest('challenge_definitions', {
    trusted: true,
    method: 'POST',
    body: sealedChallenge,
  });
  check(
    'the trusted role can stage a challenge that has not opened yet',
    publishedSealed.status === 201,
    `${publishedSealed.status} ${JSON.stringify(publishedSealed.body)}`,
  );

  const clientPublish = await rest('challenge_definitions', {
    session: playerA,
    method: 'POST',
    body: { ...openChallenge, challenge_id: `challenge.forged-${Date.now()}` },
  });
  check(
    'a player cannot publish a challenge definition',
    clientPublish.status === 401 || clientPublish.status === 403,
    `${clientPublish.status} ${JSON.stringify(clientPublish.body)}`,
  );

  console.log('\nPostgREST: an unopened challenge is not public');
  const signedOutDefinitions = await rest('challenge_definitions?select=challenge_id,definition');
  check(
    'a signed-out visitor can read the signed challenge definitions',
    signedOutDefinitions.status === 200,
    `${signedOutDefinitions.status} ${JSON.stringify(signedOutDefinitions.body)}`,
  );
  const visibleToAnon = (signedOutDefinitions.body ?? []).map((row) => row.challenge_id);
  check(
    'the open challenge is among them',
    visibleToAnon.includes(openChallenge.challenge_id),
    JSON.stringify(visibleToAnon),
  );
  check(
    'the unopened challenge is NOT — its seed cannot be solved ahead of everyone else',
    !visibleToAnon.includes(sealedChallenge.challenge_id),
    JSON.stringify(signedOutDefinitions.body),
  );

  const sealedForPlayer = await rest(
    `challenge_definitions?select=challenge_id&challenge_id=eq.${sealedChallenge.challenge_id}`,
    { session: playerA },
  );
  check(
    'signing in does not reveal it either — authenticated is anyone, with anonymous sign-in on',
    sealedForPlayer.status === 200 && sealedForPlayer.body?.length === 0,
    `${sealedForPlayer.status} ${JSON.stringify(sealedForPlayer.body)}`,
  );

  const sealedForVerifier = await rest(
    `challenge_definitions?select=challenge_id&challenge_id=eq.${sealedChallenge.challenge_id}`,
    { trusted: true },
  );
  check(
    'the trusted role still sees it, so the verifier can replay against it',
    sealedForVerifier.body?.length === 1,
    `${sealedForVerifier.status} ${JSON.stringify(sealedForVerifier.body)}`,
  );

  console.log('\nPostgREST: the challenge verifier advances a submission');
  const submitted = await rest('rpc/submit_challenge_evidence', {
    session: playerA,
    method: 'POST',
    body: {
      p_challenge_id: openChallenge.challenge_id,
      p_challenge_version: 1,
      p_evidence_hash: 'abcdef0123456789',
      p_evidence: { commands: [] },
      p_claimed_metrics: { score: 10 },
    },
  });
  check(
    'a player submits evidence through the RPC',
    submitted.body?.[0]?.status === 'submitted',
    `${submitted.status} ${JSON.stringify(submitted.body)}`,
  );
  const submissionId = submitted.body?.[0]?.submission_id;

  const verified = await rest(`challenge_submissions?submission_id=eq.${submissionId}`, {
    trusted: true,
    method: 'PATCH',
    body: { verification_status: 'verified', ranked_score: 10, verified_at: new Date().toISOString() },
  });
  check(
    'the trusted verifier records a verdict — the path that was completely dead before',
    verified.status === 204,
    `${verified.status} ${JSON.stringify(verified.body)}`,
  );

  const reassign = await rest(`challenge_submissions?submission_id=eq.${submissionId}`, {
    trusted: true,
    method: 'PATCH',
    body: { user_id: subjectB },
  });
  check(
    'the trusted verifier cannot reassign a submission to another account',
    reassign.status === 401 || reassign.status === 403,
    `${reassign.status} ${JSON.stringify(reassign.body)}`,
  );

  console.log('\nPostgREST: the entitlement webhook path');
  const webhookArguments = {
    p_user_id: subjectA,
    p_product_id: 'product.save-slots.plus-5',
    p_capability: 'save-slots',
    p_event_type: 'grant',
    p_source: 'payment-webhook',
    p_quantity: 5,
    p_provider: 'provider.local',
    p_provider_event_id: `evt-${Date.now()}`,
    p_occurred_at: new Date(Date.now() - 60_000).toISOString(),
    p_actor_kind: 'provider',
    p_actor_id: 'provider.local',
    p_reason: 'purchase-completed via provider.local',
    p_expires_at: null,
  };

  const applied = await rest('rpc/record_entitlement_event', {
    trusted: true,
    method: 'POST',
    body: webhookArguments,
  });
  check(
    'the trusted role can record an entitlement event — 42501 before this fix',
    applied.body?.[0]?.status === 'applied',
    `${applied.status} ${JSON.stringify(applied.body)}`,
  );

  const redelivered = await rest('rpc/record_entitlement_event', {
    trusted: true,
    method: 'POST',
    body: webhookArguments,
  });
  check(
    'a redelivered provider event writes nothing new',
    redelivered.body?.[0]?.status === 'duplicate',
    `${redelivered.status} ${JSON.stringify(redelivered.body)}`,
  );

  const projection = await rest(`entitlements?select=value&key=eq.save-slots`, { session: playerA });
  check(
    'the player reads the projection the webhook produced',
    projection.body?.[0]?.value?.grantedSaveSlots === 5,
    `${projection.status} ${JSON.stringify(projection.body)}`,
  );

  const clientWebhook = await rest('rpc/record_entitlement_event', {
    session: playerA,
    method: 'POST',
    body: { ...webhookArguments, p_provider_event_id: `evt-forged-${Date.now()}` },
  });
  check(
    'a player cannot call the webhook RPC',
    clientWebhook.status === 401 || clientWebhook.status === 403 || clientWebhook.status === 404,
    `${clientWebhook.status} ${JSON.stringify(clientWebhook.body)}`,
  );

  // --- The free-tier capacity bound (issue #57, ADR 0012) ---------------
  //
  // The pgTAP suite proves this in SQL; only this script can prove the two
  // things a client actually depends on: that a direct PostgREST insert --
  // not merely the blessed RPC -- is refused, and that PostgREST turns the
  // refusal into something a browser can act on rather than a 500.
  //
  // playerB is used because playerA has just been granted five extra slots
  // above, and the point here is the FREE tier.
  console.log('\nPostgREST: the free-tier slot cap is enforced by the database');
  const playerBPrisons = [];
  let freeSlotInsertsAccepted = 0;
  for (let slotIndex = 0; slotIndex < 5; slotIndex += 1) {
    const slot = await rest('prisons', {
      session: playerB,
      method: 'POST',
      prefer: 'return=representation',
      body: { owner_id: subjectB, game_version: 'lockstate-0.0.0', slot_index: slotIndex },
    });
    if (slot.status === 201) freeSlotInsertsAccepted += 1;
    if (slot.body?.[0]?.id !== undefined) playerBPrisons.push(slot.body[0].id);
  }
  check('a free account creates its five slots unhindered', freeSlotInsertsAccepted === 5, `${freeSlotInsertsAccepted}/5 accepted`);

  // The bypass check. `create_prison()` is the front door, but the INSERT
  // grant on `prisons` is deliberately still there (ADR 0012), so this is
  // the path an attacker would actually use and the one that must refuse.
  const sixthDirect = await rest('prisons', {
    session: playerB,
    method: 'POST',
    body: { owner_id: subjectB, game_version: 'lockstate-0.0.0', slot_index: 5 },
  });
  check(
    'a sixth slot via a DIRECT PostgREST insert is refused — the cap is not merely a property of the RPC',
    sixthDirect.status === 400 && sixthDirect.body?.code === 'LS001',
    `${sixthDirect.status} ${JSON.stringify(sixthDirect.body)}`,
  );
  check(
    'the refusal is distinguishable and actionable, not an opaque constraint violation',
    typeof sixthDirect.body?.details === 'string' && sixthDirect.body.details.includes('capacity=5'),
    JSON.stringify(sixthDirect.body),
  );

  const sixthRpc = await rest('rpc/create_prison', {
    session: playerB,
    method: 'POST',
    body: { p_prison_id: null, p_game_version: 'lockstate-0.0.0', p_slot_index: 5 },
  });
  check(
    'the same refusal through create_prison() is a discriminated status carrying used/capacity',
    sixthRpc.body?.[0]?.status === 'at_slot_limit' && sixthRpc.body[0].used_slots === 5 && sixthRpc.body[0].capacity === 5,
    `${sixthRpc.status} ${JSON.stringify(sixthRpc.body)}`,
  );

  console.log('\nPostgREST: at the ceiling, everything except creating still works');
  const cappedList = await rest('prisons?select=id,slot_index', { session: playerB });
  check('an account at its ceiling still lists every prison it has', cappedList.body?.length === 5, JSON.stringify(cappedList.body?.length));

  const cappedSave = await rest('rpc/create_save_version', {
    session: playerB,
    method: 'POST',
    body: {
      p_prison_id: playerBPrisons[0],
      p_new_revision: 1,
      p_save_schema_version: 1,
      p_checksum: 'checksum-at-ceiling',
      p_payload: { tick: 0 },
      p_storage_path: null,
      // A deliberate lie: the payload is 11 bytes. It used to be recorded verbatim.
      p_byte_size: 999_999,
    },
  });
  check('an account at its ceiling can still save an existing prison', cappedSave.body?.[0]?.status === 'created', JSON.stringify(cappedSave.body));

  const cappedPull = await rest(`save_versions?select=revision,byte_size,payload&prison_id=eq.${playerBPrisons[0]}`, { session: playerB });
  check(
    'and can still pull it back — over-capacity degrades read-only, it never destroys data',
    cappedPull.body?.[0]?.payload?.tick === 0,
    `${cappedPull.status} ${JSON.stringify(cappedPull.body)}`,
  );
  check(
    'byte_size is the measured payload size, not the 999999 the caller claimed',
    cappedPull.body?.[0]?.byte_size === 11,
    JSON.stringify(cappedPull.body?.[0]?.byte_size),
  );

  console.log('\nPostgREST: the per-save payload bound');
  const payloadLimit = await rest('rpc/max_save_payload_bytes', { session: playerB, method: 'POST', body: {} });
  check('a client can ask the server what the payload limit is', typeof payloadLimit.body === 'number', JSON.stringify(payloadLimit.body));

  const oversized = await rest('rpc/create_save_version', {
    session: playerB,
    method: 'POST',
    body: {
      p_prison_id: playerBPrisons[1],
      p_new_revision: 1,
      p_save_schema_version: 1,
      p_checksum: 'checksum-oversized',
      p_payload: { blob: 'x'.repeat((payloadLimit.body ?? 4_194_304) + 1) },
      p_storage_path: null,
      p_byte_size: 10,
    },
  });
  check(
    'a payload over the limit is refused with its own code, distinct from the slot cap',
    oversized.status === 400 && oversized.body?.code === 'LS002',
    `${oversized.status} ${JSON.stringify(oversized.body?.code)} ${JSON.stringify(oversized.body?.details)}`,
  );

  console.log('\nPostgREST: paid capacity raises the cap, and only the server can grant it');
  // playerA holds the +5 grant recorded through the webhook path above.
  const paidCreate = await rest('rpc/create_prison', {
    session: playerA,
    method: 'POST',
    body: { p_prison_id: null, p_game_version: 'lockstate-0.0.0', p_slot_index: 1, p_display_name: 'Annexe' },
  });
  check(
    'the cap reads the entitlements projection: a purchased account is allowed ten',
    paidCreate.body?.[0]?.status === 'created' && paidCreate.body[0].capacity === 10,
    `${paidCreate.status} ${JSON.stringify(paidCreate.body)}`,
  );

  const signedOutCreatePrison = await rest('rpc/create_prison', {
    method: 'POST',
    body: { p_prison_id: null, p_game_version: 'lockstate-0.0.0', p_slot_index: 0 },
  });
  check(
    'a signed-out visitor cannot reach create_prison at all',
    signedOutCreatePrison.status === 401 || signedOutCreatePrison.status === 403 || signedOutCreatePrison.status === 404,
    `${signedOutCreatePrison.status} ${JSON.stringify(signedOutCreatePrison.body)}`,
  );

  console.log('\nPostgREST: what the trusted role is deliberately NOT given');
  const trustedProjectionRead = await rest('entitlements?select=value', { trusted: true });
  check(
    'the trusted role cannot read the entitlement projection directly',
    trustedProjectionRead.status === 401 || trustedProjectionRead.status === 403,
    `${trustedProjectionRead.status} ${JSON.stringify(trustedProjectionRead.body)}`,
  );

  const trustedPrisonRead = await rest('prisons?select=id', { trusted: true });
  check(
    'the trusted role cannot read cloud saves: they are client-authoritative state',
    trustedPrisonRead.status === 401 || trustedPrisonRead.status === 403,
    `${trustedPrisonRead.status} ${JSON.stringify(trustedPrisonRead.body)}`,
  );

  const trustedSaveRpc = await rest('rpc/create_save_version', {
    trusted: true,
    method: 'POST',
    body: {
      p_prison_id: prisonId,
      p_new_revision: 2,
      p_save_schema_version: 1,
      p_checksum: 'trusted',
      p_payload: { tick: 1 },
      p_storage_path: null,
      p_byte_size: 10,
    },
  });
  check(
    'the trusted role cannot call create_save_version either',
    trustedSaveRpc.status === 401 || trustedSaveRpc.status === 403 || trustedSaveRpc.status === 404,
    `${trustedSaveRpc.status} ${JSON.stringify(trustedSaveRpc.body)}`,
  );

  const trustedCreatePrison = await rest('rpc/create_prison', {
    trusted: true,
    method: 'POST',
    body: { p_prison_id: null, p_game_version: 'lockstate-0.0.0', p_slot_index: 0 },
  });
  check(
    'nor create_prison: slot creation derives its authorization from auth.uid(), which a trusted caller has none of',
    trustedCreatePrison.status === 401 || trustedCreatePrison.status === 403 || trustedCreatePrison.status === 404,
    `${trustedCreatePrison.status} ${JSON.stringify(trustedCreatePrison.body)}`,
  );

  const failed = checks.filter((entry) => entry.ok === false);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
