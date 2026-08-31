import { expect, test } from '@playwright/test';
import { buildAndPopulate, currentTick, fastForwardToMax, installTee, openApp, panelText, runUntilTick } from './playtest-harness';

/**
 * **`0 COVERAGE` under a green `Covered`, end to end.**
 *
 * The playtest record of 2026-08-31 — *"the alerts log was opened, and every
 * sentence in it is cut to thirteen characters"*, on the unmerged branch
 * `playtest/play-the-twelve` — measured this in act 2 §13 and could not say
 * where it came from: after `Save now` → reload → `Load`, a twelve-prisoner
 * prison read `12 PRISONERS`, `5 STAFF` and **`0 COVERAGE` with the green
 * `Covered` badge**, and stood there, because a loaded session is paused.
 *
 * The cause and the fix are proven headlessly and that is where the gate is:
 * `tests/integration/session-save-round-trip.test.ts`, *"publishes the coverage
 * the prison actually has on the tick it is restored, before any tick runs"*,
 * plus four unit cases on `SafetyCoverageSystem.takeCensus`. Those run in CI.
 *
 * **What this file adds is the one link those cannot make**: that the number the
 * restored worker publishes is the number painted on the chip, and that the
 * badge beside it changes with it. It exists because the finding was found on a
 * screenshot and a headless fix should be answerable on one.
 *
 * ## It is not a gate, and was not run
 *
 * Nothing in CI collects `.playtest.ts` and `playwright.playtest.config.ts` says
 * so. **This file was written and deliberately not executed**: the pass that
 * wrote it was forbidden to run a browser test, because another agent held
 * Playwright exclusively for the session. It is handed over unrun, and the
 * command that runs it is in the docblock below. Treat a first red from it as
 * "this assertion has never passed" rather than as a regression.
 *
 * ## Running it
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5231 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-restored-coverage.playtest.ts --reporter=line
 * ```
 *
 * `git lfs checkout` first if this is a worktree: `docs/AGENT_WORKFLOW.md`
 * records a playtest that ran green with no actor sprites at all.
 */

/** The chip's own value node, and the badge under it -- `[data-metric]` is the strip's DOM contract. */
const COVERAGE_VALUE = '[data-metric="coverage"] .ui-stat__value';
const COVERAGE_BADGE = '[data-metric="coverage"] .ui-badge';

test.describe('a restored prison states the coverage it actually has', () => {
  test('the coverage chip survives Save now -> reload -> Load without passing through zero', async ({ page }) => {
    test.setTimeout(900_000);

    const log = (line: string) => console.log(`[restored-coverage] ${line}`);
    page.on('pageerror', (error) => log(`PAGE ERROR: ${String(error)}`));

    await installTee(page);
    await openApp(page);

    // A prison with somebody standing in a guarded sector, which is the whole
    // precondition: with nobody in a sector the census is legitimately empty and
    // `Covered` is legitimately the right word.
    await buildAndPopulate(page, { beds: 4, admits: 4, guards: 1, label: 'restored-coverage' });
    await fastForwardToMax(page);
    // Past one `SafetyCoverageSystem` interval (10 ticks) with room to spare, so
    // the census the save is taken over is a walked one rather than the initial
    // empty one -- otherwise "before" and "after" would agree at zero and this
    // test would pass on the unfixed tree.
    await runUntilTick(page, (await currentTick(page)) + 200);

    const coveredBefore = (await page.locator(COVERAGE_VALUE).innerText()).trim();
    const badgeBefore = (await page.locator(COVERAGE_BADGE).innerText()).trim();
    log(`BEFORE SAVE: coverage=${JSON.stringify(coveredBefore)} badge=${JSON.stringify(badgeBefore)}`);
    // Not vacuous: a zero here means the prison was never covered and the
    // comparison below would hold for any implementation.
    expect(Number(coveredBefore.replace(/[^\d]/g, ''))).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Save now' }).click();
    await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ', { timeout: 30_000 });

    // A real navigation, not a state reset -- the same act the save-restore
    // playtest uses, and the reason `everAdmitted` and the alerts log are gone
    // afterwards.
    await installTee(page);
    await openApp(page);
    await page.locator('.save-panel__item').first().click();
    await expect(page.locator('[data-metric="prisoners"] .ui-stat__value')).toContainText('4', { timeout: 60_000 });

    // Read the chip WITHOUT pressing play. That is the state the finding is
    // about: `handleInitialize` publishes one counts readout and then nothing
    // steps the kernel until the player asks it to, so whatever is on the chip
    // here is what the player sits looking at.
    const coveredAfter = (await page.locator(COVERAGE_VALUE).innerText()).trim();
    const badgeAfter = (await page.locator(COVERAGE_BADGE).innerText()).trim();
    log(`AFTER LOAD:  coverage=${JSON.stringify(coveredAfter)} badge=${JSON.stringify(badgeAfter)}`);
    log(`save panel:  ${await panelText(page, '.save-panel')}`);

    expect(coveredAfter, 'the coverage chip after a load must read what it read before the save').toBe(coveredBefore);
    expect(badgeAfter, 'and its badge with it -- a green Covered over a 0 is the finding').toBe(badgeBefore);
  });
});
