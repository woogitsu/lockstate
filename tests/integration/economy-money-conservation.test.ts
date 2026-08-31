import { describe, expect, it, vi } from 'vitest';
import { PROCUREMENT_DELIVERY_DELAY_TICKS, PROCURABLE_MATERIALS } from '../../src/content/procurement-catalog';
import { BUILDABLE_REGISTRY } from '../../src/simulation/construction';
import {
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

  /**
   * What the game has deliberately consumed, and the only thing the equation
   * below is allowed to be short by.
   *
   * **Added for the owner's ruling 20 of 2026-08-31** (ADR 0076's amendment of
   * that date): cancelling an order the crew has already started returns
   * nothing at all, so its allocated materials are neither released nor paid
   * for and value really does leave the prison. That is the ruling rather than
   * a leak -- if the materials came back in either currency, cancelling late
   * would cost nothing and *"pieniądze dopóki ekipa nie zaczęła"* would be a
   * distinction without a difference.
   *
   * **It is raised by the caller and never by the code under test**, from the
   * buildable catalogue and the procurement catalogue, so this stays a check
   * and does not become a fixture that agrees with any implementation
   * (`docs/TESTING.md`). A cancellation that consumed the wrong amount, or
   * consumed anything in a state ruling 20 pays for, still fails here.
   */
  let consumedMinorUnits = 0;

  const conserved = (label: string): void => {
    const total = prisonValueMinorUnits(runtime);
    trace.push(
      `${label.padEnd(42)} balance=${String(runtime.treasury.balanceMinorUnits).padStart(5)}` +
        ` total=${String(total).padStart(5)}` +
        (consumedMinorUnits === 0 ? '' : ` consumed=${String(consumedMinorUnits)}`),
    );
    expect(Number.isSafeInteger(runtime.treasury.balanceMinorUnits), `${label}: the balance left the integers`)
      .toBe(true);
    expect(Number.isSafeInteger(total), `${label}: the valuation left the integers`).toBe(true);
    // The last dozen lines of the trace, not the whole thing: a violation is
    // read backwards from where it appeared, and a run of two hundred
    // identical ticks in front of it buries the two lines that matter.
    expect(total, `${label}: value was created or destroyed\n${trace.slice(-12).join('\n')}`)
      .toBe(TREASURY_STARTING_BALANCE_MINOR_UNITS - consumedMinorUnits);
  };

  /** Says what the next press is expected to consume for good, before it is pressed. */
  const expectConsumption = (amountMinorUnits: number): void => {
    consumedMinorUnits += amountMinorUnits;
  };

  const send = (command: SimulationCommand, label: string): void => {
    runtime.kernel.submitCommand(`cmd-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
    sequence += 1;
    runtime.kernel.step();
    conserved(label);
  };

  /**
   * Several commands at one tick, dispatched before any system runs.
   *
   * The only way to observe a cancellation of an `'approved'` order through
   * the real command boundary: a `PlaceBuildOrder` reaches
   * `'materials-pending'` inside the very step that dispatched it, so a
   * `CancelBuildOrder` sent afterwards can never find the order in the state
   * `submitOrder` wrote. Two commands at the same tick can, and it is an
   * ordinary gesture -- placing a wall and taking it back before the clock
   * has moved.
   */
  const sendAtOneTick = (commands: readonly SimulationCommand[], label: string): void => {
    const tick = runtime.kernel.tick;
    for (const command of commands) {
      runtime.kernel.submitCommand(`cmd-${sequence}`, sequence, tick, packCommand(command));
      sequence += 1;
    }
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

  const cancel = (orderId: string, label: string): void => send({ type: 'CancelBuildOrder', orderId }, label);

  const runUntilState = (orderId: string, state: string, label: string): void =>
    runUntil(() => stateOf(orderId) === state, `${label} (waiting for ${state})`);

  return {
    runtime,
    creditSpy,
    conserved,
    expectConsumption,
    sendAtOneTick,
    cancel,
    runUntilState,
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
  it('placing a build order buys exactly what it needs, and undoing it takes the money back', () => {
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
     *
     * **THE SECOND BULLET REVERSED ON 2026-08-31 AND IS KEPT BECAUSE IT IS
     * WHAT THE RULING CHANGED.** The owner's ruling 20 -- *"Anulowanie zwraca
     * pieniądze zamiast cegieł"*, ADR 0076's amendment of that date -- makes
     * the refund **money**, and the undo below now takes the 80 back rather
     * than leaving it on the road. Two things about that bullet survive
     * exactly:
     *
     * - *"`prisonValueMinorUnits` is what makes that a conservation statement
     *   rather than an excuse"*. It still does, and it is the whole reason this
     *   case is safe: the 80 moves from `paidMinorUnits` back into `balance`,
     *   and the total is unmoved. Mutation M1 -- *"undo cancels every pending
     *   purchase"* -- is **not** what shipped and is still caught: what is
     *   cancelled is the surplus of the *build queue's own* deliveries, so a
     *   delivery the player bought with `PurchaseMaterials` survives an undo,
     *   which the case *"an undo must not cancel a purchase the player made"*
     *   below pins directly.
     * - The first bullet, about what an order costs, is untouched.
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
      'the wall had not started, so the money comes back (ruling 20)',
    ).toBe(TREASURY_STARTING_BALANCE_MINOR_UNITS);
    expect(
      session.creditSpy.mock.calls.map(([amount]) => amount),
      'exactly one credit, of exactly the delivery that was cancelled',
    ).toEqual([wallCost]);
    expect(session.runtime.procurement.pendingDeliveries, 'and the lorry was turned around').toHaveLength(0);

    // Nothing arrives afterwards either, which is what makes the refund
    // survive the clock rather than being reversed by the next scheduled
    // purchase pass -- #687's failure mode in the opposite direction.
    session.run(PROCUREMENT_DELIVERY_DELAY_TICKS + 40, 'the refund survives the clock');
    expect(session.stock(WALL_REQUIREMENT.itemId), 'no bricks, because none were paid for').toBe(0);
    expect(session.runtime.treasury.balanceMinorUnits).toBe(TREASURY_STARTING_BALANCE_MINOR_UNITS);
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
     * The exact boundary is now the *floor*, so the probe walks to it: spending
     * power is 25,000 + 2,500 = 27,500, which is 681 bricks at 40 plus four
     * planks at 65 to the minor unit. That purchase must go through -- a prison
     * that cannot spend its last coin is the defect this case exists for, and
     * the coin is now the last of the facility -- and the brick after it must
     * not.
     */
    const roomToTheFloor = TREASURY_STARTING_BALANCE_MINOR_UNITS - TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS;
    const plankPrice = UNIT_PRICE.get(DOOR_REQUIREMENT.itemId)!;
    expect(
      681 * price + 4 * plankPrice,
      'the two catalogue prices no longer reach the floor exactly, so this case can no longer land on it',
    ).toBe(roomToTheFloor);

    session.buy('order-buy-the-room', WALL_REQUIREMENT.itemId, 681 - wholeBalance, 'the rest of the room, in bricks');
    session.buy('order-buy-the-last-coin', DOOR_REQUIREMENT.itemId, 4, 'a purchase for the exact remaining room');
    expect(
      session.runtime.refusals.count,
      'a purchase that lands exactly on the floor must not be refused either',
    ).toBe(0);
    expect(session.runtime.treasury.balanceMinorUnits, 'the last coin of the facility was spent').toBe(
      TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS,
    );

    // One minor unit past it, on a facility that is now empty: still a refusal,
    // and still no partial debit.
    session.buy('order-buy-one-more', WALL_REQUIREMENT.itemId, 1, 'one brick too many');
    expect(session.runtime.refusals.last?.reason).toBe('purchase.insufficient-funds');
    expect(session.runtime.treasury.balanceMinorUnits).toBe(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS);
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

/**
 * **Cancelling in every state the owner's ruling 20 of 2026-08-31 names**
 * (ADR 0076's amendment of that date, which awaits the owner's signature).
 *
 * The two rulings are *"Anulowanie zwraca pieniądze zamiast cegieł"* and
 * *"Pieniądze dopóki ekipa nie zaczęła"*: money instead of bricks, and money
 * only until the crew has started. Against `BuildOrderLifecycleState` that is a
 * refund for `planned`, `approved`, `materials-pending` and `assigned`, and
 * nothing for `in-progress`.
 *
 * ADR 0076 decision B made a conservation test over this non-optional and this
 * is it, inherited in the new currency. Every case below runs the same
 * `conserved` check on every command and every tick as the rest of this file,
 * so what each one adds on top is the *distribution*: which of the treasury,
 * the stock, the in-flight deliveries and the allocation the value ended up in.
 *
 * **The one state whose value does not come back is `in-progress`, and it is
 * declared before the press rather than measured after it.** See
 * `expectConsumption`.
 */
describe('cancelling a build order in each of the states ruling 20 names (ADR 0076 amendment)', () => {
  const wallCost = UNIT_PRICE.get(WALL_REQUIREMENT.itemId)! * WALL_REQUIREMENT.quantity;

  it('refunds nothing for a planned order, because nothing was ever bought for one', () => {
    /*
     * `'planned'` is the state `createBuildOrder` writes and `submitOrder`
     * immediately leaves -- it writes `'approved'` or `'failed'` -- so it is
     * reachable only from a restored save, which is exactly how this reaches
     * it. `pendingOrderDemand` does not count a planned order, so no
     * just-in-time purchase is ever made for one: there is no money to give
     * back, and a refund that produced any would be inventing it.
     *
     * This is the one of the five states whose *behaviour* ruling 20 does not
     * change. It is here because the ruling names it, and because "the refund
     * is zero" is a claim that has to be measured rather than assumed.
     */
    const session = createSession();
    const before = session.runtime.construction.snapshot();
    session.runtime.construction.restore({
      ...before,
      orders: [
        ...before.orders,
        {
          id: 'order-planned',
          definitionId: WALL,
          location: tile(6, 6),
          edge: 'north',
          state: 'planned',
          progress: 0,
          materialsAllocated: [],
        },
      ],
    });
    session.conserved('a planned order restored into the book');
    expect(session.stateOf('order-planned')).toBe('planned');

    session.cancel('order-planned', 'cancel a planned order');
    expect(session.stateOf('order-planned')).toBe('cancelled');
    expect(session.runtime.treasury.balanceMinorUnits).toBe(TREASURY_STARTING_BALANCE_MINOR_UNITS);
    expect(session.creditSpy, 'nothing was spent on it, so nothing may be refunded').not.toHaveBeenCalled();
    expect(session.stock(WALL_REQUIREMENT.itemId), 'and no bricks were conjured either').toBe(0);
  });

  it('refunds the money for an approved order, in the same tick it was placed', () => {
    /*
     * The state a `PlaceBuildOrder` writes, and the only way to observe a
     * cancellation in it: `update` promotes `'approved'` to
     * `'materials-pending'` inside the step that dispatched the placement, so
     * both commands go in at one tick. As a gesture it is placing a wall and
     * taking it straight back.
     *
     * The money is in a delivery on the road -- the press bought it -- and the
     * refund is that delivery being turned around.
     */
    const session = createSession();
    session.sendAtOneTick(
      [
        { type: 'PlaceBuildOrder', orderId: 'order-wall-1', definitionId: WALL, x: 4, y: 6, edge: 'north', transactionId: 'build-1' },
        { type: 'CancelBuildOrder', orderId: 'order-wall-1' },
      ],
      'place and cancel at one tick',
    );

    expect(session.stateOf('order-wall-1')).toBe('cancelled');
    expect(session.runtime.treasury.balanceMinorUnits, 'the whole 80 came back').toBe(
      TREASURY_STARTING_BALANCE_MINOR_UNITS,
    );
    expect(session.creditSpy.mock.calls.map(([amount]) => amount)).toEqual([wallCost]);
    expect(session.runtime.procurement.pendingDeliveries).toHaveLength(0);

    session.run(PROCUREMENT_DELIVERY_DELAY_TICKS + 40, 'nothing arrives and nothing is re-bought');
    expect(session.stock(WALL_REQUIREMENT.itemId)).toBe(0);
    expect(session.runtime.treasury.balanceMinorUnits).toBe(TREASURY_STARTING_BALANCE_MINOR_UNITS);
  });

  it('refunds the money for a materials-pending order while its delivery is still on the road', () => {
    const session = createSession();
    session.place('order-wall-1', WALL, 4, 6, 'build-1', 'place the wall');
    expect(session.stateOf('order-wall-1')).toBe('materials-pending');
    expect(session.runtime.procurement.pendingDeliveries, 'its own delivery, in flight').toHaveLength(1);

    session.cancel('order-wall-1', 'cancel while materials-pending');
    expect(session.stateOf('order-wall-1')).toBe('cancelled');
    expect(session.runtime.treasury.balanceMinorUnits).toBe(TREASURY_STARTING_BALANCE_MINOR_UNITS);
    expect(session.creditSpy.mock.calls.map(([amount]) => amount)).toEqual([wallCost]);
    expect(session.runtime.procurement.pendingDeliveries).toHaveLength(0);
  });

  it('refunds the money for an assigned order and does not put its bricks back on the shelf', () => {
    /*
     * The state where the money is no longer money: the delivery landed, and
     * `tryAllocate` withdrew the bricks from the container into the order. The
     * refund therefore has to come out of the *materials*, valued at the
     * catalogue price -- and the thing that must not happen is both, which is
     * the one-press value creation ADR 0076's amendment names. `conserved`
     * catches that directly: paying 80 while also depositing two bricks reads
     * as 25,080.
     */
    const session = createSession();
    session.place('order-wall-1', WALL, 4, 6, 'build-1', 'place the wall');
    session.runUntilState('order-wall-1', 'assigned', 'wait for the bricks to be allocated');

    expect(session.runtime.construction.getOrder('order-wall-1')?.materialsAllocated).toEqual([
      { itemId: WALL_REQUIREMENT.itemId, quantity: WALL_REQUIREMENT.quantity },
    ]);
    expect(session.stock(WALL_REQUIREMENT.itemId), 'the bricks are the order\'s, not the shelf\'s').toBe(0);

    session.cancel('order-wall-1', 'cancel while assigned');
    expect(session.stateOf('order-wall-1')).toBe('cancelled');
    expect(session.runtime.construction.getOrder('order-wall-1')?.materialsAllocated).toEqual([]);
    expect(session.runtime.treasury.balanceMinorUnits, 'the catalogue value of what it held').toBe(
      TREASURY_STARTING_BALANCE_MINOR_UNITS,
    );
    expect(session.creditSpy.mock.calls.map(([amount]) => amount)).toEqual([wallCost]);
    expect(
      session.stock(WALL_REQUIREMENT.itemId),
      'money instead of bricks: the bricks must not also come back',
    ).toBe(0);
  });

  it('gives nothing back for an in-progress order, and the materials are gone for good', () => {
    /*
     * *"Pieniądze dopóki ekipa nie zaczęła"*. The crew has started, so nothing
     * comes back in either currency and the allocation is consumed. This is the
     * only press in the game that destroys value, and the consumption is
     * declared from the catalogue before it happens so that `conserved` is
     * still an equation and not an exemption.
     */
    const session = createSession();
    session.place('order-wall-1', WALL, 4, 6, 'build-1', 'place the wall');
    session.runUntilState('order-wall-1', 'in-progress', 'wait for the crew to start');
    expect(session.runtime.treasury.balanceMinorUnits).toBe(TREASURY_STARTING_BALANCE_MINOR_UNITS - wallCost);

    session.expectConsumption(wallCost);
    session.cancel('order-wall-1', 'cancel while in-progress');

    expect(session.stateOf('order-wall-1')).toBe('cancelled');
    expect(session.runtime.construction.getOrder('order-wall-1')?.materialsAllocated).toEqual([]);
    expect(session.creditSpy, 'the crew had started, so no money comes back').not.toHaveBeenCalled();
    expect(session.stock(WALL_REQUIREMENT.itemId), 'and no bricks either').toBe(0);
    expect(session.runtime.treasury.balanceMinorUnits, 'the 80 stays spent').toBe(
      TREASURY_STARTING_BALANCE_MINOR_UNITS - wallCost,
    );
    expect(session.runtime.world.getTopEdge(tile(4, 6)), 'and no wall was left standing').toBe(0);

    session.run(60, 'and nothing brings it back later');
    expect(session.runtime.treasury.balanceMinorUnits).toBe(TREASURY_STARTING_BALANCE_MINOR_UNITS - wallCost);
  });

  it('leaves a completed order alone: undoing a finished wall still returns its bricks (ADR 0076 decision B)', () => {
    /*
     * The state ruling 20 does **not** reach, asserted here rather than left to
     * be inferred from silence. Decision B is accepted and says a finished
     * object un-builds into its full materials; the amendment leaves it
     * standing and marks the question B governs and ruling 20 does not answer
     * -- `RemoveObject` on a completed object -- as the owner's.
     *
     * It is also the inversion the amendment reports: cancel at
     * `'in-progress'` and the bricks are gone, wait for `'completed'` and they
     * all come back.
     */
    const session = createSession();
    session.place('order-wall-1', WALL, 4, 6, 'build-1', 'place the wall');
    session.buildUntilComplete(['order-wall-1'], 'build it');
    expect(session.runtime.world.getTopEdge(tile(4, 6))).toBeGreaterThan(0);

    session.cancel('order-wall-1', 'cancel a completed order');
    expect(session.stock(WALL_REQUIREMENT.itemId), 'decision B: the full materials').toBe(
      WALL_REQUIREMENT.quantity,
    );
    expect(session.creditSpy, 'and not money as well').not.toHaveBeenCalled();
    expect(session.runtime.world.getTopEdge(tile(4, 6)), 'and the wall really came down').toBe(0);
  });

  it('pays once whichever way round the two presses go, with a delivery in flight and with one landed', () => {
    /*
     * **The both-ways-round half of ADR 0076's gate**, which it wrote as
     * `Remove` -> `Undo` and `Undo` -> `Remove` and which is here as the two
     * presses that reach `cancelOrder` for one order: the panel's *Cancel*
     * (`CancelBuildOrder`) and `Undo`.
     *
     * The hazard is one refund becoming two. A cancelled order is terminal, so
     * the second press must find nothing to pay for -- `undo()` skips a
     * non-cancellable order and `createConstructionCommandHandler` swallows the
     * throw -- and the credit spy is what says so rather than the balance
     * alone, which a compensating error could leave looking right.
     *
     * Both orderings are run twice over: once with the money still in a
     * delivery, and once with it in the order's own allocation. Those are the
     * two places a refund can draw from and they are refunded by different
     * code.
     */
    const inFlight = () => {
      const session = createSession();
      session.place('order-wall-1', WALL, 4, 6, 'build-1', 'place the wall');
      return session;
    };
    const allocated = () => {
      const session = createSession();
      session.place('order-wall-1', WALL, 4, 6, 'build-1', 'place the wall');
      session.runUntilState('order-wall-1', 'assigned', 'wait for the allocation');
      return session;
    };

    for (const [name, open] of [['in flight', inFlight], ['allocated', allocated]] as const) {
      const cancelThenUndo = open();
      cancelThenUndo.cancel('order-wall-1', `${name}: Cancel`);
      cancelThenUndo.undo(`${name}: then Undo`);
      expect(
        cancelThenUndo.creditSpy.mock.calls.map(([amount]) => amount),
        `${name}: Cancel then Undo paid more than once`,
      ).toEqual([wallCost]);
      expect(cancelThenUndo.runtime.treasury.balanceMinorUnits).toBe(TREASURY_STARTING_BALANCE_MINOR_UNITS);
      expect(cancelThenUndo.stock(WALL_REQUIREMENT.itemId), `${name}: and no bricks came back too`).toBe(0);

      const undoThenCancel = open();
      undoThenCancel.undo(`${name}: Undo`);
      undoThenCancel.cancel('order-wall-1', `${name}: then Cancel`);
      expect(
        undoThenCancel.creditSpy.mock.calls.map(([amount]) => amount),
        `${name}: Undo then Cancel paid more than once`,
      ).toEqual([wallCost]);
      expect(undoThenCancel.runtime.treasury.balanceMinorUnits).toBe(TREASURY_STARTING_BALANCE_MINOR_UNITS);
      expect(undoThenCancel.stock(WALL_REQUIREMENT.itemId), `${name}: and no bricks came back too`).toBe(0);
    }
  });

  it('refunds the queue\'s own delivery and never the one the player bought', () => {
    /*
     * #687's distinction, in the direction ruling 20 creates. A delivery
     * `JustInTimeMaterialsService` bought is the build queue's money and comes
     * back when the demand behind it goes; a delivery the player pressed *Buy*
     * for is stock they chose to hold and must survive every cancellation.
     *
     * This is also what keeps mutation M1 -- *"undo cancels every pending
     * purchase"* -- caught after ruling 20 made a cancellation credit money at
     * all.
     */
    const session = createSession();
    session.buy('order-buy-1', WALL_REQUIREMENT.itemId, 10, 'the player buys ten bricks');
    const afterPurchase = session.runtime.treasury.balanceMinorUnits;

    session.place('order-wall-1', WALL, 4, 6, 'build-1', 'a wall the player already has bricks for');
    expect(
      session.runtime.procurement.pendingDeliveries,
      'the queue bought nothing: the player\'s ten cover it',
    ).toHaveLength(1);

    session.cancel('order-wall-1', 'cancel it again');
    expect(
      session.runtime.procurement.pendingDeliveries,
      'the player\'s own delivery must survive a build-order cancellation',
    ).toHaveLength(1);
    expect(session.creditSpy, 'and nothing may be refunded for an order that bought nothing').not.toHaveBeenCalled();
    expect(session.runtime.treasury.balanceMinorUnits).toBe(afterPurchase);
  });

  it('takes back one wall\'s money and leaves the other wall\'s alone', () => {
    /*
     * Two orders, two deliveries -- which is what a session produces since #703
     * ruling 12 made the *order* the unit a purchase is atomic at. Cancelling
     * one must take back exactly its own delivery and leave the other queue
     * member able to finish, rather than refunding the pair and re-buying on
     * the next scheduled pass.
     */
    const session = createSession();
    session.place('order-wall-1', WALL, 4, 6, 'build-1', 'first wall');
    session.place('order-wall-2', WALL, 5, 6, 'build-2', 'second wall');
    const spent = TREASURY_STARTING_BALANCE_MINOR_UNITS - session.runtime.treasury.balanceMinorUnits;
    expect(spent, 'two walls, two lots of bricks').toBe(2 * wallCost);

    session.cancel('order-wall-1', 'cancel the first');
    expect(
      TREASURY_STARTING_BALANCE_MINOR_UNITS - session.runtime.treasury.balanceMinorUnits,
      'exactly one wall\'s worth is still spent',
    ).toBe(wallCost);

    session.buildUntilComplete(['order-wall-2'], 'the survivor still builds');
    expect(session.runtime.world.getTopEdge(tile(5, 6)), 'and it really went up').toBeGreaterThan(0);
    expect(
      TREASURY_STARTING_BALANCE_MINOR_UNITS - session.runtime.treasury.balanceMinorUnits,
      'and it was not bought a second time',
    ).toBe(wallCost);
  });

  it('will not cancel one lorry two orders are waiting on, which is a save written before ruling 12', () => {
    /*
     * **The bound that stops this becoming #687 in reverse, and the only route
     * that still reaches it.** A delivery covering more than one order cannot
     * be produced by a session on this build: #703 ruling 12 made the order the
     * unit a purchase is atomic at, so `procureForPendingOrders` makes one
     * purchase per item **per funded order** and every `jit:` delivery is
     * exactly one order's worth. Cancelling a delivery the rest of the queue
     * still needs part of is therefore unreachable by placing walls -- and it
     * is reachable from a **save**, because `pendingDeliveries` is persisted
     * (`economySectionSchema`) and a save written by any build before
     * 2026-08-31 can hold an aggregated lump.
     *
     * So this restores one, which is what that save looks like when it loads,
     * and asserts the surplus half of a lorry is not a reason to turn the whole
     * lorry around: the second wall still gets its bricks and is not paid for
     * twice.
     *
     * Measured: without the `delivery.quantity > surplus` guard in
     * `largestSurplusDelivery`, this reads `160` where it expects `80` -- the
     * whole lump refunded for one cancelled wall -- and the second wall is then
     * re-bought by the next scheduled pass.
     */
    const session = createSession();
    session.place('order-wall-1', WALL, 4, 6, 'build-1', 'first wall');
    session.place('order-wall-2', WALL, 5, 6, 'build-2', 'second wall');
    const pending = session.runtime.procurement.pendingDeliveries;
    expect(pending, 'this build makes one delivery per order').toHaveLength(2);

    // The pre-ruling-12 shape: one purchase for the pair, under one `jit:` id,
    // carrying what the two together cost. Restoring is how such a delivery
    // enters a session, and it is exactly what loading that save does.
    session.runtime.procurement.restore({
      pending: [
        {
          orderId: 'jit:0:item.brick:0',
          itemId: WALL_REQUIREMENT.itemId,
          quantity: 2 * WALL_REQUIREMENT.quantity,
          arrivesAtTick: pending[0]!.arrivesAtTick,
          paidMinorUnits: 2 * wallCost,
        },
      ],
    });
    session.conserved('one lorry for the pair, as a pre-ruling-12 save carries it');

    session.cancel('order-wall-1', 'cancel one of the two');
    expect(
      TREASURY_STARTING_BALANCE_MINOR_UNITS - session.runtime.treasury.balanceMinorUnits,
      'the lorry the other wall is waiting on must not be turned around',
    ).toBe(2 * wallCost);
    expect(session.runtime.procurement.pendingDeliveries, 'so it is still on its way').toHaveLength(1);

    session.buildUntilComplete(['order-wall-2'], 'and the survivor builds off it');
    expect(session.runtime.world.getTopEdge(tile(5, 6))).toBeGreaterThan(0);
  });
});
