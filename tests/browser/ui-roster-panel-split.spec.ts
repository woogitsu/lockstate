import { expect, test } from './network-changed-fixture';
import type {
  HudPrisonerDetailViewModel,
  HudPrisonerRosterViewModel,
  HudRegimeViewModel,
} from '../../src/ui/hud';
import './ui-harness-api'; // pulls in the `Window.lockstateUiHarness` global augmentation

/** The same harness page `ui-shell.spec.ts` drives, for the same reason: this is a layout question about `src/ui/`. */
const HARNESS_URL = '/tests/browser/ui-harness.html';

/**
 * **What the Plan dnia tab's split bought, measured at a viewport.**
 *
 * The owner ruled on ADR 0115 on 2026-09-16, choosing among clickable options
 * the one labelled *"Opcja 4 — rozbij panel w kodzie, obie połowy na Plan dnia
 * (zalecane)"* -- split the panel in code, both halves on Plan dnia. Option 2,
 * a third panel on the Manage rail, was declined. So there are two decisions
 * here to hold, and they pull in different directions: the halves are
 * **separate panels**, and they are **on the same tab**.
 *
 * ## Why this is its own file and not more cases in `ui-shell.spec.ts`
 *
 * That file's Regime describe already drives both halves from hand-written
 * view models and already measures the roster's last line against its panel's
 * fold. What it cannot express is the property the split makes structural,
 * because that property is about a **scroll**: the timetable cannot be
 * carried out of view by a roster that grows, whatever a later
 * `PRISONER_ROSTER_ROW_LIMIT` or a taller inspector does. Asserting it means
 * scrolling one panel and re-reading another against it, which is a different
 * shape from every case in that describe and would be a third thing its
 * `beforeEach` had to arrange.
 *
 * **It is a property and not a repair, and that is measured rather than
 * assumed.** Read on `a3a9e7f3` with the same fixtures this file uses, the
 * single panel's `scrollHeight - clientHeight` was **0 at all five viewports**
 * the browser suite visits -- so the failure the paragraph above describes was
 * available and never reached. What the split cost instead is 63px of chrome
 * and an arrival scroll at 375x812 and 900x600; `hud.css`'s
 * `.ui-panel.hud-roster` block carries the table.
 *
 * ## What is asserted, and what is only printed
 *
 * Three claims, each of which fails if the split is undone in a different way:
 *
 * 1. **Both panels are laid out, together, on this tab and on no other.** The
 *    ruling, and the declined option, in one assertion.
 * 2. **The timetable is not inside the roster's scroll box.** Scroll the
 *    roster panel to its end and the timetable has not moved, which is false
 *    of any arrangement where one scroll container holds both.
 * 3. **The timetable's panel is not a scroll container at all** -- its
 *    `scrollHeight` equals its `clientHeight`, so it keeps its natural height
 *    and the roster panel is the one that absorbs a short rail. That is the
 *    division `.ui-panel.hud-intake` and `.ui-panel.hud-staff` already make on
 *    the Manage tab, and it is the one thing one panel could not express about
 *    its own two halves.
 *
 * The **cost** -- the second panel's chrome -- is printed rather than pinned to
 * a number, for the reason `PRISONER_ROSTER_ROW_LIMIT`'s tables give: a figure
 * pinned here would fail on a font metric or a token change that is nobody's
 * defect. What is pinned is the consequence that matters, that neither panel
 * overflows its box in the arrival state, which is the fold assertion
 * `ui-shell.spec.ts` makes for the roster and this one extends to the pair.
 */
test.describe('the Plan dnia tab after ADR 0115 split the panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(HARNESS_URL);
  });

  /** Both viewports the split was measured at: the phone the ruling turned on, and a desktop. */
  const VIEWPORTS = [
    [375, 812],
    [1440, 900],
  ] as const;

  /**
   * The two classification groups the simulation declares, as
   * `src/ui/simulation-regime.ts` hands them over. Copied from
   * `ui-shell.spec.ts` rather than shared with it, for the reason that file
   * gives for not sharing its own: it is scoped inside a describe, and
   * hoisting it would widen a constant two unrelated suites would then own.
   */
  const TIMETABLE: HudRegimeViewModel = {
    groups: [
      {
        classificationGroupId: 'general-population',
        labelKey: 'classification-group.general-population.name',
        allowedCategoryLabelKeys: [
          'action-category.recreation.name',
          'action-category.hygiene.name',
          'action-category.free-association.name',
        ],
        blockProgressPercent: 42,
        startTickOfDay: 1_200,
        allowedCategoryIds: ['recreation', 'hygiene', 'free-association'],
      },
      {
        classificationGroupId: 'high-risk',
        labelKey: 'classification-group.high-risk.name',
        allowedCategoryLabelKeys: ['action-category.hygiene.name'],
        blockProgressPercent: 42,
        startTickOfDay: 1_200,
        allowedCategoryIds: ['hygiene'],
      },
    ],
  };

  /** A full window on a prison of nine: four rows, the "N of M" figure and the "and N more" line. */
  const ROSTER: HudPrisonerRosterViewModel = {
    total: 9,
    everAdmitted: true,
    rows: [
      {
        entityId: 3,
        name: { givenName: 'Mara', familyName: 'Ostrowska' },
        activityLabelKey: 'action.shower.name',
        travelling: true,
        standingLabelKey: 'risk-tier.1.name',
        classificationGroupId: 'general-population',
        riskTier: 1,
        lowestNeed: { needId: 'hunger', labelKey: 'need.hunger.name', permille: 200, unmetForStateIncome: true },
      },
      {
        entityId: 5,
        name: { givenName: 'Delphine', familyName: 'Vanderweghe' },
        activityLabelKey: 'action.yard-recreation.name',
        travelling: false,
        standingLabelKey: 'risk-tier.3.name',
        classificationGroupId: 'high-risk',
        riskTier: 3,
        lowestNeed: { needId: 'hygiene', labelKey: 'need.hygiene.name', permille: 0, unmetForStateIncome: true },
      },
      {
        entityId: 8,
        activityLabelKey: 'action-phase.idle.name',
        travelling: false,
        standingLabelKey: 'intake-stage.classification.name',
        lowestNeed: { needId: 'bladder', labelKey: 'need.bladder.name', permille: 204, unmetForStateIncome: false },
      },
      {
        entityId: 11,
        name: { givenName: 'Tomasz', familyName: 'Wiśniewski' },
        activityLabelKey: 'action.free-association.name',
        travelling: false,
        standingLabelKey: 'risk-tier.0.name',
        classificationGroupId: 'general-population',
        riskTier: 0,
        lowestNeed: { needId: 'recreation', labelKey: 'need.recreation.name', permille: 1000, unmetForStateIncome: false },
      },
    ],
  };

  /**
   * A selected prisoner, because the inspector is the block that makes this
   * tab's content exceed the rail. The fullest state the tab can draw is the
   * one the split has to survive.
   */
  const DETAIL: HudPrisonerDetailViewModel = {
    entityId: 3,
    remainingSentenceTicks: 3600,
    name: { givenName: 'Mara', familyName: 'Ostrowska' },
    standingLabelKey: 'risk-tier.1.name',
    classificationGroupId: 'general-population',
    riskTier: 1,
    needs: [
      { needId: 'hunger', labelKey: 'need.hunger.name', permille: 200, unmetForStateIncome: true },
      { needId: 'sleep', labelKey: 'need.sleep.name', permille: 204, unmetForStateIncome: false },
      { needId: 'hygiene', labelKey: 'need.hygiene.name', permille: 0, unmetForStateIncome: true },
      { needId: 'bladder', labelKey: 'need.bladder.name', permille: 120, unmetForStateIncome: true },
      { needId: 'safety', labelKey: 'need.safety.name', permille: 1000, unmetForStateIncome: false },
      { needId: 'recreation', labelKey: 'need.recreation.name', permille: 40, unmetForStateIncome: true },
    ],
  };

  test('lays both halves out together on Plan dnia, and on no other tab', async ({ page }) => {
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());

    // Overview is the default tab, so this is the declined option measured
    // rather than assumed: the roster is not on Manage.
    await page.evaluate(() => window.lockstateUiHarness.clickTab('manage'));
    const onManage = await page.evaluate(() => window.lockstateUiHarness.regimeProbe());
    expect(onManage.laidOut, 'the timetable is laid out on Manage').toBe(false);
    expect(onManage.rosterPanelLaidOut, 'the roster is laid out on Manage, which is the option the owner declined').toBe(
      false,
    );

    await page.evaluate(() => window.lockstateUiHarness.clickTab('day-plan'));
    const onDayPlan = await page.evaluate(() => window.lockstateUiHarness.regimeProbe());
    expect(onDayPlan.laidOut, 'the timetable is not laid out on Plan dnia').toBe(true);
    expect(onDayPlan.rosterPanelLaidOut, 'the roster is not laid out on Plan dnia beside it').toBe(true);

    // Two panels, not one renamed: the timetable's box and the roster's are
    // different boxes, and the roster's is below the timetable's -- the
    // reading order the one panel had, preserved across the split.
    const schedule = onDayPlan.scheduleBox;
    const roster = onDayPlan.panelBox;
    expect(schedule, 'the timetable panel has no box').not.toBeNull();
    expect(roster, 'the roster panel has no box').not.toBeNull();
    if (schedule === null || roster === null) return;
    expect(roster.y, `the roster panel starts at y=${roster.y} and the timetable ends at y=${schedule.bottom}`)
      .toBeGreaterThanOrEqual(schedule.bottom);
  });

  for (const [width, height] of VIEWPORTS) {
    test(`keeps the timetable on screen while the roster scrolls at ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate(() => window.lockstateUiHarness.clickTab('day-plan'));
      await page.evaluate(
        ([regime, roster]) => window.lockstateUiHarness.reportRegime(regime, roster),
        [TIMETABLE, ROSTER] as const,
      );
      // The inspector is a *selection's* answer, so the press has to happen
      // before the reply means anything: `paintDetail` ignores a detail whose
      // `entityId` is not the chosen prisoner's, which is the race it exists
      // to refuse.
      await page.locator('.hud-regime__roster-row[data-prisoner="3"]').click();
      await page.evaluate(
        ([regime, roster, detail]) => window.lockstateUiHarness.reportRegime(regime, roster, detail),
        [TIMETABLE, ROSTER, DETAIL] as const,
      );

      const arrival = await page.evaluate(() => window.lockstateUiHarness.regimeProbe());
      expect(arrival.blocksLaidOut, `the timetable drew no box at ${width}x${height}`).toBe(true);
      expect(arrival.rows.length, `the roster drew ${arrival.rows.length} rows at ${width}x${height}`).toBe(4);
      expect(arrival.detail.laidOut, `the inspector drew no box at ${width}x${height}`).toBe(true);

      /*
       * **The timetable's panel is not a scroll container**, which is the
       * `flex: 0 0 auto` half of the split. A timetable taller than its own box
       * would be clipped rather than scrollable here, so this is the assertion
       * that has to hold for the roster panel to be the one that gives way.
       */
      expect(
        arrival.scheduleOverflow,
        `the timetable's panel scrolls by ${arrival.scheduleOverflow}px at ${width}x${height}`,
      ).toBe(0);

      // The cost of the second panel, printed rather than pinned -- see this
      // file's header for why.
      const chrome = (arrival.scheduleBox?.height ?? 0) + (arrival.panelBox?.height ?? 0);
      // eslint-disable-next-line no-console
      console.log(
        `${width}x${height}: timetable ${arrival.scheduleBox?.height ?? 0}px + roster ${arrival.panelBox?.height ?? 0}px = ${chrome}px, roster overflow ${arrival.panelOverflow}px`,
      );

      /*
       * The property the split makes structural. `scrollTop` is driven to the
       * end of whatever the roster panel can scroll -- the state a player
       * reaches by looking for the last row -- and the timetable is read
       * again. It cannot have moved, because the scroll belongs to a box the
       * timetable is not in.
       *
       * **This is a guard against a future roster rather than a fix for
       * today's**, and the honest reading of it is in this file's header: the
       * single panel this replaced never scrolled at any viewport, so the
       * timetable was never actually carried away. The assertion fails the
       * moment somebody puts the two halves back in one scroll box.
       */
      const before = arrival.scheduleLastLineBottom;
      await page.evaluate(() => {
        const panel = document.querySelector<HTMLElement>('.hud-roster');
        if (panel !== null) panel.scrollTop = panel.scrollHeight;
      });
      const scrolled = await page.evaluate(() => window.lockstateUiHarness.regimeProbe());

      expect(
        scrolled.scheduleLastLineBottom,
        `scrolling the roster moved the timetable from y=${before} to y=${scrolled.scheduleLastLineBottom} at ${width}x${height}`,
      ).toBe(before);
      expect(
        scrolled.blocksLaidOut,
        `the timetable stopped being laid out once the roster scrolled at ${width}x${height}`,
      ).toBe(true);
      expect(
        scrolled.scheduleLastLineBottom,
        `the timetable's last line ends at y=${scrolled.scheduleLastLineBottom}, past its own panel's fold of y=${scrolled.scheduleBox?.bottom ?? 0}, at ${width}x${height}`,
      ).toBeLessThanOrEqual(scrolled.scheduleBox?.bottom ?? 0);
    });
  }

  /**
   * **#1295: the roster panel with the regime editor open.**
   *
   * `.ui-panel.hud-regime` is `flex: 0 0 auto`, so whatever natural height it
   * takes, it takes out of the rail and the panel below pays. That division is
   * right while the timetable is a closed catalogue, and #1273 made it one that
   * a player can *open*: the editor's toggle list is seven controls per
   * classification group. Composed, and before `--hud-regime-editor-ceiling`
   * bounded that list, the timetable panel's natural height exceeded the whole
   * rail at 900x600 and the roster panel was laid out **entirely below the
   * viewport** -- `top 659.00, bottom 661.00` against 600px of page, with
   * `.hud__side` overflowing by 61px at `overflow-y: visible`, so no gesture
   * reached it. That is the reachability regression `docs/IDENTITY_V5_ROLLOUT.md`
   * stage 5 makes an exit criterion, and issue #1295 is its measurement.
   *
   * **The repair is `.hud-regime__editor-list`'s `max-height` and it is already
   * on `main`** -- `hud.css` carries the derivation, three tap targets falling
   * to one under `@media (max-height: 700px)`. What was missing is a test that
   * fails if it is loosened. `app-shell.spec.ts`'s #88 sweep does catch it, but
   * only *indirectly* and only at the sample point: it reports the roster's
   * Collapse button as covered by the timetable's body, which names a control
   * rather than the panel, and it would stop naming it the day the roster's
   * header stops carrying a control.
   *
   * So two assertions, each the direct form of one half of #1295's report, at
   * all five viewports `app-shell.spec.ts`'s `HUD_LAYOUT_VIEWPORTS` visits
   * rather than the two this file's other cases use -- 900x600 is the viewport
   * that failed and it is in neither pair:
   *
   * 1. **The roster panel intersects the viewport.** The literal defect.
   * 2. **The roster panel's own client box is at least as tall as its own
   *    header.** The defect one step before it becomes unreachability: a panel
   *    squeezed under its own 44px header overhangs its scrollport, which is
   *    what #88 was reporting at 1280x720 and 375x812 where the panel was still
   *    on screen. This is a *relation* between two boxes on the page and not a
   *    pixel count, for the reason `PRISONER_ROSTER_ROW_LIMIT`'s tables give:
   *    a number written here fails on a font metric that is nobody's defect.
   *
   * And `scheduleOverflow` is re-read, because the cheap way to pass the two
   * above is to let the timetable panel scroll -- which is the `flex: 0 1 auto`
   * mutation this file's other cases already watch go red, and the one property
   * ADR 0115's split exists to guarantee. A repair that trades it is not one.
   *
   * Watched red by deleting `max-height: var(--hud-regime-editor-ceiling)` from
   * `.hud-regime__editor-list`: 900x600 fails assertion 1 and 1280x720,
   * 1024x768 and 375x812 fail assertion 2. Restored, all five pass.
   */
  const REACHABILITY_VIEWPORTS = [
    [1280, 720],
    [1440, 900],
    [1024, 768],
    [900, 600],
    [375, 812],
  ] as const;

  for (const [width, height] of REACHABILITY_VIEWPORTS) {
    test(`keeps the roster panel reachable with the regime editor open at ${width}x${height} (#1295)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate(() => window.lockstateUiHarness.clickTab('day-plan'));
      await page.evaluate(
        ([regime, roster]) => window.lockstateUiHarness.reportRegime(regime, roster),
        [TIMETABLE, ROSTER] as const,
      );
      // The inspector, for this file's stated reason: the fullest state the tab
      // can draw is the one the composition has to survive, and #1295 was
      // measured in it.
      await page.locator('.hud-regime__roster-row[data-prisoner="3"]').click();
      await page.evaluate(
        ([regime, roster, detail]) => window.lockstateUiHarness.reportRegime(regime, roster, detail),
        [TIMETABLE, ROSTER, DETAIL] as const,
      );

      /*
       * `aria-expanded` read rather than the header clicked blind, the same
       * handshake `app-shell.spec.ts`'s #88 sweep uses on this same section:
       * it is created collapsed, so a blind click is a claim about the arrival
       * state rather than a reading of it.
       */
      const editor = page.locator('.hud-regime__editor > .ui-section__header');
      await expect(editor, `the regime editor is missing at ${width}x${height}`).toBeVisible();
      if ((await editor.getAttribute('aria-expanded')) === 'false') await editor.click();
      await expect(editor, `the regime editor did not open at ${width}x${height}`).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      // Non-vacuity: an editor that drew no groups costs the panel nothing, and
      // every assertion below would pass on a page where this block is the
      // empty state rather than the open one.
      expect(
        await page.locator('.hud-regime__editor-list .ui-toggles').count(),
        `the open regime editor drew no toggle groups at ${width}x${height}`,
      ).toBe(TIMETABLE.groups.length);

      const rosterPanel = page.locator('.ui-panel.hud-roster');
      await expect(
        rosterPanel,
        `the roster panel is outside the viewport with the regime editor open at ${width}x${height}`,
      ).toBeInViewport();

      const fit = await rosterPanel.evaluate((panel) => {
        const header = panel.querySelector<HTMLElement>('.ui-panel__header');
        return {
          client: panel.clientHeight,
          header: header === null ? null : header.getBoundingClientRect().height,
        };
      });
      expect(fit.header, `the roster panel has no header at ${width}x${height}`).not.toBeNull();
      expect(
        fit.client,
        `the roster panel's client box is ${fit.client}px and its own header is ${fit.header}px, so the header overhangs its scrollport at ${width}x${height}`,
      ).toBeGreaterThanOrEqual(fit.header ?? 0);

      // The timetable panel is still not a scroll container: see this block's
      // header for why a repair that traded this would not be one.
      const open = await page.evaluate(() => window.lockstateUiHarness.regimeProbe());
      expect(
        open.scheduleOverflow,
        `the timetable's panel scrolls by ${open.scheduleOverflow}px with the editor open at ${width}x${height}`,
      ).toBe(0);
    });
  }
});
