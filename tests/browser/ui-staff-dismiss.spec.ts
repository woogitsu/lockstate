import { type Page, expect, test } from './network-changed-fixture';
import type { HudStaffRosterViewModel, HudViewModel } from '../../src/ui/hud';
import './ui-harness-api'; // pulls in the `Window.lockstateUiHarness` global augmentation

/**
 * **A dismiss row fires at who it named, and asks before it does** (issue
 * [#877](https://github.com/matmaxalez/lockstate/issues/877), and the owner's
 * ruling of 2026-09-03).
 *
 * ## The defect, measured before any of this existed
 *
 * The Staff panel's roster block drew a fixed pool of three rows and bound
 * `rows[i]` to `staff[i]`. The roster is sorted by ascending entity id and
 * windowed, and the only thing in `src/` that removes a staff member is a
 * dismissal -- so one dismissal shifts every row after it up and pulls the next
 * person into the window. Measured in a browser on 2026-09-03 against unfixed
 * `main`, with `page.mouse.click` at a box captured by the same read that
 * captured the label: **4 of the 4 presses that reached the wire submitted
 * `DismissStaff` for somebody other than the person the row's label named**, and
 * in every one of them the pooled element's `data-staff` at press time equalled
 * what was submitted. Nothing on the code path was wrong; the screen position
 * came to hold a different person between the read and the click. Wrong at a
 * **0 ms** decision delay as well, which the equivalent build-queue defect
 * (#860) was not, because the publication caused by the player's *first*
 * dismissal lands inside the time their second press takes.
 *
 * ## Why a browser is required, and what `pnpm test` covers instead
 *
 * Both decisions are pure and are proven headlessly:
 * `tests/unit/ui-hud-pooled-row-binding.test.ts` for which place names whom, and
 * `tests/unit/ui-hud-dismiss-arming.test.ts` for which press of two a press is.
 * `vitest.config.ts` is `environment: 'node'` with no jsdom, so
 * `createStaffPanel` -- the module that turns those decisions into elements and
 * into a press -- is not merely untested there, it is **unreachable**. A rule
 * decided perfectly and wired to nothing would pass every unit test in the
 * repository.
 *
 * So what is asserted here is only what a browser can answer:
 *
 * - a press at a **coordinate captured before the roster changed** reaches the
 *   person whose label was at that coordinate. `page.mouse.click`, never a
 *   locator: a locator re-resolves `[data-staff]` immediately before the click
 *   and would follow the subject wherever the pool moved it, which is the one
 *   thing a player cannot do;
 * - the place a dismissal freed stays **visibly blank** rather than taking the
 *   person who arrived behind them;
 * - one press arms and sends nothing, and the box that appears says who;
 * - the owner's sentence is **whole and on screen at 900x600**, which is the
 *   viewport `hud.css`'s single-line clamp band starts at and the one every
 *   layout decision in this repository is argued against.
 *
 * ## The harness rather than the application, and what that costs
 *
 * `ui-harness.html` mounts the real HUD over a supplied `HudViewModel`, so a
 * roster before and after a dismissal is two publications rather than a
 * simulation that has to be driven into the state. That is what makes the aiming
 * assertion exact: the two publications differ by precisely the removal under
 * test, and no clock, tick lead or projection cadence is in the way. What it
 * cannot see is the end-to-end path -- that a `dismiss-staff` intent really
 * takes somebody off the payroll -- and `tests/browser/app-shell.spec.ts` is
 * where that is driven, three presses per viewport.
 *
 * ## What was watched going red
 *
 * Four mutations of the production code, each restored **by hand** and checked
 * with `sha256sum -c` against hashes taken before the first of them.
 *
 * The mutations were measured against the version of this file that existed
 * then, whose restored baseline was `6 passed (29.2s)`. This file as it stands
 * runs `6 passed (13.1s)` -- the difference is not the production code, it is
 * one assertion in the arm-lifetime test that used to wait out a ten-second
 * timeout on a fold that cannot be opened. Both figures are recorded rather
 * than the faster one being quoted against the older runs, because the
 * comparison the table makes is only meaningful within one version.
 *
 * | mutation | result |
 * | --- | --- |
 * | `assignPooledRows` replaced by the index binding it displaced | 2 failed, 4 passed -- *"the press did not sack the person the row named"*, `[2]` against `[3]` |
 * | `STAFF_ROSTER_ROW_SETTLE_MS` set to `0` | 2 failed, 4 passed -- *"the person who arrived took the place the dismissal freed"* |
 * | `pressDismiss` returning `'dismisses'` unconditionally | 5 failed, 1 passed (and 5 of 11 in the unit suite) |
 * | the clamp exemption's selector unmatched in `hud.css` | 1 failed -- *"the confirmation is being clipped at 900x600: scrollHeight 26 against clientHeight 13"* |
 *
 * **The first of those is #877 itself, reproduced by this gate**: person 2's row
 * was read, person 1's dismissal was published, the two presses landed on the
 * coordinate person 2's label had been at, and `DismissStaff` went out for
 * **person 3**.
 *
 * **The last is the measurement that justifies the exemption, not just a gate.**
 * With the selector unmatched the owner's sentence measures `scrollHeight` 26
 * against `clientHeight` 13 at 900x600 -- two lines cut to one, and the clause
 * cut is *"and they do not come back"*. This is #884's finding one element over,
 * and the answer is the same one: the box gives way, never the sentence.
 *
 * **The second mutation also found something worth recording.** With the window
 * at `0` the arriving person takes the freed place *within a single
 * publication*, because `hud.ts` paints this block twice per update --
 * `setStaffRoster` and then `setDailyWageBill`, both of which call
 * `paintRoster`. `assignPooledRows` refuses an arrival into a place emptied by
 * the *same* pass, so the first paint holds the place open; it is the second
 * paint, one tick of the same publication later, that the window is what stops.
 * So this settle window is load-bearing at a much shorter timescale than the
 * human one it is sized for, and would be even if a player never hesitated.
 */

const HARNESS_URL = '/tests/browser/ui-harness.html';

/** The owner's sentence, quoted here rather than resolved, because the wording is what is gated. */
const CONFIRMATION = (named: string): string => `Dismiss ${named}? Their wage stops and they do not come back.`;

/**
 * A payroll of four, of which the block can draw three.
 *
 * Four rather than three deliberately: the fourth is the person who arrives in
 * the window when the first is dismissed, and *"nobody took the freed place"* is
 * only an assertion when there is somebody to have taken it.
 *
 * Every row is given a distinct role key so the labels differ, which the shipped
 * read model cannot do by itself -- `HudStaffRosterRowViewModel` carries an
 * entity id, a role key and a status key, so two guards doing the same thing
 * render identical rows. That is a real limit of the read model, it is reported
 * as one, and this fixture works around it rather than hiding it: what is under
 * test is that a press reaches the person whose *label* was at the coordinate,
 * and a fixture whose labels were indistinguishable could not fail.
 */
const ROSTER_STATUSES = [
  'deployment-phase.unassigned.name',
  'deployment-phase.on-post.name',
  'deployment-phase.travelling.name',
  'deployment-phase.on-search.name',
] as const;

function roster(entityIds: readonly number[], hired: number): HudStaffRosterViewModel {
  return {
    hired,
    staff: entityIds.map((entityId, index) => ({
      entityId,
      statusLabelKey: ROSTER_STATUSES[index % ROSTER_STATUSES.length]!,
      roleLabelKey: 'staff-role.guard.name',
    })),
  };
}

function viewModel(staffRoster: HudStaffRosterViewModel): HudViewModel {
  return {
    counts: {
      prisoners: 0,
      prisonerCapacity: 8,
      occupiedPlaces: 0,
      staff: staffRoster.hired,
      rooms: 2,
      prisonersCovered: 0,
      prisonersUnderstaffed: 0,
      prisonersUnguarded: 0,
      prisonersHighRisk: 0,
      activeIncidents: 0,
      contrabandFound: 0,
      treasuryMinorUnits: 25_000,
      stateIncomeAccruedTodayMinorUnits: 0,
      dailyWageBillMinorUnits: staffRoster.hired * 80,
    },
    clock: { day: 1, tickOfDay: 100, dayLengthTicks: 2_400, mode: 'paused', speed: 1 },
    alerts: [],
    staffRoster,
  };
}

/** What one roster row is, and where a press aimed at it would land. */
interface RowReading {
  /** `data-staff`, or `null` on a place naming nobody. */
  readonly staffId: string | null;
  /** What the row's readout says about them, which is what the confirmation quotes. */
  readonly label: string;
  /** `data-dismiss`, so an armed row can be told from the rest. */
  readonly dismiss: string | null;
  /** Whether the row has a box at all -- a trailing empty row has none. */
  readonly laidOut: boolean;
  /** The centre of the row's own control, in viewport coordinates. */
  readonly x: number;
  readonly y: number;
  /** Whether that point is inside the window, so a press at it can reach anything. */
  readonly pressable: boolean;
  /** `aria-describedby`, so the confirmation can be shown to describe the armed control. */
  readonly describedBy: string;
}

/**
 * Reads every roster row, and refuses a box a press could not reach.
 *
 * `pressable` is the fix a run of the instrument this file grew from paid for:
 * `.ui-panel.hud-staff` is `overflow-y: auto`, so the roster can sit below the
 * fold, and nine presses at coordinates off the bottom of the window submitted
 * nothing at all -- which reads exactly like the safe outcome a fix is meant to
 * produce and was really a click landing outside the page.
 */
async function readRows(page: Page): Promise<readonly RowReading[]> {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll<HTMLElement>('.hud-staff__roster .hud-staff__held-row')];
    return rows.map((row): RowReading => {
      const control = row.querySelector<HTMLButtonElement>('.ui-action');
      // The row's *readout*, not the whole row: the row also contains the
      // control, whose own word would otherwise land inside the label and inside
      // every sentence built from it.
      const readout = row.querySelector<HTMLElement>('.hud-staff__held-label');
      const box = control?.getBoundingClientRect();
      const x = box === undefined ? -1 : box.left + box.width / 2;
      const y = box === undefined ? -1 : box.top + box.height / 2;
      return {
        staffId: row.dataset['staff'] ?? null,
        label: (readout?.textContent ?? '').trim(),
        dismiss: row.dataset['dismiss'] ?? null,
        laidOut: row.offsetParent !== null,
        x,
        y,
        pressable:
          box !== undefined &&
          box.width > 0 &&
          box.height > 0 &&
          x >= 0 &&
          y >= 0 &&
          x <= window.innerWidth &&
          y <= window.innerHeight,
        describedBy: control?.getAttribute('aria-describedby') ?? '',
      };
    });
  });
}

/** What the confirmation box says, and whether it is whole and on screen. */
interface ConfirmationReading {
  readonly text: string | null;
  readonly laidOut: boolean;
  readonly width: number;
  readonly height: number;
  /** True when the short-viewport clamp is cutting this sentence: more text than box. */
  readonly clipped: boolean | null;
  readonly scrollHeight: number;
  readonly clientHeight: number;
  /** Whether the box lies inside the panel's own visible box. */
  readonly insidePanel: boolean | null;
  readonly lineClamp: string | null;
  readonly display: string | null;
  /** The id the box carries, so the armed control can be shown to point at it. */
  readonly id: string;
  /**
   * The clamp as the browser resolved it on a `.hud-staff__note` in this same
   * block that is deliberately still clamped -- the vacuity witness for the
   * exemption assertion. `ui-staff-wage.spec.ts` uses the same one and its
   * comment carries why an overflow count is a note "a clipped line still leaves
   * usable" where a warning is not.
   */
  readonly clampedWitnessLineClamp: string | null;
  readonly clampedWitnessLaidOut: boolean;
  /** How many leaf elements anywhere in the panel render exactly this sentence. */
  readonly matches: number;
}

async function readConfirmation(page: Page, expected: string): Promise<ConfirmationReading> {
  return page.evaluate((sentence) => {
    const panel = document.querySelector<HTMLElement>('.hud-staff');
    if (panel === null) throw new Error('no Staff panel in the mounted HUD');
    const panelBox = panel.getBoundingClientRect();
    // The *client* box: where content starts being clipped, unaffected by
    // scrolling -- `staffProbe`'s own `panelVisibleBottom` reading.
    const fold = panelBox.top + panel.clientTop + panel.clientHeight;
    const note = panel.querySelector<HTMLElement>('.hud-staff__dismiss-confirm');
    const box = note?.getBoundingClientRect();
    const witness = panel.querySelector<HTMLElement>('.hud-staff__roster .hud-staff__held-more');
    return {
      text: note === null ? null : note.textContent,
      laidOut: note !== null && note.offsetParent !== null,
      width: box === undefined ? 0 : Math.round(box.width * 100) / 100,
      height: box === undefined ? 0 : Math.round(box.height * 100) / 100,
      // A sentence the clamp is cutting has more content than box. `+ 0.5`
      // absorbs sub-pixel rounding, which is smaller than any line of text.
      clipped: note === null ? null : note.scrollHeight > note.clientHeight + 0.5,
      scrollHeight: note?.scrollHeight ?? 0,
      clientHeight: note?.clientHeight ?? 0,
      insidePanel: box === undefined ? null : box.top >= panelBox.top - 0.5 && box.bottom <= fold + 0.5,
      lineClamp: note === null ? null : getComputedStyle(note).webkitLineClamp,
      display: note === null ? null : getComputedStyle(note).display,
      id: note?.id ?? '',
      clampedWitnessLineClamp: witness === null ? null : getComputedStyle(witness).webkitLineClamp,
      clampedWitnessLaidOut: witness !== null && witness.offsetParent !== null,
      // Counted by rendered text and not by the class, so a class that moved on
      // to an element saying something else is a failure rather than a pass.
      matches: [...panel.querySelectorAll<HTMLElement>('*')].filter(
        (node) => node.childElementCount === 0 && (node.textContent ?? '').trim() === sentence,
      ).length,
    };
  }, expected);
}

async function openSecurityTab(page: Page): Promise<void> {
  await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
  expect(await page.evaluate(() => window.lockstateUiHarness.clickTab('security'))).toBe(true);
}

const publish = (page: Page, next: HudViewModel): Promise<void> =>
  page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), next);

const intents = (page: Page): Promise<readonly string[]> =>
  page.evaluate(() => window.lockstateUiHarness.hudIntents());

const dismissals = async (page: Page): Promise<readonly number[]> =>
  (await intents(page))
    .map((intent) => JSON.parse(intent) as { kind: string; staffId?: number })
    .filter((intent) => intent.kind === 'dismiss-staff')
    .map((intent) => intent.staffId ?? -1);

/**
 * Opens the payroll fold, which is built `collapsed: true` -- so its rows have
 * no box until the player asks. Read rather than toggled blind, because the flag
 * survives a republication.
 */
async function openPayroll(page: Page): Promise<void> {
  const fold = page.locator('.hud-staff__roster > .ui-section__header');
  await expect(fold, 'the payroll fold is missing').toBeVisible();
  if ((await fold.getAttribute('aria-expanded')) === 'false') await fold.click();
  await expect(page.locator('.hud-staff__roster .hud-staff__held-row[data-staff]').first()).toBeVisible();
}

test.describe('a dismiss row fires at who it named (#877)', () => {
  /*
   * Tall enough that all three rows and the confirmation are inside the window
   * without scrolling. The roster block is the last thing in a panel that is
   * `overflow-y: auto`, and a press at a coordinate off the bottom of the page
   * submits nothing -- which is indistinguishable from the fix working. The
   * 900x600 clamp band gets its own block at the foot of this file, where the
   * question is about the sentence rather than about the aim.
   */
  test.use({ viewport: { width: 1_280, height: 1_024 } });

  test.beforeEach(async ({ page }) => {
    await page.goto(HARNESS_URL);
    await openSecurityTab(page);
  });

  /**
   * The assertion this file exists for.
   *
   * The press is made at the coordinate of the row that named person 2, captured
   * *before* the publication that removes person 1 -- which is exactly what a
   * player who read the list and then clicked did. Under the index binding the
   * same coordinate held person 3 by then, and the press sacked them.
   */
  test('a press reaches the person whose label was at that coordinate, not whoever the list moved there', async ({
    page,
  }) => {
    await publish(page, viewModel(roster([1, 2, 3, 4], 4)));
    await openPayroll(page);

    const before = await readRows(page);
    expect(
      before.map((row) => row.staffId),
      'the payroll did not draw its three people',
    ).toEqual(['1', '2', '3']);
    expect(
      before.every((row) => row.pressable),
      `a row control is not inside the window, so a press at it would reach nothing: ${JSON.stringify(before.map((row) => [row.staffId, row.x, row.y]))}`,
    ).toBe(true);

    const aimedAt = before[1]!;
    expect(aimedAt.staffId, 'the second place is not the one that named person 2').toBe('2');

    // The roster as it is the moment person 1's dismissal has landed: the list
    // loses its head and person 4 comes into the window behind them. Nothing
    // else about the prison changes.
    await publish(page, viewModel(roster([2, 3, 4], 3)));

    const after = await readRows(page);

    // Two presses, because a dismissal is confirmed (the owner's ruling of
    // 2026-09-03). Both at the captured coordinate, never at a locator, and made
    // before anything below is asserted: the player presses where they read, and
    // a gate that checked the layout first would decline to make the press the
    // defect is about.
    await page.mouse.click(aimedAt.x, aimedAt.y);
    await page.mouse.click(aimedAt.x, aimedAt.y);

    /*
     * The whole of #877 in one line, and it is asserted **before** the shape of
     * the list below deliberately: what the player suffers is the wrong person
     * being sacked, and a gate whose first red is about a `data-staff` array
     * would report the mechanism instead of the harm. Restoring the index
     * binding makes this read `[3]`.
     */
    expect(await dismissals(page), 'the press did not sack the person the row named').toEqual([2]);

    /*
     * And the mechanism, stated as the places rather than as the list: person 2
     * was still in the second place and person 3 in the third, and the place
     * person 1 was in named nobody. Under the index binding this reads
     * `['2', '3', '4']` -- every place re-pointed by one dismissal.
     *
     * Read from the state captured before the press, so the assertion is about
     * the publication under test and not about what the confirmed press then did.
     */
    expect(
      after.map((row) => row.staffId),
      'a dismissal re-pointed the places under the player',
    ).toEqual([null, '2', '3']);
    /*
     * And the freed place kept its **box** while a place after it was occupied.
     * Hiding it would slide the two rows below it up a row's height into
     * whatever pointer was resting there, which is the same defect by geometry
     * rather than by binding.
     */
    expect(
      after.map((row) => row.laidOut),
      'the freed place gave its box up, so the rows below it moved under the pointer',
    ).toEqual([true, true, true]);
    /*
     * And the place did not move, which is a second way the same harm arrives
     * and was measured while proving this test can fail.
     *
     * `.hud__side` carries `margin-top: auto`, so the Staff panel is anchored to
     * the **foot** of the rail: anything that shortens the panel's content moves
     * every row in it *down*. With the overflow line counted the old way -- the
     * payroll minus the window rather than minus the rows drawn -- the line goes
     * from *"and 1 more"* to hidden across this publication, the panel loses a
     * line of `--font-size-eyebrow`, and the second place was measured **15.19px**
     * lower than where it was read. Keeping the count honest is therefore not
     * only about the sentence; it is what stops the list sliding under a pointer.
     */
    expect(
      Math.abs(after[1]!.y - aimedAt.y),
      'the second place moved between the read and the press, so a press at the read coordinate is aimed at a different row',
    ).toBeLessThan(1);
  });

  /**
   * The other half of the invariant, and the half a fix can ship without: person
   * 4 arriving must not appear in the place person 1 just left, because a label
   * appearing under a pointer aimed at the last one is the defect with a new
   * subject. `STAFF_ROSTER_ROW_SETTLE_MS` is what refuses them.
   */
  test('nobody new appears in the place a dismissal just freed', async ({ page }) => {
    await publish(page, viewModel(roster([1, 2, 3, 4], 4)));
    await openPayroll(page);
    await publish(page, viewModel(roster([2, 3, 4], 3)));

    const after = await readRows(page);
    expect(
      after.map((row) => row.staffId).includes('4'),
      'the person who arrived took the place the dismissal freed, inside the settle window',
    ).toBe(false);
    // Naming nobody means saying nothing: a place inside its window carries no
    // label, so there is nothing on it a player could read as a subject.
    expect(after[0]!.label, 'the freed place is still saying something about somebody').toBe('');
    expect(after[0]!.staffId, 'the freed place still names somebody').toBeNull();

    /*
     * And the overflow line counts what was **drawn**, not what the window
     * carried. The payroll is three and the list is showing two, so one person
     * is behind it. Counted the old way -- the payroll minus the *window* -- the
     * subtraction is `3 - 3` and the line is **hidden**, telling a player that
     * everybody they employ is on screen while one of them is not.
     */
    await expect(page.locator('.hud-staff__roster .hud-staff__held-more')).toHaveText('and 1 more');
  });

  test('the first press of two arms the row and sends nothing', async ({ page }) => {
    await publish(page, viewModel(roster([1, 2, 3, 4], 4)));
    await openPayroll(page);

    const rows = await readRows(page);
    const first = rows[0]!;
    await page.mouse.click(first.x, first.y);

    expect(await dismissals(page), 'one press sacked somebody, with nothing confirmed').toEqual([]);

    const armed = await readRows(page);
    expect(
      armed.map((row) => row.dismiss),
      'the press did not arm exactly the row it landed on',
    ).toEqual(['armed', null, null]);

    const confirmation = await readConfirmation(page, CONFIRMATION(first.label));
    expect(confirmation.laidOut, 'arming drew no confirmation at all').toBe(true);
    /*
     * The owner's sentence, with `{name}` filled by the row's own label -- what
     * the player read on the row they pressed. #877 is that the row fired at the
     * wrong person, so a confirmation that named nobody would be a second press
     * bought with none of the safety a confirmation is for.
     */
    expect(confirmation.text, 'the confirmation does not name the person on the row that was pressed').toBe(
      CONFIRMATION(first.label),
    );
    expect(
      confirmation.matches,
      'the sentence is not rendered by exactly one element, so either it is gone or something renders it twice',
    ).toBe(1);
    // And it is the armed control's own description, so a screen reader reaches
    // the name from the button rather than from a line beside it.
    expect(confirmation.id, 'the confirmation carries no id to be described by').not.toBe('');
    expect(
      armed[0]!.describedBy.split(/\s+/u),
      'the armed control does not point at the confirmation',
    ).toContain(confirmation.id);

    // The second press is the one that sacks somebody, and it sacks the person
    // the box named.
    await page.mouse.click(first.x, first.y);
    expect(await dismissals(page), 'the confirmed press did not sack the person the box named').toEqual([1]);
    expect(
      (await readConfirmation(page, CONFIRMATION(first.label))).laidOut,
      'the confirmation is still standing after it was confirmed',
    ).toBe(false);
  });

  /**
   * The case that would make a confirmation worse than none if it went the other
   * way: a player who armed the wrong row and presses the right one must not
   * sack the person they were correcting away from.
   */
  test('pressing another row re-aims the confirmation rather than sacking anybody', async ({ page }) => {
    await publish(page, viewModel(roster([1, 2, 3, 4], 4)));
    await openPayroll(page);

    const rows = await readRows(page);
    await page.mouse.click(rows[0]!.x, rows[0]!.y);
    await page.mouse.click(rows[1]!.x, rows[1]!.y);

    expect(await dismissals(page), 'correcting the aim sacked somebody').toEqual([]);
    const armed = await readRows(page);
    expect(armed.map((row) => row.dismiss), 'the arm did not move to the row that was pressed second').toEqual([
      null,
      'armed',
      null,
    ]);
    expect(
      (await readConfirmation(page, CONFIRMATION(rows[1]!.label))).text,
      'the confirmation still names the row the player corrected away from',
    ).toBe(CONFIRMATION(rows[1]!.label));

    await page.mouse.click(rows[1]!.x, rows[1]!.y);
    expect(await dismissals(page), 'the confirmed press sacked the wrong person').toEqual([2]);
  });

  /**
   * An arm is a question about somebody, so it goes when nobody on the block is
   * that somebody. The block losing its box is the widest version of that, and
   * the one a player reaches by leaving the tab.
   */
  test('an arm does not outlive the block it was made in', async ({ page }) => {
    await publish(page, viewModel(roster([1, 2, 3, 4], 4)));
    await openPayroll(page);
    const rows = await readRows(page);
    await page.mouse.click(rows[0]!.x, rows[0]!.y);
    expect((await readConfirmation(page, CONFIRMATION(rows[0]!.label))).laidOut).toBe(true);

    /*
     * Nobody hired: the section has no box at all, which is what the arrival
     * state is and what leaving the Security tab produces (`src/main.ts` takes
     * the roster off the view model on any tab but `security`).
     *
     * Asserted through the section rather than by re-opening the fold: a hidden
     * section cannot be opened, so waiting for its rows would be waiting for
     * something the state under test forbids.
     */
    await publish(page, viewModel({ hired: 0, staff: [] }));
    await expect(page.locator('.hud-staff__roster'), 'the payroll section outlived the last dismissal').toBeHidden();
    expect(
      (await readConfirmation(page, CONFIRMATION(rows[0]!.label))).laidOut,
      'the confirmation outlived the block it was made in',
    ).toBe(false);

    // And the block comes back drawing its rows: a place that had no box on
    // screen was never protecting a label, so its settle window is forgotten
    // rather than kept -- the regression #860's first shipped fix paid for.
    await publish(page, viewModel(roster([5, 6, 7], 3)));
    await openPayroll(page);
    expect(
      (await readRows(page)).map((row) => row.staffId),
      'the payroll came back empty, so every place refused the publication inside a settle window it should have forgotten',
    ).toEqual(['5', '6', '7']);
    expect(await dismissals(page), 'something was sacked without a press').toEqual([]);
  });
});

test.describe('the dismiss confirmation is whole at the shortest viewport (#877, #884)', () => {
  /*
   * 900x600: the binding viewport this repository argues every layout decision
   * against, and the one inside `hud.css`'s `@media (max-height: 700px)`
   * single-line clamp band.
   */
  test.use({ viewport: { width: 900, height: 600 } });

  test.beforeEach(async ({ page }) => {
    await page.goto(HARNESS_URL);
    await openSecurityTab(page);
  });

  /**
   * The sentence the owner ruled is two lines here, and the clause the clamp
   * would cut is *"and they do not come back"* -- the whole of what makes it a
   * warning rather than a second rendering of the button beside it. So the box
   * gives way, exactly as it did for the hire sentence in #884.
   */
  test('renders the whole confirmation, on screen and not cut by the clamp', async ({ page }) => {
    await publish(page, viewModel(roster([1, 2, 3, 4], 4)));
    await openPayroll(page);

    const rows = await readRows(page);
    const first = rows.find((row) => row.staffId === '1');
    expect(first, 'the payroll drew no row for person 1').not.toBeUndefined();
    expect(
      first!.pressable,
      `the row control is not inside the 900x600 window, so nothing here can arm it: ${JSON.stringify([first!.x, first!.y])}`,
    ).toBe(true);
    await page.mouse.click(first!.x, first!.y);

    const sentence = CONFIRMATION(first!.label);
    const reading = await readConfirmation(page, sentence);

    expect(reading.text, 'the panel drew no confirmation at 900x600').toBe(sentence);
    expect(reading.width, 'the confirmation measured zero width, so it is in the DOM and not on screen').toBeGreaterThan(0);
    expect(reading.height, 'the confirmation measured zero height').toBeGreaterThan(0);
    /*
     * The assertion this test exists for. `@media (max-height: 700px)` clamps
     * every `.hud-staff__note` to one line, and this sentence is longer than one
     * line at this width -- so without the exemption `scrollHeight` exceeds
     * `clientHeight` and the player reads a confirmation with its consequence
     * cut off. A test that only found the text in the DOM would pass against
     * that.
     */
    expect(
      reading.clipped,
      `the confirmation is being clipped at 900x600: scrollHeight ${reading.scrollHeight} against clientHeight ${reading.clientHeight}`,
    ).toBe(false);
    /*
     * And it is on screen without the player scrolling for it, which
     * `paintDismissConfirmation` scrolls into view on the press that reveals it:
     * this block is the last thing in a panel that is `overflow-y: auto`, and a
     * confirmation the player cannot read is worse than none -- the second press
     * still sacks somebody.
     */
    expect(
      reading.insidePanel,
      'the confirmation sits outside the panel fold, so the sentence is on the page and reaches nobody -- #629',
    ).toBe(true);

    /*
     * The exemption as a rule as well as through the geometry, and the pair is
     * what stops either half passing for the wrong reason. If the
     * `max-height: 700px` block were not in force at all, the clipping assertion
     * above would pass with no exemption in the file: the witness is a
     * `.hud-staff__note` in this same block that is deliberately still clamped
     * -- an overflow count reads fine with its tail cut, which is the category
     * `hud.css` says stays clamped. `ui-staff-wage.spec.ts` uses the same
     * witness and its comment carries the argument.
     */
    expect(
      reading.clampedWitnessLaidOut,
      'the vacuity witness has no box at this viewport, so its computed clamp proves nothing about a laid-out note',
    ).toBe(true);
    expect(
      reading.clampedWitnessLineClamp,
      'the short-viewport clamp is not in force at 900x600, so nothing here is testing an exemption from it',
    ).toBe('1');
    expect(
      reading.lineClamp,
      'the confirmation is clamped like its neighbours, so the consequence clause is being cut off',
    ).not.toBe('1');
    expect(reading.display, 'the confirmation is still laid out as the clamped box').toBe('block');
  });
});
