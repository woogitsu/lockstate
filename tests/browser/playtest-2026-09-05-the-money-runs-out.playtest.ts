/**
 * **Playing a prison broke, deliberately** — 2026-09-05, v0.0.475 (`b984445f`).
 *
 * The question, as given: money is this game's only resource and its only
 * pressure. *Can a player actually run out? And when they do, does the game
 * tell them what is happening, what it costs, and what to do?*
 *
 * `docs/research/2026-09-04-can-this-prison-fail.md` is the baseline and it
 * already answered "can it fail" with **yes, exactly once** — an *empty*
 * prison that hires sixty guards pins at the overdraft floor with an income
 * line it cannot restart. That record names its own gap:
 *
 * > *"That −2,500 is unreachable for a prison that already earns. Every act
 * > measured here started from an empty prison. […] that is the interesting
 * > one for balance; this record only shows that the empty version of it is
 * > terminal."*
 *
 * **Act 2 is that gap.** A prison that houses people, earns every day, and is
 * then over-hired into the floor — and then tries to climb out with the only
 * lever a player has.
 *
 * **Act 1 is a re-check, not a re-derivation.**
 * `docs/research/2026-08-30-playing-into-the-lock.md` measured the wall route
 * at v0.0.257 (312 segments funded, the 313th refused, **40 left**) and
 * refuted #641's *"a single sustained drag reaches it"*. Two hundred versions
 * and two owner rulings on the insolvency ladder later, the two figures that
 * record rests on — the floor a Buy press stops at and the floor a drag stops
 * at — are no longer the same number as each other and neither is zero. Act 1
 * measures both at this version.
 *
 * **Nothing in CI collects this file.** `tests/browser/playwright.config.ts`
 * is `testMatch: /.*\.spec\.ts$/`; this is `.playtest.ts` and is evidence,
 * never a gate.
 *
 * Run one act at a time, from the worktree root:
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5328 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-2026-09-05-the-money-runs-out.playtest.ts -g "act 1"
 * ```
 */
import { expect, test, type Page } from '@playwright/test';
import {
  TILE,
  armBuildable,
  buildAndPopulate,
  calibrate,
  countsSeries,
  currentTick,
  drag,
  installTee,
  latestCounts,
  openApp,
  panelText,
  sentCommands,
  tab,
} from './playtest-harness';

/** One line of evidence. Everything this file claims comes out of these. */
const say = (act: string, line: string): void => {
  console.log(`[${act}] ${line}`);
};

/** The status strip's own chips, read as the player reads them. */
async function chips(page: Page): Promise<string> {
  return (await panelText(page, '.hud-strip__metrics')).replace(/\n/g, ' | ');
}

/** One chip, plus every attribute that could make it look different. */
async function fundsChip(page: Page): Promise<Record<string, string | null>> {
  return page.evaluate(() => {
    const chip = document.querySelector<HTMLElement>('.hud-strip [data-metric="funds"]');
    if (chip === null) return { present: 'no' };
    const style = getComputedStyle(chip);
    return {
      present: 'yes',
      text: (chip.innerText ?? '').replace(/\n/g, ' | '),
      tone: chip.getAttribute('data-tone'),
      title: chip.getAttribute('title'),
      ariaLabel: chip.getAttribute('aria-label'),
      className: chip.className,
      color: style.color,
      background: style.backgroundColor,
      borderColor: style.borderColor,
    } as Record<string, string | null>;
  });
}

/** Every sentence the game is saying right now, from the four places it says them. */
async function sentences(page: Page): Promise<Record<string, string>> {
  return {
    refusal: await panelText(page, '.hud__refusal'),
    band: await panelText(page, '.hud__event'),
    alerts: (await panelText(page, '.hud-alerts__list')).replace(/\n/g, ' / '),
  };
}

/**
 * Presses the Buy control and reports what the interface did, without assuming
 * it did anything. `buy()` in the harness clicks the submit unconditionally;
 * at the floor that control is `aria-disabled` rather than `disabled`, so the
 * click lands and submits nothing, which is exactly the case being measured.
 */
async function attemptBuy(
  page: Page,
  buildableId: string,
  quantity: number,
): Promise<{ submitted: number; shortfall: string; ariaDisabled: string | null; total: string }> {
  await page.locator(`.hud-build__list [data-buildable="${buildableId}"]`).click();
  const buyRow = page.locator('.hud-build__buy');
  if (await buyRow.isHidden()) await page.locator('.hud-build__buy-toggle').click();
  await page.locator('.hud-build__buy .ui-number__input').fill(String(quantity));
  await page.waitForTimeout(250);
  const submit = page.locator('.hud-build__buy-submit');
  const ariaDisabled = await submit.getAttribute('aria-disabled');
  const total = (await panelText(page, '.hud-build__buy')).replace(/\n/g, ' | ');
  const before = (await sentCommands(page)).length;
  await submit.click({ force: true });
  await page.waitForTimeout(400);
  const after = (await sentCommands(page)).length;
  return {
    submitted: after - before,
    shortfall: await panelText(page, '.hud-build__buy-shortfall'),
    ariaDisabled,
    total,
  };
}

/** What is actually under a point, before a press is trusted to have landed. */
async function whatIsUnder(page: Page, x: number, y: number): Promise<string> {
  return page.evaluate(
    ({ px, py }) => {
      const node = document.elementFromPoint(px, py);
      if (node === null) return 'nothing';
      return `${node.tagName.toLowerCase()}${node.className === '' ? '' : `.${String(node.className).split(' ')[0]}`}`;
    },
    { px: x, py: y },
  );
}

test.describe('The money runs out', () => {
  test.beforeEach(async ({ page }) => {
    await installTee(page);
    await openApp(page);
  });

  /**
   * **act 1 — how far one gesture goes, and where the two floors are now.**
   *
   * Not a re-derivation of `2026-08-30-playing-into-the-lock.md`. That record
   * measured one floor, at zero-ish (*"40 left"*), before ADR 0017's two
   * amendments of 2026-09-01 gave the ladder rungs below zero. This act asks
   * what a player meets at v0.0.475: what the catalogue says a wall costs
   * before the drag, what one drag spends, whether anything at all changes on
   * screen while it does, and the exact balance at which each of the two
   * presses that spend money is finally refused.
   */
  test('act 1 — one gesture, one price nobody showed, and the two floors', async ({ page }) => {
    test.setTimeout(600_000);
    const act = 'act1';

    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await tab(page, 'build').click();

    // ---- what the catalogue tells a player a wall costs, before any press ---
    say(act, `catalogue rows: ${JSON.stringify(await panelText(page, '.hud-build__list'))}`);
    await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
    await page.waitForTimeout(200);
    say(act, `whole Build panel with wall-brick selected: ${JSON.stringify(await panelText(page, '.hud-build'))}`);
    say(act, `arm control label: ${JSON.stringify((await page.locator('.hud-build__arm').innerText()).trim())}`);
    say(act, `arm hint: ${JSON.stringify(await panelText(page, '.hud-build__arm-hint'))}`);
    say(act, `buy row before its fold is opened: ${JSON.stringify(await panelText(page, '.hud-build__buy'))}`);
    await page.locator('.hud-build__buy-toggle').click();
    await page.waitForTimeout(200);
    say(act, `buy row with the fold open: ${JSON.stringify(await panelText(page, '.hud-build__buy'))}`);
    say(act, `funds chip at the start: ${JSON.stringify(await fundsChip(page))}`);
    say(act, `chips at the start: ${await chips(page)}`);

    const origin = await calibrate(page);
    say(act, `calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);

    // ---- one drag, priced -------------------------------------------------
    /*
     * The tile grid is where the *camera* put it, not where a tile index
     * suggests: this run calibrated tile (0,0) to (-304, -574), so tile row 4
     * is 318 pixels above the top of the window and every press aimed at it
     * landed on nothing. The first run of this act lost eight drags that way
     * and reported `0 command(s)` for each, which reads exactly like a game
     * refusing a gesture. So the tile range is derived from the screen box
     * the world actually occupies, and every drag start is checked against
     * `document.elementFromPoint` before it is trusted.
     */
    const firstColumn = Math.ceil((90 - origin.originX) / TILE);
    const lastColumn = Math.floor((980 - origin.originX) / TILE);
    const firstRow = Math.ceil((90 - origin.originY) / TILE);
    const lastRow = Math.floor((820 - origin.originY) / TILE);
    say(act, `world on screen: tile columns ${firstColumn}..${lastColumn}, tile rows ${firstRow}..${lastRow}`);

    // The horizontal edge line at the top of tile row `row`, from tile column
    // `from` to `to`. A wall run along an edge produces one segment per tile.
    const edgeRun = (row: number, from: number, to: number) => ({
      a: { x: origin.originX + from * TILE + TILE / 2, y: origin.originY + row * TILE },
      b: { x: origin.originX + to * TILE - TILE / 2, y: origin.originY + row * TILE },
    });

    await armBuildable(page, 'wall-brick');

    const firstRun = edgeRun(firstRow + 1, firstColumn, lastColumn);
    say(act, `under the drag start (${firstRun.a.x},${firstRun.a.y}): ${await whatIsUnder(page, firstRun.a.x, firstRun.a.y)}`);
    say(act, `under the drag end (${firstRun.b.x},${firstRun.b.y}): ${await whatIsUnder(page, firstRun.b.x, firstRun.b.y)}`);

    const beforeFirst = (await latestCounts(page))?.treasuryMinorUnits;
    const commandsBefore = (await sentCommands(page)).length;
    await drag(page, firstRun.a, firstRun.b);
    await page.waitForTimeout(1200);
    const producedFirst = (await sentCommands(page)).slice(commandsBefore);
    const afterFirst = (await latestCounts(page))?.treasuryMinorUnits;
    say(
      act,
      `ONE DRAG: ${producedFirst.length} command(s), funds ${String(beforeFirst)} -> ${String(afterFirst)}` +
        ` = ${String((beforeFirst ?? 0) - (afterFirst ?? 0))} spent`,
    );
    say(act, `funds chip right after that drag: ${JSON.stringify(await fundsChip(page))}`);
    say(act, `sentences right after that drag: ${JSON.stringify(await sentences(page))}`);

    // ---- keep dragging, one screenful, reading after every gesture ---------
    let drags = 1;
    let spent = (beforeFirst ?? 0) - (afterFirst ?? 0);
    for (let row = firstRow + 2; row <= lastRow; row += 1) {
      const run = edgeRun(row, firstColumn, lastColumn);
      const under = await whatIsUnder(page, run.a.x, run.a.y);
      if (under !== 'canvas' && !under.startsWith('canvas')) {
        say(act, `SKIPPED row ${row}: the drag start is over ${under}, not the world`);
        continue;
      }
      const before = (await latestCounts(page))?.treasuryMinorUnits ?? 0;
      const sentBefore = (await sentCommands(page)).length;
      await drag(page, run.a, run.b);
      await page.waitForTimeout(900);
      const after = (await latestCounts(page))?.treasuryMinorUnits ?? 0;
      drags += 1;
      spent += before - after;
      say(
        act,
        `drag ${drags} (row ${row}): ${(await sentCommands(page)).length - sentBefore} command(s),` +
          ` funds ${before} -> ${after}, running total spent ${spent}` +
          ` | chip ${JSON.stringify((await fundsChip(page))['text'])}` +
          ` | tone ${JSON.stringify((await fundsChip(page))['tone'])}` +
          ` | refusal ${JSON.stringify(await panelText(page, '.hud__refusal'))}`,
      );
    }
    say(act, `after ${drags} drags: chips = ${await chips(page)}`);
    say(act, `after ${drags} drags: sentences = ${JSON.stringify(await sentences(page))}`);
    say(act, `after ${drags} drags: funds chip = ${JSON.stringify(await fundsChip(page))}`);

    // ---- now drain the rest through the priced control, and find its floor -
    // The Buy control spends under `'deliveries'`. A fresh prison with nothing
    // furnished is on the starter rung, which is shallower than the mature one.
    for (;;) {
      const balance = (await latestCounts(page))?.treasuryMinorUnits ?? 0;
      const bricks = Math.floor((balance - 200) / 40);
      if (bricks < 1) break;
      const result = await attemptBuy(page, 'wall-brick', bricks);
      const after = (await latestCounts(page))?.treasuryMinorUnits ?? 0;
      say(act, `BUY ${bricks} bricks: submitted=${result.submitted} funds ${balance} -> ${after} | row ${JSON.stringify(result.total)}`);
      if (after === balance) break;
    }
    /*
     * Down to the unit, reading the chip after every single press. The point
     * of one-at-a-time here is the *boundary*: `overdraftTone` returns
     * `undefined` for any `treasuryMinorUnits >= 0`
     * (`src/ui/hud/projection.ts`), so the balance at which the first word
     * about money appears is a thing a press can be stood either side of.
     */
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const balance = (await latestCounts(page))?.treasuryMinorUnits ?? 0;
      const result = await attemptBuy(page, 'wall-brick', 1);
      const after = (await latestCounts(page))?.treasuryMinorUnits ?? 0;
      const chip = await fundsChip(page);
      say(
        act,
        `BUY 1 brick at balance ${balance}: submitted=${result.submitted}` +
          ` aria-disabled=${String(result.ariaDisabled)} -> ${after}` +
          ` | shortfall ${JSON.stringify(result.shortfall)}` +
          ` | chip ${JSON.stringify(chip['text'])} tone ${JSON.stringify(chip['tone'])}`,
      );
      if (after === balance) {
        say(act, `THE DELIVERIES FLOOR: the last balance a Buy press was accepted from, and the refusal, are above. Balance now ${after}.`);
        break;
      }
    }
    say(act, `at the deliveries refusal: chips = ${await chips(page)}`);
    say(act, `at the deliveries refusal: funds chip = ${JSON.stringify(await fundsChip(page))}`);
    say(act, `at the deliveries refusal: sentences = ${JSON.stringify(await sentences(page))}`);

    // ---- and the drag, which spends under a different class ----------------
    await armBuildable(page, 'wall-brick');
    for (let row = firstRow; row <= lastRow; row += 2) {
      const run = edgeRun(row, firstColumn, lastColumn);
      const under = await whatIsUnder(page, run.a.x, run.a.y);
      if (!under.startsWith('canvas')) {
        say(act, `SKIPPED row ${row}: over ${under}`);
        continue;
      }
      const before = (await latestCounts(page))?.treasuryMinorUnits ?? 0;
      await drag(page, run.a, run.b);
      await page.waitForTimeout(900);
      const after = (await latestCounts(page))?.treasuryMinorUnits ?? 0;
      say(
        act,
        `DRAG PAST THE BUY FLOOR (row ${row}): funds ${before} -> ${after}` +
          ` | queue ${JSON.stringify(await panelText(page, '.hud-build__queue'))}` +
          ` | refusal ${JSON.stringify(await panelText(page, '.hud__refusal'))}`,
      );
      if (after === before) break;
    }
    say(act, `END OF ACT 1: chips = ${await chips(page)}`);
    say(act, `END OF ACT 1: funds chip = ${JSON.stringify(await fundsChip(page))}`);
    say(act, `END OF ACT 1: sentences = ${JSON.stringify(await sentences(page))}`);
    say(act, `END OF ACT 1: counts = ${JSON.stringify(await latestCounts(page))}`);
  });

  /**
   * **act 2 — the prison that earns, spends past its income, and tries to come
   * back.** The gap `2026-09-04-can-this-prison-fail.md` names in its own
   * "What this record does not claim".
   *
   * Four beds, four residents — a prison the state actually pays for — then a
   * payroll it cannot carry, then the only lever a player has: dismissal.
   */
  test('act 2 — an earning prison, over-hired, and the climb back', async ({ page }) => {
    test.setTimeout(1_500_000);
    const act = 'act2';

    // ---- a prison that earns ----------------------------------------------
    await buildAndPopulate(page, { beds: 4, admits: 4, guards: 0, label: act });
    const built = await latestCounts(page);
    say(act, `BUILT: ${JSON.stringify(built)}`);
    say(act, `BUILT chips: ${await chips(page)}`);

    // ---- how much does this prison earn, before anything is spent? --------
    const solventFrom = await currentTick(page);
    await page.waitForTimeout(70_000);
    const solventSeries = await countsSeries(page);
    say(
      act,
      `EARNING BASELINE, samples from tick ${solventFrom}: ` +
        JSON.stringify(
          solventSeries
            .filter((s) => s.tick >= solventFrom)
            .map((s) => `t${s.tick} funds=${s.treasuryMinorUnits} accrued=${s.stateIncomeAccruedTodayMinorUnits} residents=${s.roomOccupants}`),
        ),
    );

    // ---- over-hire --------------------------------------------------------
    await tab(page, 'security').click();
    const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
    if ((await guardRow.count()) > 0) await guardRow.first().click();
    say(act, `hire control reads: ${JSON.stringify((await page.locator('.hud-staff__hire').innerText()).trim())}`);
    say(act, `staff panel before hiring: ${JSON.stringify(await panelText(page, '.hud-staff'))}`);

    const TARGET_GUARDS = 30;
    for (let index = 0; index < TARGET_GUARDS; index += 1) {
      await page.locator('.hud-staff__hire').click();
      await page.waitForTimeout(220);
    }
    await page.waitForTimeout(2000);
    const hired = await latestCounts(page);
    say(act, `HIRED ${TARGET_GUARDS}: ${JSON.stringify(hired)}`);
    say(act, `HIRED chips: ${await chips(page)}`);
    say(act, `staff panel after hiring: ${JSON.stringify(await panelText(page, '.hud-staff'))}`);
    say(act, `funds chip after hiring: ${JSON.stringify(await fundsChip(page))}`);
    say(act, `sentences after hiring: ${JSON.stringify(await sentences(page))}`);

    // ---- and spend the rest, so the wage bill is what does the rest -------
    await tab(page, 'build').click();
    for (;;) {
      const balance = (await latestCounts(page))?.treasuryMinorUnits ?? 0;
      const bricks = Math.floor((balance - 300) / 40);
      if (bricks < 1) break;
      const result = await attemptBuy(page, 'wall-brick', bricks);
      const after = (await latestCounts(page))?.treasuryMinorUnits ?? 0;
      say(act, `DRAINED with ${bricks} bricks: submitted=${result.submitted} funds ${balance} -> ${after}`);
      if (after === balance) break;
    }
    const drained = await latestCounts(page);
    say(act, `DRAINED: ${JSON.stringify(drained)}`);
    say(act, `DRAINED chips: ${await chips(page)}`);
    say(act, `DRAINED funds chip: ${JSON.stringify(await fundsChip(page))}`);
    say(act, `DRAINED sentences: ${JSON.stringify(await sentences(page))}`);

    // ---- now watch it go under, day by day, reading both channels ---------
    const sinkFrom = await currentTick(page);
    for (let sample = 0; sample < 26; sample += 1) {
      await page.waitForTimeout(12_000);
      const counts = await latestCounts(page);
      say(
        act,
        `SINK t${await currentTick(page)}: funds=${counts?.treasuryMinorUnits} arrears=${counts?.unpaidWagesMinorUnits}` +
          ` bill=${counts?.dailyWageBillMinorUnits} accrued=${counts?.stateIncomeAccruedTodayMinorUnits}` +
          ` residents=${counts?.roomOccupants} staff=${counts?.staff}` +
          ` | day ${await page.locator('.hud-clock__day').innerText()}` +
          ` | chip ${JSON.stringify((await fundsChip(page))['text'])} tone ${JSON.stringify((await fundsChip(page))['tone'])}`,
      );
    }
    const sunk = await latestCounts(page);
    say(act, `SUNK after ${(await currentTick(page)) - sinkFrom} ticks: ${JSON.stringify(sunk)}`);
    say(act, `SUNK chips: ${await chips(page)}`);
    say(act, `SUNK funds chip: ${JSON.stringify(await fundsChip(page))}`);
    say(act, `SUNK sentences: ${JSON.stringify(await sentences(page))}`);
    await tab(page, 'security').click();
    say(act, `SUNK staff panel: ${JSON.stringify(await panelText(page, '.hud-staff'))}`);
    await tab(page, 'build').click();
    say(act, `SUNK build panel: ${JSON.stringify(await panelText(page, '.hud-build'))}`);
    await tab(page, 'overview').click();
    say(act, `SUNK intake panel: ${JSON.stringify(await panelText(page, '.hud-intake'))}`);

    // ---- the climb back: dismissal is the only lever -----------------------
    await tab(page, 'security').click();
    const rosterHeader = page.locator('.hud-staff__roster .ui-section__header');
    say(act, `roster section present: ${await rosterHeader.count()}`);
    say(act, `roster header text before opening: ${JSON.stringify(await panelText(page, '.hud-staff__roster'))}`);
    await rosterHeader.first().click();
    await page.waitForTimeout(800);
    say(act, `roster opened: ${JSON.stringify(await panelText(page, '.hud-staff__roster'))}`);
    say(
      act,
      `roster rows: ${JSON.stringify(
        await page.evaluate(() =>
          Array.from(document.querySelectorAll<HTMLElement>('.hud-staff__roster-row')).map((row) => ({
            text: (row.innerText ?? '').replace(/\n/g, ' | '),
            visible: row.getClientRects().length > 0,
            bottom: Math.round(row.getBoundingClientRect().bottom),
          })),
        ),
      )}`,
    );
    say(act, `overflow line: ${JSON.stringify(await panelText(page, '.hud-staff__held-more'))}`);

    const dismissStarted = Date.now();
    let dismissals = 0;
    let presses = 0;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const staffNow = (await latestCounts(page))?.staff ?? 0;
      if (staffNow === 0) break;
      const controls = page.locator('.hud-staff__roster-row button');
      const count = await controls.count();
      if (count === 0) {
        say(act, `no dismiss control on screen at attempt ${attempt}; staff=${staffNow}`);
        break;
      }
      const first = controls.first();
      if (!(await first.isVisible())) {
        say(act, `dismiss control ${attempt} is not visible; staff=${staffNow}`);
        break;
      }
      await first.click();
      presses += 1;
      await page.waitForTimeout(150);
      const confirmation = await panelText(page, '.hud-staff__dismiss-confirm');
      const beforeStaff = (await latestCounts(page))?.staff ?? 0;
      await first.click();
      presses += 1;
      await page.waitForTimeout(1200);
      const afterStaff = (await latestCounts(page))?.staff ?? 0;
      if (afterStaff < beforeStaff) dismissals += beforeStaff - afterStaff;
      if (attempt < 4 || afterStaff === beforeStaff) {
        say(
          act,
          `dismissal ${attempt}: confirmation said ${JSON.stringify(confirmation)}` +
            ` | staff ${beforeStaff} -> ${afterStaff}` +
            ` | funds ${(await latestCounts(page))?.treasuryMinorUnits}`,
        );
      }
      if (afterStaff === beforeStaff) {
        say(act, `a dismissal did not take at attempt ${attempt}; stopping the loop`);
        break;
      }
    }
    const afterDismissals = await latestCounts(page);
    say(
      act,
      `DISMISSED ${dismissals} in ${presses} presses over ${Math.round((Date.now() - dismissStarted) / 1000)} wall seconds:` +
        ` ${JSON.stringify(afterDismissals)}`,
    );
    say(act, `AFTER DISMISSAL chips: ${await chips(page)}`);
    say(act, `AFTER DISMISSAL staff panel: ${JSON.stringify(await panelText(page, '.hud-staff'))}`);
    say(act, `AFTER DISMISSAL sentences: ${JSON.stringify(await sentences(page))}`);

    // ---- and does it recover? ----------------------------------------------
    const recoveryFrom = await currentTick(page);
    for (let sample = 0; sample < 30; sample += 1) {
      await page.waitForTimeout(12_000);
      const counts = await latestCounts(page);
      say(
        act,
        `RECOVER t${await currentTick(page)}: funds=${counts?.treasuryMinorUnits} arrears=${counts?.unpaidWagesMinorUnits}` +
          ` bill=${counts?.dailyWageBillMinorUnits} accrued=${counts?.stateIncomeAccruedTodayMinorUnits}` +
          ` residents=${counts?.roomOccupants} staff=${counts?.staff}` +
          ` | day ${await page.locator('.hud-clock__day').innerText()}` +
          ` | chip ${JSON.stringify((await fundsChip(page))['text'])}`,
      );
      if ((counts?.treasuryMinorUnits ?? -1) > 0 && (counts?.unpaidWagesMinorUnits ?? 1) === 0) {
        say(act, `RECOVERED at tick ${await currentTick(page)}, ${(await currentTick(page)) - recoveryFrom} ticks after the last dismissal`);
        break;
      }
    }
    say(act, `END OF ACT 2 counts: ${JSON.stringify(await latestCounts(page))}`);
    say(act, `END OF ACT 2 chips: ${await chips(page)}`);
    say(act, `END OF ACT 2 sentences: ${JSON.stringify(await sentences(page))}`);
    say(
      act,
      `END OF ACT 2 series: ${JSON.stringify(
        (await countsSeries(page)).map(
          (s) => `t${s.tick} f=${s.treasuryMinorUnits} a=${s.unpaidWagesMinorUnits} b=${s.dailyWageBillMinorUnits} r=${s.roomOccupants} s=${s.staff}`,
        ),
      )}`,
    );
  });

  /**
   * **act 3 — the same prison, and the one thing act 2 cannot ask.**
   *
   * Act 2 dismisses. This act does not: it leaves the payroll standing at the
   * floor and asks whether a prison that *is* earning can be held there for
   * ever, which is the difference between "insolvency is a state" (ADR 0049)
   * and "the run is over" (`2026-09-04-can-this-prison-fail.md` finding 1).
   */
  test('act 3 — held at the floor while the state keeps paying', async ({ page }) => {
    test.setTimeout(1_500_000);
    const act = 'act3';

    await buildAndPopulate(page, { beds: 4, admits: 4, guards: 0, label: act });
    say(act, `BUILT: ${JSON.stringify(await latestCounts(page))}`);

    await tab(page, 'security').click();
    const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
    if ((await guardRow.count()) > 0) await guardRow.first().click();
    for (let index = 0; index < 30; index += 1) {
      await page.locator('.hud-staff__hire').click();
      await page.waitForTimeout(220);
    }
    await page.waitForTimeout(1500);
    say(act, `HIRED: ${JSON.stringify(await latestCounts(page))}`);

    await tab(page, 'build').click();
    for (;;) {
      const balance = (await latestCounts(page))?.treasuryMinorUnits ?? 0;
      const bricks = Math.floor((balance - 300) / 40);
      if (bricks < 1) break;
      await attemptBuy(page, 'wall-brick', bricks);
      const after = (await latestCounts(page))?.treasuryMinorUnits ?? 0;
      if (after === balance) break;
    }
    say(act, `DRAINED: ${JSON.stringify(await latestCounts(page))}`);

    await tab(page, 'overview').click();
    for (let sample = 0; sample < 60; sample += 1) {
      await page.waitForTimeout(12_000);
      const counts = await latestCounts(page);
      say(
        act,
        `HELD t${await currentTick(page)}: funds=${counts?.treasuryMinorUnits} arrears=${counts?.unpaidWagesMinorUnits}` +
          ` accrued=${counts?.stateIncomeAccruedTodayMinorUnits} residents=${counts?.roomOccupants} staff=${counts?.staff}` +
          ` | day ${await page.locator('.hud-clock__day').innerText()}` +
          ` | alerts ${JSON.stringify((await panelText(page, '.hud-alerts__list')).replace(/\n/g, ' / '))}`,
      );
    }
    say(act, `END OF ACT 3 counts: ${JSON.stringify(await latestCounts(page))}`);
    say(act, `END OF ACT 3 chips: ${await chips(page)}`);
    say(act, `END OF ACT 3 sentences: ${JSON.stringify(await sentences(page))}`);
  });
});
