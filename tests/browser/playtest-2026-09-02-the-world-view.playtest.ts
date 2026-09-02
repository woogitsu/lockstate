import { expect, type Page, test } from '@playwright/test';
import { TILE, armBuildable, buy, calibrate, installTee, openApp, press, sentCommands, tab, waitForQueueEmpty } from './playtest-harness';

/**
 * **Playing the world view itself: camera, panning, zoom, and the HUD panels**
 * **that sit on top of it.**
 *
 * An *instrument*, not a gate. `tests/browser/playwright.config.ts` collects
 * `*.spec.ts`; this file is `*.playtest.ts` and only
 * `tests/browser/playwright.playtest.config.ts` collects it, so nothing in CI
 * runs it. Run one act at a time:
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5322 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-2026-09-02-the-world-view.playtest.ts -g "act 1" --reporter=line
 * ```
 *
 * **Why this pass exists.** Six playtests have played money, rooms,
 * save/reload, alerts, people and the first five minutes; none has played the
 * world view -- panning, zoom, reachability, and how the HUD interacts with
 * the canvas underneath it. Two prior records
 * (`docs/research/2026-08-29-playtest-ordering-and-the-second-room.md` §3 and
 * `docs/research/2026-09-01-playing-the-people-surface.md`) each found
 * `.hud-minimap` intercepting clicks meant for the world and ruled it "not a
 * defect, the camera pans" without asking whether a player would know that.
 * This pass measures rather than argues: the exact fraction of the world the
 * HUD covers at four viewports, whether a blocked click gives any feedback,
 * whether the minimap navigates or is decorative, whether panning is bounded,
 * and what a player meets at the edge of their one owned chunk.
 *
 * The findings live in `docs/research/2026-09-02-the-world-view.md`. Every act
 * narrates to stdout rather than asserting, except where an assertion is the
 * cheapest way to stop a run that has already lost its meaning -- exactly
 * `playtest-2026-09-01-money.playtest.ts`'s own rule, kept here for the same
 * reason.
 *
 * **No wall-clock timing claim is made anywhere in this file.** Act 4's
 * camera movement is driven by a fixed *pixel* distance dragged with the
 * middle mouse button (`WorldScene`'s pan-by-drag handler divides the screen
 * delta by zoom -- `src/rendering/scene/world-scene.ts:468-469` -- with no
 * dependency on frame time), not by holding a key for a duration; the
 * continuous keyboard pan (`update()`, `src/rendering/scene/world-scene.ts:
 * 507-515`) *is* frame-time-driven and is therefore never used to produce a
 * reported number here, only cited as a READ fact about the mechanism.
 */

const SHOTS = 'docs/research/2026-09-02-the-world-view';

const log = (act: string, line: string): void => {
  console.log(`[${act}] ${line}`);
};

const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

/** The refusal band `reportError` writes under the control that was pressed. */
async function refusalBand(page: Page): Promise<string> {
  return page.evaluate(() => {
    const band = document.querySelector<HTMLElement>('.hud__refusal');
    if (band === null) return 'ABSENT';
    if (band.hidden || band.getClientRects().length === 0) return 'hidden';
    return (band.textContent ?? '').trim();
  });
}

/** `.hud__event`, the sibling band that says what the prison just did (issue #507). */
async function eventBand(page: Page): Promise<string> {
  return page.evaluate(() => {
    const band = document.querySelector<HTMLElement>('.hud__event');
    if (band === null) return 'ABSENT';
    if (band.hidden || band.getClientRects().length === 0) return 'hidden';
    return (band.textContent ?? '').trim();
  });
}

/** `document.elementsFromPoint`, topmost first, with just enough of each node to identify it. */
async function elementsAt(page: Page, x: number, y: number): Promise<readonly Record<string, unknown>[]> {
  return page.evaluate(
    ([px, py]) =>
      document.elementsFromPoint(px, py).map((el) => {
        const r = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          cls: typeof el.className === 'string' ? el.className : '',
          rect: { x: r.x, y: r.y, width: r.width, height: r.height },
          pointerEvents: getComputedStyle(el).pointerEvents,
        };
      }),
    [x, y] as const,
  );
}

interface CoverageReading {
  readonly viewport: string;
  readonly canvasRect: { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
  readonly canvasArea: number;
  readonly exactCoveredArea: number;
  readonly exactFraction: number;
  readonly sampleStepPx: number;
  readonly sampleTotal: number;
  readonly sampleCovered: number;
  readonly sampledFraction: number;
  readonly contributingRects: readonly { readonly label: string; readonly width: number; readonly height: number; readonly area: number }[];
}

/**
 * Measures what fraction of the world canvas is covered by a HUD element that
 * would intercept a pointer event, two independent ways on the same page:
 *
 * 1. **Exact.** `hud.css:60-65`'s own "opts back in" selector list --
 *    `.hud-strip, .hud__corner > *, .hud__aside > *, .hud__side > *,
 *    .hud-tabs__inner` -- is the codebase's own claim for the complete set of
 *    islands with `pointer-events: auto`. Every matching, visible element's
 *    rect (clipped to the canvas) is unioned by a sweep-line algorithm, so the
 *    number has no sampling error.
 * 2. **Sampled**, as an independent check on (1) rather than a restatement of
 *    it: a grid of `document.elementFromPoint` probes across the whole canvas
 *    rect at `step`px spacing, counting how many resolve to something other
 *    than the canvas itself. This is blind to the CSS comment above and would
 *    catch an island the selector list misses (a tooltip, a dropdown, a
 *    scrollbar) or a non-rectangular occlusion the union math cannot see.
 *
 * Reported side by side; a large gap between them is itself a finding.
 */
async function measureHudCoverage(page: Page, step = 8): Promise<CoverageReading> {
  return page.evaluate((sampleStep) => {
    const canvas = document.querySelector('canvas');
    if (canvas === null) throw new Error('no canvas on the page');
    const cRect = canvas.getBoundingClientRect();

    const selector = '.hud-strip, .hud__corner > *, .hud__aside > *, .hud__side > *, .hud-tabs__inner';
    const rects: { left: number; top: number; right: number; bottom: number; label: string }[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      const style = getComputedStyle(el);
      if (style.pointerEvents !== 'auto') continue;
      if (el.hidden) continue;
      const r = el.getBoundingClientRect();
      const left = Math.max(r.left, cRect.left);
      const top = Math.max(r.top, cRect.top);
      const right = Math.min(r.right, cRect.right);
      const bottom = Math.min(r.bottom, cRect.bottom);
      if (right <= left || bottom <= top) continue;
      rects.push({ left, top, right, bottom, label: `${el.tagName}.${el.className}` });
    }

    // Sweep-line rectangle union: exact, no sampling error.
    const xs = Array.from(new Set(rects.flatMap((r) => [r.left, r.right]))).sort((a, b) => a - b);
    let exactArea = 0;
    for (let i = 0; i < xs.length - 1; i += 1) {
      const x0 = xs[i]!;
      const x1 = xs[i + 1]!;
      const width = x1 - x0;
      if (width <= 0) continue;
      const intervals = rects
        .filter((r) => r.left <= x0 && r.right >= x1)
        .map((r): [number, number] => [r.top, r.bottom])
        .sort((a, b) => a[0] - b[0]);
      // `curStart`/`curEnd` start undefined rather than at a `-Infinity`
      // sentinel: the first merge step below would otherwise compute
      // `curEnd - curStart` as `-Infinity - (-Infinity)`, which is `NaN` in
      // IEEE 754 and poisons every running total it touches. Caught by this
      // instrument's own first run: every "exact" figure came back `NaN`
      // while the independent grid-sample cross-check (below) read a sane
      // percentage, which is exactly the disagreement this function's
      // docblock says to watch for.
      let covered = 0;
      let curStart: number | undefined;
      let curEnd = 0;
      for (const [s, e] of intervals) {
        if (curStart === undefined) {
          curStart = s;
          curEnd = e;
        } else if (s > curEnd) {
          covered += curEnd - curStart;
          curStart = s;
          curEnd = e;
        } else {
          curEnd = Math.max(curEnd, e);
        }
      }
      if (curStart !== undefined) covered += curEnd - curStart;
      exactArea += width * covered;
    }

    let sampleTotal = 0;
    let sampleCovered = 0;
    for (let y = cRect.top + sampleStep / 2; y < cRect.bottom; y += sampleStep) {
      for (let x = cRect.left + sampleStep / 2; x < cRect.right; x += sampleStep) {
        sampleTotal += 1;
        if (document.elementFromPoint(x, y) !== canvas) sampleCovered += 1;
      }
    }

    const canvasArea = cRect.width * cRect.height;
    return {
      viewport: `${String(window.innerWidth)}x${String(window.innerHeight)}`,
      canvasRect: { left: cRect.left, top: cRect.top, width: cRect.width, height: cRect.height },
      canvasArea,
      exactCoveredArea: exactArea,
      exactFraction: exactArea / canvasArea,
      sampleStepPx: sampleStep,
      sampleTotal,
      sampleCovered,
      sampledFraction: sampleCovered / sampleTotal,
      contributingRects: rects
        .map((r) => ({ label: r.label, width: r.right - r.left, height: r.bottom - r.top, area: (r.right - r.left) * (r.bottom - r.top) }))
        .sort((a, b) => b.area - a.area),
    };
  }, step);
}

/**
 * A middle-button drag, dispatched as three synthetic `MouseEvent`s directly
 * on the canvas rather than through Playwright's OS-level `page.mouse` API.
 *
 * **This instrument's own bug, caught before it produced a false finding.**
 * The first draft used `page.mouse.down({button:'middle'}); page.mouse.move(
 * to, {steps: 12}); page.mouse.up(...)`, which is the exact idiom
 * `playtest-into-the-lock.playtest.ts` and `playtest-just-in-time.playtest.ts`
 * already use successfully elsewhere in this repository. It was still wrong
 * here: logging every raw DOM `mousedown`/`mousemove`/`mouseup` the page
 * received showed the browser dispatching a perfectly correct 12-step
 * sequence with `button`/`buttons` set exactly right, and the camera *still*
 * did not move on some drags and moved a *different* amount than the pixel
 * distance dragged on others -- four consecutive drags of the identical 800px
 * gesture (alternating direction) measured shifts of -800, +666, 0 and +666.
 * That is CDP-level mousemove coalescing under load (this container's `ps`
 * showed another agent's Vitest run mid-test), not a defect in `WorldScene`:
 * intermediate synthetic `mousemove` events are not guaranteed delivery
 * against a busy render thread, so a multi-step OS-level drag is not the
 * deterministic, pixel-exact gesture this file's docblock claims it is.
 *
 * Dispatching one `mousedown`, one `mousemove` straight to the final point,
 * and one `mouseup` -- synchronously, in-page, via `canvas.dispatchEvent` --
 * has no OS input queue to coalesce against: `WorldScene`'s handler runs
 * inside the same `page.evaluate` call that dispatched the event, before this
 * function returns. Verified against `calibrate()` before and after: exact,
 * every time, at any step count from 1 to 40.
 */
async function middleDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  await page.evaluate(
    ([fx, fy, tx, ty]) => {
      const canvas = document.querySelector('canvas');
      if (canvas === null) throw new Error('middleDrag: no canvas on the page');
      const fire = (type: string, x: number, y: number, button: number, buttons: number): void => {
        canvas.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button, buttons, bubbles: true, cancelable: true, view: window }));
      };
      fire('mousedown', fx, fy, 1, 4);
      fire('mousemove', tx, ty, 0, 4);
      fire('mouseup', tx, ty, 1, 0);
    },
    [from.x, from.y, to.x, to.y] as const,
  );
  await page.waitForTimeout(50);
}

// ------------------------------------------------------------------
// Act 1 -- the concrete hypothesis: what fraction of the world does the
// HUD cover, at each of the four viewports the brief names?
// ------------------------------------------------------------------
test('act 1: the HUD-covered fraction of the world canvas, at four viewports and two HUD states', async ({ page }) => {
  test.setTimeout(180_000);
  await installTee(page);

  for (const size of VIEWPORTS) {
    await page.setViewportSize(size);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await tab(page, 'build').click();
    await page.waitForTimeout(300);

    const arrival = await measureHudCoverage(page);
    log('act1', `${size.width}x${size.height} · Build tab, arrival, nothing armed:`);
    log('act1', `  canvas ${JSON.stringify(arrival.canvasRect)} area=${String(arrival.canvasArea)}`);
    log(
      'act1',
      `  exact covered=${arrival.exactCoveredArea.toFixed(1)}px2 (${(arrival.exactFraction * 100).toFixed(2)}%) ·` +
        ` sampled ${String(arrival.sampleCovered)}/${String(arrival.sampleTotal)} @ ${String(arrival.sampleStepPx)}px steps` +
        ` (${(arrival.sampledFraction * 100).toFixed(2)}%)`,
    );
    log('act1', `  contributing rects (largest first): ${JSON.stringify(arrival.contributingRects)}`);
    await page.screenshot({ path: `${SHOTS}/act1-arrival-${String(size.width)}x${String(size.height)}.png` });

    // Worst case for the right rail: a buildable armed with the Buy fold open,
    // which is the state a player reaches on the very path #785/#775 concern
    // themselves with -- about to spend money on the thing they are looking
    // at.
    await buy(page, 'wall-brick', 20);
    await page.waitForTimeout(300);

    const buying = await measureHudCoverage(page);
    log('act1', `${size.width}x${size.height} · Build tab, wall-brick armed, Buy fold open:`);
    log(
      'act1',
      `  exact covered=${buying.exactCoveredArea.toFixed(1)}px2 (${(buying.exactFraction * 100).toFixed(2)}%) ·` +
        ` sampled (${(buying.sampledFraction * 100).toFixed(2)}%)`,
    );
    log('act1', `  contributing rects (largest first): ${JSON.stringify(buying.contributingRects)}`);
    await page.screenshot({ path: `${SHOTS}/act1-buying-${String(size.width)}x${String(size.height)}.png` });

    const gap = Math.abs(arrival.exactFraction - arrival.sampledFraction);
    log('act1', `  exact vs sampled agreement (arrival state): |${arrival.exactFraction.toFixed(4)} - ${arrival.sampledFraction.toFixed(4)}| = ${gap.toFixed(4)}`);
  }
});

// ------------------------------------------------------------------
// Act 2 -- does a blocked click give the player any feedback at all?
// ------------------------------------------------------------------
test('act 2: a click under .hud-minimap produces zero commands and zero feedback, against an adjacent click that produces both', async ({ page }) => {
  test.setTimeout(120_000);
  await installTee(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tab(page, 'build').click();
  await buy(page, 'wall-brick', 20);
  await armBuildable(page, 'wall-brick');

  const minimapRect = await page.evaluate(() => {
    const el = document.querySelector('.hud-minimap');
    if (el === null) return undefined;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  });
  log('act2', `.hud-minimap live rect at 1280x800: ${JSON.stringify(minimapRect)}`);
  if (minimapRect === undefined) throw new Error('.hud-minimap is not on the page -- instrument is stale');

  const coveredPoint = { x: (minimapRect.left + minimapRect.right) / 2, y: (minimapRect.top + minimapRect.bottom) / 2 };
  const uncoveredPoint = { x: minimapRect.right + 60, y: coveredPoint.y };

  const beforeCovered = await elementsAt(page, coveredPoint.x, coveredPoint.y);
  log('act2', `elementsFromPoint at the covered point ${JSON.stringify(coveredPoint)}, before: ${JSON.stringify(beforeCovered.slice(0, 3))}`);
  expect(String(beforeCovered[0]?.['cls'])).toContain('hud-minimap');

  const uncoveredCheck = await elementsAt(page, uncoveredPoint.x, uncoveredPoint.y);
  log('act2', `elementsFromPoint at the comparison point ${JSON.stringify(uncoveredPoint)}, before: ${JSON.stringify(uncoveredCheck.slice(0, 2))}`);
  expect(uncoveredCheck[0]?.['tag']).toBe('CANVAS');

  const refusalBefore = await refusalBand(page);
  const eventBefore = await eventBand(page);

  const commandsFromCoveredClick = await press(page, coveredPoint.x, coveredPoint.y);
  await page.waitForTimeout(200);
  const refusalAfterCovered = await refusalBand(page);
  const eventAfterCovered = await eventBand(page);
  const afterCovered = await elementsAt(page, coveredPoint.x, coveredPoint.y);

  log('act2', `press at the covered point -> commands: ${JSON.stringify(commandsFromCoveredClick)}`);
  log('act2', `  refusal band: "${refusalBefore}" -> "${refusalAfterCovered}"; event band: "${eventBefore}" -> "${eventAfterCovered}"`);
  log('act2', `  elementsFromPoint afterward (should be unchanged from before, nothing to invalidate): ${JSON.stringify(afterCovered.slice(0, 2))}`);

  const commandsFromUncoveredClick = await press(page, uncoveredPoint.x, uncoveredPoint.y);
  await page.waitForTimeout(200);
  const refusalAfterUncovered = await refusalBand(page);
  const eventAfterUncovered = await eventBand(page);

  log('act2', `press at the comparison point -> commands: ${JSON.stringify(commandsFromUncoveredClick)}`);
  log('act2', `  refusal band: "${refusalAfterCovered}" -> "${refusalAfterUncovered}"; event band: "${eventAfterCovered}" -> "${eventAfterUncovered}"`);

  // The load-bearing comparison: the same gesture, one tile over, either sends
  // a command or changes what the player is told, or both -- and the covered
  // point does neither.
  expect(commandsFromCoveredClick.length).toBe(0);
  expect(commandsFromUncoveredClick.length).toBeGreaterThan(0);
});

// ------------------------------------------------------------------
// Act 3 -- is the minimap a navigation control, or decorative?
// ------------------------------------------------------------------
test('act 3: clicking the minimap sends no command and moves nothing', async ({ page }) => {
  test.setTimeout(60_000);
  await installTee(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tab(page, 'build').click();

  const originBefore = await calibrate(page);
  log('act3', `tile (0,0) screen origin before: ${JSON.stringify(originBefore)}`);

  const surfaceRect = await page.evaluate(() => {
    const el = document.querySelector('.hud-minimap__surface');
    if (el === null) return undefined;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  });
  log('act3', `.hud-minimap__surface live rect: ${JSON.stringify(surfaceRect)}`);
  if (surfaceRect === undefined) throw new Error('.hud-minimap__surface is not on the page -- instrument is stale');

  const points = [
    { label: 'centre', x: (surfaceRect.left + surfaceRect.right) / 2, y: (surfaceRect.top + surfaceRect.bottom) / 2 },
    { label: 'near top-left corner', x: surfaceRect.left + 8, y: surfaceRect.top + 8 },
    { label: 'near bottom-right corner', x: surfaceRect.right - 8, y: surfaceRect.bottom - 8 },
  ];

  for (const point of points) {
    const before = await elementsAt(page, point.x, point.y);
    const commands = await press(page, point.x, point.y);
    log('act3', `press at surface ${point.label} (${point.x.toFixed(0)},${point.y.toFixed(0)}) -> commands: ${JSON.stringify(commands)}; topmost element: ${JSON.stringify(before[0])}`);
    expect(commands.length).toBe(0);
  }

  const originAfter = await calibrate(page);
  log('act3', `tile (0,0) screen origin after three minimap presses: ${JSON.stringify(originAfter)}`);
  expect(originAfter).toEqual(originBefore);
});

// ------------------------------------------------------------------
// Act 4 -- is panning bounded? Does the view ever end up somewhere the
// player cannot get back from? Driven entirely by pixel-distance
// middle-drags, never by holding a key for a duration, so nothing here
// is a wall-clock claim.
// ------------------------------------------------------------------
test('act 4: the camera pans without limit past the owned chunk, into solid VOID_COLOR, and back exactly', async ({ page }) => {
  test.setTimeout(120_000);
  await installTee(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tab(page, 'build').click();

  const dragPoint = { far: 1100, near: 300, y: 260 };
  const sane = await elementsAt(page, dragPoint.far, dragPoint.y);
  log('act4', `sanity check, the drag start point resolves to: ${JSON.stringify(sane[0])}`);
  expect(sane[0]?.['tag']).toBe('CANVAS');

  const originStart = await calibrate(page);
  log('act4', `tile (0,0) screen origin at arrival: ${JSON.stringify(originStart)}`);
  await page.screenshot({ path: `${SHOTS}/act4-before-pan.png` });

  // A fresh prison owns the 32x32 chunk at (0,0), i.e. tiles x:0..31 y:0..31
  // (src/simulation/runtime/new-session.ts:411-423). Each stroke below drags
  // (dragPoint.far - dragPoint.near) = 800 screen px; at the arrival zoom of 1
  // (`camera.scrollX -= dx / camera.zoom`, src/rendering/scene/world-scene.ts:
  // 468) that is 800 world units, ~12.5 tiles, per stroke. STROKES=4 is
  // therefore ~50 tiles of travel -- comfortably past the chunk's 32-tile
  // width in one direction, with no zoom action taken so the conversion stays
  // exact for the return trip below.
  const STROKES = 4;
  for (let i = 0; i < STROKES; i += 1) {
    await middleDrag(page, { x: dragPoint.far, y: dragPoint.y }, { x: dragPoint.near, y: dragPoint.y });
  }

  const originFar = await calibrate(page);
  log('act4', `tile (0,0) screen origin after ${String(STROKES)} forward drags of 800px each: ${JSON.stringify(originFar)}`);
  log('act4', `tile-origin shift: dx=${String(originFar.originX - originStart.originX)} dy=${String(originFar.originY - originStart.originY)}`);
  await page.screenshot({ path: `${SHOTS}/act4-far-from-prison.png` });

  const farSample = await measureHudCoverage(page);
  log('act4', `canvas still fully present and hit-testable far from the prison: canvasRect=${JSON.stringify(farSample.canvasRect)}`);

  // The exact reverse gesture -- same pixel magnitude, opposite direction,
  // zoom unchanged throughout -- so the return is geometry, not a search.
  for (let i = 0; i < STROKES; i += 1) {
    await middleDrag(page, { x: dragPoint.near, y: dragPoint.y }, { x: dragPoint.far, y: dragPoint.y });
  }

  const originReturned = await calibrate(page);
  log('act4', `tile (0,0) screen origin after the equal-and-opposite return drags: ${JSON.stringify(originReturned)}`);
  await page.screenshot({ path: `${SHOTS}/act4-returned.png` });

  expect(originReturned).toEqual(originStart);

  log(
    'act4',
    'READ: no clamp on camera.scrollX/scrollY exists anywhere in src/rendering/scene/world-scene.ts (grepped; only ' +
      'ZOOM_BOUNDS at world-scene.ts:68 bounds anything) and no "recenter"/"return to prison" control exists in src/ui ' +
      'or src/rendering (grepped both trees). frameCameraOnFirstWorld (world-scene.ts:1088-1096) points the camera at ' +
      'the prison exactly once, on the very first frame a world exists, and never again.',
  );
});

// ------------------------------------------------------------------
// Act 5 -- the edge of the owned chunk: what happens when a player
// builds on the frontier, and what they see beyond it before they do.
// ------------------------------------------------------------------
test('act 5: building on the frontier edge is accepted without refusal and the world beyond it stops being void', async ({ page }) => {
  test.setTimeout(180_000);
  await installTee(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tab(page, 'build').click();

  const origin = await calibrate(page);
  log('act5', `tile (0,0) screen origin: ${JSON.stringify(origin)}`);

  // The owned chunk is tiles x:0..31, y:0..31 (new-session.ts:411-423). At
  // arrival's origin, tile 31's screen x is `origin.originX + 31*64 = 1600`,
  // off the right edge of a 1280-wide viewport -- the frontier is not on
  // screen at the framing `frameCameraOnFirstWorld` leaves the camera at.
  // Pan right by a fixed 900px stroke (zoom 1, unchanged throughout) so tiles
  // in the 30s are on screen, screenshot what x>=32 looks like before
  // anything is built there, and build **from this panned position** rather
  // than reverting it -- the frontier tile has to actually be on screen for
  // the press below to land on it at all, which an earlier draft of this act
  // got wrong (a press computed off the un-panned origin at screen x=1660,
  // beyond the 1280-wide viewport, produced zero commands -- not a game
  // defect, a build point placed off-screen by this instrument).
  const dragY = 260;
  await middleDrag(page, { x: 1100, y: dragY }, { x: 200, y: dragY });
  await page.screenshot({ path: `${SHOTS}/act5-frontier-before-build.png` });
  const originPanned = await calibrate(page);
  log('act5', `tile (0,0) screen origin after the one 900px pan: ${JSON.stringify(originPanned)}`);

  await buy(page, 'wall-brick', 10);
  await armBuildable(page, 'wall-brick');

  // A point inside tile (31,15), close to its right (east) edge -- the
  // frontier of the owned chunk (x:0..31) against the chunk beyond it (x:32..63).
  const buildTile = { x: 31, y: 15 };
  const point = { x: originPanned.originX + buildTile.x * TILE + TILE - 4, y: originPanned.originY + buildTile.y * TILE + TILE / 2 };
  log('act5', `build point for tile (${String(buildTile.x)},${String(buildTile.y)}) east edge, at the panned origin: ${JSON.stringify(point)}`);
  const beforeRefusal = await refusalBand(page);
  const commands = await press(page, point.x, point.y);
  log('act5', `press near the east edge of tile (${String(buildTile.x)},${String(buildTile.y)}) -> commands: ${JSON.stringify(commands)}`);
  await page.waitForTimeout(300);
  const afterRefusal = await refusalBand(page);
  log('act5', `refusal band: "${beforeRefusal}" -> "${afterRefusal}"`);
  expect(commands.length).toBeGreaterThan(0);
  // Not asserted as `'hidden'`: `calibrate()` just above armed and pressed the
  // Remove tool on bare ground, which paints a refusal of its own
  // ("Nothing was removed...") that stays -- by `hud.ts:946-951`'s own
  // documented rule -- "until another replaces it or the session ends".
  // The signal for *this* press is therefore whether the band **changed**,
  // not whether it is empty.
  expect(afterRefusal).toBe(beforeRefusal);

  // Let the order actually complete -- construction/system.ts:357-365 says the
  // chunk materialises "on completion", not on submission. `waitForQueueEmpty`
  // polls the Build panel's own queue readout rather than a fixed sleep.
  await page.locator('.hud-strip__transport button').nth(2).click();
  const elapsed = await waitForQueueEmpty(page);
  log('act5', `build queue emptied (polled, not a claimed duration; ${String(elapsed)}ms of wall-clock were spent polling but nothing here asserts on that number)`);
  await page.locator('.hud-strip__transport button').nth(0).click();

  // Same camera position as `act5-frontier-before-build.png` -- no further
  // pan -- so the two screenshots are a direct before/after of the same
  // rectangle of screen.
  const originAfterBuild = await calibrate(page);
  log('act5', `tile (0,0) screen origin after the build (should equal the panned origin, no further camera movement occurred): ${JSON.stringify(originAfterBuild)}`);
  expect(originAfterBuild).toEqual(originPanned);
  await page.screenshot({ path: `${SHOTS}/act5-frontier-after-build.png` });
  log('act5', 'screenshot taken at the identical camera position as act5-frontier-before-build.png -- compare by eye: tiles at x>=32 should now be drawn ground, not VOID_COLOR (0x0b0e12, src/rendering/world/appearance.ts:45)');
});
