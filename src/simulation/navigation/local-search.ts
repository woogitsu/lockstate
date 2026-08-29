import type { SparseWorld } from '../world/sparse-world';
import { tileKey, type TilePosition } from '../world/coordinates';
import { DoorRegistry } from './door';
import { FrontierHeap } from './frontier-heap';
import { neighbors, type NavigationGraph, type RegionId } from './region-graph';
import { doorTraversalCost } from './route-context';
import { edgeStanding } from './traversal';

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

/**
 * What it costs to cross a plain open boundary between two adjacent tiles,
 * and -- by necessity rather than coincidence -- what `heuristic` charges for
 * every tile still to be travelled. The two uses below are the same number,
 * and the comment on `heuristic` is why they have to be.
 */
export const PLAIN_STEP_COST = 1;

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
  //
  // `edgeStanding` is where that door-first rule now lives, shared with
  // `isEdgeTraversable` (`traversal.ts`), which is what a walker asks at the
  // moment it crosses an edge. The *policy* still differs and stays here: this
  // search crosses only a door the portal search upstream already admitted,
  // where a walker consults its own `RouteContext`. What the two must not
  // disagree about is that a registered door decides the edge whatever value
  // the edge layer holds -- and that sentence is now written once.
  const standing = edgeStanding(world, doors, current, neighbor);
  if (standing.kind === 'door') {
    if (!options.allowedDoorIds.has(standing.door.id)) return { allowed: false, cost: 0 };
    return { allowed: true, cost: doorTraversalCost(standing.door) };
  }
  if (standing.kind === 'wall') return { allowed: false, cost: 0 };
  return { allowed: true, cost: PLAIN_STEP_COST };
}

/**
 * Manhattan distance: exactly `PLAIN_STEP_COST` per tile still to travel.
 *
 * **Admissible only while no traversable edge costs less than
 * `PLAIN_STEP_COST`**, and this A* leans on that in its strongest form:
 * `closed` is never reopened, so a tile first reached by a non-optimal route
 * keeps that route's `g` for the rest of the search. Give one edge a cost
 * below a step and the heuristic starts *over*estimating -- a run of `n`
 * cheap doors genuinely costs less than `n` -- and `boundedLocalSearch` then
 * returns a route that is not the cheapest one inside its own bound. It does
 * so silently: there is no failure to observe, only a longer path.
 *
 * A door's crossing is the one edge cost that is authored rather than fixed
 * (`doorTraversalCost`: `costMultiplier` for an open door, `1.5x` closed,
 * `2x` locked), so the precondition reduces to `costMultiplier >=
 * MINIMUM_DOOR_COST_MULTIPLIER`. That is enforced in
 * `DoorRegistry.register`, which is why this heuristic can stay Manhattan;
 * it is a precondition of this function, held elsewhere, not a property of
 * the arithmetic here. `MINIMUM_DOOR_COST_MULTIPLIER` and `PLAIN_STEP_COST`
 * must stay equal, and
 * `tests/unit/navigation-local-search-admissibility.test.ts` pins that,
 * measures the exactness it buys against an independent Dijkstra over the
 * identical allowed set, and measures what a sub-unit door costs instead.
 *
 * The alternative -- tolerating a cheaper-than-a-step edge by reopening
 * closed nodes, or by scaling the heuristic to the cheapest edge in the
 * bound -- is a real algorithm change with a real cost, and nothing in the
 * game wants a door cheaper than walking.
 */
function heuristic(tile: TilePosition, destination: TilePosition): number {
  return PLAIN_STEP_COST * (Math.abs(tile.x - destination.x) + Math.abs(tile.y - destination.y));
}

/**
 * A* bounded to `options.allowedRegions`/`options.allowedDoorIds` -- never
 * an unbounded full-map search. Ties (equal f-score) break on the tile's
 * canonical string key so identical inputs always produce the identical
 * route, required for deterministic replay.
 *
 * The frontier is a `FrontierHeap` ordered by `(f, tile key)`, not the linear
 * scan this search used until #413. The selection *rule* is unchanged -- least
 * f, ties to the canonically-smallest tile key, and that pair is unique per
 * frontier node, so the rule is a total order and the next node is the same
 * node the scan would have picked. What changed is the cost of applying it:
 * `O(log |frontier|)` per expansion instead of `O(|frontier|)`, so the
 * expansion ADR 0007's budget counts is close to a constant amount of work
 * rather than one that grows with the search.
 *
 * The heap has no decrease-key: a relaxation pushes a second, strictly cheaper
 * entry for the tile, and the superseded entry is discarded on the way out
 * (`closed` already holds it). A discarded entry is deliberately **not**
 * counted in `stats.expansions` -- it is not an expansion, and the counted
 * work must keep meaning what it meant before the frontier changed shape.
 *
 * Optimal within its own bound only while every traversable edge costs at
 * least `PLAIN_STEP_COST`; see `heuristic`, and
 * `MINIMUM_DOOR_COST_MULTIPLIER` for where that is kept true. This is a
 * separate, stronger claim than `docs/NAVIGATION.md`'s "hierarchical vs.
 * flat-optimal cost" caveat, which is about the regions the *portal* search
 * chose and says nothing about optimality inside them.
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
  const open = new FrontierHeap<string, TilePosition>();
  const closed = new Set<string>();
  open.push(heuristic(origin, destination), originKey, origin);

  while (open.size > 0) {
    const currentKey = open.minimumTieBreak;
    const currentTile = open.minimumValue;
    open.pop();

    // A tile relaxed again while it was still on the frontier has a cheaper
    // entry that was popped earlier, so this one is the superseded copy of an
    // already-closed tile. Not a node, not an expansion.
    if (closed.has(currentKey)) continue;
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
        open.push(tentativeG + heuristic(neighbor, destination), neighborKey, neighbor);
      }
    }
  }

  return undefined;
}
