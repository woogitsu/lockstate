import { describe, expect, it } from 'vitest';
import { PROCUREMENT_DELIVERY_DELAY_TICKS } from '../../src/content/procurement-catalog';
import type { MaterialRequirement, QueuedOrderDemand } from '../../src/simulation/construction';
import {
  JUST_IN_TIME_ORDER_ID_PREFIX,
  JustInTimeMaterialsService,
  ProcurementSystem,
  Treasury,
  justInTimePurchaseOrderId,
} from '../../src/simulation/economy';
import { identifierSchema } from '../../src/simulation/protocol/types';
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

/**
 * One build order in the walk the sink is handed, since #703 ruling 12 made the
 * ORDER the unit a partly filled purchase is atomic at.
 *
 * Ids are written out (`order-1`, `order-2`) rather than generated, because the
 * walk order is what an insufficient balance funds along and a generated id
 * would make which order got the money a property of the generator.
 */
const order = (orderId: string, ...requirements: MaterialRequirement[]): QueuedOrderDemand => ({ orderId, requirements });

/**
 * The whole demand as a single order.
 *
 * Most cases below are about the *deficit arithmetic* -- stock, in-flight, the
 * catalogue -- which ruling 12 did not touch, so one order carrying the whole
 * requirement keeps them measuring what they were written to measure. The cases
 * that are about the funding decision spell out several orders instead.
 */
const oneOrder = (...requirements: MaterialRequirement[]): QueuedOrderDemand[] => [order('order-1', ...requirements)];

function fixture(startingBalance = 25_000) {
  const treasury = new Treasury();
  if (startingBalance < 25_000) {
    expect(treasury.spend(25_000 - startingBalance, 'construction'), 'the fixture must be able to reach its own opening balance').toBe(true);
  }
  const stock = new Container('construction-materials');
  const procurement = new ProcurementSystem(treasury, stock);
  const service = new JustInTimeMaterialsService(procurement, stock, treasury);
  return { treasury, stock, procurement, service };
}

describe('what a just-in-time pass buys', () => {
  it('buys the whole requirement when the prison holds nothing', () => {
    const { treasury, service, procurement } = fixture();

    const report = service.procureForPendingOrders(oneOrder(need(BRICK, 8)), 0);

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

    const report = service.procureForPendingOrders(oneOrder(need(BRICK, 8)), 0);

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

    expect(service.procureForPendingOrders(oneOrder(need(BRICK, 8)), 0).purchased).toEqual([
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

    service.procureForPendingOrders(oneOrder(need(BRICK, 8)), 0);
    const afterFirstPass = treasury.balanceMinorUnits;

    const second = service.procureForPendingOrders(oneOrder(need(BRICK, 8)), 10);
    expect(second.purchased, 'the bricks are already bought and on their way').toEqual([]);
    expect(second.unfunded).toEqual([]);
    expect(treasury.balanceMinorUnits).toBe(afterFirstPass);
  });

  it('buys the increment when the queue grows while a delivery is in flight', () => {
    // The same term from the other side: netting in-flight off must not mean
    // ignoring demand that arrived after it.
    const { treasury, service } = fixture();
    service.procureForPendingOrders(oneOrder(need(BRICK, 8)), 0);

    const second = service.procureForPendingOrders(oneOrder(need(BRICK, 12)), 10);
    expect(second.purchased).toEqual([{ itemId: BRICK, quantity: 4, costMinorUnits: 160 }]);
    expect(treasury.balanceMinorUnits).toBe(25_000 - 320 - 160);
  });

  it('buys nothing at all when the queue wants nothing', () => {
    const { treasury, service } = fixture();
    const report = service.procureForPendingOrders([], 0);
    expect(report).toEqual({ tick: 0, purchased: [], unfunded: [], unprocurable: [], nextOrderShortfallMinorUnits: 0 });
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

    service.procureForPendingOrders(oneOrder(need(BRICK, 2)), 7);
    service.procureForPendingOrders(oneOrder(need(BRICK, 4)), 7);

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

    const report = service.procureForPendingOrders(oneOrder(need(PLANK, 3), need(BRICK, 2)), 0);

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

    const report = service.procureForPendingOrders(oneOrder(need(BRICK, 2)), 0);

    expect(report.unfunded).toEqual([{ itemId: BRICK, quantity: 2, costMinorUnits: 80 }]);
    expect(report.purchased).toEqual([]);
    expect(treasury.balanceMinorUnits, 'a refusal spends nothing').toBe(40);
    expect(procurement.pendingDeliveries, 'and orders nothing').toEqual([]);
  });

  it('buys what it can afford and reports what it cannot, in the same pass', () => {
    /*
     * **This case read *"All-or-nothing per item, not per pass"* and the two
     * requirements were one argument, because a pass was handed one aggregated
     * figure per item id. #703 ruling 12 made the ORDER the unit, so the same
     * measurement is now two orders -- a wall and a bed -- and it is kept
     * because the property it pins did not move: a pass that gave up entirely
     * on the first refusal would leave the wall unbuilt as well as the bed.**
     *
     * 120 buys the wall (80) and leaves 40 against a bed's 65, so the report
     * has to carry both halves.
     */
    const { treasury, service } = fixture(120);

    const report = service.procureForPendingOrders(
      [order('order-1', need(BRICK, 2)), order('order-2', need(PLANK, 1))],
      0,
    );

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

    const report = service.procureForPendingOrders(oneOrder(need(SINK, 1)), 0);

    expect(report.unprocurable).toEqual([{ itemId: SINK, quantity: 1, reason: 'unpurchasable' }]);
    expect(report.unfunded).toEqual([]);
    expect(treasury.balanceMinorUnits).toBe(25_000);
    // Blocked, and not for money: `nextOrderShortfallMinorUnits` stays 0
    // rather than naming an amount that would not actually unblock anything.
    expect(report.nextOrderShortfallMinorUnits).toBe(0);
  });

  it('reports a demand past the purchase bound as unbuyable rather than unaffordable', () => {
    // `MAX_PURCHASE_QUANTITY` is 100,000 and exists so a quantity times a
    // price cannot leave the safe integers. Past it the answer is not money.
    const { treasury, service } = fixture();

    const report = service.procureForPendingOrders(oneOrder(need(BRICK, 100_001)), 0);

    expect(report.unprocurable).toEqual([{ itemId: BRICK, quantity: 100_001, reason: 'quantity-refused' }]);
    expect(report.unfunded).toEqual([]);
    expect(treasury.balanceMinorUnits).toBe(25_000);
  });
});

describe('the unit a partly filled purchase is atomic at (#703 ruling 12)', () => {
  it('funds as many whole orders as the balance covers and skips the one it cannot', () => {
    /*
     * ADR 0081 Decision 1 and 2 together, at the smallest size that can show
     * both. Four wall orders at 80 against 265 of spending power: three are
     * funded whole, the fourth is not, and the report carries both halves.
     *
     * The mutation this catches is the ruling being reverted -- an
     * all-or-nothing pass over the aggregate would price the four at 320,
     * refuse them together, and buy nothing.
     */
    const { treasury, service, procurement } = fixture(265);

    const report = service.procureForPendingOrders(
      [1, 2, 3, 4].map((index) => order(`order-${String(index)}`, need(BRICK, 2))),
      0,
    );

    expect(report.purchased).toEqual([{ itemId: BRICK, quantity: 6, costMinorUnits: 240 }]);
    expect(report.unfunded).toEqual([{ itemId: BRICK, quantity: 2, costMinorUnits: 80 }]);
    expect(treasury.balanceMinorUnits).toBe(25);
    expect(procurement.pendingDeliveries.map((delivery) => delivery.quantity)).toEqual([2, 2, 2]);
  });

  it('leaves the residual alone when it is short of one whole order, however many orders are queued', () => {
    /*
     * **The bound that survived ruling 9, measured.** All-or-nothing left a
     * prison whose queue it could not fund in one lump with the *whole* balance
     * unspent; per-order fill leaves it with less than one order costs. That is
     * the change, and it is a change in the residual rather than in the total:
     * the queue's own cost is what it can ever spend, before and after.
     *
     * 79 against four wall orders at 80: nothing is bought, four times over. A
     * per-*item* partial fill would buy one brick of the eight and leave the
     * prison with 39 and half a wall on the road.
     *
     * This is what makes the whole of `scripts/report-loan-recovery-pricing.mjs`
     * §10c come out **identical** before and after the ruling -- measured, every
     * figure in that table unchanged, and the scheduled pass still spending 0.
     * The presses had already taken those prisons to -2,440, and 60 of room is
     * short of a wall.
     */
    const { treasury, service, procurement } = fixture(79);

    const report = service.procureForPendingOrders(
      [1, 2, 3, 4].map((index) => order(`order-${String(index)}`, need(BRICK, 2))),
      0,
    );

    expect(report.purchased).toEqual([]);
    expect(report.unfunded).toEqual([{ itemId: BRICK, quantity: 8, costMinorUnits: 320 }]);
    expect(treasury.balanceMinorUnits).toBe(79);
    expect(procurement.pendingDeliveries).toEqual([]);
  });

  it('buys an order whole or not at all, never the half of it the balance covers', () => {
    /*
     * **The one new bound `procureForPendingOrders` adds, and the reason the
     * service holds the treasury at all.** An order wanting a brick (40) and a
     * plank (65) costs 105. At 80 the balance covers the brick and not the
     * plank, and buying the brick would spend 40 on a thing that can never
     * finish: ruling 12's *"na zlecenie"* is exactly the refusal of that trade.
     *
     * Mutation: replace the `canAfford(orderCostMinorUnits)` guard with a
     * per-line one and this reads `purchased: [{ item.brick, 1, 40 }]` and a
     * balance of 40.
     *
     * No shipped buildable requires two materials
     * (`src/simulation/construction/definition.ts`), so this is asserted at the
     * sink's own contract rather than through a fixture buildable that would
     * only prove itself. The contract is what a second material would meet.
     */
    const { treasury, service, procurement } = fixture(80);

    const report = service.procureForPendingOrders([order('order-1', need(BRICK, 1), need(PLANK, 1))], 0);

    expect(report.purchased, 'not the half of it that fits').toEqual([]);
    expect(report.unfunded).toEqual([
      { itemId: BRICK, quantity: 1, costMinorUnits: 40 },
      { itemId: PLANK, quantity: 1, costMinorUnits: 65 },
    ]);
    expect(treasury.balanceMinorUnits, 'a refused order spends nothing').toBe(80);
    expect(procurement.pendingDeliveries).toEqual([]);
  });

  it('buys that same order whole the moment the balance covers all of it', () => {
    // The other side of the boundary, so the case above is a bound and not a
    // pass that never buys a two-material order.
    const { treasury, service } = fixture(105);

    const report = service.procureForPendingOrders([order('order-1', need(BRICK, 1), need(PLANK, 1))], 0);

    expect(report.purchased).toEqual([
      { itemId: BRICK, quantity: 1, costMinorUnits: 40 },
      { itemId: PLANK, quantity: 1, costMinorUnits: 65 },
    ]);
    expect(report.unfunded).toEqual([]);
    expect(treasury.balanceMinorUnits).toBe(0);
  });

  it('lets a later order it can afford through, rather than stopping at the first it cannot', () => {
    /*
     * Rule 2, and it is a decision rather than a detail. ADR 0081 Decision 2's
     * own criterion for choosing per order is that *"the answer to 'why did
     * that get built and not this?' is a sentence the player could have
     * predicted before pressing"*. Skipping answers *"because you could afford
     * that one"*; stopping answers *"because of where it fell in an ascending
     * order-id walk"*, which for `order-${crypto.randomUUID()}` ids is a draw
     * the player cannot see.
     *
     * It is also the rule that never funds **less** than the aggregate pass it
     * replaced: at 70, the old per-item walk bought the plank and refused the
     * bricks, and so does this.
     *
     * Mutation: stop the walk on the first unaffordable order and the bed is
     * never bought -- `purchased` comes back empty.
     */
    const { treasury, service } = fixture(70);

    const report = service.procureForPendingOrders(
      [order('order-1', need(BRICK, 2)), order('order-2', need(PLANK, 1))],
      0,
    );

    expect(report.purchased, 'the 65 the balance covers, even though the 80 before it did not').toEqual([
      { itemId: PLANK, quantity: 1, costMinorUnits: 65 },
    ]);
    expect(report.unfunded).toEqual([{ itemId: BRICK, quantity: 2, costMinorUnits: 80 }]);
    expect(treasury.balanceMinorUnits).toBe(5);
    // The order actually blocking the crew is the one at the front of the
    // walk -- order-1 -- and its own cost is what unblocks it, which agrees
    // with `unfunded`'s sum here because exactly one order was left unfunded.
    // The next case is the one where the two figures pull apart.
    expect(report.nextOrderShortfallMinorUnits).toBe(80);
  });

  it("states the front order's own cost, not the queue's total, when a later order slips through (#771)", () => {
    /*
     * Issue #771's second finding, pinned. The shortfall sentence used to
     * state `unfunded`'s sum -- "what the queue still needs" -- and a player
     * who scraped that amount together could still see nothing move, because
     * rule 2 (the case above) lets a later, cheaper order through while an
     * earlier, pricier one waits. `nextOrderShortfallMinorUnits` is the figure
     * that actually unblocks the order at the front of the walk.
     *
     * Three orders at a balance of 65: order-1 wants 2 bricks (80, more than
     * the balance -- unfunded); order-2 wants 1 plank (65, exactly the
     * balance -- funded, rule 2 lets it through); order-3 wants 1 more brick
     * (40, and the balance is 0 by the time the walk reaches it -- unfunded).
     *
     * `unfunded` aggregates order-1's and order-3's bricks into one line --
     * 3 bricks, 120 -- because it is `MaterialsProcurementReport`'s stated,
     * unchanged contract: the queue's total. `nextOrderShortfallMinorUnits` is
     * order-1's own 80, the first order the walk could not afford, and the
     * two figures genuinely disagree: crediting 80 unblocks order-1, and
     * crediting 120 -- what the old sentence would have stated -- overpays for
     * that by 40 while still leaving order-3 waiting behind it in the walk.
     */
    const { treasury, service } = fixture(65);

    const report = service.procureForPendingOrders(
      [order('order-1', need(BRICK, 2)), order('order-2', need(PLANK, 1)), order('order-3', need(BRICK, 1))],
      0,
    );

    expect(report.purchased, 'order-2 slips through on rule 2').toEqual([
      { itemId: PLANK, quantity: 1, costMinorUnits: 65 },
    ]);
    expect(report.unfunded, "the queue's total, aggregated per item, unchanged").toEqual([
      { itemId: BRICK, quantity: 3, costMinorUnits: 120 },
    ]);
    expect(treasury.balanceMinorUnits).toBe(0);
    expect(report.nextOrderShortfallMinorUnits, "order-1's own cost, not the 120 the sum reads").toBe(80);
  });

  it('reports every order it left unfunded, not only the first', () => {
    /*
     * Why: `projectBuildQueue` sums `unfunded` into
     * `BuildQueueMaterialsFundingViewModel.shortfallMinorUnits`, which is the
     * figure the Build panel shows. Reporting only the order the walk stopped
     * being able to fund would silently change that number's subject from
     * "what the queue still needs" to "what the next order needs", which is a
     * player-facing change nobody decided.
     */
    const { service } = fixture(0);

    const report = service.procureForPendingOrders(
      [order('order-1', need(BRICK, 2)), order('order-2', need(BRICK, 2)), order('order-3', need(PLANK, 1))],
      0,
    );

    expect(report.unfunded).toEqual([
      { itemId: BRICK, quantity: 4, costMinorUnits: 160 },
      { itemId: PLANK, quantity: 1, costMinorUnits: 65 },
    ]);
  });

  it('hands the supply out along the walk instead of letting every order count it', () => {
    /*
     * The anti-double-buy property the aggregate shape was chosen for, which
     * splitting demand by order had to keep
     * (`materials-procurement.ts`, "Why demand is aggregate rather than per
     * order"). Six bricks in stock against four two-brick orders: the first
     * three are already covered and cost nothing, and only the fourth is
     * bought.
     *
     * Mutation: read the supply per order instead of once per pass, and every
     * one of the four sees six bricks, nothing is bought, and three walls never
     * get their materials.
     */
    const { treasury, stock, service } = fixture();
    stock.deposit(BRICK, 6);

    const report = service.procureForPendingOrders(
      [1, 2, 3, 4].map((index) => order(`order-${String(index)}`, need(BRICK, 2))),
      0,
    );

    expect(report.purchased).toEqual([{ itemId: BRICK, quantity: 2, costMinorUnits: 80 }]);
    expect(treasury.balanceMinorUnits).toBe(25_000 - 80);
  });

  it('lets an item nobody sells block its own order and no other', () => {
    /*
     * Rule 3. A content defect -- a buildable requiring `item.sink`, which
     * `validateBuildableItemReferences` permits -- must not be able to stop a
     * prison from building anything else. So the sink order is reported
     * unprocurable, is not called unfunded (the prison is not short of money
     * for it), and the wall behind it is still bought.
     */
    const { treasury, service } = fixture();

    const report = service.procureForPendingOrders(
      [order('order-1', need(SINK, 1)), order('order-2', need(BRICK, 2))],
      0,
    );

    expect(report.unprocurable).toEqual([{ itemId: SINK, quantity: 1, reason: 'unpurchasable' }]);
    expect(report.unfunded).toEqual([]);
    expect(report.purchased).toEqual([{ itemId: BRICK, quantity: 2, costMinorUnits: 80 }]);
    expect(treasury.balanceMinorUnits).toBe(25_000 - 80);
  });

  it('does not buy the affordable half of an order whose other half nobody sells', () => {
    // The same rule from inside one order: atomicity is about the order, not
    // about money, so a line that cannot be bought at any price stops the
    // lines beside it exactly as an unaffordable total would.
    const { treasury, service } = fixture();

    const report = service.procureForPendingOrders([order('order-1', need(BRICK, 2), need(SINK, 1))], 0);

    expect(report.purchased).toEqual([]);
    expect(report.unprocurable).toEqual([{ itemId: SINK, quantity: 1, reason: 'unpurchasable' }]);
    expect(treasury.balanceMinorUnits).toBe(25_000);
  });
});

describe('the arithmetic ADR 0081 section 2 states', () => {
  /**
   * *"This ruling halves the expected requirement and leaves the worst case
   * exactly where it is."*
   *
   * ADR 0081 Decision 2 states that as a table over the thirteen pending wall
   * orders of ADR 0075's locked position, at 80 each, with the segment the
   * player actually needs at rank *r* in the walk and 40 already in the bank:
   *
   * | rule | credit that segment needs |
   * |---|---|
   * | per queue, all-or-nothing (before this ruling) | **1,000** flat |
   * | per order (this ruling) | `80r - 40`, so **40 to 1,000**, expected 520 |
   *
   * Measured here rather than restated as a comment. The credits are found by
   * scanning what the real service and the real `Treasury` actually do, one
   * minor unit at a time; only the three summary figures are literals, and the
   * all-or-nothing figure is the queue's own cost less the 40, which the case
   * above pins from the shipped catalogue.
   */
  const QUEUE = 13;
  const HELD = 40;
  const WALL_COST = 80;

  /**
   * The least credit at which the order at rank `rank` (1-based) is funded,
   * found by scanning what the service actually does rather than by computing
   * it. One minor unit at a time, so the answer is a boundary and not a
   * sampling.
   */
  const creditToFund = (rank: number): number => {
    for (let credit = 0; credit <= QUEUE * WALL_COST; credit += 1) {
      const treasury = new Treasury(HELD + credit);
      const stock = new Container('construction-materials');
      const procurement = new ProcurementSystem(treasury, stock);
      const service = new JustInTimeMaterialsService(procurement, stock, treasury);
      service.procureForPendingOrders(
        Array.from({ length: QUEUE }, (_unused, index) =>
          order(`order-${String(index + 1).padStart(2, '0')}`, need(BRICK, 2)),
        ),
        0,
      );
      /*
       * The walk is the caller's own order here: these are hand-built
       * `QueuedOrderDemand` rows with no `placementSequence`, so ADR 0082's
       * comparator ties them at its sentinel and the id decides -- ascending
       * id, and the ids are zero-padded. So the orders funded are a prefix and
       * their count is the deepest rank reached. Read
       * off the deliveries the real `ProcurementSystem` holds, never off the
       * report, so a report that lied would not be able to answer this.
       */
      if (procurement.pendingDeliveries.length >= rank) return credit;
    }
    throw new Error('the whole queue is fundable at the queue\'s own cost, so this cannot be reached');
  };

  it('costs 80r - 40 to reach the order at rank r, from 40 at the front to 1,000 at the back', () => {
    const credits = Array.from({ length: QUEUE }, (_unused, index) => creditToFund(index + 1));

    expect(credits).toEqual([40, 120, 200, 280, 360, 440, 520, 600, 680, 760, 840, 920, 1_000]);
  });

  it('roughly halves the expected requirement and leaves the worst case exactly where it is', () => {
    const credits = Array.from({ length: QUEUE }, (_unused, index) => creditToFund(index + 1));
    const expectedRequirement = credits.reduce((total, credit) => total + credit, 0) / QUEUE;

    /*
     * All-or-nothing needed the whole queue funded before any of it was, so the
     * credit was the queue's cost less what the prison held -- the same figure
     * whatever rank the segment sat at.
     */
    const allOrNothing = QUEUE * WALL_COST - HELD;
    expect(allOrNothing).toBe(1_000);

    /*
     * **"Halves" is the ADR's word and it is 52%, not 50%**, because the mean
     * of `80r - 40` over thirteen ranks is `80 x 7 - 40`. The exact figure is
     * asserted rather than the round one, so this case cannot be satisfied by
     * an implementation that merely got the order of magnitude right.
     */
    expect(expectedRequirement).toBe(520);
    expect(expectedRequirement / allOrNothing).toBeCloseTo(0.52, 10);

    expect(Math.max(...credits), 'and the worst case did not move').toBe(allOrNothing);
  });
});

describe('a cancel at the same tick used to make the next purchase look like a repeat (#861)', () => {
  /*
   * **This describe block read "the one way a just-in-time purchase id can
   * collide" and asserted the collision as intended behaviour.** Its case is
   * kept, at the same figures, and its conclusion is reversed -- because the
   * case was right about the state and wrong about what is owed in it, and
   * issue #861 is what that cost a player.
   *
   * The sentence it asserted was *"nothing is owed: the bricks are on the road
   * under that id"*. The demand it handed the pass was six bricks against two
   * on the road, so **four were owed**, and the test's own final assertion
   * measured them being bought one tick later. It passed for as long as it did
   * because a shortfall that arrives ten ticks late is invisible to a fixture
   * that steps ten ticks -- and unbounded to a player who stays paused, which
   * is the reading #861 arrived with.
   */
  it('buys what the queue is owed at that same tick, and does not spend twice doing it', () => {
    /*
     * How the state is reached, unchanged from the case this replaces: two
     * purchases at one tick take `jit:7:item.brick:0` and `jit:7:item.brick:2`,
     * since each raises the in-flight total. Cancelling the **first** puts the
     * in-flight total back to 2 without freeing the id that names 2, so a
     * third pass at the same tick composes `jit:7:item.brick:2` again.
     *
     * **Note whose collision this is**: `oneOrder` is `order-1` throughout, so
     * all three passes are the *same build order*. That is why the build
     * order's id is not the discriminator -- see `justInTimePurchaseOrderId` --
     * and it is the reason this case is the sharpest one available rather than
     * an exotic one.
     */
    const { treasury, service, procurement } = fixture();

    service.procureForPendingOrders(oneOrder(need(BRICK, 2)), 7);
    service.procureForPendingOrders(oneOrder(need(BRICK, 4)), 7);
    expect(procurement.pendingDeliveries.map((delivery) => delivery.orderId)).toEqual([
      'jit:7:item.brick:0',
      'jit:7:item.brick:2',
    ]);

    expect(procurement.cancel('jit:7:item.brick:0').ok).toBe(true);
    const afterCancel = treasury.balanceMinorUnits;

    const collided = service.procureForPendingOrders(oneOrder(need(BRICK, 6)), 7);

    expect(collided.purchased, 'six wanted, two on the road, so four are bought -- now, not next tick').toEqual([
      { itemId: BRICK, quantity: 4, costMinorUnits: 160 },
    ]);
    expect(collided.unfunded, 'and nothing is short of money').toEqual([]);
    expect(collided.unprocurable, 'nor is this a content problem').toEqual([]);
    expect(treasury.balanceMinorUnits).toBe(afterCancel - 160);

    /*
     * The id the free-id search reached, asserted as a literal for the reason
     * the case above asserts its ids as literals: the composer is the thing
     * under test. `jit:7:item.brick:2` was taken, so the purchase carries the
     * next id in the sequence.
     */
    expect(procurement.pendingDeliveries.map((delivery) => [delivery.orderId, delivery.quantity])).toEqual([
      ['jit:7:item.brick:2', 2],
      ['jit:7:item.brick:2/1', 4],
    ]);
    expect(justInTimePurchaseOrderId(7, BRICK, 2, 1)).toBe('jit:7:item.brick:2/1');
    expect(justInTimePurchaseOrderId(7, BRICK, 2, 0), 'and an id that never collided is unchanged').toBe('jit:7:item.brick:2');

    /*
     * The other half, and the one that says the fix is not "buy again
     * whenever an id is taken": the pass is run a fourth time at the same tick
     * against the same demand, and the queue is now covered, so it buys
     * nothing. The deficit subtraction is what stops a double buy; the id
     * scheme never was.
     */
    const settled = service.procureForPendingOrders(oneOrder(need(BRICK, 6)), 7);
    expect(settled.purchased, 'six wanted, six on the road').toEqual([]);
    expect(treasury.balanceMinorUnits).toBe(afterCancel - 160);
    expect(procurement.pendingDeliveries).toHaveLength(2);
  });

  it('composes an id a save can hold and a `CancelMaterialPurchase` can name, at every attempt', () => {
    /*
     * **The trap this case exists for, found by reading the schema rather than
     * by a red test.** A purchase order id is an `identifierSchema` in two
     * places that both reach a player: `economySectionSchema`'s
     * `procurement.pending[].orderId`, so an id that fails it cannot be
     * **saved**, and `CancelMaterialPurchase.orderId`, so an id that fails it
     * cannot be **cancelled**. The first draft of #861's fix suffixed with
     * `#`, which that regex rejects -- it would have made the very session it
     * repairs unsaveable, and the whole vitest suite was green on it, because
     * nothing saved a session that had collided.
     *
     * Asserted against `identifierSchema` itself and never against a copy of
     * its character set: a fixture that restated the regex would agree with a
     * separator both halves got wrong (`docs/TESTING.md`).
     */
    expect(identifierSchema.safeParse(justInTimePurchaseOrderId(0, BRICK, 0)).success).toBe(true);
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const composed = justInTimePurchaseOrderId(7, BRICK, 2, attempt);
      expect(identifierSchema.safeParse(composed).success, `${composed} must be nameable by a command and a save`).toBe(true);
    }
    /* The negative control, so a schema that admitted anything would fail here. */
    expect(identifierSchema.safeParse('jit:7:item.brick:2#1').success, 'the separator this case was written about').toBe(false);
  });

  it('leaves `ProcurementSystem`\'s duplicate refusal exactly where it was, for the caller it is written for', () => {
    /*
     * The guard #861's fix narrows is not removed, and this is the level it
     * still stands at: `purchase` refuses an id that is already pending,
     * whoever composed it. That is what protects the player's *Buy* press,
     * whose `order-${crypto.randomUUID()}` id comes from the command
     * (`src/main.ts`) and can genuinely arrive twice -- a route no id this
     * service composes can reach any more.
     *
     * Asked of `ProcurementSystem` directly rather than through the service,
     * because through the service it is now unreachable, which is the whole
     * claim.
     */
    const { treasury, procurement } = fixture();

    const first = procurement.purchase('order-from-a-press', BRICK, 2, 7, 'deliveries');
    expect(first.ok).toBe(true);
    const afterFirst = treasury.balanceMinorUnits;

    const repeat = procurement.purchase('order-from-a-press', BRICK, 2, 7, 'deliveries');
    expect(repeat.ok).toBe(false);
    expect(repeat.ok ? undefined : repeat.reason).toBe('duplicate-order');
    expect(treasury.balanceMinorUnits, 'and the refusal cost nothing').toBe(afterFirst);
    expect(procurement.pendingDeliveries).toHaveLength(1);
  });
});

describe('the report the queue is read through', () => {
  it('is empty before any pass has run, at a tick nothing can have run at', () => {
    const { service } = fixture();
    expect(service.lastReport).toEqual({ tick: -1, purchased: [], unfunded: [], unprocurable: [], nextOrderShortfallMinorUnits: 0 });
  });

  it('is rewritten by every pass, so a shortfall the prison has fixed stops being reported', () => {
    /*
     * The reason `ConstructionSystem.update` calls the sink unconditionally,
     * including with an empty demand. A record with no moment to be cleared is
     * a notice about a queue that emptied ten minutes ago.
     */
    const { service } = fixture(40);
    expect(service.procureForPendingOrders(oneOrder(need(BRICK, 2)), 0).unfunded).toHaveLength(1);
    expect(service.lastReport.unfunded).toHaveLength(1);

    service.procureForPendingOrders([], 10);
    expect(service.lastReport).toEqual({ tick: 10, purchased: [], unfunded: [], unprocurable: [], nextOrderShortfallMinorUnits: 0 });
  });
});

/**
 * The arithmetic of `refundSurplusStock` (#717), in the two states that are
 * cheap here and expensive or unreachable through the kernel.
 *
 * `tests/integration/economy-cancel-into-the-overdraft.test.ts` and
 * `tests/integration/economy-money-conservation.test.ts` drive the press a
 * player makes and are what say the fix works. These are the edges behind it:
 * an item nobody sells, and stock a carry job has already claimed. Neither is
 * reachable from content -- every `BuildableDefinition` in
 * `src/simulation/construction/definition.ts` requires exactly one line, and it
 * is always `item.brick` or `item.wood-plank`, both priced -- so a case that
 * tried to reach them through a session would have to invent a buildable.
 */
describe('what a cancelled order can sell back off the shelf', () => {
  it('sells the surplus at the catalogue price and takes the goods with it', () => {
    const { stock, service, treasury } = fixture();
    stock.deposit(BRICK, 10);
    const balanceBefore = treasury.balanceMinorUnits;

    // Two bricks demanded by what is left of the queue, and two the cancelled
    // order is allowed to sell: 6 stay on the shelf either way.
    expect(service.refundSurplusStock(BRICK, 2, 2)).toBe(80);

    expect(treasury.balanceMinorUnits).toBe(balanceBefore + 80);
    expect(stock.quantityOf(BRICK)).toBe(8);
  });

  it('sells nothing the rest of the queue still wants, whatever the limit says', () => {
    const { stock, service, treasury } = fixture();
    stock.deposit(BRICK, 4);
    const balanceBefore = treasury.balanceMinorUnits;

    expect(service.refundSurplusStock(BRICK, 4, 2), 'demand covers the whole shelf').toBe(0);
    expect(service.refundSurplusStock(BRICK, 6, 2), 'and a queue short of stock is not a surplus').toBe(0);

    expect(treasury.balanceMinorUnits).toBe(balanceBefore);
    expect(stock.quantityOf(BRICK)).toBe(4);
  });

  it('leaves an item the catalogue cannot price on the shelf rather than destroying it', () => {
    /*
     * `refundMaterials` answers `0` for an item nobody sells, and there is no
     * honest money figure for such a line. The rule is
     * `refundAllocatedMaterials`' rule: hand it back rather than destroy it.
     * The mutation this catches is dropping the deposit that puts it back,
     * which withdraws the goods and pays nothing for them.
     */
    const { stock, service, treasury } = fixture();
    stock.deposit(SINK, 3);
    const balanceBefore = treasury.balanceMinorUnits;

    expect(service.refundSurplusStock(SINK, 0, 3)).toBe(0);

    expect(treasury.balanceMinorUnits, 'nothing was credited').toBe(balanceBefore);
    expect(stock.quantityOf(SINK), 'and nothing was destroyed').toBe(3);
  });

  it('will not sell stock a carry job has already reserved', () => {
    /*
     * `Container.availableOf` nets reservations off, and `heldOrInFlightOf`
     * reads the same figure -- so material a `JobSystem` transfer has claimed
     * and not yet picked up is not surplus. Selling it would leave that job
     * withdrawing goods the prison has been paid for.
     */
    const { stock, service, treasury } = fixture();
    stock.deposit(BRICK, 4);
    expect(stock.reserve(BRICK, 4).ok).toBe(true);
    const balanceBefore = treasury.balanceMinorUnits;

    expect(service.refundSurplusStock(BRICK, 0, 4)).toBe(0);

    expect(treasury.balanceMinorUnits).toBe(balanceBefore);
    expect(stock.quantityOf(BRICK)).toBe(4);
    expect(stock.reservedOf(BRICK)).toBe(4);
  });

  it('sells what is on the shelf and not what a reservation has left of it', () => {
    /*
     * The clamp on the sale is `availableOf` and **not** `quantityOf`, and the
     * difference only shows when a delivery is in flight: the surplus counts
     * in-flight goods, so it can exceed what is actually sellable today.
     * Reading the shelf gross would pick a quantity `reserve` then refuses,
     * and the press would give back nothing where it could honestly have given
     * back the two bricks that are free.
     *
     * 2 free of 6 on the shelf, 10 more on the road, no demand left: the
     * cancelled order's limit is 4 and only 2 of it can be sold.
     */
    const { stock, service, treasury, procurement } = fixture();
    stock.deposit(BRICK, 6);
    expect(stock.reserve(BRICK, 4).ok, 'a carry job has claimed four of them').toBe(true);
    expect(procurement.purchase('jit:probe', BRICK, 10, 0, 'construction').ok).toBe(true);
    const balanceBefore = treasury.balanceMinorUnits;

    expect(service.refundSurplusStock(BRICK, 0, 4)).toBe(80);

    expect(treasury.balanceMinorUnits).toBe(balanceBefore + 80);
    expect(stock.quantityOf(BRICK), 'the two free ones left, the four reserved ones stayed').toBe(4);
    expect(stock.reservedOf(BRICK)).toBe(4);
  });

  it('refuses a limit that is not a positive safe integer', () => {
    const { stock, service, treasury } = fixture();
    stock.deposit(BRICK, 4);
    const balanceBefore = treasury.balanceMinorUnits;

    for (const limit of [0, -2, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(service.refundSurplusStock(BRICK, 0, limit), `limit ${String(limit)}`).toBe(0);
    }

    expect(treasury.balanceMinorUnits).toBe(balanceBefore);
    expect(stock.quantityOf(BRICK)).toBe(4);
  });
});
