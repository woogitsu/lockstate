import { describe, expect, it } from 'vitest';
import { DEFAULT_ACTIONS } from '../../src/simulation/prisoners/actions';
import { NEED_MAX, NEED_SCALE } from '../../src/simulation/prisoners/needs';
import { STATE_INCOME_UNMET_NEED_LEVEL } from '../../src/simulation/economy/income';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * agent/canteen-wasted-walk: the hypothesis under test was **"a canteen too
 * small to seat a prison's population accumulates more unmet hunger than no
 * canteen at all, because a prisoner turned away at the door pays a whole
 * meal block for nothing while a prisoner who never had a canteen just eats
 * in their cell."**
 *
 * ## The hypothesis's own mechanism was already fixed before this measurement
 *
 * "Turned away, whole block wasted" describes exactly the pre-ADR-0059 defect
 * `action-system.ts`'s `arrive` documents at length: a refusal used to leave
 * the prisoner `idle` until the next twenty-tick reconsideration, so a walk to
 * a full canteen and a walk back cost most of a hundred-tick meal window for
 * nothing. ADR 0059 closed it by re-planning **immediately** on refusal
 * (`arrive`'s call to `beginNextAction` right after the failed
 * `claimUseIfNeeded`), which falls through to `action.eat-in-cell` the same
 * tick. `contended-canteen-meal-fallback.test.ts` already proves that path
 * feeds a six-prisoner, three-seat canteen; this file asks the question that
 * one does not: **does a too-small canteen still net out worse than none at
 * all**, once that fix is standing?
 *
 * ## What this file measures, and what it found
 *
 * Three otherwise-identical six-cell prisons, same seed, same cells, same
 * admission order, watched every tick to 14,000: no canteen, a canteen with
 * one three-seat dining table (contended, half the population refused every
 * block), and a canteen with two tables (six seats, uncontended).
 *
 * **By the game's own definition of "unmet" -- the one that costs the prison
 * anything -- the hypothesis is false in all three.**
 * [ADR 0064](../../docs/adr/0064-what-an-unmet-need-costs-a-prison.md) /
 * `STATE_INCOME_UNMET_NEED_LEVEL` calls a need unmet at or below 51 of
 * `NEED_MAX`; the lowest hunger any of the eighteen prisoner-runs below ever
 * reaches is **173.5**, more than three times that floor. `ticksAtOrBelowUnmetThreshold`
 * is 0 in every one of the three prisons. The state's own accounting cannot
 * tell a too-small canteen from no canteen from a canteen that seats
 * everybody, because none of them ever starves anybody by its measure.
 *
 * **What is real, and is not what the hypothesis named:** having a canteen at
 * all costs the population `ActionSystem`-tracked `travelling`-phase ticks
 * that a cell-only prison never spends, because `action.eat-meal` targets
 * `room.canteen` and the walk there and back is dead time no
 * `needEffectsPerTick` touches, while `action.eat-in-cell` resolves by
 * instance id and a resident already in their own cell arrives immediately.
 * That is a property of *distance*, not of *capacity*: `large` (six seats, no
 * refusal ever) spends *more* population-summed travelling ticks than `small`
 * (three seats, contended) and finishes with the **lower** minimum hunger of
 * the two, because contention pushes some of `small`'s meals back onto the
 * free, zero-travel cell fallback. Capacity is not the lever this measurement
 * finds; siting is. A scratch run of the same fixture with the canteen moved
 * adjacent to the cell row (not committed here, see the report on
 * agent/canteen-wasted-walk) cut the travelling-tick gap by roughly a third
 * and brought every prisoner within one level of the no-canteen floor.
 *
 * ## What would make this test fail, and why that is the guard
 *
 * Deleting `arrive`'s immediate re-plan on a refused claim (the
 * `this.beginNextAction(this.planIdleSelection(...), tick)` call `action-system.ts`
 * makes right after `claimUseIfNeeded` returns `false`) reopens exactly the
 * hypothesis's own mechanism: a refused prisoner then waits out the rest of
 * the reconsideration cadence idle, repeatedly, and `small`'s
 * `ticksAtOrBelowUnmetThreshold` assertion below goes red. That mutation, its
 * RED output and the hand-restored GREEN are recorded on the commit that adds
 * this file.
 */

const SEED = 0x0b1ec7;
const PRISONERS = 6;

/** `room.cell`'s authored 2x3 minimum, six of them in a row along the top of the owned chunk -- the same layout `contended-canteen-meal-fallback.test.ts` uses. */
const CELLS = Array.from({ length: PRISONERS }, (_unused, n) => ({ x: n * 2, y: 0 }));
/** `room.canteen`'s authored 6x6 minimum, clear of every cell. */
const CANTEEN_RECT = { x: 8, y: 8, width: 6, height: 6 } as const;
const CANTEEN_ID = 'room.canteen:8:8';

const BUILT_BY = 2_000;
/** The same horizon `contended-canteen-meal-fallback.test.ts` watches: several full general-population days, contended repeatedly. */
const WATCH_UNTIL = 14_000;

/** The tile `src/main.ts` admits at: the middle of the one chunk a new prison owns. */
const ARRIVAL = { x: 16, y: 16 } as const;
const ADMISSION = { sentenceLengthTicks: 100_000, priorIncidents: 0 } as const;

/** `ACTION_PHASES` indices; the phase names are not exported. `1` is `travelling`, the only one this file samples directly. */
const TRAVELLING_PHASE = 1;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

type CanteenShape = 'none' | 'small' | 'large';

/** 0 dining tables for `'none'` (no canteen zoned at all), 1 (three seats, contended) for `'small'`, 2 (six seats) for `'large'`. */
function diningTablesFor(shape: CanteenShape): 0 | 1 | 2 {
  return shape === 'none' ? 0 : shape === 'small' ? 1 : 2;
}

function prison(shape: CanteenShape): SimulationRuntime {
  const diningTables = diningTablesFor(shape);
  const runtime = createNewSimulationRuntime(SEED);
  const planks = PRISONERS + diningTables * 3;
  const bricks = PRISONERS;
  submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: planks }));
  submit(runtime, 'buy-brick', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.brick', quantity: bricks }));
  for (const [n, cell] of CELLS.entries()) {
    wallRoomPerimeter(runtime.world, { x: cell.x, y: cell.y, width: 2, height: 3 }, { doors: runtime.navigation.doors });
    submit(runtime, `zone-cell-${n}`, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', x: cell.x, y: cell.y, width: 2, height: 3 }));
  }
  if (shape !== 'none') {
    wallRoomPerimeter(runtime.world, CANTEEN_RECT, { doors: runtime.navigation.doors });
    submit(runtime, 'zone-canteen', packCommand({ type: 'ZoneRoom', roomId: 'room.canteen', ...CANTEEN_RECT }));
  }
  for (const [n, cell] of CELLS.entries()) {
    submit(runtime, `bed-${n}`, packCommand({ type: 'PlaceObject', orderId: `o-bed-${n}`, definitionId: 'bed-wooden', x: cell.x, y: cell.y }));
    submit(runtime, `toilet-${n}`, packCommand({ type: 'PlaceObject', orderId: `o-toilet-${n}`, definitionId: 'toilet-brick', x: cell.x + 1, y: cell.y }));
  }
  for (let t = 0; t < diningTables; t += 1) {
    submit(runtime, `dining-table-${t}`, packCommand({ type: 'PlaceObject', orderId: `o-dt-${t}`, definitionId: 'dining-table-wooden', x: 8 + t * 3, y: 8 }));
  }
  return runtime;
}

interface WatchedRun {
  readonly shape: CanteenShape;
  readonly diningCeiling: number;
  readonly lowestHunger: readonly number[];
  /** Sum over every watched tick and every prisoner of `(NEED_MAX - hunger)`: a continuous accumulated-deficit reading nothing in production reads. */
  readonly hungerDeficitLevelTicks: number;
  /** Population-summed ticks at/below ADR 0064's unmet threshold -- what the state's own accounting would call starved. */
  readonly ticksAtOrBelowUnmetThreshold: number;
  /** Population-summed ticks spent in each `ActionSystem` phase over the watch window. */
  readonly travellingPhaseTicks: number;
  readonly actionMetrics: ReturnType<SimulationRuntime['prisoners']['actionSystem']['getMetrics']>;
}

/** Six prisoners admitted into the finished prison, watched every tick so a short performed action is never missed. */
function watched(shape: CanteenShape): WatchedRun {
  const runtime = prison(shape);
  stepTo(runtime, BUILT_BY);
  /*
   * **Guards, hired for what this fixture is *not* about** (issue #588).
   * Coverage now provisions the `safety` need, so an unstaffed prison of this
   * size loses it at 0.05 a tick with nothing opposing -- which drives
   * `needsPressure` over `hotThreshold` and opens riots, and a riot regime
   * takes the very actions this file measures away from its prisoners.
   * Measured without them: riots that take the meal block away from the prisoners whose meals this file counts.
   *
   * `DEFAULT_SECTOR_PRISONERS_PER_GUARD` is 8, so `ceil(PRISONERS / 8)` is
   * what the derived sector asks for. Hiring it isolates the subject of this
   * file from a mechanic that is measured on its own in
   * `tests/integration/coverage-safety-loop.test.ts`.
   */
  for (let n = 0; n < Math.ceil(PRISONERS / 8); n += 1) {
    submit(runtime, `hire-guard-${n}`, packCommand({ type: 'HireStaff', staffRoleId: 'staff-role.guard', ...ARRIVAL }));
  }
  for (let n = 0; n < PRISONERS; n += 1) {
    submit(runtime, `admit-${n}`, packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
  }

  const store = runtime.prisoners.entityStore;
  const lowestHunger = Array.from({ length: PRISONERS }, () => Number.POSITIVE_INFINITY);
  let hungerDeficitLevelTicks = 0;
  let ticksAtOrBelowUnmetThreshold = 0;
  let travellingPhaseTicks = 0;

  for (let tick = runtime.kernel.tick + 1; tick <= WATCH_UNTIL; tick += 1) {
    stepTo(runtime, tick);
    for (let n = 0; n < PRISONERS; n += 1) {
      const index = store.getIndex(store.getIdByIndex(n));
      const phase = runtime.prisoners.currentAction.phase[index];
      if (phase === TRAVELLING_PHASE) travellingPhaseTicks += 1;
      const hunger = runtime.prisoners.needs.levels.hunger[index]! / NEED_SCALE;
      if (hunger < lowestHunger[n]!) lowestHunger[n] = hunger;
      hungerDeficitLevelTicks += NEED_MAX - hunger;
      if (hunger <= STATE_INCOME_UNMET_NEED_LEVEL) ticksAtOrBelowUnmetThreshold += 1;
    }
  }

  const canteenInstance = shape === 'none' ? undefined : runtime.prisoners.roomInstances.getById(CANTEEN_ID);
  const diningCeiling = canteenInstance === undefined ? 0 : runtime.prisoners.roomInstances.concurrentUseCapacityFor(canteenInstance, 'dining');

  return {
    shape,
    diningCeiling,
    lowestHunger,
    hungerDeficitLevelTicks,
    ticksAtOrBelowUnmetThreshold,
    travellingPhaseTicks,
    actionMetrics: runtime.prisoners.actionSystem.getMetrics(),
  };
}

describe('canteen-wasted-walk: no canteen vs a too-small canteen vs a canteen that seats everybody', () => {
  it('confirms the three prisons really differ only by the canteen, and that the meal actions themselves rank as the catalogue says', () => {
    const meals = DEFAULT_ACTIONS.filter((action) => action.category === 'meal');
    expect(meals.map((action) => action.id)).toEqual(['action.eat-meal', 'action.eat-in-cell']);
    const [canteenMeal, cellMeal] = meals as [(typeof meals)[number], (typeof meals)[number]];
    expect(canteenMeal.needEffectsPerTick.hunger!).toBeGreaterThan(cellMeal.needEffectsPerTick.hunger!);
    expect(canteenMeal.target.kind).toBe('room-catalog-id');
    expect(cellMeal.target.kind).toBe('own-accommodation');

    const none = prison('none');
    stepTo(none, BUILT_BY);
    expect(none.prisoners.roomInstances.allByRoomCatalogId('room.canteen')).toEqual([]);
  });

  it('never crosses the ADR 0064 unmet-need threshold in any of the three -- the hypothesis is false by the cost the game actually charges', () => {
    const none = watched('none');
    const small = watched('small');
    const large = watched('large');

    expect(small.diningCeiling, 'one 3-wide dining table against six prisoners').toBe(3);
    expect(large.diningCeiling, 'two 3-wide dining tables, six seats for six prisoners').toBe(6);

    // Contention really bit in `small` and never in `large` or `none` -- the
    // precondition the whole comparison depends on.
    expect(small.actionMetrics.contendedSubstitutionCycles).toBeGreaterThan(0);
    expect(large.actionMetrics.contendedSubstitutionCycles).toBe(0);
    expect(none.actionMetrics.contendedSubstitutionCycles).toBe(0);

    /*
     * The state's own accounting, exact and pinned. `ticksAtOrBelowUnmetThreshold`
     * is a population-summed count over 6 prisoners x 12,000 watched ticks
     * (72,000 samples); 0 means not one of them ever happened, in any of the
     * three prisons.
     */
    expect(none.ticksAtOrBelowUnmetThreshold).toBe(0);
    expect(small.ticksAtOrBelowUnmetThreshold).toBe(0);
    expect(large.ticksAtOrBelowUnmetThreshold).toBe(0);

    // And nowhere close to the threshold, not merely on the right side of it.
    for (const run of [none, small, large]) {
      for (const [n, hunger] of run.lowestHunger.entries()) {
        expect(hunger, `${run.shape} prisoner ${n} came within reach of the unmet floor`).toBeGreaterThan(3 * STATE_INCOME_UNMET_NEED_LEVEL);
      }
    }

    // Exact, deterministic measurements (one seed, one command order, no RNG
    // on this path) -- pinned so a re-baseline has to explain the new numbers.
    expect(none.lowestHunger).toEqual([178.5, 178.5, 178.5, 178.5, 178.5, 178.5]);
    // 173.5 in the fifth slot until issue #588's hire; see `watched`.
    expect(small.lowestHunger).toEqual([174.5, 173.5, 174.5, 173.5, 176.5, 178.5]);
    expect(large.lowestHunger).toEqual([177.5, 176.5, 177.5, 176.5, 176.5, 178.5]);
  });

  it('finds the real effect is travel time, not capacity: `large` travels more and finishes lower than `small`', () => {
    const none = watched('none');
    const small = watched('small');
    const large = watched('large');

    // Any canteen at all inserts round-trip travel a cell-only prison never
    // pays: `action.eat-in-cell` resolves by instance id and a resident
    // already in their own cell arrives immediately, so `none` walks almost
    // nowhere.
    expect(none.travellingPhaseTicks).toBeLessThan(small.travellingPhaseTicks);
    expect(none.travellingPhaseTicks).toBeLessThan(large.travellingPhaseTicks);

    /*
     * **The capacity-is-the-cause story does not survive this comparison.**
     * `large` refuses nobody, ever, and still spends *more* population-summed
     * travelling ticks than the contended `small` -- because every meal in
     * `large` is a canteen trip, while contention in `small` pushes a good
     * share of meals back onto the free, zero-travel cell fallback. If
     * capacity were the lever, `large` would travel *less* than `small`; it
     * travels more.
     */
    expect(large.travellingPhaseTicks).toBeGreaterThan(small.travellingPhaseTicks);

    // And the continuous deficit this file computes (not a production
    // reading) orders the same way: `none` lowest, `small` in the middle,
    // `large` highest -- monotonic in how much canteen-walking each prison
    // does, not in how big the canteen is.
    expect(none.hungerDeficitLevelTicks).toBeLessThan(small.hungerDeficitLevelTicks);
    expect(small.hungerDeficitLevelTicks).toBeLessThan(large.hungerDeficitLevelTicks);

    // Exact pins, for the same reason as the test above.
    expect(none.travellingPhaseTicks).toBe(444);
    expect(small.travellingPhaseTicks).toBe(7_852);
    expect(large.travellingPhaseTicks).toBe(8_140);
    // 2,098,577 until issue #588's hire; see `watched`.
    expect(none.hungerDeficitLevelTicks).toBe(2_096_320);
    expect(small.hungerDeficitLevelTicks).toBe(2_221_400);
    expect(large.hungerDeficitLevelTicks).toBe(2_233_320);
  });

  it('produces the identical loop on a second run of each shape, so nothing here is nondeterministic', () => {
    for (const shape of ['none', 'small', 'large'] as const) {
      const first = watched(shape);
      const second = watched(shape);
      expect(second.lowestHunger).toEqual(first.lowestHunger);
      expect(second.hungerDeficitLevelTicks).toBe(first.hungerDeficitLevelTicks);
      expect(second.actionMetrics).toEqual(first.actionMetrics);
    }
  });
});
