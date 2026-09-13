import { expect, test, type CDPSession, type Page } from './network-changed-fixture';

/**
 * **A resize gesture has one owner** (issue #1159, stage 3; constitution
 * article 17, *"Gest ma jednego właściciela"*).
 *
 * ## What this file is for, and what it deliberately is not
 *
 * `tests/unit/resize-separator.test.ts` settles the arithmetic, every keyboard
 * step and every cancellation path against `SeparatorController`, in `node`.
 * What it cannot touch is the half that turns those decisions into behaviour:
 * `setPointerCapture` retargeting a drag away from the Phaser canvas, a
 * `pointercancel` the browser itself raises, a real `blur`, and a second finger
 * that only a `hasTouch` context and CDP `Input.dispatchTouchEvent` can put on
 * the screen (`page.touchscreen` places one finger and cannot express a
 * second -- `world-scene-touch.spec.ts` records that).
 *
 * So every assertion here is of the form **"the panel moved, and the world did
 * not"**, measured on a page where both exist:
 * `resize-separator-harness.html` loads the real `WorldScene` and puts the real
 * separator on top of the canvas it made.
 *
 * ## Why the world half can fail
 *
 * Phaser 4 listens for `mousemove`/`mouseup` **on the game canvas**, which fills
 * the window -- so every pixel of this handle is also a pixel of the map. With
 * the build tool armed, a press that reaches the canvas places a wall. The
 * *positive control* below drags the same distance starting on bare canvas and
 * asserts exactly that, because an assertion that nothing was built is worth
 * nothing on a page where nothing could have been.
 *
 * ## The two things here that are not real browser events, named because they
 * are this file's weakest claims
 *
 * The window-blur case dispatches `new FocusEvent('blur')` on `window`, and the
 * leave-the-document case dispatches a `pointerout` with a null
 * `relatedTarget`. The first follows this repository's existing precedent for
 * the same signal (`world-scene-input.spec.ts` drives `WorldScene`'s own blur
 * recovery the same way). Both prove the listener is registered where this code
 * says it is and reaches the right cancellation; neither proves *when Chromium
 * raises it*.
 *
 * For the second, measurement says something sharper, and it is recorded on the
 * test that found it: while an element holds pointer capture Chromium raises no
 * boundary event at all, so a drag leaving the viewport **keeps going** and
 * commits where the hand let go. That is the behaviour a splitter needs, and it
 * is asserted with a real pointer. Every other gesture end below -- the release,
 * the `pointercancel`, the second touch, the `Escape` -- is produced by the
 * browser.
 */

test.use({ hasTouch: true });

const HARNESS_URL = '/tests/browser/resize-separator-harness.html';

/**
 * Fixed, because the drag distances below are absolute page pixels and the
 * handle's position is derived from the panel's own width rather than from the
 * viewport. A runner with a different default window would still pass, but the
 * "ends over the map" leg would end somewhere else, which is the leg's subject.
 */
const VIEWPORT = { width: 1280, height: 720 } as const;

/** The harness's own numbers, restated here so a change to either side is visible. */
const INITIAL_SIZE = 120;
const RANGE = { min: 72, max: 180 } as const;
const DEFAULT_SIZE = 140;

interface Point {
  readonly x: number;
  readonly y: number;
}

async function openHarness(page: Page): Promise<void> {
  await page.setViewportSize({ width: VIEWPORT.width, height: VIEWPORT.height });
  await page.goto(HARNESS_URL);
  await page.waitForFunction(
    () => window.lockstateSeparatorHarness !== undefined && window.lockstateWorldSceneHarness !== undefined,
  );
  await page.evaluate(() => window.lockstateWorldSceneHarness!.ready);
  // The canvas has to exist before the underlay tripwire can attach to it, and
  // an assertion that nothing reached the canvas is vacuous until it has.
  await page.waitForSelector('#world-scene-harness-root canvas');
  await page.evaluate(() => window.lockstateSeparatorHarness!.clear());
}

/** Two animation frames: the shortest honest "the engine drew a frame with this". */
async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

/** The middle of the handle, in page pixels, wherever the panel has put it. */
async function handleCentre(page: Page): Promise<Point> {
  const rect = await page.evaluate(() => window.lockstateSeparatorHarness!.handleRect());
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/** Everything the world could have been made to do, read in one round trip. */
async function world(page: Page): Promise<{
  readonly runs: number;
  readonly areas: number;
  readonly objects: number;
  readonly targeted: boolean;
  readonly scroll: Point;
}> {
  await settle(page);
  return page.evaluate(() => {
    const harness = window.lockstateWorldSceneHarness!;
    return {
      runs: harness.placedRuns().length,
      areas: harness.placedAreas().length,
      objects: harness.placedObjects().length,
      targeted: harness.targetedRun() !== undefined,
      scroll: harness.scroll(),
    };
  });
}

/** The separator's own state, read in one round trip. */
async function separator(page: Page): Promise<{
  readonly size: number;
  readonly panelWidth: number;
  readonly dragging: boolean;
  readonly reports: readonly { size: number; reason: string }[];
  readonly ends: readonly string[];
  readonly collapses: number;
  readonly underlay: readonly string[];
  readonly valueNow: string | null;
}> {
  return page.evaluate(() => {
    const harness = window.lockstateSeparatorHarness!;
    return {
      size: harness.size(),
      panelWidth: harness.panelWidth(),
      dragging: harness.isDragging(),
      reports: harness.reports().map((report) => ({ size: report.size, reason: report.reason as string })),
      ends: harness.gestureEnds() as readonly string[],
      collapses: harness.collapses(),
      underlay: harness.underlayEvents(),
      valueNow: harness.aria().valueNow,
    };
  });
}

/**
 * A press on the canvas is the whole failure mode, so it gets its own name.
 *
 * `pointermove` and `mousemove` are excluded: a pointer travelling over an
 * uncaptured canvas legitimately produces them, and they are what the hover
 * ghost is drawn from. What must never reach the canvas during a captured drag
 * is a *press* or a *release* -- those are what start and commit a wall run.
 */
function pressesOnCanvas(underlay: readonly string[]): readonly string[] {
  return underlay.filter((type) => type !== 'pointermove' && type !== 'mousemove');
}

async function armBuildTool(page: Page): Promise<void> {
  await page.evaluate(() => window.lockstateWorldSceneHarness!.armBuildTool(true));
}

async function touch(
  client: CDPSession,
  type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel',
  points: readonly { readonly id: number; readonly x: number; readonly y: number }[],
): Promise<void> {
  await client.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map((point) => ({ x: point.x, y: point.y, id: point.id })),
  });
}

test.describe('the drag-resizable separator', () => {
  test('announces itself as a window splitter with a value and a range', async ({ page }) => {
    await openHarness(page);

    const aria = await page.evaluate(() => window.lockstateSeparatorHarness!.aria());
    expect(aria.role).toBe('separator');
    expect(aria.tabIndex).toBe(0);
    expect(aria.label).toBe('Resize the navigation rail');
    expect(aria.controls).toBe('separator-harness-panel');
    // A separator between a LEFT and a RIGHT pane is itself a VERTICAL line.
    // This is the attribute that is routinely written the other way round.
    expect(aria.orientation).toBe('vertical');
    expect(aria.valueNow).toBe(String(INITIAL_SIZE));
    expect(aria.valueMin).toBe(String(RANGE.min));
    expect(aria.valueMax).toBe(String(RANGE.max));
    expect(aria.busy).toBeNull();
  });

  test('a drag that begins on the handle and ends over the map resizes the panel and builds nothing', async ({
    page,
  }) => {
    await openHarness(page);
    await armBuildTool(page);
    const before = await world(page);
    const start = await handleCentre(page);

    await page.mouse.move(start.x, start.y);
    await page.mouse.down({ button: 'left' });
    // Four hundred pixels to the right is deep inside the map. The size clamps
    // at the range's maximum long before the pointer gets there, which is the
    // point: the gesture continues over the canvas and the canvas hears none
    // of it.
    await page.mouse.move(start.x + 400, start.y, { steps: 8 });

    const during = await separator(page);
    expect(during.dragging, 'the drag never started, so nothing below is a test of one').toBe(true);
    expect(during.size).toBe(RANGE.max);

    await page.mouse.up({ button: 'left' });
    await settle(page);

    const after = await separator(page);
    const world_ = await world(page);

    expect(after.dragging).toBe(false);
    expect(after.size).toBe(RANGE.max);
    expect(after.panelWidth).toBe(RANGE.max);
    expect(after.valueNow).toBe(String(RANGE.max));
    expect(after.ends).toEqual(['released']);
    expect(after.reports.at(-1)).toEqual({ size: RANGE.max, reason: 'pointer' });

    expect(world_.runs).toBe(0);
    expect(world_.areas).toBe(0);
    expect(world_.objects).toBe(0);
    expect(world_.targeted).toBe(false);
    expect(world_.scroll).toEqual(before.scroll);
    expect(pressesOnCanvas(after.underlay)).toEqual([]);
  });

  /**
   * The positive control, and the test above is worth nothing without it.
   *
   * The same distance, the same button, the same armed tool -- started on bare
   * canvas instead of on the handle. If this does not build a wall then the
   * page cannot build one at all, and "no world command was issued" is a
   * statement about a dead harness rather than about the separator.
   */
  test('the same drag on bare canvas does build, which is what makes the assertion above mean something', async ({
    page,
  }) => {
    await openHarness(page);
    await armBuildTool(page);

    const box = (await page.locator('#world-scene-harness-root canvas').boundingBox())!;
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(centre.x + 200, centre.y, { steps: 8 });
    await page.mouse.up({ button: 'left' });

    const world_ = await world(page);
    expect(world_.runs).toBe(1);

    // And the separator, which was never touched, is exactly where it was.
    const after = await separator(page);
    expect(after.size).toBe(INITIAL_SIZE);
    expect(after.reports).toEqual([]);
  });

  test('a pointercancel mid-drag puts the panel back and builds nothing', async ({ page }) => {
    await openHarness(page);
    await armBuildTool(page);
    const client = await page.context().newCDPSession(page);
    const start = await handleCentre(page);

    await touch(client, 'touchStart', [{ id: 0, x: start.x, y: start.y }]);
    await touch(client, 'touchMove', [{ id: 0, x: start.x + 40, y: start.y }]);

    const during = await separator(page);
    expect(during.dragging, 'the touch never claimed the handle, so there was no drag to cancel').toBe(true);
    expect(during.size).toBe(INITIAL_SIZE + 40);
    expect(during.panelWidth).toBe(INITIAL_SIZE + 40);

    await touch(client, 'touchCancel', []);
    await settle(page);

    const after = await separator(page);
    expect(after.dragging).toBe(false);
    expect(after.ends).toEqual(['pointercancel']);
    expect(after.size).toBe(INITIAL_SIZE);
    expect(after.panelWidth).toBe(INITIAL_SIZE);
    expect(after.valueNow).toBe(String(INITIAL_SIZE));
    expect(after.reports.at(-1)).toEqual({ size: INITIAL_SIZE, reason: 'cancel' });

    const world_ = await world(page);
    expect(world_.runs).toBe(0);
    expect(world_.objects).toBe(0);
    expect(world_.targeted).toBe(false);
    expect(pressesOnCanvas(after.underlay)).toEqual([]);
  });

  /**
   * `a773f3a2`'s lesson, from the other side of the boundary.
   *
   * There it was a second stationary finger leaving the *first* finger's
   * placement live; here it is a second finger landing on the map while the
   * first drags the separator. Two fingers mean a pinch, and a separator that
   * kept resizing under one of them while the map zoomed under the other would
   * be the two-owner gesture article 17 forbids.
   */
  test('a second touch arriving mid-drag ends the drag and builds nothing', async ({ page }) => {
    await openHarness(page);
    await armBuildTool(page);
    const client = await page.context().newCDPSession(page);
    const start = await handleCentre(page);

    await touch(client, 'touchStart', [{ id: 0, x: start.x, y: start.y }]);
    await touch(client, 'touchMove', [{ id: 0, x: start.x + 40, y: start.y }]);
    expect((await separator(page)).size).toBe(INITIAL_SIZE + 40);

    // The second finger lands on the map, not on the handle -- which is why the
    // separator can only hear it on the document.
    await touch(client, 'touchStart', [
      { id: 0, x: start.x + 40, y: start.y },
      { id: 1, x: start.x + 500, y: start.y + 100 },
    ]);
    await settle(page);

    const after = await separator(page);
    expect(after.dragging).toBe(false);
    expect(after.ends).toEqual(['second-pointer']);
    expect(after.size).toBe(INITIAL_SIZE);
    expect(after.panelWidth).toBe(INITIAL_SIZE);

    await touch(client, 'touchEnd', []);
    const world_ = await world(page);
    expect(world_.runs).toBe(0);
    expect(world_.objects).toBe(0);
  });

  test('the window losing focus ends the drag and puts the panel back', async ({ page }) => {
    await openHarness(page);
    await armBuildTool(page);
    const start = await handleCentre(page);

    await page.mouse.move(start.x, start.y);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(start.x + 30, start.y, { steps: 4 });
    expect((await separator(page)).size).toBe(INITIAL_SIZE + 30);

    // Synthetic, and named as such in this file's header: the precedent is
    // `world-scene-input.spec.ts`, which drives the scene's own blur recovery
    // the same way. It proves the listener is on `window` and does the right
    // thing; it does not prove Chromium raises it when another window takes
    // focus.
    await page.evaluate(() => {
      window.dispatchEvent(new FocusEvent('blur'));
    });
    await settle(page);

    const after = await separator(page);
    expect(after.dragging).toBe(false);
    expect(after.ends).toEqual(['window-blur']);
    expect(after.size).toBe(INITIAL_SIZE);
    expect(after.panelWidth).toBe(INITIAL_SIZE);

    // And the release, which now arrives with no gesture to end, does nothing
    // at all -- neither to the panel nor to the world.
    await page.mouse.up({ button: 'left' });
    const world_ = await world(page);
    expect(world_.runs).toBe(0);
    expect((await separator(page)).size).toBe(INITIAL_SIZE);
  });

  /**
   * **Measured, and it refuted what this spec first asserted.**
   *
   * The first version of this test moved the pointer to `y = -20`, above the
   * top of the content area, and expected the `left-window` path to fire. It
   * does not, and the reason is the same mechanism that makes the separator
   * safe in the first place: while an element holds pointer capture the pointer
   * is treated as being *inside* it wherever it goes, so Chromium raises no
   * boundary event at all -- not `pointerleave` on the element and not
   * `pointerout` on the document. Run 1, `expect(after.dragging).toBe(false)`:
   * received `true`.
   *
   * That is the right behaviour rather than a gap, and it is what this test
   * asserts instead: the drag survives leaving the viewport, keeps tracking,
   * and commits where the hand let go -- which is what a splitter dragged past
   * the edge of a maximised window has to do. The canvas still hears nothing.
   * The `left-window` listener is not dead code for it; it is what answers when
   * a pointer is lost with no capture in force, and the test below is what
   * proves that listener is wired.
   */
  test('a drag that leaves the viewport keeps its pointer under capture and still commits', async ({ page }) => {
    await openHarness(page);
    await armBuildTool(page);
    const start = await handleCentre(page);

    await page.mouse.move(start.x, start.y);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(start.x + 30, start.y, { steps: 4 });
    await page.mouse.move(start.x + 30, -20);
    await settle(page);

    const outside = await separator(page);
    expect(outside.dragging).toBe(true);
    expect(outside.size).toBe(INITIAL_SIZE + 30);

    await page.mouse.move(start.x + 50, -20);
    await page.mouse.up({ button: 'left' });
    await settle(page);

    const after = await separator(page);
    expect(after.dragging).toBe(false);
    expect(after.ends).toEqual(['released']);
    expect(after.size).toBe(INITIAL_SIZE + 50);
    expect(after.panelWidth).toBe(INITIAL_SIZE + 50);

    const world_ = await world(page);
    expect(world_.runs).toBe(0);
    expect(pressesOnCanvas(after.underlay)).toEqual([]);
  });

  /**
   * The `left-window` listener itself, driven synthetically.
   *
   * Second of the two weaker claims in this file, and for the same reason as
   * the blur above: the event is dispatched rather than raised. What it settles
   * is that the listener is registered on the document in the capture phase,
   * that it reads `relatedTarget === null` as the discriminator, and that it
   * reaches `interrupt('left-window')` with the pointer the gesture holds. What
   * it does not settle is when Chromium raises it, which the test above says is
   * *not* during a captured drag.
   *
   * The `pointerId` is read off the real press rather than defaulted: a
   * synthetic event carrying pointer 0 would be correctly ignored, and the test
   * would pass for the wrong reason on an implementation that checked nothing.
   */
  test('a pointerout with no related target ends the drag and puts the panel back', async ({ page }) => {
    await openHarness(page);
    await armBuildTool(page);
    const start = await handleCentre(page);

    await page.mouse.move(start.x, start.y);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(start.x + 30, start.y, { steps: 4 });
    expect((await separator(page)).size).toBe(INITIAL_SIZE + 30);

    // A crossing between two elements inside the page, which must be ignored:
    // these arrive constantly during any drag across a document.
    await page.evaluate(() => {
      const pointerId = window.lockstateSeparatorHarness!.lastPointerId()!;
      document.dispatchEvent(
        new PointerEvent('pointerout', { pointerId, relatedTarget: document.body, bubbles: true }),
      );
    });
    expect((await separator(page)).dragging, 'a crossing inside the page ended the drag').toBe(true);

    await page.evaluate(() => {
      const pointerId = window.lockstateSeparatorHarness!.lastPointerId()!;
      document.dispatchEvent(new PointerEvent('pointerout', { pointerId, relatedTarget: null, bubbles: true }));
    });
    await settle(page);

    const after = await separator(page);
    expect(after.dragging).toBe(false);
    expect(after.ends).toEqual(['left-window']);
    expect(after.size).toBe(INITIAL_SIZE);
    expect(after.panelWidth).toBe(INITIAL_SIZE);

    await page.mouse.up({ button: 'left' });
    expect((await world(page)).runs).toBe(0);
  });

  test('Escape abandons a drag in progress, exactly as it abandons a wall run', async ({ page }) => {
    await openHarness(page);
    await armBuildTool(page);
    const start = await handleCentre(page);

    await page.mouse.move(start.x, start.y);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(start.x + 30, start.y, { steps: 4 });
    expect((await separator(page)).size).toBe(INITIAL_SIZE + 30);

    await page.keyboard.press('Escape');
    await settle(page);

    const after = await separator(page);
    expect(after.dragging).toBe(false);
    expect(after.ends).toEqual(['abandoned']);
    expect(after.size).toBe(INITIAL_SIZE);

    await page.mouse.up({ button: 'left' });
    expect((await world(page)).runs).toBe(0);
  });

  test('the keyboard reaches every step the delivery specifies, and the world hears none of them', async ({ page }) => {
    await openHarness(page);
    await armBuildTool(page);

    await page.evaluate(() => window.lockstateSeparatorHarness!.focusHandle());
    expect(await page.evaluate(() => window.lockstateSeparatorHarness!.handleHasFocus())).toBe(true);

    const press = async (key: string): Promise<number> => {
      await page.keyboard.press(key);
      return page.evaluate(() => window.lockstateSeparatorHarness!.size());
    };

    expect(await press('ArrowRight')).toBe(130);
    expect(await press('ArrowLeft')).toBe(120);
    expect(await press('Shift+ArrowRight')).toBe(160);
    expect(await press('Shift+ArrowLeft')).toBe(120);
    expect(await press('End')).toBe(RANGE.max);
    expect(await press('Home')).toBe(RANGE.min);
    // Across the axis: a vertical separator must leave the up and down arrows
    // to whatever else wanted them.
    expect(await press('ArrowUp')).toBe(RANGE.min);
    expect(await press('ArrowDown')).toBe(RANGE.min);

    const afterKeys = await separator(page);
    expect(afterKeys.panelWidth).toBe(RANGE.min);
    expect(afterKeys.valueNow).toBe(String(RANGE.min));
    expect(afterKeys.collapses).toBe(0);

    await page.keyboard.press('Enter');
    expect((await separator(page)).collapses).toBe(1);

    // The double-click is a pointer gesture on the handle and still reaches
    // nothing beneath it.
    const centre = await handleCentre(page);
    await page.mouse.dblclick(centre.x, centre.y);
    await settle(page);

    const afterReset = await separator(page);
    expect(afterReset.size).toBe(DEFAULT_SIZE);
    expect(afterReset.panelWidth).toBe(DEFAULT_SIZE);
    expect(afterReset.reports.at(-1)).toEqual({ size: DEFAULT_SIZE, reason: 'reset' });

    const world_ = await world(page);
    expect(world_.runs).toBe(0);
    expect(world_.objects).toBe(0);
    expect(pressesOnCanvas(afterReset.underlay)).toEqual([]);
  });

  /**
   * The middle drag is a camera pan at all times (`docs/INPUT.md`), and it does
   * not stop being one because it landed on this handle.
   */
  test('a middle-button press on the handle is not a resize', async ({ page }) => {
    await openHarness(page);
    const start = await handleCentre(page);

    await page.mouse.move(start.x, start.y);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(start.x + 60, start.y, { steps: 4 });
    await page.mouse.up({ button: 'middle' });
    await settle(page);

    const after = await separator(page);
    expect(after.dragging).toBe(false);
    expect(after.size).toBe(INITIAL_SIZE);
    expect(after.reports).toEqual([]);
    expect(after.ends).toEqual([]);
  });
});
