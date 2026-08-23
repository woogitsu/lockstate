import { expect, test } from '@playwright/test';
import { openHarness, reloadHarness } from './harness-fixture';

/**
 * Whether both of `LifecycleSaveHandler`'s events actually reach it in a real
 * browser.
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
 * exactly this reason, and a same-tab navigation is also the only way to
 * obtain a genuine, browser-generated `pagehide` here: the record has to be
 * readable afterwards, and `sessionStorage` does not outlive the tab. The
 * handler is constructed the way `src/main.ts` constructs it — no injected
 * targets at all.
 *
 * Deliberately *not* asserted here: which object each listener is registered
 * on. `visibilitychange` is dispatched at `document` with `bubbles: true`, so
 * an implementation that put both listeners on `window` would receive both
 * events and be correct in production; a test that failed it would be pinning
 * the wiring's shape rather than its contract. Which *injected* target each
 * listener lands on is a statement about `LifecycleSaveOptions.targets`, and
 * the unit tests make it there.
 *
 * Also not asserted: that the save reached IndexedDB. A lifecycle save is
 * best-effort by design and the page is going away mid-transaction; the
 * interval `AutosaveScheduler` is the durability mechanism. The claim under
 * test is only that the event reaches the handler at all.
 *
 * And not asserted: a tab backgrounded by another tab taking the foreground.
 * `context.newPage()` + `bringToFront()` was tried and headless Chromium keeps
 * reporting the first page as `visible`, so the assertion would have been
 * vacuous. The real `visibilitychange` that a navigation does produce is
 * covered below.
 */

const PRISON = 'lifecycle-prison';

test.describe('lifecycle save wiring', () => {
  test('both real lifecycle events from a real navigation reach the handler', async ({ page }) => {
    await openHarness(page);
    await page.evaluate((prisonId) => window.lockstateHarness.attachLifecycleSaveHandler(prisonId), PRISON);
    expect(await page.evaluate(() => window.lockstateHarness.readLifecycleObservation())).toMatchObject({ triggers: [] });

    // This is what produces lifecycle events the browser itself dispatched.
    // The handler records synchronously into sessionStorage, which survives
    // the navigation even though the save it kicks off may not.
    await reloadHarness(page);

    // Observed order, not assumed: Chromium delivers `pagehide` first and only
    // then the `visibilitychange` that reports the tab hidden. Requiring both,
    // in that order, is what fails if either listener is registered somewhere
    // the event never reaches — with both of them on `document`, as in #92,
    // this records `['visibility-hidden']` alone.
    const observed = await page.evaluate(() => window.lockstateHarness.readLifecycleObservation());
    expect(observed.triggers).toEqual(['pagehide', 'visibility-hidden']);
  });
});
