import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deterministicStateHash } from '../../src/simulation/determinism/canonical';
import { SIMULATION_PROTOCOL_VERSION, type MainToWorkerMessage } from '../../src/simulation/protocol/types';
import {
  captureSessionSnapshot,
  restoreSimulationRuntime,
  SESSION_SNAPSHOT_SCHEMA_ID,
  SESSION_SNAPSHOT_SCHEMA_VERSION,
  type SessionSnapshotBundle,
} from '../../src/simulation/runtime/restore-session';
import { SimulationWorkerStateMachine, type MessagePortLike } from '../../src/simulation/worker/state-machine';
import { buildDeterminismScenario, SCENARIO_SEED, submitScenarioCommands } from '../helpers/determinism-scenario';
import { toJsonValue } from '../helpers/determinism-state';
import { readRenderActorsPayload } from '../helpers/render-actors-reader';

/**
 * Publishing a render delta is a **read**.
 *
 * The third member of the family, after
 * `status-counts-publication.test.ts` and `projection-request.test.ts`, and
 * ADR 0040 names it as the executable form its determinism section has to take.
 * ADR 0009 makes deterministic replay a product guarantee: a seed plus a
 * command stream *is* the run. This channel is a new thing that happens inside
 * the worker that owns the kernel, on a wall-clock timer, up to ten times a
 * second, and it reaches into the entity store's liveness ledger and the
 * prisoner position SoA to do its work. If any of that walked state
 * destructively -- an accessor that advanced a generation, a lazily rebuilt
 * index that is not equivalent -- then the mere act of *showing the player
 * where their prisoners are* would change the simulation, and it would do so
 * only in the running app and never in a headless replay.
 *
 * So this compares the same sixty ticks run two ways: through the real
 * `SimulationWorkerStateMachine` **with the channel publishing on every wake**,
 * and straight through the kernel with no worker and no publication at all. The
 * sessions must be byte-identical.
 *
 * "On every wake" is arranged rather than hoped for: the harness advances 100 ms
 * of wall clock per wake, which is exactly the channel's ceiling, so no wake is
 * suppressed by the cadence and each publishes. That is far more traffic than
 * the shipped app generates at 1x, and deliberately so -- if a single one of
 * these reads mutated anything, thirty publications over sixty ticks is enough
 * for the divergence to be unmissable.
 *
 * The second half of ADR 0040's determinism section -- that no main-thread
 * module can cause a publication, because the channel takes no request -- is
 * `tests/unit/worker-render-delta.test.ts`, which drives every kind in
 * `MAIN_TO_WORKER_MESSAGE_KINDS` at a paused worker and asserts silence.
 */

class RecordingPort implements MessagePortLike {
  public readonly messages: any[] = [];
  public postMessage(message: any): void {
    this.messages.push(message);
  }
}

function scenarioSnapshot(): SessionSnapshotBundle {
  const runtime = buildDeterminismScenario(SCENARIO_SEED);
  submitScenarioCommands(runtime);
  return captureSessionSnapshot(runtime);
}

function hashOf(bundle: SessionSnapshotBundle): string {
  return deterministicStateHash(toJsonValue(bundle));
}

/** The scenario, stepped by the kernel alone: no worker, no clock, no publication. */
function withoutWorker(start: SessionSnapshotBundle, ticks: number): SessionSnapshotBundle {
  const runtime = restoreSimulationRuntime(start).runtime;
  for (let tick = 0; tick < ticks; tick += 1) runtime.kernel.step();
  return captureSessionSnapshot(runtime);
}

/** Exactly the channel's ceiling, so every wake publishes and none is suppressed by the cadence. */
const MILLISECONDS_PER_WAKE = 100;

/** The clock's fixed step is 50 ms, so a 100 ms wake runs two ticks. */
const TICKS_PER_WAKE = 2;

const TICKS = 60;
const WAKES = TICKS / TICKS_PER_WAKE;

class WorkerHarness {
  public readonly port = new RecordingPort();
  private readonly machine: SimulationWorkerStateMachine;
  private nowMs = 0;

  public constructor(snapshot: SessionSnapshotBundle) {
    this.machine = new SimulationWorkerStateMachine(this.port, 'render-delta-determinism', () => this.nowMs);
    this.send({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'init',
      kind: 'simulation/initialize',
      payload: {
        sessionId: 'session-render-delta-determinism',
        source: {
          kind: 'snapshot',
          snapshot: {
            transport: 'structured-clone',
            schemaId: SESSION_SNAPSHOT_SCHEMA_ID,
            schemaVersion: SESSION_SNAPSHOT_SCHEMA_VERSION,
            data: snapshot as unknown as null,
          },
        },
      },
    });
    const fault = this.port.messages.find((message) => message.kind === 'protocol/error');
    if (fault !== undefined) throw new Error(`The worker refused the scenario snapshot: ${String(fault.payload.message)}`);
  }

  private send(message: MainToWorkerMessage): void {
    this.machine.handleMessage(message);
  }

  public run(): void {
    this.send({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'run',
      kind: 'simulation/set-clock',
      payload: { mode: 'running', speed: 1 },
    });
  }

  public advance(wakes: number): void {
    for (let wake = 0; wake < wakes; wake += 1) {
      this.nowMs += MILLISECONDS_PER_WAKE;
      vi.advanceTimersByTime(15);
    }
  }

  public snapshot(): SessionSnapshotBundle {
    this.send({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: `snapshot-${String(this.nowMs)}`,
      kind: 'simulation/request-snapshot',
      payload: { reason: 'consistency-check' },
    });
    const reply = [...this.port.messages].reverse().find((message) => message.kind === 'simulation/snapshot');
    if (reply === undefined) throw new Error('The worker returned no snapshot.');
    return reply.payload.snapshot.data as SessionSnapshotBundle;
  }

  public publications(): readonly any[] {
    return this.port.messages.filter((message) => message.kind === 'simulation/delta');
  }
}

describe('publishing a render delta cannot change the simulation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reaches a byte-identical session to the same ticks run with no worker at all', () => {
    const start = scenarioSnapshot();

    const published = new WorkerHarness(start);
    published.run();
    published.advance(WAKES);
    const publishedEnd = published.snapshot();

    const bare = withoutWorker(start, TICKS);

    // Being compared at the same tick, so the equality below cannot pass by
    // comparing two runs that both stopped early in the same place.
    expect(publishedEnd.kernel.tick).toBe(TICKS);
    expect(bare.kernel.tick).toBe(TICKS);

    // Non-vacuous, and stronger than "more than one": the channel really did
    // publish on *every* wake, which is what makes this the maximum traffic the
    // cadence permits rather than whatever the timing happened to allow.
    expect(published.publications()).toHaveLength(WAKES);
    // And each publication really carried the population, so the reads under
    // test were actually performed. `buildDeterminismScenario` admits four.
    for (const publication of published.publications()) {
      expect(readRenderActorsPayload(publication.payload.delta.data).recordCount).toBe(4);
    }

    expect(hashOf(publishedEnd)).toBe(hashOf(bare));
    expect(publishedEnd).toEqual(bare);
  });

  it('leaves the session it read exactly as it found it', () => {
    // One publication forced before a single tick runs, so the session it
    // reports must still hash to the snapshot it was restored from. An
    // accessor that bumped a generation or drained a ledger would show up here
    // as a changed hash at tick zero.
    //
    // It takes one wake to force, because tick 0 cannot be published at all --
    // `deltaMessageSchema` refuses `tick <= baseTick` and a session's base is
    // 0 -- so this advances the smallest amount that produces a publication and
    // then compares against the same ticks run bare.
    const start = scenarioSnapshot();
    const harness = new WorkerHarness(start);
    harness.run();
    harness.advance(1);

    expect(harness.publications()).toHaveLength(1);
    expect(hashOf(harness.snapshot())).toBe(hashOf(withoutWorker(start, TICKS_PER_WAKE)));
  });

  /**
   * The guard against both assertions above passing vacuously: a hash that did
   * not move with the simulation would make "the two agree" meaningless.
   */
  it('is comparing a session that actually advanced, on a hash that actually moves', () => {
    const start = scenarioSnapshot();
    const harness = new WorkerHarness(start);
    harness.run();
    harness.advance(WAKES);
    const end = harness.snapshot();

    expect(hashOf(end)).not.toBe(hashOf(start));
    expect(end.construction.orders.length).toBeGreaterThan(0);
    expect(end.kernel.commands.length).toBeLessThan(start.kernel.commands.length);
  });
});
