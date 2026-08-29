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
  tab,
  TILE,
} from './lib';

/**
 * Issue #492 chose a NARROW supersession key: a successful zoning withdraws a
 * standing refusal only about *that exact rectangle and room type*
 * (`src/simulation/runtime/session-commands.ts:148-163`). The issue asked the
 * question explicitly and the implementation answered it in a comment:
 * "a room zoned *elsewhere* leaves a standing refusal about *this* rectangle
 * alone, because its key would not match."
 *
 * This walks the recovery a player actually performs -- refused on one
 * rectangle, then walls, then a rectangle that is NOT byte-identical -- and
 * measures what the band says afterwards.
 */
test('refused at one rectangle, succeed at another: what does the band say?', async ({ page }) => {
  test.setTimeout(600_000);
  const console_ = attachConsole(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await installCommandTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tab(page, 'build');
  const o = await calibrate(page);

  // 1. the naive designation, at 10,12 .. 13,15
  await tab(page, 'rooms');
  await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
  await page.locator('.hud-rooms__arm').click();
  await drag(page, centreOf(o, 10, 12), centreOf(o, 13, 15));
  await page.locator('.hud-rooms__confirm').click();
  await page.waitForTimeout(700);
  const refusedBand = await panelText(page, '.hud__refusal');
  console.log(`BAND after the refused 4x4 at (10,12): ${JSON.stringify(refusedBand)}`);

  // 2. buy bricks, wall a DIFFERENT rectangle: 10,12 .. 14,16 (5x5).
  await tab(page, 'build');
  await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
  if (!(await page.locator('.hud-build__buy').isVisible())) await page.locator('.hud-build__buy-toggle').click();
  await page.waitForTimeout(200);
  await page.locator('.hud-build__buy .ui-number__input').fill('60');
  await page.locator('.hud-build__buy-submit').click();
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await page.waitForTimeout(8000);

  await armBuild(page, 'wall-brick');
  const north = o.originY + 12 * TILE;
  const south = o.originY + 17 * TILE;
  const west = o.originX + 10 * TILE;
  const east = o.originX + 15 * TILE;
  for (const r of [
    { a: { x: west + TILE / 2, y: north }, b: { x: east - TILE / 2, y: north } },
    { a: { x: west + TILE / 2, y: south }, b: { x: east - TILE / 2, y: south } },
    { a: { x: west, y: north + TILE / 2 }, b: { x: west, y: south - TILE / 2 } },
    { a: { x: east, y: north + TILE / 2 }, b: { x: east, y: south - TILE / 2 } },
  ]) {
    await drag(page, r.a, r.b);
  }
  for (let i = 0; i < 12; i += 1) {
    await page.waitForTimeout(5000);
    const q = await panelText(page, '.hud-build__queue');
    console.log(`  build t+${(i + 1) * 5}s: ${JSON.stringify(q.replace(/\n/g, ' | '))}`);
    if (q.includes('not laid out')) break;
  }

  // 3. designate the rectangle the walls actually enclose: 10,12 .. 14,16
  await tab(page, 'rooms');
  if (!(await page.locator('.hud-rooms__list').isVisible()))
    await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
  await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
  const armLabel = (await page.locator('.hud-rooms__arm').innerText()).trim().toLowerCase();
  if (armLabel.startsWith('draw')) await page.locator('.hud-rooms__arm').click();
  await drag(page, centreOf(o, 10, 12), centreOf(o, 14, 16));
  console.log(`pending: ${JSON.stringify(await panelText(page, '.hud-rooms__map'))}`);
  await page.locator('.hud-rooms__confirm').click();
  await page.waitForTimeout(1200);

  const strip = (await panelText(page, '.hud-strip')).replace(/\n/g, ' | ');
  const band = await panelText(page, '.hud__refusal');
  console.log(`ROOMS: ${strip}`);
  console.log(`BAND after the SUCCESSFUL 5x5 at (10,12): ${JSON.stringify(band)}`);
  await dumpHud(page, 'after a success on a rectangle that is not the refused one');
  console.log('=== console ===');
  console.log(console_.join('\n') || '(nothing)');
});
