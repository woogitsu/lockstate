import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { TREASURY_STARTING_BALANCE_MINOR_UNITS } from '../../src/simulation/economy';
import { HUD_VIEW_MODEL_SCHEMA_VERSION } from '../../src/simulation/presentation/view-model';
import { decodeWorkerToMainMessage } from '../../src/simulation/protocol/decode';
import { REFUSAL_REASONS, SIMULATION_PROTOCOL_VERSION, type MainToWorkerMessage } from '../../src/simulation/protocol/types';
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
import { packCommand } from '../../src/simulation/protocol/commands';
import { projectStatusCounts } from '../../src/simulation/worker/status-counts';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { buildDeterminismScenario, SCENARIO_SEED, submitScenarioCommands } from '../helpers/determinism-scenario';

/**
 * The `simulation/status-counts` channel: the worker telling the main thread
 * how many prisoners, staff, rooms, open incidents and contraband finds the
 * session has, and -- since #261 -- what it last refused.
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
  readonly payload: {
    readonly tick: number;
    readonly schemaVersion: number;
    readonly counts: Record<string, number>;
    /** Absent until the session has refused something (#261). */
    readonly refusal?: { readonly sequence: number; readonly tick: number; readonly reason: string };
  };
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

/**
 * Places one build order through the kernel's real command path.
 *
 * `executeAtTick` is explicit rather than defaulted to zero because the
 * kernel refuses a command aimed at a tick it has already run
 * (`CommandRejectedError('past-tick')`), and a rejected command never reaches
 * a system -- so a test that submitted a second order at tick 0 after one
 * wake would be asserting about a refusal that never happened.
 */
function submitBuildOrder(
  machine: SimulationWorkerStateMachine,
  sequence: number,
  tile: { x: number; y: number },
  executeAtTick: number,
): void {
  machine.handleMessage({
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: `build-${String(sequence)}`,
    kind: 'simulation/submit-command',
    payload: {
      commandId: `order-${String(sequence)}`,
      sequence,
      executeAtTick,
      command: packCommand({
        type: 'PlaceBuildOrder',
        orderId: `order-${String(sequence)}`,
        definitionId: 'wall-brick',
        x: tile.x,
        y: tile.y,
      }) as never,
    },
  });
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
      // The **resident** capacity, derived from the objects standing in the
      // scenario's rooms rather than authored on the instances (ADR 0028
      // decision 2): four cells with one bed each. The yard and the canteen
      // contribute nothing to *this* number even though both hold furniture,
      // because a bench and a dining table are not sleep surfaces -- they raise
      // `concurrentUseCapacity`, which the strip does not yet read (that is
      // phase 5's readout). It was 20 while the scenario authored a capacity of
      // 8 on each of those two rooms, which is the figure that stopped being
      // expressible: nothing authors an occupancy any more.
      roomCapacity: 4,
      // The same 4, because every capacity-bearing room in this scenario is a
      // `room.cell`: the yard and the canteen derive 0 and there is no
      // infirmary. The two figures are pinned apart in
      // `tests/unit/hud-projections.test.ts` ("does not count an infirmary's
      // medical beds as somewhere to live"), on a prison built for the
      // purpose; here they agree because the prison makes them agree, which is
      // itself worth asserting -- a scoping rule that dropped `room.cell`
      // would read 0 in this payload.
      accommodationCapacity: 4,
      roomOccupants: 0,
      activeIncidents: 0,
      contrabandDiscovered: 0,
      // Zero, and not because the day has just started: this scenario's four
      // prisoners are all still in intake (`prisonersInIntake: 4` above), so
      // none of them holds an occupancy slot -- `roomOccupants: 0` says the
      // same thing -- and an occupied place is what the state pays for (#29).
      // Six registered room instances with four beds between them earn
      // nothing while they are empty.
      stateIncomeAccruedTodayMinorUnits: 0,
      // Five guards at the catalogue's 80-a-day guard band (ADR 0042 step 3).
      // Not zero, and that is the point of asserting it here: the wage bill is
      // a fact about who is *employed*, not about who is housed or deployed --
      // this scenario's four prisoners are all still in intake and its five
      // guards are all unassigned, and the prison is billed for them anyway.
      dailyWageBillMinorUnits: 400,
      // Nothing owed. The scenario is at tick 0, so no day boundary has passed
      // and no bill has been raised, let alone gone unmet -- and the treasury
      // above is untouched, which is the same fact read from the other side.
      unpaidWagesMinorUnits: 0,
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

  /**
   * The figure every written-out bound in this file is derived from.
   *
   * Those bounds used to be recomputed as `1 + Math.ceil(harness.elapsedMs /
   * STATUS_COUNTS_PUBLISH_INTERVAL_MS)` -- the production constant put
   * through the production formula, so the ceiling moved by exactly the
   * factor the traffic did and the comparison could not notice. Measured:
   * `500 -> 100`, five times the projections and five times the messages on
   * the channel issue #104 exists to keep off the frame budget, left the
   * whole suite green -- 238 files, 2,696 tests -- and this file 20/20.
   *
   * So the bounds are literals now, and this is the guard that keeps them
   * honest: retuning the interval fails here, naming the reason, instead of
   * silently re-scaling every ceiling in the file.
   */
  test('publishes on the 500 ms interval the bounds in this file are written against', () => {
    expect(STATUS_COUNTS_PUBLISH_INTERVAL_MS, 'the written-out bounds in this file assume a 500 ms interval').toBe(500);
  });

  test('sends no more than one message per publish interval, and never the same counts twice running', () => {
    const harness = new Harness(scenarioSnapshot());
    harness.run(1);
    for (let wake = 0; wake < 200; wake += 1) harness.advance(50);

    const publications = harness.publications();
    // One readout at initialize, then at most one per interval of simulated
    // time. The loop woke 200 times to produce this.
    //
    // Written out rather than recomputed as `1 + Math.ceil(harness.elapsedMs
    // / STATUS_COUNTS_PUBLISH_INTERVAL_MS)`, which was the production
    // constant put through the production formula and so moved with it (#375
    // -- the case above this one carries the measurement). 10,000 ms at a
    // 500 ms interval is twenty windows, plus the readout at initialize:
    // twenty-one. Matched exactly rather than bounded, because this
    // scenario's counts change on every window and therefore saturate the
    // limiter -- observed at 21 -- so it also fails for a channel gone quiet.
    expect(harness.elapsedMs).toBe(10_000);
    expect(publications.length).toBe(21);

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

    // 1,000 ms at a 500 ms interval is two windows, plus the readout at
    // initialize: three, against a hundred wakes. Observed at 3, so the
    // limiter is saturated here too and the equality is the bound.
    expect(harness.elapsedMs).toBe(1_000);
    expect(vi.mocked(projectStatusCounts).mock.calls.length).toBe(3);
  });

  /**
   * Issue #261: the channel also carries what the simulation *refused*.
   *
   * A command travels through two acceptances -- `handleSubmitCommand`
   * answers `status: 'queued'` when the kernel takes the message, and a
   * system decides at the command's tick what it means. Only the first was
   * ever reported, so an out-of-bounds wall left `state: 'failed'` on an
   * order nothing drew and nothing announced.
   *
   * The tile is `100, 100`: outside the single 32x32 chunk a new session
   * owns, and a coordinate a player can actually enter, because the Build
   * panel's number fields carry no `min`/`max`.
   */
  test('reports a build order the simulation refused, though no count moved', () => {
    // A new session has nothing to count and nothing that can change a
    // count, so the counts channel is silent for as long as it runs -- which
    // is exactly why this needed the refusal to open the gate. The
    // `statusCountsEqual` comparison alone would have suppressed the only
    // message that could carry it.
    const harness = new Harness();
    harness.run(1);
    const before = harness.publications();
    expect(before).toHaveLength(1);
    expect(before[0]?.payload.refusal).toBeUndefined();

    submitBuildOrder(harness['machine'], 0, { x: 100, y: 100 }, 0);
    harness.advance(50);

    const after = harness.publications();
    expect(after).toHaveLength(2);
    const published = after[1];
    expect(published?.payload.refusal).toEqual({ sequence: 1, tick: 0, reason: 'build.out-of-bounds' });
    // The counts really did not move, so nothing but the refusal caused this
    // message to exist.
    expect(published?.payload.counts).toEqual(before[0]?.payload.counts);
    // And the envelope's tick is the tick the *readout* was taken at, which
    // is a tick later than the one the refusal happened on. Conflating them
    // would make a standing refusal look as if it had just happened again.
    expect(published?.payload.tick).toBe(1);
  });

  test('reports it on the same wake it was refused, rather than up to an interval later', () => {
    // The refusal is recorded during `kernel.step()` and published later in
    // the same `onTickLoop`. Waiting for the 500 ms interval would be a delay
    // the player feels on their own action -- and pausing inside that window
    // stops the tick loop, which would strand the refusal until the clock
    // next ran.
    const harness = new Harness();
    harness.run(1);
    submitBuildOrder(harness['machine'], 0, { x: 100, y: 100 }, 0);

    // One wake, 50 ms of simulated time -- a tenth of the publish interval.
    harness.advance(50);
    expect(harness.elapsedMs).toBeLessThan(STATUS_COUNTS_PUBLISH_INTERVAL_MS);
    expect(harness.publications()[1]?.payload.refusal?.reason).toBe('build.out-of-bounds');
  });

  test('says nothing further about a refusal it has already reported', () => {
    // The gate opens once per refusal, not once per wake after one. Without
    // recording the published sequence this would be a message on every wake
    // for the rest of the session -- the firehose #104 named, arriving
    // through the new field.
    const harness = new Harness();
    harness.run(1);
    submitBuildOrder(harness['machine'], 0, { x: 100, y: 100 }, 0);
    harness.advance(50);
    expect(harness.publications()).toHaveLength(2);

    for (let wake = 0; wake < 200; wake += 1) harness.advance(50);
    expect(harness.publications()).toHaveLength(2);
  });

  test('replaces the standing refusal when the simulation refuses something else', () => {
    const harness = new Harness();
    harness.run(1);
    submitBuildOrder(harness['machine'], 0, { x: 100, y: 100 }, 0);
    harness.advance(50);
    submitBuildOrder(harness['machine'], 1, { x: -100, y: -100 }, 1);
    harness.advance(50);

    const published = harness.publications();
    expect(published).toHaveLength(3);
    // A new ordinal, so the HUD paints a new row rather than leaving the old
    // one standing, and the count of refusals is carried by the same number.
    expect(published[2]?.payload.refusal).toEqual({ sequence: 2, tick: 1, reason: 'build.out-of-bounds' });
  });

  test('keeps carrying the standing refusal beside counts that do move', () => {
    // The channel is a snapshot, not an event stream: a listener that starts
    // late must see the same state as one that was there all along, so the
    // refusal is republished with every later readout for as long as it is
    // the most recent one. The scenario session's counts move on their own as
    // intake runs, which is what produces the later readouts.
    const harness = new Harness(scenarioSnapshot());
    harness.run(1);
    // The snapshot carries four already-queued commands, so the next
    // session-local sequence is 4.
    submitBuildOrder(harness['machine'], 4, { x: 100, y: 100 }, 0);

    for (let wake = 0; wake < 200; wake += 1) harness.advance(50);

    const carrying = harness.publications().filter((publication) => publication.payload.refusal !== undefined);
    expect(carrying.length).toBeGreaterThan(1);
    for (const publication of carrying) {
      expect(publication.payload.refusal).toEqual({ sequence: 1, tick: 0, reason: 'build.out-of-bounds' });
    }
  });

  test('still projects at most once per interval plus once per refusal', () => {
    // The refusal gate is bounded by how often a player can have a command
    // refused, not by how often the loop wakes. Two refusals over ten seconds
    // buy two extra projections, and the loop woke 200 times to produce them.
    const harness = new Harness();
    harness.run(1);
    submitBuildOrder(harness['machine'], 0, { x: 100, y: 100 }, 0);
    harness.advance(50);
    submitBuildOrder(harness['machine'], 1, { x: -100, y: -100 }, 1);

    for (let wake = 0; wake < 200; wake += 1) harness.advance(50);

    // 10,050 ms at a 500 ms interval is twenty-one windows, plus the readout
    // at initialize, plus one per refusal: twenty-four.
    expect(harness.elapsedMs).toBe(10_050);
    expect(vi.mocked(projectStatusCounts).mock.calls.length).toBeLessThanOrEqual(24);
    // Observed at 22: both refusals landed inside a window the interval had
    // already opened, so neither spent its allowance. Stated, so the bound
    // above cannot also be met by a channel that stopped projecting.
    expect(vi.mocked(projectStatusCounts).mock.calls.length).toBe(22);
  });

  test('is still a message the main thread accepts once it carries a refusal', () => {
    const harness = new Harness();
    harness.run(1);
    submitBuildOrder(harness['machine'], 0, { x: 100, y: 100 }, 0);
    harness.advance(50);

    const published = harness.publications()[1];
    expect(published?.payload.refusal).toBeDefined();
    const decoded = decodeWorkerToMainMessage(published);
    expect(decoded.ok, decoded.ok ? '' : JSON.stringify(decoded.error)).toBe(true);
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
          residentCapacity: 1, concurrentUseCapacity: 1,
          objectCapabilities: ['sleep-surface', 'sanitation'],
        });
      }
      for (let index = 0; index < GUARD_COUNT; index += 1) {
        runtime.securityGuards.hire('staff-role.guard', origin);
      }

      const projectStartedAt = performance.now();
      const counts = projectStatusCounts(runtime, runtime.kernel.tick);
      const projectMs = performance.now() - projectStartedAt;

      // The **largest** payload this channel can send, which is what makes
      // the size bound below a bound: the refusal field is optional, and a
      // measurement taken without it would understate every publication that
      // carries one (#261). The longest declared reason is used for the same
      // reason -- and, since issue #506 finding 2, so is the longest
      // `IncidentType` spelling for `activeIncidentType`: this scenario may or
      // may not have an incident open, but the size bound has to hold for the
      // publication that does, so the worst case is forced here rather than
      // measured from whatever this run happened to produce.
      const payload = {
        tick: runtime.kernel.tick,
        schemaVersion: HUD_VIEW_MODEL_SCHEMA_VERSION,
        counts: { ...counts, activeIncidentType: 'gang-retaliation' as const },
        refusal: {
          sequence: Number.MAX_SAFE_INTEGER,
          tick: runtime.kernel.tick,
          reason: [...REFUSAL_REASONS].sort((left, right) => right.length - left.length)[0],
        },
      };
      const cloneStartedAt = performance.now();
      structuredClone(payload);
      const cloneMs = performance.now() - cloneStartedAt;

      expect(counts.prisoners).toBe(actorCount);
      expect(counts.rooms).toBe(CELL_COUNT);
      expect(counts.staff).toBe(GUARD_COUNT);
      // Fifteen scalars always present, whatever the population, plus one
      // conditional sixteenth. It was ten until the treasury balance joined
      // them (#96), eleven until #29's "earned today" accrual did, twelve
      // until `accommodationCapacity` gave the strip's occupancy bar a
      // denominator, and thirteen until payroll (ADR 0042 step 3) added the
      // wage bill and the arrears together -- two fields rather than one
      // because the balance cannot go negative, so what the prison owes
      // cannot be read off what it holds.
      //
      // **The fifteenth is `activeIncidentType`, and it is the one key here
      // that is not always present** (issue #506 finding 2): a stable id when
      // the worker can name exactly one open incident's kind, *omitted* --
      // never present-and-`undefined` -- otherwise, for the reason
      // `StatusStripViewModel.counts.activeIncidentType`'s own doc comment
      // gives (the pulled `hud/status-strip` route validates this same
      // object with `jsonValueSchema`, which accepts a missing key but not an
      // explicit `undefined` value). This scenario opens no incident, so it
      // is absent here and the count is 15; a session with one open reads 16.
      // The exact count is still pinned rather than bounded so that a *list*
      // arriving here -- the thing this channel is shaped to exclude --
      // cannot slip in as "one more field". A scalar being added is a
      // one-line, visible edit; that is the point, and it holds exactly the
      // same whether the added scalar's key is always present or
      // conditional.
      //
      // This is what a status-counts
      // payload is, and why it needs no paging.
      expect(Object.keys(counts)).toHaveLength(counts.activeIncidentType === undefined ? 15 : 16);
      // And the exclusion stated directly, rather than only as a byte budget
      // that a list would happen to breach. The key count above cannot see a
      // field that *stayed* one key and became a list, and the size bound
      // below can only see it while the list is long enough to notice; this
      // sees it at length zero, at any population, for ever.
      //
      // Added with the thirteenth count, because that field moved the size
      // bound and a relaxed bound needs the property it was standing in for to
      // be asserted somewhere it cannot be relaxed.
      //
      // `activeIncidentType` is named explicitly rather than silently
      // exempted: a *second* non-scalar field arriving later still fails this
      // loop until it, too, is named here, which is what keeps "a list cannot
      // slip in" true of the whole payload and not only of the fifteen
      // fields that predate this one.
      for (const [key, value] of Object.entries(counts)) {
        if (key === 'activeIncidentType') {
          expect(
            typeof value === 'string' || value === undefined,
            `counts.${key} is not a stable id or undefined`,
          ).toBe(true);
          continue;
        }
        expect(typeof value, `counts.${key} is not a scalar`).toBe('number');
        expect(Number.isInteger(value), `counts.${key} is not an integer`).toBe(true);
      }
      // And the refusal beside them is one fixed record of three scalars, not
      // a queue: exactly the shape a snapshot channel can carry honestly
      // (`RefusalLog`). A queue would put the one growing thing this channel
      // is designed to exclude right next to the counts.
      expect(Object.keys(payload.refusal)).toHaveLength(3);
      // 533 and not 493, and the raise is derived from a run rather than
      // chosen -- the same way 493 replaced 436. Issue #506 finding 2 added
      // `activeIncidentType`, sized here at its worst case
      // (`'gang-retaliation'`, the longest `IncidentType` spelling, forced
      // into `payload.counts` above exactly as the longest refusal reason is
      // forced into `payload.refusal`). Re-measured on this tree with it:
      // `payloadJsonBytes=513` at 250 actors and `515` at 1,000, 2,500 and
      // 5,000 -- flat in the population exactly as before, which is the
      // property this bound exists to protect: `activeIncidentType` is one
      // field regardless of how many prisoners or sectors the session holds.
      // 515 + 18 = **533**, which leaves the same 18 bytes of head room every
      // previous bound was set to leave, so a *seventeenth* count breaches
      // this one too and the channel's soft limit goes on being felt one
      // field at a time.
      //
      // The bound is not what stops a list arriving -- the scalar assertion
      // above is, at any length, which is why that was added the last time
      // this bound was relaxed.
      expect(JSON.stringify(payload).length).toBeLessThan(533);

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
