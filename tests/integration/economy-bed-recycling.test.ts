import { describe, expect, it } from 'vitest';
import { PROCUREMENT_DELIVERY_DELAY_TICKS, procurableMaterial } from '../../src/content/procurement-catalog';
import { TREASURY_STARTING_BALANCE_MINOR_UNITS } from '../../src/simulation/economy';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import {
  CONSTRUCTION_MATERIALS_CONTAINER_ID,
  createNewSimulationRuntime,
  type SimulationRuntime,
} from '../../src/simulation/runtime/new-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **One plank pays for as many revenue-bearing residents as the prison has
 * cells to zone.**
 *
 * Audit finding ECON-003, reproduced by playing it. The loop is four commands
 * a player already has, in an order nothing refuses:
 *
 * 1. `PlaceObject bed-wooden` in an empty cell, and wait for it to finish.
 * 2. `AdmitPrisoner`. Intake fills the one free place; the state starts paying.
 * 3. `Undo`. The completed order is cancelled, which reverses the geometry
 *    (`ConstructionSystem.revertConstruction` -> `ObjectPlacementService.onOrderReverted`)
 *    **and releases `materialsAllocated`** -- so the plank comes back
 *    (`ConstructionSystem.cancelOrder`).
 * 4. Repeat in the next cell.
 *
 * ## The two halves, and which one is the finding
 *
 * **The resident staying is decided and deliberate.** ADR 0028 decision 2 says
 * a removal evicts nobody, and
 * `tests/integration/object-removal-loop.test.ts` already measures the
 * resulting occupancy-above-capacity state, its survival of a save round trip,
 * and the sentence *"the state still pays for the place they occupy"*. None of
 * that is news and this file does not re-prove it.
 *
 * **What is not decided anywhere is that the object may come back with them.**
 * `RemoveObject` on a completed order refunds nothing -- the same file measures
 * that, *"the plank became a bed"* -- while `Undo` on the same completed order
 * refunds the plank, because `cancelOrder` releases `materialsAllocated` and
 * completion never clears that field. So two commands that remove the same
 * object disagree about whether it un-builds into its materials, and the one
 * that says yes is the one bound to a key.
 *
 * Set beside a residency that survives the object, that turns the plank into a
 * reusable licence: it is *the same plank* that furnishes every cell, and every
 * cell it leaves behind keeps earning.
 *
 * ## The measurement, and why it is a comparison of two sequences
 *
 * A balance asserted on its own would be a number with no claim in it. The
 * claim is a **ratio between two prisons that bought the same thing**: both
 * spend exactly 65, once, on one plank; both run to tick 12,000 from the same
 * seed. One plays the loop above, the other does not. The recycled prison ends
 * on three residents and 4,380 of state income; the control ends on one and
 * 1,460 -- exactly a third, for exactly the same money.
 *
 * Both figures are written out as literals, per `docs/TESTING.md`: an expected
 * value computed as `control * 3` would hold for any implementation, including
 * one where neither prison earns anything.
 *
 * ## Three cells, not two
 *
 * Two would leave "the second one worked" indistinguishable from an off-by-one
 * in intake's allocation. Three residents from one plank is a loop.
 */

const SEED = 0x0ec003;
const CELL = 'room.cell';
/**
 * Three copies of `room.cell`'s authored minimum, side by side on the starter
 * prison's one owned chunk and not touching, so no two share a walled edge.
 */
const RECTS = [
  { x: 4, y: 6, width: 2, height: 3 },
  { x: 8, y: 6, width: 2, height: 3 },
  { x: 12, y: 6, width: 2, height: 3 },
] as const;
/** The tile `src/main.ts` admits at; each admission is offset so no two arrive on one tile. */
const ARRIVAL = { x: 16, y: 16 };
const ADMISSION = { sentenceLengthTicks: 100_000, priorIncidents: 0 };
/** Far enough past the last admission for four whole in-game days to have been settled. */
const MEASURE_TICK = 12_000;

function send(runtime: SimulationRuntime, id: string, command: SimulationCommand): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, packCommand(command));
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

const planksInStock = (runtime: SimulationRuntime): number =>
  runtime.containers.require(CONSTRUCTION_MATERIALS_CONTAINER_ID).quantityOf('item.wood-plank');

/** A new prison, one plank bought and delivered, three cells walled and zoned, nothing built. */
function prisonWithOnePlankAndThreeCells(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  send(runtime, 'buy', { type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 1 });
  expect(runtime.treasury.balanceMinorUnits, 'one plank at 65, and this is the only money either prison spends').toBe(24_935);
  for (const rect of RECTS) wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
  RECTS.forEach((rect, index) => send(runtime, `zone-${index}`, { type: 'ZoneRoom', roomId: CELL, ...rect }));
  stepTo(runtime, PROCUREMENT_DELIVERY_DELAY_TICKS + 2);
  expect(planksInStock(runtime)).toBe(1);
  return runtime;
}

describe('a bed recycled by undo, with the resident left behind (ECON-003)', () => {
  it('pins the price the whole comparison rests on', () => {
    expect(TREASURY_STARTING_BALANCE_MINOR_UNITS).toBe(25_000);
    expect(procurableMaterial('item.wood-plank')?.unitPriceMinorUnits).toBe(65);
  });

  it('turns one plank into three paying residents, and earns three times the control but for one 40', () => {
    const runtime = prisonWithOnePlankAndThreeCells();

    for (let index = 0; index < RECTS.length; index += 1) {
      const rect = RECTS[index]!;
      send(runtime, `bed-${index}`, {
        type: 'PlaceObject',
        orderId: `bed-${index}`,
        definitionId: 'bed-wooden',
        x: rect.x,
        y: rect.y,
      });
      stepTo(runtime, runtime.kernel.tick + 200);
      expect(runtime.construction.getOrder(`bed-${index}`)?.state, `bed ${index} is built`).toBe('completed');
      expect(planksInStock(runtime), 'the plank is in the bed').toBe(0);

      send(runtime, `admit-${index}`, { type: 'AdmitPrisoner', ...ADMISSION, x: ARRIVAL.x + index, y: ARRIVAL.y });
      stepTo(runtime, runtime.kernel.tick + 200);
      expect(runtime.prisoners.roomInstances.totalOccupancy, `resident ${index} is housed`).toBe(index + 1);

      if (index === RECTS.length - 1) break;

      // The move. One keystroke: `Undo` is `KeyZ` (`docs/INPUT.md`), and the
      // open transaction is this one placement (`ObjectPlacementService.place`
      // groups by order id), so it reverses the bed and nothing else.
      send(runtime, `undo-${index}`, { type: 'Undo' });
      expect(runtime.construction.getOrder(`bed-${index}`)?.state).toBe('cancelled');
      expect(planksInStock(runtime), 'undo hands the plank back, whole').toBe(1);
      expect(
        runtime.prisoners.roomInstances.totalOccupancy,
        'and the resident it was holding stays, still counted by the income system',
      ).toBe(index + 1);
      expect(
        runtime.prisoners.roomInstances.getById(`${CELL}:${rect.x}:${rect.y}`)?.residentCapacity,
        'in a cell whose capacity is now zero',
      ).toBe(0);
    }

    expect(runtime.prisoners.roomInstances.totalOccupancy, 'three residents').toBe(3);
    expect(runtime.placedObjects.size, 'standing on one bed between them').toBe(1);

    stepTo(runtime, MEASURE_TICK);
    /*
     * 28,875 - 24,935. Written as the literal it is, not as a subtraction the
     * code under test could satisfy with any pair of numbers.
     *
     * **29,315 until [#588](https://github.com/matmaxalez/lockstate/issues/588),
     * when the exact `3x` identity this file was built on stopped holding --
     * by exactly one 40, and for a reason worth reading rather than
     * re-baselining past.** Guard coverage now provisions the `safety` need
     * and this prison hires nobody, so its sector is `unguarded`, the need
     * falls at 0.05 a tick with nothing opposing it, and
     * `STATE_INCOME_UNMET_NEED_WITHHOLDING_MINOR_UNITS` is withheld for it
     * from the first day boundary past each resident's own crossing.
     *
     * The crossings are staggered because the admissions are. Measured on this
     * fixture: the three residents are admitted at ticks **315, 720 and
     * 1,120**, so `safety` crosses `STATE_INCOME_UNMET_NEED_LEVEL` at about
     * **4,376, 4,781 and 5,181**. The day boundary at **4,799** falls between
     * the second and the third, so on that day this prison is charged **two**
     * 40s and not three -- while the control below holds only resident 0, the
     * earliest crosser, whose 40 a naive tripling would charge three times.
     * The exploiting prison is therefore 40 *richer* than three times the
     * control, and the identity is restated below with that term in it rather
     * than dropped for a bound.
     *
     * The claim this file exists to make is untouched and is arguably sharper:
     * one plank still pays for three residents where it should pay for one.
     */
    expect(runtime.treasury.balanceMinorUnits).toBe(28_875);
  });

  it('control: the same prison, the same plank, the same ticks, without the undo', () => {
    /*
     * The half that makes the figure above a claim. Everything is identical --
     * seed, purchase, three walled and zoned cells, three admissions, the same
     * measurement tick -- except that the bed is left where it was put. Two of
     * the three admissions therefore find no free place and hold no occupancy
     * slot, which is the behaviour `StateIncomeSystem` documents.
     */
    const runtime = prisonWithOnePlankAndThreeCells();
    const rect = RECTS[0]!;
    send(runtime, 'bed-0', { type: 'PlaceObject', orderId: 'bed-0', definitionId: 'bed-wooden', x: rect.x, y: rect.y });
    stepTo(runtime, runtime.kernel.tick + 200);
    expect(runtime.construction.getOrder('bed-0')?.state).toBe('completed');

    for (let index = 0; index < RECTS.length; index += 1) {
      send(runtime, `admit-${index}`, { type: 'AdmitPrisoner', ...ADMISSION, x: ARRIVAL.x + index, y: ARRIVAL.y });
      stepTo(runtime, runtime.kernel.tick + 200);
    }

    expect(runtime.prisoners.roomInstances.totalOccupancy, 'one bed, one resident').toBe(1);
    stepTo(runtime, MEASURE_TICK);
    /*
     * 26,235 - 24,935 = 1,300, and `24,935 + 3 x 1,300 + 40` is 28,875: the
     * recycled prison's figure above, to the minor unit.
     *
     * **26,395 and a clean `3 x 1,460` until #588.** The `+ 40` is the one day
     * boundary at which the exploiting prison's third resident had not yet
     * crossed the `safety` line and this prison's only resident had -- the full
     * derivation, with the measured admission and crossing ticks, is on the
     * case above. It is carried here as an explicit term rather than folded
     * into a re-pinned literal, because the term is the whole of what a reader
     * comparing the two figures needs and a bound like `greaterThan` would
     * hold for any pair of numbers.
     */
    expect(runtime.treasury.balanceMinorUnits).toBe(26_235);
    // The relationship as arithmetic over the two measured balances, so a
    // future re-baseline that moved one of them and not the other fails here
    // rather than passing quietly.
    expect(24_935 + 3 * (26_235 - 24_935) + 40).toBe(28_875);
  });

  it('is undo and not removal: `RemoveObject` takes the bed and keeps the plank', () => {
    /*
     * The asymmetry the loop turns on, measured on one prison so the two
     * commands are compared and not merely described. It is also what makes
     * this a finding rather than a restatement of ADR 0028 decision 2: with
     * `RemoveObject` the resident is still left behind, but the next cell costs
     * another 65.
     */
    const runtime = prisonWithOnePlankAndThreeCells();
    const rect = RECTS[0]!;
    send(runtime, 'bed-0', { type: 'PlaceObject', orderId: 'bed-0', definitionId: 'bed-wooden', x: rect.x, y: rect.y });
    stepTo(runtime, runtime.kernel.tick + 200);
    expect(runtime.construction.getOrder('bed-0')?.state).toBe('completed');
    expect(planksInStock(runtime)).toBe(0);

    send(runtime, 'remove', { type: 'RemoveObject', x: rect.x, y: rect.y });
    expect(runtime.refusals.last, 'the removal is accepted').toBeUndefined();
    expect(runtime.placedObjects.size, 'the bed is gone either way').toBe(0);
    expect(planksInStock(runtime), 'but nothing comes back').toBe(0);
    expect(runtime.construction.getOrder('bed-0')?.state, 'and the order still reads completed').toBe('completed');
  });
});
