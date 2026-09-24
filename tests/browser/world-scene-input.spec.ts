import { expect, test, type CDPSession, type Page } from './network-changed-fixture';

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

  test('does not activate a key first pressed in a text field when focus returns to the world', async ({ page }) => {
    await openHarness(page);
    await page.locator('#probe-text').click();
    const before = await scrollX(page);
    await page.keyboard.down('KeyD');
    await expect(page.locator('#probe-text')).toHaveValue('d');
    await page.locator('#probe-text').evaluate((input) => (input as HTMLInputElement).blur());
    await settle(page);
    await settle(page);
    expect(await scrollX(page)).toBe(before);
    await page.keyboard.up('KeyD');
  });

  test('lets a focused native category select use arrows without panning the camera', async ({ page }) => {
    await openHarness(page);
    await page.evaluate(() => {
      const select = document.createElement('select');
      select.id = 'probe-category';
      select.innerHTML = '<option value="all">Everything</option><option value="furniture">Furniture</option>';
      document.body.append(select);
      select.focus();
    });
    const before = await scrollX(page);
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#probe-category')).toHaveValue('furniture');
    await settle(page);
    await settle(page);
    expect(await scrollX(page)).toBe(before);
  });

  test('a modal stats dialog keeps world camera keys inactive', async ({ page }) => {
    await openHarness(page);
    await page.evaluate(() => {
      const dialog = document.createElement('dialog');
      dialog.id = 'probe-stats-dialog';
      dialog.innerHTML = '<button type="button">Close stats</button>';
      document.body.append(dialog);
      dialog.showModal();
    });
    await expect(page.locator('#probe-stats-dialog button')).toBeFocused();
    const before = await scrollX(page);
    await page.keyboard.down('ArrowRight');
    await settle(page);
    await settle(page);
    expect(await scrollX(page)).toBe(before);
    await page.keyboard.up('ArrowRight');
    await page.locator('#probe-stats-dialog').evaluate((dialog) => (dialog as HTMLDialogElement).close());
    await page.keyboard.down('ArrowRight');
    await waitForPan(page, before);
    await page.keyboard.up('ArrowRight');
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

  test('a horizontal touchpad wheel does not zoom the world', async ({ page }) => {
    await openHarness(page);
    const before = await zoom(page);
    await page.mouse.move(300, 300);
    await page.mouse.wheel(120, 0);
    await settle(page);
    expect(await zoom(page)).toBe(before);
    await page.mouse.wheel(0, -120);
    await settle(page);
    expect(await zoom(page)).toBeGreaterThan(before);
  });

  test('browser modified wheel shortcuts do not also zoom the game camera', async ({ page }) => {
    await openHarness(page);
    const before = await zoom(page);
    await page.mouse.move(300, 300);
    for (const modifier of ['Control', 'Meta']) {
      await page.keyboard.down(modifier);
      await page.mouse.wheel(0, -120);
      await page.keyboard.up(modifier);
      await settle(page);
      expect(await zoom(page), `${modifier}+wheel also changed the game camera`).toBe(before);
    }
  });

  test('browser Control+Plus and Control+Minus shortcuts do not also zoom the game camera', async ({ page }) => {
    await openHarness(page);
    const before = await zoom(page);
    for (const key of ['Equal', 'Minus']) {
      await page.keyboard.down('Control');
      await page.keyboard.press(key);
      await page.keyboard.up('Control');
      await settle(page);
      expect(await zoom(page), `${key} also changed the game camera`).toBe(before);
    }
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

  test('leaves the armed tool\'s hover ghost alone when the window loses focus, because there is no run to abandon (#200, #516)', async ({
    page,
  }) => {
    /*
     * `cancelBuild` returns early when no pointer owns a run, so a sweep that
     * finds only a hover does nothing -- the preview the armed tool exists to
     * show stays under the cursor.
     *
     * **This assertion used to be made about `Escape`, and #959 moved it to
     * `blur`.** The claim it protects is unchanged and the mutation it kills
     * is the same one -- measured when it was written, deleting that early
     * return left every other spec here green -- but `Escape` is no longer a
     * key that finds a hover and does nothing: since #959 it stands the tool
     * down, and the ghost then goes because the *arming* went (see the three
     * specs below). `blur` is the call site where "there is no run to abandon"
     * is still the whole story, and it is the honest one to assert it at: a
     * window losing focus is not the player putting the tool down, so the
     * arming must survive it and the preview with it.
     */
    await openHarness(page);
    await page.evaluate(() => window.lockstateWorldSceneHarness!.armBuildTool(true));

    const box = (await page.locator('canvas').boundingBox())!;
    // Moved, never pressed: this is the hover path, not a run.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.move(box.x + box.width / 2 + 8, box.y + box.height / 2);
    await settle(page);

    const hovering = await page.evaluate(() => window.lockstateWorldSceneHarness!.targetedRun());
    expect(hovering, 'no hover ghost was showing, so this spec would pass without the blur leaving one').toBeDefined();
    expect(hovering!.length).toBe(1);

    await page.evaluate(() => {
      window.dispatchEvent(new FocusEvent('blur'));
    });
    await settle(page);
    expect(await page.evaluate(() => window.lockstateWorldSceneHarness!.targetedRun())).toEqual(hovering);
    // And the arming itself, stated separately: losing focus must not reach
    // the panel's arm control. Only the key the player pressed does.
    expect(await page.evaluate(() => window.lockstateWorldSceneHarness!.standDownRequests())).toBe(0);
    expect(await page.evaluate(() => window.lockstateWorldSceneHarness!.isAnyToolArmed())).toBe(true);
  });

  test('keeps an armed wall hover aligned with a keyboard-panned camera', async ({ page }) => {
    await openHarness(page);
    await page.evaluate(() => window.lockstateWorldSceneHarness!.armBuildTool(true));
    const box = (await page.locator('canvas').boundingBox())!;
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(point.x, point.y);
    await page.mouse.move(point.x + 8, point.y);
    await settle(page);
    const initial = await page.evaluate(() => window.lockstateWorldSceneHarness!.targetedRun());
    expect(initial).toHaveLength(1);

    const startScroll = await scrollX(page);
    await page.keyboard.down('KeyD');
    await page.waitForFunction((start) => window.lockstateWorldSceneHarness!.scroll().x - start > 128, startScroll);
    await page.keyboard.up('KeyD');
    await settle(page);
    const afterPan = await page.evaluate(() => window.lockstateWorldSceneHarness!.targetedRun());

    // A one-pixel mouse move forces the existing pointer path to reveal what
    // the ghost should already have shown at the fixed cursor position.
    await page.mouse.move(point.x + 9, point.y);
    await settle(page);
    const afterMouseMove = await page.evaluate(() => window.lockstateWorldSceneHarness!.targetedRun());
    expect(afterMouseMove).not.toEqual(initial);
    expect(afterPan).toEqual(afterMouseMove);
  });

  test('keeps an armed wall hover aligned with keyboard zoom away from the viewport centre', async ({ page }) => {
    await openHarness(page);
    await page.evaluate(() => window.lockstateWorldSceneHarness!.armBuildTool(true));
    await page.mouse.move(300, 300);
    await settle(page);
    const initial = await page.evaluate(() => window.lockstateWorldSceneHarness!.targetedRun());
    expect(initial).toHaveLength(1);

    await page.keyboard.press('Equal');
    await settle(page);
    const afterZoom = await page.evaluate(() => window.lockstateWorldSceneHarness!.targetedRun());
    await page.mouse.move(301, 300);
    await settle(page);
    const afterMouseMove = await page.evaluate(() => window.lockstateWorldSceneHarness!.targetedRun());
    expect(afterMouseMove).not.toEqual(initial);
    expect(afterZoom).toEqual(afterMouseMove);
  });

  test('updates the object hover footprint when Build selects another armed object', async ({ page }) => {
    await openHarness(page);
    await page.evaluate(() => window.lockstateWorldSceneHarness!.armObjectTool(true));
    const box = (await page.locator('canvas').boundingBox())!;
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(point.x, point.y);
    await page.mouse.move(point.x + 8, point.y);
    await settle(page);
    const initial = await page.evaluate(() => window.lockstateWorldSceneHarness!.targetedObject());
    expect(initial).toMatchObject({ width: 1, height: 1 });

    await page.evaluate(() => window.lockstateWorldSceneHarness!.setObjectFootprint({ width: 1, height: 2 }));
    await settle(page);
    const afterSelection = await page.evaluate(() => window.lockstateWorldSceneHarness!.targetedObject());

    await page.mouse.move(point.x + 9, point.y);
    await settle(page);
    const afterMouseMove = await page.evaluate(() => window.lockstateWorldSceneHarness!.targetedObject());
    expect(afterMouseMove).toMatchObject({ width: 1, height: 2 });
    expect(afterSelection).toEqual(afterMouseMove);
  });

  test('puts the tool down on Escape when there is no run to abandon, so the next drag on the world is a look-around and not a wall (#959)', async ({
    page,
  }) => {
    /*
     * Issue #959, measured by playing: `Escape` cancelled the three *gestures*
     * and never touched the arming, so the tool stayed live and silent. The
     * drag the player took next -- on clear canvas, believing they had put the
     * tool down -- placed two real wall orders and cost 160 with the clock
     * paused.
     *
     * The assertion is that drag, not the flag. Reading `standDownRequests`
     * alone would prove a message was sent; what #959 is about is whether the
     * world still belongs to the tool afterwards, so the spec drags where the
     * player dragged and asks what was placed.
     */
    await openHarness(page);
    await page.evaluate(() => window.lockstateWorldSceneHarness!.armBuildTool(true));

    const box = (await page.locator('canvas').boundingBox())!;
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

    // The positive control, and it is the state the issue measured: armed,
    // hovering, nothing in progress. Without it a spec whose `Escape` did
    // nothing would still see an empty `placedRuns()` below.
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.move(centre.x + 8, centre.y);
    await settle(page);
    const hovering = await page.evaluate(() => window.lockstateWorldSceneHarness!.targetedRun());
    expect(hovering, 'the tool was not previewing, so it was not armed and this spec proves nothing').toBeDefined();

    await page.keyboard.press('Escape');
    await settle(page);

    expect(
      await page.evaluate(() => window.lockstateWorldSceneHarness!.standDownRequests()),
      'Escape never reached the arming owner, which is the defect #959 measured',
    ).toBe(1);
    expect(await page.evaluate(() => window.lockstateWorldSceneHarness!.isAnyToolArmed())).toBe(false);

    /*
     * A tool that has been put down stops previewing, which is the half of
     * "the world is the player's again" that happens before they press
     * anything. Moved far enough to cross several tiles, so a tool still
     * armed would report a *different* edge rather than the same one from a
     * few pixels away.
     *
     * The last report is asserted unchanged rather than absent, deliberately.
     * What withdraws the panel's line on a disarm is `BuildTool.setArmed`'s
     * own `readout?.(undefined)` (#550) and what clears the world overlay is
     * the scene's per-frame sweep in `update()`; neither is this port double,
     * so a spec expecting `undefined` here would be reading the harness's own
     * `standDown` back rather than anything the scene did.
     */
    await page.mouse.move(centre.x + 240, centre.y + 160);
    await settle(page);
    expect(
      await page.evaluate(() => window.lockstateWorldSceneHarness!.targetedRun()),
      'the ghost followed the cursor after Escape, so the tool still had the pointer',
    ).toEqual(hovering);

    // The drag the player thought was a look-around.
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(centre.x + 200, centre.y, { steps: 10 });
    await page.mouse.up({ button: 'left' });
    await settle(page);

    expect(
      await page.evaluate(() => window.lockstateWorldSceneHarness!.placedRuns()),
      'the drag after Escape still laid a wall, which is the 160 #959 measured',
    ).toEqual([]);
  });

  test('takes the half-drawn run first and leaves the tool armed, so one press never does two things (#959)', async ({
    page,
  }) => {
    /*
     * The ordering, and the reason #959 called this "not a one-line change":
     * a half-drawn run and an armed tool are two states, and one key now
     * reaches both -- so it has to reach them in an order the player can
     * predict. The first press abandons the gesture and leaves the tool in
     * the player's hand; only a press with nothing in progress puts it down.
     *
     * The mutation this kills is the cheap version of #959: standing the tool
     * down on every `Escape`. That passes the spec above and takes the tool
     * away from a player who only wanted their crooked wall run back.
     */
    await openHarness(page);
    await page.evaluate(() => window.lockstateWorldSceneHarness!.armBuildTool(true));

    const box = (await page.locator('canvas').boundingBox())!;
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(centre.x + 200, centre.y, { steps: 10 });
    const during = await page.evaluate(() => window.lockstateWorldSceneHarness!.targetedRun());
    expect(during, 'no run was in progress, so this spec would pass without the ordering existing').toBeDefined();
    expect(during!.length).toBeGreaterThan(1);

    await page.keyboard.press('Escape');
    await settle(page);
    expect(
      await page.evaluate(() => window.lockstateWorldSceneHarness!.standDownRequests()),
      'the press that abandoned the run also put the tool down, so one press did two things',
    ).toBe(0);
    expect(await page.evaluate(() => window.lockstateWorldSceneHarness!.isAnyToolArmed())).toBe(true);
    await page.mouse.up({ button: 'left' });
    await settle(page);
    expect(await page.evaluate(() => window.lockstateWorldSceneHarness!.placedRuns())).toEqual([]);

    // Still the player's tool: a fresh drag builds, so the first press cost
    // them the run and nothing else.
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(centre.x + 200, centre.y, { steps: 10 });
    await page.mouse.up({ button: 'left' });
    await settle(page);
    const runs = await page.evaluate(() => window.lockstateWorldSceneHarness!.placedRuns());
    expect(runs.length, 'the tool was gone after a press that should only have taken the run').toBe(1);

    // And the second press, with nothing in progress, is the one that reaches
    // the arming -- which is what makes "first the gesture, then the tool" a
    // sequence rather than a refusal.
    await page.keyboard.press('Escape');
    await settle(page);
    expect(await page.evaluate(() => window.lockstateWorldSceneHarness!.standDownRequests())).toBe(1);
    expect(await page.evaluate(() => window.lockstateWorldSceneHarness!.isAnyToolArmed())).toBe(false);
  });

  test('puts the room tool down too, because one key puts down whatever the player is holding (#959)', async ({
    page,
  }) => {
    /*
     * The scene names no tool when it reports this (`ToolStandDownPort`), and
     * this is the spec that holds it to that. The mutation it kills is a guard
     * on the scene's own read of the build tool -- `if (this.isBuildArmed())`
     * -- which would leave a player who armed the Rooms tab exactly where
     * #959 found the Build tab.
     */
    await openHarness(page);
    await page.evaluate(() => window.lockstateWorldSceneHarness!.armRoomTool(true));

    const box = (await page.locator('canvas').boundingBox())!;
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.move(centre.x + 8, centre.y);
    await settle(page);
    expect(
      await page.evaluate(() => window.lockstateWorldSceneHarness!.targetedArea()),
      'the room tool was not previewing, so it was not armed and this spec proves nothing',
    ).toBeDefined();

    await page.keyboard.press('Escape');
    await settle(page);
    expect(await page.evaluate(() => window.lockstateWorldSceneHarness!.standDownRequests())).toBe(1);
    expect(await page.evaluate(() => window.lockstateWorldSceneHarness!.isAnyToolArmed())).toBe(false);

    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(centre.x + 200, centre.y + 120, { steps: 10 });
    await page.mouse.up({ button: 'left' });
    await settle(page);
    expect(
      await page.evaluate(() => window.lockstateWorldSceneHarness!.placedAreas()),
      'the drag after Escape still designated a rectangle',
    ).toEqual([]);
  });

  /** What the scene has asked the edit-history port for, in order (#261). */
  async function historyRequests(page: Page): Promise<readonly string[]> {
    return page.evaluate(() => window.lockstateWorldSceneHarness!.historyRequests());
  }

  test('reports one undo per press of Z and one redo per press of Y (#261)', async ({ page }) => {
    /*
     * The keys that reach `ConstructionSystem`'s undo stack, which had a
     * complete transaction-grouped implementation and nothing that could
     * produce an `Undo` command: no control, no binding, no intent.
     *
     * **One per press** is the assertion, not "something happened". A press
     * produces a `'started'` event and the release produces an `'ended'` one
     * carrying the same action, so a handler that acted on both would take
     * back two transactions for one tap -- and `page.keyboard.press` does the
     * down and the up, so a doubled report shows up here as a second entry.
     */
    await openHarness(page);
    await press(page, 'KeyZ');
    expect(await historyRequests(page)).toEqual(['undo']);

    await press(page, 'KeyY');
    expect(await historyRequests(page)).toEqual(['undo', 'redo']);

    // Repeatable: the second press of the same key must land too, or undo
    // would reverse exactly one gesture per page load.
    await press(page, 'KeyZ');
    expect(await historyRequests(page)).toEqual(['undo', 'redo', 'undo']);
  });

  test('reaches the same binding through Ctrl+Z, because a binding carries no modifier (#261)', async ({ page }) => {
    /*
     * Measured rather than reasoned about, because the comment in
     * `src/input/bindings.ts` makes this claim: `KeyboardBinding` has no
     * modifier field and `KeyboardEventLike` reads `code` and `repeat`, so the
     * adapter cannot tell a chord from a bare key and the chord a player
     * already has in their fingers therefore works.
     *
     * `Control` only. macOS's `Command` cannot be exercised from this runner,
     * so what a `Cmd`+`Z` does is not claimed anywhere -- the bare key is the
     * control the player is promised, and the chord scheme itself is an open
     * question (#261) rather than something this binding implements.
     */
    await openHarness(page);

    await page.keyboard.press('Control+KeyZ');
    await settle(page);
    expect(await historyRequests(page)).toEqual(['undo']);

    // And it is the *same* binding, not a second one: pressing the bare key
    // afterwards adds one more request rather than doing nothing, which is
    // what a stuck `pressedCodes` entry from the chord would look like.
    await press(page, 'KeyZ');
    expect(await historyRequests(page)).toEqual(['undo', 'undo']);
  });

  test('undoes nothing while a text field owns the keyboard (#261, #201)', async ({ page }) => {
    /*
     * The Build panel's coordinate fields are the exposure this exists for:
     * `z` and `y` are characters a player types into them, and an undo that
     * fired mid-edit would take back a wall they were still describing. #201
     * is the same defect measured on the camera -- a focused `<input>`
     * received the character *and* the camera panned 249.6 world units.
     *
     * Both halves are asserted, because the guard must stop the undo without
     * stopping the typing.
     */
    await openHarness(page);
    await page.locator('#probe-text').click();
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('probe-text');

    await press(page, 'KeyZ');
    await press(page, 'KeyY');

    expect(await historyRequests(page), 'a keystroke meant for a text field reversed the player\'s work').toEqual([]);
    await expect(page.locator('#probe-text')).toBeVisible();
    await expect(page.locator('#probe-text')).toHaveValue('zy');
  });

  test('undoes again once the field is blurred, so the guard is not a permanent mute (#261, #201)', async ({ page }) => {
    // The other direction. A guard that silenced the keys and never restored
    // them would satisfy the spec above and leave undo as unreachable as it
    // was before it was wired.
    await openHarness(page);
    await page.locator('#probe-text').click();
    await page.locator('#probe-text').blur();
    expect(await page.evaluate(() => document.activeElement?.tagName.toLowerCase())).not.toBe('input');

    await press(page, 'KeyZ');
    expect(await historyRequests(page)).toEqual(['undo']);
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

/**
 * Recovery for a pointer gesture whose release never arrives (#202's `blur`
 * precedent, extended to the three pointer state machines by issue #516).
 *
 * `commitBuild`/`commitArea`/`commitObject` only ever run from Phaser's
 * `'pointerup'`/`'pointerupoutside'`. Before this fix, nothing else ever
 * reached `buildPointerId`/`areaPointerId`/`objectPointerId` once one of them
 * was set -- exactly the gap #202 closed for a key held across a `blur`, left
 * open on the three pointer fields it did not touch. `world-scene.ts`'s
 * `cancelBuild`/`cancelArea`/`cancelObject` already existed as the one place a
 * gesture is abandoned without placing anything (`Escape`, a second touch
 * finger); this issue is only about *what else* reaches them, not about a new
 * way to abandon a gesture.
 *
 * Two triggers, both exercised below, for the two different ways a release
 * can go missing:
 *
 * - **`blur`**: focus leaves the page and no `mouseup` ever follows, the same
 *   shape #202 measured for the keyboard. `world-scene.ts`'s existing `blur`
 *   listener now also calls `cancelAllGestures()`.
 * - **A hover move reporting no button held (`buttons === 0`), with no
 *   `pointerup`/`pointerupoutside` ever dispatched.** Focus never has to
 *   leave the page for this: a driver or the OS can drop the up-event while
 *   the window stays focused throughout, which is the case `blur` cannot see.
 *   `extendBuild`/`extendArea`/`extendObject` each check this on every move
 *   they're asked to extend (`releaseMissed`), and cancel their own gesture
 *   the moment it is observed.
 *
 * `Escape` already covered committing nothing after a *known* cancel
 * (`world-scene-input.spec.ts`'s `'cancels a pending wall run on Escape'`
 * above); what was never covered is either of the two triggers here putting
 * the scene into that same cancelled state on their own, for any of the three
 * gestures -- which is the gap this issue is about.
 *
 * All three gestures are covered here, not only the build gesture the issue
 * reproduced by hand: `beginArea`/`extendArea`/`commitArea`/`cancelArea` and
 * `beginObject`/`extendObject`/`commitObject`/`cancelObject` are the same
 * shape as their build counterparts (`world-scene.ts:1090-1226`), so the harness
 * now wires a room-tool and an object-tool double beside the existing
 * build-tool one and the specs below drive all three through both triggers --
 * this *is* the independent verification the issue asked for rather than an
 * argument from symmetry alone.
 */
test.describe('the world scene pointer gesture recovery (#516)', () => {
  /**
   * The CDP session Playwright's own `page.mouse` API cannot substitute for.
   *
   * `page.mouse.up()` would dispatch the very `pointerup` this defect is
   * about the *absence* of, and it would also mark Playwright's own tracked
   * button state released -- neither of which is the scenario under test.
   * `Input.dispatchMouseEvent`'s `buttons` field is an explicit bitmask,
   * independent of that tracking, so a `'mouseMoved'` can report `buttons: 0`
   * while Playwright still believes (correctly, as far as it knows) that the
   * button it pressed with `page.mouse.down()` is held. That is exactly the
   * shape #516's own reproduction used -- "a `mouseMoved` carrying
   * `buttons: 0`, with no `mouseup` or `pointerup` ever dispatched" -- so this
   * is a faithful replay of that evidence rather than a new scenario invented
   * for the test.
   *
   * What this does **not** establish, and is not claimed to: whether a real
   * desktop browser/OS ever produces exactly this sequence on its own is
   * engine- and OS-dependent (#516 says so explicitly), and the literal
   * "alt-tab away and release over another window" case has no OS focus for
   * Playwright's virtual mouse to leave. What this *does* establish is the
   * half that does not need an OS to be true: once such a move arrives, by
   * whatever means, `WorldScene` now recovers from it, where before nothing
   * would have.
   */
  async function missedRelease(client: CDPSession, at: { readonly x: number; readonly y: number }): Promise<void> {
    await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y, buttons: 0 });
  }

  /** Two animation frames, matching this file's own `settle` above but local to this block for the same reason `world-scene-touch.spec.ts` keeps its own copy: no shared harness module exists to import it from. */
  async function settle(page: Page): Promise<void> {
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
  }

  async function canvasCentre(page: Page): Promise<{ readonly x: number; readonly y: number }> {
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
    const box = (await canvas.boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  test('stops a middle-button pan on blur even when no mouseup reaches the page', async ({ page }) => {
    await openHarness(page);
    const centre = await canvasCentre(page);
    const client = await page.context().newCDPSession(page);
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(centre.x + 80, centre.y);
    await settle(page);
    const panned = await page.evaluate(() => window.lockstateWorldSceneHarness!.scroll().x);
    expect(panned, 'the middle-button drag did not pan before focus loss').not.toBe(0);

    await page.evaluate(() => window.dispatchEvent(new FocusEvent('blur')));
    await missedRelease(client, { x: centre.x + 120, y: centre.y });
    await settle(page);
    expect(await page.evaluate(() => window.lockstateWorldSceneHarness!.scroll().x)).toBe(panned);
    await page.mouse.up({ button: 'middle' });
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(centre.x + 40, centre.y);
    await settle(page);
    expect(await page.evaluate(() => window.lockstateWorldSceneHarness!.scroll().x)).not.toBe(panned);
    await page.mouse.up({ button: 'middle' });
    await client.detach();
  });

  test('stops a middle-button pan when a no-button move reveals a missed mouseup', async ({ page }) => {
    await openHarness(page);
    const centre = await canvasCentre(page);
    const client = await page.context().newCDPSession(page);
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(centre.x + 80, centre.y);
    await settle(page);
    const panned = await page.evaluate(() => window.lockstateWorldSceneHarness!.scroll().x);
    expect(panned, 'the middle-button drag did not pan').not.toBe(0);

    // No blur and no mouseup reaches the page. The next move reports the
    // browser's actual state: no button held.
    await missedRelease(client, { x: centre.x + 120, y: centre.y });
    await settle(page);
    expect(await page.evaluate(() => window.lockstateWorldSceneHarness!.scroll().x)).toBe(panned);
    await page.mouse.up({ button: 'middle' });

    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(centre.x + 40, centre.y);
    await settle(page);
    expect(await page.evaluate(() => window.lockstateWorldSceneHarness!.scroll().x)).not.toBe(panned);
    await page.mouse.up({ button: 'middle' });
    await client.detach();
  });

  test('cancels a pending wall run when the window loses focus mid-drag, and the run does not commit (#516)', async ({
    page,
  }) => {
    await openHarness(page);
    await page.evaluate(() => window.lockstateWorldSceneHarness!.armBuildTool(true));
    const centre = await canvasCentre(page);

    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(centre.x + 200, centre.y, { steps: 10 });

    // Positive control: a run really is in progress, spanning more than the
    // one segment a bare press would leave targeted.
    const during = await page.evaluate(() => window.lockstateWorldSceneHarness!.targetedRun());
    expect(during, 'no run was in progress, so blur cancelling it proves nothing').toBeDefined();
    expect(during!.length).toBeGreaterThan(1);

    // The alt-tab shape #202 measured for the keyboard: focus leaves and no
    // `mouseup` ever follows.
    await page.evaluate(() => window.dispatchEvent(new FocusEvent('blur')));
    await settle(page);

    expect(
      await page.evaluate(() => window.lockstateWorldSceneHarness!.targetedRun()),
      'blur left the run targeted, which is the gap #516 found for the pointer state machines',
    ).toBeUndefined();

    // The button was never actually released as far as the page is
    // concerned; the eventual `mouseup` must not place what `blur` already
    // abandoned. Dispatched for hygiene (it is the real button state) and
    // asserted because a second, separate path to `commitBuild` running after
    // `cancelBuild` already ran would be its own defect.
    await page.mouse.up({ button: 'left' });
    await settle(page);
    expect(await page.evaluate(() => window.lockstateWorldSceneHarness!.placedRuns())).toEqual([]);
  });

  test('cancels a pending room rectangle when the window loses focus mid-drag (#516)', async ({ page }) => {
    // The same claim as the build spec above, for the area gesture -- proving
    // the symmetry #516 argued for rather than assuming it from the shared
    // shape of the code.
    await openHarness(page);
    await page.evaluate(() => window.lockstateWorldSceneHarness!.armRoomTool(true));
    const centre = await canvasCentre(page);

    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(centre.x + 200, centre.y, { steps: 10 });

    const during = await page.evaluate(() => window.lockstateWorldSceneHarness!.targetedArea());
    expect(during, 'no rectangle was in progress, so blur cancelling it proves nothing').toBeDefined();
    expect(during!.width, 'the drag never actually spanned more than one tile').toBeGreaterThan(1);

    await page.evaluate(() => window.dispatchEvent(new FocusEvent('blur')));
    await settle(page);

    expect(await page.evaluate(() => window.lockstateWorldSceneHarness!.targetedArea())).toBeUndefined();

    await page.mouse.up({ button: 'left' });
    await settle(page);
    expect(await page.evaluate(() => window.lockstateWorldSceneHarness!.placedAreas())).toEqual([]);
  });

  test('cancels a pending object placement when the window loses focus mid-drag (#516)', async ({ page }) => {
    // The same claim again, for the third gesture. The object tool has no
    // second corner to drag -- `beginObject`'s own comment says why -- so the
    // positive control here is that the drag actually moved the pending tile,
    // not that it grew a rectangle.
    await openHarness(page);
    await page.evaluate(() => window.lockstateWorldSceneHarness!.armObjectTool(true));
    const centre = await canvasCentre(page);

    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down({ button: 'left' });
    const atPress = await page.evaluate(() => window.lockstateWorldSceneHarness!.targetedObject());
    expect(atPress, 'the press itself placed no pending tile, so a drag proves nothing further').toBeDefined();

    await page.mouse.move(centre.x + 200, centre.y, { steps: 10 });
    const during = await page.evaluate(() => window.lockstateWorldSceneHarness!.targetedObject());
    expect(during, 'no placement was in progress, so blur cancelling it proves nothing').toBeDefined();
    expect(during!.tileX, 'the drag never actually moved onto a different tile').not.toBe(atPress!.tileX);

    await page.evaluate(() => window.dispatchEvent(new FocusEvent('blur')));
    await settle(page);

    expect(await page.evaluate(() => window.lockstateWorldSceneHarness!.targetedObject())).toBeUndefined();

    await page.mouse.up({ button: 'left' });
    await settle(page);
    expect(await page.evaluate(() => window.lockstateWorldSceneHarness!.placedObjects())).toEqual([]);
  });

  test('replaces a stale multi-segment wall run with a fresh single-edge hover ghost when a hover move reports no button held and no release was ever dispatched, and a fresh drag afterwards still places one wall (#516)', async ({
    page,
  }) => {
    await openHarness(page);
    await page.evaluate(() => window.lockstateWorldSceneHarness!.armBuildTool(true));
    const centre = await canvasCentre(page);
    const client = await page.context().newCDPSession(page);

    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(centre.x + 200, centre.y, { steps: 10 });

    const during = await page.evaluate(() => window.lockstateWorldSceneHarness!.targetedRun());
    expect(during, 'no run was in progress, so the recovery below proves nothing').toBeDefined();
    expect(during!.length).toBeGreaterThan(1);

    // #516's own reproduction, replayed: a move reporting no button down, with
    // no `mouseup`/`pointerup` ever sent. The load-bearing claim is not that
    // the readout goes blank -- an armed tool that shows nothing under the
    // cursor is its own kind of broken -- it is that the recompute stops
    // being anchored to the stale press point. `edgeRunFromDrag(buildPress,
    // current)` against a press 220px behind the cursor would still be a
    // multi-segment run (the pre-fix behaviour this reproduces); a single
    // edge is what a plain, un-anchored hover always paints
    // (`previewHover`/`pickEdgeAtWorld`), which is only reachable once
    // `buildPointerId` has actually been cleared.
    await missedRelease(client, { x: centre.x + 220, y: centre.y });
    await settle(page);
    const afterMissedRelease = await page.evaluate(() => window.lockstateWorldSceneHarness!.targetedRun());
    expect(afterMissedRelease, 'the armed tool should still show a hover ghost, just not the stale one').toBeDefined();
    expect(
      afterMissedRelease!.length,
      'still a multi-segment run anchored to the original press, which is the defect #516 measured',
    ).toBe(1);

    // Two further no-button moves, matching #516's evidence exactly ("the
    // ghost stayed frozen through two further no-button moves" was the
    // *unfixed* behaviour; here each is an ordinary single-edge hover, never a
    // multi-segment run reappearing).
    for (const dx of [30, 60]) {
      await missedRelease(client, { x: centre.x + 220 + dx, y: centre.y });
      await settle(page);
      expect(await page.evaluate(() => window.lockstateWorldSceneHarness!.targetedRun())).toHaveLength(1);
    }

    // The half that matters most, and the one #516 itself named as the risk
    // of leaving this open: whatever a *real*, if delayed, release finally
    // does must not place the stale run. Dispatched for hygiene (matching the
    // real button state) and asserted because a release reaching
    // `commitBuild` after `cancelBuild` already ran on the same pointer id
    // would be its own defect.
    await page.mouse.up({ button: 'left' });
    await settle(page);
    expect(await page.evaluate(() => window.lockstateWorldSceneHarness!.placedRuns())).toEqual([]);

    // The recovery is a cancel, not a mute: a fresh press-and-drag-and-release
    // afterwards still places exactly one run, matching #516's own evidence
    // ("a subsequent fresh press-and-release built exactly one new wall").
    await page.mouse.move(centre.x - 150, centre.y - 100);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(centre.x - 150 + 150, centre.y - 100, { steps: 10 });
    await page.mouse.up({ button: 'left' });
    await settle(page);

    const runs = await page.evaluate(() => window.lockstateWorldSceneHarness!.placedRuns());
    expect(runs.length).toBe(1);
    expect(runs[0]!.length).toBeGreaterThan(1);
  });

  test('replaces a stale multi-tile room rectangle with a fresh single-tile hover mark when a hover move reports no button held and no release was ever dispatched (#516)', async ({
    page,
  }) => {
    // The area gesture's own gap, independently verified -- not inferred from
    // the build spec above. `tileRectFromDrag(areaPress, current)` is the same
    // anchored-recompute shape as `edgeRunFromDrag`, so the same distinguishing
    // signal applies: a rectangle wider than one tile is the stale drag: a
    // bare 1x1 is the fresh, un-anchored hover mark `previewAreaHover` paints.
    await openHarness(page);
    await page.evaluate(() => window.lockstateWorldSceneHarness!.armRoomTool(true));
    const centre = await canvasCentre(page);
    const client = await page.context().newCDPSession(page);

    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(centre.x + 200, centre.y, { steps: 10 });

    const during = await page.evaluate(() => window.lockstateWorldSceneHarness!.targetedArea());
    expect(during, 'no rectangle was in progress, so the recovery below proves nothing').toBeDefined();
    expect(during!.width).toBeGreaterThan(1);

    await missedRelease(client, { x: centre.x + 220, y: centre.y });
    await settle(page);
    const afterMissedRelease = await page.evaluate(() => window.lockstateWorldSceneHarness!.targetedArea());
    expect(afterMissedRelease, 'the armed tool should still show a hover mark, just not the stale one').toBeDefined();
    expect(
      afterMissedRelease!.width,
      'still a multi-tile rectangle anchored to the original press, which is the defect #516 measured',
    ).toBe(1);
    expect(afterMissedRelease!.height).toBe(1);

    // The load-bearing check: the eventual real release must designate
    // nothing, because the stale drag it would have committed is gone.
    await page.mouse.up({ button: 'left' });
    await settle(page);
    expect(await page.evaluate(() => window.lockstateWorldSceneHarness!.placedAreas())).toEqual([]);
  });

  test('clears a pending object placement so an unrelated later release commits nothing, when a hover move reports no button held and no release was ever dispatched (#516)', async ({
    page,
  }) => {
    /*
     * The object gesture's own gap, independently verified -- and shaped
     * differently from the two specs above, which is worth recording rather
     * than glossing. `extendObject` -> `footprintUnder` never reads a
     * retained press point at all (`beginObject`'s own comment: "there is no
     * second corner for a drag to move"), so it recomputes correctly from the
     * *current* pointer whether or not `releaseMissed` fires -- the ghost
     * never visibly freezes for this gesture, before or after the fix, and a
     * spec asserting the readout changed would be measuring nothing.
     *
     * What the fix changes is invisible and exactly what #516 is actually
     * about: whether `objectPointerId` keeps this pointer "claimed" after the
     * release goes missing. Left claimed, an unrelated later release -- one
     * the player never intended as a placement, because as far as they know
     * no button is down -- reaches `commitObject` and places whatever tile
     * the cursor happens to be over. That is the assertion below, and it is
     * the same one the build and room specs make at the point that matters
     * most; it just has to carry the whole claim here on its own.
     */
    await openHarness(page);
    await page.evaluate(() => window.lockstateWorldSceneHarness!.armObjectTool(true));
    const centre = await canvasCentre(page);
    const client = await page.context().newCDPSession(page);

    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down({ button: 'left' });
    const atPress = await page.evaluate(() => window.lockstateWorldSceneHarness!.targetedObject());
    expect(atPress, 'the press itself placed no pending tile, so a drag proves nothing further').toBeDefined();

    await page.mouse.move(centre.x + 200, centre.y, { steps: 10 });
    const during = await page.evaluate(() => window.lockstateWorldSceneHarness!.targetedObject());
    expect(during, 'no placement was in progress, so the recovery below proves nothing').toBeDefined();
    expect(during!.tileX, 'the drag never actually moved onto a different tile').not.toBe(atPress!.tileX);

    await missedRelease(client, { x: centre.x + 220, y: centre.y });
    await settle(page);

    // An unrelated later release: the player believes no button is down and
    // is not trying to place anything, so this must place nothing.
    await page.mouse.up({ button: 'left' });
    await settle(page);
    expect(
      await page.evaluate(() => window.lockstateWorldSceneHarness!.placedObjects()),
      'a release the player never intended as a placement placed one anyway, which is the risk #516 named',
    ).toEqual([]);
  });
});
