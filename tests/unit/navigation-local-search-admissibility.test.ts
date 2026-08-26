import { describe, expect, it } from 'vitest';
import { chunkCoordinate, tileCoordinate, tileKey, type TilePosition } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { DoorRegistry, MINIMUM_DOOR_COST_MULTIPLIER, type DoorDefinition, type DoorState } from '../../src/simulation/navigation/door';
import { boundedLocalSearch, PLAIN_STEP_COST } from '../../src/simulation/navigation/local-search';
import { buildNavigationGraph, neighbors, resolveEdge, type NavigationGraph, type RegionId } from '../../src/simulation/navigation/region-graph';
import { doorTraversalCost } from '../../src/simulation/navigation/route-context';

/**
 * `boundedLocalSearch` is exactly optimal *within its own bound* -- and that
 * is a precondition, not arithmetic.
 *
 * It is an A* with a Manhattan heuristic, a closed set and no reopening, so
 * it is exact only while its heuristic never overestimates: no traversable
 * edge may cost less than the `PLAIN_STEP_COST` the heuristic charges per
 * remaining tile. A door's crossing is the one edge cost that is authored
 * (`doorTraversalCost` of `DoorDefinition.costMultiplier`), so the whole
 * precondition reduces to `costMultiplier >= MINIMUM_DOOR_COST_MULTIPLIER`.
 *
 * `docs/NAVIGATION.md`'s "Known correctness caveat" carves out exactly one
 * source of inexactness -- the *regions* the portal-graph search chose -- and
 * says the local search is optimal within them. That sentence is what these
 * cases hold the search to. They test `boundedLocalSearch` directly rather
 * than `findRoute`, with every region and every door in the bound, so the
 * hierarchy is deliberately not part of the comparison: what is measured is
 * A*'s optimality inside the set it was handed.
 *
 * The oracle is a plain Dijkstra over the identical bound with the identical
 * per-edge costs, written out below. It needs no heuristic and is correct for
 * any non-negative edge cost, which is exactly why it can judge this -- and
 * no fixture here states an expected route that the search under test
 * computed.
 */

const t = (x: number, y: number): TilePosition => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

const GRID_SIZE = 8;

interface Layout {
  readonly world: SparseWorld;
  readonly doors: DoorRegistry;
  readonly graph: NavigationGraph;
}

interface Bound {
  readonly allowedRegions: ReadonlySet<RegionId>;
  readonly allowedDoorIds: ReadonlySet<string>;
}

interface SearchAnswer {
  readonly cost: number;
  readonly waypoints: readonly string[];
}

/** Every region and every door in the bound: the hierarchy is not under test here. */
function wholeGraphBound(layout: Layout): Bound {
  return {
    allowedRegions: new Set(layout.graph.regionTiles.keys()),
    allowedDoorIds: new Set(layout.doors.all().map((door) => door.id)),
  };
}

/**
 * The oracle: textbook Dijkstra, no heuristic, over the same tiles, the same
 * bound and the same per-edge costs `canStep` derives.
 *
 * It answers the question the A* is being judged on -- "what is the cheapest
 * route inside this bound" -- by a method that cannot fail the way the A*
 * can. Every node is settled in non-decreasing distance order, so a settled
 * node's distance is final for any non-negative edge cost, and every cost
 * here is a positive multiple of a step.
 */
function dijkstraWithinBound(layout: Layout, origin: TilePosition, destination: TilePosition, bound: Bound): SearchAnswer | undefined {
  const originKey = tileKey(origin);
  const destinationKey = tileKey(destination);
  const distance = new Map<string, number>([[originKey, 0]]);
  const previous = new Map<string, TilePosition>();
  const frontier = new Map<string, TilePosition>([[originKey, origin]]);
  const settled = new Set<string>();

  while (frontier.size > 0) {
    let currentKey: string | undefined;
    let currentTile: TilePosition | undefined;
    let best = Number.POSITIVE_INFINITY;
    for (const [key, tile] of frontier) {
      const candidate = distance.get(key) ?? Number.POSITIVE_INFINITY;
      // Least distance, ties on the canonical tile key, so the oracle is
      // deterministic too and a disagreement is never a coin flip.
      if (candidate < best || (candidate === best && currentKey !== undefined && key < currentKey)) {
        best = candidate;
        currentKey = key;
        currentTile = tile;
      }
    }
    if (currentKey === undefined || currentTile === undefined) break;
    frontier.delete(currentKey);
    settled.add(currentKey);

    if (currentKey === destinationKey) {
      const waypoints = [currentKey];
      let cursor = currentTile;
      while (previous.has(tileKey(cursor))) {
        const step = previous.get(tileKey(cursor));
        if (step === undefined) break;
        waypoints.push(tileKey(step));
        cursor = step;
      }
      waypoints.reverse();
      return { cost: best, waypoints };
    }

    for (const neighbor of neighbors(currentTile)) {
      const neighborKey = tileKey(neighbor);
      if (settled.has(neighborKey)) continue;
      const region = layout.graph.tileToRegion.get(neighborKey);
      if (region === undefined || !bound.allowedRegions.has(region)) continue;

      const edge = resolveEdge(layout.world, currentTile, neighbor);
      const door = layout.doors.getByEdge(edge.ownerTile, edge.side);
      let cost: number;
      if (door !== undefined) {
        if (!bound.allowedDoorIds.has(door.id)) continue;
        cost = doorTraversalCost(door);
      } else if (edge.wallValue !== 0) {
        continue;
      } else {
        cost = PLAIN_STEP_COST;
      }

      const tentative = best + cost;
      if (tentative < (distance.get(neighborKey) ?? Number.POSITIVE_INFINITY)) {
        distance.set(neighborKey, tentative);
        previous.set(neighborKey, currentTile);
        frontier.set(neighborKey, neighbor);
      }
    }
  }

  return undefined;
}

function searchWithinBound(layout: Layout, origin: TilePosition, destination: TilePosition, bound: Bound): SearchAnswer | undefined {
  const result = boundedLocalSearch(layout.world, layout.doors, layout.graph, origin, destination, bound);
  if (result === undefined) return undefined;
  return { cost: result.cost, waypoints: result.waypoints.map(tileKey) };
}

function graphOf(world: SparseWorld, doors: DoorRegistry): NavigationGraph {
  const chunkState = world.getChunk({ x: chunkCoordinate(0), y: chunkCoordinate(0) });
  if (chunkState === undefined) throw new Error('Fixture chunk must be loaded.');
  return buildNavigationGraph(world, doors, [chunkState]);
}

/** A small, self-contained LCG: the layouts have to be identical on every run. */
function seededRandom(seed: number): () => number {
  let state = (seed * 1103515245 + 12345) & 0x7fffffff;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

/**
 * One `GRID_SIZE`-square chunk with ~35% of its internal edges walled and
 * half of those walls given a door -- enough branching that most tile pairs
 * have several routes of similar cost, which is what makes a heuristic's
 * mistakes visible at all. Door states cycle, so the `1.5x` closed and `2x`
 * locked costs are exercised alongside the plain open `1x`.
 */
function buildRandomLayout(seed: number, costMultiplier: number): Layout {
  const random = seededRandom(seed);
  const world = new SparseWorld(GRID_SIZE);
  const chunk = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
  world.load(chunk);

  const states: readonly DoorState[] = ['open', 'closed', 'locked'];
  const doors = new DoorRegistry();
  const pending: DoorDefinition[] = [];
  for (let x = 0; x < GRID_SIZE; x += 1) {
    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (const side of ['left', 'top'] as const) {
        if (side === 'left' ? x === 0 : y === 0) continue;
        if (random() >= 0.35) continue;
        if (side === 'left') world.setLeftEdge(t(x, y), 1);
        else world.setTopEdge(t(x, y), 1);
        if (random() >= 0.5) continue;
        pending.push({
          id: `door-${side}-${x}-${y}`,
          position: t(x, y),
          side,
          state: states[pending.length % states.length] ?? 'open',
          requiredSecurityClearance: 0,
          costMultiplier,
        });
      }
    }
  }
  for (const door of pending) doors.register(door);

  return { world, doors, graph: graphOf(world, doors) };
}

/** Twelve seeded tile pairs per layout, the same twelve for every multiplier. */
function sampledPairs(seed: number): readonly { readonly origin: TilePosition; readonly destination: TilePosition }[] {
  const pairs: { origin: TilePosition; destination: TilePosition }[] = [];
  for (let index = 0; index < 12; index += 1) {
    const random = seededRandom(seed * 1_000 + index);
    const origin = t(Math.floor(random() * GRID_SIZE), Math.floor(random() * GRID_SIZE));
    const destination = t(Math.floor(random() * GRID_SIZE), Math.floor(random() * GRID_SIZE));
    if (tileKey(origin) === tileKey(destination)) continue;
    pairs.push({ origin, destination });
  }
  return pairs;
}

const SEEDS = Array.from({ length: 40 }, (_unused, index) => index + 1);

describe('the plain step cost and the minimum door cost are one number', () => {
  it('holds `MINIMUM_DOOR_COST_MULTIPLIER === PLAIN_STEP_COST`, which is what makes the Manhattan heuristic admissible', () => {
    // Two modules, two names, one value -- and nothing but this assertion
    // connects them, because `door.ts` importing `local-search.ts` would be a
    // cycle (`local-search.ts` imports `door.ts`). Raising either alone is
    // what the comment on `heuristic` calls the silent failure: a door
    // cheaper than a step, or a heuristic charging more than a step.
    expect(MINIMUM_DOOR_COST_MULTIPLIER).toBe(PLAIN_STEP_COST);
    expect(PLAIN_STEP_COST).toBe(1);
  });
});

describe('boundedLocalSearch is exact against an independent Dijkstra, for every door cost a door may have', () => {
  const MULTIPLIERS = [1, 1.5, 2] as const;

  it('agrees on the cost of every route in a seeded sweep of 40 layouts', () => {
    let cases = 0;
    const costsByMultiplier = new Map<number, Map<string, number>>();

    for (const costMultiplier of MULTIPLIERS) {
      const costs = new Map<string, number>();
      costsByMultiplier.set(costMultiplier, costs);
      for (const seed of SEEDS) {
        const layout = buildRandomLayout(seed, costMultiplier);
        const bound = wholeGraphBound(layout);
        for (const { origin, destination } of sampledPairs(seed)) {
          const astar = searchWithinBound(layout, origin, destination, bound);
          const optimal = dijkstraWithinBound(layout, origin, destination, bound);

          // Reachability has to agree too: a bounded A* and a bounded
          // Dijkstra over one bound either both find a route or neither does.
          expect(astar === undefined).toBe(optimal === undefined);
          if (astar === undefined || optimal === undefined) continue;

          cases += 1;
          expect(
            astar.cost,
            `multiplier ${costMultiplier}, seed ${seed}, ${tileKey(origin)}->${tileKey(destination)}: A* returned ${astar.waypoints.join(' ')}`,
          ).toBe(optimal.cost);
          costs.set(`${seed}:${tileKey(origin)}->${tileKey(destination)}`, astar.cost);
        }
      }
    }

    // The denominator: an empty or nearly-empty sweep would satisfy every
    // assertion above by asking nothing.
    expect(cases).toBeGreaterThan(1_000);
  });

  it('routes over doors often enough for the door cost to be doing the work', () => {
    // Non-vacuity of the case above. If the sampled routes never crossed a
    // door, the sweep would be measuring a wall-only grid three times and the
    // door multiplier -- the only thing that can break admissibility -- would
    // be untested. So: the same layouts and the same pairs at `1` and at `2`
    // must disagree on cost for many of them, which is only possible when the
    // cheapest route crosses a door.
    let compared = 0;
    let differing = 0;
    for (const seed of SEEDS) {
      const cheap = buildRandomLayout(seed, 1);
      const dear = buildRandomLayout(seed, 2);
      expect(cheap.doors.all().length).toBeGreaterThan(0);
      for (const { origin, destination } of sampledPairs(seed)) {
        const cheapAnswer = dijkstraWithinBound(cheap, origin, destination, wholeGraphBound(cheap));
        const dearAnswer = dijkstraWithinBound(dear, origin, destination, wholeGraphBound(dear));
        if (cheapAnswer === undefined || dearAnswer === undefined) continue;
        compared += 1;
        if (cheapAnswer.cost !== dearAnswer.cost) differing += 1;
      }
    }
    expect(compared).toBeGreaterThan(300);
    expect(differing).toBeGreaterThan(compared / 4);
  });
});

/**
 * A 3x3 room with two walls and one door on one of them:
 *
 * ```
 *   0,0   1,0 | 2,0        `|` is the door edge (left of 2,0)
 *              -            `-` is a plain wall (top of 1,1)
 *   0,1   1,1   2,1
 *   0,2   1,2   2,2
 * ```
 *
 * Getting from `2,1` to `0,0` is three plain steps the long way round
 * (`2,1 1,1 0,1 0,0`) or two plain steps plus the door (`2,1 2,0 1,0 0,0`).
 * At the minimum multiplier those cost the same and A* is exact; make the
 * door cheaper than walking and the second route is strictly cheaper while
 * A* still returns the first -- it charges one per remaining tile, so the
 * shorter-in-tiles route looks better than it is, and the closed set means
 * the mistake is never revisited.
 */
function buildDoorInACornerLayout(): { readonly world: SparseWorld; readonly doors: DoorRegistry; readonly door: DoorDefinition } {
  const world = new SparseWorld(3);
  const chunk = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
  world.load(chunk);
  world.setTopEdge(t(1, 1), 1);
  world.setLeftEdge(t(2, 0), 1);

  const doors = new DoorRegistry();
  const door: DoorDefinition = {
    id: 'door-corner',
    position: t(2, 0),
    side: 'left',
    state: 'open',
    requiredSecurityClearance: 0,
    costMultiplier: MINIMUM_DOOR_COST_MULTIPLIER,
  };
  doors.register(door);
  return { world, doors, door };
}

const WITNESS_ORIGIN = t(2, 1);
const WITNESS_DESTINATION = t(0, 0);

describe('a door cheaper than a plain step, which is what the registry now refuses', () => {
  it('is exact at the minimum multiplier: both routes cost the same and A* matches the oracle', () => {
    const { world, doors } = buildDoorInACornerLayout();
    const layout: Layout = { world, doors, graph: graphOf(world, doors) };
    const bound = wholeGraphBound(layout);

    const astar = searchWithinBound(layout, WITNESS_ORIGIN, WITNESS_DESTINATION, bound);
    const optimal = dijkstraWithinBound(layout, WITNESS_ORIGIN, WITNESS_DESTINATION, bound);
    expect(astar?.cost).toBe(3);
    expect(optimal?.cost).toBe(3);
    expect(astar?.waypoints).toEqual(['2,1', '1,1', '0,1', '0,0']);
  });

  it('returns a strictly more expensive route once the door costs less than a step', () => {
    const { world, doors, door } = buildDoorInACornerLayout();
    // The value this case needs cannot be registered any more; the refusal
    // matrix lives in `navigation-door-and-context.test.ts`, and this line is
    // what ties it to the reason.
    expect(() => doors.register({ ...door, id: 'door-cheap', position: t(0, 2), side: 'top', costMultiplier: 0.5 })).toThrow(RangeError);
    makeSubUnit(doors, door, 0.5);
    const layout: Layout = { world, doors, graph: graphOf(world, doors) };
    const bound = wholeGraphBound(layout);

    const astar = searchWithinBound(layout, WITNESS_ORIGIN, WITNESS_DESTINATION, bound);
    const optimal = dijkstraWithinBound(layout, WITNESS_ORIGIN, WITNESS_DESTINATION, bound);

    // The route, not merely a route: A* walks round the wall for three plain
    // steps, and the cheaper way through the door is the one it never takes.
    expect(astar?.waypoints).toEqual(['2,1', '1,1', '0,1', '0,0']);
    expect(astar?.cost).toBe(3);
    expect(optimal?.waypoints).toEqual(['2,1', '2,0', '1,0', '0,0']);
    expect(optimal?.cost).toBe(2.5);

    // Both routes are inside the same bound, so this is not the hierarchical
    // caveat `docs/NAVIGATION.md` documents -- it is the local search failing
    // its own optimality claim, which is why the multiplier is bounded rather
    // than the caveat widened.
    expect(astar?.cost).toBeGreaterThan(optimal?.cost ?? 0);
  });
});

/**
 * Lowers a registered door's multiplier below `MINIMUM_DOOR_COST_MULTIPLIER`
 * *behind* `DoorRegistry.register`, which is the only thing standing between
 * this value and the searches.
 *
 * Nothing in `src/` can do this: the two producers (`createGradedDoor` and
 * `BuildableDefinition.placesDoor`) both say `1`, the save schema bounds the
 * one authored value that crosses a boundary, and `register` throws on the
 * rest. The test does it anyway, because a guard whose reason is only
 * asserted in prose is a guard the next reader may delete -- the case above
 * measures what it is buying.
 */
function makeSubUnit(doors: DoorRegistry, door: DoorDefinition, costMultiplier: number): void {
  const stored = doors.getById(door.id);
  if (stored === undefined) throw new Error('The door must be registered before its cost can be lowered.');
  (stored as { costMultiplier: number }).costMultiplier = costMultiplier;

  // The bypass has to be verified, not assumed: `register` stores the object
  // it was handed, so both lookup paths see the lowered value, and a future
  // `register` that copied its argument would make the case above vacuous.
  const byEdge = doors.getByEdge(door.position, door.side);
  expect(byEdge?.costMultiplier).toBe(costMultiplier);
  expect(doorTraversalCost(byEdge as DoorDefinition)).toBeLessThan(PLAIN_STEP_COST);
}
