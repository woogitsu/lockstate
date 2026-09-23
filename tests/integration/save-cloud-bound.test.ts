import { describe, expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { CLOUD_SAVE_PAYLOAD_BYTE_BOUND, jsonbTextByteLength } from '../../src/shared/save-size';
import type { NavigationCacheSnapshot, RouteCacheEntrySnapshot } from '../../src/simulation/navigation/cache-snapshot';
import { CACHE_TRIM_MARGIN_BYTES, captureSessionSnapshot, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { buildPrisonFixture, PRISON_SIZE_TIERS } from '../perf/fixtures/prison-fixture';

/**
 * **The carried route caches never take a save over ADR 0013's cloud bound**
 * -- ADR 0007's amendment of 2026-09-23, on the coordinator's finding that
 * carrying them unbounded could refuse a large prison's cloud save.
 *
 * The fixture is the largest this repository measures: the x-large benchmark
 * tier (1,024 loaded chunks, 5,000 build orders, 3,000 prisoners), whose
 * payload without any cache is already 95 % of 4 MiB as the cloud measures it.
 * Its caches are then filled with far more than fits -- 20,000 long legs,
 * several megabytes -- through the same `loadCacheSnapshot` a restore uses, so
 * what is measured is a live session's capture rather than a hand-built
 * payload. The expected sizes come from `jsonbTextByteLength`, which matched
 * Postgres 16's `octet_length(payload::jsonb::text)` to the byte on this tier
 * (`tests/unit/save-size.test.ts` records that check).
 */

function envelopeOf(bundle: SessionSnapshotBundle) {
  return createSaveEnvelope({
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
    gameVersion: 'lockstate-0.0.0',
    prisonId: 'save-cloud-bound',
    revision: 1,
    createdAt: 1,
    updatedAt: 2,
    kernel: bundle.kernel,
    world: bundle.world,
    construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
  });
}

/** `count` straight legs east, 120 steps each, from distinct origins inside the fixture's loaded area; recency 1 is the first. */
function overfilledCaches(count: number): NavigationCacheSnapshot {
  const routes: RouteCacheEntrySnapshot[] = [];
  const steps = 120;
  for (let index = 0; index < count; index += 1) {
    const x = index % 800;
    const y = Math.floor(index / 800);
    routes.push({
      recency: index + 1,
      origin: { x: tileCoordinate(x), y: tileCoordinate(y) },
      destination: { x: tileCoordinate(x + steps), y: tileCoordinate(y) },
      context: 0,
      result: { ok: true, path: 'E'.repeat(steps), totalCost: steps, segments: [[1, steps + 1]] },
      dependencies: { revisionUnchanged: true, unchanged: [] },
    });
  }
  // Ascending by cache key, as a capture writes them.
  const key = (route: RouteCacheEntrySnapshot) => `${String(route.origin.x)},${String(route.origin.y)}->${String(route.destination.x)},${String(route.destination.y)}#prisoner|0||0`;
  routes.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  return { doorIds: [], contexts: [{ role: 'prisoner', securityClearance: 0 }], routes, flowFields: [] };
}

describe('a save of the largest measured prison stays under the cloud bound whatever its caches hold (ADR 0013, #1373)', () => {
  it('trims the caches to what the rest of the payload leaves, keeping the most recently used', { timeout: 300_000 }, () => {
    const fixture = buildPrisonFixture(PRISON_SIZE_TIERS.find((tier) => tier.id === 'x-large')!);
    const runtime = fixture.runtime;
    const limit = CLOUD_SAVE_PAYLOAD_BYTE_BOUND - CACHE_TRIM_MARGIN_BYTES;

    const withoutCaches = jsonbTextByteLength(envelopeOf(captureSessionSnapshot(runtime)).payload);
    expect(withoutCaches, 'the fixture must fit on its own, or the caches are not what this measures').toBeLessThan(limit);

    const count = 20_000;
    const overfilled = overfilledCaches(count);
    runtime.navigation.loadCacheSnapshot(overfilled);
    const unbounded = runtime.navigation.captureCacheSnapshot();
    expect(unbounded.routes, 'the whole overfill must be live in the cache').toHaveLength(count);
    expect(withoutCaches + jsonbTextByteLength(unbounded), 'carried whole, the caches would take the save over the bound').toBeGreaterThan(CLOUD_SAVE_PAYLOAD_BYTE_BOUND);

    const bundle = captureSessionSnapshot(runtime);
    const envelope = envelopeOf(bundle);
    const payloadBytes = jsonbTextByteLength(envelope.payload);
    const carried = bundle.simulation!.inFlight!.navigation.caches!;

    expect(payloadBytes, 'under the bound with the margin as headroom').toBeLessThanOrEqual(limit);
    expect(carried.routes.length).toBeGreaterThan(0);
    expect(carried.routes.length).toBeLessThan(count);
    // Filled up to the budget, not merely under it: one more entry would not fit.
    const oneEntry = jsonbTextByteLength(unbounded.routes[0]) + 2;
    expect(limit - payloadBytes).toBeLessThan(2 * oneEntry);

    // The most recently used survive: the carried ones are exactly the last
    // `kept` loaded, which are the ones with the highest recency.
    const kept = carried.routes.length;
    const survivors = new Set(carried.routes.map((route) => `${String(route.origin.x)},${String(route.origin.y)}`));
    const expected = new Set(
      overfilled.routes.filter((route) => route.recency > count - kept).map((route) => `${String(route.origin.x)},${String(route.origin.y)}`),
    );
    expect(survivors).toEqual(expected);

    // And it is a save this build reads back.
    const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
    expect(decoded.ok).toBe(true);
  });
});
