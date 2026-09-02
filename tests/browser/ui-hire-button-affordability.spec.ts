import type { HudCountsViewModel, HudViewModel } from '../../src/ui/hud';
import { type Page, expect, test } from './network-changed-fixture';
import './ui-harness-api';

/**
 * The Hire button's enabled state, in a real browser.
 *
 * ## Where this came from
 *
 * Issue #772 found the Buy button's *"label and enabled state are identical
 * whether the press will succeed or be refused. The player finds out by
 * pressing"*, and its fix reported the class rather than only the instance:
 * the Hire button is judged by the same `judgeAffordability` /
 * `pressFloorMinorUnits` pair in `src/main.ts`'s `hire-staff` case, and its
 * enabled state ignored it too. `tests/browser/ui-buy-button-affordability.spec.ts`
 * is this spec's template and its subject is the same mechanism one control
 * over: `disabled` now tracks the verdict the press itself will be judged
 * against (`pressAffordabilityVerdict`, `src/ui/affordability.ts`), computed
 * *before* the press rather than discovered by it.
 *
 * **The wording half is deliberately not this spec's subject.** `hireLabel` is
 * asserted to stay byte-identical between the enabled and disabled states
 * below, which is the proof that this change is mechanism only -- see
 * `staff-panel.ts`'s comment on `paintHire` for why naming what stops a press
 * and what would lift it is the owner's, under `AGENTS.md`'s fourth exclusion,
 * and ADR 0087 / ADR 0089's territory rather than this change's.
 *
 * ## Which number a hire is judged against
 *
 * A hire has two costs and only one of them is a press. `hireChargeMinorUnits`
 * is what the treasury is debited *now* -- one day of the role's authored
 * `wageBand.minPerDay`, read through the simulation's own
 * `staffHireCostMinorUnits` -- and the daily wage bills again at every in-game
 * day boundary afterwards. `src/main.ts` compares the first, so this button
 * compares the first, and the balances below are chosen so that comparing
 * either the daily wage or the sum of the two instead would fail:
 *
 * - the harness role is `hireChargeMinorUnits: 80` with `dailyWageMinorUnits:
 *   55`, two figures no catalogue makes equal (`ui-harness.ts`'s own note on
 *   `STAFF_MODEL` says why the fixture separates them);
 * - at -1,180 the mature rung leaves 70 of room, so 80 is refused and 55
 *   would not have been;
 * - at -1,160 it leaves 90, so 80 is accepted and 80 + 55 = 135 would not have
 *   been.
 *
 * ## What this covers that `pnpm test` cannot
 *
 * `pressAffordabilityVerdict` itself is pure and is proven headlessly in
 * `tests/unit/ui-affordability.test.ts`. What that cannot reach is whether
 * `staff-panel.ts` actually wires the verdict onto the real `<button>` a
 * player presses -- `vitest.config.ts` is `environment: 'node'` with no jsdom,
 * so `createStaffPanel` cannot run there at all (`docs/AGENT_WORKFLOW.md`).
 *
 * ## Why the harness page
 *
 * `setHudViewModel` is `ui-overdraft-badge.spec.ts`'s lever for driving a
 * balance no ordinary session reaches in the time a test can afford, and it is
 * the same lever here: `hud.update()` never touches the Staff panel's own
 * role catalogue or its selection (`HudStaffViewModel` is supplied once at
 * mount, not per publication), so the same role stays selected across every
 * `setHudViewModel` call below.
 */

const HARNESS_URL = '/tests/browser/ui-harness.html';

/**
 * A populated prison, so the panel is the one a player really sees -- the same
 * reasoning `ui-buy-button-affordability.spec.ts` and
 * `ui-overdraft-badge.spec.ts` give for theirs. Only the treasury and
 * `roomCapacity` move between cases.
 */
function counts(treasuryMinorUnits: number, roomCapacity?: number): HudCountsViewModel {
  return {
    prisoners: 42,
    prisonerCapacity: 48,
    occupiedPlaces: 42,
    staff: 11,
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
  readonly visible: boolean;
  readonly hireLabel: string;
  readonly hireDisabled: boolean;
}

async function push(page: Page, viewModel: HudViewModel): Promise<ButtonReading> {
  await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), viewModel);
  const probe = await page.evaluate(() => window.lockstateUiHarness.staffProbe());
  return {
    selected: probe.selected,
    visible: probe.visible,
    hireLabel: probe.hireLabel,
    hireDisabled: probe.hireDisabled,
  };
}

test.describe('the Hire button says whether it can act before it is pressed (#772’s other half)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('disables on a balance that refuses the hire, enables on one that does not, and never changes what it says', async ({
    page,
  }) => {
    await page.goto(HARNESS_URL);
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
    expect(await page.evaluate(() => window.lockstateUiHarness.clickTab('security'))).toBe(true);

    /*
     * **Solvent**: nothing refuses an 80 hire at a balance of 24,920. The
     * control starts, and stays, enabled.
     */
    const solvent = await push(page, viewModelAt(24_920));
    expect(solvent.visible, 'the Staff panel was not laid out on the Security tab').toBe(true);
    expect(solvent.selected, 'the harness’ one role was not still selected').toBe('staff-role.guard');
    expect(solvent.hireDisabled, 'a solvent prison’s Hire button is disabled').toBe(false);

    /*
     * **Past the mature hiring rung** (-1,250, which `'hiring'` shares with
     * `'deliveries'` in `INSOLVENCY_RUNG_FLOORS_MINOR_UNITS`): a balance of
     * -1,180 leaves 70 of spendable room, and the 80 this press spends does
     * not fit in 70. No `roomCapacity` published, which is "mature" by
     * default (`pressFloorMinorUnits`'s own contract for an absent value).
     *
     * 70 is also more than the role's 55 daily wage, so a button that had
     * compared what keeping the guard costs instead of what hiring one costs
     * would still be enabled here.
     */
    const refused = await push(page, viewModelAt(-1_180));
    expect(refused.hireDisabled, 'a hire `judgeAffordability` would refuse still shows an enabled button').toBe(true);

    /*
     * **The mechanism, not the wording.** The label is byte-identical to the
     * solvent case -- same role, same charge, same sentence -- because this
     * change never touches copy. If this assertion ever goes red on a
     * legitimate label change, the fix is to update the fixture's expectation
     * elsewhere, not to relax this one: the point is that disabling and
     * re-wording are two different changes, and only the first is this
     * change's.
     */
    expect(refused.hireLabel, 'the disabled state said something the enabled state did not').toBe(solvent.hireLabel);

    /*
     * **Recovers.** The balance that was refused a moment ago is not a
     * permanent state -- move it back and the identical button re-enables with
     * no new element, no re-mount, nothing but the next `setHudViewModel` (a
     * day's state income landing, in the real application).
     */
    const recovered = await push(page, viewModelAt(24_920));
    expect(recovered.hireDisabled, 'the button did not recover once the balance did').toBe(false);

    /*
     * **Freshness, threaded rather than defaulted (issue #771's starter rung,
     * ADR 0017's amendment).** At a balance of -1,160 the *mature* floor
     * (-1,250) leaves 90 of room -- enough for the 80 charge -- and the
     * *starter* floor a fresh, unfurnished prison sits on instead (-1,185)
     * leaves only 25, which is not. This is the same pair
     * `deliveriesRungFloorMinorUnits`'s docblock and
     * `ui-buy-button-affordability.spec.ts` cite as the measured defect a bare
     * `false` would reopen: PR #769 closed it for the FUNDS badge, #771's
     * amendment closed it again for a fresh prison, and this is the number
     * proving the Hire button was threaded the same way rather than defaulted.
     *
     * The mature case doubles as the assertion that the panel judges the press
     * and not the press plus tomorrow's wage: 90 of room accepts 80 and would
     * have refused 80 + 55.
     */
    const matureAtNinety = await push(page, viewModelAt(-1_160));
    expect(matureAtNinety.hireDisabled, 'the mature hiring rung leaves 90 of room for an 80 hire').toBe(false);

    const freshAtTwentyFive = await push(page, viewModelAt(-1_160, 0));
    expect(
      freshAtTwentyFive.hireDisabled,
      'a fresh, unfurnished prison’s starter rung leaves only 25 of room for an 80 hire',
    ).toBe(true);
  });
});
