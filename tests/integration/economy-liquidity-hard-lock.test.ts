import { describe, expect, it } from 'vitest';
import { PROCUREMENT_DELIVERY_DELAY_TICKS, procurableMaterial } from '../../src/content/procurement-catalog';
import { BUILDABLE_REGISTRY } from '../../src/simulation/construction/definition';
import { TREASURY_STARTING_BALANCE_MINOR_UNITS } from '../../src/simulation/economy';
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
 * So a session that reaches *cash below one plank's price with no plank in
 * stock and nothing plank-built to reverse* can never earn another minor unit.
 * `MAX_PURCHASE_QUANTITY` is 100,000 and `src/main.ts`'s Build panel opens its
 * stepper on that same bound rather than on affordability
 * (`purchasableMaterialFor`), so one press of a control the game offers reaches
 * it.
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
 * session opens on 25,000, so 625 x 40 = 25,000 is written out.
 */

const SEED = 0x0ec002;
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

  it('spends 25,000 on 625 bricks and leaves no sequence that earns a minor unit', () => {
    const runtime = createNewSimulationRuntime(SEED);
    expect(runtime.treasury.balanceMinorUnits).toBe(25_000);

    // One press of a control the Build panel offers. Nothing refuses it.
    send(runtime, 'buy-all', { type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.brick', quantity: 625 });
    expect(runtime.refusals.last, 'the purchase is legal and is accepted').toBeUndefined();
    expect(runtime.treasury.balanceMinorUnits, '625 x 40 is the whole opening balance').toBe(0);

    stepTo(runtime, PROCUREMENT_DELIVERY_DELAY_TICKS + 2);
    expect(stockOf(runtime, 'item.brick'), 'the goods arrived, so this is not a pending order').toBe(625);
    expect(runtime.procurement.pendingDeliveries).toHaveLength(0);

    // **Escape 1: cancel the purchase.** #285's command exists and reaches a
    // real credit path, and it is out of reach the moment the lorry unloads.
    send(runtime, 'cancel', { type: 'CancelMaterialPurchase', orderId: 'buy-1' });
    expect(runtime.refusals.last?.reason).toBe('cancel-purchase.not-pending');
    expect(runtime.treasury.balanceMinorUnits).toBe(0);
    expect(stockOf(runtime, 'item.brick'), 'and the bricks stay bought').toBe(625);

    // **Escape 2: buy the one plank a bed needs.** 65 against 0.
    send(runtime, 'buy-plank', { type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.wood-plank', quantity: 1 });
    expect(runtime.refusals.last?.reason).toBe('purchase.insufficient-funds');
    expect(runtime.treasury.balanceMinorUnits).toBe(0);
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
    expect(runtime.treasury.balanceMinorUnits, 'five in-game days later, still nothing').toBe(0);

    // **Escape 5: give the bricks back.** A brick-built object can be removed
    // and undone, and both give bricks -- never money.
    send(runtime, 'toilet', { type: 'PlaceObject', orderId: 'toilet-1', definitionId: 'toilet-brick', x: 5, y: 6 });
    stepTo(runtime, runtime.kernel.tick + 300);
    expect(runtime.construction.getOrder('toilet-1')?.state).toBe('completed');
    expect(stockOf(runtime, 'item.brick')).toBe(624);
    send(runtime, 'undo', { type: 'Undo' });
    expect(stockOf(runtime, 'item.brick'), 'undo returns the brick').toBe(625);
    expect(runtime.treasury.balanceMinorUnits, 'and not a minor unit of it is money').toBe(0);
  });

  it('is a zone and not a knife edge: 624 bricks leaves 40, which is still short of a plank', () => {
    /*
     * `docs/AGENT_WORKFLOW.md`'s floor-value trap, answered directly. A fixture
     * that spent *exactly* the treasury could not tell "the game ends at zero"
     * from "the game ends below the price of a plank", and those are different
     * findings with different remedies -- a floor at zero fixes the first and
     * not the second.
     *
     * 624 x 40 = 24,960, leaving **40**: money in the bank, a balance the HUD
     * shows as non-zero, and a prison in exactly the same trap.
     */
    const runtime = createNewSimulationRuntime(SEED);
    send(runtime, 'buy', { type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.brick', quantity: 624 });
    expect(runtime.treasury.balanceMinorUnits).toBe(40);
    stepTo(runtime, PROCUREMENT_DELIVERY_DELAY_TICKS + 2);

    send(runtime, 'buy-plank', { type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.wood-plank', quantity: 1 });
    expect(runtime.refusals.last?.reason).toBe('purchase.insufficient-funds');
    expect(runtime.treasury.balanceMinorUnits, 'the 40 is unspendable on the one thing that matters').toBe(40);
  });
});
