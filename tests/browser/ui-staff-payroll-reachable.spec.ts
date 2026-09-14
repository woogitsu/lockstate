import { type Page, expect, test } from './network-changed-fixture';
import type { HudViewModel } from '../../src/ui/hud';
import './ui-harness-api'; // pulls in the `Window.lockstateUiHarness` global augmentation

/**
 * **The control that stops the payroll is on screen and can be pressed** (issue
 * [#912](https://github.com/matmaxalez/lockstate/issues/912), on the play in
 * [#911](https://github.com/matmaxalez/lockstate/issues/911)).
 *
 * ## The prison this drives
 *
 * The one finding 2 of `docs/research/2026-09-04-can-this-prison-fail.md` was
 * played into: sixty guards hired, no room zoned, so nothing to assign anybody
 * to. Every guard is `'unassigned'`, no guard is held, the treasury is under
 * water and the payroll bills 4,800 a day. Dismissal is the only control in the
 * HUD that stops that bill.
 *
 * ## What #912 diagnosed, and what is actually wrong
 *
 * The issue reports six `.hud-staff__held-row` elements at `visible=false`, of
 * which three carry an **enabled** `Dismiss`, and concludes that *"the block
 * draws only assigned guards"*. **That is not what the code does and this file
 * pins the opposite.** `HudStaffRosterViewModel` is deliberately not the held
 * subset -- its own docblock names *"three guards hired into a prison that
 * requires none, every one of them `'unassigned'` and therefore on no held row
 * at all"* as the case it exists for -- and `staffRosterFromProjection` filters
 * nothing. The rows in that table were populated, aimed and pressable.
 *
 * Two real defects produced that reading, and they are what is fixed:
 *
 * 1. **The roster list and the held list carried one class name, and so did
 *    their rows.** So `.hud-staff__held-list` answered for the *held* list --
 *    genuinely `hidden`, correctly, in a prison holding nobody -- and
 *    `.hud-staff__held-row` returned six rows from two different blocks. The
 *    issue's own refuting sample ("is the block merely collapsed?") could not
 *    refute anything, because both of its readings were about the block that
 *    was not under test. `.hud-staff__roster-list` and
 *    `.hud-staff__roster-row` are what this file addresses, and the first test
 *    below pins that the two blocks are two nodes.
 * 2. **Opened, every `Dismiss` fell below the panel's own fold at four of the
 *    five viewports the browser suite visits.** Measured on unfixed `main` in
 *    this prison: 0 of 3 inside the fold at 1280x720, 1024x768 and 900x600, and
 *    2 of 3 at 375x812. That is #220's and #285's shape and the buy row's
 *    (#703) -- an enabled control with a real box that a player cannot see --
 *    and `STAFF_ROSTER_ROW_LIMIT`'s docblock had said in as many words that
 *    this measurement had never been taken. It has now.
 *
 * So the fold starting shut is **not** the defect, and this file does not
 * change it: `collapsed: true` is a measured arrival-height decision and
 * `ui-staff-wage.spec.ts` gates it. What the fold owes the player is that
 * opening it reveals the control, which is `paintBuyTotal`'s rule one panel
 * over -- *"a disclosure that reveals a control the player cannot see has not
 * revealed it."*
 *
 * ## Why `app-shell.spec.ts` could not have caught this
 *
 * It presses this very fold at every one of the five viewports and then asserts
 * every control on the page is reachable -- and it passed on unfixed `main`,
 * with all three of these controls outside the panel's fold. The reason is in
 * `controlReachability`: before it hit-tests a control it calls
 * `control.scrollIntoView({ block: 'nearest', inline: 'nearest' })` itself. That
 * is the right thing for the question that sweep asks -- *is anything covering
 * this control?* -- and it is precisely the gesture a player has to make by hand
 * and has no reason to know is needed. So that sweep certifies the control is
 * not occluded once you are looking at it, and this file is what asks whether
 * you are looking at it.
 *
 * ## Why a browser, and why five viewports
 *
 * `vitest.config.ts` is `environment: 'node'`, so `createStaffPanel` is not
 * merely untested there, it is unreachable -- and none of what is asserted here
 * is a decision a pure function could hold. It is `getBoundingClientRect`
 * against `clientHeight`, which only a browser has. Five viewports because the
 * defect was present at four of them and absent at the widest, so a spec at one
 * viewport would have been a coin toss.
 *
 * ## What was watched going red
 *
 * Five mutations of the production code, each restored **by hand** and the file
 * verified with `sha256sum -c` before the next. Baseline: `20 passed (18.1s)`.
 *
 * | mutation | result |
 * | --- | --- |
 * | the reveal removed (`rosterSection.body.scrollIntoView` deleted) | **4 failed, 16 passed** -- 1280x720, 1024x768, 900x600 and 375x812, and green at 1440x900, which is the defect's own shape |
 * | `ROSTER_LIST_CLASS` back to `'hud-staff__held-list'` | 5 failed, 15 passed |
 * | `ROSTER_ROW_CLASS` back to `'hud-staff__held-row'` | 20 failed |
 * | the *list* brought into view instead of the block | **5 failed** -- *"the only warning that a dismissal is permanent is below the fold the press is above"* |
 * | the reveal run on collapse as well as on open | 20 passed -- **survivor** |
 *
 * The first mutation is the measurement: `[false, false, false]` at 900x600,
 * with the message reporting *"bottoms 597.1 / 645.1 / 693.1 against a fold at
 * 522"*.
 *
 * **The survivor is reported rather than covered, because it is not a gap this
 * file can close honestly.** Dropping the `!collapsed` guard has no observable
 * effect: `setCollapsed(true)` sets `body.hidden` before the call would run, and
 * `scrollIntoView` on a node with no box is defined to do nothing. The guard
 * stays because it states the intent, not because a test can tell.
 *
 * The fourth mutation was a survivor too until this file asserted the overflow
 * line and the block's sentence as well as the controls. It is recorded that way
 * round deliberately: the first version of the reveal assertion passed on a
 * reveal that left the only *"leaves the prison for good"* warning 26.5px below
 * the fold at 900x600.
 */

const HARNESS_URL = '/tests/browser/ui-harness.html';

/**
 * Sixty guards, none of them assigned, in a prison with nothing zoned.
 *
 * `4_800` is the played prison's bill and `-2_500` its floor, so the hire
 * control is refused for want of money in the same reading -- which is what
 * makes dismissal the only lever, and is the whole reason this block has to be
 * reachable. Three roster rows, because `STAFF_ROSTER_ROW_LIMIT` is the window
 * the reader asks for; `hired: 60` is what the prison actually employs, so the
 * overflow line has something true to say.
 */
function viewModel(): HudViewModel {
  return {
    counts: {
      prisoners: 0,
      prisonerCapacity: 0,
      occupiedPlaces: 0,
      staff: 60,
      staffUnassigned: 0,
      rooms: 0,
      prisonersCovered: 0,
      prisonersUnderstaffed: 0,
      prisonersUnguarded: 0,
      prisonersHighRisk: 0,
      activeIncidents: 0,
      contrabandFound: 0,
      treasuryMinorUnits: -2_500,
      stateIncomeAccruedTodayMinorUnits: 0,
      dailyWageBillMinorUnits: 4_800,
    },
    clock: { day: 9, tickOfDay: 600, dayLengthTicks: 2_400, mode: 'paused', speed: 1 },
    alerts: [],
    // Nobody held, which is the true state of a prison with no post to hold
    // anybody at -- and the state whose `hidden` list the issue's measurement
    // read by mistake.
    heldGuards: { held: 0, unassigned: 60, guards: [] },
    staffCoverage: { required: 0, assigned: 0, shortage: 0 },
    staffRoster: {
      hired: 60,
      staff: [
        { entityId: 7, statusLabelKey: 'deployment-phase.unassigned.name', roleLabelKey: 'staff-role.guard.name' },
        { entityId: 8, statusLabelKey: 'deployment-phase.unassigned.name', roleLabelKey: 'staff-role.guard.name' },
        { entityId: 9, statusLabelKey: 'deployment-phase.unassigned.name', roleLabelKey: 'staff-role.guard.name' },
      ],
    },
  };
}

interface RowReading {
  /** `data-staff` -- the staff member this row names, which is its only stable name. */
  readonly staff: string | null;
  /** What the row says about them. */
  readonly labelText: string;
  /** The control's own label, so a row whose button moved is a failure. */
  readonly buttonText: string;
  /** `offsetParent`: whether the browser gave the row a box at all. */
  readonly laidOut: boolean;
  /** The DOM property. `false` is what makes the control pressable. */
  readonly disabled: boolean;
  /** `aria-disabled`, which is how a pooled row holding its place says so. */
  readonly unavailable: string | null;
  /**
   * Whether the **control's** box lies inside the panel's own client box.
   *
   * The button and not the row: what a player has to reach is the press, and a
   * row whose top edge is above the fold with its button below it is exactly
   * the state that reads as reachable and is not.
   */
  readonly buttonInsideFold: boolean;
  readonly buttonBottom: number;
  readonly buttonHeight: number;
}

interface Reading {
  /** The bottom of the panel's *client* box -- where its content starts being clipped. */
  readonly fold: number;
  /** How many nodes answer to the roster block's own list class. Exactly one, or it is not a name. */
  readonly rosterListCount: number;
  /** How many answer to the held block's. Also exactly one. */
  readonly heldListCount: number;
  /** True when those two selectors found two different nodes. */
  readonly listsAreDistinct: boolean;
  /** Whether the roster list is inside the roster section and not the held block. */
  readonly rosterListInRosterSection: boolean;
  /** Whether the held list is inside the held block and not the roster section. */
  readonly heldListInHeldBlock: boolean;
  /** Whether the payroll section has a box, and whether its fold is shut. */
  readonly rosterLaidOut: boolean;
  readonly rosterCollapsed: string | null;
  /** The header badge, which is the figure that survives the shut fold. */
  readonly billText: string | null;
  /** Every row that answers to the roster block's row class, in DOM order. */
  readonly rosterRows: readonly RowReading[];
  /**
   * The overflow line and the block's own sentence, and whether either is
   * where it can be read.
   *
   * Asserted beside the controls because the block is not only its buttons: the
   * overflow line is the only thing that says the payroll is 57 people longer
   * than the list, and the sentence is the only warning on screen that a
   * dismissal is permanent. A reveal that brought the rows into view and left
   * these two below the fold would put the *consequence* of the press out of
   * reach of the player being asked to make it.
   */
  readonly moreText: string;
  readonly moreInsideFold: boolean;
  readonly hintText: string;
  readonly hintInsideFold: boolean;
  /** The confirmation line: what it says, and whether it is where it can be read. */
  readonly confirmText: string;
  readonly confirmLaidOut: boolean;
  readonly confirmInsideFold: boolean;
  /** What the whole panel renders, for the raw-key read. */
  readonly panelText: string;
}

async function read(page: Page): Promise<Reading> {
  return page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('.hud-staff');
    if (panel === null) throw new Error('no Staff panel in the mounted HUD');
    const panelBox = panel.getBoundingClientRect();
    // The *client* box: where content starts being clipped, unaffected by how
    // far the panel happens to be scrolled -- `StaffProbe.panelVisibleBottom`'s
    // own reading.
    const fold = panelBox.top + panel.clientTop + panel.clientHeight;
    const drawn = (node: Element | null | undefined): boolean =>
      node instanceof HTMLElement && node.offsetParent !== null;
    const insideFold = (node: Element | null | undefined): boolean => {
      if (!(node instanceof HTMLElement)) return false;
      const box = node.getBoundingClientRect();
      return box.height > 0 && box.top >= panelBox.top - 0.5 && box.bottom <= fold + 0.5;
    };
    const round = (value: number): number => Math.round(value * 10) / 10;

    const rosterLists = [...panel.querySelectorAll<HTMLElement>('.hud-staff__roster-list')];
    const heldLists = [...panel.querySelectorAll<HTMLElement>('.hud-staff__held-list:not(.hud-staff__roster-list)')];
    const rosterSection = panel.querySelector<HTMLElement>('.hud-staff__roster');
    const heldBlock = panel.querySelector<HTMLElement>('.hud-staff__held');
    const bill = panel.querySelector<HTMLElement>('.hud-staff__roster-count');
    const confirm = panel.querySelector<HTMLElement>('.hud-staff__dismiss-confirm');
    const rosterMore = panel.querySelector<HTMLElement>('.hud-staff__roster .hud-staff__held-more');
    // The block's own sentence: the one note in the payroll body that is
    // neither the overflow line nor the confirmation, picked that way rather
    // than by position so a fourth line appearing above it does not silently
    // move this reading onto something else.
    const rosterHint = panel.querySelector<HTMLElement>(
      '.hud-staff__roster .ui-section__body > .hud-staff__note:not(.hud-staff__held-more):not(.hud-staff__dismiss-confirm)',
    );

    return {
      fold: round(fold),
      rosterListCount: rosterLists.length,
      heldListCount: heldLists.length,
      listsAreDistinct:
        rosterLists.length === 1 && heldLists.length === 1 && rosterLists[0] !== heldLists[0],
      rosterListInRosterSection:
        rosterLists.length === 1 && rosterSection !== null && rosterSection.contains(rosterLists[0] ?? null),
      heldListInHeldBlock: heldLists.length === 1 && heldBlock !== null && heldBlock.contains(heldLists[0] ?? null),
      rosterLaidOut: drawn(rosterSection),
      rosterCollapsed: rosterSection?.dataset['collapsed'] ?? null,
      billText: bill === null ? null : bill.textContent,
      rosterRows: [...panel.querySelectorAll<HTMLElement>('.hud-staff__roster-row')].map((row) => {
        const button = row.querySelector('button');
        const buttonBox = button?.getBoundingClientRect();
        return {
          staff: row.dataset['staff'] ?? null,
          labelText: row.querySelector('.hud-staff__held-label')?.textContent ?? '',
          buttonText: button?.textContent ?? '',
          laidOut: drawn(row),
          disabled: button === null ? true : button.disabled,
          unavailable: button?.getAttribute('aria-disabled') ?? null,
          buttonInsideFold: insideFold(button),
          buttonBottom: buttonBox === undefined ? 0 : round(buttonBox.bottom),
          buttonHeight: buttonBox === undefined ? 0 : round(buttonBox.height),
        };
      }),
      moreText: rosterMore?.textContent ?? '',
      moreInsideFold: insideFold(rosterMore),
      hintText: rosterHint?.textContent ?? '',
      hintInsideFold: insideFold(rosterHint),
      confirmText: confirm?.textContent ?? '',
      confirmLaidOut: drawn(confirm),
      confirmInsideFold: insideFold(confirm),
      panelText: panel.innerText,
    };
  });
}

async function openSecurityTab(page: Page): Promise<void> {
  await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
  expect(await page.evaluate(() => window.lockstateUiHarness.clickTab('manage'))).toBe(true);
  await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), viewModel());
}

/** One real press on the payroll disclosure -- the header button, as a player finds it. */
async function pressPayrollHeader(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const header = document.querySelector<HTMLButtonElement>('.hud-staff__roster .ui-section__header');
    if (header === null) return false;
    header.click();
    return true;
  });
}

const intents = (page: Page): Promise<readonly string[]> =>
  page.evaluate(() => window.lockstateUiHarness.hudIntents());

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 1024, height: 768 },
  { width: 900, height: 600 },
  { width: 375, height: 812 },
]) {
  test.describe(`the payroll can be stopped at ${viewport.width}x${viewport.height} (#912)`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await page.goto(HARNESS_URL);
    });

    test('the payroll block is a block of its own, not the held list under another name', async ({ page }) => {
      await openSecurityTab(page);
      const reading = await read(page);

      expect(reading.rosterListCount, 'no single node answers to `.hud-staff__roster-list`').toBe(1);
      expect(reading.heldListCount, 'the held list is no longer addressable on its own').toBe(1);
      expect(
        reading.listsAreDistinct,
        'the two lists are one node, so a probe cannot tell the held block from the payroll block -- which is how #912 was diagnosed',
      ).toBe(true);
      expect(reading.rosterListInRosterSection, 'the roster list is not inside the payroll section').toBe(true);
      expect(reading.heldListInHeldBlock, 'the held list is not inside the held block').toBe(true);
      // Three rows and no more: the window is `STAFF_ROSTER_ROW_LIMIT`, and a
      // selector that had picked up the held rows too would report six.
      expect(reading.rosterRows.length, 'the payroll row selector is not reporting exactly the payroll rows').toBe(3);
    });

    test('every unassigned guard on the payroll is on a row, aimed and enabled', async ({ page }) => {
      await openSecurityTab(page);
      const reading = await read(page);

      // The refutation of #912's stated cause: the block does *not* draw only
      // assigned guards. Every one of these is `'unassigned'`.
      expect(
        reading.rosterRows.map((row) => row.staff),
        'the payroll rows do not name the unassigned guards the prison is paying for',
      ).toEqual(['7', '8', '9']);
      expect(
        reading.rosterRows.map((row) => row.labelText),
        'a row is on screen without saying who it is about and what they are doing',
      ).toEqual(['Guard · Unassigned', 'Guard · Unassigned', 'Guard · Unassigned']);
      expect(reading.rosterRows.map((row) => row.buttonText)).toEqual(['Dismiss', 'Dismiss', 'Dismiss']);
      expect(reading.rosterRows.map((row) => row.disabled)).toEqual([false, false, false]);
      expect(
        reading.rosterRows.map((row) => row.unavailable),
        'a row is reporting itself unavailable while it names somebody the prison is paying for',
      ).toEqual(['false', 'false', 'false']);

      // And the state the fold is in on arrival, so the assertion below is
      // never taken against a block that was already open. This is
      // `ui-staff-wage.spec.ts`'s decision and is asserted here rather than
      // changed: what is on trial is what one press of the header reveals.
      expect(reading.rosterLaidOut, 'the payroll section has no box, so there is nothing to press').toBe(true);
      expect(reading.rosterCollapsed, 'the payroll fold is not shut on arrival').toBe('true');
      expect(reading.billText, 'the bill a player has to be told about does not survive the shut fold').toBe(
        '4,800 a day',
      );
    });

    test('one press of the payroll header puts every Dismiss inside the panel fold', async ({ page }) => {
      await openSecurityTab(page);
      expect(await pressPayrollHeader(page), 'the payroll header is not a button a player can press').toBe(true);
      const reading = await read(page);

      expect(reading.rosterCollapsed, 'the press did not open the fold').toBe('false');
      expect(
        reading.rosterRows.map((row) => row.laidOut),
        'the fold is open and the rows still have no box',
      ).toEqual([true, true, true]);
      expect(
        reading.rosterRows.map((row) => row.buttonHeight > 0),
        'a Dismiss control measured zero height, so it is in the DOM and not on the screen',
      ).toEqual([true, true, true]);
      /*
       * **The assertion this file exists for.** On unfixed `main` this reads
       * `[false, false, false]` at 1280x720, 1024x768 and 900x600 and
       * `[true, true, false]` at 375x812 -- an enabled control, with a real box,
       * that a player cannot see. The message quotes the numbers, because a bare
       * `false` here says nothing about how far out of reach the control was.
       */
      expect(
        reading.rosterRows.map((row) => row.buttonInsideFold),
        `a Dismiss control is outside the panel's fold: bottoms ${reading.rosterRows
          .map((row) => row.buttonBottom)
          .join(' / ')} against a fold at ${reading.fold}`,
      ).toEqual([true, true, true]);

      /*
       * And the two lines the press is decided with, which the controls alone
       * do not cover: scrolling the *list* into view rather than the block
       * leaves both below the fold -- measured at 900x600, the overflow line's
       * bottom at 535.3 and the sentence's at 548.5 against a fold at 522.0.
       */
      expect(reading.moreText, 'the payroll block is not saying how many it did not list').toBe('and 57 more');
      expect(
        reading.moreInsideFold,
        'the overflow line is below the fold, so the list looks like the whole payroll',
      ).toBe(true);
      expect(reading.hintText, "the block's own sentence is not what it says").toBe(
        'A dismissed staff member leaves the prison for good, and their wage stops.',
      );
      expect(
        reading.hintInsideFold,
        'the only warning that a dismissal is permanent is below the fold the press is above',
      ).toBe(true);
    });

    test('two presses dismiss the guard the row named, after saying so where it can be read', async ({ page }) => {
      await openSecurityTab(page);
      expect(await pressPayrollHeader(page)).toBe(true);

      // The first press arms and asks. Aimed by `data-staff` rather than by
      // position, because the rows are pooled and a position is not a name.
      const armed = await page.evaluate(() => {
        const row = document.querySelector<HTMLElement>('.hud-staff__roster-row[data-staff="8"]');
        const button = row?.querySelector('button') ?? null;
        if (button === null) return false;
        button.click();
        return true;
      });
      expect(armed, 'no payroll row names guard 8').toBe(true);

      const asking = await read(page);
      expect(asking.confirmText, "the owner's confirmation sentence is not what the panel asked").toBe(
        'Dismiss Guard · Unassigned? Their wage stops and they do not come back.',
      );
      expect(asking.confirmLaidOut, 'the confirmation has no box').toBe(true);
      expect(
        asking.confirmInsideFold,
        'the confirmation is outside the panel fold, so the second press is asked for and never read',
      ).toBe(true);
      expect(await intents(page), 'the first press dismissed somebody instead of asking').toEqual([
        '{"kind":"select-tab","tab":"manage"}',
      ]);

      // The second press on the same control is the one that spends.
      await page.evaluate(() => {
        document.querySelector<HTMLElement>('.hud-staff__roster-row[data-staff="8"]')?.querySelector('button')?.click();
      });
      expect(await intents(page), 'the confirmed press did not reach the host, or reached it for somebody else').toEqual(
        ['{"kind":"select-tab","tab":"manage"}', '{"kind":"dismiss-staff","staffId":8}'],
      );
    });
  });
}
