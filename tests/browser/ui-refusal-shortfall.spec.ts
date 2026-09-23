import { DEFAULT_LOCALE } from '../../src/content/localization';
import { procurableMaterial } from '../../src/content/procurement-catalog';
import { formatNumber } from '../../src/services/localization/format';
import {
  TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS,
  TREASURY_STARTING_BALANCE_MINOR_UNITS,
  rungFloorMinorUnits,
} from '../../src/simulation/economy';
import type { HudCountsViewModel, HudViewModel } from '../../src/ui/hud';
import { type Page, expect, test } from './network-changed-fixture';
import './ui-harness-api';

/**
 * **What a refused press says about the money, in a real browser** -- the
 * wording half of issue
 * [#772](https://github.com/matmaxalez/lockstate/issues/772), on the owner's
 * ruling of 2026-09-03.
 *
 * ## What was on screen before this, measured rather than assumed
 *
 * Four surfaces already spoke about a refused hire, and the control the player
 * pressed was not one of them. On a fresh prison spent down to `-1,160`
 * against the starter hiring rung of `-1,185`:
 *
 *   - the button carried `aria-disabled="true"` (#799/#807's mechanism) and
 *     kept its label, `Hire Guard · 80`;
 *   - its note kept saying what the press costs;
 *   - the press sent no command, and the balance did not move;
 *   - **~750-860ms later** the refusal band appeared, `data-source="host"`,
 *     reading `hud.refusal.hire-staff-past-floor` -- *"Nobody was hired —
 *     hiring is refused until the prison earns the money."*;
 *   - and the FUNDS chip already carried `25 left` with a tooltip naming the
 *     same cause.
 *
 * So the refusal was never copy-less, and **nothing here replaces or
 * duplicates any of those sentences.** What none of them carried is the one
 * fact a player can act on -- *how much more money* -- and what none of them
 * is, is the control that was pressed. The band explains the refusal
 * elsewhere on screen, most of a second later, and leaves the player to
 * connect it to their own press. The owner's sentence goes where the promise
 * was made:
 *
 * > **"Not enough money — you need {amount} more."**
 *
 * ## Why this spec exists rather than a unit test
 *
 * `judgeAffordability`'s `shortfallMinorUnits` is pure and is proven headlessly
 * in `tests/unit/ui-affordability.test.ts`, and the sentence itself is pinned in
 * `tests/unit/ui-hud-refusal-shortfall.test.ts`. Neither can reach whether the
 * figure is *rendered*, whether the line has a box, or whether it survives
 * beside the band on the assembled page -- `vitest.config.ts` is
 * `environment: 'node'` with no jsdom, so neither panel can run there at all
 * (`docs/AGENT_WORKFLOW.md`).
 *
 * ## The figures, chosen so a wrong reading cannot pass
 *
 * The Buy case runs on the **real application** at its starting balance, and
 * every figure in it is derived from the shipped constants below and then
 * asserted against a literal, so a constant moving is a visible change rather
 * than a silently re-derived expectation. A fresh prison has no rooms, so
 * `counts.roomCapacity` is `0` and the rung is the **starter** `-1,185` (ADR
 * 0017's amendment) rather than the mature `-1,250` -- which this spec's own
 * arithmetic depends on, and which is why the expected sentence would be wrong
 * by 65 if freshness were not threaded.
 */

const HARNESS_URL = '/tests/browser/ui-harness.html';
const APP_URL = '/index.html';

/** The one authored sentence, from the owner's ruling, with the figure filled in. */
function shortfallSentence(amountMinorUnits: number): string {
  return `Not enough money — you need ${formatNumber(DEFAULT_LOCALE, amountMinorUnits)} more.`;
}

// ---------------------------------------------------------------------------
// The Buy press, on the assembled application
// ---------------------------------------------------------------------------

const BRICK_UNIT_PRICE = procurableMaterial('item.brick')?.unitPriceMinorUnits ?? Number.NaN;

/**
 * The starter `'deliveries'` rung, which is the floor a **fresh, unfurnished**
 * prison's press is judged against -- `pressFloorMinorUnits`'s own third
 * argument, taken here from the simulation's one definition of the rung rather
 * than from the host's composition of it.
 */
const FRESH_PRESS_FLOOR = rungFloorMinorUnits('deliveries', TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS, true);

/** What a new prison may spend on a purchase before the rung refuses it. */
const SPENDABLE = TREASURY_STARTING_BALANCE_MINOR_UNITS - FRESH_PRESS_FLOOR;

/**
 * A quantity comfortably past that, rather than the cheapest one that is --
 * `Math.floor(SPENDABLE / price) + 1` is a shortfall of **15**, which is small
 * enough to be confused with rounding and carries no thousands separator. This
 * one is 100 bricks past the threshold, so the shortfall has four digits and a
 * separator in it.
 */
const UNAFFORDABLE_QUANTITY = Math.floor(SPENDABLE / BRICK_UNIT_PRICE) + 100;
const TOTAL = UNAFFORDABLE_QUANTITY * BRICK_UNIT_PRICE;
const SHORTFALL = TOTAL - SPENDABLE;

interface ControlReading {
  readonly buyLabel: string;
  readonly buyUnavailable: boolean;
  readonly buyDisabled: boolean;
  readonly shortfallText: string;
  readonly shortfallLaidOut: boolean;
  readonly describedBy: string;
}

async function readControl(page: Page): Promise<ControlReading> {
  return page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>('.hud-build__buy-submit');
    const line = document.querySelector<HTMLElement>('.hud-build__buy-shortfall');
    return {
      buyLabel: button?.textContent?.trim() ?? '',
      buyUnavailable: button?.getAttribute('aria-disabled') === 'true',
      buyDisabled: button !== null && button.disabled,
      shortfallText: line?.textContent?.trim() ?? '',
      // A box the browser actually gave it, not the attribute: `.hud-build__note`
      // carries an author `display` that beats `[hidden]`, so an attribute read
      // would agree with a line that is on screen when it should not be.
      shortfallLaidOut: line !== null && line.getClientRects().length > 0,
      describedBy: button?.getAttribute('aria-describedby') ?? '',
    };
  });
}

test.describe('a refused press says how much more money the prison needs (#772, #799, #807)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('the Buy control says it before the press, keeps saying it through the refusal, and withdraws when it no longer applies', async ({
    page,
  }) => {
    /*
     * **A real-session test on the assembled page, so it gets the budget
     * `app-shell.spec.ts` gives its own real presses.** This one loads
     * `/index.html`, starts a worker, creates a prison, opens a disclosure,
     * fills a stepper, presses a control for real and then waits out a
     * repaint. Measured at **1.1m against the 60s default** with two other
     * Playwright suites and three `vitest` runs on the box, and the step
     * holding the clock when the budget ran out was the *last* one -- every
     * assertion about the sentence had already passed, and the page snapshot
     * taken at the timeout carries `Not enough money — you need 3,975 more.`
     * beside the band.
     *
     * So this is a budget for a serial narrative on a loaded machine, not a
     * timeout raised over a race: nothing here polls for something that may
     * never arrive, and the two `expect.poll` calls settle on the first
     * attempt when the page has already repainted.
     */
    test.slow();
    /*
     * **The arithmetic first, asserted rather than merely computed.** Each
     * figure is derived above and pinned here, so a constant that moves fails
     * with the number that moved instead of quietly re-deriving a new
     * expectation. And the four are four *different* numbers, which is the
     * whole point of this case: the sentence interpolates the shortfall, and a
     * test at a balance where the shortfall happened to equal the price, the
     * balance or the spendable room could pass while reading the wrong one.
     */
    expect(BRICK_UNIT_PRICE, 'the brick price this case is built on').toBe(40);
    expect(FRESH_PRESS_FLOOR, 'the starter deliveries rung: -1,250 shifted shallower by one plank').toBe(-1_185);
    // 25,000, 26,185, 754 and 30,160 until the owner's ruling of 2026-09-23
    // set the grant to 100,000 (#641). The shortfall is the same 3,975, because
    // the press is still 100 bricks past the threshold.
    expect(TREASURY_STARTING_BALANCE_MINOR_UNITS, 'the balance a new prison starts on').toBe(100_000);
    expect(SPENDABLE, 'the grant plus the starter rung').toBe(101_185);
    expect(UNAFFORDABLE_QUANTITY).toBe(2_629);
    expect(TOTAL, 'what the press would spend').toBe(105_160);
    expect(SHORTFALL, 'how much more the prison needs').toBe(3_975);
    expect(
      new Set([TOTAL, TREASURY_STARTING_BALANCE_MINOR_UNITS, SPENDABLE, SHORTFALL]).size,
      'two of the four figures are equal, so a wrong reading could pass this test',
    ).toBe(4);

    await page.goto(APP_URL);
    await page.waitForSelector('#game-root canvas');
    await page.waitForSelector('.hud');
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    // The balance this case is arithmetic about, read off the screen rather
    // than assumed: every figure above is wrong if the prison did not start
    // where the constant says it does.
    await expect(page.locator('[data-metric="funds"] .ui-stat__value')).toHaveText(
      formatNumber(DEFAULT_LOCALE, TREASURY_STARTING_BALANCE_MINOR_UNITS),
    );

    await page.getByRole('button', { name: 'Build' }).click();
    const buyRow = page.locator('.hud-build__buy');
    if (await buyRow.isHidden()) await page.locator('.hud-build__buy-toggle').click();
    await expect(buyRow).toBeVisible();

    /*
     * **Affordable first, so the line's absence is a state and not a
     * default.** The panel arrives with `wall-brick` selected and one
     * placement's worth of quantity in the stepper, which a new prison can
     * pay for -- so nothing stops the press and the line must have no box at
     * all. A permanent empty line would satisfy every text assertion below.
     */
    const affordable = await readControl(page);
    expect(affordable.buyUnavailable, 'an affordable press already says it cannot act').toBe(false);
    expect(affordable.shortfallText, 'a line was drawn for a press nothing stops').toBe('');
    expect(affordable.shortfallLaidOut, 'the line has a box while nothing stops the press').toBe(false);
    expect(affordable.describedBy, 'the button is described by a line with nothing in it').toBe('');

    const quantity = page.locator('.hud-build__buy .ui-number__input');
    await quantity.fill(String(UNAFFORDABLE_QUANTITY));
    await quantity.press('Enter');

    /*
     * **Before the press.** This is #772 itself: the control answers "can I
     * act", and now also "what would lift it", *without* the player having to
     * find out by pressing. Polled rather than read bare, because the fill
     * above repaints the panel and a read that raced it would be a race read
     * as a regression.
     */
    await expect
      .poll(async () => (await readControl(page)).shortfallText, {
        message: 'the control said nothing about what stops the press',
      })
      .toBe(shortfallSentence(SHORTFALL));

    const advised = await readControl(page);
    expect(advised.shortfallLaidOut, 'the sentence is in the DOM with no box, so no player can read it').toBe(true);
    expect(advised.buyUnavailable, "#772's own mechanism stopped saying the press is refused").toBe(true);
    /*
     * **And the press is still there**, which is the narrowing of 2026-09-02
     * and the reason the band below is reachable at all. A hard `disabled`
     * would take away the only producer of
     * `hud.refusal.purchase-materials-past-floor`.
     */
    expect(advised.buyDisabled, 'the sentence came with the press being taken away').toBe(false);
    // The label is untouched: it still states what the press would spend, and
    // the two figures on screen are the price and the shortfall rather than
    // one number doing both jobs.
    expect(advised.buyLabel, 'the label lost the price it states').toContain(formatNumber(DEFAULT_LOCALE, TOTAL));
    expect(advised.buyLabel, 'the label became the shortfall sentence').not.toContain('Not enough money');
    // The line is the control's description while it stands, so a
    // screen-reader user meets the sentence *at the control* rather than only
    // somewhere on the panel.
    const lineId = await page.locator('.hud-build__buy-shortfall').getAttribute('id');
    expect(lineId, 'the line has no id, so nothing can describe the control with it').not.toBeNull();
    expect(advised.describedBy.split(/\s+/u), 'the control is not described by the sentence').toContain(String(lineId));

    /*
     * **Now press it, and the refusal that already existed still happens.**
     * `force: true` because Playwright's actionability treats
     * `aria-disabled="true"` as not-enabled; it still dispatches real mouse
     * events at the element's box, so a regression to a hard `disabled` fails
     * here rather than being papered over (see `pressBuyExpectingRefusal` in
     * `app-shell.spec.ts` for that argument in full).
     */
    await page.locator('.hud-build__buy-submit').click({ force: true });

    const refusal = page.locator('.hud__refusal');
    await expect(refusal, 'the press was not refused on this thread').toBeVisible();
    await expect(refusal).toHaveAttribute('data-action', 'purchase-materials');
    /*
     * **The band's own sentence is not this change's.** It says *why* the
     * press is refused; the line on the control says *how much more*. Two
     * sentences about one refusal, and this assertion is what pins that this
     * change added a fact rather than re-worded an existing one. (The band's
     * tail was itself rewritten on 2026-09-04 -- issue #913, the state owes
     * nothing to a prison that is not earning -- which is a different change
     * and is transcribed in `tests/unit/ui-simulation-alerts.test.ts`.)
     */
    await expect(refusal).toContainText('deliveries are refused until the prison earns the money');
    await expect(refusal).not.toContainText('Not enough money');

    /*
     * **Both descriptions reach the control at once**, which is the state
     * `describeBy`'s merge exists for: the band writes its id onto the button
     * on a refusal (`markControl`, `src/ui/hud/hud.ts`) and this line's id was
     * already there. Whoever wrote last used to win, and the loser's sentence
     * became unreachable to a screen reader while staying visible on screen.
     */
    const afterPress = await readControl(page);
    const refusalId = await refusal.getAttribute('id');
    expect(refusalId).not.toBeNull();
    const described = afterPress.describedBy.split(/\s+/u);
    expect(described, 'the refusal band stopped describing the control it was about').toContain(String(refusalId));
    expect(described, 'the shortfall line was evicted by the band').toContain(String(lineId));
    expect(afterPress.shortfallText, 'the sentence went away at the moment it was most needed').toBe(
      shortfallSentence(SHORTFALL),
    );

    /*
     * **And it withdraws.** One brick is affordable at this balance, so the
     * sentence is a statement about *this quantity at this balance* rather
     * than a line that latched -- and it must go back to having no box, not to
     * being an empty one.
     */
    await quantity.fill('1');
    await quantity.press('Enter');
    await expect
      .poll(async () => (await readControl(page)).shortfallLaidOut, {
        message: 'the sentence kept a box after the press became affordable',
      })
      .toBe(false);
    const recovered = await readControl(page);
    expect(recovered.shortfallText, 'the line is empty rather than gone').toBe('');
    expect(recovered.buyUnavailable, 'the control did not recover with it').toBe(false);
    expect(recovered.describedBy, 'the control is still described by a line nobody can read').not.toContain(
      String(lineId),
    );
  });

  // -------------------------------------------------------------------------
  // The Hire control, on the HUD harness
  // -------------------------------------------------------------------------

  /**
   * The same balances `ui-hire-button-affordability.spec.ts` drives, for its
   * reason: a hire that the rung refuses needs a balance no session reaches in
   * the time a test can afford, and `setHudViewModel` is the lever the HUD
   * harness exists to provide.
   *
   * The harness' one role charges **80** to hire and bills **55** a day -- a
   * wage no catalogue authors, chosen there precisely so that one figure
   * standing in for the other is a visible failure. At a balance of **-1,200**
   * against the mature rung of **-1,250** the prison has **50** of room, so it
   * is **30** short. Five different numbers -- 80, 55, -1,200, 50, 30 -- and
   * only the last is the answer.
   */
  function counts(treasuryMinorUnits: number): HudCountsViewModel {
    return {
      prisoners: 42,
      prisonerCapacity: 48,
      occupiedPlaces: 42,
      staff: 11,
      staffUnassigned: 0,
      rooms: 23,
      roomCapacity: 48,
      prisonersCovered: 42,
      prisonersUnderstaffed: 0,
      prisonersUnguarded: 0,
      prisonersHighRisk: 6,
      activeIncidents: 0,
      contrabandFound: 3,
      treasuryMinorUnits,
      stateIncomeAccruedTodayMinorUnits: 10_667,
    };
  }

  function viewModelAt(treasuryMinorUnits: number): HudViewModel {
    return {
      counts: counts(treasuryMinorUnits),
      clock: { day: 9, tickOfDay: 600, dayLengthTicks: 2_400, mode: 'paused', speed: 1 },
      alerts: [],
    };
  }

  test('the Hire control says how much more is needed, and the figure is the fee rather than the wage', async ({
    page,
  }) => {
    await page.goto(HARNESS_URL);
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
    expect(await page.evaluate(() => window.lockstateUiHarness.clickTab('manage'))).toBe(true);

    const push = async (treasuryMinorUnits: number) => {
      await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), viewModelAt(treasuryMinorUnits));
      return page.evaluate(() => window.lockstateUiHarness.staffProbe());
    };

    // Solvent: nothing stops an 80 hire at 24,920, so the line has no box.
    const solvent = await push(24_920);
    expect(solvent.selected, 'the harness’ one role was not selected').toBe('staff-role.guard');
    expect(solvent.hireUnavailable, 'a solvent prison’s Hire button says it cannot act').toBe(false);
    expect(solvent.hireShortfallText, 'a line was drawn for a hire nothing stops').toBe('');
    expect(solvent.hireShortfallLaidOut, 'the line has a box while nothing stops the hire').toBe(false);
    expect(solvent.hireDescribedBy, 'the button is described by a line with nothing in it').toBe('');

    /*
     * Past the mature hiring rung, which `'hiring'` shares with
     * `'deliveries'`: 50 of room against an 80 charge is 30 short.
     */
    const refused = await push(-1_200);
    expect(refused.hireUnavailable, 'a hire the rung refuses shows a control claiming it can act').toBe(true);
    expect(refused.hireDisabled, 'the affordability verdict took the press away').toBe(false);
    expect(refused.hireShortfallText).toBe(shortfallSentence(30));
    expect(refused.hireShortfallLaidOut, 'the sentence is in the DOM with no box').toBe(true);
    expect(refused.hireDescribedBy, 'the control is not described by the sentence').toContain('hud-staff-hire-shortfall');

    /*
     * **The figure is the engagement fee's shortfall and nothing else on this
     * panel.** A hire has two costs and only one of them is a press: 80 now,
     * 55 a day afterwards. Comparing the wage would leave the prison 5 short
     * of 55 against 50 of room, and comparing both together would make it 85 --
     * so the three candidate readings give 30, 5 and 85, and only one of them
     * is on screen. The note above keeps pricing the hire, unchanged.
     */
    expect(refused.hireShortfallText, 'the wage was compared instead of the fee').not.toContain('5 more');
    expect(refused.hireShortfallText, 'the fee and the wage were added together').not.toContain('85 more');
    expect(refused.hireLabel, 'the label lost the fee it states').toContain('80');

    // And it withdraws, to no box rather than to an empty line.
    const recovered = await push(24_920);
    expect(recovered.hireShortfallLaidOut, 'the sentence kept a box after the balance recovered').toBe(false);
    expect(recovered.hireShortfallText, 'the line is empty rather than gone').toBe('');
    expect(recovered.hireDescribedBy, 'the control is still described by a line nobody can read').toBe('');
  });
});
