/**
 * One question, cornered: **when a fight is open, does the INCIDENTS chip say
 * so?**
 *
 * **Not a CI gate** -- `.playtest.ts` is collected only by
 * `tests/browser/playwright.playtest.config.ts`.
 *
 * `playtest-2026-09-03-is-there-a-game-here.playtest.ts` recorded the chip
 * reading `0` with the badge `Clear` at all fifty of its samples while the
 * alerts column counted its way to *"A fight has broken out between two
 * prisoners. 26x"*. Sampling every twenty wall seconds at 4x is ~1,930 ticks
 * apart, which is not evidence: `IncidentLog.openIncidents()` returns the
 * non-terminal ones, so a chip at 0 is *correct* if every fight opened and
 * reached `resolved` or `lapsed` between two samples.
 *
 * So this instrument removes the interval and the responder at once:
 *
 *  - an **in-page** observer polls the chip every 50 ms and records every
 *    transition, which at 4x is about five ticks of resolution rather than
 *    1,930 -- and it costs no Playwright round trip, so it cannot be starved
 *    by a loaded container;
 *  - the same observer watches the alerts column, so every new fight is paired
 *    with what the chip read at that moment;
 *  - and the prison is built with **no guards at all**, so nothing can respond
 *    to an incident and shorten its life.
 *
 * If the chip never leaves 0 across several fights at that resolution, the
 * finding is a `DEFECT`. If it rises and falls, the chip is accurate and the
 * finding is a `DESIGN` one about a chip that answers "how many are open right
 * now" when the player needs "did something happen while I was not looking".
 */
import { expect, test, type Page } from '@playwright/test';
import {
  calibrate,
  currentTick,
  installTee,
  latestCounts,
  openApp,
  panelText,
  sentCommands,
  tab,
  waitForQueueEmpty,
} from './playtest-harness.ts';

const log = (line: string) => console.log(`[chip] ${line}`);

let selectedBuildable = '';
let selectedEdge = '';
let lastX = Number.NaN;
let lastY = Number.NaN;

async function setSpeed(page: Page, which: 'Pause' | 'Play at normal speed' | 'Fast forward'): Promise<void> {
  await page.getByRole('button', { name: which, exact: true }).click();
  await page.waitForTimeout(400);
}

async function order(page: Page, buildableId: string, x: number, y: number, edge?: 'north' | 'west'): Promise<number> {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const before = (await sentCommands(page)).length;
    if (selectedBuildable !== buildableId) {
      await page.locator(`.hud-build__list [data-buildable="${buildableId}"]`).click();
      selectedBuildable = buildableId;
      selectedEdge = '';
    }
    const fields = page.locator('.hud-build__coords .ui-number__input');
    if (lastX !== x || attempt > 1) {
      await fields.nth(0).fill(String(x));
      lastX = x;
    }
    if (lastY !== y || attempt > 1) {
      await fields.nth(1).fill(String(y));
      lastY = y;
    }
    if (edge !== undefined && selectedEdge !== edge) {
      await page.locator(`.hud-build__coordinates [data-choice="${edge}"]`).click();
      selectedEdge = edge;
    }
    await page.locator('.hud-build__coordinates .ui-action').click();
    const produced = (await sentCommands(page)).length - before;
    if (produced > 0) return produced;
    log(`  LOST ORDER (attempt ${attempt}) ${buildableId} at (${x},${y})`);
    await page.waitForTimeout(1200);
  }
  return 0;
}

async function buy(page: Page, buildableId: string, quantity: number): Promise<void> {
  await page.locator(`.hud-build__list [data-buildable="${buildableId}"]`).click();
  selectedBuildable = buildableId;
  selectedEdge = '';
  const buyRow = page.locator('.hud-build__buy');
  if (await buyRow.isHidden()) await page.locator('.hud-build__buy-toggle').click();
  await page.locator('.hud-build__buy .ui-number__input').fill(String(quantity));
  await page.locator('.hud-build__buy-submit').click();
  await page.waitForTimeout(250);
}

interface ChipWatch {
  readonly samples: number;
  readonly startedAt: number;
  readonly incidentTransitions: readonly [number, string][];
  readonly fightTransitions: readonly [number, string, string][];
  readonly incidentValuesSeen: readonly string[];
}

test('does the INCIDENTS chip say so while a fight is open', async ({ page }) => {
  test.setTimeout(2_400_000);

  await installTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tab(page, 'build').click();
  await calibrate(page);

  await buy(page, 'wall-brick', 46);
  await buy(page, 'bed-wooden', 13);
  await setSpeed(page, 'Fast forward');
  await setSpeed(page, 'Fast forward');
  await page.waitForTimeout(6000);

  await setSpeed(page, 'Pause');
  await tab(page, 'build').click();
  const section = page.locator('.hud-build__coordinates');
  if ((await section.getAttribute('data-collapsed')) === 'true') {
    await page.locator('.hud-build__coordinates > .ui-section__header').click();
  }
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
  await setSpeed(page, 'Fast forward');
  await setSpeed(page, 'Fast forward');
  await waitForQueueEmpty(page, 600_000);

  await setSpeed(page, 'Pause');
  await tab(page, 'rooms').click();
  const roomsPanel = page.locator('.hud-rooms');
  if ((await roomsPanel.getAttribute('data-collapsed')) === 'true') {
    await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
  }
  let rooms = 0;
  for (let attempt = 1; attempt <= 6 && rooms === 0; attempt += 1) {
    await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
    const coords = page.locator('.hud-rooms__coordinates');
    if ((await coords.getAttribute('data-collapsed')) === 'true') {
      await page.locator('.hud-rooms__coordinates > .ui-section__header').click();
    }
    await page.locator('.hud-rooms__coord-x .ui-number__input').fill('5');
    await page.locator('.hud-rooms__coord-y .ui-number__input').fill('9');
    await page.locator('.hud-rooms__coord-width .ui-number__input').fill('6');
    await page.locator('.hud-rooms__coord-height .ui-number__input').fill('5');
    await page.locator('.hud-rooms__coordinates-submit').click();
    await page.waitForTimeout(250);
    const confirm = page.locator('.hud-rooms__confirm');
    if (await confirm.isVisible()) await confirm.click();
    await page.waitForTimeout(700);
    rooms = (await latestCounts(page))?.rooms ?? 0;
  }
  log(`cell block zoned: rooms=${rooms}`);
  expect(rooms, 'the cell block never zoned, so no prisoner can be admitted').toBeGreaterThan(0);

  await tab(page, 'build').click();
  if ((await section.getAttribute('data-collapsed')) === 'true') {
    await page.locator('.hud-build__coordinates > .ui-section__header').click();
  }
  for (const y of [10, 12]) for (const x of [5, 6, 7, 8, 9, 10]) await order(page, 'bed-wooden', x, y);
  await order(page, 'toilet-brick', 5, 9);
  await order(page, 'toilet-brick', 6, 9);
  await setSpeed(page, 'Fast forward');
  await setSpeed(page, 'Fast forward');
  await waitForQueueEmpty(page, 600_000);
  await page.waitForTimeout(3000);

  // Twelve prisoners, **no guards at all**. Nothing can respond.
  await setSpeed(page, 'Pause');
  await tab(page, 'overview').click();
  let admitted = 0;
  for (let i = 0; i < 12; i += 1) {
    const admit = page.locator('.hud-intake__admit');
    if ((await admit.getAttribute('disabled')) !== null) break;
    await admit.click();
    admitted += 1;
    await page.waitForTimeout(120);
  }
  log(`admitted ${admitted} with zero guards. counts=${JSON.stringify(await latestCounts(page))}`);
  log(`staff panel: ${(await panelText(page, '.hud-staff')).replace(/\n/g, ' | ')}`);

  // ---- the observer, inside the page ---------------------------------
  await page.evaluate(() => {
    const state = {
      samples: 0,
      startedAt: Date.now(),
      incidentTransitions: [] as [number, string][],
      fightTransitions: [] as [number, string, string][],
      incidentValuesSeen: [] as string[],
      lastIncident: '',
      lastFight: '',
    };
    (window as unknown as { __chipWatch: typeof state }).__chipWatch = state;
    const read = (selector: string): string => {
      const node = document.querySelector<HTMLElement>(selector);
      return node === null ? 'ABSENT' : (node.textContent ?? '').trim();
    };
    window.setInterval(() => {
      state.samples += 1;
      const incidents = read('[data-metric="incidents"] .ui-stat__value');
      if (incidents !== state.lastIncident) {
        state.incidentTransitions.push([Date.now() - state.startedAt, incidents]);
        state.lastIncident = incidents;
        if (!state.incidentValuesSeen.includes(incidents)) state.incidentValuesSeen.push(incidents);
      }
      // The fight row's own text, so a new fight is a transition here.
      const alerts = document.querySelector<HTMLElement>('.hud-alerts__list');
      const text = alerts === null ? 'ABSENT' : (alerts.innerText ?? '');
      const fight = /A fight has broken out[^\n]*/.exec(text)?.[0] ?? 'none';
      if (fight !== state.lastFight) {
        state.fightTransitions.push([Date.now() - state.startedAt, fight, incidents]);
        state.lastFight = fight;
      }
    }, 50);
  });

  await setSpeed(page, 'Fast forward');
  await setSpeed(page, 'Fast forward');
  const tickAtStart = await currentTick(page);
  log(`observer armed at tick ${tickAtStart}, clock ×4, polling every 50ms`);

  const WATCH_MS = Number(process.env['CHIP_WATCH_MS'] ?? 720_000);
  const startedAt = Date.now();
  while (Date.now() - startedAt < WATCH_MS) {
    await page.waitForTimeout(60_000);
    const w = (await page.evaluate(() => (window as unknown as { __chipWatch: ChipWatch }).__chipWatch)) as ChipWatch;
    log(
      `${Math.round((Date.now() - startedAt) / 1000)}s tick=${await currentTick(page)} samples=${w.samples}` +
        ` incidentValuesSeen=${JSON.stringify(w.incidentValuesSeen)} fights=${w.fightTransitions.length}` +
        ` incidentTransitions=${w.incidentTransitions.length}`,
    );
  }

  const watch = (await page.evaluate(() => (window as unknown as { __chipWatch: ChipWatch }).__chipWatch)) as ChipWatch;
  const tickAtEnd = await currentTick(page);
  log(`=== VERDICT DATA ===`);
  log(`ticks ${tickAtStart} -> ${tickAtEnd} (${tickAtEnd - tickAtStart} ticks, ${((tickAtEnd - tickAtStart) / 2400).toFixed(1)} in-game days)`);
  log(`${watch.samples} in-page samples at 50ms, so about ${(((tickAtEnd - tickAtStart) / watch.samples)).toFixed(1)} ticks between samples`);
  log(`every distinct INCIDENTS chip value ever seen: ${JSON.stringify(watch.incidentValuesSeen)}`);
  log(`INCIDENTS chip transitions (${watch.incidentTransitions.length}): ${JSON.stringify(watch.incidentTransitions.slice(0, 60))}`);
  log(`fight-row transitions (${watch.fightTransitions.length}), each with the chip value at that instant:`);
  for (const [at, fight, incidents] of watch.fightTransitions.slice(0, 60)) {
    log(`   +${Math.round(at / 1000)}s  INCIDENTS=${JSON.stringify(incidents)}  row=${JSON.stringify(fight)}`);
  }
  log(`alerts at the end: ${(await panelText(page, '.hud-alerts__list')).replace(/\n/g, ' ; ')}`);
  log(`strip at the end: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
  log(`counts at the end: ${JSON.stringify(await latestCounts(page))}`);
  await page.screenshot({ path: 'playtest-out/chip-verdict.png' });
});
