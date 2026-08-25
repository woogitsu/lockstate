import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deterministicStateHash } from '../../src/simulation/determinism/canonical';
import {
  PROJECTION_IDS,
  SIMULATION_PROTOCOL_VERSION,
  type MainToWorkerMessage,
  type ProjectionId,
  type ProjectionTarget,
} from '../../src/simulation/protocol/types';
import {
  captureSessionSnapshot,
  restoreSimulationRuntime,
  SESSION_SNAPSHOT_SCHEMA_ID,
  SESSION_SNAPSHOT_SCHEMA_VERSION,
  type SessionSnapshotBundle,
} from '../../src/simulation/runtime/restore-session';
import { PROJECTION_CATALOG } from '../../src/simulation/worker/projection-catalog';
import { SimulationWorkerStateMachine, type MessagePortLike } from '../../src/simulation/worker/state-machine';
import { buildDeterminismScenario, SCENARIO_SEED, submitScenarioCommands } from '../helpers/determinism-scenario';
import { toJsonValue } from '../helpers/determinism-state';

/**
 * Answering a projection request is a **read**.
 *
 * The sibling of `status-counts-publication.test.ts`, and it exists because
 * the general channel widens exactly what that test was written to protect.
 * The counts publication reaches into five registries; this channel reaches
 * into all of them plus the door registry, the deployment and patrol systems,
 * the confiscation ledger, the intelligence ledger, the informant registry,
 * the gang registry, the search system and the world. ADR 0009 makes
 * deterministic replay a product guarantee -- a seed plus a command stream
 * *is* the run -- so if any accessor behind any of those walked state
 * destructively, then opening a panel would change the simulation, and it
 * would do so only in the running app and never in a headless replay.
 *
 * Two of those accessors are named hazards rather than hypothetical ones.
 * Issue #157 finding 2 says `ConfiscationLedger.drain()` empties the ledger
 * and `IncidentLog.all()` materialises everything ever recorded; the catalog
 * reads the ledger through its non-consuming `all()` and never drains, and
 * this test is where that claim is executable rather than commented.
 *
 * So this compares the same sixty ticks run two ways: through the real
 * `SimulationWorkerStateMachine` with **every declared projection requested on
 * every tick-loop wake**, and straight through the kernel with no worker and
 * no request at all. The sessions must be byte-identical.
 *
 * "Every projection on every wake" is deliberately far more traffic than any
 * panel would generate. The point is not to model a realistic load; it is that
 * if a single one of these reads mutated anything, sixty ticks times twelve
 * projections is enough for the divergence to be unmissable.
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

/** The scenario, stepped by the kernel alone: no worker, no clock, no request. */
function withoutWorker(start: SessionSnapshotBundle, ticks: number): SessionSnapshotBundle {
  const runtime = restoreSimulationRuntime(start).runtime;
  for (let tick = 0; tick < ticks; tick += 1) runtime.kernel.step();
  return captureSessionSnapshot(runtime);
}

/**
 * A target for each detail projection that really resolves in this scenario.
 *
 * A request that missed would still be a read, so a wrong id here would not
 * make the test pass falsely -- but it would make it prove less, because the
 * projection would return before touching anything. `readsSomething` below is
 * what refuses that.
 */
function targetFor(projectionId: ProjectionId, firstPrisoner: number): ProjectionTarget | undefined {
  switch (PROJECTION_CATALOG[projectionId].target) {
    case 'none':
      return undefined;
    case 'entity':
      return { kind: 'entity', entityId: firstPrisoner };
    case 'id':
      return { kind: 'id', id: 'cell-1' };
  }
}

class WorkerHarness {
  public readonly port = new RecordingPort();
  private readonly machine: SimulationWorkerStateMachine;
  private nowMs = 0;
  private nextId = 0;

  public constructor(snapshot: SessionSnapshotBundle) {
    this.machine = new SimulationWorkerStateMachine(this.port, 'projection-request-determinism', () => this.nowMs);
    this.send({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'init',
      kind: 'simulation/initialize',
      payload: {
        sessionId: 'session-projection-request-determinism',
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

  public ask(projectionId: ProjectionId, target: ProjectionTarget | undefined): any {
    this.nextId += 1;
    const messageId = `request-${String(this.nextId)}`;
    this.send({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId,
      kind: 'simulation/request-projection',
      payload: {
        projectionId,
        ...(PROJECTION_CATALOG[projectionId].paged ? { offset: 0, limit: 25 } : {}),
        ...(target === undefined ? {} : { target }),
      },
    });
    return this.port.messages.find((message) => message.replyTo === messageId);
  }

  public askEverything(firstPrisoner: number): void {
    for (const projectionId of PROJECTION_IDS) {
      const reply = this.ask(projectionId, targetFor(projectionId, firstPrisoner));
      // A fault would mean this wake asked for nothing, and the test would
      // quietly stop proving anything about that projection.
      expect(reply?.kind, `${projectionId} was refused mid-run`).toBe('simulation/projection');
    }
  }

  /** One 50 ms step of simulated time per wake, so `wakes` wakes are `wakes` ticks. */
  public advance(wakes: number, firstPrisoner: number): void {
    for (let wake = 0; wake < wakes; wake += 1) {
      this.nowMs += 50;
      vi.advanceTimersByTime(15);
      this.askEverything(firstPrisoner);
    }
  }

  /** The same wakes with no projection requested at all, for a test that wants an unread session. */
  public advanceQuietly(wakes: number): void {
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

  public replies(): readonly any[] {
    return this.port.messages.filter((message) => message.kind === 'simulation/projection');
  }

  public firstPrisonerId(): number {
    const roster = this.ask('hud/prisoner-roster', undefined);
    return roster.payload.view.data.rows[0].entityId as number;
  }
}

const TICKS = 60;

describe('answering a projection request cannot change the simulation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reaches a byte-identical session to the same ticks run with no worker at all', () => {
    const start = scenarioSnapshot();

    const queried = new WorkerHarness(start);
    const firstPrisoner = queried.firstPrisonerId();
    queried.run();
    queried.advance(TICKS, firstPrisoner);
    const queriedEnd = queried.snapshot();

    const bare = withoutWorker(start, TICKS);

    // Compared at the same tick, so the equality below cannot pass by
    // comparing two runs that both stopped early in the same place.
    expect(queriedEnd.kernel.tick).toBe(TICKS);
    expect(bare.kernel.tick).toBe(TICKS);

    // Non-vacuous: the worker really did project, for every declared id, on
    // every wake. Without this the test would pass just as well against a
    // channel that answered nothing.
    expect(queried.replies().length).toBeGreaterThanOrEqual(TICKS * PROJECTION_IDS.length);

    expect(hashOf(queriedEnd)).toBe(hashOf(bare));
    expect(queriedEnd).toEqual(bare);
  });

  it('leaves the session it read exactly as it found it, before a tick has run', () => {
    // Every projection, at tick zero, on a paused session. The hash must still
    // be the snapshot it was restored from -- a projection that drained a
    // ledger, advanced a sequence or rebuilt a cache non-equivalently shows up
    // here with no tick noise to hide in.
    const start = scenarioSnapshot();
    const harness = new WorkerHarness(start);
    const firstPrisoner = harness.firstPrisonerId();

    harness.askEverything(firstPrisoner);
    harness.askEverything(firstPrisoner);

    expect(hashOf(harness.snapshot())).toBe(hashOf(start));
  });

  it('reads something on every projection, so "no change" is not "no work"', () => {
    // The assertion above would hold trivially for a projection that returned
    // before touching the session. This requires each reply to carry a real
    // read model, which is the same floor `tests/contract/worker-projection-channel.test.ts`
    // asserts and is repeated here because it is what gives the two tests
    // above their meaning.
    const harness = new WorkerHarness(scenarioSnapshot());
    const firstPrisoner = harness.firstPrisonerId();

    for (const projectionId of PROJECTION_IDS) {
      if (projectionId === 'hud/incident-detail') continue; // No incident exists at tick zero.
      const reply = harness.ask(projectionId, targetFor(projectionId, firstPrisoner));
      expect(reply.payload.view, `${projectionId} read nothing`).toBeDefined();
    }
  });

  it('never drains the confiscation ledger, however many times contraband is projected', () => {
    // #157 finding 2, first bullet, as an assertion rather than a comment:
    // "a publication that called `drain()` would blank the contraband panel
    // and discard the state it was trying to report". Ten reads of the same
    // ledger must report the same ledger.
    //
    // **Advanced quietly on purpose.** An earlier draft used `advance`, which
    // asks for every projection on every wake -- so a draining catalog entry
    // had already emptied the ledger before the first of the ten readings, all
    // ten read zero, and the mutation survived. Measured: with
    // `confiscations: { all: () => runtime.confiscations.drain() }` this test
    // passed and only the byte-identity test above failed. The session is now
    // stepped with nothing read, so the first reading is the ledger and the
    // rest have to agree with it.
    const harness = new WorkerHarness(scenarioSnapshot());
    harness.run();
    harness.advanceQuietly(TICKS);

    const readings: number[] = [];
    for (let attempt = 0; attempt < 10; attempt += 1) {
      readings.push(harness.ask('hud/contraband', undefined).payload.view.data.discovered.total as number);
    }
    // Non-vacuous: a ledger that was empty the whole time would make "they all
    // agree" true of a channel that consumed it.
    expect(readings[0], 'the scenario must actually confiscate something for this to test anything').toBeGreaterThan(0);
    expect(new Set(readings).size, 'repeated reads of the ledger disagreed, so one of them consumed it').toBe(1);
  });

  /**
   * The guard against every assertion above passing vacuously: a hash that did
   * not move with the simulation would make "the two agree" meaningless.
   */
  it('is comparing a session that actually advanced, on a hash that actually moves', () => {
    const start = scenarioSnapshot();
    const harness = new WorkerHarness(start);
    const firstPrisoner = harness.firstPrisonerId();
    harness.run();
    harness.advance(TICKS, firstPrisoner);
    const end = harness.snapshot();

    expect(hashOf(end)).not.toBe(hashOf(start));
    expect(end.construction.orders.length).toBeGreaterThan(0);
    expect(end.kernel.commands.length).toBeLessThan(start.kernel.commands.length);
  });
});
