import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { defaultContrabandRegistry } from '../../src/content/contraband-catalog';
import { TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS, TREASURY_STARTING_BALANCE_MINOR_UNITS } from '../../src/simulation/economy';
import { HUD_VIEW_MODEL_SCHEMA_VERSION } from '../../src/simulation/presentation/view-model';
import { decodeWorkerToMainMessage } from '../../src/simulation/protocol/decode';
import {
  PRISON_CONDITIONS,
  REFUSAL_REASONS,
  refusalSchema,
  SIMULATION_PROTOCOL_VERSION,
  type MainToWorkerMessage,
  type SimulationRefusal,
} from '../../src/simulation/protocol/types';
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
import { projectStatusCounts, statusCountsEqual } from '../../src/simulation/worker/status-counts';
import type { SimulationStatusCounts } from '../../src/simulation/protocol/types';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { buildDeterminismScenario, SCENARIO_SEED, submitScenarioCommands } from '../helpers/determinism-scenario';
import { expectOk } from '../helpers/expect-ok';

/**
 * The longest string `counts.contrabandNameKey` can carry, read off the real
 * catalog rather than written out here.
 *
 * Derived, because a literal would stop being the longest the moment a sixth
 * category with a longer id was authored, and the payload bound below is only
 * a bound if it was measured at the worst case. It is not a fixture supplying
 * both sides of a comparison (`docs/TESTING.md`): nothing under test computes
 * it -- the projection publishes whichever `nameKey` the confiscations name,
 * and this picks the largest of the five for a size measurement.
 */
const LONGEST_CONTRABAND_NAME_KEY: string = defaultContrabandRegistry
  .all()
  .map((category) => category.nameKey)
  .reduce((longest, nameKey) => (nameKey.length > longest.length ? nameKey : longest));

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
    /**
     * Absent until the session has refused something (#261).
     *
     * **`SimulationRefusal` itself, not a hand-written restatement of it**
     * (issue #1304). This block used to spell out `refusalSchema`'s members
     * by hand, and the comment above `routeDecidedSince` claimed the copy was
     * *"exactly as `SimulationRefusal` declares it"* -- a claim nothing
     * checked, made in the same file whose worst-case fixture had already
     * drifted from that schema for three days (#1268). A second mirror of a
     * `.strict()` schema is the defect, so it is deleted rather than
     * corrected: a fifth member now arrives here for free.
     *
     * The rest of `Published` stays deliberately loose -- `kind` is `string`
     * and `counts` is `Record<string, number>` -- because this interface
     * describes what came *off the port* before the decoder has vouched for
     * it, and the tests below check those two by assertion. `refusal` is
     * different only in that a tie was available and the drift it would have
     * caught was real.
     */
    readonly refusal?: SimulationRefusal;
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
      /*
       * **All four are unguarded, and this used to read three zeroes.**
       *
       * The comment here said *"All four prisoners in this scenario are still
       * in intake and none of them is standing in a sector yet, so no rung
       * holds anybody. Three zeroes here is a real state -- 'nobody is in a
       * sector' -- and not a missing reading."* The first clause is true and
       * the conclusion drawn from it was not. Every session carries a derived
       * default sector since
       * [ADR 0036](../../docs/adr/0036-a-derived-default-security-sector.md),
       * and `resolveSectorOccupants` counts the **whole prison** as its
       * occupants -- so all four prisoners were standing in a sector all
       * along, in the one sector nobody has to zone. That sector asks for a
       * guard and this scenario's five are every one of them unassigned
       * (`staffUnassigned: 5` above), so its rung is `unguarded` and the
       * honest reading is four.
       *
       * The zeroes were the un-walked census, not a state.
       * `SafetyCoverageSystem` filled its census on its first scheduled update
       * and this harness restores a snapshot without running one, so what the
       * assertion pinned was `EMPTY_SAFETY_COVERAGE_CENSUS` -- and pinning it
       * made this fixture an example of the defect rather than a guard against
       * it: `coverageTone` returns `undefined` for `0/0/0` and `coverageBadge`
       * then prints the green **Covered** pill, so the strip this payload
       * paints promised a covered prison over four unguarded people and five
       * idle guards. `restoreSimulationRuntime` now takes the census at the
       * load (`docs/PERSISTENCE.md`, "What is deliberately excluded from the
       * payload").
       *
       * Marked rather than overwritten, because the old sentence was a
       * reasonable reading of a real fact and the next person to meet an
       * unexpected non-zero here should see why it moved.
       */
      prisonersCovered: 0,
      prisonersUnderstaffed: 0,
      prisonersUnguarded: 4,
      // The starting balance, unspent: this scenario buys nothing, so the
      // number is `TREASURY_STARTING_BALANCE_MINOR_UNITS` and reads as one
      // rather than as an arbitrary constant (#96).
      // `false`, and **not** because `roomCapacity: 4` above is nonzero:
      // this is `RoomInstanceRegistry.totalResidentCapacity === 0`, the
      // registry's own walk, which the host read as `roomCapacity === 0`
      // until 2026-09-15 and got a different answer from on any prison holding
      // a room the content catalogue does not define
      // (`statusCountsSchema.isFreshUnfurnishedPrison`, and
      // `tests/integration/economy-fresh-unfurnished-prison-definition.test.ts`
      // is the prison where they come apart). This scenario's rooms are all
      // catalogued, so the two agree here, which is the ordinary case.
      isFreshUnfurnishedPrison: false,
      treasuryMinorUnits: TREASURY_STARTING_BALANCE_MINOR_UNITS,
      // The facility under it, published since the owner's ruling 18 of
      // 2026-08-31 so the strip can say how much of it is left rather than only
      // that the balance has gone negative. It is the treasury's own
      // `overdraftFloorMinorUnits` -- `createNewSimulationRuntime` sets it to
      // `TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS`, one tenth of the grant, so this
      // reads as that constant rather than as an arbitrary -2,500.
      treasuryOverdraftFloorMinorUnits: TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS,
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
      // Zero for the same reason `roomOccupants` is, and **not** because the
      // two are the same number: this scenario's four prisoners are all still
      // in intake, so nobody holds an assignment and nobody holds a place.
      // They come apart when a place stops existing under a sitting resident,
      // which is `tests/integration/economy-occupied-place-exists.test.ts`'s
      // subject rather than this fixture's (issue #585).
      occupiedPlaces: 0,
      activeIncidents: 0,
      contrabandDiscovered: 0,
      // Zero, and not because the day has just started: this scenario's four
      // prisoners are all still in intake (`prisonersInIntake: 4` above), so
      // none of them holds an occupancy slot -- `roomOccupants: 0` says the
      // same thing -- and an occupied place is what the state pays for (#29).
      // Six registered room instances with four beds between them earn
      // nothing while they are empty.
      stateIncomeAccruedTodayMinorUnits: 0,
      // Zero for a second reason, which is why it is asserted beside the line
      // above rather than assumed to follow it (issue #890): withholding is
      // per **occupied place**, and this scenario has none. A prison earning
      // nothing is not a prison having something withheld -- the two are the
      // same number here and come apart the moment anybody is housed.
      stateIncomeWithheldTodayMinorUnits: 0,
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
      // None standing (ADR 0087 decision 2): the treasury above is untouched
      // and well above either rung, the build queue has placed no order yet,
      // and `prisonersInIntake: 4` above are all still at `queued`/`reception`
      // rather than `accommodation-assignment`, so `waitingWithoutPlace` is
      // zero too. An empty array rather than an absent key -- `conditions` is
      // always published, see its own doc comment.
      conditions: [],
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
      expectOk(decoded, `the status-counts publication stamped tick ${String(publication.payload.tick)}`);
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

  /**
   * **ADR 0091 decision 2, option F (ruled by the owner 2026-09-16): the
   * publication gate has to open on a flag that moves no ordinal.**
   *
   * `RefusalLog.supersede` sets `routeDecidedSince` on the *standing* record
   * when the same route decides something at a different target, so nothing
   * about that record's `sequence` changes -- and the gate above is a
   * comparison against `_publishedRefusalSequence`. Without a second
   * watermark this publication does not happen at all, and the band never
   * learns it should retire the sentence: the same failure mode #261 names
   * for a refusal that moves no count, one field over.
   *
   * The counts are asserted equal to the previous publication for exactly
   * that reason -- if a count had moved, the interval gate could have carried
   * this message anyway and the test would be pinning nothing.
   */
  test('publishes again when the standing refusal own route decides elsewhere, though its ordinal never moves (ADR 0091)', () => {
    const harness = new Harness();
    harness.run(1);
    // Refused: outside the one owned chunk.
    submitBuildOrder(harness['machine'], 0, { x: 100, y: 100 }, 0);
    harness.advance(50);
    const refused = harness.publications();
    expect(refused).toHaveLength(2);
    expect(refused[1]?.payload.refusal).toEqual({ sequence: 1, tick: 0, reason: 'build.out-of-bounds' });

    // Accepted: inside it, and a different tile, so #492's key misses and the
    // refusal is *not* withdrawn. Same route, so option F marks it.
    submitBuildOrder(harness['machine'], 1, { x: 4, y: 4 }, 1);
    harness.advance(50);

    const after = harness.publications();
    expect(after, 'a publication the sequence gate alone would have suppressed').toHaveLength(3);
    expect(after[2]?.payload.refusal).toEqual({
      sequence: 1,
      tick: 0,
      reason: 'build.out-of-bounds',
      routeDecidedSince: true,
    });
    // Nothing but the flag can have caused this message: the interval gate
    // returns early unless `eventIsNew`, and only 100 ms of the 500 ms
    // interval has elapsed. A moved count is not enough to get past it --
    // which matters here, because the accepted order *does* move the treasury.
    expect(harness.elapsedMs).toBeLessThan(STATUS_COUNTS_PUBLISH_INTERVAL_MS);

    // And it does not become a new firehose: the flag is monotone per record,
    // so the gate opens once for it and not once per wake thereafter.
    for (let wake = 0; wake < 200; wake += 1) harness.advance(50);
    expect(harness.publications()).toHaveLength(3);
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
      expect(publication.payload.refusal).toMatchObject({ sequence: 1, tick: 0, reason: 'build.out-of-bounds' });
    }

    /*
     * **This case asserted the whole object until ADR 0091 decision 2 (option
     * F, ruled 2026-09-16), and the clause that moved is worth naming rather
     * than quietly relaxing.** The record really is republished unchanged --
     * `sequence`, `tick` and `reason` are asserted above on every carrying
     * publication, which is what this test has always been about. What is new
     * is a fourth member that is *not* part of the record: the scenario
     * session's own queued build orders succeed as the clock runs, and a
     * success on the `build` route marks the standing `build.out-of-bounds`
     * refusal as no longer being about anything the player is looking at.
     *
     * So the property to pin is that the mark is **monotone** -- it appears
     * once and never comes back off a republication -- because a flag that
     * flickered would make the band show a retired sentence again. The record
     * itself is untouched either way, which the `toMatchObject` assertions
     * above and `refusals.count` in `tests/unit/simulation-refusals.test.ts`
     * both hold.
     */
    const marks = carrying.map((publication) => publication.payload.refusal?.routeDecidedSince === true);
    expect(marks, 'the scenario builds successfully as it runs, so the mark has to arrive').toContain(true);
    expect(
      marks.slice(marks.indexOf(true)).every((mark) => mark),
      'a route cannot un-decide: once marked, every later republication carries it',
    ).toBe(true);
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
    expectOk(decoded, 'the status-counts publication once it carries a refusal');
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
      //
      // **And since issue #703 ruling 3 the same forcing covers
      // `contrabandNameKey`**, the second optional field on this payload and
      // the longest string it can carry: `'contraband.currency.name'` is the
      // longest of the five `nameKey`s in
      // `src/content/contraband-catalog.ts`. This scenario runs no searches, so
      // the field is absent in what `projectStatusCounts` returned; the bound
      // has to hold for the publication that names a category, so the worst
      // case is forced here for the same reason the incident kind is.
      const payload = {
        tick: runtime.kernel.tick,
        schemaVersion: HUD_VIEW_MODEL_SCHEMA_VERSION,
        counts: {
          ...counts,
          activeIncidentType: 'gang-retaliation' as const,
          contrabandNameKey: LONGEST_CONTRABAND_NAME_KEY,
        },
        refusal: {
          sequence: Number.MAX_SAFE_INTEGER,
          tick: runtime.kernel.tick,
          reason: [...REFUSAL_REASONS].sort((left, right) => right.length - left.length)[0],
          // **And since issue #1261 the same forcing covers
          // `routeDecidedSince`** (issue #1268), the fourth and last member of
          // `refusalSchema` and the only optional one: `z.literal(true)`, set
          // on the *standing* record by `RefusalLog.supersede` when a press on
          // the same route has since been decided (ADR 0091 option F). This
          // scenario supersedes nothing, so the flag is absent from what the
          // log would hand over; the bound has to hold for the publication
          // that carries it, so the worst case is forced here for exactly the
          // reason `activeIncidentType` and `contrabandNameKey` are.
          //
          // It is a literal rather than a boolean, so `true` is the only
          // spelling and there is no longer one to reach for. Forcing it is
          // what this fixture's own header asks for in as many words -- *"a
          // measurement taken without it would understate every publication
          // that carries one (#261)"* -- and between #1261 shipping the field
          // and this line, it did: by 25 bytes, which is 7 more than the head
          // room the old bound had.
          routeDecidedSince: true as const,
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
      // is absent here and the count is 20; a session with one open reads 21.
      // It was 18 and 19 until issue #585's `occupiedPlaces` -- the residency
      // places that currently exist, published beside `roomOccupants` because
      // the two stopped being the same number -- and 19 and 20 until the
      // owner's ruling 18 of 2026-08-31 added `treasuryOverdraftFloorMinorUnits`,
      // the treasury's own floor, without which the strip could say the balance
      // was negative and not how much of the facility was left.
      //
      // **`contrabandNameKey` is the second conditional key** (issue #703
      // ruling 3): the contraband catalog's own `nameKey` when every item the
      // count reports shares one category, omitted otherwise. This scenario
      // runs no searches and confiscates nothing, so it too is absent here and
      // 20 is still 20 -- a session that has found one category reads 21, and
      // one that has found a phone and a weapon reads 20 again. The two
      // conditional keys are independent, so the reachable counts are 20, 21
      // and 22; the expression below states each key's own contribution rather
      // than enumerating the four combinations.
      // The exact count is still pinned rather than bounded so that a *list*
      // arriving here -- the thing this channel is shaped to exclude --
      // cannot slip in as "one more field". A scalar being added is a
      // one-line, visible edit; that is the point, and it holds exactly the
      // same whether the added scalar's key is always present or
      // conditional.
      //
      // This is what a status-counts
      // payload is, and why it needs no paging.
      //
      // **22, not 21, since `isFreshUnfurnishedPrison` was published on
      // 2026-09-15.** ADR 0017's "Amendment, 2026-09-01" §2 defines the
      // predicate as `RoomInstanceRegistry.totalResidentCapacity === 0`, and
      // `projectStatusStrip` computed it and dropped it while three host sites
      // re-derived a different answer from `roomCapacity`. It is an always-present
      // scalar, so it moves the base count by exactly one -- which is the
      // visible one-line edit this assertion exists to force.
      //
      // **21, not 20, since ADR 0087 decision 2 added `conditions`.** Unlike
      // the two conditional keys below it, `conditions` is a third field this
      // object admits as `.optional()` on the wire yet **always** publishes --
      // see its own doc comment in `src/simulation/protocol/types.ts` for why
      // -- so it adds exactly one to the base count for every scenario this
      // test drives, never zero and never a second conditional term.
      expect(Object.keys(counts)).toHaveLength(
        23 + (counts.activeIncidentType === undefined ? 0 : 1) + (counts.contrabandNameKey === undefined ? 0 : 1),
      );
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
      // fields that predate this one. Eighteen since issue #588 added the
      // three guard-coverage rungs the population is standing on, nineteen
      // since issue #585 added `occupiedPlaces`, and twenty since the owner's
      // ruling 18 of 2026-08-31 added `treasuryOverdraftFloorMinorUnits`.
      for (const [key, value] of Object.entries(counts)) {
        if (key === 'activeIncidentType' || key === 'contrabandNameKey') {
          expect(
            typeof value === 'string' || value === undefined,
            `counts.${key} is not a stable id, a message key or undefined`,
          ).toBe(true);
          continue;
        }
        // The one deliberate exception (ADR 0087 decision 2), named for the
        // same reason `activeIncidentType` is: an array is exactly the shape
        // this loop exists to catch, and `conditions` is allowed to be one
        // only because it is bounded by a closed union's own size rather than
        // by anything that grows with the population -- asserted here rather
        // than assumed, so a `PrisonCondition` member added later that this
        // scenario happens to trigger cannot silently widen the array past
        // that bound.
        if (key === 'conditions') {
          expect(Array.isArray(value), 'counts.conditions is not an array').toBe(true);
          const conditions = value as readonly string[];
          expect(conditions.length, 'counts.conditions grew past the closed union it is drawn from').toBeLessThanOrEqual(
            PRISON_CONDITIONS.length,
          );
          for (const condition of conditions) {
            expect(PRISON_CONDITIONS as readonly string[], `counts.conditions holds an unknown id ${condition}`).toContain(
              condition,
            );
          }
          continue;
        }
        // **The first boolean on this channel** (2026-09-15):
        // `isFreshUnfurnishedPrison`, ADR 0017's amendment §2 predicate,
        // published so the host stops re-deriving one from `roomCapacity`. A
        // boolean is a scalar and is exactly what this loop is protecting --
        // it is named here rather than waved through by loosening the check
        // below, so a count that started arriving as `0`/`1`, or a second
        // boolean nobody meant to add, still fails.
        if (key === 'isFreshUnfurnishedPrison') {
          expect(typeof value, 'counts.isFreshUnfurnishedPrison is not a boolean').toBe('boolean');
          continue;
        }
        expect(typeof value, `counts.${key} is not a scalar`).toBe('number');
        expect(Number.isInteger(value), `counts.${key} is not an integer`).toBe(true);
      }
      // And the refusal beside them is one fixed record of three scalars, not
      // a queue: exactly the shape a snapshot channel can carry honestly
      // (`RefusalLog`). A queue would put the one growing thing this channel
      // is designed to exclude right next to the counts.
      // **Four since issue #1261, not three** (issue #1268). The count is the
      // point of the assertion and not an incidental number: `refusalSchema`
      // is `.strict()` and closed at `sequence`, `tick`, `reason` and
      // `routeDecidedSince`, so this line is what fails if a fifth member --
      // or a queue wearing one member's name -- arrives without this fixture
      // being re-measured. It stood at 3 for the two days after #1261 shipped
      // the fourth, which is precisely why the stale byte figure below went
      // unnoticed: the fixture could not carry the new field without this
      // line moving in the same edit, so nothing ever prompted the first
      // change.
      expect(Object.keys(payload.refusal)).toHaveLength(4);
      // **And it is the refusal `refusalSchema` declares, member for member**
      // (issue #1304). The line above counts; this one says *which*, against
      // the schema itself rather than against a number written here.
      //
      // The asymmetry it removes was measured on this file (#1304). Deleting
      // a member from `refusalSchema` already failed `tsc` in six places, so
      // **removal** was gated and still is -- nothing below replaces that.
      // **Addition** was gated by nothing: a new optional member compiled,
      // shipped, widened every publication carrying it, and left the byte
      // bound below stale and green. That is not hypothetical --
      // `routeDecidedSince` did exactly this between #1261 (2026-09-16) and
      // #1268, breaching the pinned bound by 7 bytes for three days.
      //
      // This is the missing direction and nothing more. It fails when the
      // schema gains a member the fixture above does not force, and the
      // failure **names the member** -- which a length assertion cannot do,
      // and which is the whole reason the worst case has to be re-measured
      // rather than merely re-counted. `.strict()` makes the schema's key set
      // the closed truth about this record, so the two sides of this
      // comparison are the wire shape and the thing claiming to be its worst
      // case; neither is a copy of the other.
      expect(
        Object.keys(payload.refusal).sort(),
        'the worst-case fixture no longer forces every member `refusalSchema` declares -- re-measure the byte bound below against the new member rather than raising it',
      ).toEqual(Object.keys(refusalSchema.shape).sort());
      // **710 and not 669, and the raise is derived from a run rather than
      // chosen** -- the same way every bound below replaced the one before it.
      // The bound it replaces predicted this raise in as many words: it said a
      // *twenty-first* count would breach it. The owner's ruling 18 of
      // 2026-08-31 added the twenty-first, `treasuryOverdraftFloorMinorUnits`
      // -- the treasury's own floor, without which the strip could say the
      // balance had gone negative and not how much of the facility was left.
      // Re-measured on this tree with it, at the same worst case every previous
      // raise used: `payloadJsonBytes=690` at 250 actors and `692` at 1,000,
      // 2,500 and 5,000 -- still flat in the population, which is the property
      // this bound exists to protect and the one the new field had to keep: a
      // floor is one integer whether the prison holds four prisoners or five
      // thousand. 692 + 18 = **710**, the same 18 bytes of head room every
      // previous bound was set to leave, so a *twenty-second* count breaches
      // this one too.
      //
      // The 41 bytes it costs are almost all key: `treasuryOverdraftFloorMinorUnits`
      // is the longest name on this channel, which is the second time in this
      // paragraph's history that a field's *spelling* rather than its magnitude
      // moved the bound (`contrabandNameKey` was the first, for the opposite
      // reason -- its value is a key).
      //
      // **What the 669 bound recorded about its own raise, kept whole:**
      //
      // **669 and not 622, and the raise is derived from a run rather than
      // chosen** -- the same way 622 replaced 603, 603 replaced 533, 533
      // replaced 493 and 493 replaced 436. The bound it replaces predicted
      // this one too, in as many words: it said a *twentieth* count would
      // breach it "and the soft limit goes on being felt one field at a
      // time". Issue #703 ruling 3 added the twentieth, `contrabandNameKey`
      // -- the name of what a search actually took off somebody, which this
      // channel counted and never named. Re-measured on this tree with it, at
      // the same worst case every previous raise used and with the new field
      // forced to the longest of the five catalog `nameKey`s:
      // `payloadJsonBytes=649` at 250 actors and `651` at 1,000, 2,500 and
      // 5,000 -- still flat in the population, which is the property this
      // bound exists to protect and the one the new field had to keep: a
      // category name is one string whether the prison holds four prisoners
      // or five thousand. 651 + 18 = **669**, the same 18 bytes of head room
      // every previous bound was set to leave, so a *twenty-first* count
      // breaches this one too.
      //
      // **This is the first field whose worst case is not a digit count**,
      // and it is worth naming because it costs 27 bytes rather than the one
      // or two a scalar costs: a key is as long as the id behind it. A sixth
      // contraband category with a longer id widens this payload without any
      // count changing, which is what the derived
      // `LONGEST_CONTRABAND_NAME_KEY` above makes visible here rather than in
      // production.
      //
      // **What the 622 bound recorded about its own raise, kept whole because
      // it is the worked example this one is written against:**
      //
      //   622 and not 603, and the raise is derived from a run rather than
      //   chosen -- the same way 603 replaced 533, 533 replaced 493 and 493
      //   replaced 436. **The bound it replaces predicted this raise in as
      //   many words**: it said a *nineteenth* count would breach it "and the
      //   channel's soft limit goes on being felt one field at a time". Issue
      //   #585 added the nineteenth, `occupiedPlaces` -- the residency places
      //   that currently exist, which is what the state actually pays for and
      //   which nothing published. Re-measured on this tree with it, at the
      //   same worst case every previous raise used (`activeIncidentType`
      //   forced to `'gang-retaliation'`, the longest `IncidentType`
      //   spelling, and the longest refusal reason forced into
      //   `payload.refusal`): `payloadJsonBytes=602` at 250 actors and `604`
      //   at 1,000, 2,500 and 5,000 -- still flat in the population, which is
      //   the property this bound exists to protect and the one the new field
      //   had to keep: a count of occupied places is one integer whether the
      //   prison holds four prisoners or five thousand. The two-byte spread
      //   between the tiers is the same digit-count spread the 583/585 pair
      //   had, not growth. 604 + 18 = **622**, which leaves the same 18 bytes
      //   of head room every previous bound was set to leave, so a
      //   *twentieth* count breaches this one too and the soft limit goes on
      //   being felt one field at a time.
      //
      // That last sentence came true, which is why the paragraph above it
      // exists. The two-byte spread it describes is still what the tiers show
      // (649 / 651), so the raise is one field's worth of string and not
      // population growth.
      //
      // The bound is not what stops a list arriving -- the scalar assertion
      // above is, at any length, which is why that was added the last time
      // this bound was relaxed.
      //
      // **728 and not 710, and the raise is a longer refusal reason rather
      // than a new field.** ADR 0107 (`cancel-build-order.stale-cancellation`,
      // 37 characters) replaced `place-object.not-a-placeable-object` (35) as
      // the longest member of `REFUSAL_REASONS` -- the same string this test's
      // own `[...REFUSAL_REASONS].sort(...)[0]` picks up automatically, so
      // nothing here had to be told the new value. Re-measured on this tree:
      // `payloadJsonBytes=708` at 250 actors and `710` at 1,000, 2,500 and
      // 5,000 -- two bytes over the previous tier's own worst case, which is
      // exactly the two-character difference between the two reasons and
      // nothing more, so this is the `contrabandNameKey`/
      // `treasuryOverdraftFloorMinorUnits` shape again: a field's *spelling*
      // moving the bound, not the population or the count of fields. 710 + 18
      // = **728**, the same headroom every previous raise in this file left.
      //
      // **761 and not 728, and the raise is one new field** --
      // `isFreshUnfurnishedPrison`, ADR 0017's amendment §2 predicate,
      // published on 2026-09-15 so the three host sites stop re-deriving it
      // from `roomCapacity`. Re-measured on this tree at the same worst case
      // every previous raise used: `payloadJsonBytes=741` at 250 actors and
      // `743` at 1,000, 2,500 and 5,000 -- still the two-byte digit-count
      // spread between the tiers rather than growth, which is the property
      // this bound exists to protect and the one a boolean trivially keeps.
      // The 33 bytes are arithmetic rather than a measurement to be trusted on
      // its own: `"isFreshUnfurnishedPrison":false,` is 26 + 1 + 5 + 1, and
      // `false` is the longer of the two spellings, so this is the worst case
      // and not a sample of it. 743 + 18 = **761**, the same headroom every
      // previous raise in this file left, so the next field breaches this one
      // too and the soft limit goes on being felt one field at a time.
      //
      // **786 and not 761, and the raise is a field that shipped on
      // 2026-09-16 and never reached this fixture** (issue #1268) --
      // `routeDecidedSince`, which #1261 added to `refusalSchema` under ADR
      // 0091 option F. This is the first raise in this paragraph's history
      // that corrects a bound which was *already wrong* rather than one that a
      // new field has just outgrown: 761 was derived correctly from a
      // worst case that had stopped being the worst case. Re-measured on this
      // tree with the flag forced, at the same worst case every previous raise
      // used: `payloadJsonBytes=766` at 250 actors and `768` at 1,000, 2,500
      // and 5,000 -- still the same two-byte digit-count spread between the
      // tiers rather than growth, which is the property this bound exists to
      // protect and the one a literal trivially keeps.
      //
      // The 25 bytes are arithmetic rather than a measurement to be trusted on
      // its own: `,"routeDecidedSince":true` is 1 + 19 + 1 + 4, and
      // `z.literal(true)` admits no other spelling, so this is the worst case
      // and not a sample of it. 768 + 18 = **786**, the same headroom every
      // previous raise in this file left, so the next field breaches this one
      // too and the soft limit goes on being felt one field at a time.
      //
      // **What 761 was measured against, kept rather than overwritten,
      // because the gap is the finding.** It was `payloadJsonBytes=741` and
      // `743` -- exactly 25 short of the figures above at both tiers, i.e.
      // this one field and nothing else. **768 is over 761**, so the honest
      // largest declared payload had been breaching its own pinned bound by 7
      // bytes for two days and no run said so.
      //
      // **800 and not 761, and the raise is one new field** --
      // `stateIncomeWithheldTodayMinorUnits`, issue #890's measurement of a
      // prison paying 40% under its headline grant with no figure for the
      // shortfall anywhere outside the worker. Re-measured on this tree at
      // the same worst case every previous raise used:
      // `payloadJsonBytes=780` at 250 actors and `782` at 1,000, 2,500 and
      // 5,000 -- still the two-byte digit-count spread between the tiers
      // rather than growth, which is the property this bound exists to
      // protect and the one an integer keeps. 782 + 18 = **800**, the same
      // headroom every previous raise in this file left, so the next field
      // breaches this one too.
      //
      // **The 39 bytes are 38 of spelling and one of value, and that second
      // number is not a worst case -- stated rather than implied, because
      // every raise above could say the same and none of them did.**
      // `"stateIncomeWithheldTodayMinorUnits":` is 36 + 1, the comma is one
      // more, and this fixture houses nobody, so the value is the single
      // digit `0`. The field is bounded by
      // `STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS x occupied places`, so a
      // populated prison spends more digits here -- exactly as
      // `treasuryMinorUnits` and `stateIncomeAccruedTodayMinorUnits` beside
      // it do, and exactly what the two-byte tier spread this paragraph keeps
      // quoting already is. The 18 bytes of head room absorb it; a reader
      // raising this bound next should know they are raising it from a
      // measurement whose money fields are at their smallest.
      //
      // **825, and neither 786 nor 800 -- the two figures above were measured
      // on branches that could not see each other, and this is the merge that
      // had to re-measure rather than pick.** Both paragraphs above raise
      // *this* line from the same 761 base, for different fields, and both
      // derivations are correct about their own field and wrong about the
      // payload: with `routeDecidedSince` forced **and**
      // `stateIncomeWithheldTodayMinorUnits` published, the worst case is
      // larger than either was measured against. 786 would put the bound
      // *below* a payload `main` already carries; 800 would silently discard
      // the finding the paragraph before it is for. So both are kept above,
      // unedited, and this third one replaces neither.
      //
      // Re-measured on the merged tree, at the same worst case every previous
      // raise used: `payloadJsonBytes=805` at 250 actors and `807` at 1,000,
      // 2,500 and 5,000 -- still the same two-byte digit-count spread between
      // the tiers rather than growth, which is the property this bound exists
      // to protect. 807 + 18 = **825**, the same headroom every previous
      // raise in this file left.
      //
      // **The two fields are exactly additive, which is the check that makes
      // this a measurement rather than a sum.** 741 + 25 + 39 = 805 and
      // 743 + 25 + 39 = 807, against the 741/743 the 761 bound was derived
      // from -- so neither field changes the other's cost, and the
      // arithmetic each paragraph above gives for its own field survives
      // being combined. Had the measured figure and the sum disagreed, this
      // comment would say so and the bound would follow the measurement.
      //
      // **And the 7-byte breach the #1268 paragraph reports is not history:
      // it is live on `main` as this is written, and it is the same 7
      // bytes.** `main` pins 800 and its fixture measures 780/782, so `main`
      // is green -- but `main`'s fixture still omits `routeDecidedSince`, and
      // the honest largest payload `main` can publish is 807. 807 - 800 = 7,
      // the identical figure, because #1302 left the same 18 bytes of head
      // room and the missing field costs 25. The bound has now been breached
      // by exactly 7 bytes twice in a row, by two unrelated raises, for the
      // one reason #1304 exists to remove: nothing ties the fixture to the
      // shape it claims to be the worst case of.
      expect(JSON.stringify(payload).length).toBeLessThan(825);

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

describe('statusCountsSchema.conditions: the bound is enforced at decode, not only observed at production', () => {
  /**
   * `PRISON_CONDITIONS.length` closed-union members is the bound decision 2
   * states -- "bounded by the union's own size" -- and the schema encodes it
   * as `.max(PRISON_CONDITIONS.length)`. The "grew past the closed union"
   * assertion earlier in this file only ever sees what
   * `computeStandingPrisonConditions` actually produces, which can never
   * exceed that bound by construction; it cannot tell a correct `.max()` from
   * a loosened one. This test attacks the schema directly: it takes one real
   * published message, over-fills `counts.conditions` past the union's size,
   * and asserts the decoder -- "the gate every worker message passes through"
   * (this file's own words, above) -- refuses it.
   */
  test('a conditions array longer than the closed union is rejected by the decoder', () => {
    // No `run`/`advance` needed: `handleInitialize` publishes one baseline
    // status-counts message synchronously (see "publishes exactly one
    // baseline reading on initialize" above), which is enough to attack.
    const harness = new Harness(scenarioSnapshot());

    const [published] = harness.publications();
    if (published === undefined) throw new Error('the fixture must have produced at least one publication to attack');
    expectOk(decodeWorkerToMainMessage(published), 'the unmodified publication this case builds its attack from');

    const overfilled = {
      ...published,
      payload: {
        ...published.payload,
        counts: {
          ...published.payload.counts,
          // One more than the union has members, and not drawn from thin air:
          // reusing existing ids keeps this attacking the *count* bound
          // specifically rather than accidentally tripping the enum check
          // too.
          conditions: [...PRISON_CONDITIONS, PRISON_CONDITIONS[0]],
        },
      },
    };
    const decoded = decodeWorkerToMainMessage(overfilled);
    expect(decoded.ok, 'an over-long conditions array must be refused, not silently accepted').toBe(false);
  });
});

/**
 * `statusCountsEqual`'s `conditions` special-case, directly (ADR 0087
 * decision 2): `computeStandingPrisonConditions` allocates a fresh array on
 * every call even when its contents are unchanged, so a naive `!==` on it (the
 * comparison every other field here correctly uses) would answer "changed" on
 * every publication a treasury or a build queue happens to touch, whatever the
 * actual set is -- suppressing nothing and defeating the whole point of this
 * function. No test drives a real session to the point of proving that in
 * practice (doing so deterministically would mean holding a balance and a
 * build queue exactly still across two publications), so this exercises the
 * pure function directly with two distinct array instances holding the same
 * ids.
 */
describe('statusCountsEqual: conditions compares by content, not by array identity', () => {
  const BASE = {
    prisoners: 0,
    prisonersInIntake: 0,
    prisonersHighRisk: 0,
    staff: 0,
    staffUnassigned: 0,
    rooms: 0,
    roomCapacity: 0,
    // A prison with nothing registered is fresh on the registry's own reading,
    // which is the one case where it and `roomCapacity` above cannot disagree.
    isFreshUnfurnishedPrison: true,
    accommodationCapacity: 0,
    roomOccupants: 0,
    activeIncidents: 0,
    contrabandDiscovered: 0,
    treasuryMinorUnits: 0,
    treasuryOverdraftFloorMinorUnits: 0,
    dailyWageBillMinorUnits: 0,
    unpaidWagesMinorUnits: 0,
  } as unknown as SimulationStatusCounts;

  function counts(conditions: readonly string[]): SimulationStatusCounts {
    // A fresh array literal every call -- the same allocation shape
    // `computeStandingPrisonConditions` has, and the one a naive `!==` would
    // wrongly treat as "different" even when the ids inside are identical.
    return { ...BASE, conditions: [...conditions] } as unknown as SimulationStatusCounts;
  }

  test('two different array instances holding the same ids in the same order are equal', () => {
    expect(statusCountsEqual(counts(['intake.no-place']), counts(['intake.no-place']))).toBe(true);
  });

  test('two empty-conditions publications are equal, even as distinct array instances', () => {
    expect(statusCountsEqual(counts([]), counts([]))).toBe(true);
  });

  test('a genuinely different set is not equal', () => {
    expect(statusCountsEqual(counts(['intake.no-place']), counts(['construction.unfunded']))).toBe(false);
  });

  test('a different length is not equal', () => {
    expect(
      statusCountsEqual(
        counts(['construction.unfunded']),
        counts(['construction.unfunded', 'intake.no-place']),
      ),
    ).toBe(false);
  });

  test('the same ids in a different order are not equal (order is meaningful, not just membership)', () => {
    expect(
      statusCountsEqual(
        counts(['construction.unfunded', 'intake.no-place']),
        counts(['intake.no-place', 'construction.unfunded']),
      ),
    ).toBe(false);
  });
});
