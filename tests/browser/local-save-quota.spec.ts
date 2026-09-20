import { expect, test } from './network-changed-fixture';
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

async function capOriginQuota(page: import('./network-changed-fixture').Page): Promise<void> {
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

    /*
     * Fill coarsely, then finely, then more finely still, so the origin ends up
     * hard against the cap rather than a megabyte -- or a chunk -- short of it.
     *
     * **The third pass is what makes the precondition below reachable rather
     * than lucky, and it was bought with a real failure.** A pass stops at the
     * first write the browser refuses, so it leaves headroom of up to its own
     * chunk size: after a 32 KiB pass, anything from 0 to just under 32 KiB can
     * remain, and the precondition demands less than `OVERSIZED_SAVE_BYTES`
     * (8 KiB). Whether the run could test anything was therefore decided by
     * where the boundary happened to land modulo 32 KiB. On PR #1322's browser
     * job (run 35466440775, head `93612fbc`) it landed badly: the fine pass
     * stopped with **17138 bytes** free -- a legitimate refusal of a 32 KiB
     * write, and room to spare for the 8 KiB save -- and the precondition
     * fired. The last pass's chunk is now smaller than the save it must not
     * leave room for, which is the property that was missing; the bound below
     * is unchanged and nothing under it is weakened.
     */
    expect((await page.evaluate(() => window.lockstateHarness.fillUntilWriteFails(1024 * 1024, 32))).failure).not.toBeNull();
    expect((await page.evaluate(() => window.lockstateHarness.fillUntilWriteFails(32 * 1024, 256))).failure).not.toBeNull();
    expect((await page.evaluate(() => window.lockstateHarness.fillUntilWriteFails(1024, 512))).failure).not.toBeNull();

    /*
     * The precondition, asserted rather than assumed (#227).
     *
     * Everything below is sound only while the save genuinely does not fit.
     * That is a property of the **machine**, not of the fixture: the cap is set
     * over CDP, but the usage is reached by filling real storage until the
     * browser refuses a write, and the three passes above narrow the chunk
     * precisely because the boundary is approached rather than set. If they
     * all report a failure while headroom remains -- accounting granularity,
     * eviction between the fill and the save, another origin moving under the
     * same quota -- the save succeeds and `expect(rejected.ok).toBe(false)`
     * fails with a message about generation rotation, which is the wrong
     * diagnosis for a test whose fill fell short.
     *
     * PR #218 hit exactly one such failure and spent an investigation on it;
     * PR #1322 hit the second, on a change to gang membership that cannot
     * reach this file -- the envelope saved here is built by the harness from
     * a bare `Kernel`, `SparseWorld` and `ConstructionSystem` and never runs a
     * simulation. So this is not a fix for a known product bug but a true
     * statement about what the assertions below depend on. It adds nothing
     * that can pass in place of them, weakens none of them, and turns a
     * confusing failure into an actionable one.
     *
     * Measured on the container of `6cc10411`: the fill overshot, `usage`
     * landing about 17 KiB **past** the cap, so the margin there was wide. On
     * `lockstate-wsl-DOM-NEW-01` at `93612fbc` it undershot by about the same
     * 17 KiB instead, which is how the third pass above came to be needed --
     * so that reading is a fact about one machine in both directions, and the
     * bound stays the save's own size rather than either of them, because the
     * bound is the condition that has to hold on every machine.
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
