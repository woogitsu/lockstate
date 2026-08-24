import { defaultRoomContentRegistry, type RoomCatalogDefinition } from '../../content/room-catalog';
import type { ContentRegistry } from '../../content/registry';
import type { RoomInstance, RoomInstanceRegistry } from '../prisoners/room-instance-registry';
import { canBuildAt, type BuildabilityRequirement } from '../world/buildability';
import { tileCoordinate, tileToChunk, type TilePosition } from '../world/coordinates';
import type { SparseWorld } from '../world/sparse-world';

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
 * "which instance is this tile part of" is still unanswerable -- the same
 * shape of gap `docs/HUD_PROJECTIONS.md` records for room membership. The
 * overlap check below needs only "is this tile already claimed", which the
 * plane does answer.
 *
 * ## Capacity and object capabilities: zero and none, and that is measured
 *
 * `RoomInstance` carries a `capacity` and an `objectCapabilities` list, and
 * in this codebase both come from the objects standing in the room: a cell
 * holds as many prisoners as it has beds, and `IntakeSystem`/`ActionSystem`
 * gate on capability tags that `src/content/object-catalog.ts` puts on
 * objects. **Object placement does not exist** (`docs/HUD_PROJECTIONS.md`
 * gap 13), so a freshly zoned room contains nothing, and the honest reading
 * of nothing is `0` and `[]`. They are not a constant chosen to make a
 * feature work -- they are what an empty rectangle accommodates, and they
 * start being non-zero on their own the day something tracks placed objects.
 *
 * The room catalog carries no capacity of its own and none is invented here
 * (`AGENTS.md` boundary 6: content lives in data modules). Giving a zoned
 * room a usable capacity before object placement exists needs a content
 * addition -- the smallest being one authored occupancy figure per room
 * definition -- and that is a product decision, recorded on #261 rather than
 * taken inside a command handler.
 *
 * ## The instance id
 *
 * `<roomCatalogId>:<x>:<y>` over the anchor tile: a pure function of the
 * request and of world state, never a counter and never
 * `crypto.randomUUID()`. It is unique because the anchor of a new room is a
 * tile that was unzoned a moment earlier and is zoned afterwards, so no
 * later room can anchor on it.
 *
 * This deliberately does **not** decide ADR 0012
 * (`docs/adr/0012-derived-identifier-reproducibility.md`), which is still
 * `Proposed`. That ADR asks whether a minted identifier is an *allocated
 * identity* (a snapshotted counter) or a *derived value* (recomputed, never
 * persisted). A room-instance id needs neither answer: it is reproducible
 * from state like a derived value, and stable across ticks and carried in
 * the save like an allocated identity, because the state it is derived from
 * -- the anchor tile -- cannot change while the instance exists. Nothing
 * moves or resizes a room. **If a future feature does move or resize one,
 * this scheme stops being neutral and ADR 0012 has to be settled first**,
 * because the id would then either have to be re-derived (breaking every
 * save that carries the old one, and every prisoner's
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
 */
export type ZoneRoomRefusalReason =
  | 'unknown-room-type'
  | 'invalid-area'
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
}

export type ZoneRoomOutcome = ZoneRoomAccepted | ZoneRoomRefusal;

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

  public constructor(
    private readonly world: SparseWorld,
    private readonly roomInstances: RoomInstanceRegistry,
    private readonly rooms: ContentRegistry<RoomCatalogDefinition> = defaultRoomContentRegistry,
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

    const instance: RoomInstance = {
      instanceId,
      roomCatalogId: definition.id,
      anchorTile: anchor,
      // Zero and empty, and measured rather than chosen -- see this module's
      // header. An empty room accommodates nobody and offers no object
      // capability, because nothing has been placed in it.
      capacity: 0,
      objectCapabilities: [],
    };
    this.roomInstances.register(instance);
    return { kind: 'zoned', instance };
  }

  /**
   * The refusals this session has produced, oldest first.
   *
   * **Nothing in `src/` reads this yet, and that is the point.** A refusal
   * has nowhere to go: the kernel's command handler returns `void` and the
   * worker's reply to a command acknowledges receipt, not effect -- the same
   * gap `session-commands.ts` records for a refused purchase and #225 closed
   * for a refused wall, tracked as step 2 of #261. Keeping the reason here
   * costs one bounded array and means the route, when it is built, has
   * something to report instead of having to re-derive why a zone did not
   * appear.
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
