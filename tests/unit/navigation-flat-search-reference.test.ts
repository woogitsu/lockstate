import { describe, expect, it } from 'vitest';
import { tileKey, type TilePosition } from '../../src/simulation/world/coordinates';
import type { SparseWorld } from '../../src/simulation/world/sparse-world';
import type { DoorRegistry } from '../../src/simulation/navigation/door';
import { neighbors, resolveEdge } from '../../src/simulation/navigation/region-graph';
import { checkDoorAccess, doorTraversalCost, type RouteContext } from '../../src/simulation/navigation/route-context';
import { findRoute } from '../../src/simulation/navigation/router';
import { buildFixtureGraph, buildTwoRoomFixture } from '../helpers/navigation-fixture';

/**
 * A deliberately naive, obviously-correct full-map Dijkstra with no
 * hierarchy at all -- the reference oracle the issue's test requirements
 * ask for ("reference comparison against a small flat search"). It knows
 * nothing about regions or portals; it just walks every tile.
 */
function flatSearchCost(
  world: SparseWorld,
  doors: DoorRegistry,
  origin: TilePosition,
  destination: TilePosition,
  context: RouteContext | undefined, // undefined = ignore permissions entirely, physical connectivity only
  bounds: { readonly minX: number; readonly maxX: number; readonly minY: number; readonly maxY: number },
): number | undefined {
  const originKey = tileKey(origin);
  const destinationKey = tileKey(destination);
  const dist = new Map<string, number>([[originKey, 0]]);
  const visited = new Set<string>();
  const frontier = new Map<string, TilePosition>([[originKey, origin]]);

  while (frontier.size > 0) {
    let currentKey: string | undefined;
    let currentTile: TilePosition | undefined;
    let best = Number.POSITIVE_INFINITY;
    for (const [key, tile] of frontier) {
      const d = dist.get(key) ?? Number.POSITIVE_INFINITY;
      if (d < best) {
        best = d;
        currentKey = key;
        currentTile = tile;
      }
    }
    if (currentKey === undefined || currentTile === undefined) break;
    frontier.delete(currentKey);
    if (visited.has(currentKey)) continue;
    visited.add(currentKey);
    if (currentKey === destinationKey) return dist.get(currentKey);

    for (const neighbor of neighbors(currentTile)) {
      if (neighbor.x < bounds.minX || neighbor.x > bounds.maxX || neighbor.y < bounds.minY || neighbor.y > bounds.maxY) continue;
      const neighborKey = tileKey(neighbor);
      if (visited.has(neighborKey)) continue;

      const edge = resolveEdge(world, currentTile, neighbor);
      const door = doors.getByEdge(edge.ownerTile, edge.side);
      let cost: number;
      if (door !== undefined) {
        if (context !== undefined && !checkDoorAccess(door, context).allowed) continue;
        cost = doorTraversalCost(door);
      } else if (edge.wallValue !== 0) {
        continue;
      } else {
        cost = 1;
      }

      const tentative = best + cost;
      if (tentative < (dist.get(neighborKey) ?? Number.POSITIVE_INFINITY)) {
        dist.set(neighborKey, tentative);
        frontier.set(neighborKey, neighbor);
      }
    }
  }

  return undefined;
}

const LEFT_TILE = { x: 1, y: 1 } as TilePosition;
const RIGHT_TILE = { x: 6, y: 1 } as TilePosition;
const BOUNDS = { minX: 0, maxX: 7, minY: 0, maxY: 3 };
const GUARD: RouteContext = { role: 'guard', securityClearance: 5 };
const MEDICAL_STAFF: RouteContext = { role: 'staff', securityClearance: 0, permissions: ['medical-wing'] };
const PRISONER: RouteContext = { role: 'prisoner', securityClearance: 0 };

describe('findRoute vs. a naive flat full-map search (correctness oracle)', () => {
  it('matches the flat search cost exactly when only one door is a viable option', () => {
    const { world, doors, chunkA, chunkB } = buildTwoRoomFixture();
    const graph = buildFixtureGraph(world, doors, [chunkA, chunkB]);

    const guardRoute = findRoute(world, doors, graph, LEFT_TILE, RIGHT_TILE, GUARD);
    const guardFlatCost = flatSearchCost(world, doors, LEFT_TILE, RIGHT_TILE, GUARD, BOUNDS);
    expect(guardRoute.ok).toBe(true);
    expect(guardRoute.ok && guardRoute.route.totalCost).toBe(guardFlatCost);

    const staffRoute = findRoute(world, doors, graph, LEFT_TILE, RIGHT_TILE, MEDICAL_STAFF);
    const staffFlatCost = flatSearchCost(world, doors, LEFT_TILE, RIGHT_TILE, MEDICAL_STAFF, BOUNDS);
    expect(staffRoute.ok).toBe(true);
    expect(staffRoute.ok && staffRoute.route.totalCost).toBe(staffFlatCost);
  });

  it('agrees with the flat search that a permission-lacking actor has no valid route, while physical connectivity still exists', () => {
    const { world, doors, chunkA, chunkB } = buildTwoRoomFixture();
    const graph = buildFixtureGraph(world, doors, [chunkA, chunkB]);

    const hierarchicalResult = findRoute(world, doors, graph, LEFT_TILE, RIGHT_TILE, PRISONER);
    expect(hierarchicalResult.ok).toBe(false);

    const permissionAwareFlatCost = flatSearchCost(world, doors, LEFT_TILE, RIGHT_TILE, PRISONER, BOUNDS);
    expect(permissionAwareFlatCost).toBeUndefined();

    const physicalOnlyFlatCost = flatSearchCost(world, doors, LEFT_TILE, RIGHT_TILE, undefined, BOUNDS);
    expect(physicalOnlyFlatCost).toBeDefined();
  });
});
