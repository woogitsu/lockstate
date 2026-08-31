import { describe, expect, it } from 'vitest';
import { PROCUREMENT_DELIVERY_DELAY_TICKS, procurableMaterial } from '../../src/content/procurement-catalog';
import { BUILDABLE_REGISTRY } from '../../src/simulation/construction/definition';
import {
  TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS,
  TREASURY_STARTING_BALANCE_MINOR_UNITS,
} from '../../src/simulation/economy';
import { packCommand, simulationCommandSchema, type SimulationCommand } from '../../src/simulation/protocol/commands';
import {
  CONSTRUCTION_MATERIALS_CONTAINER_ID,
  createNewSimulationRuntime,
  type SimulationRuntime,
} from '../../src/simulation/runtime/new-session';
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
 * Spending power is `25,000 + 2,500 = 27,500`, which is 687 bricks and 40 left
 * over -- so 687 x 40 leaves **-2,480**, exactly the shape 625 x 40 leaving 0
 * had before the ruling, and 2,480 of the 2,500 is spent.
 */
const OVERDRAFT_ROOM = 2_500;
/** 27,500 / 40, rounded down: the largest whole brick order a new prison can place. */
const BRICKS_TO_THE_FLOOR = 687;
/** 25,000 - 687 x 40. The 40 that is left is unspendable on a 65 plank, exactly as the pre-ruling 40 was. */
const BALANCE_AT_THE_FLOOR = -2_480;
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
    expect(TREASURY_STARTING_BALANCE_MINOR_UNITS - BRICKS_TO_THE_FLOOR * 40).toBe(BALANCE_AT_THE_FLOOR);
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
     * Of these fourteen, exactly one credits the treasury --
     * `CancelMaterialPurchase` -- and the test below measures that it refuses
     * once the delivery has landed.
     */
    const types = simulationCommandSchema.options.map((option) => option.shape.type.value).sort();
    expect(types).toEqual([
      'AdmitPrisoner',
      'CancelBuildOrder',
      'CancelMaterialPurchase',
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

  it('spends the grant and the overdraft on 687 bricks and leaves no sequence that earns a minor unit', () => {
    /*
     * **The title said "25,000 on 625 bricks" and the quantity was the whole
     * opening balance.** Since #703 ruling A a new prison's spending power is
     * the grant *plus* the standing overdraft, so the press that reaches the
     * bottom is 687 bricks rather than 625 and the bottom is -2,480 rather than
     * 0. Every escape below is unchanged and so is every refusal: what moved is
     * the number `Treasury.canAfford` compares against, and nothing else in the
     * loop the file opens with.
     */
    const runtime = createNewSimulationRuntime(SEED);
    expect(runtime.treasury.balanceMinorUnits).toBe(25_000);
    expect(runtime.treasury.overdraftFloorMinorUnits, 'the facility is standing, unpressed').toBe(-OVERDRAFT_ROOM);

    // One press of a control the Build panel offers. Nothing refuses it.
    send(runtime, 'buy-all', { type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.brick', quantity: BRICKS_TO_THE_FLOOR });
    expect(runtime.refusals.last, 'the purchase is legal and is accepted').toBeUndefined();
    expect(runtime.treasury.balanceMinorUnits, '687 x 40 is the grant and all but 20 of the overdraft').toBe(BALANCE_AT_THE_FLOOR);

    stepTo(runtime, PROCUREMENT_DELIVERY_DELAY_TICKS + 2);
    expect(stockOf(runtime, 'item.brick'), 'the goods arrived, so this is not a pending order').toBe(BRICKS_TO_THE_FLOOR);
    expect(runtime.procurement.pendingDeliveries).toHaveLength(0);

    // **Escape 1: cancel the purchase.** #285's command exists and reaches a
    // real credit path, and it is out of reach the moment the lorry unloads.
    send(runtime, 'cancel', { type: 'CancelMaterialPurchase', orderId: 'buy-1' });
    expect(runtime.refusals.last?.reason).toBe('cancel-purchase.not-pending');
    expect(runtime.treasury.balanceMinorUnits).toBe(BALANCE_AT_THE_FLOOR);
    expect(stockOf(runtime, 'item.brick'), 'and the bricks stay bought').toBe(BRICKS_TO_THE_FLOOR);

    // **Escape 2: buy the one plank a bed needs.** 65 against 20 of room left,
    // which is the same refusal the pre-ruling sequence got for 65 against 0.
    send(runtime, 'buy-plank', { type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.wood-plank', quantity: 1 });
    expect(runtime.refusals.last?.reason).toBe('purchase.insufficient-funds');
    expect(runtime.treasury.balanceMinorUnits).toBe(BALANCE_AT_THE_FLOOR);
    expect(stockOf(runtime, 'item.wood-plank')).toBe(0);

    // **Escape 3: order the bed anyway and wait.** A `materials-pending` order
    // is retried on every scheduled tick for ever, and 5,000 ticks is two
    // in-game days of retrying against a container that will never hold a plank.
    wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
    send(runtime, 'zone', { type: 'ZoneRoom', roomId: CELL, ...CELL_RECT });
    send(runtime, 'bed', { type: 'PlaceObject', orderId: 'bed-1', definitionId: 'bed-wooden', ...BED_TILE });
    stepTo(runtime, runtime.kernel.tick + 5_000);
    expect(runtime.construction.getOrder('bed-1')?.state).toBe('materials-pending');
    expect(runtime.placedObjects.size).toBe(0);
    const cellInstanceId = `${CELL}:${CELL_RECT.x}:${CELL_RECT.y}`;
    expect(runtime.prisoners.roomInstances.getById(cellInstanceId)?.residentCapacity).toBe(0);

    // **Escape 4: admit somebody and let the state pay for them.** It does not:
    // an arrival nobody could house holds no occupancy slot, and
    // `StateIncomeSystem` pays per occupied place.
    send(runtime, 'admit', { type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL });
    stepTo(runtime, runtime.kernel.tick + 12_000);
    expect(runtime.prisoners.roomInstances.totalOccupancy).toBe(0);
    expect(runtime.treasury.balanceMinorUnits, 'five in-game days later, still nothing').toBe(BALANCE_AT_THE_FLOOR);

    // **Escape 5: give the bricks back.** A brick-built object can be removed
    // and undone, and both give bricks -- never money.
    send(runtime, 'toilet', { type: 'PlaceObject', orderId: 'toilet-1', definitionId: 'toilet-brick', x: 5, y: 6 });
    stepTo(runtime, runtime.kernel.tick + 300);
    expect(runtime.construction.getOrder('toilet-1')?.state).toBe('completed');
    expect(stockOf(runtime, 'item.brick')).toBe(BRICKS_TO_THE_FLOOR - 1);
    send(runtime, 'undo', { type: 'Undo' });
    expect(stockOf(runtime, 'item.brick'), 'undo returns the brick').toBe(BRICKS_TO_THE_FLOOR);
    expect(runtime.treasury.balanceMinorUnits, 'and not a minor unit of it is money').toBe(BALANCE_AT_THE_FLOOR);
  });

  it('is a zone and not a knife edge: 686 bricks leaves 60 of room, which is still short of a plank', () => {
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
     */
    const runtime = createNewSimulationRuntime(SEED);
    send(runtime, 'buy', { type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.brick', quantity: 686 });
    expect(runtime.treasury.balanceMinorUnits).toBe(-2_440);
    stepTo(runtime, PROCUREMENT_DELIVERY_DELAY_TICKS + 2);

    send(runtime, 'buy-plank', { type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.wood-plank', quantity: 1 });
    expect(runtime.refusals.last?.reason).toBe('purchase.insufficient-funds');
    expect(
      runtime.treasury.balanceMinorUnits,
      'the 60 of room left is unspendable on the one thing that matters',
    ).toBe(-2_440);

    /*
     * And the far edge of the zone, so this is a width and not a point: 685
     * bricks leaves -2,400, which is 100 of room, and the plank goes through.
     * The pre-ruling file had no equivalent case because the far edge was the
     * opening balance itself.
     */
    const escaped = createNewSimulationRuntime(SEED);
    send(escaped, 'buy', { type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.brick', quantity: 685 });
    expect(escaped.treasury.balanceMinorUnits).toBe(-2_400);
    send(escaped, 'buy-plank', { type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.wood-plank', quantity: 1 });
    expect(escaped.refusals.last, 'one brick fewer and the prison is not locked at all').toBeUndefined();
    expect(escaped.treasury.balanceMinorUnits).toBe(-2_465);
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
   */
  it('still walks a prison to zero on payroll alone, and the overdraft is what it buys the plank with', () => {
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
     * And payroll still cannot follow it down. Nine more in-game days of an 80
     * wage against a balance of -25: not one minor unit is paid, the balance
     * does not move, and the whole bill becomes arrears -- ADR 0049's third
     * rung, which ADR 0083 §(a) predicted survives an open floor and which this
     * measures at a balance that is already negative.
     */
    const balanceBeforeTheWages = runtime.treasury.balanceMinorUnits;
    stepTo(runtime, 12 * 2_400);
    expect(runtime.treasury.balanceMinorUnits, 'wages are bounded by the balance, not by the floor').toBe(
      balanceBeforeTheWages,
    );
    expect(runtime.payroll.unpaidWagesMinorUnits).toBeGreaterThan(0);
    expect(
      runtime.treasury.balanceMinorUnits,
      'so the 2,475 of room still standing is the player`s to spend, not the payroll`s',
    ).toBeGreaterThan(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS);
  });
});
