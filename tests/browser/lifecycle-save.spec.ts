import { expect, test } from '@playwright/test';
import { openHarness, reloadHarness } from './harness-fixture';

/**
 * Which real object each of `LifecycleSaveHandler`'s two events actually
 * arrives on.
 *
 * `tests/unit/persistence-session-lifecycle.test.ts` proves everything about
 * the handler's *policy* — the visibility gate, the fire-and-forget contract,
 * that `unload` is never used, and which of its injected targets each
 * listener is registered on. What a fake target structurally cannot prove is
 * the thing that broke in issue #92: a fake receives whatever a test
 * dispatches at it, so it agrees with the browser no matter which object the
 * browser really dispatches at. `pagehide` is dispatched at `Window` and does
 * not propagate down to `document`, so registering it on `document` produced
 * a listener that unit tests exercised happily and that never fired once in
 * production.
 *
 * `docs/TESTING.md` puts durability-across-a-real-navigation at this layer for
 * exactly this reason, and a navigation is also the only way to obtain a
 * genuine, browser-generated `pagehide`. Every handler here is constructed the
 * way `src/main.ts` constructs it — no injected targets at all.
 *
 * Note what is deliberately *not* asserted: that the save reached IndexedDB.
 * A lifecycle save is best-effort by design and the page is going away
 * mid-transaction; the interval `AutosaveScheduler` is the durability
 * mechanism. The claim under test is only that the event reaches the handler,
 * which is what narrows the window of lost play from a full autosave interval
 * to near zero.
 *
 * Also not asserted: a tab backgrounded by another tab taking the foreground.
 * `context.newPage()` + `bringToFront()` was tried and headless Chromium keeps
 * reporting the first page as `visible`, so the assertion would have been
 * vacuous. The real `visibilitychange` that a navigation does produce is
 * covered by the first test below.
 */

const PRISON = 'lifecycle-prison';

test.describe('lifecycle save targets', () => {
  test('a real pagehide from a real navigation reaches the handler', async ({ page }) => {
    await openHarness(page);
    await page.evaluate((prisonId) => window.lockstateHarness.attachLifecycleSaveHandler(prisonId), PRISON);
    expect(await page.evaluate(() => window.lockstateHarness.readLifecycleObservation())).toMatchObject({ triggers: [] });

    // The only way to get a `pagehide` the browser itself dispatched. The
    // handler records synchronously into sessionStorage, which survives the
    // navigation even though the save it kicks off may not.
    await reloadHarness(page);

    // Observed order, not assumed: Chromium dispatches `pagehide` *first* and
    // only then marks the tab hidden. So `pagehide` is the earlier of the two
    // notices, and before the fix nothing at all fired until the page was
    // already on its way out via `visibilitychange`. Asserting both, in order,
    // is what makes this fail if either listener drifts back onto the wrong
    // target.
    const observed = await page.evaluate(() => window.lockstateHarness.readLifecycleObservation());
    expect(observed.triggers).toEqual(['pagehide', 'visibility-hidden']);
  });

  test('the pagehide listener is on window, and not on document', async ({ page }) => {
    await openHarness(page);
    await page.evaluate((prisonId) => window.lockstateHarness.attachLifecycleSaveHandler(prisonId), PRISON);

    // Non-bubbling, so each dispatch is visible only to listeners on that
    // exact object -- which is what makes this a statement about the target
    // rather than about the event path.
    await page.evaluate(() => window.lockstateHarness.dispatchAtDocument('pagehide'));
    expect((await page.evaluate(() => window.lockstateHarness.readLifecycleObservation())).triggers).toEqual([]);

    await page.evaluate(() => window.lockstateHarness.dispatchAtWindow('pagehide'));
    expect((await page.evaluate(() => window.lockstateHarness.readLifecycleObservation())).triggers).toEqual(['pagehide']);
  });

  test('the visibilitychange listener is on document, and not on window', async ({ page }) => {
    await openHarness(page);
    // `visibilityState` is injected here (and only here) because the real page
    // is still visible; the visibility *gate* is unit-tested, and what this
    // needs is for the listener to act so its target is observable. `targets`
    // is still the production default.
    await page.evaluate((prisonId) => window.lockstateHarness.attachLifecycleSaveHandler(prisonId, true), PRISON);

    await page.evaluate(() => window.lockstateHarness.dispatchAtWindow('visibilitychange'));
    expect((await page.evaluate(() => window.lockstateHarness.readLifecycleObservation())).triggers).toEqual([]);

    await page.evaluate(() => window.lockstateHarness.dispatchAtDocument('visibilitychange'));
    expect((await page.evaluate(() => window.lockstateHarness.readLifecycleObservation())).triggers).toEqual([
      'visibility-hidden',
    ]);
  });

});
