import { defaultRoomContentRegistry, type RoomCatalogDefinition } from '../../content/room-catalog';
import type { ContentRegistry } from '../../content/registry';
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
 * room's contents a domain. Two adjacent same-type rectangles are still two
 * instances and `unzone` still treats them as one region -- neither is changed
 * here.
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
 * How many refusals are kept for a reporting route that does not exist yet.
 *
 * A player who drags a zone over unowned land repeatedly must not grow a
 * list without limit, and nothing reads more than the last few, so the
 * record is a bounded window rather than a log.
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
 */
export type ZoneRoomRefusalReason =
  | 'unknown-room-type'
  | 'invalid-area'
  | 'below-minimum-size'
  | 'out-of-bounds'
  | 'unowned-land'
  | 'overlaps-existing-room'
  | 'duplicate-instance-id';

export interface ZoneRoomRefusal {
  readonly kind: 'refused';
  readonly reason: ZoneRoomRefusalReason;
  readonly request: ZoneRoomRequest;
  /** The tile that decided a per-tile refusal (`out-of-bounds`, `unowned-land`, `overlaps-existing-room`); absent for a refusal about the request as a whole. */
  readonly tile?: TilePosition;
  readonly tick: number;
}

export interface ZoneRoomAccepted {
  readonly kind: 'zoned';
  readonly instance: RoomInstance;
  /**
   * Whether the rectangle that was just zoned is walled in along its own
   * perimeter, and what the room definition asks for.
   *
   * Carried on the *accepted* outcome and not used to refuse one. See
   * `zone`'s comment on the enclosure evaluation for why, and
   * `./enclosure.ts` for what the answer does and does not mean.
   */
  readonly enclosure: RoomEnclosure;
  readonly enclosureRequirement: RoomEnclosureRequirement;
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
  /** How many tiles of the zoning plane were cleared. Always at least 1 on an accepted removal. */
  readonly clearedTiles: number;
}

export type UnzoneRoomOutcome = UnzoneRoomAccepted | UnzoneRoomRefusal;

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
    };
    this.roomInstances.register(registered);
    // Immediately, and inside the same command dispatch, so no tick exists in
    // which the new room reads as empty while an object stands in it.
    this.capacity?.resolveInstance(instanceId);
    const instance = this.roomInstances.getById(instanceId) ?? registered;

    /*
     * The enclosure requirement, evaluated -- and deliberately not enforced.
     *
     * `RoomRequirement.type` has included `'enclosed'` and `'outdoors'` since
     * #17 and all 18 definitions carry one of them; nothing in `src/` had ever
     * evaluated either, so a cell zoned in the middle of open ground was
     * accepted in silence. `roomPerimeterEnclosure` is the honest half of
     * that: it answers whether *this rectangle's own perimeter* is walled,
     * which is a real property of the world read from the two edge layers.
     *
     * **It refuses nothing, and that is the decision rather than caution.**
     * Two facts make a refusal wrong here, and `./enclosure.ts` records both
     * in full:
     *
     *   - The check is narrower than enclosure. A room drawn inside a larger
     *     sealed building with no partitions of its own reads `open` while
     *     being indoors, so refusing on it would block a legitimate
     *     designation. The wider question needs region-level enclosure, and
     *     `TopologyManager` does region *detection* with no enclosure query
     *     and no caller for its `update()`.
     *   - Refusing every `'enclosed'` room that is not sealed would refuse
     *     rooms a player can zone today, on a check that runs at *designation
     *     time* while the walls are usually built afterwards. (This bullet used
     *     to give a stronger reason -- that a sealed room could not have a door,
     *     because `edgeNumericIdFor` wrote `0` for `door-wooden` and a completed
     *     door order changed nothing in the world. That stopped being true when
     *     doors became buildable: a door writes `DOOR_EDGE_NUMERIC_ID` and
     *     registers itself, so a sealed room with a way in is now expressible.
     *     The decision not to refuse is unchanged, and the reason above is the
     *     one that survives.)
     *
     * So the answer is *reported* instead: it goes onto the notice below,
     * reaches the Rooms panel through `simulation/status-counts`, and the
     * player is told what they designated rather than stopped from
     * designating it. The day something gates on enclosure -- an occupancy
     * rule, an intake requirement -- this is the function it should ask, and
     * the region query is the thing to build first.
     */
    const enclosure = roomPerimeterEnclosure(this.world, request);
    const requirement = enclosureRequirement(definition);
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
   * Not "the tiles inside the rectangle". Each zoned tile the rectangle
   * covers is grown into the connected run of tiles holding the **same room
   * numeric id**, four-connected, and that whole run is cleared. Two
   * consequences, both deliberate and both stated rather than discovered:
   *
   *   - **A partial drag removes a whole room.** Clipping a corner off a 6x6
   *     canteen clears all 36 tiles. The alternative -- clearing only the
   *     covered tiles -- leaves the plane painted where the registry has no
   *     instance, or an instance whose anchor tile is no longer zoned, and
   *     that inconsistency is exactly the state `zone` is careful never to
   *     create. Growing to the region keeps this module's invariant intact:
   *     the plane is painted if and only if an instance is registered, because
   *     a room's tiles are a contiguous rectangle of one type and therefore
   *     always lie in one region together with their anchor.
   *   - **Two adjacent rooms of the same type are removed together**, because
   *     they are one region in a plane that stores a type per tile and no
   *     instance id. That is the same limitation `zone` already has in the
   *     other direction -- two adjacent same-type rectangles are two separate
   *     `RoomInstance`s rather than one L-shaped room -- and neither is
   *     changed here. Both end at the same place: the plane would have to
   *     carry an instance id per tile, which is a persistence-format decision
   *     (`docs/HUD_PROJECTIONS.md` gap 11) rather than something to settle
   *     inside a command handler.
   *
   * ## Determinism and bounds
   *
   * The rectangle is walked in the same canonical order `zone` uses (ascending
   * y then x) and the flood fill uses one visited set for the whole command, so
   * the *set* of cleared tiles is a function of the request and of the world.
   * That set is then **sorted back into that same order** before anything reads
   * it, because the visited set's own iteration order is the order the fill
   * happened to reach tiles in -- see the comment at the sort. Total work is
   * bounded by the rectangle's area plus the tiles actually cleared, never by
   * the size of the world, and `removedInstanceIds` is sorted, so two runs of
   * the same commands produce an identical outcome.
   *
   * ## Occupancy
   *
   * A room with occupants is refused rather than removed. A prisoner holds an
   * `accommodationInstanceId` in cold state, so unregistering an instance
   * underneath them would leave a reference to a room that no longer exists --
   * and unlike the geometry, that is not something another drag can repair. It
   * used to be unreachable from a session zoned only through this service,
   * because a zoned room had `capacity: 0` and `RoomInstanceRegistry.assign`
   * refuses to fill it. **It is reachable now**: a cell with a bed in it has a
   * `residentCapacity` of 1, `IntakeSystem` houses an arrival there, and a
   * player who then drags a removal across that cell is told
   * `unzone.room-occupied` rather than having the prisoner's
   * `accommodationInstanceId` left naming a room that no longer exists. So this
   * refusal moved from a corruption guard to a rule a player meets, which is
   * what ADR 0028 phase 1 turns on.
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
        this.collectZonedRegion(
          { x: tileCoordinate(request.x + offsetX), y: tileCoordinate(request.y + offsetY) },
          tiles,
        );
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
    const removed: RoomInstance[] = [];
    for (const tile of ordered) {
      const definition = this.rooms.getByNumericId(this.world.getZoning(tile));
      if (definition === undefined) continue;
      const instance = this.roomInstances.getById(roomInstanceIdFor(definition.id, tile));
      if (instance === undefined) continue;
      // `claimCountOf` and not `occupancyOf`: since ADR 0029 a prisoner can
      // hold this instance because they are *using* it for an action rather
      // than living in it, and that reference dangles in exactly the same way
      // if the instance is unregistered underneath it. It is also the same
      // predicate `RoomInstanceRegistry.unregister` throws on, and the two must
      // agree or a refusal the player should have seen becomes an exception out
      // of `Kernel.step()`. The use-claim half of the refusal is transient by
      // construction -- a claim lasts one action -- so a canteen a prisoner is
      // eating in can be un-zoned a moment later.
      if (this.roomInstances.claimCountOf(instance.instanceId) > 0) {
        return { kind: 'refused', reason: 'room-occupied', request: { ...request }, tick };
      }
      removed.push(instance);
    }

    for (const tile of ordered) this.world.setZoning(tile, 0);
    for (const instance of removed) this.roomInstances.unregister(instance.instanceId);

    return {
      kind: 'unzoned',
      removedInstanceIds: removed.map((instance) => instance.instanceId).sort(),
      clearedTiles: tiles.size,
    };
  }

  /**
   * Adds `origin` and every tile four-connected to it through the same room
   * numeric id to `into`.
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
  private collectZonedRegion(origin: TilePosition, into: Map<string, TilePosition>): void {
    const zoning = this.world.getZoning(origin);
    if (zoning === 0) return;

    const stack: TilePosition[] = [origin];
    while (stack.length > 0) {
      // A stack rather than a queue, and the order does not reach the outcome:
      // what this produces is the *set* of tiles reached, cleared afterwards
      // in a plane where every write is the same value.
      const tile = stack.pop() as TilePosition;
      const key = `${tile.x},${tile.y}`;
      if (into.has(key)) continue;
      if (this.world.getZoning(tile) !== zoning) continue;
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
  ): ZoneRoomRefusal {
    const refusal: ZoneRoomRefusal = {
      kind: 'refused',
      reason,
      request: { ...request },
      tick,
      ...(tile === undefined ? {} : { tile }),
    };
    this.refusals.push(refusal);
    if (this.refusals.length > MAX_RECORDED_ZONING_REFUSALS) this.refusals.shift();
    return refusal;
  }
}
