import {
  resolveBuildEdge,
  type BuildEdge,
  type BuildOrder,
  type BuildOrderLifecycleState,
} from '../construction/build-order';
import {
  compareStableIds,
  HUD_VIEW_MODEL_SCHEMA_VERSION,
  pageOf,
  toTileViewModel,
  type HudViewModelSchemaVersion,
  type PageRequest,
  type TileViewModel,
  type ViewModelPage,
} from './view-model';

/**
 * What is still waiting to be built.
 *
 * ## The gap this read model closes
 *
 * `ConstructionSystem` has held a queue of orders since #16, and until #348 the
 * queue was not a thing a player could experience: every `assigned` order
 * started on the tick it was assigned and every `in-progress` order advanced on
 * every scheduled tick, so twelve walls finished in the time one wall takes.
 * #348 made the crew the constraint -- **one order in progress at a time** --
 * and `tests/unit/construction-geometry.test.ts` measures what that costs: the
 * twelve-segment run in it finishes at tick **730** where it used to finish at
 * **70**.
 *
 * So a queue became a real, long-lived thing the player waits on, and **nothing
 * carried it out of the worker**. No projection named an order, no publication
 * counted one, and the only construction state that reached this thread was the
 * geometry a *finished* order wrote. A player who dragged a twelve-segment wall
 * had no way to learn that eleven of them had not started, which order the crew
 * was on, or that anything was queued at all.
 *
 * ## Why it is a pull, and paged
 *
 * The same two reasons `hud/room-list` is. A queue is `O(orders)` to walk and
 * nobody is reading it from the Rooms tab, so it belongs on
 * `simulation/request-projection` rather than on the counts cadence
 * (`src/ui/simulation-projections.ts`: "a panel that is closed asks for
 * nothing"). And a queue has no ceiling -- a drag along thirty tiles is thirty
 * orders -- so `docs/HUD_PROJECTIONS.md` contract 5 applies: the window is the
 * caller's, bounded by `MAX_PROJECTION_PAGE_LIMIT` at the protocol edge, and
 * `total` is the whole count whatever window was asked for.
 *
 * ## What it deliberately does not carry
 *
 * **No label.** `definitionId` is a stable content id and travels out
 * unchanged; what a buildable is *called* is the composition root's answer
 * (`buildableLabelKey` in `src/main.ts`), because the buildable registry carries
 * a hard-coded English `name` and no `nameKey` at all
 * (`docs/HUD_PROJECTIONS.md` gap 32). Deriving a key here would author a second
 * English word for the same thing and let the two drift -- and emitting the
 * registry's `name` would put translated text in a projection, which ADR 0011
 * forbids outright.
 *
 * **No progress figure.** `BuildOrder.progress` is a work counter measured
 * against the buildable definition's `workRequired`, and the only thing a
 * player can act on is *which* order the crew is on -- which `state` already
 * says, exactly, as `'in-progress'`. A percentage would need the definition
 * table read here for a number nothing does anything with.
 *
 * **No transaction id.** Undo groups orders by transaction and this read model
 * is deliberately not a view of the undo history: the whole reason
 * `CancelBuildOrder` is not a second undo button is that it names one order
 * rather than one gesture.
 */

/**
 * The states an order in this read model can be in: everything that has not
 * finished, failed or already been withdrawn.
 *
 * Declared as a tuple rather than derived by excluding three members of
 * `BuildOrderLifecycleState`, because the exclusion is a *judgement* and the
 * tuple is where it can be read. `'completed'` is the one that is worth arguing:
 * a completed order is still cancellable (`ConstructionSystem.cancelOrder`
 * accepts it, and reverses the geometry it wrote), and it is nonetheless not
 * queued -- the wall is standing. A queue that listed standing walls would be a
 * demolition list wearing a queue's label, and taking a finished wall down is
 * the Remove gesture's job (ADR 0028 phase 3) rather than this one's.
 */
export const PENDING_BUILD_ORDER_STATES = [
  'planned',
  'approved',
  'materials-pending',
  'assigned',
  'in-progress',
] as const;

export type PendingBuildOrderState = (typeof PENDING_BUILD_ORDER_STATES)[number];

export function isPendingBuildOrderState(state: BuildOrderLifecycleState): state is PendingBuildOrderState {
  return (PENDING_BUILD_ORDER_STATES as readonly BuildOrderLifecycleState[]).includes(state);
}

/** Read-only slice of `ConstructionSystem`. One method, and it is the one it already exposes. */
export interface BuildOrderSource {
  allOrders(): readonly BuildOrder[];
}

export interface BuildQueueOrderViewModel {
  /**
   * The order's own id, and the whole point of this read model.
   *
   * `CancelBuildOrder { orderId }` names an arbitrary order, so a surface that
   * can aim it needs the ids. It is a stable simulation id and travels back out
   * unchanged in the command.
   */
  readonly orderId: string;
  /** Stable content id. What it is *called* is the host's answer -- see this module's header. */
  readonly definitionId: string;
  readonly tile: TileViewModel;
  /**
   * The tile edge the order occupies, resolved rather than optional.
   *
   * `BuildOrder.edge` is optional so a save written before it existed still
   * loads, and `DEFAULT_BUILD_EDGE` is what such an order means. Carrying the
   * absence out would make every reader repeat that resolution, and a reader
   * that forgot would label a wall's side wrongly on screen.
   */
  readonly edge: BuildEdge;
  readonly state: PendingBuildOrderState;
}

export interface BuildQueueViewModel {
  readonly schemaVersion: HudViewModelSchemaVersion;
  readonly orders: ViewModelPage<BuildQueueOrderViewModel>;
  /**
   * How many of the orders in `total` the crew has actually started, which is
   * `0` or `1` in every session #348 can produce.
   *
   * Counted over **every** pending order and not over the window, because it is
   * the answer to "is anything happening at all" and a window that skipped the
   * started one would answer no. It is not derivable from the rows for the same
   * reason `RoomListViewModel.totals` is not derivable from its page.
   */
  readonly started: number;
}

/**
 * Every order still waiting, in the order the crew will reach them.
 *
 * **Ascending id, which is `ConstructionSystem`'s own canonical order and not a
 * choice made here.** That system walks `orderedOrders()` and the first
 * eligible id is the one that starts, so ascending id *is* the build sequence --
 * the list is the schedule, not merely a stable enumeration. Re-sorted here
 * anyway rather than trusted, for the reason `docs/DETERMINISM.md` gives about
 * canonical iteration: a source that changed its mind about ordering would
 * otherwise silently reorder a player-facing list, and the sort is over rows
 * this function is already materialising.
 *
 * One consequence, stated because a player meets it: an order id is minted at
 * the composition root as `order-${crypto.randomUUID()}`, so ascending id
 * within one dragged run is **not** the order the run was drawn in. The
 * sequence is real -- it is what the crew does -- and it is not the player's
 * gesture replayed, which is why every row carries its tile and its edge. A
 * player aims at a wall by where it is, never by how far down the list it sits.
 */
export function projectBuildQueue(source: BuildOrderSource, request: PageRequest = {}): BuildQueueViewModel {
  const pending = source
    .allOrders()
    .filter((order) => isPendingBuildOrderState(order.state))
    .map(
      (order): BuildQueueOrderViewModel => ({
        orderId: order.id,
        definitionId: order.definitionId,
        tile: toTileViewModel(order.location),
        edge: resolveBuildEdge(order),
        state: order.state as PendingBuildOrderState,
      }),
    )
    .sort((left, right) => compareStableIds(left.orderId, right.orderId));

  return {
    schemaVersion: HUD_VIEW_MODEL_SCHEMA_VERSION,
    orders: pageOf(pending, request),
    started: pending.reduce((count, order) => (order.state === 'in-progress' ? count + 1 : count), 0),
  };
}
