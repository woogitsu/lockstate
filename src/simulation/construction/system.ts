import { type SystemRegistration, type SimulationContext } from '../kernel/system';
import { type BuildEdge, type BuildOrder, type BuildOrderFailReason, resolveBuildEdge } from './build-order';
import { BUILDABLE_REGISTRY, edgeNumericIdFor, getBuildableDefinition, occupiesTileEdge } from './definition';
import { type ConstructionMaterialsProvider, UNLIMITED_MATERIALS_PROVIDER } from './materials-provider';
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
  ) {}

  /**
   * Accepts an order, or fails it with a reason.
   *
   * Three checks, in this order, and the order matters.
   *
   * **The buildable is asked about first**, because it is the only one of the
   * three that is a property of the *request* rather than of a tile: an order
   * naming a row nobody declared is refused whatever is under it, so asking
   * about the world at all would be answering a narrower question first. It
   * also touches nothing -- no chunk lookup, no `canBuildAt` -- which matters
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

  public undo(): void {
    if (this.currentTransaction.length > 0) {
      this.undoStack.push([...this.currentTransaction]);
      this.currentTransaction = [];
      this.currentTransactionId = undefined;
    }

    const transaction = this.undoStack.pop();
    if (!transaction) return; // Nothing to undo

    const redoTransaction: string[] = [];

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
      this.cancelOrder(orderId);
      redoTransaction.push(orderId);
    }

    if (redoTransaction.length > 0) {
      this.redoStack.push(redoTransaction);
    }
  }

  public redo(): void {
    const transaction = this.redoStack.pop();
    if (!transaction) return; // Nothing to redo

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

    if (undoTransaction.length > 0) {
      this.undoStack.push(undoTransaction);
    }
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
   */
  public cancelOrder(id: string): void {
    const order = this.orders.get(id);
    if (!order) throw new Error(`BuildOrder ${id} not found`);
    if (!isCancellable(order.state)) {
      throw new Error(`Cannot cancel order in state ${order.state}`);
    }

    const hadGeometry = order.state === 'completed';
    order.state = 'cancelled';
    if (hadGeometry) this.revertConstruction(order);

    // The materials this order actually consumed go back where they came
    // from. `materialsAllocated` is emptied in the same step,
    // so a `redo()` -- which returns the order to `'approved'` and lets it
    // allocate again -- cannot refund a second time from a stale record.
    if (order.materialsAllocated.length > 0) {
      this.materialsProvider.release(order.materialsAllocated);
      order.materialsAllocated = [];
    }
  }

  public getOrder(id: string): BuildOrder | undefined {
    return this.orders.get(id);
  }

  /**
   * Every order, in ascending id (code-unit order), never `Map` insertion
   * order.
   *
   * This stopped being cosmetic the moment `finalizeConstruction` began
   * writing world geometry: two orders that finish on the same scheduled tick
   * and claim the same tile edge are resolved by whichever is processed last,
   * so insertion order would decide what the world looks like. Insertion
   * order is a property of how a session happened to be built, and
   * `restore()` re-inserts from a snapshot rather than replaying that
   * history -- so a restored session could disagree with the live one it came
   * from. See `docs/DETERMINISM.md`, "Canonical iteration order".
   */
  private orderedOrders(): readonly BuildOrder[] {
    return [...this.orders.values()].sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    );
  }

  /**
   * Every order, in the same ascending-id order every internal walk uses.
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
   * re-decided as it proceeds.** The walk is `orderedOrders()`, ascending id,
   * which is the canonical sequence the whole class uses. If occupancy were
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
          const satisfied = this.materialsProvider.tryAllocate(def.materialsRequired);
          if (!satisfied) break; // stays materials-pending, retried next scheduled tick
          order.materialsAllocated = def.materialsRequired.map((req) => ({ itemId: req.itemId, quantity: req.quantity }));
          order.state = 'assigned';
          break;
        }

        case 'assigned':
          // The crew is the constraint. A waiting order keeps its allocated
          // materials and is retried on the next scheduled tick, exactly as a
          // `materials-pending` order waits on the container above; because
          // the walk is by ascending id, the one that starts is always the
          // first eligible id and never the first submission.
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

  public restore(data: ConstructionSnapshot): void {
    this.orders.clear();
    for (const order of data.orders) {
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
