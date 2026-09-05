import { expect, test, type Page } from './network-changed-fixture';
import { defaultMessageCatalogEn } from '../../src/services/localization';
import { installTee, openApp, press, sentCommands, tab } from './playtest-harness';

/**
 * **The app-level gate for issue #1023: the zoom a player is finally told
 * about actually zooms.**
 *
 * `WorldScene` has zoomed over `ZOOM_BOUNDS` -- `{ min: 0.2, max: 3 }`,
 * `src/rendering/scene/world-scene.ts:68`, a deliberate fifteen-fold range
 * with a docblock naming both ends -- since it was written, reachable on the
 * wheel, on a pinch and on `+`/`-`. **No control anywhere named it.** Measured
 * on the assembled page at 1280x800 on `main` at `bd6fa32` before this landed:
 * the substring `zoom` did not occur once in `document.body.innerHTML`, and
 * the only sentence about moving the view is the Build panel's arm hint, which
 * names panning. The owner's standing brief is a game with no hidden features.
 *
 * ## What this file asserts, and what it deliberately leaves alone
 *
 * `app-shell.spec.ts` already covers the two things a *new control* needs and
 * covers them for free -- *"every HUD control the player can actually hit is a
 * real tap target"* and *"every control can actually be pressed, on every tab
 * and at every viewport (#88)"* -- so presence, box size and reachability are
 * not restated here. What neither of those can see is whether pressing the
 * thing does anything, and **a control that is present but inert is the same
 * defect one layer down**. That is this file's whole subject.
 *
 * The *step size* is not asserted here and belongs with the scene:
 * `KEYBOARD_ZOOM_STEP` and the clamp are exercised in
 * `tests/browser/world-scene-input.spec.ts` against a real Phaser camera with
 * no HUD in the way, which is where a claim about a float can be made. What
 * this layer has that no other does is the seam -- a real press on a real HUD
 * button, through the composition root, into the camera drawing the frame --
 * so it asserts a *direction* and asserts it far outside the noise of a
 * whole-tile reading.
 *
 * ## How the zoom is read, given the HUD exposes no readout
 *
 * By how much world a fixed span of screen covers. Two presses on the world
 * with the removal tool armed name the tile under each point (`RemoveObject`
 * is submitted for whatever tile the gesture names, with nothing checked
 * first -- `src/main.ts`'s own comment), and the number of tiles between them
 * is `span / (TILE_SIZE_PX * zoom)`. Zooming **in** makes that number smaller;
 * zooming **out** makes it larger. It needs no camera handle, no readout and
 * no instrumentation the shipped page does not already have.
 *
 * **Three presses per direction rather than one**, which is the difference
 * between a measurement and a coin toss. One step is 1.25, so at the 480px
 * span below the reading moves from 7.5 tiles to 6 -- two whole-tile readings
 * that can land on the same integer. Three steps is 1.25^3 = 1.95: 7.5 tiles
 * becomes 3.8 zoomed in and 14.6 zoomed out, which no rounding can confuse,
 * and both stay well inside `ZOOM_BOUNDS` (1.95 and 0.51 against 3 and 0.2)
 * so nothing here is measuring the clamp.
 *
 * **Watching its own instrument**, as `hud-minimap-navigates.spec.ts` does:
 * every click is preceded by a real `elementFromPoint` read confirming it
 * lands on the button, and every world probe by one confirming it lands on the
 * canvas. A click that silently missed would otherwise read as "the zoom
 * control does nothing" for the wrong reason.
 */

/** The sentence the bundled default locale gives a key -- read rather than typed as English (ADR 0011), exactly `app-shell.spec.ts`'s own `localeText`. */
function localeText(key: string): string {
  const entry = defaultMessageCatalogEn.messages[key];
  if (typeof entry !== 'string') throw new Error(`"${key}" is not a plain string in the bundled default locale.`);
  return entry;
}

const ZOOM_IN_TEXT = localeText('hud.zoom.in');
const ZOOM_OUT_TEXT = localeText('hud.zoom.out');
const ZOOM_REGION_TEXT = localeText('hud.zoom.title');

/**
 * The two world points the span is read between, and the span itself.
 *
 * Both are canvas at 1280x800 with nothing of the HUD over them -- measured
 * on the assembled page, `elementFromPoint` returning `CANVAS` at every x from
 * 300 to 950 along y = 260 -- and the assertion below re-checks it rather than
 * trusting this comment, because the rail opts back into pointer events and
 * reaches leftward as the page narrows (`calibrate`'s own warning in
 * `playtest-harness.ts`).
 */
const LEFT = { x: 420, y: 260 } as const;
const RIGHT = { x: 900, y: 260 } as const;

async function assertHits(page: Page, point: { readonly x: number; readonly y: number }, selector: string, what: string): Promise<void> {
  const hit = await page.evaluate(
    ([px, py, sel]) => {
      const el = document.elementFromPoint(px as number, py as number);
      const target = document.querySelector(sel as string);
      const describe = el === null ? 'nothing' : `${el.tagName}.${typeof el.className === 'string' ? el.className : ''}`;
      return { ok: el !== null && target !== null && (el === target || target.contains(el)), describe };
    },
    [point.x, point.y, selector] as const,
  );
  expect(hit.ok, `a press meant for ${what} would land on ${hit.describe} instead`).toBe(true);
}

/** Which tile the camera puts under a fixed screen point, with the removal tool already armed. */
async function tileUnder(page: Page, point: { readonly x: number; readonly y: number }): Promise<number> {
  await assertHits(page, point, '#game-root canvas', 'the world');
  const commands = await press(page, point.x, point.y);
  const removal = commands.find((command) => command['type'] === 'RemoveObject');
  if (removal === undefined) {
    throw new Error(`no RemoveObject from a press at ${String(point.x)},${String(point.y)}: ${JSON.stringify(commands)}`);
  }
  return removal['x'] as number;
}

/**
 * How many world tiles the camera fits between `LEFT` and `RIGHT`.
 *
 * Inversely proportional to the zoom, which is the whole instrument. The tool
 * is armed and disarmed around the pair exactly as `calibrate()` does, so a
 * caller is never left holding a tool it did not ask for.
 */
async function tilesAcross(page: Page): Promise<number> {
  await page.locator('.hud-build__remove').click();
  const left = await tileUnder(page, LEFT);
  const right = await tileUnder(page, RIGHT);
  await page.locator('.hud-build__remove').click();
  return right - left;
}

async function pressZoom(page: Page, selector: string, times: number): Promise<void> {
  const button = page.locator(selector);
  for (let index = 0; index < times; index += 1) {
    const box = await button.boundingBox();
    if (box === null) throw new Error(`${selector} has no box -- the control is not laid out`);
    await assertHits(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, selector, selector);
    await button.click();
    await page.waitForTimeout(30);
  }
}

async function startFreshPrison(page: Page): Promise<void> {
  // `installTee` plants a global through `addInitScript` that `sentCommands`
  // reads -- it has to run before `openApp`'s navigation or the global never
  // exists and every read comes back `[]`, which looks exactly like "nothing
  // was sent" and is not.
  await installTee(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tab(page, 'build').click();
}

test.describe('the HUD names the zoom, and the control it names it with works (#1023)', () => {
  test('pressing zoom in shows less of the world and pressing zoom out shows more, so the buttons reach the camera rather than sitting there', async ({ page }) => {
    await startFreshPrison(page);

    const atArrival = await tilesAcross(page);
    expect(atArrival, 'the span instrument read no tiles at all at arrival -- it is broken, and nothing below it means anything').toBeGreaterThan(0);

    await pressZoom(page, '.hud-zoom__in', 3);
    const zoomedIn = await tilesAcross(page);

    // Six out from here: three to undo the three above, three past arrival.
    await pressZoom(page, '.hud-zoom__out', 6);
    const zoomedOut = await tilesAcross(page);

    expect(
      zoomedIn,
      `three presses of zoom in left the camera showing ${String(zoomedIn)} tiles across where arrival showed ${String(atArrival)} -- the button is laid out and inert`,
    ).toBeLessThan(atArrival);
    expect(
      zoomedOut,
      `three presses of zoom out past arrival left the camera showing ${String(zoomedOut)} tiles across where arrival showed ${String(atArrival)} -- the button is laid out and inert`,
    ).toBeGreaterThan(atArrival);
    // And the two directions are not the same press wired twice, which
    // `zoomedIn < atArrival < zoomedOut` above already implies and this states
    // as the thing a reader will look for.
    expect(zoomedIn, 'zoom in and zoom out moved the camera the same way').toBeLessThan(zoomedOut);
  });

  test('zooming sends nothing to the simulation, because moving a camera is not a game action', async ({ page }) => {
    await startFreshPrison(page);
    const before = (await sentCommands(page)).length;

    await pressZoom(page, '.hud-zoom__in', 2);
    await pressZoom(page, '.hud-zoom__out', 2);

    expect(
      (await sentCommands(page)).slice(before),
      'a zoom press reached the simulation -- zooming is presentational only (AGENTS.md boundary 1), so it must build no command at all',
    ).toEqual([]);
  });

  test('the control says "zoom" in words the player can read, on every tab, and does not disappear when the minimap panel is collapsed', async ({ page }) => {
    await startFreshPrison(page);

    /*
     * THE VISIBLE WORD IS THE POINT OF THE ISSUE, NOT DECORATION.
     *
     * #1023 is a discoverability defect: the capability was finished and
     * nothing on screen mentioned it. A pair of glyphs with the word only in a
     * `title` would leave a touch player -- who has no hover -- exactly where
     * they started, so the legend is asserted as *rendered text*, and the two
     * buttons are asserted by their accessible names, which
     * `createIconButton` puts in the DOM as `screenReaderText` rather than in
     * a tooltip.
     */
    const cornerText = await page.locator('.hud__corner').innerText();
    expect(cornerText.toLowerCase(), 'the bottom-left corner does not say the word "zoom" anywhere a player can read it').toContain(ZOOM_REGION_TEXT.toLowerCase());
    await expect(page.getByRole('button', { name: ZOOM_IN_TEXT, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: ZOOM_OUT_TEXT, exact: true })).toBeVisible();

    /*
     * AND IT SURVIVES A COLLAPSE, WHICH IS THE ONE LAYOUT DECISION IN THE FIX.
     *
     * The pair is a sibling of the minimap panel inside `.hud__corner`, not a
     * row in its body. Inside the body it would vanish with one press on
     * `Collapse` and take the only visible mention of zoom in the game with
     * it -- which is the defect this issue is about, reintroduced behind a
     * control the player is invited to press. This is what pins that choice.
     */
    await page.locator('.hud-minimap .ui-panel__toggle').click();
    await expect(page.locator('.hud-minimap__surface')).toBeHidden();
    await expect(page.locator('.hud-zoom')).toBeVisible();
    await expect(page.getByRole('button', { name: ZOOM_IN_TEXT, exact: true })).toBeVisible();

    // On every tab, because `.hud__corner` is not tab-scoped and a zoom that
    // was only on one tab would be a hidden feature on the other four.
    for (const id of ['overview', 'rooms', 'security', 'regime'] as const) {
      await tab(page, id).click();
      await expect(page.locator('.hud-zoom'), `the zoom control is not laid out on the ${id} tab`).toBeVisible();
    }
  });
});
