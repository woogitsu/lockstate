import { type SystemRegistration, type SimulationContext } from '../kernel/system';
import { type BuildEdge, type BuildOrder, type BuildOrderFailReason, compareBuildOrderExecution, resolveBuildEdge } from './build-order';
import { BUILDABLE_REGISTRY, type BuildableDefinition, type MaterialRequirement, edgeNumericIdFor, getBuildableDefinition, occupiesTileEdge } from './definition';
import { type ConstructionMaterialsProvider, UNLIMITED_MATERIALS_PROVIDER } from './materials-provider';
import { type ConstructionProcurementSink, type MaterialsProcurementReport, type QueuedOrderDemand } from './materials-procurement';
import { SnapshotRefusedError } from '../runtime/restore-refusal';
import { SparseWorld } from '../world/sparse-world';
import { type BuildabilityRequirement, canBuildAt } from '../world/buildability';
import { type TilePosition, tileCoordinate, tileToChunk } from '../world/coordinates';

export interface ConstructionSnapshot {
  readonly orders: readonly BuildOrder[];
  readonly undoStack: readonly (readonly string[])[];
  readonly redoStack: readonly (readonly string[])[];
  /**
   * The gesture that has not been closed off yet -- the top of the undo
   * history, even though it is not on `undoStack` yet (#108).
   *
   * `registerTransactionOrder` keeps the newest gesture in a buffer and only
   * pushes it onto `undoStack` when a *different* transaction id arrives, or
   * when `undo()` itself flushes it. Nothing else flushes it: there is no
   * tick- or time-based commit. So after any build gesture the buffer is
   * non-empty, and a snapshot that omitted it lost that gesture -- the first
   * `undo()` after a restore then reached past it and cancelled the
   * *previous* gesture instead.
   *
   * Both fields are optional and absent when there is no open gesture, which
   * is also exactly what a save written before they existed looks like; see
   * `restore()`.
   */
  readonly currentTransaction?: readonly string[];
  /**
   * The transaction id the open gesture belongs to, so a further segment of
   * the same gesture arriving after a restore rejoins it instead of opening a
   * second one. Absent when the open gesture carries no id, which is what
   * `registerTransactionOrder(id, undefined)` produces.
   */
  readonly currentTransactionId?: string;
}

/**
 * States an order can still be taken back from.
 *
 * `completed` is in the set: completing now writes world geometry, and
 * geometry that cannot be removed would make the first wall a player places
 * permanent. `cancelled` and `failed` are terminal.
 */
function isCancellable(state: BuildOrder['state']): boolean {
  return state !== 'cancelled' && state !== 'failed';
}

/**
 * States whose cancellation destroys what was spent on the order, in both
 * currencies -- the point of no return.
 *
 * The two states `cancelOrder` neither releases nor pays for: `'in-progress'`
 * by ruling 20 of 2026-08-31, and `'completed'` by the owner's ruling of
 * 2026-09-01 (*"Taking a finished object away returns nothing. Not its
 * materials, not its money."*, ADR 0076's amendment of that date). The table
 * on `cancelOrder` argues each.
 *
 * **A named predicate rather than the inline `stateAtCancellation ===
 * 'in-progress' || hadGeometry` it replaces, because there are now two readers
 * and they must never disagree.** `cancelOrder` uses it to decide what is
 * destroyed; `undo()` uses it to decide whether the transaction it just
 * reversed destroyed anything, which is what
 * [#927](https://github.com/matmaxalez/lockstate/issues/927) is about. A third
 * state joining this set has to be told to one place, not remembered in two.
 *
 * `SimulationEventLog.recordBuildOrderCancelled` deliberately does **not** read
 * this: that module imports `BuildOrderLifecycleState` for its type only and
 * runs no construction code, and its `switch` over the whole lifecycle is
 * exhaustive on purpose so that a ninth state fails to compile until somebody
 * has decided what the prison says about it. Two spellings of the same fact,
 * one of which the compiler defends -- which is the shape that file argues for.
 */
function destroysSpendOnCancel(state: BuildOrder['state']): boolean {
  return state === 'in-progress' || state === 'completed';
}

/**
 * What one `undo()` press did: whether it reversed anything at all, and -- when
 * it did -- whether any of what it reversed was past the point of no return
 * ([#927](https://github.com/matmaxalez/lockstate/issues/927)).
 *
 * ## Why this is not the count the ruling declined
 *
 * The owner's ruling of 2026-09-01 on
 * [#749](https://github.com/matmaxalez/lockstate/issues/749) rules that Undo's
 * sentence *"does not name a count"* and rules explicitly that the
 * transaction-size plumbing is not to be built. `spendDestroyed` is not that
 * plumbing and cannot become it: it is one bit, it says nothing about how many
 * orders moved, and it is `true` for a run of one exactly as for a run of
 * twelve. What it carries is the same distinction the *Cancel* channel has had
 * since that ruling -- money back, or what was spent stays spent -- which the
 * Undo channel could not make and therefore never made.
 *
 * ## Why a union rather than two booleans
 *
 * `spendDestroyed` is meaningless when nothing was reversed, and a flat
 * `{ reversed: boolean; spendDestroyed: boolean }` would let a caller read it
 * anyway. Narrowing on `reversed` is what stops that. It also stops the older
 * hazard: this method answered `boolean`, so `if (system.undo())` was the
 * caller, and an object return would have made that condition true for ever
 * without the compiler saying a word.
 */
export type ConstructionUndoOutcome =
  | { readonly reversed: false }
  | { readonly reversed: true; readonly spendDestroyed: boolean };

/**
 * The other tile an edge order's edge belongs to.
 *
 * `BuildEdge` names only the two slots the world stores, so the tile across a
 * `'north'` edge is the row above and the tile across a `'west'` edge is the
 * column to the left. There is no `'south'` or `'east'` member to handle:
 * `build-order.ts` explains at length why a caller thinking in those terms
 * addresses the neighbouring tile instead, and this is the inverse of that
 * translation rather than a second spelling of it.
 *
 * `undefined` for a location whose neighbour is not a safe integer.
 * `PlaceBuildOrder` validates `x` and `y` as `z.number().int()` and bounds
 * neither, so `Number.MIN_SAFE_INTEGER` is a coordinate a command can carry;
 * `tileCoordinate` throws `RangeError` one below it, and a throw here would
 * fault the worker out of a kernel command dispatch rather than refuse
 * anything. The caller reads `undefined` as "no far side to fall back on",
 * which leaves such an order refused for its own tile exactly as before.
 */
function tileAcrossEdge(location: TilePosition, edge: BuildEdge): TilePosition | undefined {
  const x = edge === 'west' ? location.x - 1 : location.x;
  const y = edge === 'north' ? location.y - 1 : location.y;
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return undefined;
  return { x: tileCoordinate(x), y: tileCoordinate(y) };
}

/**
 * What `submitOrder` asks of a tile before approving an order for it.
 *
 * **Ownership only, and every flag is written out on purpose.** `canBuildAt`
 * defaults all three of these on, so passing nothing would have this change
 * start enforcing buildable terrain and refusing water in the same commit --
 * neither of which is what #215 decided, and both of which are gameplay
 * questions with their own answers. A wall across a stream may well be
 * intended; a wall on ground the player does not own is not. So the two are
 * turned **off** explicitly rather than left to a default, and a reader who
 * finds this constant learns that terrain is not checked here rather than
 * assuming from the function's name that it is.
 *
 * Enabling either is a separate decision. If one is taken, the flag moves and
 * `SUBMISSION_FAIL_REASONS` already carries the reason it produces.
 */
const SUBMISSION_REQUIREMENT: BuildabilityRequirement = {
  requiresOwnedLand: true,
  requiresBuildableTerrain: false,
  requiresWalkableTerrain: false,
  allowWater: true,
};

/**
 * `BuildabilityResult.reason` spelled the way `BuildOrder.failReason` spells
 * things.
 *
 * The two vocabularies really are different and this is not ceremony:
 * `buildability.ts` uses `unowned_land` with an underscore, every member of
 * `BUILD_ORDER_FAIL_REASONS` is hyphenated, and `failReason` is persisted --
 * `save-schema.ts:176` and `:402` carry it into the save. Letting an
 * underscore reach a save because two modules disagreed about a separator
 * would be a format decision made by accident.
 *
 * All three of `canBuildAt`'s refusals are mapped, not just the one this
 * change turns on, so enabling a flag above cannot produce a `failReason`
 * nobody chose. (It said "four" until #261, counting the `'ok'` in the same
 * union -- and `'ok'` is absent deliberately: it is not a refusal, and it can
 * never reach this table because the lookup happens only when `buildable` is
 * false.)
 *
 * The lookup still needs its `?? 'unbuildable'` fallback, because
 * `BuildabilityResult.reason` is `'ok' | ... | string` and therefore open:
 * a refusal reason added there and not added here reaches the player as "the
 * build order failed" with no cause named, rather than as `undefined`.
 *
 * The *values* are `BuildOrderFailReason` rather than `string` since #261, so
 * a spelling this table invents that nothing downstream can render fails to
 * compile here. The key stays `string`: it is `BuildabilityResult.reason`,
 * which is that module's vocabulary and not this one's.
 */
const SUBMISSION_FAIL_REASONS: Readonly<Record<string, BuildOrderFailReason>> = {
  unowned_land: 'unowned-land',
  unbuildable_terrain: 'unbuildable-terrain',
  water_blocked: 'water-blocked',
};

/**
 * What a completed order for an object buildable hands off to, and what a
 * reverted one hands back.
 *
 * A **structural port declared here rather than an import of
 * `src/simulation/objects/`**, so the dependency arrow between construction and
 * object placement points one way: the objects module knows what a build order
 * is, and this module knows only that something may want to be told. That is
 * the same shape `ConstructionMaterialsProvider` has, and for the same reason --
 * `ConstructionSystem` is not the place object placement is decided.
 *
 * Optional on the constructor. Absent, a completed object order behaves exactly
 * as it did before ADR 0028 phase 1: it bumps the chunk's geometry revision and
 * writes nothing, which is what every test that constructs a bare
 * `ConstructionSystem` still gets.
 *
 * Both methods answer `boolean` and neither may throw: they are called from
 * inside `update`, and a throw out of a scheduled system update faults the
 * worker. `false` means "the world had moved on", and
 * `ObjectPlacementService` documents the one interleaving that produces it.
 */
export interface ObjectPlacementSink {
  onOrderCompleted(objectId: string, anchor: TilePosition): boolean;
  onOrderReverted(objectId: string, anchor: TilePosition): boolean;
}

/**
 * What a completed order for a **door** buildable hands off to, and what a
 * reverted one hands back.
 *
 * `ObjectPlacementSink`'s sibling, declared here for the same reason and with
 * the same properties: a structural port rather than an import of
 * `src/simulation/navigation/`, so this module holds no `DoorRegistry`, no
 * security grade and no opinion about what a door id looks like. It is told
 * which buildable finished and on which edge of which tile, in this module's
 * own vocabulary; `DoorConstructionService` turns that into a door.
 *
 * It carries the **buildable id** rather than a resolved door description
 * because the description is content: the grade, the initial state and the cost
 * multiplier live on `BuildableDefinition.placesDoor`, and passing them through
 * here would copy content into a signature that would then have to change every
 * time a door gained a property.
 *
 * Both methods answer `boolean` and neither may throw, for the reason
 * `ObjectPlacementSink`'s two do not: they are called from inside `update`, and
 * a throw out of a scheduled system update faults the worker.
 */
export interface DoorPlacementSink {
  onDoorOrderCompleted(definitionId: string, location: TilePosition, edge: BuildEdge): boolean;
  onDoorOrderReverted(definitionId: string, location: TilePosition, edge: BuildEdge): boolean;
}

/**
 * The one build crew, and the only worker id an order is ever assigned to.
 *
 * It was already the only id: `update` wrote `'mock-worker-1'` onto every
 * order that reached `assigned`, and then advanced every `in-progress` order
 * on every scheduled tick -- so one crew was named and an unbounded number of
 * them worked. Naming it here is what lets the two halves say the same thing:
 * one id, one order in progress at a time.
 *
 * **Deliberately not a capacity number.** A `MAX_CONCURRENT_ORDERS = 1` would
 * be a balance value somebody would reasonably want to tune, and a tunable
 * crew size is a decision about the jobs system rather than about this
 * placeholder -- ADR 0028 says so in terms ("Adding a cap is a jobs-system
 * decision (#26) that affects walls too"). The rule below is therefore
 * expressed as "the crew is busy or it is not", with no number to raise. The
 * moment a second crew is wanted, that is an ADR and not an edit here.
 */
const MOCK_CREW_WORKER_ID = 'mock-worker-1';

export class ConstructionSystem implements SystemRegistration {
  public readonly id = 'construction';
  public readonly order = 100;
  
  // Run every 10 ticks (2 times per second)
  public readonly schedule = { intervalTicks: 10, phaseTicks: 0 };

  private orders = new Map<string, BuildOrder>();

  // A transaction is just a list of order IDs.
  private undoStack: string[][] = [];
  private redoStack: string[][] = [];
  private currentTransaction: string[] = [];
  private currentTransactionId: string | undefined;

  public constructor(
    private readonly world: SparseWorld,
    private readonly materialsProvider: ConstructionMaterialsProvider = UNLIMITED_MATERIALS_PROVIDER,
    /**
     * Where a completed object order puts its object (ADR 0028 phase 1).
     *
     * Third and optional, so every existing caller -- `createNewSimulationRuntime`
     * aside -- constructs the system exactly as before. See
     * `ObjectPlacementSink`.
     */
    private readonly objectPlacement?: ObjectPlacementSink,
    /**
     * Where a completed door order registers its door.
     *
     * Fourth and optional, so every existing caller -- `createNewSimulationRuntime`
     * aside -- constructs the system exactly as before. Absent, a completed
     * door order still writes its `DOOR_EDGE_NUMERIC_ID` and registers nothing,
     * which is a barrier with no way through it: that is a bare
     * `ConstructionSystem` rather than a session, and it is why the one
     * production caller passes a sink. See `DoorPlacementSink`.
     */
    private readonly doorPlacement?: DoorPlacementSink,
    /**
     * Where the queue's unmet material demand is bought
     * ([ADR 0017](../../../docs/adr/0017-money-primary-resource-model.md)
     * decision 7, issue #627).
     *
     * Fifth and optional, so every existing caller -- `createNewSimulationRuntime`
     * aside -- constructs the system exactly as before. Absent, this system
     * behaves precisely as it did before #627: an order placed against an
     * empty container parks in `'materials-pending'` and is retried for ever.
     * That is still right for a bare `ConstructionSystem` wired to
     * `UNLIMITED_MATERIALS_PROVIDER`, or to a container something else fills
     * -- the determinism scenario's carry jobs, for one. See
     * `ConstructionProcurementSink`.
     */
    private readonly materialsProcurement?: ConstructionProcurementSink,
    /**
     * What the **scheduled** purchase pass bought, and what it could not
     * (issues #627, #629, #640).
     *
     * Sixth and optional, on exactly the terms the fifth is: every existing
     * caller constructs the system as before, and absent, `update` behaves
     * precisely as it did -- the report is computed and dropped, which is what
     * it did on this line until now.
     *
     * **Why a callback and not a `RefusalLog` held here.** This system owns no
     * refusal log and must not start owning one: `RefusalLog`'s own class
     * comment argues at length that it is a notice about something the player
     * just did, which is why it is not snapshotted, and a scheduled system is
     * the wrong place to reason about that. So the report is *handed out* and
     * the composition root decides what a session does with it -- the same
     * shape `ObjectPlacementSink` and `DoorPlacementSink` already use for
     * "something outside construction has to hear about this".
     *
     * **Only the press paths reported before, and that was the defect.**
     * `reportMaterialsFunding` had exactly two callers --
     * `construction/handler.ts` and `runtime/session-commands.ts`, both on a
     * press -- so a shortfall announced at the press was never revisited by
     * the retry that followed it. Measured on this branch: a prison spent down
     * to 40 against a wall costing 80 refuses, is then refunded to 25,000, and
     * builds the wall from the scheduled pass alone -- and `refusals.last` is
     * still the `purchase.insufficient-funds` recorded at tick 1, standing
     * over a solvent prison with the wall up.
     */
    private readonly onMaterialsProcured?: (report: MaterialsProcurementReport | undefined, tick: number) => void,
  ) {}

  /**
   * Accepts an order, or fails it with a reason.
   *
   * Four checks, in this order, and the order matters.
   *
   * **The buildable is asked about first**, because it is the only one of the
   * four that is a property of the *request* rather than of a tile or of the
   * order book: an order naming a row nobody declared is refused whatever is
   * under it and whatever else is queued, so asking about anything else would
   * be answering a narrower question first. It also touches nothing -- no
   * chunk lookup, no `canBuildAt`, no scan of `this.orders` -- which matters
   * because `SparseWorld` materialises a chunk on write and a refusal must
   * grow no world (`ObjectPlacementService.place` orders its own checks for the
   * same reason).
   *
   * `getBuildableDefinition` is deliberately **not** used here: it throws, and
   * this is reached from inside a kernel command dispatch, where a throw faults
   * the worker instead of refusing anything. The registry is read directly and
   * the answer becomes a `failReason` the player is told about, which is the
   * treatment `ObjectPlacementService` already gives the identical id for
   * `PlaceObject`. Until this check existed an unknown id was **approved**, and
   * `update`'s own lookup then threw on every scheduled tick for the rest of the
   * session -- and, because `snapshot()` carries the order, for the rest of the
   * save's life as well.
   *
   * **Second, whether this exact request is already standing** --
   * `duplicateClaim`, issue #514. Also a property of the request rather than
   * of a tile (it reads `this.orders`, never the world), so it keeps the same
   * place in the ordering the buildable check argues for: cheaper and more
   * fundamental questions first. See `duplicateClaim` for what "already
   * standing" means and why `completed` is included in it.
   *
   * Then the two tile checks, in the order they were already in: a tile outside
   * the materialised world has no ownership to ask about, so `out-of-bounds` is
   * decided before `canBuildAt` is ever handed a chunk that does not exist.
   * `admits` is that pair, asked of one tile.
   *
   * **For edge geometry the pair is asked of both tiles the edge separates,
   * and either one admitting is enough** (issue #448, ADR 0047 decision 6).
   * The world keeps one slot per edge and keeps it on the *north* and *west*
   * side, so the south boundary of a rectangle is the north edge of the row
   * below it and the east boundary is the west edge of the column to its
   * right -- tiles outside the rectangle. Asking only the order's own tile
   * therefore approved the north and west faces of owned land and refused the
   * south and east faces: the same physical wall, on the same property line,
   * decided by which of its two neighbours the world happened to keep the slot
   * on. `docs/WORLD.md`'s own justification -- *"a prison is a perimeter"* --
   * argues for the symmetric rule, and since ADR 0045 made `zone` refuse an
   * open `enclosed` room the asymmetry was a wrong *refusal* rather than a
   * wrong readout: a room flush against the edge of owned land could never be
   * sealed, so it could never be zoned.
   *
   * Three properties of the widening, each deliberate:
   *
   * - **The far tile is consulted only when the order's own tile is refused**,
   *   so the ordinary interior order costs exactly what it cost before, and a
   *   refusal still grows no world -- `getChunk` and `canBuildAt` are reads,
   *   and neither materialises a chunk the way a write does.
   * - **The refusal the player is told about is still their own tile's.** It
   *   is the tile they named and the one they can act on; reporting the far
   *   tile's reason would answer a question nobody asked. Every refusal this
   *   method could produce before it produces unchanged.
   * - **Non-edge buildables are untouched.** An object is addressed by a tile
   *   and has no far side, which is what `occupiesTileEdge` decides. It is the
   *   predicate rather than `category === 'wall'` written out again, because a
   *   door occupies an edge too and a second copy is how the two answers come
   *   to disagree -- `src/main.ts` holds exactly such a copy and it already
   *   does disagree, which `occupiesTileEdge`'s own comment now records.
   *
   * **What this makes reachable, stated rather than discovered.** An approved
   * order whose own tile is in a chunk that does not exist yet writes its edge
   * on completion, and `SparseWorld.setTopEdge` materialises the chunk to hold
   * it -- so walling the south face of the world's frontier grows a fresh
   * 32x32 chunk of unowned ground, which the render view draws because it draws
   * every loaded chunk. That is a visible change and it is **not** hidden
   * behind this fix; ADR 0047 decision 6 proposes a pre-materialised frontier
   * ring as the way to make it deliberate, and `docs/WORLD.md` records why
   * that is deferred rather than taken here.
   */
  public submitOrder(order: BuildOrder): void {
    if (this.orders.has(order.id)) {
      throw new Error(`BuildOrder ${order.id} already exists`);
    }

    const definition = BUILDABLE_REGISTRY.get(order.definitionId);
    if (definition === undefined) {
      order.state = 'failed';
      order.failReason = 'unknown-buildable';
      this.orders.set(order.id, order);
      return;
    }

    if (this.duplicateClaim(order, definition) !== undefined) {
      order.state = 'failed';
      order.failReason = 'duplicate-order';
      this.orders.set(order.id, order);
      return;
    }

    const refusal = this.admits(order.location);
    if (refusal !== undefined) {
      const across = occupiesTileEdge(definition) ? tileAcrossEdge(order.location, resolveBuildEdge(order)) : undefined;
      if (across === undefined || this.admits(across) !== undefined) {
        order.state = 'failed';
        order.failReason = refusal;
        this.orders.set(order.id, order);
        return;
      }
    }

    order.state = 'approved';
    this.orders.set(order.id, order);
  }

  /**
   * Whether one tile would carry this order, or the reason it would not.
   *
   * `undefined` means yes. The two checks are the two `submitOrder` already
   * ran, in the order it already ran them, extracted so that both tiles of an
   * edge can be asked the identical question -- a second copy of the pair is
   * how the two sides of one wall would come to be judged by different rules.
   */
  private admits(tile: TilePosition): BuildOrderFailReason | undefined {
    const { chunk } = tileToChunk(tile, this.world.tileChunkSize);
    if (this.world.getChunk(chunk) === undefined) return 'out-of-bounds';

    const buildability = canBuildAt(this.world, tile, SUBMISSION_REQUIREMENT);
    if (buildability.buildable) return undefined;
    return SUBMISSION_FAIL_REASONS[buildability.reason] ?? 'unbuildable';
  }

  /**
   * The other order this exact request duplicates, or `undefined` if none
   * claims the same ground (issue #514).
   *
   * "Same request" is `definitionId`, tile and resolved edge together --
   * exactly `buildSupersessionKey`'s four fields, because the withdrawal a
   * later success performs and the refusal a duplicate attempt earns are
   * about the identical identity: what a supersession forgives is what a
   * duplicate check should have refused in the first place. Only two of the
   * four are compared as coordinates and the third as a resolved edge because
   * `resolveBuildEdge` is what makes an order with no explicit `edge` and one
   * carrying `DEFAULT_BUILD_EDGE` explicitly compare equal, the same
   * normalisation `createConstructionCommandHandler` already applies when it
   * builds `order`'s own supersession key from this same order right after
   * `submitOrder` returns.
   *
   * **`definitionId` is part of the identity, not dropped.** Two different
   * buildables claiming the same tile edge -- a wall and, on the same edge, a
   * door -- are not a duplicate of one another under this method; whether
   * that combination should itself be refused is a separate, pre-existing
   * question this change does not touch (`revertConstruction`'s own comment
   * records that nothing rejects a second wall of a *different* kind on an
   * edge that already has one, and that stays true here).
   *
   * **`cancelled` and `failed` never claim, `completed` usually does, and
   * *which* buildable decides the exception.** A `completed` order has
   * already written its wall into the world -- that is the entire content of
   * issue #514's third question, "what happens to an order for a tile that
   * is already built": before this method existed, nothing did, and a second
   * identical order for an already-built edge was **approved**, allocated
   * its own materials once the crew reached it, and rebuilt geometry that
   * was already there, for nothing. Folding "already built" into the same
   * check that catches "still queued" is also the shape
   * `ObjectPlacementService.place` already uses for the identical pair of
   * facts about a tile, under its own `tile-occupied`.
   *
   * `cancelled` and `failed` are excluded unconditionally because both gave
   * the tile back: a cancelled order must not permanently block the same
   * request from being retried, and neither may an order that failed for an
   * unrelated reason (out of bounds, unowned land) and is then corrected and
   * resubmitted -- both are ordinary play, not a duplicate press.
   *
   * **A `completed` order for an *object* buildable (`placesObjectId`) is
   * the one case excluded too, and it is not this method guessing -- it is
   * this class's own asymmetry.** `ObjectPlacementService.remove` takes a
   * standing object away by deleting it from `PlacedObjectRegistry` directly
   * (`object-placement-service.ts`) and never calls `cancelOrder` for an
   * object that has already completed -- only for one still in flight. So a
   * bed's finished order stays `completed` in `this.orders` for the rest of
   * the session even after the bed itself is gone, and `PlacedObjectRegistry`
   * -- not this order -- is what is now authoritative for "is something
   * standing here". Counting that stale `completed` order as a claim would
   * refuse a player who removed a bed to move it from ever placing another
   * one on the freed tile, which is a worse bug than #514 in the opposite
   * direction: a refusal too eager to let ordinary play through
   * (`docs/AGENT_WORKFLOW.md`, "a refusal that is too eager is a worse bug
   * than the one being fixed"). It costs this method nothing extra to get
   * right: `ObjectPlacementService.place` already refuses a tile a standing
   * object or an in-flight order covers, under `tile-occupied`, before this
   * class is ever asked -- `tilesClaimedByOrdersInFlight` even excludes
   * `completed` from that scan for the identical reason -- so this method
   * only has to agree with a check that already exists, not invent tile
   * occupancy for objects on its own. Edge geometry (walls, doors) and pure
   * utility buildables have no such second registry -- `cancelOrder` is the
   * only way any of them is ever taken back, and it always leaves `cancelled`
   * behind -- so `completed` keeps meaning "still there" for every buildable
   * that is not this one exception.
   *
   * **Cost is one pass over every order this session has ever held, on a
   * player press and not on a tick.** `ObjectPlacementService`'s analogous
   * scan documents the same trade-off in the same words for the same reason:
   * `update()` already walks and sorts the full order list on every
   * scheduled construction tick (`schedule.intervalTicks: 10`, twice a
   * second, forever), which is a materially higher-frequency cost than one
   * more unsorted pass per `PlaceBuildOrder` command. Iteration order does not
   * matter to the answer -- this asks *whether* a claim exists, never *which*
   * one -- so the raw `Map` is walked directly rather than through
   * `orderedOrders()`, which would pay for a sort this method has no use for.
   */
  private duplicateClaim(order: BuildOrder, definition: BuildableDefinition): BuildOrder | undefined {
    const edge = resolveBuildEdge(order);
    const isObjectBuildable = definition.placesObjectId !== undefined;
    for (const existing of this.orders.values()) {
      if (existing.id === order.id) continue;
      if (existing.state === 'cancelled' || existing.state === 'failed') continue;
      if (existing.state === 'completed' && isObjectBuildable) continue;
      if (existing.definitionId !== order.definitionId) continue;
      if (existing.location.x !== order.location.x || existing.location.y !== order.location.y) continue;
      if (resolveBuildEdge(existing) !== edge) continue;
      return existing;
    }
    return undefined;
  }

  public registerTransactionOrder(orderId: string, transactionId?: string): void {
    if (transactionId !== this.currentTransactionId) {
      if (this.currentTransaction.length > 0) {
        this.undoStack.push([...this.currentTransaction]);
      }
      this.currentTransaction = [];
      this.currentTransactionId = transactionId;
      this.redoStack = []; // Clear redo stack on new action
    }
    this.currentTransaction.push(orderId);
  }

  /**
   * Reverses the most recent transaction, and answers **whether it reversed
   * anything and whether what it reversed was past the point of no return**
   * (#749, #927).
   *
   * ## Why the return value exists, and what it is deliberately not
   *
   * It is not a count. The owner's ruling of 2026-09-01 on
   * [#749](https://github.com/matmaxalez/lockstate/issues/749) gives Undo a
   * success sentence and rules that it *"does not name a count"* -- an undo
   * reverses a whole transaction, so naming one order would be a small lie
   * whenever a run of several was taken back -- and rules explicitly that the
   * transaction-size plumbing is **not** to be built. `redoTransaction.length`
   * is sitting right there and is not returned, on purpose.
   *
   * **This method answered a bare `boolean` until
   * [#927](https://github.com/matmaxalez/lockstate/issues/927), and the
   * paragraph above is kept whole because it is still the rule -- what changed
   * is that one bit was not enough to be honest with.** A `boolean` says only
   * *something moved*, so the handler could say only *"the last change to the
   * build queue was undone"* -- over a press that had just destroyed a finished
   * wall's materials and refunded nothing. `ConstructionUndoOutcome` adds the
   * one bit that fixes it and no more: `spendDestroyed` is not a size and
   * cannot grow into one. See that type for why it is not the plumbing the
   * ruling declined.
   *
   * What *is* needed for that sentence to be honest is the one bit this
   * answers: a press against an empty stack, or against a transaction whose
   * orders have all reached a terminal state, reverses nothing, and a band
   * reading "the last change to the build queue was undone" over a queue
   * nothing happened to is the player-visible promise the code does not keep
   * that `AGENTS.md`'s fourth exclusion is about. `false` is what stops the
   * handler saying it.
   *
   * Both no-op shapes answer `{ reversed: false }` and the second is the one a
   * caller would miss: a transaction *was* popped -- so the undo stack really
   * did shrink -- and yet nothing in the world changed, because `isCancellable`
   * rejected every order in it. The redo stack is not pushed in that case
   * either, which is the existing behaviour this return value now reports
   * rather than changes.
   *
   * ## Where `spendDestroyed` is read from, and why it costs nothing
   *
   * The state each order is in **before** `cancelOrder` is called, which this
   * loop already holds in `order` and which `cancelOrder` would otherwise
   * compute privately and throw away -- the same read, for the same reason, the
   * `CancelBuildOrder` branch of `createConstructionCommandHandler` makes one
   * level up. Read after the call every order is `'cancelled'` and the
   * distinction is gone.
   *
   * It is an **or** across the transaction, not a per-order answer: a drag that
   * mixes three finished walls with nine queued ones destroys what the three
   * cost and refunds what the nine did, and *"anything already spent past the
   * point of no return stays spent"* is true of exactly that mixture. A
   * per-order breakdown would be the count the ruling declined, arrived at from
   * the other side.
   */
  public undo(): ConstructionUndoOutcome {
    if (this.currentTransaction.length > 0) {
      this.undoStack.push([...this.currentTransaction]);
      this.currentTransaction = [];
      this.currentTransactionId = undefined;
    }

    const transaction = this.undoStack.pop();
    if (!transaction) return { reversed: false }; // Nothing to undo

    const redoTransaction: string[] = [];
    let spendDestroyed = false;

    for (const orderId of transaction) {
      const order = this.orders.get(orderId);
      if (!order) continue;

      // Undo is exactly "cancel every order in this transaction", including a
      // `completed` one -- which is why it goes through `cancelOrder` rather
      // than assigning the state here. A completed order has written a wall
      // into the world's edge layers; leaving that wall standing while the
      // order reads `cancelled` would make the undo stack a lie, and would
      // leave geometry nothing can ever remove. `cancelOrder` reverses the
      // write, so undo means the same thing for a finished order as for a
      // pending one.
      if (!isCancellable(order.state)) continue;
      // Before the call, because `cancelOrder` sets `'cancelled'` on its second
      // line. This is the whole of #927's plumbing.
      if (destroysSpendOnCancel(order.state)) spendDestroyed = true;
      this.cancelOrder(orderId);
      redoTransaction.push(orderId);
    }

    if (redoTransaction.length === 0) return { reversed: false };
    this.redoStack.push(redoTransaction);
    return { reversed: true, spendDestroyed };
  }

  /**
   * Re-applies the most recent undone transaction, and answers whether it
   * re-applied anything (#749).
   *
   * The mirror of `undo` above on every point that method's docblock makes,
   * including the one it is most tempting to drop: `undoTransaction.length` is
   * a count and is not returned, because the owner's ruling gives Redo a
   * sentence that names no count either.
   *
   * `false` covers the empty redo stack and the popped transaction whose orders
   * were no longer `'cancelled'` -- reachable because `redo` restores only an
   * order still in that state, and a later press may have moved it.
   */
  public redo(): boolean {
    const transaction = this.redoStack.pop();
    if (!transaction) return false; // Nothing to redo

    const undoTransaction: string[] = [];

    for (const orderId of transaction) {
      const order = this.orders.get(orderId);
      if (!order) continue;
      
      if (order.state === 'cancelled') {
        // We restore it to approved
        order.state = 'approved';
        undoTransaction.push(orderId);
      }
    }

    if (undoTransaction.length === 0) return false;
    this.undoStack.push(undoTransaction);
    return true;
  }

  /**
   * Cancels an order, undoing the world geometry it wrote if it had already
   * finished.
   *
   * `completed` is cancellable *because* completing now changes the world. A
   * finished wall that could not be taken down would be permanent the moment
   * it was placed -- and `undo()` delegates here, so refusing a completed
   * order would leave the undo stack claiming to have reversed something it
   * had not.
   *
   * `cancelled` and `failed` still throw: they are terminal, and there is no
   * geometry behind them to reverse.
   *
   * ## What comes back, and in which currency (the owner's ruling 20 of
   * 2026-08-31)
   *
   * *"Anulowanie zwraca pieniądze zamiast cegieł"* and *"Pieniądze dopóki ekipa
   * nie zaczęła"* -- money instead of bricks, and only until the crew has
   * started. [ADR 0076](../../../docs/adr/0076-what-happens-to-a-resident-whose-bed-is-taken-away.md)'s
   * amendment of that date records both, says which part of its decision B they
   * supersede, and is **unsigned**: this method is what the owner is being asked
   * to sign, not something the signature has already covered.
   *
   * | state at the press | what the player gets |
   * | --- | --- |
   * | `planned` | nothing, and nothing was spent: `pendingOrderDemand` never counts a planned order, so no purchase was ever made for it |
   * | `approved` | money -- the just-in-time deliveries its demand caused, where the whole delivery is now surplus |
   * | `materials-pending` | the same |
   * | `assigned` | money -- the catalogue value of the allocation it is holding; the materials are **not** returned to stock |
   * | `in-progress` | nothing at all. The allocation is dropped unreleased and unpaid |
   * | `completed` | **nothing at all**, in either currency, and the geometry still comes down |
   *
   * **The `completed` row read *"the materials, into the container, exactly as
   * before -- ADR 0076 decision B, which ruling 20 does not reach"* until
   * 2026-09-01, and it is marked rather than rewritten because it is what
   * decision B decided.** The owner's ruling of that date -- *"Taking a
   * finished object away returns nothing. Not its materials, not its money."*
   * -- reverses B's own sentence and closes the inversion ruling 20 created and
   * reported: cancel at `in-progress` and the materials were gone, wait for
   * `completed` and `Undo` returned them all, so it paid to let the crew
   * finish. ADR 0076's *"Amendment, 2026-09-01: taking a finished object away
   * returns nothing"* records it.
   *
   * **The ruling says *object* and this method cannot tell a bed from a wall,
   * so it is read as "a completed order".** The inversion is identical for a
   * wall, and branching on `placesObjectId` here would close it for the
   * buildable a player places rarely and leave it open for the one they draw
   * most -- *"two commands disagree"*, which decision B existed to end,
   * reappearing as *"two buildables disagree"*. The amendment flags this as the
   * one place the implementation is wider than the words, and the owner's
   * signature covers it.
   *
   * **Reversing the geometry is not the refund and does not travel with it.**
   * `revertConstruction` still runs for a `completed` order, `isCancellable`
   * still holds `'completed'`, and `undo()` still delegates here -- for the
   * reason those three always gave: a finished wall that could not be taken
   * down would be permanent the moment it was placed, and an undo stack that
   * claimed to have reversed something it had not would be a lie.
   *
   * **Why `in-progress` destroys value on purpose.** It is the only place in
   * the money loop where value leaves rather than changing form, and it is the
   * whole content of the second ruling: if the materials came back in either
   * currency, cancelling late would cost nothing and "until the crew has
   * started" would be a distinction without a difference. The materials went
   * into a wall that is now being un-built.
   *
   * **One refund per order, in exactly one currency, with the allocation
   * emptied in the same step.** That is decision B's hazard inherited word for
   * word with *materials* replaced by *money*, and it is sharper than B's was:
   * B's double refund needed two presses, and paying for the plank while also
   * releasing it needs one. Every branch below therefore ends at the same
   * `materialsAllocated = []`, and `redo()` -- which returns an order to
   * `'approved'` and lets it allocate again -- can find nothing stale to be
   * paid a second time from.
   *
   * **A line the catalogue cannot price is released rather than destroyed.** A
   * buildable may require an item nothing sells (`UnprocurableMaterial`'s
   * `'unpurchasable'`), and there is no honest money figure for it; the sink
   * hands those lines back and they go into the container the way every line
   * used to.
   *
   * **With no procurement sink wired, every cancellable state releases exactly
   * as it did before ruling 20, and `in-progress` and `completed` are the two
   * exceptions.** A bare `ConstructionSystem` is not a session -- it has no
   * treasury behind it and cannot pay anybody -- so "money instead of bricks"
   * has no meaning there and the materials go back, which is what
   * `UNLIMITED_MATERIALS_PROVIDER` and `ContainerMaterialsProvider` have always
   * done. Neither of those two is conditional on the sink because their rule is
   * not about money: the materials are consumed by works that are being
   * un-built, whether or not anybody is keeping accounts.
   *
   * **This sentence said `in-progress` was *"the one exception"* and it stopped
   * being true on 2026-09-01, the day the ruling above moved `completed` into
   * the same arm; it is corrected rather than deleted because the count is
   * exactly the kind of claim that rots** (`docs/AGENT_WORKFLOW.md` §4). Found
   * while reading this method for #927, three days late.
   *
   * **What stops that fallback hiding a lost wiring** is that the sink's one
   * production caller is `createNewSimulationRuntime`, and
   * `tests/integration/economy-money-conservation.test.ts` drives that function
   * rather than a fixture: a session whose sink went missing would refund
   * bricks where those cases measure money, in every one of the states ruling
   * 20 names. This is not the `composition-root-contract` shape of hazard --
   * that gate is about `src/main.ts`, which does not construct this system.
   */
  public cancelOrder(id: string): void {
    const order = this.orders.get(id);
    if (!order) throw new Error(`BuildOrder ${id} not found`);
    if (!isCancellable(order.state)) {
      throw new Error(`Cannot cancel order in state ${order.state}`);
    }

    const stateAtCancellation = order.state;
    const hadGeometry = stateAtCancellation === 'completed';
    order.state = 'cancelled';
    if (hadGeometry) this.revertConstruction(order);

    if (order.materialsAllocated.length > 0) {
      // Read before the field is emptied, because both the release and the
      // refund are computed from it and the emptying is unconditional.
      const allocated = order.materialsAllocated;
      order.materialsAllocated = [];
      if (destroysSpendOnCancel(stateAtCancellation)) {
        // Ruling 20's "nothing" for `in-progress`, and the owner's ruling of
        // 2026-09-01 for `completed`. Neither released nor paid for: see the
        // table above for why each is the ruling rather than a leak.
        //
        // **The condition read `stateAtCancellation === 'in-progress' ||
        // hadGeometry` until #927 and is now the named `destroysSpendOnCancel`,
        // which is the same test and not a new one.** `undo()` needs the same
        // question answered to say what it destroyed, and two inline copies of
        // a two-state set is how they come to disagree.
        //
        // **`hadGeometry` moved into this arm on 2026-09-01 and the line it
        // left is kept in the table above rather than deleted.** It used to
        // read `hadGeometry || this.materialsProcurement === undefined`, and
        // that first operand was ADR 0076 decision B: a finished thing
        // un-builds into its full materials, which is what ruling 20 declined
        // to reach and what this ruling reverses.
        //
        // **Neither of these two states is conditional on the procurement
        // sink**, and the reason is the same for both: their rule is not about
        // money. The materials went into works that are being un-built, and
        // they are gone whether or not anybody is keeping accounts. Only the
        // four states below choose a currency, which is why only they ask
        // whether there is a treasury behind them.
      } else if (this.materialsProcurement === undefined) {
        this.materialsProvider.release(allocated);
      } else {
        this.materialsProvider.release(this.materialsProcurement.refundAllocatedMaterials(allocated));
      }
    }

    this.refundSurplusOf(stateAtCancellation, order);
  }

  /**
   * Takes back the money a cancellation has just made surplus, where it is
   * still recoverable.
   *
   * ## Why this is here at all
   *
   * A `PlaceBuildOrder` buys at the press (`procureQueuedMaterials`, ADR 0017
   * decision 7), and the goods take `PROCUREMENT_DELIVERY_DELAY_TICKS` to land.
   * So an order cancelled soon after it is placed is holding **nothing** -- it
   * never reached `tryAllocate` -- while its money sits in a delivery on the
   * road. Without this, "cancelling gives back money" would be false in
   * precisely the state a player is most likely to press it in, and the four
   * refundable states ruling 20 names would collapse to one.
   *
   * It is the supply-side mirror of `withdrawOrdersAwaitingMaterial`, which
   * #687 built for the opposite press: that one answers a cancelled *delivery*
   * by removing demand, this one answers a cancelled *order* by removing
   * supply. Both stop at the same line -- the point where the next scheduled
   * pass would find nothing to buy -- and both read it off the same two
   * figures, `demandedQuantityOf` and `ConstructionProcurementSink.heldOrInFlightOf`.
   *
   * ## Which states it runs for, and why not the others
   *
   * `'approved'` and `'materials-pending'` only: they are the two states
   * `pendingOrderDemand` counts, so they are the only ones whose cancellation
   * moves the demand figure this is subtracting from. An `'assigned'` or
   * `'in-progress'` order is not demand -- its materials were withdrawn from
   * the container by `tryAllocate` -- so running this for one would compare an
   * unchanged demand against an unchanged supply and could only act on a
   * surplus some *earlier* press had already been offered. `'planned'` is not
   * demand either. `'completed'` is left out for a different reason, and since
   * the owner's ruling of 2026-09-01 that reason has become the simple one:
   * **a completed order releases nothing**, so it cannot raise supply and
   * cannot make a delivery surplus.
   *
   * **This paragraph read *"releasing its materials really does raise supply
   * and really could make a delivery surplus, but ADR 0076 decision B governs
   * that press and ruling 20 does not reach it, so its behaviour is left
   * exactly where B put it"* until then.** It was the honest reading while
   * decision B stood: the exclusion was a deferral to another decision rather
   * than an argument. The deferral is answered -- ADR 0076's amendment of
   * 2026-09-01 reverses B -- and what the exclusion now rests on is arithmetic,
   * which is the stronger footing for the same line of code.
   *
   * ## Re-entrancy with `withdrawOrdersAwaitingMaterial`
   *
   * That method calls `cancelOrder` in a loop, so this runs inside it. It
   * cannot make that loop run away: the loop only cancels while demand still
   * *exceeds* supply, and this only refunds while supply exceeds demand, so at
   * most one of the two is ever doing anything. The `#687` sequence -- cancel a
   * delivery, then withdraw orders behind it -- therefore reaches exactly the
   * same end state it reached before this existed.
   */
  private refundSurplusOf(stateAtCancellation: BuildOrder['state'], order: BuildOrder): void {
    const sink = this.materialsProcurement;
    if (sink === undefined) return;
    if (stateAtCancellation !== 'approved' && stateAtCancellation !== 'materials-pending') return;
    const definition = BUILDABLE_REGISTRY.get(order.definitionId);
    if (definition === undefined) return;
    // Ascending item id: this credits the treasury, so the walk writes
    // simulation state (`docs/DETERMINISM.md`, "Canonical iteration order").
    const itemIds = [...new Set(definition.materialsRequired.map((requirement) => requirement.itemId))].sort();
    for (const itemId of itemIds) {
      sink.refundSurplusDeliveries(itemId, this.demandedQuantityOf(itemId));
    }
  }

  /**
   * What `cancelOrder(orderId)` would credit the treasury right now, without
   * calling it -- the figure the Build panel's queue row shows beside its own
   * Cancel button (the owner's ruling of 2026-09-02).
   *
   * ## Why a preview and not the row reading `cancelOrder`'s own return
   *
   * `cancelOrder` answers `void` and mutates on every call -- it flips the
   * order to `'cancelled'`, drops its allocation, and (through the sink) may
   * turn a delivery around -- and the row is painted from a **projection**,
   * read on a cadence with no press behind it
   * (`src/simulation/presentation/construction-projection.ts`). Reading the
   * figure the same way the row reads everything else would cancel the order
   * to find out what cancelling it pays.
   *
   * ## The table this reads, and where it actually lives
   *
   * `cancelOrder`'s own docblock carries the owner's ruling 20 table -- what
   * state pays what -- and this method's branches are that table, because a
   * preview has no mutated `order.state` to dispatch on and therefore cannot
   * be folded into `refundSurplusOf`'s existing dispatch the way this method's
   * one sibling call is. What is **not** restated is any arithmetic: every
   * money figure below is computed by `sink.previewSurplusRefundMinorUnits` or
   * `sink.previewAllocatedRefundMinorUnits`, the exact non-mutating twins of
   * the two calls `cancelOrder` itself makes
   * (`sink.refundSurplusDeliveries`, `sink.refundAllocatedMaterials`) --
   * sharing their selection and pricing rules with those methods by
   * construction, not by this method's own judgement about what they would
   * answer.
   *
   * `demandedQuantityOf(itemId, id)` is the one place this diverges from
   * `refundSurplusOf`'s own call to it, and it has to: `refundSurplusOf` runs
   * after `cancelOrder` has already written `order.state = 'cancelled'`, so
   * the demand walk excludes this order for free. This method must not write
   * that, so it passes the order's own id to exclude it explicitly instead --
   * see `pendingOrderDemand`'s comment.
   *
   * `0` for an id that names no order, for a terminal state (`isCancellable`
   * says no), and for every state ruling 20 (and the owner's ruling of
   * 2026-09-01 for `completed`) pays nothing for: `'planned'`,
   * `'in-progress'`, `'completed'`. `0` also when no procurement sink is
   * wired -- a bare `ConstructionSystem` has no treasury to credit, and
   * `cancelOrder` pays no money there either, exactly as `refundSurplusOf`
   * itself returns early for the same reason.
   *
   * Never throws and never asserts `isCancellable` past the early return:
   * this is read by a projection request, which the same contract
   * `refundSurplusDeliveries` and its siblings are held to (must not throw)
   * binds transitively -- a row that cannot be cancelled simply reads `0`.
   */
  public previewCancelRefundMinorUnits(orderId: string): number {
    const order = this.orders.get(orderId);
    if (order === undefined || !isCancellable(order.state)) return 0;
    const sink = this.materialsProcurement;
    if (sink === undefined) return 0;

    const stateAtCancellation = order.state;
    if (order.materialsAllocated.length > 0) {
      // Only `'assigned'` reaches here paying anything: `'in-progress'` and
      // `'completed'` are the two states `cancelOrder` destroys an allocation
      // for rather than pricing it (ruling 20, and the owner's ruling of
      // 2026-09-01 for `completed`), and both hold a non-empty
      // `materialsAllocated` exactly as `'assigned'` does.
      if (stateAtCancellation === 'in-progress' || stateAtCancellation === 'completed') return 0;
      return sink.previewAllocatedRefundMinorUnits(order.materialsAllocated);
    }

    // Empty `materialsAllocated` and cancellable is `'planned'`, `'approved'`
    // or `'materials-pending'`: the three states that have not allocated yet.
    // Only the last two are `refundSurplusOf`'s own candidates -- `'planned'`
    // never became demand, so `pendingOrderDemand` never counted it and no
    // purchase was ever made for it.
    if (stateAtCancellation !== 'approved' && stateAtCancellation !== 'materials-pending') return 0;
    const definition = BUILDABLE_REGISTRY.get(order.definitionId);
    if (definition === undefined) return 0;
    // Ascending item id, matching `refundSurplusOf`'s own walk -- this reads no
    // simulation state, but a preview that visited items in a different order
    // from the real cancellation would be a second opinion about the walk
    // rather than a read of it.
    const itemIds = [...new Set(definition.materialsRequired.map((requirement) => requirement.itemId))].sort();
    let refundMinorUnits = 0;
    for (const itemId of itemIds) {
      refundMinorUnits += sink.previewSurplusRefundMinorUnits(itemId, this.demandedQuantityOf(itemId, order.id));
    }
    return refundMinorUnits;
  }

  /**
   * Takes queued orders back off the book until the prison no longer has to
   * buy `itemId` again -- the demand-side answer to a cancelled just-in-time
   * delivery (issue #687).
   *
   * ## What it is for
   *
   * `ProcurementSystem.cancel` refunds a delivery that has not landed, exactly,
   * and #285 built the command that reaches it so a player could take money
   * back. #640 then made a build order buy its own materials, and the two
   * together produce a control that lies: the procurement fold offers *"15
   * bought - 1,200 back if cancelled"*, the money really does come back
   * (`23,800 -> 24,760`, measured on issue #687), and the first scheduled
   * construction tick after *Play* spends it again, because the fifteen orders
   * are still queued and `procureQueuedMaterials` still finds their deficit.
   * Nothing is wrong in either half. What is missing is that cancelling the
   * *supply* left the *demand* standing.
   *
   * So this removes exactly as much demand as it takes to make the refund
   * survive the clock, and no more.
   *
   * ## Why the loop asks the sink rather than counting the delivery
   *
   * The cancelled quantity is the obvious measure and it is the wrong one. A
   * just-in-time purchase buys the **deficit**, which is demand minus stock
   * minus everything already in flight, so its quantity is not the demand it
   * answers: cancel a two-brick delivery against a container that has since
   * taken in ten bricks of its own and no order needs withdrawing at all.
   * Asking `heldOrInFlightOf` is asking the same subtraction the next
   * scheduled pass will make, so this stops at exactly the point that pass
   * stops finding anything to buy.
   *
   * ## Which order goes
   *
   * The **last order in the crew's own walk** among those still waiting on
   * materials: `update` iterates `orderedOrders()` and starts the first
   * eligible order, so the last one is the work furthest from being reached.
   * Withdrawing from the back therefore never takes an order the crew was
   * about to start, and it is a function of the order book alone -- no clock,
   * no insertion order, no RNG (`docs/DETERMINISM.md`, "Canonical iteration
   * order").
   *
   * **Since ADR 0082 (#722) that is the segment the player drew last, and the
   * three paragraphs below are the record of what it was before.** The walk is
   * `(placementSequence ?? -1, id)`, so the back of it is the newest gesture,
   * and "withdraw the one the player drew last" is now exactly what this does
   * for any order placed through a command. What is unchanged is the property
   * the old text was defending: the answer is still the same segment on every
   * machine and after every restore, because the ordinal is persisted and
   * `restore()` brings it back with the order.
   *
   * **Until 2026-08-31 it was the greatest id**, and ids are
   * `order-${crypto.randomUUID()}` on the main thread, so it was **not**
   * placement order and the segment that went was not the last one drawn.
   *
   * **#693 called this "the least surprising segment to take" and named its own
   * doubt about that; the doubt was right and its guess about what a player
   * sees was wrong in the direction that matters.** It expected a segment to
   * vanish *"from somewhere in the middle of the line"*. A UUID's ordinal
   * position within a run is uniform, so the greatest id was as likely to be
   * either end of the row as the middle -- and the extreme case was reachable
   * rather than theoretical: with ids that do not follow placement order the
   * segment withdrawn could be the tile the player drew **first**, at the far
   * left of a left-to-right drag. Measured, no browser needed, because a
   * `BuildOrder` carries its own `location`:
   * `tests/integration/economy-refund-survives-the-clock.test.ts`, which used
   * to assert *"takes whichever segment holds the greatest id, which can be
   * the first one drawn"* and now asserts the placement-ordered answer for a
   * stamped queue beside the unchanged id-ordered answer for one that carries
   * no ordinals. **#693's doubt is closed by that, not merely acknowledged.**
   *
   * **What would change it is a persisted field and therefore a save-format
   * decision, not a better sort.** That sentence was true when it was written
   * and `BuildOrder.placementSequence` is that field -- one optional key in
   * `buildOrderSchema`, no `SAVE_SCHEMA_VERSION` bump, argued in ADR 0082's
   * "The save-format cost". The rest of the old paragraph still holds and is
   * why the fix took that shape rather than another: `Map` insertion order is
   * not available, because `orderedOrders` re-sorts precisely so that a
   * restore cannot change the answer, and a snapshot is not required to
   * preserve insertion order.
   *
   * **An order book with no ordinals behaves exactly as it did**, which is
   * every save written before the field and every fixture that builds orders
   * directly: they tie at the `-1` sentinel and the id decides, so this still
   * withdraws the greatest id there.
   *
   * ## What it cannot create
   *
   * Only `'approved'` and `'materials-pending'` orders are candidates -- the
   * two states `pendingMaterialDemand` counts, and the two that have **not**
   * allocated anything. `cancelOrder` releases `materialsAllocated` back into
   * the container, so withdrawing an order that had allocated would put stock
   * back at the same moment the caller credited the treasury, which is
   * `tests/integration/economy-money-conservation.test.ts`'s mutation M2 --
   * value created out of a keystroke -- and is what #285 refused when it
   * declined to wire a refund to `undo()`. An order in these two states holds
   * an empty `materialsAllocated`, so the release is a no-op and the only
   * thing that moves is the money the delivery itself carried.
   *
   * **The middle of that paragraph changed under the owner's ruling 20 of
   * 2026-08-31 and the conclusion did not, which is why it is marked rather
   * than rewritten.** `cancelOrder` no longer releases an allocation in these
   * states -- it pays for it -- so what withdrawing an allocated order would
   * now do is credit the treasury *twice over*, once for the allocation and
   * once for the delivery. That is the same M2, reached by a shorter route. The
   * candidate set is unchanged and the empty-allocation property it rests on is
   * unchanged with it.
   *
   * Answers the ids it withdrew, newest-walked first, so a caller can say what
   * happened. `[]` when no sink is wired -- a bare `ConstructionSystem` buys
   * nothing, so nothing can have been cancelled on its behalf.
   */
  public withdrawOrdersAwaitingMaterial(itemId: string): readonly string[] {
    const sink = this.materialsProcurement;
    if (sink === undefined) return [];

    const withdrawn: string[] = [];
    // Bounded by the order book: every pass either cancels one candidate --
    // which removes it from the candidate set for ever, `cancelled` being
    // terminal -- or stops. It cannot spin on an order it fails to remove.
    for (;;) {
      const demanded = this.demandedQuantityOf(itemId);
      if (demanded <= sink.heldOrInFlightOf(itemId)) break;
      const candidate = this.lastOrderAwaitingMaterial(itemId);
      if (candidate === undefined) break;
      this.cancelOrder(candidate.id);
      withdrawn.push(candidate.id);
    }
    return withdrawn;
  }

  /**
   * What the queue still wants of one item, read off `pendingMaterialDemand`
   * so the two can never disagree. `excludeOrderId` is threaded through to it;
   * see that method's own comment for why it exists.
   */
  private demandedQuantityOf(itemId: string, excludeOrderId?: string): number {
    for (const requirement of this.pendingMaterialDemand(this.orderedOrders(), excludeOrderId)) {
      if (requirement.itemId === itemId) return requirement.quantity;
    }
    return 0;
  }

  /**
   * The last order in the crew's walk that is still waiting for `itemId`.
   *
   * "Last in the walk" is the whole of the rule and it is deliberately not
   * spelled out as an id or as an ordinal: `orderedOrders()` owns what the
   * walk is, and this loop reads it backwards. That is why ADR 0082 changed
   * which segment is withdrawn without changing a line of this method.
   *
   * The candidate set is exactly `pendingMaterialDemand`'s -- `'approved'` or
   * `'materials-pending'`, a definition the registry still holds, a positive
   * requirement for this item -- because withdrawing an order that contributes
   * nothing to the demand would not move the figure the caller is driving to
   * zero, and the loop would then cancel the whole queue one order at a time.
   */
  private lastOrderAwaitingMaterial(itemId: string): BuildOrder | undefined {
    const ordered = this.orderedOrders();
    for (let index = ordered.length - 1; index >= 0; index -= 1) {
      const order = ordered[index]!;
      if (order.state !== 'approved' && order.state !== 'materials-pending') continue;
      const definition = BUILDABLE_REGISTRY.get(order.definitionId);
      if (definition === undefined) continue;
      if (definition.materialsRequired.some((requirement) => requirement.itemId === itemId && requirement.quantity > 0)) {
        return order;
      }
    }
    return undefined;
  }

  public getOrder(id: string): BuildOrder | undefined {
    return this.orders.get(id);
  }

  /**
   * Every order, in placement order with ascending id as the tie-break, never
   * `Map` insertion order.
   *
   * **This read "ascending id (code-unit order)" until 2026-08-31, and that is
   * what it did.** ADR 0082 decisions 1 and 2 changed the first key and kept
   * the second: the walk is now `(placementSequence ?? -1, id)`, which is
   * `compareBuildOrderExecution`. The old sentence is kept because the rest of
   * this docblock is an argument about why the sort exists at all, and that
   * argument is untouched by which key it sorts on.
   *
   * This stopped being cosmetic the moment `finalizeConstruction` began
   * writing world geometry: two orders that finish on the same scheduled tick
   * and claim the same tile edge are resolved by whichever is processed last,
   * so insertion order would decide what the world looks like. Insertion
   * order is a property of how a session happened to be built, and
   * `restore()` re-inserts from a snapshot rather than replaying that
   * history -- so a restored session could disagree with the live one it came
   * from. See `docs/DETERMINISM.md`, "Canonical iteration order".
   *
   * **Sorting on a persisted field keeps every word of that.**
   * `placementSequence` is in the snapshot and comes back through `restore()`
   * with the order it belongs to, so the sequence a restored session answers
   * is the same one the live session answered -- which is the property the
   * sort has to have, and the one `Map` insertion order does not.
   */
  private orderedOrders(): readonly BuildOrder[] {
    return [...this.orders.values()].sort(compareBuildOrderExecution);
  }

  /**
   * Every order, in the same placement order every internal walk uses.
   *
   * Public because the object placement boundary has to know which tiles orders
   * *in flight* have already claimed: two beds ordered onto one tile inside the
   * sixty ticks a bed takes to build would otherwise both be accepted, and the
   * second would silently fail to appear when it finished
   * (`ObjectPlacementService.place`). Nothing else reads it, and it hands out
   * the live order objects rather than copies for the same reason
   * `getOrder` does -- the caller reads `state`, `definitionId` and `location`
   * and writes none of them.
   */
  public allOrders(): readonly BuildOrder[] {
    return this.orderedOrders();
  }

  /**
   * Advances every order by one scheduled tick, with **one order in progress
   * at a time**.
   *
   * Before this, money was the only thing that stood between a player and a
   * finished prison: every `assigned` order started on the tick it was
   * assigned, and every `in-progress` order advanced on every scheduled tick,
   * so a hundred walls finished in the time one wall takes (ADR 0028 measured
   * it: "a hundred objects take the same wall-clock time as one"). The clocks
   * meant nothing, because nothing was ever waited for.
   *
   * So the mock crew becomes an actual crew of one: the order already in
   * progress continues, and a waiting order starts only when the crew is
   * free. Everything else about the lifecycle is untouched -- materials are
   * still allocated the moment they are available, and the per-order tick
   * cost is unchanged, so a *single* order still finishes exactly when it
   * used to.
   *
   * **Whether the crew is free is decided once, before the walk, and not
   * re-decided as it proceeds.** The walk is `orderedOrders()` -- placement
   * order with id as the tie-break since ADR 0082 (#722), ascending id alone
   * before it -- which is the canonical sequence the whole class uses. If occupancy were
   * re-read per order, then an order finishing during this pass would free the
   * crew for any waiting order sorting *after* it and not for one sorting
   * before -- so whether a queue lost a tick at each handover would depend on
   * the ids the session happened to mint. Deciding once makes the handover
   * cost the same one scheduled tick for every queue: the finishing tick, then
   * a promotion tick, then progress. It is still fully determined by order
   * state, so it survives a save (see below) and involves no RNG.
   *
   * **Orders already in progress when a pre-existing save loads are all
   * allowed to finish -- they are not paused down to one.** A save written
   * before this rule can hold any number of `in-progress` orders, and the
   * alternative was to deterministically pause all but the first. That is the
   * worse surprise: the player left a prison with six walls rising and would
   * come back to five stopped for a reason nothing in the game explains, with
   * their progress frozen rather than lost. Letting old work drain costs
   * nothing permanent -- the crew simply reads as busy until the last of it
   * finishes, and the queue behind it is single-file from then on. This is a
   * choice and not an oversight: the code that produces it is the occupancy
   * check treating *any* in-progress order as a busy crew, so grandfathering
   * needs no restore-time branch and no save-schema field (`state`,
   * `progress` and `assignedWorkerId` are already persisted, so the rule is
   * derived entirely from state a v0.0.76 save already carries).
   *
   * This is a pacing placeholder, not a model of labour: no builder walks
   * anywhere, the crew has no identity beyond `MOCK_CREW_WORKER_ID`, and no
   * staff role gates it. Wiring it to `staff-role.maintenance-worker` would
   * be worse than not wiring it, because staff assignment does not filter by
   * role yet (`GuardRoster.unassignedGuardIds()` hands out anyone), which is
   * the same defect the Staff panel avoids by exposing only guards.
   */
  public update(context: SimulationContext): void {
    const orders = this.orderedOrders();
    // Read once, before the walk. See the note above on why this is not
    // re-read per order, and why an old save's several in-progress orders all
    // read as one busy crew here rather than being paused.
    let crewBusy = orders.some((candidate) => candidate.state === 'in-progress');

    /*
     * **Buy what the queue needs before asking whether it can be allocated**
     * (issue #627, ADR 0017 decision 7).
     *
     * Before the walk rather than inside it, and once rather than per order,
     * for the reason `ConstructionProcurementSink` sets out at length.
     *
     * **Unconditionally, including with nothing queued.** The sink records
     * what it could not afford, and a record with no moment to be cleared goes
     * stale the instant the queue drains. This call is that moment.
     *
     * It buys nothing when the prison already holds the materials or has them
     * in flight, which is the entire cost of this line for a player who
     * pre-buys -- and it is also why this call is not a second purchase on top
     * of the one the `PlaceBuildOrder` handler already made at this tick.
     *
     * **The report is handed to `onMaterialsProcured` rather than discarded**,
     * which is the whole of #640's second finding. See that parameter.
     */
    this.onMaterialsProcured?.(this.procureQueuedMaterials(context.tick), context.tick);

    for (const order of orders) {
      // A terminal order needs no definition, so it is not asked for one. This
      // used to be a `case` at the bottom of the switch, below an
      // unconditional lookup -- which meant a *completed* order was still
      // being resolved every scheduled tick to decide to do nothing, and a
      // save carrying a finished order for a row a later catalogue no longer
      // ships would have faulted the worker on the same line. Skipping first
      // also keeps a completed order out of the refusal branch below: what it
      // built is in the world, and re-failing it would be a state regression
      // rather than a recovery.
      if (order.state === 'completed' || order.state === 'cancelled' || order.state === 'failed') {
        continue;
      }

      // Read leniently, because **this is inside a scheduled system update and
      // a throw here faults the worker.** `getBuildableDefinition` throws, and
      // that is the whole of BUG-01: an order naming an unknown row was
      // approved by `submitOrder`, stored, carried into the save by
      // `snapshot()` -- and then this line threw on every subsequent tick, for
      // every order in the prison, forever. `submitOrder` now refuses such an
      // order at the boundary and tells the player why, so nothing *new* can
      // reach here; this is what recovers a save that already holds one. The
      // order is failed with the same reason `submitOrder` would have given it,
      // which is terminal, so it is skipped from the next tick on and the queue
      // behind it drains normally.
      //
      // No refusal is recorded here, and that is a **known gap rather than a
      // decision this code is entitled to make**. `ConstructionSystem` holds no
      // `RefusalLog` -- the command handler does -- and `RefusalLog`'s own class
      // comment argues at length that it must not carry a notice about
      // something a *previous* session did, which is why it is not snapshotted.
      // Nor does the order become visible by being failed: `hud/build-queue`
      // publishes only `PENDING_BUILD_ORDER_STATES`, and `failed` is one of the
      // three that projection deliberately excludes. So what a player observes
      // here is a stuck row disappearing and the prison building again, with no
      // sentence explaining it. Giving that a surface means either wiring a
      // refusal sink into this system or giving the build queue a failed
      // section, and both are decisions for whoever owns the HUD contract.
      const def = BUILDABLE_REGISTRY.get(order.definitionId);
      if (def === undefined) {
        order.state = 'failed';
        order.failReason = 'unknown-buildable';
        continue;
      }

      switch (order.state) {
        case 'approved':
          // Auto-transition to materials pending
          order.state = 'materials-pending';
          break;
          
        case 'materials-pending': {
          // Issue #25: real logistics can wire a ContainerMaterialsProvider
          // here so an order genuinely waits for delivered materials;
          // UNLIMITED_MATERIALS_PROVIDER (the default) preserves #16's
          // original always-available behavior for every caller that
          // hasn't opted into a real materials substrate.
          //
          // **This is still a wait, and issue #627 did not make it not one.**
          // The purchase above spends now and the goods arrive
          // `PROCUREMENT_DELIVERY_DELAY_TICKS` later, so an order whose
          // materials were bought this tick sits here for ten more scheduled
          // ticks before this line answers `true`. What changed is what the
          // wait is *on*: a delivery that is coming, rather than a purchase
          // nothing in the game had told the player to make.
          const satisfied = this.materialsProvider.tryAllocate(def.materialsRequired);
          if (!satisfied) break; // stays materials-pending, retried next scheduled tick
          order.materialsAllocated = def.materialsRequired.map((req) => ({ itemId: req.itemId, quantity: req.quantity }));
          order.state = 'assigned';
          break;
        }

        case 'assigned':
          // The crew is the constraint. A waiting order keeps its allocated
          // materials and is retried on the next scheduled tick, exactly as a
          // `materials-pending` order waits on the container above; the one
          // that starts is always the first eligible order in the walk.
          //
          // **That walk was ascending id until ADR 0082 (#722), and this
          // comment used to end "always the first eligible id and never the
          // first submission" -- which was true and was the defect.** The walk
          // is now placement order, so for orders placed through a command the
          // first eligible one *is* the earliest still-eligible submission.
          // For an order book carrying no ordinals -- a save written before
          // the field, a fixture -- the old sentence still describes it
          // exactly.
          if (crewBusy) break;
          crewBusy = true;
          order.assignedWorkerId = MOCK_CREW_WORKER_ID;
          order.state = 'in-progress';
          break;

        case 'in-progress':
          // Mock progress: advance fixed amount
          order.progress += 10;
          
          if (order.progress >= def.workRequired) {
            order.progress = def.workRequired;
            order.state = 'completed';
            this.finalizeConstruction(order);
          }
          break;
      }
    }
  }

  /**
   * Buys whatever the queue still needs, and answers what happened.
   *
   * Public because two callers need it and they need it at different moments.
   * `update` calls it on every scheduled construction tick, which is the
   * safety net; `createConstructionCommandHandler` calls it on the
   * `PlaceBuildOrder` that created the demand, which is what makes the money
   * leave at the press and what puts a shortfall in front of the player while
   * they can still act on it (#627, #629).
   *
   * `undefined` when no sink was wired, which is a bare `ConstructionSystem`
   * rather than a session: there is nothing to report because nothing was
   * asked, and a caller must not read that as "everything is funded".
   *
   * It never throws -- the sink's own contract forbids it, for the reason
   * `ObjectPlacementSink`'s methods do not throw -- and it never changes an
   * order's state. An order stays exactly where it was whatever this answers;
   * a purchase only ever changes what the *container* will hold ten seconds
   * from now.
   */
  public procureQueuedMaterials(tick: number): MaterialsProcurementReport | undefined {
    return this.materialsProcurement?.procureForPendingOrders(
      this.pendingOrderDemand(this.orderedOrders()),
      tick,
    );
  }

  /**
   * Every order still waiting for materials, in the crew's own walk, each
   * carrying the whole of what its buildable requires.
   *
   * **The shape #703 ruling 12 needs, and the one `pendingMaterialDemand`
   * below is now computed from.** The ruling made the ORDER the unit a partly
   * filled purchase is atomic at (ADR 0081 Decision 2), so the sink has to be
   * handed the orders rather than one figure per item id -- it cannot recover
   * "which two bricks belong to which wall" from a sum, and per-order
   * atomicity is exactly that question.
   *
   * The membership rule is unchanged and is stated once, here, rather than
   * twice: `'approved'` counts as well as `'materials-pending'`, `'planned'`
   * does not, a definition the registry does not hold contributes nothing, and
   * a non-positive requirement is dropped. `pendingMaterialDemand`'s docblock
   * is where each of those is argued.
   *
   * **Walk order is `orderedOrders()`'s and is not re-sorted here.** It decides
   * which orders an insufficient balance funds, which makes it a fact about
   * money -- and it is ascending order **id**, which is not placement order for
   * the `order-${crypto.randomUUID()}` ids a session mints. ADR 0081 Decision 2
   * records what that costs: the ruling *"halves the expected requirement and
   * leaves the worst case exactly where it is"*. ADR 0082 proposes a persisted
   * placement ordinal and is unsigned, so nothing here anticipates it.
   */
  /**
   * `excludeOrderId` is second and optional, and every existing caller passes
   * neither -- `procureQueuedMaterials` and `pendingMaterialDemand`'s own
   * production caller (`refundSurplusOf`) both want the demand as the order
   * book stands. It exists for `previewCancelRefundMinorUnits`: a preview must
   * not mutate `order.state` to ask "what if this one had already been
   * cancelled", where `refundSurplusOf` gets that answer for free because
   * `cancelOrder` has already written `'cancelled'` by the time it calls this
   * chain. Passing an id here is the read-only route to the same exclusion.
   */
  private pendingOrderDemand(orders: readonly BuildOrder[], excludeOrderId?: string): readonly QueuedOrderDemand[] {
    const demand: QueuedOrderDemand[] = [];
    for (const order of orders) {
      if (order.id === excludeOrderId) continue;
      if (order.state !== 'approved' && order.state !== 'materials-pending') continue;
      const definition = BUILDABLE_REGISTRY.get(order.definitionId);
      if (definition === undefined) continue;
      const requirements = definition.materialsRequired.filter((requirement) => requirement.quantity > 0);
      if (requirements.length === 0) continue;
      demand.push({ orderId: order.id, requirements });
    }
    return demand;
  }

  /**
   * What every order still waiting for materials will ask the container for,
   * summed per item.
   *
   * **No longer what the sink is handed** -- `pendingOrderDemand` above is,
   * since #703 ruling 12 -- and this is now derived from it so the two cannot
   * disagree, which is the property `demandedQuantityOf` depends on. Its one
   * remaining caller is `withdrawOrdersAwaitingMaterial`'s loop (#687), which
   * asks a per-item question and is right to.
   *
   * **`'approved'` counts as well as `'materials-pending'`**, because the two
   * are one tick apart -- `update` promotes `approved` to `materials-pending`
   * in the very walk this feeds -- and counting only the second would delay
   * every purchase by a scheduled tick for no reason a player could name.
   *
   * **`'planned'` does not count.** `submitOrder` never leaves an order there
   * (it writes `'approved'` or `'failed'`) and `update`'s switch has no case
   * for it, so an order in that state -- reachable only from a hand-written
   * or hostile save -- never allocates. Buying for it would spend the
   * treasury on materials nothing will ever consume.
   *
   * **Allocated material is in neither term.** An order past
   * `'materials-pending'` has already had its requirement *withdrawn* from the
   * container by `tryAllocate`, so it is not demand here and it is not stock
   * there; that is what makes the sink's subtraction of one from the other
   * meaningful.
   *
   * Ascending item id, and the walk that feeds it is already ascending order
   * id, so the result is a function of the order book and not of iteration
   * order (`docs/DETERMINISM.md`, "Canonical iteration order"). This writes
   * simulation state -- it decides what money is spent on -- so that is a
   * requirement rather than tidiness.
   *
   * An order naming a row `BUILDABLE_REGISTRY` does not hold contributes
   * nothing and is left for the walk to fail, which is where the reason the
   * player is told is decided.
   */
  /** `excludeOrderId` is threaded straight through to `pendingOrderDemand`; see its own comment. */
  private pendingMaterialDemand(orders: readonly BuildOrder[], excludeOrderId?: string): readonly MaterialRequirement[] {
    const demand = new Map<string, number>();
    for (const order of this.pendingOrderDemand(orders, excludeOrderId)) {
      for (const requirement of order.requirements) {
        demand.set(requirement.itemId, (demand.get(requirement.itemId) ?? 0) + requirement.quantity);
      }
    }
    return [...demand.keys()]
      .sort()
      .map((itemId) => ({ itemId, quantity: demand.get(itemId)! }));
  }

  /**
   * Writes what the finished order actually built into the world.
   *
   * For a wall that is a value in the chunk's `topEdge` / `leftEdge` layer at
   * the order's tile, on the edge the order names. `setTopEdge`/`setLeftEdge`
   * bump the chunk's geometry revision themselves, which is what makes
   * `TopologyManager` recompute -- so the revision still moves, it is simply
   * no longer the *only* thing that moves.
   *
   * A buildable that names a `placesObjectId` writes a row in the placed-object
   * registry instead of an edge, through the optional `ObjectPlacementSink`
   * (ADR 0028 decision 4). One that names neither -- every `'utility'` row --
   * still has nothing to write and still bumps the revision, exactly as before.
   *
   * A buildable that names a `placesDoor` does **both**, and that is the whole
   * of what a door is: `DOOR_EDGE_NUMERIC_ID` into the edge layer, so the room
   * behind it is enclosed and the renderer has something to draw, and a
   * `DoorDefinition` into `DoorRegistry` through the optional
   * `DoorPlacementSink`, so navigation crosses it. Either half without the
   * other is wrong in a different direction -- the edge alone is a wall, and the
   * registration alone is invisible and encloses nothing -- and
   * `definition.ts`'s `DOOR_EDGE_NUMERIC_ID` argues both out in full. The edge
   * is written first so that the geometry revision has already moved when the
   * door appears, which is what stops `RouteCache` holding a route computed
   * before it existed (`docs/NAVIGATION.md`).
   */
  private finalizeConstruction(order: BuildOrder): void {
    const definition = getBuildableDefinition(order.definitionId);
    const edgeValue = edgeNumericIdFor(definition);
    if (edgeValue === 0) {
      // The branch this comment used to end at with "a future object placement
      // model changes this function rather than its callers". This is that
      // change: a buildable that names an object puts one in the world here,
      // and the room it stands in has its capacity re-derived on the same call
      // (ADR 0028 decision 2, moment one of three).
      if (definition.placesObjectId !== undefined) {
        this.objectPlacement?.onOrderCompleted(definition.placesObjectId, order.location);
      }
      this.markGeometryChanged(order.location);
      return;
    }

    const edge = resolveBuildEdge(order);
    this.writeEdge(order.location, edge, edgeValue);
    if (definition.placesDoor !== undefined) {
      this.doorPlacement?.onDoorOrderCompleted(definition.id, order.location, edge);
    }
  }

  /**
   * Removes the geometry a completed order wrote.
   *
   * The edge does not simply go back to `0`: another completed order may
   * occupy the same edge (nothing rejects a second wall on an edge that
   * already has one), and clearing it would delete a wall this order never
   * built. So the edge is rewritten from whatever *other* completed order
   * still claims it, and only falls to `0` when none does.
   *
   * The scan is over `orderedOrders()` rather than the raw map, so which of
   * two remaining claimants wins is a function of their ids and not of the
   * order the session happened to create them in.
   *
   * **A door reverses both halves, and the order of the two is decided rather
   * than incidental.** The door leaves the registry *before* the edge is
   * rewritten, so there is no moment at which the edge value has fallen to
   * whatever a remaining wall claims while a door is still registered on it --
   * a state in which navigation would report a crossing that the player had
   * just paid to have removed. And the edge does not simply go to `0`: if a
   * wall was built on the same edge as well, `remainingEdgeValue` restores the
   * wall, so undoing a door out of a wall line leaves a wall rather than a
   * hole. If nothing else claims the edge, undoing the door leaves a **gap** --
   * which is the honest answer and not an oversight: what the player built was
   * a barrier, and taking a barrier away leaves an opening, exactly as
   * cancelling a wall does.
   */
  private revertConstruction(order: BuildOrder): void {
    const definition = getBuildableDefinition(order.definitionId);
    const edgeValue = edgeNumericIdFor(definition);
    if (edgeValue === 0) {
      // The object leaves with the order, for the reason a wall's edge does:
      // `completed` is cancellable *because* completing changes the world, and
      // a placement that could not be reversed would make the first misplaced
      // bed permanent while a misplaced wall is not. Moment two of the
      // resolver's three.
      if (definition.placesObjectId !== undefined) {
        this.objectPlacement?.onOrderReverted(definition.placesObjectId, order.location);
      }
      this.markGeometryChanged(order.location);
      return;
    }

    const edge = resolveBuildEdge(order);
    // The door leaves only if no *other* completed order still puts one on this
    // edge -- the same rule the edge value follows one line down, applied to the
    // registry. Nothing rejects a second `door-wooden` order on an edge that
    // already has one (nothing rejects a second wall either), the second one's
    // registration is a no-op because the edge is taken, and without this check
    // cancelling the *first* would delete the door the second one paid for.
    if (definition.placesDoor !== undefined && !this.anotherCompletedDoorClaims(order, edge)) {
      this.doorPlacement?.onDoorOrderReverted(definition.id, order.location, edge);
    }
    this.writeEdge(order.location, edge, this.remainingEdgeValue(order, edge));
  }

  /**
   * Every other completed order occupying the same tile edge as `cancelled`,
   * in ascending id.
   *
   * The one walk behind both "what does the edge fall back to" and "is a door
   * still claimed here". They were one loop and a second was nearly written;
   * keeping two would let the two questions disagree about which orders count,
   * and the answer has to be identical or an edge can end up saying "door" with
   * no door registered on it.
   */
  private *otherCompletedClaimants(cancelled: BuildOrder, edge: BuildEdge): Generator<BuildOrder> {
    for (const other of this.orderedOrders()) {
      if (other.id === cancelled.id) continue;
      if (other.state !== 'completed') continue;
      if (other.location.x !== cancelled.location.x || other.location.y !== cancelled.location.y) continue;
      if (resolveBuildEdge(other) !== edge) continue;
      yield other;
    }
  }

  private anotherCompletedDoorClaims(cancelled: BuildOrder, edge: BuildEdge): boolean {
    for (const other of this.otherCompletedClaimants(cancelled, edge)) {
      if (getBuildableDefinition(other.definitionId).placesDoor !== undefined) return true;
    }
    return false;
  }

  private remainingEdgeValue(cancelled: BuildOrder, edge: BuildEdge): number {
    let value = 0;
    for (const other of this.otherCompletedClaimants(cancelled, edge)) {
      const otherValue = edgeNumericIdFor(getBuildableDefinition(other.definitionId));
      if (otherValue !== 0) value = otherValue;
    }
    return value;
  }

  private writeEdge(location: TilePosition, edge: BuildEdge, value: number): void {
    if (edge === 'north') this.world.setTopEdge(location, value);
    else this.world.setLeftEdge(location, value);
  }

  /**
   * Signals a topological change on the tile's chunk without writing a layer.
   *
   * `markGeometryChanged` throws on a chunk that is only metadata, so the
   * chunk is materialised first -- the same thing `setTopEdge`/`setLeftEdge`
   * do on the path above. Before this, finishing an order in a
   * metadata-only chunk threw out of a scheduled system update and faulted
   * the worker.
   */
  private markGeometryChanged(location: TilePosition): void {
    const { chunk } = tileToChunk(location, this.world.tileChunkSize);
    const chunkState = this.world.getChunk(chunk);
    if (chunkState === undefined) return;
    if (chunkState.lifecycle !== 'loaded') this.world.load(chunk);
    this.world.markGeometryChanged(chunk);
  }

  public snapshot(): ConstructionSnapshot {
    // Ascending id, matching `orderedOrders()`. Emitting insertion order here
    // and re-inserting it in `restore()` would reproduce the *previous*
    // session's build history as the new session's iteration order, which is
    // exactly the coupling `docs/DETERMINISM.md` rules out.
    const orders = this.orderedOrders().map((o) => ({
      ...o,
      materialsAllocated: o.materialsAllocated.map((m) => ({ ...m })),
    }));
    return {
      orders,
      undoStack: this.undoStack.map((transaction) => [...transaction]),
      redoStack: this.redoStack.map((transaction) => [...transaction]),
      // The open gesture is emitted, not committed: capture reads state and
      // never changes it (`captureSessionSnapshot`, "Reads only the runtime's
      // own snapshot methods"), so pushing the buffer onto `undoStack` here
      // would make *saving* change the live session's undo granularity.
      //
      // Spread rather than an explicit `undefined`, for the same reason
      // `createBuildOrder` spreads `edge`: `exactOptionalPropertyTypes` is
      // on, and a key holding `undefined` reaches `computeSaveChecksum` but
      // does not survive the JSON round trip into storage, so the reloaded
      // payload would hash differently from the one that was checksummed.
      // A session with no open gesture therefore emits exactly the object it
      // emitted before this field existed.
      ...(this.currentTransaction.length === 0 ? {} : { currentTransaction: [...this.currentTransaction] }),
      ...(this.currentTransactionId === undefined ? {} : { currentTransactionId: this.currentTransactionId }),
    };
  }

  /**
   * ### The structural guard, and why it is here rather than in the schema
   *
   * ADR 0038 deferred this line explicitly -- *"`construction/system.ts` has
   * the same replace-without-checking shape and produces a **`TypeError`** on
   * a plausible corruption ... its right home is #403 mitigation (a), where a
   * `TypeError` from our own restore code is the motivating example for
   * classifying code-fault against data-fault"*. This is that home (#431).
   *
   * Without it, `data.orders` arriving as anything but an array threw
   * `Cannot read properties of undefined (reading 'map')` -- an error class
   * indistinguishable from a genuine defect in this method, which is exactly
   * what the new taxonomy must not have to guess at. With it, the payload is
   * refused as `damaged-payload` by a check that says so.
   *
   * Three array checks and no deeper walk, deliberately. A save reaching here
   * through `SessionController` has already been validated field by field by
   * `constructionSnapshotSchema`; what this guards is the *other* two callers
   * of `restoreSimulationRuntime` -- a worker `simulation/initialize` payload,
   * whose snapshot data the protocol declares only as `jsonValue`, and
   * `InProcessSessionHost` -- so the check belongs to the shape the loop below
   * actually depends on, not to a second copy of the schema
   * (`src/persistence/save-schema.ts` owns that, and ADR 0038's
   * *"Validate the stream set in the save schema"* section argues against
   * duplicating a semantic rule into it).
   */
  public restore(data: ConstructionSnapshot): void {
    for (const [field, value] of [
      ['orders', data.orders],
      ['undoStack', data.undoStack],
      ['redoStack', data.redoStack],
    ] as const) {
      if (!Array.isArray(value)) {
        throw new SnapshotRefusedError('damaged-payload', `Construction snapshot "${field}" must be an array.`);
      }
    }

    this.orders.clear();
    for (const order of data.orders) {
      if (!Array.isArray(order?.materialsAllocated)) {
        throw new SnapshotRefusedError(
          'damaged-payload',
          `Construction snapshot order "${String(order?.id)}" must carry a materialsAllocated array.`,
        );
      }
      this.orders.set(order.id, { ...order, materialsAllocated: order.materialsAllocated.map((m) => ({ ...m })) });
    }
    this.undoStack = data.undoStack.map((transaction) => [...transaction]);
    this.redoStack = data.redoStack.map((transaction) => [...transaction]);
    // A save written before `currentTransaction` existed has neither key, and
    // an absent buffer means "no gesture is open" -- which is what every
    // restore used to assume unconditionally. So the old behaviour is the
    // default here rather than a migration step (#108).
    this.currentTransaction = data.currentTransaction === undefined ? [] : [...data.currentTransaction];
    this.currentTransactionId = data.currentTransactionId;
  }
}
