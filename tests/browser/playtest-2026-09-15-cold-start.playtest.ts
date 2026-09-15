/**
 * A cold-start measurement pass, 2026-09-15.
 *
 * Not a gate and not a regression suite: it plays the game from a fresh prison
 * and prints what the screen says, so a research note can quote it. See
 * `docs/research/2026-09-15-*.md`.
 */
import { expect, test } from '@playwright/test';

import {
  ARM_TIMEOUT_MS,
  TILE,
  armBuildable,
  buildAndPopulate,
  calibrate,
  centreOf,
  currentClock,
  currentTick,
  drag,
  fastForwardToMax,
  installTee,
  latestCounts,
  openApp,
  panelText,
  press,
  sentCommands,
  showPanel,
  tab,
  waitForQueueEmpty,
} from './playtest-harness';

const SECTIONS = ['overview', 'build', 'zones', 'manage', 'day-plan'] as const;
const PANEL_OF: Record<(typeof SECTIONS)[number], string> = {
  overview: '.hud-overview',
  build: '.hud-build',
  zones: '.hud-rooms',
  manage: '.hud-intake',
  'day-plan': '.hud-regime',
};

test.beforeEach(async ({ page }) => {
  await installTee(page);
  page.on('console', (message) => {
    const text = message.text();
    if (/error|refus|warn/i.test(text)) console.log(`[page:${message.type()}] ${text}`);
  });
});

test('act 1 -- the arrival screen, nothing pressed', async ({ page }) => {
  await openApp(page);
  const log = (line: string) => console.log(`[act1] ${line}`);

  log(`document.title = ${JSON.stringify(await page.title())}`);
  log(`save panel BEFORE: ${JSON.stringify(await panelText(page, '.save-panel'))}`);
  log(`strip BEFORE: ${JSON.stringify(await panelText(page, '.hud-strip'))}`);
  log(`counts BEFORE: ${JSON.stringify(await latestCounts(page))}`);

  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');

  log(`save panel AFTER New prison: ${JSON.stringify(await panelText(page, '.save-panel'))}`);
  log(`strip AFTER: ${JSON.stringify(await panelText(page, '.hud-strip'))}`);
  log(`clock: ${JSON.stringify(await currentClock(page))} tick=${await currentTick(page)}`);
  log(`counts AFTER: ${JSON.stringify(await latestCounts(page))}`);

  const tabs = await page.locator('.hud__tabs [data-tab]').evaluateAll((nodes) =>
    nodes.map((n) => `${n.getAttribute('data-tab')}=${JSON.stringify((n as HTMLElement).innerText.trim())}`),
  );
  log(`tabs: ${JSON.stringify(tabs)}`);
  log(`which tab is selected on arrival: ${JSON.stringify(
    await page.locator('.hud__tabs [data-tab][aria-selected="true"]').evaluateAll((n) => n.map((e) => e.getAttribute('data-tab'))),
  )}`);

  for (const section of SECTIONS) {
    await showPanel(page, section, PANEL_OF[section]);
    log(`=== section ${section} ===`);
    log(`${PANEL_OF[section]}: ${JSON.stringify(await panelText(page, PANEL_OF[section]))}`);
  }

  // Everything else laid out on the page, once, so nothing is missed.
  await tab(page, 'overview').click();
  const all = await page.evaluate(() => {
    const seen: string[] = [];
    for (const node of Array.from(document.querySelectorAll<HTMLElement>('.hud, .save-panel'))) {
      if (node.hidden || node.getClientRects().length === 0) continue;
      seen.push((node.innerText ?? '').replace(/\n{2,}/g, '\n').trim());
    }
    return seen;
  });
  log(`WHOLE SCREEN on overview: ${JSON.stringify(all)}`);

  log(`refusal band: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
  log(`event band: ${JSON.stringify(await panelText(page, '.hud__event'))}`);
  log(`alerts: ${JSON.stringify(await panelText(page, '.hud-alerts'))}`);
});

test('act 2 -- the naive first quarter hour: only what the screen says', async ({ page }) => {
  await openApp(page);
  const log = (line: string) => console.log(`[act2] ${line}`);
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');

  const strip = async (when: string) =>
    log(`strip @${when}: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);

  await strip('start');

  // The player opens Build, which is where the tab strip puts building.
  await showPanel(page, 'build', '.hud-build');
  const rows = await page.locator('.hud-build__list [data-buildable]').evaluateAll((nodes) =>
    nodes.map((n) => {
      const el = n as HTMLElement;
      return `${el.getAttribute('data-buildable')} :: ${(el.innerText ?? '').replace(/\n/g, ' / ').trim()} :: disabled=${String(
        el.getAttribute('aria-disabled') ?? el.getAttribute('disabled'),
      )}`;
    }),
  );
  log(`catalogue (${rows.length} rows):`);
  for (const row of rows) log(`  ${row}`);

  const origin = await calibrate(page);
  log(`calibration origin ${origin.originX},${origin.originY}`);

  // A newcomer arms the first thing in the list and drags it in the world,
  // without buying anything first.
  await armBuildable(page, 'wall-brick');
  const before = (await sentCommands(page)).length;
  const produced = await drag(
    page,
    { x: origin.originX + 12 * TILE + TILE / 2, y: origin.originY + 12 * TILE },
    { x: origin.originX + 18 * TILE - TILE / 2, y: origin.originY + 12 * TILE },
  );
  log(`first wall drag with NOTHING bought: ${produced.length} command(s) from ${before}`);
  log(`  commands: ${JSON.stringify(produced.map((c) => JSON.stringify(c).slice(0, 200)))}`);
  log(`refusal band right after: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
  log(`event band right after: ${JSON.stringify(await panelText(page, '.hud__event'))}`);
  log(`build panel after the drag: ${JSON.stringify(await panelText(page, '.hud-build'))}`);
  await strip('after the first drag');

  // What the worker said back about those commands.
  const fromWorker = await page.evaluate(() => {
    const received = (window as unknown as { lockstateFromWorker?: unknown[] }).lockstateFromWorker ?? [];
    return received.slice(-25).map((m) => JSON.stringify(m).slice(0, 300));
  });
  log(`last worker messages: ${JSON.stringify(fromWorker)}`);

  log(`counts now: ${JSON.stringify(await latestCounts(page))}`);
  log(`queue: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
  log(`deliveries: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);

  // Does anything on screen say the clock is stopped and what that costs?
  const screen = await page.evaluate(() => (document.querySelector<HTMLElement>('.hud')?.innerText ?? '').replace(/\n{2,}/g, '\n'));
  log(`does the laid-out HUD contain /clock/i? ${/clock/i.test(screen) ? 'yes' : 'no'}`);
  log(`does it contain /paused/i? ${/paused/i.test(screen) ? 'yes' : 'no'}`);
  log(`tick still: ${await currentTick(page)} clock=${JSON.stringify(await currentClock(page))}`);

  // Now the player presses in the world on a tile with nothing armed to place
  // a room -- the Zones section.
  await showPanel(page, 'zones', '.hud-rooms');
  log(`rooms panel on arrival: ${JSON.stringify(await panelText(page, '.hud-rooms'))}`);
  const roomRows = await page.locator('.hud-rooms__list [data-room]').evaluateAll((nodes) =>
    nodes.map((n) => `${n.getAttribute('data-room')} :: ${((n as HTMLElement).innerText ?? '').replace(/\n/g, ' / ').trim()}`),
  );
  log(`room catalogue (${roomRows.length} rows): ${JSON.stringify(roomRows)}`);

  const roomRow = page.locator('.hud-rooms__list [data-room="room.cell"]');
  await roomRow.click();
  await expect(roomRow).toHaveAttribute('data-selected', 'true', { timeout: ARM_TIMEOUT_MS });
  const roomArm = page.locator('.hud-rooms__arm');
  if ((await roomArm.getAttribute('data-armed')) !== 'true') await roomArm.click();
  await drag(page, centreOf(origin, 12, 12), centreOf(origin, 17, 17));
  log(`rooms panel with a rectangle drawn: ${JSON.stringify(await panelText(page, '.hud-rooms'))}`);
  await page.locator('.hud-rooms__confirm').click();
  await page.waitForTimeout(900);
  log(`refusal band after confirming an unwalled rectangle: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
  log(`rooms panel after: ${JSON.stringify(await panelText(page, '.hud-rooms'))}`);
  log(`counts after: ${JSON.stringify(await latestCounts(page))}`);
  await strip('after the refused designation');

  // Admit a prisoner into a prison with nowhere to put one.
  await showPanel(page, 'manage', '.hud-intake');
  log(`intake panel before admitting: ${JSON.stringify(await panelText(page, '.hud-intake'))}`);
  await page.locator('.hud-intake__admit').click();
  await page.waitForTimeout(900);
  log(`intake panel after ONE admit: ${JSON.stringify(await panelText(page, '.hud-intake'))}`);
  log(`refusal band: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
  log(`event band: ${JSON.stringify(await panelText(page, '.hud__event'))}`);
  log(`alerts: ${JSON.stringify(await panelText(page, '.hud-alerts'))}`);
  log(`counts: ${JSON.stringify(await latestCounts(page))}`);
  await strip('after admitting with nowhere to sleep');

  await showPanel(page, 'overview', '.hud-overview');
  log(`overview now: ${JSON.stringify(await panelText(page, '.hud-overview'))}`);
});

/**
 * Installs a recorder for every sentence the two bands ever carry, so an
 * acknowledgement census does not depend on polling catching the moment.
 */
async function recordBands(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const seen: { band: string; text: string; at: number }[] = [];
    (window as unknown as { lockstateBandLog?: unknown[] }).lockstateBandLog = seen;
    const note = (band: string, node: HTMLElement | null) => {
      if (node === null) return;
      const text = (node.innerText ?? '').trim();
      const hidden = node.hidden || node.getClientRects().length === 0;
      const last = seen.filter((s) => s.band === band).pop();
      const value = hidden ? '<hidden>' : text;
      if (last?.text === value) return;
      seen.push({ band, text: value, at: Date.now() });
    };
    const watch = (band: string, selector: string) => {
      const tick = () => note(band, document.querySelector<HTMLElement>(selector));
      tick();
      setInterval(tick, 120);
    };
    watch('refusal', '.hud__refusal');
    watch('event', '.hud__event');
    watch('alerts', '.hud-alerts__list');
  });
}

async function bandLog(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() => {
    const seen = ((window as unknown as { lockstateBandLog?: { band: string; text: string; at: number }[] }).lockstateBandLog ?? []);
    const first = seen[0]?.at ?? 0;
    return seen.map((s) => `+${String(s.at - first).padStart(7)}ms ${s.band}: ${JSON.stringify(s.text)}`);
  });
}

test('act 3 -- does a refusal stop being shown when it stops being true', async ({ page }) => {
  await openApp(page);
  const log = (line: string) => console.log(`[act3] ${line}`);
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await showPanel(page, 'build', '.hud-build');
  const origin = await calibrate(page);
  await recordBands(page);
  log(`origin ${origin.originX},${origin.originY}`);

  const band = async () => JSON.stringify(await panelText(page, '.hud__refusal'));

  // 1. A remove press on an empty tile edge. `calibrate` leaves the tool armed
  //    to remove, which is exactly the state a player is in after pressing
  //    "Remove".
  const target = { x: origin.originX + 20 * TILE + TILE / 2, y: origin.originY + 20 * TILE };
  await press(page, target.x, target.y);
  log(`A. after a remove press on the empty north edge of tile (20,20): ${await band()}`);

  // 2. A second remove press on a DIFFERENT empty tile. Does the band
  //    accumulate, replace, or say which tile it is about?
  await press(page, origin.originX + 25 * TILE + TILE / 2, origin.originY + 25 * TILE);
  log(`B. after a second remove press on (25,20)'s edge: ${await band()}`);

  // 3. Now place a wall on the tile edge sentence A was about. If the band
  //    still carries A, it is describing a tile that now has a wall order on
  //    it.
  await armBuildable(page, 'wall-brick');
  const placed = await press(page, target.x, target.y);
  log(`C. placing a wall on the very edge A refused: ${placed.length} command(s)`);
  log(`C. band now: ${await band()}`);
  log(`C. queue: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);

  // 4. Run the clock so the wall is really there, then look again.
  await page.locator('.hud-strip__transport button').nth(1).click();
  await page.waitForTimeout(6000);
  log(`D. tick=${await currentTick(page)} clock=${JSON.stringify(await currentClock(page))}`);
  log(`D. queue: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
  log(`D. band with the wall finished: ${await band()}`);

  // 5. And the same remove press again, now that there IS a wall there.
  await page.locator('.hud-build__remove').click();
  const removed = await press(page, target.x, target.y);
  log(`E. remove press on the finished wall: ${removed.length} command(s) -> ${JSON.stringify(removed.map((c) => String(c['type'])))}`);
  log(`E. band: ${await band()}`);

  log(`band log:`);
  for (const line of await bandLog(page)) log(`  ${line}`);
});

test('act 4 -- the informed run: what is acknowledged, and where the money goes', async ({ page }) => {
  await openApp(page);
  const log = (line: string) => console.log(`[act4] ${line}`);
  await recordBands(page);

  const funds: string[] = [];
  const mark = async (label: string) => {
    const counts = await latestCounts(page);
    funds.push(`${label}: funds=${counts?.treasuryMinorUnits} earnedToday=${counts?.stateIncomeAccruedTodayMinorUnits} wages=${counts?.dailyWageBillMinorUnits} rooms=${counts?.rooms} prisoners=${counts?.prisoners} staff=${counts?.staff}`);
  };

  const origin = await buildAndPopulate(page, { beds: 2, admits: 2, guards: 1, label: 'act4' });
  log(`origin ${origin.originX},${origin.originY}`);
  await mark('after the whole build, two admits and one guard');

  // Run to a day boundary so the state grant lands.
  await fastForwardToMax(page);
  const started = Date.now();
  for (;;) {
    const tick = await currentTick(page);
    if (tick >= 2500 || Date.now() - started > 180_000) break;
    await page.waitForTimeout(2000);
  }
  await mark(`at tick ${await currentTick(page)}`);

  for (const line of funds) log(`FUNDS ${line}`);
  log(`overview: ${JSON.stringify(await panelText(page, '.hud-overview'))}`);
  await showPanel(page, 'overview', '.hud-overview');
  log(`overview (on its own section): ${JSON.stringify(await panelText(page, '.hud-overview'))}`);
  log(`strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
  log(`alerts list: ${JSON.stringify(await panelText(page, '.hud-alerts__list'))}`);
  log(`refusal: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
  log(`event: ${JSON.stringify(await panelText(page, '.hud__event'))}`);

  log(`EVERY band sentence this run ever showed:`);
  for (const line of await bandLog(page)) log(`  ${line}`);
});

/**
 * Every text node laid out anywhere on the page, as one sorted set, so two
 * moments can be diffed for *what the page gained* rather than polled for a
 * sentence somebody guessed at in advance. This is the sweep
 * `docs/research/2026-09-04-what-the-game-acknowledges.md` section 6 names as
 * the thing that would settle its weakest claim.
 */
async function pageText(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() => {
    const out = new Set<string>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = (node.textContent ?? '').trim();
      if (text === '') continue;
      const parent = node.parentElement;
      if (parent === null) continue;
      if (parent.closest('[hidden]') !== null) continue;
      if (parent.getClientRects().length === 0) continue;
      out.add(text);
    }
    return [...out].sort();
  });
}

test('act 5 -- a text sweep across the moment something goes right', async ({ page }) => {
  await openApp(page);
  const log = (line: string) => console.log(`[act5] ${line}`);
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await showPanel(page, 'build', '.hud-build');
  const origin = await calibrate(page);
  await recordBands(page);

  const before = await pageText(page);
  log(`page text BEFORE anything (${before.length} strings)`);

  // A walled 6x6 box, the clock run until it stands, then zoned as a Cell and
  // given a bed and a toilet -- three things going right in a row.
  await armBuildable(page, 'wall-brick');
  const westX = origin.originX + 12 * TILE;
  const eastX = origin.originX + 18 * TILE;
  const northY = origin.originY + 12 * TILE;
  const southY = origin.originY + 18 * TILE;
  for (const run of [
    { a: { x: westX + TILE / 2, y: northY }, b: { x: eastX - TILE / 2, y: northY } },
    { a: { x: westX + TILE / 2, y: southY }, b: { x: eastX - TILE / 2, y: southY } },
    { a: { x: westX, y: northY + TILE / 2 }, b: { x: westX, y: southY - TILE / 2 } },
    { a: { x: eastX, y: northY + TILE / 2 }, b: { x: eastX, y: southY - TILE / 2 } },
  ]) {
    await drag(page, run.a, run.b);
  }
  const afterOrders = await latestCounts(page);
  log(`24 wall orders placed: funds=${afterOrders?.treasuryMinorUnits}`);

  await fastForwardToMax(page);
  await waitForQueueEmpty(page);
  const walled = await latestCounts(page);
  log(`walls stood up at tick ${walled?.tick}: funds=${walled?.treasuryMinorUnits} rooms=${walled?.rooms}`);
  const afterWalls = await pageText(page);
  log(`GAINED when 24 walls finished: ${JSON.stringify(afterWalls.filter((s) => !before.includes(s)))}`);
  log(`LOST: ${JSON.stringify(before.filter((s) => !afterWalls.includes(s)))}`);

  // Zone it.
  let rooms = 0;
  for (let attempt = 1; attempt <= 8 && rooms === 0; attempt += 1) {
    await showPanel(page, 'zones', '.hud-rooms');
    const collapsed = await page.locator('.hud-rooms').getAttribute('data-collapsed');
    if (collapsed === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    const roomRow = page.locator('.hud-rooms__list [data-room="room.cell"]');
    await roomRow.click();
    await expect(roomRow).toHaveAttribute('data-selected', 'true', { timeout: ARM_TIMEOUT_MS });
    const roomArm = page.locator('.hud-rooms__arm');
    if ((await roomArm.getAttribute('data-armed')) !== 'true') await roomArm.click();
    await drag(page, centreOf(origin, 12, 12), centreOf(origin, 17, 17));
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(1200);
    rooms = (await latestCounts(page))?.rooms ?? 0;
    log(`designate attempt ${attempt}: rooms=${rooms} | refusal=${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
    if (rooms === 0) await page.waitForTimeout(4000);
  }
  const afterZone = await pageText(page);
  log(`GAINED when the first room was zoned: ${JSON.stringify(afterZone.filter((s) => !afterWalls.includes(s)))}`);
  log(`LOST: ${JSON.stringify(afterWalls.filter((s) => !afterZone.includes(s)))}`);
  log(`counts: ${JSON.stringify(await latestCounts(page))}`);

  // A bed, inside.
  await showPanel(page, 'build', '.hud-build');
  await armBuildable(page, 'bed-wooden');
  const bed = centreOf(origin, 13, 13);
  await press(page, bed.x, bed.y);
  await waitForQueueEmpty(page);
  await page.waitForTimeout(2500);
  const afterBed = await pageText(page);
  log(`GAINED when the first bed stood up: ${JSON.stringify(afterBed.filter((s) => !afterZone.includes(s)))}`);
  log(`LOST: ${JSON.stringify(afterZone.filter((s) => !afterBed.includes(s)))}`);
  log(`counts: ${JSON.stringify(await latestCounts(page))}`);

  // And an admission, which is the thing the game has been telling the player
  // to work towards since the arrival screen.
  await showPanel(page, 'manage', '.hud-intake');
  await page.locator('.hud-intake__admit').click();
  await page.waitForTimeout(2500);
  const afterAdmit = await pageText(page);
  log(`GAINED when the first prisoner was admitted: ${JSON.stringify(afterAdmit.filter((s) => !afterBed.includes(s)))}`);
  log(`LOST: ${JSON.stringify(afterBed.filter((s) => !afterAdmit.includes(s)))}`);
  log(`counts: ${JSON.stringify(await latestCounts(page))}`);
  log(`intake panel: ${JSON.stringify(await panelText(page, '.hud-intake'))}`);
  log(`strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);

  log(`EVERY band sentence this run showed:`);
  for (const line of await bandLog(page)) log(`  ${line}`);
});
