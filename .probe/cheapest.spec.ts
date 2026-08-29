import { expect, test } from '@playwright/test';
import { armBuild, attachConsole, calibrate, centreOf, drag, installCommandTee, openApp, panelText, tab, TILE } from './lib';
import { createHash } from 'node:crypto';

/** The measurement named as cheapest in §7's "not reached": are the finished walls DRAWN during the window? */
test('are the finished walls on screen before the next snapshot?', async ({ page }) => {
  test.setTimeout(600_000);
  const console_ = attachConsole(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await installCommandTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tab(page, 'build');
  const o = await calibrate(page);

  await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
  if (!(await page.locator('.hud-build__buy').isVisible())) await page.locator('.hud-build__buy-toggle').click();
  await page.waitForTimeout(200);
  await page.locator('.hud-build__buy .ui-number__input').fill('60');
  await page.locator('.hud-build__buy-submit').click();
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await page.waitForTimeout(8000);

  await armBuild(page, 'wall-brick');
  const north = o.originY + 12 * TILE;
  const south = o.originY + 16 * TILE;
  const west = o.originX + 12 * TILE;
  const east = o.originX + 16 * TILE;
  for (const r of [
    { a: { x: west + TILE / 2, y: north }, b: { x: east - TILE / 2, y: north } },
    { a: { x: west + TILE / 2, y: south }, b: { x: east - TILE / 2, y: south } },
    { a: { x: west, y: north + TILE / 2 }, b: { x: west, y: south - TILE / 2 } },
    { a: { x: east, y: north + TILE / 2 }, b: { x: east, y: south - TILE / 2 } },
  ]) {
    await drag(page, r.a, r.b);
  }

  for (let i = 0; i < 60; i += 1) {
    await page.waitForTimeout(1000);
    if ((await panelText(page, '.hud-build__queue')).includes('not laid out')) {
      console.log(`queue empty at t=${await page.evaluate(() => Math.round(performance.now()))}ms`);
      break;
    }
  }

  // Disarm so no ghost overlay is drawn, then shoot the room region repeatedly.
  await page.locator('.hud-build__arm').click().catch(() => undefined);
  await page.mouse.move(20, 500);
  await page.waitForTimeout(300);
  const clip = { x: west - 32, y: north - 32, width: 4 * TILE + 64, height: 4 * TILE + 64 };
  const hashes: string[] = [];
  for (let i = 0; i < 12; i += 1) {
    const shot = await page.screenshot({ clip });
    const h = createHash('sha256').update(shot).digest('hex').slice(0, 12);
    hashes.push(h);
    console.log(`t=${await page.evaluate(() => Math.round(performance.now()))}ms wallRegionHash=${h}`);
    await page.waitForTimeout(2500);
  }
  console.log(`distinct hashes: ${new Set(hashes).size} of ${hashes.length}`);
  console.log('=== console ===');
  console.log(console_.join('\n') || '(nothing)');
});

/** §3's open question: does a trackpad's two-finger swipe (a `wheel`) help a 900x600 player reach more world? */
test('what a wheel does to the reachable world at 900x600', async ({ page }) => {
  test.setTimeout(240_000);
  attachConsole(page);
  await page.setViewportSize({ width: 900, height: 600 });
  await installCommandTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tab(page, 'build');
  const o = await calibrate(page);

  const countReachable = async (): Promise<number> =>
    page.evaluate(() => {
      let n = 0;
      for (let y = 0; y < window.innerHeight; y += 16)
        for (let x = 0; x < window.innerWidth; x += 16)
          if (document.elementFromPoint(x, y)?.tagName.toLowerCase() === 'canvas') n += 1;
      return n;
    });

  console.log(`canvas sample points before any wheel: ${await countReachable()}`);
  // A tile probe, so "how much world" is measured rather than "how much canvas".
  const tileAt = async (px: number, py: number): Promise<{ x: unknown; y: unknown } | null> => {
    await page.locator('.hud-build__remove').click();
    const cmds = await (async () => {
      const { press } = await import('./lib');
      return press(page, px, py);
    })();
    await page.locator('.hud-build__remove').click();
    const r = cmds.find((c) => c['type'] === 'RemoveObject');
    return r === undefined ? null : { x: r['x'], y: r['y'] };
  };
  const centre = centreOf(o, 16, 16);
  console.log(`tile under screen centre before wheel: ${JSON.stringify(await tileAt(centre.x, centre.y))}`);

  // Ten wheel-down notches over the world, which is what a trackpad pinch-out
  // or two-finger swipe reaches this page as.
  for (let i = 0; i < 10; i += 1) {
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(500);
  console.log(`canvas sample points after 10 wheel-down: ${await countReachable()}`);
  console.log(`tile under screen centre after wheel-down: ${JSON.stringify(await tileAt(centre.x, centre.y))}`);
  console.log(`tile 100px right of centre: ${JSON.stringify(await tileAt(centre.x + 100, centre.y))}`);
});
