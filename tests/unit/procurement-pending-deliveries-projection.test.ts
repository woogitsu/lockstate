import { describe, expect, it } from 'vitest';
import { PROCUREMENT_DELIVERY_DELAY_TICKS } from '../../src/content/procurement-catalog';
import { projectPendingDeliveries, type PendingDeliverySource } from '../../src/simulation/presentation';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';

/**
 * The read model behind the Build panel's delivery rows, and the command it
 * makes aimable (#285).
 *
 * ## What this file is really about
 *
 * `ProcurementSystem.cancel` refunds the recorded price of a delivery that has
 * not landed, exactly, and until #285 **nothing in `src/` could call it**. The
 * blocker was the same one `CancelBuildOrder` had: a purchase id is minted on
 * the main thread, sent, and forgotten, so no control could name one. This
 * projection is what carries the ids back.
 *
 * So the load-bearing claim below is not "a delivery can be cancelled" -- it
 * always could, from a test. It is **"an arbitrary one can be named, in the
 * order they will land, with the money each one is worth"**.
 *
 * ## Why the ticks and prices are literals
 *
 * `PROCUREMENT_DELIVERY_DELAY_TICKS` is 100 and `item.brick` costs 40, so a
 * purchase of three at tick 0 arrives at tick 100 having cost 120. Reading those
 * figures back out of the thing under test would assert nothing (#375).
 */

/**
 * A source in the order a *broken* `sortPending` would leave it.
 *
 * Deliberately not built through `ProcurementSystem`: `purchase` and `restore`
 * both sort, so a real system cannot produce an out-of-order list and the
 * projection's own ordering could not be observed through one. The narrow source
 * shape exists exactly so this can be handed a list nothing sorted.
 */
const shuffled: PendingDeliverySource = {
  pendingDeliveries: [
    { orderId: 'buy-c', itemId: 'item.brick', quantity: 1, arrivesAtTick: 300, paidMinorUnits: 40 },
    { orderId: 'aaa-late', itemId: 'item.brick', quantity: 2, arrivesAtTick: 200, paidMinorUnits: 80 },
    { orderId: 'buy-b', itemId: 'item.wood-plank', quantity: 1, arrivesAtTick: 100, paidMinorUnits: 65 },
    { orderId: 'buy-a', itemId: 'item.brick', quantity: 3, arrivesAtTick: 100, paidMinorUnits: 120 },
  ],
};

describe('projectPendingDeliveries', () => {
  it('carries every field a row needs, from a real purchase through the real system', () => {
    const runtime = createNewSimulationRuntime(5);
    expect(runtime.procurement.purchase('buy-1', 'item.brick', 3, 0).ok).toBe(true);

    const view = projectPendingDeliveries(runtime.procurement);

    expect(view.deliveries.total).toBe(1);
    expect(view.deliveries.rows).toEqual([
      {
        orderId: 'buy-1',
        itemId: 'item.brick',
        quantity: 3,
        // Three bricks at 40, and the arrival tick the delay produces from 0.
        paidMinorUnits: 120,
        arrivesAtTick: PROCUREMENT_DELIVERY_DELAY_TICKS,
      },
    ]);
    expect(view.refundableMinorUnits).toBe(120);
    // No item name and no translated text of any kind crosses the boundary
    // (ADR 0011): what `item.brick` is *called* is the composition root's answer.
    expect(JSON.stringify(view)).not.toContain('Brick');
  });

  it('orders by arrival and not by id, which is the opposite of the build queue', () => {
    /*
     * The one ordering assertion that can fail for the right reason. Sorting by
     * id -- which `projectBuildQueue` does, because ascending id *is* the crew's
     * walk order -- would put `aaa-late` first, and it is the delivery that lands
     * last but one. The list is the delivery schedule: row one is the next thing
     * to arrive, and therefore the row whose refund is about to stop being
     * available.
     *
     * `buy-a` before `buy-b` is the tie-break on a shared arrival tick, in
     * code-unit order, which is `ProcurementSystem.sortPending`'s own rule.
     */
    const view = projectPendingDeliveries(shuffled);

    expect(view.deliveries.rows.map((row) => row.orderId)).toEqual(['buy-a', 'buy-b', 'aaa-late', 'buy-c']);
  });

  it('sums what every pending delivery would refund, not what the window shows', () => {
    /*
     * The figure #285 is about: what is *out*, against the status strip's what is
     * *left*. Counted over the whole list, for the reason `BuildQueueViewModel`
     * counts `started` over the whole queue -- a panel drawing three rows of nine
     * purchases must not understate the money by six of them.
     *
     * 120 + 65 + 80 + 40 = 305, in integer minor units with no remainder.
     */
    const windowed = projectPendingDeliveries(shuffled, { limit: 1 });

    expect(windowed.deliveries.rows).toHaveLength(1);
    expect(windowed.deliveries.total).toBe(4);
    expect(windowed.refundableMinorUnits).toBe(305);
    expect(projectPendingDeliveries(shuffled).refundableMinorUnits).toBe(305);
  });

  it('windows the list the caller asked for, in the projection\'s own order', () => {
    const page = projectPendingDeliveries(shuffled, { offset: 1, limit: 2 });

    expect(page.deliveries.offset).toBe(1);
    expect(page.deliveries.limit).toBe(2);
    expect(page.deliveries.total).toBe(4);
    expect(page.deliveries.rows.map((row) => row.orderId)).toEqual(['buy-b', 'aaa-late']);
  });

  it('answers an empty list rather than a zeroed row, for a session that has bought nothing', () => {
    const view = projectPendingDeliveries({ pendingDeliveries: [] });

    expect(view.deliveries.rows).toEqual([]);
    expect(view.deliveries.total).toBe(0);
    expect(view.refundableMinorUnits).toBe(0);
  });

  it('reads the delivery out of the list once it has landed, so no row promises a refund it cannot make', () => {
    /*
     * The projection has no opinion here -- `ProcurementSystem.update` drops an
     * arrived delivery from `pending` -- and that is the assertion: the surface
     * cannot show a row whose Cancel would be refused, except in the half-second
     * a publication is stale for.
     */
    const runtime = createNewSimulationRuntime(5);
    runtime.procurement.purchase('buy-1', 'item.brick', 2, 0);
    for (let step = 0; step < PROCUREMENT_DELIVERY_DELAY_TICKS + 1; step += 1) runtime.kernel.step();

    const view = projectPendingDeliveries(runtime.procurement);

    expect(view.deliveries.total).toBe(0);
    expect(view.refundableMinorUnits).toBe(0);
  });
});
