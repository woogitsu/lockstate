import { type Page, test } from '@playwright/test';
import { installBandRecorder, readBandRecording } from './alert-dwell';
import {
  TILE,
  armBuildable,
  buy,
  calibrate,
  centreOf,
  currentTick,
  installTee,
  latestCounts,
  openApp,
  press,
  tab,
} from './playtest-harness';

/**
 * **Does the game actually say so when a control works? (#749)**
 *
 * An *instrument*, not a gate -- `*.playtest.ts`, collected only by
 * `tests/browser/playwright.playtest.config.ts`, which nothing in CI runs.
 * The gates for these five sentences are
 * `tests/integration/command-success-notices.test.ts` and the `#749` block in
 * `tests/unit/ui-simulation-events.test.ts`; what neither of those can do is
 * establish that the sentence reaches a *pixel*, at the moment of the press,
 * on the assembled page. That is what this is for, and it is the thing
 * `docs/research/2026-09-01-what-act-six-never-reached.md` D2 measured the
 * absence of by playing.
 *
 * Every act arms `alert-dwell`'s frame recorder on `.hud__event` **before**
 * the press, because a poll after the fact cannot recover a frame that has
 * already gone by -- the exact blindness that made #700 invisible to three
 * earlier playtests.
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5316 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-749-say-it-when-it-works.playtest.ts -g "act a" --reporter=line
 * ```
 */

const log = (act: string, line: string): void => {
  console.log(`[${act}] ${line}`);
};

const play = async (page: Page): Promise<void> => {
  await page.locator('.hud-strip__transport button').nth(1).click();
  await page.waitForTimeout(200);
};
const pause = async (page: Page): Promise<void> => {
  await page.locator('.hud-strip__transport button').nth(0).click();
  await page.waitForTimeout(200);
};

/**
 * What the events band is showing right now, exactly as a player reads it.
 *
 * `hidden` is `HTMLElement.hidden` verbatim -- `boolean | 'until-found'`,
 * because the DOM's own type is, per the convention
 * `build-deliveries-outside-the-fold.spec.ts` documents -- reported as found
 * rather than coerced to `true`/`false`.
 */
async function band(page: Page): Promise<{ text: string; severity: string | null; hidden: boolean | 'until-found' }> {
  return page.evaluate(() => {
    const element = document.querySelector<HTMLElement>('.hud__event');
    if (element === null) return { text: 'NO SUCH ELEMENT', severity: null, hidden: true };
    return {
      text: (element.textContent ?? '').trim(),
      severity: element.dataset['severity'] ?? null,
      hidden: element.hidden,
    };
  });
}

/** Every sentence in the alerts log, newest first, as a player reads them. */
async function alertLines(page: Page): Promise<readonly string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hud-alerts__list .ui-row')].map((row) =>
      (row.textContent ?? '').trim(),
    ),
  );
}

async function workerEvents(page: Page): Promise<readonly { tick: number; type: string }[]> {
  return page.evaluate(() =>
    ((window as unknown as { lockstateFromWorker?: unknown[] }).lockstateFromWorker ?? [])
      .filter((message) => (message as { kind?: string }).kind === 'simulation/event')
      .map((message) => {
        const payload = (message as { payload: { tick: number; event: { type: string } } }).payload;
        return { tick: payload.tick, type: payload.event.type };
      }),
  );
}

async function queueRows(page: Page): Promise<readonly { label: string; state: string; order: string }[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hud-build__queue-row')]
      .filter((row) => !row.hidden && row.getClientRects().length > 0)
      .map((row) => ({
        label: (row.querySelector<HTMLElement>('.hud-build__queue-label')?.textContent ?? '').trim(),
        state: row.dataset['state'] ?? '',
        order: row.dataset['order'] ?? '',
      })),
  );
}

async function deliveryRows(page: Page): Promise<readonly { label: string; delivery: string }[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hud-build__delivery-row')]
      .filter((row) => !row.hidden && row.getClientRects().length > 0)
      .map((row) => ({
        label: (row.querySelector<HTMLElement>('.hud-build__delivery-label')?.textContent ?? '').trim(),
        delivery: row.dataset['delivery'] ?? '',
      })),
  );
}

async function openQueueFold(page: Page): Promise<void> {
  await tab(page, 'build').click();
  if ((await page.locator('.hud-build__queue').getAttribute('data-collapsed')) === 'true') {
    await page.locator('.hud-build__queue > .ui-section__header').click();
    await page.waitForTimeout(300);
  }
}

async function treasury(page: Page): Promise<number | undefined> {
  return (await latestCounts(page))?.treasuryMinorUnits;
}

/** The four single-segment walls act a, b and c all press against. */
async function fourQueuedWalls(page: Page, act: string): Promise<void> {
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.locator('.hud-clock__day').waitFor();
  await tab(page, 'build').click();
  const origin = await calibrate(page);

  // Stock in the yard first, so a cancellation's refund is unambiguously about
  // the order's own allocation and not about a just-in-time purchase.
  await buy(page, 'wall-brick', 40);
  await play(page);
  await page.waitForTimeout(6000);
  await pause(page);
  log(act, `after 40 bricks landed: treasury=${await treasury(page)}`);

  await armBuildable(page, 'wall-brick');
  for (const t of [
    { x: 12, y: 12 },
    { x: 13, y: 12 },
    { x: 14, y: 12 },
    { x: 15, y: 12 },
  ]) {
    const at = centreOf(origin, t.x, t.y);
    await press(page, at.x, at.y - TILE / 2 + 1);
  }
  await openQueueFold(page);
}

/* ==================================================================== */
/* Act A -- Cancel on a queued build order                              */
/* ==================================================================== */

test('act a: Cancel on a queued order puts a sentence on the band at the moment of the press', async ({ page }) => {
  const act = 'act-a';
  test.setTimeout(600_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await installTee(page);
  await openApp(page);
  await fourQueuedWalls(page, act);

  const before = await queueRows(page);
  const treasuryBefore = await treasury(page);
  log(act, `queue before: ${JSON.stringify(before)}`);
  log(act, `band before the press: ${JSON.stringify(await band(page))}`);

  await installBandRecorder(page, '.hud__event');
  const target = before[1]!;
  log(act, `pressing Cancel on row 1: ${JSON.stringify(target)}`);
  await page.locator(`.hud-build__queue-row[data-order="${target.order}"] button`).click();

  // Read the band as fast as the harness can, then again after a beat, so a
  // sentence that arrives and is displaced within one frame is still visible
  // in the recording below even if both polls miss it.
  log(act, `band immediately after the press: ${JSON.stringify(await band(page))}`);
  await page.waitForTimeout(1000);
  log(act, `band 1s after the press: ${JSON.stringify(await band(page))}`);
  await page.waitForTimeout(2000);
  log(act, `band 3s after the press: ${JSON.stringify(await band(page))}`);

  const recording = await readBandRecording(page);
  log(act, `every span the band held, in order: ${JSON.stringify(recording.spans.map((s) => `${s.frames}f [${s.severity}] "${s.text}"`))}`);
  log(act, `worker events: ${JSON.stringify(await workerEvents(page))}`);
  log(act, `alerts log: ${JSON.stringify(await alertLines(page))}`);
  log(act, `queue after: ${JSON.stringify(await queueRows(page))}`);
  log(act, `treasury ${treasuryBefore} -> ${await treasury(page)}`);
});

/* ==================================================================== */
/* Act B -- Undo, then Redo                                             */
/* ==================================================================== */

test('act b: Undo and Redo each say so, and say nothing when there is nothing to move', async ({ page }) => {
  const act = 'act-b';
  test.setTimeout(600_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await installTee(page);
  await openApp(page);
  await fourQueuedWalls(page, act);

  await installBandRecorder(page, '.hud__event');

  await page.keyboard.press('z');
  await page.waitForTimeout(600);
  log(act, `band after Undo: ${JSON.stringify(await band(page))}`);
  log(act, `queue after Undo: ${JSON.stringify(await queueRows(page))}`);

  await page.keyboard.press('y');
  await page.waitForTimeout(600);
  log(act, `band after Redo: ${JSON.stringify(await band(page))}`);
  log(act, `queue after Redo: ${JSON.stringify(await queueRows(page))}`);

  // Nothing left to redo -- the band must NOT confirm a reversal that did not
  // happen. The sentence already on the line is the previous one; what this
  // measures is whether a *new* write lands.
  const spansBefore = (await readBandRecording(page)).spans.length;
  await installBandRecorder(page, '.hud__event');
  await page.keyboard.press('y');
  await page.waitForTimeout(800);
  const emptyRedo = await readBandRecording(page);
  log(act, `a second Redo with nothing to redo wrote ${emptyRedo.writes.length} time(s) to the band`);
  log(act, `spans in that window: ${JSON.stringify(emptyRedo.spans.map((s) => `${s.frames}f "${s.text}"`))}`);
  log(act, `(the first window held ${spansBefore} spans)`);

  log(act, `worker events: ${JSON.stringify(await workerEvents(page))}`);
  log(act, `alerts log: ${JSON.stringify(await alertLines(page))}`);
});

/* ==================================================================== */
/* Act C -- cancelling a delivery mid-flight                            */
/* ==================================================================== */

test('act c: cancelling a delivery says so, and names what came back', async ({ page }) => {
  const act = 'act-c';
  test.setTimeout(600_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await installTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.locator('.hud-clock__day').waitFor();
  await tab(page, 'build').click();

  const before = await treasury(page);
  await buy(page, 'wall-brick', 30);
  const afterBuy = await treasury(page);
  log(act, `bought 30 bricks: treasury ${before} -> ${afterBuy} (spent ${(before ?? 0) - (afterBuy ?? 0)})`);

  const rows = await deliveryRows(page);
  log(act, `pending deliveries on the panel: ${JSON.stringify(rows)}`);

  await installBandRecorder(page, '.hud__event');
  const row = rows[0]!;
  await page.locator(`.hud-build__delivery-row[data-delivery="${row.delivery}"] button`).click();
  log(act, `band immediately after cancelling: ${JSON.stringify(await band(page))}`);
  await page.waitForTimeout(1200);
  log(act, `band 1.2s after cancelling: ${JSON.stringify(await band(page))}`);

  const recording = await readBandRecording(page);
  log(act, `every span: ${JSON.stringify(recording.spans.map((s) => `${s.frames}f [${s.severity}] "${s.text}"`))}`);
  log(act, `treasury after cancelling: ${await treasury(page)} (should be back to ${before})`);
  log(act, `worker events: ${JSON.stringify(await workerEvents(page))}`);
  log(act, `alerts log: ${JSON.stringify(await alertLines(page))}`);
});

/* ==================================================================== */
/* Act D -- cancelling an order the crew has already started            */
/* ==================================================================== */

test('act d: cancelling an in-progress order says the spend is gone, not that it came back', async ({ page }) => {
  const act = 'act-d';
  test.setTimeout(900_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await installTee(page);
  await openApp(page);
  await fourQueuedWalls(page, act);

  // Run the clock until the crew has actually started one of the four, then
  // cancel *that* row. The state is on the row itself, so this is what a
  // player sees rather than an inference.
  await play(page);
  let started: { label: string; state: string; order: string } | undefined;
  const deadline = Date.now() + 240_000;
  for (;;) {
    const rows = await queueRows(page);
    started = rows.find((r) => r.state === 'in-progress');
    if (started !== undefined) break;
    if (Date.now() > deadline) {
      log(act, `no order reached 'in-progress' in 240s -- last seen: ${JSON.stringify(rows)} at tick ${await currentTick(page)}`);
      return;
    }
    await page.waitForTimeout(250);
  }
  await pause(page);
  log(act, `an order is under way: ${JSON.stringify(started)} at tick ${await currentTick(page)}`);

  await installBandRecorder(page, '.hud__event');
  await page.locator(`.hud-build__queue-row[data-order="${started.order}"] button`).click();
  log(act, `band immediately after cancelling it: ${JSON.stringify(await band(page))}`);
  await page.waitForTimeout(1200);
  log(act, `band 1.2s later: ${JSON.stringify(await band(page))}`);

  const recording = await readBandRecording(page);
  log(act, `every span: ${JSON.stringify(recording.spans.map((s) => `${s.frames}f [${s.severity}] "${s.text}"`))}`);
  log(act, `worker events: ${JSON.stringify(await workerEvents(page))}`);
  log(act, `alerts log: ${JSON.stringify(await alertLines(page))}`);
});
