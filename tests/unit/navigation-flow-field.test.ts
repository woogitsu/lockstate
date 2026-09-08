import { describe, expect, it } from 'vitest';
import { tileCoordinate, tileKey } from '../../src/simulation/world/coordinates';
import {
  computeRegionFlowField,
  findRouteUsingFlowField,
  FlowFieldCache,
  getOrComputeRegionFlowField,
} from '../../src/simulation/navigation/flow-field';
import { findRoute } from '../../src/simulation/navigation/router';
import type { RouteContext } from '../../src/simulation/navigation/route-context';
import { buildCellBlockFixture, buildFixtureGraph } from '../helpers/navigation-fixture';
import { expectOk } from '../helpers/expect-ok';

const GUARD: RouteContext = { role: 'guard', securityClearance: 5 };
const PRISONER: RouteContext = { role: 'prisoner', securityClearance: 0 };

describe('computeRegionFlowField / findRouteUsingFlowField: reference comparison against findRoute', () => {
  it('agrees with findRoute on total cost for every reachable cell converging on the canteen', () => {
    const fixture = buildCellBlockFixture(24);
    const graph = buildFixtureGraph(fixture.world, fixture.doors, fixture.chunkPositions);
    const canteenEntry = fixture.canteenTiles[0]!;
    const destinationRegion = graph.tileToRegion.get(tileKey(canteenEntry))!;

    const field = computeRegionFlowField(graph, fixture.doors, destinationRegion, GUARD);

    let comparedCount = 0;
    for (const cellTile of fixture.cellTiles) {
      const viaField = findRouteUsingFlowField(field, fixture.world, fixture.doors, graph, cellTile, canteenEntry, undefined);
      const viaFullSearch = findRoute(fixture.world, fixture.doors, graph, cellTile, canteenEntry, GUARD);

      if (viaFullSearch.ok) {
        // `findRouteUsingFlowField` answers `RouteResult | undefined`, so
        // definedness is asserted first and `expectOk` narrows what is left.
        expect(viaField, 'the field must cover a cell the full search reaches').toBeDefined();
        expectOk(viaField!, 'the flow-field route from this cell');
        expect(viaField.route.totalCost).toBe(viaFullSearch.route.totalCost);
        comparedCount += 1;
      }
    }

    // Sanity: the guard (full clearance) must actually reach the canteen from most cells.
    expect(comparedCount).toBeGreaterThan(10);
  });

  it('returns undefined (fall back to findRoute) for an origin the field does not cover, e.g. permission-denied for a prisoner', () => {
    const fixture = buildCellBlockFixture(24);
    const graph = buildFixtureGraph(fixture.world, fixture.doors, fixture.chunkPositions);
    const canteenEntry = fixture.canteenTiles[0]!;
    const destinationRegion = graph.tileToRegion.get(tileKey(canteenEntry))!;

    const field = computeRegionFlowField(graph, fixture.doors, destinationRegion, PRISONER);

    // Cell 0 (index 0) requires no permission/clearance (0 % 4 === 0, not a medical-only door),
    // so it IS covered; find one that a plain prisoner cannot reach instead: index 5 needs 'medical-wing'.
    const blockedCell = fixture.cellTiles[5]!;
    const viaField = findRouteUsingFlowField(field, fixture.world, fixture.doors, graph, blockedCell, canteenEntry, undefined);
    const viaFullSearch = findRoute(fixture.world, fixture.doors, graph, blockedCell, canteenEntry, PRISONER);

    expect(viaFullSearch.ok).toBe(false);
    expect(viaField).toBeUndefined();
  });

  it('reports invalid-origin/invalid-destination directly without needing a findRoute fallback', () => {
    const fixture = buildCellBlockFixture(6);
    const graph = buildFixtureGraph(fixture.world, fixture.doors, fixture.chunkPositions);
    const canteenEntry = fixture.canteenTiles[0]!;
    const destinationRegion = graph.tileToRegion.get(tileKey(canteenEntry))!;
    const field = computeRegionFlowField(graph, fixture.doors, destinationRegion, GUARD);

    const farAway = { x: tileCoordinate(9999), y: tileCoordinate(9999) };
    const result = findRouteUsingFlowField(field, fixture.world, fixture.doors, graph, farAway, canteenEntry, undefined);
    expect(result).toEqual({ ok: false, failure: { reason: 'invalid-origin' } });

    // The `invalid-destination` half of this title exercised nothing until
    // 2026-09-08. Returning `invalid-origin` for an off-map destination left
    // this test green, and so did every other vitest file that mentions
    // `findRouteUsingFlowField` or `invalid-destination` -- 22 tests, all
    // green with the two reasons confused.
    const offMapDestination = findRouteUsingFlowField(field, fixture.world, fixture.doors, graph, fixture.cellTiles[0]!, farAway, undefined);
    expect(offMapDestination).toEqual({ ok: false, failure: { reason: 'invalid-destination' } });

    // "Without needing a findRoute fallback" is the rest of the title, and
    // `undefined` is exactly the value this function returns to ask for that
    // fallback (see the test above). Both assertions above are `toEqual`
    // against a concrete refusal, so neither can be satisfied by one.
    expect(result).not.toBeUndefined();
    expect(offMapDestination).not.toBeUndefined();
  });
});

describe('FlowFieldCache: hit/miss/eviction/invalidation metrics', () => {
  it('computes once and reuses the field on subsequent lookups for the same destination/context', () => {
    const fixture = buildCellBlockFixture(12);
    const graph = buildFixtureGraph(fixture.world, fixture.doors, fixture.chunkPositions);
    const canteenEntry = fixture.canteenTiles[0]!;
    const destinationRegion = graph.tileToRegion.get(tileKey(canteenEntry))!;
    const cache = new FlowFieldCache();

    const first = getOrComputeRegionFlowField(cache, graph, fixture.doors, destinationRegion, GUARD);
    const second = getOrComputeRegionFlowField(cache, graph, fixture.doors, destinationRegion, GUARD);
    expect(second).toBe(first); // same cached object identity, not merely equal

    const metrics = cache.getMetrics();
    expect(metrics.misses).toBe(1);
    expect(metrics.hits).toBe(1);
  });

  it('evicts (targeted) when a door the field depends on changes state', () => {
    const fixture = buildCellBlockFixture(12);
    const graph = buildFixtureGraph(fixture.world, fixture.doors, fixture.chunkPositions);
    const canteenEntry = fixture.canteenTiles[0]!;
    const destinationRegion = graph.tileToRegion.get(tileKey(canteenEntry))!;
    const cache = new FlowFieldCache();

    getOrComputeRegionFlowField(cache, graph, fixture.doors, destinationRegion, GUARD);
    fixture.doors.setState('canteen-entrance', 'closed');
    expect(cache.get(destinationRegion, GUARD, graph, fixture.doors)).toBeUndefined();

    const metrics = cache.getMetrics();
    expect(metrics.evictions).toBe(1);
  });

  it('invalidates on geometry change', () => {
    const fixture = buildCellBlockFixture(12);
    const graphBefore = buildFixtureGraph(fixture.world, fixture.doors, fixture.chunkPositions);
    const canteenEntry = fixture.canteenTiles[0]!;
    const destinationRegion = graphBefore.tileToRegion.get(tileKey(canteenEntry))!;
    const cache = new FlowFieldCache();

    getOrComputeRegionFlowField(cache, graphBefore, fixture.doors, destinationRegion, GUARD);
    fixture.world.markGeometryChanged(fixture.chunkPositions[0]!);
    const graphAfter = buildFixtureGraph(fixture.world, fixture.doors, fixture.chunkPositions);

    expect(cache.get(destinationRegion, GUARD, graphAfter, fixture.doors)).toBeUndefined();
    expect(cache.getMetrics().geometryInvalidations).toBe(1);
  });
});
