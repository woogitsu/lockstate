import { describe, expect, it, vi } from 'vitest';
import { PROCUREMENT_DELIVERY_DELAY_TICKS, procurableMaterial } from '../../src/content/procurement-catalog';
import { BUILDABLE_REGISTRY } from '../../src/simulation/construction';
import { TREASURY_STARTING_BALANCE_MINOR_UNITS } from '../../src/simulation/economy';
import { projectBuildQueue } from '../../src/simulation/presentation';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import {
  CONSTRUCTION_MATERIALS_CONTAINER_ID,
  createNewSimulationRuntime,
  type SimulationRuntime,
} from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';

/**
 * **A build order buys what it needs** — [ADR 0017](../../docs/adr/0017-money-primary-resource-model.md)
 * decision 7, discharged (issue #627).
 *
 * ## What was wrong, in the owner's own session
 *
 * That decision is Accepted and reads *"materials are just-in-time by default;
 * holding is permitted, never required."* The code required holding.
 * `ConstructionSystem.update` asked `tryAllocate` for materials the container
 * did not have, got `false`, and parked the order in `'materials-pending'` to
 * be retried on every scheduled tick for ever. #627 is the owner meeting that
 * live: **40 wall orders placed, 25,000 in the bank, nothing built**, and
 * nothing on screen relating the two. Their words: *"gdzie mam kupić te
 * rzeczy? to powinno samo się kupić jak postawiłem ścianę"* — where am I
 * supposed to buy these things? it should buy itself when I place a wall.
 *
 * ## What every figure here is written from
 *
 * `wall-brick` needs 2 `item.brick`, a brick is 40, a prison opens on 25,000.
 * Those three are pinned as literals in the first case and every arithmetic
 * below is written out from them rather than read back off the code — a
 * balance computed from a price the code under test supplied would agree with
 * any price (`docs/TESTING.md`).
 *
 * ## What is measured here and nowhere else
 *
 * - `tests/unit/construction-just-in-time-materials.test.ts` — the deficit
 *   arithmetic, in isolation, against a stub procurement.
 * - `tests/integration/economy-money-conservation.test.ts` — that no route
 *   through this creates or destroys value, on every tick.
 * - here — that a player who never presses *Buy* gets a wall, that a prison
 *   that cannot pay is **told** rather than silently stalled (#629), and what
 *   this costs against [ADR 0075](../../docs/adr/0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md).
 */

const SEED = 0x627;
const WALL = 'wall-brick';
const BRICK = 'item.brick';
const PLANK = 'item.wood-plank';

const BRICKS_PER_WALL = BUILDABLE_REGISTRY.get(WALL)!.materialsRequired[0]!.quantity;
const BRICK_PRICE = procurableMaterial(BRICK)!.unitPriceMinorUnits;
const PLANK_PRICE = procurableMaterial(PLANK)!.unitPriceMinorUnits;
/** One wall segment, all in: 2 bricks at 40. */
const WALL_COST = 80;

/**
 * Submits one command and steps once.
 *
 * The sequence is read off the kernel rather than counted by the caller: it
 * refuses a gap, and every case here mixes commands the fixture sends with
 * commands the case sends.
 */
function send(runtime: SimulationRuntime, command: SimulationCommand): void {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`cmd-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  runtime.kernel.step();
}

function step(runtime: SimulationRuntime, count: number): void {
  for (let index = 0; index < count; index += 1) runtime.kernel.step();
}

const stockOf = (runtime: SimulationRuntime, itemId: string): number =>
  runtime.containers.require(CONSTRUCTION_MATERIALS_CONTAINER_ID).quantityOf(itemId);

const statesOf = (runtime: SimulationRuntime): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const order of runtime.construction.snapshot().orders) {
    counts[order.state] = (counts[order.state] ?? 0) + 1;
  }
  return counts;
};

/**
 * Places `count` wall orders down one column, through the real command
 * boundary.
 *
 * Distinct tiles, because `submitOrder` refuses a second order for an edge one
 * is already standing on (`duplicate-order`, #514) and a fixture that placed
 * forty orders on one tile would be measuring that refusal instead.
 */
function placeWalls(runtime: SimulationRuntime, count: number): string[] {
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const orderId = `order-${String(index).padStart(3, '0')}`;
    ids.push(orderId);
    send(
      runtime,
      { type: 'PlaceBuildOrder', orderId, definitionId: WALL, x: 4 + (index % 20), y: 4 + Math.floor(index / 20) },
    );
  }
  return ids;
}

describe('a build order buys its own materials (#627, ADR 0017 decision 7)', () => {
  it('pins the three figures every case below is written from', () => {
    expect(TREASURY_STARTING_BALANCE_MINOR_UNITS).toBe(25_000);
    expect(BRICKS_PER_WALL).toBe(2);
    expect(BRICK_PRICE).toBe(40);
    expect(BRICKS_PER_WALL * BRICK_PRICE).toBe(WALL_COST);
    expect(PLANK_PRICE).toBe(65);
  });

  it('builds the owner\'s forty walls with 25,000 in the bank and no Buy press at all', () => {
    /*
     * #627, played. Forty orders, an empty container, and not one
     * `PurchaseMaterials` command in the stream.
     *
     * The old behaviour is what makes this a gate rather than a demonstration:
     * before this change every one of the forty sat at `materials-pending` for
     * the whole run and the balance never moved, which is exactly the state
     * the owner was looking at.
     */
    const runtime = createNewSimulationRuntime(SEED);
    expect(stockOf(runtime, BRICK), 'the prison must start with no bricks').toBe(0);

    placeWalls(runtime, 40);

    // 40 x 2 bricks at 40 = 3,200, spent at the press and not a minor unit more.
    expect(runtime.treasury.balanceMinorUnits).toBe(25_000 - 40 * WALL_COST);
    expect(runtime.treasury.balanceMinorUnits).toBe(21_800);
    expect(
      runtime.procurement.pendingDeliveries.reduce((total, delivery) => total + delivery.quantity, 0),
      'eighty bricks are on their way, and none of them is here yet',
    ).toBe(80);
    expect(stockOf(runtime, BRICK)).toBe(0);

    // Long enough for the delivery (100 ticks) and for one crew to build forty
    // walls at 50 work a piece, 10 a scheduled tick, one at a time (#348).
    step(runtime, 4_000);

    expect(statesOf(runtime), 'every wall the owner drew is standing').toEqual({ completed: 40 });
    expect(stockOf(runtime, BRICK), 'and nothing was over-bought').toBe(0);
    expect(runtime.treasury.balanceMinorUnits).toBe(21_800);
  });

  it('buys nothing for a player who bought the bricks themselves', () => {
    /*
     * The other half of decision 7 — *"holding is permitted"* — as a
     * measurement. A player who pre-buys must see exactly what they saw before
     * this change: their own purchase, and no second one.
     *
     * Both terms of the deficit are exercised: the first ten orders are placed
     * while the bricks are still **in flight**, the last ten after they have
     * landed as **stock**. Dropping either term from
     * `JustInTimeMaterialsService` double-buys one half or the other.
     */
    const runtime = createNewSimulationRuntime(SEED);
    send(runtime, { type: 'PurchaseMaterials', orderId: 'order-buy', itemId: BRICK, quantity: 40 });
    const afterOwnPurchase = runtime.treasury.balanceMinorUnits;
    expect(afterOwnPurchase).toBe(25_000 - 40 * BRICK_PRICE);

    // In flight.
    for (let index = 0; index < 10; index += 1) {
      send(runtime, { type: 'PlaceBuildOrder', orderId: `order-a${index}`, definitionId: WALL, x: 4, y: 4 + index });
    }
    expect(runtime.treasury.balanceMinorUnits, 'the lorry already has these bricks on it').toBe(afterOwnPurchase);
    expect(runtime.procurement.pendingDeliveries, 'and no second lorry was sent').toHaveLength(1);

    // Landed.
    step(runtime, PROCUREMENT_DELIVERY_DELAY_TICKS + 2);
    expect(runtime.procurement.pendingDeliveries).toHaveLength(0);
    for (let index = 0; index < 10; index += 1) {
      send(runtime, { type: 'PlaceBuildOrder', orderId: `order-b${index}`, definitionId: WALL, x: 6, y: 4 + index });
    }
    expect(runtime.treasury.balanceMinorUnits, 'these bricks are on the shelf').toBe(afterOwnPurchase);
    expect(runtime.procurement.pendingDeliveries).toHaveLength(0);

    step(runtime, 4_000);
    expect(statesOf(runtime)).toEqual({ completed: 20 });
    expect(runtime.treasury.balanceMinorUnits, 'twenty walls, one purchase, and it was the player\'s').toBe(afterOwnPurchase);
  });

  it('gives two orders placed on one tick two separate deliveries, not one refused as a duplicate', () => {
    /*
     * `justInTimePurchaseOrderId`'s fourth part, measured.
     *
     * The kernel dispatches **every** command due at a tick before any system
     * runs, so a dragged wall run puts several `PlaceBuildOrder` commands on
     * one tick and each buys the increment its own order added. Keyed only on
     * `(tick, itemId)` the second is a `duplicate-order`, which this service
     * reads as "already ordered" — so the second wall would have waited for
     * ever while the report said nothing was wrong.
     *
     * Two purchases at one tick, for two bricks each, is what says the fourth
     * part is doing its job.
     */
    const runtime = createNewSimulationRuntime(SEED);
    runtime.kernel.submitCommand('cmd-0', 0, 0, packCommand({ type: 'PlaceBuildOrder', orderId: 'order-a', definitionId: WALL, x: 4, y: 4 }));
    runtime.kernel.submitCommand('cmd-1', 1, 0, packCommand({ type: 'PlaceBuildOrder', orderId: 'order-b', definitionId: WALL, x: 4, y: 5 }));
    runtime.kernel.step();

    expect(
      runtime.procurement.pendingDeliveries.map((delivery) => [delivery.orderId, delivery.itemId, delivery.quantity]),
    ).toEqual([
      ['jit:0:item.brick:0', BRICK, 2],
      ['jit:0:item.brick:2', BRICK, 2],
    ]);
    expect(runtime.treasury.balanceMinorUnits).toBe(25_000 - 2 * WALL_COST);

    step(runtime, 4_000);
    expect(statesOf(runtime), 'both walls, not one').toEqual({ completed: 2 });
  });
});

describe('a prison that cannot pay is told, at the press (#629, ADR 0017 decision 2)', () => {
  /**
   * ADR 0017 decision 2 rides with decision 7: *"a purchase that cannot be
   * afforded must be refusable."* Issue #629 is what makes "refusable" mean
   * "reaches the player": *"a mechanic the player must discover in order to
   * proceed is a defect"*, and the worked example is #627 — *"Awaiting
   * Materials"* was present the whole time, inside a fold that starts shut.
   */

  /** Spends the treasury down to `remainder` on planks, which no wall can use. */
  function prisonWith(remainder: number): SimulationRuntime {
    const runtime = createNewSimulationRuntime(SEED);
    const planks = (25_000 - remainder) / PLANK_PRICE;
    expect(Number.isInteger(planks), 'the fixture must spend a whole number of planks').toBe(true);
    send(runtime, { type: 'PurchaseMaterials', orderId: 'order-buy', itemId: PLANK, quantity: planks });
    expect(runtime.treasury.balanceMinorUnits).toBe(remainder);
    return runtime;
  }

  it('records the refusal on the press, keeps the order, and says how much is missing', () => {
    // 40 in the bank against a wall that costs 80.
    const runtime = prisonWith(40);

    send(runtime, { type: 'PlaceBuildOrder', orderId: 'order-a', definitionId: WALL, x: 4, y: 4 });

    // 1. The alert band, which is the channel that does not have to be opened.
    expect(runtime.refusals.last?.reason, 'the player is told on the press').toBe('purchase.insufficient-funds');
    expect(runtime.refusals.last?.tick).toBe(runtime.kernel.tick - 1);

    // 2. The treasury is untouched: a refused purchase spends nothing, and
    //    nothing joined the queue behind the fixture's own plank order.
    expect(runtime.treasury.balanceMinorUnits).toBe(40);
    expect(runtime.procurement.pendingDeliveries.map((delivery) => delivery.orderId)).toEqual(['order-buy']);

    // 3. The order is kept rather than thrown away, so the wall the player drew
    //    is still theirs when the money arrives.
    expect(runtime.construction.getOrder('order-a')?.state).not.toBe('failed');

    // 4. And the queue's own read model says *why* it is not moving, which is
    //    what `'materials-pending'` alone cannot: the same state means "the
    //    lorry is coming" for a funded order.
    step(runtime, 20);
    const view = projectBuildQueue(runtime.construction, {}, runtime.justInTimeMaterials);
    expect(view.materialsFunding).toEqual({
      unfunded: true,
      shortfallMinorUnits: WALL_COST,
      items: [{ itemId: BRICK, quantity: BRICKS_PER_WALL, costMinorUnits: WALL_COST }],
    });
    expect(view.orders.rows.map((row) => row.state), 'and the state alone would have said nothing').toEqual([
      'materials-pending',
    ]);
  });

  it('builds the order it could not afford, without a further press, once the money is back', () => {
    /*
     * The reason the order is kept rather than refused outright, and the
     * reason the just-in-time pass runs on the construction tick as well as on
     * the press. ADR 0017 decision 8 and ADR 0075 both say insolvency is a
     * state a prison digs out of; a queue that threw away the player's walls
     * on the way in would make digging out mean drawing them again.
     *
     * `CancelMaterialPurchase` is the money coming back — the one command in
     * the union that credits the treasury — so this needs no population and no
     * day boundary.
     */
    const runtime = prisonWith(40);
    send(runtime, { type: 'PlaceBuildOrder', orderId: 'order-a', definitionId: WALL, x: 4, y: 4 });
    expect(runtime.refusals.last?.reason).toBe('purchase.insufficient-funds');

    // Three scheduled construction ticks, and short of the fixture's own
    // delivery at tick 100 -- the refund below needs a purchase still in
    // flight, and `CancelMaterialPurchase` refuses one that has landed.
    step(runtime, 30);
    expect(runtime.construction.getOrder('order-a')?.state, 'still waiting, and still the player\'s').toBe(
      'materials-pending',
    );

    send(runtime, { type: 'CancelMaterialPurchase', orderId: 'order-buy' });
    expect(runtime.treasury.balanceMinorUnits).toBe(25_000);

    // No further `PlaceBuildOrder`. The scheduled pass is what buys.
    step(runtime, 4_000);
    expect(runtime.construction.getOrder('order-a')?.state).toBe('completed');
    expect(runtime.treasury.balanceMinorUnits).toBe(25_000 - WALL_COST);
    expect(projectBuildQueue(runtime.construction, {}, runtime.justInTimeMaterials).materialsFunding, 'and the shortfall stopped being reported').toEqual({
      unfunded: false,
      shortfallMinorUnits: 0,
      items: [],
    });
  });

  it('withdraws the standing refusal when the same purchase later succeeds', () => {
    // #492's supersession, on this route: a shortfall the player has since
    // fixed must not keep a notice on screen.
    const runtime = prisonWith(40);
    send(runtime, { type: 'PlaceBuildOrder', orderId: 'order-a', definitionId: WALL, x: 4, y: 4 });
    expect(runtime.refusals.last?.reason).toBe('purchase.insufficient-funds');

    send(runtime, { type: 'CancelMaterialPurchase', orderId: 'order-buy' });
    send(runtime, { type: 'PlaceBuildOrder', orderId: 'order-b', definitionId: WALL, x: 4, y: 5 });

    expect(runtime.refusals.last, 'the same item and quantity, bought this time').toBeUndefined();
    expect(runtime.refusals.count, 'the refusal happened, and the count says so').toBe(1);
  });
});

describe('what auto-procurement costs, measured rather than assumed', () => {
  it('makes ADR 0075\'s hard lock reachable by a drag gesture, and this is a finding for the owner', () => {
    /*
     * **ADR 0075 is about a prison that cannot afford its first bed**, and
     * `tests/integration/economy-liquidity-hard-lock.test.ts` pins the trap:
     * a balance below `PLANK_PRICE` with no plank in stock and nothing
     * plank-built to reverse can never earn another minor unit, because state
     * income needs a bed and a bed needs a plank. That file reaches it by one
     * deliberate press of a control — 625 bricks for exactly 25,000.
     *
     * Before this change a wall order cost nothing, so **no amount of
     * dragging could reach it**. It now can, and this case is the number:
     *
     *   floor(25,000 / 80) = 312 wall segments, leaving 40.
     *
     * 40 is *the same figure* ADR 0075's own second case calls out — *"a
     * positive balance on the status strip, and below the 65 that would end
     * this"*. So the trap is entered on wall 312, and the first thing the game
     * says about money is on wall **313**, when the prison is already locked.
     *
     * **This is reported, not designed around.** ADR 0075's three accepted
     * decisions — development grants at population thresholds, a balance that
     * may go negative with loans as the way out, and sell-back at a loss — are
     * the answer to it, and none of them is built. Doing anything else here
     * (a reserve floor, a refusal above some balance) would be deciding
     * economic policy inside implementation code.
     *
     * The gesture is 312 segments. The starter prison owns one 32x32 chunk,
     * whose bare perimeter is 128 segments, so 312 is two or three rooms'
     * worth of interior walls rather than an absurd figure.
     */
    const runtime = createNewSimulationRuntime(SEED);

    let funded = 0;
    let firstRefusedAt = -1;
    for (let index = 0; index < 320; index += 1) {
      const orderId = `order-${String(index).padStart(3, '0')}`;
      send(
        runtime,
        { type: 'PlaceBuildOrder', orderId, definitionId: WALL, x: 2 + (index % 28), y: 2 + Math.floor(index / 28) },
      );
      if (runtime.justInTimeMaterials.lastReport.unfunded.length === 0) funded += 1;
      else if (firstRefusedAt < 0) firstRefusedAt = index;
    }

    expect(funded, '25,000 / 80').toBe(312);
    expect(firstRefusedAt, 'zero-based, so the 313th wall is the first the game refuses to buy for').toBe(312);
    expect(runtime.treasury.balanceMinorUnits, 'and 40 is ADR 0075\'s own figure for the lock').toBe(40);
    expect(runtime.treasury.balanceMinorUnits).toBeLessThan(PLANK_PRICE);

    // The lock itself, confirmed rather than inferred: the one thing that
    // would restart the income line is refused.
    send(runtime, { type: 'PurchaseMaterials', orderId: 'order-plank', itemId: PLANK, quantity: 1 });
    expect(runtime.refusals.last?.reason).toBe('purchase.insufficient-funds');
    expect(runtime.treasury.balanceMinorUnits).toBe(40);
  });
});

describe('the money loop this must not create (ADR 0076)', () => {
  it('never credits the treasury on any build, undo, redo or remove route', () => {
    /*
     * ADR 0076 names the hazard in terms: a refund added to a removal that
     * leaves `materialsAllocated` populated is refunded a second time by a
     * subsequent `Undo`, *"value created from nothing"*. Just-in-time
     * procurement is the same hazard one step earlier — buy, cancel, refund,
     * buy — and the answer is that **there is no refund**: the money became
     * bricks, and `cancelOrder` gives the bricks back.
     *
     * `Treasury.credit` has exactly one caller in `src/`
     * (`ProcurementSystem.cancel`, pinned by
     * `tests/foundation/documentation-claims-contract.test.ts`), and no
     * command below reaches it. A spy is the whole assertion: if some future
     * change wires a refund here, this fails and sends its author to
     * `economy-money-conservation.test.ts` to prove the sum still holds.
     */
    const runtime = createNewSimulationRuntime(SEED);
    const creditSpy = vi.spyOn(runtime.treasury, 'credit');

    send(runtime, { type: 'PlaceBuildOrder', orderId: 'order-a', definitionId: WALL, x: 4, y: 4, transactionId: 'gesture-1' });
    const afterPlacing = runtime.treasury.balanceMinorUnits;
    expect(afterPlacing).toBe(25_000 - WALL_COST);

    // Round trip while the delivery is still in flight, which is the only
    // window in which a naive "cancel the purchase too" would do anything.
    send(runtime, { type: 'Undo' });
    expect(runtime.construction.getOrder('order-a')?.state).toBe('cancelled');
    send(runtime, { type: 'Redo' });
    send(runtime, { type: 'Undo' });

    expect(creditSpy, 'undo and redo must not refund a purchase').not.toHaveBeenCalled();
    expect(runtime.treasury.balanceMinorUnits).toBe(afterPlacing);

    // And past the delivery, where the bricks land whatever the order did.
    step(runtime, PROCUREMENT_DELIVERY_DELAY_TICKS + 20);
    expect(stockOf(runtime, BRICK), 'the money became bricks and the bricks are the prison\'s').toBe(BRICKS_PER_WALL);
    expect(creditSpy).not.toHaveBeenCalled();
    expect(runtime.treasury.balanceMinorUnits).toBe(afterPlacing);
  });

  it('does not buy a second time for an order that is undone and redone', () => {
    /*
     * The other direction of the same loop: a redo returns the order to
     * `'approved'`, so it is demand again. If the delivery it already paid for
     * were not netted off, every undo/redo pair would cost another 80 —
     * a money pump driven by one key (`KeyZ`).
     */
    const runtime = createNewSimulationRuntime(SEED);
    send(runtime, { type: 'PlaceBuildOrder', orderId: 'order-a', definitionId: WALL, x: 4, y: 4, transactionId: 'gesture-1' });
    const afterPlacing = runtime.treasury.balanceMinorUnits;

    for (let round = 0; round < 5; round += 1) {
      send(runtime, { type: 'Undo' });
      send(runtime, { type: 'Redo' });
      step(runtime, 12);
    }

    expect(runtime.treasury.balanceMinorUnits, 'five undo/redo rounds cost nothing').toBe(afterPlacing);
    step(runtime, 4_000);
    expect(runtime.construction.getOrder('order-a')?.state).toBe('completed');
    expect(runtime.treasury.balanceMinorUnits).toBe(afterPlacing);
  });
});

describe('a save taken mid-purchase', () => {
  it('does not re-buy what the restored session has already paid for', () => {
    /*
     * The restore case `justInTimePurchaseOrderId` is written for. A session
     * saved with a delivery in flight resumes at the tick it was saved on, and
     * the pending deliveries come back with it — so the deficit nets them off
     * and nothing is bought twice. The order finishes on the bricks the
     * *original* session paid for.
     *
     * This is also the answer to ADR 0038's question, stated as a
     * measurement: **no new field reaches `save-schema.ts` and
     * `SAVE_SCHEMA_VERSION` does not move**, because what an order is owed is
     * a function of the order book, the container and the pending deliveries,
     * and all three were already in the payload.
     */
    const runtime = createNewSimulationRuntime(SEED);
    send(runtime, { type: 'PlaceBuildOrder', orderId: 'order-a', definitionId: WALL, x: 4, y: 4 });
    step(runtime, 20);
    expect(runtime.procurement.pendingDeliveries, 'the save must be taken mid-flight for this to mean anything').toHaveLength(1);
    const spentBefore = 25_000 - runtime.treasury.balanceMinorUnits;

    const bundle = captureSessionSnapshot(runtime);
    const restored = restoreSimulationRuntime(bundle, SEED).runtime;

    expect(restored.treasury.balanceMinorUnits).toBe(runtime.treasury.balanceMinorUnits);
    expect(restored.procurement.pendingDeliveries).toHaveLength(1);

    step(restored, 4_000);
    expect(restored.construction.getOrder('order-a')?.state).toBe('completed');
    expect(25_000 - restored.treasury.balanceMinorUnits, 'the restored session paid nothing further').toBe(spentBefore);
    expect(spentBefore).toBe(WALL_COST);
  });
});
