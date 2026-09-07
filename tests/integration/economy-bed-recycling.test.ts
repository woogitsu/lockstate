import { describe, expect, it } from 'vitest';
import { PROCUREMENT_DELIVERY_DELAY_TICKS, procurableMaterial } from '../../src/content/procurement-catalog';
import { TREASURY_STARTING_BALANCE_MINOR_UNITS } from '../../src/simulation/economy';
import { STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS } from '../../src/simulation/economy/income';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import {
  CONSTRUCTION_MATERIALS_CONTAINER_ID,
  createNewSimulationRuntime,
  type SimulationRuntime,
} from '../../src/simulation/runtime/new-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **One plank pays for as many revenue-bearing residents as the prison has
 * cells to zone** -- **and it no longer does, since
 * [ADR 0076](../../docs/adr/0076-what-happens-to-a-resident-whose-bed-is-taken-away.md)
 * decision A(ii) shipped on `agent/585-occupied-place` (#585).**
 *
 * **Nor is it one plank any more, since the owner's ruling of 2026-09-01.**
 * *"Taking a finished object away returns nothing. Not its materials, not its
 * money."* -- ADR 0076's amendment of that date -- withdraws decision B's
 * sentence, and with it the third step of the loop below. `Undo` on the
 * completed bed order reverses the geometry and releases **nothing**, so the
 * next cell is furnished with a plank the prison buys at 65 like anybody
 * else's. The loop is still four commands nothing refuses and it still leaves
 * three residents behind; what it no longer is, is free. This arm now reads
 * **26,145** against the control's **26,235** -- recycling is strictly worse
 * than playing it straight, the first time that has been true in this file.
 *
 * **Both halves of the exploit are now closed, by two different rulings, and
 * the file records which did which**: A(ii) removed the income the loop
 * manufactured, and the 2026-09-01 ruling removed the free materials. Neither
 * was aimed at this file -- A(ii) was aimed at what an occupied place is worth
 * and the ruling at an inversion in cancellation -- which is why the numbers
 * below are worth more than a fix written to make them move.
 *
 * **Both directions are marked rather than overwritten**, and this file is the
 * reason the marking matters: every measurement below was taken before the fix
 * existed, by a different agent, on a different branch, and it is the strongest
 * evidence the fix works precisely because nobody who wrote it was trying to
 * make the fix look good. What changed is one number in one assertion:
 *
 * ```
 *                          recycled   control
 *   before A(ii)             29,315    26,395
 *   after  A(ii)             26,395    26,395
 * ```
 *
 * **The two arms are 40 minor units apart, and the recycling gains nothing by
 * being recycling.** This arm reads **26,235** and the recycled one **26,275**.
 * The gap is an unmet-need `safety` withholding from ADR 0078: the control's
 * paying resident arrives 805 ticks earlier and crosses that line on the
 * earlier side of a day boundary. It does not come from a place, it does not
 * scale with the loop, and it would be there between any two prisons whose
 * residents arrive at different ticks. The derivation is at the measurement
 * below.
 *
 * What A(ii) removes is the *income* the loop was manufacturing:
 * `StateIncomeSystem` pays for `min(occupancy, residentCapacity)` per room
 * instance (`RoomInstanceRegistry.residentIdsWithExistingPlace`), and the two
 * cells the loop leaves bedless have a capacity of 0. The same plank, the same
 * three cells, the same ticks and the same three admissions earn what playing
 * it straight earns, to within a withholding that has nothing to do with the
 * exploit.
 *
 * **This paragraph has been corrected twice and both directions are kept.** It
 * said "on the control's balance **to the minor unit**" until 2026-08-30; the
 * first correction that day removed the three words and left the equality
 * standing, which softened a false claim rather than withdrawing it -- with the
 * withdrawal sitting two sentences below, in the same header, contradicting
 * what the reader had just been told. That is the defect this file's own body
 * had already recorded and the header had not. The equality is withdrawn here.
 * The argument it was making survives, and is stated above without resting on
 * an equality that is not true.
 *
 * **The three residents are still housed and this file still asserts it.** ADR
 * 0028 decision 2 is untouched: nobody is evicted and `totalOccupancy` still
 * reads 3. What A(ii) removes is what that state is *worth*.
 *
 * **A(i) shipped on 2026-08-30 in [#637](https://github.com/matmaxalez/lockstate/pull/637),
 * and this header said it had not.** Every removal in this loop still takes the
 * no-vacancy branch, so nothing here changed and the file passes untouched --
 * which is ADR 0076's own *"A(i) does not close the leak, and A(ii) does"*
 * measured rather than restated. The relocation is best-effort
 * (`relocateExcessResidentsOf`), not the atomic sibling, and since
 * [#660](https://github.com/matmaxalez/lockstate/pull/660) it announces itself
 * to the player.
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
 *
 *    **Step 3's second clause is false since 2026-09-01 and is kept because it
 *    is what the loop was.** `cancelOrder` still reverses the geometry and
 *    still empties `materialsAllocated`; what it no longer does is release it
 *    into the container. The plank does not come back, and step 4 buys one.
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
 * **That paragraph is answered rather than false, and it is kept because it is
 * the question two rulings were needed to close.** It *was* decided nowhere;
 * it is decided now, twice. ADR 0076 decision B decided it in the generous
 * direction on 2026-08-29 and never shipped; the owner's ruling of 2026-09-01
 * reverses B and decides it in the other -- neither command refunds a finished
 * object, so the two no longer disagree and the plank is not a licence. The
 * case below called *"is undo and not removal"* is where that agreement is
 * measured, and its own name is now the thing that has stopped being true.
 *
 * ## The measurement, and why it is a comparison of two sequences
 *
 * A balance asserted on its own would be a number with no claim in it. The
 * claim is a **ratio between two prisons that bought the same thing**: both
 * spend exactly 65, once, on one plank; both run to tick 12,000 from the same
 * seed. One plays the loop above, the other does not.
 *
 * **As measured before A(ii)**, and kept because it is what the finding was:
 * the recycled prison ended on three residents and 4,380 of state income; the
 * control on one and 1,460 -- exactly a third, for exactly the same money.
 * **The ratio is now 1**, and the comparison is still the claim rather than the
 * number: two prisons that bought the same thing earn the same thing.
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

  it('leaves three residents housed and pays for the one place that still exists (was: three times the control)', () => {
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
      /*
       * **This assertion read `.toBe(1)` under `'undo hands the plank back,
       * whole'` until 2026-09-01, and that sentence is the whole of what this
       * file was written to report.** The owner's ruling of that date --
       * *"Taking a finished object away returns nothing. Not its materials, not
       * its money."*, ADR 0076's amendment of that date -- withdraws ADR 0076
       * decision B's sentence, so `Undo` on the completed bed order now
       * releases nothing and the plank does not come back.
       *
       * **The loop still runs, and that is why the assertion is kept rather
       * than the case deleted.** The next `PlaceObject` finds an empty
       * container, so `JustInTimeMaterialsService` buys a *second* plank at the
       * press -- the gesture is not refused, it is charged for. What the ruling
       * removes is the "same plank" half of the finding: the sequence still
       * furnishes three cells and still leaves three residents behind, and it
       * now costs 65 a cell like anybody else's.
       */
      expect(planksInStock(runtime), 'undo hands nothing back any more').toBe(0);
      expect(
        runtime.prisoners.roomInstances.totalOccupancy,
        'and the resident it was holding stays -- ADR 0028 decision 2, unchanged by ADR 0076 A(ii)',
      ).toBe(index + 1);
      expect(
        runtime.prisoners.roomInstances.getById(`${CELL}:${rect.x}:${rect.y}`)?.residentCapacity,
        'in a cell whose capacity is now zero',
      ).toBe(0);
      // **This clause read "still counted by the income system" and is
      // withdrawn.** It was true when it was written and is what ADR 0076
      // A(ii) removes: the place goes with the bed. At *this* instant the
      // plank is back in the container and no bed stands anywhere in the
      // prison, so a prison holding `index + 1` residents holds **no** places
      // at all -- which is the sharpest form of the invariant, and it is the
      // same at every turn of the loop however many residents have piled up.
      expect(runtime.placedObjects.size, 'no bed stands anywhere at this instant').toBe(0);
      expect(
        runtime.prisoners.roomInstances.residentIdsWithExistingPlace(),
        'so no resident is a place, whatever the occupancy above says',
      ).toEqual([]);
    }

    expect(runtime.prisoners.roomInstances.totalOccupancy, 'three residents').toBe(3);
    expect(runtime.placedObjects.size, 'standing on one bed between them').toBe(1);
    expect(runtime.prisoners.roomInstances.residentIdsWithExistingPlace(), 'and one place between them').toHaveLength(1);

    stepTo(runtime, MEASURE_TICK);
    /*
     * 26,275 - 24,935 = 1,340: one resident's worth of state income for the
     * four whole days this tick settles, **less one 40**.
     *
     * **This literal has moved twice and both moves are the record.** It read
     * **29,315** until [ADR 0076](../../docs/adr/0076-what-happens-to-a-resident-whose-bed-is-taken-away.md)
     * A(ii) -- 24,935 + 3 x 1,460, exactly three times the income for exactly
     * the same money, which is the finding this file was written to record.
     * It then read **26,395** when #610 made an occupied place mean a bed that
     * currently exists, which is what closed the exploit: three residents
     * housed, one place paid for.
     *
     * **It is 26,275 since ADR 0078 (`What keeps a prisoner safe`,
     * [#588](https://github.com/matmaxalez/lockstate/issues/588)), and the
     * sentence that stood here -- that this literal now *equals* the control's
     * -- is no longer true.** It is 40 above it, and the reason is worth having
     * rather than re-baselining past, because it is not about places at all.
     *
     * Guard coverage provisions `safety` now, this prison hires nobody, so the
     * need falls at 0.05 a tick with nothing opposing it and
     * `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` is withheld for it
     * from the first day boundary past the paying resident's own crossing.
     * Both prisons now have exactly one paying resident -- and **they are
     * different people, admitted at different ticks**. Measured on this
     * fixture:
     *
     * | arm | paying resident | admitted | `safety` crosses |
     * | --- | --- | --- | --- |
     * | this one | entity 2, in the cell whose bed survived | tick 1,120 | ~5,181 |
     * | the control below | entity 0, in the only cell ever furnished | tick 315 | ~4,376 |
     *
     * The day boundary at **4,799** falls between those two crossings, so the
     * control is charged the 40 on that day's settlement and this prison is
     * not. That is the whole of the difference, and it is an accident of *when*
     * the surviving resident arrived rather than anything the undo bought.
     *
     * **The finding this file exists for is untouched by any of it**: the
     * exploit no longer turns one plank into three paying residents. What is
     * left of the gap is one day's withholding on one need, and the control
     * asserts the relation against the schedule's own constant.
     *
     * **It is 26,145 since the owner's ruling of 2026-09-01, and this is the
     * third move of this literal.** *"Taking a finished object away returns
     * nothing. Not its materials, not its money."* -- ADR 0076's amendment of
     * that date -- stops `Undo` handing the plank back, so the two undos in
     * this loop each cost the prison a fresh plank at the next press:
     * `26,275 - 2 x 65 = 26,145`. The income half is unmoved, because the
     * residents, the cells, the admissions and the ticks are all unchanged;
     * every one of the 130 is materials.
     *
     * **The three earlier readings are kept above rather than replaced**
     * because the sequence is the record: 29,315 (the exploit), 26,395 (A(ii)
     * closed the income half), 26,275 (ADR 0078's withholding moved it), and
     * now 26,145 (the materials half closed too). This arm is now *below* the
     * control, which it has never been before, and the control's own case says
     * by how much and why.
     *
     * **It is 26,305 since the owner's ruling of 2026-09-03, and this is the
     * fourth move of this literal.** *"usuń na razie kary, zobaczymy jak
     * pogram i ocenię łatwość"* ("remove the penalties for now, we'll see how
     * it plays and I'll judge the ease") set
     * `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` to `0`, so every 40
     * this prison was charged for an unmet `safety` comes back:
     * `26,145 + 4 x 40 = 26,305`. **Four** of them, measured -- which is the
     * first time this file has been able to say how many days of this run were
     * actually charged, because the withholding was never separable from the
     * balance before. The control below was charged five, and that one-day gap
     * is the same accident of arrival ticks the table above sets out.
     *
     * **It is 26,145 again since the owner restored the withheld share to
     * `40` on 2026-09-04, and this is the fifth move of this literal** -- the
     * first that is a return rather than a step. `26,305 - 4 x 40 = 26,145`,
     * the same four days' withholding the paragraph above counted, now
     * charged again. The restoration was ruled conditional on a fifty-prisoner
     * measurement and both measurements exist; the constant's own docblock
     * carries them.
     *
     * **Every reading above is kept rather than replaced**, and the sequence
     * is now 29,315 (the exploit), 26,395 (A(ii) closed the income half),
     * 26,275 (ADR 0078's withholding moved it), 26,145 (the materials half
     * closed too), 26,305 (the withholding suspended) and 26,145 (restored).
     * The finding this file exists for is untouched by all six: the exploit no
     * longer turns one plank into three paying residents. **That the sequence
     * returns exactly to a value it already held is the strongest evidence
     * here that the suspension was a switch and not a rewrite** -- nothing
     * else in this fixture moved across either ruling, so the balance could
     * come back to the digit.
     *
     * Written as the literal it is, not as a subtraction or as the control's
     * balance read back, either of which the code under test could satisfy with
     * any pair of numbers.
     */
    expect(runtime.treasury.balanceMinorUnits).toBe(26_145);
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
     * 26,235 - 24,935 = 1,300: one resident's worth of state income for the
     * four whole days this tick settles, less **two** 40s where the case above
     * pays one.
     *
     * **This comment has been corrected twice and both directions are kept.**
     * It used to end *"and 24,935 + 3 x 1,460 is 29,315: the recycled prison's
     * figure above, to the minor unit"*, and that arithmetic is still right
     * about the prison it described. ADR 0076 A(ii) and #610 then made the
     * recycled prison's figure equal to this one, and the comment said so.
     * Since ADR 0078 (`What keeps a prisoner safe`) neither is true: this arm
     * reads 26,235 and the recycled one reads 26,275, because this prison's
     * paying resident arrived 805 ticks earlier and crosses the `safety` line
     * on the earlier side of a day boundary. The full derivation, with the
     * measured admission and crossing ticks for both arms, is on the case
     * above.
     *
     * **It is 26,435 since the owner's ruling of 2026-09-03**, which suspended
     * the withheld share at `0`: `26,235 + 5 x 40 = 26,435`. Five 40s here
     * against the other arm's four, so the *sentence* above about this arm
     * being charged one more day's withholding than the recycled one is still
     * exactly right -- it is the only part of the derivation the ruling leaves
     * standing, and it is left standing rather than rewritten
     * (`docs/AGENT_WORKFLOW.md` §4).
     *
     * **It is 26,235 again since the owner restored the withheld share to `40`
     * on 2026-09-04**: `26,435 - 5 x 40 = 26,235`, the same five days. Both
     * directions are marked rather than overwritten, and this arm returning to
     * a value it already held while the other arm returns to one it already
     * held is what makes the pair's relation below a measurement rather than
     * two coincidences.
     */
    expect(runtime.treasury.balanceMinorUnits).toBe(26_235);
    /*
     * The relation between the two arms, asserted against **production content**
     * rather than against literals -- so a change to what an unmet need costs
     * or to what a plank costs fails here naming itself, and a re-baseline that
     * moved one of the two balances and not the other fails here too.
     *
     * **The relation has changed sign, and that is the ruling of 2026-09-01
     * arriving.** It read `26_275 - balance === STATE_INCOME_WITHHELD_...`: the
     * recycled arm was 40 *above* this control, an accident of when its
     * surviving resident arrived. Now the recycled arm is 90 *below* it,
     * because its two undos cost two planks and only 40 of that is given back
     * by the withholding this arm pays and that one does not. **Recycling is
     * now strictly worse than playing it straight**, which is the plainest
     * statement this file has ever been able to make about the loop.
     *
     * **The ruling of 2026-09-03 did not touch this assertion, and that is
     * the whole argument for having written it against production content.**
     * With the withheld share at `0` the right-hand side is two planks and
     * nothing else, both balances moved (by four 40s and five), and this line
     * needed no edit: 130 either way. The relation keeps its sign and its
     * meaning -- recycling is still strictly worse than playing it straight,
     * now by the full price of the two planks rather than by 90 of it.
     *
     * **Nor did its restoration on 2026-09-04**, for the same reason and with
     * the same evidence: both balances moved back, the right-hand side became
     * `130 - 40` again, and the only edit this line needed was the other arm's
     * literal moving with it. The gap is 90 once more. Two rulings in two days,
     * in opposite directions, and this assertion was correct throughout --
     * which is what a relation written against production content buys, stated
     * where it was paid for.
     *
     * It is not a fixture supplying both sides of its own comparison
     * (`docs/TESTING.md`): the left-hand side is this arm's live balance, the
     * 26,145 is the other arm's independently pinned literal, and the
     * right-hand side is two pieces of production content neither test
     * computes.
     */
    expect(runtime.treasury.balanceMinorUnits - 26_145).toBe(
      2 * procurableMaterial('item.wood-plank')!.unitPriceMinorUnits -
        STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS,
    );
  });

  it('undo and removal agree now: neither gives the plank back', () => {
    /*
     * The asymmetry the loop turns on, measured on one prison so the two
     * commands are compared and not merely described. It is also what makes
     * this a finding rather than a restatement of ADR 0028 decision 2: with
     * `RemoveObject` the resident is still left behind, but the next cell costs
     * another 65.
     *
     * **This case was called `is undo and not removal: RemoveObject takes the
     * bed and keeps the plank`, and the asymmetry it named is gone.** The
     * owner's ruling of 2026-09-01 brings `Undo` down to what `RemoveObject`
     * already did, so *"the next cell costs another 65"* is now true of both
     * commands -- which the recycled arm above measures as two extra planks.
     * The body is untouched: what it asserts about `RemoveObject` was true
     * before the ruling and is true after it, and the second half of the case
     * is new so that the two commands are still *compared* rather than one of
     * them merely re-pinned.
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

    // The other command, on the same prison, so the comparison this case is
    // named for is still a comparison. `Undo` finds the completed order the
    // removal left behind, cancels it, and hands back exactly as much as the
    // removal did.
    send(runtime, 'undo', { type: 'Undo' });
    expect(runtime.construction.getOrder('bed-0')?.state, 'the undo does reach the order').toBe('cancelled');
    expect(planksInStock(runtime), 'and it gives back nothing either').toBe(0);
  });
});
