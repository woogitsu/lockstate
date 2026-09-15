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
  calibrate,
  centreOf,
  currentClock,
  currentTick,
  drag,
  installTee,
  latestCounts,
  openApp,
  panelText,
  press,
  sentCommands,
  showPanel,
  tab,
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
