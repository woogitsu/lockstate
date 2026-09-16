import { test, type Page } from '@playwright/test';
import {
  armBuildable,
  buy,
  calibrate,
  centreOf,
  currentTick,
  drag,
  fastForwardToMax,
  installTee,
  latestCounts,
  openApp,
  panelText,
  press,
  showPanel,
  tab,
  TILE,
  waitForQueueEmpty,
} from './playtest-harness';

/**
 * **Does the game tell the player their cell has no door?**
 *
 * Findings live in
 * `docs/research/2026-09-05-does-the-game-say-there-is-no-door.md`.
 */

const SHOTS = 'docs/research/2026-09-05-does-the-game-say-there-is-no-door';

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/** A screenshot of one element, for the parts of the HUD too small to read whole-page. */
async function shotOf(page: Page, selector: string, name: string): Promise<void> {
  const node = page.locator(selector).first();
  if ((await node.count()) === 0) return;
  if (!(await node.isVisible())) return;
  await node.screenshot({ path: `${SHOTS}/${name}.png` });
}

/** Every chip in the status strip with its accessible text, which is the only place a tooltip lives. */
async function stripChips(page: Page): Promise<readonly string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hud-strip *')]
      .filter((n) => n.hasAttribute('aria-label') || n.hasAttribute('title') || n.hasAttribute('role'))
      .map(
        (n) =>
          `<${n.tagName.toLowerCase()} class="${n.className}"> ${JSON.stringify((n.innerText ?? '').replace(/\s+/g, ' ').trim())}` +
          ` aria-label=${JSON.stringify(n.getAttribute('aria-label'))} title=${JSON.stringify(n.getAttribute('title'))}` +
          ` role=${JSON.stringify(n.getAttribute('role'))} aria-valuenow=${JSON.stringify(n.getAttribute('aria-valuenow'))}`,
      ),
  );
}

/** Every band and panel a player can actually read, right now. */
async function screen(page: Page, label: string): Promise<Record<string, string>> {
  const read = async (selector: string) => panelText(page, selector);
  const out: Record<string, string> = {
    tick: String(await currentTick(page)),
    strip: (await read('.hud-strip')).replace(/\n+/g, ' | '),
    refusal: await read('.hud__refusal'),
    event: await read('.hud__event'),
    alerts: await read('.hud__alerts'),
  };
  console.log(`\n===== SCREEN [${label}] tick ${out['tick']} =====`);
  for (const [key, value] of Object.entries(out)) console.log(`  ${key}: ${JSON.stringify(value)}`);
  return out;
}

test('recon: what the panels offer on arrival', async ({ page }) => {
  await installTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.waitForTimeout(500);

  await shot(page, 'recon-arrival');
  await screen(page, 'arrival');

  for (const id of ['overview', 'build', 'zones', 'manage', 'day-plan'] as const) {
    await tab(page, id).click();
    await page.waitForTimeout(300);
    console.log(`\n----- TAB ${id} -----\n${await panelText(page, '.hud__panels')}`);
    await shot(page, `recon-tab-${id}`);
  }

  await tab(page, 'build').click();
  const catalogue = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hud-build__list [data-buildable]')].map(
      (n) => `${n.getAttribute('data-buildable')} :: ${(n.innerText ?? '').replace(/\s+/g, ' ').trim()}`,
    ),
  );
  console.log(`\n----- BUILD CATALOGUE (${catalogue.length}) -----`);
  for (const line of catalogue) console.log(`  ${line}`);

  await tab(page, 'zones').click();
  const rooms = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hud-rooms__list [data-room]')].map(
      (n) => `${n.getAttribute('data-room')} :: ${(n.innerText ?? '').replace(/\s+/g, ' ').trim()}`,
    ),
  );
  console.log(`\n----- ROOM CATALOGUE (${rooms.length}) -----`);
  for (const line of rooms) console.log(`  ${line}`);
});

/**
 * Everything a player can read WITHOUT changing tab: the strip, the two bands,
 * and the alerts column. This is the surface someone watching their prison run
 * is actually looking at.
 */
async function ambient(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const read = (selector: string): string => {
      const node = document.querySelector<HTMLElement>(selector);
      if (node === null) return '(absent)';
      if (node.hidden || node.getClientRects().length === 0) return '(not laid out)';
      return (node.innerText ?? '').replace(/\s+/g, ' ').trim();
    };
    return {
      refusal: read('.hud__refusal'),
      event: read('.hud__event'),
      alerts: read('.hud-alerts__list'),
      incidents: read('.hud-strip'),
    };
  });
}

/** Draws the four wall runs of a 6x6 room at (12,12)-(17,17). `gapAt` is skipped. */
async function drawPerimeter(
  page: Page,
  origin: { originX: number; originY: number },
  options: { readonly skipSouthMiddle?: boolean } = {},
): Promise<void> {
  await armBuildable(page, 'wall-brick');
  const westX = origin.originX + 12 * TILE;
  const eastX = origin.originX + 18 * TILE;
  const northY = origin.originY + 12 * TILE;
  const southY = origin.originY + 18 * TILE;
  const runs = [
    { name: 'north', a: { x: westX + TILE / 2, y: northY }, b: { x: eastX - TILE / 2, y: northY } },
    { name: 'south', a: { x: westX + TILE / 2, y: southY }, b: { x: eastX - TILE / 2, y: southY } },
    { name: 'west', a: { x: westX, y: northY + TILE / 2 }, b: { x: westX, y: southY - TILE / 2 } },
    { name: 'east', a: { x: eastX, y: northY + TILE / 2 }, b: { x: eastX, y: southY - TILE / 2 } },
  ];
  for (const run of runs) {
    if (options.skipSouthMiddle === true && run.name === 'south') {
      // Two runs with tile 14's south edge left out.
      await drag(page, run.a, { x: origin.originX + 14 * TILE - TILE / 2, y: southY });
      await drag(page, { x: origin.originX + 15 * TILE + TILE / 2, y: southY }, run.b);
      console.log(`  wall run south: drawn in two halves, tile (14,17)'s south edge left open`);
      continue;
    }
    await drag(page, run.a, run.b);
    console.log(`  wall run ${run.name}: drawn`);
  }
}

async function zoneCell(page: Page, origin: { originX: number; originY: number }): Promise<number> {
  const started = Date.now();
  let attempts = 0;
  for (;;) {
    attempts += 1;
    await tab(page, 'zones').click();
    const collapsed = await page.locator('.hud-rooms').getAttribute('data-collapsed');
    if (collapsed === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
    await page.locator('.hud-rooms__arm').click();
    await drag(page, centreOf(origin, 12, 12), centreOf(origin, 17, 17));
    const note = await panelText(page, '.hud-rooms');
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(800);
    const counts = await latestCounts(page);
    console.log(
      `  designate attempt ${attempts} (+${Date.now() - started}ms): rooms=${counts?.rooms}` +
        ` | ${JSON.stringify(note.split('\n').filter((l) => /OPEN|ENCLOS/i.test(l)))}`,
    );
    if ((counts?.rooms ?? 0) > 0) return attempts;
    if (attempts >= 10) throw new Error('never accepted as a room');
    await page.waitForTimeout(4000);
  }
}

/**
 * ACT 1 — a new player builds a cell the way the panel tells them to, and
 * watches it run. Nothing is done to cause the fault and nothing to avoid it:
 * four wall runs, zone, beds, a toilet, prisoners, guards, Play.
 *
 * The measurement is the AMBIENT surface only — the status strip, the refusal
 * band, the event band and the alerts column. Those are what is on screen
 * while a prison runs. Tabs are opened only at the very end, to record what
 * was sitting behind them the whole time.
 */
test('act 1: the naive build, watched from the Overview tab', async ({ page }) => {
  test.setTimeout(900_000);
  await installTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.waitForTimeout(400);

  await tab(page, 'build').click();
  const origin = await calibrate(page);
  console.log(`origin = ${origin.originX},${origin.originY}`);

  await buy(page, 'wall-brick', 60);
  await buy(page, 'bed-wooden', 6);
  await buy(page, 'toilet-brick', 2);
  await fastForwardToMax(page);
  await page.waitForTimeout(6000);

  console.log('--- drawing the perimeter ---');
  await drawPerimeter(page, origin);
  await waitForQueueEmpty(page);
  await shot(page, 'act1-walls-up');
  await screen(page, 'walls up, nothing zoned');

  const attempts = await zoneCell(page, origin);
  console.log(`zoned in ${attempts} attempt(s)`);
  await shot(page, 'act1-zoned');
  console.log(`ROOMS PANEL right after zoning:\n${await panelText(page, '.hud-rooms')}`);
  await screen(page, 'zoned as a Cell');

  await tab(page, 'build').click();
  await armBuildable(page, 'bed-wooden');
  for (const column of [12, 13, 14, 15]) {
    const point = centreOf(origin, column, 13);
    await press(page, point.x, point.y);
  }
  await armBuildable(page, 'toilet-brick');
  const toilet = centreOf(origin, 16, 13);
  await press(page, toilet.x, toilet.y);
  await waitForQueueEmpty(page);
  await page.waitForTimeout(2000);
  console.log(`counts after furnishing: ${JSON.stringify(await latestCounts(page))}`);

  await showPanel(page, 'manage', '.hud-intake');
  for (let index = 0; index < 4; index += 1) {
    await page.locator('.hud-intake__admit').click();
    await page.waitForTimeout(250);
  }
  await tab(page, 'manage').click();
  const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
  if ((await guardRow.count()) > 0) await guardRow.first().click();
  for (let index = 0; index < 2; index += 1) {
    await page.locator('.hud-staff__hire').click();
    await page.waitForTimeout(300);
  }

  await tab(page, 'overview').click();
  await fastForwardToMax(page);
  const startTick = await currentTick(page);
  await shot(page, 'act1-running-start');
  await screen(page, 'admitted 4, hired 2, running');
  console.log(`\n===== WATCHING THE OVERVIEW TAB from tick ${startTick} =====`);

  const seen = new Map<string, number>();
  const startedAt = Date.now();
  let lastReport = 0;
  while (Date.now() - startedAt < 240_000) {
    const tick = await currentTick(page);
    const now = await ambient(page);
    for (const [channel, text] of Object.entries(now)) {
      if (channel === 'incidents') continue;
      const key = `${channel}:${text}`;
      if (!seen.has(key)) {
        seen.set(key, tick);
        console.log(`  tick ${tick} (day ${(tick / 2400).toFixed(2)}) NEW ${channel}: ${JSON.stringify(text)}`);
      }
    }
    if (tick - lastReport >= 1200) {
      lastReport = tick;
      const counts = await latestCounts(page);
      console.log(
        `  tick ${tick}: strip = ${JSON.stringify((await panelText(page, '.hud-strip')).replace(/\n+/g, ' | '))}`,
      );
      console.log(`  tick ${tick}: counts = ${JSON.stringify(counts)}`);
    }
    await page.waitForTimeout(2000);
  }
  const endTick = await currentTick(page);
  await shot(page, 'act1-running-end');
  console.log(`\n===== 240s of watching ended at tick ${endTick}, day ${(endTick / 2400).toFixed(2)} =====`);
  console.log(`ambient sentences ever seen, with the tick each first appeared:`);
  for (const [key, tick] of seen) console.log(`  tick ${tick}: ${key}`);

  console.log(`\n===== ONLY NOW does the player go looking. What was behind each tab: =====`);
  for (const id of ['overview', 'build', 'zones', 'manage', 'day-plan'] as const) {
    await tab(page, id).click();
    await page.waitForTimeout(400);
    const body = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll<HTMLElement>('.hud__rail > *, .hud__column > *, .hud > *')];
      return nodes
        .filter((n) => !n.hidden && n.getClientRects().length > 0)
        .map((n) => (n.innerText ?? '').replace(/\n{2,}/g, '\n').trim())
        .join('\n---\n');
    });
    console.log(`\n----- TAB ${id} -----\n${body}`);
    await shot(page, `act1-final-tab-${id}`);
  }
});

/** The Rooms panel's row for the one room, and its needs list, read literally. */
async function roomsPanel(page: Page): Promise<{ text: string; needs: readonly string[]; access: string }> {
  return page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('.hud-rooms');
    if (panel === null) return { text: '(absent)', needs: [], access: '(absent)' };
    if (panel.hidden || panel.getClientRects().length === 0) {
      return { text: '(not laid out)', needs: [], access: '(not laid out)' };
    }
    const laidOut = (n: HTMLElement) => !n.hidden && n.getClientRects().length > 0;
    const needs = [...panel.querySelectorAll<HTMLElement>('.hud-rooms__needs-item')]
      .map((n) => `${laidOut(n) ? '' : '[NOT LAID OUT] '}${(n.innerText ?? '').replace(/\s+/g, ' ').trim()}`);
    const row = panel.querySelector<HTMLElement>('.hud-rooms__rows [data-room], .hud-rooms__rows *');
    return {
      text: (panel.innerText ?? '').replace(/\n{2,}/g, '\n').trim(),
      needs,
      access: row === null ? '(no row)' : String(row.getAttribute('data-access')),
    };
  });
}

/**
 * ACT 2 — the cell built deliberately with no door, played longer, and the
 * message hunted for: where it is, how long it lasts, and whether it survives
 * a tab change, a panel collapse, a scroll, and a save/reload.
 */
test('act 2: doorless on purpose, and does the message survive anything', async ({ page }) => {
  test.setTimeout(900_000);
  await installTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.waitForTimeout(400);

  await tab(page, 'build').click();
  const origin = await calibrate(page);
  await buy(page, 'wall-brick', 60);
  await buy(page, 'bed-wooden', 6);
  await buy(page, 'toilet-brick', 2);
  await fastForwardToMax(page);
  await page.waitForTimeout(6000);
  await drawPerimeter(page, origin);
  await waitForQueueEmpty(page);
  await zoneCell(page, origin);

  console.log(`\n### THE MOMENT IT IS ZONED, before any furniture ###`);
  let rooms = await roomsPanel(page);
  console.log(`rooms panel:\n${rooms.text}`);
  console.log(`needs items: ${JSON.stringify(rooms.needs)}`);
  console.log(`ambient: ${JSON.stringify(await ambient(page))}`);
  await shot(page, 'act2-zoned-rooms-panel');

  await tab(page, 'build').click();
  await armBuildable(page, 'bed-wooden');
  for (const column of [12, 13, 14, 15]) {
    const p = centreOf(origin, column, 13);
    await press(page, p.x, p.y);
  }
  await armBuildable(page, 'toilet-brick');
  const toilet = centreOf(origin, 16, 13);
  await press(page, toilet.x, toilet.y);
  await waitForQueueEmpty(page);
  await page.waitForTimeout(1500);

  await tab(page, 'zones').click();
  console.log(`\n### FURNISHED. Rooms panel now ###`);
  rooms = await roomsPanel(page);
  console.log(`rooms panel:\n${rooms.text}`);
  console.log(`needs items: ${JSON.stringify(rooms.needs)}`);
  await shot(page, 'act2-furnished-rooms-panel');

  await showPanel(page, 'manage', '.hud-intake');
  for (let index = 0; index < 4; index += 1) {
    await page.locator('.hud-intake__admit').click();
    await page.waitForTimeout(250);
  }
  await tab(page, 'manage').click();
  const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
  if ((await guardRow.count()) > 0) await guardRow.first().click();
  for (let index = 0; index < 2; index += 1) {
    await page.locator('.hud-staff__hire').click();
    await page.waitForTimeout(300);
  }
  await fastForwardToMax(page);
  await tab(page, 'zones').click();
  console.log(`\n### 4 PRISONERS ADMITTED, clock at 4x. Rooms panel ###`);
  rooms = await roomsPanel(page);
  console.log(`rooms panel:\n${rooms.text}`);
  console.log(`needs items: ${JSON.stringify(rooms.needs)}`);
  await shot(page, 'act2-admitted-rooms-panel');
  await shotOf(page, '.hud-rooms', 'act2-admitted-rooms-panel-element');
  await shotOf(page, '.hud-strip', 'act2-admitted-strip');
  console.log(`strip chips: ${JSON.stringify(await stripChips(page), null, 1)}`);

  // --- survival tests, all while the fault is live ---
  const survives = async (label: string) => {
    const r = await roomsPanel(page);
    const has = r.text.toLowerCase().includes('door');
    console.log(`  [survival] ${label}: door sentence present = ${has} | needs = ${JSON.stringify(r.needs)}`);
    return has;
  };
  console.log(`\n### SURVIVAL ###`);
  await survives('sitting on the Rooms tab');

  await tab(page, 'overview').click();
  await page.waitForTimeout(500);
  const awayText = await roomsPanel(page);
  console.log(`  [survival] with the Overview tab open, the Rooms panel is: ${JSON.stringify(awayText.text.slice(0, 60))}`);
  console.log(`  [survival] ambient while away: ${JSON.stringify(await ambient(page))}`);
  await tab(page, 'zones').click();
  await page.waitForTimeout(400);
  await survives('after Overview -> Rooms');

  const toggle = page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle');
  if ((await toggle.count()) > 0) {
    await toggle.click();
    await page.waitForTimeout(400);
    console.log(`  [survival] collapsed: data-collapsed=${await page.locator('.hud-rooms').getAttribute('data-collapsed')}`);
    await survives('with the panel collapsed');
    await toggle.click();
    await page.waitForTimeout(400);
    await survives('re-expanded');
  }

  await page.locator('.hud-rooms').evaluate((n) => { n.scrollTop = n.scrollHeight; });
  await page.waitForTimeout(300);
  await shot(page, 'act2-rooms-scrolled');
  await survives('scrolled to the bottom of the panel');

  // Save and reload.
  await page.locator('.save-panel').getByRole('button', { name: 'Save now' }).click();
  await page.waitForTimeout(1500);
  console.log(`  save panel says: ${JSON.stringify(await panelText(page, '.save-panel'))}`);
  await page.reload();
  await page.waitForSelector('#game-root canvas');
  await page.waitForSelector('.hud');
  await page.waitForTimeout(3000);
  await installTee(page);
  const loadRow = page.locator('.save-panel').getByRole('button', { name: 'Load' }).first();
  if ((await loadRow.count()) > 0) {
    await loadRow.click();
    await page.waitForTimeout(4000);
  }
  console.log(`  after reload+load: counts = ${JSON.stringify(await latestCounts(page))}`);
  await tab(page, 'zones').click();
  await page.waitForTimeout(600);
  await survives('after a save, a page reload and a load');
  await shot(page, 'act2-after-reload');
  console.log(`rooms panel after reload:\n${(await roomsPanel(page)).text}`);

  // --- the long run ---
  await fastForwardToMax(page);
  const t0 = await currentTick(page);
  console.log(`\n### LONG RUN from tick ${t0} ###`);
  const startedAt = Date.now();
  let last = 0;
  const seen = new Map<string, number>();
  while (Date.now() - startedAt < 180_000) {
    const tick = await currentTick(page);
    const now = await ambient(page);
    for (const [channel, text] of Object.entries(now)) {
      if (channel === 'incidents') continue;
      const key = `${channel}:${text}`;
      if (!seen.has(key)) {
        seen.set(key, tick);
        console.log(`  tick ${tick} NEW ${channel}: ${JSON.stringify(text)}`);
      }
    }
    if (tick - last >= 2400) {
      last = tick;
      const counts = await latestCounts(page);
      console.log(`  tick ${tick} (day ${(tick / 2400).toFixed(1)}): counts = ${JSON.stringify(counts)}`);
      console.log(`  tick ${tick}: rooms needs = ${JSON.stringify((await roomsPanel(page)).needs)}`);
    }
    await page.waitForTimeout(2000);
  }
  const tEnd = await currentTick(page);
  console.log(`\n### long run ended at tick ${tEnd}, day ${(tEnd / 2400).toFixed(1)} ###`);
  console.log(`rooms panel at the end:\n${(await roomsPanel(page)).text}`);
  console.log(`regime panel at the end:`);
  await tab(page, 'day-plan').click();
  await page.waitForTimeout(400);
  console.log(await panelText(page, '.hud-regime'));
  await shot(page, 'act2-end-regime');
  await tab(page, 'zones').click();
  await page.waitForTimeout(400);
  await shot(page, 'act2-end-rooms');
  await shotOf(page, '.hud-rooms', 'act2-end-rooms-element');
  await shotOf(page, '.hud-strip', 'act2-end-strip');
  console.log(`strip chips at the end: ${JSON.stringify(await stripChips(page), null, 1)}`);
});

/** Builds the doorless prison of acts 1 and 2 and hands back the origin. */
async function buildDoorlessPrison(page: Page): Promise<{ originX: number; originY: number }> {
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.waitForTimeout(400);
  await tab(page, 'build').click();
  const origin = await calibrate(page);
  await buy(page, 'wall-brick', 60);
  await buy(page, 'bed-wooden', 6);
  await buy(page, 'toilet-brick', 2);
  await buy(page, 'door-wooden', 3);
  await fastForwardToMax(page);
  await page.waitForTimeout(6000);
  await drawPerimeter(page, origin);
  await waitForQueueEmpty(page);
  await zoneCell(page, origin);
  await tab(page, 'build').click();
  await armBuildable(page, 'bed-wooden');
  for (const column of [12, 13, 14, 15]) {
    const p = centreOf(origin, column, 13);
    await press(page, p.x, p.y);
  }
  await armBuildable(page, 'toilet-brick');
  const t = centreOf(origin, 16, 13);
  await press(page, t.x, t.y);
  await waitForQueueEmpty(page);
  await page.waitForTimeout(1500);
  await showPanel(page, 'manage', '.hud-intake');
  for (let index = 0; index < 4; index += 1) {
    await page.locator('.hud-intake__admit').click();
    await page.waitForTimeout(250);
  }
  await tab(page, 'manage').click();
  const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
  if ((await guardRow.count()) > 0) await guardRow.first().click();
  for (let index = 0; index < 2; index += 1) {
    await page.locator('.hud-staff__hire').click();
    await page.waitForTimeout(300);
  }
  return origin;
}

/**
 * ACT 3 — the fault is fixed while the player watches. Does the game say so?
 */
test('act 3: build the door, and see whether the game confirms it', async ({ page }) => {
  test.setTimeout(900_000);
  await installTee(page);
  await openApp(page);
  const origin = await buildDoorlessPrison(page);
  await fastForwardToMax(page);
  await page.waitForTimeout(20_000);

  await tab(page, 'zones').click();
  console.log(`\n### BEFORE THE DOOR (tick ${await currentTick(page)}) ###`);
  console.log((await roomsPanel(page)).text);
  console.log(`needs: ${JSON.stringify((await roomsPanel(page)).needs)}`);
  console.log(`ambient: ${JSON.stringify(await ambient(page))}`);
  console.log(`counts: ${JSON.stringify(await latestCounts(page))}`);
  await shot(page, 'act3-before-door');
  await shotOf(page, '.hud-rooms', 'act3-before-door-rooms-element');
  await shotOf(page, '.hud-strip', 'act3-before-door-strip');
  console.log(`strip, every labelled node:`);
  for (const line of await stripChips(page)) console.log(`  ${line}`);

  // Place a door on the south edge of tile (14,17), where a wall already is.
  const southY = origin.originY + 18 * TILE;
  const doorX = origin.originX + 14 * TILE + TILE / 2;
  await tab(page, 'build').click();
  await armBuildable(page, 'door-wooden');
  console.log(`\n### PRESSING the south edge of tile (14,17) with the door armed ###`);
  const produced = await press(page, doorX, southY);
  console.log(`commands produced: ${JSON.stringify(produced)}`);
  await page.waitForTimeout(1200);
  console.log(`ambient right after the press: ${JSON.stringify(await ambient(page))}`);
  await shot(page, 'act3-door-press');

  if (produced.length === 0) {
    console.log(`\n### the press produced nothing. Removing the wall first. ###`);
    await page.locator('.hud-build__remove').click();
    const removed = await press(page, doorX, southY);
    console.log(`remove produced: ${JSON.stringify(removed)}`);
    await page.waitForTimeout(1500);
    console.log(`ambient after the removal: ${JSON.stringify(await ambient(page))}`);
    await armBuildable(page, 'door-wooden');
    const again = await press(page, doorX, southY);
    console.log(`door press after removal: ${JSON.stringify(again)}`);
  }

  await waitForQueueEmpty(page);
  await page.waitForTimeout(4000);
  console.log(`\n### AFTER THE DOOR IS UP (tick ${await currentTick(page)}) ###`);
  console.log(`ambient: ${JSON.stringify(await ambient(page))}`);
  await tab(page, 'zones').click();
  await page.waitForTimeout(500);
  const after = await roomsPanel(page);
  console.log(after.text);
  console.log(`needs: ${JSON.stringify(after.needs)}`);
  console.log(`counts: ${JSON.stringify(await latestCounts(page))}`);
  await shot(page, 'act3-after-door');

  // Did anything at all announce it?
  console.log(`\n### WATCHING for any acknowledgement, 90s ###`);
  const startedAt = Date.now();
  const seen = new Map<string, number>();
  while (Date.now() - startedAt < 90_000) {
    const tick = await currentTick(page);
    const now = await ambient(page);
    for (const [channel, text] of Object.entries(now)) {
      if (channel === 'incidents') continue;
      const key = `${channel}:${text}`;
      if (!seen.has(key)) {
        seen.set(key, tick);
        console.log(`  tick ${tick} NEW ${channel}: ${JSON.stringify(text)}`);
      }
    }
    await page.waitForTimeout(2000);
  }
  console.log(`\n### 90s later (tick ${await currentTick(page)}) ###`);
  console.log(`counts: ${JSON.stringify(await latestCounts(page))}`);
  console.log(`rooms panel:\n${(await roomsPanel(page)).text}`);
  await tab(page, 'day-plan').click();
  await page.waitForTimeout(400);
  console.log(`regime panel:\n${await panelText(page, '.hud-regime')}`);
  await shot(page, 'act3-end-regime');
  await tab(page, 'zones').click();
  await shot(page, 'act3-end-rooms');
  await shotOf(page, '.hud-rooms', 'act3-end-rooms-element');
  await shotOf(page, '.hud-strip', 'act3-end-strip');
  console.log(`strip, every labelled node, after the door:`);
  for (const line of await stripChips(page)) console.log(`  ${line}`);
});

/**
 * ACT 4a — a door that opens onto nothing. The cell gets its door, the game
 * stops complaining, and then three wall segments seal a one-tile pocket
 * around the outside of that door. The room still has a doorway; the doorway
 * still reaches nowhere. Does the game notice the second fault?
 */
test('act 4a: a door that leads into a sealed pocket', async ({ page }) => {
  test.setTimeout(900_000);
  await installTee(page);
  await openApp(page);
  const origin = await buildDoorlessPrison(page);
  await fastForwardToMax(page);

  await tab(page, 'build').click();
  await armBuildable(page, 'door-wooden');
  const southY = origin.originY + 18 * TILE;
  const doorX = origin.originX + 14 * TILE + TILE / 2;
  console.log(`door press: ${JSON.stringify(await press(page, doorX, southY))}`);
  await waitForQueueEmpty(page);
  await page.waitForTimeout(3000);
  await tab(page, 'zones').click();
  console.log(`\n### door in, before the pocket ###`);
  console.log(`needs: ${JSON.stringify((await roomsPanel(page)).needs)}`);
  console.log(`counts: ${JSON.stringify(await latestCounts(page))}`);
  await shotOf(page, '.hud-rooms', 'act4a-door-in');

  // Three wall segments seal tile (14,18): its west, east and south edges.
  await tab(page, 'build').click();
  await armBuildable(page, 'wall-brick');
  const pocket = [
    { label: 'west of (14,18)', x: origin.originX + 14 * TILE, y: origin.originY + 18 * TILE + TILE / 2 },
    { label: 'east of (14,18)', x: origin.originX + 15 * TILE, y: origin.originY + 18 * TILE + TILE / 2 },
    { label: 'south of (14,18)', x: origin.originX + 14 * TILE + TILE / 2, y: origin.originY + 19 * TILE },
  ];
  for (const edge of pocket) {
    const produced = await press(page, edge.x, edge.y);
    console.log(`  wall ${edge.label}: ${JSON.stringify(produced.map((c) => `${String(c['type'])} ${String(c['x'])},${String(c['y'])} ${String(c['edge'])}`))}`);
  }
  await waitForQueueEmpty(page);
  await page.waitForTimeout(6000);

  console.log(`\n### THE POCKET IS SEALED. The cell has a door onto a dead end. ###`);
  await tab(page, 'zones').click();
  await page.waitForTimeout(500);
  const r = await roomsPanel(page);
  console.log(r.text);
  console.log(`needs: ${JSON.stringify(r.needs)}`);
  console.log(`ambient: ${JSON.stringify(await ambient(page))}`);
  console.log(`counts: ${JSON.stringify(await latestCounts(page))}`);
  await shot(page, 'act4a-pocket-sealed');
  await shotOf(page, '.hud-rooms', 'act4a-pocket-sealed-element');

  console.log(`\n### running 100s with the pocket sealed ###`);
  const startedAt = Date.now();
  const seen = new Map<string, number>();
  while (Date.now() - startedAt < 100_000) {
    const tick = await currentTick(page);
    for (const [channel, text] of Object.entries(await ambient(page))) {
      if (channel === 'incidents') continue;
      const key = `${channel}:${text}`;
      if (!seen.has(key)) {
        seen.set(key, tick);
        console.log(`  tick ${tick} NEW ${channel}: ${JSON.stringify(text)}`);
      }
    }
    await page.waitForTimeout(2000);
  }
  console.log(`after 100s: needs = ${JSON.stringify((await roomsPanel(page)).needs)}`);
  console.log(`counts: ${JSON.stringify(await latestCounts(page))}`);
  await tab(page, 'day-plan').click();
  await page.waitForTimeout(400);
  console.log(`regime:\n${await panelText(page, '.hud-regime')}`);
  await tab(page, 'zones').click();
  await shot(page, 'act4a-end');
});

/**
 * ACT 4b — two more members of the same family, if it is one: a Yard sealed on
 * every side (a room type that needs no furniture at all), and a room zoned and
 * then taken straight back.
 */
test('act 4b: a sealed storage room, and a room taken back at once', async ({ page }) => {
  test.setTimeout(900_000);
  await installTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.waitForTimeout(400);
  await tab(page, 'build').click();
  const origin = await calibrate(page);
  console.log(`origin = ${origin.originX},${origin.originY}`);
  await buy(page, 'wall-brick', 60);
  await fastForwardToMax(page);
  await page.waitForTimeout(6000);

  /*
   * Tiles (13,14)-(17,18). The first shape of this act used (22,12)-(26,16),
   * whose far corner lands at screen x=1392 -- **under the HUD's right-hand
   * rail**, which opts back into pointer events. The drag was swallowed, no
   * rectangle was ever drawn, and `.hud-rooms__confirm` never became
   * actionable; with no `actionTimeout` set in `playwright.playtest.config.ts`
   * a Playwright click waits for ever, so the run hung rather than failing.
   * This rectangle sits in clear canvas: x 528..848, y 322..642 at 1440x900,
   * clear of the minimap island on the left and the rail on the right.
   */
  await armBuildable(page, 'wall-brick');
  const w = origin.originX + 13 * TILE;
  const e = origin.originX + 18 * TILE;
  const n = origin.originY + 14 * TILE;
  const s = origin.originY + 19 * TILE;
  for (const run of [
    { name: 'north', a: { x: w + TILE / 2, y: n }, b: { x: e - TILE / 2, y: n } },
    { name: 'south', a: { x: w + TILE / 2, y: s }, b: { x: e - TILE / 2, y: s } },
    { name: 'west', a: { x: w, y: n + TILE / 2 }, b: { x: w, y: s - TILE / 2 } },
    { name: 'east', a: { x: e, y: n + TILE / 2 }, b: { x: e, y: s - TILE / 2 } },
  ]) {
    await drag(page, run.a, run.b);
    console.log(`  box wall run ${run.name} drawn`);
  }
  /*
   * The queue block arrives collapsed (#862), and `waitForQueueEmpty` treats a
   * collapsed block -- "not laid out" -- as an empty one, so it returned at
   * tick 3105 with twenty wall segments still unbuilt and the designation was
   * then refused for a wall that genuinely was not up. The block is opened
   * first here, and the wait is on the text rather than on its absence.
   */
  const queueSection = page.locator('.hud-build__queue');
  if ((await queueSection.count()) > 0 && (await queueSection.getAttribute('data-collapsed')) === 'true') {
    await queueSection.locator('.ui-section__header').first().click({ timeout: 30_000 });
    await page.waitForTimeout(200);
  }
  console.log(`  queue after the runs: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
  /*
   * And `waitForQueueEmpty` cannot be used at all here, because its first act
   * is to click the Build tab, which re-renders the queue block collapsed
   * again -- so its very first read is "not laid out" and it answers "empty"
   * at tick 3123 with the walls still going up. This wait re-opens the block
   * on every poll and waits for the sentence, not for its absence.
   */
  for (let poll = 0; ; poll += 1) {
    if ((await queueSection.getAttribute('data-collapsed')) === 'true') {
      await queueSection.locator('.ui-section__header').first().click({ timeout: 30_000 });
      await page.waitForTimeout(150);
    }
    const text = await panelText(page, '.hud-build__queue');
    if (/(?<![0-9])0 waiting . 0 being built/.test(text) || text.includes('not laid out') || text.includes('ABSENT')) {
      console.log(`  queue empty at tick ${await currentTick(page)} after ${poll} poll(s): ${JSON.stringify(text)}`);
      break;
    }
    if (poll > 120) throw new Error(`the wall queue never emptied: ${text}`);
    await page.waitForTimeout(1000);
  }

  let attempts = 0;
  for (;;) {
    attempts += 1;
    await tab(page, 'zones').click({ timeout: 30_000 });
    const collapsed = await page.locator('.hud-rooms').getAttribute('data-collapsed');
    if (collapsed === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click({ timeout: 30_000 });
    await page.locator('.hud-rooms__list [data-room="room.storage-room"]').click({ timeout: 30_000 });
    // The arm control hides itself once armed, so a retry must not click it again.
    const arm = page.locator('.hud-rooms__arm');
    if (await arm.isVisible()) await arm.click({ timeout: 30_000 });
    await drag(page, centreOf(origin, 13, 14), centreOf(origin, 17, 18));
    const note = await panelText(page, '.hud-rooms');
    if (attempts <= 2) console.log(`  attempt ${attempts} FULL ROOMS PANEL:\n${note}`);
    console.log(`  attempt ${attempts} note element: ${JSON.stringify(await panelText(page, '.hud-rooms__note'))}`);
    console.log(`  attempt ${attempts} coords readout: ${JSON.stringify(await panelText(page, '.hud-rooms__coords'))}`);
    const confirmButton = page.locator('.hud-rooms__confirm');
    if (await confirmButton.isDisabled()) {
      console.log(`  attempt ${attempts}: the Confirm control is disabled; waiting and redrawing`);
      if (attempts >= 8) throw new Error('Confirm never became pressable for the storage room');
      await page.waitForTimeout(6000);
      continue;
    }
    await confirmButton.click({ timeout: 30_000 });
    await page.waitForTimeout(1000);
    const counts = await latestCounts(page);
    console.log(`  storage-room designate attempt ${attempts}: rooms=${counts?.rooms}`);
    if ((counts?.rooms ?? 0) > 0) break;
    if (attempts >= 6) throw new Error('the storage room was never accepted');
    await page.waitForTimeout(4000);
  }

  console.log(`\n### A STORAGE ROOM, SEALED ON EVERY SIDE. Not a Cell -- is the sentence the room type's, or the game's? ###`);
  const sealed = await roomsPanel(page);
  console.log(sealed.text);
  console.log(`needs: ${JSON.stringify(sealed.needs)}`);
  console.log(`ambient: ${JSON.stringify(await ambient(page))}`);
  await shot(page, 'act4b-sealed-storage-room');
  await shotOf(page, '.hud-rooms', 'act4b-sealed-storage-room-element');

  /*
   * How much of each line in that block a player can actually see. The
   * enclosure readout looked cut off mid-word in act 1's screenshot; this is
   * the measurement rather than the impression.
   */
  console.log(`\n### CLIPPING, at ${JSON.stringify(page.viewportSize())} ###`);
  const clipped = await page.evaluate(() =>
    [
      '.hud-rooms__needs-header',
      '.hud-rooms__needs-item',
      '.hud-rooms__enclosure',
      '.hud-rooms__enclosure-value',
      '.hud-rooms__rule-block',
    ].flatMap((selector) =>
      [...document.querySelectorAll<HTMLElement>(selector)].map((n) => {
        const style = window.getComputedStyle(n);
        return (
          `${selector} :: ${JSON.stringify((n.innerText ?? '').replace(/\s+/g, ' ').trim())}` +
          ` scrollWidth=${n.scrollWidth} clientWidth=${n.clientWidth} overflowX=${style.overflowX}` +
          ` textOverflow=${style.textOverflow} whiteSpace=${style.whiteSpace}` +
          ` CLIPPED=${n.scrollWidth > n.clientWidth}`
        );
      }),
    ),
  );
  for (const line of clipped) console.log(`  ${line}`);

  for (const size of [
    { width: 1280, height: 800 },
    { width: 1024, height: 768 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(600);
    const lines = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.hud-rooms__needs-item, .hud-rooms__enclosure-value')].map(
        (n) =>
          `${JSON.stringify((n.innerText ?? '').replace(/\s+/g, ' ').trim())} scrollWidth=${n.scrollWidth} clientWidth=${n.clientWidth} CLIPPED=${n.scrollWidth > n.clientWidth}`,
      ),
    );
    console.log(`  at ${size.width}x${size.height}: ${JSON.stringify(lines)}`);
    await shotOf(page, '.hud-rooms', `act4b-rooms-${size.width}x${size.height}`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(500);

  console.log(`\n### AND TAKE IT BACK AT ONCE ###`);
  await page.locator('.hud-rooms__remove').click({ timeout: 30_000 });
  await page.waitForTimeout(300);
  await drag(page, centreOf(origin, 13, 14), centreOf(origin, 17, 18));
  const confirm = page.locator('.hud-rooms__confirm');
  if ((await confirm.count()) > 0 && (await confirm.isVisible())) await confirm.click({ timeout: 30_000 });
  await page.waitForTimeout(2500);
  console.log(`counts after the removal: ${JSON.stringify(await latestCounts(page))}`);
  console.log(`rooms panel:\n${(await roomsPanel(page)).text}`);
  console.log(`ambient: ${JSON.stringify(await ambient(page))}`);
  await shot(page, 'act4b-room-taken-back');
  await shotOf(page, '.hud-rooms', 'act4b-room-taken-back-element');
});
