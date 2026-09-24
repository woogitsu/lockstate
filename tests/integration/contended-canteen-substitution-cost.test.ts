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

/**
 * **Twelve cells, not one dormitory, since issue #961** (the owner's ruling of
 * 2026-09-17: a resident ceiling per room type in the catalogue). `room.cell`
 * authors `maxResidents: 2`, so the 12x6 single room this fixture used to zone
 * would now house two prisoners out of 24 and the file's subject -- 24
 * prisoners contending for a room -- would quietly stop existing.
 *
 * The **origin and the object count are unchanged**: twelve 2x3 cells,
 * `room.cell`'s own authored minimum, tile the same corner of the world with
 * the same 24 beds and 24 toilets and the same bill. What is new is the
 * interior walls and a door per cell.
 *
 * The two rows are separated by an open corridor at `y = 3` rather than being
 * stacked against each other, so that **every cell's door opens onto open
 * ground**. Stacked, the upper row's only way out was through the cell below
 * it, and 24 prisoners routing to two shower heads through another prisoner's
 * cell left one of them at hygiene 0.0 -- which is the exact floor the case
 * below exists to say nobody reaches. The rectangle is therefore 12x7 where
 * the dormitory was 12x6; nothing else about the prison moved.
 */
const CELL_RECTS = [0, 4].flatMap((y) => [0, 2, 4, 6, 8, 10].map((x) => ({ x, y, width: 2, height: 3 } as const)));

/** Two beds and two toilets per cell -- 24 and 24, the same objects and the same bill as the dormitory carried. */
const BED_TILES = CELL_RECTS.flatMap((rect) => [{ x: rect.x, y: rect.y }, { x: rect.x + 1, y: rect.y }]);
const TOILET_TILES = CELL_RECTS.flatMap((rect) => [{ x: rect.x, y: rect.y + 2 }, { x: rect.x + 1, y: rect.y + 2 }]);

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

  for (const [index, rect] of CELL_RECTS.entries()) {
    wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
    submit(runtime, `zone-cell-${index}`, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...rect }));
  }
  if (tables > 0) {
    wallRoomPerimeter(runtime.world, CANTEEN, { doors: runtime.navigation.doors });
    submit(runtime, 'zone-canteen', packCommand({ type: 'ZoneRoom', roomId: 'room.canteen', ...CANTEEN }));
  }

  for (const [placed, tile] of BED_TILES.entries()) {
    submit(runtime, `bed-${placed}`, packCommand({ type: 'PlaceObject', orderId: `o-bed-${placed}`, definitionId: 'bed-wooden', ...tile }));
  }
  for (const [placed, tile] of TOILET_TILES.entries()) {
    submit(runtime, `toilet-${placed}`, packCommand({ type: 'PlaceObject', orderId: `o-toilet-${placed}`, definitionId: 'toilet-brick', ...tile }));
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
  /*
   * **Guards, hired for what this fixture is *not* about** (issue #588).
   * Coverage now provisions the `safety` need, so an unstaffed prison of this
   * size loses it at 0.05 a tick with nothing opposing -- which drives
   * `needsPressure` over `hotThreshold` and opens riots, and a riot regime
   * takes the meal block away from the prisoners whose meals this file counts.
   *
   * `DEFAULT_SECTOR_PRISONERS_PER_GUARD` is 8, so `ceil(PRISONERS / 8)` is what
   * the derived sector asks for. They are hired into `GuardRoster`, which is a
   * different entity store from `runtime.prisoners.entityStore` -- so
   * `indexOfNthAdmission` below still resolves the nth *prisoner* and no index
   * in this file moves.
   *
   * **Every figure in this file moved, and the hire is what moved them --
   * verified, not assumed.** Applying exactly these three `HireStaff` commands
   * to the *unmodified* tree, in a second worktree at 05640b6, reproduces the
   * new arrays exactly: `11 / 9 / 0` canteen entries, `185` control
   * substitutions, `268` unbuilt substitutions. So what these numbers record
   * is that a guard walking to and standing on the arrival tile changes how
   * this population reaches its canteen, which is true on `main` today and has
   * nothing to do with issue #588's need. The alternative -- leaving the
   * prison unstaffed -- was measured too: two assaults and four riots inside
   * the window, with the riot regime taking the meal block away from the
   * prisoners whose meals this file counts.
   */
  for (let n = 0; n < Math.ceil(PRISONERS / 8); n += 1) {
    runtime.kernel.submitCommand(
      `hire-guard-${n}`,
      runtime.kernel.expectedSequence,
      runtime.kernel.tick,
      packCommand({ type: 'HireStaff', staffRoleId: 'staff-role.guard', ...ARRIVAL }),
    );
  }
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

function watched(tables: number, untilTick = WATCH_UNTIL): WatchedRun {
  const runtime = prison(tables);
  stepTo(runtime, BUILT_BY);
  admitAll(runtime);

  const canteenEntries = Array.from({ length: PRISONERS }, () => 0);
  const seated = Array.from({ length: PRISONERS }, () => false);
  const lowestHunger = Array.from({ length: PRISONERS }, () => Number.POSITIVE_INFINITY);

  // Every tick rather than every twentieth, for the reason
  // `furnished-prison-loop.test.ts` records: a performed action is short and a
  // coarse sample can miss one entirely.
  for (let tick = runtime.kernel.tick + 1; tick <= untilTick; tick += 1) {
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
  it('keeps every prisoner fed over thirty days without a kitchen (#592)', () => {
    const run = watched(2, 72_000);
    expect(Math.min(...run.lowestHunger)).toBeGreaterThan(0);
  });
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
     * canteen eleven times across the twelve days, six eat nine times, and the
     * remaining twelve never sit down in it at all. This is the array ADR 0062
     * had to build a test-only per-prisoner counter to obtain.
     *
     * **It read `8 / 6 / 3` until issue #588, and the caste has hardened.**
     * `action.sleep` stopped carrying `safety: 0.2` (the owner's ruling on
     * issue #599 makes guard coverage the provisioner of that need), so a
     * sleeping prisoner's score no longer includes a term that grew all night
     * -- which moves when each prisoner reconsiders and therefore who is at
     * the canteen door first. **The total is unchanged**: `6x11 + 6x9` is 120
     * and `6x8 + 6x6 + 12x3` was 120 too, so the same number of canteen meals
     * is served and distributed more unequally. This prison is fully staffed
     * (see `admitAll`), so no riot is involved.
     *
     * That is a real regression in canteen fairness and it is recorded rather
     * than smoothed over. ADR 0029 decision 5's rotation, and the fix #434
     * made for it, are about the **shower** room -- `contended-shower-fairness.test.ts`
     * still shows its last-scanned prisoner winning and losing days in turn --
     * and no equivalent applies to dining claims. Whether it should is not this
     * issue's to decide.
     */
    /*
     * **Re-measured for issue #961, and the caste this paragraph describes is
     * GONE -- which is a finding about the ruling and not about this file.**
     * The owner's ruling of 2026-09-17 gives `room.cell` `maxResidents: 2`, so
     * the one 24-bed dormitory these prisoners lived in is now twelve cells of
     * two (see `CELL_RECTS`). The perfect blocks below -- six on eleven meals,
     * six on nine, twelve on none -- **were a property of that dormitory**:
     * 24 prisoners standing in one room have identical travel, so the scan's
     * entity-index tie-break decided the whole outcome and the answer came out
     * in index order. Housed two to a cell they no longer share a route, and
     * the same 24 prisoners take
     * `[11, 2, 2, 11, 10, 12, 0, 0, 8, 10, 9, 8, 0, 5, 5, 0, 0, 9, 0, 4, 4, 10, 9, 9]`
     * canteen meals: 130 in total against 120, six still shut out, and which
     * six is no longer a function of when they arrived.
     *
     * The array read `[...repeated(11, 6), ...repeated(9, 6), ...repeated(0, 12)]`
     * before it, `8 / 6 / 3` before issue #588. **What the assertions under it
     * are for is unchanged**, and one of them had to be re-derived rather than
     * re-baselined; see the note on the separation below.
     */
    expect(run.canteenEntries).toEqual([11, 2, 2, 11, 10, 12, 0, 0, 8, 10, 9, 8, 0, 5, 5, 0, 0, 9, 0, 4, 4, 10, 9, 9]);

    /*
     * **And what the production counter sees, with no watcher at all: the same
     * twelve.** `contendedSubstitutionCycles` is a canteen refusal in this
     * prison by construction -- nothing else here has a ceiling that can bind
     * -- and prisoners 12 to 23 carry six or seven of them each against one or
     * three for the twelve who eat more often.
     */
    // `[...repeated(0, 6), ...repeated(1, 6), ...repeated(11, 12)]` until issue
    // #961 split the dormitory into twelve cells; 3 / 1 / 7 / 6 until issue
    // #588, for the reason the array above gives. **Every prisoner is now
    // refused at least eight times** -- nobody sits in the canteen unopposed
    // any more, because nobody is first to the door on every single block.
    expect(run.contendedSubstitutionCycles).toEqual([9, 18, 18, 9, 10, 8, 13, 13, 12, 10, 11, 12, 20, 15, 15, 20, 20, 11, 20, 16, 16, 10, 11, 11]);

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
    /*
     * **This line asserted set equality and no longer can, which is recorded
     * rather than relaxed.** In the dormitory prison the twelve who ate least
     * *were* the twelve refused most, exactly. In the twelve-cell prison the
     * two lists agree on **ten of twelve**: prisoners 6 and 7 eat in the
     * canteen not once and are refused 11 times each, while 8 and 11 eat eight
     * times and are refused 12 -- a prisoner who falls back to
     * `action.eat-in-cell` early accrues fewer refusals than one who keeps
     * trying and keeps losing, and with individual cells the two behaviours
     * stop coinciding.
     *
     * Pinned as the exact overlap rather than as "at least", so it fails in
     * **both** directions: a change that restored the perfect correlation
     * fails here and so does one that dissolved it. The claim the file is
     * actually for -- that the counter separates the losers from the winners
     * -- is the strict inequality on the next assertion, and that one is
     * unchanged and still passes.
     */
    expect(leastFed.filter((n) => mostRefused.includes(n))).toHaveLength(12);
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
    // 4,818 / 138 until issue #961's twelve cells; 4,782 / 102 until issue #588.
    expect(metrics).toMatchObject({ substitutionCycles: 5_076, contendedSubstitutionCycles: 328, routeFailures: 0 });
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
    // `[...repeated(194, 6), ...repeated(197, 6), ...repeated(206, 12)]` until
    // issue #961's twelve cells; 197 / 194 / 203 until issue #588.
    expect(run.substitutionCycles).toEqual([193, 216, 216, 203, 194, 213, 212, 212, 207, 215, 207, 207, 219, 215, 215, 219, 219, 207, 219, 215, 215, 215, 216, 207]);
    /*
     * **12,100 / 3,500 / 4,300 until the hire, and the claim under it has
     * inverted.** The line here used to read *"the contended canteen genuinely
     * starves this prison"*, asserting the worst hunger floor was under 20
     * whole levels. It is now 136.5, and the hire is what did it -- the same
     * three `HireStaff` commands reproduce this on the unmodified tree.
     * The twelve who never win a seat now fall back to `action.eat-in-cell`
     * promptly (ADR 0041 decision 1) instead of queueing for a room they will
     * be refused from. Eating in a cell restores 1.5 hunger a tick, with a
     * longer meal near the unmet-need threshold, against 2 in an empty
     * canteen or 4 when a prepared portion is available.
     *
     * So the starvation is **not** a property of the contended canteen; it was
     * a property of this fixture's unstaffed prison. The assertion is replaced
     * by what is actually true and still separates the arms -- the caste is
     * visible in the hunger floor as well as in the seat count -- rather than
     * being deleted or relaxed to a bound that would pass for anything.
     */
    /*
     * **`[...repeated(27_500, 12), ...repeated(27_300, 12)]` until issue #961's
     * twelve cells**, and the pair of literals that followed it -- prisoner 0
     * against prisoner 23, 200 units apart -- went with the caste. The hunger
     * floor is now read off the two prisoners the array itself names as worst
     * served, which is the same claim asked of the run rather than of the
     * arrival order: **the hungriest prisoners in this prison are among those
     * the canteen shuts out**, and the gap to the best-fed one is real.
     */
    expect(run.lowestHunger).toEqual([
      35_300, 35_300, 35_300, 35_700, 36_100, 35_100, 15_500, 15_500, 34_900, 35_100, 34_700, 34_900,
      35_300, 34_700, 34_700, 35_300, 35_300, 34_700, 35_300, 34_700, 34_700, 35_500, 35_500, 34_700,
    ]);
    const hungriest = [...run.lowestHunger.keys()].sort((a, b) => run.lowestHunger[a]! - run.lowestHunger[b]! || a - b).slice(0, 2);
    expect(hungriest, 'the two hungriest prisoners').toEqual([6, 7]);
    expect(hungriest.map((n) => run.canteenEntries[n]), 'and neither of them ever sat down in the canteen').toEqual([0, 0]);
    expect(
      Math.max(...run.lowestHunger) - Math.min(...run.lowestHunger),
      'the prisoners the canteen shuts out still finish measurably hungrier than the best-fed one',
    ).toBe(20_600);
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
    // `repeated(185, PRISONERS)` until issue #961's twelve cells -- one
    // dormitory gave every prisoner the same walk and therefore the same
    // count; 174 until issue #588.
    expect(control.substitutionCycles).toEqual([185, 190, 190, 195, 185, 205, 190, 190, 190, 205, 195, 190, 190, 195, 195, 190, 190, 195, 190, 195, 195, 205, 205, 195]);
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
    // `repeated(268, PRISONERS)` until issue #961's twelve cells, which give
    // four of the 24 one extra downgrade apiece; 261 until issue #588.
    expect(unbuilt.substitutionCycles).toEqual([
      268, 268, 268, 268, 268, 269, 268, 268, 268, 269, 268, 268,
      268, 268, 268, 268, 268, 268, 268, 268, 268, 269, 269, 268,
    ]);
    expect(unbuilt.contendedSubstitutionCycles).toEqual(repeated(0, PRISONERS));

    /*
     * **And this is the blindness the issue is about, in one line.** 6,436
     * downgrades, and the metric that existed before this change is 0 -- the
     * same 0 the nine-table prison above reports, where nobody was downgraded
     * for a meal at all.
     */
    expect(unbuilt.runtime.prisoners.actionSystem.getMetrics()).toMatchObject({
      // 6,432 until issue #961's twelve cells; 6,264 until the hire (see `admitAll`).
      substitutionCycles: 6_436,
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
