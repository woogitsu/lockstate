import type { ChunkState, SparseWorld } from '../world/sparse-world';
import {
  compareChunkPositions,
  tileCoordinate,
  tileKey,
  type ChunkPosition,
  type TilePosition,
} from '../world/coordinates';
import { type DoorSide, DoorRegistry } from './door';

export type RegionId = number;

/**
 * A door edge connecting two regions. `regionA`/`regionB` may be equal if
 * the door happens to connect a region to itself (e.g. two doors between
 * the same two rooms); each is still a distinct traversal option since
 * their cost/permission state can differ independently.
 */
export interface Portal {
  readonly doorId: string;
  readonly regionA: RegionId;
  readonly regionB: RegionId;
  readonly tileA: TilePosition;
  readonly tileB: TilePosition;
}

export interface NavigationGraph {
  readonly tileToRegion: ReadonlyMap<string, RegionId>;
  readonly regionTiles: ReadonlyMap<RegionId, readonly TilePosition[]>;
  readonly portals: readonly Portal[];
  /** Portals touching a region on either side. */
  readonly regionPortals: ReadonlyMap<RegionId, readonly Portal[]>;
  /**
   * The chunk positions this graph was built over, in `compareChunkPositions`
   * order, and the tile side of one chunk.
   *
   * Published because the loaded *area's* own frontier is a question about
   * this graph rather than about the world: `SparseWorld` answers `0` for an
   * edge in a chunk that does not exist, so "open ground" and "outside the
   * materialised world" are the same read there, and only the set of chunks a
   * graph covers says which tiles sit on its boundary. ADR 0108's exterior
   * anchor is the consumer (`src/simulation/rooms/reachability.ts`), and it
   * needs the boundary ring in `O(chunks x side)` rather than by scanning
   * every tile in `tileToRegion` for a missing neighbour.
   *
   * The same list `computeGeometrySignature` fingerprints, so a graph's
   * staleness and its frontier are derived from one set of chunks and cannot
   * describe two different areas.
   */
  readonly loadedChunks: readonly ChunkPosition[];
  /** `SparseWorld.tileChunkSize` at build time; see `loadedChunks`. */
  readonly tileChunkSize: number;
  /** Fingerprint of the geometry revisions used to build this graph; see `isNavigationGraphStale`. */
  readonly geometrySignature: string;
  /** `DoorRegistry.structuralRevision` at build time -- doors *added* affect topology; lock/permission changes alone do not. */
  readonly doorStructuralRevision: number;
}

export interface ResolvedEdge {
  readonly wallValue: number;
  readonly ownerTile: TilePosition;
  readonly side: DoorSide;
}

export function resolveEdge(world: SparseWorld, a: TilePosition, b: TilePosition): ResolvedEdge {
  if (b.x === a.x + 1 && b.y === a.y) return { wallValue: world.getLeftEdge(b), ownerTile: b, side: 'left' };
  if (b.x === a.x - 1 && b.y === a.y) return { wallValue: world.getLeftEdge(a), ownerTile: a, side: 'left' };
  if (b.y === a.y + 1 && b.x === a.x) return { wallValue: world.getTopEdge(b), ownerTile: b, side: 'top' };
  if (b.y === a.y - 1 && b.x === a.x) return { wallValue: world.getTopEdge(a), ownerTile: a, side: 'top' };
  throw new RangeError('Tiles are not orthogonally adjacent.');
}

export function neighbors(tile: TilePosition): readonly TilePosition[] {
  return [
    { x: tileCoordinate(tile.x + 1), y: tile.y },
    { x: tileCoordinate(tile.x - 1), y: tile.y },
    { x: tile.x, y: tileCoordinate(tile.y + 1) },
    { x: tile.x, y: tileCoordinate(tile.y - 1) },
  ];
}

function computeGeometrySignature(chunks: readonly ChunkState[]): string {
  return chunks
    .map((chunk) => `${chunk.position.x},${chunk.position.y}:${chunk.geometryRevision}`)
    .sort()
    .join('|');
}

/**
 * Builds the region/portal graph over the given (already-loaded) chunks.
 * A region is a maximal set of tiles connected by plain open boundaries
 * (no wall, no door). A door -- regardless of its current lock state --
 * always separates two regions and is recorded as a `Portal`; permission
 * checks happen later, at traversal time (see route-context.ts), not by
 * pre-filtering the graph. Mirrors `TopologyManager.update`'s convention
 * of taking chunks from the caller rather than enumerating them itself,
 * since `SparseWorld` exposes no such enumeration.
 */
export function buildNavigationGraph(
  world: SparseWorld,
  doors: DoorRegistry,
  chunks: Iterable<ChunkState>,
): NavigationGraph {
  const loadedChunks = [...chunks]
    .filter((chunk) => chunk.lifecycle === 'loaded')
    .sort((a, b) => compareChunkPositions(a.position, b.position));

  const size = world.tileChunkSize;
  const tiles: TilePosition[] = [];
  const tileSet = new Set<string>();
  for (const chunk of loadedChunks) {
    for (let ly = 0; ly < size; ly += 1) {
      for (let lx = 0; lx < size; lx += 1) {
        const tile: TilePosition = {
          x: tileCoordinate(chunk.position.x * size + lx),
          y: tileCoordinate(chunk.position.y * size + ly),
        };
        tiles.push(tile);
        tileSet.add(tileKey(tile));
      }
    }
  }

  const tileToRegion = new Map<string, RegionId>();
  const regionTileLists = new Map<RegionId, TilePosition[]>();
  let nextRegionId: RegionId = 1;

  for (const start of tiles) {
    if (tileToRegion.has(tileKey(start))) continue;

    const regionId = nextRegionId;
    nextRegionId += 1;
    const regionTiles: TilePosition[] = [];
    const stack: TilePosition[] = [start];
    tileToRegion.set(tileKey(start), regionId);

    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined) break;
      regionTiles.push(current);

      for (const neighbor of neighbors(current)) {
        const neighborKey = tileKey(neighbor);
        if (!tileSet.has(neighborKey) || tileToRegion.has(neighborKey)) continue;

        const edge = resolveEdge(world, current, neighbor);
        if (doors.getByEdge(edge.ownerTile, edge.side) !== undefined) continue; // door: always a region boundary
        if (edge.wallValue !== 0) continue; // solid wall: no portal, no connectivity

        tileToRegion.set(neighborKey, regionId);
        stack.push(neighbor);
      }
    }

    regionTileLists.set(regionId, regionTiles);
  }

  const portals: Portal[] = [];
  const seenDoorIds = new Set<string>();
  for (const tile of tiles) {
    for (const neighbor of neighbors(tile)) {
      if (!tileSet.has(tileKey(neighbor))) continue;
      const edge = resolveEdge(world, tile, neighbor);
      const door = doors.getByEdge(edge.ownerTile, edge.side);
      if (door === undefined || seenDoorIds.has(door.id)) continue;
      seenDoorIds.add(door.id);

      const regionA = tileToRegion.get(tileKey(tile));
      const regionB = tileToRegion.get(tileKey(neighbor));
      if (regionA === undefined || regionB === undefined) continue; // both sides must be navigable tiles
      portals.push({ doorId: door.id, regionA, regionB, tileA: tile, tileB: neighbor });
    }
  }
  // Code-unit ordering, never `localeCompare`: collation is locale- and
  // ICU-dependent, so the same door ids can sort differently on two clients
  // (or two Node builds). Portal order decides which portal the router and
  // the flow-field builder expand first among equals, so a locale-dependent
  // sort here is a locale-dependent route -- exactly the ambient input
  // docs/DETERMINISM.md forbids. See
  // `tests/determinism/ambient-nondeterminism-contract.test.ts`.
  portals.sort((a, b) => (a.doorId < b.doorId ? -1 : a.doorId > b.doorId ? 1 : 0));

  const regionPortals = new Map<RegionId, Portal[]>();
  for (const portal of portals) {
    for (const regionId of new Set([portal.regionA, portal.regionB])) {
      const list = regionPortals.get(regionId) ?? [];
      list.push(portal);
      regionPortals.set(regionId, list);
    }
  }

  return {
    tileToRegion,
    regionTiles: regionTileLists,
    portals,
    regionPortals,
    loadedChunks: loadedChunks.map((chunk) => chunk.position),
    tileChunkSize: size,
    geometrySignature: computeGeometrySignature(loadedChunks),
    doorStructuralRevision: doors.structuralRevision,
  };
}

export function isNavigationGraphStale(
  graph: NavigationGraph,
  doors: DoorRegistry,
  chunks: Iterable<ChunkState>,
): boolean {
  if (graph.doorStructuralRevision !== doors.structuralRevision) return true;
  return currentGeometrySignature(chunks) !== graph.geometrySignature;
}

/**
 * The `geometrySignature` a graph built over `chunks` now would carry, without
 * building one -- the loaded chunks' geometry revisions, exactly as
 * `buildNavigationGraph` and `isNavigationGraphStale` compute it.
 *
 * Exported for the save (ADR 0007's 2026-09-23 amendment): a capture reads it
 * to tell a cache entry the next read would still answer from one it would
 * delete, and must not rebuild the graph to find out, because a capture has no
 * business changing when the graph is rebuilt.
 */
export function currentGeometrySignature(chunks: Iterable<ChunkState>): string {
  return computeGeometrySignature([...chunks].filter((chunk) => chunk.lifecycle === 'loaded'));
}
