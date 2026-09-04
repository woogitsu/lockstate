/**
 * What the game tells a player over a whole session, and how much of it is
 * still true.
 *
 * **A playtest, not a gate.** `tests/browser/playwright.config.ts` collects
 * `*.spec.ts`; this suffix is collected only by
 * `tests/browser/playwright.playtest.config.ts`, which nothing in CI drives.
 *
 * The question: over an hour of play, every sentence the game puts on screen,
 * when, for how long -- and of the sentences standing at any given moment, how
 * many are still true. The two channels are kept apart per the brief:
 * **sentences** come from the DOM (`innerText`), **facts** come from the worker
 * tee (`simulation/status-counts`, `simulation/event`). The gap between them is
 * the finding.
 *
 * Acts:
 *   1. The first two sentences a player can earn from one button, and how long
 *      the first stays on screen after the player has fixed what it is about.
 *   2. A long session: build, populate, run many in-game days with no guards,
 *      sampling every visible region on a cadence. Produces the timeline, the
 *      silence gap (worker events vs rows on screen) and the truth audit.
 *   3. What a player can clear, and what the column does when it is full.
 *
 * The record is `docs/research/2026-09-04-what-the-game-tells-you.md`.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  TILE,
  armBuildable,
  buildAndPopulate,
  buy,
  calibrate,
  centreOf,
  countsSeries,
  currentClock,
  currentTick,
  drag,
  fastForwardToMax,
  installTee,
  latestCounts,
  openApp,
  panelText,
  press,
  tab,
  waitForQueueEmpty,
} from './playtest-harness';

/** Every `simulation/event` the worker has published so far, flattened. */
async function eventStream(
  page: Page,
): Promise<readonly { readonly sequence: number; readonly tick: number; readonly type: string }[]> {
  return page.evaluate(() =>
    ((window as unknown as { lockstateFromWorker?: unknown[] }).lockstateFromWorker ?? [])
      .filter((message) => (message as { kind?: string }).kind === 'simulation/event')
      .map((message) => {
        const event = (message as { payload: { event: Record<string, unknown> } }).payload.event;
        return {
          sequence: Number(event['sequence'] ?? -1),
          tick: Number(event['tick'] ?? -1),
          type: String(event['type'] ?? '?'),
        };
      }),
  );
}

/** The last published `counts` object in full, whatever keys it carries. */
async function rawCounts(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const messages = (window as unknown as { lockstateFromWorker?: unknown[] }).lockstateFromWorker ?? [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index] as { kind?: string; payload?: { counts?: Record<string, unknown> } };
      if (message.kind === 'simulation/status-counts') return message.payload?.counts ?? {};
    }
    return {};
  });
}

interface AlertRow {
  readonly id: string;
  readonly text: string;
  readonly dismissible: boolean;
}

interface WordSample {
  readonly tick: number;
  readonly day: string;
  readonly refusal: string;
  readonly eventBand: string;
  readonly alerts: readonly AlertRow[];
  readonly strip: string;
}

/**
 * Everything the HUD is saying, right now.
 *
 * Read through `innerText` and `dataset`, never through the view model: a
 * sentence that is in the view model and not on screen is exactly the defect
 * this instrument exists to look for.
 */
async function wordSample(page: Page): Promise<WordSample> {
  const dom = await page.evaluate(() => {
    const visibleText = (selector: string): string => {
      const node = document.querySelector<HTMLElement>(selector);
      if (node === null) return '';
      if (node.hidden || node.getClientRects().length === 0) return '';
      return (node.innerText ?? '').replace(/\s+/g, ' ').trim();
    };
    const alerts = [...document.querySelectorAll<HTMLElement>('.hud-alerts__list [data-alert]')].map((row) => ({
      id: row.dataset['alert'] ?? '?',
      text: (row.innerText ?? '').replace(/\s+/g, ' ').trim(),
      dismissible: row.dataset['alertDismissible'] === 'true',
    }));
    return {
      refusal: visibleText('.hud__refusal'),
      eventBand: visibleText('.hud__event'),
      alerts,
      strip: visibleText('.hud-strip'),
      day: (document.querySelector<HTMLElement>('.hud-clock__day')?.textContent ?? '?').trim(),
    };
  });
  return { tick: await currentTick(page), ...dom };
}

function logSample(label: string, sample: WordSample): void {
  console.log(
    `[${label}] tick=${sample.tick} day=${sample.day}\n` +
      `  BAND    : ${JSON.stringify(sample.refusal)}\n` +
      `  EVENT   : ${JSON.stringify(sample.eventBand)}\n` +
      `  ALERTS  : ${sample.alerts.length} row(s)\n` +
      sample.alerts.map((row) => `      [${row.dismissible ? 'x' : ' '}] ${row.id} :: ${row.text}`).join('\n'),
  );
}

test.describe('what the game tells you', () => {
  test.beforeEach(async ({ page }) => {
    await installTee(page);
    page.on('console', (message) => {
      if (message.type() === 'error') console.log(`[page-error] ${message.text()}`);
    });
  });

  /**
   * Act 1 -- one button, two sentences, and how long the loser stays up.
   *
   * `src/main.ts`'s Admit handler throws `HostRefusalError('no-room-to-hold-anybody')`
   * when `viewModel.counts.rooms === 0` and submits otherwise, so the same
   * press is refused on two different sides of `sender.submit` depending on
   * whether anything is zoned. The two sides have different sentences.
   */
  test('act 1: one button, two sentences, and a sticky one', async ({ page }) => {
    test.setTimeout(600_000);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    console.log('=== 1a: a brand-new prison, nothing zoned. Press Admit. ===');
    await tab(page, 'overview').click();
    console.log(`intake hint before the press: ${JSON.stringify(await panelText(page, '.hud-intake'))}`);
    await page.locator('.hud-intake__admit').click();
    await page.waitForTimeout(700);
    const hostRefusal = await wordSample(page);
    logSample('1a', hostRefusal);

    console.log('=== 1b: build a cell with no bed in it, then press Admit again. ===');
    await tab(page, 'build').click();
    const origin = await calibrate(page);
    await buy(page, 'wall-brick', 60);
    await buy(page, 'bed-wooden', 6);
    await fastForwardToMax(page);
    await page.waitForTimeout(3000);
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
    await waitForQueueEmpty(page);

    // Zone it, retrying the way `buildAndPopulate` does.
    let attempts = 0;
    for (;;) {
      attempts += 1;
      await tab(page, 'rooms').click();
      const collapsed = await page.locator('.hud-rooms').getAttribute('data-collapsed');
      if (collapsed === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
      await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
      await page.locator('.hud-rooms__arm').click();
      await drag(page, centreOf(origin, 12, 12), centreOf(origin, 17, 17));
      await page.locator('.hud-rooms__confirm').click();
      await page.waitForTimeout(800);
      if (((await latestCounts(page))?.rooms ?? 0) > 0) break;
      if (attempts >= 12) throw new Error('never zoned');
      await page.waitForTimeout(5000);
    }
    console.log(`zoned after ${attempts} attempt(s) at tick ${await currentTick(page)}`);

    const beforeSecondAdmit = await wordSample(page);
    logSample('1b-before', beforeSecondAdmit);
    await tab(page, 'overview').click();
    console.log(`intake hint with a zoned, bedless cell: ${JSON.stringify(await panelText(page, '.hud-intake'))}`);
    await page.locator('.hud-intake__admit').click();
    await page.waitForTimeout(1500);
    const simRefusal = await wordSample(page);
    logSample('1b-after', simRefusal);
    console.log(`counts at 1b: ${JSON.stringify(await rawCounts(page))}`);

    console.log('=== 1c: put beds in. Does the standing sentence change? ===');
    await tab(page, 'build').click();
    await armBuildable(page, 'bed-wooden');
    for (let column = 12; column <= 15; column += 1) {
      const point = centreOf(origin, column, 13);
      await press(page, point.x, point.y);
    }
    await waitForQueueEmpty(page);
    await page.waitForTimeout(2000);
    const bedsBuiltAt = await currentTick(page);
    const withBeds = await wordSample(page);
    console.log(`beds finished at tick ${bedsBuiltAt}`);
    logSample('1c', withBeds);
    console.log(`counts at 1c: ${JSON.stringify(await rawCounts(page))}`);

    console.log('=== 1d: let it stand. Sample the band every ~10s for 60s. ===');
    for (let index = 0; index < 6; index += 1) {
      await page.waitForTimeout(10_000);
      const sample = await wordSample(page);
      console.log(`  1d[${index}] tick=${sample.tick} BAND=${JSON.stringify(sample.refusal)}`);
    }

    console.log('=== 1e: press Admit again -- does the sentence go? ===');
    await tab(page, 'overview').click();
    await page.locator('.hud-intake__admit').click();
    await page.waitForTimeout(1500);
    const afterSuccess = await wordSample(page);
    logSample('1e', afterSuccess);
    console.log(`counts at 1e: ${JSON.stringify(await rawCounts(page))}`);
    console.log(`events so far: ${JSON.stringify(await eventStream(page))}`);
  });

  /**
   * Act 2 -- the long session.
   *
   * A twelve-bed prison with **no guards**, so incidents open and lapse: that
   * is the shape `docs/research/2026-09-04-does-anyone-answer-an-incident.md`
   * measured as producing 19 lapsed incidents out of 19. The point is not the
   * incidents, it is the sentences they leave behind.
   */
  test('act 2: a long session, and a census of its words', async ({ page }) => {
    test.setTimeout(600_000);
    await openApp(page);
    await buildAndPopulate(page, { beds: 8, admits: 12, guards: 0, label: 'census' });
    await fastForwardToMax(page);

    const samples: WordSample[] = [];
    const started = Date.now();
    const budgetMs = 380_000;
    for (;;) {
      const sample = await wordSample(page);
      samples.push(sample);
      if (samples.length % 10 === 1) logSample(`census#${samples.length}`, sample);
      if (Date.now() - started > budgetMs) break;
      await page.waitForTimeout(4000);
    }

    const events = await eventStream(page);
    const counts = await rawCounts(page);
    const finalSample = samples[samples.length - 1];
    if (finalSample === undefined) throw new Error('no samples');

    console.log('=== CENSUS: every distinct sentence, first tick, last tick ===');
    const lifetimes = new Map<string, { region: string; first: number; last: number; seen: number }>();
    for (const sample of samples) {
      const entries: readonly (readonly [string, string])[] = [
        ['band', sample.refusal],
        ['event-band', sample.eventBand],
        ...sample.alerts.map((row) => ['alerts', row.text] as const),
      ];
      for (const [region, text] of entries) {
        if (text === '') continue;
        const key = `${region} ${text}`;
        const existing = lifetimes.get(key);
        if (existing === undefined) lifetimes.set(key, { region, first: sample.tick, last: sample.tick, seen: 1 });
        else {
          existing.last = sample.tick;
          existing.seen += 1;
        }
      }
    }
    for (const [key, life] of [...lifetimes.entries()].sort((a, b) => a[1].first - b[1].first)) {
      const text = key.split(' ')[1] ?? '';
      console.log(
        `  ${life.region.padEnd(10)} ticks ${String(life.first).padStart(6)}..${String(life.last).padStart(6)}` +
          ` (${life.last - life.first} ticks, ${life.seen} samples) :: ${text}`,
      );
    }

    console.log('=== SILENCE GAP: worker events vs rows on screen ===');
    const byType = new Map<string, number>();
    for (const event of events) byType.set(event.type, (byType.get(event.type) ?? 0) + 1);
    console.log(`  ${events.length} event(s) published, by type:`);
    for (const [type, count] of [...byType.entries()].sort()) console.log(`     ${count}x ${type}`);
    console.log(`  first tick ${events[0]?.tick ?? -1}, last tick ${events[events.length - 1]?.tick ?? -1}`);
    console.log(`  rows standing at the end: ${finalSample.alerts.length}`);

    console.log('=== THE STATE AT THE END ===');
    console.log(`  tick ${finalSample.tick}, day ${finalSample.day}`);
    console.log(`  counts: ${JSON.stringify(counts)}`);
    console.log(`  strip: ${JSON.stringify(finalSample.strip)}`);
    logSample('final', finalSample);

    console.log('=== CLEARABILITY ===');
    const dismissible = finalSample.alerts.filter((row) => row.dismissible);
    console.log(`  ${dismissible.length} of ${finalSample.alerts.length} rows carry a control.`);
    console.log(`  without a control: ${JSON.stringify(finalSample.alerts.filter((r) => !r.dismissible).map((r) => r.id))}`);
    for (const row of dismissible) {
      await page.locator(`.hud-alerts__list [data-alert="${row.id}"] .ui-icon-button`).click();
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(1500);
    const afterDismiss = await wordSample(page);
    logSample('after dismissing everything a player can', afterDismiss);
    console.log(`  band after dismissing everything: ${JSON.stringify(afterDismiss.refusal)}`);
  });

  /**
   * Act 3 -- the two sentences an all-clear leaves behind, at close range.
   *
   * Same prison shape as act 2 but sampled fast and short, so an `all-clear`
   * row and a later incident can be caught standing at the same moment.
   */
  test('act 3: is the all-clear still true', async ({ page }) => {
    test.setTimeout(600_000);
    await openApp(page);
    await buildAndPopulate(page, { beds: 8, admits: 12, guards: 0, label: 'allclear' });
    await fastForwardToMax(page);

    let contradictions = 0;
    const started = Date.now();
    for (;;) {
      const sample = await wordSample(page);
      const counts = await rawCounts(page);
      const openIncidents = Number(counts['incidentsOpen'] ?? counts['incidents'] ?? -1);
      const allClearRows = sample.alerts.filter((row) => row.text.includes('No incident is still open') || row.text.includes('no incident is still open'));
      if (allClearRows.length > 0 && openIncidents > 0) {
        contradictions += 1;
        if (contradictions <= 6) {
          console.log(
            `[contradiction ${contradictions}] tick=${sample.tick} day=${sample.day} openIncidents=${openIncidents}\n` +
              allClearRows.map((row) => `    standing row: ${row.text}`).join('\n') +
              `\n    strip: ${JSON.stringify(sample.strip)}` +
              `\n    band : ${JSON.stringify(sample.refusal)}`,
          );
        }
      }
      if (Date.now() - started > 300_000) {
        console.log(`=== end: ${contradictions} sample(s) had an all-clear row standing while an incident was open ===`);
        logSample('act3-final', sample);
        console.log(`counts: ${JSON.stringify(counts)}`);
        console.log(`events: ${JSON.stringify(await eventStream(page))}`);
        console.log(`clock: ${JSON.stringify(await currentClock(page))}`);
        console.log(`counts series length: ${(await countsSeries(page)).length}`);
        break;
      }
      await page.waitForTimeout(2500);
    }
  });
});
