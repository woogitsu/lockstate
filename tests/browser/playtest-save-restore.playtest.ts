import { expect, test } from '@playwright/test';
import {
  buildAndPopulate,
  countsSeries,
  currentTick,
  fastForwardToMax,
  installTee,
  latestCounts,
  openApp,
  panelText,
  runUntilTick,
  type CountsSample,
} from './playtest-harness';

/**
 * A playtest of the one thing a player does that no amount of building
 * survives without: **close the game and come back to it.**
 *
 * The owner's standing brief is *"znajdź bugi i błędy grając, bo ja nie
 * mogłem postawić więzienia itp grając sam"* -- find defects by playing,
 * because I could not build a prison on my own. Every playtest so far has
 * played forward from an empty prison and stopped. This one plays forward,
 * **saves, navigates away for real, comes back, loads, and keeps playing**,
 * because a prison that does not survive that is not a prison anybody can
 * build across two sittings.
 *
 * ## The question, and why the last step is the one that matters
 *
 * Reading back a roster count proves the save carried a number. It does not
 * prove the restored prison still *works*. The interesting failure is a
 * prison that restores looking correct -- right prisoner count, right rooms,
 * right funds -- and then **stops earning**, because state income is derived
 * per resident of a room instance (`stateIncomeForCompletedDay` walks
 * `roomInstances.residentIds()`), and a residency link is exactly the kind of
 * derived edge a restore can silently drop while every count still reads
 * right.
 *
 * So the last act is deliberately not an assertion about the load screen: it
 * runs the restored prison **past an in-game day boundary** and reads what
 * was actually credited, against what the same prison earned before the
 * reload.
 *
 * ## What it is not
 *
 * Not a gate. Nothing in CI collects `.playtest.ts`, and
 * `playwright.playtest.config.ts` says so. Its output is the deliverable.
 */

const DAY_TICKS = 2_400;

/** The fields worth comparing across a reload, in one place so the diff is one loop. */
const COMPARED = [
  'prisoners',
  'prisonersInIntake',
  'rooms',
  'roomCapacity',
  'accommodationCapacity',
  'roomOccupants',
  'treasuryMinorUnits',
  'staff',
  'dailyWageBillMinorUnits',
] as const satisfies readonly (keyof CountsSample)[];

function diff(before: CountsSample, after: CountsSample): string[] {
  const out: string[] = [];
  for (const key of COMPARED) {
    if (before[key] !== after[key]) out.push(`${key}: ${before[key]} -> ${after[key]}`);
  }
  return out;
}

test.describe('playtest: does a prison survive being closed and reopened', () => {
  test('build it, save it, reload the page, load it, and run it another day', async ({ page }) => {
    test.setTimeout(900_000);

    const log = (line: string) => console.log(`[save-restore] ${line}`);
    page.on('console', (m) => {
      if (m.type() === 'debug') return;
      if (m.type() === 'error' || m.type() === 'warning') log(`PAGE ${m.type()}: ${m.text()}`);
    });
    page.on('pageerror', (e) => log(`PAGE ERROR: ${String(e)}`));

    await installTee(page);
    await openApp(page);

    // ---- act 1: build a prison a player would recognise --------------------
    await buildAndPopulate(page, { beds: 4, admits: 4, guards: 1, label: 'save-restore' });
    await fastForwardToMax(page);

    const tickAfterBuild = await currentTick(page);
    log(`built at tick ${tickAfterBuild}`);

    // Run to the first day boundary so the prison has EARNED once before the
    // reload. Without this the comparison below has no "before" to make.
    const firstBoundary = (Math.floor(tickAfterBuild / DAY_TICKS) + 1) * DAY_TICKS;
    await runUntilTick(page, firstBoundary + 60);
    const beforeSeries = await countsSeries(page);
    const preSaveBefore = [...beforeSeries].filter((s) => s.tick < firstBoundary).pop();
    const preSaveAfter = beforeSeries.find((s) => s.tick >= firstBoundary);
    const earnedBeforeReload =
      preSaveBefore !== undefined && preSaveAfter !== undefined
        ? preSaveAfter.treasuryMinorUnits - preSaveBefore.treasuryMinorUnits
        : Number.NaN;
    log(`FIRST DAY BOUNDARY at ${firstBoundary}: treasury delta = ${earnedBeforeReload}`);
    log(`  last before: ${JSON.stringify(preSaveBefore)}`);
    log(`  first after: ${JSON.stringify(preSaveAfter)}`);

    const beforeSave = await latestCounts(page);
    log(`STATE BEFORE SAVE: ${JSON.stringify(beforeSave)}`);
    log(`save panel: ${await panelText(page, '.save-panel')}`);
    log(`overview:   ${await panelText(page, '.hud-overview')}`);

    // ---- act 2: save, and read back what the panel claims ------------------
    await page.getByRole('button', { name: 'Save now' }).click();
    await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ', { timeout: 30_000 });
    const savedStatus = await panelText(page, '.save-panel__status');
    const savedLabel = await panelText(page, '.save-panel__item-label');
    log(`SAVED: status=${JSON.stringify(savedStatus)} label=${JSON.stringify(savedLabel)}`);

    // ---- act 3: a REAL navigation, not a state reset -----------------------
    await installTee(page);
    await openApp(page);
    log(`after reload, save panel: ${await panelText(page, '.save-panel')}`);
    log(`after reload, overview:   ${await panelText(page, '.hud-overview')}`);

    const relabel = await panelText(page, '.save-panel__item-label');
    log(`the prison is ${relabel === `${'.save-panel__item-label'}: ABSENT` ? 'GONE' : 'listed'} after reload: ${JSON.stringify(relabel)}`);

    // ---- act 4: load it ----------------------------------------------------
    await page.locator('.save-panel__item').first().click();
    await page.waitForTimeout(3_000);
    log(`after clicking the save row, panel: ${await panelText(page, '.save-panel')}`);

    let afterLoad = await latestCounts(page);
    for (let i = 0; i < 20 && (afterLoad === undefined || afterLoad.prisoners <= 0); i += 1) {
      await page.waitForTimeout(1_000);
      afterLoad = await latestCounts(page);
    }
    log(`STATE AFTER LOAD:  ${JSON.stringify(afterLoad)}`);

    if (beforeSave !== undefined && afterLoad !== undefined) {
      const changed = diff(beforeSave, afterLoad);
      log(changed.length === 0 ? 'RESTORE DIFF: none of the compared fields moved' : `RESTORE DIFF: ${changed.join(' | ')}`);
    }

    // ---- act 5: THE ONE THAT MATTERS -- does it still earn? ---------------
    await fastForwardToMax(page);
    const tickAfterLoad = await currentTick(page);
    const secondBoundary = (Math.floor(tickAfterLoad / DAY_TICKS) + 1) * DAY_TICKS;
    log(`restored prison is at tick ${tickAfterLoad}; running to ${secondBoundary + 60}`);
    await runUntilTick(page, secondBoundary + 60, 300_000);

    const afterSeries = await countsSeries(page);
    const postBefore = [...afterSeries].filter((s) => s.tick < secondBoundary).pop();
    const postAfter = afterSeries.find((s) => s.tick >= secondBoundary);
    const earnedAfterReload =
      postBefore !== undefined && postAfter !== undefined
        ? postAfter.treasuryMinorUnits - postBefore.treasuryMinorUnits
        : Number.NaN;

    log(`SECOND DAY BOUNDARY at ${secondBoundary}: treasury delta = ${earnedAfterReload}`);
    log(`  last before: ${JSON.stringify(postBefore)}`);
    log(`  first after: ${JSON.stringify(postAfter)}`);
    log(`VERDICT: earned ${earnedBeforeReload} before the reload and ${earnedAfterReload} after it`);
    log(`final overview: ${await panelText(page, '.hud-overview')}`);
  });
});
