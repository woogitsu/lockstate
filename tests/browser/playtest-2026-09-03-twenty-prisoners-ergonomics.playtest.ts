/**
 * The companion to `playtest-2026-09-03-is-there-a-game-here.playtest.ts`:
 * what a *populated* prison costs the hands, and what the game asks of the
 * player once it works.
 *
 * **Not a CI gate** -- `.playtest.ts` is collected only by
 * `tests/browser/playwright.playtest.config.ts`, never by
 * `tests/browser/playwright.config.ts`.
 *
 * It builds the cheap version of a working prison (one cell block, twelve beds,
 * two toilets -- 36 typed orders rather than 167), admits twenty prisoners,
 * hires guards, and then measures the *interaction surface*: every visible
 * control on every tab with its enabled state, the press cost of five routine
 * things a player would do at twenty prisoners, and what the roster can and
 * cannot show about twenty people.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  calibrate,
  currentTick,
  fastForwardToMax,
  installTee,
  latestCounts,
  openApp,
  panelText,
  sentCommands,
  tab,
  waitForQueueEmpty,
} from './playtest-harness.ts';

const LABEL = 'twenty';
const log = (line: string) => console.log(`[${LABEL}] ${line}`);

let presses = 0;
function countPress(): void {
  presses += 1;
}
async function click(page: Page, selector: string): Promise<void> {
  await page.locator(selector).first().click();
  countPress();
}
async function fillField(page: Page, selector: string, value: string): Promise<void> {
  await page.locator(selector).first().fill(value);
  countPress();
}

let selectedBuildable = '';
let selectedEdge = '';

async function openBuildCoordinates(page: Page): Promise<void> {
  await click(page, '.hud__tabs [data-tab="build"]');
  const section = page.locator('.hud-build__coordinates');
  if ((await section.getAttribute('data-collapsed')) === 'true') {
    await click(page, '.hud-build__coordinates > .ui-section__header');
  }
  await expect(section).toHaveAttribute('data-collapsed', 'false');
}

async function order(page: Page, buildableId: string, x: number, y: number, edge?: 'north' | 'west'): Promise<number> {
  const before = (await sentCommands(page)).length;
  if (selectedBuildable !== buildableId) {
    await click(page, `.hud-build__list [data-buildable="${buildableId}"]`);
    selectedBuildable = buildableId;
    selectedEdge = '';
  }
  const fields = page.locator('.hud-build__coords .ui-number__input');
  await fields.nth(0).fill(String(x));
  countPress();
  await fields.nth(1).fill(String(y));
  countPress();
  if (edge !== undefined && selectedEdge !== edge) {
    await click(page, `.hud-build__coordinates [data-choice="${edge}"]`);
    selectedEdge = edge;
  }
  await click(page, '.hud-build__coordinates .ui-action');
  return (await sentCommands(page)).length - before;
}

async function buy(page: Page, buildableId: string, quantity: number): Promise<void> {
  await click(page, `.hud-build__list [data-buildable="${buildableId}"]`);
  selectedBuildable = buildableId;
  selectedEdge = '';
  const buyRow = page.locator('.hud-build__buy');
  if (await buyRow.isHidden()) await click(page, '.hud-build__buy-toggle');
  await fillField(page, '.hud-build__buy .ui-number__input', String(quantity));
  await click(page, '.hud-build__buy-submit');
  await page.waitForTimeout(250);
}

/** Every control the player can actually see and press, per tab. */
async function controlInventory(page: Page, tabId: string): Promise<string> {
  return page.evaluate(() => {
    const hud = document.querySelector('.hud');
    if (hud === null) return 'no .hud';
    const rows: string[] = [];
    for (const node of hud.querySelectorAll<HTMLElement>('button, input, select, [role="button"], [role="radio"], [role="switch"]')) {
      if (node.getClientRects().length === 0) continue;
      const label = (node.getAttribute('aria-label') ?? node.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 48);
      const disabled = (node as HTMLButtonElement).disabled === true || node.getAttribute('aria-disabled') === 'true';
      const kind = node.tagName.toLowerCase() + (node.getAttribute('type') === null ? '' : `[${node.getAttribute('type')}]`);
      rows.push(`${disabled ? 'OFF' : ' ON'} ${kind} ${JSON.stringify(label)}`);
    }
    return rows.join('\n');
  });
}

test('what a populated prison costs the hands', async ({ page }) => {
  test.setTimeout(1_800_000);
  const started = Date.now();
  const t = () => `t+${Math.round((Date.now() - started) / 1000)}s`;

  await installTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  countPress();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');

  await tab(page, 'build').click();
  await calibrate(page);

  // ---- a cell block: 22 segments, 12 beds, 2 toilets ------------------
  await buy(page, 'wall-brick', 46);
  await buy(page, 'bed-wooden', 13);
  await fastForwardToMax(page);
  await page.waitForTimeout(8000);

  await openBuildCoordinates(page);
  const segments: { x: number; y: number; edge: 'north' | 'west'; door: boolean }[] = [];
  for (let x = 5; x <= 10; x += 1) {
    segments.push({ x, y: 9, edge: 'north', door: false });
    segments.push({ x, y: 14, edge: 'north', door: false });
  }
  for (let y = 9; y <= 13; y += 1) {
    segments.push({ x: 5, y, edge: 'west', door: false });
    segments.push({ x: 11, y, edge: 'west', door: y === 11 });
  }
  for (const s of segments) await order(page, s.door ? 'door-wooden' : 'wall-brick', s.x, s.y, s.edge);
  log(`${t()} ${segments.length} perimeter orders placed, ${presses} presses so far`);
  await waitForQueueEmpty(page, 600_000);

  // zone it
  await click(page, '.hud__tabs [data-tab="rooms"]');
  const roomsPanel = page.locator('.hud-rooms');
  if ((await roomsPanel.getAttribute('data-collapsed')) === 'true') {
    await click(page, '.hud-rooms > .ui-panel__header > .ui-panel__toggle');
  }
  let rooms = 0;
  for (let attempt = 1; attempt <= 6 && rooms === 0; attempt += 1) {
    await click(page, '.hud-rooms__list [data-room="room.cell"]');
    const section = page.locator('.hud-rooms__coordinates');
    if ((await section.getAttribute('data-collapsed')) === 'true') {
      await click(page, '.hud-rooms__coordinates > .ui-section__header');
    }
    await fillField(page, '.hud-rooms__coord-x .ui-number__input', '5');
    await fillField(page, '.hud-rooms__coord-y .ui-number__input', '9');
    await fillField(page, '.hud-rooms__coord-width .ui-number__input', '6');
    await fillField(page, '.hud-rooms__coord-height .ui-number__input', '5');
    await click(page, '.hud-rooms__coordinates-submit');
    await page.waitForTimeout(250);
    const confirm = page.locator('.hud-rooms__confirm');
    if (await confirm.isVisible()) await click(page, '.hud-rooms__confirm');
    await page.waitForTimeout(800);
    rooms = (await latestCounts(page))?.rooms ?? 0;
    if (rooms === 0) await page.waitForTimeout(4000);
  }
  log(`${t()} zoned: rooms=${rooms}`);

  await openBuildCoordinates(page);
  for (const y of [10, 12]) for (const x of [5, 6, 7, 8, 9, 10]) await order(page, 'bed-wooden', x, y);
  await order(page, 'toilet-brick', 5, 9);
  await order(page, 'toilet-brick', 6, 9);
  await waitForQueueEmpty(page, 600_000);
  await page.waitForTimeout(3000);
  log(`${t()} cell block furnished: counts=${JSON.stringify(await latestCounts(page))}, ${presses} presses`);

  // ---- twenty prisoners and six guards -------------------------------
  await click(page, '.hud__tabs [data-tab="security"]');
  const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
  if ((await guardRow.count()) > 0) await click(page, '.hud-staff__list [data-staff-role="staff-role.guard"]');
  for (let i = 0; i < 6; i += 1) {
    await click(page, '.hud-staff__hire');
    await page.waitForTimeout(250);
  }
  await click(page, '.hud__tabs [data-tab="overview"]');
  const admitPresses = presses;
  let admitted = 0;
  for (let i = 0; i < 20; i += 1) {
    const admit = page.locator('.hud-intake__admit');
    if ((await admit.getAttribute('disabled')) !== null) break;
    await admit.click();
    countPress();
    admitted += 1;
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(6000);
  log(`${t()} ${admitted} admitted in ${presses - admitPresses} presses; counts=${JSON.stringify(await latestCounts(page))}`);
  log(`intake panel:\n${await panelText(page, '.hud-intake')}`);

  // ---- MEASUREMENT 1: the control inventory, tab by tab --------------
  for (const id of ['overview', 'build', 'rooms', 'security', 'regime'] as const) {
    await click(page, `.hud__tabs [data-tab="${id}"]`);
    await page.waitForTimeout(400);
    log(`=== CONTROLS on the ${id} tab ===\n${await controlInventory(page, id)}`);
    await page.screenshot({ path: `playtest-out/tab-${id}.png` });
  }

  // ---- MEASUREMENT 2: what the roster shows for twenty people --------
  await click(page, '.hud__tabs [data-tab="regime"]');
  await page.waitForTimeout(600);
  const rosterRows = await page.locator('.hud-regime__roster-row').count();
  log(`ROSTER: ${rosterRows} rows on screen for ${admitted} prisoners. count line = ${JSON.stringify(await panelText(page, '.hud-regime__roster-count'))}`);
  log(`ROSTER text:\n${await panelText(page, '.hud-regime__roster-list')}`);
  const scroll = await page.evaluate(() => {
    const list = document.querySelector<HTMLElement>('.hud-regime__roster-list');
    if (list === null) return 'absent';
    return `clientHeight=${list.clientHeight} scrollHeight=${list.scrollHeight} overflowY=${getComputedStyle(list).overflowY}`;
  });
  log(`ROSTER box: ${scroll}`);
  log(`REGIME timetable:\n${await panelText(page, '.hud-regime__blocks')}`);

  // Is a single prisoner reachable at all? Click a roster row and see.
  const firstRow = page.locator('.hud-regime__roster-row').first();
  const beforeRowClick = (await sentCommands(page)).length;
  const rowText = (await firstRow.innerText()).replace(/\n/g, ' | ');
  await firstRow.click({ force: true });
  countPress();
  await page.waitForTimeout(600);
  log(`clicking the first roster row (${JSON.stringify(rowText)}) produced ${(await sentCommands(page)).length - beforeRowClick} command(s); a detail panel? ${JSON.stringify(await panelText(page, '.hud-prisoner'))}`);

  // Clicking a prisoner in the world.
  const beforeWorldClick = (await sentCommands(page)).length;
  await page.mouse.click(700, 400);
  countPress();
  await page.waitForTimeout(600);
  log(`clicking the world at (700,400) produced ${(await sentCommands(page)).length - beforeWorldClick} command(s); refusal band ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);

  // ---- MEASUREMENT 3: five routine things, in presses ----------------
  const cost = async (name: string, action: () => Promise<void>): Promise<void> => {
    const before = presses;
    const at = Date.now();
    await action();
    log(`PRESS COST  ${name}: ${presses - before} presses, ${Date.now() - at}ms`);
  };

  await cost('buy 100 more bricks', async () => {
    await click(page, '.hud__tabs [data-tab="build"]');
    await buy(page, 'wall-brick', 100);
  });

  await cost('order ten more beds (typed route)', async () => {
    await openBuildCoordinates(page);
    for (let i = 0; i < 10; i += 1) await order(page, 'bed-wooden', 7 + (i % 4), 9);
  });

  await cost('hire one more guard', async () => {
    await click(page, '.hud__tabs [data-tab="security"]');
    const row = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
    if ((await row.count()) > 0) await click(page, '.hud-staff__list [data-staff-role="staff-role.guard"]');
    await click(page, '.hud-staff__hire');
  });

  await cost('read every prisoner\'s state once', async () => {
    await click(page, '.hud__tabs [data-tab="regime"]');
    const list = page.locator('.hud-regime__roster-list');
    // A player scrolls. Count the wheel notches needed to see the bottom.
    let notches = 0;
    for (;;) {
      const done = await list.evaluate((el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 2);
      if (done || notches > 40) break;
      await list.hover();
      await page.mouse.wheel(0, 120);
      countPress();
      notches += 1;
      await page.waitForTimeout(60);
    }
    log(`  ...${notches} wheel notches to reach the bottom of the roster`);
  });

  await cost('cancel one queued order', async () => {
    await click(page, '.hud__tabs [data-tab="build"]');
    const rows = page.locator('.hud-build__queue-row button');
    log(`  ...${await rows.count()} cancel control(s) for ${await page.locator('.hud-build__queue-row').count()} queue rows`);
    if ((await rows.count()) > 0) await rows.first().click();
    countPress();
  });

  // ---- MEASUREMENT 4: can the player see their prison? ---------------
  await page.screenshot({ path: 'playtest-out/twenty-default-camera.png' });
  const canvas = page.locator('#game-root canvas');
  await canvas.hover();
  for (let i = 0; i < 6; i += 1) {
    await page.mouse.wheel(0, 240);
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'playtest-out/twenty-zoomed-out.png' });
  log(`after six wheel-out notches over the canvas: a screenshot was taken (playtest-out/twenty-zoomed-out.png)`);

  // ---- MEASUREMENT 5: can money kill you? ---------------------------
  log(`FUNDS before overspending: ${await panelText(page, '[data-metric="funds"] .ui-stat__value')}`);
  await click(page, '.hud__tabs [data-tab="security"]');
  const before = presses;
  let hires = 0;
  for (let i = 0; i < 30; i += 1) {
    const hire = page.locator('.hud-staff__hire');
    if ((await hire.getAttribute('disabled')) !== null) {
      log(`hire went disabled after ${hires} extra guards`);
      break;
    }
    await hire.click();
    countPress();
    hires += 1;
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(3000);
  log(`hired ${hires} more guards in ${presses - before} presses. counts=${JSON.stringify(await latestCounts(page))}`);
  log(`staff panel:\n${await panelText(page, '.hud-staff')}`);
  log(`FUNDS now: ${await panelText(page, '[data-metric="funds"] .ui-stat__value')} | refusal ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);

  // let payroll run over a day boundary or two and see what the game says
  const tick0 = await currentTick(page);
  for (let i = 0; i < 24; i += 1) {
    await page.waitForTimeout(20_000);
    const funds = await panelText(page, '[data-metric="funds"] .ui-stat__value');
    log(`BROKE-WATCH ${i}: tick=${await currentTick(page)} funds=${funds} alerts=${JSON.stringify((await panelText(page, '.hud-alerts__list')).replace(/\n/g, ' ; '))}`);
  }
  log(`BROKE-WATCH ran ticks ${tick0} -> ${await currentTick(page)}`);
  log(`final counts=${JSON.stringify(await latestCounts(page))}`);
  await page.screenshot({ path: 'playtest-out/twenty-broke.png' });
  log(`TOTAL presses for this whole session: ${presses}`);
});
