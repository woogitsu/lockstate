import { describe, expect, it } from 'vitest';
import { FlowFieldCache, computeRegionFlowField } from '../../src/simulation/navigation/flow-field';
import { PathRequestQueue } from '../../src/simulation/navigation/path-request-queue';
import { RouteCache } from '../../src/simulation/navigation/route-cache';
import { buildCellBlockFixture, buildFixtureGraph, buildRingFixture } from '../helpers/navigation-fixture';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { MAX_ROUTE_CACHE_WARMTH_KEYS } from '../../src/simulation/navigation/cache-limits';
import { findRoute } from '../../src/simulation/navigation/router';

describe('saved navigation cache membership (#1373)', () => {
  it('rebuilds a 24-route crowd with one shared field, then invalidates both when a depended-on door changes', () => {
    const fixture = buildCellBlockFixture(24);
    const graph = buildFixtureGraph(fixture.world, fixture.doors, fixture.chunkPositions);
    const routes = new RouteCache();
    const fields = new FlowFieldCache();
    const queue = new PathRequestQueue({ agingIntervalTicks: 15, flowFieldActivationThreshold: 6 });
    const context = { role: 'guard', securityClearance: 5, permissions: ['medical-wing'] };
    const destination = fixture.canteenTiles[0]!;
    for (let index = 0; index < 24; index += 1) {
      queue.enqueue({ id: `crowd-${index}`, origin: fixture.cellTiles[index]!, destination, context, priority: 0 }, 0);
    }
    queue.processTick({ tick: 0, workBudget: 10_000, world: fixture.world, doors: fixture.doors, graph, routeCache: routes, flowFieldCache: fields });
    const routeKeys = routes.getWarmthSnapshot(graph, fixture.doors);
    const fieldKeys = fields.getWarmthSnapshot(graph, fixture.doors);
    expect(routeKeys).toHaveLength(24);
    expect(fieldKeys).toHaveLength(1);

    const restoredRoutes = new RouteCache();
    const restoredFields = new FlowFieldCache();
    const throughJson = JSON.parse(JSON.stringify({ routeKeys, fieldKeys })) as { routeKeys: typeof routeKeys; fieldKeys: typeof fieldKeys };
    restoredRoutes.loadWarmthSnapshot(throughJson.routeKeys, fixture.world, graph, fixture.doors);
    restoredFields.loadWarmthSnapshot(throughJson.fieldKeys, graph, fixture.doors);
    expect(restoredRoutes.getWarmthSnapshot(graph, fixture.doors)).toEqual(routeKeys);
    expect(restoredFields.getWarmthSnapshot(graph, fixture.doors)).toEqual(fieldKeys);
    expect(restoredRoutes.get(fixture.cellTiles[0]!, destination, context, graph, fixture.doors)).toBeDefined();

    fixture.doors.setState(fixture.canteenEntranceDoorId, 'locked');
    expect(restoredRoutes.get(fixture.cellTiles[0]!, destination, context, graph, fixture.doors)).toBeUndefined();
    expect(restoredFields.get(fieldKeys[0]!.destinationRegion, context, graph, fixture.doors)).toBeUndefined();
    expect(restoredRoutes.getWarmthSnapshot(graph, fixture.doors)).toHaveLength(0);
    expect(restoredFields.getWarmthSnapshot(graph, fixture.doors)).toHaveLength(0);
  });

  it('refuses repeated cache identities rather than silently changing their membership', () => {
    const fixture = buildCellBlockFixture(1);
    const graph = buildFixtureGraph(fixture.world, fixture.doors, fixture.chunkPositions);
    const context = { role: 'guard', securityClearance: 5 };
    const source = new RouteCache();
    const origin = fixture.cellTiles[0]!;
    const destination = fixture.canteenTiles[0]!;
    const dependencies = new Set<string>();
    source.set(origin, destination, context, graph, fixture.doors, findRoute(fixture.world, fixture.doors, graph, origin, destination, context, undefined, dependencies), dependencies);
    const route = source.getWarmthSnapshot(graph, fixture.doors)[0]!;
    const fields = new FlowFieldCache();
    const fieldValue = computeRegionFlowField(graph, fixture.doors, graph.tileToRegion.get(`${destination.x},${destination.y}`)!, context);
    fields.setForContext(fieldValue, context, graph);
    const field = fields.getWarmthSnapshot(graph, fixture.doors)[0]!;
    expect(() => new RouteCache().loadWarmthSnapshot([route, route], fixture.world, graph, fixture.doors)).toThrow('Duplicate route-cache warmth key');
    expect(() => new FlowFieldCache().loadWarmthSnapshot([field, field], graph, fixture.doors)).toThrow('Duplicate flow-field warmth key');
  });

  it('verifies successful values with bounded region search instead of tile A*', () => {
    const fixture = buildCellBlockFixture(24);
    const graph = buildFixtureGraph(fixture.world, fixture.doors, fixture.chunkPositions);
    const context = { role: 'guard', securityClearance: 5, permissions: ['medical-wing'] };
    const origin = fixture.cellTiles[0]!;
    const destination = fixture.canteenTiles[0]!;
    const destinationRegion = graph.tileToRegion.get(`${destination.x},${destination.y}`)!;
    const source = new RouteCache();
    const ids = new Set<string>();
    source.set(origin, destination, context, graph, fixture.doors, findRoute(fixture.world, fixture.doors, graph, origin, destination, context, undefined, ids), ids);
    const stats = { expansions: 0, maxExpansions: 0 };
    expect(() => new RouteCache().loadWarmthSnapshot(source.getWarmthSnapshot(graph, fixture.doors), fixture.world, graph, fixture.doors, stats)).toThrow('restore work budget');
    const fieldSource = new FlowFieldCache();
    fieldSource.setForContext(computeRegionFlowField(graph, fixture.doors, destinationRegion, context), context, graph);
    expect(() => new FlowFieldCache().loadWarmthSnapshot(fieldSource.getWarmthSnapshot(graph, fixture.doors), graph, fixture.doors, stats)).toThrow('restore work budget');
  });

  it('keeps the same oldest-entry eviction after a full-cache save and restore', () => {
    const fixture = buildCellBlockFixture(1);
    const graph = buildFixtureGraph(fixture.world, fixture.doors, fixture.chunkPositions);
    const context = { role: 'guard', securityClearance: 5 };
    const destination = fixture.canteenTiles[0]!;
    const original = new RouteCache();
    const add = (cache: RouteCache, index: number) => cache.set(
      { x: tileCoordinate(10_000 + index), y: tileCoordinate(0) }, destination, context,
      graph, fixture.doors, { ok: false, failure: { reason: 'invalid-origin' } }, [],
    );
    for (let index = 0; index <= MAX_ROUTE_CACHE_WARMTH_KEYS; index += 1) add(original, index);
    expect(original.size()).toBe(MAX_ROUTE_CACHE_WARMTH_KEYS);
    const saved = original.getWarmthSnapshot(graph, fixture.doors);
    expect(saved[0]?.origin.x).toBe(10_001); // first entry was evicted
    const restored = new RouteCache();
    restored.loadWarmthSnapshot(saved, fixture.world, graph, fixture.doors);
    add(original, MAX_ROUTE_CACHE_WARMTH_KEYS + 1);
    add(restored, MAX_ROUTE_CACHE_WARMTH_KEYS + 1);
    expect(restored.getWarmthSnapshot(graph, fixture.doors)).toEqual(original.getWarmthSnapshot(graph, fixture.doors));
    expect(restored.getWarmthSnapshot(graph, fixture.doors)[0]?.origin.x).toBe(10_002);
  });

  it('removes stale live entries before snapshot so a full cache evicts the same route after restore', () => {
    const fixture = buildCellBlockFixture(1);
    const graph = buildFixtureGraph(fixture.world, fixture.doors, fixture.chunkPositions);
    const context = { role: 'guard', securityClearance: 5 };
    const destination = fixture.canteenTiles[0]!;
    const original = new RouteCache();
    const add = (cache: RouteCache, index: number) => {
      if (index === 1) {
        const origin = fixture.cellTiles[0]!;
        const ids = new Set<string>();
        const result = findRoute(fixture.world, fixture.doors, graph, origin, destination, context, undefined, ids);
        cache.set(origin, destination, context, graph, fixture.doors, result, ids);
      } else cache.set(
        { x: tileCoordinate(10_000 + index), y: tileCoordinate(0) }, destination, context,
        graph, fixture.doors, { ok: false, failure: { reason: 'invalid-origin' } }, [],
      );
    };
    for (let index = 0; index <= MAX_ROUTE_CACHE_WARMTH_KEYS; index += 1) add(original, index);
    fixture.doors.setState(fixture.canteenEntranceDoorId, 'locked');
    const saved = original.getWarmthSnapshot(graph, fixture.doors);
    expect(saved).toHaveLength(MAX_ROUTE_CACHE_WARMTH_KEYS - 1);
    expect(original.size()).toBe(saved.length); // stale entry is gone from live eviction order too
    const restored = new RouteCache();
    restored.loadWarmthSnapshot(saved, fixture.world, graph, fixture.doors);
    add(original, MAX_ROUTE_CACHE_WARMTH_KEYS + 1);
    add(restored, MAX_ROUTE_CACHE_WARMTH_KEYS + 1);
    expect(restored.getWarmthSnapshot(graph, fixture.doors)).toEqual(original.getWarmthSnapshot(graph, fixture.doors));
    expect(original.size()).toBe(MAX_ROUTE_CACHE_WARMTH_KEYS);
  });

  it('rejects a forged cached path and a forged door verdict even when the door revision matches', () => {
    const fixture = buildCellBlockFixture(24);
    const graph = buildFixtureGraph(fixture.world, fixture.doors, fixture.chunkPositions);
    const context = { role: 'guard', securityClearance: 5, permissions: ['medical-wing'] };
    const origin = fixture.cellTiles[0]!;
    const destination = fixture.canteenTiles[0]!;
    const dependencies = new Set<string>();
    const cache = new RouteCache();
    cache.set(origin, destination, context, graph, fixture.doors,
      findRoute(fixture.world, fixture.doors, graph, origin, destination, context, undefined, dependencies), dependencies);
    const warm = structuredClone(cache.getWarmthSnapshot(graph, fixture.doors));
    const forgedPath = structuredClone(warm);
    if (!forgedPath[0]?.result.ok) throw new Error('Fixture route must succeed.');
    (forgedPath[0].result as { pathRuns: string }).pathRuns = 'X1;';
    expect(() => new RouteCache().loadWarmthSnapshot(forgedPath, fixture.world, graph, fixture.doors)).toThrow();
    const forgedVerdict = structuredClone(warm);
    const verdict = forgedVerdict[0]!.dependencies.perDoor[0]![1] as { allowed: boolean };
    verdict.allowed = !verdict.allowed;
    expect(() => new RouteCache().loadWarmthSnapshot(forgedVerdict, fixture.world, graph, fixture.doors)).toThrow('door verdict');
  });

  it('rejects omission of an un-crossed candidate door from a successful cached route', () => {
    const fixture = buildRingFixture();
    const graph = buildFixtureGraph(fixture.world, fixture.doors, fixture.chunkPositions);
    const context = { role: 'guard', securityClearance: 5 };
    const origin = fixture.tiles[0]!;
    const destination = fixture.tiles[15]!;
    const ids = new Set<string>();
    const cache = new RouteCache();
    const sourceResult = findRoute(fixture.world, fixture.doors, graph, origin, destination, context, undefined, ids);
    cache.set(origin, destination, context, graph, fixture.doors, sourceResult, ids);
    const altered = structuredClone(cache.getWarmthSnapshot(graph, fixture.doors));
    if (!sourceResult.ok) throw new Error('Ring route must succeed.');
    const crossed = new Set(sourceResult.route.segments.map((segment) => segment.enteredViaDoorId));
    const alternativeIndex = altered[0]!.dependencies.perDoor.findIndex(([id]) => !crossed.has(id));
    if (alternativeIndex < 0) throw new Error('Ring fixture must record an un-crossed candidate door.');
    (altered[0]!.dependencies.perDoor as [string, unknown][]).splice(alternativeIndex, 1);
    expect(() => new RouteCache().loadWarmthSnapshot(altered, fixture.world, graph, fixture.doors)).toThrow('searched door dependency');
  });

  it('rejects a forged but superficially valid flow-field cost', () => {
    const fixture = buildRingFixture();
    const graph = buildFixtureGraph(fixture.world, fixture.doors, fixture.chunkPositions);
    const context = { role: 'guard', securityClearance: 5 };
    const destination = graph.tileToRegion.get(`${fixture.tiles[15]!.x},${fixture.tiles[15]!.y}`)!;
    const cache = new FlowFieldCache();
    cache.setForContext(computeRegionFlowField(graph, fixture.doors, destination, context), context, graph);
    const altered = structuredClone(cache.getWarmthSnapshot(graph, fixture.doors));
    const step = altered[0]!.steps[0] as [number, string, number];
    step[2] += 1;
    expect(() => new FlowFieldCache().loadWarmthSnapshot(altered, graph, fixture.doors)).toThrow('field costs');
  });

  it('keeps the saved door verdict stable when a door returns to its original state', () => {
    const fixture = buildCellBlockFixture(24);
    const graph = buildFixtureGraph(fixture.world, fixture.doors, fixture.chunkPositions);
    const context = { role: 'guard', securityClearance: 5, permissions: ['medical-wing'] };
    const origin = fixture.cellTiles[0]!;
    const destination = fixture.canteenTiles[0]!;
    const dependencies = new Set<string>();
    const cache = new RouteCache();
    cache.set(origin, destination, context, graph, fixture.doors,
      findRoute(fixture.world, fixture.doors, graph, origin, destination, context, undefined, dependencies), dependencies);
    const before = cache.getWarmthSnapshot(graph, fixture.doors)[0]!.dependencies;
    for (let index = 0; index < 12; index += 1) {
      fixture.doors.setState(fixture.canteenEntranceDoorId, 'closed');
      fixture.doors.setState(fixture.canteenEntranceDoorId, 'open');
    }
    const saved = cache.getWarmthSnapshot(graph, fixture.doors);
    expect(saved[0]!.dependencies).toEqual(before);
    expect(() => new RouteCache().loadWarmthSnapshot(saved, fixture.world, graph, fixture.doors)).not.toThrow();
  });
});
