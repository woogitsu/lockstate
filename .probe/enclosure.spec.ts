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
 * Does the Rooms panel's enclosure warning agree with the simulation on a
 * rectangle that is genuinely walled?
 *
 * `src/ui/hud/rooms-panel.ts:1163-1190` accepts a false negative and names its
 * cause: "`classifyArea`'s answer is only as fresh as the render snapshot
 * feed's own cadence, which can go stale for as long as the session stays
 * paused". This measures a session that is NOT paused.
 */
test('after the walls are up and the clock is running, what does the panel say?', async ({ page }) => {
  test.setTimeout(600_000);
  const console_ = attachConsole(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await installCommandTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tab(page, 'build');
  const o = await calibrate(page);

  const X0 = 12;
  const Y0 = 12;
  const X1 = 15;
  const Y1 = 15;

  await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
  if (!(await page.locator('.hud-build__buy').isVisible())) await page.locator('.hud-build__buy-toggle').click();
  await page.waitForTimeout(200);
  await page.locator('.hud-build__buy .ui-number__input').fill('60');
  await page.locator('.hud-build__buy-submit').click();
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await page.waitForTimeout(8000);

  await armBuild(page, 'wall-brick');
  const north = o.originY + Y0 * TILE;
  const south = o.originY + (Y1 + 1) * TILE;
  const west = o.originX + X0 * TILE;
  const east = o.originX + (X1 + 1) * TILE;
  for (const r of [
    { a: { x: west + TILE / 2, y: north }, b: { x: east - TILE / 2, y: north } },
    { a: { x: west + TILE / 2, y: south }, b: { x: east - TILE / 2, y: south } },
    { a: { x: west, y: north + TILE / 2 }, b: { x: west, y: south - TILE / 2 } },
    { a: { x: east, y: north + TILE / 2 }, b: { x: east, y: south - TILE / 2 } },
  ]) {
    await drag(page, r.a, r.b);
  }
  for (let i = 0; i < 14; i += 1) {
    await page.waitForTimeout(5000);
    const q = await panelText(page, '.hud-build__queue');
    console.log(`build t+${(i + 1) * 5}s: ${JSON.stringify(q.replace(/\n/g, ' | '))}`);
    if (q.includes('not laid out')) break;
  }
  console.log('--- walls finished; the queue section is gone ---');

  await tab(page, 'rooms');
  if (!(await page.locator('.hud-rooms__list').isVisible()))
    await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
  await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
  const armLabel = (await page.locator('.hud-rooms__arm').innerText()).trim().toLowerCase();
  if (armLabel.startsWith('draw')) await page.locator('.hud-rooms__arm').click();

  // Re-drag the same rectangle repeatedly, clock running, and watch the note.
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    await drag(page, centreOf(o, X0, Y0), centreOf(o, X1, Y1));
    const map = (await panelText(page, '.hud-rooms__map')).replace(/\n/g, ' | ');
    const encl = (await panelText(page, '.hud-rooms__status')).replace(/\n/g, ' | ');
    console.log(`attempt ${attempt}: MAP=${JSON.stringify(map)}`);
    console.log(`            STATUS=${JSON.stringify(encl)}`);
    if (attempt < 8) {
      await page.locator('.hud-rooms__cancel').click().catch(() => undefined);
      await page.waitForTimeout(2500);
      if (!(await page.locator('.hud-rooms__list').isVisible()))
        await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
      const label = (await page.locator('.hud-rooms__arm').innerText()).trim().toLowerCase();
      if (label.startsWith('draw')) await page.locator('.hud-rooms__arm').click();
    }
  }

  // Now pause and try once more, then designate for real.
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.waitForTimeout(1000);
  console.log(`paused, same pending rectangle: ${JSON.stringify((await panelText(page, '.hud-rooms__map')).replace(/\n/g, ' | '))}`);
  await page.locator('.hud-rooms__confirm').click();
  await page.waitForTimeout(1200);
  console.log(`strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
  console.log(`band: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
  await dumpHud(page, 'after designating the walled rectangle');
  console.log('=== console ===');
  console.log(console_.join('\n') || '(nothing)');
});
