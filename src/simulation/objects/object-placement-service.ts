import { defaultRoomContentRegistry, type RoomCatalogDefinition } from '../../content/room-catalog';
import type { ContentRegistry } from '../../content/registry';
import { createBuildOrder, type BuildOrder } from '../construction/build-order';
import { getBuildableDefinition, BUILDABLE_REGISTRY } from '../construction/definition';
import type { RoomInstanceRegistry } from '../prisoners/room-instance-registry';
import { canBuildAt, type BuildabilityRequirement } from '../world/buildability';
import { tileCoordinate, tileToChunk, type TilePosition } from '../world/coordinates';
import type { SparseWorld } from '../world/sparse-world';
import { objectFootprintTiles, tileKey, type ObjectOrientation } from './placed-object';
import { placedObjectAt, type PlacedObjectRegistry } from './placed-object-registry';
import { roomInstanceContaining, type RoomCapacityResolver } from './room-capacity';

/**
 * The consumer of the `PlaceObject` command (ADR 0028 phase 1).
 *
 * ## What placing an object actually is
 *
 * **A construction order, on the existing mechanism** (ADR 0028 decision 4).
 * An object is a `BuildableDefinition` with `category: 'object'` and a
 * `placesObjectId`, ordered through `ConstructionSystem` exactly as a wall is:
 * it waits in `materials-pending` until `ProcurementSystem` has filled
 * `CONSTRUCTION_MATERIALS_CONTAINER_ID`, then advances `+10` per scheduled tick
 * until `workRequired` is met. So an object is **bought the way a wall is
 * bought** -- not purchased directly, but built from procured materials, which
 * is the route ADR 0017 decision 2 requires of any supply into the world. A
 * furniture-specific "buy a bed for N" would be a second faucet that bypasses
 * the container.
 *
 * This service is therefore not a placement *system*: it has no `update`, it
 * holds no state, and it runs only inside a command dispatch. What it does is
 * decide whether the placement is legal and mint the order; the object appears
 * when the order finishes, through `onOrderCompleted` below.
 *
 * ## Why it is a separate command from `PlaceBuildOrder`
 *
 * Because the refusals are different and the payload is different. A wall
 * order carries an `edge` and is validated against one tile; an object
 * placement carries no edge, occupies a *footprint*, and can be refused for
 * reasons a wall has no concept of -- a tile another object already covers, or
 * a tile in no room. Widening `PlaceBuildOrder` would make every existing
 * producer carry fields it does not use, and would leave the footprint checks
 * inside a handler whose name says nothing about them.
 *
 * ## Validation happens here, and the claim is taken here
 *
 * Every tile of the footprint is checked **before any order exists**, in the
 * canonical `(y, x)` order `zone` uses, so the tile a refusal names is a
 * function of the request. The check covers three populations:
 *
 * 1. objects already standing (`PlacedObjectRegistry`),
 * 2. objects **still being built** -- the footprints of every non-terminal
 *    order for an object buildable, read off `ConstructionSystem`, because two
 *    beds ordered onto one tile inside 60 ticks would otherwise both be
 *    accepted and the second would silently fail to appear,
 * 3. the world itself: bounds and ownership, through the same `canBuildAt`
 *    requirement `submitOrder` and `zone` both use.
 *
 * ## `outside-room`, which ADR 0028 left open on purpose
 *
 * That ADR's open question 5 asks "whether an object can be placed outside any
 * room", says decision 1 permits it *structurally*, and leaves the *gesture*
 * question open with `door-wooden` as the case for permitting it. **This
 * refuses it, for `PlaceObject` only**, and the reasoning is stated here so it
 * can be overruled without reading a diff:
 *
 *   - An object outside every room changes nothing observable. Capacity is
 *     derived per room instance, so a bed in a field is a plank spent on a row
 *     nothing reads -- and `AGENTS.md` is explicit that a control which reports
 *     success and does nothing is the defect to avoid.
 *   - `door-wooden`'s case is untouched, because a door is not placed through
 *     this command: it has no `placesObjectId`, it is ordered through
 *     `PlaceBuildOrder`, and nothing here can refuse it.
 *   - It is the cheapest refusal to reverse. Deleting the check permits the
 *     placement; nothing else in this design depends on it.
 */

/** Ownership only -- the same requirement `zone` and `submitOrder` state, and for the reason they both give: terrain is a gameplay question and land the player does not own is not. */
const PLACEMENT_REQUIREMENT: BuildabilityRequirement = {
  requiresOwnedLand: true,
  requiresBuildableTerrain: false,
  requiresWalkableTerrain: false,
  allowWater: true,
};

/**
 * How many refusals are kept for diagnosis.
 *
 * `MAX_RECORDED_ZONING_REFUSALS`'s number and its reason: a player who presses
 * repeatedly on an occupied tile must not grow a list without limit, and
 * nothing reads more than the last few, so the record is a bounded window
 * rather than a log. What reaches the player is the most recent refusal's
 * reason, through the session's `RefusalLog`.
 */
export const MAX_RECORDED_PLACEMENT_REFUSALS = 32;

export interface PlaceObjectRequest {
  /** A `BUILDABLE_REGISTRY` id, not an object-catalog id: what the player selected in the Build panel. */
  readonly definitionId: string;
  /** The order id the producer minted, so a refusal can be matched to the press that caused it. */
  readonly orderId: string;
  /** Anchor tile: the footprint's top-left corner. */
  readonly x: number;
  readonly y: number;
}

/**
 * Why a placement was refused.
 *
 * Hyphenated, like `BuildOrder.failReason` and `ZoneRoomRefusalReason` and
 * unlike `BuildabilityResult.reason`'s underscores. A closed union, so
 * `PLACE_OBJECT_REFUSAL_REASONS` maps it exhaustively and an eighth reason
 * fails to compile until somebody decides what the player is told.
 *
 * `not-a-placeable-object` is not the same refusal as `unknown-buildable`, and
 * the difference is worth a reason rather than a shrug: the first is a real,
 * offered buildable that places no object -- `wall-brick` and `door-wooden`
 * both are -- reached by a producer that sent the wrong command for the row,
 * and the honest answer is that this is not how that thing is built. The
 * second is an id no catalogue declares.
 */
export type PlaceObjectRefusalReason =
  | 'unknown-buildable'
  | 'not-a-placeable-object'
  | 'duplicate-order'
  | 'out-of-bounds'
  | 'unowned-land'
  | 'tile-occupied'
  | 'outside-room';

export interface PlaceObjectRefusal {
  readonly kind: 'refused';
  readonly reason: PlaceObjectRefusalReason;
  readonly request: PlaceObjectRequest;
  /** The tile that decided a per-tile refusal; absent for a refusal about the request as a whole. */
  readonly tile?: TilePosition;
  readonly tick: number;
}

export interface PlaceObjectAccepted {
  readonly kind: 'ordered';
  readonly orderId: string;
  readonly objectId: string;
  readonly anchorTile: TilePosition;
  /** The room instance the finished object will belong to. Always defined, because `outside-room` is a refusal. */
  readonly roomInstanceId: string;
}

export type PlaceObjectOutcome = PlaceObjectAccepted | PlaceObjectRefusal;

/**
 * The slice of `ConstructionSystem` a placement needs.
 *
 * A structural port rather than the class, so this module imports no
 * construction *value* except the definition registry and `createBuildOrder`.
 * `ConstructionSystem` satisfies it as written; the seam exists so a test can
 * drive the refusal paths without a world of orders, and so the dependency
 * arrow between these two modules points one way.
 */
export interface ObjectOrderSink {
  getOrder(id: string): BuildOrder | undefined;
  allOrders(): readonly BuildOrder[];
  submitOrder(order: BuildOrder): void;
  registerTransactionOrder(orderId: string, transactionId?: string): void;
}

/** The orientation every placement gets, until a rotate control exists. See `ObjectOrientation`. */
const DEFAULT_PLACEMENT_ORIENTATION: ObjectOrientation = 0;

export class ObjectPlacementService {
  /** Oldest first. A bounded window, not a log; see `MAX_RECORDED_PLACEMENT_REFUSALS`. */
  private readonly refusals: PlaceObjectRefusal[] = [];

  public constructor(
    private readonly world: SparseWorld,
    private readonly roomInstances: RoomInstanceRegistry,
    private readonly placedObjects: PlacedObjectRegistry,
    private readonly resolver: RoomCapacityResolver,
    private readonly orders: ObjectOrderSink,
    private readonly rooms: ContentRegistry<RoomCatalogDefinition> = defaultRoomContentRegistry,
  ) {}

  /**
   * Validates a placement and submits its construction order, or refuses with
   * a reason.
   *
   * **Nothing is written on a refusal**, including nothing in the world: the
   * bounds check runs before ownership for the reason `submitOrder` and `zone`
   * both order them that way -- a tile outside the materialised world has no
   * ownership to ask about, and `SparseWorld` materialises a chunk on write, so
   * checking in the other order would grow the world on the way to refusing.
   */
  public place(request: PlaceObjectRequest, tick: number): PlaceObjectOutcome {
    const definition = BUILDABLE_REGISTRY.get(request.definitionId);
    if (definition === undefined) return this.refuse('unknown-buildable', request, tick);

    const objectId = definition.placesObjectId;
    if (objectId === undefined) return this.refuse('not-a-placeable-object', request, tick);

    const objectDefinition = this.placedObjects.definitionOf(objectId);
    // Unreachable while `validateBuildableObjectReferences` throws at import
    // for a buildable naming no object, and refused rather than asserted here
    // because a `RangeError` out of a kernel command dispatch faults the
    // worker. `not-a-placeable-object` is the truthful answer: the row cannot
    // place anything.
    if (objectDefinition === undefined) return this.refuse('not-a-placeable-object', request, tick);

    // A queued command restored from a save can carry an order id the session
    // already holds, and `submitOrder` throws on a duplicate. Refusing keeps
    // that throw inside the guard it was written as.
    if (this.orders.getOrder(request.orderId) !== undefined) {
      return this.refuse('duplicate-order', request, tick);
    }

    const anchor: TilePosition = { x: tileCoordinate(request.x), y: tileCoordinate(request.y) };
    const footprint = objectFootprintTiles(objectDefinition, anchor, DEFAULT_PLACEMENT_ORIENTATION);
    const claimed = this.tilesClaimedByOrdersInFlight();

    for (const tile of footprint) {
      const { chunk } = tileToChunk(tile, this.world.tileChunkSize);
      if (this.world.getChunk(chunk) === undefined) return this.refuse('out-of-bounds', request, tick, tile);
      if (!canBuildAt(this.world, tile, PLACEMENT_REQUIREMENT).buildable) {
        return this.refuse('unowned-land', request, tick, tile);
      }
      if (this.placedObjects.isTileOccupied(tile) || claimed.has(tileKey(tile))) {
        return this.refuse('tile-occupied', request, tick, tile);
      }
    }

    // Containment is asked of the **anchor** and not of every tile, because
    // that is the membership rule (ADR 0028 decision 2): a bed whose second
    // tile pokes out of a cell still belongs to that cell, and belongs to it
    // once. Asking of every tile would refuse a legal placement against a rule
    // nobody wrote.
    const room = roomInstanceContaining(this.world, this.roomInstances, anchor, this.rooms);
    if (room === undefined) return this.refuse('outside-room', request, tick, anchor);

    this.orders.submitOrder(createBuildOrder(request.orderId, definition.id, anchor));
    /*
     * One press, one undo step -- and the transaction id has to be *given* for
     * that to be true.
     *
     * `registerTransactionOrder` groups by the id it is handed and treats two
     * `undefined`s as the same gesture (`undefined === undefined`), so passing
     * nothing would join every placement the session ever makes into one
     * transaction that `Undo` would reverse whole. `src/main.ts` records the
     * same trap for the Build panel's numeric route, which used to send no id
     * and grouped two presses minutes apart.
     *
     * The **order id** is the group, because a placement is exactly one order
     * and the id is already unique per press. That is why `PlaceObject` carries
     * no `transactionId` of its own: there is nothing for a *producer* to group
     * -- one gesture is one object -- so inventing a second id on the wire would
     * be a field with no reader. A gesture that placed several objects at once
     * would need one, and decision 5 refuses that gesture.
     */
    this.orders.registerTransactionOrder(request.orderId, request.orderId);

    return { kind: 'ordered', orderId: request.orderId, objectId, anchorTile: anchor, roomInstanceId: room.instanceId };
  }

  /**
   * An object order finished: the object goes into the world and the room it
   * stands in is re-derived.
   *
   * Called from `ConstructionSystem.finalizeConstruction`, which is inside a
   * scheduled update -- so this must not throw. `place` on the registry answers
   * `false` rather than throwing, and the one path that can reach a `false`
   * (undo, a second order, redo) is documented there.
   *
   * The resolver runs **after** the row exists, and only for the room the
   * anchor is in: capacity is per room instance, so an object outside every
   * room resolves nothing, which is the same statement `place` refuses to let a
   * player make.
   */
  public onOrderCompleted(objectId: string, anchor: TilePosition): boolean {
    if (!this.placedObjects.place(placedObjectAt(objectId, anchor, DEFAULT_PLACEMENT_ORIENTATION))) return false;
    this.resolver.resolveContaining(anchor);
    return true;
  }

  /**
   * A completed object order was cancelled or undone: the object leaves the
   * world and the room is re-derived.
   *
   * The counterpart of `onOrderCompleted`, and it exists for the reason
   * `ConstructionSystem.cancelOrder` reverses a wall's geometry: a completed
   * order is cancellable, so an object placement that could not be reversed
   * would make the first misplaced bed permanent while a misplaced wall is not.
   *
   * This is **not** ADR 0028 phase 3. That phase ships a `RemoveObject` command
   * -- a control the player can aim at an object that was built correctly -- and
   * the verified over-capacity behaviour behind it. This is only the reversal of
   * an order, which the construction system already promised for every
   * buildable.
   *
   * The object is identified by the tile it was anchored on rather than by an
   * id carried on the order, because the id *is* a function of that tile
   * (`placedObjectIdFor`). Nothing has to be stored to find it again.
   */
  public onOrderReverted(objectId: string, anchor: TilePosition): boolean {
    const object = this.placedObjects.objectAt(anchor);
    // Guarded on the object id as well as the tile, so an order reverted after
    // its tile was taken by a *different* object cannot delete that one. Both
    // halves are needed: `redo`/`undo` can interleave two orders on one tile.
    if (object === undefined || object.objectId !== objectId || object.anchorTile.x !== anchor.x || object.anchorTile.y !== anchor.y) {
      return false;
    }
    this.placedObjects.remove(object.placedObjectId);
    this.resolver.resolveContaining(anchor);
    return true;
  }

  /**
   * Every tile claimed by an object order that has not finished and has not
   * been given up on.
   *
   * `'completed'` is excluded because a completed order's object is in the
   * registry already, and `'cancelled'`/`'failed'` because both are terminal
   * and hold nothing. What is left is the window between accepting a placement
   * and the object existing -- roughly 60 ticks for a bed, plus however long
   * the materials take -- during which the tile must not be handed out twice.
   *
   * Cost is one pass over the order list per placement command, which is a
   * player press and not a tick. `ConstructionSystem.allOrders()` is already
   * sorted by id, so the set is a function of state.
   */
  private tilesClaimedByOrdersInFlight(): ReadonlySet<string> {
    const claimed = new Set<string>();
    for (const order of this.orders.allOrders()) {
      if (order.state === 'completed' || order.state === 'cancelled' || order.state === 'failed') continue;
      const definition = BUILDABLE_REGISTRY.get(order.definitionId);
      const objectId = definition?.placesObjectId;
      if (objectId === undefined) continue;
      const objectDefinition = this.placedObjects.definitionOf(objectId);
      if (objectDefinition === undefined) continue;
      for (const tile of objectFootprintTiles(objectDefinition, order.location, DEFAULT_PLACEMENT_ORIENTATION)) {
        claimed.add(tileKey(tile));
      }
    }
    return claimed;
  }

  /**
   * The refusals this session has produced, oldest first.
   *
   * Diagnosis rather than the player's alert, exactly as
   * `RoomZoningService.recentRefusals` is: what crosses the worker boundary is
   * the most recent refusal's *reason* and nothing else, while this holds the
   * last thirty-two with their requests and deciding tiles -- enough to answer
   * "why did none of my last six beds appear". Deliberately not snapshotted: it
   * is a record of things that did not happen.
   */
  public recentRefusals(): readonly PlaceObjectRefusal[] {
    return [...this.refusals];
  }

  private refuse(
    reason: PlaceObjectRefusalReason,
    request: PlaceObjectRequest,
    tick: number,
    tile?: TilePosition,
  ): PlaceObjectRefusal {
    const refusal: PlaceObjectRefusal = {
      kind: 'refused',
      reason,
      request: { ...request },
      tick,
      ...(tile === undefined ? {} : { tile }),
    };
    this.refusals.push(refusal);
    if (this.refusals.length > MAX_RECORDED_PLACEMENT_REFUSALS) this.refusals.shift();
    return refusal;
  }
}

/**
 * The object id a completed order for `definitionId` places, or `undefined`.
 *
 * Exported so `ConstructionSystem` can ask the question without importing the
 * registry lookup twice, and so `getBuildableDefinition`'s throw-on-unknown
 * behaviour stays the one place an unknown id is loud.
 */
export function placedObjectIdForBuildable(definitionId: string): string | undefined {
  return getBuildableDefinition(definitionId).placesObjectId;
}
