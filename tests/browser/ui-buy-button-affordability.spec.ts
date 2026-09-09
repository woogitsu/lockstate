import type { HudCountsViewModel, HudViewModel } from '../../src/ui/hud';
import { type Page, expect, test } from './network-changed-fixture';
import './ui-harness-api';

/**
 * The Buy button's availability, in a real browser (issue #772).
 *
 * ## What #772 found
 *
 * *"The Buy button's label and enabled state are identical whether the press
 * will succeed or be refused. The player finds out by pressing."* The game
 * already computes the answer on every press --
 * `judgeAffordability`'s `spendableMinorUnits` -- and threw it away. This
 * spec is the gate for the mechanical half of that issue: the control's
 * `aria-disabled` attribute now tracks the same verdict the press itself will
 * be judged against (`pressAffordabilityVerdict`, `src/ui/affordability.ts`),
 * computed *before* the press rather than discovered by it.
 *
 * **`aria-disabled` and not `disabled`, and the difference is asserted rather
 * than assumed (the narrowing of 2026-09-02).** PR #799 first wrote the
 * verdict onto the `disabled` property. That answers #772 and destroys
 * something else: `disabled` removes the press, the press is what reaches
 * `src/main.ts`'s pre-flight, and the pre-flight is the only producer of
 * `hud.refusal.purchase-materials-past-floor` this panel has -- the sentence
 * the owner authored under ruling 18 of 2026-08-31 for exactly the limit a
 * player has no other way of learning about. Three tests in
 * `tests/browser/app-shell.spec.ts` drive that sentence through a real press
 * on the assembled page, and all three went red. So the verdict advises and
 * does not veto: every case below reads *both* bits, and `buyDisabled` is
 * asserted `false` beside every `buyUnavailable` that is `true`.
 *
 * **The wording half is deliberately not this spec's subject.** `buyLabel` is
 * asserted to stay byte-identical between the available and unavailable
 * states at one point below, which is the proof that this change is mechanism
 * only -- see `build-panel.ts`'s comment on `paintBuyTotal` for why naming
 * what stops and what would lift it is the owner's, under `AGENTS.md`'s
 * fourth exclusion, and ADR 0087 / ADR 0089's territory rather than this
 * issue's.
 *
 * ## What this covers that `pnpm test` cannot
 *
 * `pressAffordabilityVerdict` itself is pure and is proven headlessly in
 * `tests/unit/ui-affordability.test.ts`. What that cannot reach is whether
 * `build-panel.ts` actually wires the verdict onto the real `<button>` a
 * player presses -- `vitest.config.ts` is `environment: 'node'` with no
 * jsdom, so `createBuildPanel` cannot run there at all
 * (`docs/AGENT_WORKFLOW.md`).
 *
 * ## Why the harness page
 *
 * `setHudViewModel` is `ui-overdraft-badge.spec.ts`'s lever for driving a
 * balance no ordinary session reaches in the time a test can afford, and it
 * is the same lever here: `hud.update()` never touches the Build panel's own
 * catalogue or its selection state (`HudBuildViewModel` is supplied once at
 * mount, not per publication), so the buy row stays open and the same
 * material stays selected across every `setHudViewModel` call below.
 */

const HARNESS_URL = '/tests/browser/ui-harness.html';

/**
 * A populated prison, so the row is the width a player really sees -- the
 * same reasoning `ui-overdraft-badge.spec.ts`'s own `counts` helper gives.
 * Only the treasury and `roomCapacity` move between cases.
 */
function counts(treasuryMinorUnits: number, roomCapacity?: number): HudCountsViewModel {
  return {
    prisoners: 42,
    prisonerCapacity: 48,
    occupiedPlaces: 42,
    staff: 11,
    staffUnassigned: 0,
    rooms: 23,
    prisonersCovered: 42,
    prisonersUnderstaffed: 0,
    prisonersUnguarded: 0,
    prisonersHighRisk: 6,
    activeIncidents: 0,
    contrabandFound: 3,
    treasuryMinorUnits,
    ...(roomCapacity === undefined ? {} : { roomCapacity }),
    stateIncomeAccruedTodayMinorUnits: 10_667,
  };
}

function viewModelAt(treasuryMinorUnits: number, roomCapacity?: number): HudViewModel {
  return {
    counts: counts(treasuryMinorUnits, roomCapacity),
    clock: { day: 9, tickOfDay: 600, dayLengthTicks: 2_400, mode: 'paused', speed: 1 },
    alerts: [],
  };
}

interface ButtonReading {
  readonly selected: string | null;
  readonly buyOpen: boolean;
  readonly buyLabel: string;
  /** `aria-disabled`: what the verdict writes. */
  readonly buyUnavailable: boolean;
  /**
   * The `disabled` property: what the verdict must **not** write, and the
   * reason this reading has two fields rather than one (the narrowing of
   * 2026-09-02, see the header above).
   */
  readonly buyDisabled: boolean;
}

/**
 * **What a sighted player can see, which no attribute assertion reaches.**
 *
 * #772 is about the control answering "can I act" *before* the press. An
 * `aria-disabled` attribute answers it for assistive technology and for this
 * spec, and answers it for nobody looking at the screen unless a style picks
 * it up -- so the whole narrowing of 2026-09-02 could go silently invisible
 * by one selector being dropped from `primitives.css`, with every other
 * assertion in this file still green. This reads the computed value rather
 * than the rule, so it holds however the dimming is expressed.
 *
 * `opacity` and not a colour: it is the one declaration
 * `.ui-action:disabled, .ui-action[aria-disabled='true']` carries that a
 * computed style reports as a number, and `.ui-action` has no `transition`,
 * so the value is settled the instant the attribute is written.
 */
async function buyOpacity(page: Page): Promise<number> {
  return page.evaluate(() => {
    const button = document.querySelector<HTMLElement>('.hud-build__buy-submit');
    return button === null ? Number.NaN : Number.parseFloat(window.getComputedStyle(button).opacity);
  });
}

async function push(page: Page, viewModel: HudViewModel): Promise<ButtonReading> {
  await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), viewModel);
  const probe = await page.evaluate(() => window.lockstateUiHarness.buildProbe());
  return {
    selected: probe.selected,
    buyOpen: probe.buyOpen,
    buyLabel: probe.buyLabel,
    buyUnavailable: probe.buyUnavailable,
    buyDisabled: probe.buyDisabled,
  };
}

test.describe('the Buy button says whether it can act before it is pressed (#772)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('says so on a balance that refuses the press, not on one that does not, keeps the press either way, and never changes what it says', async ({
    page,
  }) => {
    await page.goto(HARNESS_URL);
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
    expect(await page.evaluate(() => window.lockstateUiHarness.clickTab('build'))).toBe(true);
    // `door-wooden`, not the first row: its material prices the default
    // quantity at exactly 65, the figure every scenario below is built
    // around.
    expect(await page.evaluate(() => window.lockstateUiHarness.clickBuildable('door-wooden'))).toBe(true);
    expect(await page.evaluate(() => window.lockstateUiHarness.clickBuyToggle())).toBe(true);

    /*
     * **Solvent**: nothing refuses a 65 press at a balance of 24,920. The
     * control starts, and stays, available.
     */
    const solvent = await push(page, viewModelAt(24_920));
    expect(solvent.selected, 'the wall-brick default was not still selected').toBe('door-wooden');
    expect(solvent.buyOpen, 'the disclosure did not open').toBe(true);
    expect(solvent.buyUnavailable, 'a solvent prison’s Buy button says it cannot act').toBe(false);
    expect(solvent.buyDisabled, 'a solvent prison’s Buy button is disabled').toBe(false);
    // The baseline the refused case is compared against, read rather than
    // written out so this pair says "dimmer than available" and not "0.5".
    const availableOpacity = await buyOpacity(page);
    expect(availableOpacity, 'an available Buy button is already dimmed').toBe(1);

    /*
     * **Past the mature deliveries rung** (-1,250): the same worked example
     * `HOST_PRESS_FLOOR_MINOR_UNITS`'s docblock and `overdraftRemaining`'s
     * cite -- a balance of -1,230 leaves 20 of spendable room, and 65 does
     * not fit in 20. No `roomCapacity` published, which is "mature" by
     * default (`pressFloorMinorUnits`'s own contract for an absent value).
     */
    const refused = await push(page, viewModelAt(-1_230));
    expect(
      refused.buyUnavailable,
      'a press `judgeAffordability` would refuse still shows a control claiming it can act',
    ).toBe(true);
    /*
     * **And the press is still there** -- the narrowing of 2026-09-02, and the
     * assertion that makes it a fact rather than a comment.
     *
     * PR #799 wrote the verdict onto `disabled`, which took the press away and
     * with it the only sentence a player is ever given for this refusal:
     * `hud.refusal.purchase-materials-past-floor`, which the owner authored
     * under ruling 18 of 2026-08-31 exactly because the generic line said
     * nothing about the limit. `tests/browser/app-shell.spec.ts` drives that
     * sentence through a real press on the assembled page and went red on all
     * three of its purchase tests the moment the press was removed; this line
     * is the same claim at the layer that can state it in one bit, so a future
     * change that re-takes the press is caught here as well as there.
     *
     * Nothing is in flight at this point -- `setHudViewModel` dispatches no
     * intent -- so this reads the panel's own opinion and not
     * `createBusyGroup`'s.
     */
    expect(
      refused.buyDisabled,
      'the affordability verdict took the press away, so the refusal that explains it can never be reached',
    ).toBe(false);

    /*
     * **And a player can see it**, which is the half of #772 that lives in
     * `primitives.css` rather than in `build-panel.ts` -- see `buyOpacity`.
     */
    expect(
      await buyOpacity(page),
      'the control that says it cannot act looks exactly like one that can, so a sighted player is told nothing before the press',
    ).toBeLessThan(availableOpacity);

    /*
     * **The mechanism, not the wording.** The label is byte-identical to the
     * solvent case -- same material, same quantity, same sentence -- because
     * this issue's mechanical half never touches copy. If this assertion
     * ever goes red on a legitimate label change, the fix is to update the
     * fixture's expectation elsewhere, not to relax this one: the point is
     * that disabling and re-wording are two different changes, and only the
     * first is this issue's.
     */
    expect(refused.buyLabel, 'the unavailable state said something the available state did not').toBe(
      solvent.buyLabel,
    );

    /*
     * **Recovers.** The same balance that was refused a moment ago is not a
     * permanent state -- move the balance back and the identical button
     * says so again with no new element, no re-mount, nothing but the next
     * `setHudViewModel` (a delivery landing, in the real application).
     */
    const recovered = await push(page, viewModelAt(24_920));
    expect(recovered.buyUnavailable, 'the button did not recover once the balance did').toBe(false);
    expect(recovered.buyDisabled, 'the recovered button is disabled').toBe(false);

    /*
     * **Freshness, threaded rather than defaulted (issue #771's starter rung,
     * ADR 0017's amendment).** At a balance of -1,160 the *mature* floor
     * (-1,250) leaves 90 of room -- enough for 65 -- and the *starter* floor a
     * fresh, unfurnished prison sits on instead (-1,185) leaves only 25 --
     * not enough. This is the exact pair `deliveriesRungFloorMinorUnits`'s
     * own docblock and `overdraftRemaining`'s cite as the measured defect a
     * bare `false` would reopen: PR #769 closed it for the FUNDS badge, and
     * this is the same number proving the Buy button was threaded the same
     * way rather than defaulted.
     */
    const matureAtNinety = await push(page, viewModelAt(-1_160));
    expect(matureAtNinety.buyUnavailable, 'the mature floor leaves 90 of room for a 65 press').toBe(false);

    const freshAtTwentyFive = await push(page, viewModelAt(-1_160, 0));
    expect(
      freshAtTwentyFive.buyUnavailable,
      'a fresh, unfurnished prison’s starter rung leaves only 25 of room for a 65 press',
    ).toBe(true);
    // And the starter rung advises against the press without removing it
    // either, for the reason the mature-rung case above gives at length.
    expect(freshAtTwentyFive.buyDisabled, 'the starter rung took the press away').toBe(false);
  });
});
