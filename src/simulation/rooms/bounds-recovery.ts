import { defaultRoomContentRegistry, type RoomCatalogDefinition } from '../../content/room-catalog';
import type { ContentRegistry } from '../../content/registry';
import { tileCoordinate, type TilePosition } from '../world/coordinates';
import type { SparseWorld } from '../world/sparse-world';
import { MAX_ZONE_DIMENSION_TILES } from './zoning';

/**
 * Recovering the rectangle of a room instance that was persisted without one.
 *
 * ## The defect this exists for (issue #559)
 *
 * A save-schema V4 room-instance row carries an identity and an anchor tile and
 * **no rectangle** -- `roomInstanceSchemaV4` in `../../persistence/save-schema.ts`
 * is the frozen shape, and `migrateSaveEnvelopeV4ToV5` deliberately invents
 * none. Until #554 that cost nothing anybody could see, because every consumer
 * of a room's bounds answered *zero* without them and zero was also the answer
 * for a room with no objects in it.
 *
 * #554 changed one consumer.
 * [ADR 0071](../../../docs/adr/0071-what-bounds-a-room-whose-activity-consumes-no-object.md)
 * gave `RoomInstanceRegistry.concurrentUseCapacityFor`'s first case -- an action
 * naming no object capability, which in the shipped content is exactly the
 * yard's recreation -- the answer `max(1, floor(width * height / 16))`, and left
 * `Number.POSITIVE_INFINITY` standing for an instance with no rectangle. So a
 * yard zoned by this build admits 4 prisoners and the *same yard* restored from
 * a V4 save admits all of them, for ever, which is the dominance #554 exists to
 * remove. Measured on a genuine v0.0.61 capture in
 * `tests/migrations/save-v4-room-bounds.test.ts`: `Infinity` against `4`.
 *
 * ## Why the rectangle is recoverable rather than lost
 *
 * `RoomZoningService.zone` writes **two** things and always has: the room
 * instance, and the room type's `numericId` into the world's zoning plane over
 * every tile of the rectangle. The plane is persisted -- `save-schema.ts`'s
 * `zoning: terrainRleSchema.optional()` inside the world section -- and it has
 * been persisted since before room instances existed. A V4 payload therefore
 * *does* carry the tiles the player drew; what it does not carry is the
 * arithmetic linking them to the row.
 *
 * That is the whole of this module: not an invention, a re-reading of a fact
 * the payload already holds. It is the distinction
 * [ADR 0033](../../../docs/adr/0033-releasing-an-interrupted-incident-response-at-runtime.md)
 * turns on -- a migration writes a conclusion into the file, a restored session
 * derives it from what it was handed and leaves the file alone -- and the
 * premise ADR 0030 decision 3 rested on, that the restored session could not
 * reach the facts, turned out false there for exactly this reason.
 *
 * ## Why it does not live in the migration
 *
 * Because a boundless row is **not confined to V4**, which is measurable rather
 * than arguable: restore a V4 payload on `main` today, run it, capture it, and
 * the envelope that comes out declares `saveSchemaVersion: 5`, decodes with
 * `migrated: false`, and still carries a row with no `width` and no `height`.
 * A repair inside `migrateSaveEnvelopeV4ToV5` would never be offered that save
 * again. A restore-time recovery is offered every save, every load.
 *
 * ## Why the answer is exact and not a guess
 *
 * The plane alone cannot say *which* instance a painted tile belongs to -- that
 * is the gap `zoning.ts` states in its own header and the reason
 * `roomInstanceContaining` resolves through rectangles rather than through the
 * plane. `recoverRoomBoundsFromZoningPlane` closes it with the anchors, which
 * the payload does carry, plus three facts about how `zone` writes:
 *
 * 1. an instance's region is an axis-aligned rectangle whose **top-left corner
 *    is its anchor tile** (`roomInstanceIdFor` is `id:x:y` of that corner);
 * 2. two instances never overlap (`zone` refuses `overlaps-existing-room`);
 * 3. every tile of the rectangle carries the room type's `numericId`.
 *
 * Walk the anchors in ascending `y`, then `x`, then instance id. For each,
 * measure east along the anchor row and south down the anchor column, stopping
 * at a tile that is not painted with this type, is already claimed by an
 * earlier instance, or **is another instance's anchor**. That third stop is
 * what separates two rooms of the same type sharing an edge, and the ordering
 * is what separates one whose neighbour starts on an earlier row.
 *
 * The two stops are exhaustive, which is why this is exact rather than a
 * heuristic. Suppose the east run over-reached: the first tile past the true
 * right edge belongs to some other instance `C`. Either `C`'s anchor row is
 * above this one, in which case `C` was processed first and the tile is
 * claimed; or `C` anchors on this very row, and then `C`'s anchor lies between
 * this anchor and that tile (an anchor further left would have to cover this
 * instance's own anchor, which is an overlap `zone` refuses), so the run stops
 * at it. And it cannot under-reach: every tile inside the true rectangle is
 * painted, is claimed by nobody else because rectangles are disjoint, and is
 * no other instance's anchor because an anchor lies inside its own rectangle.
 * The same argument transposed gives the height.
 *
 * ## What it refuses to answer
 *
 * The whole rectangle is verified painted and unclaimed before it is returned,
 * so a plane that does not actually show a rectangle -- a hand-edited save, or
 * paint cleared under a row -- recovers **nothing** and the instance keeps its
 * absent bounds and the unbounded ceiling ADR 0071 decided for it. That residue
 * is deliberate and pinned by a test rather than left implicit: inventing a
 * rectangle the plane does not support is the one thing ADR 0071 decision 2
 * refused, and it is still refused here. What changed is that the plane usually
 * *does* support one.
 *
 * ## Determinism
 *
 * No RNG, no iteration over an unordered collection that reaches an outcome:
 * the anchors are sorted into one canonical order before anything is measured,
 * and the result is a pure function of (the world's zoning plane, the rows, the
 * room catalogue). Two sessions restored from one payload recover the same
 * rectangles by construction.
 */

/** The subset of a persisted room-instance row this recovery reads. Structural, so nothing here depends on the persistence layer's own type. */
export interface RecoverableRoomInstance {
  readonly instanceId: string;
  readonly roomCatalogId: string;
  readonly anchorTile: TilePosition;
  readonly width?: number;
  readonly height?: number;
}

/** A rectangle recovered for one instance. Its position is the row's own anchor tile, which is why only the extent is returned. */
export interface RecoveredRoomBounds {
  readonly width: number;
  readonly height: number;
}

interface ClaimedRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function rectContains(rect: ClaimedRect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

function at(x: number, y: number): TilePosition {
  return { x: tileCoordinate(x), y: tileCoordinate(y) };
}

/**
 * The rectangles the zoning plane supports for the rows that record none.
 *
 * Keyed by instance id, and **only** the rows it could answer for: a row that
 * already carries a rectangle is not in the result (it is authoritative and is
 * used to claim its own tiles), and neither is one the plane cannot support.
 *
 * `rooms` resolves a row's `roomCatalogId` to the `numericId` the plane holds.
 * A row naming a room this build's catalogue does not declare recovers nothing,
 * for the reason `roomInstanceContaining` answers `undefined` for the same
 * case: nothing can attribute tiles to a room type the build cannot describe.
 */
export function recoverRoomBoundsFromZoningPlane(
  world: SparseWorld,
  instances: readonly RecoverableRoomInstance[],
  rooms: ContentRegistry<RoomCatalogDefinition> = defaultRoomContentRegistry,
): ReadonlyMap<string, RecoveredRoomBounds> {
  // Ascending y, then x, then instance id -- the order the correctness argument
  // in this module's header depends on, and a total one so the result cannot
  // depend on the order the payload happened to list the rows in.
  const ordered = [...instances].sort(
    (a, b) =>
      a.anchorTile.y - b.anchorTile.y ||
      a.anchorTile.x - b.anchorTile.x ||
      (a.instanceId < b.instanceId ? -1 : a.instanceId > b.instanceId ? 1 : 0),
  );

  // Every anchor, whatever its instance's state, so a run stops at a neighbour
  // that has not been measured yet as well as at one that has.
  const anchors = new Set(instances.map((instance) => `${instance.anchorTile.x},${instance.anchorTile.y}`));
  const claimed: ClaimedRect[] = [];
  const recovered = new Map<string, RecoveredRoomBounds>();

  const isClaimed = (x: number, y: number): boolean => claimed.some((rect) => rectContains(rect, x, y));

  for (const instance of ordered) {
    const anchorX = instance.anchorTile.x;
    const anchorY = instance.anchorTile.y;

    // A row that records its own rectangle is the authority on it. It is
    // claimed rather than re-measured, so a boundless neighbour cannot grow
    // into a room whose extent the save actually states.
    if (instance.width !== undefined && instance.height !== undefined) {
      claimed.push({ x: anchorX, y: anchorY, width: instance.width, height: instance.height });
      continue;
    }

    const definition = rooms.getById(instance.roomCatalogId);
    if (definition === undefined) continue;
    const painted = definition.numericId;
    if (world.getZoning(at(anchorX, anchorY)) !== painted) continue;

    const runs = (dx: number, dy: number): number => {
      let length = 1;
      while (length < MAX_ZONE_DIMENSION_TILES) {
        const x = anchorX + dx * length;
        const y = anchorY + dy * length;
        if (world.getZoning(at(x, y)) !== painted) break;
        if (isClaimed(x, y)) break;
        if (anchors.has(`${x},${y}`)) break;
        length += 1;
      }
      return length;
    };

    const width = runs(1, 0);
    const height = runs(0, 1);

    // The two runs measure one row and one column; this is the statement that
    // the plane really shows the rectangle they imply. Without it a room
    // painted in an L would be recovered as the bounding box of its two arms.
    let whole = true;
    for (let y: number = anchorY; whole && y < anchorY + height; y += 1) {
      for (let x: number = anchorX; x < anchorX + width; x += 1) {
        if (world.getZoning(at(x, y)) !== painted || isClaimed(x, y)) {
          whole = false;
          break;
        }
      }
    }

    if (!whole) continue;

    claimed.push({ x: anchorX, y: anchorY, width, height });
    recovered.set(instance.instanceId, { width, height });
  }

  return recovered;
}
