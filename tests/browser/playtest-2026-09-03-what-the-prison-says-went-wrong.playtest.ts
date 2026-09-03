import { type Page, test } from '@playwright/test';
import { buildAndPopulate, buy, currentTick, fastForwardToMax, installTee, latestCounts, openApp, panelText, tab } from './playtest-harness';

/**
 * **Playing incidents, contraband and the alerts list, for the playtest brief
 * of 2026-09-03.** Not a gate: `playwright.config.ts` collects `*.spec.ts`
 * only, so nothing in CI runs this file. See `playtest-harness.ts`'s docblock.
 *
 * Run one act at a time:
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5361 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-2026-09-03-what-the-prison-says-went-wrong.playtest.ts -g "act 1"
 * ```
 *
 * What each act is for:
 *
 * - **act 1** — an unguarded prison, played until incidents fire. Does the
 *   alerts list say what happened, in what order, with what day stamp, and
 *   does every `simulation/event` the worker published reach a row?
 * - **act 2** — a prison with a spare guard, played until a sweep finds
 *   something. Is the item **named** in the list (#703 rulings 3 and 13), and
 *   what does the status chip say beside it when two categories have been
 *   found?
 * - **act 3** — the same prison, drained, played until the event rows pass
 *   `MAX_EVENT_ALERT_ROWS` 8. Does eviction drop the least severe (#703
 *   ruling 11) rather than the oldest?
 *
 * Every act reads the DOM and the worker tee at the same moment, so a claim
 * about a missing row is a comparison rather than an absence.
 */

const log = (act: string, line: string): void => {
  console.log(`[${act}] ${line}`);
};

interface AlertRow {
  readonly id: string;
  readonly text: string;
  readonly dismissible: boolean;
}

interface AlertsSample {
  readonly tick: number;
  readonly eventBand: string;
  readonly refusalBand: string;
  readonly rows: readonly AlertRow[];
}

/** The alerts list as a player sees it, in painted order, plus both bands. */
async function readAlerts(page: Page): Promise<AlertsSample> {
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hud-alerts__list [data-alert]')].map((row) => ({
      id: row.dataset['alert'] ?? '?',
      text: (row.innerText ?? '').replace(/\s+/g, ' ').trim(),
      dismissible: row.dataset['alertDismissible'] === 'true',
    })),
  );
  return {
    tick: await currentTick(page),
    eventBand: await panelText(page, '.hud__event'),
    refusalBand: await panelText(page, '.hud__refusal'),
    rows,
  };
}

interface WorkerEvent {
  readonly sequence: number;
  readonly tick: number;
  readonly type: string;
  readonly restored: boolean;
  readonly json: string;
}

/** Every `simulation/event` the worker has published, from the tee -- the simulation's own record. */
async function publishedEvents(page: Page): Promise<readonly WorkerEvent[]> {
  return page.evaluate(() =>
    ((window as unknown as { lockstateFromWorker?: unknown[] }).lockstateFromWorker ?? [])
      .filter((message) => (message as { kind?: string }).kind === 'simulation/event')
      .map((message) => {
        const payload = (message as { payload: { event: Record<string, unknown>; restored?: boolean } }).payload;
        return {
          sequence: payload.event['sequence'] as number,
          tick: payload.event['tick'] as number,
          type: payload.event['type'] as string,
          restored: payload.restored === true,
          json: JSON.stringify(payload.event),
        };
      }),
  );
}

/** The Contraband chip: its count and whatever the badge beside it says (`''` for no badge). */
async function contrabandChip(page: Page): Promise<{ value: string; badge: string }> {
  return page.evaluate(() => {
    const chip = document.querySelector<HTMLElement>('[data-metric="contraband"]');
    if (chip === null) return { value: 'ABSENT', badge: 'ABSENT' };
    return {
      value: (chip.querySelector<HTMLElement>('.ui-stat__value')?.innerText ?? '?').trim(),
      badge: (chip.querySelector<HTMLElement>('.ui-badge')?.innerText ?? '').trim(),
    };
  });
}

/**
 * Samples the alerts list every `stepMs` until `until` says stop or the budget
 * runs out, logging only when the painted rows or a band changes -- so the
 * transcript is the prison's story rather than a poll trace.
 */
async function watchAlerts(
  page: Page,
  act: string,
  budgetMs: number,
  until: (sample: AlertsSample) => boolean,
  stepMs = 2_000,
): Promise<AlertsSample> {
  const started = Date.now();
  let previous = '';
  let sample = await readAlerts(page);
  for (;;) {
    sample = await readAlerts(page);
    const signature = JSON.stringify([sample.eventBand, sample.refusalBand, sample.rows]);
    if (signature !== previous) {
      previous = signature;
      log(act, `t+${Math.round((Date.now() - started) / 1000)}s tick ${sample.tick} band=${JSON.stringify(sample.eventBand)}`);
      for (const [index, row] of sample.rows.entries()) {
        log(act, `    [${index}] ${row.id}${row.dismissible ? ' (x)' : '    '} ${JSON.stringify(row.text)}`);
      }
      if (sample.refusalBand !== '' && !sample.refusalBand.includes('not laid out')) {
        log(act, `    refusal band: ${JSON.stringify(sample.refusalBand)}`);
      }
    }
    if (until(sample)) return sample;
    if (Date.now() - started > budgetMs) return sample;
    await page.waitForTimeout(stepMs);
  }
}

/** What the worker published against what the list is painting, side by side. */
async function reconcile(page: Page, act: string): Promise<void> {
  const events = await publishedEvents(page);
  const sample = await readAlerts(page);
  log(act, `worker published ${events.length} simulation/event message(s):`);
  for (const event of events) {
    log(act, `    #${event.sequence} tick ${event.tick} ${event.type}${event.restored ? ' [restored]' : ''} ${event.json}`);
  }
  log(act, `alerts list is painting ${sample.rows.length} row(s):`);
  for (const row of sample.rows) log(act, `    ${row.id} ${JSON.stringify(row.text)}`);
  const paintedSequences = new Set(
    sample.rows.filter((row) => row.id.startsWith('event-')).map((row) => Number(row.id.slice('event-'.length))),
  );
  const missing = events.filter((event) => !paintedSequences.has(event.sequence));
  log(
    act,
    `event ordinals published but not on a row of their own: ${JSON.stringify(missing.map((event) => `${event.sequence}:${event.type}`))}`,
  );
}

/** Hires `count` guards from the Security tab. */
async function hireGuards(page: Page, count: number): Promise<void> {
  await tab(page, 'security').click();
  const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
  if ((await guardRow.count()) > 0) await guardRow.first().click();
  for (let index = 0; index < count; index += 1) {
    await page.locator('.hud-staff__hire').click();
    await page.waitForTimeout(250);
  }
}

test.describe.configure({ mode: 'serial' });

test('act 1: an unguarded prison -- what the alerts list says, in what order, and against the worker record', async ({ page }) => {
  await installTee(page);
  await openApp(page);
  await buildAndPopulate(page, { beds: 4, admits: 6, guards: 0, label: 'act1' });
  await fastForwardToMax(page);
  log('act1', `built and populated at tick ${await currentTick(page)}; clock at x4`);

  const first = await watchAlerts(page, 'act1', 300_000, (sample) =>
    sample.rows.some((row) => row.id.startsWith('event-')),
  );
  log('act1', `first event row at tick ${first.tick}`);

  // Keep playing past the first incident: the question is the *order* of the
  // list and whether an all-clear ever arrives in a prison with no guards.
  await watchAlerts(page, 'act1', 240_000, () => false);
  await reconcile(page, 'act1');

  const counts = await latestCounts(page);
  log('act1', `counts: ${JSON.stringify(counts)}`);
  log('act1', `incidents chip: ${JSON.stringify(await panelText(page, '[data-metric="incidents"]'))}`);
  log('act1', `strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
});

test('act 2: a spare guard sweeps -- is the found item named, and what does the chip say', async ({ page }) => {
  await installTee(page);
  await openApp(page);
  await buildAndPopulate(page, { beds: 6, admits: 10, guards: 4, label: 'act2' });
  await fastForwardToMax(page);
  log('act2', `built, populated and staffed at tick ${await currentTick(page)}; clock at x4`);
  log('act2', `contraband chip before any sweep: ${JSON.stringify(await contrabandChip(page))}`);

  // A sweep is ordered every 600 ticks by a staffed sector with a spare
  // guard, and detects a phone at 0.30 per visit -- so this waits days, not
  // ticks.
  const found = await watchAlerts(page, 'act2', 420_000, (sample) =>
    sample.rows.some((row) => row.text.includes('Contraband found')),
  );
  log('act2', `contraband row present: ${found.rows.some((row) => row.text.includes('Contraband found'))} at tick ${found.tick}`);
  log('act2', `contraband chip now: ${JSON.stringify(await contrabandChip(page))}`);

  // Keep going: a second category found is the state the chip is documented
  // to fall back to a bare count in, and the list is documented to name both.
  await watchAlerts(page, 'act2', 150_000, () => false);
  log('act2', `contraband chip at end: ${JSON.stringify(await contrabandChip(page))}`);
  await reconcile(page, 'act2');
  log('act2', `counts: ${JSON.stringify(await latestCounts(page))}`);
});

test('act 3: nine event rows -- does the list evict the least severe or the oldest', async ({ page }) => {
  await installTee(page);
  await openApp(page);
  await buildAndPopulate(page, { beds: 6, admits: 12, guards: 2, label: 'act3' });

  // Drain the treasury so every payday is short: `economy.wages-unpaid`
  // carries the arrears *after* the payday, so each one is a new statement
  // and therefore a new row -- which is the only lever this game gives a
  // player for driving the list past its cap in one session.
  await tab(page, 'build').click();
  for (const quantity of [150, 150, 150, 100]) {
    await buy(page, 'wall-brick', quantity);
    const counts = await latestCounts(page);
    log('act3', `bought ${quantity} bricks; funds now ${String(counts?.treasuryMinorUnits)}`);
  }
  log('act3', `refusal band after the buys: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);

  await fastForwardToMax(page);
  log('act3', `draining done at tick ${await currentTick(page)}; clock at x4`);

  const overCap = await watchAlerts(
    page,
    'act3',
    480_000,
    (sample) => sample.rows.filter((row) => row.id.startsWith('event-')).length >= 8,
  );
  log('act3', `event rows at the cap: ${overCap.rows.filter((row) => row.id.startsWith('event-')).length} at tick ${overCap.tick}`);

  // Past the cap: what leaves is the measurement.
  await watchAlerts(page, 'act3', 120_000, () => false);
  await reconcile(page, 'act3');
  log('act3', `counts: ${JSON.stringify(await latestCounts(page))}`);
});
