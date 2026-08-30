import { test, type Page } from '@playwright/test';
import {
  TILE,
  armBuildable,
  buildAndPopulate,
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
  tab,
  waitForQueueEmpty,
} from './playtest-harness';

/**
 * **Playing `main` after the fifteen changes of 2026-08-30**, none of which
 * anybody had played the result of.
 *
 * Three of those changes are what this file is aimed at, and the third is the
 * reason the other two matter:
 *
 * 1. **#659** widened a sentence from 2-16 to **14-90 in-game days**. A day is
 *    `DAY_LENGTH_TICKS` = 2,400 ticks and a tick is 50 ms
 *    (`src/simulation/worker/state-machine.ts:216`), so at x1 a sentence went
 *    from *4-32 real minutes* to **28 real minutes to 3 real hours**, and
 *    `docs/adr/0079-a-sentence-long-enough-to-be-a-history.md` predicts
 *    steady-state occupancy rising *"by roughly the ratio of the means --
 *    124,800 against 21,600, a factor of **5.8**"*, immediately conceding that
 *    the figure *"is arithmetic on the mean, not a measurement"*.
 * 2. **#660** gave a relocated resident a sentence:
 *    *"{name} had nowhere to sleep and moved to {room}."*
 *    (`src/content/default-locale-en.ts:461`). It has a browser spec against
 *    the UI harness; it has never been seen in a game.
 * 3. **#635** put *"N with no bed"* on the PRISONERS chip.
 *
 * ## What this file can measure and what it cannot, stated before the numbers
 *
 * The clock's fastest speed is **x4** (`SIMULATION_SPEEDS` is `{1, 2, 4}`,
 * `src/simulation/clock/fixed-step-clock.ts:17`), which is 80 ticks per wall
 * second. So:
 *
 * | | ticks | wall seconds at x4 |
 * | --- | --- | --- |
 * | shortest sentence, 14 days | 33,600 | 420 |
 * | mean sentence, 52 days | 124,800 | 1,560 |
 * | longest sentence, 90 days | 216,000 | 2,700 |
 *
 * A steady state is several mean service times deep. Four mean sentences is
 * **104 wall minutes at x4 before the build even starts**, so the ADR's
 * factor of 5.8 is *not reachable inside a browser test at all*, and this file
 * does not pretend to reach it. What it does instead is measure the two
 * quantities the factor is made of, because both are reachable:
 *
 * - **The time a prisoner spends before their sentence starts.**
 *   `sentenceEndTick` is written at the `'classification'` stage
 *   (`src/simulation/prisoners/intake-system.ts:493`), which is stage 3 of 6
 *   and reached at one stage per 5 ticks
 *   (`intake-system.ts:211`), so time-in-system is *sentence + a small
 *   constant*. Measuring that constant is what turns the ADR's ratio of means
 *   into a ratio of times-in-system.
 * - **Departures, observed.** Admit a batch, run at x4, and record the tick of
 *   every fall in the population. Each fall is one prisoner's whole sentence,
 *   read off the game rather than off the draw.
 *
 * And the thing that neither of those needs a long run to settle, which is
 * the finding this file was written to produce: **there is no arrival process
 * in this game.** `AdmitPrisoner` has exactly one producer in `src/`
 * (`src/main.ts:2522`, from the Intake panel's one button), and
 * `PrisonerOperationsRuntime.requestAdmission` refuses only for
 * `no-accommodation` and `population-full` -- never for "the beds are full".
 * So the lambda in `L = lambda * W` is *a player's finger*, and what the ADR's
 * 5.8 actually describes is how much longer a prison stays full between
 * presses, not how big it gets.
 *
 * ## Not a gate
 *
 * Nothing in CI collects `.playtest.ts`;
 * `tests/browser/playwright.playtest.config.ts` says so at length. The console
 * output is the deliverable and the findings live in
 * `docs/research/2026-08-30-playing-main-after-fifteen-changes.md`.
 */

/** Ticks in one in-game day (`src/simulation/prisoners/regime.ts`). Restated, not imported: this file may not reach into `src/simulation/**`. */
const DAY_LENGTH_TICKS = 2_400;

interface Sample {
  readonly wallMs: number;
  readonly tick: number;
  readonly day: number;
  readonly prisoners: number;
  readonly roomOccupants: number;
  readonly occupiedPlaces: number;
  readonly accommodationCapacity: number;
  readonly treasuryMinorUnits: number;
}

/**
 * One reading of the counts publication, including `occupiedPlaces`.
 *
 * `CountsSample` in `playtest-harness.ts` does not carry `occupiedPlaces`, and
 * this file needs it because #635's badge is `prisoners - occupiedPlaces` --
 * so a badge readout and the number behind it can be compared rather than
 * assumed equal. Read here rather than added to the shared harness, because
 * three other agents are editing this directory today.
 */
async function sample(page: Page, startedAt: number): Promise<Sample> {
  const raw = await page.evaluate(() => {
    const messages = (window as unknown as { lockstateFromWorker?: unknown[] }).lockstateFromWorker ?? [];
    let counts: Record<string, number> | undefined;
    let tick = -1;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index] as { kind?: string; payload?: { tick?: number; counts?: Record<string, number> } };
      if (counts === undefined && message.kind === 'simulation/status-counts') counts = message.payload?.counts;
      if (tick < 0 && message.kind === 'simulation/clock-state') tick = message.payload?.tick ?? -1;
      if (counts !== undefined && tick >= 0) break;
    }
    return { tick, counts: counts ?? {} };
  });
  return {
    wallMs: Date.now() - startedAt,
    tick: raw.tick,
    day: Math.floor(raw.tick / DAY_LENGTH_TICKS) + 1,
    prisoners: raw.counts['prisoners'] ?? -1,
    roomOccupants: raw.counts['roomOccupants'] ?? -1,
    occupiedPlaces: raw.counts['occupiedPlaces'] ?? -1,
    accommodationCapacity: raw.counts['accommodationCapacity'] ?? -1,
    treasuryMinorUnits: raw.counts['treasuryMinorUnits'] ?? -1,
  };
}

/** The PRISONERS chip, whole -- value, label and #635's badge if it is rendered. */
async function prisonersChip(page: Page): Promise<string> {
  return page.evaluate(() => {
    const chip = document.querySelector<HTMLElement>('.hud-strip [data-metric="prisoners"]');
    if (chip === null) return 'CHIP ABSENT';
    return (chip.innerText ?? '').replace(/\n+/g, ' | ').trim();
  });
}

/** Every metric chip, so a missing one is visible as a missing one. */
async function allChips(page: Page): Promise<string> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hud-strip [data-metric]')]
      .map((chip) => `${chip.dataset['metric'] ?? '?'}={${(chip.innerText ?? '').replace(/\n+/g, ' ')}}`)
      .join('  '),
  );
}

/** The alerts list in the bottom-left minimap panel -- where #660's notice would land. */
async function alerts(page: Page): Promise<string> {
  return page.evaluate(() => {
    const list = document.querySelector<HTMLElement>('.hud-alerts__list');
    if (list === null) return 'ALERTS LIST ABSENT';
    if (list.getClientRects().length === 0) return 'ALERTS LIST not laid out';
    const text = (list.innerText ?? '').trim();
    return text === '' ? '(empty)' : text.replace(/\n{2,}/g, '\n');
  });
}

/**
 * The whole visible HUD.
 *
 * `innerText` reflects layout, so a sentence inside a folded section does not
 * appear -- which makes "could a player read this without unfolding anything?"
 * a substring test. #569's rule, restated: print the container, not the parts.
 */
async function hudText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const hud = document.querySelector<HTMLElement>('.hud');
    return (hud?.innerText ?? 'NO .hud').replace(/\n{2,}/g, '\n').trim();
  });
}

/** Opens the Regime tab, unfolds it, and returns the roster block whole. */
async function rosterText(page: Page): Promise<string> {
  await tab(page, 'regime').click();
  const collapsed = await page.locator('.hud-regime').getAttribute('data-collapsed');
  if (collapsed === 'true') await page.locator('.hud-regime > .ui-panel__header > .ui-panel__toggle').click();
  await page.waitForTimeout(700);
  return panelText(page, '.hud-regime__roster');
}

/** Words a player would have to see for a sentence, a review or a release to be on screen at all. */
const VOCABULARY = ['sentence', 'sentenced', 'days left', 'release', 'released', 'discharge', 'review', 'reviewed', 'reclassif', 'tier', 'due out'];

function vocabularyReport(log: (line: string) => void, moment: string, text: string): void {
  const found = VOCABULARY.filter((word) => new RegExp(word, 'i').test(text));
  log(`VOCABULARY at ${moment}: present=${JSON.stringify(found)} absent=${JSON.stringify(VOCABULARY.filter((w) => !found.includes(w)))}`);
}

test.describe('playtest: main after the fifteen changes of 2026-08-30', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', (message) => {
      const text = message.text();
      if (message.type() === 'error' || /Failed to process file|could not be decoded/.test(text)) {
        console.log(`[page:${message.type()}] ${text}`);
      }
    });
    await installTee(page);
    await openApp(page);
  });

  /**
   * **Act 1, three minutes.** The defect the owner reported -- *"nie mogłem
   * postawić więzienia"* -- as it stands on `main` today, with the
   * just-in-time materials fix (#640) still open. This is a confirmation, not
   * a re-derivation: `docs/research/2026-08-30-the-naive-route.md` walked the
   * whole naive route. All this asks is whether the first wall a new player
   * orders still parks, and whether anything on screen says why.
   */
  test('the first wall a new player orders, with no purchase first', async ({ page }) => {
    const log = (line: string) => console.log(`[act1] ${line}`);
    const startedAt = Date.now();

    await page.getByRole('button', { name: 'New prison' }).click();
    await tab(page, 'build').click();
    const origin = await calibrate(page);
    log(`calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);

    await armBuildable(page, 'wall-brick');
    const northY = origin.originY + 12 * TILE;
    await drag(
      page,
      { x: origin.originX + 12 * TILE + TILE / 2, y: northY },
      { x: origin.originX + 18 * TILE - TILE / 2, y: northY },
    );
    log(`queue right after one wall run: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);

    await fastForwardToMax(page);
    for (const waitMs of [5_000, 20_000, 35_000]) {
      await page.waitForTimeout(waitMs);
      log(`after ${(Date.now() - startedAt) / 1000}s of x4, tick ${await currentTick(page)}: queue ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
      log(`  deliveries: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);
      log(`  refusal band: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
      log(`  alerts: ${JSON.stringify(await alerts(page))}`);
    }

    const visible = await hudText(page);
    log(`WHOLE VISIBLE HUD, nothing unfolded by hand:\n${visible}`);
    for (const word of ['awaiting materials', 'material', 'brick', 'buy', 'stock', 'purchase']) {
      log(`  /${word}/i in the visible HUD? ${new RegExp(word, 'i').test(visible)}`);
    }
    log(`clock: ${JSON.stringify(await currentClock(page))}`);
  });

  /**
   * **Act 2, about ten minutes.** #660's notice, in a game rather than in the
   * UI harness.
   *
   * The shape is forced by `PrisonerOperationsRuntime.relocateExcessResidentsOf`
   * (`src/simulation/prisoners/prisoner-operations-runtime.ts:703`): it moves a
   * resident who no longer has a place *out of* an instance and into whatever
   * `findBestAvailable` offers, so a one-room prison can never produce the
   * notice -- with one instance, the only room with a spare bed is the room
   * the bed was just taken from. **Two cell instances are the minimum**, so
   * this builds a 2x7 enclosure divided into a 2x3 and a 2x4 cell, which is
   * 20 wall segments against the 24 a single 6x6 costs.
   *
   * The order is chosen so the destination is not a coin flip: the north cell
   * gets its bed first and the prisoner is admitted while it is the only bed
   * in the prison, so they must live there. The south cell's bed is built
   * afterwards, purely as somewhere to be moved to.
   */
  test('take a bed away from under a prisoner, and see whether the game says so', async ({ page }) => {
    const log = (line: string) => console.log(`[act2] ${line}`);
    test.setTimeout(900_000);

    await page.getByRole('button', { name: 'New prison' }).click();
    await tab(page, 'build').click();
    const origin = await calibrate(page);
    const at = (tx: number, ty: number) => centreOf(origin, tx, ty);

    await buy(page, 'wall-brick', 60);
    await buy(page, 'bed-wooden', 4);
    await buy(page, 'toilet-brick', 4);
    await fastForwardToMax(page);
    await page.waitForTimeout(6_000);
    log(`deliveries after buying: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);

    // A 2x7 box over tiles x 12..13, y 12..18, with a divider on the north
    // edge of row 15. North cell = (12,12)-(13,14); south cell = (12,15)-(13,18).
    await armBuildable(page, 'wall-brick');
    const west = origin.originX + 12 * TILE;
    const east = origin.originX + 14 * TILE;
    const north = origin.originY + 12 * TILE;
    const south = origin.originY + 19 * TILE;
    const divider = origin.originY + 15 * TILE;
    for (const run of [
      { name: 'north', a: { x: west + TILE / 2, y: north }, b: { x: east - TILE / 2, y: north } },
      { name: 'south', a: { x: west + TILE / 2, y: south }, b: { x: east - TILE / 2, y: south } },
      { name: 'west', a: { x: west, y: north + TILE / 2 }, b: { x: west, y: south - TILE / 2 } },
      { name: 'east', a: { x: east, y: north + TILE / 2 }, b: { x: east, y: south - TILE / 2 } },
      { name: 'divider', a: { x: west + TILE / 2, y: divider }, b: { x: east - TILE / 2, y: divider } },
    ]) {
      await drag(page, run.a, run.b);
      log(`wall run ${run.name} placed`);
    }
    await waitForQueueEmpty(page);
    log(`walls up at tick ${await currentTick(page)}: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);

    const designate = async (label: string, a: [number, number], b: [number, number]): Promise<number> => {
      for (let attempt = 1; attempt <= 12; attempt += 1) {
        await tab(page, 'rooms').click();
        const collapsed = await page.locator('.hud-rooms').getAttribute('data-collapsed');
        if (collapsed === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
        await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
        await page.locator('.hud-rooms__arm').click();
        await drag(page, at(a[0], a[1]), at(b[0], b[1]));
        await page.locator('.hud-rooms__confirm').click();
        await page.waitForTimeout(900);
        const rooms = (await latestCounts(page))?.rooms ?? 0;
        log(`designate ${label} attempt ${attempt}: rooms=${rooms}`);
        if (rooms >= (label === 'north' ? 1 : 2)) return rooms;
        await page.waitForTimeout(4_000);
      }
      throw new Error(`${label} cell was never accepted`);
    };
    await designate('north', [12, 12], [13, 14]);
    await designate('south', [12, 15], [13, 18]);

    // The north cell only. One bed and one toilet, so it is the only place to live.
    await tab(page, 'build').click();
    await armBuildable(page, 'bed-wooden');
    await press(page, at(12, 12).x, at(12, 12).y);
    await armBuildable(page, 'toilet-brick');
    await press(page, at(13, 14).x, at(13, 14).y);
    await waitForQueueEmpty(page);
    await page.waitForTimeout(2_000);
    log(`north furnished at tick ${await currentTick(page)}: ${JSON.stringify(await latestCounts(page))}`);

    await tab(page, 'overview').click();
    await page.locator('.hud-intake__admit').click();
    const startedAt = Date.now();
    let housed = false;
    for (let poll = 0; poll < 60; poll += 1) {
      await page.waitForTimeout(2_000);
      const now = await sample(page, startedAt);
      if (poll % 5 === 0 || now.occupiedPlaces > 0) log(`waiting for a resident: ${JSON.stringify(now)}`);
      if (now.occupiedPlaces >= 1) {
        housed = true;
        break;
      }
    }
    log(`housed=${housed} | chips: ${await allChips(page)}`);
    if (!housed) {
      log('STOPPED: the admitted prisoner never took a place, so a relocation cannot be provoked. Reporting that rather than a notice.');
      log(`HUD:\n${await hudText(page)}`);
      return;
    }

    // Somewhere to be moved to.
    await tab(page, 'build').click();
    await armBuildable(page, 'bed-wooden');
    await press(page, at(12, 17).x, at(12, 17).y);
    await armBuildable(page, 'toilet-brick');
    await press(page, at(13, 18).x, at(13, 18).y);
    await waitForQueueEmpty(page);
    await page.waitForTimeout(2_000);
    log(`south furnished at tick ${await currentTick(page)}: ${JSON.stringify(await latestCounts(page))}`);
    log(`alerts before the removal: ${JSON.stringify(await alerts(page))}`);
    const before = await sample(page, startedAt);
    log(`sample before the removal: ${JSON.stringify(before)}`);

    // Take the bed out from under them.
    await page.locator('.hud-build__remove').click();
    const removal = await press(page, at(12, 12).x, at(12, 12).y);
    log(`RemoveObject commands from the press on the occupied bed: ${JSON.stringify(removal)}`);
    await page.waitForTimeout(3_000);

    for (const waitMs of [0, 3_000, 10_000]) {
      if (waitMs > 0) await page.waitForTimeout(waitMs);
      log(`alerts +${waitMs}ms after the removal: ${JSON.stringify(await alerts(page))}`);
    }
    const after = await sample(page, startedAt);
    log(`sample after the removal: ${JSON.stringify(after)}`);
    log(`chips after the removal: ${await allChips(page)}`);
    const visible = await hudText(page);
    log(`WHOLE VISIBLE HUD after the removal:\n${visible}`);
    log(`  /had nowhere to sleep/i in the visible HUD? ${/had nowhere to sleep/i.test(visible)}`);
    log(`  /moved to/i in the visible HUD? ${/moved to/i.test(visible)}`);
  });

  /**
   * **Act 3, the long one.** How long a prisoner stays, and what a player can
   * see about it.
   *
   * Twelve admissions into a six-bed cell, so six of them are #635's badge and
   * six are residents, then x4 for as long as the budget allows. Every
   * departure is a fall in `prisoners`; the tick it falls at, minus the tick
   * the batch was classified on, is one sentence measured off the running
   * game.
   *
   * The wall budget is deliberate and stated: 33,600 ticks is the shortest
   * drawable sentence and 420 wall seconds at x4, so a run that reaches
   * ~40,000 ticks after admission has given every 14-day sentence in the batch
   * a chance to end and no 20-day sentence one. **What that can and cannot
   * settle is the point of measuring it** -- see the research document.
   */
  test('twelve prisoners, six beds, and how long any of them stay', async ({ page }) => {
    const log = (line: string) => console.log(`[act3] ${line}`);
    test.setTimeout(2_400_000);
    const startedAt = Date.now();

    await buildAndPopulate(page, { beds: 6, admits: 12, guards: 1, label: 'act3' });

    const admittedAt = await currentTick(page);
    log(`=== all twelve admitted by tick ${admittedAt} (in-game day ${Math.floor(admittedAt / DAY_LENGTH_TICKS) + 1}) ===`);
    log(`chips: ${await allChips(page)}`);
    log(`PRISONERS chip: ${JSON.stringify(await prisonersChip(page))}`);
    log(`roster at admission:\n${await rosterText(page)}`);

    const firstVisible = await hudText(page);
    log(`WHOLE VISIBLE HUD just after admission:\n${firstVisible}`);
    vocabularyReport(log, 'just after admission', firstVisible);

    await fastForwardToMax(page);
    log(`clock: ${JSON.stringify(await currentClock(page))}`);

    // The run. Sample every 10 s of wall time; dump the roster every 2 minutes.
    const budgetMs = 33 * 60 * 1_000;
    const samples: Sample[] = [];
    const departures: { tick: number; from: number; to: number; wallMs: number }[] = [];
    let peak = 0;
    let previous = await sample(page, startedAt);
    samples.push(previous);
    let lastRosterMs = 0;
    let lastRoster = '';

    for (;;) {
      await page.waitForTimeout(10_000);
      const now = await sample(page, startedAt);
      samples.push(now);
      peak = Math.max(peak, now.prisoners);
      if (now.prisoners < previous.prisoners && previous.prisoners >= 0 && now.prisoners >= 0) {
        for (let n = previous.prisoners; n > now.prisoners; n -= 1) {
          departures.push({ tick: now.tick, from: previous.prisoners, to: now.prisoners, wallMs: now.wallMs });
        }
        log(
          `*** DEPARTURE between tick ${previous.tick} and ${now.tick}: prisoners ${previous.prisoners} -> ${now.prisoners}` +
            ` | that is ${((now.tick - admittedAt) / DAY_LENGTH_TICKS).toFixed(1)} in-game days after admission` +
            ` | alerts: ${JSON.stringify(await alerts(page))}`,
        );
        log(`    chips: ${await allChips(page)}`);
      }
      if (now.wallMs - lastRosterMs >= 120_000) {
        lastRosterMs = now.wallMs;
        const roster = await rosterText(page);
        log(`--- t+${Math.round(now.wallMs / 1000)}s tick ${now.tick} (day ${now.day}) ${JSON.stringify(now)}`);
        log(`    chips: ${await allChips(page)}`);
        log(`    roster:\n${roster}`);
        if (roster !== lastRoster && lastRoster !== '') log(`    (the roster block changed since the previous dump)`);
        lastRoster = roster;
        await tab(page, 'overview').click();
      }
      previous = now;
      if (now.wallMs > budgetMs) break;
    }

    const last = samples[samples.length - 1]!;
    log(`=== END OF RUN ===`);
    log(`ran to tick ${last.tick}, in-game day ${last.day}; that is ${((last.tick - admittedAt) / DAY_LENGTH_TICKS).toFixed(1)} in-game days after the batch was admitted`);
    log(`peak population ${peak}; final ${JSON.stringify(last)}`);
    log(`departures observed: ${departures.length} -> ${JSON.stringify(departures)}`);
    log(`shortest drawable sentence is 14 days = 33600 ticks; the run covered ${last.tick - admittedAt} ticks after admission`);
    log(`every sample: ${JSON.stringify(samples.map((s) => [Math.round(s.wallMs / 1000), s.tick, s.prisoners, s.roomOccupants, s.occupiedPlaces, s.treasuryMinorUnits]))}`);
    const finalHud = await hudText(page);
    log(`WHOLE VISIBLE HUD at the end:\n${finalHud}`);
    vocabularyReport(log, 'end of run', finalHud);
    log(`final roster:\n${await rosterText(page)}`);
    log(`final alerts: ${JSON.stringify(await alerts(page))}`);
  });
});
