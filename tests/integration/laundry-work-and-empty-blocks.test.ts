import { describe, expect, it } from 'vitest';
import { DEFAULT_ACTIONS } from '../../src/simulation/prisoners/actions';
import { NEED_DECAY_PER_TICK, NEED_MAX, NEED_SCALE } from '../../src/simulation/prisoners/needs';
import { DAY_LENGTH_TICKS, GENERAL_POPULATION_REGIME, resolveActiveRegimeBlock } from '../../src/simulation/prisoners/regime';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * [ADR 0054](../../docs/adr/0054-what-a-prisoners-day-is-made-of-when-the-prison-is-empty.md),
 * on the real command path: **a prison of cells stops standing still, and the
 * `work` category stops being vocabulary.**
 *
 * ## What was measured before the change, through this file's own prisons
 *
 * Issue #440 says two of seven action categories have no action and that half
 * the general-population day therefore has nothing in it. The first half is
 * out of date -- `action.free-association` landed on 2026-08-27 and `work` was
 * the only category left -- and the second half is true for a reason the issue
 * does not give. Driven through the real kernel, one prisoner, ten in-game
 * days, a prison of cells and nothing else:
 *
 * ```
 * idle 1,450 of 2,400 ticks a day          unmetDemandCycles 554 of 1,200 cycles
 * actions ever performed: action.sleep, action.use-toilet, action.eat-in-cell
 * ```
 *
 * **None of those 1,450 ticks were the empty `work` category.** No block of any
 * schedule this repository ships or builds at runtime allows `work` alone --
 * both `['work', 'education']` blocks also allow `education` -- so an
 * unauthored `work` cost nothing that `education` did not already cover. What
 * emptied the day is that every action but `action.sleep`,
 * `action.eat-in-cell`, `action.use-toilet` and `action.free-association`
 * names a **zoned room**, and three blocks listed only categories served by
 * those. Measured in the same prison with a furnished classroom, canteen,
 * shower room, yard and common room, the two `work`/`education` blocks were
 * already full: `action.classroom-education` performed 9,000 of their 10,000
 * ticks and `unmetDemandCycles` was 0.
 *
 * So the change is two things that are deliberately not the same thing, and
 * this file measures them separately:
 *
 * 1. **The blocks that could be empty are given a terminal.** `regime.ts` adds
 *    `'free-association'` to the three general-population blocks and the one
 *    high-risk block whose every category was room-gated. It fulfils no need,
 *    so it changes what a prisoner *does* and nothing about what they *get*.
 * 2. **`work` is authored as a room a player builds.** `action.laundry-work`
 *    targets `room.laundry` -- in the catalogue since it shipped, buildable
 *    since ADR 0028 phase 4, and read by nothing at all until now.
 */

const SEED = 0x0b1ec7;

/** `room.cell`'s authored minimum, and the same rectangle the other loop files measure. */
const CELL_RECT = { x: 4, y: 6, width: 2, height: 3 } as const;
const BED_TILE = { x: 4, y: 6 } as const;
const TOILET_TILE = { x: 5, y: 6 } as const;

/** `room.laundry`'s authored 3x3 minimum, clear of the cell. */
const LAUNDRY_RECT = { x: 10, y: 6, width: 3, height: 3 } as const;
const LAUNDRY_ID = 'room.laundry:10:6';
/** Two `2x1` machines, the room's authored minimum, on two rows so no footprint overlaps. */
const MACHINE_TILES = [{ x: 10, y: 6 }, { x: 10, y: 7 }] as const;

/** The tile `src/main.ts` admits at: the middle of the one chunk a new prison owns. */
const ARRIVAL = { x: 16, y: 16 } as const;
const ADMISSION = { sentenceLengthTicks: 200_000, priorIncidents: 0 } as const;

/** Every build order is complete well before this, and the prisoner is admitted here. */
const ADMIT_AT = 600;
/** Long enough for the run to settle out of intake before anything is counted. */
const WATCH_FROM = 1_000;
/** Five whole in-game days of watching, so a per-day figure is an average over five. */
const WATCH_UNTIL = WATCH_FROM + DAY_LENGTH_TICKS * 5;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/**
 * One finished cell, and a `room.laundry` furnished with `machines` washing
 * machines -- zero of them being the control, exactly as
 * `furnished-prison-loop.test.ts` uses a shower room with no shower head.
 *
 * A zoned room with none of its objects is a stronger control than no room at
 * all: the instance exists, `allByRoomCatalogId` finds it, and the only thing
 * missing is the capability the action gates on.
 */
function prisonWithLaundry(machines: 0 | 1 | 2): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 1 }));
  submit(runtime, 'buy-brick', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.brick', quantity: 5 }));

  wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...CELL_RECT }));
  submit(runtime, 'place-bed', packCommand({ type: 'PlaceObject', orderId: 'bed-1', definitionId: 'bed-wooden', ...BED_TILE }));
  submit(runtime, 'place-toilet', packCommand({ type: 'PlaceObject', orderId: 'toilet-1', definitionId: 'toilet-brick', ...TOILET_TILE }));

  wallRoomPerimeter(runtime.world, LAUNDRY_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-laundry', packCommand({ type: 'ZoneRoom', roomId: 'room.laundry', ...LAUNDRY_RECT }));
  for (let n = 0; n < machines; n += 1) {
    submit(runtime, `place-machine-${n}`, packCommand({ type: 'PlaceObject', orderId: `wm-${n}`, definitionId: 'washing-machine-brick', ...MACHINE_TILES[n]! }));
  }
  return runtime;
}

/** A prison of cells and nothing else -- the state every prison is in on day one. */
function cellOnlyPrison(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 1 }));
  submit(runtime, 'buy-brick', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.brick', quantity: 1 }));
  wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...CELL_RECT }));
  submit(runtime, 'place-bed', packCommand({ type: 'PlaceObject', orderId: 'bed-1', definitionId: 'bed-wooden', ...BED_TILE }));
  submit(runtime, 'place-toilet', packCommand({ type: 'PlaceObject', orderId: 'toilet-1', definitionId: 'toilet-brick', ...TOILET_TILE }));
  return runtime;
}

interface WatchedRun {
  readonly runtime: SimulationRuntime;
  readonly performingTicks: Record<string, number>;
  /** Ticks the prisoner spent in a `work`/`education` block with no action selected. */
  readonly idleWorkBlockTicks: number;
  readonly finalHygiene: number;
  readonly hygieneEverRose: boolean;
}

/**
 * One prisoner watched **every tick**, for `furnished-prison-loop.test.ts`'s
 * reason: a performed action is short and a coarse sample can miss one whole.
 */
function watch(runtime: SimulationRuntime): WatchedRun {
  stepTo(runtime, ADMIT_AT);
  submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
  stepTo(runtime, WATCH_FROM);

  const store = runtime.prisoners.entityStore;
  const performingTicks: Record<string, number> = {};
  let idleWorkBlockTicks = 0;
  let previousHygiene = Number.POSITIVE_INFINITY;
  let hygieneEverRose = false;

  for (let tick = runtime.kernel.tick + 1; tick <= WATCH_UNTIL; tick += 1) {
    stepTo(runtime, tick);
    const index = store.getIndex(store.getIdByIndex(0));
    const actionIndex = runtime.prisoners.currentAction.actionIndex[index]!;
    // `2` is `performing` in `ACTION_PHASES`; the phase names are not exported,
    // and what matters here is only that the action is being done rather than
    // travelled to.
    if (runtime.prisoners.currentAction.phase[index] === 2 && actionIndex >= 0) {
      performingTicks[DEFAULT_ACTIONS[actionIndex]!.id] = (performingTicks[DEFAULT_ACTIONS[actionIndex]!.id] ?? 0) + 1;
    } else if (runtime.prisoners.currentAction.phase[index] === 0) {
      if (resolveActiveRegimeBlock(GENERAL_POPULATION_REGIME, tick).allowedCategories.includes('work')) idleWorkBlockTicks += 1;
    }
    const hygiene = runtime.prisoners.needs.levels.hygiene[index]! / NEED_SCALE;
    if (hygiene > previousHygiene) hygieneEverRose = true;
    previousHygiene = hygiene;
  }

  const index = store.getIndex(store.getIdByIndex(0));
  return {
    runtime,
    performingTicks,
    idleWorkBlockTicks,
    finalHygiene: runtime.prisoners.needs.levels.hygiene[index]! / NEED_SCALE,
    hygieneEverRose,
  };
}

describe('a prison with a furnished laundry', () => {
  it('derives the capability and the ceiling the work action gates on', () => {
    const runtime = prisonWithLaundry(2);
    stepTo(runtime, ADMIT_AT);

    /*
     * The precondition, read off the derivation rather than restated.
     * `object.washing-machine` is `2x1` and declares `'laundry'` alone, so two
     * of them make the room's all-objects total 4 and its one per-capability
     * ceiling `'laundry'` of 4 -- the #326 arithmetic, and four prisoners at
     * the machines at once.
     */
    expect(runtime.prisoners.roomInstances.getById(LAUNDRY_ID)).toMatchObject({
      concurrentUseCapacity: 4,
      concurrentUseCapacityByCapability: [['laundry', 4]],
    });
    expect(runtime.prisoners.roomInstances.findAvailableForUse('room.laundry', 'laundry')?.instanceId).toBe(LAUNDRY_ID);

    // And the action really is the one gating on it, read off the catalogue.
    const work = DEFAULT_ACTIONS.find((action) => action.id === 'action.laundry-work')!;
    expect(work.category).toBe('work');
    expect(work.target).toEqual({ kind: 'room-catalog-id', roomCatalogId: 'room.laundry' });
    expect(work.requiredObjectCapability).toBe('laundry');
  });

  it('puts the prisoner to work, and hygiene rises where no shower stands', () => {
    const withMachines = watch(prisonWithLaundry(2));

    expect(withMachines.runtime.prisoners.intakeSystem.getMetrics()).toMatchObject({ completedCount: 1, failedCount: 0 });

    /*
     * **The first performing ticks of the `work` category in this project's
     * history.** Exact because the loop is deterministic -- one seed, one
     * command order, no RNG on this path -- and a measurement of the loop
     * rather than a bound.
     */
    /*
     * **Re-measured for [ADR 0059](../../docs/adr/0059-how-an-actor-gets-from-one-tile-to-the-next.md).**
     * A prisoner now walks the tiles between one room and the next instead of
     * being written onto the destination anchor in the tick their route
     * resolved, so every count here loses the ticks spent in transit. The
     * counts this replaces are named beside each entry; what the assertion is
     * *for* -- that the room-gated actions were reached at all -- is the
     * property loop below it and is unchanged.
     */
    expect(withMachines.performingTicks).toEqual({
      'action.sleep': 3_000, // unchanged
      'action.eat-in-cell': 440, // 640
      'action.use-toilet': 460, // 880
      'action.laundry-work': 2_508, // 2,420
      'action.free-association': 1_188, // 1,740
    });

    /*
     * **The player-visible consequence, and the assertion decay cannot
     * satisfy.** A need is a reservoir: it drains on its own and only a
     * performed action refills it. This prison has **no shower room**, and
     * `action.shower` is the only other entry in `DEFAULT_ACTIONS` whose
     * `needEffectsPerTick` touches hygiene -- so a hygiene level that goes
     * *up* is proof a shift in the laundry happened. Measured in the same
     * prison with the machines left out, hygiene reaches the floor and stays
     * there, which is where every cell-only prison sat before this change.
     */
    expect(withMachines.hygieneEverRose, 'a hygiene level that rises is a shift that happened').toBe(true);
    // 250.4, not 254.4, since ADR 0059: the prisoner walks to the laundry, so
    // fewer of the window's ticks are spent working in it. The claim this
    // supports -- hygiene *rises* where no shower stands -- is the assertion
    // beside it and is unchanged.
    expect(withMachines.finalHygiene).toBe(250.4);

    const control = watch(prisonWithLaundry(0));
    expect(control.runtime.prisoners.roomInstances.findAvailableForUse('room.laundry', 'laundry')).toBeUndefined();
    expect(control.performingTicks['action.laundry-work']).toBeUndefined();
    expect(control.hygieneEverRose, 'with no washing machine, hygiene can only drain').toBe(false);
    expect(control.finalHygiene).toBe(7);

    /*
     * 7, and the 7 is pure decay rather than a number this file chose. The
     * prisoner is admitted at tick 600 and watched to the end of the fifth
     * day, and `NEED_DECAY_PER_TICK.hygiene` is 0.02 -- so an unwashed
     * prisoner loses almost the whole of `NEED_MAX` and ends just above the
     * floor. Both figures come from production constants rather than from the
     * system under test, and the gap between the two prisons is 247.4 levels
     * that only a performed shift can account for.
     */
    const unwashedDecayLevels = (WATCH_UNTIL - ADMIT_AT) * NEED_DECAY_PER_TICK.hygiene;
    expect(unwashedDecayLevels).toBeGreaterThan(NEED_MAX - 10);
    expect(control.finalHygiene).toBeLessThan(withMachines.finalHygiene - 200);
  });

  it('is the room and not the prison: one machine short of the authored minimum still works', () => {
    /*
     * `room.laundry` requires two machines, so one leaves the *room* reading
     * unsatisfied -- and the action does not ask the room whether it is
     * satisfied, it asks `findAvailableForUse` for a free place carrying
     * `'laundry'`. One `2x1` machine is a ceiling of two, so the shift still
     * runs. Stated because it is the kind of coupling a reader assumes exists:
     * a room's catalogue requirements gate what the *player* is told about the
     * room, not what `ActionSystem` can resolve in it.
     */
    const halfFurnished = watch(prisonWithLaundry(1));
    expect(halfFurnished.runtime.prisoners.roomInstances.getById(LAUNDRY_ID)).toMatchObject({
      concurrentUseCapacityByCapability: [['laundry', 2]],
    });
    expect(halfFurnished.performingTicks['action.laundry-work'] ?? 0).toBeGreaterThan(0);
  });
});

describe('a prison of cells and nothing else', () => {
  it('leaves no reconsideration with nothing to do, which is the number this change exists to move', () => {
    /*
     * **554 -> 0**, measured on this exact prison. `unmetDemandCycles` is
     * documented as "reconsideration cycles where no legal action had a
     * reachable, available target", and before ADR 0054 the three blocks whose
     * every category is served only by a room-gated action produced one on
     * every cycle: 1,200 of the day's 2,400 ticks, at `ActionSystem`'s
     * twenty-tick cadence, over five days.
     *
     * Zero is the whole claim, and it is not zero by there being nothing to
     * count: `actionsStarted` and `routeFailures` are asserted beside it so a
     * run that had stopped reconsidering at all would fail here rather than
     * pass.
     */
    const run = watch(cellOnlyPrison());

    expect(run.runtime.prisoners.actionSystem.getMetrics()).toMatchObject({ unmetDemandCycles: 0, routeFailures: 0 });
    expect(run.runtime.prisoners.actionSystem.getMetrics().actionsStarted).toBeGreaterThan(100);

    /*
     * And the two `work`/`education` blocks in particular, which are 1,000 of
     * the day's 2,400 ticks and were **entirely** idle: this prison has no
     * classroom and no laundry, so `education` and `work` both resolve
     * nothing, and `'free-association'` is the only reason the prisoner is
     * doing anything at all in them.
     */
    /*
     * 1,257 of the 5,000 ticks those blocks hold over five days, and **it was
     * 5,000** -- every one of them -- before this change. What is left is not
     * empty content: it is `ActionSystem`'s twenty-tick reconsideration
     * cadence, which no action can fill. `action.free-association` completes at
     * `elapsed >= 60` and the next selection happens on the *following* cycle,
     * so one performance occupies 60 ticks out of every 80 and 25% of any block
     * it fills reads as idle -- 1,250 of 5,000, with the remaining 7 the
     * boundary ticks where a performance begun in the previous block finishes.
     * `unmetDemandCycles` above is the figure with no such floor in it, and it
     * is zero.
     */
    // 1,238, not 1,257, since ADR 0059: nineteen of those ticks are now spent
    // *travelling* rather than standing, and this counter reads the `idle`
    // phase specifically. The floor the paragraph above derives is unchanged --
    // it is the reconsideration cadence, which no walk shortens.
    expect(run.idleWorkBlockTicks).toBe(1_238);
    expect(run.idleWorkBlockTicks, 'a work/education block with no classroom and no laundry is still mostly spent standing still').toBeLessThan(DAY_LENGTH_TICKS);
    expect(run.performingTicks['action.free-association'] ?? 0).toBeGreaterThan(0);

    /*
     * **And the neglect is untouched, which is the half that makes this safe.**
     * `action.free-association` declares no need effect, so `scoreAction` gives
     * it exactly 0 and it can never displace a candidate addressing a need that
     * is even slightly unmet. Hygiene has no route in a prison with no shower
     * room and no laundry, and it is still at the floor at the end of five
     * days -- the pressure ADR 0048 turns into a riot is not relieved by giving
     * the prisoner somewhere to put the time.
     */
    expect(run.finalHygiene).toBe(7);
    expect(run.hygieneEverRose).toBe(false);
  });

  it('produces the identical loop on a second run, so neither the terminal nor the work action added nondeterminism', () => {
    const first = watch(cellOnlyPrison());
    const second = watch(cellOnlyPrison());
    const firstLaundry = watch(prisonWithLaundry(2));
    const secondLaundry = watch(prisonWithLaundry(2));

    expect(second.performingTicks).toEqual(first.performingTicks);
    expect(second.runtime.prisoners.actionSystem.getMetrics()).toEqual(first.runtime.prisoners.actionSystem.getMetrics());
    expect(secondLaundry.performingTicks).toEqual(firstLaundry.performingTicks);
    expect(secondLaundry.runtime.prisoners.actionSystem.getMetrics()).toEqual(firstLaundry.runtime.prisoners.actionSystem.getMetrics());
  });
});
