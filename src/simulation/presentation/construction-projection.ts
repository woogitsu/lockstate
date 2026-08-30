import {
  resolveBuildEdge,
  type BuildEdge,
  type BuildOrder,
  type BuildOrderLifecycleState,
} from '../construction/build-order';
import type { MaterialsProcurementReport } from '../construction/materials-procurement';
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

/**
 * Read-only slice of `JustInTimeMaterialsService` -- what the queue's last
 * material purchase did (#627).
 *
 * A second source rather than a second method on `BuildOrderSource`, because
 * the two are different objects in the composition root and the funding one is
 * optional: a runtime with no economy has orders and no purchases, and that is
 * not the same fact as "the purchases all succeeded".
 */
export interface BuildQueueFundingSource {
  readonly lastReport: MaterialsProcurementReport;
}

/**
 * Why the queue is not moving, when the reason is money.
 *
 * ## The distinction this exists to draw, and why a boolean is not enough
 *
 * Issue #627: forty walls sat in `'materials-pending'` and every channel that
 * could have said why was shut. Issue #629 turns that into a standing rule --
 * *"a mechanic the player must discover in order to proceed is a defect"* --
 * and the specific thing it outlaws is a state that is representable and
 * reaches nobody.
 *
 * Since ADR 0017 decision 7 was implemented (#627), `'materials-pending'`
 * means two different things and the player cannot tell them apart from the
 * state alone: **the lorry is on its way**, which needs no action and resolves
 * itself in ten scheduled ticks, or **the prison could not pay for the
 * materials**, which resolves itself never until money arrives. This block is
 * the difference, on the protocol, so a surface can say which -- and a test
 * can assert which without reading pixels.
 *
 * `shortfallMinorUnits` is the actionable half and the reason this is not a
 * boolean: the answer to "you cannot afford it" is a number the player can
 * compare against the balance on the strip. It is the sum of `items`.
 */
export interface BuildQueueMaterialsFundingViewModel {
  /**
   * `false` when the last purchase attempt bought everything the queue wanted,
   * or wanted nothing, or when no funding source was supplied at all.
   *
   * The last of those three is deliberately folded in rather than reported as
   * a third state: a projection over a runtime with no economy is describing a
   * prison that cannot be short of money, and "unknown" would be a value every
   * consumer had to decide what to do with.
   */
  readonly unfunded: boolean;
  /** What the queue could not buy, in minor units. `0` whenever `unfunded` is `false`. */
  readonly shortfallMinorUnits: number;
  /** Per item, ascending item id. Empty whenever `unfunded` is `false`. */
  readonly items: readonly {
    readonly itemId: string;
    readonly quantity: number;
    readonly costMinorUnits: number;
  }[];
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
  /**
   * Whether the queue is stalled on money, and by how much (#627, #629).
   *
   * **Not derivable from `orders`, and that is the whole reason it is here.**
   * Every order in this list reads `'materials-pending'` whether its materials
   * are on a lorry or were never bought, so a consumer reading the rows alone
   * cannot tell a wait that ends by itself from one that does not. See
   * `BuildQueueMaterialsFundingViewModel`.
   *
   * Always present, never optional: absent would mean "this build cannot
   * answer", and every build that carries this field can.
   */
  readonly materialsFunding: BuildQueueMaterialsFundingViewModel;
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
export function projectBuildQueue(
  source: BuildOrderSource,
  request: PageRequest = {},
  funding?: BuildQueueFundingSource,
): BuildQueueViewModel {
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

  const unfundedItems = (funding?.lastReport.unfunded ?? []).map((item) => ({
    itemId: item.itemId,
    quantity: item.quantity,
    costMinorUnits: item.costMinorUnits,
  }));

  return {
    schemaVersion: HUD_VIEW_MODEL_SCHEMA_VERSION,
    orders: pageOf(pending, request),
    started: pending.reduce((count, order) => (order.state === 'in-progress' ? count + 1 : count), 0),
    materialsFunding: {
      unfunded: unfundedItems.length > 0,
      shortfallMinorUnits: unfundedItems.reduce((total, item) => total + item.costMinorUnits, 0),
      items: unfundedItems,
    },
  };
}
