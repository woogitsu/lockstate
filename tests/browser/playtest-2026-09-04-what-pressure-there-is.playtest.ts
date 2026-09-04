import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  armBuildable,
  buy,
  calibrate,
  centreOf,
  countsSeries,
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
  TILE,
  waitForQueueEmpty,
  type CountsSample,
} from './playtest-harness';

/**
 * **Does this game apply any pressure, and what would restoring one constant
 * do to the treasury curve?** The owner suspended the unmet-need penalty on
 * 2026-09-03 (*"usuń na razie kary"*) and on 2026-09-04, asked whether a
 * prison should ever be allowed to be in trouble, ruled **"Zmierzcie to
 * najpierw"** -- measure it first. This file is that measurement, made
 * repeatable.
 *
 * NOT A GATE. `tests/browser/playwright.config.ts` is
 * `testMatch: /.*\.spec\.ts$/`, so nothing in CI collects this file. Run one
 * act at a time:
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5411 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-2026-09-04-what-pressure-there-is.playtest.ts \
 *   --grep "the shipped curve"
 * ```
 *
 * ## The one thing this file cannot do for you
 *
 * Acts **P** and **Y** measure the game with
 * `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` at `40` -- the value the
 * owner suspended. That is a **source mutation**, not a fixture: the constant
 * has exactly one production reader (`stateIncomeForPrisonerDay`,
 * `src/simulation/economy/income.ts`) and no seam a test can inject through,
 * by deliberate design recorded in its docblock. So before running P or Y:
 *
 * ```
 * sha256sum src/simulation/economy/income.ts > /tmp/income.sha256   # record
 * sed -i 's/^export const STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS = 0;$/export const STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS = 40;/' src/simulation/economy/income.ts
 * # ... run acts P and Y ...
 * git checkout -- src/simulation/economy/income.ts
 * sha256sum -c /tmp/income.sha256                                    # verify
 * ```
 *
 * **The mutation must be restored and the restore must be verified**, which is
 * this repository's rule and not a suggestion. Never push the mutated
 * constant: balance is the owner's.
 *
 * Vite serves `src/**` live, so the edit must not be made while a run is in
 * flight (`docs/AGENT_WORKFLOW.md` §2, "A local browser run in the worktree
 * you are editing is not a baseline").
 *
 * Findings: `docs/research/2026-09-04-what-pressure-there-is.md`.
 */

/** `DAY_LENGTH_TICKS`, confirmed in play by the day counter rather than imported. */
const TICKS_PER_DAY = 2400;

/**
 * The prison every act builds, and why it is this shape rather than the 6x6
 * every earlier playtest uses.
 *
 * A yard is `8x8` minimum and needs no walls (`src/content/room-catalog.ts`,
 * `room.yard`: `outdoors` + `minimum-size 8x8`), so the cell **and** an 8x8 of
 * clear ground both have to be reachable by the pointer at 1440x900 at once.
 * Measured on the real page: calibration puts tile (0,0) at screen
 * `(-304,-574)`, the status strip covers y<110, `.hud__corner` covers x<422
 * for y in 406..831, `.hud__rail` covers x>1152 and `.hud__tabs` covers y>831
 * -- so the pointer-reachable tile window is roughly **cols 12..21, rows
 * 11..21**. A 6x6 cell at 12..17 plus an 8x8 yard does not fit in it; a 3x4
 * cell at cols 12..14 plus an 8x8 yard at cols 15..22 does.
 *
 * `room.cell`'s authored minimum is `2x3` (`minTiles: 6`), so 3x4 is legal
 * with a tile to spare.
 */
interface Rect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}
const CELL: Rect = { x0: 12, y0: 12, x1: 14, y1: 15 };
/** cols 15..22, rows 12..19. Exactly 64 tiles, which is `TILES_PER_OPEN_GROUND_PLACE` x 4 places. */
const YARD: Rect = { x0: 15, y0: 12, x1: 22, y1: 19 };
/** Four, because an 8x8 yard admits exactly four at once (64 tiles / `TILES_PER_OPEN_GROUND_PLACE`). */
const PRISONERS = 4;
/** `ceil(4 / DEFAULT_SECTOR_PRISONERS_PER_GUARD)` -- exactly what the game asks for and not one more. */
const GUARDS = 1;

const note = (line: string): void => {
  console.log(line);
};

interface Screen {
  readonly ms: number;
  readonly tick: number;
  readonly day: string;
  readonly metrics: Record<string, string>;
  readonly event: string;
  readonly alerts: string;
  readonly counts: CountsSample | undefined;
}

async function readScreen(page: Page, startedAt: number): Promise<Screen> {
  const dom = await page.evaluate(() => {
    const flat = (node: Element | null): string =>
      node === null ? 'ABSENT' : ((node as HTMLElement).innerText ?? '').replace(/\s*\n\s*/g, ' · ').trim();
    const metrics: Record<string, string> = {};
    for (const chip of Array.from(document.querySelectorAll('[data-metric]'))) {
      metrics[chip.getAttribute('data-metric') ?? '?'] = flat(chip);
    }
    return {
      day: flat(document.querySelector('.hud-clock__day')),
      metrics,
      event: flat(document.querySelector('.hud__event')),
      alerts: flat(document.querySelector('.hud-alerts__list')),
    };
  });
  return { ms: Date.now() - startedAt, tick: await currentTick(page), counts: await latestCounts(page), ...dom };
}

function logScreen(label: string, tag: string, screen: Screen): void {
  note(
    `[${label}] ${tag} t+${(screen.ms / 1000).toFixed(1)}s tick=${screen.tick} day=${screen.day}` +
      ` funds=${JSON.stringify(screen.metrics['funds'] ?? 'ABSENT')}` +
      ` earned=${JSON.stringify(screen.metrics['earned-today'] ?? 'ABSENT')}`,
  );
  note(`[${label}] ${tag}   chips: ${JSON.stringify(screen.metrics)}`);
  note(`[${label}] ${tag}   band: ${JSON.stringify(screen.event)}`);
  note(`[${label}] ${tag}   counts: ${JSON.stringify(screen.counts)}`);
}

/**
 * The six-need composition of `unmetNeedCount`, per prisoner, read off the
 * Regime panel's inspector.
 *
 * This is the surface that answers the yard question **without** going through
 * the money: `.hud-regime__detail-need` rows carry `data-need`,
 * `data-need-permille` and `data-need-unmet`, and the panel's own comment says
 * the six together are *"the composition of `unmetNeedCount` -- the figure
 * `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` multiplies"*. So a
 * `recreation` row flipping `data-need-unmet` from `true` to `false` is the
 * mechanism, and the treasury delta is its price.
 */
async function readNeeds(page: Page, label: string, tag: string): Promise<void> {
  await tab(page, 'regime').click();
  const rows = page.locator('.hud-regime__roster-row[data-prisoner]');
  const count = await rows.count();
  note(`[${label}] ${tag} roster rows: ${count}`);
  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index);
    if (!(await row.isVisible())) {
      note(`[${label}] ${tag} roster row ${index} is in the DOM and not laid out`);
      continue;
    }
    await row.click();
    await page.waitForTimeout(250);
    const detail = await page.evaluate(() => {
      const header = document.querySelector<HTMLElement>('.hud-regime__detail-header');
      const needs = Array.from(document.querySelectorAll<HTMLElement>('.hud-regime__detail-need'))
        .filter((element) => !element.hidden)
        .map((element) => ({
          need: element.dataset['need'] ?? '?',
          permille: element.dataset['needPermille'] ?? '?',
          unmet: element.dataset['needUnmet'] ?? '?',
        }));
      return { who: (header?.innerText ?? '').replace(/\s*\n\s*/g, ' · ').trim(), needs };
    });
    const unmet = detail.needs.filter((need) => need.unmet === 'true');
    note(
      `[${label}] ${tag} prisoner ${await row.getAttribute('data-prisoner')} ${JSON.stringify(detail.who)}` +
        ` unmetNeedCount=${unmet.length} of ${detail.needs.length}` +
        ` unmet=${JSON.stringify(unmet.map((need) => need.need))}` +
        ` all=${JSON.stringify(detail.needs)}`,
    );
  }
  await tab(page, 'overview').click();
}

/**
 * Runs the clock to `targetTick`, reading the screen on every change of the
 * in-game day counter.
 *
 * The day boundary is where money moves -- `StateIncomeSystem` (order 120) and
 * `PayrollSystem` (order 130) both run on the day's last tick -- so a sample
 * taken there is the one that shows a treasury curve rather than an accrual.
 */
async function runAndWatch(
  page: Page,
  label: string,
  targetTick: number,
  startedAt: number,
  budgetMs = 250_000,
): Promise<readonly Screen[]> {
  const taken: Screen[] = [];
  const watchStartedAt = Date.now();
  let lastDay = '';
  for (;;) {
    const screen = await readScreen(page, startedAt);
    if (screen.day !== lastDay) {
      taken.push(screen);
      logScreen(label, `DAY ${screen.day}`, screen);
      lastDay = screen.day;
    }
    if (screen.tick >= targetTick) return taken;
    /*
     * Budgeted from this loop's own start rather than from the act's, and that
     * is a correction the first act B run paid for. `buildTheReasonablePrison`
     * runs the clock at 4x for the whole of its two hundred seconds, so the
     * prison is already at in-game day 7 by the time anybody is admitted -- and
     * a watch that targeted an absolute tick therefore watched three day
     * boundaries instead of the eight the act asked for. The target is now
     * relative to admission, and the budget has to be too.
     */
    if (Date.now() - watchStartedAt > budgetMs) {
      note(`[${label}] WALL-CLOCK BUDGET SPENT at tick ${screen.tick} of ${targetTick}`);
      return taken;
    }
    await page.waitForTimeout(700);
  }
}

/** Prints the treasury at every day boundary the counts series crossed, as a curve. */
function printCurve(label: string, series: readonly CountsSample[]): void {
  note(`[${label}] ===== the treasury curve, read at every in-game day boundary =====`);
  const last = series[series.length - 1];
  const lastDay = last === undefined ? 0 : Math.floor(last.tick / TICKS_PER_DAY) + 1;
  let previous: number | undefined;
  for (let day = 1; day <= lastDay; day += 1) {
    const boundary = day * TICKS_PER_DAY;
    const before = [...series].filter((sample) => sample.tick < boundary).pop();
    const after = series.find((sample) => sample.tick >= boundary);
    if (before === undefined || after === undefined) continue;
    const delta = after.treasuryMinorUnits - before.treasuryMinorUnits;
    note(
      `[${label}] day ${day} boundary (tick ${boundary}): treasury ${before.treasuryMinorUnits} -> ${after.treasuryMinorUnits}` +
        ` delta=${delta}${previous === undefined ? '' : ` (previous day's delta ${previous})`}` +
        ` | accrual just before=${before.stateIncomeAccruedTodayMinorUnits}` +
        ` wageBill=${after.dailyWageBillMinorUnits} arrears=${after.unpaidWagesMinorUnits}` +
        ` places=${after.roomOccupants} roster=${after.prisoners} staff=${after.staff}`,
    );
    previous = delta;
  }
  note(`[${label}] ===== every status-counts publication =====`);
  for (const sample of series) note(`[${label}] counts ${JSON.stringify(sample)}`);
}

/**
 * Builds the enclosed 3x4 cell at `CELL`, furnishes it with `PRISONERS` beds
 * and one toilet, and answers the calibration origin.
 *
 * A toilet as well as beds, because this is meant to be the prison **a
 * reasonable player would build**: `bladder` has a route and `sleep` has a
 * route, and what is left unserved is what the shipped content gives a starting
 * player no cheap route to (`hunger` needs a canteen with a table and a stove,
 * `hygiene` a shower room with a head). That composition is the point -- a
 * penalty that only bites prisons built badly on purpose would not be a
 * pressure a player feels.
 */
async function buildTheReasonablePrison(page: Page, label: string): Promise<{ originX: number; originY: number }> {
  await tab(page, 'build').click();
  const origin = await calibrate(page);
  note(`[${label}] calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);

  // 2 bricks a wall segment; the 3x4 perimeter is 14 segments.
  await buy(page, 'wall-brick', 40);
  await buy(page, 'bed-wooden', PRISONERS + 8);
  await buy(page, 'toilet-brick', 1);
  await fastForwardToMax(page);
  await page.waitForTimeout(3000);
  note(`[${label}] deliveries: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);

  await armBuildable(page, 'wall-brick');
  const westX = origin.originX + CELL.x0 * TILE;
  const eastX = origin.originX + (CELL.x1 + 1) * TILE;
  const northY = origin.originY + CELL.y0 * TILE;
  const southY = origin.originY + (CELL.y1 + 1) * TILE;
  for (const run of [
    { name: 'north', a: { x: westX + TILE / 2, y: northY }, b: { x: eastX - TILE / 2, y: northY } },
    { name: 'south', a: { x: westX + TILE / 2, y: southY }, b: { x: eastX - TILE / 2, y: southY } },
    { name: 'west', a: { x: westX, y: northY + TILE / 2 }, b: { x: westX, y: southY - TILE / 2 } },
    { name: 'east', a: { x: eastX, y: northY + TILE / 2 }, b: { x: eastX, y: southY - TILE / 2 } },
  ]) {
    const before = (await sentCommands(page)).length;
    await drag(page, run.a, run.b);
    note(`[${label}] wall run ${run.name}: ${(await sentCommands(page)).length - before} command(s)`);
  }
  await waitForQueueEmpty(page);

  // Retried, because the Rooms panel's enclosure verdict is read off a world
  // view a snapshot replaces and a completed wall does not mark it dirty.
  for (let attempt = 1; ; attempt += 1) {
    await tab(page, 'rooms').click();
    if ((await page.locator('.hud-rooms').getAttribute('data-collapsed')) === 'true') {
      await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    }
    await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
    await page.locator('.hud-rooms__arm').click();
    await drag(page, centreOf(origin, CELL.x0, CELL.y0), centreOf(origin, CELL.x1, CELL.y1));
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(800);
    const counts = await latestCounts(page);
    note(`[${label}] designate cell attempt ${attempt}: rooms=${String(counts?.rooms)} band=${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
    if ((counts?.rooms ?? 0) > 0) break;
    if (attempt >= 10) throw new Error('the cell rectangle was never accepted as a room');
    await page.waitForTimeout(4000);
  }

  /*
   * The toilet first, then beds until the prison says it can accommodate
   * `PRISONERS`.
   *
   * **Adaptive rather than a fixed list of tiles, and that is the first act B
   * run's correction.** Four bed presses at (12,12),(13,12),(14,12),(12,13)
   * produced `roomCapacity: 3` and left one of four prisoners in intake for the
   * whole run, so the act measured three occupied places while claiming four.
   * A press that produces no command is a reading and is logged; what matters
   * to the measurement is the count the *prison* reports, which is why the loop
   * stops on `accommodationCapacity` and not on presses made.
   */
  await tab(page, 'build').click();
  await armBuildable(page, 'toilet-brick');
  const toilet = centreOf(origin, CELL.x1, CELL.y1);
  note(`[${label}] toilet at (${CELL.x1},${CELL.y1}): ${(await press(page, toilet.x, toilet.y)).length} command(s)`);

  await armBuildable(page, 'bed-wooden');
  let beds = 0;
  for (let row = CELL.y0; row <= CELL.y1; row += 1) {
    for (let column = CELL.x0; column <= CELL.x1; column += 1) {
      if (row === CELL.y1 && column === CELL.x1) continue; // the toilet's tile
      const point = centreOf(origin, column, row);
      const commands = await press(page, point.x, point.y);
      if (commands.length > 0) beds += 1;
      else note(`[${label}] bed at (${column},${row}) produced NO command`);
      if (beds >= PRISONERS) break;
    }
    if (beds >= PRISONERS) break;
  }
  note(`[${label}] ${beds} bed order(s) placed`);
  await waitForQueueEmpty(page);
  await page.waitForTimeout(2000);
  let furnished = await latestCounts(page);
  for (let round = 1; round <= 3 && (furnished?.accommodationCapacity ?? 0) < PRISONERS; round += 1) {
    note(`[${label}] accommodation is ${String(furnished?.accommodationCapacity)} of ${PRISONERS} after round ${round - 1}; placing more`);
    await armBuildable(page, 'bed-wooden');
    for (let row = CELL.y0; row <= CELL.y1; row += 1) {
      for (let column = CELL.x0; column <= CELL.x1; column += 1) {
        if (row === CELL.y1 && column === CELL.x1) continue;
        const point = centreOf(origin, column, row);
        await press(page, point.x, point.y);
      }
    }
    await waitForQueueEmpty(page);
    await page.waitForTimeout(2000);
    furnished = await latestCounts(page);
  }
  note(
    `[${label}] furnished: rooms=${String(furnished?.rooms)} roomCapacity=${String(furnished?.roomCapacity)}` +
      ` accommodationCapacity=${String(furnished?.accommodationCapacity)}`,
  );
  await tab(page, 'rooms').click();
  note(`[${label}] rooms panel: ${JSON.stringify(await panelText(page, '.hud-rooms'))}`);
  return origin;
}

/**
 * Zones `YARD` as `room.yard` and says, in the log, exactly what the game said
 * back.
 *
 * Whether this works at all is a finding in its own right and a bigger one than
 * any curve: `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS`'s docblock
 * rests its "the cheapest repair pays for itself in days" property on it -- so
 * if an 8x8 of clear ground cannot be zoned with the pointer on the map the
 * game hands a new player, the incentive that constant claims to create does
 * not exist.
 */
async function zoneTheYard(page: Page, label: string, origin: { originX: number; originY: number }): Promise<boolean> {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    await tab(page, 'rooms').click();
    if ((await page.locator('.hud-rooms').getAttribute('data-collapsed')) === 'true') {
      await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    }
    const yardRow = page.locator('.hud-rooms__list [data-room="room.yard"]');
    if ((await yardRow.count()) === 0) {
      note(`[${label}] YARD: no [data-room="room.yard"] row in the Rooms catalogue at all`);
      return false;
    }
    await yardRow.click();
    note(`[${label}] YARD catalogue row says: ${JSON.stringify(await panelText(page, '.hud-rooms__list'))}`);
    await page.locator('.hud-rooms__arm').click();
    await drag(page, centreOf(origin, YARD.x0, YARD.y0), centreOf(origin, YARD.x1, YARD.y1));
    note(`[${label}] YARD panel before confirm: ${JSON.stringify(await panelText(page, '.hud-rooms'))}`);
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(1000);
    const counts = await latestCounts(page);
    note(
      `[${label}] YARD attempt ${attempt}: rooms=${String(counts?.rooms)}` +
        ` roomCapacity=${String(counts?.roomCapacity)}` +
        ` band=${JSON.stringify(await panelText(page, '.hud__refusal'))}`,
    );
    if ((counts?.rooms ?? 0) >= 2) {
      note(`[${label}] YARD accepted on attempt ${attempt}; rooms panel: ${JSON.stringify(await panelText(page, '.hud-rooms'))}`);
      return true;
    }
    await page.waitForTimeout(2500);
  }
  note(`[${label}] YARD was never accepted`);
  return false;
}

async function admit(page: Page, label: string, wanted: number): Promise<number> {
  await tab(page, 'overview').click();
  let admitted = 0;
  for (let index = 0; index < wanted; index += 1) {
    const control = page.locator('.hud-intake__admit');
    if ((await control.getAttribute('disabled')) !== null) {
      note(`[${label}] Admit went disabled after ${admitted} press(es); intake says ${JSON.stringify(await panelText(page, '.hud-intake'))}`);
      return admitted;
    }
    await control.click();
    admitted += 1;
    await page.waitForTimeout(150);
  }
  note(`[${label}] pressed Admit ${admitted} time(s); intake: ${JSON.stringify(await panelText(page, '.hud-intake'))}`);
  return admitted;
}

async function hire(page: Page, label: string, wanted: number): Promise<void> {
  await tab(page, 'security').click();
  const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
  if ((await guardRow.count()) > 0) await guardRow.first().click();
  note(`[${label}] hire control reads: ${JSON.stringify((await page.locator('.hud-staff__hire').innerText()).trim())}`);
  for (let index = 0; index < wanted; index += 1) {
    await page.locator('.hud-staff__hire').click();
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(1500);
  const counts = await latestCounts(page);
  note(`[${label}] after ${wanted} hire(s): staff=${String(counts?.staff)} wageBill=${String(counts?.dailyWageBillMinorUnits)} funds=${String(counts?.treasuryMinorUnits)}`);
  note(`[${label}] staff panel: ${JSON.stringify(await panelText(page, '.hud-staff'))}`);
}

/** The shared body of acts B, P and Y: build, populate, staff, run, and read the curve. */
async function playTheReasonablePrison(page: Page, label: string, days: number, withYard: boolean): Promise<void> {
  const startedAt = Date.now();
  await installTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  logScreen(label, 'OPENING', await readScreen(page, startedAt));

  const origin = await buildTheReasonablePrison(page, label);
  if (withYard) {
    const zoned = await zoneTheYard(page, label, origin);
    note(`[${label}] yard zoned: ${String(zoned)}`);
  }
  const admitted = await admit(page, label, PRISONERS);
  note(`[${label}] admitted ${admitted}`);
  await page.waitForTimeout(3000);
  await hire(page, label, GUARDS);
  await fastForwardToMax(page);
  logScreen(label, 'READY', await readScreen(page, startedAt));
  await readNeeds(page, label, 'READY');

  /*
   * `days` in-game days measured from **here**, not from tick 0. The build
   * phase runs the clock at 4x throughout -- deliveries and construction need
   * ticks -- so a fresh prison is already several in-game days old before
   * anybody lives in it, and an absolute target spends the act's whole
   * wall-clock budget on days that had no prisoners in them.
   */
  const admittedAt = await currentTick(page);
  note(`[${label}] the watch starts at tick ${admittedAt} and runs ${days} in-game day(s) to ${admittedAt + TICKS_PER_DAY * days}`);
  const samples = await runAndWatch(page, label, admittedAt + TICKS_PER_DAY * days, startedAt);
  logScreen(label, 'FINAL', await readScreen(page, startedAt));
  await readNeeds(page, label, 'FINAL');
  await tab(page, 'security').click();
  note(`[${label}] staff panel at the end: ${JSON.stringify(await panelText(page, '.hud-staff'))}`);
  printCurve(label, await countsSeries(page));
  note(`[${label}] ${samples.length} day sample(s) in ${((Date.now() - startedAt) / 1000).toFixed(1)}s wall clock`);
}

test.describe('What pressure there is', () => {
  /**
   * **B -- the shipped curve.** Run this on an unmodified tree, where
   * `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` is `0`.
   */
  test('B the shipped curve', async ({ page }) => {
    await playTheReasonablePrison(page, 'B', 7, false);
  });

  /**
   * **P -- the same prison with the penalty restored.** Requires the source
   * mutation described in this file's header. Identical script to act B: same
   * build, same admissions, same hire, same number of days.
   */
  test('P the curve with the penalty restored', async ({ page }) => {
    await playTheReasonablePrison(page, 'P', 7, false);
  });

  /**
   * **Y -- is the yard incentive real?** Act P's prison plus an 8x8 yard,
   * zoned before the prisoners arrive. Requires the same mutation: at a
   * withheld rate of `0` the yard is worth exactly nothing and the act cannot
   * measure anything.
   */
  test('Y the yard with the penalty restored', async ({ page }) => {
    await playTheReasonablePrison(page, 'Y', 7, true);
  });

  /**
   * **N -- pure neglect.** Admit prisoners, build nothing, hire nobody, and see
   * what the game does about it. Runs on either tree; a prison that houses
   * nobody earns nothing to withhold from, so the constant cannot reach it.
   */
  test('N pure neglect', async ({ page }) => {
    const label = 'N';
    const startedAt = Date.now();
    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    logScreen(label, 'OPENING', await readScreen(page, startedAt));

    const admitted = await admit(page, label, 12);
    note(`[${label}] admitted ${admitted} into a prison with no room, no bed and no staff`);
    note(`[${label}] no-place marker: ${await page.locator('.hud-intake__no-place').getAttribute('data-without-place')}`);
    note(`[${label}] refusal band: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
    await fastForwardToMax(page);
    logScreen(label, 'READY', await readScreen(page, startedAt));

    const from = await currentTick(page);
    const samples = await runAndWatch(page, label, from + TICKS_PER_DAY * 8, startedAt);
    logScreen(label, 'FINAL', await readScreen(page, startedAt));
    await readNeeds(page, label, 'FINAL');
    printCurve(label, await countsSeries(page));
    note(`[${label}] ${samples.length} day sample(s) in ${((Date.now() - startedAt) / 1000).toFixed(1)}s wall clock`);
  });
});
