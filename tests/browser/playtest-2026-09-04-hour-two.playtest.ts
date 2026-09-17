import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  armBuildable,
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
  reportBoundary,
  sentCommands,
  tab,
  TILE,
  waitForQueueEmpty,
  type CountsSample,
} from './playtest-harness';

/**
 * **Hour two.** Nearly every playtest in this directory stops around the first
 * prisoner. This one starts there: a prison grown past the tutorial — more
 * beds, more residents, more staff, a second room — and run across several
 * in-game *days* rather than several ticks.
 *
 * The question, as given: *the player has a working cell, a housed prisoner
 * and money coming in — what does the next hour of play consist of, and is
 * there anything in it?*
 *
 * NOT A GATE. `tests/browser/playwright.config.ts` is
 * `testMatch: /.*\.spec\.ts$/`, so nothing in CI collects this file.
 * `tests/browser/playwright.playtest.config.ts` is the one that does:
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5313 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-2026-09-04-hour-two.playtest.ts -g "act 1"
 * ```
 *
 * ## Rules this instrument was written under
 *
 * 1. **No claim rests on wall clock.** Every duration is reported in
 *    simulation ticks, read from `simulation/clock-state` (published every
 *    tick, unlike `simulation/status-counts`, which the worker deduplicates).
 *    Wall clock appears only as an aside; five testers share this box.
 * 2. **Every world press is proved to land, twice over.** A press on a point
 *    the HUD covers submits nothing at all — no command, no refusal, no
 *    message — and has cost this repository three withdrawn findings. So
 *    `topAt` reads `document.elementFromPoint` at every world point before it
 *    is pressed, *and* the commands the press produced are counted through the
 *    tee. The count is the stronger of the two and is what a claim rests on:
 *    a drag that started on the HUD produces nothing, and the count says so
 *    where a thrown assertion would only lose the act. `hudObstacles` reports
 *    the HUD's pointer-taking rectangles once, so "how much of the world a
 *    mouse can reach at 1440×900" is a fact rather than a surprise.
 * 3. **The two channels are kept apart.** Sentences come from
 *    `.hud`'s `innerText` — what a player can actually read. Numbers come from
 *    the worker through the tee. Nothing below lets one stand in for the other.
 * 4. **A run has a budget, and a budget is not a failure.** `runToTickOrBudget`
 *    never throws: it returns the tick it actually reached, and every
 *    measurement downstream is stated against that tick. An act that runs out
 *    of wall clock on a loaded box still reports the days it did reach.
 */

const DAY_LENGTH_TICKS = 2_400;

/** What is on top at a screen point, as a short description. */
async function topAt(page: Page, x: number, y: number): Promise<string> {
  return page.evaluate(
    ([px, py]) => {
      const element = document.elementFromPoint(px as number, py as number);
      if (element === null) return 'nothing';
      const className = typeof element.className === 'string' ? element.className : '';
      return `${element.tagName.toLowerCase()}${className === '' ? '' : `.${className.split(/\s+/)[0]}`}`;
    },
    [x, y],
  );
}

/**
 * Every laid-out part of the HUD that takes the pointer, with its rectangle —
 * i.e. the parts of the world a mouse cannot reach without panning first.
 *
 * Added because act 3's first run failed its own guard: the south wall of a
 * cell one tile further west than the harness's starts at screen (240,578),
 * and something in the HUD is on top of that point. One evaluate answers what
 * a two-hundred-press sweep would.
 */
async function hudObstacles(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => {
    const lines: string[] = [];
    for (const node of Array.from(document.querySelectorAll<HTMLElement>('.hud, .hud *'))) {
      if (node.hidden) continue;
      const rects = node.getClientRects();
      if (rects.length === 0) continue;
      if (getComputedStyle(node).pointerEvents === 'none') continue;
      const parent = node.parentElement;
      if (parent !== null && parent.closest('.hud') !== null && getComputedStyle(parent).pointerEvents !== 'none') continue;
      const rect = node.getBoundingClientRect();
      const className = typeof node.className === 'string' ? node.className.split(/\s+/)[0] : '?';
      lines.push(
        `${className} x ${Math.round(rect.left)}..${Math.round(rect.right)} y ${Math.round(rect.top)}..${Math.round(rect.bottom)}`,
      );
    }
    return lines;
  });
}

/** The whole laid-out HUD, which is exactly what a player can read. */
async function screen(page: Page): Promise<string> {
  return page.evaluate(() => {
    const hud = document.querySelector<HTMLElement>('.hud');
    return hud === null ? 'NO .hud' : (hud.innerText ?? '').replace(/\n{2,}/g, '\n').trim();
  });
}

/**
 * Runs the clock forward until the worker reports `target`, or the budget runs
 * out — and **never throws**. Answers the tick actually reached.
 */
async function runToTickOrBudget(page: Page, target: number, budgetMs: number, onSample?: (tick: number) => Promise<void>): Promise<number> {
  const started = Date.now();
  let lastSampleAt = 0;
  for (;;) {
    const tick = await currentTick(page);
    if (tick >= target) return tick;
    if (Date.now() - started > budgetMs) return tick;
    if (onSample !== undefined && Date.now() - lastSampleAt > 25_000) {
      lastSampleAt = Date.now();
      await onSample(tick);
    }
    await page.waitForTimeout(1_000);
  }
}

/** Every scroll container that is currently hiding some of its own content. */
async function hiddenByFolds(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => {
    const lines: string[] = [];
    for (const node of Array.from(document.querySelectorAll<HTMLElement>('.hud *'))) {
      if (node.hidden || node.getClientRects().length === 0) continue;
      const style = getComputedStyle(node);
      if (!/auto|scroll/.test(style.overflowY)) continue;
      const hidden = node.scrollHeight - node.clientHeight;
      if (hidden <= 1) continue;
      const className = typeof node.className === 'string' ? node.className.split(/\s+/)[0] : '?';
      lines.push(`${className} hides ${hidden}px of ${node.scrollHeight}px (${Math.round((hidden / node.scrollHeight) * 100)}%)`);
    }
    return lines;
  });
}

/** How many rows each of the growing lists holds, straight off the DOM. */
async function listSizes(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const count = (selector: string): number => document.querySelectorAll(selector).length;
    return {
      alertRows: count('.hud-alerts__list > *'),
      rosterRows: count('.hud-regime__roster-row'),
      blockRows: count('.hud-regime__block-row'),
      staffHeldRows: count('.hud-staff__held-row'),
      queueRows: count('.hud-build__queue-row'),
      deliveryRows: count('.hud-build__delivery-row'),
      roomRows: count('.hud-rooms__rows > *'),
      hudNodes: count('.hud *'),
    };
  });
}

/** One compact reading of the things a player is tracking. */
interface Probe {
  readonly tick: number;
  readonly day: string;
  readonly strip: string;
  readonly event: string;
  readonly alerts: string;
  readonly counts: CountsSample | undefined;
}

async function probe(page: Page): Promise<Probe> {
  return {
    tick: await currentTick(page),
    day: (await panelText(page, '.hud-clock__day')).trim(),
    strip: (await panelText(page, '.hud-strip__metrics')).replace(/\n/g, ' | '),
    event: (await panelText(page, '.hud-event__text')).replace(/\n/g, ' '),
    alerts: (await panelText(page, '.hud-alerts__list')).replace(/\n/g, ' / '),
    counts: await latestCounts(page),
  };
}

interface GrownPrison {
  readonly origin: { originX: number; originY: number };
  readonly bedsPlaced: number;
  readonly bedsSkipped: readonly string[];
}

/**
 * Polls the Build panel's queue readout exactly as `waitForQueueEmpty` does —
 * the `(?<![0-9])` anchor and the `not laid out` clause are that function's and
 * are load-bearing — but **logs the tick beside every reading**, so the drain
 * itself is a measurement rather than a wait.
 *
 * This is why act 4 needs no separate throughput act: the number a player feels
 * ("how long does one more room take?") falls out of a poll the build was going
 * to do anyway.
 */
async function drainQueueLogging(page: Page, label: string, what: string, timeoutMs = 240_000): Promise<void> {
  const started = Date.now();
  await tab(page, 'build').click();
  const firstTick = await currentTick(page);
  let lastText = '';
  for (;;) {
    const text = (await panelText(page, '.hud-build__queue')).replace(/\n/g, ' ');
    const tick = await currentTick(page);
    if (text !== lastText) {
      console.log(`[${label}] queue(${what}) tick ${tick} (+${tick - firstTick}): ${JSON.stringify(text)}`);
      lastText = text;
    }
    if (/(?<![0-9])0 waiting . 0 being built/.test(text) || text.includes('not laid out') || text.includes('ABSENT')) {
      console.log(`[${label}] queue(${what}) EMPTY at tick ${tick}, ${tick - firstTick} ticks after the first poll`);
      return;
    }
    if (Date.now() - started > timeoutMs) throw new Error(`the build queue never emptied: ${text}`);
    await page.waitForTimeout(1_000);
  }
}

/**
 * Builds a prison **bigger than the tutorial one**: the same enclosed 6×6 cell
 * at (12,12)-(17,17) `buildAndPopulate` builds, but filled with beds on the
 * rows the caller names rather than the harness's fixed two, then populated and
 * staffed.
 *
 * A local builder rather than `buildAndPopulate`, and the reason is one line of
 * it: its bed loop walks `for (const row of [12, 14]) for (column = 12..17)`
 * and so places **at most twelve** beds however many are asked for — which caps
 * `roomCapacity` at twelve and makes a 20-30 resident prison unreachable
 * through the shared helper. Everything else here is that function's shape,
 * kept deliberately close so the two can be compared.
 *
 * **`bedRows` exists because act 1 measured what happens without it.** Asked
 * for beds on rows 12, 13, 15 and 16 it placed 24 orders, every one of which
 * produced a command, and `roomCapacity` came out **12**: `object.bed`'s
 * footprint is `{ width: 1, height: 2 }` (`src/content/object-catalog.ts:97`),
 * so a bed on row 12 owns row 13 as well and the row-13 order finishes onto an
 * occupied tile. Rows two apart are therefore the only rows that all land.
 */
async function buildGrownPrison(
  page: Page,
  options: {
    readonly label: string;
    readonly beds: number;
    readonly admits: number;
    readonly guards: number;
    readonly bedRows?: readonly number[];
    readonly toiletTile?: { readonly x: number; readonly y: number };
    readonly logQueue?: boolean;
    /** The zoned rectangle, inclusive. Defaults to the harness's 6x6 at (12,12)-(17,17). */
    readonly cell?: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number };
    readonly bricks?: number;
  },
): Promise<GrownPrison> {
  const log = (line: string): void => console.log(`[${options.label}] ${line}`);

  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');

  await tab(page, 'build').click();
  const origin = await calibrate(page);
  log(`calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);

  const cell = options.cell ?? { x0: 12, y0: 12, x1: 17, y1: 17 };
  await buy(page, 'wall-brick', options.bricks ?? 60);
  await buy(page, 'bed-wooden', options.beds + 2);
  log(`after buying: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);

  await fastForwardToMax(page);
  await page.waitForTimeout(2_500);
  log(`clock: ${JSON.stringify(await currentClock(page))} at tick ${await currentTick(page)}`);

  await armBuildable(page, 'wall-brick');
  const westX = origin.originX + cell.x0 * TILE;
  const eastX = origin.originX + (cell.x1 + 1) * TILE;
  const northY = origin.originY + cell.y0 * TILE;
  const southY = origin.originY + (cell.y1 + 1) * TILE;
  for (const run of [
    { name: 'north', a: { x: westX + TILE / 2, y: northY }, b: { x: eastX - TILE / 2, y: northY } },
    { name: 'south', a: { x: westX + TILE / 2, y: southY }, b: { x: eastX - TILE / 2, y: southY } },
    { name: 'west', a: { x: westX, y: northY + TILE / 2 }, b: { x: westX, y: southY - TILE / 2 } },
    { name: 'east', a: { x: eastX, y: northY + TILE / 2 }, b: { x: eastX, y: southY - TILE / 2 } },
  ]) {
    /*
     * Both endpoints are read rather than asserted, and the *command count* is
     * what proves the drag landed — which is a stronger proof than
     * `elementFromPoint`, because a run that started on the HUD produces
     * nothing at all and the count says so. Act 3's first run died on the
     * assertion instead of reporting it, which lost the whole act.
     */
    const topStart = await topAt(page, run.a.x, run.a.y);
    const topEnd = await topAt(page, run.b.x, run.b.y);
    const before = (await sentCommands(page)).length;
    await drag(page, run.a, run.b);
    const produced = (await sentCommands(page)).slice(before);
    const expected = run.name === 'north' || run.name === 'south' ? cell.x1 - cell.x0 + 1 : cell.y1 - cell.y0 + 1;
    log(
      `wall run ${run.name}: ${produced.length} of ${expected} expected command(s)` +
        ` | start (${run.a.x},${run.a.y}) is ${topStart} | end (${run.b.x},${run.b.y}) is ${topEnd}`,
    );
    if (produced.length !== expected) log(`wall run ${run.name} DID NOT FULLY LAND — the perimeter will not enclose`);
  }

  const wallSegments = 2 * (cell.x1 - cell.x0 + 1) + 2 * (cell.y1 - cell.y0 + 1);
  if (options.logQueue === true) await drainQueueLogging(page, options.label, `the ${wallSegments} wall segments`);
  else await waitForQueueEmpty(page);
  log(`walls up at tick ${await currentTick(page)}`);

  const zoneStarted = Date.now();
  let attempts = 0;
  for (;;) {
    attempts += 1;
    await tab(page, 'zones').click();
    const collapsed = await page.locator('.hud-rooms').getAttribute('data-collapsed');
    if (collapsed === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
    await page.locator('.hud-rooms__arm').click();
    await drag(page, centreOf(origin, cell.x0, cell.y0), centreOf(origin, cell.x1, cell.y1));
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(800);
    const counts = await latestCounts(page);
    log(`designate attempt ${attempts} at tick ${await currentTick(page)}: rooms=${counts?.rooms}`);
    if ((counts?.rooms ?? 0) > 0) break;
    if (attempts >= 10) throw new Error('the rectangle was never accepted as a room');
    await page.waitForTimeout(4_000);
  }
  log(`zoned after ${attempts} attempt(s), ${Date.now() - zoneStarted}ms`);

  // Beds on four of the six rows, leaving rows 14 and 17 as floor. Every tile
  // is checked before it is pressed, and a covered one is skipped rather than
  // pressed into the HUD.
  await tab(page, 'build').click();
  await armBuildable(page, 'bed-wooden');
  let placed = 0;
  const skipped: string[] = [];
  for (const row of options.bedRows ?? [12, 13, 15, 16]) {
    for (let column = cell.x0; column <= cell.x1 && placed < options.beds; column += 1) {
      const point = centreOf(origin, column, row);
      const top = await topAt(page, point.x, point.y);
      if (!top.includes('canvas')) {
        skipped.push(`(${column},${row}) covered by ${top}`);
        continue;
      }
      const commands = await press(page, point.x, point.y);
      if (commands.length === 0) skipped.push(`(${column},${row}) clear canvas but produced NO command`);
      else placed += 1;
    }
  }
  await armBuildable(page, 'toilet-brick');
  const toilet = options.toiletTile ?? { x: 12, y: 14 };
  const toiletPoint = centreOf(origin, toilet.x, toilet.y);
  const toiletTop = await topAt(page, toiletPoint.x, toiletPoint.y);
  const toiletCommands = await press(page, toiletPoint.x, toiletPoint.y);
  log(`toilet at (${toilet.x},${toilet.y}) screen (${toiletPoint.x},${toiletPoint.y}) is ${toiletTop}: ${toiletCommands.length} command(s)`);
  log(`${placed} bed order(s) placed, ${skipped.length} tile(s) skipped: ${JSON.stringify(skipped)}`);

  if (options.logQueue === true) await drainQueueLogging(page, options.label, `${placed} beds and a toilet`);
  else await waitForQueueEmpty(page);
  await page.waitForTimeout(1_500);
  const built = await latestCounts(page);
  log(`furnished at tick ${built?.tick}: rooms=${built?.rooms} roomCapacity=${built?.roomCapacity} accommodationCapacity=${built?.accommodationCapacity}`);

  /*
   * Counted through the tee, not assumed. Act 4 pressed Admit twenty-five
   * times into a seventeen-bed prison and the roster settled at seventeen,
   * which is either eight commands that were never submitted or eight
   * admissions the simulation dropped -- and those are different findings.
   * The count below separates them.
   */
  await tab(page, 'overview').click();
  const admitCommandsBefore = (await sentCommands(page)).filter((c) => c['type'] === 'AdmitPrisoner').length;
  let admitPressesThatThrew = 0;
  for (let index = 0; index < options.admits; index += 1) {
    try {
      await page.locator('.hud-intake__admit').click({ timeout: 5_000 });
    } catch {
      admitPressesThatThrew += 1;
    }
    await page.waitForTimeout(120);
  }
  const admitCommandsAfter = (await sentCommands(page)).filter((c) => c['type'] === 'AdmitPrisoner').length;
  log(
    `${options.admits} Admit press(es): ${admitCommandsAfter - admitCommandsBefore} AdmitPrisoner command(s) reached the worker,` +
      ` ${admitPressesThatThrew} press(es) threw, control aria-disabled=${await page.locator('.hud-intake__admit').getAttribute('aria-disabled')}`,
  );
  log(`refusal band right after admitting: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
  await page.waitForTimeout(2_000);
  const admitted = await latestCounts(page);
  log(`after ${options.admits} admissions at tick ${admitted?.tick}: prisoners=${admitted?.prisoners} inIntake=${admitted?.prisonersInIntake} residents=${admitted?.roomOccupants}`);
  log(`intake panel: ${(await panelText(page, '.hud-intake')).replace(/\n/g, ' / ')}`);

  if (options.guards > 0) {
    await tab(page, 'manage').click();
    const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
    if ((await guardRow.count()) > 0) await guardRow.first().click();
    log(`hire control reads: ${JSON.stringify((await page.locator('.hud-staff__hire').innerText()).trim())}`);
    for (let index = 0; index < options.guards; index += 1) {
      await page.locator('.hud-staff__hire').click();
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(1_500);
    const hired = await latestCounts(page);
    log(`after hiring ${options.guards}: staff=${hired?.staff} wageBill=${hired?.dailyWageBillMinorUnits} funds=${hired?.treasuryMinorUnits}`);
    log(`staff panel: ${(await panelText(page, '.hud-staff')).replace(/\n/g, ' / ')}`);
  }

  return { origin, bedsPlaced: placed, bedsSkipped: skipped };
}

/** Every day boundary the series crossed, with what the treasury did at it. */
function reportEveryBoundary(label: string, series: readonly CountsSample[]): void {
  if (series.length === 0) return;
  const lastTick = series[series.length - 1]?.tick ?? 0;
  console.log(`[${label}] --- per-day ledger, ${series.length} published samples, last tick ${lastTick} ---`);
  for (let day = 1; day * DAY_LENGTH_TICKS <= lastTick; day += 1) {
    const boundary = day * DAY_LENGTH_TICKS;
    const before = [...series].filter((s) => s.tick < boundary).pop();
    const after = series.find((s) => s.tick >= boundary);
    if (before === undefined || after === undefined) continue;
    console.log(
      `[${label}] boundary ${boundary} (end of day ${day}): treasury ${before.treasuryMinorUnits} -> ${after.treasuryMinorUnits}` +
        ` (delta ${after.treasuryMinorUnits - before.treasuryMinorUnits})` +
        ` | accrual before ${before.stateIncomeAccruedTodayMinorUnits}` +
        ` | roster ${after.prisoners} residents ${after.roomOccupants} intake ${after.prisonersInIntake}` +
        ` | staff ${after.staff} wageBill ${after.dailyWageBillMinorUnits} unpaid ${after.unpaidWagesMinorUnits}` +
        ` | highRisk ${after.prisonersHighRisk}`,
    );
  }
}

test.describe('Hour two — the prison after the first prisoner', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', (message) => {
      const text = message.text();
      if (/HostRefusalError|Failed to|InvalidStateError/.test(text)) console.log(`[page-console] ${text}`);
    });
    await installTee(page);
    await openApp(page);
  });

  /**
   * **act 0 — how much of a 6×6 cell can a 1440×900 pointer even reach?**
   *
   * Cheap, and it is the precondition for every press in acts 1-3: if the HUD
   * covers the east half of the cell the harness builds in, then a "24-bed
   * prison" is not something a mouse can build at this viewport, and every
   * later act has to say so rather than discover it silently.
   */
  test('act 0 — the reachable floor of the tutorial cell', async ({ page }) => {
    await page.getByRole('button', { name: 'New prison' }).click();
    await tab(page, 'build').click();
    const origin = await calibrate(page);
    console.log(`[act0] calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);

    const covered: string[] = [];
    const clear: string[] = [];
    for (let row = 12; row <= 18; row += 1) {
      const line: string[] = [];
      for (let column = 12; column <= 18; column += 1) {
        const point = centreOf(origin, column, row);
        const top = await topAt(page, point.x, point.y);
        const ok = top.includes('canvas');
        line.push(ok ? '.' : 'X');
        if (ok) clear.push(`${column},${row}`);
        else covered.push(`${column},${row} -> ${top}`);
      }
      console.log(`[act0] row ${row}: ${line.join('')}`);
    }
    console.log(`[act0] clear tiles ${clear.length}, covered ${covered.length}`);
    console.log(`[act0] covered detail: ${JSON.stringify(covered)}`);
    console.log(`[act0] viewport ${JSON.stringify(page.viewportSize())}`);
  });

  /**
   * **act 1 — a grown prison, run for as many in-game days as the budget
   * allows.** 24 beds, 24 admissions, 6 guards, and then nothing pressed at
   * all: the run is deliberately hands-off after the build, so that what
   * happens is what the *game* does rather than what the tester does.
   *
   * It answers all three halves of the question at once — the per-day ledger
   * (does the economy stay coherent), the sampled screen (does anything arrive
   * that needs answering), and the list sizes (does anything grow without
   * bound).
   */
  test('act 1 — twenty-four residents, ten days, hands off', async ({ page }) => {
    const built = await buildGrownPrison(page, { label: 'act1', beds: 24, admits: 24, guards: 6 });
    const start = await probe(page);
    console.log(`[act1] AT THE START OF THE RUN tick=${start.tick} day=${start.day}`);
    console.log(`[act1] strip: ${start.strip}`);
    console.log(`[act1] counts: ${JSON.stringify(start.counts)}`);
    console.log(`[act1] lists: ${JSON.stringify(await listSizes(page))}`);
    console.log(`[act1] beds placed ${built.bedsPlaced}, skipped ${built.bedsSkipped.length}`);

    const reached = await runToTickOrBudget(page, 26_400, 300_000, async () => {
      const sample = await probe(page);
      console.log(
        `[act1] t=${sample.tick} day=${sample.day} | ${sample.strip}` +
          ` | event="${sample.event}" | lists=${JSON.stringify(await listSizes(page))}`,
      );
    });
    console.log(`[act1] the run stopped at tick ${reached} (${(reached / DAY_LENGTH_TICKS).toFixed(2)} in-game days)`);

    const series = await countsSeries(page);
    reportEveryBoundary('act1', series);

    const end = await probe(page);
    console.log(`[act1] FINAL strip: ${end.strip}`);
    console.log(`[act1] FINAL counts: ${JSON.stringify(end.counts)}`);
    console.log(`[act1] FINAL event band: "${end.event}"`);
    console.log(`[act1] FINAL alerts list: ${end.alerts}`);
    console.log(`[act1] FINAL lists: ${JSON.stringify(await listSizes(page))}`);
    console.log(`[act1] FINAL folds hiding content: ${JSON.stringify(await hiddenByFolds(page))}`);
    console.log(`[act1] FINAL refusal band: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);

    for (const id of ['overview', 'build', 'zones', 'manage', 'day-plan'] as const) {
      await tab(page, id).click();
      await page.waitForTimeout(400);
      console.log(`[act1] FINAL ${id} tab, whole HUD:\n${await screen(page)}`);
    }
  });

  /**
   * **act 2 — one resident, then twenty-four: what does the game ask?**
   *
   * The same prison twice over, in one session. First a single admission into
   * a 24-bed cell, run a day; then twenty-three more, run a day. Both states
   * are dumped whole — every laid-out sentence and every enabled control — so
   * the difference between a tutorial prison and a grown one can be *read*
   * rather than asserted.
   */
  test('act 2 — from one resident to twenty-four, what changes on screen', async ({ page }) => {
    const inventory = async (): Promise<string> =>
      page.evaluate(() => {
        const controls = Array.from(document.querySelectorAll<HTMLElement>('.hud button, .hud input, .hud [role="button"]'))
          .filter((node) => !node.hidden && node.getClientRects().length > 0)
          .map((node) => {
            const disabled = node.getAttribute('aria-disabled') === 'true' || (node as HTMLButtonElement).disabled === true;
            return `${(node.innerText ?? '').trim().replace(/\n/g, ' ') || node.getAttribute('aria-label') || node.tagName}${disabled ? ' [disabled]' : ''}`;
          });
        return JSON.stringify(controls);
      });

    const built = await buildGrownPrison(page, {
      label: 'act2',
      beds: 17,
      bedRows: [12, 14, 16],
      toiletTile: { x: 17, y: 16 },
      admits: 1,
      guards: 2,
    });
    console.log(`[act2] beds placed ${built.bedsPlaced}`);
    await runToTickOrBudget(page, (await currentTick(page)) + DAY_LENGTH_TICKS, 90_000);
    const smallTick = await currentTick(page);
    console.log(`[act2] ONE RESIDENT at tick ${smallTick}: ${JSON.stringify(await latestCounts(page))}`);
    const smallScreens: Record<string, string> = {};
    for (const id of ['overview', 'build', 'zones', 'manage', 'day-plan'] as const) {
      await tab(page, id).click();
      await page.waitForTimeout(350);
      smallScreens[id] = await screen(page);
      console.log(`[act2] ONE RESIDENT ${id} tab:\n${smallScreens[id]}`);
    }
    console.log(`[act2] ONE RESIDENT controls: ${await inventory()}`);
    console.log(`[act2] ONE RESIDENT lists: ${JSON.stringify(await listSizes(page))}`);

    await tab(page, 'overview').click();
    for (let index = 0; index < 23; index += 1) {
      await page.locator('.hud-intake__admit').click();
      await page.waitForTimeout(120);
    }
    await runToTickOrBudget(page, (await currentTick(page)) + DAY_LENGTH_TICKS, 90_000);
    const bigTick = await currentTick(page);
    console.log(`[act2] TWENTY-FOUR RESIDENTS at tick ${bigTick}: ${JSON.stringify(await latestCounts(page))}`);
    for (const id of ['overview', 'build', 'zones', 'manage', 'day-plan'] as const) {
      await tab(page, id).click();
      await page.waitForTimeout(350);
      const big = await screen(page);
      console.log(`[act2] TWENTY-FOUR ${id} tab:\n${big}`);
      const smallLines = new Set((smallScreens[id] ?? '').split('\n'));
      const added = big.split('\n').filter((line) => !smallLines.has(line));
      console.log(`[act2] ${id}: ${added.length} line(s) present at 24 residents and absent at 1: ${JSON.stringify(added)}`);
    }
    console.log(`[act2] TWENTY-FOUR controls: ${await inventory()}`);
    console.log(`[act2] TWENTY-FOUR lists: ${JSON.stringify(await listSizes(page))}`);
    console.log(`[act2] TWENTY-FOUR folds: ${JSON.stringify(await hiddenByFolds(page))}`);
  });

  /**
   * **act 3 — a prison at the top of the brief's range.** A 10x6 cell, 29 beds
   * that all actually land, 29 admissions and five guards, with the build queue
   * logged tick by tick so that "how long does one more room take?" is a
   * number rather than an impression.
   */
  test('act 3 — twenty-two residents in an eight-by-six cell', async ({ page }) => {
    console.log(`[act3] HUD parts that take the pointer: ${JSON.stringify(await hudObstacles(page))}`);
    const built = await buildGrownPrison(page, {
      label: 'act3',
      cell: { x0: 12, y0: 12, x1: 19, y1: 17 },
      bricks: 70,
      beds: 22,
      bedRows: [12, 14, 16],
      toiletTile: { x: 18, y: 16 },
      admits: 30,
      guards: 8,
      logQueue: true,
    });
    console.log(`[act3] beds placed ${built.bedsPlaced}, skipped ${JSON.stringify(built.bedsSkipped)}`);
    const start = await probe(page);
    console.log(`[act3] AT THE START OF THE RUN tick=${start.tick} day=${start.day} | ${start.strip}`);
    console.log(`[act3] counts: ${JSON.stringify(start.counts)}`);

    const reached = await runToTickOrBudget(page, 60_000, 110_000, async () => {
      const sample = await probe(page);
      console.log(`[act3] t=${sample.tick} day=${sample.day} | ${sample.strip} | event="${sample.event}"`);
    });
    console.log(`[act3] the run stopped at tick ${reached} (${(reached / DAY_LENGTH_TICKS).toFixed(2)} in-game days)`);
    reportEveryBoundary('act3', await countsSeries(page));
    const end = await probe(page);
    console.log(`[act3] FINAL strip: ${end.strip}`);
    console.log(`[act3] FINAL counts: ${JSON.stringify(end.counts)}`);
    console.log(`[act3] FINAL alerts: ${end.alerts}`);
    console.log(`[act3] FINAL lists: ${JSON.stringify(await listSizes(page))}`);
    console.log(`[act3] FINAL folds: ${JSON.stringify(await hiddenByFolds(page))}`);
    for (const id of ['overview', 'day-plan', 'manage', 'zones'] as const) {
      await tab(page, id).click();
      await page.waitForTimeout(350);
      console.log(`[act3] FINAL ${id} tab:\n${await screen(page)}`);
    }
  });

  /**
   * **act 5 — twenty presses of Hire Guard, counted one at a time.**
   *
   * Cheap and dedicated, because three runs disagreed. Act 1 pressed Hire six
   * times and got six guards; act 4 pressed four and got four; act 3 pressed
   * **eight and got three**, with 43,040 in the treasury and no refusal about
   * hiring anywhere on screen. That is either five presses my instrument lost
   * or five hires the game dropped, and the difference matters enough to spend
   * two minutes on: this act reads the staff count, the treasury, the control's
   * own disabled state and the refusal band after **every single press**, and
   * counts the commands the worker actually received.
   *
   * No prison is built. Hiring needs a duty for the role, and the default
   * security sector is derived at `New prison`
   * (`src/simulation/security/default-sector.ts`), so the Security tab is live
   * on a bare prison.
   */
  test('act 5 — twenty presses of Hire Guard, one press at a time', async ({ page }) => {
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await tab(page, 'manage').click();
    const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
    if ((await guardRow.count()) > 0) await guardRow.first().click();
    console.log(`[act5] hire control reads: ${JSON.stringify((await page.locator('.hud-staff__hire').innerText()).trim())}`);
    await fastForwardToMax(page);

    const hireCommands = async (): Promise<number> =>
      (await sentCommands(page)).filter((c) => c['type'] === 'HireStaff' || c['type'] === 'HireStaffMember').length;
    console.log(`[act5] command types the tee has seen so far: ${JSON.stringify([...new Set((await sentCommands(page)).map((c) => String(c['type'])))])}`);

    for (let index = 1; index <= 20; index += 1) {
      const before = await hireCommands();
      let threw = '';
      try {
        await page.locator('.hud-staff__hire').click({ timeout: 5_000 });
      } catch (error) {
        threw = String(error).split('\n')[0] ?? 'threw';
      }
      await page.waitForTimeout(400);
      const counts = await latestCounts(page);
      console.log(
        `[act5] press ${index}: commands ${before}->${await hireCommands()}` +
          ` | staff=${counts?.staff} wageBill=${counts?.dailyWageBillMinorUnits} funds=${counts?.treasuryMinorUnits}` +
          ` | aria-disabled=${await page.locator('.hud-staff__hire').getAttribute('aria-disabled')}` +
          ` | refusal=${JSON.stringify(await panelText(page, '.hud__refusal'))}${threw === '' ? '' : ` | PRESS THREW: ${threw}`}`,
      );
    }
    await page.waitForTimeout(2_000);
    console.log(`[act5] FINAL counts: ${JSON.stringify(await latestCounts(page))}`);
    console.log(`[act5] FINAL staff panel: ${(await panelText(page, '.hud-staff')).replace(/\n/g, ' / ')}`);
    console.log(`[act5] FINAL strip: ${(await panelText(page, '.hud-strip__metrics')).replace(/\n/g, ' | ')}`);
    console.log(`[act5] FINAL alerts: ${(await panelText(page, '.hud-alerts__list')).replace(/\n/g, ' / ')}`);
  });

  /**
   * **act 6 — what one more room costs, in ticks, with the clock stopped while
   * it is drawn.**
   *
   * Acts 1, 3 and 4 all reached a populated prison somewhere around in-game day
   * 11, but none of them can say how much of that was *construction* and how
   * much was this instrument's own round trips at 4x — a loaded box turns every
   * `page.evaluate` into tens of simulation ticks. So this act draws the
   * perimeter **paused**, which costs the clock nothing, and only then starts
   * it and polls. What comes out is the number a player actually waits: from
   * "the orders are in" to "the panel says nothing is left".
   */
  test('act 6 — the cost of a perimeter, drawn while paused', async ({ page }) => {
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await tab(page, 'build').click();
    const origin = await calibrate(page, { x: 700, y: 300 }, 16);
    console.log(`[act6] calibration: (${origin.originX}, ${origin.originY})`);

    await buy(page, 'wall-brick', 60);
    await fastForwardToMax(page);
    // Let the delivery land, and time it.
    const orderedAt = await currentTick(page);
    for (let poll = 0; poll < 60; poll += 1) {
      const deliveries = await panelText(page, '.hud-build__deliveries');
      if (deliveries.includes('not laid out') || deliveries.includes('ABSENT')) {
        console.log(`[act6] the 60 bricks landed by tick ${await currentTick(page)} (${(await currentTick(page)) - orderedAt} ticks after the clock started)`);
        break;
      }
      await page.waitForTimeout(1_000);
    }

    await page.locator('.hud-strip__transport button').nth(0).click();
    await page.waitForTimeout(500);
    const pausedAt = await currentTick(page);
    console.log(`[act6] paused at tick ${pausedAt}, clock ${JSON.stringify(await currentClock(page))}`);

    await armBuildable(page, 'wall-brick');
    const westX = origin.originX + 12 * TILE;
    const eastX = origin.originX + 18 * TILE;
    const northY = origin.originY + 12 * TILE;
    const southY = origin.originY + 18 * TILE;
    let placed = 0;
    for (const run of [
      { name: 'north', a: { x: westX + TILE / 2, y: northY }, b: { x: eastX - TILE / 2, y: northY } },
      { name: 'south', a: { x: westX + TILE / 2, y: southY }, b: { x: eastX - TILE / 2, y: southY } },
      { name: 'west', a: { x: westX, y: northY + TILE / 2 }, b: { x: westX, y: southY - TILE / 2 } },
      { name: 'east', a: { x: eastX, y: northY + TILE / 2 }, b: { x: eastX, y: southY - TILE / 2 } },
    ]) {
      const before = (await sentCommands(page)).length;
      await drag(page, run.a, run.b);
      placed += (await sentCommands(page)).slice(before).length;
    }
    const drawnAt = await currentTick(page);
    console.log(`[act6] ${placed} order(s) drawn while paused; the clock moved ${drawnAt - pausedAt} tick(s) while drawing`);
    console.log(`[act6] queue with the clock stopped: ${JSON.stringify((await panelText(page, '.hud-build__queue')).replace(/\n/g, ' '))}`);

    await fastForwardToMax(page);
    const startedAt = await currentTick(page);
    let lastText = '';
    for (let poll = 0; poll < 400; poll += 1) {
      const text = (await panelText(page, '.hud-build__queue')).replace(/\n/g, ' ');
      const tick = await currentTick(page);
      if (text !== lastText) {
        console.log(`[act6] tick ${tick} (+${tick - startedAt}): ${JSON.stringify(text)}`);
        lastText = text;
      }
      if (/(?<![0-9])0 waiting . 0 being built/.test(text) || text.includes('not laid out') || text.includes('ABSENT')) {
        const done = await currentTick(page);
        console.log(
          `[act6] THE PERIMETER IS UP at tick ${done}: ${done - startedAt} ticks for ${placed} wall segments` +
            ` = ${((done - startedAt) / placed).toFixed(1)} ticks each, ${((done - startedAt) / DAY_LENGTH_TICKS).toFixed(2)} in-game days for the room`,
        );
        break;
      }
      await page.waitForTimeout(500);
    }
    console.log(`[act6] FINAL counts: ${JSON.stringify(await latestCounts(page))}`);
  });

  /**
   * **act 4 — the long hands-off run.** The cheapest build that houses
   * everybody it admits (17 beds on rows two apart, so none collides), then
   * eight more admissions than there are beds, four guards, and then **nothing
   * pressed at all** for as many in-game days as the budget buys.
   *
   * This is the act that answers "does it get better or worse": the per-day
   * ledger and the sampled screen run side by side across the whole window, so
   * the last populated day can be set against the first on money, incidents,
   * needs and how much of the screen is readable.
   */
  test('act 4 — twenty-five on the roster, hands off, day after day', async ({ page }) => {
    const built = await buildGrownPrison(page, {
      label: 'act4',
      beds: 17,
      bedRows: [12, 14, 16],
      toiletTile: { x: 17, y: 16 },
      admits: 25,
      guards: 4,
      logQueue: true,
    });
    const start = await probe(page);
    console.log(`[act4] beds placed ${built.bedsPlaced}, skipped ${JSON.stringify(built.bedsSkipped)}`);
    console.log(`[act4] AT THE START OF THE RUN tick=${start.tick} day=${start.day} | ${start.strip}`);
    console.log(`[act4] counts: ${JSON.stringify(start.counts)}`);
    console.log(`[act4] lists: ${JSON.stringify(await listSizes(page))}`);
    await tab(page, 'day-plan').click();
    await page.waitForTimeout(300);
    console.log(`[act4] regime tab at the start of the run:\n${await screen(page)}`);
    await tab(page, 'overview').click();

    const reached = await runToTickOrBudget(page, 90_000, 195_000, async () => {
      const sample = await probe(page);
      console.log(
        `[act4] t=${sample.tick} day=${sample.day} | ${sample.strip}` +
          ` | event="${sample.event}" | lists=${JSON.stringify(await listSizes(page))}`,
      );
      console.log(`[act4] t=${sample.tick} alerts: ${sample.alerts}`);
    });
    console.log(`[act4] the run stopped at tick ${reached} (${(reached / DAY_LENGTH_TICKS).toFixed(2)} in-game days)`);
    reportEveryBoundary('act4', await countsSeries(page));

    const end = await probe(page);
    console.log(`[act4] FINAL strip: ${end.strip}`);
    console.log(`[act4] FINAL counts: ${JSON.stringify(end.counts)}`);
    console.log(`[act4] FINAL event band: "${end.event}"`);
    console.log(`[act4] FINAL alerts: ${end.alerts}`);
    console.log(`[act4] FINAL lists: ${JSON.stringify(await listSizes(page))}`);
    console.log(`[act4] FINAL folds: ${JSON.stringify(await hiddenByFolds(page))}`);
    console.log(`[act4] FINAL refusal band: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
    for (const id of ['overview', 'day-plan', 'manage'] as const) {
      await tab(page, id).click();
      await page.waitForTimeout(350);
      console.log(`[act4] FINAL ${id} tab:\n${await screen(page)}`);
    }
  });
});
