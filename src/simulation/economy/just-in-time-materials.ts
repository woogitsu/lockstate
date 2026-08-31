import { procurableMaterial } from '../../content/procurement-catalog';
import {
  EMPTY_MATERIALS_PROCUREMENT_REPORT,
  type ConstructionProcurementSink,
  type MaterialsProcurementReport,
  type QueuedOrderDemand,
  type UnfundedMaterial,
  type UnprocurableMaterial,
} from '../construction/materials-procurement';
import type { Container } from '../operations/inventory';
import { MAX_PURCHASE_QUANTITY, type ProcurementSystem } from './procurement';
import type { Treasury } from './treasury';

/**
 * The prefix every purchase this service mints carries.
 *
 * Exported so a test can tell a just-in-time delivery from one the player
 * pressed *Buy* for, and so that `src/main.ts`'s `order-${crypto.randomUUID()}`
 * ids can never collide with one: a UUID does not start with `jit:`.
 *
 * **It has a production reader too since #687, and the sentence above is kept
 * rather than rewritten because it was true when it was written.**
 * `createSessionCommandHandler`'s `CancelMaterialPurchase` branch asks
 * `isJustInTimePurchaseOrderId` the same question a test used to ask alone: a
 * delivery this service bought is the *build queue's* money and cancelling it
 * has to withdraw the demand behind it, while a delivery the player pressed
 * *Buy* for is stock they chose to hold and cancelling it must touch no order
 * at all. Telling the two apart is therefore no longer only a diagnostic.
 */
export const JUST_IN_TIME_ORDER_ID_PREFIX = 'jit:';

/**
 * Whether `orderId` names a delivery this service bought for the build queue.
 *
 * A prefix test rather than a stored flag, for the reason
 * `justInTimePurchaseOrderId` composes the id from state instead of minting
 * one: `PendingDelivery` is persisted (`src/persistence/save-schema.ts`'s
 * `economySectionSchema`), and a new field on it would be a save-format change
 * to record something the id already says. Every purchase this service makes
 * goes through `justInTimePurchaseOrderId`, and nothing else in the repository
 * composes an id beginning `jit:` -- `src/main.ts` mints
 * `order-${crypto.randomUUID()}`.
 */
export function isJustInTimePurchaseOrderId(orderId: string): boolean {
  return orderId.startsWith(JUST_IN_TIME_ORDER_ID_PREFIX);
}

/**
 * The purchase order id one just-in-time purchase carries.
 *
 * `jit:<tick>:<itemId>:<inFlightBefore>` -- and the fourth part is the one
 * that needs arguing. The first three are not unique on their own: a dragged
 * wall run submits several `PlaceBuildOrder` commands, the kernel dispatches
 * every command due at a tick before any system runs, and each of them buys
 * the *incremental* deficit its own order added. Two purchases of the same
 * item at the same tick are therefore ordinary, and `ProcurementSystem`
 * refuses the second as a `duplicate-order` -- which would have stranded the
 * second wall for ever while reporting nothing.
 *
 * `inFlightBefore` -- the quantity of that item already paid for and not yet
 * unloaded, at the moment this purchase is composed -- separates them, because
 * every purchase raises it by at least one. It is strictly increasing within a
 * tick, it is a function of state the save already carries, and it involves no
 * counter, no clock and no UUID (`docs/DETERMINISM.md` forbids the last two in
 * simulation state).
 *
 * It also gives `duplicate-order` back its honest meaning: the only way to
 * collide now is to compose *this same purchase again at this same tick
 * against this same in-flight total*, which is a restored session re-running
 * the tick it was saved on. That is a purchase which already stands, so the
 * caller treats it as satisfied rather than as a refusal.
 */
export function justInTimePurchaseOrderId(tick: number, itemId: string, inFlightBefore: number): string {
  return `${JUST_IN_TIME_ORDER_ID_PREFIX}${tick}:${itemId}:${inFlightBefore}`;
}

/**
 * Buys what the build queue needs and the prison does not have
 * ([ADR 0017](../../../docs/adr/0017-money-primary-resource-model.md)
 * decision 7, issue #627).
 *
 * ## The deficit, and why all three terms are in it
 *
 * For each item the queue wants:
 *
 * ```
 * deficit = demanded - availableInTheContainer - alreadyPaidForAndInFlight
 * ```
 *
 * - **`availableInTheContainer`** is `Container.availableOf`, which nets off
 *   reservations. Stock a live order has already allocated is not in it --
 *   `ContainerMaterialsProvider.tryAllocate` withdraws -- so allocated
 *   material is neither counted as held nor as demanded, which is what makes
 *   the two sides of this subtraction comparable.
 * - **`alreadyPaidForAndInFlight`** is every pending delivery of that item,
 *   *including the ones the player bought themselves*. Without it the pass
 *   would buy the same bricks again on each of the ten construction ticks that
 *   fit inside `PROCUREMENT_DELIVERY_DELAY_TICKS`, and it would buy over the
 *   top of a player who pressed *Buy* a moment earlier. Holding is permitted
 *   and this term is what stops it being punished.
 *
 * A non-positive deficit buys nothing at all. That is the whole of "a player
 * who pre-buys sees no change".
 *
 * ## When it runs
 *
 * Twice over, and the second is not redundant:
 *
 * - **On the `PlaceBuildOrder` that created the demand**, at the tick of the
 *   press, so the money leaves when the player places the wall. That is the
 *   owner's own wording of what an order should mean (#627: *"it should buy
 *   itself when I place a wall"*), and it is what puts a shortfall on the
 *   alert band at the moment the player can still act on it (#629).
 * - **On every scheduled construction tick**, which is the safety net and
 *   covers the routes no press reaches: a save restored from a build that had
 *   none of this, an order returned to `'approved'` by `redo()`, a
 *   just-in-time delivery the player cancelled through
 *   `CancelMaterialPurchase`, and -- the one that matters most for
 *   playability -- an order that could not be funded at the press and becomes
 *   affordable later, when the state pays. A prison that is broke queues its
 *   walls and builds them when the money arrives, rather than losing them.
 *
 * **The cancellation route in that list stopped being reachable in #687, and
 * the sentence is kept rather than deleted because it describes what this
 * class still does.** This pass has always re-bought a cancelled delivery --
 * that is the whole of the safety net and it is not a defect -- and issue #687
 * measured what it costs: with the clock stopped a fifteen-segment wall run
 * refunds in full, `23,800 -> 24,760`, and six seconds after *Play* the same
 * treasury reads `23,800` again, because the fifteen orders are still queued
 * and this pass dutifully buys their bricks a second time. The one control in
 * the game that credits the treasury was undone by the button that starts it.
 * The fix is on the *demand* side and not here: `CancelMaterialPurchase`
 * now withdraws build orders until the queue no longer has to buy the material
 * back (`ConstructionSystem.withdrawOrdersAwaitingMaterial`), so by the time
 * this pass next runs there is no deficit left for it to find. Nothing about
 * the pass changed, and the three other routes are untouched.
 *
 * **And the sentence above about the four routes is complete only for a prison
 * that can pay in one lump, which #687's remainder is where it shows.** This
 * pass buys the whole per-item deficit in a single
 * `ProcurementSystem.purchase`, and `Treasury.spend` refuses what it cannot
 * cover **entirely**, so there is no partial buy: a prison holding 300 against
 * a deficit of eight bricks at 40 buys nothing, not seven. That is ordinary
 * while nothing else was paying, and it becomes visible the moment a delivery
 * the *player* bought was covering part of the queue -- because such a delivery
 * is a purchase already made at a price the prison could once afford, which
 * this pass can no longer reproduce. Cancelling it therefore hands back money
 * the queue cannot spend: measured, a prison drained to **265 of spending
 * power** that buys six bricks, draws four wall segments and then cancels the
 * purchase ends with **all 265 and no walls**, where the same prison that does
 * not cancel ends with 25 and three walls standing
 * (`tests/integration/economy-refund-survives-the-clock.test.ts`, *"stalls a
 * whole queue the prison can no longer fund in one lump, and one press undoes
 * that"*).
 *
 * **Those two figures read *"300 held"* and *"60 held"* until 2026-08-31, and
 * the paragraph above is otherwise unchanged.** #703 ruling A opened a standing
 * overdraft on every treasury, so "held" and "can spend" came apart; the fixture
 * reaches the same relationship -- 265 against a 320 deficit -- at a balance of
 * `-2,235`. The clause *"a prison holding 300 against a deficit of eight bricks
 * at 40 buys nothing, not seven"* is the general statement and it is unaffected:
 * `Treasury.spend` still refuses what it cannot cover entirely, and only the
 * number it compares against moved.
 *
 * **What the ruling does add here, and it is the load-bearing half for whoever
 * takes ADR 0081's partial fill.** This all-or-nothing refusal is currently the
 * only thing bounding how much of a prison's overdraft an unfunded build queue
 * can eat with no press: a queue costing more than the facility buys **nothing**
 * and the prison sits where it is. Measured,
 * `scripts/report-loan-recovery-pricing.mjs` §10c: at the shipped floor of
 * `-2,500`, a twenty-order tail costing 1,600 already strands a prison at
 * `-1,625` with no capacity and no income, and a forty-order tail costing 3,200
 * strands nothing at all because this pass refuses the lump. Buying what the
 * prison *can* afford would remove that bound in both directions.
 *
 * **THAT PARAGRAPH IS NOW WRONG IN ITS LOAD-BEARING HALF AND IS KEPT BECAUSE
 * IT IS WHAT THE RULING WAS TAKEN AGAINST.** Measured on `c6cd3e3` by tagging
 * every `ConstructionSystem.procureQueuedMaterials` call with its caller, over
 * `scripts/report-loan-recovery-pricing.mjs` §10c's whole sweep: the scheduled
 * pass -- the one that spends *"with no press"* -- spent **0** in every one of
 * the five runs, and the `PlaceBuildOrder` presses spent **27,440** across 343
 * purchases. The all-or-nothing refusal was therefore not bounding an unpressed
 * drain, because there was no unpressed drain to bound: a press buys the
 * *increment* its own order adds, and an increment is one wall, so the walk to
 * −2,440 §10c reports was already per order and already pressed for. What
 * all-or-nothing actually bounded is the **residual** -- what a queue too big to
 * fund in one lump leaves unspent -- and that is what `procureForPendingOrders`
 * below says it moves, and by how much.
 *
 * **Recorded rather than fixed, and the reason is that the remedy is a
 * decision about money.** No value is lost and no promise is broken -- the
 * refund is not reversed in that sequence, so the procurement fold's sentence
 * is true there -- and the state is recoverable by one `CancelBuildOrder`,
 * which brings the demand under what the balance buys and reaches the
 * non-cancelling outcome exactly. Buying what the prison *can* afford instead
 * closes the asymmetry -- measured against the same fixture, both branches then
 * reach three walls -- and costs 40 more of the treasury for them, spending
 * liquidity down toward the floor
 * [ADR 0075](../../../docs/adr/0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md)
 * is about. Which of the two a prison is owed is that ADR's question and
 * `issue #29`'s numbers, so it is put up rather than taken here.
 *
 * **"Toward the floor" was a figure of speech and is now literal**, which is
 * the one thing #703 ruling A changed about this paragraph: the floor is
 * `TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS` and there is 2,500 of it under every
 * prison. The decision is still ADR 0081's and still not taken here.
 *
 * **AND THE DECISION HAS SINCE BEEN TAKEN, ELSEWHERE AND NOT HERE, WHICH IS
 * WHY EVERY PARAGRAPH ABOVE IS MARKED RATHER THAN DELETED.** #703 ruling 9 --
 * *"kupować tyle, ile stać"* -- chose partial fill, and ruling 12 -- *"na
 * zlecenie"* -- chose the ORDER as the unit it is filled at. Both are recorded
 * in ADR 0081 Decision 1 and 2. `procureForPendingOrders` implements them, and
 * its own docblock carries the three rules, the measurement that says what they
 * bound, and the one thing they deliberately do not bound. Three sentences
 * above are now false of this class and are worth naming individually, because
 * each is quoted somewhere else in this corpus:
 *
 * - *"This pass buys the whole per-item deficit in a single
 *   `ProcurementSystem.purchase`"* -- it now makes one purchase per item **per
 *   funded order**. The *supply* subtraction is still made once per item per
 *   pass, so the total bought in a pass is unchanged; only the funding decision
 *   moved.
 * - *"there is no partial buy"* -- there is, at the order.
 * - *"a prison holding 300 against a deficit of eight bricks at 40 buys
 *   nothing, not seven"* -- it now buys six, which is three whole two-brick
 *   wall orders, and **not** seven: seven bricks is three walls and half of a
 *   fourth, and half a wall is what ruling 12 chose against.
 *   `Treasury.spend` is still strictly all-or-nothing and
 *   `ProcurementSystem.purchase` still spends the whole figure or none of it;
 *   what changed is the size of the figure they are handed.
 *
 * See `justInTimePurchaseOrderId` for why two purchases of one item at one
 * tick do not collide.
 *
 * ## What it does not do
 *
 * **It never credits the treasury.** There is no refund path here, in either
 * direction, and that is deliberate: a build order cancelled while its
 * just-in-time delivery is in flight leaves the delivery alone, so the money
 * became goods and the goods arrive as stock the next order draws from.
 * Refunding instead would put a `buy -> cancel -> refund` loop next to
 * `ConstructionSystem.cancelOrder`'s material release, which
 * [ADR 0076](../../../docs/adr/0076-what-happens-to-a-resident-whose-bed-is-taken-away.md)
 * names as the implementation hazard of the same shape and
 * `tests/integration/economy-money-conservation.test.ts` measures as M2.
 *
 * **It records rather than refuses.** The order stays in
 * `'materials-pending'`; what changes is that `lastReport` now says the queue
 * is stalled on *money* rather than on nothing. ADR 0017 decision 2 requires
 * the purchase to be refusable, and `Treasury.spend` already refuses it; this
 * class is what makes that refusal observable outside the tick it happened on.
 */
export class JustInTimeMaterialsService implements ConstructionProcurementSink {
  private report: MaterialsProcurementReport = EMPTY_MATERIALS_PROCUREMENT_REPORT;

  /**
   * `treasury` is read and never written here.
   *
   * The only call is `canAfford`, and it is what makes an order atomic: a
   * two-material order has to be known affordable **before** its first line is
   * bought, or the pass would spend on bricks for a door whose plank it then
   * refuses (#703 ruling 12). `ProcurementSystem.purchase` cannot answer that
   * question -- it decides one line at a time, which is the granularity ruling
   * 12 chose *against* -- and asking it by buying and rolling back would put a
   * credit path in this class, which the "What it does not do" section below
   * forbids for a reason that has not changed.
   */
  public constructor(
    private readonly procurement: ProcurementSystem,
    private readonly stock: Container,
    private readonly treasury: Treasury,
  ) {}

  /**
   * What the most recent pass did.
   *
   * Rewritten by **every** pass -- the one on the press that placed an order
   * and the one on every scheduled construction tick, including the ticks with
   * nothing to buy -- so it is never stale: a queue that drains reports an
   * empty `unfunded` within ten ticks rather than leaving the last shortfall
   * standing. Before the first pass it reads `tick: -1` and three empty lists,
   * which is a real tick nothing can have run at.
   *
   * **Not snapshotted, deliberately, and it needs no save-schema field.** It
   * is a function of the container, the pending deliveries and the order book
   * -- all three of which *are* in the save -- recomputed within ten ticks of
   * any restore. Persisting it would carry a claim about money into a session
   * whose balance may since have changed, which is the same argument
   * `RefusalLog` makes for not being snapshotted.
   */
  public get lastReport(): MaterialsProcurementReport {
    return this.report;
  }

  /**
   * Funds as many whole orders as the treasury covers, in the walk it is
   * handed (#703 rulings 9 and 12, ADR 0081 Decision 1 and 2).
   *
   * ## The three rules, and which of them is a bound
   *
   * 1. **Per order, whole or not at all.** `this.treasury.canAfford` is asked
   *    once for the order's *whole* remainder before any of its lines is
   *    bought. This is the only new bound this pass has and it is a real one:
   *    without it a partly filled pass would buy the affordable half of a
   *    two-material order and spend money on materials that can never finish
   *    anything.
   * 2. **An order the balance does not cover is skipped, not stopped on.** The
   *    walk continues to the next order. Stopping instead would have been the
   *    more conservative rule and it was measured against ADR 0081 Decision 2's
   *    own criterion -- *"the answer to 'why did that get built and not this?'
   *    is a sentence the player could have predicted before pressing"* -- and
   *    it loses: under a stop, a queue with one expensive order in it funds
   *    nothing whenever that order happens to fall early in an ascending-**id**
   *    walk the player cannot see, and funds everything when it falls late.
   *    Skipping answers *"because you could afford that one"*, which does not
   *    depend on the draw. It is also the reading of §2's own wording, *"as
   *    many whole orders as the balance covers"*, and it is the only one of the
   *    two that never funds **less** than the aggregate pass this replaced.
   * 3. **A refusal that is not money never stops or skips anything else.** An
   *    item nobody sells, or a quantity past `MAX_PURCHASE_QUANTITY`, blocks
   *    the order it belongs to and no other: a content defect must not be able
   *    to stop a prison from building.
   *
   * ## What bounds how far this can take a prison, and what does not
   *
   * **Not this method, and the honest answer is that it never did.** The
   * paragraph in the class docblock above records the belief that
   * all-or-nothing was *"the only thing bounding how much of a prison's
   * overdraft an unfunded build queue can eat with no press"*. Measured on
   * `c6cd3e3`, before this change, by tagging every `procureQueuedMaterials`
   * call with whether it came from `ConstructionSystem.update` or from the
   * `PlaceBuildOrder` command handler, over `scripts/report-loan-recovery-pricing.mjs`
   * §10c's whole sweep (tails of 13, 20, 31, 40 and 60 orders): the scheduled
   * pass spent **0** in every run and the presses spent **27,440** across 343
   * purchases. The walk to −2,440 that section reports was *entirely* pressed
   * for, one order at a time, because the deficit a press sees is the increment
   * its own order added and an increment is one wall.
   *
   * Two things do bound it, and both are outside this method:
   *
   * - **The queue's own cost.** A pass buys the aggregate deficit or a subset
   *   of it, never more, and the deficit is finite and falls as deliveries
   *   land. Partial fill changes *when* the queue's cost is spent and never
   *   *whether*: the same orders cost the same money under either rule.
   * - **`TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS`**, which every `spend` passes
   *   through one comparison in `Treasury.canAfford`. §10c measures `floor
   *   breaches` at 0 in every run.
   *
   * **What this change really moves is the residual**, and it is stated rather
   * than bounded here. Under all-or-nothing a queue the prison could not fund
   * in one lump left the *whole* balance unspent; under partial fill it leaves
   * less than the cheapest unfunded order costs. That residual is the liquidity
   * ADR 0075's locked position needs to buy its way out, and **naming how much
   * of it a prison is owed is a balance value**, which ADR 0017 decision 5
   * reserves to the owner with the rest of #29. So no reserve is invented here.
   * ADR 0081's Consequences ask *"whether that needs a bound of its own"* and
   * leave it open; this method is written so that adding one later is a
   * condition on `canAfford` and nothing else.
   *
   * ## Determinism
   *
   * The walk order is the caller's and is canonical
   * (`ConstructionSystem.orderedOrders()`, ascending id). Within an order the
   * requirements are re-sorted by item id here rather than trusted, exactly as
   * this method used to re-sort the aggregate demand and for the same reason
   * (`docs/DETERMINISM.md`, "Canonical iteration order") -- although under
   * rule 1 that sort no longer decides *what* is bought, only the order the
   * lines are bought in and therefore the ids they carry.
   */
  public procureForPendingOrders(demand: readonly QueuedOrderDemand[], tick: number): MaterialsProcurementReport {
    const purchased = new Map<string, UnfundedMaterial>();
    const unfunded = new Map<string, UnfundedMaterial>();
    const unprocurable: UnprocurableMaterial[] = [];

    /*
     * Supply no order earlier in this walk has already claimed.
     *
     * Read once per item id per pass -- `availableOf` nets off reservations,
     * `inFlightOf` counts every pending delivery whoever bought it -- and then
     * handed out along the walk. This is the aggregate subtraction the class
     * docblock describes, distributed rather than replaced: the total this
     * pass buys is still the aggregate deficit, so a `materials-pending` order
     * retried on each of the ten ticks its delivery is in flight still buys
     * nothing the second time.
     *
     * Lazily filled, and safe to be: an item is only ever purchased for an
     * order that has already claimed against it, so no entry can be
     * initialised from an in-flight total this pass itself created.
     */
    const unclaimed = new Map<string, number>();
    const unclaimedOf = (itemId: string): number => {
      const known = unclaimed.get(itemId);
      if (known !== undefined) return known;
      const supply = this.stock.availableOf(itemId) + this.inFlightOf(itemId);
      unclaimed.set(itemId, supply);
      return supply;
    };
    const add = (into: Map<string, UnfundedMaterial>, line: UnfundedMaterial): void => {
      const standing = into.get(line.itemId);
      into.set(line.itemId, standing === undefined
        ? line
        : {
            itemId: line.itemId,
            quantity: standing.quantity + line.quantity,
            costMinorUnits: standing.costMinorUnits + line.costMinorUnits,
          });
    };

    for (const order of demand) {
      const lines: UnfundedMaterial[] = [];
      let orderCostMinorUnits = 0;
      /* Set by a refusal that is not money. See rule 3: it blocks this order and nothing else. */
      let blocked = false;

      for (const requirement of [...order.requirements].sort((left, right) =>
        left.itemId < right.itemId ? -1 : left.itemId > right.itemId ? 1 : 0,
      )) {
        if (requirement.quantity <= 0) continue;
        const supply = unclaimedOf(requirement.itemId);
        const claimed = Math.min(supply, requirement.quantity);
        /*
         * Claimed whether or not this order turns out to be affordable.
         * `ContainerMaterialsProvider.tryAllocate` walks the same ascending-id
         * order, so stock really does go to the earlier order; letting a later
         * one count it as well would buy bricks that already have a claimant.
         */
        unclaimed.set(requirement.itemId, supply - claimed);
        const shortfall = requirement.quantity - claimed;
        if (shortfall <= 0) continue;

        const material = procurableMaterial(requirement.itemId);
        if (material === undefined) {
          unprocurable.push({ itemId: requirement.itemId, quantity: shortfall, reason: 'unpurchasable' });
          blocked = true;
          continue;
        }
        if (shortfall > MAX_PURCHASE_QUANTITY) {
          /*
           * Pre-empted rather than left to `ProcurementSystem.purchase`, which
           * is where it used to be answered: the cost of a quantity past that
           * bound is what rule 1 would hand to `canAfford`, and a product that
           * has left the safe-integer range is not a figure to compare a
           * balance against. Same outcome, one step earlier.
           */
          unprocurable.push({ itemId: requirement.itemId, quantity: shortfall, reason: 'quantity-refused' });
          blocked = true;
          continue;
        }

        const costMinorUnits = material.unitPriceMinorUnits * shortfall;
        lines.push({ itemId: requirement.itemId, quantity: shortfall, costMinorUnits });
        orderCostMinorUnits += costMinorUnits;
      }

      /*
       * Rule 1, and the only place this pass decides to spend. `blocked` gets
       * the same treatment as an unaffordable order at the purchase and a
       * different one in the report: the lines are not bought, and they are not
       * called `unfunded` either, because the prison is not short of money for
       * them and telling the player it is would be a sentence that is false.
       */
      if (blocked || lines.length === 0) continue;
      if (!this.treasury.canAfford(orderCostMinorUnits)) {
        for (const line of lines) add(unfunded, line);
        continue;
      }

      for (const line of lines) {
        const inFlightBefore = this.inFlightOf(line.itemId);
        const outcome = this.procurement.purchase(
          justInTimePurchaseOrderId(tick, line.itemId, inFlightBefore),
          line.itemId,
          line.quantity,
          tick,
        );
        if (outcome.ok) {
          add(purchased, { itemId: line.itemId, quantity: line.quantity, costMinorUnits: outcome.paidMinorUnits });
          continue;
        }
        switch (outcome.reason) {
          case 'insufficient-funds':
            /*
             * Unreachable while `canAfford` above is the same comparison
             * `spend` makes over the same treasury, and recorded rather than
             * ignored for the reason `unknown-material` is: the day the two
             * stop being one comparison, this says so instead of an order
             * silently going half bought.
             */
            add(unfunded, line);
            break;
          case 'invalid-quantity':
            unprocurable.push({ itemId: line.itemId, quantity: line.quantity, reason: 'quantity-refused' });
            break;
          case 'unknown-material':
            // Unreachable while `procurableMaterial` above is the same table
            // `ProcurementSystem` reads, and recorded rather than ignored so that
            // the day the two tables stop being the same one, this says so
            // instead of the item silently vanishing from the report.
            unprocurable.push({ itemId: line.itemId, quantity: line.quantity, reason: 'unpurchasable' });
            break;
          case 'duplicate-order':
            // This exact purchase already stands -- see `justInTimePurchaseOrderId`
            // for the one shape that reaches here and for why it cannot be an
            // ordinary second purchase at the same tick. The materials are on the
            // road under that id, so nothing is owed and nothing is refused, and
            // the next tick composes a different id if any shortfall remains.
            // `tests/unit/construction-just-in-time-materials.test.ts` constructs
            // the state and measures both halves.
            break;
        }
      }
    }

    /* Ascending item id, which is `MaterialsProcurementReport`'s stated contract. */
    const byItemId = (entries: Map<string, UnfundedMaterial>): readonly UnfundedMaterial[] =>
      [...entries.keys()].sort().map((itemId) => entries.get(itemId)!);

    this.report = { tick, purchased: byItemId(purchased), unfunded: byItemId(unfunded), unprocurable };
    return this.report;
  }

  /**
   * The supply half of this class's own subtraction, without the purchase.
   *
   * `ConstructionProcurementSink.heldOrInFlightOf` states what it is for. The
   * two terms are exactly the two `procureForPendingOrders` subtracts from
   * demand and they are read here from the same two sources, so a caller
   * comparing its demand against this figure is asking the question this pass
   * will ask -- not a second opinion about it.
   */
  public heldOrInFlightOf(itemId: string): number {
    return this.stock.availableOf(itemId) + this.inFlightOf(itemId);
  }

  /** Everything of `itemId` that has been paid for and not yet unloaded, whoever bought it. */
  private inFlightOf(itemId: string): number {
    let total = 0;
    for (const delivery of this.procurement.pendingDeliveries) {
      if (delivery.itemId === itemId) total += delivery.quantity;
    }
    return total;
  }
}
