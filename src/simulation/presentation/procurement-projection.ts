import type { PendingDelivery } from '../economy/procurement';
import {
  compareStableIds,
  HUD_VIEW_MODEL_SCHEMA_VERSION,
  pageOf,
  type HudViewModelSchemaVersion,
  type PageRequest,
  type ViewModelPage,
} from './view-model';

/**
 * What has been paid for and has not arrived — the money a session is holding
 * in transit, and the ids that can get it back (#285).
 *
 * ## The gap this read model closes
 *
 * `PurchaseMaterials` spends at the tick it executes and queues a delivery
 * `PROCUREMENT_DELIVERY_DELAY_TICKS` later. `ProcurementSystem.cancel` refunds
 * the recorded price of a delivery that has not landed, exactly, and it has
 * been complete, idempotent, snapshotted and restored since #249 — with **no
 * caller anywhere in `src/`**. Nothing could construct a command that reached
 * it, because no command existed; and no command could have been aimed if one
 * had, because a purchase id is minted on the main thread, sent, and then
 * forgotten. Nothing on screen showed one and no readout carried one back.
 *
 * So a player who bought materials and changed their mind had no way to
 * recover the money, and the interface said nothing about the money being in
 * transit at all. #285 measured the sharpest form of it: undo a build order
 * while its delivery is still in flight and the balance stays down, the order
 * is cancelled, and the bricks arrive 288 ticks later attached to nothing.
 * Value is conserved (`tests/integration/economy-money-conservation.test.ts`
 * asserts that in integer minor units) — what was missing was a *surface*.
 *
 * This is the read model that surface reads.
 *
 * ## Why it needs no new state and no save version
 *
 * `ProcurementSystem.pendingDeliveries` is already a public accessor over the
 * list `snapshot`/`restore` already carry, and `save-schema.ts`'s
 * `economySectionSchema` already types every field below. So this is a *read*
 * of state a V5 save has held all along: no persisted shape moves, and
 * `SAVE_SCHEMA_VERSION` is untouched — which matters, because V6 is contended
 * by #361 and wanted by #337 and a third claimant would be worse than either.
 *
 * ## Ordering, and why this one does not sort by id
 *
 * `ProcurementSystem.sortPending` keeps the queue in `(arrivesAtTick, orderId)`
 * order and drains it in that order, so **this list is the delivery schedule**:
 * row one is the next thing to land, which is also the row whose refund is
 * about to stop being available. Sorting by id — which is what
 * `projectBuildQueue` does, because ascending id *is* the crew's own walk
 * order — would reorder this list and put a delivery arriving in 90 ticks above
 * one arriving in 3.
 *
 * The comparator is restated here rather than trusted, for the reason
 * `docs/DETERMINISM.md` gives about canonical iteration: a source that changed
 * its mind about ordering would otherwise silently reorder a list of controls a
 * player aims at. It is deliberately the *same* rule as `sortPending`'s and not
 * a second opinion — `orderId` breaks the tie in code-unit order because the
 * arrival tick alone does not.
 *
 * ## What it deliberately does not carry
 *
 * **No label.** `itemId` is a stable content id and travels out unchanged; what
 * an item is *called* is `src/content/item-catalog.ts`'s `nameKey`, which the
 * composition root looks up and the HUD may not (`AGENTS.md` boundary 1), and
 * which a projection may not emit as text (ADR 0011).
 *
 * **No "arrives in N ticks".** `arrivesAtTick` is carried as the simulation's
 * own figure and nothing here turns it into a countdown, because a tick is not
 * a unit this interface has ever shown a player — `docs/HUD_PROJECTIONS.md`
 * gap 12a records the same restraint for the intake backlog. What the panel
 * renders is what a player can act on: how much money each delivery gives back.
 */
export interface PendingDeliverySource {
  /** Read-only slice of `ProcurementSystem`. One accessor, and it already exists. */
  readonly pendingDeliveries: readonly PendingDelivery[];
}

export interface PendingDeliveryViewModel {
  /**
   * The purchase's own id, and the whole point of this read model.
   *
   * `CancelMaterialPurchase { orderId }` names one delivery, so a surface that
   * can aim it needs the ids. It was minted on the main thread by the press that
   * bought this delivery and it comes back out unchanged.
   */
  readonly orderId: string;
  /** Stable content id. What it is *called* is the host's answer — see this module's header. */
  readonly itemId: string;
  readonly quantity: number;
  /**
   * What this delivery cost, which is exactly what cancelling it refunds.
   *
   * The *recorded* price and not a recomputation: `ProcurementSystem.cancel`
   * credits `paidMinorUnits`, so this is the figure a row may promise. Deriving
   * it from the catalog here would promise today's price for a purchase made at
   * yesterday's the moment prices ever move.
   */
  readonly paidMinorUnits: number;
  /** The tick the delivery lands on, after which it can no longer be cancelled. */
  readonly arrivesAtTick: number;
}

export interface PendingDeliveriesViewModel {
  readonly schemaVersion: HudViewModelSchemaVersion;
  readonly deliveries: ViewModelPage<PendingDeliveryViewModel>;
  /**
   * Everything the treasury would get back if every pending delivery were
   * cancelled, in integer minor units.
   *
   * Summed over **every** pending delivery and not over the window, for the
   * reason `BuildQueueViewModel.started` is: it is the answer to "how much of my
   * money is in transit", and a window that summed three of nine would answer
   * something else. It is the figure #285 is about, and no readout in the
   * interface has ever carried it — the status strip's balance is what is left,
   * not what is out.
   */
  readonly refundableMinorUnits: number;
}

/** `(arrivesAtTick, orderId)`, code-unit order on the id — `ProcurementSystem.sortPending`'s own rule. */
function compareDeliveries(left: PendingDeliveryViewModel, right: PendingDeliveryViewModel): number {
  return left.arrivesAtTick === right.arrivesAtTick
    ? compareStableIds(left.orderId, right.orderId)
    : left.arrivesAtTick - right.arrivesAtTick;
}

/**
 * Every delivery still in flight, in the order they will land.
 *
 * Paged, because a player can press Buy as many times as the treasury allows and
 * a list with no ceiling must not cross the boundary whole
 * (`docs/HUD_PROJECTIONS.md` contract 5). `total` is the whole count whatever
 * window was asked for, so a panel that draws three rows can still say how many
 * purchases are out.
 */
export function projectPendingDeliveries(
  source: PendingDeliverySource,
  request: PageRequest = {},
): PendingDeliveriesViewModel {
  const pending = source.pendingDeliveries
    .map(
      (delivery): PendingDeliveryViewModel => ({
        orderId: delivery.orderId,
        itemId: delivery.itemId,
        quantity: delivery.quantity,
        paidMinorUnits: delivery.paidMinorUnits,
        arrivesAtTick: delivery.arrivesAtTick,
      }),
    )
    .sort(compareDeliveries);

  return {
    schemaVersion: HUD_VIEW_MODEL_SCHEMA_VERSION,
    deliveries: pageOf(pending, request),
    // Integer minor units throughout: every `paidMinorUnits` is a unit price
    // times a quantity, so the sum carries no remainder and needs no rounding
    // rule (`docs/DETERMINISM.md`).
    refundableMinorUnits: pending.reduce((total, delivery) => total + delivery.paidMinorUnits, 0),
  };
}
