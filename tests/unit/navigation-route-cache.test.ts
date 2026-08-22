import { describe, expect, it, vi } from 'vitest';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { findRoute } from '../../src/simulation/navigation/router';
import { RouteCache, findRouteCached } from '../../src/simulation/navigation/route-cache';
import { buildNavigationGraph } from '../../src/simulation/navigation/region-graph';
import type { RouteContext } from '../../src/simulation/navigation/route-context';
import { buildFixtureGraph, buildTwoRoomFixture } from '../helpers/navigation-fixture';

const LEFT_TILE = { x: tileCoordinate(1), y: tileCoordinate(1) };
const RIGHT_TILE = { x: tileCoordinate(6), y: tileCoordinate(1) };
const GUARD: RouteContext = { role: 'guard', securityClearance: 5 };
const MEDICAL_STAFF: RouteContext = { role: 'staff', securityClearance: 0, permissions: ['medical-wing'] };

describe('RouteCache', () => {
  it('serves a repeated identical request from cache without recomputing', () => {
    const { world, doors, chunkA, chunkB } = buildTwoRoomFixture();
    const graph = buildFixtureGraph(world, doors, [chunkA, chunkB]);
    const cache = new RouteCache();
    const compute = vi.fn(() => findRoute(world, doors, graph, LEFT_TILE, RIGHT_TILE, GUARD));

    const first = findRouteCached(cache, compute, LEFT_TILE, RIGHT_TILE, GUARD, graph, doors);
    const second = findRouteCached(cache, compute, LEFT_TILE, RIGHT_TILE, GUARD, graph, doors);

    expect(compute).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('computes independently for a different route context', () => {
    const { world, doors, chunkA, chunkB } = buildTwoRoomFixture();
    const graph = buildFixtureGraph(world, doors, [chunkA, chunkB]);
    const cache = new RouteCache();
    const computeGuard = vi.fn(() => findRoute(world, doors, graph, LEFT_TILE, RIGHT_TILE, GUARD));
    const computeStaff = vi.fn(() => findRoute(world, doors, graph, LEFT_TILE, RIGHT_TILE, MEDICAL_STAFF));

    findRouteCached(cache, computeGuard, LEFT_TILE, RIGHT_TILE, GUARD, graph, doors);
    findRouteCached(cache, computeStaff, LEFT_TILE, RIGHT_TILE, MEDICAL_STAFF, graph, doors);
    findRouteCached(cache, computeGuard, LEFT_TILE, RIGHT_TILE, GUARD, graph, doors);

    expect(computeGuard).toHaveBeenCalledTimes(1);
    expect(computeStaff).toHaveBeenCalledTimes(1);
    expect(cache.size()).toBe(2);
  });

  it('invalidates only the cache entry that actually crossed a door whose lock state changed', () => {
    const { world, doors, chunkA, chunkB } = buildTwoRoomFixture();
    const graph = buildFixtureGraph(world, doors, [chunkA, chunkB]);
    const cache = new RouteCache();
    const computeGuard = vi.fn(() => findRoute(world, doors, graph, LEFT_TILE, RIGHT_TILE, GUARD));
    const computeStaff = vi.fn(() => findRoute(world, doors, graph, LEFT_TILE, RIGHT_TILE, MEDICAL_STAFF));

    findRouteCached(cache, computeGuard, LEFT_TILE, RIGHT_TILE, GUARD, graph, doors); // crosses door-clearance
    findRouteCached(cache, computeStaff, LEFT_TILE, RIGHT_TILE, MEDICAL_STAFF, graph, doors); // crosses door-medical

    doors.setState('door-clearance', 'locked'); // lockdown affecting only the guard's cached route

    findRouteCached(cache, computeGuard, LEFT_TILE, RIGHT_TILE, GUARD, graph, doors);
    findRouteCached(cache, computeStaff, LEFT_TILE, RIGHT_TILE, MEDICAL_STAFF, graph, doors);

    expect(computeGuard).toHaveBeenCalledTimes(2); // re-evaluated after the lockdown
    expect(computeStaff).toHaveBeenCalledTimes(1); // untouched, still served from cache
  });

  it('invalidates the entire cache on a geometry change', () => {
    const { world, doors, chunkA, chunkB } = buildTwoRoomFixture();
    let graph = buildFixtureGraph(world, doors, [chunkA, chunkB]);
    const cache = new RouteCache();
    const compute = vi.fn(() => findRoute(world, doors, graph, LEFT_TILE, RIGHT_TILE, GUARD));

    findRouteCached(cache, compute, LEFT_TILE, RIGHT_TILE, GUARD, graph, doors);

    world.setLeftEdge({ x: tileCoordinate(2), y: tileCoordinate(1) }, 1);
    graph = buildNavigationGraph(world, doors, [world.getChunk(chunkA)!, world.getChunk(chunkB)!]);

    findRouteCached(cache, compute, LEFT_TILE, RIGHT_TILE, GUARD, graph, doors);

    expect(compute).toHaveBeenCalledTimes(2);
  });
});
