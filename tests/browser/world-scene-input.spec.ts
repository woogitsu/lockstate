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

  test('moves the camera with the arrow keys the Build panel promises (#200)', async ({ page }) => {
    // `hud.build.arm-hint` is painted into the Build panel and says "the arrow
    // keys still move the camera". No `Arrow*` binding existed: all four moved
    // the camera by exactly zero while `KeyS` moved it 180.89, measured in a
    // browser. An advertised key that does nothing reads as a broken build --
    // worse than an unadvertised one, which is only a missing feature.
    //
    // Each direction is asserted with its sign, not just "something moved": a
    // binding wired to the wrong action would pass a movement check and send the
    // camera the opposite way from the arrow the player pressed.
    await openHarness(page);

    for (const { key, axis, sign } of [
      { key: 'ArrowRight', axis: 'x', sign: 1 },
      { key: 'ArrowLeft', axis: 'x', sign: -1 },
      { key: 'ArrowDown', axis: 'y', sign: 1 },
      { key: 'ArrowUp', axis: 'y', sign: -1 },
    ] as const) {
      const before = await page.evaluate(
        (which) => window.lockstateWorldSceneHarness!.scroll()[which as 'x' | 'y'],
        axis,
      );
      await page.keyboard.down(key);
      await page.waitForFunction(
        ([which, start]) => window.lockstateWorldSceneHarness!.scroll()[which as 'x' | 'y'] !== start,
        [axis, before] as const,
        { timeout: 5_000 },
      );
      const after = await page.evaluate(
        (which) => window.lockstateWorldSceneHarness!.scroll()[which as 'x' | 'y'],
        axis,
      );
      await page.keyboard.up(key);

      expect(Math.sign(after - before), `${key} moved the camera the wrong way on ${axis}`).toBe(sign);
    }
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
    // `toHaveValue` reads the DOM and implies nothing about visibility, so it
    // would stay green on a field inside a `display: none` subtree -- and
    // "the field owns the keyboard" is a claim about a field the player can
    // see and type into. Playwright's own visibility check, which is this
    // file's idiom for a locator (#218 section 6.6).
    await expect(page.locator('#probe-text')).toBeVisible();
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

/**
 * The `discrete` half of the keyboard: keys that do a thing once per press.
 *
 * Panning is polled, and every spec above measures the poll. These measure the
 * route that did not exist -- `KeyboardInputAdapter.keyDown` has always
 * returned a `SemanticActionEvent[]` and `WorldScene` discarded it, so three
 * keys a player will try on the first session were bound to actions nothing
 * could serve. Measured before the fix: five presses of `Equal` and five of
 * `Minus` left the zoom at exactly 1, and `Escape` pressed mid-drag left the
 * four targeted segments unchanged and the run committed anyway (#200).
 *
 * A poll could not have fixed either. "Zoom in" has no duration to poll, which
 * is what `ActionDefinition.behavior` records and what
 * `tests/foundation/unconsumed-action-contract.test.ts` now pins.
 */
test.describe('the world scene discrete keys', () => {
  /** The zoom, once the scene exists. */
  async function zoom(page: Page): Promise<number> {
    return page.evaluate(() => window.lockstateWorldSceneHarness!.zoom());
  }

  /** One tap, then long enough for the scene to have drawn at least one frame with it. */
  async function press(page: Page, key: string): Promise<void> {
    await page.keyboard.press(key);
    await settle(page);
  }

  test('zooms in on Equal and out on Minus (#200)', async ({ page }) => {
    await openHarness(page);
    const resting = await zoom(page);

    await press(page, 'Equal');
    const zoomedIn = await zoom(page);
    expect(zoomedIn, 'Equal left the zoom exactly where it was, which is the defect').toBeGreaterThan(resting);

    await press(page, 'Minus');
    // Back to the start, not merely smaller. The step is applied as `* STEP`
    // and `/ STEP` precisely so a press each way is reversible; the wheel's
    // `1.1`/`0.9` pair is not, and a player who presses `+` then `-` and lands
    // somewhere new has been told the keys do not work.
    expect(await zoom(page)).toBeCloseTo(resting, 10);

    await press(page, 'Minus');
    expect(await zoom(page), 'Minus zoomed the wrong way').toBeLessThan(resting);
  });

  test('clamps the keyboard zoom to the same bounds the wheel respects (#200)', async ({ page }) => {
    // The reason `stepZoom` goes through `zoomAtScreenPoint` rather than
    // calling `setZoom` directly. Twenty presses is well past the eight the
    // 0.2-3 range takes, so an unclamped key would be far outside it.
    await openHarness(page);
    for (let index = 0; index < 20; index += 1) await press(page, 'Equal');
    expect(await zoom(page)).toBeLessThanOrEqual(3);

    for (let index = 0; index < 40; index += 1) await press(page, 'Minus');
    expect(await zoom(page)).toBeGreaterThanOrEqual(0.2);
  });

  test('acts on the press and not on the release (#200)', async ({ page }) => {
    /*
     * The rule `handleActionEvents` states by reading `'started'` only. A
     * release produces an `'ended'` event carrying the same action, so a
     * consumer that acted on every event would zoom twice per press.
     *
     * The down and the up are dispatched **separately**, which is the whole
     * design of this test. An earlier version pressed the key twice and
     * asserted the second landing "one more step" on, with the step derived
     * from the first pair -- and measured, deleting the phase check left that
     * green: doubling every step is self-consistent under a ratio taken from
     * the doubled steps themselves. It was a test that could not fail. Reading
     * the zoom between the down and the up cannot be fooled that way, and it
     * needs no copy of `KEYBOARD_ZOOM_STEP` to say so.
     */
    await openHarness(page);
    const resting = await zoom(page);

    await page.keyboard.down('Equal');
    await settle(page);
    const afterDown = await zoom(page);
    expect(afterDown, 'the press did nothing, so the release assertion below proves nothing').toBeGreaterThan(resting);

    await page.keyboard.up('Equal');
    await settle(page);
    expect(await zoom(page), 'the release zoomed again, so a press is worth two steps').toBe(afterDown);
  });

  test('cancels a pending wall run on Escape, and the run does not commit (#200)', async ({ page }) => {
    await openHarness(page);
    await page.evaluate(() => window.lockstateWorldSceneHarness!.armBuildTool(true));

    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
    const box = (await canvas.boundingBox())!;
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(centre.x + 200, centre.y, { steps: 10 });

    // The run really is in progress before Escape, or the assertion after it
    // proves nothing: a spec that cancelled nothing would pass every check
    // below. This is the positive control.
    const during = await page.evaluate(() => window.lockstateWorldSceneHarness!.targetedRun());
    expect(during, 'no run was in progress, so this spec would pass without Escape doing anything').toBeDefined();
    expect(during!.length).toBeGreaterThan(1);

    await page.keyboard.press('Escape');
    await settle(page);
    expect(await page.evaluate(() => window.lockstateWorldSceneHarness!.targetedRun())).toBeUndefined();

    // And the half that matters most: releasing must not place what was
    // cancelled. Before the fix the four targeted segments were unchanged by
    // Escape and committed on release.
    await page.mouse.up({ button: 'left' });
    await settle(page);
    expect(
      await page.evaluate(() => window.lockstateWorldSceneHarness!.placedRuns()),
      'the cancelled run was placed anyway, which is the defect #200 measured',
    ).toEqual([]);
  });

  test('still places a run that was not cancelled, so Escape is not a permanent mute (#200)', async ({ page }) => {
    // The other direction, and the mutation this kills is the cheap fix:
    // clearing the pending run unconditionally, or on every key, would satisfy
    // the spec above and break building entirely.
    await openHarness(page);
    await page.evaluate(() => window.lockstateWorldSceneHarness!.armBuildTool(true));

    const box = (await page.locator('canvas').boundingBox())!;
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(centre.x + 200, centre.y, { steps: 10 });
    await page.mouse.up({ button: 'left' });
    await settle(page);

    const runs = await page.evaluate(() => window.lockstateWorldSceneHarness!.placedRuns());
    expect(runs.length).toBe(1);
    expect(runs[0]!.length).toBeGreaterThan(1);
  });

  test('leaves the armed tool\'s hover ghost alone when there is no run to cancel (#200)', async ({ page }) => {
    /*
     * `cancelBuild` returns early when no pointer owns a run, so `Escape` with
     * the tool merely armed does nothing -- the preview the armed tool exists
     * to show stays under the cursor.
     *
     * Written because the claim was made in a comment before it was pinned:
     * measured, deleting that early return left every other spec here green.
     * A cancel that also wiped the hover would make the tool look disarmed
     * after a stray `Escape`, with the panel still saying it is on.
     */
    await openHarness(page);
    await page.evaluate(() => window.lockstateWorldSceneHarness!.armBuildTool(true));

    const box = (await page.locator('canvas').boundingBox())!;
    // Moved, never pressed: this is the hover path, not a run.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.move(box.x + box.width / 2 + 8, box.y + box.height / 2);
    await settle(page);

    const hovering = await page.evaluate(() => window.lockstateWorldSceneHarness!.targetedRun());
    expect(hovering, 'no hover ghost was showing, so this spec would pass without Escape leaving one').toBeDefined();
    expect(hovering!.length).toBe(1);

    await page.keyboard.press('Escape');
    await settle(page);
    expect(await page.evaluate(() => window.lockstateWorldSceneHarness!.targetedRun())).toEqual(hovering);
  });

  test('leaves the camera zoom alone while a text field owns the keyboard (#200, #201)', async ({ page }) => {
    // The context guard covers the received route as well as the polled one.
    // It is not automatic: `eventsFor` intersects contexts the same way
    // `isActive` does, but nothing had ever exercised that path, because
    // nothing consumed the events it produces.
    await openHarness(page);
    await page.locator('#probe-text').click();
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('probe-text');

    const resting = await zoom(page);
    await press(page, 'Equal');
    await press(page, 'Minus');
    expect(await zoom(page)).toBe(resting);
  });
});

/**
 * The `addPointer(2)` pointer count (issue #209's other residual-risk note).
 *
 * `world-scene.ts` says, above `this.input.addPointer(2)`, that "Phaser tracks
 * exactly one touch pointer unless told otherwise" and that three is "one
 * spare beyond the two the gestures use". #209's audit read four pointer
 * entries and could not say which of them was the mouse, so it recorded the
 * comment as INFERRED; the follow-up tried to re-measure it through this
 * harness and got `null`, because there was no handle on the input manager at
 * all. `pointerCensus()` is that handle, and it settles the comment by
 * measurement rather than by reading Phaser's source.
 *
 * The census is read, never computed: the spec below does the subtraction, so
 * a harness that quietly re-applied `addPointer`'s own arithmetic could not
 * make a scene that never called it pass.
 */
test.describe('the world scene pointer inventory (#209)', () => {
  test('gives the gestures three touch pointers beside the mouse', async ({ page }) => {
    await openHarness(page);
    const census = await page.evaluate(() => window.lockstateWorldSceneHarness!.pointerCensus());

    // Measured: `{ entries: 4, pointersTotal: 3, ids: [0, 1, 2, 3],
    // mouseIndex: 0, configuredActivePointers: 1 }`.
    //
    // The audit's unanswered question was which entry is the mouse. The
    // manager answers it about its own `mousePointer` reference: entry 0. So
    // the four entries are one mouse and three touch pointers, which is what
    // the comment claims, and the claim is now VERIFIED rather than INFERRED.
    expect(census.mouseIndex).toBe(0);
    expect(census.entries - 1).toBe(3);
    // The same three counted the other way -- `pointersTotal` is the number of
    // *touch* objects the manager processes per update, and it agreeing with
    // the subtraction above is what rules out an off-by-one in either reading.
    expect(census.pointersTotal).toBe(3);
    expect(census.ids).toEqual([0, 1, 2, 3]);

    // "unless told otherwise": neither `src/main.ts` nor this harness sets
    // `input.activePointers`, so the game runs on Phaser's own default, and
    // the default is one touch pointer. Without `addPointer(2)` the scene
    // would therefore have exactly one -- which is the sentence the comment
    // opens with, and it is true.
    expect(census.configuredActivePointers).toBe(1);

    // "one spare beyond the two the gestures use" is about
    // `TouchGestureTracker`, which pairs a moving finger with exactly one peer
    // (`src/input/gestures.ts`) and so never reads a third. Three delivered
    // touch pointers is two used and one spare. That the second of them really
    // arrives is not inferred either: a two-finger pan dispatched against this
    // harness moved the camera by (-120, -78), recorded on #209. Left as prose
    // rather than as an assertion, because "one spare" is a statement about
    // `src/input/gestures.ts`, and the assertion that holds *it* belongs
    // beside that file, not here.
  });
});
