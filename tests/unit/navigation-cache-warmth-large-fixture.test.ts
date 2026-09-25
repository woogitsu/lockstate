import { it } from 'vitest';
import { buildCellBlockFixture, buildFixtureGraph } from '../helpers/navigation-fixture';
import { RouteCache } from '../../src/simulation/navigation/route-cache';
import { findRoute } from '../../src/simulation/navigation/router';
import { MAX_CACHE_WARMTH_REBUILD_EXPANSIONS } from '../../src/simulation/navigation/cache-limits';

it('roundtrips every valid route in a 250-cell prison with bounded region-only verification', () => {
  const fixture = buildCellBlockFixture(250);
  const graph = buildFixtureGraph(fixture.world, fixture.doors, fixture.chunkPositions);
  const cache = new RouteCache();
  const context = { role: 'guard', securityClearance: 5, permissions: ['medical-wing'] };
  for (const destination of fixture.canteenTiles) for (const origin of fixture.cellTiles) {
    const ids = new Set<string>();
    const result = findRoute(fixture.world, fixture.doors, graph, origin, destination, context, undefined, ids);
    cache.set(origin, destination, context, graph, fixture.doors, result, ids);
  }
  const warm = cache.getWarmthSnapshot(graph, fixture.doors);
  if (warm.length !== 2250) throw new Error(`Expected 2,250 warm routes, got ${warm.length}.`);
  if (JSON.stringify(warm).length > 16 * 1024 * 1024) throw new Error('250-cell route cache exceeds the save byte ceiling.');
  const restored = new RouteCache();
  const stats = { expansions: 0, maxExpansions: MAX_CACHE_WARMTH_REBUILD_EXPANSIONS };
  const loadStart = performance.now();
  restored.loadWarmthSnapshot(JSON.parse(JSON.stringify(warm)), fixture.world, graph, fixture.doors, stats);
  if (process.env.RUN_NAVIGATION_WARMTH_BENCH === '1') {
    process.stdout.write(`WARMTH 250 guard keys=${warm.length} bytes=${JSON.stringify(warm).length} loadMs=${(performance.now() - loadStart).toFixed(0)} expansions=${stats.expansions}\n`);
  }
  if (restored.size() !== warm.length || stats.expansions > MAX_CACHE_WARMTH_REBUILD_EXPANSIONS) throw new Error('Roundtrip lost entries or exceeded the region verification budget.');
}, 10_000);

it('roundtrips 2,250 blocked prisoner routes within the live failure-verification budget', () => {
  const fixture = buildCellBlockFixture(250);
  const graph = buildFixtureGraph(fixture.world, fixture.doors, fixture.chunkPositions);
  const cache = new RouteCache();
  const context = { role: 'prisoner', securityClearance: 0 };
  for (const destination of fixture.canteenTiles) for (const origin of fixture.cellTiles) {
    const ids = new Set<string>();
    cache.set(origin, destination, context, graph, fixture.doors,
      findRoute(fixture.world, fixture.doors, graph, origin, destination, context, undefined, ids), ids);
  }
  const warm = cache.getWarmthSnapshot(graph, fixture.doors);
  if (warm.length < 2000 || warm.length > 2250) throw new Error(`Unexpected bounded prisoner cache size: ${warm.length}.`);
  const restored = new RouteCache();
  const stats = { expansions: 0, maxExpansions: MAX_CACHE_WARMTH_REBUILD_EXPANSIONS };
  const loadStart = performance.now();
  restored.loadWarmthSnapshot(JSON.parse(JSON.stringify(warm)), fixture.world, graph, fixture.doors, stats);
  if (process.env.RUN_NAVIGATION_WARMTH_BENCH === '1') {
    process.stdout.write(`WARMTH 250 prisoner keys=${warm.length} bytes=${JSON.stringify(warm).length} loadMs=${(performance.now() - loadStart).toFixed(0)} expansions=${stats.expansions}\n`);
  }
  if (restored.size() !== warm.length || stats.expansions > MAX_CACHE_WARMTH_REBUILD_EXPANSIONS) throw new Error('Blocked route roundtrip exceeded its budget.');
}, 10_000);
