import { expect, test } from '@playwright/test';
import { openHarness } from './harness-fixture';

/**
 * Quota-exhaustion behavior against a genuinely enforced browser limit.
 *
 * `fake-indexeddb` has no quota model at all, so `quota-exceeded` was
 * previously only ever produced by handing `classifyStoreError` a synthetic
 * `Error` named `QuotaExceededError`. Here the limit is real: Chromium's
 * quota manager is told (over CDP) to cap this origin, `navigator.storage
 * .estimate()` is asserted to report that cap, and storage is then filled
 * with incompressible random bytes until the browser itself refuses a write.
 * Nothing about the failure is simulated.
 */

const QUOTA_BYTES = 4 * 1024 * 1024;
const PRISON = 'quota-prison';

async function capOriginQuota(page: import('@playwright/test').Page): Promise<void> {
  const client = await page.context().newCDPSession(page);
  await client.send('Storage.overrideQuotaForOrigin', {
    origin: new URL(page.url()).origin,
    quotaSize: QUOTA_BYTES,
  });
}

test.describe('quota exhaustion', () => {
  test('a real QuotaExceededError from a full origin classifies as quota-exceeded', async ({ page }) => {
    await openHarness(page);
    await capOriginQuota(page);

    const capped = await page.evaluate(() => window.lockstateHarness.estimateQuota());
    expect(capped.quota, 'the CDP quota override did not take effect').toBe(QUOTA_BYTES);

    const fill = await page.evaluate(() => window.lockstateHarness.fillUntilWriteFails(1024 * 1024, 32));
    expect(fill.failure, 'storage never filled up; the quota cap is not being enforced').not.toBeNull();
    expect(fill.chunksWritten).toBeGreaterThan(0);
    expect(fill.failure?.errorName).toBe('QuotaExceededError');
    expect(fill.failure?.isError).toBe(true);
    expect(fill.failure?.isDomException).toBe(true);
    expect(fill.failure?.classifiedAs).toBe('quota-exceeded');
  });

  test('a save that exceeds the quota fails without destroying the last good generation', async ({ page }) => {
    await openHarness(page);
    await capOriginQuota(page);

    await page.evaluate((prisonId) => window.lockstateHarness.createPrison(prisonId), PRISON);
    const good = await page.evaluate((prisonId) => window.lockstateHarness.save(prisonId, 1), PRISON);
    expect(good.ok).toBe(true);

    // Fill coarsely, then finely, so the origin ends up hard against the cap
    // rather than a megabyte short of it.
    expect((await page.evaluate(() => window.lockstateHarness.fillUntilWriteFails(1024 * 1024, 32))).failure).not.toBeNull();
    expect((await page.evaluate(() => window.lockstateHarness.fillUntilWriteFails(32 * 1024, 256))).failure).not.toBeNull();

    const rejected = await page.evaluate((prisonId) => window.lockstateHarness.save(prisonId, 2, 8 * 1024), PRISON);
    expect(rejected.ok).toBe(false);
    expect(rejected.errorCode).toBe('quota-exceeded');

    // The generation-rotation guarantee under a real, hard storage failure:
    // the failed write neither advanced the pointer nor destroyed revision 1.
    expect(await page.evaluate((prisonId) => window.lockstateHarness.loadCurrent(prisonId), PRISON)).toMatchObject({
      ok: true,
      outcome: 'current',
      revision: 1,
      generationId: good.generationId,
    });

    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.lockstateHarness.takeUnhandledRejections())).toEqual([]);
  });
});
