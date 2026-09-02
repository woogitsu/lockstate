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
 *
 * **`nextOrderShortfallMinorUnits` is per order, deliberately, and is the one
 * field on this record that is not aggregated.** Issue #771's second finding:
 * the queue's shortfall sentence stated the sum of every unfunded order, and a
 * player who scraped that amount together could still see nothing move,
 * because ADR 0081 decision 2 funds one whole order at a time and *"lets a
 * later order it can afford through, rather than stopping at the first it
 * cannot"* (`JustInTimeMaterialsService`'s own rule 2). The two figures agree
 * only when at most one order is unfunded; whenever more than one is, they
 * diverge, and the sum is not the number that moves anything.
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
  /**
   * What it would take to fund the **earliest order in the walk** this pass
   * left unfunded for money -- not the queue's total, `unfunded`'s sum.
   *
   * `0` whenever nothing in this pass was blocked on money: the queue is fully
   * funded, empty, or every blocked order is blocked for a reason that is not
   * money (`unprocurable`). Otherwise it is the exact `costMinorUnits` total
   * of the first order the walk could not afford, in the same demand order
   * `ConstructionSystem.orderedOrders()` and the build queue panel both use
   * (`compareBuildOrderExecution`) -- so it is well-defined precisely because
   * ADR 0082 made "the next order" and "the order at the top of the queue's
   * own list" the same order for anything placed through a command.
   *
   * **What it does not promise.** A later, cheaper order can still be funded
   * in the *same* pass while this order is not (rule 2's own guarantee, cited
   * above) -- so a queue can move without this figure reaching zero, and this
   * figure reaching zero does not mean the *whole* queue is funded. It answers
   * one question only: what unblocks the order the crew is waiting behind.
   */
  readonly nextOrderShortfallMinorUnits: number;
}

/**
 * Why the build queue's own money refusal is a refusal, spelled the way the
 * eleven other domain vocabularies are spelled.
 *
 * **One member, and the union exists anyway**, for exactly the argument
 * `RemoveObjectRefusalReason` and `PurchaseCancelRefusalReason` record: the
 * union is what makes a *second* reason a compile error at
 * `CONSTRUCTION_FUNDING_REFUSAL_REASONS` (`src/simulation/refusals/refusal-log.ts`)
 * rather than a literal at the call site that anybody may add a sibling to
 * without deciding what a player is told.
 *
 * `'materials-unfunded'` is a non-empty `MaterialsProcurementReport.unfunded`,
 * and it is **ADR 0017 decision 8's second rung by construction rather than by
 * a branch**: `JustInTimeMaterialsService.procureForPendingOrders` is the only
 * producer of that list and it asks `Treasury.canAfford(cost, 'construction')`
 * and nothing else, so the money that was refused was refused at the
 * construction rung, and cannot be any other rung's, because no other caller
 * ever reaches this list. **That rung was -2,000 under the owner's ruling 19
 * of 2026-08-31; it is not any more.** The owner's ruling on #771 (2026-09-01,
 * ADR 0017's equalisation amendment) retired the split ruling 19 gave the
 * two rungs and moved construction onto deliveries' own threshold, so today
 * this is refused at -1,250
 * (`INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS ===
 * INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS`, `src/simulation/economy/treasury.ts`).
 * The two rungs sharing a value does not weaken "cannot be any other rung's"
 * above -- that claim was never about the *floors* differing, it is about
 * `procureForPendingOrders` being the only caller that ever asks `canAfford`
 * under `'construction'`, which the equalisation did not touch. Nothing here
 * has to *decide* which rung fired, which is why there is no second member
 * for "it was actually rung 1".
 *
 * Not one of `PurchaseRefusalReason`'s members. `ProcurementSystem.purchase`
 * answers that union for a charge the player pressed *Buy* for, and the whole
 * of ADR 0017's amendment §3c is that the rung is a property of *who asked*
 * rather than of the method both callers reach.
 */
export type ConstructionFundingRefusalReason = 'materials-unfunded';

/** A pass that found nothing to do, and the value `lastReport` holds before any pass has run. */
export const EMPTY_MATERIALS_PROCUREMENT_REPORT: MaterialsProcurementReport = Object.freeze({
  tick: -1,
  purchased: Object.freeze([]),
  unfunded: Object.freeze([]),
  unprocurable: Object.freeze([]),
  nextOrderShortfallMinorUnits: 0,
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

  /**
   * Pays back, in money, what a cancelled order was holding, and answers the
   * lines it could not price.
   *
   * **The owner's ruling 20 of 2026-08-31 -- *"Anulowanie zwraca pieniądze
   * zamiast cegieł"* -- reaches this port here**
   * ([ADR 0076](../../../docs/adr/0076-what-happens-to-a-resident-whose-bed-is-taken-away.md)'s
   * amendment of that date). An `assigned` order holds material
   * `ContainerMaterialsProvider.tryAllocate` withdrew from the container, and
   * that material is the only place the money for its refund can come from.
   * It is valued at the catalogue price and credited; the caller drops the
   * allocation in the same step and does **not** put it back, because paying
   * for the plank and returning it is one-press value creation.
   *
   * **What comes back is what could not be priced.** A buildable may require
   * an item the procurement catalogue does not sell -- that is exactly
   * `UnprocurableMaterial`'s `'unpurchasable'` -- and there is no honest money
   * figure for such a line. Rather than destroy it, this answers it, and
   * `ConstructionSystem.cancelOrder` releases those lines into the container
   * through `ConstructionMaterialsProvider.release` as it always did. An empty
   * answer means everything was paid for.
   *
   * It must not throw, for the reason every other method on this port must
   * not: it is reached from a command dispatch and from `undo()`.
   */
  refundAllocatedMaterials(allocations: readonly MaterialRequirement[]): readonly MaterialRequirement[];

  /**
   * Cancels the just-in-time deliveries of `itemId` the queue no longer needs,
   * and answers what that refunded.
   *
   * **The supply-side mirror of `ConstructionSystem.withdrawOrdersAwaitingMaterial`,
   * and it exists for the same reason that method does.** #687 established that
   * cancelling the *supply* while the *demand* still stands is a refund the
   * clock reverses. Ruling 20 creates the opposite press: cancelling a build
   * order in `'approved'` or `'materials-pending'` removes demand that a
   * just-in-time purchase has already been made against, and the money for it
   * is sitting in a delivery on the road. Leaving it there would make "cancel
   * gives back money" false in the state a player is most likely to press it
   * in -- a `PlaceBuildOrder` buys at the press and the goods take
   * `PROCUREMENT_DELIVERY_DELAY_TICKS` to land, so an order cancelled soon
   * after it is placed has its money in flight and nowhere else.
   *
   * `demandedQuantity` is what the *rest* of the queue still wants of this
   * item, read after the cancellation, and the implementation may refund only
   * what is surplus to it. The caller owns the order book and therefore owns
   * that figure; asking for it rather than deriving it is what keeps this from
   * being a second opinion about demand.
   *
   * **Only deliveries this sink bought, and only whole ones.** A delivery the
   * player pressed *Buy* for is stock they chose to hold and is never
   * cancelled here -- the distinction #687 drew through
   * `isJustInTimePurchaseOrderId` -- and a delivery larger than the surplus is
   * left alone, because cancelling it would strand the orders behind it and
   * make the next scheduled pass buy the material back.
   *
   * It must not throw.
   */
  refundSurplusDeliveries(itemId: string, demandedQuantity: number): number;

  /**
   * Sells back the `itemId` a cancelled order's demand left sitting on the
   * shelf, and answers what that credited (issue #717).
   *
   * **The other half of `refundSurplusDeliveries`, and the reason it is a
   * second method rather than a wider one is the currency.** That method
   * refunds a delivery at its own recorded `paidMinorUnits`, which is what
   * closes the buy-low-cancel-high trade; this one sells stock, which carries
   * no such record -- the goods are fungible with everything else the
   * container holds -- so it can only be valued at the catalogue price, the
   * same figure `refundAllocatedMaterials` uses and for the same reason. Two
   * prices means two methods, and the caller runs them in that order so that
   * a recorded price is always preferred to a catalogue one.
   *
   * **The window it exists for.** `ProcurementSystem` is scheduled every tick
   * and `ConstructionSystem` every tenth, so a just-in-time delivery is
   * unloaded into the container up to ten ticks before the order that demanded
   * it is offered to `tryAllocate`. In that window the order is still
   * `'materials-pending'`, holds no allocation, and has no delivery in flight:
   * its money is neither in the treasury, nor on the road, nor in the order.
   * Ruling 20's `'materials-pending'` row promises money there, and without
   * this the press gave back nothing at all and left the bricks -- #717's
   * *"returns bricks, never money"*, in the one window that sentence was still
   * true in.
   *
   * ## The two bounds, and why both are needed
   *
   * `demandedQuantity` is what the *rest* of the queue still wants, read after
   * the cancellation, exactly as `refundSurplusDeliveries` reads it: nothing a
   * remaining order still needs may be sold, or the next scheduled pass buys
   * it straight back.
   *
   * `limit` is the **cancelled order's own requirement** for this item, and it
   * is what keeps a cancel press from liquidating a stockpile the player chose
   * to hold. A wall placed against ten hand-bought bricks buys nothing at all
   * -- `procureForPendingOrders` counts held stock as supply -- so its
   * cancellation must give back one wall's worth and leave the other eight
   * where they are. It is the same figure ruling 20 hands the *same gesture
   * ten ticks later*, when the order has reached `'assigned'` and
   * `refundAllocatedMaterials` prices the allocation it is holding; the two
   * adjacent states have to answer alike, because "which window you pressed
   * in" is not a rule a player could have predicted.
   *
   * ## THIS TAKES A QUESTION ADR 0076 NAMED AND DID NOT TAKE
   *
   * **Unsigned, and it must not merge before the owner rules.**
   * [ADR 0076](../../../docs/adr/0076-what-happens-to-a-resident-whose-bed-is-taken-away.md)'s
   * amendment of 2026-08-31 enumerates the three places an order's money can
   * be, and its case 3 is exactly this window: *"In stock in the container.
   * The goods arrived, the order had not yet allocated them […] A player who
   * cancels in this window keeps the material and does not get the money, and
   * that is a real asymmetry rather than an oversight."* The same amendment
   * then names the remedy and declines it: *"**Not decided either: whether
   * surplus stock can be sold back.** Case 3 above […] closes only if a prison
   * can sell material back to the catalogue. That is a new economic surface
   * and a price question (ADR 0017 decision 5 reserves prices with the rest of
   * #29), so it is named and not taken."*
   *
   * **The owner took it on 2026-09-02, and took the broad reading with this
   * measurement in front of them.** They were offered three readings -- a
   * narrow sell-back bounded by what *this order's demand* actually bought, the
   * broad one bounded by the cancelled order's own requirement, and leaving the
   * asymmetry standing -- and chose the broad one knowing it is a general
   * material-to-money channel. So the paragraph below is not a warning about
   * something nobody weighed; it is the priced consequence of a signed
   * decision, and ADR 0076 records the same thing at the decision's own level.
   *
   * This method takes it. What it does **not** take is the price question --
   * it invents no magnitude and uses the catalogue figure
   * `refundAllocatedMaterials` already uses, and ADR 0081's own principle is
   * that *"a rule is not a magnitude"*. What it **does** take is the economic
   * surface, and the cost is measured rather than argued:
   * `tests/integration/economy-cancel-into-the-overdraft.test.ts`'s last case
   * plays *place a wall against a shelf you already hold, then cancel it* and
   * gets **80 minor units for two bricks, per gesture, with no clock wait and
   * no crew** -- repeatable until the shelf is empty. So this is not only the
   * window #717 measured; it is a general material-to-money channel, and it
   * dissolves [ADR 0075](../../../docs/adr/0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md)'s
   * locked position for any prison holding bricks.
   *
   * **The narrow version is not available without a save-format decision.**
   * Selling back only what *this order's own demand* caused to be bought needs
   * per-order purchase provenance, and nothing records it:
   * `procureForPendingOrders` buys the deficit, so an order placed against a
   * full container costs nothing at all. That would be a persisted field, and
   * ADR 0076's amendment states *"No save format moves"* as a property of
   * ruling 20.
   *
   * ## What it will not do
   *
   * It never touches reserved stock -- `Container.availableOf` nets
   * reservations off, so material a carry job has claimed is not surplus -- and
   * a line the catalogue cannot price is left on the shelf rather than
   * destroyed, which is `refundAllocatedMaterials`' rule for the same case. The
   * unpriced line is answered **before** anything is withdrawn, so nothing is
   * ever put back: a `Container.deposit` outside `src/simulation/operations/`
   * is an exception `docs/OPERATIONS.md`'s no-teleport rule has to name, and
   * this port does not need one.
   *
   * It must not throw, for the reason every other method on this port must
   * not: it is reached from a command dispatch and from `undo()`.
   */
  refundSurplusStock(itemId: string, demandedQuantity: number, limit: number): number;
}
