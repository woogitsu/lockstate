import { describe, expect, it } from 'vitest';
import type { TilePosition } from '../../src/simulation/world/coordinates';
import type { RouteContext } from '../../src/simulation/navigation/route-context';
import { findRoute } from '../../src/simulation/navigation/router';
import { flatSearchCost } from '../helpers/navigation-flat-search';
import { buildFixtureGraph, buildTwoRoomFixture } from '../helpers/navigation-fixture';

/**
 * The flat oracle itself now lives in `tests/helpers/navigation-flat-search.ts`,
 * because `tests/determinism/navigation-shared-plan-equivalence.test.ts` needs
 * the same independent cost reference on the ring fixture and a second copy of
 * an oracle is a second thing to keep correct.
 */

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
