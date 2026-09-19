import { type Page, expect, test } from './network-changed-fixture';
import type { HudViewModel } from '../../src/ui/hud';
import './ui-harness-api'; // pulls in the `Window.lockstateUiHarness` global augmentation

/**
 * **A guard's wage, on screen** (issue
 * [#639](https://github.com/matmaxalez/lockstate/issues/639) ruling 2, on the
 * measurement in [#636](https://github.com/matmaxalez/lockstate/issues/636)).
 *
 * ## Why a browser is required, and `pnpm test` cannot cover this
 *
 * The decisions are pure and are proven headlessly in
 * `tests/unit/ui-staff-hire-charge.test.ts`: which figures the hint quotes,
 * which figure the payroll badge states, and when it states none.
 * `vitest.config.ts` is `environment: 'node'` with no jsdom, so
 * `createStaffPanel` -- the module that turns those decisions into elements --
 * is not merely untested there, it is **unreachable**. A sentence composed
 * perfectly and never appended would pass every unit test in the repository.
 *
 * ## And why the geometry is asserted rather than the text alone
 *
 * Because both halves of this change are one fold or one clip away from
 * reaching nobody, which is issue #629's standing directive and #627's worked
 * example -- *"Awaiting Materials"* was on the page the whole time, inside a
 * fold that starts shut.
 *
 * - **The hint is clipped, not wrapped.** `hud.css` gives `.hud-staff__note`
 *   `display: -webkit-box` with `-webkit-line-clamp: 1` at any viewport 700px
 *   tall or shorter, so a second line is cut with nothing on screen to say so.
 *   900x600 is inside that band. `scrollHeight` against `clientHeight` is the
 *   only reading that tells a clipped sentence from a whole one, and it is why
 *   the priced sentence stands alone rather than carrying the
 *   *"A new guard starts unassigned."* it displaced.
 *
 *   **That sentence used to end "rather than that sentence plus the ... it
 *   displaced", full stop, and the displacement is now resolved**: on the
 *   owner's ruling of 2026-08-30 the displaced clause is back as
 *   `hud.security.hire-unassigned`, on a line and an element of its own,
 *   exempted from the clamp in `hud.css`. Both are measured here, separately,
 *   because they are two boxes now and either can be cut without the other.
 * - **The payroll badge carries a word.** It stated a bare `4,800` for one
 *   revision -- correct, and readable as a headcount beside a header naming
 *   people. `hud.security.roster-wage-bill` is the owner's approved
 *   *"{total} a day"*, and this file pins the rendered result rather than
 *   resolving the key, because what is gated is the wording.
 * - **The payroll header is collapsed on arrival.** `collapsed: true` in
 *   `staff-panel.ts`, which is exactly the state the figure has to survive. A
 *   badge asserted while the fold is open would prove nothing about the state
 *   every player meets.
 *
 * 900x600 is the binding viewport this repository argues every layout decision
 * against, and it is the tightest one `HELD_GUARD_ROW_LIMIT` was fixed at.
 *
 * ## What was watched going red
 *
 * Six mutations of the production code, each restored by hand before the next.
 * Baseline: `5 passed (9.3s)`.
 *
 * | mutation | result |
 * | --- | --- |
 * | `trailing: rosterWageBill` removed from the roster section | 3 failed, 2 passed |
 * | the badge written but never cleared (`if (bill !== undefined)`) | 1 failed, 4 passed |
 * | `hud.ts` forwards `undefined` instead of the published bill | 2 failed, 3 passed |
 * | the hint rendered with no parameters at all | 2 failed, 3 passed -- *"an unfilled placeholder is on screen"* |
 * | `{wage}` filled from `hireChargeMinorUnits` | 1 failed, 4 passed |
 * | the displaced sentence run on after the owner's | 1 failed -- *"the hire sentence is being clipped at 900x600"* |
 *
 * **The last one is the measurement, not just a gate.** With the expectation
 * adjusted to the two-sentence text so the clamp assertion could be reached,
 * *"Costs 80 now and 55 a day in wages. A new guard starts unassigned."*
 * (the priced half now reads *"... in wages, including today."*, by the owner's
 * ruling of 2026-09-03; this quotes the pair as ruling #639 approved it) is
 * clipped at 900x600 -- which is why the hire hint carries the owner's one
 * sentence and the displaced one comes back on a line of its own.
 *
 * ## And what the owner's two approved strings were watched against
 *
 * Eight more, on the change that gave the badge its word and the displaced
 * sentence its line. Baseline `6 passed (8.2s)`; every mutation restored by
 * hand and `git diff --stat` checked empty between them.
 *
 * | mutation | result |
 * | --- | --- |
 * | the badge written as a bare `localizer.formatNumber(bill)` again | 3 failed |
 * | `hud.security.roster-wage-bill` reduced to `'{total}'` | 3 failed |
 * | the same key changed to `'{total} a week'` | 3 failed |
 * | the badge's `{total}` argument renamed to `{bill}` | 3 failed -- *"an unfilled placeholder is on screen"* |
 * | the restored note never appended to `.hud-staff__actions` | 2 failed |
 * | the restored note built from `securityStaffHint` instead | 2 failed |
 * | `hud.security.hire-unassigned` reworded to *"New guards start unassigned."* | 2 failed |
 * | the clamp exemption's selector unmatched | 1 failed |
 * | both sentences in one key again, with the text expectation adjusted | 1 failed -- *"the hire sentence is being clipped at 900x600"* |
 *
 * **The eighth one survived until this file asserted the rule rather than the
 * geometry**, and the reason is recorded at the assertion: at 900x600 the
 * restored sentence is 238px wide and one 13px line, so `scrollHeight` equals
 * `clientHeight` with the exemption and without it. The clipping assertion is
 * still the one that matters -- it is what the ninth mutation trips -- but it
 * cannot see this exemption, and saying so is cheaper than a green tick that
 * means less than it looks.
 */

const HARNESS_URL = '/tests/browser/ui-harness.html';

/**
 * A prison whose payroll is unlike every other figure on the page.
 *
 * `4_800` is issue #636's own prison -- sixty guards at the catalogue's 80 --
 * and it is deliberately not a multiple or a fraction of the treasury balance
 * or the income beside it, so a badge fed from the wrong count field lands on a
 * number this fixture never gave it rather than on a plausible one.
 */
const DAILY_WAGE_BILL = 4_800;

function viewModel(options: { readonly hired: number; readonly bill?: number }): HudViewModel {
  return {
    counts: {
      prisoners: 142,
      prisonerCapacity: 180,
      occupiedPlaces: 142,
      staff: 60,
      staffUnassigned: 0,
      rooms: 61,
      prisonersCovered: 100,
      prisonersUnderstaffed: 30,
      prisonersUnguarded: 12,
      prisonersHighRisk: 0,
      activeIncidents: 0,
      contrabandFound: 4,
      treasuryMinorUnits: 24_920,
      stateIncomeAccruedTodayMinorUnits: 10_667,
      // Omitted rather than zeroed when `bill` is absent: "nothing has
      // published counts" and "the payroll bills nothing" are different facts
      // and the panel draws them differently.
      ...(options.bill === undefined ? {} : { dailyWageBillMinorUnits: options.bill }),
    },
    clock: { day: 3, tickOfDay: 600, dayLengthTicks: 2_400, mode: 'paused', speed: 1 },
    alerts: [],
    ...(options.hired === 0
      ? {}
      : {
          staffRoster: {
            hired: options.hired,
            staff: [{ entityId: 7, statusLabelKey: 'deployment-phase.unassigned.name', roleLabelKey: 'staff-role.guard.name' }],
          },
        }),
  };
}

interface WageReading {
  /** The sentence under the hire button, or `null` where the panel drew none. */
  readonly hintText: string | null;
  /** The displaced sentence's own line, or `null` where the panel drew none. */
  readonly unassignedText: string | null;
  readonly unassignedWidth: number;
  readonly unassignedHeight: number;
  /** True when the short-viewport clamp is cutting *that* line. */
  readonly unassignedClipped: boolean | null;
  /** Its `scrollHeight`/`clientHeight`, reported so the reading is legible when it fails. */
  readonly unassignedScrollHeight: number;
  readonly unassignedClientHeight: number;
  /** Whether its box lies inside the panel's own visible box. */
  readonly unassignedInsidePanel: boolean | null;
  /** How many leaf elements in the panel render exactly the approved sentence. */
  readonly unassignedMatches: number;
  /** The clamp as the browser resolved it on the restored line, and on the hint beside it. */
  readonly unassignedLineClamp: string | null;
  readonly unassignedDisplay: string | null;
  readonly hintLineClamp: string | null;
  /**
   * The clamp on a `.hud-staff__note` that is deliberately still clamped, kept
   * as the vacuity witness for the exemption assertions. See the pair below.
   */
  readonly clampedWitnessLineClamp: string | null;
  readonly hintWidth: number;
  readonly hintHeight: number;
  /** True when the clamp is cutting the sentence: more text than box. */
  readonly hintClipped: boolean | null;
  /** Whether the hint's box lies inside the panel's own visible box. */
  readonly hintInsidePanel: boolean | null;
  /** Whether the collapsed `On the payroll` section has a box at all. */
  readonly rosterLaidOut: boolean;
  /** `data-collapsed` on that section, so a badge is never asserted on an open fold. */
  readonly rosterCollapsed: string | null;
  /** The header badge's text, or `null` where none was built. */
  readonly billText: string | null;
  readonly billWidth: number;
  readonly billHeight: number;
  /** Whether the badge's box lies inside the panel's own visible box. */
  readonly billInsidePanel: boolean | null;
  /** Whether the badge really is inside the header button, which is what survives the fold. */
  readonly billInHeader: boolean;
  /** Everything the panel renders, for the raw-key read. */
  readonly panelText: string;
}

async function read(page: Page): Promise<WageReading> {
  return page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('.hud-staff');
    if (panel === null) throw new Error('no Staff panel in the mounted HUD');
    const panelBox = panel.getBoundingClientRect();
    // The *client* box: where content starts being clipped, unaffected by
    // scrolling -- `staffProbe`'s own `panelVisibleBottom` reading.
    const fold = panelBox.top + panel.clientTop + panel.clientHeight;

    const hint = panel.querySelector<HTMLElement>('.hud-staff__hire-note');
    const hintBox = hint?.getBoundingClientRect();
    const unassigned = panel.querySelector<HTMLElement>('.hud-staff__hire-unassigned');
    const unassignedBox = unassigned?.getBoundingClientRect();
    // Counted by rendered text and not by that class, so a class that moved on
    // to an element saying something else is a failure rather than a pass.
    const unassignedMatches = [...panel.querySelectorAll<HTMLElement>('*')].filter(
      (node) => node.childElementCount === 0 && (node.textContent ?? '').trim() === 'A new guard starts unassigned.',
    ).length;
    const roster = panel.querySelector<HTMLElement>('.hud-staff__roster');
    const bill = panel.querySelector<HTMLElement>('.hud-staff__roster-count');
    const billBox = bill?.getBoundingClientRect();
    const drawn = (node: HTMLElement | null | undefined): boolean =>
      node !== null && node !== undefined && node.offsetParent !== null;

    return {
      hintText: hint === null ? null : hint.textContent,
      unassignedText: unassigned === null ? null : unassigned.textContent,
      unassignedWidth: unassignedBox === undefined ? 0 : Math.round(unassignedBox.width * 100) / 100,
      unassignedHeight: unassignedBox === undefined ? 0 : Math.round(unassignedBox.height * 100) / 100,
      unassignedClipped: unassigned === null ? null : unassigned.scrollHeight > unassigned.clientHeight + 0.5,
      unassignedScrollHeight: unassigned?.scrollHeight ?? 0,
      unassignedClientHeight: unassigned?.clientHeight ?? 0,
      unassignedInsidePanel:
        unassignedBox === undefined
          ? null
          : unassignedBox.top >= panelBox.top - 0.5 && unassignedBox.bottom <= fold + 0.5,
      unassignedMatches,
      unassignedLineClamp: unassigned === null ? null : getComputedStyle(unassigned).webkitLineClamp,
      unassignedDisplay: unassigned === null ? null : getComputedStyle(unassigned).display,
      hintLineClamp: hint === null ? null : getComputedStyle(hint).webkitLineClamp,
      clampedWitnessLineClamp: (() => {
        const witness = document.querySelector('.hud-staff__held-more');
        return witness === null ? null : getComputedStyle(witness).webkitLineClamp;
      })(),
      hintWidth: hintBox === undefined ? 0 : Math.round(hintBox.width * 100) / 100,
      hintHeight: hintBox === undefined ? 0 : Math.round(hintBox.height * 100) / 100,
      // A sentence the clamp is cutting has more content than box. `+ 0.5`
      // absorbs sub-pixel rounding, which is smaller than any line of text.
      hintClipped: hint === null ? null : hint.scrollHeight > hint.clientHeight + 0.5,
      hintInsidePanel:
        hintBox === undefined ? null : hintBox.top >= panelBox.top - 0.5 && hintBox.bottom <= fold + 0.5,
      rosterLaidOut: drawn(roster),
      rosterCollapsed: roster?.dataset['collapsed'] ?? null,
      billText: bill === null ? null : bill.textContent,
      billWidth: billBox === undefined ? 0 : Math.round(billBox.width * 100) / 100,
      billHeight: billBox === undefined ? 0 : Math.round(billBox.height * 100) / 100,
      billInsidePanel:
        billBox === undefined ? null : billBox.top >= panelBox.top - 0.5 && billBox.bottom <= fold + 0.5,
      billInHeader: bill !== null && bill.closest('.ui-section__header') !== null,
      panelText: panel.innerText,
    };
  });
}

async function openSecurityTab(page: Page): Promise<void> {
  await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
  expect(await page.evaluate(() => window.lockstateUiHarness.clickTab('manage'))).toBe(true);
}

const publish = (page: Page, next: HudViewModel): Promise<void> =>
  page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), next);

test.describe('the Staff panel says what a guard costs now and what it costs every day (#639)', () => {
  // The binding viewport, and the one inside `hud.css`'s single-line clamp
  // band. Every layout decision in this repository is argued against it.
  test.use({ viewport: { width: 900, height: 600 } });

  test.beforeEach(async ({ page }) => {
    await page.goto(HARNESS_URL);
  });

  test('renders the whole hire sentence, on screen and not cut by the clamp', async ({ page }) => {
    await openSecurityTab(page);
    await publish(page, viewModel({ hired: 60, bill: DAILY_WAGE_BILL }));
    const reading = await read(page);

    /*
     * **55, not 80, and the harness says why.** The shipped guard charges 80
     * and bills 80 a day -- `wageBand: { minPerDay: 80 }` read by both
     * `staffHireCostMinorUnits` and `staffDailyWageMinorUnits` -- so a fixture
     * that copied content would pass against a panel that rendered the charge
     * twice and never read the wage. `STAFF_MODEL` therefore bills 55, and
     * `app-shell.spec.ts` is where the real pair is driven end to end.
     *
     * So the assertion is that **both placeholders were filled, from their own
     * fields, in the order the owner's sentence puts them**.
     */
    expect(reading.hintText, 'the panel drew no sentence under the hire button').toBe(
      /*
       * **Re-ruled by the owner on 2026-09-03; the sentence it replaced is
       * quoted rather than overwritten** (`docs/AGENT_WORKFLOW.md` §4). It read
       * *"Costs 80 now and 55 a day in wages."* -- ruling #639's words, and
       * false on the first press of a new game, because hiring bills two days'
       * wage for the day it happens (issue #868, measured 25,000 -> 24,920 at
       * the press and -> 24,840 at tick 2,408).
       *
       * **The two added words are what the 900x600 clamp cut**, which is why
       * `hud.css` now exempts `.hud-staff__hire-note` from it: a clipped line
       * would read the old false sentence back, with the correction removed by
       * a box. The clipping assertion further down is the one that caught it.
       */
      'Costs 80 now and 55 a day in wages, including today.',
    );
    // The assertions the text alone cannot make. #220 and #285 are this
    // repository's two shipped defects of exactly this shape: content that
    // satisfies a text assertion from inside a box nobody can see.
    expect(reading.hintWidth, 'the sentence measured zero width, so it is in the DOM and not on the screen').toBeGreaterThan(0);
    expect(reading.hintHeight, 'the sentence measured zero height').toBeGreaterThan(0);
    expect(
      reading.hintInsidePanel,
      'the sentence sits below the panel fold, so a player has to scroll a panel they have no reason to scroll',
    ).toBe(true);
    // The reason the owner's one sentence stands alone here. `.hud-staff__note`
    // is `-webkit-line-clamp: 1` at this viewport, so a second sentence run on
    // after it is cut with nothing on screen saying so.
    expect(
      reading.hintClipped,
      `the hire sentence is being clipped at 900x600: ${String(reading.hintText)}`,
    ).toBe(false);
  });

  test('gives the displaced sentence its own line, whole, at the viewport that clipped it', async ({ page }) => {
    await openSecurityTab(page);
    await publish(page, viewModel({ hired: 60, bill: DAILY_WAGE_BILL }));
    const reading = await read(page);
    // Printed rather than only asserted, so the run carries the measurement the
    // clamp argument rests on instead of a bare green tick.
    console.log(
      `[unassigned] ${JSON.stringify({
        text: reading.unassignedText,
        box: { width: reading.unassignedWidth, height: reading.unassignedHeight },
        scrollHeight: reading.unassignedScrollHeight,
        clientHeight: reading.unassignedClientHeight,
        lineClamp: reading.unassignedLineClamp,
        display: reading.unassignedDisplay,
        hintScrollBox: { clipped: reading.hintClipped, height: reading.hintHeight, lineClamp: reading.hintLineClamp },
      })}`,
    );

    /*
     * *"A new guard starts unassigned."* is the half of the old hire hint the
     * owner's approved wording displaced, returned on the owner's ruling of
     * 2026-08-30 as its own key and its own element.
     *
     * **The literal, not a value read back through the catalogue.** What is
     * being gated is that the player reads the words the owner approved, so a
     * fixture that resolved the key would supply both sides of the comparison
     * and would go on passing after somebody rewrote the sentence.
     */
    expect(reading.unassignedText, 'the panel drew no line for the displaced sentence').toBe(
      'A new guard starts unassigned.',
    );
    expect(
      reading.unassignedMatches,
      'the sentence is not rendered by exactly one element, so either it is gone or something renders it twice',
    ).toBe(1);
    expect(reading.unassignedWidth, 'the sentence measured zero width, so it is in the DOM and not on screen').toBeGreaterThan(0);
    expect(reading.unassignedHeight, 'the sentence measured zero height').toBeGreaterThan(0);
    expect(
      reading.unassignedInsidePanel,
      'the restored line sits below the panel fold, so the sentence returned and reaches nobody -- #629',
    ).toBe(true);
    /*
     * The assertion this test exists for. `@media (max-height: 700px)` clamps
     * `.hud-staff__note` to one line, which is why this sentence could not be
     * run on after the priced one: the two together measured `scrollHeight` 26
     * against `clientHeight` 13 here, and *this* clause was the half that was
     * cut. A test that only found the text in the DOM would have passed against
     * that defect.
     */
    expect(
      reading.unassignedClipped,
      `the restored sentence is being clipped at 900x600: scrollHeight ${reading.unassignedScrollHeight} against clientHeight ${reading.unassignedClientHeight}`,
    ).toBe(false);
    // And the priced sentence beside it is still whole: the line was added to a
    // block that already had to fit, and a fix that clipped its neighbour would
    // be the same defect one element up.
    expect(
      reading.hintClipped,
      `the hire sentence is being clipped at 900x600: ${String(reading.hintText)}`,
    ).toBe(false);

    /*
     * And the exemption itself, asserted as a rule rather than through the
     * geometry above -- **because at this viewport the geometry cannot see
     * it.** Measured: the restored sentence is 238px wide and one 13px line, so
     * `scrollHeight` equals `clientHeight` whether or not `hud.css` exempts it,
     * and removing the exemption leaves every assertion above green. That is a
     * surviving mutation and it is reported rather than hidden.
     *
     * What the exemption is actually for is the case English does not produce
     * here: a locale whose sentence wraps, where the clamp would cut the clause
     * and nothing on screen would say so. So the pair below is the assertion
     * that can be made -- **the hint beside it is clamped and this line is
     * not**, which also stops the check being vacuous: if the
     * `max-height: 700px` block were not in force at all, both would read
     * `none` and the second expectation alone would pass for the wrong reason.
     */
    /*
     * **The witness moved, because the hint stopped being one.** This read
     * `reading.hintLineClamp` and required `'1'`: the priced hint was the proof
     * that the `max-height: 700px` block is in force at all, which is what
     * stops the next expectation passing for the wrong reason.
     *
     * The owner's second ruling of 2026-09-03 lengthened that hint past one
     * line -- *"including today"*, added because the sentence was false without
     * it -- so `hud.css` now exempts `.hud-staff__hire-note` from the clamp
     * too, and the hint reads `none`. **Keeping the old assertion would have
     * meant either re-clamping a sentence the ruling exists to make whole, or
     * deleting the vacuity guard.** Neither: the guard needs a note that is
     * still clamped, and `.hud-staff__held-more` is one -- same panel, same
     * base class, not exempted, and it belongs to the category `hud.css` says
     * stays clamped, the notes "a clipped line still leaves usable". A
     * list-overflow count reads fine with its tail cut; a price does not.
     */
    expect(
      reading.clampedWitnessLineClamp,
      'the short-viewport clamp is not in force at 900x600, so nothing here is testing an exemption from it',
    ).toBe('1');
    // And the hint itself is now on the exempt side of that rule, which is the
    // half the ruling forced. Asserted so a silent re-clamp fails here.
    expect(
      reading.hintLineClamp,
      'the priced hire sentence is clamped again, so "including today" is being cut off',
    ).not.toBe('1');
    expect(
      reading.unassignedLineClamp,
      'the restored line is clamped like its neighbour, so a locale whose sentence wraps loses the clause',
    ).not.toBe('1');
    expect(reading.unassignedDisplay, 'the restored line is still laid out as the clamped box').toBe('block');
  });

  test('states the standing daily bill on the payroll header, with the fold still shut', async ({ page }) => {
    await openSecurityTab(page);
    await publish(page, viewModel({ hired: 60, bill: DAILY_WAGE_BILL }));
    const reading = await read(page);

    // The state every player meets: the section is built collapsed, so this is
    // the badge doing the only job it has.
    expect(reading.rosterLaidOut, 'the payroll section has no box for a prison of sixty guards').toBe(true);
    expect(reading.rosterCollapsed, 'the payroll fold is open, so this proves nothing about the collapsed state').toBe(
      'true',
    );

    /*
     * **`4,800 a day`, not `4,800`.** The badge shipped bare for one revision
     * and the gap was reported rather than papered over: beside a header naming
     * *people*, a bare figure reads as a headcount as readily as as money, and
     * no assertion can tell those two readings apart because they render
     * identical characters. The owner supplied the wording on 2026-08-30, and
     * this pins it: the figure comes from the fixture and the words from
     * `hud.security.roster-wage-bill`, so a locale edit that dropped the period
     * fails here rather than shipping.
     */
    expect(reading.billText, 'the collapsed payroll header states nothing').toBe('4,800 a day');
    expect(reading.billInHeader, 'the figure is not inside the header button, so the fold takes it away with the list').toBe(
      true,
    );
    expect(reading.billWidth, 'the figure measured zero width, so it is in the DOM and not on the screen').toBeGreaterThan(0);
    expect(reading.billHeight, 'the figure measured zero height').toBeGreaterThan(0);
    expect(reading.billInsidePanel, 'the figure sits below the panel fold').toBe(true);
  });

  test('states nothing where there is no payroll, and takes the figure back off', async ({ page }) => {
    await openSecurityTab(page);

    // Shown first, so what is asserted below is the figure being **removed**
    // rather than never having been added. The panel updates one DOM in place;
    // a badge that is never cleared reports the last prison's payroll on the
    // next one.
    await publish(page, viewModel({ hired: 60, bill: DAILY_WAGE_BILL }));
    expect((await read(page)).billText).toBe('4,800 a day');

    await publish(page, viewModel({ hired: 0, bill: 0 }));
    const empty = await read(page);
    expect(empty.rosterLaidOut, 'the payroll section still has a box with nobody on the payroll').toBe(false);
    expect(empty.billText, 'the header still states a payroll for a prison that employs nobody').toBe('');
  });

  test('states nothing while the counts channel has not reported a bill', async ({ page }) => {
    await openSecurityTab(page);
    // A roster arrived over `hud/staff` and no status-counts publication has.
    // A `0` here would say the payroll is free, which is the class of claim
    // #639 exists to stop.
    await publish(page, viewModel({ hired: 60 }));
    const reading = await read(page);

    expect(reading.rosterLaidOut, 'the payroll section vanished, and it should not have: sixty are employed').toBe(true);
    expect(reading.billText, 'the header invented a figure the counts channel never published').toBe('');
  });

  test('renders no unresolved message key anywhere in the panel', async ({ page }) => {
    // ADR 0011's own failure mode: an unresolved key renders as itself, which
    // is visible and obviously wrong -- and only if something looks. An
    // unfilled placeholder ships the same way, so `{` is read for too: this
    // change added two of them to a key that had none.
    await openSecurityTab(page);
    await publish(page, viewModel({ hired: 60, bill: DAILY_WAGE_BILL }));
    const { panelText } = await read(page);

    expect(panelText.length, 'the Staff panel rendered nothing at all').toBeGreaterThan(20);
    expect(panelText, `an unresolved message key is on screen: ${panelText}`).not.toMatch(/\bhud\.[a-z0-9.-]+/);
    expect(panelText, `an unfilled placeholder is on screen: ${panelText}`).not.toMatch(/[{}]/);

    /*
     * And the sweep above provably **reaches** the two strings the owner
     * approved on 2026-08-30, rather than passing over a panel that never drew
     * them. A "must not contain" rule is vacuous against text that is absent,
     * and both of these are new keys: `hud.security.roster-wage-bill` is the
     * badge's first placeholder and `hud.security.hire-unassigned` the panel's
     * newest element. `innerText` and not `textContent`, so this is the text a
     * sighted player reads -- a string inside a shut fold does not count it.
     */
    expect(panelText, 'the payroll badge is not in the text a sighted player reads').toContain('4,800 a day');
    expect(panelText, 'the restored sentence is not in the text a sighted player reads').toContain(
      'A new guard starts unassigned.',
    );
  });
});
