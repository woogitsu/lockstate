import { procurableMaterial } from '../../content/procurement-catalog';
import type { MaterialRequirement } from '../construction/definition';
import {
  EMPTY_MATERIALS_PROCUREMENT_REPORT,
  type ConstructionProcurementSink,
  type MaterialsProcurementReport,
  type UnfundedMaterial,
  type UnprocurableMaterial,
} from '../construction/materials-procurement';
import type { Container } from '../operations/inventory';
import type { ProcurementSystem } from './procurement';

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
 * the queue cannot spend: measured, a prison drained to 300 that buys six
 * bricks, draws four wall segments and then cancels the purchase ends with
 * **300 held and no walls**, where the same prison that does not cancel ends
 * with 60 held and three walls standing
 * (`tests/integration/economy-refund-survives-the-clock.test.ts`, *"stalls a
 * whole queue the prison can no longer fund in one lump, and one press undoes
 * that"*).
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

  public constructor(
    private readonly procurement: ProcurementSystem,
    private readonly stock: Container,
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

  public procureForPendingOrders(demand: readonly MaterialRequirement[], tick: number): MaterialsProcurementReport {
    const purchased: UnfundedMaterial[] = [];
    const unfunded: UnfundedMaterial[] = [];
    const unprocurable: UnprocurableMaterial[] = [];

    /*
     * Re-sorted here rather than trusted, exactly as
     * `ConstructionSystem.orderedOrders` and `projectBuildQueue` re-sort what
     * they are handed and for the same reason (`docs/DETERMINISM.md`,
     * "Canonical iteration order"). The order decides *which* material an
     * insufficient balance buys and which it refuses, so it is a fact about
     * money and not about presentation -- and a caller that changed its mind
     * about ordering would otherwise change what a prison owns without
     * touching a line of this file.
     */
    for (const requirement of [...demand].sort((left, right) => (left.itemId < right.itemId ? -1 : left.itemId > right.itemId ? 1 : 0))) {
      const inFlight = this.inFlightOf(requirement.itemId);
      const deficit = requirement.quantity - this.stock.availableOf(requirement.itemId) - inFlight;
      if (deficit <= 0) continue;

      const material = procurableMaterial(requirement.itemId);
      if (material === undefined) {
        unprocurable.push({ itemId: requirement.itemId, quantity: deficit, reason: 'unpurchasable' });
        continue;
      }

      const costMinorUnits = material.unitPriceMinorUnits * deficit;
      const outcome = this.procurement.purchase(
        justInTimePurchaseOrderId(tick, requirement.itemId, inFlight),
        requirement.itemId,
        deficit,
        tick,
      );
      if (outcome.ok) {
        purchased.push({ itemId: requirement.itemId, quantity: deficit, costMinorUnits: outcome.paidMinorUnits });
        continue;
      }
      switch (outcome.reason) {
        case 'insufficient-funds':
          unfunded.push({ itemId: requirement.itemId, quantity: deficit, costMinorUnits });
          break;
        case 'invalid-quantity':
          unprocurable.push({ itemId: requirement.itemId, quantity: deficit, reason: 'quantity-refused' });
          break;
        case 'unknown-material':
          // Unreachable while `procurableMaterial` above is the same table
          // `ProcurementSystem` reads, and recorded rather than ignored so that
          // the day the two tables stop being the same one, this says so
          // instead of the item silently vanishing from the report.
          unprocurable.push({ itemId: requirement.itemId, quantity: deficit, reason: 'unpurchasable' });
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

    this.report = { tick, purchased, unfunded, unprocurable };
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
