import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from '../../src/shared/key-value-store';
import { SENSITIVE_VALUE_PATTERNS } from '../../src/services/telemetry/redaction';
import {
  BatchingTelemetrySink,
  MAX_STACK_FRAMES,
  MAX_TELEMETRY_STRING_LENGTH,
  MemoryTelemetryTransport,
  REDACTED,
  TELEMETRY_CONSENT_VERSION,
  TelemetryRecorder,
  type ReleaseIdentity,
  buildCrashDiagnosticAttributes,
  captureError,
  createTelemetryConsent,
  createTelemetrySessionId,
  isTelemetryAllowed,
  loadTelemetryConsent,
  redactAttributes,
  redactText,
  reduceStack,
  samplingScore,
  saveTelemetryConsent,
  shouldSample,
  withdrawTelemetryConsent,
} from '../../src/services/telemetry';

const NOW = 1_700_000_000_000;

const release: ReleaseIdentity = { buildVersion: 'lockstate-0.1.0', environment: 'production' };

class MemoryStore implements KeyValueStore {
  private readonly entries = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }
}

function allConsent() {
  return createTelemetryConsent(NOW, { diagnostics: true, performance: true, gameplay: true });
}

function buildRecorder(options: { consent?: ReturnType<typeof allConsent> } = {}) {
  const transport = new MemoryTelemetryTransport();
  const sink = new BatchingTelemetrySink(transport, { maxBatchSize: 2, flushIntervalMs: 1_000 });
  let counter = 0;
  const recorder = new TelemetryRecorder({
    sink,
    release,
    sessionId: 'session-fixture',
    newEventId: () => `event-${(counter += 1)}`,
    ...(options.consent === undefined ? {} : { consent: options.consent }),
  });
  return { recorder, sink, transport };
}

describe('telemetry consent', () => {
  it('defaults to collecting nothing until the player decides', () => {
    expect(isTelemetryAllowed(undefined, 'diagnostics')).toBe(false);
    expect(isTelemetryAllowed(undefined, 'performance')).toBe(false);
    expect(isTelemetryAllowed(undefined, 'gameplay')).toBe(false);
  });

  it('gates each category independently', () => {
    const consent = createTelemetryConsent(NOW, { diagnostics: true, performance: false, gameplay: false });
    expect(isTelemetryAllowed(consent, 'diagnostics')).toBe(true);
    expect(isTelemetryAllowed(consent, 'performance')).toBe(false);
  });

  it('treats consent given under an older policy version as no consent', () => {
    const stale = { ...allConsent(), version: (TELEMETRY_CONSENT_VERSION + 1) as 1 };
    expect(isTelemetryAllowed(stale, 'diagnostics')).toBe(false);
  });

  it('round-trips through storage and ignores a corrupt entry', () => {
    const store = new MemoryStore();
    saveTelemetryConsent(store, allConsent());
    expect(loadTelemetryConsent(store)).toEqual(allConsent());

    store.setItem('lockstate.telemetry.consent', '{not json');
    expect(loadTelemetryConsent(store)).toBeUndefined();
  });

  it('stops the very next event when consent is withdrawn', () => {
    const { recorder } = buildRecorder({ consent: allConsent() });
    expect(recorder.record('diagnostic.unhandled-error', { area: 'renderer' }, NOW).accepted).toBe(true);

    recorder.setConsent(withdrawTelemetryConsent(NOW + 1));
    expect(recorder.record('diagnostic.unhandled-error', { area: 'renderer' }, NOW + 2)).toMatchObject({
      accepted: false,
      reason: 'no-consent',
    });
  });
});

describe('telemetry redaction', () => {
  it('drops attributes whose key names anything sensitive', () => {
    const outcome = redactAttributes({
      accessToken: 'abc',
      userEmail: 'player@example.test',
      sessionKey: 'xyz',
      area: 'persistence',
    });
    expect(Object.keys(outcome.attributes)).toEqual(['area']);
    expect(outcome.droppedKeys).toContain('accessToken');
    expect(outcome.droppedKeys).toContain('userEmail');
  });

  it('redacts sensitive values even under an innocuous key', () => {
    const outcome = redactAttributes({
      note: 'contact player@example.test about /home/matt/prison.sav',
    });
    expect(outcome.attributes.note).not.toContain('player@example.test');
    expect(outcome.attributes.note).not.toContain('/home/matt');
    expect(outcome.attributes.note).toContain(REDACTED);
    expect(outcome.redactedKeys).toEqual(['note']);
  });

  it('redacts bearer tokens, JWTs, UUIDs and URL query strings', () => {
    expect(redactText('Authorization: Bearer abc.def')).toContain(REDACTED);
    expect(redactText('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature')).toContain(REDACTED);
    expect(redactText('prison 123e4567-e89b-12d3-a456-426614174000 failed')).toContain(REDACTED);
    expect(redactText('https://lockstate.io/app?token=secret')).toContain(REDACTED);
  });

  it('truncates long strings instead of shipping them whole', () => {
    const outcome = redactAttributes({ note: 'x'.repeat(1_000) });
    expect(String(outcome.attributes.note).length).toBeLessThanOrEqual(200);
  });

  /**
   * One sample per entry in the value-redaction table, keyed by its `reason`.
   *
   * `secret` is the part that must not survive; `text` wraps it in innocuous
   * words, because redaction is supposed to keep a message's shape rather than
   * blank it. Each sample must be a witness for **its own entry alone** -- the
   * last test below rejects a sample that a second pattern also matches, since
   * such a sample would keep passing after its entry was deleted.
   *
   * Six of the seven entries had a sample and `file-url` had none, so deleting
   * that entry changed no test result at all (#264). The map is checked against
   * the table itself rather than read down by hand, so a new pattern arrives
   * with a sample or fails here.
   */
  const REDACTION_SAMPLES: Readonly<Record<string, { readonly text: string; readonly secret: string }>> = {
    email: { text: 'contact player@example.test about the crash', secret: 'player@example.test' },
    jwt: { text: 'rejected eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature at boot', secret: 'eyJhbGciOiJIUzI1NiJ9' },
    'bearer-token': { text: 'Authorization: Bearer abc.def failed', secret: 'Bearer abc.def' },
    uuid: {
      text: 'prison 123e4567-e89b-12d3-a456-426614174000 failed',
      secret: '123e4567-e89b-12d3-a456-426614174000',
    },
    // A path a browser puts in a stack frame or a drag-and-drop error, and
    // deliberately not under /home or /Users: those belong to
    // `filesystem-path`, and a sample two entries match proves neither.
    'file-url': { text: 'loading file:///opt/lockstate/prison.sav failed', secret: 'file:///opt/lockstate/prison.sav' },
    'filesystem-path': { text: 'wrote /home/matt/prison.sav in 4ms', secret: '/home/matt/prison.sav' },
    'url-query': { text: 'GET https://lockstate.io/app?token=secret returned 401', secret: '?token=secret' },
  };

  it('has a sample for every entry in the value-redaction table, and none for an entry that is gone', () => {
    // The reachability shape used across tests/foundation/: enumerate the
    // table, do not transcribe it. A seventh entry with no sample is exactly
    // how `file-url` went unexercised.
    expect(Object.keys(REDACTION_SAMPLES).sort()).toEqual(SENSITIVE_VALUE_PATTERNS.map(({ reason }) => reason).sort());
  });

  it.each(SENSITIVE_VALUE_PATTERNS.map(({ reason }) => reason))('redacts a %s out of free text', (reason) => {
    const sample = REDACTION_SAMPLES[reason];
    if (sample === undefined) throw new Error(`no sample named ${reason}; the coverage test above says which`);

    const redacted = redactText(sample.text);
    expect(redacted, `${reason} survived redaction`).not.toContain(sample.secret);
    expect(redacted, `${reason} was dropped rather than redacted`).toContain(REDACTED);
    // The shape is kept: the surrounding words are still there to read.
    expect(redacted.length).toBeGreaterThan(REDACTED.length);
  });

  it.each(SENSITIVE_VALUE_PATTERNS.map(({ reason }) => reason))(
    'is the only entry that matches its own %s sample, so deleting that entry fails',
    (reason) => {
      // `String.prototype.match` restarts a global pattern from zero, so the
      // shared `lastIndex` on these RegExp objects cannot make this
      // order-dependent.
      const sample = REDACTION_SAMPLES[reason];
      if (sample === undefined) throw new Error(`no sample named ${reason}`);

      const matching = SENSITIVE_VALUE_PATTERNS.filter(({ pattern }) => sample.text.match(pattern) !== null).map(
        (entry) => entry.reason,
      );
      expect(matching, `the ${reason} sample must be redacted by the ${reason} entry alone`).toEqual([reason]);
    },
  );

  it('caps attribute count deterministically, independent of key order', () => {
    const many = Object.fromEntries(Array.from({ length: 40 }, (_unused, index) => [`k${index}`, index]));
    const forwards = redactAttributes(many);
    const backwards = redactAttributes(Object.fromEntries(Object.entries(many).reverse()));
    expect(Object.keys(forwards.attributes)).toHaveLength(24);
    expect(backwards.attributes).toEqual(forwards.attributes);
  });
});

describe('telemetry sampling', () => {
  it('is stable for a given session and event name', () => {
    expect(samplingScore('session-a', 'performance.tick-budget')).toBe(
      samplingScore('session-a', 'performance.tick-budget'),
    );
    expect(samplingScore('session-a', 'performance.tick-budget')).not.toBe(
      samplingScore('session-b', 'performance.tick-budget'),
    );
  });

  it('always samples at rate 1 and never at rate 0', () => {
    expect(shouldSample('session-a', 'diagnostic.unhandled-error', 1)).toBe(true);
    expect(shouldSample('session-a', 'diagnostic.unhandled-error', 0)).toBe(false);
  });

  it('either reports an event type for a whole session or not at all', () => {
    const decisions = Array.from({ length: 5 }, () => shouldSample('session-a', 'performance.tick-budget', 0.5));
    expect(new Set(decisions).size).toBe(1);
  });
});

describe('batching telemetry sink', () => {
  it('flushes once the batch is full and not before', async () => {
    const transport = new MemoryTelemetryTransport();
    const sink = new BatchingTelemetrySink(transport, { maxBatchSize: 2, flushIntervalMs: 60_000 });
    const { recorder } = buildRecorder({ consent: allConsent() });

    const first = recorder.record('diagnostic.unhandled-error', { area: 'renderer' }, NOW);
    expect(first.accepted).toBe(true);
    if (!first.accepted) return;

    sink.record(first.envelope, NOW);
    expect(sink.shouldFlush(NOW)).toBe(false);
    sink.record(first.envelope, NOW);
    expect(sink.shouldFlush(NOW)).toBe(true);

    await sink.pump(NOW);
    expect(transport.sentEvents()).toHaveLength(2);
    expect(sink.stats().queued).toBe(0);
  });

  it('drops the oldest events when the queue is full, and counts the drops', () => {
    const sink = new BatchingTelemetrySink(new MemoryTelemetryTransport(), { maxQueueLength: 2, maxBatchSize: 10 });
    const { recorder } = buildRecorder({ consent: allConsent() });
    const decision = recorder.record('diagnostic.unhandled-error', { area: 'renderer' }, NOW);
    if (!decision.accepted) throw new Error('fixture event was rejected');

    sink.record({ ...decision.envelope, eventId: 'a' }, NOW);
    sink.record({ ...decision.envelope, eventId: 'b' }, NOW);
    expect(sink.record({ ...decision.envelope, eventId: 'c' }, NOW)).toBe('queue-full');
    expect(sink.stats()).toMatchObject({ queued: 2, droppedQueueFull: 1 });
  });

  it('rate-limits within a window and recovers in the next one', () => {
    const sink = new BatchingTelemetrySink(new MemoryTelemetryTransport(), {
      rateLimit: { maxEvents: 1, windowMs: 1_000 },
    });
    const { recorder } = buildRecorder({ consent: allConsent() });
    const decision = recorder.record('diagnostic.unhandled-error', { area: 'renderer' }, NOW);
    if (!decision.accepted) throw new Error('fixture event was rejected');

    expect(sink.record(decision.envelope, NOW)).toBe('queued');
    expect(sink.record(decision.envelope, NOW + 10)).toBe('rate-limited');
    expect(sink.record(decision.envelope, NOW + 1_001)).toBe('queued');
    expect(sink.stats().droppedRateLimited).toBe(1);
  });

  it('never propagates a transport failure to the caller', async () => {
    const transport = new MemoryTelemetryTransport(() => true);
    const sink = new BatchingTelemetrySink(transport, { maxBatchSize: 1 });
    const { recorder } = buildRecorder({ consent: allConsent() });
    const decision = recorder.record('diagnostic.unhandled-error', { area: 'renderer' }, NOW);
    if (!decision.accepted) throw new Error('fixture event was rejected');

    sink.record(decision.envelope, NOW);
    await expect(sink.flush(NOW)).resolves.toBeUndefined();
    expect(sink.stats()).toMatchObject({ failedBatches: 1, sent: 0 });
  });
});

describe('telemetry recorder', () => {
  it('refuses an unregistered event name', () => {
    const { recorder } = buildRecorder({ consent: allConsent() });
    expect(recorder.record('diagnostic.something-new', {}, NOW)).toMatchObject({
      accepted: false,
      reason: 'unknown-event',
    });
  });

  it('stamps the release, session, consent version and applied sample rate', () => {
    const { recorder } = buildRecorder({ consent: allConsent() });
    const decision = recorder.record('diagnostic.save-decode-failed', { area: 'persistence' }, NOW);
    expect(decision.accepted).toBe(true);
    if (!decision.accepted) return;
    expect(decision.envelope).toMatchObject({
      release,
      sessionId: 'session-fixture',
      consentVersion: TELEMETRY_CONSENT_VERSION,
      sampleRate: 1,
      category: 'diagnostics',
    });
  });

  it('redacts attributes before they can reach the sink', () => {
    const { recorder } = buildRecorder({ consent: allConsent() });
    const decision = recorder.record(
      'diagnostic.unhandled-error',
      { area: 'worker', authToken: 'super-secret' },
      NOW,
    );
    expect(decision.accepted).toBe(true);
    if (!decision.accepted) return;
    expect(Object.keys(decision.envelope.attributes)).not.toContain('authToken');
  });

  it('does not record a sampled-out event at all', () => {
    const transport = new MemoryTelemetryTransport();
    const sink = new BatchingTelemetrySink(transport, { maxBatchSize: 1 });
    const recorder = new TelemetryRecorder({
      sink,
      release,
      sessionId: 'session-fixture',
      newEventId: () => 'event-1',
      consent: allConsent(),
      sampleRateOverrides: { 'performance.tick-budget': 0 },
    });
    expect(recorder.record('performance.tick-budget', { tickMs: 12 }, NOW)).toMatchObject({
      accepted: false,
      reason: 'not-sampled',
    });
    expect(sink.stats().queued).toBe(0);
  });
});

describe('crash diagnostics', () => {
  it('reduces stack frames to function and bundle basename only', () => {
    const stack = [
      'Error: boom',
      '    at tickWorld (https://lockstate.io/assets/index-abc123.js?v=2:1024:17)',
      '    at run (/home/matt/lockstate/src/main.ts:10:3)',
    ].join('\n');

    const frames = reduceStack(stack);
    expect(frames).toHaveLength(2);
    expect(frames[0]).toBe('tickWorld(index-abc123.js:1024:17)');
    expect(frames.join(' ')).not.toContain('/home/matt');
    expect(frames.join(' ')).not.toContain('lockstate.io');
  });

  it('cuts a deep stack to a bounded number of frames, and reports the bound it applied', () => {
    /*
     * Issue #264 S14: `MAX_STACK_FRAMES` could be raised from 12 to 100,000
     * with the whole suite green. The bound is not a privacy control -- the
     * joined `frames` string is truncated by `redactText` either way -- it is a
     * work bound and an attribute bound. A crash handler is the worst place to
     * run unbounded work: a stack-overflow crash arrives with tens of thousands
     * of frames, each of which costs a regex reduction plus a redaction pass,
     * and `frameCount` then reports the recursion depth as a number nothing
     * bounds.
     *
     * `DEEP_STACK_FRAMES` is a literal and must stay one. Deriving it from
     * `MAX_STACK_FRAMES` -- the obvious-looking `MAX_STACK_FRAMES + 5` -- makes
     * every assertion here true for *any* bound, which is the unfalsifiable
     * shape this whole issue is about: at a bound of 100,000 the fixture would
     * simply grow to 100,005 frames and the cut would still be "the bound".
     */
    const DEEP_STACK_FRAMES = 200;
    expect(MAX_STACK_FRAMES, 'the fixture must be deeper than the bound it is testing').toBeLessThan(
      DEEP_STACK_FRAMES,
    );

    const stack = [
      'RangeError: Maximum call stack size exceeded',
      ...Array.from(
        { length: DEEP_STACK_FRAMES },
        (_unused, index) => `    at recurse (https://lockstate.io/assets/index-abc123.js:${index + 1}:7)`,
      ),
    ].join('\n');

    expect(reduceStack(stack)).toHaveLength(MAX_STACK_FRAMES);

    const attributes = buildCrashDiagnosticAttributes(
      { name: 'RangeError', message: 'Maximum call stack size exceeded', stack },
      { area: 'renderer' },
    );
    expect(attributes.frameCount).toBe(MAX_STACK_FRAMES);
    // And the attribute that carries them stays inside what the envelope
    // schema accepts, so a deep stack is never the reason an event is dropped.
    expect(String(attributes.frames).length).toBeLessThanOrEqual(MAX_TELEMETRY_STRING_LENGTH);
  });

  it('builds diagnostic attributes without a save payload or account identity', () => {
    const error = captureError(new Error('failed to decode save for player@example.test'));
    const attributes = buildCrashDiagnosticAttributes(error, { area: 'persistence', detail: 'saveSchemaVersion=1' });

    expect(attributes.area).toBe('persistence');
    expect(String(attributes.errorMessage)).toContain(REDACTED);
    expect(String(attributes.errorMessage)).not.toContain('player@example.test');
    expect(Object.keys(attributes)).not.toContain('accountId');
    expect(Object.keys(attributes)).not.toContain('payload');
  });

  it('normalizes a non-error throw without inventing detail', () => {
    expect(captureError({ weird: true })).toEqual({ name: 'Error', message: 'Non-error value thrown.' });
  });

  it('generates opaque session ids from an injected source, not from the account', () => {
    const values = [0.1, 0.2];
    let index = 0;
    const id = createTelemetrySessionId(() => values[index++ % values.length]!);
    expect(id).toMatch(/^s[0-9a-f]{16}$/);
    expect(id).not.toContain('account');
  });
});
