import {
  compareBuildOrderExecution,
  resolveBuildEdge,
  type BuildEdge,
  type BuildOrder,
  type BuildOrderLifecycleState,
} from '../construction/build-order';
import type { MaterialsProcurementReport } from '../construction/materials-procurement';
import {
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

/**
 * Read-only slice of `ConstructionSystem`. Two methods, and both are ones it
 * already exposes.
 *
 * `previewCancelRefundMinorUnits` joined `allOrders` for the owner's ruling of
 * 2026-09-02: the queue row says what `CancelBuildOrder` would pay, in the
 * same pattern the pending-deliveries row already uses
 * (`HudPendingDeliveryViewModel.paidMinorUnits`), and that figure is a fact
 * about the treasury and the last purchase pass -- neither of which this
 * module or the HUD may hold (`AGENTS.md` boundary 1). `ConstructionSystem`
 * is the one thing on this thread that already knows what `cancelOrder` pays,
 * so it is asked rather than re-derived here.
 */
export interface BuildOrderSource {
  allOrders(): readonly BuildOrder[];
  /**
   * What cancelling `orderId` would credit the treasury right now, without
   * cancelling it. See `ConstructionSystem.previewCancelRefundMinorUnits`,
   * which this is read from unchanged -- this module adds no arithmetic of
   * its own, only the call.
   */
  previewCancelRefundMinorUnits(orderId: string): number;
  /**
   * The order's own revision counter, read the same unchanged way
   * `previewCancelRefundMinorUnits` already is -- ADR 0107's answer to "what
   * did this row see", carried across the worker boundary so a later
   * `CancelBuildOrder` can name it as `expectedRevision`. See
   * `ConstructionSystem.revisionOf`, which this is read from unchanged: never
   * throws, `0` for an id that names nothing.
   */
  revisionOf(orderId: string): number;
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
 *
 * **`nextOrderShortfallMinorUnits` is the other actionable figure, and it
 * answers a different question (#771's second finding).** `shortfallMinorUnits`
 * is what the *queue* still needs, whole; this is what unblocks the order at
 * the front of it -- the earliest order in `orders`' own walk the last pass
 * could not afford. ADR 0081 decision 2 funds one whole order at a time and
 * `JustInTimeMaterialsService`'s rule 2 lets a later, cheaper order through in
 * the same pass, so the two figures diverge whenever more than one order is
 * unfunded: a player who saves `shortfallMinorUnits` may pay for money the
 * queue does not need yet, and one who saves less than it may already see the
 * front order move.
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
  /**
   * What it would take to fund the order at the front of the queue's own
   * unfunded ones -- not the queue's total. `0` whenever `unfunded` is `false`,
   * or when every blocked order is blocked for a reason that is not money. See
   * `MaterialsProcurementReport.nextOrderShortfallMinorUnits`, which this is
   * read from unchanged.
   */
  readonly nextOrderShortfallMinorUnits: number;
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
  /**
   * What cancelling this order right now would credit the treasury, in minor
   * units -- the owner's ruling of 2026-09-02, in the pattern
   * `HudPendingDeliveryViewModel.paidMinorUnits` already set for a pending
   * delivery's own row.
   *
   * Read from `BuildOrderSource.previewCancelRefundMinorUnits`, never
   * computed here: `ConstructionSystem.previewCancelRefundMinorUnits`'s own
   * comment is where the ruling-20 table and its two sharp edges are argued,
   * and this field is that answer carried across the worker boundary
   * unchanged, exactly as `materialsFunding` below is.
   *
   * `0` is a real answer and not a placeholder for "unknown" -- a `'planned'`
   * order that never became demand, an `'in-progress'` order the crew has
   * already started, and a `'materials-pending'` order whose materials landed
   * in the last `PROCUREMENT_DELIVERY_DELAY_TICKS` all read `0` here, and each
   * for a different reason ruling 20 states. It is not derivable from `state`
   * alone -- that is the whole reason this field exists rather than being left
   * for a reader to work out from the five-member `PendingBuildOrderState` --
   * because two rows reading `'materials-pending'` can disagree about it: one
   * whose delivery is still on the road pays, one whose delivery already
   * landed does not, and `state` cannot tell them apart
   * (`tests/integration/economy-cancel-what-comes-back.test.ts`).
   */
  readonly cancelRefundMinorUnits: number;
  /**
   * The order's revision as of this publication (ADR 0107), for a later
   * `CancelBuildOrder` press to carry back as `expectedRevision`.
   *
   * Read from `BuildOrderSource.revisionOf` unchanged, exactly as
   * `cancelRefundMinorUnits` is read from `previewCancelRefundMinorUnits`:
   * this module adds no arithmetic of its own, only the call. A press that
   * carries the value this row shows always matches, because a match is
   * exactly "the order has not been mutated since this row was published" --
   * the whole reason the counter exists.
   */
  readonly revision: number;
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
   * **`shortfallMinorUnits` still means what it has always meant -- what the
   * queue as a whole still needs -- and #703 ruling 9 did not move it.** A
   * partly filled pass funds a subset of the queue and reports **every** order
   * it left unfunded in `MaterialsProcurementReport.unfunded`, not only the
   * next one, precisely so this figure's subject did not change under the
   * player without anybody deciding that it should.
   *
   * **What is NOT here, and it is named rather than added:** what the pass
   * *bought*. `MaterialsProcurementReport.purchased` carries it and this
   * projection reads only `unfunded`, so a pass that spends the prison's last
   * 240 on three wall segments moves the funds chip and says nothing about
   * why. ADR 0081 Decision 3 calls that *"a precondition rather than a
   * nicety"* -- *"a partial buy that silently spends the treasury and moves one
   * segment forward is worse than a refusal, because the money is gone"* -- and
   * its open question 2 leaves **what the player is told** to the owner, which
   * `AGENTS.md`'s fourth exclusion reserves. A `purchasedMinorUnits` beside
   * `shortfallMinorUnits` would be one field and one sentence; the field
   * without the sentence is a number nobody can read, so neither was added.
   * This comment is the empty place.
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
 * **Placement order, ties by id -- `ConstructionSystem`'s own canonical order
 * and not a choice made here.** That system walks `orderedOrders()` and the
 * first eligible order is the one that starts, so this sequence *is* the build
 * schedule, not merely a stable enumeration. Re-sorted here anyway rather than
 * trusted, for the reason `docs/DETERMINISM.md` gives about canonical
 * iteration: a source that changed its mind about ordering would otherwise
 * silently reorder a player-facing list, and the sort is over rows this
 * function is already materialising. `compareBuildOrderExecution` is that one
 * rule, imported rather than restated, so the panel and the crew cannot come
 * to disagree about what is next.
 *
 * **Until 2026-08-31 this paragraph read "Ascending id", and it went on to
 * state the consequence:** an order id is minted at the composition root as
 * `order-${crypto.randomUUID()}`, so ascending id within one dragged run was
 * **not** the order the run was drawn in. Both sentences are kept because they
 * are what a save written before ADR 0082 still does -- an order carrying no
 * `placementSequence` sorts by id, exactly as before -- and because the
 * consequence is what the ADR was written to remove (#722). What has changed
 * is that for orders a current session places, the list is the player's own
 * gesture order.
 *
 * What has *not* changed: every row carries its tile and its edge, because a
 * player aims at a wall by where it is, never by how far down the list it sits.
 */
export function projectBuildQueue(
  source: BuildOrderSource,
  request: PageRequest = {},
  funding?: BuildQueueFundingSource,
): BuildQueueViewModel {
  // Sorted before the map rather than after it, because the key is no longer
  // on the row: `placementSequence` is a fact about the order and deliberately
  // not published in `BuildQueueOrderViewModel` -- a consumer aims at a row by
  // its tile, and an ordinal it could sort on is an invitation to re-derive
  // the schedule on the far side of the boundary. `compareStableIds` used to
  // do this job on `orderId` alone and is still what settles the tie, inside
  // `compareBuildOrderExecution`.
  const pending = [...source.allOrders()]
    .filter((order) => isPendingBuildOrderState(order.state))
    .sort(compareBuildOrderExecution);

  // Paged *before* the map, and that is new: `cancelRefundMinorUnits` below
  // asks `source.previewCancelRefundMinorUnits`, which walks the whole order
  // book per item id (`ConstructionSystem.demandedQuantityOf`) -- cheap for
  // one row, and a drag of hundreds would make it O(orders^2) if it ran for
  // every pending order rather than only the rows a panel can ever draw. A
  // queue with no ceiling (`docs/HUD_PROJECTIONS.md` contract 5) is exactly
  // the case `tests/integration/economy-cancel-what-comes-back.test.ts`
  // measures at 328 orders, so this is not a theoretical saving. `total`
  // still counts every pending order, from `pending.length` rather than from
  // the page, so the header keeps telling the truth about the prison.
  const page = pageOf(pending, request);
  const rows: readonly BuildQueueOrderViewModel[] = page.rows.map(
    (order): BuildQueueOrderViewModel => ({
      orderId: order.id,
      definitionId: order.definitionId,
      tile: toTileViewModel(order.location),
      edge: resolveBuildEdge(order),
      state: order.state as PendingBuildOrderState,
      cancelRefundMinorUnits: source.previewCancelRefundMinorUnits(order.id),
      revision: source.revisionOf(order.id),
    }),
  );

  const unfundedItems = (funding?.lastReport.unfunded ?? []).map((item) => ({
    itemId: item.itemId,
    quantity: item.quantity,
    costMinorUnits: item.costMinorUnits,
  }));

  return {
    schemaVersion: HUD_VIEW_MODEL_SCHEMA_VERSION,
    orders: { total: page.total, offset: page.offset, limit: page.limit, rows },
    started: pending.reduce((count, order) => (order.state === 'in-progress' ? count + 1 : count), 0),
    materialsFunding: {
      unfunded: unfundedItems.length > 0,
      shortfallMinorUnits: unfundedItems.reduce((total, item) => total + item.costMinorUnits, 0),
      nextOrderShortfallMinorUnits: funding?.lastReport.nextOrderShortfallMinorUnits ?? 0,
      items: unfundedItems,
    },
  };
}
