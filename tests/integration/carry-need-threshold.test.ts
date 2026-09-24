import { describe, expect, it } from 'vitest';
import { Container } from '../../src/simulation/operations/inventory';
import { STATE_INCOME_UNMET_NEED_LEVEL, isNeedUnmetForStateIncome } from '../../src/simulation/economy/income';
import { DEFAULT_ACTIONS } from '../../src/simulation/prisoners/actions';
import { ACTION_PHASES } from '../../src/simulation/prisoners/components';
import { NEED_MAX } from '../../src/simulation/prisoners/needs';
import { GENERAL_POPULATION_REGIME, resolveActiveRegimeBlock } from '../../src/simulation/prisoners/regime';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **Duty outranks want inside a work block — until the need is urgent.**
 *
 * This is the one rule in `docs/adr/0093-a-carry-is-an-action.md` the
 * repository owner **overruled the draft on**, and the only guard on their
 * ruling. Decision 2 as drafted said a hungry prisoner carries before they
 * cook, unconditionally. On 2026-09-02 the owner answered: *"the need wins when
 * it is urgent."* The rank-0 rule stands for a prisoner in ordinary condition
 * and yields to a need that has become urgent.
 *
 * ## The threshold, and why it is not a number this file chose
 *
 * `STATE_INCOME_UNMET_NEED_LEVEL` (51 of `NEED_MAX` 255) — the level below
 * which the state declines to pay for that prisoner-day — read through
 * `isNeedUnmetForStateIncome`, which `src/simulation/economy/income.ts` calls
 * *"the one copy"* of the comparison. The amendment's own reasoning is that
 * reusing it makes the rule one statement rather than two: *the institution
 * will not send a prisoner on an errand while it is already failing to meet a
 * need it is being docked for.*
 *
 * The amendment also **corrected the measurand** the draft had proposed, and
 * that correction is asserted here rather than assumed: a threshold on the
 * need's **level**, not on `scoreAction`'s output. `scoreAction` is deficit x
 * effect summed over the action's own effects, so its scale depends on how
 * large that action's effects are and two actions relieving the same deficit
 * score differently.
 *
 * ## What the two cases are
 *
 * One prison, one prisoner, one errand on the board, and a furnished
 * `room.kitchen` so that the prisoner has *something else* a work block allows
 * — without it there is nothing for the need to win over and the test would be
 * vacuous either way. The only difference between the cases is the prisoner's
 * `hunger` level, written directly, which is what makes this a test of the
 * threshold and not of the decay rate.
 *
 * - **Ordinary hunger:** the prisoner takes `action.carry`. Duty outranks want.
 * - **Unmet hunger:** the prisoner takes `action.kitchen-work`, and the errand
 *   stays on the board waiting for somebody who is not starving.
 *
 * ## The pre-existing defect this measures rather than fixes
 *
 * **`action.kitchen-work` is the *only* thing a hungry prisoner can do about
 * hunger inside a work block, and it gains hunger at 1 a tick against
 * `action.eat-meal`'s 4.** A work block allows `work`, `education` and
 * `free-association` only (`regime.ts`), so a hungry prisoner cannot eat during
 * one at all, and `action.free-association` scores 0 by construction. So the
 * owner's ruling routes a starving prisoner to the slowest of the game's three
 * routes to hunger — which is still strictly better than the errand, whose
 * effect on hunger is nothing. That is measured below rather than argued: the
 * hungry prisoner's hunger is compared before and after the shift.
 */

const SEED = 0x0b1ec7;

const CELL_RECT = { x: 4, y: 6, width: 2, height: 3 } as const;
const KITCHEN_RECT = { x: 10, y: 6, width: 4, height: 4 } as const;
const ARRIVAL = { x: 16, y: 16 } as const;
const PICKUP_TILE = { x: 22, y: 8 } as const;
const DROPOFF_TILE = { x: 26, y: 20 } as const;

const ADMIT_AT = 600;
/** Inside `GENERAL_POPULATION_REGIME`'s second `work` block (1,300-1,800). */
const DECIDE_AT = 1_320;

/** Comfortably above the threshold: an ordinary, unremarkable prisoner. */
const ORDINARY_HUNGER = 200;
/** Comfortably below it. Not `STATE_INCOME_UNMET_NEED_LEVEL - 1`, because a test pinned to the boundary measures the boundary rather than the rule; the boundary has its own case below. */
const URGENT_HUNGER = 20;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/**
 * A prison with a cell, a furnished kitchen, and one errand on the board.
 *
 * Built through `Kernel.submitCommand` for the reason
 * `tests/unit/simulation-refusals.test.ts` states for #375: a fixture that
 * calls a system directly does not exercise the route the behaviour lives on.
 * The errand's containers are registered by hand, because what is under test is
 * the *selection* rule and not the producer -- the producer has its own gate in
 * `tests/foundation/job-production-contract.test.ts`.
 */
function prisonWithAKitchenAndAnErrand(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 1 }));
  submit(runtime, 'buy-brick', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.brick', quantity: 6 }));

  wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...CELL_RECT }));
  submit(runtime, 'place-bed', packCommand({ type: 'PlaceObject', orderId: 'bed-1', definitionId: 'bed-wooden', x: 4, y: 6 }));
  submit(runtime, 'place-toilet', packCommand({ type: 'PlaceObject', orderId: 'toilet-1', definitionId: 'toilet-brick', x: 5, y: 6 }));

  wallRoomPerimeter(runtime.world, KITCHEN_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-kitchen', packCommand({ type: 'ZoneRoom', roomId: 'room.kitchen', ...KITCHEN_RECT }));
  submit(runtime, 'place-fridge', packCommand({ type: 'PlaceObject', orderId: 'fridge-1', definitionId: 'fridge-brick', x: 13, y: 6 }));
  submit(runtime, 'place-stove', packCommand({ type: 'PlaceObject', orderId: 'stove-1', definitionId: 'stove-brick', x: 10, y: 6 }));
  submit(runtime, 'place-prep', packCommand({ type: 'PlaceObject', orderId: 'prep-1', definitionId: 'prep-counter-brick', x: 10, y: 7 }));

  stepTo(runtime, ADMIT_AT);
  submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', sentenceLengthTicks: 200_000, priorIncidents: 0, ...ARRIVAL }));
  stepTo(runtime, DECIDE_AT);
  putTheErrandOnTheBoard(runtime);
  return runtime;
}

function putTheErrandOnTheBoard(runtime: SimulationRuntime): void {
  const pantry = new Container('pantry');
  pantry.deposit('item.brick', 4);
  runtime.containers.register(pantry);
  runtime.containers.register(new Container('depot'));
  runtime.jobs.submitCarryItem(
    {
      id: 'errand-1', priority: 1, itemId: 'item.brick', quantity: 4,
      sourceContainerId: 'pantry', sourceTile: { x: tileCoordinate(PICKUP_TILE.x), y: tileCoordinate(PICKUP_TILE.y) },
      destinationContainerId: 'depot', destinationTile: { x: tileCoordinate(DROPOFF_TILE.x), y: tileCoordinate(DROPOFF_TILE.y) },
    },
    runtime.kernel.tick,
  );
}

/** A prison with a cell and a furnished kitchen, stepped into a work block, with **nothing** on the board yet. */
function prisonWithAKitchen(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 1 }));
  submit(runtime, 'buy-brick', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.brick', quantity: 6 }));

  wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...CELL_RECT }));
  submit(runtime, 'place-bed', packCommand({ type: 'PlaceObject', orderId: 'bed-1', definitionId: 'bed-wooden', x: 4, y: 6 }));
  submit(runtime, 'place-toilet', packCommand({ type: 'PlaceObject', orderId: 'toilet-1', definitionId: 'toilet-brick', x: 5, y: 6 }));

  wallRoomPerimeter(runtime.world, KITCHEN_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-kitchen', packCommand({ type: 'ZoneRoom', roomId: 'room.kitchen', ...KITCHEN_RECT }));
  submit(runtime, 'place-fridge', packCommand({ type: 'PlaceObject', orderId: 'fridge-1', definitionId: 'fridge-brick', x: 13, y: 6 }));
  submit(runtime, 'place-stove', packCommand({ type: 'PlaceObject', orderId: 'stove-1', definitionId: 'stove-brick', x: 10, y: 6 }));
  submit(runtime, 'place-prep', packCommand({ type: 'PlaceObject', orderId: 'prep-1', definitionId: 'prep-counter-brick', x: 10, y: 7 }));

  stepTo(runtime, ADMIT_AT);
  submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', sentenceLengthTicks: 200_000, priorIncidents: 0, ...ARRIVAL }));
  stepTo(runtime, DECIDE_AT);
  return runtime;
}

interface Chosen {
  readonly actionId: string | undefined;
  readonly tick: number;
  readonly hunger: number;
}

/**
 * Sets `hunger` to `level`, waits for the prisoner to be idle, and reports what
 * they choose next.
 *
 * The need is written on **every** reconsideration until a choice is made,
 * because `NeedsDecaySystem` runs between them and a level written once would
 * drift across the threshold on its own -- which would make this a test of the
 * decay rate. Writing it each time is what holds the *one* variable this file
 * varies still.
 */
function chosenAtHunger(level: number): Chosen {
  const runtime = prisonWithAKitchen();
  const store = runtime.prisoners.entityStore;
  const index = store.getIndex(store.getIdByIndex(0));
  const idlePhase = ACTION_PHASES.indexOf('idle');
  const idle = (): boolean => runtime.prisoners.currentAction.phase[index] === idlePhase;

  /*
   * **The errand goes on the board while the prisoner is idle, and that
   * ordering is the whole fixture.** A carry is chosen at a *reconsideration*
   * by an idle prisoner, so submitting the job while a 120-tick kitchen shift
   * is running would measure nothing: the shift finishes on its own terms
   * first, and the first non-idle reading after it would be the shift rather
   * than the choice. Waiting for idle is what puts both candidates in front of
   * one decision.
   */
  const idleBy = DECIDE_AT + 300;
  while (runtime.kernel.tick < idleBy && !idle()) {
    runtime.prisoners.needs.set(index, 'hunger', level);
    runtime.kernel.step();
  }
  runtime.prisoners.needs.set(index, 'hunger', level);
  putTheErrandOnTheBoard(runtime);

  const until = runtime.kernel.tick + 200;
  while (runtime.kernel.tick < until) {
    runtime.prisoners.needs.set(index, 'hunger', level);
    runtime.kernel.step();
    if (!idle()) {
      const actionIndex = runtime.prisoners.currentAction.actionIndex[index]!;
      if (actionIndex >= 0) {
        return {
          actionId: DEFAULT_ACTIONS[actionIndex]!.id,
          tick: runtime.kernel.tick,
          hunger: runtime.prisoners.needs.get(index, 'hunger'),
        };
      }
    }
  }
  return { actionId: undefined, tick: runtime.kernel.tick, hunger: runtime.prisoners.needs.get(index, 'hunger') };
}

describe('the owner\'s amendment of 2026-09-02: the need wins when it is urgent', () => {
  it('is measured inside a work block that offers both an errand and a shift, or nothing below means anything', () => {
    const block = resolveActiveRegimeBlock(GENERAL_POPULATION_REGIME, DECIDE_AT);
    expect(block.allowedCategories, `tick ${DECIDE_AT} is not in a work block`).toContain('work');
    // And the block allows no `meal` category at all, which is why the hungry
    // prisoner's only recourse is a work action rather than the canteen.
    expect(block.allowedCategories).not.toContain('meal');

    const runtime = prisonWithAKitchenAndAnErrand();
    expect(runtime.prisoners.intakeSystem.getMetrics()).toMatchObject({ completedCount: 1, failedCount: 0 });
    expect(runtime.jobs.availableJobsSorted().map((job) => job.id), 'the errand must be on the board').toEqual(['errand-1']);
    expect(
      runtime.prisoners.roomInstances.hasPlaceForUse('room.kitchen', 'food-preparation'),
      'the kitchen must be furnished, or the need has nothing to win with',
    ).toBe(true);
  });

  it('reads the threshold off the institution rather than choosing one', () => {
    // The three facts the rule rests on, asserted so that a change to any of
    // them fails here rather than silently re-balancing the mechanic.
    expect(STATE_INCOME_UNMET_NEED_LEVEL).toBeLessThan(NEED_MAX);
    expect(isNeedUnmetForStateIncome(URGENT_HUNGER), 'the urgent case must be one the state withholds for').toBe(true);
    expect(isNeedUnmetForStateIncome(ORDINARY_HUNGER), 'the ordinary case must not be').toBe(false);
  });

  it('sends an ordinary prisoner on the errand: duty outranks want', () => {
    const chosen = chosenAtHunger(ORDINARY_HUNGER);
    expect(chosen.actionId, `chose nothing by tick ${chosen.tick}`).toBe('action.carry');
  });

  it('keeps a prisoner whose hunger the state withholds for in the kitchen instead', () => {
    const chosen = chosenAtHunger(URGENT_HUNGER);
    expect(chosen.actionId, `chose nothing by tick ${chosen.tick}`).toBe('action.kitchen-work');
  });

  it('turns on the level and not on the score, which is the measurand the amendment corrected', () => {
    /*
     * The boundary, both sides, one level apart. `isNeedUnmetForStateIncome`
     * is `level <= STATE_INCOME_UNMET_NEED_LEVEL`, so the constant itself is
     * unmet and one above it is not -- and the rule must flip exactly there.
     *
     * **This is what a score threshold could not have produced.** At the
     * boundary the prisoner's `action.kitchen-work` score is
     * `(NEED_MAX - level) * 1`, and `action.eat-meal` would score
     * `(NEED_MAX - level) * 4` on the identical deficit. A threshold on the
     * score would therefore flip at a different hunger level depending on which
     * action happened to be providable, which is exactly the objection the
     * amendment raises.
     */
    expect(chosenAtHunger(STATE_INCOME_UNMET_NEED_LEVEL).actionId).toBe('action.kitchen-work');
    expect(chosenAtHunger(STATE_INCOME_UNMET_NEED_LEVEL + 1).actionId).toBe('action.carry');
  });

  it('leaves the errand on the board for somebody who is not starving', () => {
    // The other half of the ruling: the need winning must not *consume* the
    // errand. A rule that took the job and then abandoned it would leave stock
    // reserved and the delivery stalled.
    const runtime = prisonWithAKitchenAndAnErrand();
    const store = runtime.prisoners.entityStore;
    const index = store.getIndex(store.getIdByIndex(0));
    for (let tick = 0; tick < 200; tick += 1) {
      runtime.prisoners.needs.set(index, 'hunger', URGENT_HUNGER);
      runtime.kernel.step();
    }
    const job = runtime.jobs.getById('errand-1')!;
    expect(job.state, `the errand was claimed by a starving prisoner: ${JSON.stringify(job)}`).toBe('available');
    expect(job.assignedWorkerId).toBeUndefined();
    expect(runtime.containers.require('pantry').reservedOf('item.brick'), 'stock was reserved for an errand nobody took').toBe(0);
  });

  it('makes food for a later meal without feeding the cook during the shift', () => {
    /*
     * #592 changed the output of kitchen work: the urgent prisoner still
     * avoids an errand and prepares food, but only a later canteen meal can
     * satisfy hunger. The work block offers no meal action.
     */
    const runtime = prisonWithAKitchenAndAnErrand();
    const store = runtime.prisoners.entityStore;
    const index = store.getIndex(store.getIdByIndex(0));
    runtime.prisoners.needs.set(index, 'hunger', URGENT_HUNGER);

    let started = false;
    for (let tick = 0; tick < 60 && !started; tick += 1) {
      runtime.kernel.step();
      const actionIndex = runtime.prisoners.currentAction.actionIndex[index]!;
      started = actionIndex >= 0
        && DEFAULT_ACTIONS[actionIndex]!.id === 'action.kitchen-work'
        && runtime.prisoners.currentAction.phase[index] === ACTION_PHASES.indexOf('performing');
    }
    expect(started, 'the prisoner never began the shift').toBe(true);

    const atStart = runtime.prisoners.needs.get(index, 'hunger');
    for (let tick = 0; tick < 100; tick += 1) runtime.kernel.step();
    const afterShift = runtime.prisoners.needs.get(index, 'hunger');
    expect(runtime.prisoners.workOutput.portions).toBeGreaterThan(0);
    expect(afterShift, `kitchen work should not directly feed the cook: ${atStart} -> ${afterShift}`).toBeLessThan(atStart);
  });
});
