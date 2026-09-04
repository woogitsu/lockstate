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
async function whatIsOnTopOf(page: Page, selector: string, nth: number): Promise<{ verdict: string; centre: Point }> {
  const locator = page.locator(selector).nth(nth);
  const box = await locator.boundingBox();
  expect(box, `no box for ${selector}`).not.toBeNull();
  const centre = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
  const verdict = await page.evaluate(
    ([sel, index, px, py]: readonly [string, number, number, number]) => {
      const target = document.querySelectorAll(sel)[index];
      if (target === undefined) return 'MISSING';
      const top = document.elementFromPoint(px, py);
      if (top === null) return 'NOTHING';
      return target.contains(top) || top === target ? 'OK' : `${top.tagName.toLowerCase()}.${String((top as HTMLElement).className)}`;
    },
    [selector, nth, centre.x, centre.y] as const,
  );
  return { verdict, centre };
}

async function tapControl(page: Page, selector: string, options: { readonly nth?: number } = {}): Promise<void> {
  const { verdict, centre } = await whatIsOnTopOf(page, selector, options.nth ?? 0);
  expect(verdict, `tapping ${selector} at (${centre.x},${centre.y})`).toBe('OK');
  await page.touchscreen.tap(centre.x, centre.y);
  await page.waitForTimeout(120);
}

/**
 * A tap on a list row, dragging the list with a finger first when the row is
 * not where a tap would reach it. **The number of drags is the measurement.**
 *
 * This exists because act 4's first landscape run died here, and the death was
 * the game and not the instrument: with the Buy disclosure open at 1024x768,
 * `[data-buildable="bed-wooden"]`'s own box is at (880, 400.6) and
 * `document.elementFromPoint` there returns
 * **`button.ui-action hud-build__remove`**. The catalogue's rows run on past
 * the bottom of the 88px box that clips them, and the Build panel's own action
 * row is painted where the Bed row's coordinates say it is. A player has to
 * scroll the catalogue to reach 19 of its 21 rows.
 *
 * **The gesture is a raw `dispatchTouchEvent` drag, not
 * `Input.synthesizeScrollGesture`, and act 9 is why.** Both are one finger, and
 * on this page they disagree: the raw drag moves `.hud-build__list` by 185 and
 * the synthesised one by 0, at the same point, with the same distance.
 * `synthesizeScrollGesture` also answers 0 with `html`/`body` relaxed to
 * `touch-action: auto`, so it is not being blocked -- it is inert here, and it
 * is the instrument that is wrong. The raw drag is the one that can be trusted,
 * because it was shown to *respect* `touch-action`: the same drag answers 0
 * when the list itself is given `touch-action: none` and 185 when that is put
 * back.
 */
async function tapRowScrollingIfNeeded(page: Page, selector: string, label: string): Promise<void> {
  const client = await page.context().newCDPSession(page);
  for (let drags = 0; drags <= 12; drags += 1) {
    const { verdict, centre } = await whatIsOnTopOf(page, selector, 0);
    if (verdict === 'OK') {
      if (drags > 0) console.log(`[${label}] ${selector} needed ${drags} finger drag(s) on the list before a tap could reach it`);
      await page.touchscreen.tap(centre.x, centre.y);
      await page.waitForTimeout(120);
      return;
    }
    if (drags === 0) console.log(`[${label}] a tap where ${selector} says it is lands on ${verdict} instead; dragging the list with a finger`);
    const scroller = await page.evaluate((sel: string) => {
      const node = document.querySelector<HTMLElement>(sel);
      if (node === null) return null;
      let parent = node.parentElement;
      while (parent !== null) {
        if (/auto|scroll/.test(getComputedStyle(parent).overflowY) && parent.scrollHeight > parent.clientHeight + 1) {
          const rect = parent.getBoundingClientRect();
          return {
            selector: `${parent.tagName.toLowerCase()}.${String(parent.className).split(/\s+/)[0] ?? ''}`,
            x: Math.round(rect.x + rect.width / 2),
            y: Math.round(rect.y + rect.height / 2),
            height: Math.round(rect.height),
            scrollTop: parent.scrollTop,
            scrollHeight: parent.scrollHeight,
            clientHeight: parent.clientHeight,
          };
        }
        parent = parent.parentElement;
      }
      return null;
    }, selector);
    if (scroller === null) throw new Error(`${selector} is unreachable (${verdict}) and nothing above it scrolls`);
    // A drag no longer than the box it is inside: a finger cannot travel
    // further than the list is tall without leaving it, and how short that is
    // is exactly the cost this measures.
    const travel = Math.max(40, scroller.height - 16);
    await dispatch(client, 'touchStart', [{ id: 0, x: scroller.x, y: scroller.y + travel / 2 }]);
    for (let step = 1; step <= 10; step += 1) {
      await dispatch(client, 'touchMove', [{ id: 0, x: scroller.x, y: scroller.y + travel / 2 - (travel * step) / 10 }]);
    }
    await dispatch(client, 'touchEnd', []);
    await page.waitForTimeout(350);
    const moved = await page.evaluate((sel: string) => document.querySelector<HTMLElement>(sel)?.scrollTop ?? -1, scroller.selector);
    if (moved === scroller.scrollTop) {
      throw new Error(
        `a one-finger drag of ${travel}px on ${scroller.selector} did not scroll it` +
          ` (scrollTop stayed ${moved}; ${scroller.scrollHeight} of content in ${scroller.clientHeight}), and ${selector} stays unreachable`,
      );
    }
  }
  throw new Error(`${selector} was still unreachable after twelve finger drags`);
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
  await tapRowScrollingIfNeeded(page, `.hud-build__list [data-buildable="${id}"]`, `arm ${id}`);
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
  await tapRowScrollingIfNeeded(page, `.hud-build__list [data-buildable="${buildableId}"]`, `buy ${buildableId}`);
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

    /*
     * Everything on screen whose text lives in a `title` tooltip.
     *
     * A tooltip opens on hover, and a touchscreen has no hover -- so whatever
     * is in one is text a tablet player can never read. What matters is the
     * *difference*: a `title` repeating a label that is already painted costs
     * nothing, and a `title` carrying a sentence that appears nowhere else is
     * information the game keeps from this player. `.ui-sr-only` is stripped
     * before the comparison because it is `clip-path: inset(50%)`
     * (`src/ui/primitives/primitives.css:73`) -- present to `innerText`,
     * invisible on the glass.
     */
    const tooltips = await page.evaluate(() => {
      return [...document.querySelectorAll<HTMLElement>('[title]')]
        .filter((node) => node.getClientRects().length > 0)
        .map((node) => {
          const clone = node.cloneNode(true) as HTMLElement;
          for (const hidden of clone.querySelectorAll('.ui-sr-only')) hidden.remove();
          const painted = (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
          const title = node.getAttribute('title') ?? '';
          return {
            selector: `${node.tagName.toLowerCase()}.${String(node.className).split(/\s+/)[0] ?? ''}`,
            title,
            paintedText: painted,
            titleIsAlsoPainted: painted.includes(title),
          };
        });
    });
    console.log(`[${label}] text that exists only in a hover tooltip: ${JSON.stringify(tooltips, null, 1)}`);

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
    // A world tap before this produces no command at all: the intent reaches
    // `ObjectTool.place` and the host refuses it with "No simulation session is
    // running yet", to `console.warn` and nowhere a player can see. Measured
    // once by this act failing without it; not a touch finding, so it is only
    // recorded here.
    await tapControl(page, '.save-panel__button', { nth: 0 });
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await tapControl(page, '.hud__tabs [data-tab="build"]');
    await page.waitForTimeout(500);

    /*
     * Every gesture below happens inside the largest unobstructed square, and
     * that is a correction to this act's first run rather than a precaution.
     *
     * The first version anchored 40px inside the square's top-left corner. At
     * portrait that put the midpoint at x=44, so a pinch starting 100px apart
     * placed one finger at **x=-6**, off the viewport, and the readings that
     * came back were nonsense in both directions (`3 -> 2 -> 1` for a pinch out
     * followed by a pinch back in). At landscape the one-finger pan ran from
     * y=124 to y=4 -- under the status strip -- and moved the camera about a
     * third of what it was asked for. Both are instrument faults. The
     * *question* one of them raises is real and is now measured on purpose
     * below: what a one-finger pan does when the finger crosses onto the HUD.
     */
    const reach = await measureReach(page);
    const anchor = reach.freeSquareAt;
    expect(anchor, `${label}: no unobstructed canvas at all`).not.toBeNull();
    const side = reach.largestFreeSquarePx;
    const probe = { x: Math.round(anchor!.x + side / 2), y: Math.round(anchor!.y + side / 2) };
    console.log(
      `\n[${label}] ===== CAMERA =====  the unobstructed square is ${side}px at ${JSON.stringify(anchor)};` +
        ` every gesture below is inside it, midpoint ${JSON.stringify(probe)}`,
    );

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
    /**
     * How wide a tile is on screen, from two presses a fixed span apart.
     *
     * The span is as wide as the unobstructed square allows, because the
     * instrument is quantised to whole tiles and a wider span is a finer
     * reading. It is still coarse -- the answer is `span / an integer` -- and
     * that is enough for the question here, which is whether a pinch changes
     * the zoom at all and puts it back. The exact anchored-zoom arithmetic is
     * already measured against a real camera by
     * `tests/browser/world-scene-touch.spec.ts`.
     */
    const pitchSpan = Math.max(128, side - 96);
    const tilePixels = async (): Promise<string> => {
      const left = Math.round(probe.x - pitchSpan / 2);
      const right = Math.round(probe.x + pitchSpan / 2);
      await tapControl(page, '.hud-build__remove');
      await assertCanvasAt(page, left, probe.y, `${label} pitch probe a`);
      const a = (await touchPress(page, left, probe.y)).find((c) => c['type'] === 'RemoveObject');
      await assertCanvasAt(page, right, probe.y, `${label} pitch probe b`);
      const b = (await touchPress(page, right, probe.y)).find((c) => c['type'] === 'RemoveObject');
      await tapControl(page, '.hud-build__remove');
      if (a === undefined || b === undefined) throw new Error('pitch probe missed');
      const tiles = (b['x'] as number) - (a['x'] as number);
      return `${tiles} tile(s) across ${pitchSpan}px = ~${tiles === 0 ? '>span' : (pitchSpan / tiles).toFixed(0)}px per tile`;
    };

    const restTile = await tileUnderProbe();
    console.log(`[${label}] at rest: tile under the midpoint = ${JSON.stringify(restTile)}, ${await tilePixels()}`);

    // 1. One finger, nothing armed, wholly inside the unobstructed square.
    const inSquare = Math.round(side / 2 - 40);
    await touchDrag(client, page, { x: probe.x + inSquare, y: probe.y }, { x: probe.x - inSquare, y: probe.y });
    const afterOneFinger = await tileUnderProbe();
    console.log(
      `[${label}] one-finger drag of ${2 * inSquare}px leftward, entirely on canvas, no tool armed ->` +
        ` tile under the midpoint ${JSON.stringify(restTile)} -> ${JSON.stringify(afterOneFinger)}` +
        ` (a full pan would move it +${(2 * inSquare) / TILE} tiles in x)`,
    );

    // 2. The same drag, but the finger crosses onto the HUD rail on its way.
    //    Half the tablet screen is HUD, so this is the ordinary case, not an
    //    edge case: a player pushing the map left ends up over the rail.
    const beforeCross = await tileUnderProbe();
    const railX = await page.evaluate(() => {
      const rail = document.querySelector('.hud__aside') ?? document.querySelector('.hud__side');
      const rect = rail?.getBoundingClientRect();
      return rect === undefined ? -1 : Math.round(rect.left + Math.min(60, rect.width / 2));
    });
    console.log(`[${label}] the rail's left edge + 60px is x=${railX}; the drag below crosses it`);
    if (railX > 0) {
      await touchDrag(client, page, { x: probe.x - inSquare, y: probe.y }, { x: railX + 40, y: probe.y });
      const afterCross = await tileUnderProbe();
      console.log(
        `[${label}] one-finger drag of ${railX + 40 - (probe.x - inSquare)}px rightward that ends ON the HUD rail ->` +
          ` tile under the midpoint ${JSON.stringify(beforeCross)} -> ${JSON.stringify(afterCross)}` +
          ` (a full pan would move it -${((railX + 40 - (probe.x - inSquare)) / TILE).toFixed(1)} tiles in x)`,
      );
    }

    // 2b. The same again, vertically, ending under the status strip. This is
    //     the gesture whose first reading (before the square was used) came
    //     back about a third of what it was asked for, so it is measured on
    //     purpose rather than left as an anecdote.
    const beforeStrip = await tileUnderProbe();
    const stripBottom = await page.evaluate(() => {
      const rect = document.querySelector('.hud-strip')?.getBoundingClientRect();
      return rect === undefined ? -1 : Math.round(rect.bottom);
    });
    await touchDrag(client, page, { x: probe.x, y: probe.y }, { x: probe.x, y: Math.max(4, stripBottom - 40) });
    const afterStrip = await tileUnderProbe();
    console.log(
      `[${label}] one-finger drag of ${probe.y - Math.max(4, stripBottom - 40)}px upward, ending ON the status strip` +
        ` (its bottom edge is y=${stripBottom}) -> tile under the midpoint ${JSON.stringify(beforeStrip)} -> ${JSON.stringify(afterStrip)}` +
        ` (a full pan would move it +${((probe.y - Math.max(4, stripBottom - 40)) / TILE).toFixed(1)} tiles in y)`,
    );

    // 3. One finger with the wall tool armed: does it build instead of panning?
    await touchArm(page, 'wall-brick');
    const before = (await sentCommands(page)).length;
    await touchDrag(client, page, { x: probe.x - 96, y: probe.y }, { x: probe.x + 96, y: probe.y });
    const produced = (await sentCommands(page)).slice(before);
    console.log(`[${label}] one-finger drag while armed produced ${produced.length} command(s): ${JSON.stringify(produced.slice(0, 4))}`);
    await tapControl(page, '.hud-build__arm');

    // 4. Two fingers while armed: the hint promises this still moves the camera.
    // `tileUnderProbe` arms and disarms Remove, so the wall tool is re-armed
    // after it and the command counter is taken after that.
    const beforeArmedPan = await tileUnderProbe();
    await touchArm(page, 'wall-brick');
    const armedBefore = (await sentCommands(page)).length;
    await twoFingerPan(client, page, probe, { x: -inSquare, y: 0 }, 100);
    const armedProduced = (await sentCommands(page)).slice(armedBefore);
    await tapControl(page, '.hud-build__arm');
    const afterArmedPan = await tileUnderProbe();
    console.log(
      `[${label}] two-finger pan of ${inSquare}px while the wall tool is armed: ${armedProduced.length} build command(s),` +
        ` tile under the midpoint ${JSON.stringify(beforeArmedPan)} -> ${JSON.stringify(afterArmedPan)}`,
    );

    // 5. Pinch, about the midpoint, with both fingers inside the square.
    const wideGap = Math.min(240, side - 48);
    const narrowGap = Math.round(wideGap / 2.4);
    await pinch(client, page, probe, narrowGap, wideGap);
    console.log(`[${label}] pinch out ${narrowGap}->${wideGap}px (x${(wideGap / narrowGap).toFixed(2)}): ${await tilePixels()}`);
    await pinch(client, page, probe, wideGap, narrowGap);
    console.log(`[${label}] pinch back in ${wideGap}->${narrowGap}px: ${await tilePixels()}`);
    // And the clamp at the far end: eight pinches out in a row.
    for (let index = 0; index < 8; index += 1) await pinch(client, page, probe, narrowGap, wideGap);
    console.log(`[${label}] after eight more pinches out: ${await tilePixels()}`);
    for (let index = 0; index < 16; index += 1) await pinch(client, page, probe, wideGap, narrowGap);
    console.log(`[${label}] after sixteen pinches in: ${await tilePixels()}`);

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
    await tapControl(page, '.save-panel__button', { nth: 0 });
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

      /*
       * A control whose own box is inside the viewport but *outside the box of
       * the scroller it lives in* is the thing a finger cannot press: the row
       * is laid out, `getBoundingClientRect` answers happily, and a tap at that
       * point reaches whatever is painted there instead. Act 1 saw eight of
       * these on the Build tab and this is what they are.
       */
      const unreachable = await page.evaluate(() => {
        const scrollerOf = (node: HTMLElement): HTMLElement | null => {
          let parent = node.parentElement;
          while (parent !== null) {
            const style = getComputedStyle(parent);
            if (/auto|scroll|hidden/.test(style.overflowY) || /auto|scroll|hidden/.test(style.overflowX)) return parent;
            parent = parent.parentElement;
          }
          return null;
        };
        return [...document.querySelectorAll<HTMLElement>('.hud button, .hud input, .hud select, .save-panel button')]
          .filter((node) => node.getClientRects().length > 0)
          .map((node) => {
            const rect = node.getBoundingClientRect();
            const centre = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
            const top = document.elementFromPoint(centre.x, centre.y);
            const reached = top !== null && (top === node || node.contains(top));
            const scroller = scrollerOf(node);
            const clip = scroller?.getBoundingClientRect();
            return {
              selector: `${node.tagName.toLowerCase()}.${String(node.className).split(/\s+/)[0] ?? ''}`,
              text: (node.textContent ?? node.getAttribute('aria-label') ?? '').trim().slice(0, 28),
              reached,
              hitInstead: reached ? null : `${top?.tagName.toLowerCase() ?? 'null'}.${String((top as HTMLElement | null)?.className ?? '').split(/\s+/)[0] ?? ''}`,
              outsideScroller:
                clip === undefined ? null : centre.y < clip.top || centre.y > clip.bottom || centre.x < clip.left || centre.x > clip.right,
              scroller: scroller === null ? null : `${scroller.tagName.toLowerCase()}.${String(scroller.className).split(/\s+/)[0] ?? ''}`,
              scrollerCanScroll: scroller === null ? null : scroller.scrollHeight > scroller.clientHeight + 1,
            };
          })
          .filter((entry) => !entry.reached);
      });
      console.log(`[${label} · ${id}] controls a tap at their own centre does NOT reach: ${JSON.stringify(unreachable, null, 1)}`);

      // Can a finger scroll them into view? A real touch scroll gesture,
      // synthesised by the browser's own input pipeline.
      const scrollTargets = [...new Set(unreachable.map((entry) => entry.scroller).filter((s): s is string => s !== null))];
      for (const target of scrollTargets) {
        const box = await page.locator(target.replace('.', ' .').trim().split(' ').join('')).first().boundingBox().catch(() => null);
        const selector = target;
        const before = await page.evaluate((sel: string) => document.querySelector<HTMLElement>(sel)?.scrollTop ?? -1, selector);
        const centre = box === null ? null : { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        if (centre === null) continue;
        await page.context().newCDPSession(page).then(async (client) => {
          await client.send('Input.synthesizeScrollGesture', {
            x: centre.x,
            y: centre.y,
            yDistance: -240,
            gestureSourceType: 'touch',
            speed: 800,
          });
        });
        await page.waitForTimeout(400);
        const after = await page.evaluate((sel: string) => document.querySelector<HTMLElement>(sel)?.scrollTop ?? -1, selector);
        console.log(`[${label} · ${id}] one-finger scroll flick on ${selector}: scrollTop ${before} -> ${after}`);
      }
    }
  }
});

/* ================================================================== */
/* act 4 — the whole game, with fingers, landscape                     */
/* ================================================================== */

async function playTheGame(page: Page, client: CDPSession, label: string): Promise<void> {
  const log = (line: string): void => console.log(`[${label}] ${line}`);

  await tapControl(page, '.save-panel__button', { nth: 0 });
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  log('New prison: day reads 1');

  await tapControl(page, '.hud__tabs [data-tab="build"]');
  const reach = await measureReach(page);
  reportReach(`${label} build tab`, reach);
  const anchor = reach.freeSquareAt!;
  const origin = await touchCalibrate(page, { x: Math.round(anchor.x + 48), y: Math.round(anchor.y + 48) });
  log(`calibration: tile (0,0) top-left at (${origin.originX}, ${origin.originY})`);

  /*
   * Which tiles a finger can reach without moving the camera, and the biggest
   * square cell that fits among them.
   *
   * One `page.evaluate` over the whole grid rather than three per tile: the
   * first version of this made 4,800 round trips and took minutes. What it
   * answers is the load-bearing number of this act -- a wall run's two
   * endpoints must both be on canvas, so the size of the largest reachable
   * block is the size of the largest cell a touch player can draw in one go.
   */
  const grid = await page.evaluate(
    ([ox, oy, tile]: readonly number[]) => {
      const reachable: { x: number; y: number }[] = [];
      for (let ty = 0; ty < 48; ty += 1) {
        for (let tx = 0; tx < 48; tx += 1) {
          // The wall runs of a cell at (tx,ty) touch the tile's own top-left
          // corner as well as its centre, so both are required to be canvas.
          const cx = (ox as number) + tx * (tile as number) + (tile as number) / 2;
          const cy = (oy as number) + ty * (tile as number) + (tile as number) / 2;
          if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) continue;
          const node = document.elementFromPoint(cx, cy);
          if (node !== null && node.tagName === 'CANVAS') reachable.push({ x: tx, y: ty });
        }
      }
      const set = new Set(reachable.map((t) => `${t.x},${t.y}`));
      const fits = (x0: number, y0: number, size: number): boolean => {
        for (let dy = 0; dy <= size; dy += 1) for (let dx = 0; dx <= size; dx += 1) if (!set.has(`${x0 + dx},${y0 + dy}`)) return false;
        return true;
      };
      let bestSize = 0;
      let bestAt: { x0: number; y0: number } | null = null;
      for (const tile of reachable) {
        for (let size = bestSize + 1; size <= 12; size += 1) {
          if (!fits(tile.x, tile.y, size)) break;
          bestSize = size;
          bestAt = { x0: tile.x, y0: tile.y };
        }
      }
      return { reachable, bestSize, bestAt };
    },
    [origin.originX, origin.originY, TILE] as const,
  );
  const xs = grid.reachable.map((t) => t.x);
  const ys = grid.reachable.map((t) => t.y);
  log(
    `tiles a finger can reach without moving the camera: ${grid.reachable.length}` +
      ` spanning x ${Math.min(...xs)}..${Math.max(...xs)}, y ${Math.min(...ys)}..${Math.max(...ys)}`,
  );
  log(
    `the largest square cell whose every tile AND far wall a finger can reach in one camera position:` +
      ` ${grid.bestSize}x${grid.bestSize} at ${JSON.stringify(grid.bestAt)}` +
      ` (the harness's own starter cell, and the one every prior playtest builds, is 6x6)`,
  );
  expect(grid.bestAt, `${label}: no cell of any size fits in the canvas a finger can reach`).not.toBeNull();
  const cellSize = Math.min(6, grid.bestSize);
  const x0 = grid.bestAt!.x0;
  const y0 = grid.bestAt!.y0;
  log(`building a ${cellSize}x${cellSize} cell at tiles (${x0},${y0})-(${x0 + cellSize - 1},${y0 + cellSize - 1})`);

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
    await tapRowScrollingIfNeeded(page, '.hud-rooms__list [data-room="room.cell"]', label);
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
  if ((await guardRow.count()) > 0) await tapRowScrollingIfNeeded(page, '.hud-staff__list [data-staff-role="staff-role.guard"]', label);
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

  await tapControl(page, '.save-panel__button', { nth: 0 });
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tapControl(page, '.hud__tabs [data-tab="build"]');
  const reach = await measureReach(page);
  const origin = await touchCalibrate(page, { x: Math.round(reach.freeSquareAt!.x + 48), y: Math.round(reach.freeSquareAt!.y + 48) });
  log(`origin (${origin.originX}, ${origin.originY})`);

  // The tap-count cost of the stepper, which is the touch route that needs no
  // soft keyboard.
  await tapRowScrollingIfNeeded(page, '.hud-build__list [data-buildable="wall-brick"]', 'mistake');
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

/* ================================================================== */
/* act 7 — what the panel tells a finger while it is aiming            */
/* ================================================================== */

/**
 * The Build panel's **WHERE** readout, on a device with no hover.
 *
 * `world-scene.ts:585-588` says of the mouse path that keeps that readout fed:
 * *"Nothing is being built and no button is down: keep the ghost under the
 * cursor so the edge rule is legible before the first click. **Touch never
 * reaches here**, which is why the drag preview exists as well."* So the
 * question a player asks -- *which tile am I about to build on* -- is answered
 * before the press on a mouse and, on a finger, only during one. This act
 * reads the readout at four moments and prints all four.
 */
test('act 7: the WHERE readout, with no hover', async ({ page }) => {
  await installTee(page);
  const client = await page.context().newCDPSession(page);
  for (const [label, viewport] of [
    ['landscape 1024x768', LANDSCAPE],
    ['portrait 768x1024', PORTRAIT],
  ] as const) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openApp(page);
    await tapControl(page, '.save-panel__button', { nth: 0 });
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await tapControl(page, '.hud__tabs [data-tab="build"]');
    await page.waitForTimeout(400);
    const reach = await measureReach(page);
    const side = reach.largestFreeSquarePx;
    const mid = { x: Math.round(reach.freeSquareAt!.x + side / 2), y: Math.round(reach.freeSquareAt!.y + side / 2) };

    const where = async (): Promise<string> => panelText(page, '.hud-build__target');
    console.log(`\n[${label}] ===== WHERE =====`);
    console.log(`[${label}] before anything is armed: ${JSON.stringify(await where())}`);
    await touchArm(page, 'wall-brick');
    console.log(`[${label}] armed, finger not yet down: ${JSON.stringify(await where())}`);

    // A finger placed on the world and held still: the moment a mouse would
    // already have been showing a ghost for as long as the pointer was there.
    await assertCanvasAt(page, mid.x, mid.y, `${label} where probe`);
    await dispatch(client, 'touchStart', [{ id: 0, ...mid }]);
    await page.waitForTimeout(300);
    console.log(`[${label}] one finger down and still, no movement yet: ${JSON.stringify(await where())}`);
    for (let step = 1; step <= 4; step += 1) await dispatch(client, 'touchMove', [{ id: 0, x: mid.x + step * 32, y: mid.y }]);
    await page.waitForTimeout(200);
    console.log(`[${label}] mid-drag, 128px along: ${JSON.stringify(await where())}`);
    await dispatch(client, 'touchEnd', []);
    await page.waitForTimeout(400);
    console.log(`[${label}] after the finger lifts: ${JSON.stringify(await where())}`);
    console.log(`[${label}] the refusal band now: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
  }
});

/* ================================================================== */
/* act 8 — can a finger scroll the Build catalogue?                    */
/* ================================================================== */

/**
 * **The catalogue is a window a few rows tall onto a list many times taller,
 * and act 4 could not move it with a finger.** This act settles what is true.
 *
 * Four things are separated on purpose, because act 4's one failed flick could
 * be any of them:
 *
 * 1. **Geometry** -- how tall the box is and how tall its content is, folded
 *    and with the Buy disclosure open, at both viewports.
 * 2. **`touch-action`** -- the whole chain from a row up to `<html>`, read
 *    computed. `src/styles.css:22` puts `touch-action: none` on `html, body`
 *    and `src/ui/hud/hud.css:60-69` opts five HUD islands back in with
 *    `touch-action: auto`, saying *"HUD surfaces need normal touch behaviour
 *    so a control can be tapped and a list scrolled"*. Whether that reaches
 *    the list is the question.
 * 3. **Three different one-finger gestures** -- Chromium's own synthesised
 *    touch scroll, a raw `Input.dispatchTouchEvent` drag, and a slow raw drag
 *    with a pause after the first move (a real thumb is not instantaneous).
 * 4. **A programmatic `scrollBy`**, as the control: if that moves it, the box
 *    can scroll and only the *finger* cannot.
 */
test('act 8: can a finger scroll the Build catalogue', async ({ page }) => {
  const client = await page.context().newCDPSession(page);
  for (const [label, viewport] of [
    ['landscape 1024x768', LANDSCAPE],
    ['portrait 768x1024', PORTRAIT],
  ] as const) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openApp(page);
    await tapControl(page, '.save-panel__button', { nth: 0 });
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await tapControl(page, '.hud__tabs [data-tab="build"]');
    await page.waitForTimeout(400);
    console.log(`\n[${label}] ===== THE CATALOGUE =====`);

    const geometry = async (): Promise<string> =>
      page.evaluate(() => {
        const list = document.querySelector<HTMLElement>('.hud-build__list');
        if (list === null) return 'ABSENT';
        const rect = list.getBoundingClientRect();
        const rows = list.querySelectorAll('[data-buildable]').length;
        const visibleRows = [...list.querySelectorAll<HTMLElement>('[data-buildable]')].filter((row) => {
          const r = row.getBoundingClientRect();
          return r.top >= rect.top - 1 && r.bottom <= rect.bottom + 1;
        }).length;
        return JSON.stringify({
          box: `${Math.round(rect.width)}x${Math.round(rect.height)} at ${Math.round(rect.x)},${Math.round(rect.y)}`,
          clientHeight: list.clientHeight,
          scrollHeight: list.scrollHeight,
          rowsInList: rows,
          rowsWhollyInsideTheBox: visibleRows,
          overflowY: getComputedStyle(list).overflowY,
        });
      });

    console.log(`[${label}] catalogue with the Buy disclosure folded: ${await geometry()}`);
    await tapRowScrollingIfNeeded(page, '.hud-build__list [data-buildable="wall-brick"]', label);
    if (await page.locator('.hud-build__buy').isHidden()) await tapControl(page, '.hud-build__buy-toggle');
    await page.waitForTimeout(300);
    console.log(`[${label}] catalogue with the Buy disclosure OPEN: ${await geometry()}`);

    const chain = await page.evaluate(() => {
      const row = document.querySelector<HTMLElement>('.hud-build__list [data-buildable]');
      const out: { node: string; touchAction: string; overflowY: string }[] = [];
      let node: HTMLElement | null = row;
      while (node !== null) {
        const style = getComputedStyle(node);
        out.push({
          node: `${node.tagName.toLowerCase()}.${String(node.className).split(/\s+/)[0] ?? ''}`,
          touchAction: style.touchAction,
          overflowY: style.overflowY,
        });
        node = node.parentElement;
      }
      return out;
    });
    console.log(`[${label}] computed touch-action from a catalogue row up to <html>: ${JSON.stringify(chain, null, 1)}`);

    const listCentre = await page.evaluate(() => {
      const rect = document.querySelector<HTMLElement>('.hud-build__list')?.getBoundingClientRect();
      return rect === undefined ? null : { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
    });
    expect(listCentre).not.toBeNull();
    const readTop = async (): Promise<number> => page.evaluate(() => document.querySelector<HTMLElement>('.hud-build__list')?.scrollTop ?? -1);
    const reset = async (): Promise<void> => {
      await page.evaluate(() => {
        const list = document.querySelector<HTMLElement>('.hud-build__list');
        if (list !== null) list.scrollTop = 0;
      });
      await page.waitForTimeout(150);
    };
    console.log(`[${label}] the point every gesture below is aimed at is ${JSON.stringify(listCentre)}, on top of which sits ${await topAt(page, listCentre!.x, listCentre!.y)}`);

    // 1. Chromium's own synthesised touch scroll.
    await reset();
    await client.send('Input.synthesizeScrollGesture', { x: listCentre!.x, y: listCentre!.y, yDistance: -200, gestureSourceType: 'touch', speed: 800 });
    await page.waitForTimeout(500);
    console.log(`[${label}] synthesizeScrollGesture(touch, -200): scrollTop 0 -> ${await readTop()}`);

    // 2. A raw one-finger drag upward, ten steps, no pauses.
    await reset();
    await touchDrag(client, page, { x: listCentre!.x, y: listCentre!.y + 20 }, { x: listCentre!.x, y: listCentre!.y - 180 });
    console.log(`[${label}] a raw one-finger drag of 200px upward: scrollTop 0 -> ${await readTop()}`);

    // 3. The same, slowly, the way a thumb actually moves.
    await reset();
    await dispatch(client, 'touchStart', [{ id: 0, x: listCentre!.x, y: listCentre!.y + 20 }]);
    await page.waitForTimeout(80);
    for (let step = 1; step <= 10; step += 1) {
      await dispatch(client, 'touchMove', [{ id: 0, x: listCentre!.x, y: listCentre!.y + 20 - step * 20 }]);
      await page.waitForTimeout(30);
    }
    await dispatch(client, 'touchEnd', []);
    await page.waitForTimeout(400);
    console.log(`[${label}] a slow one-finger drag of 200px upward: scrollTop 0 -> ${await readTop()}`);

    // 4. The control: can the box scroll at all?
    await reset();
    await page.evaluate(() => document.querySelector<HTMLElement>('.hud-build__list')?.scrollBy({ top: 200 }));
    await page.waitForTimeout(250);
    console.log(`[${label}] scrollBy({top:200}) from script: scrollTop 0 -> ${await readTop()}`);

    // 5. And whether the two rows that ARE in the box are enough to play with:
    //    which buildables a finger can reach with no scrolling at all.
    await reset();
    const reachableRows = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.hud-build__list [data-buildable]')]
        .map((row) => {
          const rect = row.getBoundingClientRect();
          const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return {
            id: row.dataset['buildable'] ?? '?',
            reachable: top !== null && (top === row || row.contains(top)),
          };
        })
        .filter((entry) => entry.reachable)
        .map((entry) => entry.id),
    );
    const allRows = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.hud-build__list [data-buildable]')].map((row) => row.dataset['buildable'] ?? '?'),
    );
    console.log(`[${label}] of ${allRows.length} catalogue rows a finger can tap ${reachableRows.length}: ${JSON.stringify(reachableRows)}`);

    // 6. The same question for the Rooms catalogue, which is the other list a
    //    player has to get a specific row out of.
    await tapControl(page, '.hud__tabs [data-tab="rooms"]');
    await page.waitForTimeout(400);
    const roomsGeometry = await page.evaluate(() => {
      const list = document.querySelector<HTMLElement>('.hud-rooms__list');
      if (list === null) return 'ABSENT';
      const rows = [...list.querySelectorAll<HTMLElement>('[data-room]')];
      const reachable = rows.filter((row) => {
        const rect = row.getBoundingClientRect();
        const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return top !== null && (top === row || row.contains(top));
      });
      return JSON.stringify({
        clientHeight: list.clientHeight,
        scrollHeight: list.scrollHeight,
        rows: rows.length,
        tappable: reachable.length,
        tappableIds: reachable.map((row) => row.dataset['room']),
      });
    });
    console.log(`[${label}] the Rooms catalogue: ${roomsGeometry}`);
    const roomsCentre = await page.evaluate(() => {
      const rect = document.querySelector<HTMLElement>('.hud-rooms__list')?.getBoundingClientRect();
      return rect === undefined ? null : { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
    });
    if (roomsCentre !== null) {
      await client.send('Input.synthesizeScrollGesture', { x: roomsCentre.x, y: roomsCentre.y, yDistance: -200, gestureSourceType: 'touch', speed: 800 });
      await page.waitForTimeout(500);
      console.log(
        `[${label}] a finger flick on the Rooms catalogue: scrollTop -> ` +
          `${await page.evaluate(() => document.querySelector<HTMLElement>('.hud-rooms__list')?.scrollTop ?? -1)}`,
      );
    }
  }
});

/* ================================================================== */
/* act 9 — why the flick does not take                                 */
/* ================================================================== */

/**
 * **The discriminating experiment for act 8's split result.**
 *
 * Act 8 measured two one-finger scrolls of the same list disagreeing:
 * Chromium's own `Input.synthesizeScrollGesture` with `gestureSourceType:
 * 'touch'` moved `.hud-build__list` by 0, and a raw
 * `Input.dispatchTouchEvent` drag moved it by 185. One of those two matches a
 * thumb and the other does not, and the difference decides whether a tablet
 * player can reach 19 of the catalogue's 21 rows.
 *
 * The hypothesis is `touch-action`, and it is a claim about *the spec's
 * intersection rule* rather than about any one browser: an element's effective
 * touch-action is the intersection of its own value with every ancestor's, so
 * a descendant `auto` **cannot** re-permit what an ancestor `none` forbade.
 * `src/styles.css:22` sets `touch-action: none` on `html, body`, and
 * `src/ui/hud/hud.css:60-69` sets `touch-action: auto` on five HUD islands
 * under the comment *"The page sets `touch-action: none` for the world; HUD
 * surfaces need normal touch behaviour so a control can be tapped and **a list
 * scrolled**"*. If the rule is what it is, that opt-in does nothing.
 *
 * The experiment: run the identical synthesised flick twice, once as shipped
 * and once with `html`/`body` relaxed to `touch-action: auto` from the test.
 * Nothing else changes. If the second scrolls and the first does not, the
 * cause is established and the raw-dispatch reading is the instrument
 * artifact.
 */
test('act 9: is it touch-action that stops the flick', async ({ page }) => {
  const client = await page.context().newCDPSession(page);
  await page.setViewportSize(LANDSCAPE);
  await openApp(page);
  await tapControl(page, '.save-panel__button', { nth: 0 });
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tapControl(page, '.hud__tabs [data-tab="build"]');
  await page.waitForTimeout(400);

  const centre = await page.evaluate(() => {
    const rect = document.querySelector<HTMLElement>('.hud-build__list')?.getBoundingClientRect();
    return rect === undefined ? null : { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
  });
  expect(centre).not.toBeNull();
  const readTop = async (): Promise<number> => page.evaluate(() => document.querySelector<HTMLElement>('.hud-build__list')?.scrollTop ?? -1);
  const reset = async (): Promise<void> => {
    await page.evaluate(() => {
      const list = document.querySelector<HTMLElement>('.hud-build__list');
      if (list !== null) list.scrollTop = 0;
    });
    await page.waitForTimeout(150);
  };
  const flick = async (): Promise<number> => {
    await reset();
    await client.send('Input.synthesizeScrollGesture', { x: centre!.x, y: centre!.y, yDistance: -200, gestureSourceType: 'touch', speed: 800 });
    await page.waitForTimeout(600);
    return readTop();
  };

  console.log('\n[touch-action] ===== THE DISCRIMINATOR =====');
  console.log(`[touch-action] as shipped, html/body touch-action = ${await page.evaluate(() => `${getComputedStyle(document.documentElement).touchAction}/${getComputedStyle(document.body).touchAction}`)}`);
  console.log(`[touch-action] synthesised finger flick as shipped: scrollTop 0 -> ${await flick()}`);

  await page.evaluate(() => {
    document.documentElement.style.touchAction = 'auto';
    document.body.style.touchAction = 'auto';
  });
  await page.waitForTimeout(200);
  console.log(`[touch-action] with html/body relaxed to auto (TEST-ONLY, nothing under src/ changed): scrollTop 0 -> ${await flick()}`);

  await page.evaluate(() => {
    document.documentElement.style.touchAction = '';
    document.body.style.touchAction = 'none';
  });
  await page.waitForTimeout(200);
  console.log(`[touch-action] put back to none: scrollTop 0 -> ${await flick()}`);

  /*
   * The hypothesis above came back **refuted** -- relaxing html/body changed
   * nothing -- which leaves `synthesizeScrollGesture` inert in this
   * environment rather than blocked, and puts the whole weight on the raw
   * `dispatchTouchEvent` drag that *did* scroll the list by 185.
   *
   * So: does that raw drag respect `touch-action` at all? If it scrolls a list
   * whose own `touch-action` is `none`, it is ignoring the property and cannot
   * be used to conclude anything about a real thumb either. This is the second
   * discriminator, and between them they decide whether act 8's split result
   * is a defect in the game or two instruments that disagree for reasons of
   * their own.
   */
  const rawDrag = async (): Promise<number> => {
    await reset();
    await dispatch(client, 'touchStart', [{ id: 0, x: centre!.x, y: centre!.y + 20 }]);
    for (let step = 1; step <= 10; step += 1) await dispatch(client, 'touchMove', [{ id: 0, x: centre!.x, y: centre!.y + 20 - step * 20 }]);
    await dispatch(client, 'touchEnd', []);
    await page.waitForTimeout(400);
    return readTop();
  };
  console.log(`[touch-action] a raw one-finger drag, as shipped: scrollTop 0 -> ${await rawDrag()}`);
  await page.evaluate(() => {
    const list = document.querySelector<HTMLElement>('.hud-build__list');
    if (list !== null) list.style.touchAction = 'none';
  });
  await page.waitForTimeout(200);
  console.log(`[touch-action] the same raw drag with the LIST ITSELF set to touch-action: none: scrollTop 0 -> ${await rawDrag()}`);
  await page.evaluate(() => {
    const list = document.querySelector<HTMLElement>('.hud-build__list');
    if (list !== null) list.style.touchAction = '';
  });
  await page.waitForTimeout(200);
  console.log(`[touch-action] and with it put back: scrollTop 0 -> ${await rawDrag()}`);

  // And the same readings for the page's other two scroll containers,
  // because whatever is true of the catalogue is true of them.
  for (const selector of ['.save-panel', '.ui-panel.hud-build']) {
    const box = await page.evaluate((sel: string) => {
      const node = document.querySelector<HTMLElement>(sel);
      if (node === null) return null;
      const rect = node.getBoundingClientRect();
      return {
        x: Math.round(rect.x + rect.width / 2),
        y: Math.round(rect.y + rect.height / 2),
        scrollHeight: node.scrollHeight,
        clientHeight: node.clientHeight,
      };
    }, selector);
    if (box === null || box.scrollHeight <= box.clientHeight + 1) {
      console.log(`[touch-action] ${selector}: nothing to scroll (${JSON.stringify(box)})`);
      continue;
    }
    await client.send('Input.synthesizeScrollGesture', { x: box.x, y: box.y, yDistance: -150, gestureSourceType: 'touch', speed: 800 });
    await page.waitForTimeout(500);
    const after = await page.evaluate((sel: string) => document.querySelector<HTMLElement>(sel)?.scrollTop ?? -1, selector);
    console.log(`[touch-action] a finger flick on ${selector} (${box.scrollHeight} of content in ${box.clientHeight}): scrollTop -> ${after}`);
  }
});
