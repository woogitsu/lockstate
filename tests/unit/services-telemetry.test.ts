import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from '../../src/shared/key-value-store';
import {
  BatchingTelemetrySink,
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
