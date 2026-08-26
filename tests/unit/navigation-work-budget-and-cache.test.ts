import { describe, expect, it } from 'vitest';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { FlowFieldCache } from '../../src/simulation/navigation/flow-field';
import { PathRequestQueue } from '../../src/simulation/navigation/path-request-queue';
import { findRoute } from '../../src/simulation/navigation/router';
import { RouteCache } from '../../src/simulation/navigation/route-cache';
import type { SearchStats } from '../../src/simulation/navigation/local-search';
import type { RouteContext } from '../../src/simulation/navigation/route-context';
import { buildCellBlockFixture, buildFixtureGraph, buildSingleDoorFixture, buildTwoRoomFixture } from '../helpers/navigation-fixture';

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
    const dependencies = new Set<string>();
    const result = findRoute(world, doors, graph, LEFT_TILE, RIGHT_TILE, GUARD, undefined, dependencies);
    cache.set(LEFT_TILE, RIGHT_TILE, GUARD, graph, doors, result, dependencies);
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

    const dependencies = new Set<string>();
    const result = findRoute(world, doors, graph, LEFT_TILE, RIGHT_TILE, GUARD, undefined, dependencies);
    cache.set(LEFT_TILE, RIGHT_TILE, GUARD, graph, doors, result, dependencies);

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

    const dependencies = new Set<string>();
    const result = findRoute(world, doors, graphBefore, LEFT_TILE, RIGHT_TILE, GUARD, undefined, dependencies);
    cache.set(LEFT_TILE, RIGHT_TILE, GUARD, graphBefore, doors, result, dependencies);

    world.markGeometryChanged(chunkA);
    const graphAfter = buildFixtureGraph(world, doors, [chunkA, chunkB]);
    expect(cache.get(LEFT_TILE, RIGHT_TILE, GUARD, graphAfter, doors)).toBeUndefined();

    const metrics = cache.getMetrics();
    expect(metrics.geometryInvalidations).toBe(1);
    expect(metrics.evictions).toBe(0);
  });
});

/**
 * Flow-field sharing used to be checked *before* the route cache and to write
 * nothing back into it, so the busiest destination in the prison -- the one that
 * trips `flowFieldActivationThreshold`, i.e. exactly the one whose legs repeat
 * most -- was the one destination for which no cross-tick reuse ever happened.
 * The per-tick cost never decayed: each tick re-paid a full per-actor local A*
 * for legs the cache already held (#359).
 *
 * The cross-tick shape is the load-bearing one. A single-tick assertion is
 * satisfied by `fieldsThisTick`, which already deduped the *field* computation
 * within one tick and hid the problem.
 */
describe('PathRequestQueue: flow-field sharing composes with the route cache rather than bypassing it', () => {
  const WARDEN: RouteContext = { role: 'guard', securityClearance: 5, permissions: ['medical-wing'] };

  interface ShareRun {
    readonly perTickExpansions: readonly number[];
    readonly total: number;
    readonly routeCacheHits: number;
    readonly routeCacheSize: number;
    readonly flowFieldActivations: number;
    readonly ticksToDrain: number;
    readonly fingerprints: readonly string[];
  }

  function runRepeatedLegs(options: {
    readonly flowFieldActivationThreshold: number;
    readonly legCount: number;
    readonly ticks: number;
    readonly distinctOrigins: boolean;
    readonly workBudget: number;
  }): ShareRun {
    const fixture = buildCellBlockFixture(24);
    const graph = buildFixtureGraph(fixture.world, fixture.doors, fixture.chunkPositions);
    const routeCache = new RouteCache();
    const flowFieldCache = new FlowFieldCache();
    const queue = new PathRequestQueue({ agingIntervalTicks: 15, flowFieldActivationThreshold: options.flowFieldActivationThreshold });
    const destination = fixture.canteenTiles[0];
    if (destination === undefined) throw new Error('Fixture must have a canteen.');

    const perTickExpansions: number[] = [];
    const fingerprints: string[] = [];
    let previousTotal = 0;
    let ticksToDrain = 0;

    for (let tick = 0; tick < options.ticks; tick += 1) {
      for (let index = 0; index < options.legCount; index += 1) {
        const origin = options.distinctOrigins ? fixture.cellTiles[index % fixture.cellTiles.length] : fixture.cellTiles[0];
        if (origin === undefined) throw new Error('Fixture must have cells.');
        queue.enqueue({ id: `t${tick}-${index}`, origin, destination, context: WARDEN, priority: 0 }, tick);
      }
      do {
        for (const outcome of queue.processTick({
          tick,
          workBudget: options.workBudget,
          world: fixture.world,
          doors: fixture.doors,
          graph,
          routeCache,
          flowFieldCache,
        })) {
          fingerprints.push(`${outcome.id}=${outcome.result.ok ? outcome.result.route.totalCost : outcome.result.failure.reason}`);
        }
        ticksToDrain += 1;
      } while (queue.size() > 0);
      const total = queue.getMetrics().totalExpansions;
      perTickExpansions.push(total - previousTotal);
      previousTotal = total;
    }

    const metrics = routeCache.getMetrics();
    return {
      perTickExpansions,
      total: previousTotal,
      routeCacheHits: metrics.hits,
      routeCacheSize: metrics.size,
      flowFieldActivations: queue.getMetrics().flowFieldActivations,
      ticksToDrain,
      fingerprints,
    };
  }

  it('spends strictly less work on the second tick of the same legs, with sharing active', () => {
    const run = runRepeatedLegs({ flowFieldActivationThreshold: 6, legCount: 8, ticks: 2, distinctOrigins: true, workBudget: 10_000 });

    expect(run.flowFieldActivations).toBeGreaterThan(0); // non-vacuity: sharing really is active
    const [first, second] = run.perTickExpansions;
    if (first === undefined || second === undefined) throw new Error('Two ticks must be recorded.');
    expect(second).toBeLessThan(first);
    expect(second).toBe(0); // every leg is served from the cache
    expect(run.routeCacheHits).toBe(8);
    expect(run.routeCacheSize).toBe(8);
  });

  it('lets the per-tick cost decay to nothing over ten ticks, and costs no more in total than sharing turned off', () => {
    const sharing = runRepeatedLegs({ flowFieldActivationThreshold: 6, legCount: 8, ticks: 10, distinctOrigins: true, workBudget: 10_000 });
    const noSharing = runRepeatedLegs({ flowFieldActivationThreshold: 99, legCount: 8, ticks: 10, distinctOrigins: true, workBudget: 10_000 });

    expect(sharing.perTickExpansions.slice(1)).toEqual(Array.from({ length: 9 }, () => 0));
    expect(sharing.total).toBeLessThanOrEqual(noSharing.total);
    // The field is computed for the first tick's miss and never again, because
    // later ticks are answered before a field is needed at all.
    expect(sharing.flowFieldActivations).toBe(1);
    // Same answers either way; sharing is a cost decision, never a routing one.
    expect(sharing.fingerprints).toEqual(noSharing.fingerprints);
  });

  it('still pays off on the case sharing exists for: many distinct origins converging on one destination', () => {
    const sharing = runRepeatedLegs({ flowFieldActivationThreshold: 6, legCount: 24, ticks: 1, distinctOrigins: true, workBudget: 400 });
    const noSharing = runRepeatedLegs({ flowFieldActivationThreshold: 99, legCount: 24, ticks: 1, distinctOrigins: true, workBudget: 400 });

    expect(sharing.total).toBeLessThan(noSharing.total);
    expect(sharing.ticksToDrain).toBeLessThanOrEqual(noSharing.ticksToDrain);
    expect(sharing.fingerprints).toEqual(noSharing.fingerprints);
  });

  it('does not compute a field for a batch the cache can already answer', () => {
    const run = runRepeatedLegs({ flowFieldActivationThreshold: 6, legCount: 24, ticks: 3, distinctOrigins: false, workBudget: 10_000 });

    expect(run.flowFieldActivations).toBe(1);
    expect(run.perTickExpansions.slice(1)).toEqual([0, 0]);
    expect(run.routeCacheSize).toBe(1); // 72 requests, one distinct leg
  });
});
