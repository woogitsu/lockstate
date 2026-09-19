import { tileCoordinate, tileKey, type TilePosition } from '../world/coordinates';
import { roomPerimeterEnclosure, roomPerimeterHoldsDoor, type RoomDoorReader, type RoomEdgeReader, type TileRectangle } from './enclosure';

/**
 * Whether anybody can get into a room, and how it fails when they cannot
 * (ADR 0108, issue #1006).
 *
 * ## What this answers that `enclosure.ts` cannot
 *
 * `roomPerimeterEnclosure` and `roomPerimeterHoldsDoor` beside it answer about
 * **one rectangle's own frontier**, and that module's own docblock states the
 * asymmetry this one exists to close: *"`'doorway'` ... says the boundary is
 * crossable, not that anybody can get **to** it: the door may open onto a
 * corridor that is itself sealed. That is a region question --
 * `buildNavigationGraph`'s."* This is that region question, asked of the graph
 * navigation already builds for routing, so the hand-off is one the other
 * module wrote rather than one invented here.
 *
 * ## The exterior, which is the one real design choice
 *
 * Reachability needs an anchor -- reachable *from where* -- and this world has
 * no spawn point to use (`originTile` is chosen by the player per admission
 * and retained nowhere), no actor position that could serve (#1006's own
 * screenshot has the prisoners stacked *inside* the dead cell) and no world
 * edge (`SparseWorld.getTopEdge` answers `0` for a chunk that does not exist,
 * so unmaterialised space reads as open ground). ADR 0108 decision 1 chose the
 * **exterior of the loaded chunk area**, and this module ships a repaired
 * version of that rule, in two parts:
 *
 * 1. **A region is exterior when it holds a tile on the loaded area's boundary
 *    ring with an open crossing out of it** -- the edge between that tile and
 *    its missing neighbour holds no geometry, or holds a registered door.
 * 2. **When no region does**, the player has walled the loaded area flush at
 *    its own boundary and there is no "out of it" left to escape to. The
 *    exterior is then the ADR's own rule: the regions holding a ring tile that
 *    is **not inside a zoned room's rectangle.**
 *
 * ## Why not the ADR's rule alone, which is a refutation and not a preference
 *
 * Decision 1 is the ring-minus-room-rectangles rule with no crossing test, and
 * `tests/research/0108-exterior-anchor-falsifier.research.ts` -- the falsifier
 * the ADR named in its own weakest-claim section and declined to run -- defeats
 * it. A 3x3 shed walled on all four sides in the corner of the loaded area is
 * not a zoned room, so nothing excludes its interior from the ring; its tiles
 * seed the exterior (seed set `1, 2, 3` against the correct `2`) and the portal
 * walk then vouches, through the shed's own door, for a room nothing can reach.
 * **Wrong in the reassuring direction**, which is the direction #1006 is about.
 * Part 1 above repairs it: the shed's own walls sit on the tiles' outward
 * edges, so it has no crossing out of the loaded area and never seeds anything.
 *
 * Part 1 alone is not enough either, and that is measured in the same file: a
 * prison whose perimeter wall runs flush along the loaded area's boundary has
 * no crossing anywhere, seeds nothing, and reports **every room unreachable at
 * once**. Part 2 is the smallest thing that answers it, and it is exactly the
 * ADR's rule -- so both of decision 1's clauses survive where they are
 * load-bearing.
 *
 * ## Two states neither part answers, stated rather than left to be found
 *
 * Both are the loaded frontier being open ground to the edge layers and a wall
 * to the region graph, which `enclosure.ts:44-50` already records as a rule
 * nobody has written (*"a region that reaches the edge of the materialised
 * world is indistinguishable from one bounded by walls there"*) and ADR 0108
 * files as its open question 5:
 *
 * - A corner structure that **leans on the loaded area's edge** for some of its
 *   walls has a crossing out of the area at every unwalled tile, so it seeds
 *   the exterior and vouches for what is behind it. Under the world model it is
 *   not sealed by anything; under this session's fixed chunk set nothing can
 *   route there. Both readings are defensible and this module takes the first.
 * - A **flush-walled loaded area with a sealed shed in the corner** falls to
 *   part 2 and the shed seeds the exterior again. Any rule that answers a flush
 *   wall by relaxing the loaded-area boundary relaxes it for the shed's walls
 *   too; the two cannot be separated by a seed rule.
 *
 * Scored as S3 and S7 in the falsifier file, which prints them rather than
 * asserting them away.
 *
 * ## Determinism
 *
 * The answer is a `Set` of region ids, and set membership has no order -- which
 * portal is expanded first cannot change which regions end up in it. The seeds
 * are canonical anyway: the ring is walked in `loadedChunks` order (which
 * `buildNavigationGraph` sorts by `compareChunkPositions`) and then west-to-east
 * within each chunk row, so the seed *sequence* is a function of the loaded area
 * rather than of any map's insertion order. No identifier is minted here and no
 * region id is persisted or compared across a save boundary: under ADR 0012 a
 * region id is a category-2 derived value, and the `Set` is built and discarded
 * inside one projection call.
 *
 * ## Cost, and why there is no cache
 *
 * One ring walk of `O(chunks x tileChunkSize)` boundary tiles, one transitive
 * portal walk of `O(regions + portals)`, then `O(width x height)` tile lookups
 * per room with an early exit on the first reached tile. Measured against the
 * edge scan it replaces in `tests/perf/room-access-reachability.perf.ts`.
 *
 * **No cache, and that is the design rather than an omission.** A cached answer
 * would need its own invalidation, and there would then be two to keep complete.
 * This reads `NavigationGraph`, which `NavigationSystem.update` already rebuilds
 * whenever `isNavigationGraphStale` sees the door registry's `structuralRevision`
 * or the loaded chunks' `geometrySignature` move -- and both edge setters in
 * `SparseWorld` call `markGeometryChanged`, so every wall and every door a player
 * places already invalidates it. Routing depends on that invalidation today; if
 * it were incomplete, routes would already be wrong.
 */

/** A region id as `buildNavigationGraph` mints them. Local rather than imported, for the reason `RoomRegionReader` gives. */
export type RoomRegionId = number;

/** The one thing this module needs to know about a portal: which two regions it joins. */
export interface RoomRegionPortal {
  readonly regionA: RoomRegionId;
  readonly regionB: RoomRegionId;
}

/**
 * The reads this module needs from a navigation graph, named as a port for the
 * reason `RoomEdgeReader` is one (issue #493).
 *
 * `NavigationGraph` satisfies it structurally and the worker passes one. It is
 * a port rather than that type so `src/simulation/rooms/` does not take a
 * dependency on `src/simulation/navigation/` for four fields -- and so the
 * fields this module actually reads are stated, rather than a reader having to
 * infer them from a nine-field interface.
 */
export interface RoomRegionReader {
  readonly tileToRegion: ReadonlyMap<string, RoomRegionId>;
  readonly regionPortals: ReadonlyMap<RoomRegionId, readonly RoomRegionPortal[]>;
  /** The chunk positions the graph covers; see `NavigationGraph.loadedChunks`. */
  readonly loadedChunks: readonly { readonly x: number; readonly y: number }[];
  readonly tileChunkSize: number;
}

/**
 * A holder of the current graph, for a caller that reads it on its own cadence
 * rather than being handed one.
 *
 * `NavigationSystem` satisfies it structurally, and the distinction matters for
 * a tick system: `getGraph()` calls `ensureGraph()`, which **rebuilds when
 * `isNavigationGraphStale` says so** rather than returning whatever the last
 * `update()` left behind. So a system ordered before `navigation`'s 150 still
 * reads a graph current for its own tick, and ADR 0108's open question 3 --
 * *"reading the graph there means reading the one built on the previous tick"*
 * -- does not arise. Checked in `navigation-system.ts`, not assumed.
 */
export interface RoomRegionGraphSource {
  getGraph(): RoomRegionReader;
}

/**
 * Whether anything can cross a room's boundary, and whether anything can get
 * to the crossing (ADR 0108 decision 3).
 *
 * - `'gap'` -- at least one perimeter edge holds nothing, so a walk in one of
 *   the four directions crosses it. Unchanged from what it has always meant,
 *   and `RoomZoningService.zone` still refuses it for an `enclosed` room type.
 * - `'no-way-in'` -- every perimeter edge holds geometry and none of them
 *   carries a registered door. **Unchanged, and deliberately not widened**: a
 *   room with no door and a room whose door is sealed off from outside want
 *   different repairs, and telling somebody to build a door they already have
 *   is the same false sentence #1006 is about, pointed the other way.
 * - `'doorway'` -- a registered door on the perimeter **and** a tile of this
 *   room lies in a region the exterior walk reached. **Narrowed**: it used to
 *   mean only that the boundary was crossable.
 * - `'unreachable'` -- a registered door on the perimeter and **nothing can
 *   reach it**. The state #1001 measured at 11,558 route failures and 2,000 a
 *   day of lost income, which this readout was silent about before ADR 0108.
 *
 * **`'gap'` is decided before reachability and therefore promises nothing about
 * it.** A rectangle open on one side, inside a sealed structure, still reads
 * `'gap'`: the enclosure question is asked first and answers on its own terms
 * (decision 3 leaves `'gap'` unchanged). So a consumer must not read "not
 * `'no-way-in'` and not `'unreachable'`" as "somebody can get in" -- only
 * `'doorway'` says that.
 */
export type RoomAccess = 'gap' | 'doorway' | 'unreachable' | 'no-way-in';

/**
 * The exterior walk's answer, prepared once and asked once per room.
 *
 * A prepared object rather than a free function taking four more arguments,
 * because the seed walk is per *projection* and the lookup is per *room*: a
 * function that recomputed the exterior for each of several hundred rooms would
 * turn one `O(regions + portals)` walk into several hundred of them, which is
 * the cost ADR 0108's whole case is about.
 */
export interface RoomReachability {
  /** Whether any tile of `rectangle` lies in a region the exterior walk reached. */
  reaches(rectangle: TileRectangle): boolean;
}

function tileAt(x: number, y: number): TilePosition {
  return { x: tileCoordinate(x), y: tileCoordinate(y) };
}

/**
 * `tileKey`'s string for a pair of plain numbers, without minting a
 * `TilePosition` to hand it.
 *
 * **Measured, not assumed.** `tileToRegion` is keyed by string, and the two
 * loops below probe it once per room tile and four times per ring candidate.
 * Going through `tileAt` costs an object allocation and two `tileCoordinate`
 * calls per probe, and at 5,440 rooms over 64 chunks that was the difference
 * between the marginal walk costing more than the edge scan it replaces and
 * costing less. It must agree with `tileKey` exactly, which
 * `tests/unit/rooms-reachability.test.ts` holds by using real graphs
 * throughout: a key built differently here would simply never match.
 */
function keyAt(x: number, y: number): string {
  return `${String(x)},${String(y)}`;
}

/**
 * Whether `position` has an open crossing to a tile outside the loaded area.
 *
 * A registered door counts, for `buildNavigationGraph`'s own reason: a portal is
 * recorded for a door *"regardless of its current lock state"*, because
 * permission is a traversal-time question and not a topology one.
 */
function opensOutOfLoadedArea(
  world: RoomEdgeReader,
  doors: RoomDoorReader,
  regions: RoomRegionReader,
  position: TilePosition,
): boolean {
  const { x, y } = position;

  // The same edge vocabulary `resolveEdge` uses, written out rather than
  // imported: a tile's east boundary is its neighbour's west edge, and its
  // south boundary is the north edge of the row below. The `has` probe comes
  // first in each pair so a tile with every neighbour loaded -- which is most
  // of them -- never materialises a `TilePosition` at all.
  if (!regions.tileToRegion.has(keyAt(x + 1, y))) {
    const east = tileAt(x + 1, y);
    if (world.getLeftEdge(east) === 0 || doors.getByEdge(east, 'left') !== undefined) return true;
  }
  if (!regions.tileToRegion.has(keyAt(x - 1, y))) {
    if (world.getLeftEdge(position) === 0 || doors.getByEdge(position, 'left') !== undefined) return true;
  }
  if (!regions.tileToRegion.has(keyAt(x, y + 1))) {
    const south = tileAt(x, y + 1);
    if (world.getTopEdge(south) === 0 || doors.getByEdge(south, 'top') !== undefined) return true;
  }
  if (!regions.tileToRegion.has(keyAt(x, y - 1))) {
    if (world.getTopEdge(position) === 0 || doors.getByEdge(position, 'top') !== undefined) return true;
  }
  return false;
}

function containsTile(rectangle: TileRectangle, position: TilePosition): boolean {
  return (
    position.x >= rectangle.x &&
    position.x < rectangle.x + rectangle.width &&
    position.y >= rectangle.y &&
    position.y < rectangle.y + rectangle.height
  );
}

/**
 * Every tile on the loaded area's boundary ring, in canonical order.
 *
 * Derived from `loadedChunks` rather than by scanning `tileToRegion` for a tile
 * with a missing neighbour: the scan is `O(loaded tiles)` with four map probes
 * each, and only a tile on its own chunk's border can be on the area's border
 * at all. A chunk whose four neighbours are all loaded contributes nothing, so
 * an interior chunk costs one pass over its own edge rather than over its area.
 */
function ringTiles(regions: RoomRegionReader): readonly TilePosition[] {
  const size = regions.tileChunkSize;
  const loaded = new Set<string>();
  for (const chunk of regions.loadedChunks) loaded.add(keyAt(chunk.x, chunk.y));

  const ring: TilePosition[] = [];
  const seen = new Set<string>();
  for (const chunk of regions.loadedChunks) {
    // A chunk with all four orthogonal neighbours loaded contributes nothing:
    // a tile's neighbours are orthogonal only, so every tile in it has every
    // neighbour inside the loaded area. Skipping it here is what makes this
    // walk cost the loaded area's *perimeter* rather than its chunk count --
    // measured, since enumerating interior chunks' borders anyway was most of
    // the exterior walk's cost at 64 chunks.
    if (
      loaded.has(keyAt(chunk.x + 1, chunk.y)) &&
      loaded.has(keyAt(chunk.x - 1, chunk.y)) &&
      loaded.has(keyAt(chunk.x, chunk.y + 1)) &&
      loaded.has(keyAt(chunk.x, chunk.y - 1))
    ) {
      continue;
    }

    const originX = chunk.x * size;
    const originY = chunk.y * size;
    for (let local = 0; local < size; local += 1) {
      const candidates = [
        tileAt(originX + local, originY),
        tileAt(originX + local, originY + size - 1),
        tileAt(originX, originY + local),
        tileAt(originX + size - 1, originY + local),
      ];
      for (const candidate of candidates) {
        const key = tileKey(candidate);
        if (seen.has(key) || !regions.tileToRegion.has(key)) continue;
        const { x, y } = candidate;
        const hasMissingNeighbour =
          !regions.tileToRegion.has(keyAt(x + 1, y)) ||
          !regions.tileToRegion.has(keyAt(x - 1, y)) ||
          !regions.tileToRegion.has(keyAt(x, y + 1)) ||
          !regions.tileToRegion.has(keyAt(x, y - 1));
        if (!hasMissingNeighbour) continue;
        seen.add(key);
        ring.push(candidate);
      }
    }
  }
  return ring;
}

/**
 * The regions the exterior walk starts from -- the two-part rule this module's
 * header states, part 2 evaluated only when part 1 finds nothing.
 *
 * `zonedRooms` is a thunk because part 2 is the rare branch: a prison whose
 * loaded area has any opening at all never needs the room rectangles, and
 * `projectRoomDetail` would otherwise have to enumerate every room instance to
 * answer about one.
 */
export function exteriorSeedRegions(
  world: RoomEdgeReader,
  doors: RoomDoorReader,
  regions: RoomRegionReader,
  zonedRooms: () => Iterable<TileRectangle>,
): ReadonlySet<RoomRegionId> {
  const ring = ringTiles(regions);

  const escaping = new Set<RoomRegionId>();
  for (const position of ring) {
    if (!opensOutOfLoadedArea(world, doors, regions, position)) continue;
    const region = regions.tileToRegion.get(tileKey(position));
    if (region !== undefined) escaping.add(region);
  }
  if (escaping.size > 0) return escaping;

  const rectangles = [...zonedRooms()];
  const fallback = new Set<RoomRegionId>();
  for (const position of ring) {
    if (rectangles.some((rectangle) => containsTile(rectangle, position))) continue;
    const region = regions.tileToRegion.get(tileKey(position));
    if (region !== undefined) fallback.add(region);
  }
  return fallback;
}

/** Every region joined to a seed by a chain of portals. A door is a portal whatever its lock state. */
function walkPortals(regions: RoomRegionReader, seeds: ReadonlySet<RoomRegionId>): ReadonlySet<RoomRegionId> {
  const reached = new Set<RoomRegionId>(seeds);
  const pending = [...seeds].sort((left, right) => left - right);
  while (pending.length > 0) {
    const region = pending.pop();
    if (region === undefined) break;
    for (const portal of regions.regionPortals.get(region) ?? []) {
      for (const side of [portal.regionA, portal.regionB]) {
        if (reached.has(side)) continue;
        reached.add(side);
        pending.push(side);
      }
    }
  }
  return reached;
}

/**
 * Prepares the exterior walk for a projection pass.
 *
 * **Lazily**, on the first `reaches` call: a projection whose rooms all carry a
 * `'gap'` or `'no-way-in'` verdict never asks the question, and a caller that
 * supplied a perimeter for a prison with no rooms at all should not pay for a
 * portal walk nobody reads.
 */
export function roomReachability(
  world: RoomEdgeReader,
  doors: RoomDoorReader,
  regions: RoomRegionReader,
  zonedRooms: () => Iterable<TileRectangle>,
): RoomReachability {
  let reachedRegions: ReadonlySet<RoomRegionId> | undefined;

  return {
    reaches(rectangle: TileRectangle): boolean {
      if (rectangle.width < 1 || rectangle.height < 1) return false;
      reachedRegions ??= walkPortals(regions, exteriorSeedRegions(world, doors, regions, zonedRooms));
      if (reachedRegions.size === 0) return false;

      for (let y = rectangle.y; y < rectangle.y + rectangle.height; y += 1) {
        for (let x = rectangle.x; x < rectangle.x + rectangle.width; x += 1) {
          const region = regions.tileToRegion.get(keyAt(x, y));
          if (region !== undefined && reachedRegions.has(region)) return true;
        }
      }
      return false;
    },
  };
}

/**
 * Whether anybody can get into `rectangle`, and how it fails when they cannot.
 *
 * ## The three questions in order, and why that order
 *
 * Enclosure first, from `roomPerimeterEnclosure`, so there is exactly one
 * definition of "every perimeter edge holds geometry" and a rectangle it calls
 * `'open'` is `'gap'` here with no door read and no region walk at all. That one
 * must stay first: `'gap'` is a fact about the boundary and says nothing about
 * what is beyond it, so a rectangle open on one side is `'gap'` whether or not
 * anybody can reach it.
 *
 * **Then reachability, and the door read only for a room nothing reached.** The
 * door read is up to `2 * (width + height)` registry lookups and it is skipped
 * for every room somebody can get into -- which in a prison that is working is
 * nearly all of them. It is sound to skip, and the proof is short:
 *
 * > A sealed rectangle's interior regions are confined to it.
 * > `roomPerimeterEnclosure` answering `'sealed'` means every perimeter edge
 * > holds geometry, and `buildNavigationGraph`'s flood fill crosses an edge only
 * > when the edge value is `0` **and** no door is registered on it -- so it can
 * > cross no perimeter edge, in either direction. Therefore the exterior walk
 * > can only have reached an interior tile through a chain of portals whose last
 * > hop crosses a perimeter edge, and a portal **is** a registered door.
 * > Reachable and sealed entails a door on the perimeter, so reading the
 * > registry to confirm it asks a question whose answer is already known.
 *
 * **`'no-way-in'` still means what it always meant**, which is what this
 * ordering has to protect: a doorless sealed room cannot be reached (the same
 * proof, contrapositive), so it falls past the reachability test to the door
 * read, finds nothing, and is `'no-way-in'` rather than `'unreachable'`. The
 * panel goes on telling that player to build a door rather than to take down a
 * wall somewhere else.
 *
 * **What this costs, stated because it is a real trade.** `'doorway'` is no
 * longer backed by an independent door read; it rests on the graph. That is not
 * the loss of a cross-check -- the graph is built from the same `DoorRegistry`
 * the read would have consulted, so the two were never independent -- but it
 * does mean a caller handing over a **stale** graph would get `'doorway'` for a
 * room whose door has since gone. No caller can:
 * `NavigationSystem.getGraph()` rebuilds a stale graph on the spot, which is
 * what `RoomRegionGraphSource` exists to state.
 */
export function roomAccess(
  world: RoomEdgeReader,
  doors: RoomDoorReader,
  reachability: RoomReachability,
  rectangle: TileRectangle,
): RoomAccess {
  if (roomPerimeterEnclosure(world, rectangle).enclosure === 'open') return 'gap';
  if (reachability.reaches(rectangle)) return 'doorway';
  return roomPerimeterHoldsDoor(doors, rectangle) ? 'unreachable' : 'no-way-in';
}
