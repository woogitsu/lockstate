import { describe, expect, it } from 'vitest';
import { chunkCoordinate, tileCoordinate, tileKey, type TilePosition } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { DoorRegistry } from '../../src/simulation/navigation/door';
import { buildNavigationGraph } from '../../src/simulation/navigation/region-graph';
import { computeRegionFlowField } from '../../src/simulation/navigation/flow-field';
import { findRoute } from '../../src/simulation/navigation/router';
import type { RouteContext } from '../../src/simulation/navigation/route-context';
import type { RouteResult, RouteSegment } from '../../src/simulation/navigation/route';
import { buildFixtureGraph, buildTwoRoomFixture } from '../helpers/navigation-fixture';

/**
 * The three canonical orders `src/simulation/navigation/` depends on, stated
 * as concrete expected answers.
 *
 * Every search in that tree resolves a tie by an explicit total rule rather
 * than by the iteration order of the `Map` it happens to be holding, and each
 * of the three sites carries a comment saying so:
 *
 * - `local-search.ts`'s A* frontier picks the smallest f-score and breaks
 *   equal f on the tile's canonical string key.
 * - `region-dijkstra.ts`'s frontier picks the smallest distance and breaks
 *   equal distance on the region id.
 * - `region-graph.ts` sorts `portals` by door id before any search sees them,
 *   because "Portal order decides which portal the router and the flow-field
 *   builder expand first among equals".
 *
 * None of the three was covered. `docs/DETERMINISM.md` records why the static
 * scan cannot cover them -- `tests/helpers/canonical-iteration.ts` restricts
 * its `for ... of` rule to fields on purpose, and says of these two searches
 * that they "pick their next node by an explicit total tie-break rather than
 * by iteration order, which no textual rule can see and which their own
 * behavioural tests already pin". The second half of that sentence is what
 * this file makes true. `tests/unit/navigation-router.test.ts`'s
 * "is deterministic: identical requests return identical routes" calls
 * `findRoute` twice on one graph, which is identical under either rule, and
 * `docs/NAVIGATION.md` cites it for the stronger claim.
 *
 * Each case below pins the canonical answer *and* asserts the alternative is
 * genuinely available at the same cost, so none of them can pass because
 * there was only ever one route to find.
 */

const t = (x: number, y: number): TilePosition => ({ x: tileCoordinate(x), y: tileCoordinate(y) });
const PLAIN: RouteContext = { role: 'guard', securityClearance: 0 };
const WARDEN: RouteContext = { role: 'guard', securityClearance: 5, permissions: ['medical-wing'] };

function waypointKeys(result: RouteResult): readonly string[] {
  if (!result.ok) throw new Error(`Expected a route, got ${result.failure.reason}.`);
  return result.route.segments.flatMap((segment) => segment.waypoints).map((waypoint) => tileKey(waypoint));
}

function doorTrail(segments: readonly RouteSegment[]): string {
  return segments.map((segment) => `${segment.regionId}${segment.enteredViaDoorId === undefined ? '' : `(${segment.enteredViaDoorId})`}`).join('>');
}

function requireRoute(result: RouteResult): { readonly segments: readonly RouteSegment[]; readonly totalCost: number } {
  if (!result.ok) throw new Error(`Expected a route, got ${result.failure.reason}.`);
  return result.route;
}

/** One 4x4 chunk with no walls and no doors: a single region, every tile open. */
function buildOpenRoom(): { readonly world: SparseWorld; readonly doors: DoorRegistry; readonly graph: ReturnType<typeof buildNavigationGraph> } {
  const world = new SparseWorld(4);
  const chunk = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
  world.load(chunk);
  const doors = new DoorRegistry();
  const chunkState = world.getChunk(chunk);
  if (chunkState === undefined) throw new Error('Fixture chunk must be loaded.');
  return { world, doors, graph: buildNavigationGraph(world, doors, [chunkState]) };
}

/**
 * Four single-tile regions in a diamond, in one 4x4 chunk with every internal
 * edge walled and four doors opened:
 *
 * ```
 *   S=(0,0) --b-s-x-- X=(1,0)
 *      |                 |
 *    a-s-y             c-x-t
 *      |                 |
 *   Y=(0,1) --d-y-t-- T=(1,1)
 * ```
 *
 * Region ids follow the row-major tile scan, so S=1, X=2, Y=5, T=6. Both
 * region routes S->T cross two open doors of cost 1, so they tie exactly, and
 * the door ids are named so that the *portal* order (`a-s-y` before `b-s-x`)
 * points the opposite way to the *region id* order (X=2 before Y=5). The
 * frontier tie-break is the only thing that decides between them.
 */
function buildDiamond(): { readonly world: SparseWorld; readonly doors: DoorRegistry; readonly graph: ReturnType<typeof buildNavigationGraph> } {
  const world = new SparseWorld(4);
  const chunk = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
  world.load(chunk);
  for (let x = 1; x < 4; x += 1) {
    for (let y = 0; y < 4; y += 1) world.setLeftEdge(t(x, y), 1);
  }
  for (let x = 0; x < 4; x += 1) {
    for (let y = 1; y < 4; y += 1) world.setTopEdge(t(x, y), 1);
  }

  const doors = new DoorRegistry();
  doors.register({ id: 'a-s-y', position: t(0, 1), side: 'top', state: 'open', requiredSecurityClearance: 0, costMultiplier: 1 });
  doors.register({ id: 'b-s-x', position: t(1, 0), side: 'left', state: 'open', requiredSecurityClearance: 0, costMultiplier: 1 });
  doors.register({ id: 'c-x-t', position: t(1, 1), side: 'top', state: 'open', requiredSecurityClearance: 0, costMultiplier: 1 });
  doors.register({ id: 'd-y-t', position: t(1, 1), side: 'left', state: 'open', requiredSecurityClearance: 0, costMultiplier: 1 });

  const chunkState = world.getChunk(chunk);
  if (chunkState === undefined) throw new Error('Fixture chunk must be loaded.');
  return { world, doors, graph: buildNavigationGraph(world, doors, [chunkState]) };
}

describe('boundedLocalSearch: equal f-scores break on the tile key, not on frontier insertion order', () => {
  it('hugs the canonically-least tiles across an open room', () => {
    const { world, doors, graph } = buildOpenRoom();

    const route = requireRoute(findRoute(world, doors, graph, t(0, 0), t(3, 3), PLAIN));

    // Every step costs 1 and the destination is 6 steps away, so this is one
    // of the 20 shortest paths and the search had a live choice at every tile.
    expect(route.totalCost).toBe(6);
    expect(waypointKeys(findRoute(world, doors, graph, t(0, 0), t(3, 3), PLAIN))).toEqual([
      '0,0',
      '0,1',
      '0,2',
      '0,3',
      '1,3',
      '2,3',
      '3,3',
    ]);
  });

  it('had an equally short first step available in the other direction', () => {
    const { world, doors, graph } = buildOpenRoom();

    // Non-vacuity for the case above: stepping east first is exactly as good
    // as stepping south first -- both leave 5 to travel -- so '0,1' is chosen
    // by the tie-break rule and not by being the only option.
    expect(requireRoute(findRoute(world, doors, graph, t(0, 1), t(3, 3), PLAIN)).totalCost).toBe(5);
    expect(requireRoute(findRoute(world, doors, graph, t(1, 0), t(3, 3), PLAIN)).totalCost).toBe(5);
    // '0,1' < '1,0' in code-unit order, which is why the route above turns south.
    expect(tileKey(t(0, 1)) < tileKey(t(1, 0))).toBe(true);
  });
});

describe('runRegionDijkstra: equal distances break on the region id, not on frontier insertion order', () => {
  it('routes through the lower-numbered of two equally cheap regions', () => {
    const { world, doors, graph } = buildDiamond();

    expect(graph.tileToRegion.get(tileKey(t(0, 0)))).toBe(1);
    expect(graph.tileToRegion.get(tileKey(t(1, 0)))).toBe(2);
    expect(graph.tileToRegion.get(tileKey(t(0, 1)))).toBe(5);
    expect(graph.tileToRegion.get(tileKey(t(1, 1)))).toBe(6);
    // The portal order points the other way, so this cannot pass by accident.
    expect(graph.portals.map((portal) => portal.doorId)).toEqual(['a-s-y', 'b-s-x', 'c-x-t', 'd-y-t']);

    const route = requireRoute(findRoute(world, doors, graph, t(0, 0), t(1, 1), PLAIN));
    expect(doorTrail(route.segments)).toBe('1>2(b-s-x)>6(c-x-t)');
    expect(route.totalCost).toBe(2);
  });

  it('the route through the higher-numbered region is available at the identical cost', () => {
    const { world, doors, graph } = buildDiamond();

    doors.setState('b-s-x', 'locked');

    const alternative = requireRoute(findRoute(world, doors, graph, t(0, 0), t(1, 1), PLAIN));
    expect(doorTrail(alternative.segments)).toBe('1>5(a-s-y)>6(d-y-t)');
    expect(alternative.totalCost).toBe(2);
  });

  it('the shared flow-field pass resolves the same tie the same way', () => {
    const { doors, graph } = buildDiamond();

    const destinationRegion = graph.tileToRegion.get(tileKey(t(1, 1)));
    if (destinationRegion === undefined) throw new Error('Destination tile must have a region.');
    const field = computeRegionFlowField(graph, doors, destinationRegion, PLAIN);

    // `flow-field.ts` and `router.ts` share `runRegionDijkstra`, so the source
    // region's step must name the same door the route above crossed first.
    expect(field.steps.get(1)?.nextPortal.doorId).toBe('b-s-x');
    expect(field.steps.get(1)?.costToDestination).toBe(2);
  });
});

describe('buildNavigationGraph: portals reach the searches in door-id order', () => {
  it('crosses the canonically-first of two doors joining the same pair of regions', () => {
    const { world, doors, chunkA, chunkB } = buildTwoRoomFixture();
    doors.setState('door-clearance', 'open');
    doors.setState('door-medical', 'open');
    const graph = buildFixtureGraph(world, doors, [chunkA, chunkB]);

    expect(graph.portals.map((portal) => portal.doorId)).toEqual(['door-clearance', 'door-medical']);

    const route = requireRoute(findRoute(world, doors, graph, t(1, 1), t(6, 1), WARDEN));
    expect(doorTrail(route.segments)).toBe('1>2(door-clearance)');
    expect(route.totalCost).toBe(5);
  });

  it('the other door joins the same two regions and is usable on its own', () => {
    const { world, doors, chunkA, chunkB } = buildTwoRoomFixture();
    doors.setState('door-clearance', 'locked');
    doors.setState('door-medical', 'open');
    const graph = buildFixtureGraph(world, doors, [chunkA, chunkB]);

    // Non-vacuity: both portals connect region 1 to region 2, so which one the
    // region search relaxes first is decided by the portal order alone.
    for (const portal of graph.portals) {
      expect([portal.regionA, portal.regionB]).toEqual([1, 2]);
    }

    const alternative = requireRoute(findRoute(world, doors, graph, t(1, 1), t(6, 1), WARDEN));
    expect(doorTrail(alternative.segments)).toBe('1>2(door-medical)');
    expect(alternative.totalCost).toBe(7);
  });
});
