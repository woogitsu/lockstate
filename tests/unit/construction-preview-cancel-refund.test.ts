import { describe, expect, it } from 'vitest';
import { PROCURABLE_MATERIALS } from '../../src/content/procurement-catalog';
import { BUILDABLE_REGISTRY } from '../../src/simulation/construction';
import { ConstructionSystem, type ConstructionSnapshot } from '../../src/simulation/construction/system';
import { packCommand } from '../../src/simulation/protocol/commands';
import { CONSTRUCTION_MATERIALS_CONTAINER_ID, createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { expectOk } from '../helpers/expect-ok';

/**
 * `ConstructionSystem.previewCancelRefundMinorUnits`, the figure the Build
 * panel's queue row shows beside its own Cancel button (the owner's ruling of
 * 2026-09-02), tested at the system level rather than through the projection
 * or a command.
 *
 * ## What belongs here and what does not
 *
 * This file is the states a real session's own play cannot easily put an
 * order in, or where the interesting fact is about the *method's own
 * contract* rather than about a full drag through the command boundary:
 * `'planned'`, a terminal state, an id that names nothing, and a bare system
 * with no procurement sink wired. Every one of those is reachable only by
 * hand-crafting a `BuildOrder` through `restore()`, exactly as
 * `construction-crew-capacity.test.ts`'s legacy-save fixture does, or by
 * constructing a system with no fifth argument.
 *
 * The claim that this figure agrees with what `CancelBuildOrder` actually
 * pays -- through the real command, for the states a player actually
 * reaches -- is `tests/integration/construction-queue-row-pays-what-it-shows.test.ts`,
 * per `docs/TESTING.md`'s rule that a fixture calling the system directly
 * does not exercise the route the behaviour lives on. This file's job is
 * narrower: the states that fixture cannot reach at all.
 */

const SEED = 11;
const WALL = 'wall-brick';
const UNIT_PRICE = new Map(PROCURABLE_MATERIALS.map((material) => [material.itemId, material.unitPriceMinorUnits]));
const WALL_REQUIREMENT = BUILDABLE_REGISTRY.get(WALL)!.materialsRequired[0]!;
/** Two bricks at 40, read from content rather than written down (`docs/TESTING.md`). */
const WALL_COST = UNIT_PRICE.get(WALL_REQUIREMENT.itemId)! * WALL_REQUIREMENT.quantity;

const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

describe('previewCancelRefundMinorUnits, the states a full session cannot easily reach', () => {
  it('answers 0 for an id that names no order', () => {
    const runtime = createNewSimulationRuntime(SEED);
    expect(runtime.construction.previewCancelRefundMinorUnits('order-nowhere')).toBe(0);
  });

  it('answers 0 for a terminal state, exactly as cancelOrder itself refuses one', () => {
    const runtime = createNewSimulationRuntime(SEED);
    const snapshot: ConstructionSnapshot = {
      orders: [
        { id: 'order-done', definitionId: WALL, location: tile(3, 3), state: 'cancelled', progress: 0, materialsAllocated: [] },
      ],
      undoStack: [],
      redoStack: [],
    };
    runtime.construction.restore(snapshot);
    expect(runtime.construction.previewCancelRefundMinorUnits('order-done')).toBe(0);
    // `cancelOrder` itself throws for the same order, which is the other half
    // of "this row's control could not be pressed successfully either" --
    // the projection never lists a terminal state in the first place
    // (`PENDING_BUILD_ORDER_STATES`), so this is a belt-and-braces check on
    // the method's own contract rather than a claim about what a player sees.
    expect(() => runtime.construction.cancelOrder('order-done')).toThrow();
  });

  it('answers 0 for `planned`, because it never became demand and nothing was ever bought for it', () => {
    /*
     * `'planned'` is reachable only from a hand-written or hostile save --
     * `submitOrder` never leaves an order there -- so this is the one case in
     * the whole file that cannot be produced by *any* command, real or
     * otherwise. `pendingOrderDemand`'s own comment states the rule this
     * measures: `'planned'` does not count as demand, so `procureForPendingOrders`
     * never bought anything for it and there is no delivery, no allocation and
     * no money to turn around.
     */
    const runtime = createNewSimulationRuntime(SEED);
    const balanceBefore = runtime.treasury.balanceMinorUnits;
    const snapshot: ConstructionSnapshot = {
      orders: [
        { id: 'order-planned', definitionId: WALL, location: tile(3, 3), state: 'planned', progress: 0, materialsAllocated: [] },
      ],
      undoStack: [],
      redoStack: [],
    };
    runtime.construction.restore(snapshot);

    expect(runtime.construction.previewCancelRefundMinorUnits('order-planned')).toBe(0);

    // And the preview agreed with reality: cancelling it for real moves
    // nothing, which is the mutation this test would catch if the preview's
    // `'planned'` branch were ever deleted and the method fell through to the
    // `'approved'`/`'materials-pending'` arithmetic instead (that arithmetic
    // would ask the sink for a delivery that was never bought and also answer
    // `0`, so this second assertion is the one that would actually notice --
    // a wrong non-zero preview and a correct zero cancellation would disagree
    // right here).
    runtime.construction.cancelOrder('order-planned');
    expect(runtime.treasury.balanceMinorUnits).toBe(balanceBefore);
  });

  it('answers 0 for an unknown buildable, because there is no definition to price materials against', () => {
    const runtime = createNewSimulationRuntime(SEED);
    const snapshot: ConstructionSnapshot = {
      orders: [
        { id: 'order-ghost', definitionId: 'not-a-real-buildable', location: tile(3, 3), state: 'approved', progress: 0, materialsAllocated: [] },
      ],
      undoStack: [],
      redoStack: [],
    };
    runtime.construction.restore(snapshot);
    expect(runtime.construction.previewCancelRefundMinorUnits('order-ghost')).toBe(0);
  });

  it('answers 0 with no procurement sink wired, for an `assigned` order that is genuinely holding material', () => {
    /*
     * A bare `ConstructionSystem` -- `UNLIMITED_MATERIALS_PROVIDER`, no
     * treasury behind it at all -- is not a session, and "money instead of
     * bricks" has no meaning where there is no money
     * (`cancelOrder`'s own docblock, "With no procurement sink wired"). The
     * order really is holding an allocation; what is being measured is that
     * the preview does not invent a price for it out of the catalogue anyway.
     */
    const world = new SparseWorld(32);
    const construction = new ConstructionSystem(world);
    const snapshot: ConstructionSnapshot = {
      orders: [
        {
          id: 'order-bare',
          definitionId: WALL,
          location: tile(3, 3),
          state: 'assigned',
          progress: 0,
          materialsAllocated: [{ itemId: WALL_REQUIREMENT.itemId, quantity: WALL_REQUIREMENT.quantity }],
        },
      ],
      undoStack: [],
      redoStack: [],
    };
    construction.restore(snapshot);
    expect(construction.previewCancelRefundMinorUnits('order-bare')).toBe(0);
  });

  it('agrees with a real cancellation in a queue of two, where excluding the previewed order from demand actually matters', () => {
    /*
     * The one property specific to this method rather than to the table it
     * reads: `demandedQuantityOf(itemId, order.id)` has to exclude the
     * previewed order from the demand it compares supply against, because
     * (unlike `refundSurplusOf`'s own call to the same method) the order's
     * state has not been flipped to `'cancelled'` yet when this runs. Two
     * orders sharing one item is what makes that exclusion able to produce a
     * different number from the naive "the whole demand" -- with one order in
     * the book, excluding it and not excluding it agree, because either way
     * the remaining demand is zero.
     *
     * This still goes through the real command boundary for both orders' own
     * placement -- `docs/TESTING.md`'s rule -- and only reads
     * `previewCancelRefundMinorUnits` directly, comparing it against the
     * treasury's own before/after through a direct `cancelOrder` call (which
     * `tests/integration/construction-queue-row-pays-what-it-shows.test.ts`
     * repeats through the command instead, for the route claim).
     */
    const runtime = createNewSimulationRuntime(SEED);
    const submit = (orderId: string, x: number, y: number): void => {
      runtime.kernel.submitCommand(
        `cmd-${orderId}`,
        runtime.kernel.expectedSequence,
        runtime.kernel.tick,
        packCommand({ type: 'PlaceBuildOrder', orderId, definitionId: WALL, x, y, transactionId: `txn-${orderId}` }),
      );
    };
    submit('order-a', 3, 3);
    submit('order-b', 3, 4);
    runtime.kernel.step();

    // Both orders bought their own delivery at the press
    // (`ConstructionSystem.procureQueuedMaterials`'s own comment on when it is
    // called), so both are `'materials-pending'` with money on the road.
    expect(runtime.construction.getOrder('order-a')?.state).toBe('materials-pending');
    expect(runtime.construction.getOrder('order-b')?.state).toBe('materials-pending');

    const previewed = runtime.construction.previewCancelRefundMinorUnits('order-a');
    expect(previewed, 'the money for this order\'s own delivery, on the road').toBe(WALL_COST);

    const balanceBefore = runtime.treasury.balanceMinorUnits;
    runtime.construction.cancelOrder('order-a');
    expect(runtime.treasury.balanceMinorUnits - balanceBefore, 'the preview and the real cancellation agree').toBe(
      previewed,
    );

    // And the order this test is not cancelling was not touched: its own
    // delivery is still on the road, still buying it the same wall.
    expect(runtime.construction.getOrder('order-b')?.state).toBe('materials-pending');
    const container = runtime.containers.require(CONSTRUCTION_MATERIALS_CONTAINER_ID);
    expect(container.quantityOf(WALL_REQUIREMENT.itemId), 'order-a took no bricks with it').toBe(0);
  });

  it('cancels the delivery before it sells the shelf, which is the whole of why the two arms are ordered (M6)', () => {
    /*
     * **The mutation this exists to kill, named M6 on the branch that built
     * the sell-back and reported as *surviving* there.** The report's reason
     * was that swapping `refundSurplusDeliveries` and `refundSurplusStock` in
     * `refundSurplusOf` is unobservable while `PROCURABLE_MATERIALS` is a
     * static table with no producer, so a delivery's recorded
     * `paidMinorUnits` and the catalogue price are always the same number.
     * **That reason is sound and the conclusion drawn from it was too narrow**:
     * the arms differ in what they take as well as in what they pay, so the
     * order is observable at equal prices too.
     *
     * A delivery is **indivisible** -- `largestSurplusDelivery` takes a whole
     * one or none -- and the stock arm is clamped by the cancelled order's own
     * requirement. So selling the shelf first can shrink the surplus below the
     * size of a delivery that would otherwise have fitted, and the delivery
     * then stays on the road:
     *
     * | | delivery arm first (the code) | stock arm first (M6) |
     * | --- | --- | --- |
     * | credited | 80, the delivery's own paid price | 40, one brick at catalogue |
     * | shelf after | 1 brick, which is exactly what the remaining order needs | 0 |
     * | on the road after | nothing | a 2-brick delivery for a 1-brick demand |
     *
     * `refundSurplusOf`'s own comment gives the intent -- *"Selling the shelf
     * while a delivery for the same item was still refundable would prefer the
     * weaker figure for no reason"* -- and this is that sentence with a
     * number under it.
     *
     * **Why this file and not the integration suite.** The shape needs an odd
     * residual demand (one `toilet-brick`, one brick), a shelf holding exactly
     * one brick and a two-brick delivery still in flight, all at once. A drag
     * through the command boundary buys per order against the shelf it finds,
     * so it cannot be steered into that arrangement; `restore()` plus a direct
     * `ProcurementSystem.purchase` is the only way to reach it, which is this
     * file's stated subject.
     */
    const runtime = createNewSimulationRuntime(SEED);
    const brick = WALL_REQUIREMENT.itemId;
    const brickPrice = UNIT_PRICE.get(brick)!;
    // One brick, not two: `toilet-brick` is the buildable that leaves an odd
    // residual demand, which is what makes the two arms disagree at all.
    expect(BUILDABLE_REGISTRY.get('toilet-brick')?.materialsRequired).toEqual([{ itemId: brick, quantity: 1 }]);

    const snapshot: ConstructionSnapshot = {
      orders: [
        { id: 'order-wall', definitionId: WALL, location: tile(3, 3), state: 'materials-pending', progress: 0, materialsAllocated: [] },
        { id: 'order-toilet', definitionId: 'toilet-brick', location: tile(8, 8), state: 'materials-pending', progress: 0, materialsAllocated: [] },
      ],
      undoStack: [],
      redoStack: [],
    };
    runtime.construction.restore(snapshot);

    const container = runtime.containers.require(CONSTRUCTION_MATERIALS_CONTAINER_ID);
    container.deposit(brick, 1);
    expectOk(
      runtime.procurement.purchase('jit:m6-probe', brick, 2, runtime.kernel.tick, 'construction'),
      'the two-brick delivery put on the road at the price the shelf would sell at',
    );
    expect(runtime.procurement.pendingDeliveries).toHaveLength(1);

    const balanceBefore = runtime.treasury.balanceMinorUnits;
    const previewed = runtime.construction.previewCancelRefundMinorUnits('order-wall');
    runtime.construction.cancelOrder('order-wall');
    const movedBy = runtime.treasury.balanceMinorUnits - balanceBefore;

    expect(movedBy, 'the delivery came back whole, at its own paid price').toBe(2 * brickPrice);
    expect(previewed, 'and the row said so before the press').toBe(movedBy);
    expect(runtime.procurement.pendingDeliveries, 'the road is clear').toHaveLength(0);
    expect(container.quantityOf(brick), "the brick the toilet still needs was not sold out from under it").toBe(1);
  });
});
