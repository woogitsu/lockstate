import { describe, expect, it } from 'vitest';
import { PROCUREMENT_DELIVERY_DELAY_TICKS, procurableMaterial } from '../../src/content/procurement-catalog';
import { BUILDABLE_REGISTRY, createBuildOrder } from '../../src/simulation/construction';
import { JUST_IN_TIME_ORDER_ID_PREFIX, TREASURY_STARTING_BALANCE_MINOR_UNITS } from '../../src/simulation/economy';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { projectPendingDeliveries } from '../../src/simulation/presentation';
import {
  CONSTRUCTION_MATERIALS_CONTAINER_ID,
  createNewSimulationRuntime,
  type SimulationRuntime,
} from '../../src/simulation/runtime/new-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

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

/**
 * Ticks until every order has reached a terminal state, answering the tick it
 * happened on. `-1` if it never does, so a case that stops building fails on
 * the figure rather than hanging.
 */
function runToQuiet(runtime: SimulationRuntime, limit = 2_000): number {
  for (let index = 0; index < limit; index += 1) {
    runtime.kernel.step();
    if (runtime.construction.allOrders().every((order) => order.state === 'completed' || order.state === 'cancelled')) {
      return runtime.kernel.tick;
    }
  }
  return -1;
}

/**
 * A prison holding exactly 300, drained through the real *Buy* control.
 *
 * Planks and not bricks, and the choice is what makes the cases that use this
 * legible: no `wall-brick` order asks for `item.wood-plank`, so the drained
 * stock sits in the container without touching any brick demand or any brick
 * delivery. 380 at 65 is 24,700, and 25,000 - 24,700 is 300 -- a balance that
 * buys seven bricks and not eight.
 */
/**
 * A prison with **265 minor units of spending power left**, on planks no wall
 * can use.
 *
 * **This bought 380 planks and left 300 in the bank**, and 300 was the whole of
 * what it could spend while `Treasury`'s floor was zero. Since #703 ruling A
 * every session opens a standing overdraft of 2,500
 * ([ADR 0083](../../docs/adr/0083-what-opens-the-negative-balance-and-what-bounds-it.md)
 * §2), so a balance of 300 buys 2,800 of brick and the case below measured
 * nothing at all.
 *
 * 419 planks at 65 is 27,235 of the 27,500 a new prison can spend, leaving
 * **265** -- which is above the 240 that six bricks cost and below the 320 that
 * eight cost, exactly as 300 was. That window is the whole fixture; the balance
 * it corresponds to is -2,235 and is written out below rather than derived.
 */
function drainedPrison(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  send(runtime, { type: 'PurchaseMaterials', orderId: 'drain', itemId: 'item.wood-plank', quantity: 419 });
  step(runtime, PROCUREMENT_DELIVERY_DELAY_TICKS + 2);
  return runtime;
}

/** 25,000 - 419 x 65. 265 of the 2,500 facility is left. */
const DRAINED_BALANCE = -2_235;
/** `DRAINED_BALANCE` less six bricks at 40, which is 25 of room and below one more brick. */
const DRAINED_AFTER_SIX_BRICKS = -2_475;

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
  /**
   * **The sequence PR #693 left open on purpose, priced.**
   *
   * #693's own weakest claim, second half, in its words: *"a player who
   * presses **Buy** for bricks, then draws walls against that stock, then
   * cancels the Buy delivery, still sees the refund reversed by the next pass
   * -- correctly, since their walls genuinely need bricks the player took
   * away. The fold's sentence is still literally false in that sequence."*
   *
   * The case above (*"leaves the queue alone when the delivery was one the
   * player pressed Buy for"*) gates the withdrawal not happening. This gates
   * what the *player* is left holding once the pass has run, which is the half
   * the word "correctly" was asserting without a number behind it. Measured
   * through the same kernel, decoder and router:
   *
   * ```
   * cancel the Buy      25,000 -> 24,760, three walls, complete at tick 301
   * never cancel        25,000 -> 24,760, three walls, complete at tick 291
   * never buy at all    25,000 -> 24,760, three walls, complete at tick 291
   * ```
   *
   * So the reversal is exact rather than merely correct-in-direction: the
   * refund comes back and goes out again at the same price, the same three
   * segments stand, and the whole of what the cancellation cost is **ten
   * ticks** -- half a second -- of delivery delay restarted. That is what
   * makes the remainder copy: nothing about the outcome is wrong, and the only
   * false thing is a sentence.
   *
   * ## Why the absolute figure is asserted and not only the three-way equality
   *
   * Three runs of one implementation agree with each other for any
   * implementation, which is `docs/TESTING.md`'s both-sides-of-the-comparison
   * defect wearing a different hat. `24_760` is written from the figures the
   * first case in this file pins -- 25,000 open, 2 bricks a segment, 40 a
   * brick -- so a price change fails there rather than being absorbed here.
   */
  it('gives the money back and spends it again at the same price, and costs only the delivery delay', () => {
    const withCancel = createNewSimulationRuntime(SEED);
    send(withCancel, { type: 'PurchaseMaterials', orderId: 'buy-1', itemId: BRICK, quantity: 6 });
    placeWalls(withCancel, 3);
    expect(balanceOf(withCancel)).toBe(25_000 - 6 * 40);
    // The fold's promise, read at the moment the player would read it.
    expect(projectPendingDeliveries(withCancel.procurement).refundableMinorUnits).toBe(240);

    send(withCancel, { type: 'CancelMaterialPurchase', orderId: 'buy-1' });
    expect(balanceOf(withCancel)).toBe(25_000);

    const cancelledCompletedAt = runToQuiet(withCancel);
    const withoutCancel = createNewSimulationRuntime(SEED);
    send(withoutCancel, { type: 'PurchaseMaterials', orderId: 'buy-1', itemId: BRICK, quantity: 6 });
    placeWalls(withoutCancel, 3);
    const keptCompletedAt = runToQuiet(withoutCancel);

    const neverBought = createNewSimulationRuntime(SEED);
    placeWalls(neverBought, 3);
    const neverBoughtCompletedAt = runToQuiet(neverBought);

    // 3 segments at 2 bricks at 40: the same 240, whichever way the player got there.
    for (const runtime of [withCancel, withoutCancel, neverBought]) {
      expect(balanceOf(runtime)).toBe(24_760);
      expect(orderStates(runtime).completed).toBe(3);
    }

    // The one thing the cancellation did cost: a second delivery delay, begun
    // when the pass re-bought. Asserted as a bound and not as the measured 10,
    // because the exact figure is the construction schedule's cadence and not
    // this behaviour.
    expect(cancelledCompletedAt).toBeGreaterThan(keptCompletedAt);
    expect(cancelledCompletedAt - keptCompletedAt).toBeLessThan(PROCUREMENT_DELIVERY_DELAY_TICKS);
    expect(keptCompletedAt).toBe(neverBoughtCompletedAt);
  });

  /**
   * **What withdrawing on a player-bought cancellation as well would cost**,
   * measured rather than argued, because "deletes walls the player may not
   * expect" is the reason #693 gave for the `jit:` gate and it carried no
   * figure.
   *
   * The player buys more than the run needs, then changes their mind about the
   * stock. With the gate, the surplus is the player's to shed: the four spare
   * bricks are refunded and never re-bought, and the run still stands. The
   * withdrawal is invoked directly here -- the same public method the
   * `CancelMaterialPurchase` branch calls -- to show what the ungated shape
   * does to the same state, so the two outcomes are one arithmetic apart
   * rather than one code change apart.
   */
  it('would delete the whole run if a player-bought cancellation withdrew as well', () => {
    const runtime = createNewSimulationRuntime(SEED);
    send(runtime, { type: 'PurchaseMaterials', orderId: 'buy-1', itemId: BRICK, quantity: 10 });
    placeWalls(runtime, 3);
    // Ten bricks in flight against six of demand, so nothing just-in-time was
    // bought and the only delivery is the player's.
    expect(deliveryIds(runtime)).toEqual(['buy-1']);
    expect(balanceOf(runtime)).toBe(25_000 - 10 * 40);

    send(runtime, { type: 'CancelMaterialPurchase', orderId: 'buy-1' });
    expect(balanceOf(runtime)).toBe(25_000);
    expect(cancelled(runtime)).toBe(0);

    // **This is the ungated shape, run against the state the gate protected.**
    // Six bricks of demand against nothing held or coming, so the loop takes
    // every order in the run -- three walls gone because the player shed four
    // spare bricks.
    expect(runtime.construction.withdrawOrdersAwaitingMaterial(BRICK)).toHaveLength(3);
    expect(queued(runtime)).toBe(0);
  });

  /**
   * **Which segment actually disappears** -- #693's weakest claim, checked,
   * and since ADR 0082 (#722) closed rather than only checked.
   *
   * #693 claimed *"the back of the crew walk is the least surprising segment
   * to take"*, and named its own doubt: ids are `order-${crypto.randomUUID()}`,
   * so the greatest id is not the last segment drawn, and it guessed the
   * player would *"watch a segment vanish from somewhere in the middle of the
   * line"*.
   *
   * **This test asserted that defect until 2026-08-31**, under the name
   * *"takes whichever segment holds the greatest id, which can be the first one
   * drawn"*, with the same five ids and the same expectation reversed: the
   * withdrawn order was `order-ffff` at x = 4, the tile the player drew
   * **first**, at the far left of the row. Both halves of #693 were wrong and
   * the guess was wrong in the direction that mattered -- the greatest id is
   * uniformly distributed over a run, so the segment that went was as likely
   * to be either end as the middle, and the extreme case was reachable rather
   * than theoretical.
   *
   * **ADR 0082 is the persisted field `withdrawOrdersAwaitingMaterial`'s own
   * docblock said this needed**, so the back of the crew's walk is now the
   * back of the *player's* walk: the segment withdrawn is the one they drew
   * last, at the far right. Nothing in `withdrawOrdersAwaitingMaterial`
   * changed -- it still takes the last order in the walk -- which is why the
   * fix is a sort and not a special case.
   *
   * The case above (*"takes the back of the crew walk, which is the last id
   * and not the last drawn"*) gates the walk with ids that ascend *with*
   * placement, which is what makes the walk legible. This one gates what a
   * player sees when they do not, and the two are kept apart deliberately:
   * the first is about determinism and the second is about the row of tiles.
   *
   * **This needs no browser.** A build order carries its own `location`
   * (`src/simulation/construction/build-order.ts`), so which tile vanishes is
   * a fact about the order book and not about the renderer -- which is why
   * #693 could have settled it and did not.
   */
  it('takes the segment the player drew last, however its id sorts (#693, #722)', () => {
    const runtime = createNewSimulationRuntime(SEED);
    // Ids deliberately unordered against x, the way a UUID is. Placement is
    // left to right at x = 4..8, one drag down one row.
    const plan = [
      { id: 'order-ffff', x: 4 },
      { id: 'order-1111', x: 5 },
      { id: 'order-9999', x: 6 },
      { id: 'order-0000', x: 7 },
      { id: 'order-5555', x: 8 },
    ] as const;
    for (const { id, x } of plan) {
      send(runtime, { type: 'PlaceBuildOrder', orderId: id, definitionId: WALL, x, y: 4 });
    }

    const justInTime = deliveryIds(runtime).filter((id) => id.startsWith(JUST_IN_TIME_ORDER_ID_PREFIX));
    expect(justInTime).toHaveLength(5);
    send(runtime, { type: 'CancelMaterialPurchase', orderId: justInTime[0]! });

    const withdrawn = runtime.construction.allOrders().filter((order) => order.state === 'cancelled');
    expect(withdrawn).toHaveLength(1);
    // `order-5555` is the *smallest* id of the five and the tile the player
    // drew **last**, at the right end of the row. The id decides nothing; the
    // placement ordinal does.
    expect(withdrawn[0]!.id).toBe('order-5555');
    expect(withdrawn[0]!.location.x).toBe(8);
    expect(runtime.construction.getOrder('order-ffff')!.state).not.toBe('cancelled');
  });

  /**
   * The same five segments in an order book that carries no placement
   * ordinals, which is what a save written before ADR 0082 restores to.
   *
   * `docs/PERSISTENCE.md` requires that absence mean what the older build did,
   * and this is that claim made against the behaviour a player would see:
   * `order-ffff` goes, at the far left, exactly as the test above asserted
   * before the ADR. Built through `ConstructionSystem` directly rather than
   * through commands, because a command is precisely what stamps the ordinal.
   */
  it('still takes the greatest id when no order carries a placement ordinal', () => {
    const runtime = createNewSimulationRuntime(SEED);
    for (const { id, x } of [
      { id: 'order-ffff', x: 4 },
      { id: 'order-1111', x: 5 },
      { id: 'order-9999', x: 6 },
      { id: 'order-0000', x: 7 },
      { id: 'order-5555', x: 8 },
    ] as const) {
      runtime.construction.submitOrder(createBuildOrder(id, WALL, { x: tileCoordinate(x), y: tileCoordinate(4) }));
    }
    for (const order of runtime.construction.allOrders()) {
      expect(order.placementSequence).toBeUndefined();
    }

    // One pass of the scheduled purchase, so the queue has deliveries to
    // cancel -- the command route above did this on the press.
    runtime.kernel.step();
    const justInTime = deliveryIds(runtime).filter((id) => id.startsWith(JUST_IN_TIME_ORDER_ID_PREFIX));
    expect(justInTime.length).toBeGreaterThan(0);
    send(runtime, { type: 'CancelMaterialPurchase', orderId: justInTime[0]! });

    const withdrawn = runtime.construction.allOrders().filter((order) => order.state === 'cancelled');
    expect(withdrawn).toHaveLength(1);
    expect(withdrawn[0]!.id).toBe('order-ffff');
    expect(withdrawn[0]!.location.x).toBe(4);
  });

  /**
   * **The one place the remainder is not copy**, found by asking what the
   * reversal costs a prison that cannot afford it.
   *
   * `JustInTimeMaterialsService.procureForPendingOrders` buys the whole
   * per-item deficit in one `ProcurementSystem.purchase`, and `Treasury.spend`
   * refuses a purchase it cannot cover **entirely**. So a player-bought
   * delivery that was covering part of a queue is doing something the
   * scheduled pass cannot do for itself: it is a purchase already paid for at
   * a price the prison could once afford. Cancelling it hands the money back
   * and asks the pass to buy the *aggregate*, which it then cannot afford at
   * all.
   *
   * Measured, on a prison drained to **265 of spending power** through the Buy
   * control:
   *
   * ```
   * Buy 6 bricks, draw 4 walls (8 bricks), cancel the Buy   265 of room, 0 walls, 4 orders stalled for ever
   * the same prison that does not cancel                     25 of room, 3 walls, 1 order stalled
   * the same prison that never bought                        25 of room, 3 walls, 1 order stalled
   * ```
   *
   * **That table read *"300 held"* and *"60 held"* until #703 ruling A**, when
   * spending power and the balance stopped being the same number. The rows are
   * the same runs at the same relationship between the two prices; see
   * `drainedPrison` for the arithmetic that moved.
   *
   * **No money is lost and no promise is broken** -- the refund is not
   * reversed here, so the fold's sentence is true -- and the state is
   * recoverable: one `CancelBuildOrder` brings the demand under what 300 buys
   * and the pass funds the other three, reaching the non-cancelling outcome
   * exactly. What the player is not told is that they have to.
   *
   * **This asserts the behaviour as measured, and the behaviour is the open
   * question.** Whether the pass should buy what it can afford instead of
   * refusing the lump is an economy decision -- it converts liquidity into
   * stock, which is the trap
   * [ADR 0075](../../docs/adr/0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md)
   * is about -- and it is put up rather than taken. If it is ruled on, this
   * case changes, and it is written so that the change is visible rather than
   * silent.
   *
   * ## IT WAS RULED ON, AND THIS IS THE CHANGE
   *
   * **Everything above is kept exactly as it was written, because it is the
   * argument the owner ruled on and because the sentence directly above
   * promised this.** #703 ruling 9 chose partial fill -- *"kupować tyle, ile
   * stać"* -- and ruling 12 chose the ORDER as the unit
   * ([ADR 0081](../../docs/adr/0081-whether-a-purchase-may-be-partly-filled.md)
   * Decision 1 and 2). The table above now reads:
   *
   * ```
   * Buy 6 bricks, draw 4 walls (8 bricks), cancel the Buy    25 of room, 3 walls, 1 order stalled
   * the same prison that does not cancel                     25 of room, 3 walls, 1 order stalled
   * the same prison that never bought                        25 of room, 3 walls, 1 order stalled
   * ```
   *
   * **The asymmetry is gone: all three rows are the same row.** Cancelling a
   * delivery no longer leaves a prison richer in unspendable money and worse at
   * building, because the 265 it gets back now buys three whole wall orders at
   * 80 instead of being refused as one 320 lump. That is ADR 0081 Decision 1's
   * *"measured basis"*, and the number it predicted -- *"both branches then
   * reach three walls"* -- is what this case now measures.
   *
   * **And it costs the 240 the ADR's Consequences warn about.** The prison ends
   * at 25 of room rather than 265, which is below the 65 a plank costs. The
   * money went into wall that stands, so nothing is lost and the trade is the
   * one the ruling chose; what is *not* stated to the player anywhere is that
   * it happened. `MaterialsProcurementReport.purchased` carries it and
   * `projectBuildQueue` reads only `unfunded`, which ADR 0081 Decision 3 calls
   * a precondition and open question 2 leaves to the owner as copy.
   *
   * **The last press in this case is now redundant and is kept.** It used to be
   * *"the way back, which is one press and is nowhere stated"*; the way back is
   * no longer needed, and the press is asserted to change nothing, so the day
   * partial fill is reverted this line fails rather than quietly passing.
   */
  it('stalls a whole queue the prison can no longer fund in one lump, and one press undoes that', () => {
    const withCancel = drainedPrison();
    expect(balanceOf(withCancel)).toBe(DRAINED_BALANCE);
    send(withCancel, { type: 'PurchaseMaterials', orderId: 'buy-1', itemId: BRICK, quantity: 6 });
    const ids = placeWalls(withCancel, 4);
    expect(balanceOf(withCancel)).toBe(DRAINED_AFTER_SIX_BRICKS);

    send(withCancel, { type: 'CancelMaterialPurchase', orderId: 'buy-1' });
    expect(balanceOf(withCancel)).toBe(DRAINED_BALANCE);
    step(withCancel, PROCUREMENT_DELIVERY_DELAY_TICKS * 6);

    /*
     * **These four assertions read `0` completed, `4` queued, the whole
     * `DRAINED_BALANCE` untouched and an unfunded lump of 8 bricks at 320,
     * until #703 ruling 9.** Eight bricks at 40 is 320 and the prison can spend
     * 265, so the pass used to buy nothing at all. It now walks the four wall
     * orders and funds three of them whole -- 3 x 80 = 240 of the 265 -- and
     * leaves the fourth, which is the last one placed and, in this fixture
     * alone, also the last one in the walk: `placeWalls` mints
     * `order-000..order-003`, so ascending id happens to be placement order
     * here. A session mints `order-${crypto.randomUUID()}` and gets neither
     * (ADR 0081 Decision 2, ADR 0082).
     */
    expect(orderStates(withCancel).completed).toBe(3);
    expect(queued(withCancel)).toBe(1);
    expect(balanceOf(withCancel)).toBe(DRAINED_AFTER_SIX_BRICKS);
    expect(withCancel.justInTimeMaterials.lastReport.unfunded).toEqual([
      { itemId: BRICK, quantity: 2, costMinorUnits: 80 },
    ]);
    expect(withCancel.construction.getOrder('order-003')!.state).toBe('materials-pending');

    const withoutCancel = drainedPrison();
    send(withoutCancel, { type: 'PurchaseMaterials', orderId: 'buy-1', itemId: BRICK, quantity: 6 });
    placeWalls(withoutCancel, 4);
    step(withoutCancel, PROCUREMENT_DELIVERY_DELAY_TICKS * 6);

    // Three of the four stand, out of bricks bought before the money ran out.
    expect(orderStates(withoutCancel).completed).toBe(3);
    expect(balanceOf(withoutCancel)).toBe(DRAINED_AFTER_SIX_BRICKS);

    /*
     * **The way back, which used to be one press and nowhere stated.** It is no
     * longer needed -- the two branches already agree -- and the press is kept
     * so that it is asserted to change nothing. `ids[3]` is `order-003`, the
     * one order still stalled.
     */
    expect(ids[3]).toBe('order-003');
    send(withCancel, { type: 'CancelBuildOrder', orderId: ids[3]! });
    step(withCancel, PROCUREMENT_DELIVERY_DELAY_TICKS * 6);
    expect(orderStates(withCancel).completed).toBe(3);
    expect(balanceOf(withCancel)).toBe(DRAINED_AFTER_SIX_BRICKS);
    expect(balanceOf(withCancel), 'both branches now end in the same place').toBe(balanceOf(withoutCancel));
  });
});
