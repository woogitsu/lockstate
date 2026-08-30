import { describe, expect, it } from 'vitest';
import { PROCUREMENT_DELIVERY_DELAY_TICKS, procurableMaterial } from '../../src/content/procurement-catalog';
import { BUILDABLE_REGISTRY } from '../../src/simulation/construction';
import { JUST_IN_TIME_ORDER_ID_PREFIX, TREASURY_STARTING_BALANCE_MINOR_UNITS } from '../../src/simulation/economy';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { projectPendingDeliveries } from '../../src/simulation/presentation';
import {
  CONSTRUCTION_MATERIALS_CONTAINER_ID,
  createNewSimulationRuntime,
  type SimulationRuntime,
} from '../../src/simulation/runtime/new-session';

/**
 * **The money a player takes back stays back once the clock runs**
 * (issue [#687](https://github.com/matmaxalez/lockstate/issues/687)).
 *
 * ## What was measured, and by whom
 *
 * [The playtest record](../../docs/research/2026-08-30-playing-into-the-lock.md)
 * (PR #688) played into
 * [ADR 0075](../../docs/adr/0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md)'s
 * hard lock and found, in its §11, the one escape that ADR's table does not
 * have: with the clock
 * never started -- the state a new session arrives in -- a wall run is fully
 * refundable, and the procurement fold promises it first, *"15 bought - 1,200
 * back if cancelled"*. Cancelling really did refund: **23,800 -> 24,760**. And
 * then *"six seconds after pressing Play: 24,760 -> 23,800"*.
 *
 * Reproduced here at the runtime level before anything was changed, through
 * the real `Kernel`, the real `packCommand` decoder and the real session
 * command router -- fifteen segments, cancel every delivery, run the clock:
 *
 * ```
 * start                                        25000
 * after 15 wall-brick orders                   23800
 * after cancelling every pending delivery      24520
 * after 20 further ticks                       23800   stock 0, 15 orders still queued
 * ```
 *
 * The 24,520 rather than 25,000 is the same fact one tick earlier: a scheduled
 * construction pass ran *during* the cancellations and had already bought one
 * segment's bricks back before the last row was pressed.
 *
 * ## Why neither half was a defect
 *
 * `ProcurementSystem.cancel` refunds the recorded price of a delivery that has
 * not landed, exactly (#249), and #285 built the command that reaches it.
 * `ConstructionSystem.update` calls `procureQueuedMaterials` on every scheduled
 * tick, which is what lets a prison that cannot pay keep its walls and build
 * them when the money arrives (#627). What was missing is that cancelling the
 * *supply* left the *demand* standing, so the safety net answered the demand
 * and the refund was a transient nothing on screen described.
 *
 * ## What this file gates
 *
 * That `CancelMaterialPurchase` on a just-in-time delivery withdraws queued
 * orders until the prison no longer has to buy the material back -- **the
 * fewest such orders**, decided against what the prison holds and has coming
 * rather than against the cancelled quantity -- and that it withdraws nothing
 * at all when the delivery was one the player pressed *Buy* for.
 *
 * ## Why every figure is a literal
 *
 * `wall-brick` needs 2 `item.brick`, a brick is 40, a prison opens on 25,000.
 * A balance computed from a price this code read back off the catalogue would
 * agree with a refund of the wrong amount, which is the defect class
 * `docs/TESTING.md` records. The three are pinned in the first case.
 */

const SEED = 0x687;
const WALL = 'wall-brick';
const BRICK = 'item.brick';
/** One wall segment, all in: 2 bricks at 40. */
const WALL_COST = 80;

function send(runtime: SimulationRuntime, command: SimulationCommand): void {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`cmd-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  runtime.kernel.step();
}

function step(runtime: SimulationRuntime, count: number): void {
  for (let index = 0; index < count; index += 1) runtime.kernel.step();
}

/** Wall orders down one row, on distinct tiles, through the real command boundary. */
function placeWalls(runtime: SimulationRuntime, count: number): string[] {
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const orderId = `order-${String(index).padStart(3, '0')}`;
    ids.push(orderId);
    send(runtime, { type: 'PlaceBuildOrder', orderId, definitionId: WALL, x: 4 + index, y: 4 });
  }
  return ids;
}

const balanceOf = (runtime: SimulationRuntime): number => runtime.treasury.balanceMinorUnits;
const stockOf = (runtime: SimulationRuntime, itemId: string): number =>
  runtime.containers.require(CONSTRUCTION_MATERIALS_CONTAINER_ID).quantityOf(itemId);

const orderStates = (runtime: SimulationRuntime): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const order of runtime.construction.snapshot().orders) {
    counts[order.state] = (counts[order.state] ?? 0) + 1;
  }
  return counts;
};

/**
 * Orders still waiting on materials -- `'approved'` and `'materials-pending'`
 * counted together, because they are one scheduled construction tick apart and
 * which of the two an order is in depends only on how many ticks have passed
 * since the press. They are the same set `pendingMaterialDemand` sums and the
 * same set a withdrawal may take from, so counting them apart here would make
 * these cases assert the tick cadence instead of the queue.
 */
const queued = (runtime: SimulationRuntime): number =>
  runtime.construction
    .allOrders()
    .filter((order) => order.state === 'approved' || order.state === 'materials-pending').length;

const cancelled = (runtime: SimulationRuntime): number =>
  runtime.construction.allOrders().filter((order) => order.state === 'cancelled').length;

/** Every delivery in flight, in the order the procurement fold draws them. */
const deliveryIds = (runtime: SimulationRuntime): string[] =>
  projectPendingDeliveries(runtime.procurement, { limit: 1000 }).deliveries.rows.map((row) => row.orderId);

describe('a refund survives the clock (#687)', () => {
  it('pins the three figures every balance below is written from', () => {
    expect(TREASURY_STARTING_BALANCE_MINOR_UNITS).toBe(25_000);
    expect(BUILDABLE_REGISTRY.get(WALL)!.materialsRequired).toEqual([{ itemId: BRICK, quantity: 2 }]);
    expect(procurableMaterial(BRICK)!.unitPriceMinorUnits).toBe(40);
    expect(2 * 40).toBe(WALL_COST);
  });

  it('gives the whole wall run back, and running the clock does not take it away again', () => {
    const runtime = createNewSimulationRuntime(SEED);
    placeWalls(runtime, 15);

    // The measurement issue #687 opens with: fifteen segments, 1,200 spent.
    expect(balanceOf(runtime)).toBe(25_000 - 15 * WALL_COST);
    expect(balanceOf(runtime)).toBe(23_800);
    // And the fold's own promise, which is this sum: "1,200 back if cancelled".
    expect(projectPendingDeliveries(runtime.procurement).refundableMinorUnits).toBe(1_200);

    for (const id of deliveryIds(runtime)) send(runtime, { type: 'CancelMaterialPurchase', orderId: id });

    expect(balanceOf(runtime)).toBe(25_000);
    expect(runtime.procurement.pendingDeliveries).toHaveLength(0);
    // The demand went with the supply, which is the whole of the fix: nothing
    // is left queued to want bricks.
    expect(orderStates(runtime)).toEqual({ cancelled: 15 });

    // Twice `PROCUREMENT_DELIVERY_DELAY_TICKS`, so every scheduled construction
    // pass in that window has had its chance to buy the run back.
    step(runtime, PROCUREMENT_DELIVERY_DELAY_TICKS * 2);

    expect(balanceOf(runtime)).toBe(25_000);
    expect(runtime.procurement.pendingDeliveries).toHaveLength(0);
    expect(stockOf(runtime, BRICK)).toBe(0);
  });

  it('withdraws one segment per delivery cancelled, and leaves the rest of the run alone', () => {
    const runtime = createNewSimulationRuntime(SEED);
    placeWalls(runtime, 5);
    expect(balanceOf(runtime)).toBe(25_000 - 5 * WALL_COST);

    const [first] = deliveryIds(runtime);
    send(runtime, { type: 'CancelMaterialPurchase', orderId: first! });

    // Exactly one order withdrawn -- not the queue, and not none.
    expect(cancelled(runtime)).toBe(1);
    expect(queued(runtime)).toBe(4);
    expect(balanceOf(runtime)).toBe(25_000 - 4 * WALL_COST);
    expect(runtime.procurement.pendingDeliveries).toHaveLength(4);

    step(runtime, PROCUREMENT_DELIVERY_DELAY_TICKS);

    // The four that were not cancelled still get their bricks and still build:
    // the withdrawal took the demand it was answering and nothing beside it.
    expect(balanceOf(runtime)).toBe(25_000 - 4 * WALL_COST);
    expect(stockOf(runtime, BRICK) + 2 * (orderStates(runtime).completed ?? 0)).toBeGreaterThanOrEqual(2);
  });

  it('takes the back of the crew walk, which is the last id and not the last drawn', () => {
    const runtime = createNewSimulationRuntime(SEED);
    // `placeWalls` mints `order-000`, `order-001`, `order-002` in that order,
    // so ascending id and placement order coincide *here* and nowhere a player
    // is: `src/main.ts` mints `order-${crypto.randomUUID()}`. What is being
    // gated is the walk, and the fixture is what makes the walk legible.
    placeWalls(runtime, 3);

    const [first] = deliveryIds(runtime);
    send(runtime, { type: 'CancelMaterialPurchase', orderId: first! });

    // The greatest id: the work the crew's ascending-id walk reaches last, and
    // therefore the order it was furthest from starting. Withdrawing from the
    // front would take the one it is about to pick up.
    expect(runtime.construction.getOrder('order-002')!.state).toBe('cancelled');
    expect(runtime.construction.getOrder('order-000')!.state).not.toBe('cancelled');
    expect(runtime.construction.getOrder('order-001')!.state).not.toBe('cancelled');
  });

  it('never takes a segment the crew has already taken up', () => {
    const runtime = createNewSimulationRuntime(SEED);
    placeWalls(runtime, 3);
    // Far enough for the first delivery to land and the crew to pick the
    // lowest id up, and not far enough for it to finish.
    step(runtime, PROCUREMENT_DELIVERY_DELAY_TICKS + 10);

    const started = runtime.construction
      .allOrders()
      .filter((order) => order.state === 'in-progress' || order.state === 'assigned' || order.state === 'completed');
    expect(started.length).toBeGreaterThan(0);

    // Place one more, whose delivery is the only one still in flight.
    send(runtime, { type: 'PlaceBuildOrder', orderId: 'order-late', definitionId: WALL, x: 12, y: 4 });
    const inFlight = deliveryIds(runtime);
    expect(inFlight).toHaveLength(1);

    send(runtime, { type: 'CancelMaterialPurchase', orderId: inFlight[0]! });

    // The order the crew had already taken up is untouched -- it allocated its
    // materials, so it is not demand and it is not a candidate.
    for (const order of started) {
      expect(runtime.construction.getOrder(order.id)!.state).not.toBe('cancelled');
    }
    expect(runtime.construction.getOrder('order-late')!.state).toBe('cancelled');
  });

  it('leaves the queue alone when the delivery was one the player pressed Buy for', () => {
    const runtime = createNewSimulationRuntime(SEED);
    // Bought **first**, so the three walls placed after it find their bricks
    // already in flight and buy nothing of their own: every delivery here is
    // the player's, and the queue is standing entirely on the player's stock.
    send(runtime, { type: 'PurchaseMaterials', orderId: 'buy-1', itemId: BRICK, quantity: 6 });
    placeWalls(runtime, 3);

    expect(deliveryIds(runtime)).toEqual(['buy-1']);
    expect(balanceOf(runtime)).toBe(25_000 - 6 * 40);

    send(runtime, { type: 'CancelMaterialPurchase', orderId: 'buy-1' });

    // **The queue is untouched, and this is the case the `jit:` gate is for.**
    // Cancelling this delivery leaves a six-brick hole under three orders, so a
    // withdrawal that did not ask whose delivery it was would take all three --
    // deleting walls a player never said anything about because they changed
    // their mind about some stock. A delivery pressed for on the Build panel is
    // stock the player chose to hold; nothing in the queue is waiting on it by
    // name.
    expect(cancelled(runtime)).toBe(0);
    expect(queued(runtime)).toBe(3);
    expect(balanceOf(runtime)).toBe(25_000);

    step(runtime, 10);

    // And the safety net does what it is for: the walls still want bricks, so
    // they are bought again. That is not the #687 reversal -- no refund is
    // being undone here, because the money that came back was never the
    // queue's.
    expect(queued(runtime)).toBe(3);
    expect(balanceOf(runtime)).toBe(25_000 - 6 * 40);
  });

  it('withdraws nothing when what the prison already has coming covers the queue', () => {
    const runtime = createNewSimulationRuntime(SEED);
    placeWalls(runtime, 2);
    // Six bricks in flight against four bricks of demand: the queue is covered
    // twice over, and the just-in-time delivery is now surplus.
    send(runtime, { type: 'PurchaseMaterials', orderId: 'buy-1', itemId: BRICK, quantity: 6 });

    const justInTime = deliveryIds(runtime).filter((id) => id.startsWith(JUST_IN_TIME_ORDER_ID_PREFIX));
    expect(justInTime).toHaveLength(2);

    for (const id of justInTime) send(runtime, { type: 'CancelMaterialPurchase', orderId: id });

    // **This is the case the cancelled quantity gets wrong and the sink gets
    // right.** Four bricks of just-in-time supply were cancelled, so a rule
    // that withdrew demand equal to the cancelled quantity would have taken
    // both walls -- for nothing, because the player's own six bricks were
    // always going to build them.
    expect(cancelled(runtime)).toBe(0);
    expect(queued(runtime)).toBe(2);

    // Four delivery delays: `wall-brick` is `workRequired: 50` at 10 a
    // scheduled tick and the crew is one, so two segments take 100 ticks of
    // building after the bricks land.
    step(runtime, PROCUREMENT_DELIVERY_DELAY_TICKS * 4);

    // And nothing was bought back: the walls are built out of the stock the
    // player chose to hold, which is ADR 0017 decision 7's *"holding is
    // permitted, never required"* seen from the permitted side.
    expect(balanceOf(runtime)).toBe(25_000 - 6 * 40);
    expect(orderStates(runtime).completed).toBe(2);
  });

  it('leaves undo and redo with nothing to bring back', () => {
    const runtime = createNewSimulationRuntime(SEED);
    for (let index = 0; index < 3; index += 1) {
      send(runtime, {
        type: 'PlaceBuildOrder',
        orderId: `order-${index}`,
        definitionId: WALL,
        x: 4 + index,
        y: 4,
        transactionId: 'one-drag',
      });
    }

    for (const id of deliveryIds(runtime)) send(runtime, { type: 'CancelMaterialPurchase', orderId: id });
    expect(balanceOf(runtime)).toBe(25_000);
    expect(cancelled(runtime)).toBe(3);

    // **The withdrawal goes through `cancelOrder` and not through `undo()`**,
    // so nothing reaches `redoStack` and there is no route that returns a
    // withdrawn order to `'approved'` and has it bought for a second time. The
    // gesture is still on `undoStack`; `undo` finds every order in it already
    // terminal, skips them all, and pushes an empty redo transaction nowhere.
    send(runtime, { type: 'Undo' });
    send(runtime, { type: 'Redo' });

    expect(balanceOf(runtime)).toBe(25_000);
    expect(cancelled(runtime)).toBe(3);
    expect(queued(runtime)).toBe(0);

    step(runtime, PROCUREMENT_DELIVERY_DELAY_TICKS);
    expect(balanceOf(runtime)).toBe(25_000);
  });

  it('withdraws nothing when the cancellation itself was refused', () => {
    const runtime = createNewSimulationRuntime(SEED);
    placeWalls(runtime, 3);
    const [landed] = deliveryIds(runtime);
    step(runtime, PROCUREMENT_DELIVERY_DELAY_TICKS + 1);
    expect(runtime.procurement.pendingDeliveries).toHaveLength(0);

    const before = balanceOf(runtime);
    send(runtime, { type: 'CancelMaterialPurchase', orderId: landed! });

    // `cancel-purchase.not-pending`: no money came back, so there is no refund
    // for a withdrawal to protect, and the queue keeps every order it had.
    expect(balanceOf(runtime)).toBe(before);
    expect(orderStates(runtime).cancelled ?? 0).toBe(0);
  });
});
