import { describe, expect, it } from 'vitest';
import { DEFAULT_ACTIONS } from '../../src/simulation/prisoners/actions';
import { NEED_DECAY_PER_TICK, NEED_MAX, NEED_SCALE } from '../../src/simulation/prisoners/needs';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * [ADR 0041](../../docs/adr/0041-what-happens-when-a-prisoners-chosen-action-has-nowhere-to-go.md)
 * decision 1: **a prison of cells with no canteen feeds its prisoners.**
 *
 * ## The defect, measured on the pre-fix tree through this exact prison
 *
 * `action.eat-meal` targets `room.canteen` and gains `hunger: 4` a tick;
 * `action.eat-in-cell` targets `own-accommodation` and is authored at `3`
 * (`src/simulation/prisoners/actions.ts`). Both are category `meal`, so on the
 * same need with the same deficit `eat-meal` outscores `eat-in-cell` at every
 * hunger level -- whether or not a canteen exists. `beginNextAction` then took
 * `selectBestAction`'s single answer, failed to resolve a target, counted an
 * unmet cycle and returned, with no second candidate.
 *
 * Measured on this file's own prison before the fix, one prisoner watched every
 * tick to 9,000: `{'action.sleep': 2000, 'action.use-toilet': 140}` and
 * **nothing else** -- `action.eat-in-cell` performed **0** ticks, hunger fell to
 * **0.0** and never once rose. The same prison run to 24,000 ticks at 1, 4 and
 * 24 prisoners gave the same answer every time, so it was never a contention
 * effect: a prisoner entirely alone in a cell block starved.
 *
 * That measurement is what ADR 0041 named as its own weakest point ("I did
 * **not** run a cell-only prison with per-action counters"), and it is the
 * reason this file exists rather than a unit test: the claim is about a prison
 * a player really builds, on the real command path, before their first canteen
 * -- the ordinary state of every prison.
 *
 * ## What this file asserts, and what would have to break for it to fail
 *
 * Not "no exception was thrown", and no `0`/`[]`/`undefined` pin as the
 * headline. The headline is that the prisoner **eats**: `action.eat-in-cell`
 * accumulates performing ticks, and the hunger level **rises**, which no decay
 * curve can produce. Reverting the candidate walk in `beginNextAction` to
 * `selectBestAction`'s single answer takes every assertion below red.
 *
 * The preference is measured next door rather than here:
 * `tests/integration/furnished-prison-loop.test.ts` runs the same loop with a
 * furnished canteen standing and records `action.eat-in-cell` as absent there.
 * Together the two files say the thing one of them alone cannot -- the cell
 * meal is a **fallback**, not a replacement.
 */

const SEED = 0x0b1ec7;

/** `room.cell`'s authored minimum, and the same rectangle `furnished-cell-loop.test.ts` measures. */
const CELL_RECT = { x: 4, y: 6, width: 2, height: 3 } as const;
const BED_TILE = { x: 4, y: 6 } as const;
const TOILET_TILE = { x: 5, y: 6 } as const;
const CELL_ID = 'room.cell:4:6';

/** The tile `src/main.ts` admits at: the middle of the one chunk a new prison owns. */
const ARRIVAL = { x: 16, y: 16 } as const;
/**
 * What one press of the Intake panel's control asks for -- the tile and `priorIncidents: 0` from
 * `ADMISSION_REQUEST` in `src/main.ts`, and a sentence length that press no longer sends.
 * Since #535 decision 5 an omitted length is drawn inside the simulation from
 * `prisoners.sentence`; naming one here is still legal, is never redrawn, and is what keeps
 * this fixture's timings fixed.
 */
const ADMISSION = { sentenceLengthTicks: 10_000, priorIncidents: 0 } as const;

/** Both placements are complete well before this; the prisoner is admitted here. */
const ADMIT_AT = 200;
/** The same horizon `furnished-prison-loop.test.ts` watches, so the two files' counts are comparable. */
const WATCH_UNTIL = 9_000;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/**
 * One zoned cell, one bed, one toilet, and **nothing else zoned at all**.
 *
 * No canteen rectangle is sent, so `room.canteen` is not a room this session
 * has -- which is stronger than an unfurnished one and is the state every
 * prison is in before its first canteen is built.
 */
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
  readonly finalHunger: number;
  readonly minHunger: number;
  readonly hungerEverRose: boolean;
}

/**
 * One prisoner, admitted into the finished cell, watched **every tick**.
 *
 * Every tick rather than every twentieth for the reason
 * `furnished-prison-loop.test.ts` records: a performed action is short and a
 * coarse sample can miss one entirely.
 */
function watchedCellOnlyPrison(): WatchedRun {
  const runtime = cellOnlyPrison();
  stepTo(runtime, ADMIT_AT);
  submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));

  const store = runtime.prisoners.entityStore;
  const performingTicks: Record<string, number> = {};
  let previousHunger = Number.POSITIVE_INFINITY;
  let hungerEverRose = false;
  let minHunger = Number.POSITIVE_INFINITY;

  for (let tick = runtime.kernel.tick + 1; tick <= WATCH_UNTIL; tick += 1) {
    stepTo(runtime, tick);
    const index = store.getIndex(store.getIdByIndex(0));
    const actionIndex = runtime.prisoners.currentAction.actionIndex[index]!;
    // `2` is `performing` in `ACTION_PHASES`; the phase names are not exported,
    // and what matters here is only that the action is being done rather than
    // travelled to.
    if (runtime.prisoners.currentAction.phase[index] === 2 && actionIndex >= 0) {
      const id = DEFAULT_ACTIONS[actionIndex]!.id;
      performingTicks[id] = (performingTicks[id] ?? 0) + 1;
    }
    const hunger = runtime.prisoners.needs.levels.hunger[index]! / NEED_SCALE;
    if (hunger > previousHunger) hungerEverRose = true;
    if (hunger < minHunger) minHunger = hunger;
    previousHunger = hunger;
  }

  const index = store.getIndex(store.getIdByIndex(0));
  return {
    runtime,
    performingTicks,
    finalHunger: runtime.prisoners.needs.levels.hunger[index]! / NEED_SCALE,
    minHunger,
    hungerEverRose,
  };
}

describe('a prison of cells with no canteen', () => {
  it('has nowhere for the best-scoring meal action to go, which is the state the fallback is for', () => {
    const runtime = cellOnlyPrison();
    stepTo(runtime, ADMIT_AT);

    // The two meal actions, read off the catalogue rather than restated here:
    // the canteen one scores strictly higher on the same need, so it is chosen
    // first at every hunger level.
    const meals = DEFAULT_ACTIONS.filter((action) => action.category === 'meal');
    expect(meals.map((action) => action.id)).toEqual(['action.eat-meal', 'action.eat-in-cell']);
    const [canteenMeal, cellMeal] = meals as [(typeof meals)[number], (typeof meals)[number]];
    expect(canteenMeal.needEffectsPerTick.hunger!).toBeGreaterThan(cellMeal.needEffectsPerTick.hunger!);
    expect(canteenMeal.target.kind).toBe('room-catalog-id');
    expect(cellMeal.target.kind).toBe('own-accommodation');

    // And this prison has no canteen at all: not an unfurnished one, none.
    expect(runtime.prisoners.roomInstances.allByRoomCatalogId('room.canteen')).toEqual([]);
    expect(runtime.prisoners.roomInstances.findAvailableForUse('room.canteen', 'dining')).toBeUndefined();
    // The cell, by contrast, is finished and houses somebody -- so the
    // `own-accommodation` target the fallback needs really does resolve.
    expect(runtime.prisoners.roomInstances.getById(CELL_ID)).toMatchObject({ residentCapacity: 1 });
  });

  it('feeds its prisoner: the cell meal is performed, and hunger rises', () => {
    const watched = watchedCellOnlyPrison();

    expect(watched.runtime.prisoners.intakeSystem.getMetrics()).toMatchObject({ completedCount: 1, failedCount: 0 });

    /*
     * **ADR 0041 decision 1, measured.** `action.eat-in-cell` is content that
     * had never executed in any configuration; these are its first performing
     * ticks. The counts are exact because they are deterministic -- one seed,
     * one command order, no RNG on this path -- and they are a measurement of
     * the loop that is supposed to move if the loop changes.
     */
    /*
     * **Two of the four moved on
     * [ADR 0059](../../docs/adr/0059-how-an-actor-gets-from-one-tile-to-the-next.md):
     * `action.sleep` 2,000 -> 2,016, `action.eat-in-cell` 560 -> 520,
     * `action.use-toilet` 580 -> 540 and `action.free-association` 3,420 ->
     * 3,480.** The prisoner now walks the tiles between the delivery tile and
     * their cell instead of being written onto its anchor, so 60 ticks of
     * this window are spent in transit, and they come out of the association
     * that filled the blocks this prison cannot furnish. **The count this file is actually about is still there and still large**:
     * `action.eat-in-cell` is 520 rather than 560, one 40-tick sitting fewer
     * across the window, which is the walk in front of it and not the fallback
     * behind it.
     */
    expect(watched.performingTicks).toEqual({
      'action.sleep': 2_016,
      'action.eat-in-cell': 520,
      'action.use-toilet': 540,
      'action.free-association': 3_480,
    });

    /*
     * **`action.use-toilet` moved too, from 140 ticks to 620, and that is the
     * same fix rather than a side effect.** The general-population regime has
     * three blocks in which `hygiene` is legal
     * (`src/simulation/prisoners/regime.ts`), and in those blocks
     * `action.shower` outscores `action.use-toilet` whenever hygiene is the
     * more depleted need. This prison has no shower room, so before the
     * fallback the prisoner selected the shower, failed to resolve it and stood
     * idle for the whole block; now they use the toilet instead. The hygiene
     * *need* is still unserved -- `action.shower` has no `own-accommodation`
     * sibling and ADR 0041 alternative A says so -- but the prisoner is no
     * longer doing nothing, which is a distinction the ADR's text runs
     * together.
     *
     * **Two of those three counts moved again on
     * [ADR 0054](../../docs/adr/0054-what-a-prisoners-day-is-made-of-when-the-prison-is-empty.md),
     * and the fourth entry is the change.** `action.free-association` was
     * legal in two of the general-population day's ten blocks and is now legal
     * in five, because the three that allowed only room-gated categories --
     * both `work`/`education` blocks and the `recreation`-only block, 1,200
     * ticks a day between them -- had no candidate this prison could resolve
     * at all. `action.use-toilet` fell 620 -> 580 because `[1000,1200)` now
     * ends in association rather than in the toilet the prisoner reached for
     * once the block's own actions failed; the 3,420 ticks of association are
     * time that was previously spent standing still. **Nothing here feeds a
     * need that was not fed before**: association's `needEffectsPerTick` is
     * empty, `scoreAction` therefore gives it exactly 0, and every hunger and
     * bladder figure below is unchanged to the level.
     */

    // Stated as a property as well as a count, so the intent survives a
    // re-baseline: the fallback really was reached, and it was reached by
    // the action whose target is the prisoner's own cell.
    const cellMeal = DEFAULT_ACTIONS.find((action) => action.id === 'action.eat-in-cell')!;
    expect(cellMeal.target.kind, 'the fallback must be the own-accommodation meal for this to mean anything').toBe('own-accommodation');
    expect(watched.performingTicks['action.eat-in-cell'] ?? 0, 'the cell meal was never performed').toBeGreaterThan(0);

    /*
     * **The player-visible consequence, and the assertion that cannot be
     * satisfied by decay.** A need is a reservoir: it drains on its own and
     * only a performed action refills it. `action.eat-in-cell` is the only
     * entry in `DEFAULT_ACTIONS` this prison can reach whose
     * `needEffectsPerTick` touches hunger, so a hunger level that goes *up* is
     * proof a cell meal happened.
     */
    expect(watched.hungerEverRose, 'a hunger level that rises is a meal that happened').toBe(true);
    // 230.5, unmoved by ADR 0059 at the shipped walking speed: the walk to the
    // cell shifts *when* the last meal of the window is eaten by a few ticks
    // and the level it leaves behind lands in the same place.
    expect(watched.finalHunger).toBe(230.5);
    /*
     * 178.5, and it was 179.5 before ADR 0054. One whole level, which is
     * exactly 20 ticks of `NEED_DECAY_PER_TICK.hunger` (0.05) -- one
     * `ActionSystem` reconsideration cadence. A 60-tick association started in
     * the `[1000,1200)` block runs one cycle past the block it began in, so
     * the first meal of the `[1200,1300)` block begins one cycle later than it
     * used to and the trough is one cycle deeper. It is a shift in *when* the
     * prisoner eats, not in whether: the meal count above is unchanged at 560
     * ticks.
     */
    expect(watched.minHunger, 'the prisoner is never starved to the floor').toBe(178.5);

    /*
     * And it is nowhere near what pure decay would leave. The prisoner is
     * admitted at tick 200 and watched to 9,000, so an entirely unfed prisoner
     * decays through `NEED_MAX` levels long before the end and sits clamped at
     * the floor -- which is exactly what this prison measured before the
     * fallback landed. Both figures come from production constants, not from
     * the system under test.
     */
    const unfedDecayLevels = (WATCH_UNTIL - ADMIT_AT) * NEED_DECAY_PER_TICK.hunger;
    expect(unfedDecayLevels).toBeGreaterThan(NEED_MAX);
    expect(watched.finalHunger).toBeGreaterThan(0);
  });

  it('produces the identical loop on a second run, so the fallback added no nondeterminism', () => {
    const first = watchedCellOnlyPrison();
    const second = watchedCellOnlyPrison();

    expect(second.performingTicks).toEqual(first.performingTicks);
    expect(second.finalHunger).toBe(first.finalHunger);
    expect(second.runtime.prisoners.actionSystem.getMetrics()).toEqual(first.runtime.prisoners.actionSystem.getMetrics());
  });
});
