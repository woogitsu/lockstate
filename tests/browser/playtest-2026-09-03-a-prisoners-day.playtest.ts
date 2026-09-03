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
  const tick = await currentTick(page);
  const day = (await panelText(page, '.hud-clock__day')).trim();
  const block = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('.hud-regime__roster');
    if (root === null) return null;
    const text = (node: Element | null): string => (node instanceof HTMLElement ? (node.innerText ?? '').replace(/\s+/g, ' ').trim() : '');
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
      hidden: root.hidden,
      total: root.dataset['total'] ?? null,
      everAdmitted: root.dataset['everAdmitted'] ?? null,
      countText: text(root.querySelector('.hud-regime__roster-count')),
      moreText: text(root.querySelector('.hud-regime__roster-more')),
      rows,
    };
  });
  if (block === null || block.hidden) {
    return { at, tick, day, total: null, everAdmitted: null, countText: 'ROSTER BLOCK ABSENT OR HIDDEN', moreText: '', rows: [] };
  }
  return { at, tick, day, total: block.total, everAdmitted: block.everAdmitted, countText: block.countText, moreText: block.moreText, rows: block.rows };
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
      // The slope, fitted only over the stretch where one need stayed worst,
      // so a hand-off between two needs cannot be read as a rate.
      for (const needId of needIds) {
        const forNeed = series.filter((point) => point.needId === needId);
        if (forNeed.length < 5 || needId === null) continue;
        const measured = slope(forNeed);
        const predicted = predictedSlope(DECAY_PER_TICK[needId] ?? Number.NaN);
        log(
          `  ${needId}: measured ${measured.toFixed(4)} permille/tick over ${forNeed.length} samples`
            + ` (${forNeed[0]!.tick} -> ${forNeed[forNeed.length - 1]!.tick});`
            + ` unopposed decay predicts ${predicted.toFixed(4)};`
            + ` ratio ${(measured / predicted).toFixed(3)}`,
        );
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

    expect(samples.length).toBeGreaterThan(50);
    expect(prisoners.length).toBeGreaterThan(0);
  });

  /**
   * Act 2. ADR 0093's errand, driven with the mouse for the first time.
   *
   * The layout, and why these tiles: `calibrate` puts tile (0,0) at
   * `(-304, -574)` on this build, so the visible tile band in a 1440x900
   * viewport is x in 5..27 and y in 9..23. The cell is `buildAndPopulate`'s
   * (12,12)-(17,17); the delivery bay is (6,12)-(9,15), which is the catalogue
   * minimum 4x4; the storeroom is (20,12)-(22,14), the catalogue minimum 3x3.
   * All three are inside that band.
   */
  test('the errand: a delivery that has to be carried', async ({ page }) => {
    const log = (line: string): void => {
      console.log(`[errand] ${line}`);
    };

    await installTee(page);
    await openApp(page);
    const origin = await buildAndPopulate(page, { beds: 2, admits: 2, guards: 0, label: 'errand' });
    log(`origin ${JSON.stringify(origin)}`);
    log(`funds after the cell: ${String(await money(page))}`);

    // ---- materials for the two logistics rooms -----------------------------
    // 16 wall segments for the bay + 12 for the storeroom = 28 segments = 56
    // bricks. 3 planks for the dock door, 2 for the racks. Bought generously,
    // and while the route is still inactive, so these land directly.
    await tab(page, 'build').click();
    await buy(page, 'wall-brick', 70);
    log(`buy rows available: ${JSON.stringify(await page.locator('.hud-build__list [data-buildable]').evaluateAll((nodes) => nodes.map((n) => (n as HTMLElement).dataset['buildable'])))}`);
    // The Buy fold buys the *selected buildable's* material
    // (`build-panel.ts`'s `onPurchase({ itemId: material.itemId, quantity })`),
    // so the planks the door and the racks need are bought through their own
    // rows. Both are `item.wood-plank`; 4 each is 8 against the 5 they consume.
    await buy(page, 'loading-dock-door-wooden', 4);
    await buy(page, 'storage-rack-wooden', 4);
    log(`funds after buying: ${String(await money(page))}`);
    log(`deliveries: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);
    await page.waitForTimeout(4000);

    // ---- the bay ------------------------------------------------------------
    await walls(page, origin, 6, 12, 9, 15, log);
    await walls(page, origin, 20, 12, 22, 14, log);
    log(`queue right after the wall runs: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
    const emptied = await waitForQueueEmpty(page, 300_000);
    log(`queue empty ${emptied}ms after the runs, tick ${await currentTick(page)}`);

    const bayAttempts = await zoneRoom(page, origin, 'room.delivery-bay', { x: 6, y: 12 }, { x: 9, y: 15 }, log);
    const storeAttempts = await zoneRoom(page, origin, 'room.storage-room', { x: 20, y: 12 }, { x: 22, y: 14 }, log);
    log(`bay zoned after ${bayAttempts} attempt(s); storeroom after ${storeAttempts}`);
    log(`rooms panel: ${await panelText(page, '.hud-rooms')}`);
    if (bayAttempts < 0 || storeAttempts < 0) {
      log('COULD NOT ZONE ONE OF THE TWO LOGISTICS ROOMS. That is this run’s finding rather than a step to work around.');
      log(`counts: ${JSON.stringify(await latestCounts(page))}`);
      return;
    }

    // ---- furnish both ends, which is what arms the route -------------------
    await tab(page, 'build').click();
    await armBuildable(page, 'loading-dock-door-wooden');
    const doorAt = centreOf(origin, 6, 13);
    log(`dock door at tile (6,13) -> screen ${JSON.stringify(doorAt)}: ${JSON.stringify(await press(page, doorAt.x, doorAt.y))}`);
    log(`band after the door: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
    await armBuildable(page, 'storage-rack-wooden');
    for (const tile of [
      { x: 20, y: 13 },
      { x: 21, y: 13 },
    ]) {
      const point = centreOf(origin, tile.x, tile.y);
      log(`rack at (${tile.x},${tile.y}): ${JSON.stringify(await press(page, point.x, point.y))}`);
    }
    log(`band after the racks: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
    await waitForQueueEmpty(page, 240_000);
    await page.waitForTimeout(2000);
    await tab(page, 'rooms').click();
    log(`rooms panel with both ends furnished: ${await panelText(page, '.hud-rooms')}`);

    // ---- and now a purchase that has to be carried -------------------------
    await tab(page, 'build').click();
    const fundsBefore = await money(page);
    const tickAtPurchase = await currentTick(page);
    await buy(page, 'wall-brick', 20);
    log(`bought 20 bricks at tick ${tickAtPurchase}; funds ${String(fundsBefore)} -> ${String(await money(page))}`);
    log(`deliveries readout: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);
    log(`pending attribute: ${await page.locator('.hud-build__deliveries').getAttribute('data-pending')}`);

    // A build order for the bricks to be needed by, placed inside the cell so
    // it cannot be refused for want of a room.
    await armBuildable(page, 'toilet-brick');
    const orderAt = centreOf(origin, 16, 16);
    log(`toilet order at (16,16): ${JSON.stringify(await press(page, orderAt.x, orderAt.y))}`);

    await tab(page, 'regime').click();
    const errandSamples: RosterSample[] = [];
    const queueTexts: string[] = [];
    const startedAt = Date.now();
    let firstErrandAt: RosterSample | undefined;
    while (Date.now() - startedAt < 170_000) {
      const sample = await readRoster(page);
      errandSamples.push(sample);
      if (firstErrandAt === undefined && sample.rows.some((row) => /errand/i.test(row.activity))) {
        firstErrandAt = sample;
        log(`FIRST ERRAND at tick ${sample.tick}, day ${sample.day}: ${JSON.stringify(sample.rows)}`);
      }
      if (errandSamples.length % 12 === 0) {
        await tab(page, 'build').click();
        const queue = await panelText(page, '.hud-build__queue');
        queueTexts.push(`t=${sample.tick} ${queue.replace(/\n/g, ' | ')}`);
        await tab(page, 'regime').click();
      }
      await page.waitForTimeout(700);
    }

    log(`samples: ${errandSamples.length}; ticks ${errandSamples[0]?.tick} -> ${errandSamples[errandSamples.length - 1]?.tick}`);
    log('=== WHAT THE ROSTER EVER SAID THEY WERE DOING ===');
    const tally = new Map<string, number>();
    for (const sample of errandSamples) for (const row of sample.rows) tally.set(row.activity, (tally.get(row.activity) ?? 0) + 1);
    log(JSON.stringify([...tally.entries()].sort((l, r) => r[1] - l[1])));
    log(
      firstErrandAt === undefined
        ? 'NO ROW EVER READ "Errand" in the whole window. Either no carry was selected, or the roster cannot say so.'
        : `An errand was on the roster from tick ${firstErrandAt.tick}.`,
    );
    log('=== WHAT THE BUILD PANEL SAID WHILE IT WAITED ===');
    for (const text of queueTexts) log(`  ${text}`);
    log(`final queue: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
    log(`final deliveries: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);
    log(`final funds: ${String(await money(page))}`);
    log(`final counts: ${JSON.stringify(await latestCounts(page))}`);
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
