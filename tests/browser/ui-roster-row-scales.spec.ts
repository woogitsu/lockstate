import type { HudPrisonerRosterViewModel, HudRegimeViewModel } from '../../src/ui/hud';
import { type Page, expect, test } from './network-changed-fixture';
import './ui-harness-api'; // pulls in the `Window.lockstateUiHarness` global augmentation

/**
 * **A Regime roster row says which scale each of its two graded values is on**
 * (issue #909).
 *
 * ## The defect this file pins, and the evidence that it misled a reader
 *
 * A row used to put two different scales on one line, hard against each other:
 *
 * ```
 * Hana Zielen
 * Association    Bladder ▮▮▮▮▮▯▯▯                    [ Low ]
 * ```
 *
 * `Minimal / Low / Medium / High` is the prisoner's **risk tier** (or, before
 * classification has run, their **intake stage**) -- a statement about the
 * person. `Bladder ▮▮▮▮▮▯▯▯` is their worst **need** and how full it is. On one
 * line, `Bladder ▮▮▮▮▮▯▯▯ [Low]` reads as a single statement -- *bladder need,
 * low* -- and that reading is wrong, and wrong in the worst available
 * direction: `Low` means *act now* on a need scale and *ignore this one* on the
 * risk scale.
 *
 * The evidence is not a hypothesis about players. The playtest that found it
 * misread it **twice in its own record**
 * (`docs/research/2026-09-03-can-a-player-read-this.md` §4): its first draft
 * read the two cells as "minimal hygiene", and its own probe recorded that the
 * row carries no column heading, no `aria-label` and no `title` on any cell,
 * and that the pill's only class was `ui-badge__text` -- the class `Warning`,
 * `Info` and `Covered` also carry elsewhere on the same screen. That section
 * also records why a *gap* is not the cure: on screen the two were already
 * separated by most of the row's width and it still read as one statement.
 *
 * §4 named three remedies -- a heading, a word inside the pill, or **moving it
 * off that line**. The third is the one that needs no new player-facing
 * sentence, and it is what this file measures.
 *
 * ## Why this can only be measured in a browser
 *
 * Every claim here is about *lines*, and a line is a layout. `vitest.config.ts`
 * is `environment: 'node'` with no jsdom (`docs/TESTING.md`), so nothing
 * headless can call `createRegimePanel` at all -- and a fake DOM could not
 * settle it either, because "on the same line" is a fact about two
 * `getBoundingClientRect`s and about a `flex-wrap` that behaves differently at
 * different widths. `roster-panel.ts`'s own row-height table records that the
 * activity line wraps at the four desktop viewports and not at 375x812, so the
 * five viewports below are the five different compositions of this row that
 * actually ship.
 *
 * ## What each assertion is for
 *
 * - **The pill's box ends at or above the meter's box.** This is the finding's
 *   own remedy, stated as geometry: there is a *line break* between the two
 *   scales, not a gap. It fails on the code as shipped at every viewport.
 * - **The pill shares a horizontal band with the prisoner's name.** Moving the
 *   pill away from the need is only half of it; the pill has to land *on* the
 *   thing it grades. This is the same composition the inspector below the
 *   roster already uses for the same badge (`.hud-regime__detail-header` is the
 *   prisoner's name and their badge on one line), so the panel now says it one
 *   way rather than two.
 * - **The pill is not inside the need's line, and is a sibling of the name.**
 *   The structural half, so a future repaint cannot restore the adjacency while
 *   the geometry happens to stay separated by a wrap.
 * - **The pill precedes the activity in document order.** The line break is
 *   invisible to a screen reader, which reads the row's contents in order. Read
 *   as shipped, a row announced "Mara Ostrowska, Heading to Showering, Hunger,
 *   20%, Low" -- the tier last, immediately after the need's figure, which is
 *   the aural form of exactly the same misreading. Announced after the name it
 *   grades, the order carries the grouping the line break carries on screen.
 * - **The meter carries its own figure, visibly.** The need's fullness was
 *   `.ui-sr-only` text: a screen reader was told `20%` and a sighted player got
 *   an unlabelled ten-segment bar. §4 records why that mattered here -- three
 *   rows read `▮▮▮▮▮▯▯▯` beside `Low` and a fourth read `▮▮▮▮▮▮▯▯`, *more*
 *   filled, beside `Minimal`, so "the pill grades the bar" looked consistent
 *   whichever direction the reader thought the bar ran. With the meter printing
 *   its own number, the two scales are told apart by *kind* as well as by line:
 *   the need is a percentage, the standing is a word.
 * - **The pill has a class of its own.** It carried only what
 *   `createStatusBadge` puts there -- `ui-badge` on the root and
 *   `ui-badge__text` on the cell inside it -- which is what `Warning`, `Info`
 *   and `Covered` carry too, so neither the stylesheet nor a probe could name
 *   this pill without naming them.
 *
 * ## What it deliberately does not assert
 *
 * **That the pill says, in words, which scale it is on.** It does not: it says
 * `Low`, and a word naming the scale would be a new player-facing string in
 * `src/content/default-locale-en.ts`, which this change does not touch. What is
 * asserted is the remedy that needs no new sentence -- and if a word is added
 * later, every assertion here still holds, because none of them is about the
 * pill's text.
 */

const HARNESS_URL = '/tests/browser/ui-harness.html';

/**
 * The tallest a roster row may be before four of them stop fitting.
 *
 * `PRISONER_ROSTER_ROW_LIMIT`'s own derivation in `roster-panel.ts` divides the
 * 219.0px the Staff panel's held-guard list was measured at by four, and this
 * change spent 5.7px of the margin that arithmetic left -- rows went from
 * 44.7px to 50.4px when the pill moved onto the name's line. So the number is
 * asserted here rather than left to the fold test to notice second-hand: the
 * fold assertion in `ui-shell.spec.ts` fails when the *block* leaves the panel,
 * which is a later and vaguer symptom than a row growing past its budget.
 */
const ROW_HEIGHT_CEILING_PX = 54.75;

/**
 * The five viewports `ui-shell.spec.ts` drives the Regime panel at, so this
 * file measures the same five compositions of the row that its own row-height
 * table and fold assertion were taken at.
 */
const VIEWPORTS = [
  [1280, 720],
  [1440, 900],
  [1024, 768],
  [900, 600],
  [375, 812],
] as const;

/** The timetable block above the roster, so the panel is the one a player is given rather than a roster alone. */
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

/**
 * Four rows, and the four are chosen to be the four *readings* §4 is about
 * rather than four prisoners.
 *
 * Row 1 is the longest activity word this panel can draw, which is what makes
 * the desktop viewports wrap; row 2 is a high-risk prisoner, whose pill is the
 * `warning` tone the need bar also uses, so a reader cannot tell the two scales
 * apart by colour either; row 3 is still in intake, so its pill is an
 * **intake stage** and not a tier at all -- the row that makes a single column
 * heading reading "Risk" a false claim; row 4 is the pairing §4 measured, a
 * fuller bar beside a *lower* tier word.
 */
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
      lowestNeed: { needId: 'bladder', labelKey: 'need.bladder.name', permille: 625, unmetForStateIncome: false },
    },
    {
      entityId: 11,
      name: { givenName: 'Tomasz', familyName: 'Wiśniewski' },
      activityLabelKey: 'action.free-association.name',
      travelling: false,
      standingLabelKey: 'risk-tier.0.name',
      classificationGroupId: 'general-population',
      riskTier: 0,
      lowestNeed: { needId: 'recreation', labelKey: 'need.recreation.name', permille: 750, unmetForStateIncome: false },
    },
  ],
};

/** One row's two graded values, as boxes and as structure. */
interface RowScales {
  readonly prisoner: string;
  readonly nameText: string;
  readonly badgeText: string;
  readonly needText: string;
  readonly needValueText: string;
  /** `y` extents, rounded to a tenth so a message quotes a readable number. */
  readonly nameBand: readonly [number, number] | null;
  readonly badgeBand: readonly [number, number] | null;
  readonly needBand: readonly [number, number] | null;
  readonly rowHeight: number;
  readonly badgeInsideNeedLine: boolean;
  readonly badgeIsNameSibling: boolean;
  /** The row's four named parts, in document order -- which is the order a screen reader reads them in. */
  readonly readingOrder: readonly string[];
  readonly badgeClasses: readonly string[];
  readonly needValueDrawn: boolean;
}

async function openRegime(page: Page): Promise<void> {
  await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
  expect(await page.evaluate(() => window.lockstateUiHarness.clickTab('day-plan'))).toBe(true);
  await page.evaluate(
    ([regime, roster]) => window.lockstateUiHarness.reportRegime(regime, roster),
    [TIMETABLE, ROSTER] as const,
  );
}

const rowScales = (page: Page): Promise<readonly RowScales[]> =>
  page.evaluate((): readonly RowScales[] => {
    const drawn = (node: Element | null): boolean => node !== null && node.getClientRects().length > 0;
    const round = (value: number): number => Math.round(value * 10) / 10;
    const band = (node: Element | null): readonly [number, number] | null => {
      if (!drawn(node) || node === null) return null;
      const box = node.getBoundingClientRect();
      return [round(box.top), round(box.bottom)];
    };
    const textOf = (node: Element | null): string => (node?.textContent ?? '').trim();

    return [...document.querySelectorAll<HTMLElement>('.hud-regime__roster-row')]
      .filter((row) => drawn(row))
      .map((row): RowScales => {
        const badge = row.querySelector<HTMLElement>('.ui-badge');
        const name = row.querySelector<HTMLElement>('.hud-regime__roster-name');
        const needName = row.querySelector<HTMLElement>('.hud-regime__roster-need-name');
        const bar = row.querySelector<HTMLElement>('.hud-regime__roster-need .ui-bar');
        const needValue = row.querySelector<HTMLElement>('.hud-regime__roster-need-value');
        // The need's *whole* pair -- its word, its meter and its figure -- is
        // what must not share a line with the pill, so the band is the union
        // rather than the bar alone.
        const needBands = [band(needName), band(bar), band(needValue)].filter(
          (entry): entry is readonly [number, number] => entry !== null,
        );
        return {
          prisoner: row.dataset['prisoner'] ?? '',
          nameText: textOf(name),
          badgeText: textOf(badge),
          needText: textOf(needName),
          needValueText: textOf(needValue),
          nameBand: band(name),
          badgeBand: band(badge),
          needBand:
            needBands.length === 0
              ? null
              : [Math.min(...needBands.map(([top]) => top)), Math.max(...needBands.map(([, bottom]) => bottom))],
          rowHeight: round(row.getBoundingClientRect().height),
          badgeInsideNeedLine: badge !== null && badge.closest('.hud-regime__roster-line') !== null,
          badgeIsNameSibling: badge !== null && name !== null && badge.parentElement === name.parentElement,
          // `querySelectorAll` answers in document order, which is the order
          // the row's contents are announced in.
          readingOrder: [
            ...row.querySelectorAll<HTMLElement>(
              '.hud-regime__roster-name, .ui-badge, .hud-regime__roster-activity, .hud-regime__roster-need-name',
            ),
          ].map((node) =>
            node.classList.contains('ui-badge')
              ? 'standing'
              : node.classList.contains('hud-regime__roster-name')
                ? 'name'
                : node.classList.contains('hud-regime__roster-activity')
                  ? 'activity'
                  : 'need',
          ),
          badgeClasses: badge === null ? [] : [...badge.classList],
          needValueDrawn: drawn(needValue),
        };
      });
  });

test.describe('a Regime roster row says which scale each value is on (issue #909)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(HARNESS_URL);
  });

  test('the standing pill is never on the same line as the need and its meter', async ({ page }) => {
    for (const [width, height] of VIEWPORTS) {
      await page.setViewportSize({ width, height });
      await openRegime(page);

      const rows = await rowScales(page);
      expect(rows.length, `the roster drew ${rows.length} rows at ${width}x${height}`).toBe(4);

      for (const row of rows) {
        const where = `prisoner ${row.prisoner} at ${width}x${height}`;
        expect(row.badgeBand, `no standing pill was drawn for ${where}`).not.toBeNull();
        expect(row.needBand, `no need pair was drawn for ${where}`).not.toBeNull();
        expect(row.nameBand, `no name was drawn for ${where}`).not.toBeNull();
        if (row.badgeBand === null || row.needBand === null || row.nameBand === null) continue;

        const [badgeTop, badgeBottom] = row.badgeBand;
        const [needTop, needBottom] = row.needBand;
        const [nameTop, nameBottom] = row.nameBand;

        // The finding's own remedy, as geometry: a line break between the two
        // scales rather than a gap on one line.
        expect(
          badgeBottom,
          `the standing pill "${row.badgeText}" shares a line with the need "${row.needText}" for ${where}: the pill spans y=${badgeTop}..${badgeBottom} and the need spans y=${needTop}..${needBottom}`,
        ).toBeLessThanOrEqual(needTop);

        // The headroom this change spent, pinned where it was spent.
        expect(
          row.rowHeight,
          `the row for ${where} is ${row.rowHeight}px, past the ${ROW_HEIGHT_CEILING_PX}px four rows of them fit inside`,
        ).toBeLessThanOrEqual(ROW_HEIGHT_CEILING_PX);

        // And it landed on the thing it grades.
        expect(
          badgeTop < nameBottom && badgeBottom > nameTop,
          `the standing pill "${row.badgeText}" is not on the name "${row.nameText}"'s line for ${where}: the pill spans y=${badgeTop}..${badgeBottom} and the name spans y=${nameTop}..${nameBottom}`,
        ).toBe(true);
      }
    }
  });

  test('the standing pill is a sibling of the name, out of the need line, and announced with the name', async ({
    page,
  }) => {
    // 375x812 is the composition where nothing wraps, so the structural claim
    // cannot be satisfied by a wrap that happens to separate the two.
    await page.setViewportSize({ width: 375, height: 812 });
    await openRegime(page);

    const rows = await rowScales(page);
    expect(rows.length).toBe(4);
    for (const row of rows) {
      const where = `prisoner ${row.prisoner}`;
      expect(row.badgeInsideNeedLine, `the standing pill is inside the need's line for ${where}`).toBe(false);
      expect(row.badgeIsNameSibling, `the standing pill is not a sibling of the name for ${where}`).toBe(true);
      expect(
        row.readingOrder,
        `a screen reader hears the standing "${row.badgeText}" in the wrong place for ${where}`,
      ).toEqual(['name', 'standing', 'activity', 'need']);
      // A class of its own, so the stylesheet and a probe can name *this* pill
      // without naming `Warning`, `Info` and `Covered` with it.
      expect(row.badgeClasses, `the standing pill has no class of its own for ${where}`).toContain(
        'hud-regime__roster-standing',
      );
    }
  });

  test('the need meter prints its own figure, so the two scales differ in kind as well as in line', async ({
    page,
  }) => {
    for (const [width, height] of VIEWPORTS) {
      await page.setViewportSize({ width, height });
      await openRegime(page);

      const rows = await rowScales(page);
      expect(rows.length).toBe(4);
      for (const row of rows) {
        const where = `prisoner ${row.prisoner} at ${width}x${height}`;
        expect(row.needValueDrawn, `the need meter for ${where} has no figure a sighted player can read`).toBe(true);
        // A formatted number and not a sentence -- `formatNeedValueText` says
        // why that is what this row is allowed to add without an owner
        // decision.
        expect(row.needValueText, `the need figure for ${where} does not read as a percentage`).toMatch(/\d+\s*%/u);
        // And the pill still is not a percentage, which is the contrast this
        // assertion is for.
        expect(row.badgeText, `the standing pill for ${where} reads as a figure`).not.toMatch(/\d/u);
      }
    }
  });
});
