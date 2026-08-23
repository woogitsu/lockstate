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
 * No secret is needed or accepted: the publishable/anon key is read from
 * `supabase status` at runtime, which is the only key a browser ever holds
 * (AGENTS.md, docs/ARCHITECTURE.md "Security"). Nothing here uses the
 * service-role key.
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
  if (apiUrl === undefined || publishableKey === undefined) {
    throw new Error('`supabase status` reported no API_URL/PUBLISHABLE_KEY — is the stack running?');
  }
  return { apiUrl, publishableKey };
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
  const { apiUrl, publishableKey } = readStackEnvironment();
  console.log(`Verifying the running stack at ${apiUrl}\n`);

  const anonymousHeaders = { apikey: publishableKey, 'Content-Type': 'application/json' };
  const asUser = (session) => ({ ...anonymousHeaders, Authorization: `Bearer ${session.access_token}` });

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

  async function rest(path, { session, method = 'GET', body, prefer } = {}) {
    const response = await fetch(`${apiUrl}/rest/v1/${path}`, {
      method,
      headers: {
        ...(session === undefined ? anonymousHeaders : asUser(session)),
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

  const signedOutDefinitions = await rest('challenge_definitions?select=challenge_id');
  check(
    'a signed-out visitor can read the signed challenge definitions',
    signedOutDefinitions.status === 200,
    `${signedOutDefinitions.status} ${JSON.stringify(signedOutDefinitions.body)}`,
  );

  const failed = checks.filter((entry) => entry.ok === false);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
