import { describe, expect, it } from 'vitest';
import { DEFAULT_ACTIONS } from '../../src/simulation/prisoners/actions';
import { NEED_SCALE } from '../../src/simulation/prisoners/needs';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * Issue #435: **nothing counted a prisoner who got a worse action than the one
 * they wanted**, so
 * [ADR 0041](../../docs/adr/0041-what-happens-when-a-prisoners-chosen-action-has-nowhere-to-go.md)
 * decision 1's fallback had no cost anybody could see. This is the run that
 * says it now has one, and it is deliberately the scenario that defeated the
 * instrument's absence:
 * [ADR 0062](../../docs/adr/0062-who-gets-the-room-when-more-prisoners-want-it-than-it-seats.md)
 * open question 3, in its own words --
 *
 * > `unmetDemandCycles` counts a prisoner who did nothing, and in a housed
 * > prison it is 0 whether twelve prisoners are being quietly downgraded from
 * > the canteen to their cell at every meal or nobody is. Measuring the residue
 * > in open question 1 required a test-only per-prisoner, per-action tick
 * > counter.
 *
 * ## The prison, and why it has no shower room
 *
 * 24 prisoners **admitted in one tick**, in one furnished dormitory (24 beds,
 * 24 toilets, so no `own-accommodation` action is ever scarce), and a canteen
 * whose dining places are the only contended thing in the prison. Admitting
 * them together is what ADR 0062's canteen measurement did and is load-bearing:
 * a population admitted one tick apart runs need trajectories a tick apart, and
 * the residue this file is about is a property of prisoners who are
 * *identical*.
 *
 * No shower room is zoned, and that is the difference between an instrument and
 * a number. `action.shower` is contended in the same way a canteen seat is, so
 * a prison with both mixes two contentions into one counter and no assertion
 * here could say which room the loss was at. With the canteen the only room
 * whose ceiling can bind, `contendedSubstitutionCycles` **is** the canteen
 * count, by construction rather than by inspection.
 *
 * ## The three arms, and what each one is for
 *
 * | canteen | dining places | who is refused | what the counter must read |
 * | --- | --- | --- | --- |
 * | two tables | 6 against 24 | the losers of a contended room | non-zero, and **not the same for everybody** |
 * | nine tables | 27 against 24 | nobody | exactly 0 contended, for every prisoner |
 * | not zoned | none | nobody -- there is nothing to be refused *by* | 0 contended, and a large plain substitution count |
 *
 * The third arm is the one that separates the two numbers this issue adds:
 * every prisoner eats in their cell for the whole run, every meal is a
 * downgrade, and nothing about it is contention. `unmetDemandCycles` is **0**
 * in that prison and in the nine-table one alike, which is exactly the
 * blindness ADR 0062 reported.
 *
 * ## What this file is careful not to be
 *
 * Issue #375's shapes, answered rather than hoped about:
 *
 * - **Nothing here reads the counter to decide what to expect of the counter.**
 *   Canteen entries are counted independently, off
 *   `CurrentActionComponent.actionIndex` and `phase`, by the same watcher ADR
 *   0062 had to write by hand -- and the claim is that the two agree about
 *   *which prisoners*, which is the claim a counter that merely incremented
 *   somewhere would fail.
 * - **The expected values are literals read off the run.** The one arithmetic
 *   figure -- six dining places from two `3x2` tables -- is asserted *against*
 *   the registry rather than handed to it.
 * - **The ceiling is shown to bite.** A control with the same population and a
 *   canteen that seats it reads exactly zero, so a counter that incremented on
 *   every meal would fail there rather than passing everywhere.
 */

const SEED = 0x0b1ec7;
const PRISONERS = 24;

/** One dormitory: 24 beds make its resident capacity 24, and 24 toilets make `sanitation` unscarce. */
const DORM = { x: 0, y: 0, width: 12, height: 6 } as const;
/** Wide enough for nine `3x2` dining tables, so the control differs from the contended arm by seven `PlaceObject` commands and by nothing else. */
const CANTEEN = { x: 16, y: 0, width: 12, height: 8 } as const;
const CANTEEN_ID = 'room.canteen:16:0';

/** `materialsRequired[0].quantity = footprint.width`: 24 `1x1` beds, nine `3x2` tables. Bought in full in every arm, so the arms differ by placements and not by a budget. */
const PLANKS = 24 + 9 * 3;
const BRICKS = 24;

/** Every order is complete well before this; the timeline is asserted, not assumed. */
const BUILT_BY = 6_000;
/** Twelve full general-population days after the admissions -- the window ADR 0062's canteen measurement used. */
const WATCH_UNTIL = 30_000;

/** The tile `src/main.ts` admits at: the middle of the one chunk a new prison owns. */
const ARRIVAL = { x: 16, y: 16 } as const;
/** Long enough that no sentence ends inside the window. */
const ADMISSION = { sentenceLengthTicks: 1_000_000, priorIncidents: 0 } as const;

/** `2` is `performing` in `ACTION_PHASES`; the phase names are not exported. */
const PERFORMING_PHASE = 2;
/** `0` is `idle`, and a tick where somebody is idle is a tick where the scan decides something. */
const IDLE_PHASE = 0;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/** `tables === 0` leaves the canteen unzoned entirely: a want with nowhere to satisfy it, rather than a room that is full. */
function prison(tables: number): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: PLANKS }));
  submit(runtime, 'buy-brick', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.brick', quantity: BRICKS }));

  const rooms = tables === 0
    ? ([['dorm', DORM, 'room.cell']] as const)
    : ([['dorm', DORM, 'room.cell'], ['canteen', CANTEEN, 'room.canteen']] as const);
  for (const [id, rect, roomCatalogId] of rooms) {
    wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
    submit(runtime, `zone-${id}`, packCommand({ type: 'ZoneRoom', roomId: roomCatalogId, ...rect }));
  }

  let placed = 0;
  for (const y of [0, 2]) {
    for (let x = 0; x < 12; x += 1) {
      submit(runtime, `bed-${placed}`, packCommand({ type: 'PlaceObject', orderId: `o-bed-${placed}`, definitionId: 'bed-wooden', x, y }));
      placed += 1;
    }
  }
  placed = 0;
  for (const y of [4, 5]) {
    for (let x = 0; x < 12; x += 1) {
      submit(runtime, `toilet-${placed}`, packCommand({ type: 'PlaceObject', orderId: `o-toilet-${placed}`, definitionId: 'toilet-brick', x, y }));
      placed += 1;
    }
  }
  for (let table = 0; table < tables; table += 1) {
    const x = 17 + (table % 3) * 3;
    const y = 1 + Math.floor(table / 3) * 2;
    submit(runtime, `dt-${table}`, packCommand({ type: 'PlaceObject', orderId: `o-dt-${table}`, definitionId: 'dining-table-wooden', x, y }));
  }
  return runtime;
}

/** The whole population in one tick, which is what makes the twenty-four identical. */
function admitAll(runtime: SimulationRuntime): void {
  for (let n = 0; n < PRISONERS; n += 1) {
    runtime.kernel.submitCommand(
      `admit-${n}`,
      runtime.kernel.expectedSequence,
      runtime.kernel.tick,
      packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }),
    );
  }
  runtime.kernel.step();
}

const indexOfNthAdmission = (runtime: SimulationRuntime, n: number): number =>
  runtime.prisoners.entityStore.getIndex(runtime.prisoners.entityStore.getIdByIndex(n));

const perPrisoner = (runtime: SimulationRuntime, array: Uint32Array): readonly number[] =>
  Array.from({ length: PRISONERS }, (_unused, n) => array[indexOfNthAdmission(runtime, n)]!);

interface WatchedRun {
  readonly runtime: SimulationRuntime;
  readonly diningCeiling: number;
  /**
   * How many separate times each prisoner sat down in the canteen, counted
   * **independently of the counter under test**: a transition into performing
   * `action.eat-meal`, which is the watcher ADR 0062 had to write by hand and
   * the only thing here that knows who actually got a seat.
   */
  readonly canteenEntries: readonly number[];
  /** The lowest stored hunger unit each prisoner ever reached -- the *cost*, which is a different quantity from the count. */
  readonly lowestHunger: readonly number[];
  readonly substitutionCycles: readonly number[];
  readonly contendedSubstitutionCycles: readonly number[];
}

function watched(tables: number): WatchedRun {
  const runtime = prison(tables);
  stepTo(runtime, BUILT_BY);
  admitAll(runtime);

  const canteenEntries = Array.from({ length: PRISONERS }, () => 0);
  const seated = Array.from({ length: PRISONERS }, () => false);
  const lowestHunger = Array.from({ length: PRISONERS }, () => Number.POSITIVE_INFINITY);

  // Every tick rather than every twentieth, for the reason
  // `furnished-prison-loop.test.ts` records: a performed action is short and a
  // coarse sample can miss one entirely.
  for (let tick = runtime.kernel.tick + 1; tick <= WATCH_UNTIL; tick += 1) {
    stepTo(runtime, tick);
    for (let n = 0; n < PRISONERS; n += 1) {
      const index = indexOfNthAdmission(runtime, n);
      const actionIndex = runtime.prisoners.currentAction.actionIndex[index]!;
      const eating =
        runtime.prisoners.currentAction.phase[index] === PERFORMING_PHASE &&
        actionIndex >= 0 &&
        DEFAULT_ACTIONS[actionIndex]!.id === 'action.eat-meal';
      if (eating && !seated[n]) canteenEntries[n] = canteenEntries[n]! + 1;
      seated[n] = eating;
      const hunger = runtime.prisoners.needs.levels.hunger[index]!;
      if (hunger < lowestHunger[n]!) lowestHunger[n] = hunger;
    }
  }

  const canteen = runtime.prisoners.roomInstances.getById(CANTEEN_ID);
  return {
    runtime,
    diningCeiling: canteen === undefined ? 0 : runtime.prisoners.roomInstances.concurrentUseCapacityFor(canteen, 'dining'),
    canteenEntries,
    lowestHunger,
    substitutionCycles: perPrisoner(runtime, runtime.prisoners.substitutions.substitutionCycles),
    contendedSubstitutionCycles: perPrisoner(runtime, runtime.prisoners.substitutions.contendedSubstitutionCycles),
  };
}

const repeated = (value: number, times: number): readonly number[] => Array.from({ length: times }, () => value);

describe('twenty-four prisoners and a canteen that seats six', () => {
  it('names the twelve prisoners who lose the room, which no counter in this repository could do before', () => {
    const run = watched(2);

    expect(run.runtime.refusals.count, 'an overlapping footprint would be a refusal, not a wrong number').toBe(0);
    expect(run.runtime.prisoners.intakeSystem.getMetrics()).toMatchObject({ completedCount: PRISONERS, failedCount: 0 });

    /*
     * The precondition, read off the derivation rather than restated: two `3x2`
     * dining tables are six dining places against 24 prisoners.
     */
    expect(run.diningCeiling, 'two 3x2 dining tables, and `concurrentUseCapacityFor` sums footprint widths').toBe(6);
    expect(run.diningCeiling).toBeLessThan(PRISONERS);

    /*
     * **What the independent watcher sees**: a caste. Six prisoners eat in the
     * canteen eight times across the twelve days, six eat six times, and the
     * remaining twelve eat three times each. This is the array ADR 0062 had to
     * build a test-only per-prisoner counter to obtain.
     */
    expect(run.canteenEntries).toEqual([...repeated(8, 6), ...repeated(6, 6), ...repeated(3, 12)]);

    /*
     * **And what the production counter sees, with no watcher at all: the same
     * twelve.** `contendedSubstitutionCycles` is a canteen refusal in this
     * prison by construction -- nothing else here has a ceiling that can bind
     * -- and prisoners 12 to 23 carry six or seven of them each against one or
     * three for the twelve who eat more often.
     */
    expect(run.contendedSubstitutionCycles).toEqual([...repeated(3, 6), ...repeated(1, 6), ...repeated(7, 6), ...repeated(6, 6)]);

    /*
     * The claim stated as a *separation* rather than as the literal above, so
     * that a re-baseline which moved every number but kept the caste still
     * passes and one which dissolved the caste fails. Read off the two arrays
     * independently: the twelve the watcher says eat least are exactly the
     * twelve the counter says are refused most.
     */
    const leastFed = [...run.canteenEntries.keys()].sort((a, b) => run.canteenEntries[a]! - run.canteenEntries[b]! || a - b).slice(0, 12);
    const mostRefused = [...run.contendedSubstitutionCycles.keys()]
      .sort((a, b) => run.contendedSubstitutionCycles[b]! - run.contendedSubstitutionCycles[a]! || a - b)
      .slice(0, 12);
    expect([...leastFed].sort((a, b) => a - b)).toEqual([...mostRefused].sort((a, b) => a - b));
    expect(Math.min(...mostRefused.map((n) => run.contendedSubstitutionCycles[n]!))).toBeGreaterThan(
      Math.max(...[...run.contendedSubstitutionCycles.keys()].filter((n) => !mostRefused.includes(n)).map((n) => run.contendedSubstitutionCycles[n]!)),
    );

    /*
     * **The aggregate is the sum of the breakdown**, which holds here because
     * no prisoner is released inside the window -- `ActionMetrics`' totals keep
     * a departed prisoner's contribution and the component cannot.
     */
    const metrics = run.runtime.prisoners.actionSystem.getMetrics();
    expect(metrics.substitutionCycles).toBe(run.substitutionCycles.reduce((total, count) => total + count, 0));
    expect(metrics.contendedSubstitutionCycles).toBe(run.contendedSubstitutionCycles.reduce((total, count) => total + count, 0));
    expect(metrics).toMatchObject({ substitutionCycles: 4_782, contendedSubstitutionCycles: 102, routeFailures: 0 });
    expect(metrics.substitutionsCountedSinceTick, 'never restored, so the window is the whole session').toBe(0);

    /*
     * **The count is not the cost, and this prison is where the two come
     * apart.** Every prisoner is downgraded about two hundred times -- most of
     * them for a `recreation` block in a prison with no yard, which costs them
     * nothing they were going to get anyway -- while the hunger floor separates
     * the arms of the caste completely differently from the substitution count.
     * That is the reason `SubstitutionRecordComponent` records a count and not
     * a score gap: the gap is a difference of utilities at the instant of
     * choosing, and what a downgrade *costs* is a need level, which the save
     * already carries.
     */
    expect(run.substitutionCycles).toEqual([...repeated(197, 6), ...repeated(194, 6), ...repeated(203, 12)]);
    expect(run.lowestHunger).toEqual([...repeated(12_100, 6), ...repeated(3_500, 6), ...repeated(4_300, 12)]);
    expect(Math.min(...run.lowestHunger) / NEED_SCALE, 'the contended canteen genuinely starves this prison').toBeLessThan(20);
  });

  it('reads exactly zero the moment the canteen seats everybody, so it is counting refusals and not meals', () => {
    const control = watched(9);

    expect(control.runtime.refusals.count).toBe(0);
    expect(control.diningCeiling, 'nine 3x2 dining tables').toBe(27);
    expect(control.diningCeiling).toBeGreaterThan(PRISONERS);

    // Seven more `PlaceObject` commands than the contended arm, the same
    // rectangles, the same purchase, the same population, the same 30,000
    // ticks. Everybody eats in the canteen the same number of times.
    expect(control.canteenEntries).toEqual(repeated(20, PRISONERS));
    expect(control.contendedSubstitutionCycles).toEqual(repeated(0, PRISONERS));
    expect(control.runtime.prisoners.actionSystem.getMetrics()).toMatchObject({
      contendedSubstitutionCycles: 0,
      unmetDemandCycles: 0,
      routeFailures: 0,
    });

    // Still downgraded constantly -- for the recreation and education blocks
    // this prison has no room for -- which is what makes the zero above a
    // statement about *contention* rather than about the counter being asleep.
    expect(control.substitutionCycles).toEqual(repeated(174, PRISONERS));
  });

  it('separates a room that is full from a room nobody built, which `unmetDemandCycles` reads as 0 either way', () => {
    const unbuilt = watched(0);

    expect(unbuilt.diningCeiling, 'no canteen is zoned at all').toBe(0);
    expect(unbuilt.canteenEntries).toEqual(repeated(0, PRISONERS));

    /*
     * Every meal in this prison is a downgrade -- `action.eat-meal` outranks
     * `action.eat-in-cell` on the same need in the same category, so the
     * canteen is chosen and refused every time -- and **none of it is
     * contention**, because there is no canteen to be refused by.
     */
    expect(unbuilt.substitutionCycles).toEqual(repeated(261, PRISONERS));
    expect(unbuilt.contendedSubstitutionCycles).toEqual(repeated(0, PRISONERS));

    /*
     * **And this is the blindness the issue is about, in one line.** 6,264
     * downgrades, and the metric that existed before this change is 0 -- the
     * same 0 the nine-table prison above reports, where nobody was downgraded
     * for a meal at all.
     */
    expect(unbuilt.runtime.prisoners.actionSystem.getMetrics()).toMatchObject({
      substitutionCycles: 6_264,
      contendedSubstitutionCycles: 0,
      unmetDemandCycles: 0,
    });

    /*
     * Nobody suffers for it, which is the other half of why a count is not a
     * cost: eating in a cell restores 3 hunger a tick against a canteen's 4,
     * and with nothing to walk to, this prison feeds its population *better*
     * than the six-seat one does.
     */
    expect(unbuilt.lowestHunger).toEqual(repeated(35_700, PRISONERS));
  });
});

describe('the substitution counters across a save and a restore', () => {
  it('starts a new window at the restored tick rather than carrying counts into a re-indexed population', () => {
    const continuous = prison(2);
    stepTo(continuous, BUILT_BY);
    admitAll(continuous);

    /*
     * A restore drops every in-flight path request, so the snapshot is taken at
     * a tick where nobody is travelling -- the precondition
     * `tests/determinism/contended-scan-order.test.ts` builds for the same
     * reason. Searched for rather than guessed, and the search failing is a
     * failure rather than a skip.
     */
    let snapshotTick = -1;
    for (let tick = continuous.kernel.tick + 1; tick <= continuous.kernel.tick + 6_000; tick += 1) {
      stepTo(continuous, tick);
      if (tick < 12_000) continue;
      const indices = Array.from({ length: PRISONERS }, (_unused, n) => indexOfNthAdmission(continuous, n));
      const travelling = indices.some((index) => continuous.prisoners.currentAction.phase[index] === 1);
      const idle = indices.some((index) => continuous.prisoners.currentAction.phase[index] === IDLE_PHASE);
      if (!travelling && idle) {
        snapshotTick = tick;
        break;
      }
    }
    expect(snapshotTick, 'no quiescent tick found to snapshot at').toBeGreaterThan(0);

    const atSnapshot = continuous.prisoners.actionSystem.getMetrics();
    const contendedAtSnapshot = perPrisoner(continuous, continuous.prisoners.substitutions.contendedSubstitutionCycles);
    expect(atSnapshot.substitutionCycles, 'the window being reopened has something in it').toBeGreaterThan(0);

    const { runtime: restored } = restoreSimulationRuntime(captureSessionSnapshot(continuous), SEED);
    expect(restored.kernel.tick).toBe(snapshotTick);

    /*
     * **The window reopens, and says so.** No save carries these counters
     * (issue #435 puts a save-schema change out of scope, and
     * `SubstitutionRecordComponent` argues that is also the right answer), so a
     * restored session cannot report a sentence's history -- and a counter that
     * reset silently would be read as "nobody has ever been downgraded here".
     */
    expect(restored.prisoners.actionSystem.getMetrics()).toMatchObject({
      substitutionCycles: 0,
      contendedSubstitutionCycles: 0,
      substitutionsCountedSinceTick: snapshotTick,
    });
    expect(perPrisoner(restored, restored.prisoners.substitutions.substitutionCycles)).toEqual(repeated(0, PRISONERS));

    /*
     * **And what is lost is the window and nothing else.** Over the same 6,000
     * further ticks the restored session counts, prisoner by prisoner, exactly
     * what the continuous one counts over the same span -- so the reset costs a
     * reader the history and not the instrument.
     */
    const until = snapshotTick + 6_000;
    stepTo(continuous, until);
    stepTo(restored, until);
    expect(restored.kernel.tick).toBe(continuous.kernel.tick);

    const continuedContended = perPrisoner(continuous, continuous.prisoners.substitutions.contendedSubstitutionCycles);
    const restoredContended = perPrisoner(restored, restored.prisoners.substitutions.contendedSubstitutionCycles);
    expect(restoredContended).toEqual(continuedContended.map((count, n) => count - contendedAtSnapshot[n]!));
    expect(restoredContended.reduce((total, count) => total + count, 0), 'the window is not vacuous').toBeGreaterThan(0);
  });
});
