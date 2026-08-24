import { expect, test, type Page } from '@playwright/test';

/**
 * Real-browser verification for the keyboard listeners `WorldScene` registers on
 * `window`, and for the input-context set it supplies.
 *
 * Two claims live here because nothing a layer down can make them. The adapter's
 * behaviour is unit-tested thoroughly in `tests/unit/input.test.ts`; what was
 * never tested is what the **scene** does with it, and that gap is why two
 * player-visible defects survived every mutation the headless suite could apply:
 *
 * 1. **A key held across focus loss must be released.** A `keyup` goes to
 *    whichever window has focus, so holding a camera key and alt-tabbing sent
 *    the release elsewhere and left the code held forever. Phaser's loop runs on
 *    `requestAnimationFrame`, which an unfocused-but-visible tab is not
 *    throttled out of, so the camera kept panning: 1,419 world units over three
 *    seconds with nobody at the keyboard, continuing through refocus and through
 *    a click (issue #202). Coming back to empty land twenty tiles from the
 *    prison is indistinguishable from a crash, and
 *    `frameCameraOnFirstWorld` points the camera at the prison exactly once, so
 *    nothing recovers the view.
 * 2. **A focused text field must own the keyboard.** `docs/INPUT.md` credited a
 *    guard against game controls firing while a text field has input; the
 *    mechanism worked and was unit-tested, and the scene supplied a literal
 *    `() => ['world']`, so it never fired (issue #201). Measured: a real
 *    `<input>` received the character `"d"` *and* the camera panned 249.6 world
 *    units, both at once. The Build panel's two numeric fields are the exposure,
 *    and `inputmode="numeric"` means a phone has the soft keyboard up while
 *    `WASD`-shaped taps reach the camera.
 *
 * These assert the **camera**, not the context set. An earlier draft of the
 * harness also exposed the scene's active contexts, which meant reimplementing
 * the document check inside the harness -- a second implementation of the rule
 * under test, which would have agreed with itself while the real one was wrong.
 */

const HARNESS_URL = '/tests/browser/world-scene-harness.html';

/** Camera scroll, once the scene's listeners exist. */
async function scrollX(page: Page): Promise<number> {
  return page.evaluate(() => window.lockstateWorldSceneHarness!.scroll().x);
}

async function openHarness(page: Page): Promise<void> {
  await page.goto(HARNESS_URL);
  await page.waitForFunction(() => window.lockstateWorldSceneHarness !== undefined);
  await page.evaluate(() => window.lockstateWorldSceneHarness!.ready);
}

/**
 * Waits for the camera to travel, rather than sleeping and hoping.
 *
 * A fixed delay would make these specs flaky on a slow runner in the direction
 * that matters least (a false failure) and, worse, would let a genuinely stuck
 * camera pass on a fast one if the window were short. Polling for movement is
 * the honest shape: the assertion that follows is about whether movement
 * *continues*, not about how quickly it started.
 */
async function waitForPan(page: Page, from: number): Promise<number> {
  await page.waitForFunction(
    (start) => Math.abs(window.lockstateWorldSceneHarness!.scroll().x - start) > 1,
    from,
    { timeout: 5_000 },
  );
  return scrollX(page);
}

/** Two animation frames, which is the shortest honest "the camera had a chance to move". */
async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

test.describe('the world scene keyboard', () => {
  test('releases a key held when the window loses focus (#202)', async ({ page }) => {
    await openHarness(page);
    const start = await scrollX(page);

    // Held, not tapped: the defect needs the key to still be down when focus
    // goes away.
    await page.keyboard.down('KeyD');
    const panning = await waitForPan(page, start);
    expect(panning).not.toBe(start);

    // What a real alt-tab does: focus leaves and **no `keyup` is ever
    // delivered**. Dispatching `blur` is the faithful reproduction -- sending a
    // synthetic `keyup` instead would be testing the case that already worked.
    await page.evaluate(() => {
      window.dispatchEvent(new FocusEvent('blur'));
    });
    await settle(page);

    const afterBlur = await scrollX(page);
    await settle(page);
    await settle(page);
    const later = await scrollX(page);

    // The camera stopped where it was, and stayed there. Before the fix it
    // travelled 1,419 units over three seconds from here.
    expect(later).toBe(afterBlur);
    expect(await page.evaluate(() => window.lockstateWorldSceneHarness!.isActive('camera.right'))).toBe(false);
  });

  test('accepts the same key again after focus returns, so the keyboard is not left dead (#202)', async ({ page }) => {
    // The opposite failure to the one above, and just as bad: `keyDown` ignores
    // a code already in the pressed set, so a release that cleared the wrong
    // thing would leave that key permanently inert.
    await openHarness(page);
    await page.keyboard.down('KeyD');
    await waitForPan(page, await scrollX(page));
    await page.evaluate(() => {
      window.dispatchEvent(new FocusEvent('blur'));
    });
    await settle(page);
    await page.keyboard.up('KeyD');

    const resting = await scrollX(page);
    await page.keyboard.down('KeyD');
    const moved = await waitForPan(page, resting);
    expect(moved).not.toBe(resting);
    await page.keyboard.up('KeyD');
  });

  test('leaves the camera still while a text field owns the keyboard (#201)', async ({ page }) => {
    await openHarness(page);

    await page.locator('#probe-text').click();
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('probe-text');

    const before = await scrollX(page);
    // A camera key *and* a printable character: `KeyD` is bound to
    // `camera.right` and types "d". Both halves are asserted, because the fix
    // must stop the camera without stopping the typing.
    await page.keyboard.down('KeyD');
    await settle(page);
    await settle(page);
    await settle(page);
    const after = await scrollX(page);
    await page.keyboard.up('KeyD');

    expect(after).toBe(before);
    await expect(page.locator('#probe-text')).toHaveValue('d');
  });

  test('pans again once the field is blurred, so the guard is not a permanent mute (#201)', async ({ page }) => {
    // The other direction. A guard that stopped the camera and never restored it
    // would satisfy the test above and break the game.
    await openHarness(page);
    await page.locator('#probe-text').click();
    await page.locator('#probe-text').blur();
    expect(await page.evaluate(() => document.activeElement?.tagName.toLowerCase())).not.toBe('input');

    const before = await scrollX(page);
    await page.keyboard.down('KeyD');
    const after = await waitForPan(page, before);
    await page.keyboard.up('KeyD');

    expect(after).not.toBe(before);
  });

  test('stops mid-hold when focus moves into a text field (#201)', async ({ page }) => {
    // `isActive` re-reads the context on every call, so this should hold without
    // any extra machinery -- and it is the case a player actually hits, tabbing
    // into a field while still leaning on a movement key.
    await openHarness(page);
    const start = await scrollX(page);
    await page.keyboard.down('KeyD');
    await waitForPan(page, start);

    await page.locator('#probe-text').focus();
    await settle(page);
    const atFocus = await scrollX(page);
    await settle(page);
    await settle(page);
    const later = await scrollX(page);
    await page.keyboard.up('KeyD');

    expect(later).toBe(atFocus);
  });
});
