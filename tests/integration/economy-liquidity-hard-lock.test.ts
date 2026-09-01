import { describe, expect, it } from 'vitest';
import { PROCUREMENT_DELIVERY_DELAY_TICKS, procurableMaterial } from '../../src/content/procurement-catalog';
import { BUILDABLE_REGISTRY } from '../../src/simulation/construction/definition';
import {
  INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS,
  TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS,
  TREASURY_STARTING_BALANCE_MINOR_UNITS,
} from '../../src/simulation/economy';
import { packCommand, simulationCommandSchema, type SimulationCommand } from '../../src/simulation/protocol/commands';
import {
  CONSTRUCTION_MATERIALS_CONTAINER_ID,
  createNewSimulationRuntime,
  type SimulationRuntime,
} from '../../src/simulation/runtime/new-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **A legal purchase can spend a new prison out of the game.**
 *
 * Audit finding ECON-002, reproduced here by playing it rather than by reading
 * for it. The shape of the trap is a closed loop between three facts that are
 * each correct on their own:
 *
 * 1. **State income is paid per occupied place** and an occupied place needs a
 *    registered room instance with `residentCapacity > 0`
 *    (`src/simulation/economy/income.ts`, `OccupiedPlaceSource`).
 * 2. **Capacity comes from a standing `sleep-surface` object**, and both objects
 *    in the catalogue that carry that capability -- `object.bed` and
 *    `object.medical-bed` -- are built by definitions requiring
 *    `item.wood-plank` and nothing else (`BUILDABLE_REGISTRY`, pinned below).
 *    No brick-built definition places a sleep surface.
 * 3. **A plank costs money and money has exactly two sources**: the opening
 *    balance, and `StateIncomeSystem`. There is no sell command, no production,
 *    no gathering and no grant -- the whole command union is enumerated below
 *    rather than asserted about.
 *
 * So a session that reaches *spending power below one plank's price with no
 * plank in stock and nothing plank-built to reverse* can never earn another
 * minor unit. `MAX_PURCHASE_QUANTITY` is 100,000 and `src/main.ts`'s Build panel
 * opens its stepper on that same bound rather than on affordability
 * (`purchasableMaterialFor`), so one press of a control the game offers reaches
 * it.
 *
 * ## What #703 ruling A moved here, and what it did not
 *
 * **The sentence above read *"cash below one plank's price"* until 2026-08-31,
 * and cash was the right word then**: the balance could not go below zero, so
 * spending power and cash were the same number. #703 ruled a standing overdraft
 * every prison has ([ADR 0083](../../docs/adr/0083-what-opens-the-negative-balance-and-what-bounds-it.md)
 * §2), `createNewSimulationRuntime` opens `TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS`
 * on every treasury, and the two numbers came apart.
 *
 * **Measured on this file, and the two halves came out differently:**
 *
 * - **The purchase route is translated, not cured.** The trap's shape is
 *   untouched -- `Treasury.canAfford` is `balance - amount >= floor`, so what
 *   ends a prison is `balance - 65 < floor` rather than `balance < 65`. A player
 *   who keeps pressing until something is refused is locked at the floor
 *   instead of at 40, which is 2,520 minor units lower and 63 bricks later. The
 *   sequences below spend the room as well as the grant, and reproduce every
 *   step.
 * - **The payroll route is cured.** `PayrollSystem.update` bounds the day's
 *   payment by `Math.min(due, this.treasury.balanceMinorUnits)` -- by the
 *   *balance*, not by what `spend` allows -- so wages can walk a prison to 0
 *   and no further, and at 0 the standing overdraft buys the plank. The case at
 *   the bottom of this file used to end with a prison that could never earn
 *   again; it now ends with one that recovers, and the old expectations are
 *   quoted where they stood.
 *
 * ## What the owner's ruling 19 of 2026-08-31 moved, and it is more than a
 * number
 *
 * Ruling 19 -- *"Dać szczeblom własne progi wewnątrz debetu"*, drafted as ADR
 * 0017's "Amendment, 2026-09-01" -- gives ADR 0017 decision 8's three rungs
 * their own thresholds inside the overdraft: a press stops at -1,250, the build
 * queue's own procurement at -2,000, and wages at the floor. Both halves of the
 * two-bullet finding above move again, and in opposite directions:
 *
 * - **The purchase route is no longer a lock at all.** The trap needed the
 *   press and the queue to share one threshold. They do not: whatever a player
 *   presses their way to, the queue keeps 750 more, which buys the 65 plank the
 *   press was refused. The first case below now measures the *recovery* where it
 *   used to measure five failed escapes, and every one of the old expectations
 *   is quoted where it stood.
 * - **The payroll route walks further than it did.** Wages are the rung at the
 *   floor, so a payday draws on the overdraft down to -2,500 instead of stopping
 *   at 0. It still does not lock anybody, for the reason the case says, but the
 *   prison spends its facility on wages while it waits rather than holding it.
 *
 * ## What the owner's ruling on #771 (2026-09-01) reopens, and this is the
 * largest single consequence this branch measured
 *
 * **The purchase-route cure above depended entirely on the press and the
 * queue *not* sharing a threshold, and #771's equalisation removes exactly
 * that.** #771 found the 750 minor units of daylight between the two rungs
 * had a cost the sentence above does not name: it was a purchase-route escape
 * from ECON-002's own lock, and closing the daylight closes the escape with
 * it. Measured directly, on the exact fixture that used to demonstrate the
 * recovery (`BALANCE_AT_THE_RUNG = -1,240`, no plank in stock, no bed built):
 * a `PlaceObject` for a bed now stays `materials-pending` for ever, exactly as
 * it did before ruling 19 shipped, because `INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS`
 * is now the same -1,250 the press already stops at and `-1,240 - 65 = -1,305`
 * clears neither. **No admission can hold an occupancy slot, `StateIncomeSystem`
 * pays nothing, and the loop this file opens with -- a session that reaches
 * this balance can never earn another minor unit -- is true again**, for the
 * player who spends by pressing Buy rather than by queuing a build order.
 *
 * **This is reported here rather than reversed here.** The owner ruled on
 * #771 with the cost of narrowing the construction rung stated and accepted;
 * what neither the ruling nor its statement of cost named is that the
 * construction rung's extra depth was, on this one fixture, the only thing
 * standing between a new prison and ADR 0075's hard lock. ADR 0075 decision 1
 * (development grants at population thresholds) and decision 3 (sell-back)
 * are still unimplemented -- nothing in `src/` reads a population threshold
 * for money, and there is no sell command -- and decision 2's loan
 * (`LoanBook`) is built only when `loanTerms` is supplied, which nothing in
 * `src/` does either. So none of ADR 0075's other remedies is standing behind
 * this lock today; the case below is updated to assert it is a lock again,
 * and `docs/adr/0017-money-primary-resource-model.md`'s #771 amendment names
 * this as a consequence the owner was not shown when they ruled, for a
 * decision on what closes it.
 *
 * The payroll-route case at the bottom of this file is unaffected: it buys
 * its plank with a direct player press (`PurchaseMaterials`, the
 * `'deliveries'` rung), which #771 does not move, and every figure in that
 * case is unchanged.
 *
 * ## What this file is not
 *
 * It is not an assertion of the trap's *shape*. The trap is established by
 * exhausting the escapes: every command that could plausibly restore liquidity
 * is sent through the real kernel and its refusal or its no-effect is measured.
 * A test that merely asserted "balance is 0" would certify the defect.
 *
 * ## Why every figure is a literal
 *
 * `docs/TESTING.md`'s rule, and `economy-purchase-cancellation.test.ts`'s
 * practice: a balance computed from a price read out of the catalogue would
 * agree with any price. `item.brick` is 40, `item.wood-plank` is 65 and a
 * session opens on 25,000, so 625 x 40 = 25,000 is written out. The standing
 * overdraft is written out for the same reason and pinned in the first case
 * below, so a change to the shipped magnitude fails there with the reason named
 * instead of being silently followed.
 */

const SEED = 0x0ec002;
/**
 * The standing overdraft every session opens with (#703 ruling A), written out
 * and pinned below rather than imported into the arithmetic.
 *
 * > Spending power is `25,000 + 2,500 = 27,500`, which is 687 bricks and 40 left
 * > over -- so 687 x 40 leaves **-2,480**, exactly the shape 625 x 40 leaving 0
 * > had before the ruling, and 2,480 of the 2,500 is spent.
 *
 * **The owner's ruling 19 of 2026-08-31 moved what a *press* may spend, and the
 * paragraph above is kept because the overdraft itself has not moved.** Ruling
 * 19 -- drafted as ADR 0017's "Amendment, 2026-09-01" -- gives ADR 0017 decision
 * 8's rungs their own thresholds inside the overdraft, and a `PurchaseMaterials`
 * is the first of them: refused below -1,250. So the press that reaches the
 * bottom is **656** bricks rather than 687, and the bottom the *player* can
 * press their way to is -1,240 rather than -2,480. The trap's shape is
 * untouched -- it is still `[rung, rung + 65)` in the balance, 65 wide -- and
 * only where it sits has moved, which is the same correction #703 ruling A made
 * to the same sentence one ruling earlier.
 */
const OVERDRAFT_ROOM = 2_500;
/**
 * The first rung, which is what bounds a press (ruling 19). Written out and
 * pinned beside `OVERDRAFT_ROOM` for the same reason.
 */
const DELIVERY_RUNG_ROOM = 1_250;
/** 26,250 / 40, rounded down: the largest whole brick order a new prison can press. */
const BRICKS_TO_THE_RUNG = 656;
/** 25,000 - 656 x 40. The 10 that is left is unspendable on a 65 plank, exactly as the pre-ruling 40 was. */
const BALANCE_AT_THE_RUNG = -1_240;
const CELL = 'room.cell';
/** `room.cell`'s authored minimum, the rectangle every object fixture in this repository uses. */
const CELL_RECT = { x: 4, y: 6, width: 2, height: 3 } as const;
const BED_TILE = { x: 4, y: 6 } as const;
/** The tile `src/main.ts` admits at. */
const ARRIVAL = { x: 16, y: 16 };
const ADMISSION = { sentenceLengthTicks: 100_000, priorIncidents: 0 };

function send(runtime: SimulationRuntime, id: string, command: SimulationCommand): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, packCommand(command));
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

const stockOf = (runtime: SimulationRuntime, itemId: string): number =>
  runtime.containers.require(CONSTRUCTION_MATERIALS_CONTAINER_ID).quantityOf(itemId);

describe('the treasury spent to nothing on one legal purchase (ECON-002)', () => {
  it('pins every figure the sequences below are written from', () => {
    expect(TREASURY_STARTING_BALANCE_MINOR_UNITS).toBe(25_000);
    expect(procurableMaterial('item.brick')?.unitPriceMinorUnits).toBe(40);
    expect(procurableMaterial('item.wood-plank')?.unitPriceMinorUnits).toBe(65);
    /*
     * The one figure in this file that is production configuration rather than
     * content, pinned so that moving the shipped overdraft fails here -- with
     * the arithmetic in `OVERDRAFT_ROOM`'s comment to correct -- instead of
     * quietly re-deriving every balance below.
     */
    expect(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS, '#703 ruling A: one tenth of the opening grant').toBe(-OVERDRAFT_ROOM);
    expect(INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS, 'ruling 19: the rung a press stops at').toBe(
      -DELIVERY_RUNG_ROOM,
    );
    expect(TREASURY_STARTING_BALANCE_MINOR_UNITS - BRICKS_TO_THE_RUNG * 40).toBe(BALANCE_AT_THE_RUNG);
  });

  it('has exactly two ways to buy a sleep surface and both are priced in planks', () => {
    /*
     * The step in the argument that a reader would otherwise have to take on
     * trust, and the one a content change is most likely to move: if any
     * buildable placing a `sleep-surface` object could be bought with bricks,
     * 625 bricks would not be a trap at all.
     *
     * Derived from the two catalogues rather than listed, so a new brick-built
     * bed fails here with the reason named.
     */
    const sleepSurfaceBuildables = [...BUILDABLE_REGISTRY.values()]
      .filter((definition) => definition.placesObjectId === 'object.bed' || definition.placesObjectId === 'object.medical-bed')
      .map((definition) => [definition.id, definition.materialsRequired] as const)
      .sort((left, right) => (left[0] < right[0] ? -1 : 1));
    expect(sleepSurfaceBuildables).toEqual([
      ['bed-wooden', [{ itemId: 'item.wood-plank', quantity: 1 }]],
      ['medical-bed-wooden', [{ itemId: 'item.wood-plank', quantity: 1 }]],
    ]);
  });

  it('offers no command that turns stock, or anything else, back into money', () => {
    /*
     * The exhaustive half of "there is no escape". `simulationCommandSchema` is
     * the whole of what a session can be told to do, so enumerating its members
     * is the one assertion that cannot be defeated by a route nobody thought
     * of: a `SellMaterials`, a `ProduceItem` or a `RequestGrant` added later
     * fails this line and sends its author here.
     *
     * Of these fifteen, exactly one credits the treasury --
     * `CancelMaterialPurchase` -- and the test below measures that it refuses
     * once the delivery has landed.
     *
     * **This said "fourteen" until the owner's decisions of 2026-09-01 on
     * [ADR 0084](../../docs/adr/0084-what-the-alerts-channel-owes-a-player.md).**
     * `DismissAlert` is the fifteenth and it moves no money at all: it marks a
     * row of the alerts log as read, which is the one command in this list that
     * changes nothing about the prison. The tally is what rots here and the
     * list is what to read, so both are corrected together rather than the
     * number alone.
     */
    const types = simulationCommandSchema.options.map((option) => option.shape.type.value).sort();
    expect(types).toEqual([
      'AdmitPrisoner',
      'CancelBuildOrder',
      'CancelMaterialPurchase',
      'DismissAlert',
      'DismissStaff',
      'HireStaff',
      'PlaceBuildOrder',
      'PlaceObject',
      'PurchaseMaterials',
      'Redo',
      'ReleaseGuardAssignment',
      'RemoveObject',
      'Undo',
      'UnzoneRoom',
      'ZoneRoom',
    ]);
  });

  it('spends the grant and the delivery rung on 656 bricks, and the ECON-002 lock reopens since #771 equalised the rungs', () => {
    /*
     * **The title said "25,000 on 625 bricks" and the quantity was the whole
     * opening balance.** Since #703 ruling A a new prison's spending power is
     * the grant *plus* the standing overdraft, so the press that reaches the
     * bottom is 687 bricks rather than 625 and the bottom is -2,480 rather than
     * 0. Every escape below is unchanged and so is every refusal: what moved is
     * the number `Treasury.canAfford` compares against, and nothing else in the
     * loop the file opens with.
     *
     * **And the owner's ruling 19 of 2026-08-31 moved it a third time, for a
     * third time without touching the loop.** A press is now bounded by ADR 0017
     * decision 8's first rung rather than by the floor, so the press that reaches
     * the bottom is 656 bricks and the bottom is -1,240. The prison is still
     * locked -- 10 of press room against a 65 plank -- and it is now locked with
     * 1,260 of the facility standing that no press can reach, which is a
     * *different* prison from the one at -2,480 and is the reason the constant
     * is renamed rather than re-valued.
     */
    const runtime = createNewSimulationRuntime(SEED);
    expect(runtime.treasury.balanceMinorUnits).toBe(25_000);
    expect(runtime.treasury.overdraftFloorMinorUnits, 'the facility is standing, unpressed').toBe(-OVERDRAFT_ROOM);

    // One press of a control the Build panel offers. Nothing refuses it.
    send(runtime, 'buy-all', { type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.brick', quantity: BRICKS_TO_THE_RUNG });
    expect(runtime.refusals.last, 'the purchase is legal and is accepted').toBeUndefined();
    expect(
      runtime.treasury.balanceMinorUnits,
      '656 x 40 is the grant and all but 10 of the delivery rung',
    ).toBe(BALANCE_AT_THE_RUNG);

    stepTo(runtime, PROCUREMENT_DELIVERY_DELAY_TICKS + 2);
    expect(stockOf(runtime, 'item.brick'), 'the goods arrived, so this is not a pending order').toBe(BRICKS_TO_THE_RUNG);
    expect(runtime.procurement.pendingDeliveries).toHaveLength(0);

    // **Escape 1: cancel the purchase.** #285's command exists and reaches a
    // real credit path, and it is out of reach the moment the lorry unloads.
    send(runtime, 'cancel', { type: 'CancelMaterialPurchase', orderId: 'buy-1' });
    expect(runtime.refusals.last?.reason).toBe('cancel-purchase.not-pending');
    expect(runtime.treasury.balanceMinorUnits).toBe(BALANCE_AT_THE_RUNG);
    expect(stockOf(runtime, 'item.brick'), 'and the bricks stay bought').toBe(BRICKS_TO_THE_RUNG);

    // **Escape 2: buy the one plank a bed needs.** 65 against 10 of press room
    // left, which is the same refusal the pre-ruling sequence got for 65
    // against 0, and the ruling-A sequence got for 65 against 20.
    send(runtime, 'buy-plank', { type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.wood-plank', quantity: 1 });
    expect(runtime.refusals.last?.reason).toBe('purchase.insufficient-funds');
    expect(runtime.treasury.balanceMinorUnits).toBe(BALANCE_AT_THE_RUNG);
    expect(stockOf(runtime, 'item.wood-plank')).toBe(0);

    /*
     * **Escape 3, and under the owner's ruling on #771 (2026-09-01) it is an
     * escape that fails again. This is the largest single consequence this
     * branch measured for that ruling, reported at length in the file
     * docblock above.**
     *
     * Ruling 19 of 2026-08-31 gave the construction rung 750 minor units the
     * delivery rung did not have, and for one release this order was funded
     * here: the queue bought the plank the press could not, at a balance past
     * the first rung and short of the second. #771 found that same 750-wide
     * gap was the reason a purchase the shop refused could still be funded
     * for a queued build order, and the owner ruled *"buying and building
     * stop at the same place"*. With
     * `INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS` now the same -1,250 the
     * press already stops at, `-1,240 - 65 = -1,305` clears neither rung, and
     * this order is exactly the pre-ruling-19 case again -- quoted below from
     * the version of this file ruling 19 superseded, and now the live
     * assertion once more:
     *
     * > **Escape 3: order the bed anyway and wait.** A `materials-pending` order
     * > is retried on every scheduled tick for ever, and 5,000 ticks is two
     * > in-game days of retrying against a container that will never hold a plank.
     */
    wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
    send(runtime, 'zone', { type: 'ZoneRoom', roomId: CELL, ...CELL_RECT });
    send(runtime, 'bed', { type: 'PlaceObject', orderId: 'bed-1', definitionId: 'bed-wooden', ...BED_TILE });
    stepTo(runtime, runtime.kernel.tick + 5_000);
    expect(
      runtime.construction.getOrder('bed-1')?.state,
      'the queue cannot buy what the press could not either, since #771',
    ).toBe('materials-pending');
    expect(runtime.placedObjects.size).toBe(0);
    const cellInstanceId = `${CELL}:${CELL_RECT.x}:${CELL_RECT.y}`;
    expect(runtime.prisoners.roomInstances.getById(cellInstanceId)?.residentCapacity).toBe(0);
    expect(runtime.treasury.balanceMinorUnits, 'the halted order took nothing').toBe(BALANCE_AT_THE_RUNG);

    /*
     * **Escape 4: admit somebody anyway.** The command is legal -- admission
     * does not itself require a bed -- but with no furnished cell there is no
     * occupancy slot for `StateIncomeSystem` to pay for, so nothing is earned.
     * This is the pre-ruling-19 quote, again the live assertion:
     *
     * > expect(runtime.prisoners.roomInstances.totalOccupancy).toBe(0);
     * > expect(runtime.treasury.balanceMinorUnits, 'five in-game days later, still nothing')
     * >   .toBe(BALANCE_AT_THE_RUNG);
     */
    send(runtime, 'admit', { type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL });
    stepTo(runtime, runtime.kernel.tick + 12_000);
    expect(runtime.prisoners.roomInstances.totalOccupancy, 'no bed, no occupied place').toBe(0);
    expect(
      runtime.treasury.balanceMinorUnits,
      'five in-game days later, still nothing -- the lock is ECON-002`s again',
    ).toBe(BALANCE_AT_THE_RUNG);

    /*
     * **Escape 5: give the bricks back.** Still not a way to money, which is
     * unaffected by #771 and is the one claim this case has never needed to
     * revise: a brick-built object can be removed and undone, and the owner's
     * separate ruling of 2026-09-01 on ADR 0076 (*"Taking a finished object
     * away returns nothing. Not its materials, not its money."*) means it
     * gives back neither, once completed. Built and undone here without a bed
     * in the world at all, so the assertion is about the toilet and the
     * treasury only, not about anything Escape 3 would have produced.
     */
    const balanceBeforeTheToilet = runtime.treasury.balanceMinorUnits;
    send(runtime, 'toilet', { type: 'PlaceObject', orderId: 'toilet-1', definitionId: 'toilet-brick', x: 5, y: 6 });
    stepTo(runtime, runtime.kernel.tick + 300);
    expect(runtime.construction.getOrder('toilet-1')?.state).toBe('completed');
    expect(stockOf(runtime, 'item.brick')).toBe(BRICKS_TO_THE_RUNG - 1);
    const toiletTile = { x: tileCoordinate(5), y: tileCoordinate(6) };
    expect(runtime.placedObjects.objectAt(toiletTile)?.objectId, 'the toilet is standing').toBe('object.toilet');
    send(runtime, 'undo', { type: 'Undo' });
    expect(runtime.construction.getOrder('toilet-1')?.state, 'the undo does reach the order').toBe('cancelled');
    expect(runtime.placedObjects.objectAt(toiletTile), 'and the toilet really came down').toBeUndefined();
    expect(stockOf(runtime, 'item.brick'), 'undo returns nothing: the brick went into the toilet and stayed there').toBe(
      BRICKS_TO_THE_RUNG - 1,
    );
    expect(runtime.treasury.balanceMinorUnits, 'and not a minor unit of it is money').toBe(balanceBeforeTheToilet);

    /*
     * **No escape recovers the prison, which is ECON-002's own conclusion,
     * reopened.** Nothing above moved the balance off `BALANCE_AT_THE_RUNG`,
     * there is no occupied place and no route to one, and every command the
     * union offers has now been tried. This is the state the file's opening
     * sentence names -- *"a session that reaches this balance can never earn
     * another minor unit"* -- true again since the owner's ruling on #771.
     */
    expect(runtime.treasury.balanceMinorUnits, 'the prison is locked exactly where it pressed itself to').toBe(
      BALANCE_AT_THE_RUNG,
    );
  });

  it('is a zone and not a knife edge: 655 bricks leaves 50 of room, which is still short of a plank', () => {
    /*
     * `docs/AGENT_WORKFLOW.md`'s floor-value trap, answered directly. A fixture
     * that spent *exactly* the treasury could not tell "the game ends at zero"
     * from "the game ends below the price of a plank", and those are different
     * findings with different remedies -- a floor at zero fixes the first and
     * not the second.
     *
     * **Pre-ruling this case bought 624 bricks and asserted 40 in the bank**:
     * *"money in the bank, a balance the HUD shows as non-zero, and a prison in
     * exactly the same trap"*. The trap is a zone in *spending power*, and #703
     * ruling A moved where that zone sits without changing its width: it is
     * `[floor, floor + 65)` in the balance, so 686 x 40 leaves -2,440 with 60 of
     * the overdraft unspent -- room in the facility, a balance the HUD shows as
     * a minus, and a prison in exactly the same trap.
     *
     * > ```
     * > send(runtime, 'buy', { … quantity: 686 });   // -2,440, 60 of room, locked
     * > send(escaped, 'buy', { … quantity: 685 });   // -2,400, 100 of room, escapes
     * > ```
     *
     * **The owner's ruling 19 of 2026-08-31 moved it once more, again without
     * changing the width.** The zone is now `[rung, rung + 65)` against the
     * *delivery* rung: 655 x 40 leaves -1,200 with 50 of press room, and 654
     * leaves -1,160 with 90, which buys the plank. Still 65 wide, still a zone
     * and not a point, and the same two facts on either side of it.
     */
    const runtime = createNewSimulationRuntime(SEED);
    send(runtime, 'buy', { type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.brick', quantity: 655 });
    expect(runtime.treasury.balanceMinorUnits).toBe(-1_200);
    stepTo(runtime, PROCUREMENT_DELIVERY_DELAY_TICKS + 2);

    send(runtime, 'buy-plank', { type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.wood-plank', quantity: 1 });
    expect(runtime.refusals.last?.reason).toBe('purchase.insufficient-funds');
    expect(
      runtime.treasury.balanceMinorUnits,
      'the 50 of press room left is unspendable on the one thing that matters',
    ).toBe(-1_200);

    /*
     * And the far edge of the zone, so this is a width and not a point: 654
     * bricks leaves -1,160, which is 90 of press room, and the plank goes
     * through. The pre-ruling file had no equivalent case because the far edge
     * was the opening balance itself.
     */
    const escaped = createNewSimulationRuntime(SEED);
    send(escaped, 'buy', { type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.brick', quantity: 654 });
    expect(escaped.treasury.balanceMinorUnits).toBe(-1_160);
    send(escaped, 'buy-plank', { type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.wood-plank', quantity: 1 });
    expect(escaped.refusals.last, 'one brick fewer and the prison is not locked at all').toBeUndefined();
    expect(escaped.treasury.balanceMinorUnits).toBe(-1_225);
  });
});

describe('the same lock reached by a charge the player cannot decline', () => {
  /**
   * The route that matters more than the 625-brick press, because nobody has
   * to make a reckless purchase to find it.
   *
   * `PayrollSystem` bills every employee's `wageBand.minPerDay` at the end of
   * every in-game day -- a guard is 80 (`src/content/staff-role-catalog.ts:150`)
   * -- and `HireStaff` charges one day's wage up front
   * (`src/simulation/staff/hiring.ts:198`). A prison that spends most of its
   * money on walls and hires one guard is then losing 80 a day against an
   * income line that cannot start until it buys a 65 plank. The balance walks
   * itself below 65 with no further press, and every press after that is
   * refused.
   *
   * ADR 0049 made insolvency a state rather than a loss condition, and it is a
   * state a *furnished* prison digs out of. This is the same state entered
   * before the first bed, where there is nothing to dig with.
   */
  /**
   * **#703 ruling A cures this route, and that is the finding rather than a
   * fixture repair.** The case below used to be titled *"walks a prison below
   * one plank on payroll alone, with no further press"* and it ended:
   *
   * > `stepTo(runtime, 12_000);`
   * > `expect(runtime.treasury.balanceMinorUnits).toBe(0);`
   * > `expect(runtime.payroll.unpaidWagesMinorUnits).toBeGreaterThan(0);`
   *
   * -- a prison at 40, then at 0, arrears rising, and no press that could ever
   * earn a minor unit. Every one of those figures was correct when it was
   * written and the walk still happens exactly as described; what changed is
   * where it *ends*.
   *
   * `PayrollSystem.update` pays `Math.min(due, this.treasury.balanceMinorUnits)`
   * -- bounded by the **balance**, not by what `Treasury.spend` allows -- so
   * wages cannot reach into the standing overdraft at all. The walk still stops
   * at 0, and at 0 the prison has the whole 2,500 to buy a 65 plank with. So the
   * route a player *cannot decline* no longer locks anybody, while the purchase
   * route above still does, because a player can spend the room and payroll
   * cannot. That asymmetry is the whole of what the ruling bought here.
   *
   * **The asymmetry is gone under the owner's ruling 19 of 2026-08-31, and it
   * is gone in the direction the paragraph above did not consider.** Ruling 19
   * -- drafted as ADR 0017's "Amendment, 2026-09-01" -- puts ADR 0017 decision
   * 8's third rung *at the floor*: wages are unpaid below -2,500, which means
   * paid down to it. `PayrollSystem` therefore bounds the day by
   * `Math.min(due, balance - floorFor('wages'))` and **does** reach into the
   * overdraft. The paragraph above is kept because it is the reading ADR 0083's
   * "considered and not taken" defended by name, and it is the reading the owner
   * overruled.
   *
   * What that does to this case, measured below rather than argued:
   *
   * - The walk to 40 and the plank at -25 are **unchanged**, because none of it
   *   crosses a rung: a press is refused below -1,250 and -25 is nowhere near.
   * - The nine days after it no longer arrear anything. The balance walks on
   *   down to **-745**, and the arrears stay at 0.
   * - The walk now ends at the wage rung rather than at 0, and the last case
   *   below steps far enough to watch it get there and start owing.
   *
   * **The player is not locked either way**, which is the finding this route
   * exists to report: the plank is bought at -25 and the bed is buildable, so
   * the income line can start. What ruling 19 changes is that the prison spends
   * its facility on wages while it waits, instead of holding it.
   */
  it('walks a prison past zero on payroll alone, buys the plank on the way, and stops at the wage rung', () => {
    const runtime = createNewSimulationRuntime(SEED);
    // Walls, not a spending spree: 616 bricks is 24,640, which at two bricks a
    // wall segment is 308 segments. The prison keeps 360 -- five planks' worth,
    // and it never presses a purchase again.
    send(runtime, 'buy', { type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.brick', quantity: 616 });
    expect(runtime.treasury.balanceMinorUnits).toBe(360);

    send(runtime, 'hire', { type: 'HireStaff', staffRoleId: 'staff-role.guard', x: 16, y: 16 });
    expect(runtime.refusals.last, 'the hire is affordable and is accepted').toBeUndefined();
    expect(runtime.treasury.balanceMinorUnits, 'one day of a guard, up front').toBe(280);

    // Three in-game days of payroll at 80, and nothing else pressed at all.
    // 280 - 240 = 40: the same walk, to the same figure, as before the ruling.
    stepTo(runtime, 3 * 2_400 + 1);
    expect(runtime.treasury.balanceMinorUnits).toBe(40);

    // The press that used to be refused here.
    send(runtime, 'buy-plank', { type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.wood-plank', quantity: 1 });
    expect(runtime.refusals.last, 'the plank is affordable out of the standing overdraft').toBeUndefined();
    expect(runtime.treasury.balanceMinorUnits, '40 - 65').toBe(-25);
    expect(stockOf(runtime, 'item.wood-plank'), 'not yet -- the lorry is on the road').toBe(0);
    stepTo(runtime, runtime.kernel.tick + PROCUREMENT_DELIVERY_DELAY_TICKS + 2);
    expect(stockOf(runtime, 'item.wood-plank'), 'and a bed is now buildable, which is the way out').toBe(1);

    /*
     * **And payroll now follows it down, which is the half ruling 19 reversed.**
     *
     * This block read:
     *
     * > And payroll still cannot follow it down. Nine more in-game days of an 80
     * > wage against a balance of -25: not one minor unit is paid, the balance
     * > does not move, and the whole bill becomes arrears -- ADR 0049's third
     * > rung, which ADR 0083 §(a) predicted survives an open floor and which this
     * > measures at a balance that is already negative.
     *
     * > ```
     * > expect(runtime.treasury.balanceMinorUnits, 'wages are bounded by the balance, not by the floor')
     * >   .toBe(balanceBeforeTheWages);
     * > expect(runtime.payroll.unpaidWagesMinorUnits).toBeGreaterThan(0);
     * > ```
     *
     * Nine days at 80 out of -25 is **-745**, and nothing is owed: the room is
     * the payroll's now, down to the wage rung.
     */
    expect(runtime.treasury.balanceMinorUnits).toBe(-25);
    stepTo(runtime, 12 * 2_400);
    expect(runtime.treasury.balanceMinorUnits, 'nine paydays at 80, out of the overdraft').toBe(-745);
    expect(runtime.payroll.unpaidWagesMinorUnits, 'and not a minor unit is owed while the room lasts').toBe(0);

    /*
     * **The third rung, watched firing.** From -745 the wage rung is 1,755 away,
     * which is twenty-one whole paydays at 80 with 75 left over. The
     * twenty-second takes the 75, lands the balance exactly on -2,500 and owes
     * the other 5 -- ADR 0049's arrears, at the threshold ruling 19 gives them.
     * Every payday after that owes the whole 80.
     */
    stepTo(runtime, 34 * 2_400);
    expect(runtime.treasury.balanceMinorUnits, 'exactly the wage rung, which is the floor').toBe(
      TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS,
    );
    expect(runtime.payroll.unpaidWagesMinorUnits, '80 due against the 75 the rung left').toBe(5);

    stepTo(runtime, 35 * 2_400);
    expect(runtime.treasury.balanceMinorUnits, 'and the rung holds: no payday may pass it').toBe(
      TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS,
    );
    expect(runtime.payroll.unpaidWagesMinorUnits, '5 owed plus the next whole 80').toBe(85);
  });
});
