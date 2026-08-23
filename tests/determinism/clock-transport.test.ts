import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deterministicStateHash } from '../../src/simulation/determinism/canonical';
import { SIMULATION_PROTOCOL_VERSION, type MainToWorkerMessage } from '../../src/simulation/protocol/types';
import { captureSessionSnapshot, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { SimulationWorkerStateMachine, type MessagePortLike } from '../../src/simulation/worker/state-machine';
import { buildDeterminismScenario, SCENARIO_SEED, submitScenarioCommands } from '../helpers/determinism-scenario';
import { toJsonValue } from '../helpers/determinism-state';

/**
 * The transport controls change *when* ticks happen and never *what* a tick
 * computes.
 *
 * ADR 0009 makes deterministic replay a product guarantee: a seed plus a
 * command stream *is* the run. Pausing, resuming and changing speed are
 * player actions that reach the same worker that owns the kernel, so they are
 * the obvious way for that guarantee to be broken -- by a paused clock
 * banking real time and spending it as extra ticks, by a speed multiplier
 * reaching a system's arithmetic, or by the clock-state publication reading
 * something it should not.
 *
 * So this drives the *real* `SimulationWorkerStateMachine` -- the thing the
 * worker runs -- twice from one snapshot: once straight through, once
 * stopped and restarted at three different speeds, and compares the sessions
 * at the same tick. `session-replay.test.ts` proves the kernel is
 * deterministic; this proves the transport layer above it cannot disturb
 * that.
 *
 * Both runs are driven from an injected clock, never from wall time, so the
 * comparison is between two runs that reached the same tick and not between
 * two runs that ran for the same number of milliseconds.
 */

class RecordingPort implements MessagePortLike {
  public readonly messages: any[] = [];
  public postMessage(message: any): void {
    this.messages.push(message);
  }

  public last(kind: string): any {
    for (let index = this.messages.length - 1; index >= 0; index -= 1) {
      if (this.messages[index].kind === kind) return this.messages[index];
    }
    return undefined;
  }
}

type Speed = 1 | 2 | 4;

/**
 * One worker, driven tick by tick.
 *
 * `advance` moves the injected clock by exactly one `FixedStepClock` step
 * divided by the current speed, then fires one wake of the tick loop. That
 * makes each wake execute exactly one tick at every speed, which is what
 * lets two runs land on the *same tick* rather than merely on similar ones.
 */
class WorkerHarness {
  public readonly port = new RecordingPort();
  private readonly machine: SimulationWorkerStateMachine;
  private nowMs = 0;
  private speed: Speed = 1;

  public constructor(snapshot: SessionSnapshotBundle) {
    this.machine = new SimulationWorkerStateMachine(this.port, 'determinism-build', () => this.nowMs);
    this.send({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'init',
      kind: 'simulation/initialize',
      payload: {
        sessionId: 'session-determinism',
        source: {
          kind: 'snapshot',
          snapshot: {
            transport: 'structured-clone',
            schemaId: 'simulation-save-payload',
            schemaVersion: 3,
            data: snapshot as unknown as null,
          },
        },
      },
    });
    if (this.port.last('protocol/error') !== undefined) {
      throw new Error(`The worker refused the scenario snapshot: ${this.port.last('protocol/error').payload.message}`);
    }
  }

  private send(message: MainToWorkerMessage): void {
    this.machine.handleMessage(message);
  }

  public run(speed: Speed): void {
    this.speed = speed;
    this.send({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: `set-clock-run-${String(this.nowMs)}`,
      kind: 'simulation/set-clock',
      payload: { mode: 'running', speed },
    });
  }

  public pause(): void {
    this.send({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: `set-clock-pause-${String(this.nowMs)}`,
      kind: 'simulation/set-clock',
      payload: { mode: 'paused' },
    });
  }

  /** Fires `wakes` tick-loop wakes, each carrying exactly one step of simulated time. */
  public advance(wakes: number): void {
    for (let wake = 0; wake < wakes; wake += 1) {
      this.nowMs += 50 / this.speed;
      vi.advanceTimersByTime(15);
    }
  }

  /** Lets real time pass without the clock being told to run. */
  public idle(milliseconds: number): void {
    this.nowMs += milliseconds;
    vi.advanceTimersByTime(15);
  }

  public snapshot(): SessionSnapshotBundle {
    this.send({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: `snapshot-${String(this.nowMs)}`,
      kind: 'simulation/request-snapshot',
      payload: { reason: 'consistency-check' },
    });
    const reply = this.port.last('simulation/snapshot');
    if (reply === undefined) throw new Error('The worker returned no snapshot.');
    return reply.payload.snapshot.data as SessionSnapshotBundle;
  }

  public get tick(): number {
    return this.snapshot().kernel.tick;
  }
}

function hashOf(bundle: SessionSnapshotBundle): string {
  return deterministicStateHash(toJsonValue(bundle));
}

/** The rich scenario every other determinism test uses, frozen at tick 0 with its command stream queued. */
function scenarioSnapshot(masterSeed: number = SCENARIO_SEED): SessionSnapshotBundle {
  const runtime = buildDeterminismScenario(masterSeed);
  submitScenarioCommands(runtime);
  return captureSessionSnapshot(runtime);
}

const TICKS = 60;

describe('pausing, resuming and changing speed cannot change the simulation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reaches a byte-identical session after an interrupted run and an uninterrupted one', () => {
    const start = scenarioSnapshot();

    const straight = new WorkerHarness(start);
    straight.run(1);
    straight.advance(TICKS);
    straight.pause();

    const interrupted = new WorkerHarness(start);
    interrupted.run(1);
    interrupted.advance(10);
    interrupted.pause();
    interrupted.idle(5_000); // Five seconds of real time with the clock stopped.
    interrupted.run(4);
    interrupted.advance(20);
    interrupted.pause();
    interrupted.idle(400);
    interrupted.run(2);
    interrupted.advance(20);
    interrupted.pause();
    interrupted.run(1);
    interrupted.advance(10);
    interrupted.pause();

    const straightEnd = straight.snapshot();
    const interruptedEnd = interrupted.snapshot();

    // The two runs are being compared at the same tick. Without this the
    // equality below could pass by comparing two runs that both stopped
    // early in the same place.
    expect(straightEnd.kernel.tick).toBe(TICKS);
    expect(interruptedEnd.kernel.tick).toBe(TICKS);

    expect(hashOf(interruptedEnd)).toBe(hashOf(straightEnd));
    expect(interruptedEnd).toEqual(straightEnd);
  });

  it('runs the same ticks at x4 as at x1, only sooner', () => {
    const start = scenarioSnapshot();

    const slow = new WorkerHarness(start);
    slow.run(1);
    slow.advance(TICKS);

    const fast = new WorkerHarness(start);
    fast.run(4);
    fast.advance(TICKS);

    const slowEnd = slow.snapshot();
    const fastEnd = fast.snapshot();

    expect(fastEnd.kernel.tick).toBe(TICKS);
    expect(hashOf(fastEnd)).toBe(hashOf(slowEnd));
    // The speed multiplier is a divisor on wall time and nothing else: x4
    // covered the same 60 ticks in a quarter of the simulated milliseconds.
    expect(fast['nowMs']).toBe(slow['nowMs'] / 4);
  });

  it('executes no tick at all while the clock is paused, however long it is paused for', () => {
    const paused = new WorkerHarness(scenarioSnapshot());
    paused.run(1);
    paused.advance(20);
    const atPause = paused.snapshot();

    paused.pause();
    paused.idle(60_000); // A minute of wall time.
    paused.advance(50); // And fifty tick-loop wakes that must do nothing.

    expect(paused.snapshot()).toEqual(atPause);

    // Resuming must not then spend the paused minute as a burst of ticks:
    // that would be the same run producing a different tick count from the
    // same input, which is what a replay verifier would see as a divergence.
    paused.run(1);
    paused.advance(10);
    expect(paused.snapshot().kernel.tick).toBe(30);
  });

  /**
   * The guard against every assertion above passing vacuously. A hash that
   * did not move with the simulation would make "the two runs agree"
   * meaningless.
   */
  it('is comparing a session that actually advanced, on a hash that actually moves', () => {
    const start = scenarioSnapshot();
    const harness = new WorkerHarness(start);

    expect(hashOf(harness.snapshot())).toBe(hashOf(start));

    harness.run(1);
    harness.advance(TICKS);
    const end = harness.snapshot();

    expect(hashOf(end)).not.toBe(hashOf(start));
    expect(end.kernel.tick).toBe(TICKS);
    // Real work happened: the queued build orders were applied, so the
    // scenario is not sixty ticks of an empty runtime.
    expect(end.construction.orders.length).toBeGreaterThan(0);
    expect(end.kernel.commands.length).toBeLessThan(start.kernel.commands.length);

    // And the hash is seed-sensitive, so agreement between two runs is a
    // statement about the simulation rather than about a constant.
    const otherSeed = new WorkerHarness(scenarioSnapshot(SCENARIO_SEED + 1));
    otherSeed.run(1);
    otherSeed.advance(TICKS);
    expect(hashOf(otherSeed.snapshot())).not.toBe(hashOf(end));
  });
});
