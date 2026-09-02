import { type Page, test } from '@playwright/test';
import { installBandRecorder, readBandRecording } from './alert-dwell';
import {
  buildResilientCell,
} from './playtest-2026-09-01-the-people.playtest';
import {
  currentClock,
  currentTick,
  installTee,
  latestCounts,
  openApp,
  panelText,
  press,
  reportBoundary,
  runUntilTick,
  tab,
  countsSeries,
} from './playtest-harness';

/**
 * **Playing the clock: pause, play, the speed controls, day boundaries, and
 * what the game does when the player changes the passage of time.**
 *
 * Read on `2025f7d7` (v0.0.349). Every selector and every claim about what
 * `src/` does today was opened at that commit before this file was written;
 * a later commit may move a line number quoted in a log line without moving
 * the behaviour.
 *
 * `tests/browser/playwright.config.ts` collects `*.spec.ts` only, so nothing
 * in CI runs this file. It is driven by hand through
 * `tests/browser/playwright.playtest.config.ts`, one act at a time:
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5327 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-2026-09-02-the-clock.playtest.ts -g "act 1" --reporter=line
 * ```
 *
 * Findings live in `docs/research/2026-09-02-playing-the-clock.md`.
 *
 * **On the one hard constraint this surface carries.** This box runs several
 * agents' suites at once, and every act below reads the worker's own tick
 * (`currentTick`, off `simulation/clock-state`) rather than a wall-clock
 * reading wherever a claim can be phrased that way — a stutter under load
 * moves how *long* a press takes to answer, never which tick it lands on.
 * The one act that cannot avoid a wall-clock reading (act 5, the alerts
 * band's dwell floor) says so explicitly and records `uptime`/`ps` beside the
 * numbers it took, rather than presenting a busy box's timing as a product
 * finding.
 *
 * Acts log rather than hard-assert, on the `playtest-2026-09-01-rooms` file's
 * own reasoning: a playtest that fails on its first finding stops before the
 * act that would have found the next one.
 */

const log = (act: string, line: string): void => {
  console.log(`[${act}] ${line}`);
};

/** The three transport buttons, in the DOM order `status-strip.ts` builds them. */
const pauseButton = (page: Page) => page.locator('.hud-strip__transport button').nth(0);
const playButton = (page: Page) => page.locator('.hud-strip__transport button').nth(1);
const fastForwardButton = (page: Page) => page.locator('.hud-strip__transport button').nth(2);

async function press0(page: Page): Promise<void> {
  await pauseButton(page).click();
  await page.waitForTimeout(200);
}
async function play0(page: Page): Promise<void> {
  await playButton(page).click();
  await page.waitForTimeout(200);
}
async function ff0(page: Page): Promise<void> {
  await fastForwardButton(page).click();
  await page.waitForTimeout(200);
}

/** What a player actually sees on the clock readout, read off the DOM rather than the store. */
async function clockReading(page: Page): Promise<{
  clockMode: string | null;
  speedText: string;
  speedSrText: string;
  dayText: string;
  dayProgressText: string;
  speedColor: string;
  dayColor: string;
  pausePressed: string | null;
  playPressed: string | null;
  fastForwardPressed: string | null;
}> {
  return page.evaluate(() => {
    const strip = document.querySelector('.hud-strip');
    const speed = document.querySelector('.hud-clock__speed');
    const day = document.querySelector('.hud-clock__day');
    const dayProgress = document.querySelector('.hud-clock__day-progress');
    const speedSr = document.querySelector('.hud-clock__speed-group .ui-sr-only');
    const buttons = document.querySelectorAll('.hud-strip__transport button');
    return {
      clockMode: strip?.getAttribute('data-clock-mode') ?? null,
      speedText: (speed?.textContent ?? '').trim(),
      speedSrText: (speedSr?.textContent ?? '').trim(),
      dayText: (day?.textContent ?? '').trim(),
      dayProgressText: (dayProgress?.textContent ?? '').trim(),
      speedColor: speed === null ? '' : getComputedStyle(speed).color,
      dayColor: day === null ? '' : getComputedStyle(day).color,
      pausePressed: buttons[0]?.getAttribute('aria-pressed') ?? null,
      playPressed: buttons[1]?.getAttribute('aria-pressed') ?? null,
      fastForwardPressed: buttons[2]?.getAttribute('aria-pressed') ?? null,
    };
  });
}

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

async function alertLines(page: Page): Promise<readonly string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hud-alerts__list .ui-row')].map((row) => (row.textContent ?? '').trim()),
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

/* ==================================================================== */
/* Act 1 -- the speed ladder, the pause word, and the dimming (#639)     */
/* ==================================================================== */

test('act 1: the speed readout tells the truth through pause, fast-forward and the cycle back down', async ({ page }) => {
  const act = 'act-1';
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await installTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.locator('.hud-clock__day').waitFor();

  log(act, `a fresh session, before any transport press: ${JSON.stringify(await clockReading(page))}`);

  await play0(page);
  const running1x = await clockReading(page);
  log(act, `after Play: ${JSON.stringify(running1x)}`);

  await ff0(page);
  const at2x = await clockReading(page);
  log(act, `after one Fast-forward press: ${JSON.stringify(at2x)}`);

  await ff0(page);
  const at4x = await clockReading(page);
  log(act, `after a second Fast-forward press: ${JSON.stringify(at4x)}`);

  await ff0(page);
  const backTo2x = await clockReading(page);
  log(act, `after a THIRD Fast-forward press (should cycle 4 -> 2, per projection.ts's nextFastForwardSpeed): ${JSON.stringify(backTo2x)}`);

  await press0(page);
  const paused = await clockReading(page);
  log(act, `after Pause, while the clock was at ×2: ${JSON.stringify(paused)}`);
  log(
    act,
    `dimming check: day colour ${running1x.dayColor === paused.dayColor ? 'DID NOT CHANGE' : `changed (${running1x.dayColor} -> ${paused.dayColor})`}, ` +
      `speed colour ${running1x.speedColor === paused.speedColor ? 'DID NOT CHANGE' : `changed (${running1x.speedColor} -> ${paused.speedColor})`}`,
  );

  await play0(page);
  const resumed = await clockReading(page);
  log(act, `after Play from a pause that started at ×2 -- does it resume at ×2 or reset to ×1?: ${JSON.stringify(resumed)}`);

  log(act, `raw simulation/clock-state readings across the sequence: ${JSON.stringify(await currentClock(page))} at tick ${await currentTick(page)}`);

  /*
   * A second, independent probe of the same claim, from `hud.ts:2149-2166`'s
   * own `transportIntent` docblock: *"Pause never changes the speed, so
   * unpausing resumes at the speed the player chose rather than silently
   * resetting to ×1."* The sequence above showed Play does not do that. This
   * asks whether *Fast-forward*, pressed directly from a pause with no Play
   * in between, is the path the comment actually describes -- `simulation-
   * clock.ts`'s own docblock says the retained speed exists "so the fast-
   * forward control knows where a further tap goes", which is a narrower and
   * different claim than "unpausing resumes at the chosen speed".
   */
  await ff0(page);
  await ff0(page);
  const backAt4x = await clockReading(page);
  log(act, `two more Fast-forward presses from ×1: ${JSON.stringify(backAt4x)}`);

  await press0(page);
  const pausedAt4x = await clockReading(page);
  log(act, `Pause while at ×4: ${JSON.stringify(pausedAt4x)}`);

  await ff0(page);
  const ffFromPause = await clockReading(page);
  log(
    act,
    `Fast-forward pressed DIRECTLY from a pause that started at ×4 (no Play in between): ` +
      `${JSON.stringify(ffFromPause)} -- expected ×2 (nextFastForwardSpeed(4)) if the retained speed feeds the ladder as the docblock claims`,
  );
});

/* ==================================================================== */
/* Act 2 -- does the clock survive a real reload?                       */
/* ==================================================================== */

test('act 2: a real navigation, then Load -- what speed and what mode does the player come back to?', async ({ page }) => {
  const act = 'act-2';
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await installTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.locator('.hud-clock__day').waitFor();

  await play0(page);
  await ff0(page);
  await ff0(page); // now at x4
  await page.waitForTimeout(2_000);
  const beforeSave = await clockReading(page);
  const tickBeforeSave = await currentTick(page);
  log(act, `running at ×4 for a couple of seconds before saving: ${JSON.stringify(beforeSave)} at tick ${tickBeforeSave}`);

  await page.getByRole('button', { name: 'Save now' }).click();
  await page.locator('.save-panel__status').filter({ hasText: 'Saved (generation' }).first().waitFor({ timeout: 60_000 });
  log(act, `saved: ${await panelText(page, '.save-panel__status')}`);

  // A real navigation -- not a second session inside the same page.
  await installTee(page);
  await openApp(page);
  const onArrival = await clockReading(page);
  log(act, `RELOADED. On arrival, before loading anything: ${JSON.stringify(onArrival)}`);
  log(act, `save panel on arrival: ${await panelText(page, '.save-panel')}`);

  await page.locator('.save-panel__item').first().click();
  let loaded = await latestCounts(page);
  for (let i = 0; i < 30 && loaded === undefined; i += 1) {
    await page.waitForTimeout(1_000);
    loaded = await latestCounts(page);
  }
  await page.waitForTimeout(2_000);
  const afterLoad = await clockReading(page);
  log(act, `after Load: ${JSON.stringify(afterLoad)} at tick ${await currentTick(page)} (tick before save was ${tickBeforeSave})`);
  log(act, `raw clock from the worker right after load: ${JSON.stringify(await currentClock(page))}`);

  // Does the restored, paused session remember ×4 for the next Play, or does
  // a reload silently reset a player's chosen speed to ×1?
  await play0(page);
  const resumedAfterLoad = await clockReading(page);
  log(act, `pressing Play on the just-loaded session: ${JSON.stringify(resumedAfterLoad)}`);
});

/* ==================================================================== */
/* Act 3 -- day boundaries: is a wage payment or state income legible?  */
/* ==================================================================== */

test('act 3: at the moment a day turns, does the player see anything besides the number changing?', async ({ page }) => {
  const act = 'act-3';
  test.setTimeout(400_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await installTee(page);
  await openApp(page);

  const cell = await buildResilientCell(page, 2, act);
  log(act, `cell built: ${JSON.stringify(cell)}`);

  await tab(page, 'overview').click();
  await page.locator('.hud-intake__admit').click();
  await page.waitForTimeout(1_500);
  log(act, `after one admission: ${await panelText(page, '.hud-intake')}`);

  await tab(page, 'security').click();
  const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
  if ((await guardRow.count()) > 0) await guardRow.first().click();
  await page.locator('.hud-staff__hire').click();
  await page.waitForTimeout(1_500);
  const hired = await latestCounts(page);
  log(act, `after hiring one guard: staff=${hired?.staff} dailyWageBill=${hired?.dailyWageBillMinorUnits} treasury=${hired?.treasuryMinorUnits}`);

  // Fast forward to x4 and watch for two day boundaries (DAY_LENGTH_TICKS = 2,400).
  //
  // **Targeted relative to the tick setup actually left us at, not to a fixed
  // absolute tick.** The first run of this act targeted 2,400 and 4,800
  // directly and found both checks vacuous: buildResilientCell's own zoning
  // retries (up to twelve, each waiting up to 5s, all run at x4) had already
  // carried the session past both fixed targets before either runUntilTick
  // call was even reached, so both returned immediately against stale
  // history and reported the same two samples for "day 1-2" and "day 2-3"
  // alike. Computing the targets from the tick we are actually at now is the
  // fix; the real finding that first run's vacuous checkpoints could not
  // produce was recovered from the unfiltered series instead and is recorded
  // in docs/research/2026-09-02-playing-the-clock.md Finding 5, which also
  // reports this as the instrument bug it is.
  await ff0(page);
  await ff0(page);
  log(act, `running at ${JSON.stringify(await currentClock(page))}`);

  const DAY_TICKS = 2_400;
  const setupTick = await currentTick(page);
  const firstBoundary = (Math.floor(setupTick / DAY_TICKS) + 1) * DAY_TICKS;
  const secondBoundary = firstBoundary + DAY_TICKS;
  log(act, `setup finished at tick ${setupTick}; targeting the next two day boundaries at ${firstBoundary} and ${secondBoundary}`);

  await runUntilTick(page, firstBoundary + 100, 240_000);
  await page.waitForTimeout(300);
  log(act, `--- around the day boundary at tick ${firstBoundary} ---`);
  reportBoundary(act, await countsSeries(page), firstBoundary);
  log(act, `band at this point: ${JSON.stringify(await band(page))}`);
  log(act, `alerts list: ${JSON.stringify(await alertLines(page))}`);
  log(act, `worker events so far: ${JSON.stringify(await workerEvents(page))}`);
  log(act, `status strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);

  await runUntilTick(page, secondBoundary + 100, 240_000);
  await page.waitForTimeout(300);
  log(act, `--- around the day boundary at tick ${secondBoundary} ---`);
  reportBoundary(act, await countsSeries(page), secondBoundary);
  log(act, `band at this point: ${JSON.stringify(await band(page))}`);
  log(act, `alerts list: ${JSON.stringify(await alertLines(page))}`);
  log(act, `worker events so far: ${JSON.stringify(await workerEvents(page))}`);
  log(act, `status strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);

  log(act, `full counts series (${(await countsSeries(page)).length} samples): ${JSON.stringify(await countsSeries(page))}`);
});

/* ==================================================================== */
/* Act 4 -- siblings of #774: does every gesture given while paused say  */
/* so at once, with the tick provably unmoved?                          */
/* ==================================================================== */

test('act 4: every remaining paused gesture, checked for the #774 shape', async ({ page }) => {
  const act = 'act-4';
  test.setTimeout(500_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await installTee(page);
  await openApp(page);

  const cell = await buildResilientCell(page, 4, act);
  log(act, `cell built and zoned: ${JSON.stringify(cell)}`);

  await press0(page);
  const pausedAt = await currentTick(page);
  log(act, `paused at tick ${pausedAt}; clock reads ${JSON.stringify(await currentClock(page))}`);

  // ---- PurchaseMaterials while paused: does the treasury move and the
  // delivery row appear before Play is ever pressed again? -----------------
  await tab(page, 'build').click();
  const treasuryBeforeBuy = (await latestCounts(page))?.treasuryMinorUnits;
  await installBandRecorder(page, '.hud__event');
  await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
  const buyRow = page.locator('.hud-build__buy');
  if (await buyRow.isHidden()) await page.locator('.hud-build__buy-toggle').click();
  await page.locator('.hud-build__buy .ui-number__input').fill('10');
  await page.locator('.hud-build__buy-submit').click();
  await page.waitForTimeout(400);
  const treasuryAfterBuy = (await latestCounts(page))?.treasuryMinorUnits;
  log(
    act,
    `PurchaseMaterials while paused: tick ${await currentTick(page)} (still ${pausedAt}? ${(await currentTick(page)) === pausedAt}), ` +
      `treasury ${treasuryBeforeBuy} -> ${treasuryAfterBuy}, deliveries panel: ${await panelText(page, '.hud-build__deliveries')}, ` +
      `band: ${JSON.stringify(await band(page))}`,
  );
  const buyRecording = await readBandRecording(page);
  log(act, `band spans across the purchase: ${JSON.stringify(buyRecording.spans.map((s) => `${s.frames}f "${s.text}"`))}`);

  // ---- RemoveObject while paused: does a bed's removal show up before Play?
  await installBandRecorder(page, '.hud__event');
  const before = await panelText(page, '.hud-build__queue');
  await page.locator('.hud-build__remove').click();
  const bedPoint = { x: cell.origin.originX + 12 * 64 + 32, y: cell.origin.originY + 12 * 64 + 32 };
  const removeCommands = await press(page, bedPoint.x, bedPoint.y);
  await page.waitForTimeout(400);
  log(
    act,
    `RemoveObject at ${JSON.stringify(bedPoint)} while paused: produced ${JSON.stringify(removeCommands)}, tick still ${await currentTick(page)}, ` +
      `queue before: ${JSON.stringify(before)}, queue after: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}, ` +
      `band: ${JSON.stringify(await band(page))}`,
  );
  await page.locator('.hud-build__remove').click();

  // ---- UnzoneRoom then ZoneRoom while paused ------------------------------
  await tab(page, 'rooms').click();
  if ((await page.locator('.hud-rooms').getAttribute('data-collapsed')) === 'true') {
    await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
  }
  const roomsBeforeUnzone = (await latestCounts(page))?.rooms;
  await page.locator('.hud-rooms__remove').click();
  const a = { x: cell.origin.originX + 13 * 64 + 32, y: cell.origin.originY + 13 * 64 + 32 };
  const b = { x: cell.origin.originX + 15 * 64 + 32, y: cell.origin.originY + 15 * 64 + 32 };
  await page.mouse.move(a.x, a.y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up({ button: 'left' });
  await page.waitForTimeout(200);
  await page.locator('.hud-rooms__confirm').click();
  await page.waitForTimeout(400);
  const roomsAfterUnzone = (await latestCounts(page))?.rooms;
  log(
    act,
    `UnzoneRoom while paused: rooms ${roomsBeforeUnzone} -> ${roomsAfterUnzone}, tick still ${await currentTick(page)}, ` +
      `rooms panel: ${await panelText(page, '.hud-rooms')}, band: ${JSON.stringify(await band(page))}`,
  );

  // ---- AdmitPrisoner while paused ------------------------------------------
  await tab(page, 'overview').click();
  const rosterBefore = (await latestCounts(page))?.prisoners;
  await page.locator('.hud-intake__admit').click();
  await page.waitForTimeout(400);
  const rosterAfter = (await latestCounts(page))?.prisoners;
  log(
    act,
    `AdmitPrisoner while paused: prisoners ${rosterBefore} -> ${rosterAfter}, tick still ${await currentTick(page)}, ` +
      `intake panel: ${await panelText(page, '.hud-intake')}, band: ${JSON.stringify(await band(page))}`,
  );

  // ---- HireStaff while paused ------------------------------------------
  await tab(page, 'security').click();
  const staffBefore = (await latestCounts(page))?.staff;
  const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
  if ((await guardRow.count()) > 0) await guardRow.first().click();
  await page.locator('.hud-staff__hire').click();
  await page.waitForTimeout(400);
  const staffAfter = (await latestCounts(page))?.staff;
  log(
    act,
    `HireStaff while paused: staff ${staffBefore} -> ${staffAfter}, tick still ${await currentTick(page)}, ` +
      `staff panel: ${await panelText(page, '.hud-staff')}, band: ${JSON.stringify(await band(page))}`,
  );

  log(act, `final tick check -- did ANY of the above ever move the clock off ${pausedAt}? now at ${await currentTick(page)}`);
  log(act, `worker events across the whole act: ${JSON.stringify(await workerEvents(page))}`);
  log(act, `alerts list at the end: ${JSON.stringify(await alertLines(page))}`);
});

/* ==================================================================== */
/* Act 5 -- the dwell floor at x4: what this instrument can and cannot   */
/* say without resting a finding on wall-clock timing under load        */
/* ==================================================================== */

test('act 5: an organic run at x4, watched for close event pairs by tick, not by wall clock', async ({ page }) => {
  const act = 'act-5';
  test.setTimeout(400_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await installTee(page);
  await openApp(page);

  const cell = await buildResilientCell(page, 2, act);
  log(act, `cell built: ${JSON.stringify(cell)}`);
  await tab(page, 'overview').click();
  for (let i = 0; i < 2; i += 1) {
    await page.locator('.hud-intake__admit').click();
    await page.waitForTimeout(200);
  }

  await installBandRecorder(page, '.hud__event');
  await ff0(page);
  await ff0(page);
  log(act, `running at ${JSON.stringify(await currentClock(page))}`);

  // A bounded window, not a wait for a specific incident: report what ticks
  // actually produced events, in tick units, and leave "no collision in this
  // window" as a legitimate, honestly-reported empty result if that is what
  // happens -- per docs/AGENT_WORKFLOW.md's "an empty category backed by the
  // numbers that establish it is a real result."
  await runUntilTick(page, 30_000, 240_000);

  const events = await workerEvents(page);
  log(act, `${events.length} worker event(s) observed by tick ${await currentTick(page)}: ${JSON.stringify(events)}`);
  const gaps = events.slice(1).map((e, i) => e.tick - events[i]!.tick);
  log(act, `gaps between consecutive events, in ticks: ${JSON.stringify(gaps)}`);
  const closest = gaps.length === 0 ? undefined : Math.min(...gaps);
  log(
    act,
    closest === undefined
      ? 'fewer than two events in this window -- no collision to evaluate'
      : `closest gap: ${closest} ticks = ${closest * 50}ms of sim time = ${(closest * 50) / 4}ms of wall time at x4 (EVENT_BAND_DWELL_FLOOR_MS is 600)`,
  );

  const recording = await readBandRecording(page);
  log(act, `band spans across the run: ${JSON.stringify(recording.spans.map((s) => `${s.frames}f [${s.severity}] "${s.text}"`))}`);
  log(act, `alerts list at the end: ${JSON.stringify(await alertLines(page))}`);
});
