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
 */
export interface MaterialsProcurementReport {
  readonly tick: number;
  /** Bought on this pass. Empty when the prison already held, or already had coming, everything the queue wants. */
  readonly purchased: readonly UnfundedMaterial[];
  /** Wanted, priced, and refused by the treasury. This is ADR 0017 decision 2's refusal, made observable. */
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
 * The obvious shape -- "the order that could not allocate buys what it needs"
 * -- double-buys, and not in a corner case. A purchase takes
 * `PROCUREMENT_DELIVERY_DELAY_TICKS` to arrive, which is ten construction
 * ticks, and a `materials-pending` order is retried on every one of them; and
 * order ids are `order-${crypto.randomUUID()}` (`src/main.ts:2144`), so
 * `orderedOrders()`'s ascending-id walk is **not** placement order and a later
 * order can take delivery of an earlier one's bricks and send it back to buy
 * again. Both disappear when the question is asked once over the whole queue:
 * what does everything still waiting need, against what the prison holds *and*
 * what it has already paid for and not yet received.
 *
 * It also means no new field on `BuildOrder` -- and therefore none in
 * `src/persistence/save-schema.ts` -- to remember what an order has already
 * ordered. What an order is owed is a function of the order book, the
 * container and the pending deliveries, all three of which are already in the
 * save.
 *
 * ## The contract
 *
 * - `demand` is the total requirement of every order in `'approved'` or
 *   `'materials-pending'`, summed per item id, in ascending item id. An
 *   implementation re-sorts it rather than trusting it, because which item is
 *   bought first is what an insufficient balance decides between.
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
  procureForPendingOrders(demand: readonly MaterialRequirement[], tick: number): MaterialsProcurementReport;
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
