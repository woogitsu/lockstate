import { describe, expect, it } from 'vitest';
import { PROCUREMENT_DELIVERY_DELAY_TICKS } from '../../src/content/procurement-catalog';
import type { MaterialRequirement } from '../../src/simulation/construction';
import {
  JUST_IN_TIME_ORDER_ID_PREFIX,
  JustInTimeMaterialsService,
  ProcurementSystem,
  Treasury,
  justInTimePurchaseOrderId,
} from '../../src/simulation/economy';
import { Container } from '../../src/simulation/operations/inventory';

/**
 * The deficit arithmetic behind ADR 0017 decision 7, on its own (#627).
 *
 * ## Why this is a unit file and not only an integration one
 *
 * `tests/integration/construction-just-in-time-materials.test.ts` drives the
 * real kernel and proves the player-visible outcome. What it cannot do
 * cheaply is put the service in the two states that are *arithmetically*
 * interesting and rare in a session: stock and an in-flight delivery covering
 * the same demand from opposite directions, and an item nobody sells.
 *
 * Every figure below is a literal. `item.brick` is 40 and `item.wood-plank`
 * is 65, and the products are written out, so a purchase that charged the
 * wrong price cannot be hidden by a fixture that recomputed it from the same
 * table (`docs/TESTING.md`).
 *
 * The `Treasury` and `ProcurementSystem` are the real ones rather than stubs.
 * They are what decides whether a purchase is affordable, and a stub that
 * answered "yes" would move the whole subject of this file into a fake.
 */

const BRICK = 'item.brick';
const PLANK = 'item.wood-plank';
/** Declared in `item-catalog.ts` and sold by nobody -- see `PROCURABLE_MATERIALS`. */
const SINK = 'item.sink';

const need = (itemId: string, quantity: number): MaterialRequirement => ({ itemId, quantity });

function fixture(startingBalance = 25_000) {
  const treasury = new Treasury();
  if (startingBalance < 25_000) {
    expect(treasury.spend(25_000 - startingBalance), 'the fixture must be able to reach its own opening balance').toBe(true);
  }
  const stock = new Container('construction-materials');
  const procurement = new ProcurementSystem(treasury, stock);
  const service = new JustInTimeMaterialsService(procurement, stock);
  return { treasury, stock, procurement, service };
}

describe('what a just-in-time pass buys', () => {
  it('buys the whole requirement when the prison holds nothing', () => {
    const { treasury, service, procurement } = fixture();

    const report = service.procureForPendingOrders([need(BRICK, 8)], 0);

    expect(report.purchased).toEqual([{ itemId: BRICK, quantity: 8, costMinorUnits: 320 }]);
    expect(report.unfunded).toEqual([]);
    expect(treasury.balanceMinorUnits).toBe(25_000 - 320);
    expect(procurement.pendingDeliveries.map((delivery) => [delivery.quantity, delivery.arrivesAtTick])).toEqual([
      [8, PROCUREMENT_DELIVERY_DELAY_TICKS],
    ]);
  });

  it('buys only the shortfall against stock the prison already holds', () => {
    // The mutation this catches: dropping `stock.availableOf` from the
    // deficit, which buys 8 and leaves the player with 14.
    const { treasury, stock, service } = fixture();
    stock.deposit(BRICK, 6);

    const report = service.procureForPendingOrders([need(BRICK, 8)], 0);

    expect(report.purchased).toEqual([{ itemId: BRICK, quantity: 2, costMinorUnits: 80 }]);
    expect(treasury.balanceMinorUnits).toBe(25_000 - 80);
  });

  it('counts reserved stock as unavailable, because a reservation is somebody else\'s', () => {
    /*
     * `availableOf`, not `quantityOf`. Six bricks with four reserved for a
     * carry job in progress leaves two the queue can have, so a demand of
     * eight is short six -- not two. Buying against reserved stock would have
     * two claimants for one brick and the loser waits for ever.
     */
    const { stock, service } = fixture();
    stock.deposit(BRICK, 6);
    expect(stock.reserve(BRICK, 4).ok).toBe(true);

    expect(service.procureForPendingOrders([need(BRICK, 8)], 0).purchased).toEqual([
      { itemId: BRICK, quantity: 6, costMinorUnits: 240 },
    ]);
  });

  it('counts what is already paid for and still on the road', () => {
    /*
     * The term that stops the pass buying the same bricks on each of the ten
     * scheduled ticks a delivery takes to arrive. Two passes at different
     * ticks against the same unchanged demand must cost the prison once.
     */
    const { treasury, service } = fixture();

    service.procureForPendingOrders([need(BRICK, 8)], 0);
    const afterFirstPass = treasury.balanceMinorUnits;

    const second = service.procureForPendingOrders([need(BRICK, 8)], 10);
    expect(second.purchased, 'the bricks are already bought and on their way').toEqual([]);
    expect(second.unfunded).toEqual([]);
    expect(treasury.balanceMinorUnits).toBe(afterFirstPass);
  });

  it('buys the increment when the queue grows while a delivery is in flight', () => {
    // The same term from the other side: netting in-flight off must not mean
    // ignoring demand that arrived after it.
    const { treasury, service } = fixture();
    service.procureForPendingOrders([need(BRICK, 8)], 0);

    const second = service.procureForPendingOrders([need(BRICK, 12)], 10);
    expect(second.purchased).toEqual([{ itemId: BRICK, quantity: 4, costMinorUnits: 160 }]);
    expect(treasury.balanceMinorUnits).toBe(25_000 - 320 - 160);
  });

  it('buys nothing at all when the queue wants nothing', () => {
    const { treasury, service } = fixture();
    const report = service.procureForPendingOrders([], 0);
    expect(report).toEqual({ tick: 0, purchased: [], unfunded: [], unprocurable: [] });
    expect(treasury.balanceMinorUnits).toBe(25_000);
  });

  it('separates two purchases of one item at one tick, so neither is refused as a duplicate', () => {
    /*
     * `justInTimePurchaseOrderId`'s fourth part. Several `PlaceBuildOrder`
     * commands are dispatched at one tick -- the kernel dispatches every due
     * command before any system runs -- and each buys its own increment.
     *
     * The id is asserted as a literal string rather than through the helper
     * that builds it, because the helper is the thing under test.
     */
    const { service, procurement } = fixture();

    service.procureForPendingOrders([need(BRICK, 2)], 7);
    service.procureForPendingOrders([need(BRICK, 4)], 7);

    expect(procurement.pendingDeliveries.map((delivery) => [delivery.orderId, delivery.quantity])).toEqual([
      ['jit:7:item.brick:0', 2],
      ['jit:7:item.brick:2', 2],
    ]);
    expect(justInTimePurchaseOrderId(7, BRICK, 2)).toBe('jit:7:item.brick:2');
    expect(justInTimePurchaseOrderId(7, BRICK, 0).startsWith(JUST_IN_TIME_ORDER_ID_PREFIX)).toBe(true);
  });

  it('walks several materials in ascending item id, and prices each from its own row', () => {
    // Canonical order, because this writes simulation state: which of two
    // materials is bought first decides which one an insufficient balance
    // refuses. Handed in the wrong order on purpose.
    const { service } = fixture();

    const report = service.procureForPendingOrders([need(PLANK, 3), need(BRICK, 2)], 0);

    expect(report.purchased).toEqual([
      { itemId: BRICK, quantity: 2, costMinorUnits: 80 },
      { itemId: PLANK, quantity: 3, costMinorUnits: 195 },
    ]);
  });
});

describe('what a just-in-time pass cannot buy', () => {
  it('reports the shortfall in money and leaves the treasury exactly where it was', () => {
    // 40 in the bank against 2 bricks at 40. ADR 0017 decision 2: a purchase
    // that cannot be afforded must be refusable, and `Treasury.spend` refuses
    // rather than overdrawing.
    const { treasury, service, procurement } = fixture(40);

    const report = service.procureForPendingOrders([need(BRICK, 2)], 0);

    expect(report.unfunded).toEqual([{ itemId: BRICK, quantity: 2, costMinorUnits: 80 }]);
    expect(report.purchased).toEqual([]);
    expect(treasury.balanceMinorUnits, 'a refusal spends nothing').toBe(40);
    expect(procurement.pendingDeliveries, 'and orders nothing').toEqual([]);
  });

  it('buys what it can afford and reports what it cannot, in the same pass', () => {
    /*
     * All-or-nothing **per item**, not per pass. 120 buys the bricks (80) and
     * leaves 40 against a plank's 65, so the report has to carry both halves:
     * a pass that gave up entirely on the first refusal would leave the wall
     * unbuilt as well as the bed.
     */
    const { treasury, service } = fixture(120);

    const report = service.procureForPendingOrders([need(BRICK, 2), need(PLANK, 1)], 0);

    expect(report.purchased).toEqual([{ itemId: BRICK, quantity: 2, costMinorUnits: 80 }]);
    expect(report.unfunded).toEqual([{ itemId: PLANK, quantity: 1, costMinorUnits: 65 }]);
    expect(treasury.balanceMinorUnits).toBe(40);
  });

  it('separates "nobody sells it" from "you cannot afford it"', () => {
    /*
     * `validateBuildableItemReferences` checks that a requirement names a
     * declared item and never that anybody sells it, so a buildable requiring
     * `item.sink` is a content state this can meet. Reporting it as a shortfall
     * would tell a player to find money for something no amount of money buys.
     */
    const { treasury, service } = fixture();

    const report = service.procureForPendingOrders([need(SINK, 1)], 0);

    expect(report.unprocurable).toEqual([{ itemId: SINK, quantity: 1, reason: 'unpurchasable' }]);
    expect(report.unfunded).toEqual([]);
    expect(treasury.balanceMinorUnits).toBe(25_000);
  });

  it('reports a demand past the purchase bound as unbuyable rather than unaffordable', () => {
    // `MAX_PURCHASE_QUANTITY` is 100,000 and exists so a quantity times a
    // price cannot leave the safe integers. Past it the answer is not money.
    const { treasury, service } = fixture();

    const report = service.procureForPendingOrders([need(BRICK, 100_001)], 0);

    expect(report.unprocurable).toEqual([{ itemId: BRICK, quantity: 100_001, reason: 'quantity-refused' }]);
    expect(report.unfunded).toEqual([]);
    expect(treasury.balanceMinorUnits).toBe(25_000);
  });
});

describe('the report the queue is read through', () => {
  it('is empty before any pass has run, at a tick nothing can have run at', () => {
    const { service } = fixture();
    expect(service.lastReport).toEqual({ tick: -1, purchased: [], unfunded: [], unprocurable: [] });
  });

  it('is rewritten by every pass, so a shortfall the prison has fixed stops being reported', () => {
    /*
     * The reason `ConstructionSystem.update` calls the sink unconditionally,
     * including with an empty demand. A record with no moment to be cleared is
     * a notice about a queue that emptied ten minutes ago.
     */
    const { service } = fixture(40);
    expect(service.procureForPendingOrders([need(BRICK, 2)], 0).unfunded).toHaveLength(1);
    expect(service.lastReport.unfunded).toHaveLength(1);

    service.procureForPendingOrders([], 10);
    expect(service.lastReport).toEqual({ tick: 10, purchased: [], unfunded: [], unprocurable: [] });
  });
});
