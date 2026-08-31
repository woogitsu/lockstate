import { expect, test } from './network-changed-fixture';
import type { HudViewModel } from '../../src/ui/hud';
import './ui-harness-api'; // pulls in the `Window.lockstateUiHarness` global augmentation

/**
 * How long a refusal stands on `.hud__refusal`, in a real browser.
 *
 * ## The defect
 *
 * The record under `docs/research/` titled *Playing the twelve changes of
 * 2026-08-31*, §9, found by playing: one *Remove* pressed on an empty tile put
 * *"Nothing was removed -- there is no object on that tile, and none being
 * built there."* across the top of the world, and it was **still there four
 * in-game days later**, at 1280x800 and at 1920x1080, while the player was
 * doing something else entirely (`act3-contraband-sentence-1920x1080.png`).
 *
 * The mechanism was not a missing withdrawal. #492 gave the simulation one --
 * `RefusalLog.supersede`, keyed per target so that zoning room B cannot
 * silence a still-true refusal about room A -- and it works. It is that for a
 * whole class of refusal the key can never match again, because the condition
 * is a permanent property of the target: an empty tile is withdrawn only by a
 * *successful removal at that same tile*. So the band gained a second
 * retirement that is about attention rather than truth, and
 * `src/ui/hud/refusal-line.ts` argues it.
 *
 * ## Why this file and not `ui-shell.spec.ts`
 *
 * Only because that file was held by another agent on the day this landed. It
 * uses the same harness page and the same probes, and it belongs beside
 * *"a later success clears the refusal, so the line never outlives its
 * truth"*, which is the case this generalises. Fold it in when the two trees
 * meet.
 *
 * ## What is proved here that `tests/unit/ui-hud-refusal-line.test.ts` cannot
 *
 * That `mountHud` calls the rule at the right moments, and that the band is
 * really laid out and really empty afterwards. `vitest.config.ts` runs
 * `environment: 'node'` with no jsdom, so the unit suite reaches the decision
 * and nothing that touches an element; the wiring line in `dispatchCommand` is
 * a mutation that survives everything except this file.
 */

const HARNESS_URL = '/tests/browser/ui-harness.html';

/** The sentence the bundled catalog gives `hud.alert.refusal.build.unowned-land`. */
const REFUSAL_TEXT = 'The build order failed';
const REFUSAL_KEY = 'hud.alert.refusal.build.unowned-land';

/** What `src/main.ts` publishes when the worker has refused something. */
const withSimulationRefusal = (sequence: number): HudViewModel => ({
  counts: {
    prisoners: 0,
    prisonerCapacity: 0,
    occupiedPlaces: 0,
    staff: 0,
    rooms: 0,
    prisonersCovered: 0,
    prisonersUnderstaffed: 0,
    prisonersUnguarded: 0,
    prisonersHighRisk: 0,
    activeIncidents: 0,
    contrabandFound: 0,
    treasuryMinorUnits: 0,
    stateIncomeAccruedTodayMinorUnits: 0,
  },
  clock: { day: 1, tickOfDay: 0, dayLengthTicks: 2_400, mode: 'paused', speed: 1 },
  // Both surfaces, exactly as the composition root fills them: the list keeps
  // the log row and the band carries the notice.
  alerts: [{ id: `refusal-${sequence}`, labelKey: REFUSAL_KEY, severity: 'warning' }],
  refusal: { sequence, labelKey: REFUSAL_KEY },
});

test.beforeEach(async ({ page }) => {
  await page.goto(HARNESS_URL);
  await page.waitForFunction(() => 'lockstateUiHarness' in window);
});

test.describe('a refusal is retired by the next command the player issues', () => {
  test('a simulation refusal leaves the band, does not come back, and stays in the log', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
    await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), withSimulationRefusal(1));

    // On screen first, or nothing below is a measurement of anything.
    const standing = await page.evaluate(() => window.lockstateUiHarness.refusalProbe());
    expect(standing.visible).toBe(true);
    expect(standing.width).toBeGreaterThan(0);
    expect(standing.height).toBeGreaterThan(0);
    expect(standing.source).toBe('simulation');
    expect(standing.text).toContain(REFUSAL_TEXT);

    // Any command at all, and one the host accepts -- which is the case the
    // rule this replaces could not reach: a *different* kind succeeding never
    // cleared a standing refusal, and for this class no *same* kind ever
    // could.
    expect(await page.evaluate(() => window.lockstateUiHarness.clickTransport('Pause'))).toBe(true);

    await expect
      .poll(() => page.evaluate(() => window.lockstateUiHarness.refusalProbe().visible), {
        message: 'the refusal outlived the command the player issued after it',
      })
      .toBe(false);
    const retired = await page.evaluate(() => window.lockstateUiHarness.refusalProbe());
    expect(retired.source).toBeNull();
    expect(retired.action).toBeNull();
    expect(retired.text).toBe('');

    // The counts channel republishes an unchanged refusal beside a changed
    // count up to twice a second. A retirement the next publication reversed
    // would be worse than none.
    await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), withSimulationRefusal(1));
    await page.waitForTimeout(100);
    expect((await page.evaluate(() => window.lockstateUiHarness.refusalProbe())).visible).toBe(false);

    // And nothing was lost: the band is the notice, the list is the log
    // (`src/ui/simulation-alerts.ts`), and only the notice was retired.
    const row = await page.evaluate(() => window.lockstateUiHarness.alertRowProbe());
    expect(row.present).toBe(true);
    expect(row.visible).toBe(true);
    expect(row.text).toContain(REFUSAL_TEXT);

    // A newer refusal still takes the line, retired predecessor or not.
    await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), withSimulationRefusal(2));
    const replaced = await page.evaluate(() => window.lockstateUiHarness.refusalProbe());
    expect(replaced.visible).toBe(true);
    expect(replaced.source).toBe('simulation');
  });

  test('a host refusal survives a tab change and is retired by the next command', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
    await page.evaluate(() => window.lockstateUiHarness.failIntents(true));
    expect(await page.evaluate(() => window.lockstateUiHarness.clickTransport('Pause'))).toBe(true);

    await expect
      .poll(() => page.evaluate(() => window.lockstateUiHarness.refusalProbe().visible))
      .toBe(true);
    const refused = await page.evaluate(() => window.lockstateUiHarness.refusalProbe());
    expect(refused.source).toBe('host');
    expect(refused.action).toBe('set-clock');
    expect(refused.failedControls).toEqual(['Pause']);
    expect(refused.describedByRefusal).toBe(true);

    await page.evaluate(() => window.lockstateUiHarness.failIntents(false));

    // **Chrome is not a command.** Selecting a tab asks the prison for
    // nothing, and the tab a player switches to is very often the one the
    // refusal just sent them to -- so the sentence has to survive it. Without
    // this assertion the case below would be equally green against a rule that
    // retired the line on any interaction whatsoever.
    expect(await page.evaluate(() => window.lockstateUiHarness.clickTab('build'))).toBe(true);
    await page.waitForTimeout(100);
    const acrossTheTab = await page.evaluate(() => window.lockstateUiHarness.refusalProbe());
    expect(acrossTheTab.visible).toBe(true);
    expect(acrossTheTab.source).toBe('host');
    expect(acrossTheTab.action).toBe('set-clock');

    // A command of a *different* kind, accepted. The rule this replaced
    // cleared a host refusal only when the same kind later succeeded, so this
    // press left the clock's sentence standing over an unrelated build.
    expect(await page.evaluate(() => window.lockstateUiHarness.expandBuildCoordinates())).toBe(true);
    expect(await page.evaluate(() => window.lockstateUiHarness.clickPlaceOrder())).toBe(true);

    await expect
      .poll(() => page.evaluate(() => window.lockstateUiHarness.refusalProbe()), {
        message: 'a refusal about the clock outlived an unrelated command that succeeded',
      })
      .toMatchObject({ visible: false, source: null, action: null, failedControls: [] });

    // `failedControls: []` above is the accessibility half and is the reason
    // it is asserted rather than left implied: the description goes with the
    // sentence, because a control still pointing `aria-describedby` at an
    // empty band describes nothing. It is given up at the player's own next
    // command and never on a clock, which is the whole of why this rule is
    // not a timeout.

    expect(await page.evaluate(() => window.lockstateUiHarness.takeUnhandledRejections())).toEqual([]);
  });
});
