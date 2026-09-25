import { expect, it } from 'vitest';
import { buildCellBlockFixture, buildFixtureGraph } from '../helpers/navigation-fixture';
import { RouteCache, findRouteCached } from '../../src/simulation/navigation/route-cache';
import { findRoute } from '../../src/simulation/navigation/router';
import { MAX_CACHE_WARMTH_REBUILD_EXPANSIONS } from '../../src/simulation/navigation/cache-limits';

/** Opt-in: building 10,000 distinct routes takes roughly a minute on a development machine. */
const benchmark = process.env.RUN_NAVIGATION_WARMTH_BENCH === '1' ? it : it.skip;

benchmark('5,000-cell full-value restore latency and writer/reader symmetry', () => {
  const fixture = buildCellBlockFixture(5000);
  const graph = buildFixtureGraph(fixture.world, fixture.doors, fixture.chunkPositions);
  const destination = fixture.canteenTiles[0]!;
  for (const context of [
    { role: 'guard', securityClearance: 5, permissions: ['medical-wing'] },
    { role: 'prisoner', securityClearance: 0 },
  ]) {
    const cache = new RouteCache();
    const writeStart = performance.now();
    for (const origin of fixture.cellTiles) {
      const ids = new Set<string>();
      cache.set(origin, destination, context, graph, fixture.doors,
        findRoute(fixture.world, fixture.doors, graph, origin, destination, context, undefined, ids), ids);
    }
    const warmth = cache.getWarmthSnapshot(graph, fixture.doors);
    const writeEnd = performance.now();
    const beforeHits = cache.getMetrics().hits;
    const repeatedSearch = { expansions: 0 };
    for (const origin of fixture.cellTiles) {
      findRouteCached(cache, (ids) => findRoute(fixture.world, fixture.doors, graph, origin, destination, context, repeatedSearch, ids),
        origin, destination, context, graph, fixture.doors);
    }
    const repeatedHits = cache.getMetrics().hits - beforeHits;
    const repeatEnd = performance.now();
    const loadStart = performance.now();
    const json = JSON.stringify(warmth);
    const stats = { expansions: 0, maxExpansions: MAX_CACHE_WARMTH_REBUILD_EXPANSIONS };
    const restored = new RouteCache();
    restored.loadWarmthSnapshot(JSON.parse(json), fixture.world, graph, fixture.doors, stats);
    const loadEnd = performance.now();
    expect(restored.getWarmthSnapshot(graph, fixture.doors)).toEqual(warmth);
    process.stdout.write(`WARMTH role=${context.role} keys=${warmth.length} repeatHits=${repeatedHits}/5000 repeatExpansions=${repeatedSearch.expansions} bytes=${json.length} writerMs=${(writeEnd - writeStart).toFixed(0)} repeatMs=${(repeatEnd - writeEnd).toFixed(0)} loadMs=${(loadEnd - loadStart).toFixed(0)} verifyExpansions=${stats.expansions}\n`);
  }
}, 180_000);
