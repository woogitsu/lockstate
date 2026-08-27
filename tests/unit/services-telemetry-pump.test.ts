import { describe, expect, it } from 'vitest';
import { DEFAULT_FLUSH_INTERVAL_MS } from '../../src/services/telemetry/sink';
import {
  type CancelScheduledPump,
  type TelemetryPumpTarget,
  DEFAULT_TELEMETRY_PUMP_INTERVAL_MS,
  startTelemetryPump,
} from '../../src/services/telemetry/pump';

/**
 * The host pump `BatchingTelemetrySink` was written to expect and nothing
 * supplied.
 *
 * `sink.ts` has been timer-free since it was written -- "the host calls
 * `pump(now)` from its own idle or interval orchestration" -- and no host
 * existed, so no flush ever happened. These are the loop's rules, driven
 * through a scheduler this file controls rather than through fake timers,
 * which is also why the sink was made timer-free in the first place.
 */

/** A scheduler whose pending callback this test runs by hand. */
function manualScheduler() {
  let pending: (() => void) | undefined;
  let delays: number[] = [];
  let cancels = 0;

  const schedule = (run: () => void, delayMs: number): CancelScheduledPump => {
    pending = run;
    delays = [...delays, delayMs];
    return () => {
      cancels += 1;
      pending = undefined;
    };
  };

  return {
    schedule,
    get delays(): readonly number[] {
      return delays;
    },
    get cancels(): number {
      return cancels;
    },
    isArmed(): boolean {
      return pending !== undefined;
    },
    /** Fires the pending tick. Returns false when nothing was armed. */
    fire(): boolean {
      const run = pending;
      if (run === undefined) return false;
      pending = undefined;
      run();
      return true;
    },
  };
}

/**
 * Drains the microtask queue.
 *
 * The loop is `await pump(); arm();` and the target awaits internally, so the
 * re-arm is several microtasks past the call. A fixed number of
 * `await Promise.resolve()` would be a count tuned to today's `await` depth;
 * this drains until nothing is left to drain and stays correct if either side
 * gains an `await`.
 */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
}

function recordingTarget(behaviour: (call: number) => Promise<void> = async () => {}): TelemetryPumpTarget & {
  readonly calls: readonly number[];
} {
  const calls: number[] = [];
  return {
    calls,
    async pump(now: number): Promise<void> {
      calls.push(now);
      await behaviour(calls.length);
    },
  };
}

describe('the telemetry pump', () => {
  it('arms itself immediately rather than waiting for a first event', () => {
    const scheduler = manualScheduler();
    startTelemetryPump({ target: recordingTarget(), schedule: scheduler.schedule, now: () => 1 });

    expect(scheduler.isArmed(), 'nothing was scheduled, so no flush would ever happen').toBe(true);
    expect(scheduler.delays).toEqual([DEFAULT_TELEMETRY_PUMP_INTERVAL_MS]);
  });

  it('pumps with the host clock, and re-arms after each pump settles', async () => {
    const scheduler = manualScheduler();
    let clock = 1_000;
    const target = recordingTarget();
    startTelemetryPump({ target, schedule: scheduler.schedule, now: () => clock });

    scheduler.fire();
    await settle();
    expect(target.calls).toEqual([1_000]);

    clock = 2_000;
    expect(scheduler.isArmed(), 'the loop stopped after one tick').toBe(true);
    scheduler.fire();
    await settle();
    expect(target.calls).toEqual([1_000, 2_000]);
  });

  it('never runs two pumps at once', async () => {
    // `BatchingTelemetrySink.flush` returns the in-flight promise while one is
    // outstanding, so an overlapping pump would spin instead of sending. The
    // next tick is armed only once the previous one has settled.
    const scheduler = manualScheduler();
    let release: (() => void) | undefined;
    const target = recordingTarget(
      async () =>
        await new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    startTelemetryPump({ target, schedule: scheduler.schedule, now: () => 1 });

    scheduler.fire();
    await settle();
    expect(target.calls).toHaveLength(1);
    expect(scheduler.isArmed(), 'a second tick was armed while the first pump was still running').toBe(false);

    release?.();
    await settle();
    expect(scheduler.isArmed()).toBe(true);
  });

  it('keeps pumping after a pump rejects', async () => {
    // Losing a diagnostic must not break the thing it was diagnosing, and that
    // has to hold for the loop as well as for `record()`.
    const scheduler = manualScheduler();
    const target = recordingTarget(async (call) => {
      if (call === 1) throw new Error('transport exploded');
    });
    startTelemetryPump({ target, schedule: scheduler.schedule, now: () => 1 });

    scheduler.fire();
    await settle();
    expect(scheduler.isArmed(), 'one rejected pump stopped the loop forever').toBe(true);

    scheduler.fire();
    await settle();
    expect(target.calls).toHaveLength(2);
  });

  it('stops, cancels the pending tick, and stays stopped', async () => {
    const scheduler = manualScheduler();
    const target = recordingTarget();
    const handle = startTelemetryPump({ target, schedule: scheduler.schedule, now: () => 1 });

    handle.stop();
    expect(scheduler.cancels).toBe(1);
    expect(scheduler.fire(), 'a cancelled tick was still runnable').toBe(false);
    expect(target.calls).toEqual([]);
  });

  it('does not re-arm when it is stopped from inside a running pump', async () => {
    // The window a naive `stopped` flag misses: `stop()` between the pump
    // starting and its promise settling. The re-arm happens after the await,
    // so the flag has to be re-read there.
    const scheduler = manualScheduler();
    let handleStop: (() => void) | undefined;
    const target = recordingTarget(async () => {
      handleStop?.();
    });
    const handle = startTelemetryPump({ target, schedule: scheduler.schedule, now: () => 1 });
    handleStop = () => handle.stop();

    scheduler.fire();
    await settle();
    expect(scheduler.isArmed(), 'the loop re-armed after being stopped mid-pump').toBe(false);
  });

  it('takes its interval from the caller', () => {
    const scheduler = manualScheduler();
    startTelemetryPump({ target: recordingTarget(), schedule: scheduler.schedule, now: () => 1, intervalMs: 250 });
    expect(scheduler.delays).toEqual([250]);
  });

  it('looks more often than the sink\'s own default flush interval', () => {
    // Not a comparison of a constant with itself: the sink's default is
    // imported from the module that owns it. A poll slower than the flush
    // interval would hold a due batch for a whole extra period.
    expect(DEFAULT_TELEMETRY_PUMP_INTERVAL_MS).toBeLessThan(DEFAULT_FLUSH_INTERVAL_MS);
  });
});
