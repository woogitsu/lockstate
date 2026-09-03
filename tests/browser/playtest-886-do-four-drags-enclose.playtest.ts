/**
 * Issue #886: do four wall drags around a rectangle enclose it?
 *
 * **A playtest, not a gate.** `tests/browser/playwright.config.ts` collects on
 * `*.spec.ts`, so nothing in CI runs this file; it is driven by hand through
 * `tests/browser/playwright.playtest.config.ts`. Its output is the deliverable.
 *
 * It plays the reproduction the issue describes -- four wall drags around a
 * 4x4, then a room zoned over the same 4x4 -- twice over, with the only
 * difference being **where inside the boundary tiles the four presses land**,
 * because that is the whole of what a wall drag is ambiguous about:
 *
 * - `gridline`: each press on the tile boundary the wall is meant to lie on,
 *   which is what tracing the outline of the intended room looks like.
 * - `centre`: each press through the middle of the boundary tiles, which is
 *   what "drag a wall across these tiles" looks like.
 *
 * What it measured on 2026-09-03, at the calibrated origin (-304, -574) and
 * with every press verified to be over `CANVAS` (so no drag is truncated by
 * issue #878):
 *
 * - `gridline` submitted 4 + 4 + 4 + 4 = 16 `PlaceBuildOrder`s covering exactly
 *   the perimeter of (12,12)-(15,15), and the 4x4 zoned as a cell first time:
 *   `rooms 0 -> 1`, with no `open on at least one side` line on the panel.
 *   **Four drags do enclose.**
 * - `centre` also submitted 16, but on the north and west sides they landed one
 *   tile in -- north edges on row 19 for a block starting at row 18, west edges
 *   on column 13 for a block starting at column 12 -- so the walls bound
 *   (13,19)-(15,21) and the 4x4 was refused `zone.not-enclosed`. The Rooms
 *   panel said `OPEN ON AT LEAST ONE SIDE` **before** the Confirm press, so the
 *   live pre-confirm warning issue #886 proposes building already exists.
 *
 * The asymmetry in the second case -- north and west one tile in, south and
 * east where the player aimed -- is a press landing on a tile's exact mid-line,
 * where `pickEdgeOnAxis` used to break the tie away from the pressed tile while
 * `pickEdgeAtWorld` broke it towards it. That divergence is what issue #886's
 * branch fixed; the geometry, the run and the enclosure test were all correct.
 */
import { expect, test, type Page } from '@playwright/test';

import {
  TILE,
  armBuildable,
  buy,
  calibrate,
  centreOf,
  drag,
  fastForwardToMax,
  installTee,
  latestCounts,
  openApp,
  panelText,
  sentCommands,
  tab,
  waitForQueueEmpty,
} from './playtest-harness';

async function findFreeTile(
  page: Page,
  origin: { originX: number; originY: number },
  width: number,
  height: number,
): Promise<{ tx: number; ty: number }> {
  const found = await page.evaluate(
    ({ originX, originY, width: w, height: h, tile }) => {
      const isWorld = (x: number, y: number): boolean => {
        if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return false;
        const node = document.elementFromPoint(x, y);
        return node !== null && node.tagName === 'CANVAS';
      };
      const firstTx = Math.ceil(-originX / tile);
      const firstTy = Math.ceil(-originY / tile);
      const lastTx = Math.floor((window.innerWidth - originX) / tile) - w;
      const lastTy = Math.floor((window.innerHeight - originY) / tile) - h;
      for (let ty = firstTy; ty <= lastTy; ty += 1) {
        for (let tx = firstTx; tx <= lastTx; tx += 1) {
          const left = originX + tx * tile;
          const top = originY + ty * tile;
          const right = originX + (tx + w) * tile;
          const bottom = originY + (ty + h) * tile;
          const midX = (left + right) / 2;
          const midY = (top + bottom) / 2;
          const points: readonly (readonly [number, number])[] = [
            [left, top], [right, top], [left, bottom], [right, bottom],
            [midX, top], [midX, bottom], [left, midY], [right, midY], [midX, midY],
          ];
          if (points.every(([x, y]) => isWorld(x, y))) return { tx, ty };
        }
      }
      return undefined;
    },
    { originX: origin.originX, originY: origin.originY, width, height, tile: TILE },
  );
  if (found === undefined) throw new Error(`no ${width}x${height} block of bare world on this page`);
  return found;
}

test.describe('probe 886', () => {
  test('four drags around a 4x4, two conventions', async ({ page }) => {
    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    await tab(page, 'build').click();
    const origin = await calibrate(page);
    console.log(`[probe] origin = (${origin.originX}, ${origin.originY})`);

    // Two 4x4 blocks, separated by a spare column/row so their walls cannot
    // share an edge. 4x10 of reachable world holds both stacked vertically.
    const { tx, ty } = await findFreeTile(page, origin, 6, 11);
    console.log(`[probe] blocks anchored at tile (${tx},${ty}); a=(${tx},${ty}) b=(${tx},${ty + 6})`);

    await buy(page, 'wall-brick', 80);
    await fastForwardToMax(page);
    await page.waitForTimeout(4000);
    console.log(`[probe] deliveries: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);

    await armBuildable(page, 'wall-brick');

    /** Four drags around the 4x4 whose top-left tile is (bx,by). */
    const fourDrags = async (label: string, bx: number, by: number, mode: 'gridline' | 'centre'): Promise<void> => {
      const right = bx + 3;
      const bottom = by + 3;
      // gridline: press on the tile boundary the wall lies on.
      // centre: press through the middle of the boundary tiles.
      const northY = mode === 'gridline' ? origin.originY + by * TILE : centreOf(origin, bx, by).y;
      const southY = mode === 'gridline' ? origin.originY + (bottom + 1) * TILE : centreOf(origin, bx, bottom).y;
      const westX = mode === 'gridline' ? origin.originX + bx * TILE : centreOf(origin, bx, by).x;
      const eastX = mode === 'gridline' ? origin.originX + (right + 1) * TILE : centreOf(origin, right, by).x;
      const runs = [
        { name: 'north', a: { x: centreOf(origin, bx, by).x, y: northY }, b: { x: centreOf(origin, right, by).x, y: northY } },
        { name: 'south', a: { x: centreOf(origin, bx, by).x, y: southY }, b: { x: centreOf(origin, right, by).x, y: southY } },
        { name: 'west', a: { x: westX, y: centreOf(origin, bx, by).y }, b: { x: westX, y: centreOf(origin, bx, bottom).y } },
        { name: 'east', a: { x: eastX, y: centreOf(origin, bx, by).y }, b: { x: eastX, y: centreOf(origin, bx, bottom).y } },
      ];
      for (const run of runs) {
        const under = await page.evaluate(
          (at: { x: number; y: number }) => document.elementFromPoint(at.x, at.y)?.tagName ?? 'NOTHING',
          run.a,
        );
        const before = (await sentCommands(page)).length;
        await drag(page, run.a, run.b);
        const produced = (await sentCommands(page)).slice(before).filter((c) => c['type'] === 'PlaceBuildOrder');
        console.log(
          `[probe] ${label} ${run.name}: press at (${run.a.x},${run.a.y}) over ${under} -> ${produced.length} order(s) ` +
            JSON.stringify(produced.map((c) => `${String(c['x'])},${String(c['y'])},${String(c['edge'])}`)),
        );
      }
    };

    await fourDrags('A/gridline', tx, ty, 'gridline');
    await fourDrags('B/centre', tx, ty + 6, 'centre');

    const emptied = await waitForQueueEmpty(page);
    console.log(`[probe] queue empty after ${emptied}ms, tick ${(await latestCounts(page))?.tick}`);
    await page.waitForTimeout(3000);

    /** Zone the 4x4 and report what the panel and the band said. */
    const zone = async (label: string, bx: number, by: number): Promise<void> => {
      await tab(page, 'rooms').click();
      const collapsed = await page.locator('.hud-rooms').getAttribute('data-collapsed');
      if (collapsed === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
      await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
      await page.locator('.hud-rooms__arm').click();
      await drag(page, centreOf(origin, bx, by), centreOf(origin, bx + 3, by + 3));
      const panel = await panelText(page, '.hud-rooms');
      const before = (await latestCounts(page))?.rooms ?? 0;
      await page.locator('.hud-rooms__confirm').click();
      await page.waitForTimeout(1500);
      const after = (await latestCounts(page))?.rooms ?? 0;
      console.log(`[probe] ZONE ${label} (${bx},${by}) 4x4:`);
      console.log(`[probe]   panel before confirm: ${JSON.stringify(panel.split('\n').filter((l) => /open|enclos|area/i.test(l)))}`);
      console.log(`[probe]   rooms ${before} -> ${after}`);
      console.log(`[probe]   refusal band: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
    };

    await zone('A/gridline', tx, ty);
    await zone('B/centre', tx, ty + 6);
  });
});
