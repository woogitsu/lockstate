import { expect, test, type Page } from '@playwright/test';
import { buildAndPopulate, installTee, openApp, press, tab, TILE } from './playtest-harness';

/**
 * Issue #957, measured on the assembled game at the playtest viewport.
 * This is deliberately a playtest, not a CI gate: room balance and the
 * starting camera are product choices, and the finding is a reproducible
 * constraint for that decision rather than a mandate to change either.
 */
test('a first 6×6 cell leaves no pointer-reachable 8×8 Yard on the default view', async ({ page }) => {
  await installTee(page);
  await openApp(page);
  const origin = await buildAndPopulate(page, { beds: 0, admits: 0, guards: 0, label: 'yard-957' });
  await tab(page, 'build').click();

  const measurement = await page.evaluate(({ origin, tileSize }) => {
    const viewport = { width: innerWidth, height: innerHeight };
    const cell = { x0: 12, y0: 12, x1: 17, y1: 17 };
    const hit = (x: number, y: number) => {
      const atX = origin.originX + (x + 0.5) * tileSize;
      const atY = origin.originY + (y + 0.5) * tileSize;
      const element = document.elementFromPoint(atX, atY);
      return element?.tagName.toLowerCase() === 'canvas' ? 'canvas' : `${element?.tagName.toLowerCase() ?? 'outside'}.${(element as HTMLElement | null)?.className ?? ''}`;
    };
    const reachable: { x: number; y: number }[] = [];
    let inspected = 0;
    let disjoint = 0;
    for (let y = 0; y <= 24; y += 1) for (let x = 0; x <= 24; x += 1) {
      inspected += 1;
      if (x <= cell.x1 && x + 7 >= cell.x0 && y <= cell.y1 && y + 7 >= cell.y0) continue;
      disjoint += 1;
      let clear = true;
      for (let yy = y; yy < y + 8 && clear; yy += 1) {
        for (let xx = x; xx < x + 8 && clear; xx += 1) clear = hit(xx, yy) === 'canvas';
      }
      if (clear) reachable.push({ x, y });
    }
    return {
      viewport, origin, cell, inspected, disjoint, reachable,
      candidateEast: [
        { tile: '19,13', hit: hit(19, 13) },
        { tile: '26,13', hit: hit(26, 13) },
        { tile: '19,20', hit: hit(19, 20) },
        { tile: '26,20', hit: hit(26, 20) },
      ],
    };
  }, { origin, tileSize: TILE });
  console.log(`[yard-957] ${JSON.stringify(measurement)}`);
  expect(measurement.viewport).toEqual({ width: 1440, height: 900 });
  expect(measurement.disjoint).toBeGreaterThan(0);
  expect(measurement.reachable).toEqual([]);

  // These are already shipped ways to leave the starting view. They refute
  // the older issue text's claim that there is no named zoom or minimap.
  const zoomOut = page.locator('.hud-zoom__out');
  const minimap = page.locator('.hud-minimap__surface');
  await expect(zoomOut).toBeVisible();
  await expect(minimap).toBeVisible();
  console.log(`[yard-957] controls: zoomOut=${await zoomOut.getAttribute('title')}; minimap=${await minimap.innerText()}`);

  const tileSpan = async (): Promise<number> => {
    await page.locator('.hud-build__remove').click();
    const read = async (x: number) => {
      const commands = await press(page, x, 260);
      const wall = commands.find((command) => command['type'] === 'RemoveWall');
      if (wall === undefined) throw new Error(`No tile reading at ${x},260: ${JSON.stringify(commands)}`);
      return wall['x'] as number;
    };
    const span = (await read(900)) - (await read(420));
    await page.locator('.hud-build__remove').click();
    return span;
  };
  const before = await tileSpan();
  for (let step = 0; step < 3; step += 1) await zoomOut.click();
  const after = await tileSpan();
  console.log(`[yard-957] 480px world span: ${before} tiles before Zoom out, ${after} after 3 presses`);
  expect(after).toBeGreaterThan(before);
});
