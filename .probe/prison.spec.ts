import { expect, test, type Page } from '@playwright/test';
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
  tab,
  workerReplies,
  TILE,
  type Origin,
} from './lib';

async function buy(page: Page, buildable: string, quantity: number): Promise<void> {
  await page.locator(`.hud-build__list [data-buildable="${buildable}"]`).click();
  if (!(await page.locator('.hud-build__buy').isVisible())) await page.locator('.hud-build__buy-toggle').click();
  await page.waitForTimeout(250);
  console.log(`  buy row for ${buildable}: ${JSON.stringify(await panelText(page, '.hud-build__buy'))}`);
  await page.locator('.hud-build__buy .ui-number__input').fill(String(quantity));
  await page.locator('.hud-build__buy-submit').click();
  await page.waitForTimeout(400);
  console.log(`  deliveries: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);
}

async function wallBoxAround(page: Page, o: Origin, x0: number, y0: number, x1: number, y1: number): Promise<void> {
  const north = o.originY + y0 * TILE;
  const south = o.originY + (y1 + 1) * TILE;
  const west = o.originX + x0 * TILE;
  const east = o.originX + (x1 + 1) * TILE;
  const runs = [
    { n: 'north', a: { x: west + TILE / 2, y: north }, b: { x: east - TILE / 2, y: north } },
    { n: 'south', a: { x: west + TILE / 2, y: south }, b: { x: east - TILE / 2, y: south } },
    { n: 'west', a: { x: west, y: north + TILE / 2 }, b: { x: west, y: south - TILE / 2 } },
    { n: 'east', a: { x: east, y: north + TILE / 2 }, b: { x: east, y: south - TILE / 2 } },
  ];
  for (const r of runs) {
    const produced = await drag(page, r.a, r.b);
    console.log(`  wall run ${r.n} [${x0},${y0}]-[${x1},${y1}]: ${produced.length} cmd ${JSON.stringify(produced)}`);
  }
}

async function zone(page: Page, o: Origin, room: string, x0: number, y0: number, x1: number, y1: number): Promise<void> {
  await tab(page, 'rooms');
  const listVisible = await page.locator('.hud-rooms__list').isVisible();
  console.log(`  Rooms panel on arrival: catalogue visible=${listVisible}, panel data-collapsed=${await page.locator('.hud-rooms').getAttribute('data-collapsed')}, header=${JSON.stringify((await page.locator('.hud-rooms > .ui-panel__header').innerText()).replace(/\n/g, ' | '))}`);
  if (!listVisible) {
    console.log('  >>> the room-type catalogue was NOT on screen; expanding the panel by hand');
    await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    await page.waitForTimeout(250);
  }
  await page.locator(`.hud-rooms__list [data-room="${room}"]`).click();
  const armLabel = (await page.locator('.hud-rooms__arm').innerText()).trim().toLowerCase();
  if (armLabel.startsWith('draw')) await page.locator('.hud-rooms__arm').click();
  await drag(page, centreOf(o, x0, y0), centreOf(o, x1, y1));
  console.log(`  rooms rule block: ${JSON.stringify(await panelText(page, '.hud-rooms__rule-block'))}`);
  console.log(`  designate label: ${JSON.stringify((await page.locator('.hud-rooms__confirm').innerText()).trim())}`);
  await page.locator('.hud-rooms__confirm').click();
  await page.waitForTimeout(600);
  console.log(`  refusal band now: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
}

test('a prison larger than one cell, then guards and prisoners and a whole day', async ({ page }) => {
  test.setTimeout(900_000);
  const console_ = attachConsole(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await installCommandTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tab(page, 'build');
  const o = await calibrate(page);
  console.log(`origin ${JSON.stringify(o)}`);

  // ---- materials ---------------------------------------------------
  await buy(page, 'wall-brick', 160);
  await buy(page, 'door-wooden', 6);
  await buy(page, 'bed-wooden', 6);
  await buy(page, 'toilet-brick', 6);
  console.log(`strip after buying: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);

  await page.getByRole('button', { name: 'Fast forward' }).click();
  for (let i = 0; i < 6; i += 1) {
    await page.waitForTimeout(5000);
    const d = await panelText(page, '.hud-build__deliveries');
    console.log(`  t+${(i + 1) * 5}s day=${await page.locator('.hud-clock__day').innerText()} deliveries=${JSON.stringify(d)}`);
    if (d.includes('not laid out') || d === '') break;
  }
  await dumpHud(page, 'after the deliveries landed');

  // ---- two cells, walls first --------------------------------------
  await tab(page, 'build');
  await armBuild(page, 'wall-brick');
  await wallBoxAround(page, o, 10, 12, 13, 15);
  await wallBoxAround(page, o, 16, 12, 19, 15);
  console.log(`queue right after 8 runs: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);

  for (let i = 0; i < 10; i += 1) {
    await page.waitForTimeout(5000);
    const q = await panelText(page, '.hud-build__queue');
    console.log(`  build t+${(i + 1) * 5}s: ${JSON.stringify(q.replace(/\n/g, ' | ').slice(0, 220))}`);
    if (q.includes('not laid out')) break;
  }
  await dumpHud(page, 'after the eight wall runs finished (or gave up)');

  // ---- doors -------------------------------------------------------
  await tab(page, 'build');
  await armBuild(page, 'door-wooden');
  for (const [tx, ty] of [
    [11, 15],
    [17, 15],
  ] as const) {
    const p = { x: o.originX + tx * TILE + TILE / 2, y: o.originY + (ty + 1) * TILE };
    console.log(`  door press at tile(${tx},${ty}) south edge: ${JSON.stringify(await press(page, p.x, p.y))}`);
  }
  await page.waitForTimeout(12_000);

  // ---- zone both cells ---------------------------------------------
  console.log('--- zoning cell A ---');
  await zone(page, o, 'room.cell', 10, 12, 13, 15);
  console.log('--- zoning cell B ---');
  await zone(page, o, 'room.cell', 16, 12, 19, 15);
  console.log(`ROOMS now: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
  await dumpHud(page, 'after zoning both cells');

  // ---- furniture ---------------------------------------------------
  await tab(page, 'build');
  for (const [buildable, tx, ty] of [
    ['bed-wooden', 11, 13],
    ['toilet-brick', 12, 13],
    ['bed-wooden', 17, 13],
    ['toilet-brick', 18, 13],
  ] as const) {
    await armBuild(page, buildable);
    const p = centreOf(o, tx, ty);
    console.log(`  ${buildable} @ (${tx},${ty}): ${JSON.stringify(await press(page, p.x, p.y))}`);
  }
  await page.waitForTimeout(15_000);
  await tab(page, 'rooms');
  console.log(`rooms needs: ${JSON.stringify(await panelText(page, '.hud-rooms'))}`);
  await dumpHud(page, 'after furniture');

  // ---- hire guards --------------------------------------------------
  await tab(page, 'security');
  await page.waitForTimeout(300);
  for (let i = 0; i < 2; i += 1) {
    const hire = page.locator('.hud-staff__hire');
    console.log(`  hire button "${(await hire.innerText()).trim()}" enabled=${await hire.isEnabled()}`);
    await hire.click();
    await page.waitForTimeout(1500);
  }
  console.log(`staff panel after hiring: ${JSON.stringify(await panelText(page, '.hud-staff'))}`);
  await dumpHud(page, 'after hiring two guards');

  // ---- admit prisoners ----------------------------------------------
  await tab(page, 'overview');
  await page.waitForTimeout(300);
  console.log(`intake before admitting: ${JSON.stringify(await panelText(page, '.hud-intake'))}`);
  for (let i = 0; i < 3; i += 1) {
    const admit = page.locator('.hud-intake__admit');
    console.log(`  admit "${(await admit.innerText()).trim()}" enabled=${await admit.isEnabled()}`);
    if (!(await admit.isEnabled())) break;
    await admit.click();
    await page.waitForTimeout(2500);
    console.log(`  intake now: ${JSON.stringify(await panelText(page, '.hud-intake'))}`);
  }
  await dumpHud(page, 'after admitting');

  // ---- run a whole day ----------------------------------------------
  const startDay = await page.locator('.hud-clock__day').innerText();
  console.log(`running a day from day ${startDay}`);
  for (let i = 0; i < 24; i += 1) {
    await page.waitForTimeout(5000);
    const day = await page.locator('.hud-clock__day').innerText();
    const progress = await page.locator('.hud-clock__day-progress').innerText();
    console.log(
      `  +${(i + 1) * 5}s day=${day} ${progress} | strip=${(await panelText(page, '.hud-strip')).replace(/\n/g, ' ').replace(/\s+/g, ' ').slice(60, 260)}`,
    );
    if (day !== startDay && i > 4) break;
  }
  await dumpHud(page, 'after a day with prisoners and guards');
  await tab(page, 'regime');
  await page.waitForTimeout(500);
  console.log(`REGIME after a day: ${JSON.stringify(await panelText(page, '.hud-regime'))}`);
  await tab(page, 'security');
  await page.waitForTimeout(500);
  console.log(`SECURITY after a day: ${JSON.stringify(await panelText(page, '.hud-staff'))}`);
  await tab(page, 'overview');
  await page.waitForTimeout(500);
  console.log(`INTAKE after a day: ${JSON.stringify(await panelText(page, '.hud-intake'))}`);

  // alerts, opened by hand at the very end
  await page.locator('.hud-minimap .ui-section__header').click();
  await page.waitForTimeout(300);
  console.log(`ALERTS list: ${JSON.stringify(await panelText(page, '.hud-alerts__list'))}`);

  console.log('=== refusals the worker sent ===');
  for (const r of await workerReplies(page)) {
    const s = JSON.stringify(r);
    if (s.includes('refusal') || s.includes('error')) console.log(s.slice(0, 400));
  }
  console.log(`=== ${(await sentCommands(page)).length} commands sent ===`);
  console.log('=== console ===');
  console.log(console_.join('\n') || '(nothing)');
});
