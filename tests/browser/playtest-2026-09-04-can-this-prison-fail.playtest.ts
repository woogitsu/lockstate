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
  sentCommands,
  tab,
  TILE,
  waitForQueueEmpty,
  type CountsSample,
} from './playtest-harness';

/**
 * **Can a player lose this prison?** Four prisons played to failure, or to
 * whatever this game has instead of failure.
 *
 * NOT A GATE. `tests/browser/playwright.config.ts` is
 * `testMatch: /.*\.spec\.ts$/`, so nothing in CI collects this file. Run it:
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5397 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-2026-09-04-can-this-prison-fail.playtest.ts
 * ```
 *
 * `git lfs checkout` first in a worktree, or the atlases fail to decode and
 * every actor is missing while the run still passes.
 *
 * The question was asked on the day the state-income penalty was suspended
 * (`STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS = 0`,
 * `src/simulation/economy/income.ts`) so the owner could judge how easy the
 * game now is by playing it. This file is the play, made repeatable: a prison
 * that neglects everyone, a prison that spends everything, a prison that
 * does nothing, and a fourth that is run properly -- the control, whose only
 * job is to refute the first one's zero -- with every reading taken off the HUD
 * rather than computed from source.
 *
 * Each act is its own `test()` and costs four to six wall-clock minutes, so
 * they are meant to be `--grep`ed one at a time. `--grep` is a regex, which is
 * why the describe title has no parentheses in it.
 *
 * Findings: `docs/research/2026-09-04-can-this-prison-fail.md`.
 */

/** `DAY_LENGTH_TICKS`, confirmed in play by the day counter, not imported. */
const TICKS_PER_DAY = 2400;
const TEN_DAYS = TICKS_PER_DAY * 10;

const note = (line: string): void => {
  console.log(line);
};

/**
 * Everything a player can see at one instant, read off the DOM.
 *
 * The nine `[data-metric]` chips are read whole -- value, label, badge and
 * trailing text together -- rather than by sub-selector, because the question
 * is whether the screen *says* a prison is failing and a badge that exists but
 * is empty answers it as well as one that is absent.
 */
interface Screen {
  readonly ms: number;
  readonly tick: number;
  readonly day: string;
  readonly metrics: Record<string, string>;
  readonly event: string;
  readonly eventSeverity: string;
  readonly alerts: string;
  readonly refusal: string;
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
    const band = document.querySelector('.hud__event');
    return {
      day: flat(document.querySelector('.hud-clock__day')),
      metrics,
      event: flat(band),
      eventSeverity: band?.getAttribute('data-severity') ?? 'NONE',
      alerts: flat(document.querySelector('.hud-alerts__list')),
      refusal: flat(document.querySelector('.hud__refusal')),
    };
  });
  return { ms: Date.now() - startedAt, tick: await currentTick(page), counts: await latestCounts(page), ...dom };
}

function logScreen(label: string, tag: string, screen: Screen): void {
  note(
    `[${label}] ${tag} t+${(screen.ms / 1000).toFixed(1)}s tick=${screen.tick} day=${screen.day}` +
      ` funds=${JSON.stringify(screen.metrics['funds'] ?? 'ABSENT')}` +
      ` earned=${JSON.stringify(screen.metrics['earned-today'] ?? 'ABSENT')}` +
      ` prisoners=${JSON.stringify(screen.metrics['prisoners'] ?? 'ABSENT')}`,
  );
  note(`[${label}] ${tag}   chips: ${JSON.stringify(screen.metrics)}`);
  note(`[${label}] ${tag}   band[${screen.eventSeverity}]: ${JSON.stringify(screen.event)}`);
  note(`[${label}] ${tag}   alerts: ${JSON.stringify(screen.alerts)}`);
  note(`[${label}] ${tag}   refusal: ${JSON.stringify(screen.refusal)}`);
  note(`[${label}] ${tag}   counts: ${JSON.stringify(screen.counts)}`);
}

/**
 * Runs the clock to `targetTick`, reading the screen whenever the in-game day
 * counter changes and at least every `everyMs`.
 *
 * Reads on the *day* rather than on a tick interval because the day boundary is
 * when money moves -- `settleDay` credits state income and runs payroll -- so a
 * sample taken there is the one that could show a prison going backwards.
 */
async function runAndWatch(
  page: Page,
  label: string,
  targetTick: number,
  startedAt: number,
  everyMs = 8000,
): Promise<readonly Screen[]> {
  const taken: Screen[] = [];
  let lastDay = '';
  let lastAt = 0;
  for (;;) {
    const screen = await readScreen(page, startedAt);
    const dayChanged = screen.day !== lastDay;
    if (dayChanged || Date.now() - lastAt >= everyMs) {
      taken.push(screen);
      logScreen(label, dayChanged ? `DAY ${screen.day}` : 'watch', screen);
      lastDay = screen.day;
      lastAt = Date.now();
    }
    if (screen.tick >= targetTick) return taken;
    if (Date.now() - startedAt > 520_000) {
      note(`[${label}] WALL-CLOCK BUDGET SPENT at tick ${screen.tick} of ${targetTick}`);
      return taken;
    }
    await page.waitForTimeout(750);
  }
}

/** Presses Admit until the control refuses to be pressed, and says what stopped it. */
async function admitAsManyAsPossible(page: Page, label: string, limit: number): Promise<number> {
  await tab(page, 'overview').click();
  let admitted = 0;
  for (let index = 0; index < limit; index += 1) {
    const control = page.locator('.hud-intake__admit');
    const disabled = await control.getAttribute('disabled');
    if (disabled !== null) {
      note(`[${label}] Admit went disabled after ${admitted} press(es); panel says ${JSON.stringify(await panelText(page, '.hud-intake'))}`);
      return admitted;
    }
    await control.click();
    admitted += 1;
    await page.waitForTimeout(120);
  }
  note(`[${label}] pressed Admit ${admitted} time(s) without the control ever going disabled`);
  note(`[${label}] intake panel: ${JSON.stringify(await panelText(page, '.hud-intake'))}`);
  note(`[${label}] no-place marker: ${await page.locator('.hud-intake__no-place').getAttribute('data-without-place')}`);
  return admitted;
}


/**
 * The cheapest prison that can legally hold anybody: a 6x6 enclosure of brick
 * walls at tiles (12,12)-(17,17), zoned `room.cell`, **and nothing inside it**.
 *
 * No bed, no toilet, no canteen, no yard, no staff. That is the point: act A
 * needs prisoners whose every need goes unmet, and the intake panel states the
 * exact minimum for getting one -- *"A prison needs a cell before it can admit
 * anyone. It does not need a free bed."* This builds that minimum and stops.
 *
 * Adapted from `buildAndPopulate` rather than called: that helper places beds
 * and a toilet, which is the neglect this act is measuring the absence of.
 */
async function buildABareCell(page: Page, label: string): Promise<{ originX: number; originY: number }> {
  await tab(page, 'build').click();
  const origin = await calibrate(page);
  note(`[${label}] calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);
  await buy(page, 'wall-brick', 60);
  await fastForwardToMax(page);
  await page.waitForTimeout(3000);
  note(`[${label}] deliveries: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);

  await armBuildable(page, 'wall-brick');
  const westX = origin.originX + 12 * TILE;
  const eastX = origin.originX + 18 * TILE;
  const northY = origin.originY + 12 * TILE;
  const southY = origin.originY + 18 * TILE;
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

  // The enclosure verdict is read off a world view a snapshot replaces, so the
  // designation is retried; how many attempts it takes is itself a reading.
  for (let attempt = 1; ; attempt += 1) {
    await tab(page, 'zones').click();
    if ((await page.locator('.hud-rooms').getAttribute('data-collapsed')) === 'true') {
      await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    }
    await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
    await page.locator('.hud-rooms__arm').click();
    await drag(page, centreOf(origin, 12, 12), centreOf(origin, 17, 17));
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(800);
    const counts = await latestCounts(page);
    note(`[${label}] designate attempt ${attempt}: rooms=${String(counts?.rooms)} band=${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
    if ((counts?.rooms ?? 0) > 0) break;
    if (attempt >= 10) throw new Error('the rectangle was never accepted as a room');
    await page.waitForTimeout(4000);
  }
  return origin;
}

/** The Regime tab's roster, which is where a player would look to see a need going unmet. */
async function readRoster(page: Page, label: string, tag: string): Promise<void> {
  await tab(page, 'day-plan').click();
  note(`[${label}] ${tag} regime panel: ${JSON.stringify(await panelText(page, '.hud-regime'))}`);
}

test.describe('Can this prison fail', () => {
  /**
   * **A -- the neglectful prison.** A bare cell, filled with people, and not
   * one need met: no bed, no toilet, no canteen, no yard, no guard. Ten days.
   */
  test('A the neglectful prison', async ({ page }) => {
    const label = 'A';
    const startedAt = Date.now();
    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    logScreen(label, 'OPENING', await readScreen(page, startedAt));

    await buildABareCell(page, label);
    logScreen(label, 'CELL ZONED', await readScreen(page, startedAt));

    const admitted = await admitAsManyAsPossible(page, label, 24);
    note(`[${label}] admitted ${admitted}`);
    await page.waitForTimeout(2500);
    logScreen(label, 'ADMITTED', await readScreen(page, startedAt));
    await readRoster(page, label, 'ADMITTED');
    await tab(page, 'overview').click();

    const samples = await runAndWatch(page, label, TEN_DAYS, startedAt);
    const final = await readScreen(page, startedAt);
    logScreen(label, 'FINAL', final);
    await readRoster(page, label, 'FINAL');

    note(`[${label}] ===== every status-counts publication =====`);
    for (const sample of await countsSeries(page)) note(`[${label}] counts ${JSON.stringify(sample)}`);
    note(
      `[${label}] VERDICT ${samples.length} sample(s); treasury ended ${String(final.counts?.treasuryMinorUnits)}` +
        ` at tick ${final.tick} after ${((Date.now() - startedAt) / 1000).toFixed(1)}s wall clock`,
    );
  });

  /**
   * **B -- the spendthrift prison.** Spend the grant and the standing overdraft
   * on staff nobody needs, reach the floor, and then try to get out of it.
   *
   * Hires rather than bricks, because a hire is the only spend that also
   * creates a recurring debit, and because a prison with no prisoners has no
   * income: whether *that* is recoverable is the question the act exists for.
   */
  test('B the spendthrift prison', async ({ page }) => {
    const label = 'B';
    const startedAt = Date.now();
    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    logScreen(label, 'OPENING', await readScreen(page, startedAt));

    await tab(page, 'manage').click();
    note(`[${label}] staff panel on arrival: ${JSON.stringify(await panelText(page, '.hud-staff'))}`);
    let hires = 0;
    let lastFunds = Number.NaN;
    for (let index = 0; index < 60; index += 1) {
      const hire = page.locator('.hud-staff__hire');
      if ((await hire.getAttribute('disabled')) !== null) {
        note(`[${label}] the Hire control went disabled after ${hires} hire(s)`);
        break;
      }
      await hire.click();
      await page.waitForTimeout(150);
      const counts = await latestCounts(page);
      const funds = counts?.treasuryMinorUnits ?? Number.NaN;
      // Every tenth, because sixty reads of two panels cost more wall clock
      // than the sixty hires do and the interesting hire is the last one.
      if (index % 10 === 0 || funds === lastFunds) {
        note(
          `[${label}] hire attempt ${index + 1}: staff=${String(counts?.staff)} funds=${String(funds)}` +
            ` wageBill=${String(counts?.dailyWageBillMinorUnits)}` +
            ` shortfall=${JSON.stringify(await panelText(page, '.hud-staff__hire-shortfall'))}` +
            ` refusal=${JSON.stringify(await panelText(page, '.hud__refusal'))}`,
        );
      }
      if (funds === lastFunds) {
        note(`[${label}] funds stopped moving at ${String(funds)}; the hire was refused rather than taken`);
        break;
      }
      lastFunds = funds;
      hires += 1;
    }
    note(`[${label}] staff panel after ${hires} hire(s): ${JSON.stringify(await panelText(page, '.hud-staff'))}`);
    logScreen(label, 'HIRED', await readScreen(page, startedAt));

    // Then buy, to take whatever is left of the grant down to the floor.
    await tab(page, 'build').click();
    await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
    if (await page.locator('.hud-build__buy').isHidden()) await page.locator('.hud-build__buy-toggle').click();
    for (const quantity of [100, 100, 50, 20, 10, 5, 2, 1]) {
      await page.locator('.hud-build__buy .ui-number__input').fill(String(quantity));
      await page.locator('.hud-build__buy-submit').click();
      await page.waitForTimeout(450);
      note(
        `[${label}] buy ${quantity} brick: funds=${String((await latestCounts(page))?.treasuryMinorUnits)}` +
          ` shortfall=${JSON.stringify(await panelText(page, '.hud-build__buy-shortfall'))}` +
          ` refusal=${JSON.stringify(await panelText(page, '.hud__refusal'))}`,
      );
    }
    logScreen(label, 'SPENT', await readScreen(page, startedAt));

    await fastForwardToMax(page);
    const falling = await runAndWatch(page, label, TICKS_PER_DAY * 4, startedAt);
    logScreen(label, 'AT THE FLOOR', await readScreen(page, startedAt));

    /*
     * Everything a player would reach for, at the floor, in the order they
     * would reach for it -- and **nothing here clicks a control that is
     * disabled.** The first draft did, and a `.hud-build__buy-submit` carrying
     * `aria-disabled="true"` ate the whole 600 s test budget in Playwright's
     * actionability retry loop. That the control is disabled *is* the reading,
     * so it is read rather than pressed.
     */
    await tab(page, 'build').click();
    const origin = await calibrate(page);
    await armBuildable(page, 'wall-brick');
    const wall = await press(page, origin.originX + 12 * TILE + TILE / 2, origin.originY + 12 * TILE);
    note(
      `[${label}] LEVER 1 place a wall: ${wall.length} command(s) ${JSON.stringify(wall)}` +
        ` funds=${String((await latestCounts(page))?.treasuryMinorUnits)}` +
        ` queue=${JSON.stringify(await panelText(page, '.hud-build__queue'))}` +
        ` refusal=${JSON.stringify(await panelText(page, '.hud__refusal'))}`,
    );

    await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
    if (await page.locator('.hud-build__buy').isHidden()) await page.locator('.hud-build__buy-toggle').click();
    await page.locator('.hud-build__buy .ui-number__input').fill('1');
    const submit = page.locator('.hud-build__buy-submit');
    note(
      `[${label}] LEVER 2 buy one brick: aria-disabled=${await submit.getAttribute('aria-disabled')}` +
        ` describedby=${await submit.getAttribute('aria-describedby')}` +
        ` shortfall=${JSON.stringify(await panelText(page, '.hud-build__buy-shortfall'))}` +
        ` buyRow=${JSON.stringify(await panelText(page, '.hud-build__buy'))}`,
    );

    await tab(page, 'manage').click();
    const hire = page.locator('.hud-staff__hire');
    note(
      `[${label}] LEVER 3 hire: aria-disabled=${await hire.getAttribute('aria-disabled')}` +
        ` shortfall=${JSON.stringify(await panelText(page, '.hud-staff__hire-shortfall'))}`,
    );

    // Lever 4: get rid of the payroll. The roster block is the only place a
    // dismissal can be pressed, so how many rows it offers is the reading.
    const heldRows = page.locator('.hud-staff__held-row');
    const heldCount = await heldRows.count();
    note(
      `[${label}] LEVER 4 dismiss: ${heldCount} row(s) in the DOM;` +
        ` held block = ${JSON.stringify(await panelText(page, '.hud-staff__held'))};` +
        ` held list = ${JSON.stringify(await panelText(page, '.hud-staff__held-list'))}`,
    );
    for (let row = 0; row < heldCount; row += 1) {
      const control = heldRows.nth(row).locator('button').first();
      // Read, do not press: an invisible disabled control eats the whole test
      // budget in Playwright's actionability retry, and the second act B run
      // died exactly there. Whether it *can* be pressed is the reading.
      note(
        `[${label}] LEVER 4 row ${row}: visible=${await control.isVisible()} enabled=${await control.isEnabled()}` +
          ` disabled=${await control.getAttribute('disabled')} text=${JSON.stringify(await control.innerText())}`,
      );
    }

    const admitted = await admitAsManyAsPossible(page, label, 3);
    note(`[${label}] LEVER 5 admit: ${admitted} admitted; refusal=${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
    logScreen(label, 'EVERY LEVER TRIED', await readScreen(page, startedAt));

    // And then left alone, to see whether the treasury moves on its own.
    const climbing = await runAndWatch(page, label, TICKS_PER_DAY * 8, startedAt);
    logScreen(label, 'FOUR MORE DAYS', await readScreen(page, startedAt));
    await tab(page, 'build').click();
    note(`[${label}] the wall ordered at the floor: queue=${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
    note(`[${label}] staff panel at the end: ${JSON.stringify(await panelText(page, '.hud-staff'))}`);

    note(`[${label}] ===== every status-counts publication =====`);
    for (const sample of await countsSeries(page)) note(`[${label}] counts ${JSON.stringify(sample)}`);
    note(`[${label}] samples: ${falling.length} spending down, ${climbing.length} left alone`);
  });

  /**
   * **D -- the control.** The same bare cell as act A, but with beds in it, so
   * the prisoners become residents rather than staying in intake forever.
   *
   * It exists to refute act A rather than to add to it. Act A read
   * `EARNED TODAY 0` for ten days with twenty-four prisoners on the roster,
   * and a zero that size is as easily a broken income line as a measured
   * consequence of neglect. If income credits here on the same build with only
   * beds added, act A's zero is the neglect and not the plumbing.
   */
  test('D the control prison that is paid', async ({ page }) => {
    const label = 'D';
    const startedAt = Date.now();
    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    logScreen(label, 'OPENING', await readScreen(page, startedAt));

    const origin = await buildABareCell(page, label);
    await tab(page, 'build').click();
    await buy(page, 'bed-wooden', 8);
    await page.waitForTimeout(2000);
    await armBuildable(page, 'bed-wooden');
    let beds = 0;
    for (const row of [13, 15]) {
      for (const column of [13, 14, 15]) {
        const point = centreOf(origin, column, row);
        const produced = await press(page, point.x, point.y);
        if (produced.length > 0) beds += 1;
        else note(`[${label}] bed at (${column},${row}) produced NO command`);
      }
    }
    note(`[${label}] ${beds} bed order(s) placed`);
    await waitForQueueEmpty(page);
    await page.waitForTimeout(2000);
    const furnished = await latestCounts(page);
    note(`[${label}] furnished: rooms=${String(furnished?.rooms)} roomCapacity=${String(furnished?.roomCapacity)} accommodation=${String(furnished?.accommodationCapacity)}`);

    const admitted = await admitAsManyAsPossible(page, label, 6);
    note(`[${label}] admitted ${admitted}`);
    await page.waitForTimeout(3000);
    logScreen(label, 'ADMITTED', await readScreen(page, startedAt));

    const samples = await runAndWatch(page, label, TICKS_PER_DAY * 6, startedAt);
    logScreen(label, 'FINAL', await readScreen(page, startedAt));
    await readRoster(page, label, 'FINAL');
    note(`[${label}] ===== every status-counts publication =====`);
    for (const sample of await countsSeries(page)) note(`[${label}] counts ${JSON.stringify(sample)}`);
    note(`[${label}] samples taken: ${samples.length}`);
  });

  /**
   * **C -- the idle prison.** New prison, no press of any kind, ten days.
   */
  test('C the idle prison', async ({ page }) => {
    const label = 'C';
    const startedAt = Date.now();
    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    logScreen(label, 'OPENING', await readScreen(page, startedAt));

    await fastForwardToMax(page);
    const samples = await runAndWatch(page, label, TEN_DAYS, startedAt);
    logScreen(label, 'FINAL', await readScreen(page, startedAt));
    note(`[${label}] ===== every status-counts publication =====`);
    for (const sample of await countsSeries(page)) note(`[${label}] counts ${JSON.stringify(sample)}`);
    note(`[${label}] samples taken: ${samples.length}`);
  });
});
