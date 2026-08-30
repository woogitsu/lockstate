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
 * The consumer of the `PlaceObject` and `RemoveObject` commands (ADR 0028
 * phases 1 and 3).
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
 * holds no state a snapshot has to carry, and it runs only inside a command
 * dispatch. What it does is decide whether the placement is legal and mint the
 * order; the object appears when the order finishes, through
 * `onOrderCompleted` below.
 *
 * **That sentence used to say "it holds no state" flatly, and that is not what
 * it is allowed to mean.** The class owns two fields -- `refusals` and
 * `removalRefusals`, both bounded at `MAX_RECORDED_PLACEMENT_REFUSALS` --
 * added by ADR 0028 phases 1 and 3 for `recentRefusals` and
 * `recentRemovalRefusals`. They are deliberately ephemeral diagnostic: a
 * record of things that did **not** happen, capped rather than logged,
 * absent from every snapshot, and read by nobody who decides anything. So the
 * narrow claim holds and is the one worth making -- no gameplay fact lives
 * here, restoring a save reconstructs this service with both windows empty,
 * and the reconstructed prison is identical -- while the flat claim was
 * simply false and would have licensed the next reader to give the class a
 * field that *does* matter.
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

/**
 * What a removal names: one tile, and nothing else.
 *
 * **No `placedObjectId` and no order id, deliberately.** The id is a pure
 * function of the anchor tile (`placedObjectIdFor`), and the tile the player
 * pressed is generally *not* the anchor -- a bed is 1x2, so half of it answers
 * to `object:x:y-1`. Carrying the id would mean the producer computing it, which
 * means the producer holding the footprint of every object standing in the
 * prison; carrying the tile means the tile index answers the question, which is
 * exactly what it is for.
 *
 * It is also the shape that makes the gesture honest on touch: what the player
 * pressed is a tile, so what the command says is a tile.
 */
export interface RemoveObjectRequest {
  readonly x: number;
  readonly y: number;
}

/**
 * Why a removal was refused.
 *
 * **One reason, and the shortness is the point.** Every other condition a
 * removal could be refused for was considered and answered by *doing the
 * removal*:
 *
 *   - **The room is occupied.** ADR 0028 decision 2 is explicit: nobody is
 *     evicted, the room stops accepting new occupants and its requirement reads
 *     missing. Refusing here would contradict the decision this phase exists to
 *     implement.
 *   - **The room is in use.** A prisoner performing an action holds a
 *     concurrent-use claim (ADR 0029), and removing the object that gave the
 *     room its capacity drops that capacity below the number of claims held.
 *     That is the same over-capacity state, on the other collection, and it
 *     drains by itself: see `remove` below for the argument in full.
 *   - **The tile is outside every room.** `PlaceObject` refuses that, because a
 *     placement there would spend a plank on a row nothing reads. A *removal*
 *     there is the opposite: the object exists, it is in the player's way, and
 *     refusing would strand it -- reachable today by un-zoning the room around
 *     a bed, which `object-placement-loop.test.ts` already covers.
 *   - **The land is not owned.** Same argument. An object can only have been
 *     placed on owned land, and land can change hands; refusing to remove an
 *     object because the ground under it changed would trap it there.
 *   - **Out of bounds.** A tile in an unmaterialised chunk holds no object, so
 *     it is `nothing-to-remove` and not a separate answer. Nothing here writes
 *     to the world, so unlike `place` there is no chunk to accidentally
 *     materialise on the way to refusing.
 *
 * Hyphenated and spelled `nothing-to-remove` to match
 * `UnzoneRoomRefusalReason`'s member of the same name, because it is the same
 * fact about the same kind of gesture: the player pressed somewhere there was
 * nothing of theirs to take away.
 */
export type RemoveObjectRefusalReason = 'nothing-to-remove';

export interface RemoveObjectRefusal {
  readonly kind: 'refused';
  readonly reason: RemoveObjectRefusalReason;
  readonly request: RemoveObjectRequest;
  /** The tile the request named, canonicalised. Always present -- a removal is about one tile and nothing else. */
  readonly tile: TilePosition;
  readonly tick: number;
}

/** An object that was standing in the world is gone, and the room it stood in has been re-derived. */
export interface RemoveObjectRemoved {
  readonly kind: 'removed';
  readonly placedObjectId: string;
  readonly objectId: string;
  readonly anchorTile: TilePosition;
  /** The room whose capacity was re-derived, absent for an object that stood in no room. */
  readonly roomInstanceId?: string;
}

/**
 * No object was standing there yet, but an order still building one was, and it
 * has been cancelled.
 *
 * The second half of "remove the object at this tile", and it is not a
 * convenience. Without it a tile under an order that cannot finish -- one
 * waiting in `materials-pending` for a plank the player cannot afford -- is
 * claimed for the rest of the session: `place` refuses `tile-occupied` against
 * the footprints of orders in flight, and a removal that only looked at
 * standing objects would answer `nothing-to-remove`. That is the same
 * permanent-mistake trap this phase exists to close, one state earlier.
 *
 * It reuses `ConstructionSystem.cancelOrder`, which refunds the materials the
 * order had allocated -- correctly, because nothing was built with them. A
 * *standing* object is not refunded, and the asymmetry is the honest one: an
 * order that never finished gives its materials back, and a thing that was
 * built out of them does not.
 */
export interface RemoveObjectOrderCancelled {
  readonly kind: 'order-cancelled';
  readonly orderId: string;
  readonly objectId: string;
  readonly anchorTile: TilePosition;
}

export type RemoveObjectOutcome = RemoveObjectRemoved | RemoveObjectOrderCancelled | RemoveObjectRefusal;

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
  /**
   * Cancels an order and gives its allocated materials back.
   *
   * Added for removal (phase 3), and called only for an order this service has
   * established is **not** `completed`, `cancelled` or `failed` -- so the throw
   * `cancelOrder` makes for a terminal state is unreachable through here, and
   * the geometry-reversing half of it never runs. A completed object order's
   * object is in the registry, which is the branch that takes it.
   */
  cancelOrder(id: string): void;
}

/**
 * What a removal asks when the room it emptied is now housing more residents
 * than it can sleep ([ADR 0076](../../../docs/adr/0076-what-happens-to-a-resident-whose-bed-is-taken-away.md)
 * decision A(i)).
 *
 * The same shape, for the same reason, as `RoomZoningService`'s
 * `ResidentRelocationPort`: a narrow port rather than the prisoner runtime
 * itself, so this module keeps no dependency on classification, cold state or
 * the accommodation policy beyond the one question it asks.
 * `PrisonerOperationsRuntime.relocateExcessResidentsOf` implements it, and the
 * composition root is the only thing that holds both sides.
 *
 * **Optional, and absence means ADR 0028 decision 2 unamended.** A fixture
 * that builds an `ObjectPlacementService` without it gets exactly the
 * behaviour this service always had -- the object goes, the capacity drops,
 * and every resident stays where they were. Only a session that wires
 * `new-session.ts`'s real runtime in relocates anybody.
 *
 * **It cannot refuse the removal and is not asked before it.** ADR 0076
 * records "refusing the removal while a resident depends on the object" as not
 * taken, for #478's reason: a room could otherwise become permanently
 * un-editable through ordinary play. So this is called *after* the object has
 * gone and the capacity has been re-derived -- which is also the only moment
 * "who is excess" has an answer -- and its result changes nothing about the
 * outcome the player is handed.
 */
export interface ExcessResidentRelocationPort {
  /**
   * Moves the residents of `instanceIds` who no longer hold a place that
   * exists into accommodation that does, best-effort, and reports who moved
   * and who could not. See
   * `PrisonerOperationsRuntime.relocateExcessResidentsOf` for what "nowhere to
   * go" means, why it is not all-or-nothing here, and why the choice of
   * destination cannot be an unseeded one.
   */
  relocateExcessResidentsOf(instanceIds: readonly string[]): {
    /**
     * Who moved, and **into which instance**.
     *
     * The second field arrived with the notice ADR 0076 owed: the wording the
     * owner approved names one prisoner and one room, so an entity id alone
     * could fill neither placeholder. See `ExcessResidentRelocation` in the
     * prisoner runtime for why the destination is reported rather than looked
     * up again afterwards.
     */
    readonly relocated: readonly { readonly entityId: number; readonly toInstanceId: string }[];
    readonly stranded: readonly number[];
  };
}

/**
 * What the player is told when a removal has moved somebody
 * ([ADR 0076](../../../docs/adr/0076-what-happens-to-a-resident-whose-bed-is-taken-away.md)
 * decision A(i)).
 *
 * A second narrow port beside `ExcessResidentRelocationPort` rather than a
 * return value this service reads, and for the same reason the first one is a
 * port: a prisoner's *name* and a room's *message key* are two more things
 * `src/simulation/objects/` would otherwise have to know about, on top of the
 * question it actually asks. `createResidentRelocationNotice`
 * (`src/simulation/events/resident-relocation-notice.ts`) implements it and
 * the composition root holds both sides.
 *
 * **Optional, and absence means the removal is silent** -- which is what every
 * fixture that builds this service by hand wants, and what shipped between
 * PR #637 and this change.
 *
 * It is told only about residents who *moved*. A resident with nowhere to go
 * is left where ADR 0028 decision 2 put them and the owner has approved no
 * sentence about that state, so this service does not hand one over.
 */
export interface ExcessResidentRelocationNoticePort {
  announceRelocations(relocated: readonly { readonly entityId: number; readonly toInstanceId: string }[]): void;
}

/** The orientation every placement gets, until a rotate control exists. See `ObjectOrientation`. */
const DEFAULT_PLACEMENT_ORIENTATION: ObjectOrientation = 0;

export class ObjectPlacementService {
  /** Oldest first. A bounded window, not a log; see `MAX_RECORDED_PLACEMENT_REFUSALS`. */
  private readonly refusals: PlaceObjectRefusal[] = [];
  /** The same window for the other gesture; see `recentRemovalRefusals`. */
  private readonly removalRefusals: RemoveObjectRefusal[] = [];

  public constructor(
    private readonly world: SparseWorld,
    private readonly roomInstances: RoomInstanceRegistry,
    private readonly placedObjects: PlacedObjectRegistry,
    private readonly resolver: RoomCapacityResolver,
    private readonly orders: ObjectOrderSink,
    private readonly rooms: ContentRegistry<RoomCatalogDefinition> = defaultRoomContentRegistry,
    /** ADR 0076 decision A(i). Absent in a fixture; wired to the prisoner runtime in a real session. See `ExcessResidentRelocationPort`. */
    private readonly residentRelocation?: ExcessResidentRelocationPort,
    /** ADR 0076 decision A(i)'s notice. Absent in a fixture; wired to the events channel in a real session. See `ExcessResidentRelocationNoticePort`. */
    private readonly relocationNotice?: ExcessResidentRelocationNoticePort,
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
   * Takes away whatever object the player pressed, or refuses because there was
   * nothing there.
   *
   * ADR 0028 phase 3's command consumer, and the counterpart of `place` in the
   * same class rather than in a class of its own: the collaborators are the same
   * five, it holds no state, it has no `update`, and it runs only inside a
   * command dispatch. A second service would restate `place`'s constructor and
   * would put "which object is on this tile" in two files.
   *
   * ## The order of the two cases, and why it is that way round
   *
   * A **standing object** first, then an **order still building one**. The two
   * cannot both be true of one tile -- a completed order's object is in the
   * registry and `ordersBuildingObjects` skips `completed` -- so the order of
   * the checks decides nothing, and it is written this way because the standing
   * object is what the player can see.
   *
   * ## What happens to a room that was occupied or in use
   *
   * **Nothing is evicted and no *use* claim is touched.** Removal changes a
   * capacity; it does not reach into anybody's action.
   *
   * **The residency half of that sentence was unconditional until
   * [ADR 0076](../../../docs/adr/0076-what-happens-to-a-resident-whose-bed-is-taken-away.md)
   * decision A(i), and it read: "Nothing is evicted and no claim is touched",
   * for residents and use claims alike.** It is narrowed rather than
   * withdrawn, in the terms that ADR narrows ADR 0028 decision 2 in. Nobody is
   * evicted -- nobody is put on the street, and a resident the prison has
   * nowhere else to put stays exactly where they were, sleeping in a cell with
   * no bed in it. What changed is that a resident the prison *can* rehouse is
   * **moved** rather than left: `ExcessResidentRelocationPort` is asked, after
   * the capacity has been re-derived, to relocate the residents who no longer
   * hold a place that exists. It cannot refuse this removal and is not
   * consulted before it.
   *
   * So the room whose claim count stands above its capacity is still a
   * **legal, named state on both collections** -- for use claims always, and
   * for residency whenever relocation found nowhere to go, which is the branch
   * ADR 0076 decision A(ii) makes the state stop paying for:
   *
   *  - `assign` refuses at `occupants.size >= residentCapacity` and
   *    `findAvailableResidence` skips a full instance, so the room stops taking
   *    new residents -- and a prisoner relocation could not move keeps their
   *    `accommodationInstanceId` and keeps sleeping there. That the room stops
   *    taking new residents is what makes it safe to ask for relocation
   *    afterwards rather than before: it cannot be handed back the resident it
   *    just gave up.
   *  - `claimUse` refuses at `claims for this capability >= that capability's
   *    ceiling` and `findAvailableForUse` skips at the same comparison, so the
   *    room stops taking new users of the thing that was removed -- and only of
   *    that thing, since issue #326 scoped both the ceiling and the headcount to
   *    one capability. Taking a room's last toilet does not close its dining
   *    tables. The prisoners already performing there finish. Their claims drain
   *    through `ActionSystem`'s three release sites, none of which consults a
   *    capacity -- so a dropped capacity cannot leak a claim, and `releaseUse`
   *    is total, so it cannot double-release one either.
   *
   * The two alternatives were considered and are worse, and the reason is the
   * same for both. **Releasing the claims here** would leave prisoners
   * performing in a room they no longer hold, which under-counts real use and
   * lets the *next* prisoner in over the true ceiling -- the exact failure ADR
   * 0029 exists to remove, reintroduced from the other end. **Refusing the
   * removal while claims are held** would contradict decision 2 for residency
   * (a cell with a prisoner in it could never have its bed taken back), and for
   * use it would make the control fail for as long as lunch lasts, with nothing
   * on screen saying when it would start working. `reinstateUseClaim` is the
   * proof this was already the intended reading: it deliberately ignores the
   * ceiling so a restore can reproduce a claim count above it, and its own
   * comment names an over-capacity room as legal *because* of decision 2.
   *
   * `unregister` still refuses above zero claims of either kind, so a removal
   * cannot open a route to dropping an instance somebody is holding: the
   * `room-occupied` refusal a player gets from `unzone` is unchanged by this.
   */
  public remove(request: RemoveObjectRequest, tick: number): RemoveObjectOutcome {
    const tile: TilePosition = { x: tileCoordinate(request.x), y: tileCoordinate(request.y) };

    const object = this.placedObjects.objectAt(tile);
    if (object !== undefined) {
      this.placedObjects.remove(object.placedObjectId);
      // Re-derived from the **anchor**, not from the pressed tile: containment
      // is a statement about the anchor (ADR 0028 decision 2), and a bed whose
      // second tile pokes out of the cell would otherwise re-derive whatever
      // room that tile is in -- or none. The zoning plane and the instance are
      // both untouched by the removal, so this resolves the same room the
      // placement resolved.
      const roomInstanceId = this.resolver.resolveContaining(object.anchorTile);
      this.relocateResidentsLeftWithoutAPlace(roomInstanceId);
      return {
        kind: 'removed',
        placedObjectId: object.placedObjectId,
        objectId: object.objectId,
        anchorTile: object.anchorTile,
        ...(roomInstanceId === undefined ? {} : { roomInstanceId }),
      };
    }

    const pending = this.orderBuildingObjectAt(tile);
    if (pending !== undefined) {
      this.orders.cancelOrder(pending.order.id);
      return { kind: 'order-cancelled', orderId: pending.order.id, objectId: pending.objectId, anchorTile: pending.order.location };
    }

    const refusal: RemoveObjectRefusal = {
      kind: 'refused',
      reason: 'nothing-to-remove',
      request: { ...request },
      tile,
      tick,
    };
    this.removalRefusals.push(refusal);
    if (this.removalRefusals.length > MAX_RECORDED_PLACEMENT_REFUSALS) this.removalRefusals.shift();
    return refusal;
  }

  /**
   * The refused removals this session has produced, oldest first.
   *
   * A second window rather than a widened one, for the reason there are two
   * refusal *vocabularies*: a reader asking "why did none of my last six beds
   * appear" and a reader asking "why did none of my last six presses remove
   * anything" are asking about different gestures, and a merged list would have
   * every consumer discriminate before it could count either. Same cap, same
   * "bounded window, not a log" contract, same deliberate absence from the
   * snapshot -- it is a record of things that did not happen.
   */
  public recentRemovalRefusals(): readonly RemoveObjectRefusal[] {
    return [...this.removalRefusals];
  }

  /**
   * An object order still in flight whose footprint covers `tile`, or
   * `undefined`.
   *
   * At most one can exist -- `place` refuses `tile-occupied` against exactly
   * this set -- so the walk's order decides nothing. It is still taken over
   * `allOrders()`, which `ConstructionSystem` keeps sorted by id, so the answer
   * is a function of state rather than of insertion history even in a session
   * whose invariant was somehow broken.
   */
  private orderBuildingObjectAt(tile: TilePosition): { readonly order: BuildOrder; readonly objectId: string } | undefined {
    const key = tileKey(tile);
    for (const entry of this.ordersBuildingObjects()) {
      for (const covered of entry.tiles) {
        if (tileKey(covered) === key) return { order: entry.order, objectId: entry.objectId };
      }
    }
    return undefined;
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
   * This is **not** `remove` above, and the two are not redundant. This one
   * reverses an *order*: it is reached from `Undo` and `cancelOrder`, keyed on
   * the order's own tile and definition, and it refunds what the order
   * allocated. `remove` is aimed by the player at an object that was built
   * correctly, keyed on any tile of its footprint, and refunds nothing. Phase 3
   * added the second without changing the first, because a pending order the
   * player regrets and a standing object they regret are different facts with
   * different answers.
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
    this.relocateResidentsLeftWithoutAPlace(this.resolver.resolveContaining(anchor));
    return true;
  }

  /**
   * ADR 0076 decision A(i), on the one line both routes out of the world reach.
   *
   * **Both**, and that is the decision rather than a convenience.
   * `RemoveObject` and the `Undo` of a completed object order take the same
   * bed out of the same room and drop the same `residentCapacity`; a
   * relocation wired to only one of them would leave a prisoner's cell
   * depending on which gesture the player used, and it is the *undo* route
   * that `tests/integration/economy-bed-recycling.test.ts` measures the
   * recycling loop through. The two commands disagreeing about materials is
   * decision B and is not this; the two agreeing about residents is this.
   *
   * Called after `resolveContaining` and never before it: "who is excess"
   * is a question about the capacity standing *now*, and before the
   * re-derivation the room still claims the capacity the object it no longer
   * has was supplying.
   *
   * `undefined` is an object that stood in no room -- legal, and nothing to
   * ask about. An instance with no excess is an ordinary call that moves
   * nobody, so the guard here is only the containment one.
   */
  private relocateResidentsLeftWithoutAPlace(roomInstanceId: string | undefined): void {
    if (roomInstanceId === undefined) return;
    const outcome = this.residentRelocation?.relocateExcessResidentsOf([roomInstanceId]);
    if (outcome === undefined) return;
    // **The notice is on this line and not on either caller's**, so it reaches
    // the player from `RemoveObject` and from `Undo` alike or from neither.
    // A notice wired to the press alone would be silent on the route
    // `tests/integration/economy-bed-recycling.test.ts` drives the recycling
    // loop through, which is the route it matters most on.
    this.relocationNotice?.announceRelocations(outcome.relocated);
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
    for (const entry of this.ordersBuildingObjects()) {
      for (const tile of entry.tiles) claimed.add(tileKey(tile));
    }
    return claimed;
  }

  /**
   * Every order that is going to put an object somewhere and has not yet, with
   * the tiles it will occupy.
   *
   * The one walk behind both "which tiles may a placement not use" and "which
   * order is building the thing the player just pressed on". It was
   * `tilesClaimedByOrdersInFlight`'s body until removal needed the *order* as
   * well as the tiles; keeping two walks would have let the two questions
   * disagree about which orders count, and the answer to that has to be
   * identical or a tile could be un-removable and un-placeable at once.
   *
   * `'completed'` is excluded because a completed order's object is in the
   * registry already, and `'cancelled'`/`'failed'` because both are terminal and
   * hold nothing.
   */
  private *ordersBuildingObjects(): Generator<{ readonly order: BuildOrder; readonly objectId: string; readonly tiles: readonly TilePosition[] }> {
    for (const order of this.orders.allOrders()) {
      if (order.state === 'completed' || order.state === 'cancelled' || order.state === 'failed') continue;
      const definition = BUILDABLE_REGISTRY.get(order.definitionId);
      const objectId = definition?.placesObjectId;
      if (objectId === undefined) continue;
      const objectDefinition = this.placedObjects.definitionOf(objectId);
      if (objectDefinition === undefined) continue;
      yield { order, objectId, tiles: objectFootprintTiles(objectDefinition, order.location, DEFAULT_PLACEMENT_ORIENTATION) };
    }
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
