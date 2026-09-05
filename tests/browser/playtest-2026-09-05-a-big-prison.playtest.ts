/**
 * A BIG PRISON — the scale pass.
 *
 * **Not a gate.** `.playtest.ts`, collected only by
 * `tests/browser/playwright.playtest.config.ts`. See that file's header.
 *
 * The question, as given: every playtest in this repository so far has been
 * small — the largest 30 prisoners, most four to twelve. Build a big prison —
 * many blocks, many rooms, as many prisoners as the game will take — and find
 * out what happens.
 *
 * Run one act at a time, from the worktree root:
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5331 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-2026-09-05-a-big-prison.playtest.ts -g "act 0"
 * ```
 *
 * The record is `docs/research/2026-09-05-a-big-prison.md`.
 */
import { test } from '@playwright/test';

import {
  TILE,
  calibrate,
  centreOf,
  countsSeries,
  currentClock,
  currentTick,
  installTee,
  latestCounts,
  openApp,
  panelText,
  press,
  sentCommands,
  tab,
} from './playtest-harness';

const log = (line: string): void => {
  console.log(line);
};

/**
 * What is on top of a world point. A press on a HUD-covered point submits
 * nothing at all, and this repository has withdrawn three findings to that.
 */
async function topAt(page: import('@playwright/test').Page, x: number, y: number): Promise<string> {
  return page.evaluate(
    ([px, py]) => {
      const node = document.elementFromPoint(px as number, py as number);
      if (node === null) return 'NONE';
      const id = node.id === '' ? '' : `#${node.id}`;
      const cls = node.className === '' || typeof node.className !== 'string' ? '' : `.${node.className.split(/\s+/).join('.')}`;
      return `${node.tagName.toLowerCase()}${id}${cls}`;
    },
    [x, y],
  );
}

test.describe('A big prison — the scale pass', () => {
  test.beforeEach(async ({ page }) => {
    await installTee(page);
    page.on('console', (message) => {
      const text = message.text();
      if (message.type() === 'error' || message.type() === 'warning' || text.includes('HUD action failed')) {
        log(`  [page:${message.type()}] ${text.slice(0, 400)}`);
      }
    });
  });

  /**
   * act 0 — how much prison the player can reach at all.
   *
   * Three questions, and every later act's layout depends on all three:
   *   1. What tile window is pressable at 1440x900 and zoom 1?
   *   2. What does the keyboard zoom-out do to that window, and does the
   *      screen->tile transform stay measurable once the pitch is not 64?
   *   3. How big is the plot? `world.setOwned` has one call site
   *      (`src/simulation/runtime/new-session.ts:433`) and it owns one 32x32
   *      chunk, so this asks the build tool where the refusal starts.
   */
  test('act 0 — the reachable canvas, the zoom, and the size of the plot', async ({ page }) => {
    test.setTimeout(900_000);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await tab(page, 'build').click();

    const origin = await calibrate(page);
    log(`[act0] zoom 1 origin: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);

    // 1. The pressable window at zoom 1: walk tile centres and ask what is on top.
    const size = page.viewportSize() ?? { width: 1440, height: 900 };
    const reachable: string[] = [];
    const blocked: string[] = [];
    for (let ty = 0; ty < 32; ty += 1) {
      for (let tx = 0; tx < 32; tx += 1) {
        const p = centreOf(origin, tx, ty);
        if (p.x < 0 || p.y < 0 || p.x > size.width || p.y > size.height) continue;
        const top = await topAt(page, p.x, p.y);
        if (top.startsWith('canvas')) reachable.push(`${tx},${ty}`);
        else blocked.push(`${tx},${ty}=${top}`);
      }
    }
    const xs = reachable.map((k) => Number(k.split(',')[0]));
    const ys = reachable.map((k) => Number(k.split(',')[1]));
    log(`[act0] zoom 1: ${reachable.length} tile centres are on canvas, ${blocked.length} are covered`);
    log(`[act0] zoom 1 pressable tile box: x ${Math.min(...xs)}..${Math.max(...xs)}, y ${Math.min(...ys)}..${Math.max(...ys)}`);
    log(`[act0] zoom 1 covered, first 12: ${JSON.stringify(blocked.slice(0, 12))}`);

    // 2. Zoom out. `Minus` is `camera.zoom.out`, KEYBOARD_ZOOM_STEP 1.25,
    //    ZOOM_BOUNDS.min 0.2 (`src/rendering/scene/world-scene.ts:68,86`).
    await page.locator('#game-root canvas').click({ position: { x: 20, y: 20 } });
    for (let i = 0; i < 4; i += 1) {
      await page.keyboard.press('Minus');
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(500);

    // Re-derive the transform by direct read-back rather than by assuming TILE.
    await page.locator('.hud-build__remove').click();
    const probeXs = [420, 560, 700, 840, 980, 1120];
    const samples: { sx: number; tx: number }[] = [];
    for (const sx of probeXs) {
      const produced = await press(page, sx, 300);
      const removal = produced.find((c) => c['type'] === 'RemoveObject');
      if (removal === undefined) {
        log(`[act0] zoomed press at ${sx},300 produced no RemoveObject: ${JSON.stringify(produced)}`);
        continue;
      }
      samples.push({ sx, tx: removal['x'] as number });
    }
    log(`[act0] zoomed-out x samples: ${JSON.stringify(samples)}`);
    if (samples.length >= 2) {
      const first = samples[0]!;
      const last = samples[samples.length - 1]!;
      const pitch = (last.sx - first.sx) / (last.tx - first.tx);
      log(`[act0] zoomed-out tile pitch from the read-back = ${pitch.toFixed(3)} px (zoom = ${(pitch / TILE).toFixed(4)})`);
    }
    const probeYs = [200, 320, 440, 560, 680];
    const ySamples: { sy: number; ty: number }[] = [];
    for (const sy of probeYs) {
      const produced = await press(page, 700, sy);
      const removal = produced.find((c) => c['type'] === 'RemoveObject');
      if (removal !== undefined) ySamples.push({ sy, ty: removal['y'] as number });
    }
    log(`[act0] zoomed-out y samples: ${JSON.stringify(ySamples)}`);
    await page.locator('.hud-build__remove').click();

    // 3. How big is the plot? Arm a wall and try to draw one well outside
    //    chunk (0,0), then read the refusal band.
    log(`[act0] refusal band before: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
    log(`[act0] status strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
    log(`[act0] tick ${await currentTick(page)} clock ${JSON.stringify(await currentClock(page))}`);
    log(`[act0] counts: ${JSON.stringify(await latestCounts(page))}`);
    log(`[act0] total commands submitted this act: ${(await sentCommands(page)).length}`);
    log(`[act0] hud node count: ${await page.evaluate(() => document.querySelectorAll('.hud *').length)}`);
  });
});
