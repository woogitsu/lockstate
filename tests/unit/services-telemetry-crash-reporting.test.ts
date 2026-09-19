import { describe, expect, it } from 'vitest';
import {
  BatchingTelemetrySink,
  DEFAULT_MAX_CRASH_REPORTS,
  MemoryTelemetryTransport,
  TelemetryConsentGate,
  TelemetryRecorder,
  UNHANDLED_ERROR_EVENT,
  WORKER_TERMINATED_EVENT,
  consentGatedTelemetryAdmission,
  createCrashReporter,
  createTelemetryConsent,
  defaultTelemetryEventRegistry,
  type CrashReportRecorder,
  type ReleaseIdentity,
  type TelemetryRecordDecision,
} from '../../src/services/telemetry';

const NOW = 1_700_000_000_000;
const release: ReleaseIdentity = { buildVersion: 'lockstate-0.1.0', environment: 'production' };

/**
 * The arrangement `createTelemetryPipeline` builds: one `TelemetryConsentGate`
 * read by both the recorder and the sink's admission gate, so the two cannot
 * disagree about what the player allowed.
 */
function buildPipeline(gate: TelemetryConsentGate) {
  const transport = new MemoryTelemetryTransport();
  const sink = new BatchingTelemetrySink(transport, consentGatedTelemetryAdmission({ consent: gate }), {});
  const recorder = new TelemetryRecorder({
    sink,
    release,
    sessionId: 's0000000100000002',
    newEventId: (() => {
      let counter = 0;
      return () => `s0000000100000002-${(counter += 1)}`;
    })(),
    consent: gate,
  });
  return { transport, sink, recorder };
}

function diagnosticsConsent() {
  return createTelemetryConsent(NOW, { diagnostics: true, performance: false, gameplay: false });
}

describe('the crash reporter emits only events the registry declares', () => {
  it.each([UNHANDLED_ERROR_EVENT, WORKER_TERMINATED_EVENT])('emits %s, which the registry carries as a diagnostic', (name) => {
    // The producer names a string; the registry is separate data that decides
    // whether that string may be sent at all. A name this module invented
    // would be refused by the recorder ("unknown-event") and again by the
    // sink's admission gate, so the failure would be silent loss rather than
    // a type error -- which is why it is asserted here.
    const definition = defaultTelemetryEventRegistry.get(name);
    expect(definition, `${name} is not a registered telemetry event`).toBeDefined();
    expect(definition?.category).toBe('diagnostics');
  });
});

describe('consent still refuses a produced event', () => {
  it('records nothing at all while no decision is on record', () => {
    const gate = new TelemetryConsentGate();
    const { transport, sink, recorder } = buildPipeline(gate);
    const reporter = createCrashReporter({ recorder, now: () => NOW });

    reporter.reportUnhandledError(new Error('boom'), 'page-error');
    reporter.reportWorkerLoss('boot', new Error('Worker construction blocked.'));

    expect(reporter.stats().attempted).toBe(2);
    expect(reporter.stats().recorded).toBe(0);
    expect(sink.stats().queued).toBe(0);
    expect(transport.sentEvents()).toEqual([]);
  });

  it('records nothing for a player who allowed the other two categories', () => {
    const gate = new TelemetryConsentGate(
      createTelemetryConsent(NOW, { diagnostics: false, performance: true, gameplay: true }),
    );
    const { sink, recorder } = buildPipeline(gate);
    const reporter = createCrashReporter({ recorder, now: () => NOW });

    reporter.reportUnhandledError(new Error('boom'), 'page-rejection');

    expect(reporter.stats().recorded).toBe(0);
    expect(sink.stats().queued).toBe(0);
  });

  it('stops on withdrawal, on the very next report', () => {
    const gate = new TelemetryConsentGate(diagnosticsConsent());
    const { sink, recorder } = buildPipeline(gate);
    const reporter = createCrashReporter({ recorder, now: () => NOW });

    reporter.reportUnhandledError(new Error('first'), 'page-error');
    expect(sink.stats().queued).toBe(1);

    gate.set(undefined);
    reporter.reportUnhandledError(new Error('second'), 'page-error');
    expect(sink.stats().queued).toBe(1);
  });
});

describe('what a produced event carries', () => {
  it('passes the sink admission gate rather than being refused by it', async () => {
    const gate = new TelemetryConsentGate(diagnosticsConsent());
    const { transport, sink, recorder } = buildPipeline(gate);
    const reporter = createCrashReporter({ recorder, now: () => NOW });

    reporter.reportUnhandledError(new Error('boom'), 'page-error');
    reporter.reportWorkerLoss('session');
    await sink.flush(NOW);

    // `refused` is non-zero only when something reached the queue without the
    // recorder's checks -- which is exactly what a producer building a payload
    // the gate cannot admit would look like.
    expect(sink.stats().refused).toBe(0);
    expect(transport.sentEvents().map((envelope) => envelope.name)).toEqual([
      UNHANDLED_ERROR_EVENT,
      WORKER_TERMINATED_EVENT,
    ]);
    expect(transport.sentEvents().map((envelope) => envelope.category)).toEqual(['diagnostics', 'diagnostics']);
  });

  it('puts no free text in a worker-loss report, even when the thrown error is full of it', async () => {
    const gate = new TelemetryConsentGate(diagnosticsConsent());
    const { transport, sink, recorder } = buildPipeline(gate);
    const reporter = createCrashReporter({ recorder, now: () => NOW });

    // Everything redaction is known not to catch (ADR 0046): a prison name a
    // player chose, an actor name, an IP address. If any of it can reach an
    // attribute, this producer is the wrong shape -- redaction will not save it.
    const error = new TypeError('Blackgate Penitentiary: Warden Okonjo at 203.0.113.42 lost the worker');
    reporter.reportWorkerLoss('boot', error);
    await sink.flush(NOW);

    const sent = transport.sentEvents()[0];
    expect(sent).toBeDefined();
    expect(Object.keys(sent?.attributes ?? {}).sort()).toEqual(['area', 'errorName', 'phase']);
    expect(sent?.attributes).toEqual({ area: 'simulation-worker', phase: 'boot', errorName: 'TypeError' });
    for (const fragment of ['Blackgate', 'Okonjo', '203.0.113.42']) {
      expect(JSON.stringify(sent?.attributes)).not.toContain(fragment);
    }
  });

  it('claims no error class for a loss that carried no thrown value', async () => {
    const gate = new TelemetryConsentGate(diagnosticsConsent());
    const { transport, sink, recorder } = buildPipeline(gate);
    const reporter = createCrashReporter({ recorder, now: () => NOW });

    reporter.reportWorkerLoss('session');
    await sink.flush(NOW);

    // `captureError` maps every non-Error to `name: 'Error'`, so a producer
    // that always captured would report an error class that never existed.
    expect(transport.sentEvents()[0]?.attributes).toEqual({ area: 'simulation-worker', phase: 'session' });
  });

  it('reduces an unhandled error to a name, a redacted message, an area and bundle-relative frames', async () => {
    const gate = new TelemetryConsentGate(diagnosticsConsent());
    const { transport, sink, recorder } = buildPipeline(gate);
    const reporter = createCrashReporter({ recorder, now: () => NOW });

    const error = new RangeError('mail alice@example.com');
    error.stack = 'RangeError: mail alice@example.com\n    at boot (https://lockstate.io/assets/main-a1b2.js:12:9)';
    reporter.reportUnhandledError(error, 'page-rejection');
    await sink.flush(NOW);

    const attributes = transport.sentEvents()[0]?.attributes;
    expect(attributes?.errorName).toBe('RangeError');
    expect(attributes?.area).toBe('page-rejection');
    expect(attributes?.errorMessage).toBe('mail [redacted]');
    expect(attributes?.frames).toBe('boot(main-a1b2.js:12:9)');
  });

  it('reports a rejected non-error value without inventing one', async () => {
    const gate = new TelemetryConsentGate(diagnosticsConsent());
    const { transport, sink, recorder } = buildPipeline(gate);
    const reporter = createCrashReporter({ recorder, now: () => NOW });

    reporter.reportUnhandledError({ reason: 'nope' }, 'page-rejection');
    await sink.flush(NOW);

    expect(transport.sentEvents()[0]?.attributes.errorMessage).toBe('Non-error value thrown.');
  });
});

/**
 * A recorder that misbehaves in the three ways that matter. Nothing here is a
 * stand-in for `TelemetryRecorder`: these are the failures a real one could
 * have, driven deliberately.
 */
class HostileRecorder implements CrashReportRecorder {
  public calls = 0;

  public constructor(private readonly onCall: (recorder: HostileRecorder) => void) {}

  public record(): TelemetryRecordDecision {
    this.calls += 1;
    this.onCall(this);
    return { accepted: false, reason: 'unknown-event' };
  }

  public recordError(): TelemetryRecordDecision {
    return this.record();
  }
}

describe('a reporter that cannot make things worse', () => {
  it('swallows a recorder that throws instead of throwing out of the handler', () => {
    const recorder = new HostileRecorder(() => {
      throw new Error('the reporting path is what failed');
    });
    const reporter = createCrashReporter({ recorder, now: () => NOW });

    expect(() => reporter.reportUnhandledError(new Error('boom'), 'page-error')).not.toThrow();
    expect(reporter.stats().threw).toBe(1);
    expect(reporter.stats().recorded).toBe(0);
  });

  it('swallows a clock that throws, which is as injected as the recorder is', () => {
    const recorder = new HostileRecorder(() => undefined);
    const reporter = createCrashReporter({
      recorder,
      now: () => {
        throw new Error('no clock');
      },
    });

    expect(() => reporter.reportWorkerLoss('boot')).not.toThrow();
    expect(reporter.stats().threw).toBe(1);
    expect(recorder.calls).toBe(0);
  });

  it('does not recurse when the failure comes back through the same handler', () => {
    // The shape that matters: the recorder fails, and that failure reaches the
    // page's error handler, which calls the reporter again from inside the
    // call that is already running.
    let reporter: ReturnType<typeof createCrashReporter> | undefined;
    const recorder = new HostileRecorder(() => {
      reporter?.reportUnhandledError(new Error('reporting failed'), 'page-error');
    });
    reporter = createCrashReporter({ recorder, now: () => NOW });

    reporter.reportUnhandledError(new Error('boom'), 'page-error');

    expect(recorder.calls).toBe(1);
    expect(reporter.stats().attempted).toBe(1);
    expect(reporter.stats().suppressedReentrant).toBe(1);
  });

  it('stops building reports once the page-load budget is spent', () => {
    const recorder = new HostileRecorder(() => undefined);
    const reporter = createCrashReporter({ recorder, now: () => NOW, maxReports: 3 });

    for (let index = 0; index < 5; index += 1) reporter.reportUnhandledError(new Error(`boom ${index}`), 'page-error');

    expect(recorder.calls).toBe(3);
    expect(reporter.stats().attempted).toBe(3);
    expect(reporter.stats().suppressedOverBudget).toBe(2);
  });

  it('defaults the budget below the sink bounds an error storm would otherwise reach', () => {
    // Not a restatement of the constant: the point is the relationship. A
    // default above the token bucket's 60-per-minute or the queue's 200 would
    // let a storm start evicting the earliest report, which is the one most
    // likely to name the original cause.
    expect(DEFAULT_MAX_CRASH_REPORTS).toBeLessThan(60);
    const recorder = new HostileRecorder(() => undefined);
    const reporter = createCrashReporter({ recorder, now: () => NOW });
    for (let index = 0; index < DEFAULT_MAX_CRASH_REPORTS + 5; index += 1) {
      reporter.reportUnhandledError(new Error('boom'), 'page-error');
    }
    expect(recorder.calls).toBe(DEFAULT_MAX_CRASH_REPORTS);
  });
});
