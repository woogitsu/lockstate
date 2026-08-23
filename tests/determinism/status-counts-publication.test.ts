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

/**
 * Publishing a projection is a **read**.
 *
 * ADR 0009 makes deterministic replay a product guarantee: a seed plus a
 * command stream *is* the run. `simulation/status-counts` is a new thing that
 * happens inside the worker that owns the kernel, on a timer, several times a
 * second, and it reaches into the prisoner entity store, the room registry,
 * the guard roster, the incident log and the search system to do its work. If
 * any of that walked state destructively -- a drained ledger, a lazily
 * rebuilt cache that is not equivalent, an accessor that advances a
 * sequence -- then the mere act of showing a player a number would change the
 * simulation, and it would do so only in the running app, never in a
 * headless replay.
 *
 * So this compares the same sixty ticks run two ways: through the real
 * `SimulationWorkerStateMachine`, which publishes counts as it goes, and
 * straight through the kernel with no worker and no publication at all. The
 * sessions must be byte-identical. `clock-transport.test.ts` makes the same
 * kind of statement about the transport controls; this one is about the
 * readout.
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

class WorkerHarness {
  public readonly port = new RecordingPort();
  private readonly machine: SimulationWorkerStateMachine;
  private nowMs = 0;

  public constructor(snapshot: SessionSnapshotBundle) {
    this.machine = new SimulationWorkerStateMachine(this.port, 'status-counts-determinism', () => this.nowMs);
    this.send({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'init',
      kind: 'simulation/initialize',
      payload: {
        sessionId: 'session-status-counts-determinism',
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

  /** One 50 ms step of simulated time per wake, so `wakes` wakes are `wakes` ticks. */
  public advance(wakes: number): void {
    for (let wake = 0; wake < wakes; wake += 1) {
      this.nowMs += 50;
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
    return this.port.messages.filter((message) => message.kind === 'simulation/status-counts');
  }
}

const TICKS = 60;

describe('publishing the status counts cannot change the simulation', () => {
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
    published.advance(TICKS);
    const publishedEnd = published.snapshot();

    const bare = withoutWorker(start, TICKS);

    // Being compared at the same tick, so the equality below cannot pass by
    // comparing two runs that both stopped early in the same place.
    expect(publishedEnd.kernel.tick).toBe(TICKS);
    expect(bare.kernel.tick).toBe(TICKS);

    // Non-vacuous: the worker really did project and publish during those
    // ticks. Without this the test would pass just as well against a channel
    // that never sent anything.
    expect(published.publications().length).toBeGreaterThan(1);

    expect(hashOf(publishedEnd)).toBe(hashOf(bare));
    expect(publishedEnd).toEqual(bare);
  });

  it('leaves the session it read exactly as it found it', () => {
    // The publication at `simulation/initialize` happens before a single tick
    // runs, so the session it reports must still hash to the snapshot it was
    // restored from. A projection that drained a ledger or advanced a
    // sequence number would show up here as a changed hash at tick zero.
    const start = scenarioSnapshot();
    const harness = new WorkerHarness(start);

    expect(harness.publications()).toHaveLength(1);
    expect(hashOf(harness.snapshot())).toBe(hashOf(start));
  });

  /**
   * The guard against both assertions above passing vacuously: a hash that
   * did not move with the simulation would make "the two agree" meaningless.
   */
  it('is comparing a session that actually advanced, on a hash that actually moves', () => {
    const start = scenarioSnapshot();
    const harness = new WorkerHarness(start);
    harness.run();
    harness.advance(TICKS);
    const end = harness.snapshot();

    expect(hashOf(end)).not.toBe(hashOf(start));
    expect(end.construction.orders.length).toBeGreaterThan(0);
    expect(end.kernel.commands.length).toBeLessThan(start.kernel.commands.length);
  });
});
