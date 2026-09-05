import { inflateSync } from 'node:zlib';
import { expect, type Page, test } from '@playwright/test';
import { TILE, installTee, openApp, panelText, press, tab } from './playtest-harness';

/**
 * **Getting lost: a player drags the world to look around, and keeps dragging.**
 *
 * An *instrument*, not a gate. `tests/browser/playwright.config.ts` collects
 * `*.spec.ts`; this file is `*.playtest.ts` and only
 * `tests/browser/playwright.playtest.config.ts` collects it, so nothing in CI
 * runs it. One act at a time:
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5327 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-2026-09-05-getting-lost.playtest.ts -g "act 1"
 * ```
 *
 * **The question, as given.** Can a player pan far enough that they cannot
 * find their prison again, and does anything on the screen bring them back?
 * `docs/research/2026-09-02-the-world-view.md` §2-§3 is the baseline: at
 * v0.0.344 the pan had no clamp, the minimap took clicks and did nothing, and
 * the far end of a four-drag pan was solid `VOID_COLOR`. Both of those became
 * issues (#794, #793) and **#793 has since been implemented** --
 * `WorldScene.navigateToMinimapPoint` and the `onMinimapNavigate` wiring at
 * `src/main.ts:2106` -- so this pass re-derives both rather than inheriting
 * either, and then asks the questions that record did not: every zoom level,
 * the edges, and what a reload or a prison switch does to the view.
 *
 * **No wall-clock timing claim is made anywhere in this file.** Every camera
 * movement is driven by a fixed *pixel* distance dispatched as one synthetic
 * `mousemove` (the world-view record's own instrument fix 2: an OS-level
 * multi-step drag is coalesced under load and is not the deterministic
 * gesture it looks like), or by a *counted* number of discrete zoom
 * keypresses. The continuous keyboard pan in `update()` is frame-time driven
 * and is therefore only ever cited as a READ fact, never used to produce a
 * number.
 *
 * **Every camera readout here is taken from the running game**, by pressing
 * the world with the Build panel's `Remove` tool armed and reading the tile
 * the resulting `RemoveObject` command names. There is no debug hook for
 * camera position on the assembled page -- `app-shell.spec.ts:4515` says so in
 * those words -- so this is the only honest instrument, and it has the useful
 * property of answering in the game's own screen->tile transform rather than
 * in one this file reimplements.
 */

const SHOTS = 'docs/research/2026-09-05-getting-lost';

const log = (act: string, line: string): void => {
  console.log(`[${act}] ${line}`);
};

/**
 * `VOID_COLOR`, `src/rendering/world/appearance.ts:45`.
 *
 * Not a tile fill: it is the Phaser camera's background colour
 * (`world-scene.ts:317`) showing through wherever `TileLayer` draws nothing.
 * A screen made entirely of it is a screen with no world on it at all.
 */
const VOID_RGB = { r: 0x0b, g: 0x0e, b: 0x12 } as const;

/** A fresh session owns exactly chunk (0,0): tiles 0..31 on both axes. */
const OWNED_TILE_MIN = 0;
const OWNED_TILE_MAX = 31;

/** `NEW_PRISON_ORIGIN_TILE`, `src/main.ts:621` -- where staff and prisoners arrive. */
const PRISON_ORIGIN_TILE = { x: 16, y: 16 } as const;

// ------------------------------------------------------------------
// Instruments
// ------------------------------------------------------------------

/**
 * A middle-button drag, dispatched **synchronously in the page**.
 *
 * Verbatim in idiom from `playtest-2026-09-02-the-world-view.playtest.ts:245`,
 * whose own record explains why: an OS-level `page.mouse.down/move({steps})/up`
 * is coalesced by CDP under load and measured shifts of `-800, +666, 0, +666`
 * for four identical 800px drags. One `mousedown`, one `mousemove` to the
 * final point, one `mouseup`, straight at the canvas, has no input queue to
 * coalesce against.
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
  await page.waitForTimeout(40);
}

/** `document.elementsFromPoint`, topmost first, with just enough to identify each node. */
async function elementsAt(page: Page, x: number, y: number): Promise<readonly Record<string, unknown>[]> {
  return page.evaluate(
    ([px, py]) =>
      document.elementsFromPoint(px, py).map((el) => ({
        tag: el.tagName,
        cls: typeof el.className === 'string' ? el.className : '',
        pointerEvents: getComputedStyle(el).pointerEvents,
      })),
    [x, y] as const,
  );
}

/**
 * Arms the Build panel's `Remove` tool and leaves it armed.
 *
 * `calibrate()` in the shared harness arms and disarms around every
 * bisection; this pass takes dozens of single readings instead of a few
 * bisections, so the toggling is hoisted out. The tool is disarmed by
 * `disarmProbe` at the end of each measurement block.
 */
async function armProbe(page: Page): Promise<void> {
  await tab(page, 'build').click();
  const removeControl = page.locator('.hud-build__remove');
  const label = (await removeControl.innerText()).trim().toLowerCase();
  // The control is a toggle whose label says which way it will go. Only press
  // it if it is currently off, so a second call in the same act is a no-op
  // rather than a disarm.
  if (!label.startsWith('stop') && !label.startsWith('done')) await removeControl.click();
}

async function disarmProbe(page: Page): Promise<void> {
  await page.locator('.hud-build__remove').click();
}

/**
 * Which world tile the game itself thinks is under a screen point.
 *
 * With the `Remove` tool armed a press submits a `RemoveObject` carrying the
 * tile it resolved -- so this is the *game's* screen->tile transform read back,
 * not one this file recomputes. Returns `undefined` when the press produced no
 * such command, which is itself information (a press that landed on a HUD
 * panel, or a press the world refused to resolve at all).
 */
async function probeTile(page: Page, x: number, y: number): Promise<{ x: number; y: number } | undefined> {
  const commands = await press(page, x, y);
  const removal = commands.find((c) => c['type'] === 'RemoveObject');
  if (removal === undefined) return undefined;
  return { x: removal['x'] as number, y: removal['y'] as number };
}

/**
 * The visible tile rectangle, measured by probing the four extreme points of
 * the canvas that a pointer can actually reach.
 *
 * **Why not the corners of the canvas rect.** The HUD covers 26-44% of the
 * canvas (`docs/research/2026-09-02-the-world-view.md` §0) and every corner of
 * it is behind a panel, so a press there produces no command at all. This
 * walks inward from each edge until `elementFromPoint` says the canvas is on
 * top, and reports which point it actually used.
 */
async function visibleTileBox(page: Page): Promise<{
  readonly left: number; readonly top: number; readonly right: number; readonly bottom: number;
  readonly probes: readonly { readonly label: string; readonly x: number; readonly y: number; readonly tile: { x: number; y: number } }[];
} | undefined> {
  const canvas = await page.evaluate(() => {
    const el = document.querySelector('canvas');
    if (el === null) return undefined;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  });
  if (canvas === undefined) throw new Error('no canvas on the page');

  const freePointNear = async (
    startX: number, startY: number, stepX: number, stepY: number,
  ): Promise<{ x: number; y: number } | undefined> => {
    for (let i = 0; i < 60; i += 1) {
      const x = startX + stepX * i;
      const y = startY + stepY * i;
      if (x < canvas.left || x > canvas.right || y < canvas.top || y > canvas.bottom) return undefined;
      const top = await page.evaluate(
        ([px, py]) => {
          const el = document.elementFromPoint(px, py);
          return el === null ? 'NONE' : el.tagName;
        },
        [x, y] as const,
      );
      if (top === 'CANVAS') return { x, y };
    }
    return undefined;
  };

  const midY = (canvas.top + canvas.bottom) / 2;
  const midX = (canvas.left + canvas.right) / 2;
  const corners = [
    { label: 'leftmost', p: await freePointNear(canvas.left + 2, midY, 12, 0) },
    { label: 'rightmost', p: await freePointNear(canvas.right - 2, midY, -12, 0) },
    { label: 'topmost', p: await freePointNear(midX, canvas.top + 2, 0, 12) },
    { label: 'bottommost', p: await freePointNear(midX, canvas.bottom - 2, 0, -12) },
  ];

  const probes: { label: string; x: number; y: number; tile: { x: number; y: number } }[] = [];
  for (const corner of corners) {
    if (corner.p === undefined) return undefined;
    const tile = await probeTile(page, corner.p.x, corner.p.y);
    if (tile === undefined) return undefined;
    probes.push({ label: corner.label, x: corner.p.x, y: corner.p.y, tile });
  }
  const [left, right, top, bottom] = probes;
  if (left === undefined || right === undefined || top === undefined || bottom === undefined) return undefined;
  return { left: left.tile.x, right: right.tile.x, top: top.tile.y, bottom: bottom.tile.y, probes };
}

/**
 * The longest horizontal run of bare canvas at a given screen row.
 *
 * **Written after this instrument's first run failed on a hard-coded point.**
 * `(1200, 300)` at 1440x900 resolves to `HEADER`, not `CANVAS` -- the Build
 * rail's own panel header -- so the drag it was the start of would have been
 * delivered to a HUD panel and the camera would not have moved, which reads
 * exactly like "panning is clamped". The brief's own rule (*prove your presses
 * land*) applies to drags too, and the durable form of it is to find the free
 * span rather than to guess a point inside it.
 */
async function freeCanvasRun(page: Page, y: number): Promise<{ readonly from: number; readonly to: number }> {
  const run = await page.evaluate((row) => {
    const canvas = document.querySelector('canvas');
    if (canvas === null) return undefined;
    const rect = canvas.getBoundingClientRect();
    let best = { from: 0, to: 0 };
    let start: number | undefined;
    for (let x = Math.ceil(rect.left) + 1; x < rect.right - 1; x += 4) {
      const free = document.elementFromPoint(x, row)?.tagName === 'CANVAS';
      if (free && start === undefined) start = x;
      if (!free && start !== undefined) {
        if (x - start > best.to - best.from) best = { from: start, to: x - 4 };
        start = undefined;
      }
    }
    if (start !== undefined && rect.right - start > best.to - best.from) best = { from: start, to: Math.floor(rect.right) - 2 };
    return best;
  }, y);
  if (run === undefined || run.to - run.from < 100) throw new Error(`no usable free canvas run at y=${String(y)}: ${JSON.stringify(run)}`);
  return run;
}

/** Does any tile of the owned chunk fall inside the visible tile box? */
function ownedLandVisible(box: { left: number; top: number; right: number; bottom: number }): boolean {
  return box.right >= OWNED_TILE_MIN && box.left <= OWNED_TILE_MAX && box.bottom >= OWNED_TILE_MIN && box.top <= OWNED_TILE_MAX;
}

/**
 * Screen pixels per tile, measured from two probes far apart on the same row.
 *
 * The camera's zoom is `screen px per world unit` and a tile is
 * `TILE_SIZE_PX = 64` world units (`src/rendering/tile-metrics.ts:21`), so
 * this is `64 * zoom` read off the running game rather than assumed from the
 * number of keypresses sent. Whole-tile readings make it approximate; the
 * baseline is deliberately wide so the error is about one part in the tile
 * count.
 */
async function measureTilePx(page: Page, leftX: number, rightX: number, y: number): Promise<number | undefined> {
  const a = await probeTile(page, leftX, y);
  const b = await probeTile(page, rightX, y);
  if (a === undefined || b === undefined || b.x - a.x < 2) return undefined;

  /*
   * Two *boundaries* rather than two samples.
   *
   * A pair of whole-tile readings divided by the pixels between them is wrong
   * by up to one tile in the count -- at zoom 1 over an 800px baseline it read
   * 61.54 where the truth is 64, a 4% error, because both endpoints sit at an
   * unknown fraction into their tile. Bisecting for the exact screen x at
   * which the tile index first changes removes both fractions: the distance
   * between two boundaries is a whole number of tiles by construction.
   */
  const firstXWithTileAtLeast = async (target: number, lo: number, hi: number): Promise<number | undefined> => {
    let low = lo;
    let high = hi;
    while (high - low > 1) {
      const mid = Math.floor((low + high) / 2);
      const tile = await probeTile(page, mid, y);
      if (tile === undefined) return undefined;
      if (tile.x >= target) high = mid;
      else low = mid;
    }
    return high;
  };
  const firstBoundary = await firstXWithTileAtLeast(a.x + 1, leftX, rightX);
  const lastBoundary = await firstXWithTileAtLeast(b.x, leftX, rightX);
  if (firstBoundary === undefined || lastBoundary === undefined || b.x - (a.x + 1) < 1) return undefined;
  return (lastBoundary - firstBoundary) / (b.x - (a.x + 1));
}

/** `measureTilePx` across the widest free canvas run at `y`, so no point is behind a panel. */
async function measuredTilePx(page: Page, y = 300): Promise<number | undefined> {
  const run = await freeCanvasRun(page, y);
  return measureTilePx(page, run.from + 20, run.to - 20, y);
}

/** A 800px-or-as-much-as-fits westward stroke on the widest free canvas run at `y`. */
async function strokeEndpoints(page: Page, y = 300, distance = 800): Promise<{ readonly from: { x: number; y: number }; readonly to: { x: number; y: number }; readonly distance: number }> {
  const run = await freeCanvasRun(page, y);
  const width = Math.min(distance, run.to - run.from - 20);
  return { from: { x: run.to - 10, y }, to: { x: run.to - 10 - width, y }, distance: width };
}

// ---- pixels -------------------------------------------------------
//
// A minimal PNG reader, because the question "is the screen black" cannot be
// answered from the DOM and this container has no resolvable image library
// (`require('sharp')` throws here). Playwright screenshots are 8-bit
// non-interlaced PNGs, colour type 6 (RGBA) or 2 (RGB); nothing else is
// handled and an unexpected header throws rather than guessing.

interface Bitmap {
  readonly width: number;
  readonly height: number;
  readonly channels: number;
  readonly data: Buffer;
}

function decodePng(buffer: Buffer): Bitmap {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Buffer[] = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const bitDepth = body.readUInt8(8);
      const colorType = body.readUInt8(9);
      const interlace = body.readUInt8(12);
      if (bitDepth !== 8 || interlace !== 0) throw new Error(`unsupported PNG: depth ${String(bitDepth)}, interlace ${String(interlace)}`);
      if (colorType === 6) channels = 4;
      else if (colorType === 2) channels = 3;
      else throw new Error(`unsupported PNG colour type ${String(colorType)}`);
    } else if (type === 'IDAT') idat.push(Buffer.from(body));
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(stride * height);
  let pos = 0;
  for (let row = 0; row < height; row += 1) {
    const filter = raw[pos];
    pos += 1;
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const target = out.subarray(row * stride, (row + 1) * stride);
    const previous = row === 0 ? undefined : out.subarray((row - 1) * stride, row * stride);
    for (let i = 0; i < stride; i += 1) {
      const x = line[i] ?? 0;
      const a = i >= channels ? (target[i - channels] ?? 0) : 0;
      const b = previous?.[i] ?? 0;
      const c = i >= channels ? (previous?.[i - channels] ?? 0) : 0;
      let value: number;
      switch (filter) {
        case 0: value = x; break;
        case 1: value = x + a; break;
        case 2: value = x + b; break;
        case 3: value = x + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          value = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`unknown PNG filter ${String(filter)}`);
      }
      target[i] = value & 0xff;
    }
  }
  return { width, height, channels, data: out };
}

function pixelAt(bitmap: Bitmap, x: number, y: number): { r: number; g: number; b: number } {
  const px = Math.max(0, Math.min(bitmap.width - 1, Math.round(x)));
  const py = Math.max(0, Math.min(bitmap.height - 1, Math.round(y)));
  const index = (py * bitmap.width + px) * bitmap.channels;
  return { r: bitmap.data[index] ?? 0, g: bitmap.data[index + 1] ?? 0, b: bitmap.data[index + 2] ?? 0 };
}

/**
 * Samples the canvas on an 80px grid, skipping every point a HUD element
 * covers, and reports how many samples are exactly `VOID_COLOR`.
 *
 * The HUD skip matters: the panels are not void-coloured, so counting them
 * would make "the screen is black" unprovable at any camera position.
 */
async function sampleWorldPixels(page: Page, shotPath: string): Promise<{
  readonly total: number; readonly void: number; readonly others: readonly string[]; readonly nonVoidPoints: readonly string[];
}> {
  const points = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (canvas === null) return [] as { x: number; y: number }[];
    const rect = canvas.getBoundingClientRect();
    /*
     * Two filters, and the second one was paid for.
     *
     * `elementFromPoint` alone is not enough: it *skips* every element with
     * `pointer-events: none`, and `.hud__refusal` and `.hud__event` are
     * exactly that (`hud.css`: "`pointer-events` stays `none` (inherited from
     * `.hud`): the line carries no" -- three times over). They still paint.
     * Act 2's first run reported a stubborn 18 of 131 samples at one non-void
     * colour with the owned chunk demonstrably off screen, and every one of
     * them was on the single screen row y=100, under the amber refusal band
     * this instrument's own probe presses had raised. So the geometry of the
     * HUD's own island list is excluded as well as its hit-testing.
     */
    const painted = [...document.querySelectorAll('.hud-strip, .hud__corner > *, .hud__aside > *, .hud__side > *, .hud-tabs__inner, .hud__refusal, .hud__event, .save-panel, .display-scale')]
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => el.getBoundingClientRect());
    const collected: { x: number; y: number }[] = [];
    for (let y = rect.top + 20; y < rect.bottom - 20; y += 80) {
      for (let x = rect.left + 20; x < rect.right - 20; x += 80) {
        if (document.elementFromPoint(x, y)?.tagName !== 'CANVAS') continue;
        if (painted.some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)) continue;
        collected.push({ x, y });
      }
    }
    return collected;
  });
  const buffer = await page.screenshot({ path: shotPath });
  const bitmap = decodePng(buffer);
  let voids = 0;
  const others = new Map<string, number>();
  const nonVoid: string[] = [];
  for (const point of points) {
    const pixel = pixelAt(bitmap, point.x, point.y);
    if (pixel.r === VOID_RGB.r && pixel.g === VOID_RGB.g && pixel.b === VOID_RGB.b) voids += 1;
    else {
      const key = `${String(pixel.r)},${String(pixel.g)},${String(pixel.b)}`;
      others.set(key, (others.get(key) ?? 0) + 1);
      nonVoid.push(`(${String(Math.round(point.x))},${String(Math.round(point.y))})=${key}`);
    }
  }
  return {
    total: points.length,
    void: voids,
    others: [...others.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k} x${String(n)}`),
    // Where the non-void samples actually are. Added after act 2's first run
    // reported a stubborn 18 of 131 samples at one exact non-void colour with
    // the owned chunk demonstrably off screen: a count alone could not say
    // whether that was world or chrome, and "the screen is black" rests on
    // the difference.
    nonVoidPoints: nonVoid.slice(0, 10),
  };
}

/** Every visible control on the page, by tag, class and trimmed text. */
async function controlInventory(page: Page): Promise<readonly string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('button, [role="button"], a[href]')]
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => {
        const cls = typeof el.className === 'string' ? el.className : '';
        const text = (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim();
        const label = el.getAttribute('aria-label') ?? '';
        const title = el.getAttribute('title') ?? '';
        return `${el.tagName}.${cls}|text="${text}"|aria="${label}"|title="${title}"`;
      }),
  );
}

async function newPrison(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
}

/** The strip's own version line, so every act says which build it played. */
async function versionLine(page: Page): Promise<string> {
  return page.evaluate(() => {
    const strip = document.querySelector<HTMLElement>('.hud-strip');
    const text = strip?.innerText ?? '';
    return (/v\d+\.\d+\.\d+\s*·?\s*[0-9a-f]{7}/.exec(text) ?? ['no version line found'])[0];
  });
}

// ------------------------------------------------------------------
// Act 1 -- arrival: where the camera starts, what the screen offers, and
// whether anything on it is a way home.
// ------------------------------------------------------------------
test('act 1: arrival, and the complete inventory of what the screen offers a lost player', async ({ page }) => {
  test.setTimeout(240_000);
  await installTee(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await newPrison(page);
  log('act1', `version line: ${await versionLine(page)}`);

  // A landmark at the prison's own origin tile, so "the prison" is a thing on
  // screen and not only an ownership shade: a hired guard first stands at
  // `NEW_PRISON_ORIGIN_TILE` (`src/main.ts:621`, ADR 0025 decision 4).
  await tab(page, 'security').click();
  const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
  if ((await guardRow.count()) > 0) await guardRow.first().click();
  await page.locator('.hud-staff__hire').click();
  await page.waitForTimeout(1200);
  log('act1', `after one hire, staff panel says: ${JSON.stringify(await panelText(page, '.hud-staff'))}`);

  const canvasRect = await page.evaluate(() => {
    const r = document.querySelector('canvas')?.getBoundingClientRect();
    return r === undefined ? undefined : { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  log('act1', `canvas rect: ${JSON.stringify(canvasRect)}`);

  const minimapRect = await page.evaluate(() => {
    const panel = document.querySelector('.hud-minimap');
    const surface = document.querySelector('.hud-minimap__surface');
    const box = (el: Element | null) => {
      if (el === null) return undefined;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    };
    return { panel: box(panel), surface: box(surface), viewport: { w: window.innerWidth, h: window.innerHeight } };
  });
  const panelArea = (minimapRect.panel?.w ?? 0) * (minimapRect.panel?.h ?? 0);
  const viewportArea = minimapRect.viewport.w * minimapRect.viewport.h;
  log('act1', `.hud-minimap panel ${JSON.stringify(minimapRect.panel)} = ${(100 * panelArea / viewportArea).toFixed(2)}% of the ${String(minimapRect.viewport.w)}x${String(minimapRect.viewport.h)} viewport`);
  log('act1', `.hud-minimap__surface ${JSON.stringify(minimapRect.surface)}`);
  log('act1', `minimap panel innerText: ${JSON.stringify(await panelText(page, '.hud-minimap'))}`);

  // The brief carries a figure measured in the last twenty-four hours -- the
  // minimap panel at 17% of the viewport -- without the viewport it was taken
  // at. Its own footprint is fixed in CSS pixels (#775, and
  // `docs/research/2026-09-02-the-world-view.md` §0 measured 398x372 unchanged
  // across four viewports), so the *fraction* is a function of the viewport
  // alone and is swept here rather than quoted.
  for (const size of [{ width: 900, height: 600 }, { width: 1280, height: 720 }, { width: 1280, height: 800 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(250);
    const reading = await page.evaluate(() => {
      const el = document.querySelector('.hud-minimap');
      if (el === null) return undefined;
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height, vw: window.innerWidth, vh: window.innerHeight };
    });
    if (reading === undefined) { log('act1', `  ${String(size.width)}x${String(size.height)}: .hud-minimap ABSENT`); continue; }
    log('act1', `  ${String(size.width)}x${String(size.height)}: .hud-minimap ${reading.w.toFixed(1)}x${reading.h.toFixed(1)} = ${(100 * reading.w * reading.h / (reading.vw * reading.vh)).toFixed(2)}% of the viewport`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);

  // Every control the player can see, on every tab. The question "is there a
  // way back" is answered by this list or it is not answered at all.
  for (const id of ['overview', 'build', 'rooms', 'security', 'regime'] as const) {
    await tab(page, id).click();
    await page.waitForTimeout(250);
    const controls = await controlInventory(page);
    log('act1', `--- ${id} tab: ${String(controls.length)} visible controls`);
    for (const control of controls) log('act1', `    ${control}`);
    const minimapOnThisTab = await page.evaluate(() => {
      const el = document.querySelector('.hud-minimap');
      if (el === null) return 'ABSENT';
      const r = el.getBoundingClientRect();
      return `${String(Math.round(r.width))}x${String(Math.round(r.height))} at ${String(Math.round(r.x))},${String(Math.round(r.y))}`;
    });
    log('act1', `    .hud-minimap on ${id}: ${minimapOnThisTab}`);
  }

  await tab(page, 'build').click();
  await armProbe(page);
  const box = await visibleTileBox(page);
  log('act1', `visible tile box on arrival: ${JSON.stringify(box)}`);
  log('act1', `owned chunk (tiles 0..31) visible on arrival: ${String(box === undefined ? 'unknown' : ownedLandVisible(box))}`);
  const tilePx = await measuredTilePx(page);
  log('act1', `measured screen px per tile on arrival: ${tilePx === undefined ? 'unknown' : tilePx.toFixed(2)} (zoom = ${tilePx === undefined ? '?' : (tilePx / TILE).toFixed(3)})`);
  await disarmProbe(page);

  const pixels = await sampleWorldPixels(page, `${SHOTS}/act1-arrival.png`);
  log('act1', `arrival pixels: ${String(pixels.void)}/${String(pixels.total)} sampled world points are exactly VOID_COLOR; other colours: ${JSON.stringify(pixels.others)}`);
});

// ------------------------------------------------------------------
// Act 2 -- get lost on purpose, at zoom 1: how many drags, and what is on
// the screen when it has happened.
// ------------------------------------------------------------------
test('act 2: how many drags it takes to lose the prison at zoom 1, and what is on the screen then', async ({ page }) => {
  test.setTimeout(300_000);
  await installTee(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await newPrison(page);
  log('act2', `version line: ${await versionLine(page)}`);
  await tab(page, 'security').click();
  const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
  if ((await guardRow.count()) > 0) await guardRow.first().click();
  await page.locator('.hud-staff__hire').click();
  await page.waitForTimeout(1000);

  await tab(page, 'build').click();
  await armProbe(page);

  const stroke = await strokeEndpoints(page);
  const strokeStart = stroke.from;
  const strokeEnd = stroke.to;
  const sane = await elementsAt(page, strokeStart.x, strokeStart.y);
  const saneEnd = await elementsAt(page, strokeEnd.x, strokeEnd.y);
  expect(sane[0]?.['tag']).toBe('CANVAS');
  expect(saneEnd[0]?.['tag']).toBe('CANVAS');
  log('act2', `stroke ${String(stroke.distance)}px westward from ${JSON.stringify(strokeStart)} to ${JSON.stringify(strokeEnd)}; both ends resolve to ${JSON.stringify(sane[0]?.['tag'])}/${JSON.stringify(saneEnd[0]?.['tag'])}`);

  const box0 = await visibleTileBox(page);
  log('act2', `drag 0 (arrival): visible tiles ${JSON.stringify(box0)} owned-visible=${String(box0 === undefined ? '?' : ownedLandVisible(box0))}`);

  let lostAfter = -1;
  for (let drag = 1; drag <= 8; drag += 1) {
    await disarmProbe(page);
    await middleDrag(page, strokeStart, strokeEnd);
    await page.waitForTimeout(120);
    await armProbe(page);
    const box = await visibleTileBox(page);
    const visible = box === undefined ? undefined : ownedLandVisible(box);
    log('act2', `after drag ${String(drag)} (${String(stroke.distance)}px west each): visible tiles x ${String(box?.left)}..${String(box?.right)}, y ${String(box?.top)}..${String(box?.bottom)}; owned-visible=${String(visible)}`);
    await disarmProbe(page);
    const pixels = await sampleWorldPixels(page, `${SHOTS}/act2-drag-${String(drag)}.png`);
    log('act2', `    pixels: ${String(pixels.void)}/${String(pixels.total)} VOID_COLOR; others ${JSON.stringify(pixels.others)}; where: ${JSON.stringify(pixels.nonVoidPoints)}`);
    await armProbe(page);
    if (visible === false && lostAfter < 0) lostAfter = drag;
    if (lostAfter > 0 && drag >= lostAfter + 1) break;
  }
  log('act2', `THE PRISON LEFT THE SCREEN AFTER ${String(lostAfter)} DRAG(S) of ${String(stroke.distance)}px at zoom 1`);

  await disarmProbe(page);
  // What the rest of the screen says while the world is gone.
  log('act2', `strip:    ${JSON.stringify((await panelText(page, '.hud-strip')).replace(/\n/g, ' | '))}`);
  log('act2', `minimap:  ${JSON.stringify(await panelText(page, '.hud-minimap'))}`);
  log('act2', `clock:    ${JSON.stringify((await panelText(page, '.hud-clock')).replace(/\n/g, ' | '))}`);
  for (const id of ['overview', 'build', 'rooms', 'security', 'regime'] as const) {
    await tab(page, id).click();
    await page.waitForTimeout(200);
    const text = (await panelText(page, '.hud')).replace(/\n/g, ' | ');
    log('act2', `${id} tab, whole HUD text while lost: ${JSON.stringify(text.slice(0, 900))}`);
  }
  await page.screenshot({ path: `${SHOTS}/act2-lost.png` });
});

// ------------------------------------------------------------------
// Act 3 -- both ends of ZOOM_BOUNDS. Can a player see their whole prison at
// the far end, and can they still tell where they are at the near end?
// ------------------------------------------------------------------
test('act 3: both ends of the zoom range, and how far a drag takes you at each', async ({ page }) => {
  test.setTimeout(300_000);
  await installTee(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await newPrison(page);
  log('act3', `version line: ${await versionLine(page)}`);
  await tab(page, 'security').click();
  const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
  if ((await guardRow.count()) > 0) await guardRow.first().click();
  await page.locator('.hud-staff__hire').click();
  await page.waitForTimeout(1000);
  await tab(page, 'build').click();

  // `KEYBOARD_ZOOM_STEP` is 1.25 (`world-scene.ts:86`) and `ZOOM_BOUNDS` is
  // {0.2, 3} (`:68`). From zoom 1 that is ceil(ln5/ln1.25) = 8 presses of
  // `Minus` to reach the floor and ceil(ln3/ln1.25) = 5 of `Equal` to reach
  // the ceiling; 12 of each is sent so the clamp is certainly reached and the
  // zoom is known exactly rather than counted.
  const zoomTo = async (direction: 'in' | 'out'): Promise<void> => {
    await page.mouse.move(900, 300);
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press(direction === 'in' ? 'Equal' : 'Minus');
      await page.waitForTimeout(60);
    }
  };

  for (const end of ['out', 'in'] as const) {
    await openApp(page);
    await newPrison(page);
    await tab(page, 'build').click();
    await page.waitForTimeout(400);
    await zoomTo(end);
    await page.waitForTimeout(300);

    await armProbe(page);
    const tilePx = await measuredTilePx(page);
    const box = await visibleTileBox(page);
    await disarmProbe(page);
    log('act3', `=== zoomed fully ${end}`);
    log('act3', `  measured px per tile: ${tilePx === undefined ? 'unknown' : tilePx.toFixed(2)} -> zoom ${tilePx === undefined ? '?' : (tilePx / TILE).toFixed(3)} (ZOOM_BOUNDS is {min:0.2,max:3}, world-scene.ts:68)`);
    log('act3', `  visible tile box: ${JSON.stringify(box)}`);
    if (box !== undefined) {
      const wide = box.right - box.left + 1;
      const tall = box.bottom - box.top + 1;
      log('act3', `  visible ${String(wide)}x${String(tall)} tiles; the owned chunk is 32x32, so the whole prison ${wide >= 32 && tall >= 32 ? 'FITS' : 'DOES NOT FIT'} on screen`);
      log('act3', `  owned land visible: ${String(ownedLandVisible(box))}; prison origin tile (16,16) on screen: ${String(box.left <= 16 && box.right >= 16 && box.top <= 16 && box.bottom >= 16)}`);
    }
    const pixels = await sampleWorldPixels(page, `${SHOTS}/act3-zoom-${end}.png`);
    log('act3', `  pixels: ${String(pixels.void)}/${String(pixels.total)} VOID_COLOR; others ${JSON.stringify(pixels.others)}`);

    // How far one 800px drag carries you at this zoom, and how many it takes
    // to lose the prison from here.
    const stroke = await strokeEndpoints(page);
    log('act3', `  stroke: ${String(stroke.distance)}px westward from ${JSON.stringify(stroke.from)}`);
    let lostAfter = -1;
    for (let drag = 1; drag <= 12; drag += 1) {
      await middleDrag(page, stroke.from, stroke.to);
      await page.waitForTimeout(100);
      await armProbe(page);
      const after = await visibleTileBox(page);
      await disarmProbe(page);
      const visible = after === undefined ? undefined : ownedLandVisible(after);
      log('act3', `  after drag ${String(drag)} at zoom-${end}: tiles x ${String(after?.left)}..${String(after?.right)}; owned-visible=${String(visible)}`);
      if (visible === false) { lostAfter = drag; break; }
    }
    log('act3', `  LOST AFTER ${String(lostAfter)} DRAG(S) at zoom-${end}`);
    await page.screenshot({ path: `${SHOTS}/act3-lost-at-zoom-${end}.png` });
  }
});

// ------------------------------------------------------------------
// Act 4 -- the way back. Only what the screen offers, and every interaction
// counted.
// ------------------------------------------------------------------
test('act 4: from lost, what on the screen brings a player back, and in how many interactions', async ({ page }) => {
  test.setTimeout(300_000);
  await installTee(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await newPrison(page);
  log('act4', `version line: ${await versionLine(page)}`);
  await tab(page, 'build').click();

  log('act4', `minimap sentence BEFORE anything: ${JSON.stringify(await panelText(page, '.hud-minimap'))}`);

  // Get lost: four 800px drags east and two south, so the return is not a
  // single-axis problem.
  const stroke = await strokeEndpoints(page);
  const column = { x: Math.round((stroke.from.x + stroke.to.x) / 2), fromY: 760, toY: 160 };
  log('act4', `westward stroke ${String(stroke.distance)}px from ${JSON.stringify(stroke.from)}; northward stroke on column x=${String(column.x)} from y=${String(column.fromY)} to y=${String(column.toY)}`);
  log('act4', `  column endpoints resolve to ${JSON.stringify((await elementsAt(page, column.x, column.fromY))[0]?.['tag'])} / ${JSON.stringify((await elementsAt(page, column.x, column.toY))[0]?.['tag'])}`);
  for (let i = 0; i < 4; i += 1) await middleDrag(page, stroke.from, stroke.to);
  for (let i = 0; i < 2; i += 1) await middleDrag(page, { x: column.x, y: column.fromY }, { x: column.x, y: column.toY });
  await page.waitForTimeout(200);

  await armProbe(page);
  const lostBox = await visibleTileBox(page);
  await disarmProbe(page);
  log('act4', `lost at: visible tiles ${JSON.stringify(lostBox)} owned-visible=${String(lostBox === undefined ? '?' : ownedLandVisible(lostBox))}`);
  const lostPixels = await sampleWorldPixels(page, `${SHOTS}/act4-lost.png`);
  log('act4', `lost pixels: ${String(lostPixels.void)}/${String(lostPixels.total)} VOID_COLOR`);
  log('act4', `minimap sentence WHILE LOST: ${JSON.stringify(await panelText(page, '.hud-minimap'))}`);

  // Interaction 1: the minimap. Does it take the click, and where does it go?
  const surface = await page.evaluate(() => {
    const el = document.querySelector('.hud-minimap__surface');
    if (el === null) return undefined;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  });
  log('act4', `.hud-minimap__surface rect: ${JSON.stringify(surface)}`);
  if (surface === undefined) throw new Error('.hud-minimap__surface is not on the page -- instrument is stale');

  const centre = { x: (surface.left + surface.right) / 2, y: (surface.top + surface.bottom) / 2 };
  const under = await elementsAt(page, centre.x, centre.y);
  log('act4', `elementsFromPoint at the minimap centre: ${JSON.stringify(under.slice(0, 2))}`);
  expect(String(under[0]?.['cls'])).toContain('hud-minimap');

  const commandsFromMinimap = await press(page, centre.x, centre.y);
  await page.waitForTimeout(300);
  log('act4', `ONE press at the minimap centre -> simulation commands: ${JSON.stringify(commandsFromMinimap)}`);
  log('act4', `minimap sentence AFTER one press: ${JSON.stringify(await panelText(page, '.hud-minimap'))}`);

  await armProbe(page);
  const afterMinimap = await visibleTileBox(page);
  await disarmProbe(page);
  log('act4', `after ONE minimap press: visible tiles ${JSON.stringify(afterMinimap)} owned-visible=${String(afterMinimap === undefined ? '?' : ownedLandVisible(afterMinimap))}`);
  const backPixels = await sampleWorldPixels(page, `${SHOTS}/act4-after-one-minimap-press.png`);
  log('act4', `after-one-press pixels: ${String(backPixels.void)}/${String(backPixels.total)} VOID_COLOR; others ${JSON.stringify(backPixels.others)}`);

  // Where exactly does the centre of the surface land? The mapping is linear
  // across `WorldRenderView.loadedBounds` (`world-scene.ts:1279`), so on a
  // fresh session the centre should be the middle of chunk (0,0).
  if (afterMinimap !== undefined) {
    const centreTileX = Math.round((afterMinimap.left + afterMinimap.right) / 2);
    const centreTileY = Math.round((afterMinimap.top + afterMinimap.bottom) / 2);
    log('act4', `tile now at the middle of the screen: (${String(centreTileX)},${String(centreTileY)}); NEW_PRISON_ORIGIN_TILE is (${String(PRISON_ORIGIN_TILE.x)},${String(PRISON_ORIGIN_TILE.y)})`);
  }

  // The three other corners of the surface, so "does it navigate" is not one
  // sample: each should land somewhere different and all inside the chunk.
  for (const spot of [
    { label: 'top-left', fx: 0.02, fy: 0.02 },
    { label: 'top-right', fx: 0.98, fy: 0.02 },
    { label: 'bottom-right', fx: 0.98, fy: 0.98 },
  ]) {
    const point = { x: surface.left + surface.width * spot.fx, y: surface.top + surface.height * spot.fy };
    await press(page, point.x, point.y);
    await page.waitForTimeout(200);
    await armProbe(page);
    const box = await visibleTileBox(page);
    await disarmProbe(page);
    if (box === undefined) { log('act4', `  minimap ${spot.label}: could not read the camera`); continue; }
    log('act4', `  minimap ${spot.label} (fx=${String(spot.fx)},fy=${String(spot.fy)}) -> centre tile (${String(Math.round((box.left + box.right) / 2))},${String(Math.round((box.top + box.bottom) / 2))}), visible x ${String(box.left)}..${String(box.right)} y ${String(box.top)}..${String(box.bottom)}`);
  }
});

// ------------------------------------------------------------------
// Act 5 -- are there edges? How far can a player go, what does the boundary
// look like, and does anything degrade out there?
// ------------------------------------------------------------------
test('act 5: how far the world goes, and whether anything degrades when a player goes there', async ({ page }) => {
  test.setTimeout(300_000);
  const consoleLines: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') consoleLines.push(`${message.type()}: ${message.text().slice(0, 300)}`);
  });
  page.on('pageerror', (error) => consoleLines.push(`pageerror: ${error.message.slice(0, 300)}`));

  await installTee(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await newPrison(page);
  log('act5', `version line: ${await versionLine(page)}`);
  await tab(page, 'build').click();

  // What the edge of the world looks like, up close: the boundary between the
  // one owned chunk and whatever is beyond it. Two drags east puts tile 31's
  // east face near the middle of the screen at zoom 1.
  const stroke = await strokeEndpoints(page);
  log('act5', `stroke ${String(stroke.distance)}px westward from ${JSON.stringify(stroke.from)}`);
  await middleDrag(page, stroke.from, stroke.to);
  await page.waitForTimeout(150);
  await armProbe(page);
  const edgeBox = await visibleTileBox(page);
  await disarmProbe(page);
  log('act5', `near the east edge of owned land: visible tiles ${JSON.stringify(edgeBox)}`);
  await page.screenshot({ path: `${SHOTS}/act5-the-edge.png` });
  const edgePixels = await sampleWorldPixels(page, `${SHOTS}/act5-the-edge-sampled.png`);
  log('act5', `edge pixels: ${String(edgePixels.void)}/${String(edgePixels.total)} VOID_COLOR; others ${JSON.stringify(edgePixels.others)}`);

  // Now a long way out. Each stroke is 800px = 12.5 tiles at zoom 1; 40
  // strokes is 500 tiles, about sixteen chunk-widths from home.
  const STROKES = 40;
  for (let i = 0; i < STROKES; i += 1) await middleDrag(page, stroke.from, stroke.to);
  await page.waitForTimeout(300);
  await armProbe(page);
  const farBox = await visibleTileBox(page);
  await disarmProbe(page);
  log('act5', `after ${String(STROKES)} strokes east: visible tiles ${JSON.stringify(farBox)}`);
  const farPixels = await sampleWorldPixels(page, `${SHOTS}/act5-far-out.png`);
  log('act5', `far-out pixels: ${String(farPixels.void)}/${String(farPixels.total)} VOID_COLOR; others ${JSON.stringify(farPixels.others)}`);
  log('act5', `console errors/warnings so far: ${JSON.stringify(consoleLines.slice(-12))}`);

  // Absurdly far, in one gesture: is there any clamp at all, and does the
  // renderer survive coordinates this large?
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (canvas === null) throw new Error('no canvas');
    const fire = (type: string, x: number, y: number, button: number, buttons: number): void => {
      canvas.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button, buttons, bubbles: true, cancelable: true, view: window }));
    };
    // One press, one move of a million pixels' worth in ten synthetic hops
    // (the handler is incremental -- it reads `pointer - lastPanScreenPoint`
    // each move -- so the hops accumulate).
    fire('mousedown', 1000, 300, 1, 4);
    for (let i = 0; i < 200; i += 1) fire('mousemove', 1000 - 5000, 300, 0, 4);
    fire('mouseup', 1000, 300, 1, 0);
  });
  await page.waitForTimeout(400);
  await armProbe(page);
  const absurdBox = await visibleTileBox(page);
  await disarmProbe(page);
  log('act5', `after a synthetic million-pixel pan: visible tiles ${JSON.stringify(absurdBox)}`);
  const absurdPixels = await sampleWorldPixels(page, `${SHOTS}/act5-absurdly-far.png`);
  log('act5', `absurd pixels: ${String(absurdPixels.void)}/${String(absurdPixels.total)} VOID_COLOR`);
  log('act5', `console errors/warnings: ${JSON.stringify(consoleLines.slice(-15))}`);
  log('act5', `HUD still reads: ${JSON.stringify((await panelText(page, '.hud-strip')).replace(/\n/g, ' | '))}`);

  // And from there, does the minimap still bring the player home?
  const surface = await page.evaluate(() => {
    const el = document.querySelector('.hud-minimap__surface');
    if (el === null) return undefined;
    const r = el.getBoundingClientRect();
    return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
  });
  if (surface !== undefined) {
    await press(page, surface.x, surface.y);
    await page.waitForTimeout(300);
    await armProbe(page);
    const home = await visibleTileBox(page);
    await disarmProbe(page);
    log('act5', `one minimap press from absurdly far: visible tiles ${JSON.stringify(home)} owned-visible=${String(home === undefined ? '?' : ownedLandVisible(home))}`);
    await page.screenshot({ path: `${SHOTS}/act5-home-from-absurd.png` });
  }
  log('act5', `final console errors/warnings: ${JSON.stringify(consoleLines.slice(-15))}`);
});
// ------------------------------------------------------------------
// Act 6 -- does the view survive a reload?
//
// **Rewritten after its first run, and the rewrite is the finding.** The
// original act reloaded and then probed the camera, and the probe returned
// `undefined` with the page console carrying *"No simulation session is
// running yet, so the order cannot be submitted"*
// (`simulation-commands.ts:214`). That is not an instrument fault: a reload
// does not resume the prison, so there is no camera on a world to read. The
// act now measures that state first and only then takes the player's real
// next gesture, which is `Load`.
// ------------------------------------------------------------------
test('act 6: what a reload does to the prison, and where the camera is once it is back', async ({ page }) => {
  test.setTimeout(300_000);
  await installTee(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await newPrison(page);
  log('act6', `version line: ${await versionLine(page)}`);
  await tab(page, 'build').click();

  // Park the camera somewhere deliberate and *not* lost -- east of the prison,
  // south of it -- because "does the view come back" is a question about a view
  // a player chose, not only about the void.
  const stroke = await strokeEndpoints(page);
  const column = { x: Math.round((stroke.from.x + stroke.to.x) / 2), fromY: 760, toY: 300 };
  for (let i = 0; i < 2; i += 1) await middleDrag(page, stroke.from, stroke.to);
  await middleDrag(page, { x: column.x, y: column.fromY }, { x: column.x, y: column.toY });
  await page.waitForTimeout(200);
  await armProbe(page);
  const chosen = await visibleTileBox(page);
  await disarmProbe(page);
  log('act6', `camera the player parked: visible tiles ${JSON.stringify(chosen)}`);
  await page.screenshot({ path: `${SHOTS}/act6-before-reload.png` });

  await page.waitForTimeout(2000);
  log('act6', `save panel before reload: ${JSON.stringify((await panelText(page, '.save-panel')).replace(/\n/g, ' | '))}`);

  await page.reload();
  await page.waitForSelector('#game-root canvas');
  await page.waitForSelector('.hud');
  await page.waitForTimeout(5000);

  /*
   * **Is a prison running at all?** Three independent readings rather than
   * one, because "the camera did not come back" and "there is nothing to put
   * a camera on" are different findings and the first run could not tell
   * them apart.
   */
  const resumed = await page.evaluate(() => {
    const strip = document.querySelector<HTMLElement>('.hud-strip');
    const canvas = document.querySelector('canvas');
    return {
      stripText: (strip?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 200),
      canvasPresent: canvas !== null,
    };
  });
  log('act6', `after reload: ${JSON.stringify(resumed)}`);
  log('act6', `save panel after reload: ${JSON.stringify((await panelText(page, '.save-panel')).replace(/\n/g, ' | '))}`);
  log('act6', `minimap after reload: ${JSON.stringify(await panelText(page, '.hud-minimap'))}`);
  const reloadPixels = await sampleWorldPixels(page, `${SHOTS}/act6-after-reload.png`);
  log('act6', `pixels immediately after reload: ${String(reloadPixels.void)}/${String(reloadPixels.total)} VOID_COLOR; others ${JSON.stringify(reloadPixels.others)}`);
  await tab(page, 'build').click();
  await armProbe(page);
  const afterReload = await visibleTileBox(page);
  await disarmProbe(page);
  log('act6', `camera immediately after reload: ${afterReload === undefined ? 'UNREADABLE -- no session is running, so a world press submits nothing' : JSON.stringify(afterReload)}`);

  /*
   * The player's actual next gesture. The save panel offers `Load` beside the
   * saved prison; this is what a player does when the page comes back empty.
   */
  const loadButtons = page.locator('.save-panel__button', { hasText: 'Load' });
  log('act6', `save panel offers ${String(await loadButtons.count())} control(s) reading "Load"`);
  // The last one is the row's own Load; the first is the file-import Load.
  await loadButtons.last().click();
  await page.waitForTimeout(6000);
  log('act6', `save panel after Load: ${JSON.stringify((await panelText(page, '.save-panel')).replace(/\n/g, ' | '))}`);
  log('act6', `strip after Load: ${JSON.stringify((await panelText(page, '.hud-strip')).replace(/\n/g, ' | ').slice(0, 260))}`);
  await tab(page, 'build').click();
  await armProbe(page);
  const afterLoad = await visibleTileBox(page);
  await disarmProbe(page);
  log('act6', `camera after Load: ${JSON.stringify(afterLoad)}`);
  if (chosen !== undefined && afterLoad !== undefined) {
    log('act6', `  shift from the parked view: dx=${String(afterLoad.left - chosen.left)} tiles, dy=${String(afterLoad.top - chosen.top)} tiles`);
    log('act6', `  centre tile after Load: (${String(Math.round((afterLoad.left + afterLoad.right) / 2))},${String(Math.round((afterLoad.top + afterLoad.bottom) / 2))}); parked centre was (${String(Math.round((chosen.left + chosen.right) / 2))},${String(Math.round((chosen.top + chosen.bottom) / 2))}); NEW_PRISON_ORIGIN_TILE is (${String(PRISON_ORIGIN_TILE.x)},${String(PRISON_ORIGIN_TILE.y)})`);
  }
  await page.screenshot({ path: `${SHOTS}/act6-after-load.png` });
});

// ------------------------------------------------------------------
// Act 8 -- a prison switch with **no reload in between**, which is the case
// `framedOnWorld` (`world-scene.ts:262`) never resets for: it is set on the
// first frame a world exists and guards `frameCameraOnFirstWorld` for the
// life of the scene, so a second prison started in the same page should get
// no framing at all.
//
// Act 6's first run appeared to answer this and did not: its reload had left
// the page with no session, so `framedOnWorld` was still `false` and the
// switch measured a *first* framing rather than a second one. This act never
// reloads.
// ------------------------------------------------------------------
test('act 8: a second prison started in the same page, from a camera the player got lost with', async ({ page }) => {
  test.setTimeout(300_000);
  await installTee(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await newPrison(page);
  log('act8', `version line: ${await versionLine(page)}`);
  await tab(page, 'build').click();
  await page.waitForTimeout(400);

  await armProbe(page);
  const start = await visibleTileBox(page);
  await disarmProbe(page);
  log('act8', `prison 1, arrival: visible tiles ${JSON.stringify(start)}`);

  const stroke = await strokeEndpoints(page);
  for (let i = 0; i < 5; i += 1) await middleDrag(page, stroke.from, stroke.to);
  await page.waitForTimeout(200);
  await armProbe(page);
  const lost = await visibleTileBox(page);
  await disarmProbe(page);
  log('act8', `prison 1, lost: visible tiles ${JSON.stringify(lost)} owned-visible=${String(lost === undefined ? '?' : ownedLandVisible(lost))}`);
  const lostPixels = await sampleWorldPixels(page, `${SHOTS}/act8-lost-in-prison-1.png`);
  log('act8', `  pixels: ${String(lostPixels.void)}/${String(lostPixels.total)} VOID_COLOR`);

  // No reload. The player presses New prison from exactly here.
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.waitForTimeout(4000);
  await tab(page, 'build').click();
  await armProbe(page);
  const afterSwitch = await visibleTileBox(page);
  await disarmProbe(page);
  log('act8', `prison 2, immediately after New prison: visible tiles ${JSON.stringify(afterSwitch)} owned-visible=${String(afterSwitch === undefined ? '?' : ownedLandVisible(afterSwitch))}`);
  const pixels = await sampleWorldPixels(page, `${SHOTS}/act8-after-new-prison.png`);
  log('act8', `  pixels: ${String(pixels.void)}/${String(pixels.total)} VOID_COLOR; others ${JSON.stringify(pixels.others)}`);
  log('act8', `  minimap sentence after the switch: ${JSON.stringify(await panelText(page, '.hud-minimap'))}`);
  if (lost !== undefined && afterSwitch !== undefined) {
    log('act8', `  camera moved by dx=${String(afterSwitch.left - lost.left)} dy=${String(afterSwitch.top - lost.top)} tiles across the switch`);
  }

  // And does the way back still work in the new prison?
  const surface = await page.evaluate(() => {
    const el = document.querySelector('.hud-minimap__surface');
    if (el === null) return undefined;
    const r = el.getBoundingClientRect();
    return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
  });
  if (surface !== undefined) {
    await press(page, surface.x, surface.y);
    await page.waitForTimeout(300);
    await armProbe(page);
    const home = await visibleTileBox(page);
    await disarmProbe(page);
    log('act8', `one minimap press in prison 2: visible tiles ${JSON.stringify(home)} owned-visible=${String(home === undefined ? '?' : ownedLandVisible(home))}`);
  }
  await page.screenshot({ path: `${SHOTS}/act8-end.png` });
});

// ------------------------------------------------------------------
// Act 7 -- the three candidate ways back, measured against each other, and
// the affordance audit that decides whether a player ever finds the good one.
// ------------------------------------------------------------------
test('act 7: the three ways back, counted, and what the screen advertises before the first click', async ({ page }) => {
  test.setTimeout(300_000);
  await installTee(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await newPrison(page);
  log('act7', `version line: ${await versionLine(page)}`);
  await tab(page, 'build').click();

  /*
   * **The affordance audit, taken before any click has ever landed on the
   * surface.** The whole question of this act is not whether a way back
   * exists -- act 4 measured that it does and that it costs one press -- but
   * whether the screen a lost player is looking at tells them so. That is a
   * question about what the surface advertises, and the four things a
   * pointer-driven player reads are: the sentence in it, the cursor over it,
   * the tooltip on it, and whether it is announced as a control at all.
   */
  const affordance = await page.evaluate(() => {
    const surface = document.querySelector<HTMLElement>('.hud-minimap__surface');
    const placeholder = document.querySelector<HTMLElement>('.hud-minimap__placeholder');
    if (surface === null) return undefined;
    const style = getComputedStyle(surface);
    return {
      sentence: placeholder?.innerText ?? '(no .hud-minimap__placeholder)',
      cursor: style.cursor,
      pointerEvents: style.pointerEvents,
      title: surface.getAttribute('title'),
      ariaLabel: surface.getAttribute('aria-label'),
      role: surface.getAttribute('role'),
      tabIndex: surface.tabIndex,
      tagName: surface.tagName,
      // Every focusable node on the page, so "can a keyboard player reach it"
      // is answered by the same list a Tab key walks.
      focusableCount: document.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])').length,
      surfaceIsFocusable: surface.matches('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
    };
  });
  log('act7', `minimap surface affordance BEFORE any click ever lands: ${JSON.stringify(affordance)}`);

  // And the same question asked of the whole page: is there any control, on
  // any tab, whose text or tooltip names the camera, the prison's position,
  // or going back to it?
  for (const id of ['overview', 'build', 'rooms', 'security', 'regime'] as const) {
    await tab(page, id).click();
    await page.waitForTimeout(200);
    const controls = await controlInventory(page);
    const homeish = controls.filter((c) => /home|cent|recent|return|locate|find|camera|view|jump|prison/i.test(c));
    log('act7', `${id} tab: ${String(controls.length)} controls, ${String(homeish.length)} whose text/aria/title matches home|cent(re)|return|locate|find|camera|view|jump|prison: ${JSON.stringify(homeish)}`);
  }
  await tab(page, 'build').click();

  // ---- get lost, identically to act 4 -----------------------------
  const getLost = async (): Promise<{ x: number; y: number } | undefined> => {
    const stroke = await strokeEndpoints(page);
    const column = { x: Math.round((stroke.from.x + stroke.to.x) / 2), fromY: 760, toY: 160 };
    for (let i = 0; i < 4; i += 1) await middleDrag(page, stroke.from, stroke.to);
    for (let i = 0; i < 2; i += 1) await middleDrag(page, { x: column.x, y: column.fromY }, { x: column.x, y: column.toY });
    await page.waitForTimeout(200);
    await armProbe(page);
    const box = await visibleTileBox(page);
    await disarmProbe(page);
    if (box === undefined) return undefined;
    log('act7', `  lost at: visible tiles x ${String(box.left)}..${String(box.right)} y ${String(box.top)}..${String(box.bottom)}; owned-visible=${String(ownedLandVisible(box))}`);
    return { x: Math.round((box.left + box.right) / 2), y: Math.round((box.top + box.bottom) / 2) };
  };

  // ---- way back A: zoom out ---------------------------------------
  //
  // The only way back that needs no knowledge of *where* the prison is: the
  // viewport grows about its own centre (`stepZoom`, `world-scene.ts:783`,
  // which anchors the middle of the viewport and not the cursor), so pressing
  // `Minus` widens what is on screen symmetrically until the owned land
  // falls inside it -- or until `ZOOM_BOUNDS.min` stops it.
  log('act7', '=== way back A: zoom out, one Minus at a time');
  await getLost();
  let zoomPresses = -1;
  for (let i = 1; i <= 12; i += 1) {
    await page.keyboard.press('Minus');
    await page.waitForTimeout(120);
    await armProbe(page);
    const box = await visibleTileBox(page);
    const px = await measuredTilePx(page);
    await disarmProbe(page);
    if (box === undefined) { log('act7', `  after ${String(i)} Minus: could not read the camera`); continue; }
    const visible = ownedLandVisible(box);
    log('act7', `  after ${String(i)} Minus: zoom ${px === undefined ? '?' : (px / TILE).toFixed(3)}, visible tiles x ${String(box.left)}..${String(box.right)} y ${String(box.top)}..${String(box.bottom)}, owned-visible=${String(visible)}`);
    if (visible && zoomPresses < 0) { zoomPresses = i; break; }
  }
  log('act7', `WAY BACK A: ${zoomPresses < 0 ? 'the owned land never came back within 12 presses of Minus' : `${String(zoomPresses)} presses of Minus put owned land back on screen`}`);
  const zoomedPixels = await sampleWorldPixels(page, `${SHOTS}/act7-after-zooming-out.png`);
  log('act7', `  pixels after way back A: ${String(zoomedPixels.void)}/${String(zoomedPixels.total)} VOID_COLOR`);

  // ---- way back B: drag it back by hand ---------------------------
  //
  // The gesture that got the player lost, run in reverse. **The player does
  // not know the reverse direction** -- act 2 measured that the screen at the
  // far end is 113/113 `VOID_COLOR` with no marker of any kind -- so this
  // number is a *lower bound* on the real cost: it is what it costs someone
  // who already knows the answer.
  log('act7', '=== way back B: drag back by hand, knowing the direction');
  await openApp(page);
  await newPrison(page);
  await tab(page, 'build').click();
  await page.waitForTimeout(400);
  await getLost();
  const back = await strokeEndpoints(page);
  const east = { from: back.to, to: back.from };
  const columnX = Math.round((back.from.x + back.to.x) / 2);
  let dragsBack = -1;
  for (let i = 1; i <= 12; i += 1) {
    await middleDrag(page, east.from, east.to);
    // The lost position of `getLost` is two strokes north as well as four
    // west, so the return is two-axis: one southward stroke for every two
    // eastward ones, which is the same ratio going out.
    if (i % 2 === 0) await middleDrag(page, { x: columnX, y: 160 }, { x: columnX, y: 760 });
    await page.waitForTimeout(100);
    await armProbe(page);
    const box = await visibleTileBox(page);
    await disarmProbe(page);
    if (box === undefined) { log('act7', `  after ${String(i)} return drags: could not read the camera`); continue; }
    const visible = ownedLandVisible(box);
    log('act7', `  after ${String(i)} eastward drag(s) (+${String(Math.floor(i / 2))} southward): visible tiles x ${String(box.left)}..${String(box.right)} y ${String(box.top)}..${String(box.bottom)}, owned-visible=${String(visible)}`);
    if (visible) { dragsBack = i + Math.floor(i / 2); break; }
  }
  log('act7', `WAY BACK B: ${dragsBack < 0 ? 'owned land never came back within 12 eastward drags' : `${String(dragsBack)} drag(s) total, by someone who already knew which way to go`}`);

  // ---- way back C: the minimap, from the same lost position -------
  log('act7', '=== way back C: one press on the minimap surface');
  await openApp(page);
  await newPrison(page);
  await tab(page, 'build').click();
  await page.waitForTimeout(400);
  await getLost();
  const surface = await page.evaluate(() => {
    const el = document.querySelector('.hud-minimap__surface');
    if (el === null) return undefined;
    const r = el.getBoundingClientRect();
    return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
  });
  if (surface === undefined) throw new Error('.hud-minimap__surface is gone -- instrument is stale');
  const before = await page.evaluate(() => document.querySelector<HTMLElement>('.hud-minimap__placeholder')?.innerText ?? '');
  await press(page, surface.x, surface.y);
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => document.querySelector<HTMLElement>('.hud-minimap__placeholder')?.innerText ?? '');
  await armProbe(page);
  const home = await visibleTileBox(page);
  await disarmProbe(page);
  log('act7', `  sentence before the press: ${JSON.stringify(before)}`);
  log('act7', `  sentence after the press:  ${JSON.stringify(after)}`);
  log('act7', `WAY BACK C: 1 press -> visible tiles ${JSON.stringify(home)} owned-visible=${String(home === undefined ? '?' : ownedLandVisible(home))}`);
  if (home !== undefined) {
    log('act7', `  centre tile now (${String(Math.round((home.left + home.right) / 2))},${String(Math.round((home.top + home.bottom) / 2))}); NEW_PRISON_ORIGIN_TILE is (${String(PRISON_ORIGIN_TILE.x)},${String(PRISON_ORIGIN_TILE.y)})`);
  }

  /*
   * **The gate, stated as a measurement.** The sentence that advertises way
   * back C is only ever rendered by the click it advertises
   * (`hud.ts:1517-1522`: `if (navigated) minimapPlaceholder.textContent =
   * t(HUD_MESSAGE_KEY.minimapNavigable)`), so a player who has never clicked
   * the surface has never been told it is clickable. This asks a fresh page
   * the same question one more time, after everything above, so the claim
   * rests on a reading and not on the memory of one.
   */
  await openApp(page);
  await newPrison(page);
  await page.waitForTimeout(500);
  const freshSentence = await page.evaluate(() => document.querySelector<HTMLElement>('.hud-minimap__placeholder')?.innerText ?? '(absent)');
  log('act7', `a brand-new page, before any click on the surface, still reads: ${JSON.stringify(freshSentence)}`);
});
