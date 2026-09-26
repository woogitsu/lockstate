import { describe, expect, it } from 'vitest';
import { PROCUREMENT_DELIVERY_DELAY_TICKS } from '../../src/content/procurement-catalog';
import { TREASURY_STARTING_BALANCE_MINOR_UNITS } from '../../src/simulation/economy';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import {
  CONSTRUCTION_MATERIALS_CONTAINER_ID,
  createNewSimulationRuntime,
  type SimulationRuntime,
} from '../../src/simulation/runtime/new-session';

/**
 * Issue #285: **the money spent on a delivery that has not landed comes back,
 * and it comes back through a command a player can send.**
 *
 * ## What was wrong, and what was not
 *
 * Not the arithmetic. `ProcurementSystem.cancel` has refunded the recorded
 * `paidMinorUnits` exactly since #249, and #296 proved value is conserved over
 * every sequence a player could produce
 * (`tests/integration/economy-money-conservation.test.ts`). What was wrong is
 * that **no session could reach it**: `grep -rn "procurement\.cancel" src/`
 * found nothing, so the only caller in the repository was a test, and money
 * spent on a delivery a player had changed their mind about was unrecoverable
 * by any means the interface offered. #285's sharpest measurement is undo while
 * the delivery is in flight: the balance stays down, the order is cancelled, and
 * the bricks arrive 288 ticks later attached to nothing.
 *
 * The decision on #285 was resolution 2 -- a purchase-cancel command with its
 * own surface -- and this file is the guarantee at the bottom of it: buy,
 * cancel, and the balance is *exactly* what it was.
 *
 * ## Why every figure here is a literal
 *
 * Because the claim is about money, and money in this repository is integer
 * minor units with no rounding rule. `item.brick` costs **40**
 * (`src/content/procurement-catalog.ts`) and a session starts with **25,000**
 * (`TREASURY_STARTING_BALANCE_MINOR_UNITS`), so every balance below is written
 * out. A figure computed from the code under test -- `before - balance`, or a
 * price read back out of the catalog and multiplied here -- would agree with a
 * refund of the wrong amount, which is exactly the defect class #375 records.
 * The two constants are pinned once, below, so a content change fails here with
 * the arithmetic named rather than silently rewriting the story.
 *
 * ## Why it goes through the kernel
 *
 * Every command is packed with the real `packCommand`, submitted to the real
 * kernel and dispatched by `Kernel.step()` through
 * `createSessionCommandHandler`. Calling `procurement.cancel` directly is what
 * the unit-level guard in `economy-build-loop.test.ts` does; it cannot see the
 * schema, the decoder, the router or the refusal route, and those are the parts
 * that were missing.
 */

const SEED = 19;

/**
 * One command, packed and dispatched, exactly as the worker would.
 *
 * Scheduled at the kernel's *current* tick rather than at 0: the kernel refuses
 * a command scheduled in the past, and every call here follows a `step()`.
 */
function send(runtime: SimulationRuntime, id: string, command: SimulationCommand): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, packCommand(command));
  runtime.kernel.step();
}

const brickStock = (runtime: SimulationRuntime): number =>
  runtime.containers.require(CONSTRUCTION_MATERIALS_CONTAINER_ID).quantityOf('item.brick');

describe('cancelling a purchase whose delivery has not landed', () => {
  it('pins the two figures every balance below is written from', () => {
    // Not decoration: the literals in this file are only readable claims while
    // these two hold, and a content change that moved either would otherwise
    // turn every assertion below into a different (still green) story.
    expect(TREASURY_STARTING_BALANCE_MINOR_UNITS).toBe(100_000);
    expect(packCommand({ type: 'CancelMaterialPurchase', orderId: 'buy-1' }).data).toEqual({
      type: 'CancelMaterialPurchase',
      orderId: 'buy-1',
    });
  });

  it('buys, cancels, and returns the balance to exactly what it was', () => {
    const runtime = createNewSimulationRuntime(SEED);
    expect(runtime.treasury.balanceMinorUnits).toBe(100_000);

    // Three bricks at 40.
    send(runtime, 'cmd-buy', { type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.brick', quantity: 3 });
    expect(runtime.treasury.balanceMinorUnits, 'a purchase spends at the tick it executes').toBe(99_880);
    expect(runtime.procurement.pendingDeliveries).toHaveLength(1);

    send(runtime, 'cmd-cancel', { type: 'CancelMaterialPurchase', orderId: 'buy-1' });

    // The headline. Not "greater than", not "restored to `before`": the exact
    // figure the session started with.
    expect(runtime.treasury.balanceMinorUnits, 'the refund must be exact').toBe(100_000);
    expect(runtime.procurement.pendingDeliveries).toHaveLength(0);
    expect(runtime.refusals.last, 'a cancellation that worked must refuse nothing').toBeUndefined();

    // And the goods do not arrive anyway, which would be a refund *and* the
    // bricks -- value created out of a command.
    for (let step = 0; step < PROCUREMENT_DELIVERY_DELAY_TICKS * 2; step += 1) runtime.kernel.step();
    expect(brickStock(runtime)).toBe(0);
    expect(runtime.treasury.balanceMinorUnits).toBe(100_000);
  });

  it('cancels the delivery that was named and leaves the others paid for', () => {
    /*
     * The load-bearing claim, and the one a single-purchase test cannot make:
     * this command names *one* purchase by id. A player with three deliveries out
     * who cancels the middle one must get that one's money back and keep the
     * other two coming.
     *
     * The three quantities differ so the refund is attributable: 1, 2 and 4
     * bricks at 40 is 40, 80 and 160, and only one of those figures is 80.
     */
    const runtime = createNewSimulationRuntime(SEED);
    send(runtime, 'cmd-a', { type: 'PurchaseMaterials', orderId: 'buy-a', itemId: 'item.brick', quantity: 1 });
    send(runtime, 'cmd-b', { type: 'PurchaseMaterials', orderId: 'buy-b', itemId: 'item.brick', quantity: 2 });
    send(runtime, 'cmd-c', { type: 'PurchaseMaterials', orderId: 'buy-c', itemId: 'item.brick', quantity: 4 });
    expect(runtime.treasury.balanceMinorUnits).toBe(99_720);

    send(runtime, 'cmd-cancel-b', { type: 'CancelMaterialPurchase', orderId: 'buy-b' });

    expect(runtime.treasury.balanceMinorUnits, 'only the named purchase is refunded').toBe(99_800);
    expect(runtime.procurement.pendingDeliveries.map((delivery) => delivery.orderId)).toEqual(['buy-a', 'buy-c']);

    // The two that were left alone still arrive, and they arrive whole: 1 + 4.
    for (let step = 0; step < PROCUREMENT_DELIVERY_DELAY_TICKS * 2; step += 1) runtime.kernel.step();
    expect(brickStock(runtime)).toBe(5);
    expect(runtime.treasury.balanceMinorUnits).toBe(99_800);
  });

  it('refuses a cancellation whose delivery has already arrived, and creates no money', () => {
    /*
     * #285's mutation M1, from the other side. `cancel` answers `not-pending`
     * once a delivery has landed, and that has to stay true *and* stay reported:
     * a cancellation that credited a delivered purchase would hand back the money
     * while the bricks stayed in the container, which is value created out of a
     * button press.
     *
     * It is also the refusal a player meets without doing anything wrong. The
     * list of deliveries on screen is a projection on a cadence, so one can land
     * between the publication and the press -- which is why this asserts the
     * refusal *reaches the log* and not merely that the balance held. A silent
     * no-op here is a Cancel that appeared to refund money.
     */
    const runtime = createNewSimulationRuntime(SEED);
    send(runtime, 'cmd-buy', { type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.brick', quantity: 2 });
    expect(runtime.treasury.balanceMinorUnits).toBe(99_920);

    for (let step = 0; step < PROCUREMENT_DELIVERY_DELAY_TICKS + 1; step += 1) runtime.kernel.step();
    expect(brickStock(runtime), 'the fixture must actually have taken delivery').toBe(2);
    expect(runtime.procurement.pendingDeliveries).toHaveLength(0);

    send(runtime, 'cmd-cancel', { type: 'CancelMaterialPurchase', orderId: 'buy-1' });

    expect(runtime.treasury.balanceMinorUnits, 'a delivered purchase must not be refunded').toBe(99_920);
    expect(brickStock(runtime), 'and the bricks stay bought').toBe(2);
    expect(runtime.refusals.last?.reason).toBe('cancel-purchase.not-pending');
    expect(runtime.refusals.count).toBe(1);
  });

  it('refuses an id no purchase ever had, and says so once per press', () => {
    /*
     * The other way to reach `not-pending`, and the reason it is one reason
     * rather than two: the system cannot tell an id it never held from one whose
     * delivery has landed, because a landed delivery takes its record with it.
     *
     * `count` is the assertion that matters. `RefusalLog` keeps the last refusal
     * and a 1-based sequence, so "two presses produced two refusals" is only
     * observable through the counter -- and a handler that swallowed the second
     * would leave `last` looking correct.
     */
    const runtime = createNewSimulationRuntime(SEED);
    send(runtime, 'cmd-1', { type: 'CancelMaterialPurchase', orderId: 'never-bought' });
    expect(runtime.treasury.balanceMinorUnits).toBe(100_000);
    expect(runtime.refusals.last?.reason).toBe('cancel-purchase.not-pending');
    expect(runtime.refusals.count).toBe(1);

    send(runtime, 'cmd-2', { type: 'CancelMaterialPurchase', orderId: 'never-bought' });
    expect(runtime.treasury.balanceMinorUnits).toBe(100_000);
    expect(runtime.refusals.count, 'each refused press is its own refusal').toBe(2);
  });

  it('cancels a purchase that survived a snapshot, because the pending list is saved state', () => {
    /*
     * Why this needs no save-schema version: the delivery this cancels is state
     * V5 already carries. `snapshot`/`restore` round-trip the pending list and
     * `economySectionSchema` already types every field of it, so the surface
     * added for #285 reads state a stored save has held all along -- which is
     * what kept V6 free for #361 and #337.
     */
    const runtime = createNewSimulationRuntime(SEED);
    send(runtime, 'cmd-buy', { type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.brick', quantity: 3 });

    const snapshot = runtime.procurement.snapshot();
    const treasury = runtime.treasury.snapshot();

    const restored = createNewSimulationRuntime(SEED);
    restored.procurement.restore(JSON.parse(JSON.stringify(snapshot)) as typeof snapshot);
    restored.treasury.restore(JSON.parse(JSON.stringify(treasury)) as typeof treasury);
    expect(restored.treasury.balanceMinorUnits).toBe(99_880);

    send(restored, 'cmd-cancel', { type: 'CancelMaterialPurchase', orderId: 'buy-1' });
    expect(restored.treasury.balanceMinorUnits, 'a restored delivery refunds the price it was bought at').toBe(100_000);
    expect(restored.procurement.pendingDeliveries).toHaveLength(0);
  });
});
