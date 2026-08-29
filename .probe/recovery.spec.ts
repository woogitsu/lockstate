import { expect, test } from '@playwright/test';
import {
  armBuild,
  attachConsole,
  calibrate,
  centreOf,
  drag,
  dumpHud,
  installCommandTee,
  openApp,
  panelText,
  press,
  tab,
  TILE,
  workerReplies,
} from './lib';

/**
 * The recovery route: a player who zones first, is refused, and then works out
 * that they need walls. Does the game let them recover in place, and what does
 * it say while they do?
 */
test('zone -> refused -> build walls -> zone again, at 900x600', async ({ page }) => {
  test.setTimeout(600_000);
  const console_ = attachConsole(page);
  await page.setViewportSize({ width: 900, height: 600 });
  await installCommandTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tab(page, 'build');
  const o = await calibrate(page);
  console.log(`origin ${JSON.stringify(o)}`);

  // The room lives inside the 6x9 free rectangle measured at this viewport:
  // tiles x 14..17, y 13..16.
  const X0 = 14;
  const Y0 = 13;
  const X1 = 17;
  const Y1 = 16;

  // --- 1. the naive designation -------------------------------------
  await tab(page, 'rooms');
  await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
  await page.locator('.hud-rooms__arm').click();
  await drag(page, centreOf(o, X0, Y0), centreOf(o, X1, Y1));
  await page.locator('.hud-rooms__confirm').click();
  await page.waitForTimeout(600);
  await dumpHud(page, 'refused designation, 900x600');

  // --- 2. the player goes and builds walls --------------------------
  await tab(page, 'build');
  await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
  if (!(await page.locator('.hud-build__buy').isVisible())) await page.locator('.hud-build__buy-toggle').click();
  await page.waitForTimeout(200);
  await page.locator('.hud-build__buy .ui-number__input').fill('40');
  await page.locator('.hud-build__buy-submit').click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await page.waitForTimeout(8000);

  await armBuild(page, 'wall-brick');
  const north = o.originY + Y0 * TILE;
  const south = o.originY + (Y1 + 1) * TILE;
  const west = o.originX + X0 * TILE;
  const east = o.originX + (X1 + 1) * TILE;
  for (const r of [
    { n: 'north', a: { x: west + TILE / 2, y: north }, b: { x: east - TILE / 2, y: north } },
    { n: 'south', a: { x: west + TILE / 2, y: south }, b: { x: east - TILE / 2, y: south } },
    { n: 'west', a: { x: west, y: north + TILE / 2 }, b: { x: west, y: south - TILE / 2 } },
    { n: 'east', a: { x: east, y: north + TILE / 2 }, b: { x: east, y: south - TILE / 2 } },
  ]) {
    const produced = await drag(page, r.a, r.b);
    console.log(`  wall run ${r.n}: ${produced.length} cmd (all in world? ${produced.length === 4})`);
  }
  for (let i = 0; i < 12; i += 1) {
    await page.waitForTimeout(5000);
    const q = await panelText(page, '.hud-build__queue');
    console.log(`  build t+${(i + 1) * 5}s: ${JSON.stringify(q.replace(/\n/g, ' | '))}`);
    if (q.includes('not laid out')) break;
  }
  await dumpHud(page, 'walls built, before the second designation');

  // --- 3. the second designation, same rectangle --------------------
  await tab(page, 'rooms');
  const visible = await page.locator('.hud-rooms__list').isVisible();
  console.log(`Rooms catalogue visible when the player comes back? ${visible}`);
  if (!visible) await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
  await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
  const armLabel = (await page.locator('.hud-rooms__arm').innerText()).trim();
  console.log(`arm button reads "${armLabel}"`);
  if (armLabel.toLowerCase().startsWith('draw')) await page.locator('.hud-rooms__arm').click();
  await drag(page, centreOf(o, X0, Y0), centreOf(o, X1, Y1));
  console.log(`AREA block now: ${JSON.stringify(await panelText(page, '.hud-rooms__map'))}`);
  await page.locator('.hud-rooms__confirm').click();
  await page.waitForTimeout(800);
  await dumpHud(page, 'after the SECOND designation');
  console.log(`strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);

  // --- 4. what the panel looks like straight after a success ---------
  console.log(
    `rooms panel immediately after success: catalogueVisible=${await page.locator('.hud-rooms__list').isVisible()} collapsed=${await page.locator('.hud-rooms').getAttribute('data-collapsed')}`,
  );
  console.log(`.hud-rooms text: ${JSON.stringify(await panelText(page, '.hud-rooms'))}`);

  // --- 5. can they place a bed now? ---------------------------------
  await tab(page, 'build');
  await armBuild(page, 'bed-wooden');
  console.log(`bed press: ${JSON.stringify(await press(page, centreOf(o, X0 + 1, Y0 + 1).x, centreOf(o, X0 + 1, Y0 + 1).y))}`);
  await page.waitForTimeout(6000);
  await dumpHud(page, 'after trying to place a bed with no wood bought');

  console.log('=== refusals ===');
  for (const r of await workerReplies(page)) {
    const s = JSON.stringify(r);
    if (s.includes('refusal')) console.log(s.slice(0, 300));
  }
  console.log('=== console ===');
  console.log(console_.join('\n') || '(nothing)');
});
