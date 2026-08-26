import { type SystemRegistration, type SimulationContext } from '../kernel/system';
import { type BuildEdge, type BuildOrder, type BuildOrderFailReason, resolveBuildEdge } from './build-order';
import { edgeNumericIdFor, getBuildableDefinition } from './definition';
import { type ConstructionMaterialsProvider, UNLIMITED_MATERIALS_PROVIDER } from './materials-provider';
import { SparseWorld } from '../world/sparse-world';
import { type BuildabilityRequirement, canBuildAt } from '../world/buildability';
import { type TilePosition, tileToChunk } from '../world/coordinates';

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
   * Two checks, in this order, and the order matters: a tile outside the
   * materialised world has no ownership to ask about, so `out-of-bounds` is
   * decided first and `canBuildAt` is never handed a chunk that does not
   * exist.
   */
  public submitOrder(order: BuildOrder): void {
    if (this.orders.has(order.id)) {
      throw new Error(`BuildOrder ${order.id} already exists`);
    }

    const { chunk } = tileToChunk(order.location, this.world.tileChunkSize);
    const chunkState = this.world.getChunk(chunk);
    if (!chunkState) {
      order.state = 'failed';
      order.failReason = 'out-of-bounds';
      this.orders.set(order.id, order);
      return;
    }

    const buildability = canBuildAt(this.world, order.location, SUBMISSION_REQUIREMENT);
    if (!buildability.buildable) {
      order.state = 'failed';
      order.failReason = SUBMISSION_FAIL_REASONS[buildability.reason] ?? 'unbuildable';
      this.orders.set(order.id, order);
      return;
    }

    order.state = 'approved';
    this.orders.set(order.id, order);
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

  public update(context: SimulationContext): void {
    for (const order of this.orderedOrders()) {
      const def = getBuildableDefinition(order.definitionId);
      
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
          // Mock job assignment: immediately start
          order.assignedWorkerId = 'mock-worker-1';
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

        case 'completed':
        case 'cancelled':
        case 'failed':
          // Final states, cleanup can happen later or be kept for history
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
