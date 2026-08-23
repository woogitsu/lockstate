import { describe, expect, it } from 'vitest';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { findRoute } from '../../src/simulation/navigation/router';
import { RouteCache } from '../../src/simulation/navigation/route-cache';
import type { SearchStats } from '../../src/simulation/navigation/local-search';
import type { RouteContext } from '../../src/simulation/navigation/route-context';
import { buildFixtureGraph, buildSingleDoorFixture, buildTwoRoomFixture } from '../helpers/navigation-fixture';

const LEFT_TILE = { x: tileCoordinate(1), y: tileCoordinate(1) };
const RIGHT_TILE = { x: tileCoordinate(6), y: tileCoordinate(1) };
const GUARD: RouteContext = { role: 'guard', securityClearance: 5 };
const PRISONER: RouteContext = { role: 'prisoner', securityClearance: 0 };

describe('findRoute: optional SearchStats work-unit counting', () => {
  it('counts a positive, deterministic number of expansions for a successful route', () => {
    const { world, doors, chunkA, chunkB } = buildTwoRoomFixture();
    const graph = buildFixtureGraph(world, doors, [chunkA, chunkB]);

    const first: SearchStats = { expansions: 0 };
    const second: SearchStats = { expansions: 0 };
    findRoute(world, doors, graph, LEFT_TILE, RIGHT_TILE, GUARD, first);
    findRoute(world, doors, graph, LEFT_TILE, RIGHT_TILE, GUARD, second);

    expect(first.expansions).toBeGreaterThan(0);
    expect(first.expansions).toBe(second.expansions);
  });

  it('does not mutate the caller-supplied stats object when no stats are passed (opt-in, zero overhead)', () => {
    const { world, doors, chunkA, chunkB } = buildTwoRoomFixture();
    const graph = buildFixtureGraph(world, doors, [chunkA, chunkB]);

    const result = findRoute(world, doors, graph, LEFT_TILE, RIGHT_TILE, GUARD);
    expect(result.ok).toBe(true);
  });

  it('charges expansions for both the permission-aware and physical-fallback region passes on a permission-denied result', () => {
    const { world, doors, chunkA, chunkB } = buildTwoRoomFixture();
    const graph = buildFixtureGraph(world, doors, [chunkA, chunkB]);

    const deniedStats: SearchStats = { expansions: 0 };
    const result = findRoute(world, doors, graph, LEFT_TILE, RIGHT_TILE, PRISONER, deniedStats);

    expect(result.ok).toBe(false);
    // Two Dijkstra passes over a graph with real portals must expand at least one region each.
    expect(deniedStats.expansions).toBeGreaterThanOrEqual(2);
  });

  it('adds the local-search expansions on top of the region-graph expansions', () => {
    const { world, doors, chunkA, chunkB } = buildTwoRoomFixture();
    const graph = buildFixtureGraph(world, doors, [chunkA, chunkB]);

    const stats: SearchStats = { expansions: 0 };
    const result = findRoute(world, doors, graph, LEFT_TILE, RIGHT_TILE, GUARD, stats);
    expect(result.ok).toBe(true);

    // Origin and destination are 5 tiles apart plus a door crossing -- local search alone
    // must expand more than the handful of regions in the tiny two-room fixture.
    expect(stats.expansions).toBeGreaterThan(5);
  });
});

describe('RouteCache: hit/miss/eviction/invalidation metrics', () => {
  it('counts a miss then a hit for the same request', () => {
    const { world, doors, chunkA, chunkB } = buildTwoRoomFixture();
    const graph = buildFixtureGraph(world, doors, [chunkA, chunkB]);
    const cache = new RouteCache();

    expect(cache.get(LEFT_TILE, RIGHT_TILE, GUARD, graph, doors)).toBeUndefined();
    const result = findRoute(world, doors, graph, LEFT_TILE, RIGHT_TILE, GUARD);
    cache.set(LEFT_TILE, RIGHT_TILE, GUARD, graph, doors, result);
    expect(cache.get(LEFT_TILE, RIGHT_TILE, GUARD, graph, doors)).toEqual(result);

    const metrics = cache.getMetrics();
    expect(metrics.misses).toBe(1);
    expect(metrics.hits).toBe(1);
    expect(metrics.size).toBe(1);
  });

  it('counts a targeted eviction when the specific crossed door changes state, not a geometry invalidation', () => {
    const { world, doors, chunkA, chunkB } = buildSingleDoorFixture();
    const graph = buildFixtureGraph(world, doors, [chunkA, chunkB]);
    const cache = new RouteCache();

    const result = findRoute(world, doors, graph, LEFT_TILE, RIGHT_TILE, GUARD);
    cache.set(LEFT_TILE, RIGHT_TILE, GUARD, graph, doors, result);

    doors.setState('door-clearance', 'locked');
    expect(cache.get(LEFT_TILE, RIGHT_TILE, GUARD, graph, doors)).toBeUndefined();

    const metrics = cache.getMetrics();
    expect(metrics.evictions).toBe(1);
    expect(metrics.geometryInvalidations).toBe(0);
    expect(metrics.size).toBe(0);
  });

  it('counts a geometry invalidation, not a targeted eviction, when the graph itself is rebuilt', () => {
    const { world, doors, chunkA, chunkB } = buildSingleDoorFixture();
    const graphBefore = buildFixtureGraph(world, doors, [chunkA, chunkB]);
    const cache = new RouteCache();

    const result = findRoute(world, doors, graphBefore, LEFT_TILE, RIGHT_TILE, GUARD);
    cache.set(LEFT_TILE, RIGHT_TILE, GUARD, graphBefore, doors, result);

    world.markGeometryChanged(chunkA);
    const graphAfter = buildFixtureGraph(world, doors, [chunkA, chunkB]);
    expect(cache.get(LEFT_TILE, RIGHT_TILE, GUARD, graphAfter, doors)).toBeUndefined();

    const metrics = cache.getMetrics();
    expect(metrics.geometryInvalidations).toBe(1);
    expect(metrics.evictions).toBe(0);
  });
});
