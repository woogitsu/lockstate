import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { TREASURY_STARTING_BALANCE_MINOR_UNITS } from '../../src/simulation/economy';
import { HUD_VIEW_MODEL_SCHEMA_VERSION } from '../../src/simulation/presentation/view-model';
import { decodeWorkerToMainMessage } from '../../src/simulation/protocol/decode';
import { SIMULATION_PROTOCOL_VERSION, type MainToWorkerMessage } from '../../src/simulation/protocol/types';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import {
  captureSessionSnapshot,
  SESSION_SNAPSHOT_SCHEMA_ID,
  SESSION_SNAPSHOT_SCHEMA_VERSION,
  type SessionSnapshotBundle,
} from '../../src/simulation/runtime/restore-session';
import {
  SimulationWorkerStateMachine,
  STATUS_COUNTS_PUBLISH_INTERVAL_MS,
  type MessagePortLike,
} from '../../src/simulation/worker/state-machine';
import { projectStatusCounts } from '../../src/simulation/worker/status-counts';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { buildDeterminismScenario, SCENARIO_SEED, submitScenarioCommands } from '../helpers/determinism-scenario';

/**
 * The `simulation/status-counts` channel: the worker telling the main thread
 * how many prisoners, staff, rooms, open incidents and contraband finds the
 * session has.
 *
 * Issue #104 is the gap this closes. `src/simulation/presentation/` has
 * always computed these counts and no worker-to-main message carried them, so
 * the HUD painted the literal zeros of `EMPTY_HUD_VIEW_MODEL` for the whole
 * session however many prisoners the simulation held.
 *
 * The failure mode the issue names is the one most of this file is about: "a
 * per-tick firehose that serialises every projection every tick and eats the
 * frame budget". So the tests below pin not only that the readout is correct
 * but that projecting it is rate-limited, that an unchanged prison is silent,
 * and that every payload says which tick it describes.
 *
 * `projectStatusCounts` is wrapped in a call-through spy so the *projection*
 * rate can be observed and not merely inferred from the message rate. The
 * interval gate sits before the projection precisely so a busy prison does
 * not pay for a projection on all ~66 tick-loop wakes a second, and nothing
 * about the messages on the port can show that.
 */
vi.mock('../../src/simulation/worker/status-counts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/simulation/worker/status-counts')>();
  return { ...actual, projectStatusCounts: vi.fn(actual.projectStatusCounts) };
});

interface Published {
  readonly kind: string;
  readonly replyTo?: string;
  readonly payload: { readonly tick: number; readonly schemaVersion: number; readonly counts: Record<string, number> };
}

class RecordingPort implements MessagePortLike {
  public readonly messages: any[] = [];
  public postMessage(message: any): void {
    this.messages.push(message);
  }
}

/** The rich scenario every determinism test uses, frozen with its command stream queued. */
function scenarioSnapshot(): SessionSnapshotBundle {
  const runtime = buildDeterminismScenario(SCENARIO_SEED);
  submitScenarioCommands(runtime);
  return captureSessionSnapshot(runtime);
}

/**
 * One worker, driven from an injected clock rather than wall time, so a wake
 * of the tick loop and the passage of simulated time are separately
 * controlled. Each `advance(50)` at x1 is exactly one tick, which is what
 * lets a publication's tick stamp be checked against a known number.
 */
class Harness {
  public readonly port = new RecordingPort();
  private readonly machine: SimulationWorkerStateMachine;
  private nowMs = 0;

  public constructor(snapshot?: SessionSnapshotBundle) {
    this.machine = new SimulationWorkerStateMachine(this.port, 'status-counts-build', () => this.nowMs);
    this.send({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'init',
      kind: 'simulation/initialize',
      payload: {
        sessionId: 'session-status-counts',
        source:
          snapshot === undefined
            ? { kind: 'new', masterSeed: 7 }
            : {
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
    if (fault !== undefined) throw new Error(`The worker refused the snapshot: ${String(fault.payload.message)}`);
  }

  private send(message: MainToWorkerMessage): void {
    this.machine.handleMessage(message);
  }

  public run(speed: 1 | 2 | 4 = 1): void {
    this.send({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: `run-${String(this.nowMs)}`,
      kind: 'simulation/set-clock',
      payload: { mode: 'running', speed },
    });
  }

  /** Moves the injected clock forward by `milliseconds` and fires one tick-loop wake. */
  public advance(milliseconds: number): void {
    this.nowMs += milliseconds;
    vi.advanceTimersByTime(15);
  }

  public get elapsedMs(): number {
    return this.nowMs;
  }

  public publications(): readonly Published[] {
    return this.port.messages.filter((message): message is Published => message.kind === 'simulation/status-counts');
  }

  public kernelTick(): number {
    this.send({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: `snapshot-${String(this.nowMs)}`,
      kind: 'simulation/request-snapshot',
      payload: { reason: 'consistency-check' },
    });
    const reply = [...this.port.messages].reverse().find((message) => message.kind === 'simulation/snapshot');
    if (reply === undefined) throw new Error('The worker returned no snapshot.');
    return (reply.payload.snapshot.data as SessionSnapshotBundle).kernel.tick;
  }
}

describe('publishing the status counts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(projectStatusCounts).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('reports the population the simulation actually has, rather than zeros', () => {
    // The counts the HUD strip renders, from a session with a real
    // population: four prisoners, five hired guards and six registered room
    // instances. Before this channel existed every one of these was a zero
    // painted from `EMPTY_HUD_VIEW_MODEL` (issue #104).
    const harness = new Harness(scenarioSnapshot());
    const [first, ...rest] = harness.publications();

    expect(rest).toEqual([]);
    expect(first?.payload.counts).toEqual({
      prisoners: 4,
      prisonersInIntake: 4,
      prisonersHighRisk: 0,
      staff: 5,
      staffUnassigned: 5,
      // The starting balance, unspent: this scenario buys nothing, so the
      // number is `TREASURY_STARTING_BALANCE_MINOR_UNITS` and reads as one
      // rather than as an arbitrary constant (#96).
      treasuryMinorUnits: TREASURY_STARTING_BALANCE_MINOR_UNITS,
      rooms: 6,
      roomCapacity: 20,
      roomOccupants: 0,
      activeIncidents: 0,
      contrabandDiscovered: 0,
    });
    expect(first?.payload.schemaVersion).toBe(HUD_VIEW_MODEL_SCHEMA_VERSION);
  });

  test('publishes once as soon as a session exists, before any tick has run', () => {
    // A restored session arrives paused, so nothing would publish until the
    // player pressed play -- and a prison with forty prisoners would sit
    // behind a row of zeros until they did.
    const harness = new Harness(scenarioSnapshot());

    expect(harness.kernelTick()).toBe(0);
    expect(harness.publications()).toHaveLength(1);
    expect(harness.publications()[0]?.payload.tick).toBe(0);
  });

  test('stamps every payload with the tick it describes', () => {
    // A count that outlived the state it was read from is worse than no
    // count: nothing else on the boundary could reveal that the strip is
    // describing a prison from two seconds ago. One wake carries exactly one
    // 50 ms tick at x1, so the tick after `n` wakes is `n`.
    const harness = new Harness(scenarioSnapshot());
    harness.run(1);

    let wakes = 0;
    let seen = harness.publications().length;
    for (; wakes < 120; wakes += 1) {
      harness.advance(50);
      const published = harness.publications();
      for (const publication of published.slice(seen)) {
        expect(publication.payload.tick).toBe(wakes + 1);
      }
      seen = published.length;
    }

    expect(harness.kernelTick()).toBe(wakes);
    expect(seen).toBeGreaterThan(1);
  });

  test('carries no replyTo, so it cannot be mistaken for an answer to a request', () => {
    // ADR 0003: "Unsolicited deltas and domain events do not pretend to be
    // request responses." Nothing ever asks for this message, so its schema
    // has no `replyTo` at all -- and a fabricated one would resolve whichever
    // pending request on the main thread happened to share the id.
    const harness = new Harness(scenarioSnapshot());
    harness.run(1);
    for (let wake = 0; wake < 40; wake += 1) harness.advance(50);

    expect(harness.publications().length).toBeGreaterThan(1);
    for (const publication of harness.publications()) {
      expect('replyTo' in publication).toBe(false);
    }
  });

  test('is a message the main thread will actually accept', () => {
    // The decoder is the gate every worker message passes through, and it is
    // `.strict()`: a count added to the projection without being added to the
    // schema fails here rather than silently reaching the HUD as `undefined`.
    const harness = new Harness(scenarioSnapshot());
    harness.run(1);
    for (let wake = 0; wake < 40; wake += 1) harness.advance(50);

    const publications = harness.publications();
    expect(publications.length).toBeGreaterThan(1);
    for (const publication of publications) {
      const decoded = decodeWorkerToMainMessage(publication);
      expect(decoded.ok, decoded.ok ? '' : JSON.stringify(decoded.error)).toBe(true);
    }
  });

  test('says nothing at all while nothing it reports has changed', () => {
    // A new session has no prisoners, no staff and no rooms, and nothing in
    // it can change any of those, so after the first readout the channel is
    // silent for as long as the simulation runs. Ten seconds of ticks, and one
    // message.
    const harness = new Harness();
    harness.run(1);
    for (let wake = 0; wake < 200; wake += 1) harness.advance(50);

    expect(harness.kernelTick()).toBe(200);
    expect(harness.publications()).toHaveLength(1);
  });

  test('sends no more than one message per publish interval, and never the same counts twice running', () => {
    const harness = new Harness(scenarioSnapshot());
    harness.run(1);
    for (let wake = 0; wake < 200; wake += 1) harness.advance(50);

    const publications = harness.publications();
    // One readout at initialize, then at most one per interval of simulated
    // time. The loop woke 200 times to produce this.
    expect(publications.length).toBeLessThanOrEqual(
      1 + Math.ceil(harness.elapsedMs / STATUS_COUNTS_PUBLISH_INTERVAL_MS),
    );

    // And it does move -- otherwise the bound above would be satisfied by a
    // channel that published once and then broke.
    expect(publications.length).toBeGreaterThan(1);
    for (let index = 1; index < publications.length; index += 1) {
      expect(publications[index]?.payload.counts).not.toEqual(publications[index - 1]?.payload.counts);
    }
  });

  test('projects at most once per publish interval, however often the loop wakes', () => {
    // The interval is checked *before* projecting, so the cost of the
    // projection is bounded and not merely the cost of the message. Swapping
    // the two gates would leave every assertion above passing while the
    // worker projected the whole prison ~66 times a second.
    const harness = new Harness(scenarioSnapshot());
    harness.run(1);
    for (let wake = 0; wake < 100; wake += 1) harness.advance(10); // 1s of simulated time, 100 wakes.

    expect(vi.mocked(projectStatusCounts).mock.calls.length).toBeLessThanOrEqual(
      1 + Math.ceil(harness.elapsedMs / STATUS_COUNTS_PUBLISH_INTERVAL_MS),
    );
    expect(vi.mocked(projectStatusCounts).mock.calls.length).toBeGreaterThan(0);
  });

  test('publishes nothing once the session has stopped', () => {
    const harness = new Harness(scenarioSnapshot());
    harness.run(1);
    for (let wake = 0; wake < 20; wake += 1) harness.advance(50);
    const before = harness.publications().length;
    expect(before).toBeGreaterThan(0);

    harness.port.messages.length = 0;
    harness['machine'].handleMessage({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'stop',
      kind: 'simulation/shutdown',
      payload: { reason: 'user-request' },
    });
    for (let wake = 0; wake < 60; wake += 1) harness.advance(50);

    expect(harness.publications()).toHaveLength(0);
  });
});

/**
 * What one publication costs, at every actor tier the architecture names.
 *
 * `AGENTS.md` requires performance evidence for a performance-sensitive
 * system, and this boundary is one: it is the same `postMessage` channel that
 * carries whole session snapshots. Measured is the whole per-send cost -- the
 * projection plus a `structuredClone` of the payload, which is what
 * `postMessage` does to it -- and the numbers are **reported, never
 * asserted**: `docs/BENCHMARKING.md` forbids a timing threshold without
 * repeated controlled baselines and hardware context.
 *
 * What *is* asserted is the property that makes the cadence safe at scale:
 * the payload is a fixed set of integers, so its size does not grow with the
 * population. A projection whose payload grew with the prison would need
 * paging (`docs/HUD_PROJECTIONS.md` contract 5) before it could be published
 * on a timer.
 */
/** Room instances and hired guards the measured session carries alongside its population. */
const CELL_COUNT = 300;
const GUARD_COUNT = 40;

describe.each([250, 1_000, 2_500, 5_000])('a status-counts publication at %i actors', (actorCount) => {
  test(
    'costs one bounded projection and clones a payload whose size does not grow with the population',
    () => {
      const runtime = createNewSimulationRuntime(0x5ea1);
      const origin = { x: tileCoordinate(16), y: tileCoordinate(16) };
      for (let index = 0; index < actorCount; index += 1) {
        runtime.prisoners.admitPrisoner({ sentenceLengthTicks: 500_000, priorIncidents: index % 4 }, origin);
      }
      // Every source the projection walks, not just the population: the room
      // registry and the guard roster are `O(instances)` and `O(staff)`
      // respectively, so a measurement without them would understate the
      // publication. Cell and staff counts are the realistic-scale ones --
      // `security-scale.test.ts` puts guard headcounts in the tens.
      for (let index = 0; index < CELL_COUNT; index += 1) {
        runtime.prisoners.roomInstances.register({
          instanceId: `cell-${String(index).padStart(4, '0')}`,
          roomCatalogId: 'room.cell',
          anchorTile: { x: tileCoordinate(index % 30), y: tileCoordinate(Math.floor(index / 30)) },
          capacity: 1,
          objectCapabilities: ['sleep-surface', 'sanitation'],
        });
      }
      for (let index = 0; index < GUARD_COUNT; index += 1) {
        runtime.securityGuards.hire('staff-role.guard', origin);
      }

      const projectStartedAt = performance.now();
      const counts = projectStatusCounts(runtime, runtime.kernel.tick);
      const projectMs = performance.now() - projectStartedAt;

      const payload = { tick: runtime.kernel.tick, schemaVersion: HUD_VIEW_MODEL_SCHEMA_VERSION, counts };
      const cloneStartedAt = performance.now();
      structuredClone(payload);
      const cloneMs = performance.now() - cloneStartedAt;

      expect(counts.prisoners).toBe(actorCount);
      expect(counts.rooms).toBe(CELL_COUNT);
      expect(counts.staff).toBe(GUARD_COUNT);
      // Eleven integers, whatever the population. It was ten until the
      // treasury balance joined them (#96); the exact count is pinned rather
      // than bounded so that a *list* arriving here -- the thing this channel
      // is shaped to exclude -- cannot slip in as "one more field". A scalar
      // being added is a one-line, visible edit; that is the point.
      //
      // This is what a status-counts
      // payload is, and why it needs no paging.
      expect(Object.keys(counts)).toHaveLength(11);
      expect(JSON.stringify(payload).length).toBeLessThan(300);

      // Reported evidence, never a gate (docs/BENCHMARKING.md).
      console.log(
        `[status-counts publication] actors=${actorCount} rooms=${CELL_COUNT} staff=${GUARD_COUNT} ` +
          `projectMs=${projectMs.toFixed(3)} ` +
          `cloneMs=${cloneMs.toFixed(3)} payloadJsonBytes=${JSON.stringify(payload).length} ` +
          `maxSendsPerSecond=${(1_000 / STATUS_COUNTS_PUBLISH_INTERVAL_MS).toFixed(1)}`,
      );
    },
    30_000,
  );
});
