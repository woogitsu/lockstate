import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
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
  sentCommands,
  tab,
  waitForQueueEmpty,
} from './playtest-harness';

/**
 * **A prisoner's day, played rather than read.**
 *
 * ## What this file is for
 *
 * The owner's brief was `znajdc bugi i bledy grajac` -- find defects by
 * *playing*. The surface is one prisoner's daily life and what the HUD says
 * about it: needs decaying, the roster's activity cell, the worst-need bar and
 * its unmet flag, and -- new this morning --
 * [ADR 0093](../../docs/adr/0093-a-carry-is-an-action.md)'s `action.carry`,
 * which had never been driven through the UI at all.
 *
 * Three acts, one `test()` each, because each one alone spends minutes of wall
 * clock and the config's budget is 600 s per test:
 *
 * 1. **`a day in a cell`** -- build a cell, admit three, run at x4 for several
 *    in-game days, and sample the Regime roster's own data attributes. What is
 *    measured: the decay slope the screen shows against
 *    `NEED_DECAY_PER_TICK`; which need the roster names as worst and when the
 *    unmet flag flips; whether the activity cell ever names an action that
 *    addresses the need the same row is complaining about; and whether the
 *    roster's `data-total` agrees with the status strip's own prisoner count.
 * 2. **`the errand`** -- ADR 0093's route, built with the mouse: a furnished
 *    `room.delivery-bay`, a furnished `room.storage-room`, then a purchase. The
 *    delivery then lands in the bay instead of in the construction container
 *    (`ProcurementSystem.update` -> `DeliveryBayCarryRoute.landAndRaiseCarry`),
 *    and a prisoner has to walk it across. What is measured: whether any row
 *    ever reads `Errand`, how long the queue waits, and what the Build panel
 *    says while it waits.
 * 3. **`save and reload mid-routine`** -- save while somebody is doing
 *    something, reload the page for real, load, and compare the row.
 *
 * ## The traps this file was written around, all of them previously paid for
 *
 * - **`calibrate` returns the real world origin and on this build it is
 *   `(-304, -574)`**, so tile (12,12) is at screen (464, 194) and tile (12,2)
 *   is off the top of the window. Every gesture below goes through
 *   `centreOf(origin, ...)` with the origin measured by bisection, and act 2's
 *   layout is chosen so that every tile it touches is inside the 1440x900
 *   viewport the playtest config sets.
 * - **A browser press lands 36-55 ticks late** (`DEFAULT_LEAD_TICKS = 20` in
 *   `src/ui/simulation-commands.ts` plus elapsed wall time, projected in
 *   `projectFromClock`). Nothing here reads a value, presses, and then expects
 *   the value the read implied. The need series is read as a *series* and the
 *   slope is fitted over it, which is immune to a constant lead.
 * - **The roster shows four rows, not the roster.**
 *   `PRISONER_ROSTER_ROW_LIMIT` is 4 (`src/ui/hud/regime-panel.ts:174`) and
 *   `PrisonerRosterReader.read` asks for exactly that many, ordered highest
 *   risk tier first. Act 1 admits three so that the window is the population.
 * - **The tick is read from `simulation/clock-state`, never from
 *   `simulation/status-counts`** -- the harness's `currentTick` says why at
 *   length.
 * - **`.playtest.ts` is not collected by CI.** `playwright.config.ts` is
 *   `testMatch: /.*\.spec\.ts$/`, so this file is evidence and never a gate.
 *   Run it with:
 *
 *   ```
 *   LOCKSTATE_BROWSER_TEST_PORT=5241 node node_modules/@playwright/test/cli.js test \
 *     --config tests/browser/playwright.playtest.config.ts \
 *     tests/browser/playtest-2026-09-03-a-prisoners-day.playtest.ts \
 *     --grep "a day in a cell"
 *   ```
 *
 *   `git lfs checkout` first in a worktree, or every actor atlas fails to
 *   decode and the run passes anyway with nothing drawn.
 * - **Nothing here asserts on a finding.** A playtest that went red on a
 *   defect would be a gate; the log is the deliverable. The only `expect`s are
 *   that the play itself happened (a prison got built, samples got taken), so
 *   that a run which never reached the measurement cannot be read as a run
 *   that measured nothing wrong.
 */

/** `NEED_MAX`, from `src/simulation/prisoners/needs.ts`. Duplicated deliberately: the HUD may not import the simulation, and neither may a probe that checks the HUD against it. */
const NEED_MAX = 255;
/** `STATE_INCOME_UNMET_NEED_LEVEL`, `src/simulation/economy/income.ts:307`. */
const UNMET_LEVEL = 51;
/** `NEED_DECAY_PER_TICK`, `src/simulation/prisoners/needs.ts`. Levels lost per tick with nothing opposing it. */
const DECAY_PER_TICK: Readonly<Record<string, number>> = {
  hunger: 0.05,
  sleep: 0.03,
  hygiene: 0.02,
  bladder: 0.08,
  safety: 0.05,
  recreation: 0.015,
};

interface RosterRowSample {
  readonly prisoner: string;
  readonly tier: string | null;
  readonly group: string | null;
  readonly name: string;
  readonly activity: string;
  readonly needId: string | null;
  readonly needWord: string;
  readonly permille: number;
  readonly unmet: string | null;
  readonly badge: string;
}

interface RosterSample {
  readonly at: number;
  readonly tick: number;
  readonly day: string;
  readonly total: string | null;
  readonly everAdmitted: string | null;
  readonly countText: string;
  readonly moreText: string;
  readonly rows: readonly RosterRowSample[];
}

/**
 * One reading of the Regime panel's roster block, off the attributes the panel
 * publishes for exactly this (`paintRoster`'s own comment: *"the half of the
 * change that makes it a measurement surface rather than a nicety"*).
 *
 * The permille is read from `data-need-permille` rather than derived from the
 * bar's width, because the bar quantizes to ten segments and the attribute
 * does not.
 */
async function readRoster(page: Page): Promise<RosterSample> {
  const at = Date.now();
  /*
   * **One round-trip, and that is a measured cost rather than tidiness.** The
   * first version of this function made three -- `currentTick`, `panelText`
   * for the day, then the roster evaluate -- and act 1 took 4.6 s per sample
   * on a container with three other agents' suites running, so a 210 s window
   * bought 45 samples instead of the 300 it was written for. The tick lives in
   * the tee's own array inside the page, so all three reads are one evaluate.
   */
  const block = await page.evaluate(() => {
    const text = (node: Element | null): string => (node instanceof HTMLElement ? (node.innerText ?? '').replace(/\s+/g, ' ').trim() : '');
    const messages = (window as unknown as { lockstateFromWorker?: unknown[] }).lockstateFromWorker ?? [];
    let tick = -1;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index] as { kind?: string; payload?: { tick?: number } };
      if (message.kind === 'simulation/clock-state') {
        tick = message.payload?.tick ?? -1;
        break;
      }
    }
    const day = text(document.querySelector('.hud-clock__day'));
    const root = document.querySelector<HTMLElement>('.hud-regime__roster');
    if (root === null || root.hidden) return { tick, day, absent: true as const };
    const rows = [...root.querySelectorAll<HTMLElement>('.hud-regime__roster-row')]
      .filter((row) => !row.hidden && row.getClientRects().length > 0)
      .map((row) => ({
        prisoner: row.dataset['prisoner'] ?? '',
        tier: row.dataset['riskTier'] ?? null,
        group: row.dataset['classificationGroup'] ?? null,
        name: text(row.querySelector('.hud-regime__roster-name')),
        activity: text(row.querySelector('.hud-regime__roster-activity')),
        needId: row.dataset['need'] ?? null,
        needWord: text(row.querySelector('.hud-regime__roster-need-name')),
        permille: Number(row.dataset['needPermille'] ?? Number.NaN),
        unmet: row.dataset['needUnmet'] ?? null,
        badge: text(row.querySelector('.ui-badge')),
      }));
    return {
      tick,
      day,
      absent: false as const,
      total: root.dataset['total'] ?? null,
      everAdmitted: root.dataset['everAdmitted'] ?? null,
      countText: text(root.querySelector('.hud-regime__roster-count')),
      moreText: text(root.querySelector('.hud-regime__roster-more')),
      rows,
    };
  });
  if (block.absent) {
    return { at, tick: block.tick, day: block.day, total: null, everAdmitted: null, countText: 'ROSTER BLOCK ABSENT OR HIDDEN', moreText: '', rows: [] };
  }
  return {
    at,
    tick: block.tick,
    day: block.day,
    total: block.total,
    everAdmitted: block.everAdmitted,
    countText: block.countText,
    moreText: block.moreText,
    rows: block.rows,
  };
}

/** The timetable block the panel says is running, with its own progress readout. */
async function readTimetable(page: Page): Promise<readonly Record<string, string>[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hud-regime__block-row')].map((row) => {
      const text = (selector: string): string => {
        const node = row.querySelector<HTMLElement>(selector);
        return node === null ? '' : (node.innerText ?? '').replace(/\s+/g, ' ').trim();
      };
      return { group: text('.hud-regime__block-name'), allows: text('.hud-regime__block-allows') };
    }),
  );
}

/** The FUNDS chip, found by its own label. `[data-metric="funds"] .ui-stat__value` works too; a label needs no attribute. */
async function money(page: Page): Promise<number> {
  const text = await page.evaluate(() => {
    for (const chip of Array.from(document.querySelectorAll('.ui-stat'))) {
      const label = chip.querySelector('.ui-stat__label');
      if (label instanceof HTMLElement && label.innerText.trim().toUpperCase() === 'FUNDS') {
        const value = chip.querySelector('.ui-stat__value');
        if (value instanceof HTMLElement) return value.innerText;
      }
    }
    return '';
  });
  const digits = text.replace(/[^\d-]/g, '');
  return digits === '' ? Number.NaN : Number.parseInt(digits, 10);
}

/**
 * What each authored action actually moves, from
 * `src/simulation/prisoners/actions.ts`'s `DEFAULT_ACTIONS`, keyed by the word
 * the roster prints (`src/content/simulation-message-keys.ts`).
 *
 * **Duplicated rather than imported, and the duplication is the point.** The
 * question this table answers is whether the *screen* agrees with the
 * simulation, and importing the simulation's own answer would be a fixture
 * supplying both sides of the comparison (`docs/TESTING.md`). Every row below
 * was read off `DEFAULT_ACTIONS` at `52db3031` and its label off the `action`
 * namespace in the message-key census; if a row here is wrong, the log says so
 * loudly rather than quietly agreeing.
 */
const WHAT_THE_ACTION_SERVES: Readonly<Record<string, readonly string[]>> = {
  Sleeping: ['sleep'],
  Eating: ['hunger'],
  'Eating in Cell': ['hunger'],
  'Using Toilet': ['bladder'],
  Showering: ['hygiene'],
  'Yard Time': ['recreation'],
  'Common Room': ['recreation'],
  Class: ['recreation'],
  Association: [],
  'Laundry Duty': ['hygiene'],
  'Kitchen Duty': ['hunger'],
  Errand: [],
  Idle: [],
};

/** Least-squares slope of `permille` against `tick`, in permille per tick. */
function slope(points: readonly { readonly tick: number; readonly permille: number }[]): number {
  if (points.length < 2) return Number.NaN;
  const n = points.length;
  const meanX = points.reduce((sum, p) => sum + p.tick, 0) / n;
  const meanY = points.reduce((sum, p) => sum + p.permille, 0) / n;
  let numerator = 0;
  let denominator = 0;
  for (const point of points) {
    numerator += (point.tick - meanX) * (point.permille - meanY);
    denominator += (point.tick - meanX) ** 2;
  }
  return denominator === 0 ? Number.NaN : numerator / denominator;
}

/** `permille` per tick that a need decaying at `levelsPerTick` would show. */
function predictedSlope(levelsPerTick: number): number {
  return -(levelsPerTick / NEED_MAX) * 1000;
}

/**
 * Zones one room the way a player does: pick the row, arm, drag the rectangle,
 * confirm -- retrying, because the Rooms panel's enclosure verdict is read off
 * a world view a snapshot replaces and a completed wall does not mark dirty.
 * Answers the number of attempts it took, or -1 if it never took.
 */
async function zoneRoom(
  page: Page,
  origin: { originX: number; originY: number },
  roomCatalogId: string,
  a: { x: number; y: number },
  b: { x: number; y: number },
  log: (line: string) => void,
  attemptsAllowed = 10,
): Promise<number> {
  const before = (await latestCounts(page))?.rooms ?? 0;
  for (let attempt = 1; attempt <= attemptsAllowed; attempt += 1) {
    await tab(page, 'rooms').click();
    const collapsed = await page.locator('.hud-rooms').getAttribute('data-collapsed');
    if (collapsed === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    await page.locator(`.hud-rooms__list [data-room="${roomCatalogId}"]`).click();
    await page.locator('.hud-rooms__arm').click();
    await drag(page, centreOf(origin, a.x, a.y), centreOf(origin, b.x, b.y));
    const note = await panelText(page, '.hud-rooms');
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(800);
    const rooms = (await latestCounts(page))?.rooms ?? 0;
    log(
      `zone ${roomCatalogId} attempt ${attempt}: rooms ${before} -> ${rooms}`
        + ` | panel said ${JSON.stringify(note.split('\n').filter((line) => /OPEN|ENCLOS|MISSING|NEEDS/i.test(line)))}`
        + ` | band ${JSON.stringify(await panelText(page, '.hud__refusal'))}`,
    );
    if (rooms > before) return attempt;
    await page.waitForTimeout(4000);
  }
  return -1;
}

/** Draws the four wall runs of the rectangle `[x0,x1] x [y0,y1]` (inclusive tiles). */
async function walls(
  page: Page,
  origin: { originX: number; originY: number },
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  log: (line: string) => void,
): Promise<void> {
  await tab(page, 'build').click();
  await armBuildable(page, 'wall-brick');
  const westX = origin.originX + x0 * TILE;
  const eastX = origin.originX + (x1 + 1) * TILE;
  const northY = origin.originY + y0 * TILE;
  const southY = origin.originY + (y1 + 1) * TILE;
  for (const run of [
    { name: 'north', a: { x: westX + TILE / 2, y: northY }, b: { x: eastX - TILE / 2, y: northY } },
    { name: 'south', a: { x: westX + TILE / 2, y: southY }, b: { x: eastX - TILE / 2, y: southY } },
    { name: 'west', a: { x: westX, y: northY + TILE / 2 }, b: { x: westX, y: southY - TILE / 2 } },
    { name: 'east', a: { x: eastX, y: northY + TILE / 2 }, b: { x: eastX, y: southY - TILE / 2 } },
  ]) {
    const before = (await sentCommands(page)).length;
    await drag(page, run.a, run.b);
    const produced = (await sentCommands(page)).slice(before);
    log(`wall run ${run.name} of (${x0},${y0})-(${x1},${y1}): ${produced.length} command(s)`);
  }
}

test.describe('a prisoner’s day', () => {
  /**
   * Act 1. A cell, three prisoners, no guards, and several in-game days at x4.
   *
   * No guards on purpose: `SAFETY_COVERAGE_PROVISION_MULTIPLIER.unguarded` is
   * `0`, so `safety` decays at its full 0.05/tick with nothing opposing it and
   * the roster has something to say within a minute of wall clock. Every other
   * need has a route out of a furnished cell or is room-gated, which is exactly
   * the shape a first-time player's first prison has.
   */
  test('a day in a cell: what the roster says while six needs fall', async ({ page }) => {
    const log = (line: string): void => {
      console.log(`[day] ${line}`);
    };

    await installTee(page);
    await openApp(page);
    const origin = await buildAndPopulate(page, { beds: 3, admits: 3, guards: 0, label: 'day' });
    log(`origin ${JSON.stringify(origin)}`);

    await tab(page, 'regime').click();
    log(`timetable on arrival: ${JSON.stringify(await readTimetable(page))}`);
    log(`regime panel: ${await panelText(page, '.hud-regime')}`);

    // The clock, stated before anything is concluded from a tick count.
    log(`clock: ${JSON.stringify(await currentClock(page))}`);
    await fastForwardToMax(page);
    await page.waitForTimeout(500);
    log(`clock after Fast forward: ${JSON.stringify(await currentClock(page))}`);

    const samples: RosterSample[] = [];
    const startedAt = Date.now();
    const RUN_MS = 210_000;
    while (Date.now() - startedAt < RUN_MS) {
      const sample = await readRoster(page);
      samples.push(sample);
      await page.waitForTimeout(600);
    }
    const counts = await latestCounts(page);
    log(`samples: ${samples.length}; ticks ${samples[0]?.tick} -> ${samples[samples.length - 1]?.tick}`);
    log(`counts at the end: ${JSON.stringify(counts)}`);
    log(`strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);

    // ---- 1. does the panel's own population figure agree with the strip's? --
    const lastSample = samples[samples.length - 1]!;
    log('=== POPULATION: THE ROSTER BLOCK AGAINST THE COUNTS CHANNEL ===');
    log(`roster data-total=${lastSample.total} data-ever-admitted=${lastSample.everAdmitted} count text ${JSON.stringify(lastSample.countText)}`);
    log(`counts channel prisoners=${counts?.prisoners} roomOccupants=${counts?.roomOccupants} accommodationCapacity=${counts?.accommodationCapacity}`);
    log(
      Number(lastSample.total) === counts?.prisoners
        ? 'AGREE on the population.'
        : `DISAGREE: the roster says ${String(lastSample.total)} and the counts channel says ${String(counts?.prisoners)}.`,
    );

    // ---- 2. which need does the roster name as worst, and when does it flip? -
    log('=== THE WORST NEED, PER PRISONER, OVER THE RUN ===');
    const prisoners = [...new Set(samples.flatMap((s) => s.rows.map((r) => r.prisoner)))].sort();
    for (const prisoner of prisoners) {
      const series = samples
        .flatMap((s) => s.rows.filter((r) => r.prisoner === prisoner).map((r) => ({ tick: s.tick, day: s.day, ...r })))
        .filter((point) => Number.isFinite(point.permille));
      if (series.length < 2) {
        log(`prisoner ${prisoner}: only ${series.length} sample(s), nothing to fit.`);
        continue;
      }
      const needIds = [...new Set(series.map((p) => p.needId))];
      log(`prisoner ${prisoner}: ${series.length} samples, worst need was ${JSON.stringify(needIds)}`);
      log(
        `  permille ${series[0]!.permille} at tick ${series[0]!.tick}`
          + ` -> ${series[series.length - 1]!.permille} at tick ${series[series.length - 1]!.tick}`,
      );
      const flip = series.find((point) => point.unmet === 'true');
      if (flip === undefined) {
        log(`  the unmet flag never turned true; lowest permille seen was ${Math.min(...series.map((p) => p.permille))}.`);
      } else {
        const level = (flip.permille / 1000) * NEED_MAX;
        log(
          `  unmet flag TRUE first at tick ${flip.tick} (day ${flip.day}), need ${String(flip.needId)},`
            + ` permille ${flip.permille} = level ${level.toFixed(1)} against the ${UNMET_LEVEL} the state docks at`
            + ` -- badge read ${JSON.stringify(flip.badge)}, activity ${JSON.stringify(flip.activity)}`,
        );
      }
      /*
       * The slope, fitted only over the stretch where one need stayed worst
       * **and had not yet hit the floor**.
       *
       * **The floor filter is a correction to this file's first run and the
       * error is worth keeping, because it is the shape `docs/AGENT_WORKFLOW.md`
       * §3 warns about.** Without it, the fit ran over every sample the need
       * was worst for -- including the 6,400 ticks it sat clamped at `0` after
       * reaching it -- and reported `safety` decaying at 13-18% of
       * `NEED_DECAY_PER_TICK.safety`. Read as a finding, that is "the screen
       * shows safety falling five times slower than the constant says". It was
       * a flat tail dragging a regression line: over the unclamped stretch of
       * the same tape the three prisoners measured -0.1949, -0.1954 and
       * -0.1952 permille/tick against a predicted -0.1961, which is agreement
       * to within 0.6%. A measurement is not a diagnosis, and a regression
       * over a clamped series is not a rate.
       */
      for (const needId of needIds) {
        if (needId === null) continue;
        const forNeed = series.filter((point) => point.needId === needId);
        const unclamped = forNeed.filter((point) => point.permille > 0 && point.permille < 1000);
        const predicted = predictedSlope(DECAY_PER_TICK[needId] ?? Number.NaN);
        if (unclamped.length >= 3) {
          const measured = slope(unclamped);
          const first = unclamped[0]!;
          const last = unclamped[unclamped.length - 1]!;
          const endpoints = (last.permille - first.permille) / (last.tick - first.tick);
          log(
            `  ${needId}: fitted ${measured.toFixed(4)} permille/tick and endpoint-to-endpoint`
              + ` ${endpoints.toFixed(4)} over ${unclamped.length} unclamped samples`
              + ` (tick ${first.tick} @${first.permille} -> ${last.tick} @${last.permille});`
              + ` unopposed decay predicts ${predicted.toFixed(4)}; ratio ${(measured / predicted).toFixed(3)}`,
          );
        } else {
          log(
            `  ${needId}: only ${unclamped.length} unclamped sample(s) of ${forNeed.length}` +
              ` -- it was already on the floor whenever it was the worst need, so no rate can be read from the screen.`,
          );
        }
        const floored = forNeed.filter((point) => point.permille === 0);
        if (floored.length > 0) {
          log(
            `  ${needId}: on the floor (permille 0) for ${floored.length} of ${forNeed.length} samples,`
              + ` ticks ${floored[0]!.tick} -> ${floored[floored.length - 1]!.tick}`
              + ` = ${floored[floored.length - 1]!.tick - floored[0]!.tick} ticks`
              + ` (${((floored[floored.length - 1]!.tick - floored[0]!.tick) / 2400).toFixed(2)} in-game days) at zero.`,
          );
        }
      }
    }

    // ---- 3. the activity cell against the need the same row complains about --
    log('=== WHAT THE ROW SAID THEY WERE DOING WHILE IT SAID THEY WERE UNMET ===');
    const activityTally = new Map<string, number>();
    const unmetActivityTally = new Map<string, number>();
    for (const sample of samples) {
      for (const row of sample.rows) {
        activityTally.set(row.activity, (activityTally.get(row.activity) ?? 0) + 1);
        if (row.unmet === 'true') {
          const key = `${String(row.needId)} unmet -> ${row.activity}`;
          unmetActivityTally.set(key, (unmetActivityTally.get(key) ?? 0) + 1);
        }
      }
    }
    log(`every activity the roster ever showed: ${JSON.stringify([...activityTally.entries()].sort((l, r) => r[1] - l[1]))}`);
    log(`what they were doing while the row said unmet: ${JSON.stringify([...unmetActivityTally.entries()].sort((l, r) => r[1] - l[1]))}`);

    /*
     * And the question the two columns together are asking, made explicit: of
     * the samples where the row named a need AND named an activity, in how
     * many did the activity actually move that need?
     *
     * The row prints the two side by side on one line
     * (`.hud-regime__roster-line`), so a player reads them as a pair -- "worst:
     * Hygiene 0%, doing: Using Toilet" reads as somebody attending to it. The
     * table above says what each action moves.
     */
    log('=== DOES THE ACTIVITY THE ROW NAMES MOVE THE NEED THE ROW NAMES? ===');
    let paired = 0;
    let addressed = 0;
    const misses = new Map<string, number>();
    const unknownActivities = new Set<string>();
    for (const sample of samples) {
      for (const row of sample.rows) {
        if (row.needId === null || row.activity === '') continue;
        const serves = WHAT_THE_ACTION_SERVES[row.activity];
        if (serves === undefined) {
          unknownActivities.add(row.activity);
          continue;
        }
        paired += 1;
        if (serves.includes(row.needId)) addressed += 1;
        else {
          const key = `worst "${row.needWord}" (${row.needId}) @${row.permille}‰ while "${row.activity}" moves ${JSON.stringify(serves)}`;
          misses.set(key, (misses.get(key) ?? 0) + 1);
        }
      }
    }
    if (unknownActivities.size > 0) {
      log(`ACTIVITY WORDS THIS FILE'S TABLE DOES NOT KNOW: ${JSON.stringify([...unknownActivities])} -- the table is stale, not the game.`);
    }
    log(`${addressed} of ${paired} row-samples had an activity that moves the need the same row named as worst.`);
    for (const [key, count] of [...misses.entries()].sort((l, r) => r[1] - l[1]).slice(0, 12)) log(`  ${count}x ${key}`);

    // ---- 4. the tape, so a reader can see the day rather than the summary ---
    log('=== TAPE (one line per sample where anything changed) ===');
    let previous = '';
    for (const sample of samples) {
      const line = sample.rows
        .map((row) => `${row.prisoner}:${row.activity}/${String(row.needId)}@${row.permille}${row.unmet === 'true' ? '!' : ''}`)
        .join('  ');
      if (line === previous) continue;
      previous = line;
      log(`  t=${sample.tick} day=${sample.day} ${line}`);
    }

    expect(samples.length).toBeGreaterThan(20);
    expect(prisoners.length).toBeGreaterThan(0);
  });


  /**
   * Act 2. ADR 0093's errand, driven with the mouse for the first time.
   *
   * ## Two things this act's first run cost, both kept because they will be
   * paid again
   *
   * 1. **A large part of the canvas is not reachable by a mouse gesture, and
   *    the failure is silent.** `.hud` is `position: fixed; inset: 0` with
   *    `pointer-events: none`, but every panel inside it takes
   *    `pointer-events: auto` (`hud.css`'s `.hud__aside > *, .hud__side > *`
   *    rule), so a drag whose path crosses a panel is swallowed with no
   *    refusal, no band and no console line. A first attempt put the delivery
   *    bay at (6,12)-(9,15) -- comfortably inside the *viewport* -- and its
   *    four wall runs produced 4, **0**, 1 and (never reached) commands. So
   *    this act measures the reachable tiles with `elementFromPoint` before it
   *    lays anything out, and prints the band it found; a layout chosen from
   *    the viewport's arithmetic alone is a layout chosen from the wrong
   *    rectangle.
   * 2. **`buildAndPopulate` is too expensive to be act 2's prologue.** Its 6x6
   *    cell, twelve panel dumps and 5 s designate retries spent about eight of
   *    the ten minutes the first attempt had, and the test died mid-wall. This
   *    act builds its own prison instead: a 2x3 cell, the catalogue minimum
   *    (`room.cell` is `minWidth: 2, minHeight: 3, minTiles: 6`), one bed and
   *    one toilet, one prisoner. 10 wall segments instead of 24.
   *
   * ## What is being played for
   *
   * `DeliveryBayCarryRoute` arms only when **both** logistics rooms hold the
   * capability their own catalogue requirement names -- `'delivery-access'`
   * from `object.loading-dock-door` in a `room.delivery-bay`, `'item-storage'`
   * from `object.storage-rack` in a `room.storage-room`. From that moment
   * `ProcurementSystem.update` stops depositing a delivery into the
   * construction container and lands it in the bay's own container instead,
   * raising a carry job; the goods reach construction only when a prisoner
   * walks them across. So the questions are:
   *
   * - does a row ever read `Errand` (the label
   *   `src/content/simulation-message-keys.ts` marks as *"a draft for the
   *   owner's review"*), and how long after the delivery lands?
   * - what does the Build panel say about an order whose bricks are sitting in
   *   a shed forty tiles away? `BuildQueueViewModel`'s own comment says every
   *   such order reads `'materials-pending'` *"whether its materials are on a
   *   lorry or were never bought"*, and `materialsFunding.unfunded` is the
   *   only other thing on that block.
   */
  test('the errand: a delivery that has to be carried', async ({ page }) => {
    // Not the config's 600_000: act 2's first attempt died inside a wall run
    // at exactly that mark with three other agents' suites on the box. A
    // playtest is not a gate, so a budget here buys evidence rather than
    // hiding a race -- and the run is read from its log either way.
    test.setTimeout(1_500_000);
    const log = (line: string): void => {
      console.log(`[errand] ${line}`);
    };

    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await tab(page, 'build').click();
    const origin = await calibrate(page);
    log(`origin ${JSON.stringify(origin)}; viewport ${JSON.stringify(page.viewportSize())}`);

    // ---- which tiles can a gesture actually reach? -------------------------
    const reach = await page.evaluate(
      ({ originX, originY, tile }) => {
        const rows: { y: number; xs: number[] }[] = [];
        for (let ty = 0; ty <= 30; ty += 1) {
          const centreY = originY + ty * tile + tile / 2;
          if (centreY < 0 || centreY > window.innerHeight) continue;
          const xs: number[] = [];
          for (let tx = 0; tx <= 40; tx += 1) {
            const centreX = originX + tx * tile + tile / 2;
            if (centreX < 0 || centreX > window.innerWidth) continue;
            const hit = document.elementFromPoint(centreX, centreY);
            // Reachable means the world gets it: the hit is the canvas, or at
            // least is not inside the HUD overlay.
            const blocked = hit === null || hit.closest('.hud') !== null || hit.closest('.save-panel') !== null;
            if (!blocked) xs.push(tx);
          }
          rows.push({ y: ty, xs });
        }
        return rows;
      },
      { originX: origin.originX, originY: origin.originY, tile: TILE },
    );
    for (const row of reach) {
      const xs = row.xs;
      log(
        `reachable tiles at y=${row.y}: ${xs.length === 0 ? 'NONE' : `${xs.length} of them, x ${xs[0]}..${xs[xs.length - 1]}`}`
          + `${xs.length > 0 && xs[xs.length - 1]! - xs[0]! + 1 !== xs.length ? ` (WITH GAPS: ${JSON.stringify(xs)})` : ''}`,
      );
    }

    // ---- the layout, inside the band the probe found -----------------------
    // Chosen against the probe rather than against the viewport, and every
    // rectangle is its room type's catalogue minimum so the walls are as few
    // as the content allows.
    const CELL = { x0: 12, y0: 12, x1: 13, y1: 14 } as const; // 2x3, 10 segments
    const BAY = { x0: 15, y0: 12, x1: 18, y1: 15 } as const; // 4x4, 16 segments
    const STORE = { x0: 12, y0: 16, x1: 14, y1: 18 } as const; // 3x3, 12 segments
    for (const [name, rect] of [
      ['cell', CELL],
      ['bay', BAY],
      ['store', STORE],
    ] as const) {
      const unreachable: string[] = [];
      for (let ty = rect.y0; ty <= rect.y1; ty += 1) {
        const row = reach.find((candidate) => candidate.y === ty);
        for (let tx = rect.x0; tx <= rect.x1; tx += 1) {
          if (row === undefined || !row.xs.includes(tx)) unreachable.push(`${tx},${ty}`);
        }
      }
      log(
        `${name} at (${rect.x0},${rect.y0})-(${rect.x1},${rect.y1}):`
          + ` ${unreachable.length === 0 ? 'every tile reachable' : `UNREACHABLE TILES ${JSON.stringify(unreachable)}`}`,
      );
    }

    // ---- materials -----------------------------------------------------------
    // 38 wall segments = 76 bricks, +1 for the toilet. 1 plank for the bed, 3
    // for the dock door, 2 for the racks. Bought while the route is still
    // unarmed, so all of it lands in the construction container directly.
    await buy(page, 'wall-brick', 80);
    await buy(page, 'bed-wooden', 2);
    await buy(page, 'loading-dock-door-wooden', 4);
    await buy(page, 'storage-rack-wooden', 3);
    log(`funds after buying: ${String(await money(page))}`);
    await fastForwardToMax(page);
    await page.waitForTimeout(3000);
    log(`clock ${JSON.stringify(await currentClock(page))} at tick ${await currentTick(page)}`);

    // ---- the three rectangles ------------------------------------------------
    await walls(page, origin, CELL.x0, CELL.y0, CELL.x1, CELL.y1, log);
    await walls(page, origin, BAY.x0, BAY.y0, BAY.x1, BAY.y1, log);
    await walls(page, origin, STORE.x0, STORE.y0, STORE.x1, STORE.y1, log);
    log(`queue right after the wall runs: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
    log(`queue empty ${await waitForQueueEmpty(page, 300_000)}ms later, tick ${await currentTick(page)}`);

    const cellAttempts = await zoneRoom(page, origin, 'room.cell', { x: CELL.x0, y: CELL.y0 }, { x: CELL.x1, y: CELL.y1 }, log, 6);
    const bayAttempts = await zoneRoom(page, origin, 'room.delivery-bay', { x: BAY.x0, y: BAY.y0 }, { x: BAY.x1, y: BAY.y1 }, log, 6);
    const storeAttempts = await zoneRoom(page, origin, 'room.storage-room', { x: STORE.x0, y: STORE.y0 }, { x: STORE.x1, y: STORE.y1 }, log, 6);
    log(`zoning attempts: cell ${cellAttempts}, bay ${bayAttempts}, store ${storeAttempts}`);
    log(`counts after zoning: ${JSON.stringify(await latestCounts(page))}`);
    if (cellAttempts < 0 || bayAttempts < 0 || storeAttempts < 0) {
      log('COULD NOT ZONE ALL THREE ROOMS. That is this run’s finding rather than a step to work around.');
      log(`rooms panel: ${await panelText(page, '.hud-rooms')}`);
      return;
    }

    // ---- furnish: the cell, then both ends of the route ---------------------
    await tab(page, 'build').click();
    await armBuildable(page, 'bed-wooden');
    const bedAt = centreOf(origin, CELL.x0, CELL.y0);
    log(`bed at (${CELL.x0},${CELL.y0}): ${JSON.stringify(await press(page, bedAt.x, bedAt.y))}`);
    await armBuildable(page, 'toilet-brick');
    const toiletAt = centreOf(origin, CELL.x1, CELL.y1);
    log(`toilet at (${CELL.x1},${CELL.y1}): ${JSON.stringify(await press(page, toiletAt.x, toiletAt.y))}`);
    // The dock door is a 3x1 footprint, so the anchor is the westmost of three
    // tiles and all three have to be inside the bay.
    await armBuildable(page, 'loading-dock-door-wooden');
    const doorAt = centreOf(origin, BAY.x0, BAY.y0 + 1);
    log(`dock door anchored at (${BAY.x0},${BAY.y0 + 1}): ${JSON.stringify(await press(page, doorAt.x, doorAt.y))}`);
    await armBuildable(page, 'storage-rack-wooden');
    for (const tile of [
      { x: STORE.x0, y: STORE.y0 + 1 },
      { x: STORE.x0 + 1, y: STORE.y0 + 1 },
    ]) {
      const point = centreOf(origin, tile.x, tile.y);
      log(`rack at (${tile.x},${tile.y}): ${JSON.stringify(await press(page, point.x, point.y))}`);
    }
    log(`band after the placements: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
    log(`queue empty ${await waitForQueueEmpty(page, 300_000)}ms later, tick ${await currentTick(page)}`);
    await page.waitForTimeout(2000);
    await tab(page, 'rooms').click();
    log(`ROOMS PANEL WITH ALL THREE ROOMS FURNISHED:\n${await panelText(page, '.hud-rooms')}`);
    log(`counts: ${JSON.stringify(await latestCounts(page))}`);

    // ---- somebody to carry ---------------------------------------------------
    await tab(page, 'overview').click();
    await page.locator('.hud-intake__admit').click();
    await page.waitForTimeout(3000);
    log(`intake after one admission: ${await panelText(page, '.hud-intake')}`);
    await tab(page, 'regime').click();
    let housed = await readRoster(page);
    for (let attempt = 0; attempt < 30; attempt += 1) {
      housed = await readRoster(page);
      if (housed.rows.length > 0 && housed.rows.every((row) => row.group !== null)) break;
      await page.waitForTimeout(1000);
    }
    log(`roster once classified, tick ${housed.tick}: ${JSON.stringify(housed.rows)}`);
    log(`timetable: ${JSON.stringify(await readTimetable(page))}`);

    // ---- and now a purchase that has to be carried --------------------------
    await tab(page, 'build').click();
    const tickAtPurchase = await currentTick(page);
    const fundsBefore = await money(page);
    await buy(page, 'wall-brick', 20);
    log(`bought 20 bricks at tick ${tickAtPurchase}; funds ${String(fundsBefore)} -> ${String(await money(page))}`);
    log(`deliveries readout: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);
    log(`deliveries data-pending: ${await page.locator('.hud-build__deliveries').getAttribute('data-pending')}`);

    // An order for those bricks to be needed by. A wall segment costs 2
    // bricks, so one segment placed outside every room needs the delivery to
    // have arrived *in the construction container* before it can start.
    await armBuildable(page, 'wall-brick');
    const spare = centreOf(origin, BAY.x1 + 2, BAY.y0);
    log(`a lone wall segment at (${BAY.x1 + 2},${BAY.y0}): ${JSON.stringify(await press(page, spare.x, spare.y))}`);
    log(`queue with the order placed: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);

    await tab(page, 'regime').click();
    const errandSamples: RosterSample[] = [];
    const queueTexts: string[] = [];
    const startedAt = Date.now();
    let firstErrandAt: RosterSample | undefined;
    while (Date.now() - startedAt < 150_000) {
      const sample = await readRoster(page);
      errandSamples.push(sample);
      if (firstErrandAt === undefined && sample.rows.some((row) => /errand/i.test(row.activity))) {
        firstErrandAt = sample;
        log(`FIRST ERRAND at tick ${sample.tick} (${sample.tick - tickAtPurchase} ticks after the purchase), day ${sample.day}: ${JSON.stringify(sample.rows)}`);
      }
      if (errandSamples.length % 25 === 0) {
        await tab(page, 'build').click();
        queueTexts.push(`t=${sample.tick} queue ${(await panelText(page, '.hud-build__queue')).replace(/\n/g, ' | ')}`);
        await tab(page, 'regime').click();
      }
      await page.waitForTimeout(500);
    }

    log(`samples: ${errandSamples.length}; ticks ${errandSamples[0]?.tick} -> ${errandSamples[errandSamples.length - 1]?.tick}`);
    log('=== WHAT THE ROSTER EVER SAID THEY WERE DOING ===');
    const tally = new Map<string, number>();
    for (const sample of errandSamples) for (const row of sample.rows) tally.set(row.activity, (tally.get(row.activity) ?? 0) + 1);
    log(JSON.stringify([...tally.entries()].sort((l, r) => r[1] - l[1])));
    log(
      firstErrandAt === undefined
        ? 'NO ROW EVER READ "Errand" in the whole window. Either no carry was ever selected, or the roster cannot say so.'
        : `An errand reached the roster ${firstErrandAt.tick - tickAtPurchase} ticks after the purchase was pressed.`,
    );
    log('=== WHAT THE BUILD PANEL SAID WHILE IT WAITED ===');
    for (const text of queueTexts) log(`  ${text}`);
    await tab(page, 'build').click();
    log(`final queue: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
    log(`final deliveries: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);
    log(`final deliveries data-pending: ${await page.locator('.hud-build__deliveries').getAttribute('data-pending')}`);
    log(`final funds: ${String(await money(page))}`);
    log(`final counts: ${JSON.stringify(await latestCounts(page))}`);
    log(`alerts list: ${await panelText(page, '.hud-alerts__list')}`);
    log(`refusal band: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
    log('=== TAPE ===');
    let previous = '';
    for (const sample of errandSamples) {
      const line = sample.rows.map((row) => `${row.prisoner}:${row.activity}/${String(row.needId)}@${row.permille}${row.unmet === 'true' ? '!' : ''}`).join('  ');
      if (line === previous) continue;
      previous = line;
      log(`  t=${sample.tick} day=${sample.day} ${line}`);
    }

    expect(errandSamples.length).toBeGreaterThan(20);
  });

  /**
   * Act 3. Save while somebody is mid-routine, reload the page for real, load,
   * and compare the row to the row that was there.
   */
  test('save and reload mid-routine: does the prisoner come back doing what they were doing', async ({ page }) => {
    const log = (line: string): void => {
      console.log(`[reload] ${line}`);
    };

    await installTee(page);
    await openApp(page);
    await buildAndPopulate(page, { beds: 3, admits: 3, guards: 0, label: 'reload' });

    await fastForwardToMax(page);
    await tab(page, 'regime').click();
    // Run until every row names an action rather than the idle word, so the
    // comparison is about a routine and not about an empty state.
    let before = await readRoster(page);
    for (let attempt = 0; attempt < 60; attempt += 1) {
      before = await readRoster(page);
      if (before.rows.length > 0 && before.rows.every((row) => !/^idle$/i.test(row.activity))) break;
      await page.waitForTimeout(1000);
    }
    log(`BEFORE SAVE at tick ${before.tick}, day ${before.day}: ${JSON.stringify(before.rows)}`);
    log(`clock: ${JSON.stringify(await currentClock(page))}`);
    const countsBefore = await latestCounts(page);
    log(`counts: ${JSON.stringify(countsBefore)}`);

    await page.getByRole('button', { name: 'Save now' }).click();
    await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ', { timeout: 60_000 });
    log(`saved: ${JSON.stringify(await panelText(page, '.save-panel__status'))}`);
    const atSave = await readRoster(page);
    log(`AT SAVE, no reload yet, tick ${atSave.tick}: ${JSON.stringify(atSave.rows)}`);

    await installTee(page);
    await openApp(page);
    log('=== RELOADED ===');
    log(`save panel: ${await panelText(page, '.save-panel')}`);
    await page.locator('.save-panel__item').first().click();
    let loaded = await latestCounts(page);
    for (let attempt = 0; attempt < 40 && (loaded === undefined || loaded.prisoners <= 0); attempt += 1) {
      await page.waitForTimeout(1000);
      loaded = await latestCounts(page);
    }
    await page.waitForTimeout(2000);
    await tab(page, 'regime').click();
    const onArrival = await readRoster(page);
    log(`ON LOAD at tick ${onArrival.tick}, day ${onArrival.day}: ${JSON.stringify(onArrival.rows)}`);
    log(`counts: ${JSON.stringify(loaded)}`);
    log(`clock: ${JSON.stringify(await currentClock(page))}`);

    // And then let it run, because a restore that drops everybody to idle is a
    // different finding from one that never re-selects at all.
    const after: RosterSample[] = [];
    for (let attempt = 0; attempt < 40; attempt += 1) {
      after.push(await readRoster(page));
      await page.waitForTimeout(750);
    }
    log('=== THE FIRST THIRTY SECONDS AFTER THE LOAD ===');
    let previous = '';
    for (const sample of after) {
      const line = sample.rows.map((row) => `${row.prisoner}:${row.activity}/${String(row.needId)}@${row.permille}`).join('  ');
      if (line === previous) continue;
      previous = line;
      log(`  t=${sample.tick} day=${sample.day} ${line}`);
    }

    log('=== THE COMPARISON, ROW BY ROW ===');
    log(`before save: ${JSON.stringify(before.rows.map((row) => ({ id: row.prisoner, name: row.name, activity: row.activity, need: row.needId, permille: row.permille })))}`);
    log(`on load:     ${JSON.stringify(onArrival.rows.map((row) => ({ id: row.prisoner, name: row.name, activity: row.activity, need: row.needId, permille: row.permille })))}`);
    const settled = after[after.length - 1]!;
    log(`30s later:   ${JSON.stringify(settled.rows.map((row) => ({ id: row.prisoner, name: row.name, activity: row.activity, need: row.needId, permille: row.permille })))}`);
    for (const row of before.rows) {
      const same = onArrival.rows.find((candidate) => candidate.prisoner === row.prisoner);
      const later = settled.rows.find((candidate) => candidate.prisoner === row.prisoner);
      log(
        `  ${row.prisoner} (${row.name}): ${row.activity} / ${String(row.needId)}@${row.permille}`
          + ` -> on load ${same === undefined ? 'NOT ON THE ROSTER' : `${same.activity} / ${String(same.needId)}@${same.permille}`}`
          + ` -> 30s later ${later === undefined ? 'NOT ON THE ROSTER' : `${later.activity} / ${String(later.needId)}@${later.permille}`}`,
      );
    }

    expect(before.rows.length).toBeGreaterThan(0);
  });
});
