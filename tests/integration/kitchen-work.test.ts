import { describe, expect, it } from 'vitest';
import { DEFAULT_ACTIONS } from '../../src/simulation/prisoners/actions';
import { NEED_SCALE } from '../../src/simulation/prisoners/needs';
import { DAY_LENGTH_TICKS, GENERAL_POPULATION_REGIME, resolveActiveRegimeBlock } from '../../src/simulation/prisoners/regime';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * Issue #532, on the real command path: **`room.kitchen` stops being a room a
 * player can finish and never use.**
 *
 * ## What was measured before the change
 *
 * `room.kitchen` had no entry in `DEFAULT_ACTIONS` at all, and a grep over
 * `src/` for its id returned the catalogue row, a locale string and a comment
 * -- no executable reference anywhere. A player could wall it, zone it,
 * furnish it with a stove, a prep counter and a fridge, be told by the Rooms
 * panel that every requirement was met, and nothing would ever happen in it.
 * `tests/foundation/unconsumed-content-contract.test.ts` said the same thing
 * from the other end: *"Declared with no reader anywhere."*
 *
 * ## Why the assertions here are shaped the way they are
 *
 * `laundry-work-and-empty-blocks.test.ts` -- the file this one copies -- can
 * prove a shift happened by watching hygiene *rise*, because `action.shower`
 * is the only other entry that touches hygiene and its prison has no shower
 * room. **That proof is not available here and using it would be the defect
 * it looks like a copy of.** `action.eat-in-cell` targets
 * `own-accommodation`, needs no room and gains `hunger` at 3, so hunger rises
 * in every prison including one with no kitchen at all. A rising-hunger
 * assertion would therefore have passed against the unfixed catalogue.
 *
 * What is used instead is the pair a control can separate: the action is
 * performed at all, and the *difference between two prisons* that differ only
 * in whether the food-preparation objects were placed.
 */

const SEED = 0x0b1ec7;

/** `room.cell`'s authored minimum, and the same rectangle the other loop files measure. */
const CELL_RECT = { x: 4, y: 6, width: 2, height: 3 } as const;
const BED_TILE = { x: 4, y: 6 } as const;
const TOILET_TILE = { x: 5, y: 6 } as const;

/** `room.kitchen`'s authored 4x4 minimum, clear of the cell. */
const KITCHEN_RECT = { x: 10, y: 6, width: 4, height: 4 } as const;
const KITCHEN_ID = 'room.kitchen:10:6';
/** A `2x1` stove and a `2x1` prep counter on two rows, so no footprint overlaps. */
const STOVE_TILE = { x: 10, y: 6 } as const;
const PREP_COUNTER_TILE = { x: 10, y: 7 } as const;
/** `1x1`, and deliberately placed in **every** variant: it carries `'food-storage'`, which no action gates on. */
const FRIDGE_TILE = { x: 13, y: 6 } as const;

/** The tile `src/main.ts` admits at: the middle of the one chunk a new prison owns. */
const ARRIVAL = { x: 16, y: 16 } as const;
const ADMISSION = { sentenceLengthTicks: 200_000, priorIncidents: 0 } as const;

const ADMIT_AT = 600;
const WATCH_FROM = 1_000;
const WATCH_UNTIL = WATCH_FROM + DAY_LENGTH_TICKS * 5;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/**
 * One finished cell, and a `room.kitchen` holding a fridge plus
 * `preparationObjects` of the two objects that carry `'food-preparation'`.
 *
 * **Zero is the control, and it is a zoned kitchen with a fridge in it** --
 * not an absent room, and not an empty one. The instance exists,
 * `allByRoomCatalogId` finds it, an object stands inside its rectangle and
 * `concurrentUseCapacity` is therefore non-zero. The only thing missing is the
 * one capability the action gates on, which is what makes this control able to
 * fail for the right reason: it separates "the kitchen is furnished" from "the
 * kitchen is furnished with the thing the work consumes".
 */
function prisonWithKitchen(preparationObjects: 0 | 1 | 2): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 1 }));
  submit(runtime, 'buy-brick', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.brick', quantity: 6 }));

  wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...CELL_RECT }));
  submit(runtime, 'place-bed', packCommand({ type: 'PlaceObject', orderId: 'bed-1', definitionId: 'bed-wooden', ...BED_TILE }));
  submit(runtime, 'place-toilet', packCommand({ type: 'PlaceObject', orderId: 'toilet-1', definitionId: 'toilet-brick', ...TOILET_TILE }));

  wallRoomPerimeter(runtime.world, KITCHEN_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-kitchen', packCommand({ type: 'ZoneRoom', roomId: 'room.kitchen', ...KITCHEN_RECT }));
  submit(runtime, 'place-fridge', packCommand({ type: 'PlaceObject', orderId: 'fridge-1', definitionId: 'fridge-brick', ...FRIDGE_TILE }));
  if (preparationObjects >= 1) {
    submit(runtime, 'place-stove', packCommand({ type: 'PlaceObject', orderId: 'stove-1', definitionId: 'stove-brick', ...STOVE_TILE }));
  }
  if (preparationObjects >= 2) {
    submit(runtime, 'place-prep', packCommand({ type: 'PlaceObject', orderId: 'prep-1', definitionId: 'prep-counter-brick', ...PREP_COUNTER_TILE }));
  }
  return runtime;
}

interface WatchedRun {
  readonly runtime: SimulationRuntime;
  readonly performingTicks: Record<string, number>;
  /** Ticks the prisoner spent in a `work`/`education` block with no action selected. */
  readonly idleWorkBlockTicks: number;
  readonly finalHunger: number;
}

/** One prisoner watched **every tick**, because a performed action is short and a coarse sample can miss one whole. */
function watch(runtime: SimulationRuntime): WatchedRun {
  stepTo(runtime, ADMIT_AT);
  submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
  stepTo(runtime, WATCH_FROM);

  const store = runtime.prisoners.entityStore;
  const performingTicks: Record<string, number> = {};
  let idleWorkBlockTicks = 0;

  for (let tick = runtime.kernel.tick + 1; tick <= WATCH_UNTIL; tick += 1) {
    stepTo(runtime, tick);
    const index = store.getIndex(store.getIdByIndex(0));
    const actionIndex = runtime.prisoners.currentAction.actionIndex[index]!;
    // `2` is `performing` in `ACTION_PHASES` and `0` is `idle`; the phase names
    // are not exported, and what matters here is only that the action is being
    // done rather than travelled to.
    if (runtime.prisoners.currentAction.phase[index] === 2 && actionIndex >= 0) {
      performingTicks[DEFAULT_ACTIONS[actionIndex]!.id] = (performingTicks[DEFAULT_ACTIONS[actionIndex]!.id] ?? 0) + 1;
    } else if (runtime.prisoners.currentAction.phase[index] === 0) {
      if (resolveActiveRegimeBlock(GENERAL_POPULATION_REGIME, tick).allowedCategories.includes('work')) idleWorkBlockTicks += 1;
    }
  }

  const index = store.getIndex(store.getIdByIndex(0));
  return {
    runtime,
    performingTicks,
    idleWorkBlockTicks,
    finalHunger: runtime.prisoners.needs.levels.hunger[index]! / NEED_SCALE,
  };
}

describe('a prison with a furnished kitchen', () => {
  it('derives the capability and the ceiling the work action gates on', () => {
    const runtime = prisonWithKitchen(2);
    stepTo(runtime, ADMIT_AT);

    /*
     * The precondition, read off the derivation rather than restated.
     * `object.stove` and `object.prep-counter` are each `2x1` and each declares
     * `'food-preparation'` alone; `object.fridge` is `1x1` and declares
     * `'food-storage'`. So the all-objects total is 5 and the two
     * per-capability ceilings are 4 and 1 -- the #326 arithmetic, and four
     * prisoners on kitchen duty at once, the same number a furnished laundry
     * puts to work.
     */
    expect(runtime.prisoners.roomInstances.getById(KITCHEN_ID)).toMatchObject({
      concurrentUseCapacity: 5,
      concurrentUseCapacityByCapability: [['food-preparation', 4], ['food-storage', 1]],
    });
    expect(runtime.prisoners.roomInstances.findAvailableForUse('room.kitchen', 'food-preparation')?.instanceId).toBe(KITCHEN_ID);

    // And the action really is the one gating on it, read off the catalogue.
    const work = DEFAULT_ACTIONS.find((action) => action.id === 'action.kitchen-work')!;
    expect(work.category).toBe('work');
    expect(work.target).toEqual({ kind: 'room-catalog-id', roomCatalogId: 'room.kitchen' });
    expect(work.requiredObjectCapability).toBe('food-preparation');
    // The fridge is furniture the action does not consume, and that is the
    // decision rather than an omission: one action consumes one capability.
    expect(work.requiredObjectCapability).not.toBe('food-storage');
  });

  it('puts the prisoner on kitchen duty, where a kitchen with only a fridge in it puts nobody', () => {
    const furnished = watch(prisonWithKitchen(2));
    expect(furnished.runtime.prisoners.intakeSystem.getMetrics()).toMatchObject({ completedCount: 1, failedCount: 0 });

    /*
     * Exact because the loop is deterministic -- one seed, one command order,
     * no RNG on this path -- and a measurement of the loop rather than a bound.
     */
    expect(furnished.performingTicks).toEqual({
      'action.sleep': 3_000,
      'action.eat-in-cell': 760,
      'action.use-toilet': 800,
      'action.kitchen-work': 3_880,
      'action.free-association': 360,
    });

    /*
     * **The control, and the comparison that a rising hunger level could not
     * make.** Same seed, same commands, same walls, same fridge; the two
     * objects carrying `'food-preparation'` are the only difference. It cannot
     * reach the action, and the difference in what the prisoner *gets* is
     * therefore attributable to the shift and to nothing else.
     */
    const control = watch(prisonWithKitchen(0));
    expect(control.runtime.prisoners.roomInstances.findAvailableForUse('room.kitchen', 'food-preparation')).toBeUndefined();
    expect(control.performingTicks['action.kitchen-work']).toBeUndefined();
    // The control's kitchen is furnished and its instance is real -- what it
    // lacks is the one capability, which is what makes it a control rather
    // than an absence.
    expect(control.runtime.prisoners.roomInstances.getById(KITCHEN_ID)).toMatchObject({
      concurrentUseCapacityByCapability: [['food-storage', 1]],
    });
    expect(control.runtime.prisoners.roomInstances.findAvailableForUse('room.kitchen', 'food-storage')?.instanceId).toBe(KITCHEN_ID);

    expect(control.performingTicks).toEqual({
      'action.sleep': 3_000,
      'action.eat-in-cell': 760,
      'action.use-toilet': 960,
      'action.free-association': 4_220,
    });

    /*
     * **The player-visible consequence, and the reason the control has to be
     * a whole second prison rather than a second assertion about the first.**
     *
     * `action.eat-in-cell` performs **760 ticks in both prisons** -- the same
     * number, from the same seed, in the same cell -- and `action.sleep` 3,000
     * in both. So the two runs put identical amounts of *eating* into the
     * prisoner, and the 64 levels of hunger between them are the kitchen shift
     * and nothing else. That equality is the load-bearing line here: without
     * it, a higher final hunger would be consistent with the furnished prison
     * simply having eaten more.
     *
     * The other half is where the day went. Both prisons run the same two
     * `work`/`education` blocks, and neither has a classroom or a laundry, so
     * in the control every one of those ticks that is not spent walking or
     * reconsidering goes to `action.free-association` -- an action authored to
     * fulfil nothing, which is exactly what a block with nothing in it looks
     * like. 4,220 -> 360.
     */
    expect(furnished.performingTicks['action.eat-in-cell']).toBe(control.performingTicks['action.eat-in-cell']);
    expect(furnished.finalHunger).toBe(254.5);
    expect(control.finalHunger).toBe(190.5);
    expect(furnished.finalHunger).toBeGreaterThan(control.finalHunger);

    // Fewer reconsiderations with nothing worth doing, measured rather than
    // claimed to be zero: a prisoner is idle between one action ending and the
    // next twenty-tick reconsideration, so zero is not the value a working
    // prison has.
    expect(furnished.idleWorkBlockTicks).toBe(677);
    expect(control.idleWorkBlockTicks).toBe(1_257);
  });

  it('is the room and not the prison: one object short of the authored minimum still works', () => {
    /*
     * `room.kitchen` requires a stove, a prep counter *and* a fridge, so
     * leaving the prep counter out leaves the *room* reading unsatisfied -- and
     * the action does not ask the room whether it is satisfied, it asks
     * `findAvailableForUse` for a free place carrying `'food-preparation'`.
     * One `2x1` stove is a ceiling of two, so the shift still runs. Stated
     * because it is the kind of coupling a reader assumes exists: a room's
     * catalogue requirements gate what the *player* is told about the room, not
     * what `ActionSystem` can resolve in it.
     */
    const halfFurnished = watch(prisonWithKitchen(1));
    expect(halfFurnished.runtime.prisoners.roomInstances.getById(KITCHEN_ID)).toMatchObject({
      concurrentUseCapacityByCapability: [['food-preparation', 2], ['food-storage', 1]],
    });
    expect(halfFurnished.performingTicks['action.kitchen-work'] ?? 0).toBeGreaterThan(0);
  });
});
