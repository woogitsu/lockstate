import { expect, test } from './network-changed-fixture';
import { openHarness, reloadHarness } from './harness-fixture';

/**
 * Durability of `IndexedDbLocalSaveStore` + `PrisonSaveRepository` against a
 * real browser IndexedDB.
 *
 * `tests/integration/persistence-local-indexeddb.test.ts` already proves the
 * adapter's shape against `fake-indexeddb`; what it structurally cannot prove
 * is that a save outlives the JavaScript realm that wrote it. Every test here
 * therefore navigates the page between writing and reading. Playwright gives
 * each test a fresh browser context, so every test starts against empty
 * origin storage.
 */

const PRISON = 'browser-prison';

test.describe('local save durability', () => {
  test('a saved prison is still readable after the page is reloaded', async ({ page }) => {
    await openHarness(page);
    await page.evaluate((prisonId) => window.lockstateHarness.createPrison(prisonId, 'Cell Block A'), PRISON);
    const saved = await page.evaluate((prisonId) => window.lockstateHarness.save(prisonId, 7), PRISON);
    expect(saved.ok).toBe(true);

    // A real navigation: the page, its module graph and every IDBDatabase
    // connection are torn down and rebuilt from what actually reached disk.
    await reloadHarness(page);

    expect(await page.evaluate((prisonId) => window.lockstateHarness.loadCurrent(prisonId), PRISON)).toMatchObject({
      ok: true,
      outcome: 'current',
      revision: 7,
      generationId: saved.generationId,
    });
    expect(await page.evaluate(() => window.lockstateHarness.listPrisons())).toMatchObject([
      { prisonId: PRISON, displayName: 'Cell Block A' },
    ]);
  });

  test('a fresh browser context starts from empty storage', async ({ page }) => {
    await openHarness(page);
    expect(await page.evaluate(() => window.lockstateHarness.listPrisons())).toEqual([]);
  });

  test('generation retention keeps the current generation plus two previous ones on disk', async ({ page }) => {
    await openHarness(page);
    await page.evaluate((prisonId) => window.lockstateHarness.createPrison(prisonId), PRISON);

    const generationIds: string[] = [];
    for (let revision = 1; revision <= 4; revision += 1) {
      // eslint-disable-next-line no-await-in-loop -- saves must be sequential to produce ordered generations
      const result = await page.evaluate(
        ([prisonId, rev]) => window.lockstateHarness.save(prisonId, rev),
        [PRISON, revision] as const,
      );
      expect(result.ok).toBe(true);
      generationIds.push(result.generationId ?? '');
    }

    await reloadHarness(page);

    const [slot] = await page.evaluate(() => window.lockstateHarness.listPrisons());
    expect(slot?.generationIds).toEqual(generationIds.slice(1));
    expect(slot?.currentGenerationId).toBe(generationIds[3]);

    // The pruned generation is really gone from the object store, and the
    // oldest retained one really survived — not just the metadata list.
    expect(
      await page.evaluate(
        ([prisonId, generationId]) => window.lockstateHarness.generationExists(prisonId, generationId),
        [PRISON, generationIds[0] ?? ''] as const,
      ),
    ).toBe(false);
    expect(
      await page.evaluate(
        ([prisonId, generationId]) => window.lockstateHarness.generationExists(prisonId, generationId),
        [PRISON, generationIds[1] ?? ''] as const,
      ),
    ).toBe(true);
  });

  test('loadCurrent walks back to the previous good generation when the newest one is corrupt', async ({ page }) => {
    await openHarness(page);
    await page.evaluate((prisonId) => window.lockstateHarness.createPrison(prisonId), PRISON);
    const first = await page.evaluate((prisonId) => window.lockstateHarness.save(prisonId, 1), PRISON);
    const second = await page.evaluate((prisonId) => window.lockstateHarness.save(prisonId, 2), PRISON);
    expect(second.ok).toBe(true);

    await page.evaluate(
      ([prisonId, generationId]) => window.lockstateHarness.corruptGeneration(prisonId, generationId),
      [PRISON, second.generationId ?? ''] as const,
    );

    // Reload first, so recovery runs against corruption that is genuinely on
    // disk rather than against a value this realm happens to still hold.
    await reloadHarness(page);

    expect(await page.evaluate((prisonId) => window.lockstateHarness.loadCurrent(prisonId), PRISON)).toMatchObject({
      ok: true,
      outcome: 'recovered-previous',
      revision: 1,
      generationId: first.generationId,
    });

    // Recovery healed the pointer and dropped the corrupt generation — and
    // that healing was itself durable.
    await reloadHarness(page);
    expect(await page.evaluate((prisonId) => window.lockstateHarness.loadCurrent(prisonId), PRISON)).toMatchObject({
      ok: true,
      outcome: 'current',
      revision: 1,
    });
    expect(
      await page.evaluate(
        ([prisonId, generationId]) => window.lockstateHarness.generationExists(prisonId, generationId),
        [PRISON, second.generationId ?? ''] as const,
      ),
    ).toBe(false);
  });

  test('a prison whose every retained generation is corrupt reports no-valid-generation', async ({ page }) => {
    await openHarness(page);
    await page.evaluate((prisonId) => window.lockstateHarness.createPrison(prisonId), PRISON);
    const first = await page.evaluate((prisonId) => window.lockstateHarness.save(prisonId, 1), PRISON);
    const second = await page.evaluate((prisonId) => window.lockstateHarness.save(prisonId, 2), PRISON);

    for (const generationId of [first.generationId ?? '', second.generationId ?? '']) {
      // eslint-disable-next-line no-await-in-loop -- sequential corruption keeps the failure attributable
      await page.evaluate(
        ([prisonId, id]) => window.lockstateHarness.corruptGeneration(prisonId, id),
        [PRISON, generationId] as const,
      );
    }

    await reloadHarness(page);
    expect(await page.evaluate((prisonId) => window.lockstateHarness.loadCurrent(prisonId), PRISON)).toMatchObject({
      ok: false,
      reason: 'no-valid-generation',
    });
  });
});
