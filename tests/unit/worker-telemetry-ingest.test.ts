import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLockstateWorker, type LockstateWorkerEnv } from '../../src/worker/index';
import {
  MAX_INGEST_BATCH_SIZE,
  MAX_INGEST_BODY_BYTES,
  handleTelemetryIngest,
  type TelemetryIngestRecord,
  type TelemetryIngestStore,
} from '../../src/worker/telemetry-ingest';
import { resolveTelemetryIngestRoute } from '../../src/worker/telemetry-ingest-route';
import {
  MAX_TELEMETRY_ATTRIBUTES,
  MAX_TELEMETRY_STRING_LENGTH,
  TELEMETRY_SCHEMA_VERSION,
  defaultTelemetryEventRegistry,
} from '../../src/services/telemetry/events';
import { TELEMETRY_CONSENT_VERSION } from '../../src/services/telemetry/consent';
import { stripComments } from '../helpers/canonical-iteration';

/**
 * What the telemetry ingest does with everything the open internet can send
 * it.
 *
 * This is the first endpoint in this project that accepts input from anybody,
 * so the tests are organised as an attack list rather than as a walk through
 * the implementation: every case below is a request somebody can actually make
 * and the asserted response is the whole answer they get.
 *
 * **Every assertion here is unit-level.** It exercises the real handler and
 * the real entry point with real `Request`/`Response` objects on Node's web
 * platform globals, which is the same shape workerd presents -- but it is not
 * workerd, and it is not a deployment. What is checked against the real Worker
 * runtime is a separate and much narrower thing, in
 * `scripts/verify-deployment-preview.mjs`: that `main` in front of Static
 * Assets leaves the site byte-identical and that no ingest route exists when
 * no path is configured. The guards below are exercised by no runtime other
 * than this one, because reaching them needs a configured destination and
 * there is none.
 */

const REGISTERED_DIAGNOSTIC = 'diagnostic.unhandled-error';
const REGISTERED_GAMEPLAY = 'gameplay.scenario-completed';
const INGEST_PATH = '/internal/telemetry';

interface EnvelopeOverrides {
  readonly [key: string]: unknown;
}

function envelope(overrides: EnvelopeOverrides = {}): Record<string, unknown> {
  return {
    schemaVersion: TELEMETRY_SCHEMA_VERSION,
    eventId: 's0123456789abcdef-1',
    name: REGISTERED_DIAGNOSTIC,
    category: 'diagnostics',
    occurredAt: 1_700_000_000_000,
    sessionId: 's0123456789abcdef',
    release: { buildVersion: 'lockstate-0.0.406', environment: 'staging' },
    consentVersion: TELEMETRY_CONSENT_VERSION,
    sampleRate: 1,
    attributes: { errorName: 'RangeError', area: 'boot', frameCount: 3 },
    ...overrides,
  };
}

function body(events: readonly unknown[], environment = 'staging'): string {
  return JSON.stringify({ environment, events });
}

/**
 * A batch whose named fields are spliced in as raw JSON literals.
 *
 * `JSON.stringify` cannot produce the values this is for: JSON has no NaN and
 * no Infinity literal, and `1e999` -- which is how one actually arrives over
 * the wire -- parses to Infinity rather than failing to parse. There is no way
 * to write that through an object.
 */
function rawBatch(raw: Readonly<Record<string, string>>): string {
  const fields = { ...envelope() } as Record<string, unknown>;
  for (const key of Object.keys(raw)) delete fields[key];
  const encoded = Object.entries(fields).map(
    ([key, value]) => `${JSON.stringify(key)}:${JSON.stringify(value)}`,
  );
  for (const [key, literal] of Object.entries(raw)) encoded.push(`${JSON.stringify(key)}:${literal}`);
  return `{"environment":"staging","events":[{${encoded.join(',')}}]}`;
}

function recordingStore(): { store: TelemetryIngestStore; batches: readonly TelemetryIngestRecord[][] } {
  const batches: TelemetryIngestRecord[][] = [];
  return {
    batches,
    store: {
      async store(records) {
        batches.push([...records]);
      },
    },
  };
}

const FAILING_STORE: TelemetryIngestStore = {
  async store() {
    throw new Error('the destination said something the caller must never see: sb_secret_marker');
  },
};

const THROWING_STORE: TelemetryIngestStore = {
  store() {
    throw new Error('synchronous defect');
  },
};

interface PostOptions {
  readonly method?: string;
  readonly contentType?: string | null;
  readonly payload?: string | Uint8Array | ReadableStream<Uint8Array> | null;
  readonly contentLength?: string;
  readonly store?: TelemetryIngestStore | undefined;
  readonly now?: () => number;
}

function request(options: PostOptions): Request {
  const headers = new Headers();
  if (options.contentType !== null) headers.set('content-type', options.contentType ?? 'application/json');
  if (options.contentLength !== undefined) headers.set('content-length', options.contentLength);

  const method = options.method ?? 'POST';
  const init: RequestInit & { duplex?: string } = { method, headers };
  if (options.payload !== null && options.payload !== undefined && method !== 'GET' && method !== 'HEAD') {
    init.body = options.payload as BodyInit;
    if (options.payload instanceof ReadableStream) init.duplex = 'half';
  }
  return new Request(`https://lockstate.io${INGEST_PATH}`, init as RequestInit);
}

async function post(options: PostOptions): Promise<{ status: number; text: string; response: Response }> {
  const response = await handleTelemetryIngest(request(options), {
    // `in` rather than `??`: `store: undefined` is the shipped Worker's state
    // and has to be distinguishable from "the case did not care".
    store: 'store' in options ? options.store : recordingStore().store,
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  return { status: response.status, text: await response.text(), response };
}

describe('the telemetry ingest: what it accepts', () => {
  it('accepts a well-formed batch, and hands the destination the server-decided values', async () => {
    const store = recordingStore();
    const answer = await post({ payload: body([envelope()]), store: store.store, now: () => 1_800_000_000_000 });

    expect(answer.status).toBe(202);
    expect(answer.text).toBe('{"accepted":1}');
    expect(store.batches).toHaveLength(1);

    const record = store.batches[0]?.[0];
    expect(record?.receivedAt, 'receivedAt is the server clock, never the body').toBe(1_800_000_000_000);
    expect(record?.claimedOccurredAt, 'the body time is kept, named as a claim').toBe(1_700_000_000_000);
    expect(record?.environment).toBe('staging');
    expect(record?.envelope.name).toBe(REGISTERED_DIAGNOSTIC);
  });

  it('takes the sample rate from its own registry and never from the caller', async () => {
    const store = recordingStore();
    // 0.001 would be a thousandfold multiplier to a receiver that weighted by
    // `1 / sampleRate`. The registry says 0.25 for this event.
    const answer = await post({
      payload: body([envelope({ name: REGISTERED_GAMEPLAY, category: 'gameplay', sampleRate: 0.001 })]),
      store: store.store,
    });

    expect(answer.status).toBe(202);
    const record = store.batches[0]?.[0];
    expect(record?.registrySampleRate).toBe(defaultTelemetryEventRegistry.get(REGISTERED_GAMEPLAY)?.sampleRate);
    expect(record?.registrySampleRate).toBe(0.25);
    expect(record?.claimedSampleRate, 'the claim is carried, never multiplied by').toBe(0.001);
  });

  it('does not let a far-future occurrence time reach the value a retention window would key on', async () => {
    const store = recordingStore();
    const answer = await post({
      payload: body([envelope({ occurredAt: 64_060_588_800_000 })]),
      store: store.store,
      now: () => 1_800_000_000_000,
    });

    expect(answer.status).toBe(202);
    expect(store.batches[0]?.[0]?.claimedOccurredAt).toBe(64_060_588_800_000);
    expect(store.batches[0]?.[0]?.receivedAt).toBe(1_800_000_000_000);
  });

  it('accepts a batch at the size cap and refuses the one above it', async () => {
    const atCap = await post({ payload: body(Array.from({ length: MAX_INGEST_BATCH_SIZE }, () => envelope())) });
    expect(atCap.status).toBe(202);
    expect(atCap.text).toBe(`{"accepted":${MAX_INGEST_BATCH_SIZE}}`);

    const overCap = await post({
      payload: body(Array.from({ length: MAX_INGEST_BATCH_SIZE + 1 }, () => envelope())),
    });
    expect(overCap.status).toBe(413);
    expect(overCap.text).toBe('{"error":"batch-too-large"}');
  });

  it('has a byte cap that admits the largest batch the shared schema admits', async () => {
    // Built from the schema's own constants rather than from a guessed size,
    // so raising a cap in `events.ts` fails here instead of silently refusing
    // legitimate crash reports.
    const longKey = `k${'a'.repeat(126)}`;
    const attributes: Record<string, string> = {};
    for (let index = 0; index < MAX_TELEMETRY_ATTRIBUTES; index += 1) {
      attributes[`${longKey.slice(0, 125)}${String(index).padStart(3, '0')}`] = 'x'.repeat(
        MAX_TELEMETRY_STRING_LENGTH,
      );
    }
    const worstCase = body(
      Array.from({ length: MAX_INGEST_BATCH_SIZE }, () =>
        envelope({
          eventId: `s${'0'.repeat(126)}1`,
          sessionId: `s${'0'.repeat(126)}`,
          release: { buildVersion: `b${'0'.repeat(126)}`, environment: 'staging', commit: `c${'0'.repeat(126)}` },
          attributes,
        }),
      ),
    );

    expect(
      new TextEncoder().encode(worstCase).byteLength,
      `the worst case the envelope schema admits must fit under MAX_INGEST_BODY_BYTES (${MAX_INGEST_BODY_BYTES})`,
    ).toBeLessThanOrEqual(MAX_INGEST_BODY_BYTES);
    expect((await post({ payload: worstCase })).status).toBe(202);
  });
});

describe('the telemetry ingest: the request line and the headers', () => {
  it.each(['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])('refuses %s and never falls through', async (method) => {
    const answer = await post({ method, payload: body([envelope()]) });
    expect(answer.status).toBe(405);
    expect(answer.text).toBe('{"error":"method-not-allowed"}');
    expect(answer.response.headers.get('allow')).toBe('POST');
  });

  it.each([
    ['a missing content type', null],
    ['text/plain', 'text/plain'],
    ['application/x-www-form-urlencoded', 'application/x-www-form-urlencoded'],
    ['a media type that merely contains the right one', 'text/plain+application/json'],
  ])('refuses %s', async (_label, contentType) => {
    const answer = await post({ contentType, payload: body([envelope()]) });
    expect(answer.status).toBe(415);
    expect(answer.text).toBe('{"error":"unsupported-media-type"}');
  });

  it('accepts the content type with a charset parameter, which is what the client sends', async () => {
    expect((await post({ contentType: 'application/json; charset=utf-8', payload: body([envelope()]) })).status).toBe(
      202,
    );
  });

  it('sends no CORS header on any answer, so no cross-origin page can read one', async () => {
    for (const answer of [
      await post({ payload: body([envelope()]) }),
      await post({ method: 'GET' }),
      await post({ payload: '{' }),
    ]) {
      expect(answer.response.headers.get('access-control-allow-origin')).toBeNull();
      expect(answer.response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(answer.response.headers.get('cache-control')).toBe('no-store');
      expect(answer.response.headers.get('referrer-policy')).toBe('no-referrer');
    }
  });
});

describe('the telemetry ingest: the destination it does not have', () => {
  it('refuses with one code when no destination is configured', async () => {
    const answer = await post({ payload: body([envelope()]), store: undefined });
    expect(answer.status).toBe(503);
    expect(answer.text).toBe('{"error":"destination-unconfigured"}');
  });

  it('does not read the request body at all when there is nowhere to write it', async () => {
    // `bodyUsed` rather than a pull counter: the platform's own `Request`
    // buffers ahead of any reader, so counting pulls measures undici and not
    // the handler. `bodyUsed` is exactly "somebody took the stream".
    const incoming = request({
      payload: new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.enqueue(new TextEncoder().encode(body([envelope()])));
          controller.close();
        },
      }),
    });

    const answer = await handleTelemetryIngest(incoming, { store: undefined });
    expect(answer.status).toBe(503);
    expect(
      incoming.bodyUsed,
      'an ingest with nowhere to store must not be a bandwidth or a parse surface',
    ).toBe(false);
  });

  it('answers 502 and says nothing about the failure when the destination refuses', async () => {
    const answer = await post({ payload: body([envelope()]), store: FAILING_STORE });
    expect(answer.status).toBe(502);
    expect(answer.text).toBe('{"error":"store-failed"}');
    expect(answer.text).not.toContain('sb_secret');
    expect(answer.text).not.toContain('destination');
  });
});

describe('the telemetry ingest: bodies that are not bodies', () => {
  it('refuses a completely absent body', async () => {
    const answer = await post({ payload: null });
    expect(answer.status).toBe(400);
    expect(answer.text).toBe('{"error":"malformed-body"}');
  });

  it('refuses a body that is not JSON', async () => {
    for (const payload of ['{', '', 'null', 'not json at all', '[]']) {
      const answer = await post({ payload });
      expect(answer.status, `payload ${JSON.stringify(payload)}`).toBe(400);
      expect(['{"error":"malformed-body"}', '{"error":"schema-refused"}']).toContain(answer.text);
    }
  });

  it('refuses bytes that are not valid UTF-8 rather than substituting a replacement character', async () => {
    // 0xC3 announces a two-byte sequence and 0x28 cannot continue one.
    const answer = await post({ payload: new Uint8Array([0x7b, 0xc3, 0x28, 0x7d]) });
    expect(answer.status).toBe(400);
    expect(answer.text).toBe('{"error":"malformed-body"}');
  });

  it('refuses a body larger than the cap by its declared length, before reading it', async () => {
    const incoming = request({
      payload: new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.enqueue(new Uint8Array(1024));
          controller.close();
        },
      }),
      contentLength: String(MAX_INGEST_BODY_BYTES + 1),
    });

    const answer = await handleTelemetryIngest(incoming, { store: recordingStore().store });
    expect(answer.status).toBe(413);
    expect(await answer.text()).toBe('{"error":"body-too-large"}');
    expect(incoming.bodyUsed, 'a declared over-length body is refused without being read').toBe(false);
  });

  it('refuses a body larger than the cap that declared no length at all', async () => {
    const chunk = new Uint8Array(64 * 1024);
    let sent = 0;
    const payload = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent > MAX_INGEST_BODY_BYTES * 4) {
          controller.close();
          return;
        }
        sent += chunk.byteLength;
        controller.enqueue(chunk);
      },
    });

    const answer = await handleTelemetryIngest(request({ payload }), { store: recordingStore().store });
    expect(answer.status).toBe(413);
    expect(await answer.text()).toBe('{"error":"body-too-large"}');
    expect(sent, 'the read stops at the cap rather than draining the stream').toBeLessThanOrEqual(
      MAX_INGEST_BODY_BYTES + chunk.byteLength,
    );
  });

  it('refuses a content-length that is not a number', async () => {
    const answer = await post({ payload: body([envelope()]), contentLength: '12abc' });
    expect(answer.status).toBe(400);
    expect(answer.text).toBe('{"error":"malformed-body"}');
  });
});

describe('the telemetry ingest: bodies that are nearly right', () => {
  it.each([
    ['one extra unexpected field at the top level', JSON.stringify({ environment: 'staging', events: [envelope()], debug: true })],
    ['a missing environment', JSON.stringify({ events: [envelope()] })],
    ['a missing events field', JSON.stringify({ environment: 'staging' })],
    ['an environment that is not one of the three', body([envelope()], 'localhost')],
    ['events as an object rather than an array', JSON.stringify({ environment: 'staging', events: { 0: envelope() } })],
    ['an empty batch', body([])],
    ['one extra unexpected field inside an envelope', body([envelope({ prisonId: 'p-1' })])],
    ['a declared string given an object', body([envelope({ name: {} })])],
    ['a declared string given a number', body([envelope({ sessionId: 42 })])],
    ['a nested object where a scalar attribute was declared', body([envelope({ attributes: { nested: { a: 1 } } })])],
    ['an attribute string one character over the cap', body([envelope({ attributes: { a: 'x'.repeat(MAX_TELEMETRY_STRING_LENGTH + 1) } })])],
    ['more attributes than the cap admits', body([envelope({ attributes: Object.fromEntries(Array.from({ length: MAX_TELEMETRY_ATTRIBUTES + 1 }, (_value, index) => [`k${index}`, index])) })])],
    ['a schema version this build does not speak', body([envelope({ schemaVersion: 2 })])],
    ['a negative occurrence time', body([envelope({ occurredAt: -1 })])],
    ['a consent version of zero', body([envelope({ consentVersion: 0 })])],
    ['an identifier with a null byte in it', body([envelope({ sessionId: 's\u0000abc' })])],
    ['an event id that is the empty string', body([envelope({ eventId: '' })])],
  ])('refuses %s', async (_label, payload) => {
    const answer = await post({ payload });
    expect(answer.status).toBe(400);
    expect(answer.text).toBe('{"error":"schema-refused"}');
  });

  it.each([
    ['a sample rate JSON.parse turns into Infinity', '1e999'],
    ['a negative-Infinity sample rate', '-1e999'],
  ])('refuses %s', async (_label, literal) => {
    // JSON has no NaN or Infinity literal, so `1e999` is how one arrives: it
    // parses to Infinity rather than failing to parse.
    const answer = await post({ payload: rawBatch({ sampleRate: literal }) });
    expect(answer.status).toBe(400);
    expect(answer.text).toBe('{"error":"schema-refused"}');
  });

  it('refuses an occurrence time JSON.parse turns into Infinity', async () => {
    const answer = await post({ payload: rawBatch({ occurredAt: '1e999' }) });
    expect(answer.status).toBe(400);
    expect(answer.text).toBe('{"error":"schema-refused"}');
  });

  it('refuses an attribute number JSON.parse turns into Infinity', async () => {
    const answer = await post({ payload: '{"environment":"staging","events":[{"schemaVersion":1,"eventId":"a-1","name":"diagnostic.unhandled-error","category":"diagnostics","occurredAt":1,"sessionId":"s1","release":{"buildVersion":"b","environment":"staging"},"consentVersion":1,"sampleRate":1,"attributes":{"cost":1e999}}]}' });
    expect(answer.status).toBe(400);
    expect(answer.text).toBe('{"error":"schema-refused"}');
  });
});

describe('the telemetry ingest: forged envelopes', () => {
  it('refuses an event name the registry does not carry', async () => {
    const answer = await post({ payload: body([envelope({ name: 'diagnostic.made-up' })]) });
    expect(answer.status).toBe(400);
    expect(answer.text).toBe('{"error":"unknown-event"}');
  });

  it('refuses a registered name wearing a category the registry does not give it', async () => {
    const answer = await post({ payload: body([envelope({ category: 'gameplay' })]) });
    expect(answer.status).toBe(400);
    expect(answer.text).toBe('{"error":"category-mismatch"}');
  });

  it.each([
    ['an email address in an attribute value', { errorMessage: 'failed for alice@example.com' }],
    ['a bearer token in an attribute value', { errorMessage: 'Bearer abcdefghijklmnopqrstuvwxyz012345' }],
    ['a key name the deny list drops outright', { authToken: 'x' }],
    ['a session-shaped key name', { sessionCookie: 'x' }],
  ])('refuses %s, because it never went through redaction', async (_label, attributes) => {
    const answer = await post({ payload: body([envelope({ attributes })]) });
    expect(answer.status).toBe(400);
    expect(answer.text).toBe('{"error":"unredacted"}');
  });

  it.each([
    ['a null byte in an attribute value', 'before\u0000after'],
    ['a lone high surrogate', 'before\ud800after'],
    ['a lone low surrogate', 'before\udc00after'],
  ])('refuses %s, which no destination can store', async (_label, value) => {
    const answer = await post({ payload: body([envelope({ attributes: { errorMessage: value } })]) });
    expect(answer.status).toBe(400);
    expect(answer.text).toBe('{"error":"unstorable-text"}');
  });

  it('still accepts a newline and a tab, which an error message legitimately carries', async () => {
    expect(
      (await post({ payload: body([envelope({ attributes: { errorMessage: 'line one\n\tline two' } })]) })).status,
    ).toBe(202);
  });

  it('refuses a batch whose two statements of its environment disagree', async () => {
    const answer = await post({
      payload: body([envelope({ release: { buildVersion: 'b', environment: 'production' } })], 'staging'),
    });
    expect(answer.status).toBe(400);
    expect(answer.text).toBe('{"error":"environment-mismatch"}');
  });

  it('refuses the whole batch when one envelope in it is bad, and stores none of it', async () => {
    const store = recordingStore();
    const answer = await post({
      payload: body([envelope(), envelope({ name: 'diagnostic.made-up' }), envelope()]),
      store: store.store,
    });
    expect(answer.status).toBe(400);
    expect(answer.text).toBe('{"error":"unknown-event"}');
    expect(store.batches, 'no partial acceptance').toHaveLength(0);
  });
});

describe('the telemetry ingest: it can tell nobody anything about anybody', () => {
  /**
   * The class of defect PR #355 closed in SQL: a refusal that differs
   * depending on whether the id named belongs to somebody else or to nobody.
   *
   * Here the answer is stronger than a carefully matched pair of messages,
   * because there is only one branch: the handler resolves no identity and
   * performs no lookup, so a prison id in an attribute is opaque text. These
   * assertions exist so that a future branch which *did* start reading one
   * would fail rather than be noticed.
   */
  /**
   * Both are the shape `newPrisonId()` actually mints. Since #338 a prison id
   * is a `uuid` -- `tests/foundation/cloud-prison-id-domain-contract.test.ts`
   * pins that against the DDL -- so `redactAttributes` catches one, and the
   * ingest refuses the batch before the value is ever stored. ADR 0046's
   * "What redaction does not catch" section says the opposite, citing #338 for
   * the claim that prison ids are not UUIDs; #338 is the issue in which they
   * became UUIDs, so that sentence is stale rather than wrong-at-the-time.
   */
  const ABSENT_PRISON = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const SOMEBODY_ELSES_PRISON = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  /** A prison *name* is player-chosen free text, and redaction genuinely does not catch one. */
  const SOMEBODY_ELSES_PRISON_NAME = 'Ravensmoor Wing C';

  it('gives a prison id that is not the callers the same answer as one that exists nowhere', async () => {
    const answers = await Promise.all(
      [ABSENT_PRISON, SOMEBODY_ELSES_PRISON].map(async (prison) =>
        post({ payload: body([envelope({ attributes: { area: prison } })]) }),
      ),
    );

    expect(answers[0]?.status).toBe(answers[1]?.status);
    expect(answers[0]?.text).toBe(answers[1]?.text);
    expect([...(answers[0]?.response.headers ?? [])].sort()).toEqual(
      [...(answers[1]?.response.headers ?? [])].sort(),
    );
    // The one answer both get, named rather than merely compared: redaction
    // refuses a uuid, so neither id reaches a stored row at all.
    expect(answers[0]?.status).toBe(400);
    expect(answers[0]?.text).toBe('{"error":"unredacted"}');
  });

  it('gives the same refusal for both when the batch is refused for an unrelated reason', async () => {
    const answers = await Promise.all(
      [ABSENT_PRISON, SOMEBODY_ELSES_PRISON].map(async (prison) =>
        post({ payload: body([envelope({ name: 'diagnostic.made-up', attributes: { area: prison } })]) }),
      ),
    );

    expect(answers[0]?.status).toBe(answers[1]?.status);
    expect(answers[0]?.text).toBe(answers[1]?.text);
  });

  it('echoes no part of the request in any answer', async () => {
    const marker = 'a-string-that-must-not-come-back';
    const answers = await Promise.all([
      post({ payload: body([envelope({ name: marker })]) }),
      post({ payload: body([envelope({ attributes: { area: marker } }), envelope({ name: 'x.y' })]) }),
      post({ payload: `{"environment":"staging","events":[],"${marker}":1}` }),
      post({ payload: `{${marker}` }),
    ]);

    for (const answer of answers) {
      expect(answer.text, 'a refusal is a code and nothing else').toMatch(/^\{"error":"[a-z-]+"\}$/u);
      expect(answer.text).not.toContain(marker);
    }
  });

  it('hands the destination text it cannot resolve verbatim, having resolved nothing about it', async () => {
    const store = recordingStore();
    const answer = await post({
      payload: body([envelope({ attributes: { area: SOMEBODY_ELSES_PRISON_NAME } })]),
      store: store.store,
    });
    expect(answer.status).toBe(202);
    expect(store.batches[0]?.[0]?.envelope.attributes['area']).toBe(SOMEBODY_ELSES_PRISON_NAME);
  });
});

describe('the ingest route, resolved from the environment and nothing else', () => {
  it('claims no path when nothing is configured', () => {
    expect(resolveTelemetryIngestRoute({})).toBeUndefined();
    expect(resolveTelemetryIngestRoute({ LOCKSTATE_TELEMETRY_INGEST_PATH: '' })).toBeUndefined();
    expect(resolveTelemetryIngestRoute({ LOCKSTATE_TELEMETRY_INGEST_PATH: '   ' })).toBeUndefined();
  });

  it.each([
    ['an absolute URL', 'https://telemetry.example.com/ingest'],
    ['a protocol-relative reference', '//telemetry.example.com/ingest'],
    ['a query string', '/ingest?x=1'],
    ['a fragment', '/ingest#x'],
    ['a traversal', '/internal/../ingest'],
    ['a single dot segment', '/internal/./ingest'],
    ['a path with no leading slash', 'internal/telemetry'],
    ['a path with a space in it', '/internal/tele metry'],
    ['a trailing slash', '/internal/telemetry/'],
  ])('claims no path for %s', (_label, value) => {
    expect(resolveTelemetryIngestRoute({ LOCKSTATE_TELEMETRY_INGEST_PATH: value })).toBeUndefined();
  });

  it.each([
    ['an object', { toString: () => '/ingest' }],
    ['a number', 1],
    ['an array', ['/ingest']],
    ['null', null],
    ['true', true],
  ])('answers rather than throwing when the binding arrives as %s', (_label, value) => {
    expect(() => resolveTelemetryIngestRoute({ LOCKSTATE_TELEMETRY_INGEST_PATH: value })).not.toThrow();
    expect(resolveTelemetryIngestRoute({ LOCKSTATE_TELEMETRY_INGEST_PATH: value })).toBeUndefined();
  });

  it('claims exactly the configured path, trimmed', () => {
    expect(resolveTelemetryIngestRoute({ LOCKSTATE_TELEMETRY_INGEST_PATH: '  /internal/telemetry  ' })).toBe(
      '/internal/telemetry',
    );
  });
});

describe('the entry point in front of the whole domain', () => {
  function envWith(path?: string): { env: LockstateWorkerEnv; seen: Request[] } {
    const seen: Request[] = [];
    const env = {
      ASSETS: {
        async fetch(assetRequest: Request) {
          seen.push(assetRequest);
          return new Response('the SPA shell', { status: 200, headers: { 'content-type': 'text/html' } });
        },
      },
      ...(path === undefined ? {} : { LOCKSTATE_TELEMETRY_INGEST_PATH: path }),
    } satisfies LockstateWorkerEnv;
    return { env, seen };
  }

  it('hands every request to Static Assets unchanged when no ingest path is configured', async () => {
    const worker = createLockstateWorker({ store: recordingStore().store });
    const { env, seen } = envWith();

    for (const url of [
      'https://lockstate.io/',
      'https://lockstate.io/assets/index-abc123.js',
      'https://lockstate.io/prisons/x/dashboard',
      `https://lockstate.io${INGEST_PATH}`,
    ]) {
      const incoming = new Request(url, { method: url.endsWith(INGEST_PATH) ? 'POST' : 'GET' });
      const answer = await worker.fetch(incoming, env);
      expect(answer.status, url).toBe(200);
      expect(await answer.text()).toBe('the SPA shell');
    }

    expect(seen).toHaveLength(4);
    expect(seen.map((each) => new URL(each.url).pathname)).toEqual([
      '/',
      '/assets/index-abc123.js',
      '/prisons/x/dashboard',
      INGEST_PATH,
    ]);
  });

  it('answers the configured path itself and never falls through from it', async () => {
    const worker = createLockstateWorker({ store: recordingStore().store });
    const { env, seen } = envWith(INGEST_PATH);

    const read = await worker.fetch(new Request(`https://lockstate.io${INGEST_PATH}`, { method: 'GET' }), env);
    expect(read.status, 'a GET on the ingest path must not answer with the SPA shell').toBe(405);

    const written = await worker.fetch(
      new Request(`https://lockstate.io${INGEST_PATH}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: body([envelope()]),
      }),
      env,
    );
    expect(written.status).toBe(202);
    expect(seen, 'nothing on the claimed path reaches Static Assets').toHaveLength(0);
  });

  it('claims only the exact path, not a prefix of it', async () => {
    const worker = createLockstateWorker({ store: recordingStore().store });
    const { env, seen } = envWith(INGEST_PATH);

    for (const url of [`https://lockstate.io${INGEST_PATH}/more`, `https://lockstate.io${INGEST_PATH}x`, 'https://lockstate.io/internal']) {
      expect((await worker.fetch(new Request(url), env)).status, url).toBe(200);
    }
    expect(seen).toHaveLength(3);
  });

  it('ignores a query string when matching, and still answers the path', async () => {
    const worker = createLockstateWorker({ store: recordingStore().store });
    const { env } = envWith(INGEST_PATH);
    const answer = await worker.fetch(
      new Request(`https://lockstate.io${INGEST_PATH}?probe=1`, { method: 'GET' }),
      env,
    );
    expect(answer.status).toBe(405);
  });

  it('turns a defect in the handler into one status code rather than a dead site', async () => {
    const worker = createLockstateWorker({ store: THROWING_STORE });
    const { env, seen } = envWith(INGEST_PATH);

    const answer = await worker.fetch(
      new Request(`https://lockstate.io${INGEST_PATH}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: body([envelope()]),
      }),
      env,
    );
    expect(answer.status).toBe(502);
    expect(await answer.text()).toBe('{"error":"store-failed"}');
    expect(seen, 'a thrown handler must not answer with the SPA shell either').toHaveLength(0);

    // And the fall-through still works afterwards: the failure is per request.
    expect((await worker.fetch(new Request('https://lockstate.io/'), env)).status).toBe(200);
  });

  it('ships with no destination, which is the state that merges', async () => {
    const shipped = (await import('../../src/worker/index')).default;
    const { env } = envWith(INGEST_PATH);
    const answer = await shipped.fetch(
      new Request(`https://lockstate.io${INGEST_PATH}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: body([envelope()]),
      }),
      env,
    );
    expect(answer.status).toBe(503);
    expect(await answer.text()).toBe('{"error":"destination-unconfigured"}');
  });
});

describe('what the Worker source may not contain', () => {
  const WORKER_DIRECTORY = join(__dirname, '../../src/worker');

  function workerSources(): readonly { readonly name: string; readonly code: string }[] {
    return readdirSync(WORKER_DIRECTORY)
      .filter((name) => name.endsWith('.ts'))
      .map((name) => ({ name, code: stripComments(readFileSync(join(WORKER_DIRECTORY, name), 'utf8')) }));
  }

  it('reads more than nothing, so the scans below cannot pass vacuously', () => {
    const sources = workerSources();
    expect(sources.length).toBeGreaterThanOrEqual(3);
    expect(sources.every((source) => source.code.length > 200)).toBe(true);
  });

  it('writes to no log of any kind', () => {
    // Every request to this Worker carries the visitor's IP, and a `console`
    // call in a Worker reaches the account's log stream with the request
    // metadata attached. ADR 0046 section 7 item 2: the endpoint must neither
    // log an IP nor persist one.
    for (const { name, code } of workerSources()) {
      expect(code, `${name} must not write to a log`).not.toMatch(/\bconsole\s*\./u);
      expect(code, `${name} must not install a tail handler`).not.toMatch(/\btail\s*\(/u);
    }
  });

  it('reads no request header beyond the two the handler documents', () => {
    const headerReads = workerSources()
      .flatMap(({ code }) => [...code.matchAll(/headers\.get\(\s*'([^']+)'/gu)].map((match) => match[1]))
      .sort();
    // `cf-connecting-ip`, `x-forwarded-for`, `cookie` and `authorization` are
    // the ones that would matter, and none of them is a value this endpoint
    // has any use for.
    expect(headerReads).toEqual(['content-length', 'content-type']);
  });

  it('resolves no identity and reads nothing about a caller', () => {
    for (const { name, code } of workerSources()) {
      for (const forbidden of [/\bcf-connecting-ip\b/iu, /\bx-forwarded-for\b/iu, /\brequest\.cf\b/u, /\bcookie\b/iu, /\bauthorization\b/iu, /\bauth\.uid\b/u]) {
        expect(code, `${name} must not reach for ${String(forbidden)}`).not.toMatch(forbidden);
      }
    }
  });

  it('carries no key-shaped literal, checked by the gate this repository already has for it', () => {
    // `scripts/check-deploy-secrets.sh` is this repository's only mechanical
    // enforcement of `AGENTS.md`'s "do not put secrets, service-role keys or
    // production credentials in client code", and its `bundle` mode scans a
    // directory for credential-shaped material rather than a list of variable
    // names. Pointing it at the Worker source reuses that gate instead of
    // writing a second, weaker copy of its patterns here.
    //
    // Its own contract test (`tests/foundation/deploy-secret-gate-contract.test.ts`)
    // is what proves the gate discriminates; this asserts the Worker passes it.
    const repositoryRoot = resolve(__dirname, '../..');
    const result = spawnSync(process.env['LOCKSTATE_BASH'] ?? 'bash', ['scripts/check-deploy-secrets.sh', 'bundle'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: { ...process.env, LOCKSTATE_BUNDLE_DIR: 'src/worker' },
    });

    expect(
      result.status,
      `check-deploy-secrets.sh rejected src/worker:\n${result.stdout}\n${result.stderr}`,
    ).toBe(0);
    expect(result.stdout).toContain('carries no secret-shaped material');
  });

  it('names no credential, host, project reference or table', () => {
    for (const { name, code } of workerSources()) {
      for (const forbidden of [/service_role/u, /supabase\.co/u, /\bsb_secret_/u, /\bsbp_/u, /https?:\/\//u, /\bBEGIN [A-Z ]*PRIVATE KEY\b/u]) {
        expect(code, `${name} must not contain ${String(forbidden)}`).not.toMatch(forbidden);
      }
    }
  });
});
