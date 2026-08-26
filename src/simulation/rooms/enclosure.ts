import { tileCoordinate, type TilePosition } from '../world/coordinates';
import type { SparseWorld } from '../world/sparse-world';

/**
 * Whether a zoned rectangle is walled in along its own boundary.
 *
 * ## What this answers, and what it does not
 *
 * It answers exactly one question: **is every edge on the perimeter of this
 * rectangle occupied by edge geometry?** For a rectangle that is the same
 * thing as "no walk in the four directions leaves it", because a rectangle's
 * boundary is its whole frontier -- so a `sealed` answer is a true statement
 * about the tiles inside it.
 *
 * It is **not** a region-enclosure query, and the difference is a false
 * negative rather than a false positive. A rectangle drawn strictly inside a
 * larger sealed building, with no partition walls of its own, is reported
 * `open` here while being topologically indoors. Answering *that* needs the
 * enclosing region rather than the rectangle, which nothing in this
 * repository computes:
 *
 * - `TopologyManager` (`./topology.ts`) does **region detection**, not
 *   enclosure. It flood-fills each chunk across zero-valued edges, joins the
 *   per-chunk regions across chunk boundaries and hands each connected
 *   component a `GlobalTopologyId`. Its own comment says the mapping "would be
 *   used later to query if a global room is enclosed", and no such query
 *   exists. Nor is a region id enough on its own: a region that reaches the
 *   edge of the materialised world is indistinguishable from one bounded by
 *   walls there, so "is this region closed" needs a rule about the world's
 *   frontier that nobody has written.
 * - `TopologyManager.update()` has no caller anywhere in `src/`. It is
 *   constructed in `runtime/new-session.ts` and is absent from the
 *   `registerSystem` block beside it, so no tick recomputes it and
 *   `getTopologyId` answers `0` for every tile in a running session.
 *
 * So this module deliberately implements the narrower predicate it can state
 * honestly, and the narrowness is why nothing *refuses* a room on it -- see
 * `RoomZoningService.zone`.
 *
 * ## A sealed room can have a door in it, and that is recent
 *
 * Worth knowing before reading a `sealed`/`open` answer as a verdict on the
 * player's building. This paragraph used to say the opposite -- that only a
 * `'wall'` wrote into the edge layers, that `edgeNumericIdFor` returned `0` for
 * `door-wooden` because an edge is opaque to `TopologyManager`, and that "the
 * only enclosure the world can express today is a rectangle with no way in".
 *
 * A completed door order now writes `DOOR_EDGE_NUMERIC_ID` into the same layer
 * *and* registers a `DoorDefinition`, so this function reports a room with a
 * door in its wall line as `'sealed'` -- correctly, because it is: the
 * perimeter really is closed, and the way in is a gated crossing that only
 * navigation can see (`buildNavigationGraph` reads `DoorRegistry` before it
 * reads the edge value). So a `'sealed'` answer no longer implies "no way in",
 * and an `'open'` one still means exactly what it says: an edge on the
 * perimeter holds nothing at all.
 *
 * ## Determinism
 *
 * A pure read of the two edge layers in a fixed order -- north row west to
 * east, then south row, then west column north to south, then east column --
 * so the gap it names is a function of the rectangle and not of the loop. It
 * materialises nothing: `SparseWorld.getTopEdge`/`getLeftEdge` answer `0` for
 * a chunk that does not exist, unlike `setZoning`, which would grow the world.
 * Work is bounded by the perimeter, `2 * (width + height)` edge reads.
 */

/** A rectangle of tiles, in the shape `ZoneRoomRequest` states one. */
export interface TileRectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * `'sealed'` -- every perimeter edge holds edge geometry.
 * `'open'` -- at least one does not.
 */
export type RoomEnclosure = 'sealed' | 'open';

/**
 * Which edge of which tile the world stores a gap at.
 *
 * `'north'` and `'west'` only, because those are the two the world keeps a
 * slot for: a gap on the rectangle's *south* boundary is the north edge of the
 * tile below it, and one on its east boundary is the west edge of the tile to
 * its right. The same rule `src/rendering/build/edge-picking.ts` applies to a
 * pointer, and the same vocabulary `BUILD_EDGES` uses.
 */
export interface RoomEnclosureGap {
  readonly tile: TilePosition;
  readonly edge: 'north' | 'west';
}

export interface RoomEnclosureResult {
  readonly enclosure: RoomEnclosure;
  /** The first gap in the canonical perimeter order; absent when `enclosure` is `'sealed'`. */
  readonly gap?: RoomEnclosureGap;
}

/**
 * Evaluates the perimeter of `rectangle` against the world's edge layers.
 *
 * A rectangle with a non-positive dimension has no perimeter to check and is
 * reported `'open'` with no gap: it is not a shape that could enclose
 * anything, and the caller has already refused it as an invalid area.
 */
export function roomPerimeterEnclosure(world: SparseWorld, rectangle: TileRectangle): RoomEnclosureResult {
  if (rectangle.width < 1 || rectangle.height < 1) return { enclosure: 'open' };

  const left = rectangle.x;
  const top = rectangle.y;
  const right = rectangle.x + rectangle.width - 1;
  const bottom = rectangle.y + rectangle.height - 1;

  for (let x = left; x <= right; x += 1) {
    // The rectangle's top boundary: this tile's own north edge.
    if (world.getTopEdge(tile(x, top)) === 0) {
      return { enclosure: 'open', gap: { tile: tile(x, top), edge: 'north' } };
    }
  }
  for (let x = left; x <= right; x += 1) {
    // Its bottom boundary: the north edge of the row below it.
    if (world.getTopEdge(tile(x, bottom + 1)) === 0) {
      return { enclosure: 'open', gap: { tile: tile(x, bottom + 1), edge: 'north' } };
    }
  }
  for (let y = top; y <= bottom; y += 1) {
    if (world.getLeftEdge(tile(left, y)) === 0) {
      return { enclosure: 'open', gap: { tile: tile(left, y), edge: 'west' } };
    }
  }
  for (let y = top; y <= bottom; y += 1) {
    // Its east boundary: the west edge of the column to its right.
    if (world.getLeftEdge(tile(right + 1, y)) === 0) {
      return { enclosure: 'open', gap: { tile: tile(right + 1, y), edge: 'west' } };
    }
  }

  return { enclosure: 'sealed' };
}

function tile(x: number, y: number): TilePosition {
  return { x: tileCoordinate(x), y: tileCoordinate(y) };
}
