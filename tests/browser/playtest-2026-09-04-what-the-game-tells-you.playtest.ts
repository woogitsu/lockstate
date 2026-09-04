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
   * Act 2 -- the long session, and a census of its words.
   *
   * A twelve-prisoner prison with **no guards**, so incidents open and lapse:
   * the shape `docs/research/2026-09-04-does-anyone-answer-an-incident.md`
   * measured as producing 19 lapsed incidents out of 19. The point is not the
   * incidents, it is the sentences they leave behind.
   *
   * Every sample carries the HUD's words **and** the worker's facts at the
   * same tick, so "is this sentence still true" is answered offline over the
   * samples rather than by a second run.
   */
  test('act 2: a long session, and a census of its words', async ({ page }) => {
    test.setTimeout(600_000);
    await openApp(page);
    await buildAndPopulate(page, { beds: 8, admits: 12, guards: 0, label: 'census' });
    await fastForwardToMax(page);

    const samples: { readonly words: WordSample; readonly facts: Record<string, unknown> }[] = [];
    const started = Date.now();
    const budgetMs = 250_000;
    for (;;) {
      const words = await wordSample(page);
      const facts = await rawCounts(page);
      samples.push({ words, facts });
      if (samples.length % 12 === 1) {
        logSample(`census#${samples.length}`, words);
        console.log(
          `      facts: activeIncidents=${String(facts['activeIncidents'])}` +
            ` conditions=${JSON.stringify(facts['conditions'])}` +
            ` unpaidWages=${String(facts['unpaidWagesMinorUnits'])}` +
            ` treasury=${String(facts['treasuryMinorUnits'])}`,
        );
      }
      if (Date.now() - started > budgetMs) break;
      await page.waitForTimeout(3500);
    }

    const events = await eventStream(page);
    const last = samples[samples.length - 1];
    if (last === undefined) throw new Error('no samples');

    console.log('=== CENSUS: every distinct sentence, first tick, last tick ===');
    const lifetimes = new Map<string, { region: string; text: string; first: number; last: number; seen: number }>();
    for (const { words } of samples) {
      const entries: readonly (readonly [string, string])[] = [
        ['band', words.refusal],
        ['event-band', words.eventBand],
        ...words.alerts.map((row) => ['alerts', row.text] as const),
      ];
      for (const [region, text] of entries) {
        if (text === '') continue;
        const key = `${region}||${text}`;
        const existing = lifetimes.get(key);
        if (existing === undefined) lifetimes.set(key, { region, text, first: words.tick, last: words.tick, seen: 1 });
        else {
          existing.last = words.tick;
          existing.seen += 1;
        }
      }
    }
    for (const life of [...lifetimes.values()].sort((a, b) => a.first - b.first)) {
      console.log(
        `  ${life.region.padEnd(10)} ticks ${String(life.first).padStart(6)}..${String(life.last).padStart(6)}` +
          ` (${life.last - life.first} ticks over ${life.seen} samples) :: ${life.text}`,
      );
    }

    console.log('=== TRUTH AUDIT: a standing sentence against the fact at that tick ===');
    /*
     * Two families of sentence assert a *present state* and therefore have a
     * checkable truth value at every later tick. Each predicate reads the
     * worker's own published counts at the same sample, never the HUD.
     */
    let allClearSamples = 0;
    let allClearFalse = 0;
    let refusedSamples = 0;
    let refusedFalse = 0;
    let firstFalseAllClear: { tick: number; day: string; open: number; text: string } | undefined;
    let firstFalseRefused: { tick: number; day: string; conditions: readonly string[]; text: string } | undefined;
    for (const { words, facts } of samples) {
      const open = Number(facts['activeIncidents'] ?? -1);
      const conditions = (facts['conditions'] ?? []) as readonly string[];
      for (const row of words.alerts) {
        if (/no incident is still open/i.test(row.text)) {
          allClearSamples += 1;
          if (open > 0) {
            allClearFalse += 1;
            firstFalseAllClear ??= { tick: words.tick, day: words.day, open, text: row.text };
          }
        }
        if (/right now/.test(row.text)) {
          refusedSamples += 1;
          const stillRefusing =
            conditions.includes('treasury.deliveries-refused') || conditions.includes('treasury.construction-refused');
          if (!stillRefusing) {
            refusedFalse += 1;
            firstFalseRefused ??= { tick: words.tick, day: words.day, conditions, text: row.text };
          }
        }
      }
    }
    console.log(`  "no incident is still open" standing in ${allClearSamples} sample(s); FALSE in ${allClearFalse}`);
    console.log(`  first false one: ${JSON.stringify(firstFalseAllClear)}`);
    console.log(`  "... right now" standing in ${refusedSamples} sample(s); FALSE in ${refusedFalse}`);
    console.log(`  first false one: ${JSON.stringify(firstFalseRefused)}`);

    console.log('=== SILENCE GAP: worker events vs rows on screen ===');
    const byType = new Map<string, number>();
    for (const event of events) byType.set(event.type, (byType.get(event.type) ?? 0) + 1);
    console.log(`  ${events.length} event(s) published, by type:`);
    for (const [type, count] of [...byType.entries()].sort()) console.log(`     ${String(count).padStart(3)}x ${type}`);
    console.log(`  first event tick ${events[0]?.tick ?? -1}, last ${events[events.length - 1]?.tick ?? -1}`);
    console.log(`  rows standing at the end: ${last.words.alerts.length}`);
    const bandSentences = new Set(samples.map((s) => s.words.refusal).filter((text) => text !== ''));
    const eventBandSentences = new Set(samples.map((s) => s.words.eventBand).filter((text) => text !== ''));
    console.log(`  distinct sentences the refusal band showed across the whole run: ${bandSentences.size}`);
    console.log(`  distinct sentences the event band showed across the whole run: ${eventBandSentences.size}`);
    console.log(`  they were: ${JSON.stringify([...eventBandSentences])}`);

    console.log('=== THE STATE AT THE END ===');
    console.log(`  counts: ${JSON.stringify(last.facts)}`);
    console.log(`  strip: ${JSON.stringify(last.words.strip)}`);
    logSample('final', last.words);

    console.log('=== CLEARABILITY ===');
    const dismissible = last.words.alerts.filter((row) => row.dismissible);
    console.log(`  ${dismissible.length} of ${last.words.alerts.length} row(s) carry a control.`);
    console.log(
      `  no control: ${JSON.stringify(last.words.alerts.filter((row) => !row.dismissible).map((row) => `${row.id}: ${row.text}`))}`,
    );
    for (const row of dismissible) {
      const control = page.locator(`.hud-alerts__list [data-alert="${row.id}"] .ui-icon-button`);
      if ((await control.count()) === 0) {
        console.log(`  row ${row.id} claimed a control and has none`);
        continue;
      }
      await control.first().click();
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(2000);
    const afterDismiss = await wordSample(page);
    logSample('after dismissing everything a player can', afterDismiss);
    console.log(`  band after dismissing everything: ${JSON.stringify(afterDismiss.refusal)}`);
    console.log(`  worker still says activeIncidents=${String((await rawCounts(page))['activeIncidents'])}`);
  });


  /**
   * Act 3 -- what, if anything, retires a sentence.
   *
   * Three probes, each about one sentence and each cheap:
   *
   * (a) A **host** refusal, and the alerts column that denies it exists.
   * (b) The Rooms panel's Confirm control on a rectangle that is genuinely not
   *     enclosed -- the first version of this act spent ten minutes waiting for
   *     it, which is the measurement.
   * (c) The two things ADR 0091 says retire a simulation refusal: another
   *     refusal, and the session ending. Both are pressed, and the band is read
   *     after each.
   */
  test('act 3: what retires a sentence', async ({ page }) => {
    test.setTimeout(560_000);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    console.log('=== 3a: a host refusal, and what the log says about it ===');
    await tab(page, 'overview').click();
    await page.locator('.hud-intake__admit').click();
    await page.waitForTimeout(900);
    const hostSample = await wordSample(page);
    logSample('3a', hostSample);
    console.log(`  counts: ${JSON.stringify(await rawCounts(page))}`);

    console.log('=== 3b: Confirm, on a rectangle that really is not enclosed ===');
    await tab(page, 'build').click();
    const origin = await calibrate(page);
    await tab(page, 'rooms').click();
    const collapsed = await page.locator('.hud-rooms').getAttribute('data-collapsed');
    if (collapsed === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
    await page.locator('.hud-rooms__arm').click();
    await drag(page, centreOf(origin, 22, 22), centreOf(origin, 27, 27));
    await page.waitForTimeout(600);
    const confirm = page.locator('.hud-rooms__confirm');
    console.log(`  Confirm disabled attribute: ${JSON.stringify(await confirm.getAttribute('disabled'))}`);
    console.log(`  Confirm reads: ${JSON.stringify((await confirm.innerText()).trim())}`);
    console.log(`  Rooms panel note: ${JSON.stringify(await panelText(page, '.hud-rooms'))}`);
    const afterDraw = await wordSample(page);
    logSample('3b-after-drawing-an-open-rectangle', afterDraw);

    console.log('=== 3c-i: another refusal is what replaces one ===');
    await tab(page, 'build').click();
    await page.locator('.hud-build__remove').click();
    // A point the calibration itself proved is canvas, not a computed tile:
    // the first version of this act pressed a tile whose centre fell outside
    // the window and got no command at all.
    const emptyA = { x: 700 + TILE, y: 300 + TILE };
    console.log(
      `  under the press: ${await page.evaluate(
        (point) => document.elementFromPoint(point[0], point[1])?.className ?? '?',
        [emptyA.x, emptyA.y] as [number, number],
      )}`,
    );
    const removalCommands = await press(page, emptyA.x, emptyA.y);
    console.log(`  the press produced: ${JSON.stringify(removalCommands)}`);
    await page.waitForTimeout(900);
    logSample('3c-i-removal-refused', await wordSample(page));

    // A different route's refusal: buy a quantity the treasury cannot carry.
    await page.locator('.hud-build__remove').click();
    await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
    const buyRow = page.locator('.hud-build__buy');
    if (await buyRow.isHidden()) await page.locator('.hud-build__buy-toggle').click();
    await page.locator('.hud-build__buy .ui-number__input').fill('4000');
    const submit = page.locator('.hud-build__buy-submit');
    // Read *after* the panel has had time to recompute. The first version read
    // it in the same turn as the `fill` and got `null`, then waited for ever on
    // a control that had disabled itself a frame later.
    await page.waitForTimeout(1000);
    // `aria-disabled`, not `disabled`: this control stays focusable and marks
    // itself unavailable the accessible way, so the `disabled` attribute is
    // `null` on a button Playwright will never click. Reading the wrong one is
    // how the first version of this act waited ten minutes.
    const submitDisabled = (await submit.getAttribute('disabled')) ?? (await submit.getAttribute('aria-disabled'));
    console.log(
      `  Buy submit: disabled=${JSON.stringify(await submit.getAttribute('disabled'))}` +
        ` aria-disabled=${JSON.stringify(await submit.getAttribute('aria-disabled'))}`,
    );
    console.log(`  Buy row reads: ${JSON.stringify((await panelText(page, '.hud-build__buy')).replace(/\n/g, ' | '))}`);
    if (submitDisabled === null || submitDisabled === 'false') {
      await submit.click({ timeout: 10_000 });
      await page.waitForTimeout(1200);
    } else {
      console.log('  the control disabled itself, so this refusal has no sentence to give');
    }
    logSample('3c-i-after-an-unaffordable-purchase', await wordSample(page));

    console.log('=== 3c-ii: the session ending is the other thing that clears it ===');
    const beforeNewPrison = await wordSample(page);
    console.log(`  band before New prison: ${JSON.stringify(beforeNewPrison.refusal)}`);
    console.log(`  alerts before New prison: ${JSON.stringify(beforeNewPrison.alerts.map((row) => row.text))}`);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await page.waitForTimeout(1500);
    const afterNewPrison = await wordSample(page);
    logSample('3c-ii-after-New-prison', afterNewPrison);
    console.log(`  events across the whole act: ${JSON.stringify(await eventStream(page))}`);
  });
});
