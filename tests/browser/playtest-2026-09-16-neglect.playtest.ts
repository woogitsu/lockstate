/**
 * A neglect measurement pass, 2026-09-16.
 *
 * Not a gate and not a regression suite: it plays the game and prints what the
 * screen says, so a research note can quote it. See
 * `docs/research/2026-09-16-*.md`.
 *
 * Act 1 asks whether the two acknowledgements the 2026-09-15 cold-start pass
 * found -- `rooms.zoned` and `prisoners.housed` -- can be earned by a prison
 * the player is neglecting: a sealed doorless box with one bed, no toilet, no
 * guard, left to run.
 *
 * Act 2 asks what the game says when twenty-four ordered walls finish, with
 * the Build section never leaving the screen so the diff is not confounded by
 * a section switch (which is the limit the 2026-09-15 pass stated for its own
 * section 5a).
 */
import { expect, test } from '@playwright/test';

import {
  ARM_TIMEOUT_MS,
  TILE,
  armBuildable,
  buy,
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
  showPanel,
  waitForQueueEmpty,
} from './playtest-harness';

/** Every sentence the bands and the alerts list ever carry, sampled at 120 ms. */
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
    const seen = (window as unknown as { lockstateBandLog?: { band: string; text: string; at: number }[] }).lockstateBandLog ?? [];
    const first = seen[0]?.at ?? 0;
    return seen.map((s) => `+${String(s.at - first).padStart(7)}ms ${s.band}: ${JSON.stringify(s.text)}`);
  });
}

test.beforeEach(async ({ page }) => {
  await installTee(page);
  page.on('console', (message) => {
    const text = message.text();
    if (/error|refus|warn/i.test(text)) console.log(`[page:${message.type()}] ${text}`);
  });
});

/**
 * A prison a player has neglected in every way the game can see: the cell is
 * sealed with no door, it has one bed and no toilet, there is no guard, and
 * after the two admissions nothing else is pressed.
 */
test('act 1 -- can a neglected prison earn the acknowledgements', async ({ page }) => {
  await openApp(page);
  await recordBands(page);
  const log = (line: string) => console.log(`[act1] ${line}`);
  const strip = async (when: string) => log(`strip @${when}: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);

  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');

  await showPanel(page, 'build', '.hud-build');
  const origin = await calibrate(page);
  log(`calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);

  // 48 bricks for 24 segments, one bed. NO TOILET is deliberate.
  await buy(page, 'wall-brick', 50);
  await buy(page, 'bed-wooden', 3);
  await strip('after buying 50 bricks and 1 bed');

  await fastForwardToMax(page);
  await page.waitForTimeout(3000);
  log(`clock: ${JSON.stringify(await currentClock(page))} at tick ${await currentTick(page)}`);

  await armBuildable(page, 'wall-brick');
  const westX = origin.originX + 12 * TILE;
  const eastX = origin.originX + 18 * TILE;
  const northY = origin.originY + 12 * TILE;
  const southY = origin.originY + 18 * TILE;
  for (const run of [
    { name: 'north', a: { x: westX + TILE / 2, y: northY }, b: { x: eastX - TILE / 2, y: northY } },
    { name: 'south', a: { x: westX + TILE / 2, y: southY }, b: { x: eastX - TILE / 2, y: southY } },
    { name: 'west', a: { x: westX, y: northY + TILE / 2 }, b: { x: westX, y: southY - TILE / 2 } },
    { name: 'east', a: { x: eastX, y: northY + TILE / 2 }, b: { x: eastX, y: southY - TILE / 2 } },
  ]) {
    const produced = await drag(page, run.a, run.b);
    log(`wall run ${run.name}: ${produced.length} command(s)`);
  }
  await waitForQueueEmpty(page);
  log(`walls up at tick ${await currentTick(page)}`);

  // Designate the sealed box as a Cell. Retry for the reason the harness does.
  let attempts = 0;
  for (;;) {
    attempts += 1;
    await showPanel(page, 'zones', '.hud-rooms');
    const collapsed = await page.locator('.hud-rooms').getAttribute('data-collapsed');
    if (collapsed === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    const roomRow = page.locator('.hud-rooms__list [data-room="room.cell"]');
    await roomRow.click();
    await expect(roomRow).toHaveAttribute('data-selected', 'true', { timeout: ARM_TIMEOUT_MS });
    const roomArm = page.locator('.hud-rooms__arm');
    if ((await roomArm.getAttribute('data-armed')) !== 'true') await roomArm.click();
    await expect(roomArm).toHaveAttribute('data-armed', 'true', { timeout: ARM_TIMEOUT_MS });
    await drag(page, centreOf(origin, 12, 12), centreOf(origin, 17, 17));
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(1200);
    const counts = await latestCounts(page);
    log(`designate attempt ${attempts}: rooms=${counts?.rooms}`);
    if ((counts?.rooms ?? 0) > 0) break;
    if (attempts >= 10) throw new Error('the rectangle was never accepted as a room');
    await page.waitForTimeout(5000);
  }
  log(`EVENT BAND right after the designation: ${JSON.stringify(await panelText(page, '.hud__event'))}`);
  log(`ALERTS right after the designation: ${JSON.stringify(await panelText(page, '.hud-alerts__list'))}`);
  log(`ROOMS PANEL right after the designation: ${JSON.stringify(await panelText(page, '.hud-rooms'))}`);
  await strip('after designating a doorless cell');

  // One bed, inside. No toilet, no door, no guard.
  await showPanel(page, 'build', '.hud-build');
  await armBuildable(page, 'bed-wooden');
  const bed = centreOf(origin, 13, 13);
  const bedCommands = await press(page, bed.x, bed.y);
  log(`bed order at (13,13): ${bedCommands.length} command(s)`);
  await waitForQueueEmpty(page);
  await page.waitForTimeout(1500);
  const built = await latestCounts(page);
  log(`bed standing at tick ${built?.tick}: rooms=${built?.rooms} roomCapacity=${built?.roomCapacity} accommodationCapacity=${built?.accommodationCapacity}`);

  await showPanel(page, 'zones', '.hud-rooms');
  log(`ROOMS PANEL with one bed and no toilet and no door: ${JSON.stringify(await panelText(page, '.hud-rooms'))}`);

  // Admit two. One place exists, so the second should stay queued.
  await showPanel(page, 'manage', '.hud-intake');
  log(`INTAKE before admitting: ${JSON.stringify(await panelText(page, '.hud-intake'))}`);
  for (let index = 0; index < 2; index += 1) {
    await page.locator('.hud-intake__admit').click();
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(4000);
  log(`INTAKE after two admissions: ${JSON.stringify(await panelText(page, '.hud-intake'))}`);
  log(`EVENT BAND after admitting: ${JSON.stringify(await panelText(page, '.hud__event'))}`);
  const admitted = await latestCounts(page);
  log(`counts after admitting: ${JSON.stringify(admitted)}`);

  // And now neglect it: nothing more is pressed. Run for four in-game days.
  const startTick = await currentTick(page);
  const target = startTick + 4 * 2400;
  log(`neglect starts at tick ${startTick}; running to ${target}`);
  for (;;) {
    const tick = await currentTick(page);
    if (tick >= target) break;
    await page.waitForTimeout(5000);
  }
  log(`neglect ended at tick ${await currentTick(page)}`);

  await strip('after four neglected days');
  log(`counts at the end: ${JSON.stringify(await latestCounts(page))}`);
  await showPanel(page, 'zones', '.hud-rooms');
  log(`ROOMS PANEL at the end: ${JSON.stringify(await panelText(page, '.hud-rooms'))}`);
  await showPanel(page, 'day-plan', '.hud-regime');
  log(`REGIME PANEL at the end: ${JSON.stringify(await panelText(page, '.hud-regime'))}`);
  const rosterRows = await page.locator('.hud-regime__roster-row').count();
  if (rosterRows > 0) {
    await page.locator('.hud-regime__roster-row').first().click();
    await page.waitForTimeout(800);
    log(`ROSTER DETAIL of the first prisoner: ${JSON.stringify(await panelText(page, '.hud-regime__detail'))}`);
  } else {
    log('no roster rows to open');
  }
  await showPanel(page, 'overview', '.hud-overview');
  log(`OVERVIEW at the end: ${JSON.stringify(await panelText(page, '.hud-overview'))}`);
  log(`ALERTS at the end: ${JSON.stringify(await panelText(page, '.hud-alerts__list'))}`);
  log(`REFUSAL BAND at the end: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);

  log('EVERY band sentence this run ever showed:');
  for (const line of await bandLog(page)) log(`  ${line}`);
});

/**
 * Twenty-four walls, finishing while the Build section stays open, so what the
 * page gains at completion is a clean diff rather than a section switch.
 */
test('act 2 -- what the game says when twenty-four walls go up', async ({ page }) => {
  await openApp(page);
  await recordBands(page);
  const log = (line: string) => console.log(`[act2] ${line}`);

  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');

  await showPanel(page, 'build', '.hud-build');
  const origin = await calibrate(page);
  await buy(page, 'wall-brick', 50);
  await fastForwardToMax(page);
  await page.waitForTimeout(3000);

  const snapshot = async (): Promise<readonly string[]> =>
    page.evaluate(() => {
      const nodes: string[] = [];
      const walk = (node: Node): void => {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = (node.textContent ?? '').trim();
          const parent = node.parentElement;
          if (text.length === 0 || parent === null) return;
          if (parent.hidden || parent.getClientRects().length === 0) return;
          nodes.push(text);
          return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const element = node as HTMLElement;
        if (element.hidden || element.getClientRects().length === 0) return;
        for (const child of Array.from(element.childNodes)) walk(child);
      };
      walk(document.body);
      return nodes;
    });

  await armBuildable(page, 'wall-brick');
  const westX = origin.originX + 12 * TILE;
  const eastX = origin.originX + 18 * TILE;
  const northY = origin.originY + 12 * TILE;
  const southY = origin.originY + 18 * TILE;
  for (const run of [
    { name: 'north', a: { x: westX + TILE / 2, y: northY }, b: { x: eastX - TILE / 2, y: northY } },
    { name: 'south', a: { x: westX + TILE / 2, y: southY }, b: { x: eastX - TILE / 2, y: southY } },
    { name: 'west', a: { x: westX, y: northY + TILE / 2 }, b: { x: westX, y: southY - TILE / 2 } },
    { name: 'east', a: { x: eastX, y: northY + TILE / 2 }, b: { x: eastX, y: southY - TILE / 2 } },
  ]) {
    const produced = await drag(page, run.a, run.b);
    log(`wall run ${run.name}: ${produced.length} command(s)`);
  }

  // The Build section stays open from here to the end of the act.
  const ordered = await snapshot();
  log(`QUEUE with 24 ordered: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
  log(`BUILD PANEL with 24 ordered: ${JSON.stringify(await panelText(page, '.hud-build'))}`);
  log(`STRIP with 24 ordered: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
  log(`text nodes with 24 ordered: ${ordered.length}`);

  // Poll the queue readout without leaving the section.
  const started = Date.now();
  let lastQueue = '';
  for (;;) {
    const text = await panelText(page, '.hud-build__queue');
    if (text !== lastQueue) {
      log(`+${Date.now() - started}ms queue: ${JSON.stringify(text)}`);
      lastQueue = text;
    }
    if (/(?<![0-9])0 waiting . 0 being built/.test(text) || text.includes('not laid out') || text.includes('ABSENT')) break;
    if (Date.now() - started > 240_000) throw new Error(`the queue never emptied: ${text}`);
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(2500);

  const finished = await snapshot();
  log(`QUEUE at completion: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
  log(`BUILD PANEL at completion: ${JSON.stringify(await panelText(page, '.hud-build'))}`);
  log(`STRIP at completion: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
  log(`EVENT BAND at completion: ${JSON.stringify(await panelText(page, '.hud__event'))}`);
  log(`ALERTS at completion: ${JSON.stringify(await panelText(page, '.hud-alerts__list'))}`);
  log(`counts at completion: ${JSON.stringify(await latestCounts(page))}`);

  const before = [...ordered];
  const gained = finished.filter((text) => {
    const index = before.indexOf(text);
    if (index === -1) return true;
    before.splice(index, 1);
    return false;
  });
  const after = [...finished];
  const lost = ordered.filter((text) => {
    const index = after.indexOf(text);
    if (index === -1) return true;
    after.splice(index, 1);
    return false;
  });
  log(`GAINED at completion (${gained.length}): ${JSON.stringify(gained)}`);
  log(`LOST at completion (${lost.length}): ${JSON.stringify(lost)}`);

  log('EVERY band sentence this run ever showed:');
  for (const line of await bandLog(page)) log(`  ${line}`);
});
