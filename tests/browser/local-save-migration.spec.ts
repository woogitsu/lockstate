import { expect, test } from '@playwright/test';
import { openHarness, reloadHarness } from './harness-fixture';

/**
 * The save-schema V1 -> V2 upgrade (#50) against a real browser IndexedDB.
 *
 * `tests/migrations/save-v1-to-v2.test.ts` already proves the migration
 * itself, in-process, from a JSON fixture. What it structurally cannot prove
 * is the situation a player is actually in: a V1 save that a *previous build*
 * left in real origin storage, read back in a later page load by a build that
 * only knows V2. That path differs from the in-process one in ways only a real
 * browser exercises — the record is transported by structured clone rather
 * than JSON, it survives a navigation that discards the realm that wrote it,
 * and the migration runs inside the repository's recovery scan rather than
 * being called directly.
 *
 * The V1 records here are built from the same checked-in fixture
 * (`tests/fixtures/persistence/save-v1-in-progress.json`) the in-process
 * migration test uses, so the two layers cannot drift into disagreeing about
 * what a V1 save looked like.
 */

const PRISON = 'legacy-prison';

/** The fixture's V1 ledger: 8 slots, index 0 recycled once, indices 0-1 live, empty free list. */
const V1_GENERATIONS_FLAT = [1, 0, 0, 0, 0, 0, 0, 0];
const V1_ALIVE_FLAT = [1, 1, 0, 0, 0, 0, 0, 0];
const V2_GENERATIONS_RUNS = [
  [1, 1],
  [0, 7],
];

const V1_ENTITY_FIELDS = ['alive', 'capacity', 'freeCount', 'freeIndices', 'generations', 'maxActiveIndex', 'nextAvailableIndex'];
/** V2 drops `freeCount`: it *is* `freeIndices.length`, so the two can no longer disagree. */
const V2_ENTITY_FIELDS = ['alive', 'capacity', 'freeIndices', 'generations', 'maxActiveIndex', 'nextAvailableIndex'];

test.describe('V1 -> V2 migration against real IndexedDB', () => {
  test('a V1 save left by an older build still loads, and migrates, after a real navigation', async ({ page }) => {
    await openHarness(page);
    await page.evaluate(
      (prisonId) => window.lockstateHarness.seedLegacyV1Prison(prisonId, [{ generationId: 'legacy-gen-1', revision: 7 }]),
      PRISON,
    );

    // Confirm the record on disk is genuinely V1 before anything reads it,
    // otherwise this test could be migrating something it invented itself.
    expect(
      await page.evaluate((prisonId) => window.lockstateHarness.readStoredGeneration(prisonId, 'legacy-gen-1'), PRISON),
    ).toMatchObject({
      exists: true,
      saveSchemaVersion: 1,
      entityFields: V1_ENTITY_FIELDS,
      rawGenerations: V1_GENERATIONS_FLAT,
    });

    // A real navigation: the writing realm and every IDBDatabase connection
    // are gone, so what migrates is what actually reached storage.
    await reloadHarness(page);

    const loaded = await page.evaluate((prisonId) => window.lockstateHarness.loadCurrent(prisonId), PRISON);
    expect(loaded).toMatchObject({
      ok: true,
      outcome: 'current',
      generationId: 'legacy-gen-1',
      revision: 7,
      saveSchemaVersion: 2,
    });

    // The migrated ledger reproduces the V1 one exactly — same capacity, same
    // generation counters, same liveness, same live free-list prefix — routed
    // through the production decoder rather than compared as raw runs.
    expect(loaded.entities).toEqual(await page.evaluate(() => window.lockstateHarness.legacyV1Liveness()));
    expect(loaded.entities).toMatchObject({
      capacity: 8,
      nextAvailableIndex: 2,
      maxActiveIndex: 1,
      freeCount: 0,
      generations: V1_GENERATIONS_FLAT,
      alive: V1_ALIVE_FLAT,
      freeIndices: [],
    });
  });

  test('loading migrates in memory only; the next save is what writes V2 to disk, durably', async ({ page }) => {
    await openHarness(page);
    await page.evaluate(
      (prisonId) => window.lockstateHarness.seedLegacyV1Prison(prisonId, [{ generationId: 'legacy-gen-1', revision: 7 }]),
      PRISON,
    );
    await reloadHarness(page);

    expect(await page.evaluate((prisonId) => window.lockstateHarness.loadCurrent(prisonId), PRISON)).toMatchObject({ ok: true });
    // `loadCurrent` decodes and migrates but never rewrites: the stored record
    // is still exactly the V1 one the older build left.
    expect(
      await page.evaluate((prisonId) => window.lockstateHarness.readStoredGeneration(prisonId, 'legacy-gen-1'), PRISON),
    ).toMatchObject({ saveSchemaVersion: 1, entityFields: V1_ENTITY_FIELDS });

    // The upgrade-on-next-save path: re-persist the envelope the load produced.
    const resaved = await page.evaluate((prisonId) => window.lockstateHarness.resaveCurrent(prisonId), PRISON);
    expect(resaved.ok).toBe(true);

    await reloadHarness(page);

    const stored = await page.evaluate(
      ([prisonId, generationId]) => window.lockstateHarness.readStoredGeneration(prisonId, generationId),
      [PRISON, resaved.generationId ?? ''] as const,
    );
    expect(stored).toMatchObject({
      exists: true,
      saveSchemaVersion: 2,
      entityFields: V2_ENTITY_FIELDS,
      // Population-shaped on disk, not capacity-shaped: this is the whole
      // point of #50, asserted against bytes that survived a navigation.
      rawGenerations: V2_GENERATIONS_RUNS,
      rawFreeIndices: [],
    });

    // The upgraded save re-reads as a native current-version save with the
    // same liveness the V1 record carried — nothing was lost in the upgrade.
    const reloaded = await page.evaluate((prisonId) => window.lockstateHarness.loadCurrent(prisonId), PRISON);
    expect(reloaded).toMatchObject({ ok: true, outcome: 'current', revision: 7, saveSchemaVersion: 2 });
    expect(reloaded.entities).toEqual(await page.evaluate(() => window.lockstateHarness.legacyV1Liveness()));
  });

  test('a corrupt V1 generation is rejected at V1 and recovery falls back to the previous V1 generation', async ({ page }) => {
    await openHarness(page);
    await page.evaluate(
      (prisonId) =>
        window.lockstateHarness.seedLegacyV1Prison(prisonId, [
          { generationId: 'legacy-gen-1', revision: 5 },
          { generationId: 'legacy-gen-2', revision: 6, tampered: true },
        ]),
      PRISON,
    );
    await reloadHarness(page);

    // The V1 -> V2 step recomputes the checksum, so this is what proves that
    // did not cost corruption detection: the stored checksum is verified
    // against the payload as written, at V1, before any step runs — here
    // against a record that really came back off disk.
    const recovered = await page.evaluate((prisonId) => window.lockstateHarness.loadCurrent(prisonId), PRISON);
    expect(recovered).toMatchObject({
      ok: true,
      outcome: 'recovered-previous',
      generationId: 'legacy-gen-1',
      revision: 5,
      saveSchemaVersion: 2,
    });
    expect(recovered.entities).toEqual(await page.evaluate(() => window.lockstateHarness.legacyV1Liveness()));

    // Recovery dropped the corrupt V1 generation and healed the pointer, and
    // that healing was itself durable.
    expect(
      await page.evaluate((prisonId) => window.lockstateHarness.generationExists(prisonId, 'legacy-gen-2'), PRISON),
    ).toBe(false);

    await reloadHarness(page);
    expect(await page.evaluate((prisonId) => window.lockstateHarness.loadCurrent(prisonId), PRISON)).toMatchObject({
      ok: true,
      outcome: 'current',
      revision: 5,
    });
  });
});
