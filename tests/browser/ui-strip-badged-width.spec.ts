import type { HudCountsViewModel, HudViewModel } from '../../src/ui/hud';
import { type Page, expect, test } from './network-changed-fixture';
import './ui-harness-api';

/**
 * **What the status strip's nine chips cost once the prison's own state is on
 * them** (issue #703, and the promise `ui-contraband-name.spec.ts` makes for
 * #707).
 *
 * ## Why a browser, and why the harness page rather than the assembled one
 *
 * Chip width is not computable anywhere below a browser: it is a label in a
 * real font, a tabular number, an icon, a pill and the gaps between them.
 * `vitest.config.ts` is `environment: 'node'` with no jsdom, so `status-strip.ts`
 * is unreachable from `pnpm test` -- not merely untested.
 *
 * The harness page is the right one *for the metrics row's width* and that is a
 * measured claim rather than a convenience. `app-shell.spec.ts` explains at
 * length that the harness leaves `HudHandle.brandSlot` empty while `src/main.ts`
 * fills it with 351.9px of brand badge and interface-scale control, and that
 * this is why a strip claim generally belongs on the assembled page. **In the
 * band this spec measures, that difference does not reach the metrics row**:
 * `hud.css` gives `.hud-strip__metrics` `flex: 1 0 100%` in a block whose
 * query is `(max-width: 720px), (max-width: 2559px) and (min-height: 701px)`,
 * so at every viewport this spec visits the row is the strip's whole content
 * box whatever else the strip carries. Measured at 1280x800 on both pages, the
 * row's `clientWidth` is **1256** on the harness and **1256** on the assembled
 * page. What only the
 * harness has is a lever on the prison's state -- `setHudViewModel` -- and the
 * states this spec is about (178 prisoners, 36 of them unhoused, a named
 * incident, a named contraband find, a seven-figure treasury) are hours of play
 * away from anything the assembled page can be driven into in a test.
 *
 * ## The two states, and why exactly these
 *
 * At the values below, every chip is sized by its label except `prisoners`
 * (three digits and an occupancy bar) and `funds` (seven figures), so the row's
 * width is mostly a property of *which badges the prison is drawing* rather
 * than of how big its numbers are. There are four badges the strip can draw:
 *
 *   - `prisoners`: `{count} not housed` (#609, the noun since #961), when
 *     anybody is unhoused
 *   - `coverage`: the authored one word for the worst rung anybody is standing
 *     on -- `Unguarded`, `Understaffed`, or `Covered` when nobody is on either
 *     lower rung. **This read `{understaffed} understaffed · {unguarded}
 *     unguarded` (#588) until the owner's ruling 21 of 2026-08-31**, which is
 *     the change the figures further down this docblock predate.
 *   - `incidents`: the `incident-type.*.name` of the one open kind (#506
 *     finding 2), or `Active`, or the authored word `Clear`
 *   - `contraband`: the `contraband.*.name` of the one found category (#703
 *     ruling 3), or nothing
 *
 * `ORDINARY` is a populated prison in no trouble: everybody housed, everybody
 * covered, nothing open, nothing nameable found. It draws the two badges that
 * are always drawn -- `Covered` and `Clear` -- and it is the state a player
 * spends most of the game in. `EVERY_BADGE` is the same prison with all four
 * drawn at once, each carrying the widest authored word it can
 * (`Gang Retaliation`, `Currency`).
 *
 * ## What is asserted, and the one thing that deliberately is not
 *
 * Asserted: the ordinary prison's row **fits** at 1280, 1440 and 1920; the
 * whole-badged row fits at 1920; the row's content is the chips' own widths and
 * the row's own gaps and nothing else; and the strip's height does not depend on
 * the prison's state at any of the three.
 *
 * **Not** asserted: how many chips are on screen at 1280 with every badge
 * drawn. Measured here it is 6 of 9 -- `funds` and `earned-today` off the edge
 * of a container whose scrollbar `hud.css` suppresses -- and that is a defect
 * awaiting the owner's ruling, not behaviour to pin. An expectation reading
 * "6 of 9 at 1280" would make the next person's fix fail this file. What is
 * pinned instead is #634's property, which holds in the badged state as much as
 * in any other: **no chip is cut off by anything except the width of the
 * screen**. The arithmetic of the remaining deficit, and the four candidate
 * cures with what each costs, are written out in `src/ui/hud/hud.css`'s two-row
 * block.
 *
 * ## Every measured figure above predates the owner's ruling 21, and what
 * replaces them is *derived* rather than measured
 *
 * The 1,627px, the 6-of-9 and the 140px this docblock and the comments below
 * quote were all measured on the strip **before** 2026-08-31, when the coverage
 * badge still rendered `{understaffed} understaffed · {unguarded} unguarded`.
 * They are left standing rather than overwritten, because they are what the
 * ruling was decided against; what follows is arithmetic on top of them by an
 * agent that could not run a browser, and it is labelled so that nobody quotes
 * it as a reading.
 *
 * **The model.** A badge is drawn in this state either way, so the only thing
 * ruling 21 changes is the badge's *text*: its padding, its box and the row gap
 * are identical before and after and cancel. The owner's `+140px` is the cost of
 * `42 understaffed · 36 unguarded` (30 characters) over the `Covered` (7) an
 * all-covered prison draws -- 23 characters -- which is **≈6.1px per character**
 * at this row's `--text-size-label` of 11px with 0.04em of letter-spacing.
 * Ruling 21 renders `Unguarded` (9 characters) in the same state, 21 characters
 * fewer than the sentence, so the saving is **≈128px** and the badged row falls
 * from 1,627px to **≈1,499px** against the same 1,256px.
 *
 * **The weak claim, named.** The two costs the ruling quotes are not consistent
 * with one linear model, so the per-character figure is anchored on the coverage
 * badge's own published number and not on the other. `{count} not housed`
 * renders 13 characters -- "36 not housed" -- while the `+170.5px` quoted here
 * was published for the 14-character `{count} with no bed` it replaced, so
 * that figure is now an upper bound rather than a stale one; that badge
 * *appears*
 * rather than changing text, so its fixed box is 2×8px of `.ui-badge` padding
 * plus the 8px `.hud-metric__trailing` gap, which would make it ≈10.5px per
 * character -- and the same rate applied to the coverage badge's own 30
 * characters gives 340px, not 140. Under that second anchor the saving is
 * ≈220px and the row ≈1,407px. **What does not depend on the model is the
 * conclusion**: at either end of that range the badged row still overflows
 * 1,256px at 1280 by 150-250px, so ruling 21 alone does not put `FUNDS` and
 * `EARNED TODAY` back on screen. How many chips it does return is a
 * measurement, not an arithmetic, and this file is where it should be taken.
 *
 * **And one badge was added the same day.** The owner's ruling 18 gives the
 * `funds` chip a `{remaining} left` badge whenever the balance is negative, so
 * there are five badges the strip can draw and not four. It is deliberately not
 * folded into `EVERY_BADGE`: that fixture's `funds` chip is at seven figures
 * because that is the widest that chip can be, and a chip cannot be at seven
 * figures and below zero at once. The two worst cases are therefore different
 * states, and the second one is `tests/browser/ui-overdraft-badge.spec.ts`.
 */

const HARNESS_URL = '/tests/browser/ui-harness.html';

/**
 * A prison big enough that the two chips whose width follows their *value* --
 * `prisoners` (three digits and an occupancy bar) and `funds` (seven figures)
 * -- are at their real size. A row measured at zero is a narrower row than any
 * player sees, and the strip's own history is full of numbers taken from an
 * empty prison and then quoted about a full one.
 */
const POPULATED: HudCountsViewModel = {
  prisoners: 178,
  prisonerCapacity: 180,
  occupiedPlaces: 178,
  staff: 27,
  staffUnassigned: 0,
  rooms: 61,
  prisonersCovered: 178,
  prisonersUnderstaffed: 0,
  prisonersUnguarded: 0,
  prisonersHighRisk: 24,
  activeIncidents: 0,
  contrabandFound: 47,
  treasuryMinorUnits: 1_284_500,
  stateIncomeAccruedTodayMinorUnits: 284_500,
};

/** The same prison, with every badge the strip can draw drawn at once. */
const EVERY_BADGE: HudCountsViewModel = {
  ...POPULATED,
  occupiedPlaces: 142,
  prisonersCovered: 100,
  prisonersUnderstaffed: 42,
  prisonersUnguarded: 36,
  activeIncidents: 3,
  // The widest authored word in each namespace, so the state is the worst case
  // the *content* can produce rather than the worst case a test happened to
  // pick: `incident-type.*.name` is Assault / Escape Attempt / Riot / Gang
  // Retaliation and `contraband.*.name` is Weapon / Drugs / Phone / Currency /
  // Tool.
  activeIncidentTypeLabelKey: 'incident-type.gang-retaliation.name',
  contrabandNameKey: 'contraband.currency.name',
};

interface RowReading {
  /** The row's own visible box, which is the scroll container's client width. */
  readonly clientWidth: number;
  readonly scrollWidth: number;
  /** The chips' own measured widths plus the gaps the stylesheet resolved. */
  readonly contentWidth: number;
  readonly chipCount: number;
  readonly badges: readonly string[];
  /** Chips with both edges inside the row's visible box. */
  readonly fullyVisible: number;
  /** How many leading chips the row's width has room for, from their own widths. */
  readonly fitsInRowWidth: number;
  readonly stripHeight: number;
}

async function show(page: Page, counts: HudCountsViewModel): Promise<RowReading> {
  const viewModel: HudViewModel = {
    counts,
    clock: { day: 17, tickOfDay: 0, dayLengthTicks: 2_400, mode: 'paused', speed: 1 },
    alerts: [],
  };
  await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), viewModel);

  return page.evaluate(() => {
    const strip = document.querySelector<HTMLElement>('.hud-strip');
    const row = document.querySelector<HTMLElement>('.hud-strip__metrics');
    if (strip === null || row === null) throw new Error('no status strip in the mounted HUD');

    const rowBox = row.getBoundingClientRect();
    const chips = [...row.querySelectorAll<HTMLElement>('[data-metric]')];
    // The gap the stylesheet actually resolved, never a number copied from
    // `hud.css`: a test that hard-codes 16 passes when the token changes and
    // the row breaks.
    const gap = Number.parseFloat(getComputedStyle(row).columnGap);
    const widths = chips.map((chip) => chip.getBoundingClientRect().width);

    let used = 0;
    let fitsInRowWidth = 0;
    for (const width of widths) {
      const next = used === 0 ? width : used + gap + width;
      if (next > rowBox.width + 0.5) break;
      used = next;
      fitsInRowWidth += 1;
    }

    return {
      clientWidth: row.clientWidth,
      scrollWidth: row.scrollWidth,
      contentWidth:
        Math.round((widths.reduce((sum, width) => sum + width, 0) + Math.max(0, widths.length - 1) * gap) * 10) / 10,
      chipCount: chips.length,
      badges: [...row.querySelectorAll<HTMLElement>('.ui-badge')].map((badge) => badge.textContent ?? ''),
      fullyVisible: chips.filter((chip) => {
        const box = chip.getBoundingClientRect();
        return box.left >= rowBox.left - 0.5 && box.right <= rowBox.right + 0.5;
      }).length,
      fitsInRowWidth,
      stripHeight: Math.round(strip.getBoundingClientRect().height * 100) / 100,
    };
  });
}

/**
 * 1280 first, because it is the width the defect lives at and the commonest
 * laptop; 1440 because it is where #707's promise is pinned; 1920 because it is
 * the one width that holds every badge at once, which is what makes the
 * assertion at 1920 a real gate rather than a restatement.
 */
const WIDTHS = [
  [1280, 800],
  [1440, 900],
  [1920, 1080],
] as const;

test.describe('the status strip carries nine chips and the prison’s own state (#703)', () => {
  test('an ordinary prison’s row fits at every desktop width, and the badges cost the strip no height', async ({
    page,
  }) => {
    await page.goto(HARNESS_URL);
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());

    for (const [width, height] of WIDTHS) {
      await page.setViewportSize({ width, height });

      const ordinary = await show(page, POPULATED);
      const at = `${width}x${height}`;

      // The premise. Nine chips, and the two badges that are always drawn --
      // so this is the *ordinary* state and not a bare row, and the assertion
      // below is not passing because there was nothing on it.
      expect(ordinary.chipCount, `the strip is not the nine-chip strip at ${at}`).toBe(9);
      expect(ordinary.badges.map((text) => text.trim()).sort(), `the ordinary prison's badges at ${at}`).toEqual([
        'Clear',
        'Covered',
      ]);
      expect(ordinary.clientWidth, `the metrics row measured no width at ${at}`).toBeGreaterThan(0);

      /*
       * **The row holds all nine.** Measured against the chips' own widths
       * rather than against `scrollWidth`, which is floored at `clientWidth`
       * and so cannot say by how much a row fits -- only that it does. At
       * 1280x800 this is 1238px in 1256px; it was 1310px in 1256px until the
       * chips stopped carrying a second gutter of their own
       * (`.ui-stat` in `src/ui/primitives/primitives.css`), and
       * `earned-today` was off the edge of an ordinary prison's strip.
       */
      expect(
        ordinary.contentWidth,
        `an ordinary prison's nine chips are ${ordinary.contentWidth}px of content in ${ordinary.clientWidth}px of row at ${at}, so the strip is dropping a chip in the state a player spends the game in`,
      ).toBeLessThanOrEqual(ordinary.clientWidth);
      expect(ordinary.fullyVisible, `chips on screen in an ordinary prison at ${at}`).toBe(9);

      // ---- and with every badge drawn at once ---------------------------
      const badged = await show(page, EVERY_BADGE);

      // The premise again, and it is the stronger one: four badges, each the
      // widest word its namespace authors.
      expect(badged.badges.length, `the four-badge state drew ${badged.badges.length} badges at ${at}`).toBe(4);
      expect(badged.badges.map((text) => text.trim()), `the badges drawn at ${at}`).toEqual([
        '36 not housed',
        // Ruling 21: the worst rung, in one word. `EVERY_BADGE` has 36
        // unguarded as well as 42 understaffed, and `Unguarded` is what the
        // ladder says of that prison.
        'Unguarded',
        'Gang Retaliation',
        'Currency',
      ]);

      /*
       * **The prison's state does not change the strip's height.**
       * `ui-contraband-name.spec.ts` pins this for one badge at 1280x800 --
       * *"A chip that grew enough to wrap would move every row under it, which
       * is a layout change fired by a game state"* -- and this is the same
       * property for all four at every desktop width. It is load-bearing
       * twice over: the strip's height is paid out of the rail
       * (`ARRIVAL_PANEL_HEIGHT_PX` in `app-shell.spec.ts`), and measured on the
       * assembled page at 1280x720 a strip 30px taller puts the Build panel
       * 14.7px past its own fold -- #174's defect, fired by an incident
       * starting.
       *
       * So a fix for the overflow below that works by letting the row wrap
       * fails here, on purpose and with the reason attached. If the owner rules
       * for a third strip row, this expectation is what their ruling changes.
       */
      expect(
        badged.stripHeight,
        `the strip is ${badged.stripHeight}px with every badge drawn and ${ordinary.stripHeight}px without them at ${at}: a prison's state is moving the world's top edge`,
      ).toBe(ordinary.stripHeight);

      /*
       * **The row's content is the chips and the row's own gaps, and nothing
       * else.** The one assertion here that holds while the row is
       * overflowing, so it is the gate on the gutter: a per-chip padding
       * coming back would show up as `contentWidth` growing past `scrollWidth`
       * -- 72px of it across nine chips -- in the states where the assertion
       * above cannot see it. One pixel of tolerance, because `scrollWidth` is
       * an integer and nine subpixel boxes are not.
       */
      if (badged.contentWidth > badged.clientWidth) {
        expect(
          Math.abs(badged.scrollWidth - badged.contentWidth),
          `the badged row scrolls ${badged.scrollWidth}px while its chips and gaps are ${badged.contentWidth}px at ${at}, so something in the row is taking width that is not a chip`,
        ).toBeLessThanOrEqual(1);
      }

      /*
       * **#634's property, in the state that stresses it.** *No chip is cut off
       * by anything except the width of the screen* -- how many are on screen
       * equals how many the row's width has room for, both read off the same
       * page. It is what fails if anything ever squeezes this row again, and it
       * is deliberately satisfiable while the row overflows: at 1280 with every
       * badge drawn, 6 of 9 chips were on screen because 1627px of content does
       * not fit 1256px, which is the standing defect `hud.css` hands to the
       * owner rather than a number this file endorses. **Both figures are
       * pre-ruling-21 readings** -- see the derived ≈1,499px in this file's
       * docblock -- and the property below is asserted from the page rather
       * than from either of them, which is why it needs no update.
       */
      expect(
        badged.fullyVisible,
        `${at}: ${badged.fullyVisible} of ${badged.chipCount} chips are on screen with every badge drawn, but the row is ${badged.clientWidth}px wide and has room for ${badged.fitsInRowWidth} -- so something other than the screen's width is cutting a chip off`,
      ).toBe(badged.fitsInRowWidth);
      expect(badged.fullyVisible, `${at}: not one status chip is on screen`).toBeGreaterThan(0);
    }
  });

  /**
   * **The same ordinary prison on the reserve rung** (ADR 0095 decision 1,
   * accepted by the owner on 2026-09-23). `POPULATED` has 27 staff for 178
   * prisoners, a requirement of `ceil(178 / 8) = 23`, so at most four guards
   * are free against the five the worst riot needs: a session publishing it
   * raises `'security.response-reserve-short'` and the coverage badge reads
   * `Tight` rather than `Covered`, in the state a player
   * spends most of the game in. Measured on 2026-09-23 at 1280x800: the
   * `Covered` row is **1248.8px** in 1256px (the "1238" the first test's
   * comment gives is an older reading), so 7.2px of slack, and the word first
   * authored for this rung, "Stretched", measured **1257.4px** and pushed a
   * chip off the row. `Tight` is **1229.9px**. This case is what fails if a
   * longer word is authored into the key again.
   */
  test('an ordinary prison on the reserve rung still fits at every desktop width, at the same height (ADR 0095)', async ({
    page,
  }) => {
    await page.goto(HARNESS_URL);
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
    const readings: string[] = [];

    for (const [width, height] of WIDTHS) {
      await page.setViewportSize({ width, height });
      const at = `${width}x${height}`;
      const ordinary = await show(page, POPULATED);
      const tight = await show(page, { ...POPULATED, responseReserveShort: true });

      expect(tight.badges.map((text) => text.trim()).sort(), `the tight prison's badges at ${at}`).toEqual([
        'Clear',
        'Tight',
      ]);
      expect(
        tight.contentWidth,
        `a tight ordinary prison is ${tight.contentWidth}px of content in ${tight.clientWidth}px of row at ${at}`,
      ).toBeLessThanOrEqual(tight.clientWidth);
      expect(tight.fullyVisible, `chips on screen in a tight ordinary prison at ${at}`).toBe(9);
      expect(tight.stripHeight, `the reserve rung moved the strip's height at ${at}`).toBe(ordinary.stripHeight);
      readings.push(`${at} covered ${ordinary.contentWidth} tight ${tight.contentWidth} of ${tight.clientWidth}`);
    }
    test.info().annotations.push({ type: 'row-width', description: readings.join(' | ') });
  });

  test('the widest state the content can produce is wholly on screen at 1920', async ({ page }) => {
    await page.goto(HARNESS_URL);
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
    await page.setViewportSize({ width: 1920, height: 1080 });

    const badged = await show(page, EVERY_BADGE);

    /*
     * The claim #703's breakpoint move bought and the one place it is true:
     * 1627px of content in 1896px of row, nine chips and four badges, nothing
     * scrolled. It is a real gate rather than a restatement of the loop above
     * -- 269px of slack is what the next chip, the next badge and the next
     * locale spend, and this fails when they have spent it. **The 1627px is a
     * pre-ruling-21 reading**; the slack is wider now by whatever the coverage
     * badge gave back, which this file is the place to measure.
     */
    expect(
      badged.contentWidth,
      `every badge at once is ${badged.contentWidth}px of content in ${badged.clientWidth}px of row at 1920x1080, so the widest state the game can produce no longer fits the widest ordinary desktop`,
    ).toBeLessThanOrEqual(badged.clientWidth);
    expect(badged.fullyVisible, 'chips on screen with every badge drawn at 1920x1080').toBe(9);
  });
});
