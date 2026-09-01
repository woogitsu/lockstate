import type { MaterialRequirement } from './definition';

/**
 * One item the build queue needs and the prison could not get for money.
 *
 * `costMinorUnits` is what the catalogue charged for `quantity` at the moment
 * of the attempt -- `unitPriceMinorUnits * quantity`, the exact figure the
 * treasury refused to part with, never a running total and never an estimate.
 * It is on this record because the amount is the only actionable half: "you
 * are short 3,200" is a sentence a player can do something about and "you are
 * short bricks" is not. Issue #627 is precisely a player looking at 25,000 and
 * a shortfall of 3,200 with nothing on screen relating the two.
 */
export interface UnfundedMaterial {
  readonly itemId: string;
  readonly quantity: number;
  readonly costMinorUnits: number;
}

/**
 * Why an item the queue needed was not bought, when it was not money.
 *
 * Kept apart from `UnfundedMaterial` because conflating them would let a
 * content defect read to the player as poverty. `'unpurchasable'` means
 * nothing sells the item: `validateBuildableItemReferences` checks that a
 * requirement names a *declared* item and never that it has a row in
 * `src/content/procurement-catalog.ts`, so a buildable requiring `item.sink`
 * lands here. `'quantity-refused'` means the deficit failed
 * `ProcurementSystem`'s own bound, `MAX_PURCHASE_QUANTITY`.
 */
export interface UnprocurableMaterial {
  readonly itemId: string;
  readonly quantity: number;
  readonly reason: 'unpurchasable' | 'quantity-refused';
}

/**
 * What one just-in-time pass did.
 *
 * Every list is in ascending item id, because the pass that produces it walks
 * demand in that order and a purchase writes simulation state
 * (`docs/DETERMINISM.md`).
 *
 * **`purchased` and `unfunded` can now both be non-empty for one pass, and
 * before #703 ruling 9 they could not.** A pass used to buy a per-item lump or
 * refuse it, so an item appeared in exactly one of the two lists; it now funds
 * whole orders one at a time out of what the treasury covers, so the same item
 * id is routinely bought for one order and refused for the next. A consumer
 * that read a non-empty `purchased` as "the queue is paid for" was correct
 * until that ruling and is not any more --
 * `construction/handler.ts`'s `reportMaterialsFunding` reads `unfunded` alone
 * and is therefore unaffected, which is the reason it is worth saying here.
 *
 * The two lists are still **per item id**, aggregated across every order the
 * pass walked, rather than per order. That keeps `shortfallMinorUnits` on
 * `BuildQueueMaterialsFundingViewModel` meaning what it has always meant --
 * what the queue still needs, whole -- so no player-facing figure changed its
 * subject under ruling 9.
 */
export interface MaterialsProcurementReport {
  readonly tick: number;
  /**
   * Bought on this pass, summed per item id over every order that was funded.
   * Empty when the prison already held, or already had coming, everything the
   * queue wants -- and, since ruling 9, also empty when the very first order
   * the walk reached was already beyond the balance.
   */
  readonly purchased: readonly UnfundedMaterial[];
  /**
   * Wanted, priced, and not bought because the treasury did not cover the
   * order it belonged to. This is ADR 0017 decision 2's refusal, made
   * observable.
   *
   * **Summed over every order the pass left unfunded, not only the first.** A
   * partly filled pass funds a subset of the queue, and the figure the panel
   * shows has to stay "what the queue still needs" rather than becoming "what
   * the next order needs" -- otherwise ruling 9 would have quietly shrunk a
   * number the player reads without anybody deciding that it should.
   */
  readonly unfunded: readonly UnfundedMaterial[];
  /** Wanted and not buyable at all, for a reason that is not money. */
  readonly unprocurable: readonly UnprocurableMaterial[];
}

/** A pass that found nothing to do, and the value `lastReport` holds before any pass has run. */
export const EMPTY_MATERIALS_PROCUREMENT_REPORT: MaterialsProcurementReport = Object.freeze({
  tick: -1,
  purchased: Object.freeze([]),
  unfunded: Object.freeze([]),
  unprocurable: Object.freeze([]),
});

/**
 * One order in the build queue's walk, and everything it still has to be given
 * before it can be built.
 *
 * **The unit of atomicity for a partly filled purchase** (#703 ruling 12, in
 * the owner's words *"na zlecenie"*;
 * [ADR 0081](../../../docs/adr/0081-whether-a-purchase-may-be-partly-filled.md)
 * Decision 2). A sink funds an order's `requirements` whole or not at all, so a
 * door never takes delivery of its bricks and waits for ever on a plank the
 * treasury could not cover.
 *
 * `requirements` is the buildable's own `materialsRequired`, unreduced: what
 * the *prison* already holds or has already paid for is the sink's subtraction
 * to make, exactly as it was when this port carried one aggregated figure per
 * item id, and a caller that pre-reduced would be making it twice.
 *
 * `orderId` is carried for the walk's identity rather than for arithmetic --
 * nothing keys money off it, and no purchase this produces records it. It is
 * here because "which order was funded" is the question ruling 12 makes
 * answerable, and because a report that could not name the order would leave
 * `docs/AGENT_WORKFLOW.md`'s *"why did that get built and not this?"* answerable
 * only by re-deriving the walk.
 */
export interface QueuedOrderDemand {
  readonly orderId: string;
  readonly requirements: readonly MaterialRequirement[];
}

/**
 * Where the build queue's unmet material demand goes to be bought.
 *
 * ## What this exists for
 *
 * [ADR 0017](../../../docs/adr/0017-money-primary-resource-model.md) decision 7
 * is accepted and says **"materials are just-in-time by default; holding is
 * permitted, never required."** Until this port existed the code required
 * holding: `ConstructionSystem.update` asked `tryAllocate` for materials the
 * container did not have, got `false`, and parked the order in
 * `'materials-pending'` to be retried on every scheduled tick for the rest of
 * the session. A player who had never separately pressed *Buy* had no route to
 * a wall at all -- which issue #627 records the owner hitting live, with 25,000
 * unspent in the bank and forty ghosted walls on the map.
 *
 * So this is the missing arrow: the queue's demand reaches procurement, a
 * purchase happens, and the delivery lands in the very container `tryAllocate`
 * draws from. Nothing about holding changes -- a player who pre-buys sees the
 * deficit come out at zero or less and no purchase made.
 *
 * ## Why demand is aggregate rather than per order
 *
 * **This heading is kept and the paragraph under it is still the reason the
 * *supply* side is aggregate. What stopped being true on 2026-08-31 is the
 * heading itself: `demand` is now per order.** #703 ruling 12 made the ORDER
 * the unit of atomicity (ADR 0081 Decision 2), so what follows is the half that
 * survives, and the half that replaced it is stated after it rather than
 * instead of it.
 *
 * The obvious shape -- "the order that could not allocate buys what it needs"
 * -- double-buys, and not in a corner case. A purchase takes
 * `PROCUREMENT_DELIVERY_DELAY_TICKS` to arrive, which is ten construction
 * ticks, and a `materials-pending` order is retried on every one of them; and
 * order ids are `order-${crypto.randomUUID()}` (`src/main.ts`), so
 * `orderedOrders()`'s walk was **not** placement order and a later
 * order could take delivery of an earlier one's bricks and send it back to buy
 * again. (**ADR 0082 (#722) made that walk placement-ordered on 2026-08-31**,
 * and the sentence is kept in the past tense because the double-buy it
 * describes never depended on the walk being *random* -- any walk in which a
 * later order is reached first produces it, and this one still has later
 * orders.) Both disappear when the question is asked once over the whole queue:
 * what does everything still waiting need, against what the prison holds *and*
 * what it has already paid for and not yet received.
 *
 * **And it is still asked once over the whole queue.** Splitting `demand` by
 * order did not split the subtraction: an implementation reads
 * `availableOf + inFlight` **once per item id per pass** and walks the orders
 * handing that supply out, so the total it buys in a pass is the same
 * aggregate deficit it bought before. Nothing an order is already owed is
 * bought twice, because the supply an earlier order in the walk claimed is
 * gone from the pool the later ones see. What is per order is only the
 * *funding decision* -- whether the treasury covers this order's remainder
 * whole -- which is precisely what ruling 12 chose and nothing more.
 *
 * It also means no new field on `BuildOrder` -- and therefore none in
 * `src/persistence/save-schema.ts` -- to remember what an order has already
 * ordered. What an order is owed is a function of the order book, the
 * container and the pending deliveries, all three of which are already in the
 * save. **That is unchanged by the split and is the reason `SAVE_SCHEMA_VERSION`
 * did not move for ruling 12**: an order's share of the supply is recomputed
 * from the walk on every pass and never stored.
 *
 * ## The contract
 *
 * - `demand` is every order in `'approved'` or `'materials-pending'`, in the
 *   canonical walk `ConstructionSystem.orderedOrders()` produces, each carrying
 *   its buildable's whole `materialsRequired`. **The walk order decides which
 *   orders an insufficient balance funds**, so it is a fact about money and not
 *   about presentation. It is **placement order, ties by id**
 *   (`compareBuildOrderExecution`): ADR 0082 was signed on 2026-08-31 and #722
 *   implemented it, so "as many whole orders as the balance covers" now means
 *   *as many as it covers, starting from the one the player drew first*. An
 *   implementation must not paper over that by re-sorting on anything else.
 *
 *   **This bullet read "It is ascending order **id**, which for the
 *   `order-${crypto.randomUUID()}` ids a session mints is *not* placement
 *   order ... Until that is signed, ... a walk the player cannot predict"**,
 *   and that is what a save carrying no ordinals still does -- every order in
 *   it ties at the sentinel and the id decides. ADR 0081 Decision 2's
 *   observation that per-order granularity *"halves the expected requirement
 *   and leaves the worst case exactly where it is"* is unchanged as arithmetic;
 *   what moved is that the worst case is no longer drawn at random, because
 *   the walk is now stated.
 * - Within one order, requirements are funded in ascending item id, and that
 *   choice decides nothing: the order is atomic, so either every line is bought
 *   or none is.
 * - It is called on **every** scheduled construction tick, including with an
 *   empty `demand`, so the record of what could not be funded has a defined
 *   moment to be cleared. A queue that drains must stop reporting a shortfall.
 * - It is called **again** from the `PlaceBuildOrder` command handler, at the
 *   tick of the press, so the money leaves when the player places the wall
 *   rather than up to ten ticks later -- which is the owner's own wording of
 *   what placing an order should mean, *"it should buy itself when I place a
 *   wall"* -- and so that a shortfall reaches the alert band on the press
 *   instead of only through a panel (issue #629).
 * - **It must not throw.** Like `ObjectPlacementSink` and `DoorPlacementSink`
 *   it is reached from inside `update`, where a throw faults the worker out of
 *   a scheduled system update rather than refusing anything.
 * - The report it answers is *what happened*, not an instruction.
 *   `ConstructionSystem` does not act on it: the order stays in
 *   `'materials-pending'` whatever it says, and allocates when a delivery
 *   lands. Only the command handler reads it, and only to tell the player.
 */
export interface ConstructionProcurementSink {
  procureForPendingOrders(demand: readonly QueuedOrderDemand[], tick: number): MaterialsProcurementReport;
  /**
   * How much of `itemId` the prison already holds or has already paid for,
   * and therefore will not buy again.
   *
   * The *supply* half of `procureForPendingOrders`'s own subtraction, asked as
   * a question instead of acted on: `deficit = demand - held - inFlight`, so a
   * caller holding the demand can tell whether this sink is about to spend
   * without making it spend. It buys nothing, records nothing, and leaves
   * `lastReport` exactly where it was.
   *
   * It exists because a cancelled just-in-time delivery has to be answered on
   * the *demand* side and not on the supply side (issue #687). Cancelling one
   * refunds the money and removes the delivery; the build orders it was bought
   * for are still queued, still want the material, and the very next scheduled
   * pass buys it all back. `ConstructionSystem.withdrawOrdersAwaitingMaterial`
   * withdraws just enough of that queue for this figure to cover what is left,
   * which is the only way the refund survives the clock -- and it needs to know
   * where the line is without crossing it.
   */
  heldOrInFlightOf(itemId: string): number;
}
