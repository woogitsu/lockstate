import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { TILE, currentClock, currentTick, installTee, latestCounts, openApp, panelText, sentCommands, tab } from './playtest-harness';

/**
 * **A tablet, and nothing else.** No keyboard, no mouse, no right-click, no
 * hover, no wheel. How far into Lockstate does that person get?
 *
 * ## Why this file exists beside the shared harness
 *
 * `playtest-harness.ts` drives the game with `page.mouse` and
 * `locator.click()` -- `press`, `drag`, `calibrate`, `armBuildable`, `buy`
 * and `buildAndPopulate` all do -- and Playwright's `locator.click()` is a
 * *mouse* click even in a `hasTouch` context. A playtest about touch that
 * used them would measure a mouse and report about a finger. So this file
 * re-implements exactly the parts of that harness a finger has to do
 * differently, keeps everything a finger does *not* touch (`installTee`,
 * `sentCommands`, `currentTick`, `panelText`, `latestCounts`, `tab` as a
 * *locator*), and never calls `page.mouse` or `page.keyboard` anywhere.
 *
 * Multi-finger gestures go through CDP `Input.dispatchTouchEvent`, for the
 * reason `tests/browser/world-scene-touch.spec.ts` gives: `page.touchscreen`
 * places one finger and cannot express a second.
 *
 * ## The two viewports, and why these two
 *
 * **1024x768 landscape and 768x1024 portrait** -- one device, rotated. An iPad
 * (9th/10th generation, and the mini) reports exactly these CSS pixel sizes,
 * and holding the device fixed while rotating it is what isolates *orientation*
 * from *size*: any difference below is the rotation and nothing else.
 *
 * 768 is also the interesting number. `hud.css`'s narrow layout is
 * `@media (max-width: 720px)` (`src/ui/hud/hud.css:3716`) and `styles.css`'s
 * is the same (`src/styles.css:82`), so a tablet held in portrait is **48px
 * above the breakpoint** and gets the full desktop rail. That is a decision
 * this playtest measures rather than assumes.
 *
 * ## Not a gate
 *
 * `playwright.config.ts` is `testMatch: /.*\.spec\.ts$/`; nothing in CI
 * collects `.playtest.ts`. Run one act:
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5311 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-2026-09-04-touch-only.playtest.ts -g "act 1"
 * ```
 *
 * `git lfs checkout` first in a worktree, or every actor atlas fails to decode
 * and the run stays green anyway.
 */

test.use({ hasTouch: true });

const LANDSCAPE = { width: 1024, height: 768 } as const;
const PORTRAIT = { width: 768, height: 1024 } as const;

interface Point {
  readonly x: number;
  readonly y: number;
}

interface Finger extends Point {
  readonly id: number;
}

/* ------------------------------------------------------------------ */
/* Touch primitives                                                     */
/* ------------------------------------------------------------------ */

async function dispatch(client: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', fingers: readonly Finger[]): Promise<void> {
  await client.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: fingers.map((finger) => ({ x: finger.x, y: finger.y, id: finger.id })),
  });
}

/** One finger down, dragged, lifted. The gesture a wall run and a room rectangle both are. */
async function touchDrag(client: CDPSession, page: Page, a: Point, b: Point, steps = 10): Promise<void> {
  await dispatch(client, 'touchStart', [{ id: 0, ...a }]);
  for (let step = 1; step <= steps; step += 1) {
    await dispatch(client, 'touchMove', [
      { id: 0, x: a.x + ((b.x - a.x) * step) / steps, y: a.y + ((b.y - a.y) * step) / steps },
    ]);
  }
  await dispatch(client, 'touchEnd', []);
  await page.waitForTimeout(150);
}

/** Two fingers travelling together: the camera pan a touch player has while a tool is armed. */
async function twoFingerPan(client: CDPSession, page: Page, from: Point, delta: Point, gap = 120, steps = 8): Promise<void> {
  const place = async (type: 'touchStart' | 'touchMove', at: Point): Promise<void> => {
    await dispatch(client, type, [
      { id: 0, x: at.x - gap / 2, y: at.y },
      { id: 1, x: at.x + gap / 2, y: at.y },
    ]);
  };
  await place('touchStart', from);
  for (let step = 1; step <= steps; step += 1) {
    await place('touchMove', { x: from.x + (delta.x * step) / steps, y: from.y + (delta.y * step) / steps });
  }
  await dispatch(client, 'touchEnd', []);
  await page.waitForTimeout(150);
}

/** Symmetric separation about a fixed midpoint: scale only, no translation. */
async function pinch(client: CDPSession, page: Page, mid: Point, fromGap: number, toGap: number, steps = 8): Promise<void> {
  const place = async (type: 'touchStart' | 'touchMove', gap: number): Promise<void> => {
    await dispatch(client, type, [
      { id: 0, x: mid.x - gap / 2, y: mid.y },
      { id: 1, x: mid.x + gap / 2, y: mid.y },
    ]);
  };
  await place('touchStart', fromGap);
  for (let step = 1; step <= steps; step += 1) {
    await place('touchMove', fromGap + ((toGap - fromGap) * step) / steps);
  }
  await dispatch(client, 'touchEnd', []);
  await page.waitForTimeout(150);
}

/** What `document.elementFromPoint` says is on top, as a readable label. */
async function topAt(page: Page, x: number, y: number): Promise<string> {
  return page.evaluate(([px, py]: readonly number[]) => {
    const node = document.elementFromPoint(px as number, py as number);
    if (node === null) return 'NOTHING';
    const classes = node.className;
    const asString = typeof classes === 'string' ? classes : '';
    return `${node.tagName.toLowerCase()}${asString === '' ? '' : `.${asString.split(/\s+/).join('.')}`}`;
  }, [x, y] as const);
}

/** Fails the act if the point a world press is about to land on is not canvas. */
async function assertCanvasAt(page: Page, x: number, y: number, why: string): Promise<void> {
  const top = await topAt(page, x, y);
  expect(top, `${why}: (${x},${y}) is covered by ${top}`).toBe('canvas');
}

/**
 * A tap on a HUD control, by selector, with the occlusion check a player's
 * finger performs for free: if something else is on top at the point, the tap
 * lands on that instead and the control never hears about it.
 */
async function tapControl(page: Page, selector: string, options: { readonly nth?: number } = {}): Promise<void> {
  const locator = options.nth === undefined ? page.locator(selector) : page.locator(selector).nth(options.nth);
  const box = await locator.boundingBox();
  expect(box, `no box for ${selector}`).not.toBeNull();
  const centre = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
  const reached = await page.evaluate(
    ([sel, index, px, py]: readonly [string, number, number, number]) => {
      const nodes = document.querySelectorAll(sel);
      const target = nodes[index];
      if (target === undefined) return 'MISSING';
      const top = document.elementFromPoint(px, py);
      if (top === null) return 'NOTHING';
      return target.contains(top) || top === target ? 'OK' : `${top.tagName.toLowerCase()}.${String((top as HTMLElement).className)}`;
    },
    [selector, options.nth ?? 0, centre.x, centre.y] as const,
  );
  expect(reached, `tapping ${selector} at (${centre.x},${centre.y})`).toBe('OK');
  await page.touchscreen.tap(centre.x, centre.y);
  await page.waitForTimeout(120);
}

/* ------------------------------------------------------------------ */
/* Touch equivalents of the shared harness's mouse helpers              */
/* ------------------------------------------------------------------ */

/** A one-finger tap on the world, answering the commands it produced. */
async function touchPress(page: Page, x: number, y: number): Promise<readonly Record<string, unknown>[]> {
  const before = (await sentCommands(page)).length;
  await page.touchscreen.tap(x, y);
  await page.waitForTimeout(120);
  return (await sentCommands(page)).slice(before);
}

/**
 * `calibrate` from the shared harness, with a finger instead of a mouse.
 *
 * Same bisection, same reason (the transform is measured against the real page
 * rather than assumed), and the same tool: `Remove` is armed, a press answers
 * a `RemoveObject` naming the tile it hit, and the origin falls out.
 */
async function touchCalibrate(page: Page, probe: Point, precisionPx = 2): Promise<{ originX: number; originY: number }> {
  await tapControl(page, '.hud-build__remove');
  const at = async (x: number, y: number): Promise<{ x: number; y: number }> => {
    await assertCanvasAt(page, x, y, 'calibration probe');
    const commands = await touchPress(page, x, y);
    const removal = commands.find((c) => c['type'] === 'RemoveObject');
    if (removal === undefined) throw new Error(`no RemoveObject from a tap at ${x},${y}: ${JSON.stringify(commands)}`);
    return { x: removal['x'] as number, y: removal['y'] as number };
  };
  const base = await at(probe.x, probe.y);
  let lo = probe.x;
  let hi = probe.x + TILE;
  while (hi - lo > precisionPx) {
    const mid = Math.floor((lo + hi) / 2);
    const tile = await at(mid, probe.y);
    if (tile.x === base.x) lo = mid;
    else hi = mid;
  }
  const originX = hi - (base.x + 1) * TILE;
  lo = probe.y;
  hi = probe.y + TILE;
  while (hi - lo > precisionPx) {
    const mid = Math.floor((lo + hi) / 2);
    const tile = await at(probe.x, mid);
    if (tile.y === base.y) lo = mid;
    else hi = mid;
  }
  const originY = hi - (base.y + 1) * TILE;
  await tapControl(page, '.hud-build__remove');
  return { originX, originY };
}

const centreOf = (o: { originX: number; originY: number }, tx: number, ty: number): Point => ({
  x: o.originX + tx * TILE + TILE / 2,
  y: o.originY + ty * TILE + TILE / 2,
});

/** `armBuildable`, tapped. */
async function touchArm(page: Page, id: string): Promise<void> {
  await tapControl(page, `.hud-build__list [data-buildable="${id}"]`);
  const label = (await page.locator('.hud-build__arm').innerText()).trim().toLowerCase();
  if (label.startsWith('place') || label.startsWith('draw')) await tapControl(page, '.hud-build__arm');
}

/**
 * `buy`, tapped — with the *number* set the way a soft keyboard sets it.
 *
 * `fill()` is not a keystroke sequence; it sets the value and fires `input`
 * and `change`, which is what a tablet's numeric soft keyboard produces when
 * the player finishes typing. The alternative touch route — the `+` stepper —
 * is one tap per unit, and act 5 counts what that costs.
 */
async function touchBuy(page: Page, buildableId: string, quantity: number): Promise<void> {
  await tapControl(page, `.hud-build__list [data-buildable="${buildableId}"]`);
  if (await page.locator('.hud-build__buy').isHidden()) await tapControl(page, '.hud-build__buy-toggle');
  await page.locator('.hud-build__buy .ui-number__input').fill(String(quantity));
  await tapControl(page, '.hud-build__buy-submit');
  await page.waitForTimeout(250);
}

async function touchWaitForQueueEmpty(page: Page, timeoutMs = 240_000): Promise<number> {
  const started = Date.now();
  await tapControl(page, '.hud__tabs [data-tab="build"]');
  for (;;) {
    const text = await panelText(page, '.hud-build__queue');
    if (/(?<![0-9])0 waiting . 0 being built/.test(text) || text.includes('not laid out') || text.includes('ABSENT')) {
      return Date.now() - started;
    }
    if (Date.now() - started > timeoutMs) throw new Error(`the build queue never emptied: ${text}`);
    await page.waitForTimeout(1000);
  }
}

/* ------------------------------------------------------------------ */
/* Measurement                                                          */
/* ------------------------------------------------------------------ */

interface Reach {
  readonly viewport: { width: number; height: number };
  readonly canvasCells: number;
  readonly totalCells: number;
  readonly canvasFraction: number;
  readonly largestFreeSquarePx: number;
  readonly freeSquareAt: Point | null;
  readonly blockers: Record<string, number>;
}

/**
 * How much of the screen a finger aimed at the world actually reaches, and the
 * biggest unobstructed square in it.
 *
 * The square is the number that matters for building: a 6x6 cell at zoom 1 is
 * 384px on a side, and a wall run has to start and end on canvas.
 */
async function measureReach(page: Page, step = 8): Promise<Reach> {
  return page.evaluate((gridStep: number) => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const columns = Math.floor(width / gridStep);
    const rows = Math.floor(height / gridStep);
    const free: boolean[][] = [];
    const blockers: Record<string, number> = {};
    let canvasCells = 0;
    for (let row = 0; row < rows; row += 1) {
      const line: boolean[] = [];
      for (let column = 0; column < columns; column += 1) {
        const node = document.elementFromPoint(column * gridStep + gridStep / 2, row * gridStep + gridStep / 2);
        const isCanvas = node !== null && node.tagName === 'CANVAS';
        line.push(isCanvas);
        if (isCanvas) canvasCells += 1;
        else {
          const label =
            node === null
              ? 'NOTHING'
              : `${node.tagName.toLowerCase()}.${String((node as HTMLElement).className).split(/\s+/)[0] ?? ''}`;
          blockers[label] = (blockers[label] ?? 0) + 1;
        }
      }
      free.push(line);
    }
    // Largest all-free axis-aligned square, by the standard DP.
    const size: number[][] = free.map((line) => line.map(() => 0));
    let best = 0;
    let bestAt: { x: number; y: number } | null = null;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        if (!free[row]![column]!) continue;
        const value =
          row === 0 || column === 0
            ? 1
            : Math.min(size[row - 1]![column]!, size[row]![column - 1]!, size[row - 1]![column - 1]!) + 1;
        size[row]![column] = value;
        if (value > best) {
          best = value;
          bestAt = {
            x: (column - value + 1) * gridStep + gridStep / 2,
            y: (row - value + 1) * gridStep + gridStep / 2,
          };
        }
      }
    }
    return {
      viewport: { width, height },
      canvasCells,
      totalCells: rows * columns,
      canvasFraction: canvasCells / (rows * columns),
      largestFreeSquarePx: best * gridStep,
      freeSquareAt: bestAt,
      blockers,
    };
  }, step);
}

interface ControlBox {
  readonly selector: string;
  readonly text: string;
  readonly width: number;
  readonly height: number;
  readonly minSide: number;
  readonly occludedBy: string | null;
}

/** Every control a finger could aim at on the current tab, with its box and what is on top of it. */
async function measureControls(page: Page): Promise<readonly ControlBox[]> {
  return page.evaluate(() => {
    const selectorFor = (node: Element): string => {
      const classes = String((node as HTMLElement).className).split(/\s+/).filter((c) => c !== '');
      const identifying = classes.find((c) => c.startsWith('hud-') || c.startsWith('save-panel')) ?? classes[0] ?? node.tagName.toLowerCase();
      const data = Object.entries((node as HTMLElement).dataset)
        .filter(([key]) => key !== 'armed' && key !== 'tone')
        .map(([key, value]) => `[data-${key}="${String(value)}"]`)
        .join('');
      return `${node.tagName.toLowerCase()}.${identifying}${data}`;
    };
    const nodes = [...document.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')];
    return nodes
      .filter((node) => node.getClientRects().length > 0 && !node.hidden)
      .map((node) => {
        const rect = node.getBoundingClientRect();
        const cx = rect.x + rect.width / 2;
        const cy = rect.y + rect.height / 2;
        const top = document.elementFromPoint(cx, cy);
        const covered = top !== null && top !== node && !node.contains(top);
        return {
          selector: selectorFor(node),
          text: (node.textContent ?? node.getAttribute('aria-label') ?? '').trim().slice(0, 40),
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10,
          minSide: Math.round(Math.min(rect.width, rect.height) * 10) / 10,
          occludedBy: covered ? `${top.tagName.toLowerCase()}.${String((top as HTMLElement).className).split(/\s+/)[0] ?? ''}` : null,
        };
      });
  });
}

const TAP_TARGET = 44;

function reportReach(label: string, reach: Reach): void {
  console.log(
    `[${label}] canvas a finger can reach: ${(reach.canvasFraction * 100).toFixed(1)}% of ${reach.viewport.width}x${reach.viewport.height}` +
      ` | largest unobstructed square ${reach.largestFreeSquarePx}px at ${JSON.stringify(reach.freeSquareAt)}`,
  );
  console.log(`[${label}] what covers the rest: ${JSON.stringify(reach.blockers)}`);
}

function reportControls(label: string, controls: readonly ControlBox[]): void {
  const small = controls.filter((c) => c.minSide < TAP_TARGET);
  const covered = controls.filter((c) => c.occludedBy !== null);
  console.log(`[${label}] ${controls.length} visible control(s); ${small.length} below the 44px tap target; ${covered.length} covered`);
  for (const control of small) {
    console.log(`[${label}]   SMALL ${control.width}x${control.height} (min ${control.minSide}) ${control.selector} "${control.text}"`);
  }
  for (const control of covered) {
    console.log(`[${label}]   COVERED by ${String(control.occludedBy)}: ${control.selector} "${control.text}"`);
  }
}

const TABS = ['overview', 'build', 'rooms', 'security', 'regime'] as const;

/* ================================================================== */
/* act 1 — arriving on a tablet                                        */
/* ================================================================== */

test('act 1: what a tablet shows on arrival, landscape and portrait', async ({ page }) => {
  await installTee(page);
  for (const [label, viewport] of [
    ['landscape 1024x768', LANDSCAPE],
    ['portrait 768x1024', PORTRAIT],
  ] as const) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openApp(page);
    await page.waitForTimeout(1500);

    console.log(`\n[${label}] ===== ARRIVAL =====`);
    const hudText = await page.evaluate(() => (document.querySelector<HTMLElement>('.hud')?.innerText ?? '').trim());
    console.log(`[${label}] everything the HUD says on arrival:\n${hudText}`);

    reportReach(label, await measureReach(page));

    for (const id of TABS) {
      await tapControl(page, `.hud__tabs [data-tab="${id}"]`);
      await page.waitForTimeout(250);
      reportReach(`${label} · ${id}`, await measureReach(page));
      reportControls(`${label} · ${id}`, await measureControls(page));
    }
  }
});

/* ================================================================== */
/* act 2 — can a finger move the camera?                               */
/* ================================================================== */

test('act 2: pan and zoom with fingers only', async ({ page }) => {
  await installTee(page);
  const client = await page.context().newCDPSession(page);
  for (const [label, viewport] of [
    ['landscape 1024x768', LANDSCAPE],
    ['portrait 768x1024', PORTRAIT],
  ] as const) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openApp(page);
    await tapControl(page, '.hud__tabs [data-tab="build"]');
    await page.waitForTimeout(500);

    const reach = await measureReach(page);
    const anchor = reach.freeSquareAt;
    expect(anchor, `${label}: no unobstructed canvas at all`).not.toBeNull();
    const probe = { x: Math.round(anchor!.x + 40), y: Math.round(anchor!.y + 40) };
    console.log(`\n[${label}] ===== CAMERA =====  probing at ${JSON.stringify(probe)}`);

    /** The tile under a fixed screen point, read the way a player's press reads it. */
    const tileUnderProbe = async (): Promise<{ x: number; y: number }> => {
      await tapControl(page, '.hud-build__remove');
      await assertCanvasAt(page, probe.x, probe.y, `${label} camera probe`);
      const commands = await touchPress(page, probe.x, probe.y);
      const removal = commands.find((c) => c['type'] === 'RemoveObject');
      await tapControl(page, '.hud-build__remove');
      if (removal === undefined) throw new Error(`no RemoveObject at the probe: ${JSON.stringify(commands)}`);
      return { x: removal['x'] as number, y: removal['y'] as number };
    };
    /** Tiles per 320 screen px, at the current zoom: how big the world looks. */
    const tilePitch = async (): Promise<number> => {
      await tapControl(page, '.hud-build__remove');
      await assertCanvasAt(page, probe.x, probe.y, `${label} pitch probe a`);
      const a = (await touchPress(page, probe.x, probe.y)).find((c) => c['type'] === 'RemoveObject');
      await assertCanvasAt(page, probe.x + 320, probe.y, `${label} pitch probe b`);
      const b = (await touchPress(page, probe.x + 320, probe.y)).find((c) => c['type'] === 'RemoveObject');
      await tapControl(page, '.hud-build__remove');
      if (a === undefined || b === undefined) throw new Error('pitch probe missed');
      return (b['x'] as number) - (a['x'] as number);
    };

    const restTile = await tileUnderProbe();
    const restPitch = await tilePitch();
    console.log(`[${label}] at rest: tile under the probe = ${JSON.stringify(restTile)}, tiles per 320px = ${restPitch}`);

    // 1. One finger, nothing armed.
    await touchDrag(client, page, probe, { x: probe.x - 200, y: probe.y - 120 });
    const afterOneFinger = await tileUnderProbe();
    console.log(`[${label}] one-finger drag (-200,-120), no tool armed -> tile under the probe ${JSON.stringify(afterOneFinger)}`);

    // 2. Two fingers, nothing armed.
    await twoFingerPan(client, page, probe, { x: 200, y: 120 });
    const afterTwoFinger = await tileUnderProbe();
    console.log(`[${label}] two-finger pan (+200,+120) -> tile under the probe ${JSON.stringify(afterTwoFinger)}`);

    // 3. One finger with the wall tool armed: does it build instead of panning?
    await touchArm(page, 'wall-brick');
    const before = (await sentCommands(page)).length;
    await touchDrag(client, page, probe, { x: probe.x + 128, y: probe.y });
    const produced = (await sentCommands(page)).slice(before);
    console.log(`[${label}] one-finger drag while armed produced ${produced.length} command(s): ${JSON.stringify(produced.slice(0, 4))}`);
    await tapControl(page, '.hud-build__arm');

    // 4. Two fingers while armed: the hint promises this still moves the camera.
    await touchArm(page, 'wall-brick');
    const armedBefore = (await sentCommands(page)).length;
    await twoFingerPan(client, page, probe, { x: -160, y: 0 });
    const armedProduced = (await sentCommands(page)).slice(armedBefore);
    await tapControl(page, '.hud-build__arm');
    const afterArmedPan = await tileUnderProbe();
    console.log(
      `[${label}] two-finger pan while armed: ${armedProduced.length} build command(s), tile under the probe ${JSON.stringify(afterArmedPan)}`,
    );

    // 5. Pinch.
    await pinch(client, page, probe, 100, 240);
    const pinchedOutPitch = await tilePitch();
    console.log(`[${label}] pinch out 100->240px: tiles per 320px went ${restPitch} -> ${pinchedOutPitch}`);
    await pinch(client, page, probe, 240, 100);
    const pinchedBackPitch = await tilePitch();
    console.log(`[${label}] pinch back in 240->100px: tiles per 320px now ${pinchedBackPitch}`);

    // 6. The sentence the panel shows a touch player about all this.
    const note = await panelText(page, '.hud-build__note');
    const noteInDom = await page.evaluate(() => document.querySelector<HTMLElement>('.hud-build__note')?.textContent ?? 'ABSENT');
    const clipped = await page.evaluate(() => {
      const node = document.querySelector<HTMLElement>('.hud-build__note');
      if (node === null) return 'ABSENT';
      return `scrollHeight=${node.scrollHeight} clientHeight=${node.clientHeight} clipped=${String(node.scrollHeight > node.clientHeight)}`;
    });
    console.log(`[${label}] the arm hint, as rendered: ${JSON.stringify(note)}`);
    console.log(`[${label}] the arm hint, in the DOM:   ${JSON.stringify(noteInDom)}`);
    console.log(`[${label}] the arm hint box: ${clipped}`);
  }
});

/* ================================================================== */
/* act 3 — every tab, every control, one finger                        */
/* ================================================================== */

test('act 3: is every control reachable and scrollable by finger', async ({ page }) => {
  await installTee(page);
  for (const [label, viewport] of [
    ['landscape 1024x768', LANDSCAPE],
    ['portrait 768x1024', PORTRAIT],
  ] as const) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openApp(page);
    await tapControl(page, '.save-panel button >> nth=0');
    await page.waitForTimeout(800);
    console.log(`\n[${label}] ===== PANELS =====`);

    for (const id of TABS) {
      await tapControl(page, `.hud__tabs [data-tab="${id}"]`);
      await page.waitForTimeout(400);
      const scrollers = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.hud *, .save-panel')]
          .filter((node) => node.scrollHeight > node.clientHeight + 1 && node.getClientRects().length > 0)
          .map((node) => ({
            selector: `${node.tagName.toLowerCase()}.${String(node.className).split(/\s+/)[0] ?? ''}`,
            scrollHeight: node.scrollHeight,
            clientHeight: node.clientHeight,
            overflowY: getComputedStyle(node).overflowY,
            touchAction: getComputedStyle(node).touchAction,
          })),
      );
      console.log(`[${label} · ${id}] scroll containers with content below the fold: ${JSON.stringify(scrollers)}`);

      // Anything below the fold that a finger has to scroll to.
      const belowFold = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.hud button, .hud input, .save-panel button')]
          .filter((node) => node.getClientRects().length > 0)
          .filter((node) => {
            const rect = node.getBoundingClientRect();
            return rect.bottom > window.innerHeight || rect.top < 0 || rect.right > window.innerWidth || rect.left < 0;
          })
          .map((node) => ({
            selector: `${node.tagName.toLowerCase()}.${String(node.className).split(/\s+/)[0] ?? ''}`,
            text: (node.textContent ?? '').trim().slice(0, 30),
            rect: node.getBoundingClientRect().toJSON(),
          })),
      );
      console.log(`[${label} · ${id}] controls outside the viewport: ${JSON.stringify(belowFold)}`);
    }
  }
});

/* ================================================================== */
/* act 4 — the whole game, with fingers, landscape                     */
/* ================================================================== */

async function playTheGame(page: Page, client: CDPSession, label: string): Promise<void> {
  const log = (line: string): void => console.log(`[${label}] ${line}`);

  await tapControl(page, '.save-panel button >> nth=0');
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  log('New prison: day reads 1');

  await tapControl(page, '.hud__tabs [data-tab="build"]');
  const reach = await measureReach(page);
  reportReach(`${label} build tab`, reach);
  const anchor = reach.freeSquareAt!;
  const origin = await touchCalibrate(page, { x: Math.round(anchor.x + 48), y: Math.round(anchor.y + 48) });
  log(`calibration: tile (0,0) top-left at (${origin.originX}, ${origin.originY})`);

  // Which tiles a finger can actually reach, in this viewport, at this camera.
  const reachableTiles: { x: number; y: number }[] = [];
  for (let ty = 0; ty < 40; ty += 1) {
    for (let tx = 0; tx < 40; tx += 1) {
      const point = centreOf(origin, tx, ty);
      if (point.x < 0 || point.y < 0) continue;
      if (point.x > (await page.evaluate(() => window.innerWidth)) || point.y > (await page.evaluate(() => window.innerHeight))) continue;
      if ((await topAt(page, point.x, point.y)) === 'canvas') reachableTiles.push({ x: tx, y: ty });
    }
  }
  const xs = reachableTiles.map((t) => t.x);
  const ys = reachableTiles.map((t) => t.y);
  log(
    `tiles a finger can reach without moving the camera: ${reachableTiles.length}` +
      ` spanning x ${Math.min(...xs)}..${Math.max(...xs)}, y ${Math.min(...ys)}..${Math.max(...ys)}`,
  );

  // A 6x6 cell placed inside the reachable band rather than at the harness's
  // fixed (12,12): the whole question is whether a finger can reach it.
  const columnCounts = new Map<number, number>();
  for (const tile of reachableTiles) columnCounts.set(tile.x, (columnCounts.get(tile.x) ?? 0) + 1);
  const fullRows = new Map<number, number[]>();
  for (const tile of reachableTiles) {
    const row = fullRows.get(tile.y) ?? [];
    row.push(tile.x);
    fullRows.set(tile.y, row);
  }
  let best: { x0: number; y0: number } | null = null;
  for (const [y0, columns] of [...fullRows.entries()].sort((a, b) => a[0] - b[0])) {
    for (const x0 of [...columns].sort((a, b) => a - b)) {
      const fits = [0, 1, 2, 3, 4, 5, 6].every((dy) =>
        [0, 1, 2, 3, 4, 5, 6].every((dx) => reachableTiles.some((t) => t.x === x0 + dx && t.y === y0 + dy)),
      );
      if (fits) {
        best = { x0, y0 };
        break;
      }
    }
    if (best !== null) break;
  }
  log(`smallest reachable 7x7 tile block (a 6x6 cell plus its far wall): ${JSON.stringify(best)}`);
  expect(best, `${label}: no 6x6 cell fits in the canvas a finger can reach`).not.toBeNull();
  const x0 = best!.x0;
  const y0 = best!.y0;

  await touchBuy(page, 'wall-brick', 60);
  await touchBuy(page, 'bed-wooden', 4);
  log(`strip after buying: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);

  // Start the clock, by finger.
  await tapControl(page, '.hud-strip__transport button', { nth: 2 });
  await page.waitForTimeout(200);
  await tapControl(page, '.hud-strip__transport button', { nth: 2 });
  await page.waitForTimeout(2500);
  log(`clock after two taps on Fast forward: ${JSON.stringify(await currentClock(page))} at tick ${await currentTick(page)}`);

  // Four wall runs, drawn with a finger.
  await touchArm(page, 'wall-brick');
  const westX = origin.originX + x0 * TILE;
  const eastX = origin.originX + (x0 + 6) * TILE;
  const northY = origin.originY + y0 * TILE;
  const southY = origin.originY + (y0 + 6) * TILE;
  for (const run of [
    { name: 'north', a: { x: westX + TILE / 2, y: northY }, b: { x: eastX - TILE / 2, y: northY } },
    { name: 'south', a: { x: westX + TILE / 2, y: southY }, b: { x: eastX - TILE / 2, y: southY } },
    { name: 'west', a: { x: westX, y: northY + TILE / 2 }, b: { x: westX, y: southY - TILE / 2 } },
    { name: 'east', a: { x: eastX, y: northY + TILE / 2 }, b: { x: eastX, y: southY - TILE / 2 } },
  ]) {
    await assertCanvasAt(page, run.a.x, run.a.y, `${label} wall ${run.name} start`);
    await assertCanvasAt(page, run.b.x, run.b.y, `${label} wall ${run.name} end`);
    const before = (await sentCommands(page)).length;
    await touchDrag(client, page, run.a, run.b);
    const produced = (await sentCommands(page)).slice(before);
    log(`wall run ${run.name}: ${produced.length} command(s)`);
  }
  log(`queue after the four runs: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
  const queueEmptyAt = await touchWaitForQueueEmpty(page);
  log(`the Build panel says the queue is empty after ${queueEmptyAt}ms, tick ${await currentTick(page)}`);

  // Zone it, by finger.
  let attempts = 0;
  for (;;) {
    attempts += 1;
    await tapControl(page, '.hud__tabs [data-tab="rooms"]');
    if ((await page.locator('.hud-rooms').getAttribute('data-collapsed')) === 'true') {
      await tapControl(page, '.hud-rooms > .ui-panel__header > .ui-panel__toggle');
    }
    await tapControl(page, '.hud-rooms__list [data-room="room.cell"]');
    await tapControl(page, '.hud-rooms__arm');
    const a = centreOf(origin, x0, y0);
    const b = centreOf(origin, x0 + 5, y0 + 5);
    await assertCanvasAt(page, a.x, a.y, `${label} zone start`);
    await assertCanvasAt(page, b.x, b.y, `${label} zone end`);
    await touchDrag(client, page, a, b);
    const note = await panelText(page, '.hud-rooms');
    await tapControl(page, '.hud-rooms__confirm');
    await page.waitForTimeout(900);
    const counts = await latestCounts(page);
    log(`designate attempt ${attempts}: rooms=${String(counts?.rooms)} | panel said ${JSON.stringify(note.split('\n').filter((l) => /OPEN|ENCLOS/i.test(l)))}`);
    if ((counts?.rooms ?? 0) > 0) break;
    if (attempts >= 8) throw new Error('the rectangle was never accepted as a room');
    await page.waitForTimeout(5000);
  }

  // Beds, by finger.
  await tapControl(page, '.hud__tabs [data-tab="build"]');
  await touchArm(page, 'bed-wooden');
  let placed = 0;
  for (let column = x0 + 1; column <= x0 + 4 && placed < 3; column += 1) {
    const point = centreOf(origin, column, y0 + 1);
    await assertCanvasAt(page, point.x, point.y, `${label} bed ${column}`);
    const commands = await touchPress(page, point.x, point.y);
    log(`bed at (${column},${y0 + 1}): ${commands.length} command(s)`);
    placed += 1;
  }
  await touchWaitForQueueEmpty(page);
  await page.waitForTimeout(1500);
  const built = await latestCounts(page);
  log(`after building: rooms=${String(built?.rooms)} accommodationCapacity=${String(built?.accommodationCapacity)}`);

  // Hire, by finger.
  await tapControl(page, '.hud__tabs [data-tab="security"]');
  const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
  if ((await guardRow.count()) > 0) await tapControl(page, '.hud-staff__list [data-staff-role="staff-role.guard"]');
  await tapControl(page, '.hud-staff__hire');
  await page.waitForTimeout(1200);
  log(`after one Hire tap: staff=${String((await latestCounts(page))?.staff)}`);

  // Admit, by finger.
  await tapControl(page, '.hud__tabs [data-tab="overview"]');
  await tapControl(page, '.hud-intake__admit');
  await page.waitForTimeout(1500);
  const admitted = await latestCounts(page);
  log(`after one Admit tap: prisoners=${String(admitted?.prisoners)} roomOccupants=${String(admitted?.roomOccupants)}`);
  log(`intake panel: ${await panelText(page, '.hud-intake')}`);
  log(`status strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
}

test('act 4: the whole game with fingers, tablet landscape', async ({ page }) => {
  await installTee(page);
  const client = await page.context().newCDPSession(page);
  await page.setViewportSize(LANDSCAPE);
  await openApp(page);
  await playTheGame(page, client, 'landscape 1024x768');
});

test('act 5: the whole game with fingers, tablet portrait', async ({ page }) => {
  await installTee(page);
  const client = await page.context().newCDPSession(page);
  await page.setViewportSize(PORTRAIT);
  await openApp(page);
  await playTheGame(page, client, 'portrait 768x1024');
});

/* ================================================================== */
/* act 6 — getting out of a mistake, with no keyboard                  */
/* ================================================================== */

test('act 6: what a finger can undo', async ({ page }) => {
  await installTee(page);
  const client = await page.context().newCDPSession(page);
  await page.setViewportSize(LANDSCAPE);
  await openApp(page);
  const log = (line: string): void => console.log(`[mistake] ${line}`);

  await tapControl(page, '.save-panel button >> nth=0');
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tapControl(page, '.hud__tabs [data-tab="build"]');
  const reach = await measureReach(page);
  const origin = await touchCalibrate(page, { x: Math.round(reach.freeSquareAt!.x + 48), y: Math.round(reach.freeSquareAt!.y + 48) });
  log(`origin (${origin.originX}, ${origin.originY})`);

  // The tap-count cost of the stepper, which is the touch route that needs no
  // soft keyboard.
  await tapControl(page, '.hud-build__list [data-buildable="wall-brick"]');
  if (await page.locator('.hud-build__buy').isHidden()) await tapControl(page, '.hud-build__buy-toggle');
  const startValue = await page.locator('.hud-build__buy .ui-number__input').inputValue();
  await tapControl(page, '.hud-build__buy .ui-number__step', { nth: 1 });
  const afterOneStep = await page.locator('.hud-build__buy .ui-number__input').inputValue();
  log(`buy quantity field starts at ${JSON.stringify(startValue)}; one tap on + gives ${JSON.stringify(afterOneStep)}`);
  const stepBox = await page.locator('.hud-build__buy .ui-number__step').nth(1).boundingBox();
  log(`the + stepper is ${String(stepBox?.width)}x${String(stepBox?.height)}`);

  await touchBuy(page, 'wall-brick', 20);
  await touchBuy(page, 'bed-wooden', 2);
  await tapControl(page, '.hud-strip__transport button', { nth: 2 });
  await tapControl(page, '.hud-strip__transport button', { nth: 2 });
  await page.waitForTimeout(2500);

  // Draw a wall the player did not want.
  await touchArm(page, 'wall-brick');
  const runStart = centreOf(origin, 6, 6);
  const runEnd = centreOf(origin, 9, 6);
  const wallA = { x: runStart.x, y: runStart.y - TILE / 2 };
  const wallB = { x: runEnd.x, y: runEnd.y - TILE / 2 };
  await assertCanvasAt(page, wallA.x, wallA.y, 'mistaken wall start');
  await assertCanvasAt(page, wallB.x, wallB.y, 'mistaken wall end');
  let before = (await sentCommands(page)).length;
  await touchDrag(client, page, wallA, wallB);
  log(`the mistaken wall run: ${JSON.stringify((await sentCommands(page)).slice(before))}`);
  await tapControl(page, '.hud-build__arm');

  // 1. While it is still queued: is there a per-row cancel a finger can reach?
  const queueRows = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hud-build__queue button')].map((node) => ({
      text: (node.textContent ?? node.getAttribute('aria-label') ?? '').trim(),
      className: String(node.className),
      rect: node.getBoundingClientRect().toJSON(),
    })),
  );
  log(`controls inside the build queue while the wall is pending: ${JSON.stringify(queueRows)}`);
  log(`queue text: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);

  // Let it finish.
  await touchWaitForQueueEmpty(page);
  await page.waitForTimeout(1500);
  log(`queue after building: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);

  // 2. Once it is standing: the Remove tool, which is the only world-facing
  //    demolition control the Build panel has.
  await tapControl(page, '.hud-build__remove');
  const removeLabel = (await page.locator('.hud-build__remove').innerText()).trim();
  log(`the Remove control reads ${JSON.stringify(removeLabel)}`);
  before = (await sentCommands(page)).length;
  await assertCanvasAt(page, wallA.x, wallA.y, 'remove on the wall edge');
  await touchPress(page, wallA.x, wallA.y);
  const onEdge = (await sentCommands(page)).slice(before);
  log(`Remove tapped exactly on the wall edge: ${JSON.stringify(onEdge)}`);
  const insideTile = centreOf(origin, 6, 6);
  before = (await sentCommands(page)).length;
  await assertCanvasAt(page, insideTile.x, insideTile.y, 'remove inside the walled tile');
  await touchPress(page, insideTile.x, insideTile.y);
  log(`Remove tapped on the tile the wall belongs to: ${JSON.stringify((await sentCommands(page)).slice(before))}`);
  await page.waitForTimeout(1200);
  log(`refusal band: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
  log(`alerts: ${JSON.stringify(await panelText(page, '.hud-alerts'))}`);
  await tapControl(page, '.hud-build__remove');

  // Is the wall still there? Ask the world: a fresh wall order on the same
  // edge is refused if one already stands.
  await touchArm(page, 'wall-brick');
  before = (await sentCommands(page)).length;
  await touchPress(page, wallA.x, wallA.y);
  log(`re-arming and re-tapping the same edge: ${JSON.stringify((await sentCommands(page)).slice(before))}`);
  await page.waitForTimeout(1000);
  log(`refusal band after re-tapping the edge: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
  await tapControl(page, '.hud-build__arm');

  // 3. A misplaced object, which does have a touch route.
  await touchArm(page, 'bed-wooden');
  const bedAt = centreOf(origin, 12, 6);
  await assertCanvasAt(page, bedAt.x, bedAt.y, 'misplaced bed');
  before = (await sentCommands(page)).length;
  await touchPress(page, bedAt.x, bedAt.y);
  log(`misplaced bed: ${JSON.stringify((await sentCommands(page)).slice(before))}`);
  await tapControl(page, '.hud-build__arm');
  await touchWaitForQueueEmpty(page);
  await tapControl(page, '.hud-build__remove');
  before = (await sentCommands(page)).length;
  await touchPress(page, bedAt.x, bedAt.y);
  log(`Remove tapped on the misplaced bed: ${JSON.stringify((await sentCommands(page)).slice(before))}`);
  await page.waitForTimeout(1200);
  log(`refusal band: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
  await tapControl(page, '.hud-build__remove');

  // 4. Abandoning a gesture in progress. `build.cancel` is Escape and nothing
  //    else; the only touch analogue is a second finger, which `pointermove`
  //    documents as cancelling the run.
  await touchArm(page, 'wall-brick');
  const cancelA = { x: centreOf(origin, 6, 10).x, y: centreOf(origin, 6, 10).y - TILE / 2 };
  await assertCanvasAt(page, cancelA.x, cancelA.y, 'cancel probe');
  before = (await sentCommands(page)).length;
  await dispatch(client, 'touchStart', [{ id: 0, ...cancelA }]);
  for (let step = 1; step <= 6; step += 1) await dispatch(client, 'touchMove', [{ id: 0, x: cancelA.x + step * 32, y: cancelA.y }]);
  // A second finger arrives mid-run.
  await dispatch(client, 'touchMove', [
    { id: 0, x: cancelA.x + 192, y: cancelA.y },
    { id: 1, x: cancelA.x + 292, y: cancelA.y },
  ]);
  await dispatch(client, 'touchMove', [
    { id: 0, x: cancelA.x + 182, y: cancelA.y },
    { id: 1, x: cancelA.x + 302, y: cancelA.y },
  ]);
  await dispatch(client, 'touchEnd', []);
  await page.waitForTimeout(300);
  log(`a second finger mid-run produced: ${JSON.stringify((await sentCommands(page)).slice(before))}`);
  await tapControl(page, '.hud-build__arm');

  // 5. And what the game offers a finger for undo at all.
  const undoControls = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('button, [role="button"]')]
      .filter((node) => /undo|redo|cancel|revert|demolish|remove|delete/i.test(`${node.textContent ?? ''} ${node.getAttribute('aria-label') ?? ''}`))
      .map((node) => ({
        text: (node.textContent ?? '').trim().slice(0, 40),
        label: node.getAttribute('aria-label'),
        className: String(node.className).split(/\s+/)[0] ?? '',
        visible: node.getClientRects().length > 0,
      })),
  );
  log(`every control on screen whose words suggest undoing something: ${JSON.stringify(undoControls)}`);
});
