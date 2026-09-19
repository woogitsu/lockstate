import { expect, test } from '@playwright/test';
import { TILE, armBuildable, calibrate, installTee, openApp, panelText, sentCommands, tab } from './playtest-harness';

/**
 * **How much of the map a mouse can actually reach, and what a drag that
 * leaves it does.**
 *
 * ## Where this came from
 *
 * `playtest-2026-09-03-a-prisoners-day.playtest.ts`'s act 2 tried to build a
 * delivery bay at tiles (6,12)-(9,15) -- comfortably inside a 1440x900
 * viewport by the arithmetic of `calibrate`'s real origin of `(-304, -574)` --
 * and its four wall runs produced **4, 0, 1 and (never reached)** commands
 * instead of 4, 4, 4, 4. Nothing appeared in the refusal band, nothing in the
 * alerts list, and nothing in the console. The run then died at the config's
 * 600 s inside the next drag.
 *
 * The cause is not in doubt and is one CSS rule: `.hud` is
 * `position: fixed; inset: 0` with `pointer-events: none`, and `hud.css`'s
 * *"Every interactive island opts back in"* rule gives `pointer-events: auto`
 * to `.hud-strip`, `.hud__corner > *`, `.hud__aside > *`, `.hud__side > *` and
 * `.hud-tabs__inner`. So the status strip (top), the right-hand rail (the save
 * panel plus whichever tab panel is open), the bottom-left minimap and the
 * bottom-centre tab bar each take the pointer, and the world never sees it.
 *
 * **That much is obvious from looking at the screen. What is not obvious, and
 * is what this file measures, is what happens to a *drag* that starts on
 * reachable canvas and crosses or ends on one of those islands.** A player
 * drawing a long wall run does exactly that, and the question is whether they
 * get the run they drew, a shorter one, or nothing -- and whether anything on
 * screen tells them which.
 *
 * ## What it measures
 *
 * 1. The reachable tile set, by `elementFromPoint` over every visible tile
 *    centre, with the class name of whatever took the pointer where it is not
 *    the canvas. Printed per row, gaps called out.
 * 2. Three wall drags of known length, each with `wall-brick` armed, and the
 *    commands each produced against the tiles it crossed:
 *    - wholly inside the reachable band (the control),
 *    - starting inside and released over a panel,
 *    - starting over a panel and released inside.
 * 3. The refusal band and the alerts list after each, so the log says whether
 *    a partial run is announced or silent.
 *
 * ## It is not a gate
 *
 * `playwright.config.ts` is `testMatch: /.*\.spec\.ts$/`, so nothing in CI
 * collects this. Run it with:
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5241 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-2026-09-03-the-canvas-a-player-can-reach.playtest.ts
 * ```
 *
 * `git lfs checkout` first in a worktree.
 */

interface Blocked {
  readonly tx: number;
  readonly ty: number;
  readonly by: string;
}

test.describe('the canvas a player can reach', () => {
  test('how much of the map takes a gesture, and what a drag that leaves it does', async ({ page }) => {
    const log = (line: string): void => {
      console.log(`[reach] ${line}`);
    };

    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await tab(page, 'build').click();
    const origin = await calibrate(page);
    const viewport = page.viewportSize() ?? { width: 0, height: 0 };
    log(`origin ${JSON.stringify(origin)}; viewport ${JSON.stringify(viewport)}`);

    const probe = await page.evaluate(
      ({ originX, originY, tile }) => {
        const free: { tx: number; ty: number }[] = [];
        const blocked: { tx: number; ty: number; by: string }[] = [];
        for (let ty = 0; ty <= 40; ty += 1) {
          const centreY = originY + ty * tile + tile / 2;
          if (centreY < 0 || centreY > window.innerHeight) continue;
          for (let tx = 0; tx <= 50; tx += 1) {
            const centreX = originX + tx * tile + tile / 2;
            if (centreX < 0 || centreX > window.innerWidth) continue;
            const hit = document.elementFromPoint(centreX, centreY);
            const island = hit === null ? null : (hit.closest('.hud, .save-panel') as HTMLElement | null);
            if (island === null) free.push({ tx, ty });
            else {
              // The nearest ancestor that actually opts back into the pointer,
              // so the log names the island rather than a leaf `<span>`.
              let owner: HTMLElement = hit as HTMLElement;
              for (let node: HTMLElement | null = hit as HTMLElement; node !== null; node = node.parentElement) {
                if (getComputedStyle(node).pointerEvents === 'auto') owner = node;
                if (node === island) break;
              }
              blocked.push({ tx, ty, by: owner.className || owner.tagName });
            }
          }
        }
        return { free, blocked, width: window.innerWidth, height: window.innerHeight };
      },
      { originX: origin.originX, originY: origin.originY, tile: TILE },
    );

    const rows = [...new Set([...probe.free, ...probe.blocked].map((cell) => cell.ty))].sort((l, r) => l - r);
    log(`visible tile rows: ${JSON.stringify(rows)}`);
    for (const ty of rows) {
      const free = probe.free.filter((cell) => cell.ty === ty).map((cell) => cell.tx);
      const blocked = probe.blocked.filter((cell) => cell.ty === ty) as readonly Blocked[];
      const owners = [...new Set(blocked.map((cell) => cell.by))];
      log(
        `  y=${ty}: reachable x ${free.length === 0 ? 'NONE' : JSON.stringify(free)};`
          + ` blocked ${blocked.length} by ${JSON.stringify(owners)}`,
      );
    }
    log(`REACHABLE TILES: ${probe.free.length} of ${probe.free.length + probe.blocked.length} visible (${((100 * probe.free.length) / (probe.free.length + probe.blocked.length)).toFixed(1)}%)`);
    const byOwner = new Map<string, number>();
    for (const cell of probe.blocked) byOwner.set(cell.by, (byOwner.get(cell.by) ?? 0) + 1);
    log(`WHAT TAKES THE POINTER, BY TILES CLAIMED: ${JSON.stringify([...byOwner.entries()].sort((l, r) => r[1] - l[1]))}`);

    // ---- and now three drags -----------------------------------------------
    const reachable = (tx: number, ty: number): boolean => probe.free.some((cell) => cell.tx === tx && cell.ty === ty);
    const rowOf = (ty: number): readonly number[] => probe.free.filter((cell) => cell.ty === ty).map((cell) => cell.tx);

    // A row with a healthy free stretch, for the control, and a row where the
    // free stretch has an edge to run off.
    const controlRow = rows.find((ty) => rowOf(ty).length >= 6);
    if (controlRow === undefined) {
      log('NO ROW HAS SIX REACHABLE TILES; the drags are skipped and that is this run’s finding.');
      expect(probe.free.length + probe.blocked.length).toBeGreaterThan(0);
      return;
    }
    const controlXs = rowOf(controlRow);
    const start = controlXs[0]!;
    const end = controlXs[Math.min(5, controlXs.length - 1)]!;

    // The horizontal edge of the free band on this row, if there is one to the
    // right; otherwise to the left.
    const rightmost = controlXs[controlXs.length - 1]!;

    await armBuildable(page, 'wall-brick');

    const runDrag = async (
      name: string,
      a: { tx: number; ty: number },
      b: { tx: number; ty: number },
    ): Promise<void> => {
      const before = (await sentCommands(page)).length;
      const ax = origin.originX + a.tx * TILE + TILE / 2;
      const ay = origin.originY + a.ty * TILE + TILE / 2;
      const bx = origin.originX + b.tx * TILE + TILE / 2;
      const by = origin.originY + b.ty * TILE + TILE / 2;
      await page.mouse.move(ax, ay);
      await page.mouse.down({ button: 'left' });
      await page.mouse.move((ax + bx) / 2, (ay + by) / 2, { steps: 8 });
      await page.mouse.move(bx, by, { steps: 8 });
      await page.mouse.up({ button: 'left' });
      await page.waitForTimeout(400);
      const produced = (await sentCommands(page)).slice(before);
      const spanned = Math.abs(b.tx - a.tx) + Math.abs(b.ty - a.ty) + 1;
      log(
        `DRAG ${name}: (${a.tx},${a.ty}) [${reachable(a.tx, a.ty) ? 'reachable' : 'BLOCKED'}]`
          + ` -> (${b.tx},${b.ty}) [${reachable(b.tx, b.ty) ? 'reachable' : 'BLOCKED'}]`
          + ` spans ${spanned} tile(s), produced ${produced.length} command(s)`,
      );
      log(`  commands: ${JSON.stringify(produced.map((c) => `${String(c['type'])} ${String(c['x'])},${String(c['y'])} ${String(c['edge'] ?? '')}`))}`);
      log(`  refusal band: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
      log(`  alerts list: ${JSON.stringify((await panelText(page, '.hud-alerts__list')).replace(/\n/g, ' | '))}`);
      log(
        produced.length === spanned
          ? '  FULL RUN: the drag placed what it spanned.'
          : `  SHORT BY ${spanned - produced.length}: the drag spanned ${spanned} tiles and placed ${produced.length}.`,
      );
    };

    await runDrag('A (wholly reachable, the control)', { tx: start, ty: controlRow }, { tx: end, ty: controlRow });
    // Released past the right edge of the free band, if the band has one on
    // screen. `rightmost + 3` is off the band by construction whenever
    // anything at all is blocked to the right of it on this row.
    if (!reachable(rightmost + 3, controlRow)) {
      await runDrag('B (starts reachable, released over a panel)', { tx: rightmost - 3, ty: controlRow }, { tx: rightmost + 3, ty: controlRow });
      await runDrag('C (starts over a panel, released reachable)', { tx: rightmost + 3, ty: controlRow }, { tx: rightmost - 3, ty: controlRow });
    } else {
      log(`(x ${rightmost + 3} is still reachable on row ${controlRow}; drags B and C are skipped rather than faked.)`);
    }

    log(`queue after the drags: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);

    expect(probe.free.length + probe.blocked.length).toBeGreaterThan(0);
  });
});
