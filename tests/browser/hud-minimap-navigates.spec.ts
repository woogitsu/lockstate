import { expect, test, type Page } from './network-changed-fixture';
import { defaultMessageCatalogEn } from '../../src/services/localization';
import { installTee, openApp, press, sentCommands, tab } from './playtest-harness';

/**
 * **The app-level gate for issue #793: a click on `.hud-minimap` reaches the
 * camera underneath it.**
 *
 * `.hud-minimap` opted into `pointer-events: auto` (`hud.css`) with no handler
 * behind it (`hud.ts`), so it swallowed every click meant for the world
 * underneath and did nothing with it -- measured in
 * `docs/research/2026-09-02-the-world-view.md` at 14.5% of the canvas at
 * 1280x800. The owner's ruling: the minimap should navigate, and keeps its
 * clicks because they finally do something.
 *
 * **What this file asserts, and what it deliberately does not.** The *mapping*
 * -- which world point a given point on the surface names -- is asserted to
 * the float in `tests/browser/world-scene-minimap.spec.ts`, against a real
 * `WorldScene` and a real Phaser camera with no HUD in the way. That is where
 * the exact claim belongs and it could not be made here: the only camera
 * readout the assembled page offers is a screen-to-tile reading taken by
 * pressing the world, which answers in whole tiles or, through
 * `playtest-harness.ts`'s `calibrate()`, in whole pixels. An identity between
 * two floats cannot be stated in whole pixels, and asserting it here as
 * `toEqual` over two bisections said only "these agree to within a pixel" at a
 * cost of three bisections -- around forty clicks -- in one test.
 *
 * So this file keeps exactly the three claims that need the assembled page and
 * cannot be made anywhere else:
 *
 * 1. **The panel no longer swallows the click, and the HUD's own normalization
 *    is not flipped.** `hud.ts` turns a `MouseEvent` into `fx`/`fy` against
 *    `getBoundingClientRect()`, and no test below the app can see that
 *    arithmetic at all -- a transposed or inverted derivation there would pass
 *    every harness assertion, because the harness calls
 *    `navigateToMinimapPoint` directly.
 * 2. **A click that finds no loaded world sends no simulation command**
 *    (`AGENTS.md` boundary 1), which needs the real command channel.
 * 3. **The panel's one sentence stops claiming the minimap is unavailable**
 *    once a click has demonstrably worked, which needs the real HUD.
 *
 * **Watching its own instrument** (`tests/browser/playtest-2026-09-01-the-people.playtest.ts`'s
 * own lesson): every click below is preceded by a real `elementsFromPoint` read
 * that confirms the click actually lands on `.hud-minimap__surface` or a child
 * of it, not on some other control that happens to sit at the same coordinate.
 * A click that silently missed its target would otherwise read as "the minimap
 * does not navigate" for the wrong reason.
 */

/** The sentence the bundled default locale gives a key -- read rather than typed as English (ADR 0011), exactly `app-shell.spec.ts`'s own `localeText`. */
function localeText(key: string): string {
  const entry = defaultMessageCatalogEn.messages[key];
  if (typeof entry !== 'string') throw new Error(`"${key}" is not a plain string in the bundled default locale.`);
  return entry;
}

const MINIMAP_PLACEHOLDER_TEXT = localeText('hud.minimap.placeholder');
const MINIMAP_NAVIGABLE_TEXT = localeText('hud.minimap.navigable');

/**
 * Where the camera readout is taken, in canvas pixels.
 *
 * The same point `calibrate()` probes from, and on the canvas rather than
 * behind any HUD element at 1280x800.
 */
const PROBE = { x: 700, y: 300 } as const;

async function minimapSurfaceRect(page: Page): Promise<{ readonly left: number; readonly top: number; readonly width: number; readonly height: number }> {
  const rect = await page.evaluate(() => {
    const el = document.querySelector('.hud-minimap__surface');
    if (el === null) return undefined;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  if (rect === undefined) throw new Error('.hud-minimap__surface is not on the page -- instrument is stale');
  if (rect.width <= 0 || rect.height <= 0) throw new Error(`.hud-minimap__surface has no box: ${JSON.stringify(rect)}`);
  return rect;
}

function pointAt(rect: { readonly left: number; readonly top: number; readonly width: number; readonly height: number }, fx: number, fy: number): { readonly x: number; readonly y: number } {
  return { x: rect.left + fx * rect.width, y: rect.top + fy * rect.height };
}

/** Confirms the point about to be clicked actually resolves to the surface, or a child of it -- the instrument-watching check the issue's brief asks for. */
async function assertHitsMinimapSurface(page: Page, point: { readonly x: number; readonly y: number }): Promise<void> {
  const topmost = await page.evaluate(
    ([px, py]) => {
      const el = document.elementFromPoint(px, py);
      return el === null ? null : { tag: el.tagName, cls: typeof el.className === 'string' ? el.className : '' };
    },
    [point.x, point.y] as const,
  );
  expect(topmost, `elementFromPoint(${String(point.x)}, ${String(point.y)}) found nothing -- the click below would land on nothing`).not.toBeNull();
  const isSurfaceOrChild = await page.evaluate(
    ([px, py]) => {
      const el = document.elementFromPoint(px, py);
      const surface = document.querySelector('.hud-minimap__surface');
      return el !== null && surface !== null && (el === surface || surface.contains(el));
    },
    [point.x, point.y] as const,
  );
  expect(isSurfaceOrChild, `the click point resolved to ${JSON.stringify(topmost)}, not .hud-minimap__surface or a child of it`).toBe(true);
}

/** A real left click, dispatched with the mouse -- not `press` from `playtest-harness.ts`, which reads `sentCommands`, a channel this gesture never uses. */
async function clickMinimap(page: Page, point: { readonly x: number; readonly y: number }): Promise<void> {
  await assertHitsMinimapSurface(page, point);
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(50);
}

/**
 * Which world tile the camera currently puts under `PROBE`, read by pressing
 * the world with the removal tool armed and catching the `RemoveWall` the
 * gesture submits.
 *
 * **Deliberately not `calibrate()`.** That measures the screen-to-tile
 * transform to the pixel, by bisecting a tile on each axis -- around a dozen
 * real presses plus two panel clicks, and it was the whole cost of this file.
 * Nothing here needs pixels: the two clicks below are 0.76 of the surface
 * apart, which on a fresh prison's 32x32 loaded bounds is about 24 tiles, so a
 * single whole-tile reading separates them by more than twenty times its own
 * resolution. Precision moved to `world-scene-minimap.spec.ts`, which can state
 * it exactly; what is left here is a direction, and one press answers that.
 *
 * **`RemoveWall`, not `RemoveObject`, since ADR 0106.** A world press with the
 * removal tool armed always resolves an edge (`pickEdgeAtWorld`, never
 * `undefined` for a finite point) and `src/main.ts` reads that presence to
 * choose the command, so every such press now submits `RemoveWall` rather
 * than the tile-only `RemoveObject` -- with nothing checked first either way
 * (`src/main.ts`'s own comment on the `remove-object` intent: the one refusal
 * reason is the worker's), so this reads correctly even after the camera has
 * jumped to land the prison does not own.
 *
 * Armed and disarmed around each reading, exactly as `calibrate()` does, so a
 * caller is never left holding a tool it did not ask for.
 */
async function probeCameraTile(page: Page): Promise<{ readonly tileX: number; readonly tileY: number }> {
  await page.locator('.hud-build__remove').click();
  const commands = await press(page, PROBE.x, PROBE.y);
  await page.locator('.hud-build__remove').click();
  const removal = commands.find((command) => command['type'] === 'RemoveWall');
  if (removal === undefined) {
    throw new Error(`no RemoveWall from a press at ${String(PROBE.x)},${String(PROBE.y)}: ${JSON.stringify(commands)}`);
  }
  return { tileX: removal['x'] as number, tileY: removal['y'] as number };
}

async function startFreshPrison(page: Page): Promise<void> {
  // `installTee` plants a global through `addInitScript` that `sentCommands`
  // reads -- it has to run before `openApp`'s navigation or the global never
  // exists and every `sentCommands` read comes back `[]` regardless of what
  // actually happened, which looks exactly like "nothing was sent" and is not.
  await installTee(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tab(page, 'build').click();
}

test.describe('the minimap navigates the camera (#793)', () => {
  test('clicks near two opposite corners of the surface move the camera in the corresponding directions, so the panel is neither swallowing them nor reading them transposed', async ({ page }) => {
    await startFreshPrison(page);

    /*
     * BOTTOM-LEFT AND TOP-RIGHT, NOT TOP-LEFT AND BOTTOM-RIGHT, AND THAT IS
     * MEASURED RATHER THAN TIDINESS.
     *
     * The first draft of this test used `(0.12, 0.12)` and `(0.88, 0.88)`, and
     * transposing the HUD's own normalization -- `fx` computed from `clientY`
     * and `fy` from `clientX`, one line in `hud.ts` -- **passed it**, in
     * 14.7 s. Of course it did: both points sit on the diagonal, where `fx`
     * and `fy` are equal, so swapping them changes nothing at either one. The
     * same shape of hole is why `world-scene-minimap.spec.ts` runs against a
     * non-square world rather than the starter chunk.
     *
     * On the anti-diagonal the two fractions differ at each point and differ
     * in opposite senses between them, so a transposition turns "west and
     * south" into "east and north" and the two direction assertions below
     * cross over. The mutation is dead there (re-run after this change:
     * `1 failed`).
     *
     * The surface's own box is read live, immediately before each click rather
     * than once for both -- `buildResilientCell`'s own lesson
     * (`tests/browser/playtest-2026-09-01-the-people.playtest.ts:158-166`),
     * because this panel's height is not fixed (`hud.css`'s own comment on
     * `.hud-minimap__surface`: it shrinks to share bounded height with the
     * alerts list below it, which can still be settling moments after "New
     * prison").
     */
    await clickMinimap(page, pointAt(await minimapSurfaceRect(page), 0.12, 0.88));
    const nearBottomLeft = await probeCameraTile(page);

    await clickMinimap(page, pointAt(await minimapSurfaceRect(page), 0.88, 0.12));
    const nearTopRight = await probeCameraTile(page);

    // Two clicks, two different camera positions. Nothing else moves the camera
    // between them, so a `.hud-minimap` still swallowing its clicks would leave
    // these two readings identical -- which is the #793 regression itself.
    expect(
      nearBottomLeft,
      'clicking opposite corners of the surface left the camera in the same place -- the panel is swallowing the click again (#793)',
    ).not.toEqual(nearTopRight);

    // And the directions, one per axis and in opposite senses. `PROBE` is a
    // fixed *screen* point, so the tile under it moves the same way the camera
    // does: the bottom-left click (small fx, large fy) must put a *smaller*
    // tile than the top-right click on X and a *larger* one on Y. This is the
    // half no test below the app can make -- `hud.ts` derives `fx`/`fy` from
    // `getBoundingClientRect()`, and a transposed or inverted derivation there
    // satisfies every assertion made against `navigateToMinimapPoint` directly.
    expect(nearBottomLeft.tileX, 'a bottom-left click did not move the camera toward smaller world X than a top-right click').toBeLessThan(nearTopRight.tileX);
    expect(nearBottomLeft.tileY, 'a bottom-left click did not move the camera toward larger world Y than a top-right click').toBeGreaterThan(nearTopRight.tileY);
  });

  test('a click that finds no loaded world sends no command and leaves the panel telling the player so, rather than staying silent', async ({ page }) => {
    await installTee(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);
    // Deliberately no "New prison" here: this is the one state
    // `WorldScene.navigateToMinimapPoint` cannot map a click from, because
    // nothing has ever published a world to the feed yet (issue #793's own
    // finding -- see the method's comment for why this is reported as `false`
    // rather than silently doing nothing).

    const textBefore = await page.locator('.hud-minimap__placeholder').textContent();
    expect(textBefore, 'the placeholder should read the pre-session sentence before anything is clicked').toBe(MINIMAP_PLACEHOLDER_TEXT);

    const rect = await minimapSurfaceRect(page);
    await clickMinimap(page, pointAt(rect, 0.5, 0.5));

    const commands = await sentCommands(page);
    expect(commands, 'a click with no world loaded reached the simulation -- it must not, this gesture is presentational only (AGENTS.md boundary 1)').toEqual([]);

    const textAfter = await page.locator('.hud-minimap__placeholder').textContent();
    expect(textAfter, 'the panel claimed to have navigated when there was nowhere to go').toBe(MINIMAP_PLACEHOLDER_TEXT);
    expect(textAfter, 'a click that found no world must not silently claim it worked').not.toBe(MINIMAP_NAVIGABLE_TEXT);
  });

  test('the first click that actually moves the camera updates the panel to say so, and still sends nothing to the simulation', async ({ page }) => {
    await startFreshPrison(page);

    const textBefore = await page.locator('.hud-minimap__placeholder').textContent();
    expect(textBefore).toBe(MINIMAP_PLACEHOLDER_TEXT);
    /*
     * THE "NO COMMAND" HALF IS ASSERTED HERE, ON A LIVE PRISON, AND NOT ONLY
     * ON THE PRE-SESSION PAGE ABOVE.
     *
     * The test above also checks that nothing was submitted, and it should --
     * but on that page there is no simulation to submit to at all
     * (`requireSimulation` has nothing to hand out before "New prison"), so
     * a regression that routed this gesture through the command channel could
     * not have shown up there. `AGENTS.md` boundary 1 is only really tested
     * where a command *could* have been sent, which is here: the worker is
     * running, the tee is recording, and the count before the click is the
     * baseline the setup itself left behind.
     */
    const submittedBefore = (await sentCommands(page)).length;

    const rect = await minimapSurfaceRect(page);
    await clickMinimap(page, pointAt(rect, 0.2, 0.8));

    const textAfter = await page.locator('.hud-minimap__placeholder').textContent();
    expect(textAfter, 'a click that moved the camera left the panel claiming rendering is unavailable, with nothing said about the click that just worked').toBe(MINIMAP_NAVIGABLE_TEXT);
    expect(
      (await sentCommands(page)).slice(submittedBefore),
      'a minimap click reached the simulation -- moving the camera is presentational only (AGENTS.md boundary 1), so this gesture must build no command at all',
    ).toEqual([]);
  });
});

/**
 * **Issue #903's own half: the surface used to be a `div` with `tabIndex -1`
 * and no `role`, so a keyboard player could reach every other control on this
 * page and never this one.** `hud.ts` now builds it as a real `<button>`; this
 * file is where that claim gets checked against a real browser's own Tab order
 * and a real synthetic key event, not merely against what the DOM node looks
 * like statically.
 */
test.describe('the minimap surface is keyboard-reachable (#903)', () => {
  test('sequential Tab presses reach the surface, and it is a real <button> naming the sentence a sighted player reads', async ({ page }) => {
    await startFreshPrison(page);

    /*
     * Real `Tab` presses, not `element.focus()`. A `tabIndex="-1"` element
     * still accepts a direct `.focus()` call -- that is precisely what made
     * the pre-#903 `div` look reachable if you only inspected it, and reading
     * the property instead of driving the browser's own sequential focus
     * navigation would repeat that mistake in the test meant to catch it.
     */
    let reachedInBudget = -1;
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab');
      const onSurface = await page.evaluate(() => document.activeElement?.classList.contains('hud-minimap__surface') ?? false);
      if (onSurface) {
        reachedInBudget = i;
        break;
      }
    }
    expect(reachedInBudget, 'sixty Tab presses never reached .hud-minimap__surface -- it is not in the keyboard focus order').toBeGreaterThanOrEqual(0);

    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      return { tag: el.tagName, text: el.textContent?.trim() ?? null };
    });
    // A real `<button>`, not an ARIA role bolted onto a `div` -- native
    // semantics rather than a reimplementation of them.
    expect(focused.tag, 'the focused minimap surface is not a real <button>').toBe('BUTTON');
    // Name-from-content, exactly as a native button computes its own
    // accessible name: the sentence a screen reader announces is the same one
    // a sighted player reads, not a second, divergent `aria-label` that could
    // drift from it.
    expect(focused.text, "the focused surface's accessible name is not the visible placeholder sentence").toBe(MINIMAP_PLACEHOLDER_TEXT);
  });

  test('Enter on the focused surface reaches onMinimapNavigate: the panel updates and the camera actually moves', async ({ page }) => {
    await startFreshPrison(page);

    const textBefore = await page.locator('.hud-minimap__placeholder').textContent();
    expect(textBefore).toBe(MINIMAP_PLACEHOLDER_TEXT);

    /*
     * Displace the camera off-centre with a real click first (issue #793's
     * own mechanism, already proved above), so the keyboard press below --
     * which names the surface's own centre, `0.5, 0.5` -- has somewhere
     * different to prove it actually reached. Without this, a fresh prison's
     * camera already starts framed on that same centre
     * (`WorldScene.frameCameraOnFirstWorld`), and an Enter press that changed
     * nothing on screen would be indistinguishable from one that was never
     * wired at all -- the same shape of blind spot this file's own comment
     * warns about for a diagonal click.
     */
    await clickMinimap(page, pointAt(await minimapSurfaceRect(page), 0.05, 0.95));
    const offCentre = await probeCameraTile(page);

    const submittedBefore = (await sentCommands(page)).length;

    // Tab to the surface rather than assuming the prior click left it
    // focused -- the claim under test is the keyboard path, so it is driven
    // exactly the way a keyboard-only player would drive it.
    let reachedInBudget = -1;
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab');
      const onSurface = await page.evaluate(() => document.activeElement?.classList.contains('hud-minimap__surface') ?? false);
      if (onSurface) {
        reachedInBudget = i;
        break;
      }
    }
    expect(reachedInBudget).toBeGreaterThanOrEqual(0);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);

    // The text swap is gated in `hud.ts` on `onMinimapNavigate` returning
    // `true` and nothing else, so seeing it here is direct proof the keyboard
    // event reached that real callback rather than merely focusing an inert
    // element.
    const textAfter = await page.locator('.hud-minimap__placeholder').textContent();
    expect(textAfter, 'Enter on the focused surface did not flip the panel to the navigable sentence -- the key press never reached onMinimapNavigate').toBe(MINIMAP_NAVIGABLE_TEXT);

    // And the substantive claim, not only the sentence: the camera actually
    // moved, read the same way the mouse-driven tests above read it.
    const afterEnter = await probeCameraTile(page);
    expect(afterEnter, 'Enter on the focused minimap surface left the camera exactly where the prior click put it').not.toEqual(offCentre);

    // AGENTS.md boundary 1: a keyboard press on this surface is exactly as
    // presentational as a click on it. `probeCameraTile` itself submits a
    // `RemoveWall` to do its reading (ADR 0106), so that is the one command
    // type this filters out before asserting the keyboard gesture built
    // nothing else.
    const submittedSince = (await sentCommands(page)).slice(submittedBefore);
    expect(
      submittedSince.filter((command) => command['type'] !== 'RemoveWall'),
      'a keyboard press on the minimap reached the simulation -- moving the camera is presentational only',
    ).toEqual([]);
  });
});
