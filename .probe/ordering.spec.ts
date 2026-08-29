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
  sentCommands,
  workerReplies,
} from './lib';

/**
 * The ordering lead, at the BINDING viewport (900x600), mouse-driven.
 *
 * Question: does anything on screen ever tell a new player that walls must
 * exist before a room can be zoned?
 */
test('naive route at 900x600: what does the game say about walls?', async ({ page }) => {
  test.setTimeout(420_000);
  const console_ = attachConsole(page);
  await page.setViewportSize({ width: 900, height: 600 });
  await installCommandTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');

  const arrival = await dumpHud(page, 'ARRIVAL (900x600, Overview tab, nothing pressed)');
  console.log(`ARRIVAL mentions "wall"? ${/wall/i.test(arrival)}`);
  console.log(`ARRIVAL mentions "enclos"? ${/enclos/i.test(arrival)}`);

  await tab(page, 'build');
  const origin = await calibrate(page);
  console.log(`origin = ${JSON.stringify(origin)} (checked against a real RemoveObject)`);

  // --- naive step 1: Rooms -> Cell -> draw -> designate ---------------
  await tab(page, 'rooms');
  await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
  const picked = await dumpHud(page, 'ROOMS: Cell selected, not yet armed');
  console.log(`after picking Cell, mentions "wall"? ${/wall/i.test(picked)}`);

  await page.locator('.hud-rooms__arm').click();
  await dumpHud(page, 'ROOMS: armed');

  const from = centreOf(origin, 12, 12);
  const to = centreOf(origin, 15, 15);
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, from)).toBe('CANVAS');
  await drag(page, from, to);
  const drawn = await dumpHud(page, 'ROOMS: 4x4 drawn, before Designate');
  console.log(`with the area drawn, mentions "wall"? ${/wall/i.test(drawn)}`);

  const confirm = page.locator('.hud-rooms__confirm');
  console.log(`Designate: visible=${await confirm.isVisible()} enabled=${await confirm.isEnabled()}`);
  await confirm.click();
  await page.waitForTimeout(700);

  const refused = await dumpHud(page, 'AFTER the refused Designate');
  console.log(`refusal text mentions "wall"?  ${/wall/i.test(refused)}`);
  console.log(`refusal text mentions "build"? ${/\bbuild\b/i.test(refused)}`);
  console.log(`ROOMS count line: ${JSON.stringify((await panelText(page, '.hud-strip')).replace(/\n/g, ' | '))}`);

  // --- naive step 2: the player goes to Build and tries a wall with no
  //     bricks. What does the game say?
  await tab(page, 'build');
  const buildArrival = await dumpHud(page, 'BUILD tab, arrival, before selecting anything');
  console.log(`Build arrival mentions "brick"? ${/brick/i.test(buildArrival)}`);

  await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
  const wallPicked = await dumpHud(page, 'BUILD: wall-brick selected (stock/afford readout?)');
  console.log(`wall selected: mentions "stock"/"material"/"buy"? ${/stock|material|buy/i.test(wallPicked)}`);

  await armBuild(page, 'wall-brick');
  const north = origin.originY + 12 * 64;
  const west = origin.originX + 12 * 64;
  const produced = await drag(page, { x: west + 32, y: north }, { x: west + 4 * 64 - 32, y: north });
  console.log(`one wall run with ZERO bricks produced: ${JSON.stringify(produced)}`);
  await page.waitForTimeout(1200);
  const afterWall = await dumpHud(page, 'AFTER a wall run placed with no bricks');
  console.log(`mentions "awaiting"?  ${/awaiting/i.test(afterWall)}`);
  console.log(`mentions "material"?  ${/material/i.test(afterWall)}`);
  console.log(
    `queue section collapsed attr: ${await page.evaluate(() => {
      const rows = [...document.querySelectorAll<HTMLElement>('.hud-build .ui-section')].map((s) => ({
        header: s.querySelector<HTMLElement>('.ui-section__header')?.innerText,
        collapsed: s.getAttribute('data-collapsed') ?? s.querySelector('[aria-expanded]')?.getAttribute('aria-expanded'),
        h: Math.round(s.getBoundingClientRect().height),
      }));
      return JSON.stringify(rows);
    })}`,
  );
  console.log(`.hud-build__queue -> ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);

  // --- how long does the player wait before anything changes? ---------
  await page.getByRole('button', { name: 'Fast forward' }).click();
  for (const t of [5000, 10000, 20000]) {
    await page.waitForTimeout(t);
    console.log(
      `t+${t}: day ${await page.locator('.hud-clock__day').innerText()} | queue ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`,
    );
  }
  await dumpHud(page, 'AFTER 35s of fast-forward with an unfunded wall order');

  console.log('=== worker replies (no deltas) ===');
  for (const r of await workerReplies(page)) console.log(JSON.stringify(r).slice(0, 500));
  console.log(`=== commands sent: ${JSON.stringify(await sentCommands(page))}`);
  console.log('=== console ===');
  console.log(console_.join('\n') || '(nothing)');
});
