import { describe, expect, it, vi } from 'vitest';
import { PROCUREMENT_DELIVERY_DELAY_TICKS, PROCURABLE_MATERIALS } from '../../src/content/procurement-catalog';
import { BUILDABLE_REGISTRY } from '../../src/simulation/construction';
import {
  INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS,
  TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS,
  TREASURY_STARTING_BALANCE_MINOR_UNITS,
} from '../../src/simulation/economy';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import {
  CONSTRUCTION_MATERIALS_CONTAINER_ID,
  createNewSimulationRuntime,
  type SimulationRuntime,
} from '../../src/simulation/runtime/new-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

/**
 * **Money is conserved across every build order a player can place and take
 * back** (issue #285).
 *
 * ## What #285 claimed, and what the measurement said
 *
 * #285's title is *"undoing a paid-for build order strands the money"*. Driven
 * end to end through `createNewSimulationRuntime`, the real `packCommand`
 * decoder and the real session command router, **the first half of that
 * sentence does not happen**: a build order is not paid for. `PlaceBuildOrder`
 * reaches `ConstructionSystem.submitOrder` and touches no `Treasury` on any
 * path — measured, and pinned below by "placing a build order debits nothing".
 *
 * What a player pays for is a *purchase*: `PurchaseMaterials` buys stock, and
 * `src/main.ts` mints it from its own Build-panel control (#282) with an
 * `orderId` of its own that no build order knows. The two are independent by
 * construction, which is exactly what #285's own analysis says under "Why this
 * is a `PurchaseMaterials` gap and not a `CancelBuildOrder` gap".
 *
 * So the money is not stranded. It bought bricks; the bricks are delivered;
 * `ConstructionSystem.cancelOrder` releases whatever the cancelled order had
 * allocated back into the container it came from (#97), and the stock stays in
 * the prison and stays usable by the next order. Value in, value out:
 *
 * ```
 * session start                    : balance=25000 stock=0 allocated=0 inFlight=0  total=25000
 * after PurchaseMaterials          : balance=24920 stock=0 allocated=0 inFlight=80 total=25000
 * after PlaceBuildOrder            : balance=24920 stock=0 allocated=0 inFlight=80 total=25000
 * after delivery + build completes : balance=24920 stock=0 allocated=2 inFlight=0  total=25000
 * after Undo                       : balance=24920 stock=2 allocated=0 inFlight=0  total=25000
 * after Redo                       : balance=24920 stock=0 allocated=2 inFlight=0  total=25000
 * after second Undo                : balance=24920 stock=2 allocated=0 inFlight=0  total=25000
 * ```
 *
 * ## Why this file exists rather than a refund
 *
 * Because the property above is currently true by accident of two systems not
 * knowing about each other, and nothing asserted it. The three resolutions
 * #285 lists are a product decision — ADR 0017 decision 5 decides no prices and
 * no balance values, and its "Consequences" section reserves *"whether
 * cancelling should also refund the money"* for #29. What can be settled
 * without deciding any of that is the **invariant any of the three has to
 * preserve**, so it is written down here and made to fail.
 *
 * The invariant is stated over *value*, not over the balance alone, because
 * the balance alone is not conserved and must not be: spending is how a
 * purchase works. What may never change is
 *
 * ```
 * balance + money paid for deliveries still in flight
 *         + (stock held) × unit price
 *         + (stock allocated to live build orders) × unit price
 *   ===  TREASURY_STARTING_BALANCE_MINOR_UNITS
 * ```
 *
 * exactly, in integer minor units, after every command and every tick.
 *
 * ## The failure mode this guards against, which is worse than #285
 *
 * A refund wired to build-order undo **creates money**, because the bricks come
 * back too. That is not a hypothetical: three mutations were run against this
 * file and each was reverted afterwards.
 *
 * | # | mutation | result |
 * | --- | --- | --- |
 * | M1 | `Undo` cancels every pending purchase (`procurement.cancel`) | **1 of 6 red** — "undoing a build order must not cancel a purchase it never made" |
 * | M2 | `Undo` credits the treasury for the materials the cancelled order released — #285's resolution 1, done naively | **3 of 6 red** — `balance=25000 total=25080`, value created |
 * | M3 | `cancelOrder` stops releasing materials (#97 reverted) | **3 of 6 red** — `balance=24760 total=24920`, value destroyed |
 *
 * M1 is the instructive one, and it is why the in-flight scenario exists.
 * `cancel` returns `false` once a delivery has landed, so on every scenario
 * where the wall was actually built the naive wiring is a silent no-op and the
 * conservation sum never moves — the only scenario that catches it is the one
 * where an undo lands while the delivery is still in the queue. A guard built
 * only from "buy, build, undo" would have let that wiring through.
 *
 * Every scenario also asserts that nothing credited the treasury at all.
 * `Treasury.credit` has exactly one caller in `src/` (`ProcurementSystem.cancel`,
 * pinned by `tests/foundation/documentation-claims-contract.test.ts`) and no
 * command in `simulationCommandSchema` reaches it, so a credit during a build /
 * undo / redo sequence means a producer was wired. If that is deliberate — a
 * purchase-cancel command, #285's resolution 2 — the conservation assertions are
 * the ones that say whether it was wired *correctly*, and this second assertion
 * is the one to revisit in the same change.
 */

const WALL = 'wall-brick';
const DOOR = 'door-wooden';

/** `itemId → unit price`, read from content rather than written down. */
const UNIT_PRICE = new Map(PROCURABLE_MATERIALS.map((m) => [m.itemId, m.unitPriceMinorUnits]));

function tile(x: number, y: number) {
  return { x: tileCoordinate(x), y: tileCoordinate(y) };
}

const WALL_REQUIREMENT = BUILDABLE_REGISTRY.get(WALL)!.materialsRequired[0]!;
const DOOR_REQUIREMENT = BUILDABLE_REGISTRY.get(DOOR)!.materialsRequired[0]!;

/**
 * Everything the prison owns, valued in minor units.
 *
 * Integer arithmetic throughout, and that is not a style preference:
 * `docs/DETERMINISM.md` puts simulation state under an integer rule with no
 * exception for money, and a conservation check that itself used floats could
 * report a violation that was only its own rounding. `expect(...).toBe` on
 * safe integers is exact.
 */
function prisonValueMinorUnits(runtime: SimulationRuntime): number {
  let total = runtime.treasury.balanceMinorUnits;

  // Paid for, not arrived. The money has left the treasury and the goods do
  // not exist yet, so without this term a save taken mid-flight would look
  // like a loss.
  for (const delivery of runtime.procurement.pendingDeliveries) total += delivery.paidMinorUnits;

  // Stock sitting in a container. Every container, not just the construction
  // one: a second container that materials could move into is exactly the
  // change that would make a one-container check start lying.
  for (const container of runtime.containers.all()) {
    for (const [itemId, price] of UNIT_PRICE) total += container.quantityOf(itemId) * price;
  }

  // Stock a live order has taken out of the container but not given back.
  // `ConstructionSystem` withdraws on allocation and only re-deposits on
  // cancellation, so between those two points the bricks are in neither the
  // treasury nor a container and are owned all the same.
  for (const order of runtime.construction.snapshot().orders) {
    for (const allocation of order.materialsAllocated) {
      total += allocation.quantity * (UNIT_PRICE.get(allocation.itemId) ?? 0);
    }
  }

  return total;
}

/** Drives the real command boundary: pack, submit, step. */
function createSession(seed = 7) {
  const runtime = createNewSimulationRuntime(seed);
  const creditSpy = vi.spyOn(runtime.treasury, 'credit');
  let sequence = 0;
  const trace: string[] = [];

  const conserved = (label: string): void => {
    const total = prisonValueMinorUnits(runtime);
    trace.push(
      `${label.padEnd(42)} balance=${String(runtime.treasury.balanceMinorUnits).padStart(5)}` +
        ` total=${String(total).padStart(5)}`,
    );
    expect(Number.isSafeInteger(runtime.treasury.balanceMinorUnits), `${label}: the balance left the integers`)
      .toBe(true);
    expect(Number.isSafeInteger(total), `${label}: the valuation left the integers`).toBe(true);
    // The last dozen lines of the trace, not the whole thing: a violation is
    // read backwards from where it appeared, and a run of two hundred
    // identical ticks in front of it buries the two lines that matter.
    expect(total, `${label}: value was created or destroyed\n${trace.slice(-12).join('\n')}`)
      .toBe(TREASURY_STARTING_BALANCE_MINOR_UNITS);
  };

  const send = (command: SimulationCommand, label: string): void => {
    runtime.kernel.submitCommand(`cmd-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
    sequence += 1;
    runtime.kernel.step();
    conserved(label);
  };

  const run = (ticks: number, label: string): void => {
    for (let step = 0; step < ticks; step += 1) {
      runtime.kernel.step();
      // Every tick, not only the last: a violation that opens and closes
      // inside a batch is exactly the kind a delivery landing on one tick and
      // an allocation happening ten ticks later could produce.
      conserved(`${label} (tick ${runtime.kernel.tick})`);
    }
  };

  /**
   * Steps until `predicate` holds, checking conservation on every tick, and
   * failing with the tail of the trace rather than silently running out of
   * ticks. A fixed tick count would have to encode `workRequired` and the
   * construction system's 10-tick schedule as a literal, and would start
   * passing vacuously the day either moved.
   */
  const runUntil = (predicate: () => boolean, label: string, limit = 2_000): void => {
    for (let step = 0; step < limit; step += 1) {
      if (predicate()) return;
      runtime.kernel.step();
      conserved(`${label} (tick ${runtime.kernel.tick})`);
    }
    expect.fail(`${label}: never happened within ${limit} ticks\n${trace.slice(-8).join('\n')}`);
  };

  const stateOf = (orderId: string): string | undefined => runtime.construction.getOrder(orderId)?.state;

  const buildUntilComplete = (orderIds: readonly string[], label: string): void =>
    runUntil(() => orderIds.every((id) => stateOf(id) === 'completed'), label);

  const buy = (orderId: string, itemId: string, quantity: number, label: string): void =>
    send({ type: 'PurchaseMaterials', orderId, itemId, quantity }, label);

  const place = (
    orderId: string,
    definitionId: string,
    x: number,
    y: number,
    transactionId: string,
    label: string,
  ): void => send({ type: 'PlaceBuildOrder', orderId, definitionId, x, y, edge: 'north', transactionId }, label);

  const undo = (label: string): void => send({ type: 'Undo' }, label);
  const redo = (label: string): void => send({ type: 'Redo' }, label);

  const stock = (itemId: string): number =>
    runtime.containers.getById(CONSTRUCTION_MATERIALS_CONTAINER_ID)!.quantityOf(itemId);

  return {
    runtime,
    creditSpy,
    conserved,
    send,
    run,
    runUntil,
    buildUntilComplete,
    stateOf,
    buy,
    place,
    undo,
    redo,
    stock,
    trace,
  };
}

describe('money is conserved across build orders and undo (#285)', () => {
  it('placing a build order buys exactly what it needs, and undoing it credits nothing', () => {
    /*
     * **This case has changed direction, and the old direction is kept in the
     * assertion message rather than deleted.** It used to read *"placing a
     * build order debits nothing, so there is no payment for an undo to
     * strand"*, and it carried its own tripwire: *"a build order now costs
     * money; whatever refunds it must be wired and asserted here"*. That
     * tripwire fired, on purpose, on the change that implemented ADR 0017
     * decision 7 (#627) -- a build order does now cost money, at the press,
     * because *"materials are just-in-time by default; holding is permitted,
     * never required"* and the code required holding.
     *
     * So this is that assertion answered rather than relaxed. The two halves
     * it demanded are both here:
     *
     * - **What it costs is exactly the catalogue price of what the order
     *   needs**, written as a literal product rather than read back off the
     *   purchase, so a wall that quietly started charging for three bricks
     *   fails here.
     * - **What refunds it is nothing, and that is the decision.** The money
     *   became bricks; `cancelOrder` gives the *bricks* back, not the money,
     *   and `Treasury.credit` is still never called on this route.
     *   `prisonValueMinorUnits` is what makes that a conservation statement
     *   rather than an excuse: the 80 has moved from `balance` to
     *   `paidMinorUnits` on a delivery in flight, and the total is unmoved.
     *
     * The undo lands **while the delivery is still in flight**, which is the
     * scenario the file header calls the only one that catches mutation M1 --
     * an undo that cancels a purchase it never made. It is now the ordinary
     * shape of an undo rather than a constructed one.
     */
    const session = createSession();
    session.conserved('session start');
    expect(session.runtime.treasury.balanceMinorUnits).toBe(TREASURY_STARTING_BALANCE_MINOR_UNITS);

    session.place('order-wall-1', WALL, 4, 6, 'build-1', 'after PlaceBuildOrder');

    const wallCost = UNIT_PRICE.get(WALL_REQUIREMENT.itemId)! * WALL_REQUIREMENT.quantity;
    expect(wallCost, 'the fixture is written from 2 bricks at 40').toBe(80);
    expect(
      session.runtime.treasury.balanceMinorUnits,
      'a build order costs the price of its materials, and nothing else',
    ).toBe(TREASURY_STARTING_BALANCE_MINOR_UNITS - wallCost);
    expect(session.stateOf('order-wall-1')).toBe('materials-pending');
    expect(
      session.runtime.procurement.pendingDeliveries.map((delivery) => [delivery.itemId, delivery.quantity, delivery.paidMinorUnits]),
      'placing an order buys the shortfall and nothing more',
    ).toEqual([[WALL_REQUIREMENT.itemId, WALL_REQUIREMENT.quantity, wallCost]]);

    session.undo('after Undo');
    expect(session.stateOf('order-wall-1')).toBe('cancelled');
    expect(
      session.runtime.treasury.balanceMinorUnits,
      'the money bought bricks; undoing the wall does not un-buy them',
    ).toBe(TREASURY_STARTING_BALANCE_MINOR_UNITS - wallCost);
    expect(session.creditSpy, 'undoing a build order must not credit anything').not.toHaveBeenCalled();

    // And the bricks really do arrive and stay the prison's, which is what
    // makes "no refund" a conservation statement and not a loss: `conserved`
    // ran on every tick inside `run`.
    session.run(PROCUREMENT_DELIVERY_DELAY_TICKS + 1, 'the cancelled order\'s delivery still lands');
    expect(session.stock(WALL_REQUIREMENT.itemId)).toBe(WALL_REQUIREMENT.quantity);
  });

  it('buys nothing for an order whose materials the player already holds', () => {
    /*
     * ADR 0017 decision 7's other half -- *"holding is permitted"* -- as a
     * measurement rather than a sentence. A player who pre-buys must see the
     * behaviour they had before #627: one purchase, at their own press, and
     * the order draws on it.
     *
     * The mutation that this catches and the case above does not: dropping the
     * `alreadyPaidForAndInFlight` term from the deficit, which double-buys
     * every order whose delivery has not landed yet.
     */
    const session = createSession();
    session.buy('order-buy-1', WALL_REQUIREMENT.itemId, WALL_REQUIREMENT.quantity, 'after PurchaseMaterials');
    const afterPurchase = session.runtime.treasury.balanceMinorUnits;

    session.place('order-wall-1', WALL, 4, 6, 'build-1', 'after PlaceBuildOrder');
    expect(session.runtime.treasury.balanceMinorUnits, 'the player already paid for these bricks').toBe(afterPurchase);
    expect(session.runtime.procurement.pendingDeliveries, 'and no second lorry was sent').toHaveLength(1);

    // Past the delivery and several construction ticks past it, because the
    // double-buy this guards against is a *repeat* on every scheduled tick.
    session.buildUntilComplete(['order-wall-1'], 'delivery and build');
    expect(session.runtime.treasury.balanceMinorUnits).toBe(afterPurchase);
    expect(session.stock(WALL_REQUIREMENT.itemId), 'the bricks are in the wall, not on the shelf').toBe(0);
  });

  it('undo, redo and undo again move the same bricks and never credit twice', () => {
    /*
     * The double-credit case, stated on both axes. The bricks going 2 → 0 → 2
     * is #97's guard and is not what this is about; what is new is that the
     * *money* does not move on any of the three, and that the total is 25000
     * at every one of them.
     *
     * Measured: mutation M2 above — an undo that credits the value of the
     * materials it released — takes this red on the first `Undo`, at
     * `balance=25000 total=25080`. Mutation M1 does **not**, because the
     * delivery has already landed by then and `cancel` returns `false`; the
     * in-flight scenario is what covers that one.
     */
    const session = createSession();
    session.buy('order-buy-1', WALL_REQUIREMENT.itemId, WALL_REQUIREMENT.quantity, 'after PurchaseMaterials');

    const afterPurchase = session.runtime.treasury.balanceMinorUnits;
    expect(afterPurchase, 'the fixture must actually have spent something').toBe(
      TREASURY_STARTING_BALANCE_MINOR_UNITS - UNIT_PRICE.get(WALL_REQUIREMENT.itemId)! * WALL_REQUIREMENT.quantity,
    );

    session.place('order-wall-1', WALL, 4, 6, 'build-1', 'after PlaceBuildOrder');
    session.buildUntilComplete(['order-wall-1'], 'delivery and build');
    expect(session.runtime.world.getTopEdge(tile(4, 6)), 'the wall must really exist').toBeGreaterThan(0);
    expect(session.stock(WALL_REQUIREMENT.itemId), 'the bricks are in the wall, not on the shelf').toBe(0);

    session.undo('after Undo');
    expect(session.stock(WALL_REQUIREMENT.itemId), 'undo returns the bricks').toBe(WALL_REQUIREMENT.quantity);
    expect(session.runtime.treasury.balanceMinorUnits, 'undo must not move money').toBe(afterPurchase);

    session.redo('after Redo');
    session.buildUntilComplete(['order-wall-1'], 'rebuild after redo');
    expect(session.stock(WALL_REQUIREMENT.itemId), 'redo spends the same bricks again').toBe(0);
    expect(session.runtime.treasury.balanceMinorUnits, 'redo must not move money').toBe(afterPurchase);

    session.undo('after second Undo');
    expect(
      session.stock(WALL_REQUIREMENT.itemId),
      'the second undo must return the same two bricks, never four',
    ).toBe(WALL_REQUIREMENT.quantity);
    expect(session.runtime.treasury.balanceMinorUnits, 'no undo may credit the treasury').toBe(afterPurchase);
    expect(session.creditSpy, 'undo → redo → undo credited the treasury').not.toHaveBeenCalled();
  });

  it('holds while a paid-for delivery is still in flight and the order is undone under it', () => {
    /*
     * #285 calls this the sharpest case, and it is the one where the money and
     * the goods are furthest apart: the treasury has paid, nothing has
     * arrived, and the order the player was buying for no longer exists. The
     * bricks still land, into stock, `PROCUREMENT_DELIVERY_DELAY_TICKS` after
     * the purchase — which is why the in-flight term is in the valuation
     * rather than the balance, and why the run below waits for the arrival
     * instead of stopping at the undo.
     */
    const session = createSession();
    session.buy('order-buy-1', WALL_REQUIREMENT.itemId, WALL_REQUIREMENT.quantity, 'purchased, in flight');
    session.place('order-wall-1', WALL, 4, 6, 'build-1', 'order placed');
    session.run(10, 'waiting on materials');
    expect(session.stateOf('order-wall-1')).toBe('materials-pending');
    expect(session.runtime.procurement.pendingDeliveries, 'the delivery must still be in flight').toHaveLength(1);

    session.undo('UNDO while the delivery is in flight');
    expect(session.stateOf('order-wall-1')).toBe('cancelled');
    expect(
      session.runtime.procurement.pendingDeliveries,
      'undoing a build order must not cancel a purchase it never made',
    ).toHaveLength(1);

    session.runUntil(
      () => session.stock(WALL_REQUIREMENT.itemId) === WALL_REQUIREMENT.quantity,
      'the delivery lands anyway',
    );
    expect(session.stock(WALL_REQUIREMENT.itemId), 'the bricks arrive as stock, not as nothing').toBe(
      WALL_REQUIREMENT.quantity,
    );
    expect(session.creditSpy).not.toHaveBeenCalled();
  });

  it('holds when gestures are undone in an order that is not the order they were placed in', () => {
    /*
     * Undo is a stack, so three gestures undone back to back already come off
     * in reverse. This interleaves instead — place A, place B, undo, place C,
     * undo, undo — so the cancellations land B, C, A against a placement order
     * of A, B, C, and one of them (A) is cancelled long after two later
     * gestures have come and gone.
     *
     * All three walls are on different tiles, so `remainingEdgeValue`'s
     * same-edge case is not what is under test here; what is, is that three
     * allocations and three releases against one container net to zero however
     * they are interleaved.
     */
    const session = createSession();
    const bricks = WALL_REQUIREMENT.quantity * 3;
    session.buy('order-buy-1', WALL_REQUIREMENT.itemId, bricks, 'bought three walls worth');
    session.runUntil(() => session.stock(WALL_REQUIREMENT.itemId) === bricks, 'delivery');
    expect(session.stock(WALL_REQUIREMENT.itemId)).toBe(bricks);
    const afterPurchase = session.runtime.treasury.balanceMinorUnits;

    session.place('order-wall-a', WALL, 4, 6, 'build-a', 'placed A');
    session.place('order-wall-b', WALL, 5, 6, 'build-b', 'placed B');
    session.buildUntilComplete(['order-wall-a', 'order-wall-b'], 'A and B build');
    session.undo('undo → cancels B');
    expect(session.stateOf('order-wall-b')).toBe('cancelled');
    expect(session.stateOf('order-wall-a')).toBe('completed');

    session.place('order-wall-c', WALL, 6, 6, 'build-c', 'placed C');
    session.buildUntilComplete(['order-wall-c'], 'C builds');
    session.undo('undo → cancels C');
    expect(session.stateOf('order-wall-c')).toBe('cancelled');

    session.undo('undo → cancels A, placed first and cancelled last');
    expect(session.stateOf('order-wall-a')).toBe('cancelled');

    expect(session.stock(WALL_REQUIREMENT.itemId), 'every brick is back on the shelf').toBe(bricks);
    expect(session.runtime.treasury.balanceMinorUnits).toBe(afterPurchase);
    expect(session.creditSpy).not.toHaveBeenCalled();
  });

  it('holds across two materials at two different prices bought and undone together', () => {
    /*
     * One price would let a conservation sum pass on a valuation that had the
     * price wrong in both directions at once. Bricks are 40 and planks are 65,
     * and a wall and a door are undone in one gesture apiece.
     */
    const session = createSession();
    session.buy('order-buy-1', WALL_REQUIREMENT.itemId, WALL_REQUIREMENT.quantity, 'bought bricks');
    session.buy('order-buy-2', DOOR_REQUIREMENT.itemId, DOOR_REQUIREMENT.quantity, 'bought planks');
    expect(
      session.runtime.treasury.balanceMinorUnits,
      'two materials at two prices must both have been charged',
    ).toBe(
      TREASURY_STARTING_BALANCE_MINOR_UNITS -
        UNIT_PRICE.get(WALL_REQUIREMENT.itemId)! * WALL_REQUIREMENT.quantity -
        UNIT_PRICE.get(DOOR_REQUIREMENT.itemId)! * DOOR_REQUIREMENT.quantity,
    );

    session.place('order-wall-1', WALL, 4, 6, 'build-wall', 'placed the wall');
    session.place('order-door-1', DOOR, 5, 6, 'build-door', 'placed the door');
    session.buildUntilComplete(['order-wall-1', 'order-door-1'], 'both deliver and build');

    session.undo('undo the door');
    session.undo('undo the wall');
    expect(session.stock(WALL_REQUIREMENT.itemId)).toBe(WALL_REQUIREMENT.quantity);
    expect(session.stock(DOOR_REQUIREMENT.itemId)).toBe(DOOR_REQUIREMENT.quantity);
    expect(session.creditSpy).not.toHaveBeenCalled();
  });

  it('holds when the purchase costs exactly the balance, which must be bought rather than refused', () => {
    /*
     * The affordability boundary, driven the way a player reaches it (#416).
     *
     * `Treasury.canAfford` ends in `amountMinorUnits <= this.balance`, and
     * nothing in the suite had ever spent the exact balance: changing that
     * `<=` to `<` left 238 files / 2,696 tests green. What it ships is a
     * prison that cannot spend its last coin -- the player is told
     * `purchase.insufficient-funds` for a purchase they can exactly afford.
     *
     * The quantity is computed from the catalogue price and the opening
     * balance rather than written down, so it stays *exact* if either moves;
     * and because "exact" is the whole point, the divisibility that makes it
     * exact is asserted first. Without that line a price of 30 would make this
     * case buy 833 bricks of the 833.33 it can afford and quietly stop testing
     * the boundary -- the fixture-cannot-reach-the-mechanism shape #375 is
     * about.
     */
    const price = UNIT_PRICE.get(WALL_REQUIREMENT.itemId)!;
    expect(
      TREASURY_STARTING_BALANCE_MINOR_UNITS % price,
      'the opening balance no longer divides by the unit price, so this case can no longer spend it exactly',
    ).toBe(0);
    const wholeBalance = TREASURY_STARTING_BALANCE_MINOR_UNITS / price;

    const session = createSession();
    session.buy('order-buy-everything', WALL_REQUIREMENT.itemId, wholeBalance, 'a purchase for the exact balance');

    expect(
      session.runtime.refusals.count,
      'a purchase the prison can exactly afford must not be refused',
    ).toBe(0);
    expect(session.runtime.treasury.balanceMinorUnits, 'the last coin was spent').toBe(0);
    expect(session.runtime.procurement.pendingDeliveries, 'the goods were ordered').toHaveLength(1);
    expect(session.runtime.procurement.pendingDeliveries[0]?.paidMinorUnits).toBe(
      TREASURY_STARTING_BALANCE_MINOR_UNITS,
    );

    /*
     * The other side of the same boundary -- and **since #703 ruling A the
     * boundary is not here.**
     *
     * This case used to end with *"one brick too many"* against the empty
     * treasury and assert `purchase.insufficient-funds`, on the ground that
     * `canAfford` ended in `amountMinorUnits <= this.balance`. It ends in
     * `this.balance - amountMinorUnits >= this.floor` and the floor is
     * `TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS` in every session, so a prison at
     * zero can buy 62 more bricks and the old probe measured nothing.
     *
     * **And it moved again with the owner's ruling 19 of 2026-08-31.** The
     * paragraph that stood here is kept, because it is the reason the probe is
     * where it is at all:
     *
     * > The exact boundary is now the *floor*, so the probe walks to it: spending
     * > power is 25,000 + 2,500 = 27,500, which is 681 bricks at 40 plus four
     * > planks at 65 to the minor unit.
     *
     * > ```
     * > const roomToTheFloor = TREASURY_STARTING_BALANCE_MINOR_UNITS - TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS;
     * > session.buy('order-buy-the-room', WALL_REQUIREMENT.itemId, 681 - wholeBalance, …);
     * > session.buy('order-buy-the-last-coin', DOOR_REQUIREMENT.itemId, 4, …);
     * > ```
     *
     * A `PurchaseMaterials` is ADR 0017 decision 8's **first** rung, and ruling
     * 19 gives that rung a threshold of its own at -1,250 (drafted as ADR 0017's
     * "Amendment, 2026-09-01"). So a press can no longer reach the floor, and
     * the exact boundary a *purchase* has is the first rung: spending power is
     * 25,000 + 1,250 = 26,250, which is 653 bricks at 40 plus two planks at 65
     * to the minor unit. The case is unchanged in every other respect -- the
     * purchase that lands exactly on the boundary must go through, the unit
     * after it must not, and the equation must not move either way.
     *
     * **What this case is *for* is the conservation equation, and the ruling
     * does not touch it.** An unpaid wage is arrears and not a destroyed minor
     * unit (ADR 0049), and a refused purchase debits nothing; `session.buy`
     * re-checks `total === 25,000` after every command below.
     */
    const roomToTheRung = TREASURY_STARTING_BALANCE_MINOR_UNITS - INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS;
    const plankPrice = UNIT_PRICE.get(DOOR_REQUIREMENT.itemId)!;
    expect(
      653 * price + 2 * plankPrice,
      'the two catalogue prices no longer reach the first rung exactly, so this case can no longer land on it',
    ).toBe(roomToTheRung);

    session.buy('order-buy-the-room', WALL_REQUIREMENT.itemId, 653 - wholeBalance, 'the rest of the room, in bricks');
    session.buy('order-buy-the-last-coin', DOOR_REQUIREMENT.itemId, 2, 'a purchase for the exact remaining room');
    expect(
      session.runtime.refusals.count,
      'a purchase that lands exactly on the first rung must not be refused either',
    ).toBe(0);
    expect(session.runtime.treasury.balanceMinorUnits, 'the last coin the rung allows was spent').toBe(
      INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS,
    );

    // One minor unit past it: still a refusal, and still no partial debit. The
    // treasury would carry 1,250 more -- the *floor* is at -2,500 and no rung
    // may pass it -- which is the ladder rather than a disagreement: the
    // command handler spends at the same `'deliveries'` rung this press is
    // judged by.
    session.buy('order-buy-one-more', WALL_REQUIREMENT.itemId, 1, 'one brick too many');
    expect(session.runtime.refusals.last?.reason).toBe('purchase.insufficient-funds');
    expect(session.runtime.treasury.balanceMinorUnits).toBe(INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS);
    expect(
      session.runtime.treasury.balanceMinorUnits - TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS,
      'and the deeper floor is untouched, with a rung between the press and it',
    ).toBe(1_250);
    expect(session.runtime.procurement.pendingDeliveries).toHaveLength(3);

    // And the conservation equation is unmoved by all of it: `session.buy`
    // checks it after every command, so the balance reaching zero is a
    // *transfer* into goods in flight rather than a loss.
    session.runUntil(
      () => session.stock(WALL_REQUIREMENT.itemId) === wholeBalance,
      'the whole balance arrives as bricks',
    );
    expect(session.creditSpy).not.toHaveBeenCalled();
  });

  it('holds while a cancelled just-in-time delivery takes its build orders with it (#687)', () => {
    /*
     * **The route #687 added, measured against the same equation.**
     *
     * `CancelMaterialPurchase` on a delivery `JustInTimeMaterialsService`
     * bought now does two things in one command: `ProcurementSystem.cancel`
     * credits the recorded price, and
     * `ConstructionSystem.withdrawOrdersAwaitingMaterial` takes the queued
     * orders that were waiting on it back off the book. Both halves move
     * value, and the hazard is that they move the *same* value twice --
     * which is mutation M2 in this file's header, seen from the other
     * direction: an undo that credits the money the materials it released are
     * worth.
     *
     * It cannot happen here and this case is what says so rather than the
     * argument that it cannot. Only `'approved'` and `'materials-pending'`
     * orders are candidates for withdrawal and neither has allocated
     * anything, so `cancelOrder`'s `release` moves nothing; the only value
     * that moves is the delivery's own `paidMinorUnits`, from `inFlight` back
     * to `balance`. `conserved` is checked after every command and on every
     * tick, so a release that did happen would show up as `total` above
     * 25,000 on the very command that caused it.
     */
    const session = createSession();

    session.place('order-a', WALL, 4, 4, 'run-1', 'segment 1');
    session.place('order-b', WALL, 5, 4, 'run-1', 'segment 2');
    session.place('order-c', WALL, 6, 4, 'run-1', 'segment 3');
    session.place('order-d', WALL, 7, 4, 'run-1', 'segment 4');

    const spent = 4 * WALL_REQUIREMENT.quantity * UNIT_PRICE.get(WALL_REQUIREMENT.itemId)!;
    expect(session.runtime.treasury.balanceMinorUnits).toBe(TREASURY_STARTING_BALANCE_MINOR_UNITS - spent);

    for (const delivery of [...session.runtime.procurement.pendingDeliveries]) {
      session.send(
        { type: 'CancelMaterialPurchase', orderId: delivery.orderId },
        `cancel ${delivery.orderId}`,
      );
    }

    // The refund is whole, the queue went with it, and the credit that
    // produced it is `ProcurementSystem.cancel`'s -- one per delivery, and no
    // more. A second producer wired anywhere on this route reads here as a
    // higher count long before the conservation sum notices.
    expect(session.runtime.treasury.balanceMinorUnits).toBe(TREASURY_STARTING_BALANCE_MINOR_UNITS);
    expect(session.creditSpy).toHaveBeenCalledTimes(4);
    for (const id of ['order-a', 'order-b', 'order-c', 'order-d']) {
      expect(session.stateOf(id), `${id} was still queued to be bought for`).toBe('cancelled');
    }

    // Twice the delivery delay, conservation checked on every one of them: the
    // scheduled procurement pass has had every chance to buy the run back, and
    // #687 is the measurement that it used to.
    session.run(PROCUREMENT_DELIVERY_DELAY_TICKS * 2, 'the clock runs on an empty queue');
    expect(session.runtime.treasury.balanceMinorUnits).toBe(TREASURY_STARTING_BALANCE_MINOR_UNITS);
    expect(session.creditSpy).toHaveBeenCalledTimes(4);
  });

  it('holds when a purchase is refused, and when undo is pressed with nothing to undo', () => {
    /*
     * The two no-op edges. A refused purchase must leave the equation exactly
     * where it was — `Treasury.spend` refuses rather than overdrawing — and an
     * undo with an empty stack must not reach for a transaction that is not
     * there. Both are cheap to get wrong in the direction of a partial write.
     */
    const session = createSession();
    session.undo('undo with an empty stack');
    session.redo('redo with an empty stack');

    session.buy('order-buy-broke', WALL_REQUIREMENT.itemId, 100_000, 'a purchase nothing could cover');
    expect(session.runtime.treasury.balanceMinorUnits, 'a refused purchase must not spend').toBe(
      TREASURY_STARTING_BALANCE_MINOR_UNITS,
    );
    expect(session.runtime.procurement.pendingDeliveries).toHaveLength(0);
    expect(session.runtime.refusals.count, 'the refusal must have reached the player').toBeGreaterThan(0);
    expect(session.creditSpy).not.toHaveBeenCalled();
  });
});
