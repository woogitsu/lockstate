import type { SparseWorld } from '../world/sparse-world';
import { tileKey, type TilePosition } from '../world/coordinates';
import { DoorRegistry } from './door';
import { neighbors, resolveEdge, type NavigationGraph, type RegionId } from './region-graph';
import { doorTraversalCost } from './route-context';

export interface LocalSearchOptions {
  /** Bounds the search to tiles in these regions -- "bounded", never a full-map search. */
  readonly allowedRegions: ReadonlySet<RegionId>;
  /** Doors already permission-checked by the caller (see router.ts); any other door is treated as impassable here. */
  readonly allowedDoorIds: ReadonlySet<string>;
}

/**
 * Optional, purely additive work-unit counter for issue #22's per-tick
 * budget. A tile "expansion" is one tile dequeued from `open` and having
 * its neighbors examined. Passing no `SearchStats` costs nothing and
 * changes no return value.
 */
export interface SearchStats {
  expansions: number;
}

export interface LocalSearchResult {
  readonly waypoints: readonly TilePosition[]; // origin..destination inclusive
  readonly cost: number;
}

interface StepResult {
  readonly allowed: boolean;
  readonly cost: number;
}

function canStep(
  world: SparseWorld,
  doors: DoorRegistry,
  graph: NavigationGraph,
  current: TilePosition,
  neighbor: TilePosition,
  options: LocalSearchOptions,
): StepResult {
  const neighborRegion = graph.tileToRegion.get(tileKey(neighbor));
  if (neighborRegion === undefined || !options.allowedRegions.has(neighborRegion)) {
    return { allowed: false, cost: 0 };
  }

  // Region membership alone does not imply the *direct* edge between two
  // adjacent tiles is open -- a region can wrap around an internal wall
  // segment -- so passability is re-derived per edge here, using the same
  // door-first rule buildNavigationGraph used to decide connectivity.
  const edge = resolveEdge(world, current, neighbor);
  const door = doors.getByEdge(edge.ownerTile, edge.side);
  if (door !== undefined) {
    if (!options.allowedDoorIds.has(door.id)) return { allowed: false, cost: 0 };
    return { allowed: true, cost: doorTraversalCost(door) };
  }
  if (edge.wallValue !== 0) return { allowed: false, cost: 0 };
  return { allowed: true, cost: 1 };
}

function heuristic(tile: TilePosition, destination: TilePosition): number {
  return Math.abs(tile.x - destination.x) + Math.abs(tile.y - destination.y);
}

/**
 * A* bounded to `options.allowedRegions`/`options.allowedDoorIds` -- never
 * an unbounded full-map search. Ties (equal f-score) break on the tile's
 * canonical string key so identical inputs always produce the identical
 * route, required for deterministic replay.
 */
export function boundedLocalSearch(
  world: SparseWorld,
  doors: DoorRegistry,
  graph: NavigationGraph,
  origin: TilePosition,
  destination: TilePosition,
  options: LocalSearchOptions,
  stats?: SearchStats,
): LocalSearchResult | undefined {
  const originKey = tileKey(origin);
  const destinationKey = tileKey(destination);
  const originRegion = graph.tileToRegion.get(originKey);
  const destinationRegion = graph.tileToRegion.get(destinationKey);
  if (originRegion === undefined || destinationRegion === undefined) return undefined;
  if (!options.allowedRegions.has(originRegion) || !options.allowedRegions.has(destinationRegion)) return undefined;

  const gScore = new Map<string, number>([[originKey, 0]]);
  const cameFrom = new Map<string, TilePosition>();
  const open = new Map<string, TilePosition>([[originKey, origin]]);
  const closed = new Set<string>();

  while (open.size > 0) {
    let currentKey: string | undefined;
    let currentTile: TilePosition | undefined;
    let bestF = Number.POSITIVE_INFINITY;

    for (const [key, tile] of open) {
      const f = (gScore.get(key) ?? Number.POSITIVE_INFINITY) + heuristic(tile, destination);
      if (f < bestF || (f === bestF && (currentKey === undefined || key < currentKey))) {
        bestF = f;
        currentKey = key;
        currentTile = tile;
      }
    }
    if (currentKey === undefined || currentTile === undefined) break;
    if (stats !== undefined) stats.expansions += 1;

    if (currentKey === destinationKey) {
      const waypoints: TilePosition[] = [currentTile];
      let cursorKey = currentKey;
      let cursorTile = currentTile;
      while (cameFrom.has(cursorKey)) {
        const previous = cameFrom.get(cursorKey);
        if (previous === undefined) break;
        waypoints.push(previous);
        cursorTile = previous;
        cursorKey = tileKey(cursorTile);
      }
      waypoints.reverse();
      return { waypoints, cost: gScore.get(currentKey) ?? 0 };
    }

    open.delete(currentKey);
    closed.add(currentKey);
    const currentG = gScore.get(currentKey) ?? Number.POSITIVE_INFINITY;

    for (const neighbor of neighbors(currentTile)) {
      const neighborKey = tileKey(neighbor);
      if (closed.has(neighborKey)) continue;

      const step = canStep(world, doors, graph, currentTile, neighbor, options);
      if (!step.allowed) continue;

      const tentativeG = currentG + step.cost;
      if (tentativeG < (gScore.get(neighborKey) ?? Number.POSITIVE_INFINITY)) {
        cameFrom.set(neighborKey, currentTile);
        gScore.set(neighborKey, tentativeG);
        open.set(neighborKey, neighbor);
      }
    }
  }

  return undefined;
}
