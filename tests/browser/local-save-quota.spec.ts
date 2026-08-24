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

/**
 * The payload of the save that must be refused, and the headroom bound below.
 *
 * Named because it is used twice and the two uses must agree: a save the fill
 * left room for is a save that succeeds, and the test then reports the
 * opposite of what it means.
 */
const OVERSIZED_SAVE_BYTES = 8 * 1024;

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

    // `errors.ts` cites this spec for the observation that a real
    // QuotaExceededError carries an **empty** message, which is the sole
    // reason its name fallback exists. Assert both halves, so neither the
    // observation nor the fallback it justifies can go stale unnoticed: if a
    // future Chromium starts supplying a message, this fails and the fallback
    // should be re-examined rather than quietly becoming dead code.
    expect(fill.failure?.errorMessage, 'Chromium no longer reports an empty QuotaExceededError message').toBe('');
    expect(fill.failure?.classifiedMessage, 'the single failure a player is most likely to hit reported blank evidence').toBe(
      'QuotaExceededError',
    );
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

    /*
     * The precondition, asserted rather than assumed (#227).
     *
     * Everything below is sound only while the save genuinely does not fit.
     * That is a property of the **machine**, not of the fixture: the cap is set
     * over CDP, but the usage is reached by filling real storage until the
     * browser refuses a write, and the two passes above are coarse-then-fine
     * precisely because the boundary is approached rather than set. If they
     * both report a failure while headroom remains -- accounting granularity,
     * eviction between the fill and the save, another origin moving under the
     * same quota -- the save succeeds and `expect(rejected.ok).toBe(false)`
     * fails with a message about generation rotation, which is the wrong
     * diagnosis for a test whose fill fell short.
     *
     * PR #218 hit exactly one such failure and spent an investigation on it;
     * it has not reproduced since (#227), so this is not a fix for a known bug
     * but a true statement about what the assertions below depend on. It adds
     * nothing that can pass in place of them, weakens none of them, and turns
     * a confusing failure into an actionable one.
     *
     * Measured on this container: the fill overshoots, `usage` landing about
     * 17 KiB **past** the cap, so the margin here is wide. The bound is the
     * save's own size rather than that observation, because the observation is
     * a fact about one machine and the bound is the condition that has to hold
     * on every machine.
     */
    const settled = await page.evaluate(() => window.lockstateHarness.estimateQuota());
    expect(settled.quota, 'the quota override stopped being reported mid-test').toBe(QUOTA_BYTES);
    expect(settled.usage, 'navigator.storage.estimate() reported no usage, so the headroom below cannot be computed').not.toBeNull();
    const headroom = QUOTA_BYTES - settled.usage!;
    expect(
      headroom,
      `the fill left ${headroom} bytes of headroom, which is room for the ${OVERSIZED_SAVE_BYTES}-byte save below. The fill did not reach the cap, so this run cannot test quota exhaustion -- nothing below is a real assertion about the save path. This is the precondition, not the behaviour (#227).`,
    ).toBeLessThan(OVERSIZED_SAVE_BYTES);

    const rejected = await page.evaluate(
      ([prisonId, bytes]) => window.lockstateHarness.save(prisonId as string, 2, bytes as number),
      [PRISON, OVERSIZED_SAVE_BYTES] as const,
    );
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
