import { defaultRoomContentRegistry, isOpenAreaRoom, type RoomCatalogDefinition } from '../../content/room-catalog';
import type { ContentRegistry } from '../../content/registry';
import { roomBoundsOf, roomInstanceContaining } from '../objects/room-capacity';
import type { RoomInstance, RoomInstanceRegistry } from '../prisoners/room-instance-registry';
import { canBuildAt, type BuildabilityRequirement } from '../world/buildability';
import { tileCoordinate, tileToChunk, type TilePosition } from '../world/coordinates';
import type { SparseWorld } from '../world/sparse-world';
import { roomPerimeterEnclosure, type RoomEnclosure } from './enclosure';
import {
  enclosureRequirement,
  minimumSizeRequirement,
  type RoomEnclosureRequirement,
} from './requirements';

/**
 * The consumer of the `ZoneRoom` command (#261 step 3).
 *
 * Zoning is not a construction order and this is not a construction system:
 * a build order buys materials, waits for them and writes an *edge*, while
 * zoning designates an area and costs nothing. `construction/handler.ts` said
 * so in a comment for as long as the command existed and then did nothing,
 * so a `ZoneRoom` decoded, dispatched and vanished. It is routed here from
 * `runtime/session-commands.ts` instead, which is the file that already
 * describes itself as where the next non-construction command goes.
 *
 * ## What zoning writes
 *
 * Two things, and both are state that already existed with nothing writing
 * it:
 *
 * 1. **The world's zoning plane.** `SparseWorld` has carried a per-tile
 *    `Uint8Array` zoning layer since the world was chunked; the save schema
 *    carries it (`save-schema.ts`'s `zoning: terrainRleSchema.optional()`),
 *    and the renderer already tints a zoned tile by its room category
 *    (`rendering/world/appearance.ts`'s `zoningTint`, which resolves the
 *    stored value through `defaultRoomContentRegistry.getByNumericId`). The
 *    value written is the room catalog's own `numericId` -- content, not a
 *    number chosen here -- which is why the catalog bounds it to 255.
 * 2. **A `RoomInstance`.** The registry that intake, actions and every room
 *    projection read from, and which nothing outside the restore path had
 *    ever registered into, which is why the status strip's `Rooms` count
 *    could only ever be zero in a real session.
 *
 * The two are consistent by construction: an instance is registered only
 * when the plane was painted, and both survive a save (the plane inside the
 * world snapshot, the instance inside `prisoners.roomInstanceDefinitions`).
 *
 * **What the plane does not carry is an instance id.** A zoned tile holds a
 * room *type*, so two adjacent cells are indistinguishable in the plane and
 * "which instance is this tile part of" is still unanswerable *from the plane
 * alone* -- the same shape of gap `docs/HUD_PROJECTIONS.md` records for room
 * membership. The overlap check below needs only "is this tile already
 * claimed", which the plane does answer.
 *
 * What closes the other half is the instance's own **rectangle**, which this
 * service used to receive and discard: `width` and `height` are now written
 * onto the `RoomInstance`, so the plane narrows a tile to a room *type* and the
 * rectangle then names the instance (`roomInstanceContaining`,
 * `src/simulation/objects/room-capacity.ts`). That is the one new persisted
 * field ADR 0028 decision 6 pays for, and it is what gives every rule about a
 * room's contents a domain.
 *
 * **Issue #337 is the second thing that rectangle pays for.** `unzone` used to
 * resolve a covered tile to a room *type* and clear the connected run of it, so
 * two adjacent same-type rectangles -- two instances at the `zone` end since
 * this service existed -- were one region at the removal end, and clipping a
 * corner off one of them took both. It now resolves each covered tile through
 * `roomInstanceContaining` and clears that instance's rectangle, so both ends
 * agree. The plane is unchanged and still carries no instance id: the issue
 * proposed adding one per tile, which the rectangle makes unnecessary, and a
 * second persisted copy of a derivable fact is the shape ADR 0028 decision 6
 * removed rather than one to add back.
 *
 * ## Capacity and object capabilities: derived, and no longer aspirational
 *
 * `RoomInstance` carries a `residentCapacity`, a per-capability
 * `concurrentUseCapacityByCapability` breakdown, an all-objects
 * `concurrentUseCapacity` total and an `objectCapabilities` list, and in this
 * codebase every one of them comes from the objects standing in the room: a cell
 * holds as many prisoners as it has beds, a canteen seats as many diners as it
 * has dining furniture, and `IntakeSystem`/`ActionSystem` gate on capability
 * tags that `src/content/object-catalog.ts` puts on objects. The total is the
 * one figure nothing gates on -- see its declaration, and ADR 0028's #326
 * amendment for why it stopped being a ceiling.
 *
 * This paragraph used to end differently. It said that object placement **does
 * not exist**, that the honest reading of an empty rectangle is therefore `0`
 * and `[]`, and that giving a zoned room a usable capacity would need a content
 * addition -- "the smallest being one authored occupancy figure per room
 * definition" -- which was "a product decision, recorded on #261 rather than
 * taken inside a command handler".
 *
 * **That decision has been taken, and it went the other way.** The owner was
 * shown three options and chose real object placement;
 * [ADR 0028](../../../docs/adr/0028-object-placement-and-derived-room-capacity.md)
 * is the design and its phase 1 is what this file now depends on. So no
 * occupancy figure is authored anywhere: capacity is the summed footprint width
 * of the objects inside the rectangle, and `RoomCapacityResolver` computes it.
 *
 * What `zone` writes is still `0` and `[]`, and that is now a different
 * statement. It is the value of an instance before its first resolution, not
 * the value of every instance for ever -- and `zone` calls the resolver
 * immediately afterwards, so a rectangle drawn *around* an existing bed is
 * zoned with that bed's capacity rather than with zero. Refusing to count what
 * was already standing there would make the order of two player gestures change
 * the outcome, which is the same class of defect as iterating a `Map`.
 *
 * ## The instance id
 *
 * `<roomCatalogId>:<x>:<y>` over the anchor tile: a pure function of the
 * request and of world state, never a counter and never
 * `crypto.randomUUID()`. It is unique because the anchor of a new room is a
 * tile that was unzoned a moment earlier and is zoned afterwards, so no
 * later room can anchor on it.
 *
 * This deliberately takes **no** position under ADR 0012
 * (`docs/adr/0012-derived-identifier-reproducibility.md`), which is Accepted.
 * That ADR sorts a minted identifier into an *allocated identity* (a
 * snapshotted counter) or a *derived value* (recomputed, never
 * persisted). A room-instance id needs neither answer: it is reproducible
 * from state like a derived value, and stable across ticks and carried in
 * the save like an allocated identity, because the state it is derived from
 * -- the anchor tile -- cannot change while the instance exists. Nothing
 * moves or resizes a room. **If a future feature does move or resize one,
 * this scheme stops being neutral and ADR 0012's taxonomy has to be applied
 * to this id**, because the id would then either have to be re-derived
 * (breaking every save that carries the old one, and every prisoner's
 * `accommodationInstanceId` cold-state reference) or kept while describing a
 * tile the room no longer occupies.
 */

/**
 * The largest room a single command may zone, per side.
 *
 * The command schema bounds neither dimension (`z.number().int()`), so
 * without this a malformed or hostile `width` walks the whole coordinate
 * space inside one tick. 64 is the room catalog's own ceiling on a room's
 * `minWidth`/`minHeight`, and 64x64 is exactly its `minTiles` ceiling of
 * 4,096 -- so the bound is the content tier's opinion about how big a room
 * gets, not a new one.
 */
export const MAX_ZONE_DIMENSION_TILES = 64;

/**
 * How many refusals are kept for diagnosis, behind the route that reports them.
 *
 * A player who drags a zone over unowned land repeatedly must not grow a
 * list without limit, and nothing reads more than the last few, so the
 * record is a bounded window rather than a log.
 *
 * **This used to say "for a reporting route that does not exist yet".** The
 * route was built in #261 step 2 and the sentence was not moved: every refusal
 * from `zone` and `unzone` is recorded to the session's `RefusalLog` by
 * `src/simulation/runtime/session-commands.ts`, which quotes this very comment
 * where it does so. The two are not the same record and the distinction is
 * worth keeping -- what crosses the worker boundary is the most recent
 * refusal's *reason* and nothing else, while this window holds the last
 * thirty-two with their requests and tiles, which is diagnosis. So the window
 * still exists for the reason it always did; it simply no longer waits on
 * anything.
 */
export const MAX_RECORDED_ZONING_REFUSALS = 32;

export interface ZoneRoomRequest {
  readonly roomCatalogId: string;
  /** Left edge of the zoned rectangle, in tiles. Also the instance's anchor tile with `y`. */
  readonly x: number;
  /** Top edge of the zoned rectangle, in tiles. */
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Why a zoning request was refused.
 *
 * Spelled with hyphens, like `BuildOrder.failReason` and unlike
 * `BuildabilityResult.reason`'s underscores -- `ConstructionSystem` keeps a
 * translation table between the two for exactly this reason, and a second
 * vocabulary that split the difference would be a third spelling.
 *
 * `duplicate-instance-id` is not the same refusal as
 * `overlaps-existing-room` and is not reachable from a session zoned only
 * through this service: it fires when the registry already holds an instance
 * whose anchor tile is this one while the zoning plane says the tile is
 * free. A save written before zoning painted the plane is exactly that
 * shape, and so is a scenario that registers instances directly. Refusing is
 * what keeps `RoomInstanceRegistry.register`'s duplicate-id `RangeError` --
 * correct as a corruption guard -- from becoming an uncaught throw inside a
 * kernel command dispatch.
 *
 * `below-minimum-size` is the seventh, and it is a *content* refusal rather
 * than a geometric one: every one of the 18 room definitions carries an
 * authored `minimum-size` requirement -- a cell is 2x3, a canteen 6x6, a yard
 * 8x8 -- and until the Rooms surface existed nothing evaluated a single one of
 * them, so a 1x1 canteen was zonable. `invalid-area` cannot express it: that
 * reason is about a rectangle the *command* cannot carry (a side below 1 or
 * above `MAX_ZONE_DIMENSION_TILES`), and it is the same refusal whichever room
 * type asked for it, whereas this one depends entirely on which room the
 * player picked.
 *
 * `not-enclosed` is the eighth, and it is a content refusal of the same kind:
 * it fires only for a definition that authors an `enclosed` requirement, so the
 * same rectangle is refused for a cell and accepted for a yard. It is the one
 * member here that carries a *ruling* rather than a mechanism -- see the
 * enclosure evaluation in `zone` for what changed, and the ADR
 * "Must a zoned room be enclosed" for why.
 */
export type ZoneRoomRefusalReason =
  | 'unknown-room-type'
  | 'invalid-area'
  | 'below-minimum-size'
  | 'out-of-bounds'
  | 'unowned-land'
  | 'overlaps-existing-room'
  | 'duplicate-instance-id'
  | 'not-enclosed';

export interface ZoneRoomRefusal {
  readonly kind: 'refused';
  readonly reason: ZoneRoomRefusalReason;
  readonly request: ZoneRoomRequest;
  /**
   * The tile that decided a per-tile refusal (`out-of-bounds`, `unowned-land`,
   * `overlaps-existing-room`), or the tile carrying the first perimeter gap on
   * a `not-enclosed` one; absent for a refusal about the request as a whole.
   */
  readonly tile?: TilePosition;
  /**
   * Which of `tile`'s two stored edges is the gap, on a `not-enclosed` refusal.
   *
   * The world keeps a north edge and a west edge per tile, so `tile` alone does
   * not say which is missing -- and a gap on the rectangle's *south* or *east*
   * boundary is stored on the neighbour, so the pair is the only way to name
   * the wall the player has to build. Absent on every other reason, none of
   * which has an edge to name.
   *
   * Diagnosis only, exactly like `tile`: what crosses the worker boundary is
   * the reason and nothing else (`../refusals/refusal-log.ts` deliberately
   * carries no coordinates), so this is read from `recentRefusals` inside the
   * worker.
   */
  readonly edge?: 'north' | 'west';
  readonly tick: number;
}

export interface ZoneRoomAccepted {
  readonly kind: 'zoned';
  readonly instance: RoomInstance;
  /**
   * Whether the rectangle that was just zoned is walled in along its own
   * perimeter, and what the room definition asks for.
   *
   * **This used to say "carried on the accepted outcome and not used to refuse
   * one", and that is no longer true.** An `enclosed` definition against an
   * `open` rectangle is now `not-enclosed` and never reaches here, so on an
   * accepted outcome the pair is either `sealed` against anything, or `open`
   * against `outdoors`/`none`. It is still carried, because the pair is what
   * the Rooms panel's readout renders and because `outdoors` is a real reading
   * the player is entitled to see confirmed.
   */
  readonly enclosure: RoomEnclosure;
  readonly enclosureRequirement: RoomEnclosureRequirement;
  /**
   * The room type's own word, as the catalog's `nameKey` -- what the
   * acknowledgement of an accepted designation names
   * ([#966](https://github.com/matmaxalez/lockstate/issues/966) site 2).
   *
   * **A key and not a word, and it is read here rather than looked up again
   * downstream.** `zone` has already resolved the definition in order to
   * decide the request, so this is that definition's own `nameKey` handed
   * over; deriving `${roomCatalogId}.name` at the call site instead would be a
   * second answer to "what is this room called" that content could falsify
   * without breaking a compile. ADR 0011 keeps translated text off the worker
   * boundary, and a message key is exactly what `prisoners.relocated`'s
   * `roomNameKey` already carries across it --
   * `src/simulation/events/resident-relocation-notice.ts` reads it from the
   * same registry field for the same reason.
   *
   * On the accepted outcome only. A refusal names no room type, because
   * `unknown-room-type` is one of the reasons it can carry.
   */
  readonly roomNameKey: string;
}

export type ZoneRoomOutcome = ZoneRoomAccepted | ZoneRoomRefusal;

/**
 * A rectangle the player asked to have cleared of room designations.
 *
 * The same shape a `ZoneRoomRequest` carries minus the room type, because
 * removal names no room type: what is removed is whatever is there.
 */
export interface UnzoneRoomRequest {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Why a removal was refused.
 *
 * Its own union rather than more members on `ZoneRoomRefusalReason`, and its
 * own `unzone.*` namespace on the wire, for the reason the wire ids are
 * namespaced at all (`../refusals/refusal-log.ts`): `invalid-area` is the same
 * *condition* for both commands and a different *sentence*, because the player
 * asked to remove a room rather than to create one.
 *
 * Two reasons and not four. There is no `unowned-land`: clearing a
 * designation from land the player has since lost is not a way to cheat, and
 * refusing it would be a way to make a room permanently unremovable, which is
 * the defect this command exists to close. There is no `out-of-bounds`
 * either: a tile in a chunk that was never materialised holds no designation,
 * so it is skipped rather than refused -- a drag that spills off the edge of
 * the prison still removes the rooms it did cover.
 */
export type UnzoneRoomRefusalReason = 'invalid-area' | 'nothing-to-remove' | 'room-occupied';

export interface UnzoneRoomRefusal {
  readonly kind: 'refused';
  readonly reason: UnzoneRoomRefusalReason;
  readonly request: UnzoneRoomRequest;
  readonly tick: number;
}

export interface UnzoneRoomAccepted {
  readonly kind: 'unzoned';
  /** Instance ids removed from the registry, ascending. */
  readonly removedInstanceIds: readonly string[];
  /**
   * Each removed instance's own room type, as the catalog's own `nameKey` --
   * one entry per `removedInstanceIds`, in the same order
   * ([#1006](https://github.com/matmaxalez/lockstate/issues/1006) finding 5).
   *
   * **A parallel array rather than a single array of pairs**, matching how
   * `ZoneRoomAccepted` already carries its own `roomNameKey` beside `instance`
   * rather than nested inside it -- a caller that wants only the ids (every
   * existing caller, today) is unaffected, and `tests/unit/rooms-zoning.test.ts`
   * asserts the two stay the same length and the same order.
   *
   * A drag can cover instances of different types at once, which
   * `removedInstanceIds`'s own comment about issue #337 already establishes --
   * so this is not always one name repeated. Resolved from the same
   * `definition` this method already looked up to find each instance's
   * registry id, never re-derived from `roomCatalogId` after the instance is
   * gone.
   */
  readonly removedRoomNameKeys: readonly string[];
  /** How many tiles of the zoning plane were cleared. Always at least 1 on an accepted removal. */
  readonly clearedTiles: number;
}

export type UnzoneRoomOutcome = UnzoneRoomAccepted | UnzoneRoomRefusal;

/**
 * What `unzone` asks when a room it would remove still has residents
 * (issue #478). Implemented by `PrisonerOperationsRuntime.relocateResidentsOutOf`
 * and wired in through the constructor's `residentRelocation` parameter --
 * a narrow port rather than the runtime itself, the same shape `capacity`
 * above takes, so this module keeps no dependency on prisoner internals
 * (classification, cold state, accommodation policy) beyond the one question
 * it actually asks.
 *
 * **Optional, and absence means the old refusal.** A test or a fixture that
 * builds a `RoomZoningService` with no fourth argument -- most of
 * `tests/unit/rooms-zoning.test.ts` -- gets exactly the behaviour this
 * service always had: `room-occupied`, unconditionally, for any claimed
 * instance. Only a session that wires `new-session.ts`'s real
 * `PrisonerOperationsRuntime` in gets the relocate-then-remove path.
 */
export interface ResidentRelocationPort {
  /**
   * Attempts to move every resident out of every instance named in
   * `instanceIds`, excluding those same instances as destinations, and
   * reports whether it fully succeeded. All-or-nothing: on any resident with
   * nowhere to go, every relocation this call already made is undone before
   * it returns, so a refused `unzone` leaves residency exactly as it found
   * it. See `PrisonerOperationsRuntime.relocateResidentsOutOf` for what
   * "nowhere to go" means and why the choice of destination cannot be an
   * unseeded one.
   */
  relocateResidentsOutOf(instanceIds: readonly string[]): 'relocated' | 'no-vacancy';
}

/**
 * What the last accepted zoning says about the room it created.
 *
 * Snapshot-shaped for the same reason `SimulationRefusal` is: the route out is
 * `simulation/status-counts`, a publication on a cadence that may be late,
 * repeated, coalesced or dropped, so what crosses is a statement that is true
 * of the session at any tick -- "the last room designated was `open` against an
 * `enclosed` requirement" -- rather than an event. `sequence` is 1-based and
 * increments once per accepted zoning, so it is both this notice's ordinal and
 * the number of rooms this session has designated; it is also the row identity
 * the main thread needs to tell a republished notice from a new one.
 *
 * It carries **no room id, no tile and no text**: an enum pair and two
 * integers. ADR 0011 keeps the id-to-message-key mapping on the main thread,
 * and `requirement` is here precisely so the notice is self-describing without
 * the HUD having to remember what it asked for.
 *
 * Not snapshotted, exactly like `RefusalLog`: it is a notice about something
 * the player did moments ago rather than a condition of the prison, so a
 * restored session starts with none.
 */
export interface ZoningNotice {
  readonly sequence: number;
  readonly tick: number;
  readonly enclosure: RoomEnclosure;
  readonly requirement: RoomEnclosureRequirement;
}

/**
 * Ownership only, and every flag written out -- the same requirement
 * `ConstructionSystem.submitOrder` submits an order under, and for the same
 * reason it states there: `canBuildAt` defaults terrain checks *on*, so
 * passing nothing would have zoning refuse water and rough ground without
 * anyone deciding that it should. A yard over a stream is a gameplay
 * question; zoning land the player does not own is not.
 */
const ZONING_REQUIREMENT: BuildabilityRequirement = {
  requiresOwnedLand: true,
  requiresBuildableTerrain: false,
  requiresWalkableTerrain: false,
  allowWater: true,
};

/**
 * The key a tile takes in `unzone`'s visited set.
 *
 * One function rather than the literal repeated at each site, because the two
 * collectors below write into the same `Map` and a key that disagreed between
 * them would let a tile be visited twice -- which is the one thing that set
 * exists to prevent.
 */
function tileKeyOf(tile: TilePosition): string {
  return `${tile.x},${tile.y}`;
}

/** The id an instance zoned at `anchor` gets. Exported because a test asserting reproducibility must not restate the format. */
export function roomInstanceIdFor(roomCatalogId: string, anchor: TilePosition): string {
  return `${roomCatalogId}:${anchor.x}:${anchor.y}`;
}

export class RoomZoningService {
  /** Oldest first. A bounded window, not a log; see `MAX_RECORDED_ZONING_REFUSALS`. */
  private readonly refusals: ZoneRoomRefusal[] = [];

  /** The last accepted zoning's notice, or `undefined` while this session has zoned nothing. */
  private _lastNotice: ZoningNotice | undefined;

  public constructor(
    private readonly world: SparseWorld,
    private readonly roomInstances: RoomInstanceRegistry,
    private readonly rooms: ContentRegistry<RoomCatalogDefinition> = defaultRoomContentRegistry,
    /**
     * Where a newly registered instance gets its derived capacity from (ADR
     * 0028 decision 2, moment three of three).
     *
     * Optional and fourth, so every existing caller constructs the service
     * unchanged. Absent, a zoned room keeps the zeroes `register` wrote --
     * which is exactly what a session with no placed objects would resolve to
     * anyway, and is why a test that never places an object does not need to
     * supply one.
     */
    private readonly capacity?: { resolveInstance(instanceId: string): unknown },
    /**
     * What `unzone` asks instead of an unconditional refusal when a room it
     * would remove still has residents (issue #478). Optional and fifth, so
     * every existing caller -- every fixture in
     * `tests/unit/rooms-zoning.test.ts` included -- constructs the service
     * unchanged and keeps the refusal `unzone` always gave. `new-session.ts`
     * is the one production wiring, and it passes the session's own
     * `PrisonerOperationsRuntime`.
     */
    private readonly residentRelocation?: ResidentRelocationPort,
  ) {}

  /**
   * Zones a rectangle, or refuses it with a reason.
   *
   * **Every tile is checked before any tile is written.** Not tidiness: a
   * half-painted rectangle would be a room the player cannot see the shape
   * of and cannot zone over, and `SparseWorld.setZoning` *materialises* a
   * chunk that does not exist yet, so writing before checking would grow the
   * world outside the owned area on its way to refusing.
   */
  public zone(request: ZoneRoomRequest, tick: number): ZoneRoomOutcome {
    const definition = this.rooms.getById(request.roomCatalogId);
    if (definition === undefined) return this.refuse('unknown-room-type', request, tick);

    if (
      request.width < 1 ||
      request.height < 1 ||
      request.width > MAX_ZONE_DIMENSION_TILES ||
      request.height > MAX_ZONE_DIMENSION_TILES
    ) {
      return this.refuse('invalid-area', request, tick);
    }

    /*
     * The authored minimum, enforced for the first time.
     *
     * Every one of the 18 room definitions carries a `minimum-size`
     * requirement and nothing had ever read one, so a 1x1 canteen was a legal
     * room. All three authored figures are checked, not only the two sides:
     * `minTiles` is `minWidth * minHeight` for every shipped definition and is
     * a separate authored number, so a future room could ask for 6 tiles in
     * any 2x4 shape and this has to be the check that says so rather than one
     * that assumes the product.
     *
     * Ahead of every per-tile check, and that ordering is deliberate: a
     * canteen dragged 1x1 over land the player does not own is refused for
     * being too small rather than for the land, because the size is a fact
     * about what they asked for and the ownership is a fact about where -- and
     * the first is the one they can fix by dragging again. It is also the
     * cheaper answer, and it cannot materialise a chunk.
     *
     * A definition with no `minimum-size` requirement has no minimum. That is
     * content's statement rather than a hole: `minimumSizeRequirement` answers
     * `undefined` and this check does nothing, which is the same reading
     * `../presentation/room-projection.ts` gives a requirement that is absent.
     */
    const minimum = minimumSizeRequirement(definition);
    if (
      minimum !== undefined &&
      (request.width < minimum.minWidth ||
        request.height < minimum.minHeight ||
        request.width * request.height < minimum.minTiles)
    ) {
      return this.refuse('below-minimum-size', request, tick);
    }

    const anchor: TilePosition = { x: tileCoordinate(request.x), y: tileCoordinate(request.y) };
    const instanceId = roomInstanceIdFor(definition.id, anchor);
    if (this.roomInstances.getById(instanceId) !== undefined) {
      return this.refuse('duplicate-instance-id', request, tick);
    }

    // Ascending y then x -- a canonical order over the rectangle, so the
    // tile a refusal names is a function of the request rather than of the
    // order this loop happens to be written in.
    for (let offsetY = 0; offsetY < request.height; offsetY += 1) {
      for (let offsetX = 0; offsetX < request.width; offsetX += 1) {
        const tile: TilePosition = {
          x: tileCoordinate(request.x + offsetX),
          y: tileCoordinate(request.y + offsetY),
        };

        // Bounds first, ownership second, exactly like `submitOrder`: a tile
        // outside the materialised world has no ownership to ask about.
        const { chunk } = tileToChunk(tile, this.world.tileChunkSize);
        if (this.world.getChunk(chunk) === undefined) return this.refuse('out-of-bounds', request, tick, tile);
        if (!canBuildAt(this.world, tile, ZONING_REQUIREMENT).buildable) {
          return this.refuse('unowned-land', request, tick, tile);
        }
        if (this.world.getZoning(tile) !== 0) return this.refuse('overlaps-existing-room', request, tick, tile);
      }
    }

    /*
     * The enclosure requirement, enforced -- and this is the sentence that
     * changed.
     *
     * It used to read "evaluated, and deliberately not enforced ... It refuses
     * nothing, and that is the decision rather than caution", and it gave two
     * reasons. The owner has ruled the other way (issue #446's third open
     * question): `roomPerimeterEnclosure` is not to stay advisory and `zone`
     * must refuse an open room. The ADR "Must a zoned room be enclosed" is the
     * decision; what follows is only what a reader of this function needs.
     *
     * **What the ruling actually changes is the meaning of `enclosed`.** The
     * old reason for not refusing was that this check is *narrower* than
     * enclosure: a rectangle drawn inside a larger sealed building, with no
     * partitions of its own, reads `open` while being topologically indoors, so
     * refusing on it would block a designation that reading calls legitimate.
     * That reading is now not in force. `enclosed` means "this room's own
     * boundary is closed", and against that question this function is not a
     * narrow proxy but an exact answer -- which is why the region-level query
     * `./enclosure.ts` names as the thing to build first is no longer a
     * prerequisite for anything here. The cost is stated rather than hidden:
     * an open-plan room inside a sealed hall is no longer zonable, and every
     * room must be walled (adjacent rooms may share a wall, so this is
     * subdivision and not double-walling).
     *
     * **Only `enclosed`.** `outdoors` (`room.yard`, the one shipped room that
     * authors it) and `none` accept any perimeter. A walled exercise yard is
     * the archetype rather than the exception, and `outdoors` is a claim about
     * a *roof*, which this world model does not have -- so the mirror-image
     * refusal would answer the question with the wrong instrument.
     *
     * **Last, and before any write.** Not on cost: this is `2 * (width +
     * height)` edge reads against the loop above's `width * height` tiles, so
     * for a 2x3 cell it is the *more* expensive of the two and the two cross
     * over around 4x4. It is last because `roomPerimeterEnclosure` reads the
     * north edge of the row below the rectangle and the west edge of the
     * column to its right, and `getTopEdge`/`getLeftEdge` answer `0` for a
     * chunk that does not exist -- so for a request reaching outside the
     * materialised world it would name a gap on a tile that is not there.
     * `out-of-bounds` has to win, and so does `unowned-land`: it is the same
     * rule that puts `below-minimum-size` ahead of the per-tile checks, which
     * is that the player is told the thing they can act on. Sending somebody to
     * wall land they do not own is worse advice than the truth about the land.
     *
     * One call, before the write, serving both outcomes -- the refusal here and
     * the notice below. It used to run *after* the plane was painted, which was
     * harmless (`setZoning` writes the zoning plane, never an edge layer) and
     * is not a place a refusal can be returned from.
     */
    const enclosure = roomPerimeterEnclosure(this.world, request);
    const requirement = enclosureRequirement(definition);
    if (requirement === 'enclosed' && enclosure.enclosure === 'open') {
      return this.refuse('not-enclosed', request, tick, enclosure.gap?.tile, enclosure.gap?.edge);
    }

    for (let offsetY = 0; offsetY < request.height; offsetY += 1) {
      for (let offsetX = 0; offsetX < request.width; offsetX += 1) {
        this.world.setZoning(
          { x: tileCoordinate(request.x + offsetX), y: tileCoordinate(request.y + offsetY) },
          definition.numericId,
        );
      }
    }

    const registered: RoomInstance = {
      instanceId,
      roomCatalogId: definition.id,
      anchorTile: anchor,
      // The rectangle, kept rather than discarded. `anchor` is its left/top
      // edge, so the four numbers together are the room's extent and nothing
      // downstream has to re-derive it from the plane.
      width: request.width,
      height: request.height,
      // Zeroes before the resolver runs, never as the final answer -- see this
      // module's header. An instance has to exist before anything can ask what
      // is standing inside it, and `updateDerived` is the only thing that may
      // change these three.
      residentCapacity: 0,
      concurrentUseCapacity: 0,
      objectCapabilities: [],
      // The room *type*'s open-area tag, carried onto the instance because
      // `RoomInstanceRegistry` may not read a catalogue (ADR 0071 decision 4).
      // Unlike the three fields above this is not a zero waiting for
      // `updateDerived`: it never changes for the life of the instance,
      // because it is a fact about the room type and not about what is
      // standing inside it. Owner's ruling of 2026-08-29, issue #585.
      openArea: isOpenAreaRoom(definition.id),
    };
    this.roomInstances.register(registered);
    // Immediately, and inside the same command dispatch, so no tick exists in
    // which the new room reads as empty while an object stands in it.
    this.capacity?.resolveInstance(instanceId);
    const instance = this.roomInstances.getById(instanceId) ?? registered;

    /*
     * The notice, from the answer computed before the write.
     *
     * The evaluation itself, and the ruling that made it a refusal rather than
     * a readout, are above the write. What is left here is publication: the
     * pair goes onto the notice, reaches the Rooms panel through
     * `simulation/status-counts`, and tells the player what they designated.
     *
     * On an accepted zoning the pair can now only be `sealed` against anything,
     * or `open` against `outdoors`/`none` -- `open` against `enclosed` was
     * refused above. That is why the panel's `hud.rooms.enclosure-open-required`
     * warning was deleted with this change rather than left as a branch nothing
     * can reach: the sentence it carried is now
     * `hud.alert.refusal.zone.not-enclosed`, said at the moment the player can
     * still act on it.
     */
    this._lastNotice = {
      sequence: (this._lastNotice?.sequence ?? 0) + 1,
      tick,
      enclosure: enclosure.enclosure,
      requirement,
    };

    return {
      kind: 'zoned',
      instance,
      enclosure: enclosure.enclosure,
      enclosureRequirement: requirement,
      // The definition this whole function decided the request against, so the
      // word the player reads and the type the world recorded cannot disagree:
      // `registered.roomCatalogId` is `definition.id` twenty lines above.
      roomNameKey: definition.nameKey,
    };
  }

  /**
   * Clears every room designation the rectangle touches, or refuses with a
   * reason.
   *
   * ## Why removal exists at all
   *
   * Because without it a zoned room is permanent. `zone` refuses
   * `overlaps-existing-room` for a tile whose zoning value is non-zero, no
   * command expressed removal, and zoning writes no construction order, so
   * `Undo` -- which dispatches to `ConstructionSystem.undo()` -- cannot reach
   * it either. One stray drag could therefore make up to 4,096 tiles
   * permanently unusable, and on touch there was no recovery of any kind
   * because undo is keyboard-only. Every comparable game has removal (Prison
   * Architect's right-drag) or a confirm gate (Two Point Hospital); this is
   * removal, and the Rooms panel adds the confirm gate on top of it.
   *
   * ## What "the rooms the rectangle touches" means
   *
   * Not "the tiles inside the rectangle". Each zoned tile the rectangle covers
   * is resolved to the **room instance** that contains it, and that instance's
   * whole rectangle is cleared. Two consequences, both deliberate and both
   * stated rather than discovered:
   *
   *   - **A partial drag removes a whole room.** Clipping a corner off a 6x6
   *     canteen clears all 36 tiles. The alternative -- clearing only the
   *     covered tiles -- leaves the plane painted where the registry has no
   *     instance, or an instance whose anchor tile is no longer zoned, and
   *     that inconsistency is exactly the state `zone` is careful never to
   *     create. Growing to the instance keeps this module's invariant intact:
   *     the plane is painted if and only if an instance is registered.
   *   - **Two adjacent rooms of the same type are *not* removed together**
   *     (issue #337). They are two instances at the `zone` end and now two at
   *     this end too, because what resolves a tile is the instance's rectangle
   *     rather than the type painted in the plane. This used to be the
   *     opposite statement, and it cost the player twice over: a mis-drag
   *     removed a neighbour they meant to keep, and an empty room beside an
   *     occupied one could not be removed at all, because the occupancy check
   *     below ran over the whole reached region. `removedInstanceIds` stays
   *     plural -- a drag can genuinely cover several rooms -- but a drag that
   *     covers one room now removes one room. See `collectRemovableRegion` for
   *     why this needed nothing new in the save format.
   *
   * ## Determinism and bounds
   *
   * The rectangle is walked in the same canonical order `zone` uses (ascending
   * y then x) and both collectors share one visited set for the whole command,
   * so the *set* of cleared tiles is a function of the request and of the
   * world. That set is then **sorted back into that same order** before
   * anything reads it, because the visited set's own iteration order is the
   * order the tiles happened to be reached in -- see the comment at the sort.
   * Resolving a tile to its instance is deterministic for the same reason:
   * `roomInstanceContaining` scans `allByRoomCatalogId`, which is sorted by
   * instance id rather than in registration order.
   *
   * Total work is bounded by the rectangle's area plus the tiles actually
   * cleared, never by the size of the world. A tile already collected is
   * skipped before it is resolved, so the number of instance lookups is bounded
   * by the number of *rooms* the rectangle covers rather than by its area, and
   * `removedInstanceIds` is sorted, so two runs of the same commands produce an
   * identical outcome.
   *
   * ## Occupancy (issue #478 narrowed this from a permanent refusal)
   *
   * A prisoner holds an `accommodationInstanceId` in cold state, so
   * unregistering an instance underneath them would leave a reference to a
   * room that no longer exists -- and unlike the geometry, that used to be
   * nothing another drag could repair. Until #478, *any* claim on the
   * instance -- a resident living there or a prisoner merely using it for one
   * action -- refused the whole removal outright, unconditionally, with
   * `unzone.room-occupied`.
   *
   * **A use claim still refuses outright, and that half is unchanged.** It is
   * transient by construction (`RoomInstanceRegistry.claimUse`'s own comment:
   * a claim lasts one action), so a canteen a prisoner is eating in can be
   * un-zoned a moment later, and there is nowhere to *relocate* a diner to --
   * the room they are using is the whole of what "using" means. This is
   * asked first, with `useOccupancyOf`, before anything below even looks at
   * residents.
   *
   * **A residency claim is now relocated rather than refused, when
   * `residentRelocation` is wired.** A cell with a bed has a
   * `residentCapacity` of 1, `IntakeSystem` houses an arrival there, and that
   * arrival used to be permanent furniture: nothing in `src/` before #478
   * moved a prisoner *out* of accommodation, so a cell zoned in the wrong
   * place and later occupied by an ordinary admission could never be
   * un-zoned again for the life of the session. `ResidentRelocationPort`
   * (`PrisonerOperationsRuntime.relocateResidentsOutOf`) is asked, once, for
   * every instance this removal would otherwise strand a resident out of,
   * and its contract is all-or-nothing: either every resident named finds
   * somewhere else to live and the removal proceeds, or none of them move
   * and this returns `unzone.room-occupied` exactly as before. **The
   * refusal that remains is therefore the honest one** -- not "somebody is
   * using that room" as a permanent condition, but "there is nowhere in this
   * prison to put them right now", which lifts the moment the player builds
   * more accommodation or a resident leaves some other room. A caller that
   * wires no `residentRelocation` -- every fixture in
   * `tests/unit/rooms-zoning.test.ts` -- gets the original, unconditional
   * refusal: nothing about a room's occupants changes for a service built
   * without the port.
   *
   * **This generalises past `room.cell`.** Relocation is keyed on the
   * resident's own classification group (`firstAvailableAccommodationTarget`,
   * the same lookup `IntakeSystem` and `SanctionSystem` already make), never
   * on which room type is being removed -- so un-zoning an occupied
   * `room.solitary-cell` relocates its resident by the identical rule, into
   * whatever their group's accommodation policy prefers.
   */
  public unzone(request: UnzoneRoomRequest, tick: number): UnzoneRoomOutcome {
    if (
      request.width < 1 ||
      request.height < 1 ||
      request.width > MAX_ZONE_DIMENSION_TILES ||
      request.height > MAX_ZONE_DIMENSION_TILES
    ) {
      return { kind: 'refused', reason: 'invalid-area', request: { ...request }, tick };
    }

    // Every tile is collected before any is cleared, for the reason `zone`
    // validates before writing: a removal that refused halfway would leave the
    // plane and the registry disagreeing, and the occupancy check below can
    // only be made once the whole set of affected instances is known.
    const tiles = new Map<string, TilePosition>();
    for (let offsetY = 0; offsetY < request.height; offsetY += 1) {
      for (let offsetX = 0; offsetX < request.width; offsetX += 1) {
        const tile: TilePosition = {
          x: tileCoordinate(request.x + offsetX),
          y: tileCoordinate(request.y + offsetY),
        };
        // A tile already collected is a tile whose room is already going, so
        // it needs no second resolution. This is what keeps the cost of a
        // 64x64 drag proportional to the *rooms* it covers rather than to its
        // area times the registry.
        if (tiles.has(tileKeyOf(tile))) continue;
        this.collectRemovableRegion(tile, tiles);
      }
    }

    if (tiles.size === 0) {
      return { kind: 'refused', reason: 'nothing-to-remove', request: { ...request }, tick };
    }

    /*
     * Sorted into the canonical order `zone` walks a rectangle in -- ascending
     * y, then ascending x -- before anything reads the set.
     *
     * The `Map` above is a *visited set*: it exists so a tile reached twice by
     * the flood fill is expanded once, and its insertion order is the order the
     * fill happened to reach tiles in, which depends on which corner of the
     * request the walk started from. Iterating it directly would be an
     * unordered enumeration deciding an outcome, and
     * `tests/determinism/canonical-iteration-contract.test.ts` is right to
     * refuse it: the loop below returns on the first occupied instance it
     * finds, so on a rectangle covering two occupied rooms the *tile named in
     * the diagnosis* would depend on fill order.
     *
     * Sorting rather than taking an allow-list exemption, because there is a
     * canonical order to sort into and it is the one this file already uses.
     * The cost is one sort of at most 4,096 entries per command, against the
     * flood fill that produced them.
     */
    const ordered = [...tiles.values()].sort((a, b) => a.y - b.y || a.x - b.x);

    // An instance is affected when its anchor tile is one of the cleared
    // tiles. The anchor is the only tile of an instance the registry knows
    // about, and it always lies inside the instance's own region, so this
    // finds every room whose tiles are about to go.
    //
    // Every instance is resolved and checked for a *use* claim before any
    // relocation is attempted, and the loop still returns on the first one
    // found -- that half of the guard is unconditional, exactly as it always
    // was, so no resident-relocation attempt is ever made for a room a
    // command handler could not have unregistered anyway. `occupiedInstanceIds`
    // collects residency claims instead of refusing on them immediately,
    // because whether they can be resolved is not known until every affected
    // instance has been seen -- see `ResidentRelocationPort`'s all-or-nothing
    // contract above.
    const removed: RoomInstance[] = [];
    const occupiedInstanceIds: string[] = [];
    // One entry per instance in `removed`, keyed by instance id rather than
    // carried on a parallel array in scan order: the return below re-sorts
    // `removedInstanceIds`, and a map read back by the sorted id is what keeps
    // `removedRoomNameKeys` aligned with it without a second sort of its own.
    const roomNameKeyByInstanceId = new Map<string, string>();
    for (const tile of ordered) {
      const definition = this.rooms.getByNumericId(this.world.getZoning(tile));
      if (definition === undefined) continue;
      const instance = this.roomInstances.getById(roomInstanceIdFor(definition.id, tile));
      if (instance === undefined) continue;
      if (this.roomInstances.useOccupancyOf(instance.instanceId) > 0) {
        return { kind: 'refused', reason: 'room-occupied', request: { ...request }, tick };
      }
      if (this.roomInstances.occupancyOf(instance.instanceId) > 0) occupiedInstanceIds.push(instance.instanceId);
      removed.push(instance);
      roomNameKeyByInstanceId.set(instance.instanceId, definition.nameKey);
    }

    if (occupiedInstanceIds.length > 0) {
      // Sorted -- code-unit order, never `localeCompare`
      // (`docs/DETERMINISM.md`) -- so the set handed to the port does not
      // depend on the anchor-tile scan order above, only on which instances
      // this removal affects.
      occupiedInstanceIds.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      const outcome = this.residentRelocation?.relocateResidentsOutOf(occupiedInstanceIds);
      if (outcome !== 'relocated') {
        // Either no port is wired (the original, unconditional refusal every
        // existing fixture still gets) or it tried and found nowhere to put
        // somebody. Either way nothing has been written yet -- `world.setZoning`
        // and `roomInstances.unregister` are both still ahead of this line --
        // so the refusal is exact: residency is exactly as it was.
        return { kind: 'refused', reason: 'room-occupied', request: { ...request }, tick };
      }
      // Every named resident now lives elsewhere, so every instance in
      // `removed` reads zero claims of both kinds and `unregister` below
      // cannot throw.
    }

    for (const tile of ordered) this.world.setZoning(tile, 0);
    for (const instance of removed) this.roomInstances.unregister(instance.instanceId);

    const removedInstanceIds = removed.map((instance) => instance.instanceId).sort();
    return {
      kind: 'unzoned',
      removedInstanceIds,
      removedRoomNameKeys: removedInstanceIds.map((instanceId) => roomNameKeyByInstanceId.get(instanceId)!),
      clearedTiles: tiles.size,
    };
  }

  /**
   * Adds every tile that has to go because the removal covers `origin`.
   *
   * ## The instance, not the region (issue #337)
   *
   * A covered tile is resolved to the **room instance** that contains it, and
   * that instance's own rectangle is what gets cleared. That is the whole of
   * the fix: `unzone` used to grow each covered tile into its connected
   * *same-type* run, so two cells the player zoned as two separate drags were
   * one region in a plane that stores a type per tile, and clipping a corner
   * off one removed both -- or, when the neighbour held a resident, refused the
   * removal of the empty one. Both readings followed from resolving in types.
   *
   * **Nothing new is persisted for this, and the plane is unchanged.** The
   * issue proposed storing an instance id per tile, which would be a
   * save-schema decision; it is not needed, because a `RoomInstance` has
   * carried its rectangle since [ADR 0028](../../../docs/adr/0028-object-placement-and-derived-room-capacity.md)
   * phase 1 and `roomInstanceContaining` (`../objects/room-capacity.ts`) is the
   * function object placement already asks "which room is this tile in". A
   * second copy of that fact in the plane could disagree with the rectangle it
   * was derived from, which is exactly why ADR 0028 decision 6 *removed* the
   * last persisted derived value from a room instance.
   *
   * The two consequences `unzone`'s own comment states are unchanged by this:
   * a partial drag still removes the whole room it clipped, because the
   * instance's whole rectangle is collected; and a drag that genuinely covers
   * several rooms still removes all of them, because every covered tile is
   * resolved.
   *
   * ## The tiles no instance claims
   *
   * A painted tile that resolves to no instance keeps the old flood fill, and
   * that is not a leftover. Two states produce one: an instance that records no
   * rectangle (`roomBoundsOf` answers `undefined` and there is no honest
   * default -- see `../objects/room-capacity.ts`), and a save written before
   * zoning painted the plane can leave paint with no instance at all.
   *
   * **The first used to be named as "a V4 room instance" and no longer is**
   * (issue #559, ADR 0074): a V4 row's rectangle is recovered at restore from
   * this very plane (`./bounds-recovery.ts`), so a restored V4 room resolves to
   * its instance and its removal takes the instance path above rather than this
   * fill. What still reaches here is a row the plane cannot support. Removal
   * exists so that no designation is permanent, so those tiles must stay
   * clearable; resolving them to nothing and leaving them would be the
   * unremovable-room defect this command was built to close.
   */
  private collectRemovableRegion(origin: TilePosition, into: Map<string, TilePosition>): void {
    if (this.world.getZoning(origin) === 0) return;

    const instance = roomInstanceContaining(this.world, this.roomInstances, origin, this.rooms);
    if (instance === undefined) {
      this.collectUnclaimedZonedRegion(origin, into);
      return;
    }

    // Non-`undefined` by construction: `roomInstanceContaining` answers an
    // instance only when its rectangle contains the tile, and a rectangle is
    // what `roomBoundsOf` reads.
    const bounds = roomBoundsOf(instance);
    if (bounds === undefined) return;
    for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
      for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
        const tile: TilePosition = { x: tileCoordinate(x), y: tileCoordinate(y) };
        // Only what is actually painted. `setZoning` *materialises* a chunk, so
        // writing a zero over a tile that already holds one would grow the
        // world on the way to removing nothing -- the same reason `zone`
        // checks every tile before it writes any.
        if (this.world.getZoning(tile) === 0) continue;
        into.set(tileKeyOf(tile), tile);
      }
    }
  }

  /**
   * Adds `origin` and every tile four-connected to it through the same room
   * numeric id to `into`, **stopping at any tile a room instance claims**.
   *
   * The fill `unzone` used to run over every covered tile, now reached only for
   * paint no instance owns (see `collectRemovableRegion`). The stop condition
   * is what keeps it from being the old defect wearing a smaller hat: an
   * unclaimed run touching a real room must not drag that room's tiles out from
   * under it, because clearing the plane where an instance is registered breaks
   * this module's invariant in the direction `zone` is careful never to.
   *
   * Walls are deliberately *not* barriers here. The plane is what the player
   * sees tinted and what `zone` refuses to overlap, so removal has to be able
   * to clear exactly what is painted; stopping at a wall would leave painted
   * tiles behind on the far side of a partition drawn after the room was
   * designated, and those tiles would be unremovable again.
   *
   * Bounded twice over: a tile already in `into` is never expanded again, and
   * a zoned run cannot exceed the plane's own painted extent, which no single
   * `zone` can grow beyond `MAX_ZONE_DIMENSION_TILES` squared.
   */
  private collectUnclaimedZonedRegion(origin: TilePosition, into: Map<string, TilePosition>): void {
    const zoning = this.world.getZoning(origin);
    if (zoning === 0) return;

    const stack: TilePosition[] = [origin];
    while (stack.length > 0) {
      // A stack rather than a queue, and the order does not reach the outcome:
      // what this produces is the *set* of tiles reached, cleared afterwards
      // in a plane where every write is the same value.
      const tile = stack.pop() as TilePosition;
      const key = tileKeyOf(tile);
      if (into.has(key)) continue;
      if (this.world.getZoning(tile) !== zoning) continue;
      if (roomInstanceContaining(this.world, this.roomInstances, tile, this.rooms) !== undefined) continue;
      into.set(key, tile);
      stack.push(
        { x: tileCoordinate(tile.x + 1), y: tile.y },
        { x: tileCoordinate(tile.x - 1), y: tile.y },
        { x: tile.x, y: tileCoordinate(tile.y + 1) },
        { x: tile.x, y: tileCoordinate(tile.y - 1) },
      );
    }
  }

  /** The last accepted zoning's notice, or `undefined` while this session has zoned nothing. */
  public get lastNotice(): ZoningNotice | undefined {
    return this._lastNotice;
  }

  /**
   * The refusals this session has produced, oldest first.
   *
   * **This window is diagnosis, not the player's alert.** It used to be
   * neither -- nothing in `src/` read it, because a refusal had nowhere to
   * go: the kernel's command handler returns `void` and the worker's reply to
   * a command acknowledges receipt, not effect. It was kept anyway "so that
   * the route, when it is built, has something to report", and #261 step 2
   * built the route: `session-commands.ts` maps `ZoneRoomRefusalReason` onto
   * a `RefusalReason` and records it on the session's `RefusalLog`, which the
   * worker publishes on `simulation/status-counts`.
   *
   * The two are not duplicates and neither replaces the other. What crosses
   * the boundary is the *most recent* refusal's reason and nothing else --
   * one sentence in the HUD's alerts list. What stays here is the last
   * `MAX_RECORDED_ZONING_REFUSALS` of them with the request and the deciding
   * tile: enough to answer "why did none of my last six rooms appear", which
   * is a question for a developer inside the worker rather than a line on
   * screen.
   *
   * Deliberately **not** snapshotted: it is a record of things that did not
   * happen, no simulation state is derived from it, and a save that carried
   * it would make a session's payload depend on the player's misclicks.
   * A restored session therefore starts with an empty window.
   */
  public recentRefusals(): readonly ZoneRoomRefusal[] {
    return [...this.refusals];
  }

  private refuse(
    reason: ZoneRoomRefusalReason,
    request: ZoneRoomRequest,
    tick: number,
    tile?: TilePosition,
    edge?: 'north' | 'west',
  ): ZoneRoomRefusal {
    const refusal: ZoneRoomRefusal = {
      kind: 'refused',
      reason,
      request: { ...request },
      tick,
      // Spread rather than assigned, because `exactOptionalPropertyTypes` makes
      // `{ tile: undefined }` a different type from `{}` -- and because a
      // refusal that carried an explicit `undefined` edge would read as "the
      // gap has no edge" rather than "this reason names none".
      ...(tile === undefined ? {} : { tile }),
      ...(edge === undefined ? {} : { edge }),
    };
    this.refusals.push(refusal);
    if (this.refusals.length > MAX_RECORDED_ZONING_REFUSALS) this.refusals.shift();
    return refusal;
  }
}
