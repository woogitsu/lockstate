import type { HudCountsViewModel } from '../../src/ui/hud';
import { type Page, expect, test } from './network-changed-fixture';
import './ui-harness-api';

/**
 * *"Unmet needs have withheld {withheld} of today's grant so far"* on the
 * `EARNED TODAY` chip, in a real browser (issue #890).
 *
 * ## What this covers that `pnpm test` cannot
 *
 * Whether the sentence exists, and the arithmetic behind the figure, are
 * proven headlessly -- `tests/unit/ui-hud-projection.test.ts` for the chip's
 * choice and `tests/integration/needs-state-grant-loop.test.ts` for the money,
 * against two prisons built by a real runtime. What neither can reach is
 * **the rendered sentence**. `vitest.config.ts` is `environment: 'node'` with
 * no jsdom, so `status-strip.ts` is unreachable there, and the whole point of
 * `HudMetricText.numberParameters` is that the figure goes through the strip's
 * own `Intl` formatter rather than `String()`. `96,400` and `96400` are
 * indistinguishable to every unit test in this repository and different on
 * screen, beside a chip that writes its own number the first way.
 *
 * It is also where #890's own finding is closed the way #890 asked: that
 * comment's weakest claim was that no *reachable* surface names the money, and
 * a grep cannot answer reachability. `.hud-strip__metrics` is `overflow-x:
 * auto` with its scrollbar suppressed, so a chip that does not fit is in the
 * DOM and visible to nobody -- which #629 says does not count. This asserts
 * the chip is still inside the row's own visible box with the sentence on it,
 * which is the property a description was chosen for over a badge.
 *
 * **Since the owner's ruling of 2026-09-23 on #890 (`AGENTS.md` entry 17) the
 * chip carries a badge as well** -- *"{withheld} withheld"*, visible without
 * hovering -- so the description is no longer the quiet half on its own and
 * this file's width assertion changes with it: the sentence still costs
 * nothing, and the badge costs exactly its own box. What the badge costs the
 * row at each desktop width is `tests/browser/ui-strip-badged-width.spec.ts`'s
 * measurement, not this file's.
 */

const HARNESS_URL = '/tests/browser/ui-harness.html';

/**
 * A populated prison, so the row is the width a player really sees: a strip
 * whose other chips read zero is a narrower strip than any of them. Only the
 * withheld figure moves between cases.
 */
function counts(overrides: Partial<HudCountsViewModel> = {}): HudCountsViewModel {
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
    treasuryMinorUnits: 24_920,
    stateIncomeAccruedTodayMinorUnits: 284_500,
    ...overrides,
  };
}

interface ChipReading {
  /** The chip's `title` attribute -- the tooltip a hover reads. */
  readonly title: string | null;
  /** The same sentence as screen-reader text, which is the half a hover cannot reach. */
  readonly screenReaderText: string | null;
  readonly badgeText: string | null;
  /** The badge's own tone, which is not the chip's. */
  readonly badgeTone: string | null;
  /** The badge's own width, `0` when there is none. */
  readonly badgeWidth: number;
  readonly tone: string | null;
  readonly value: string | null;
  /** Whether the chip's box lies inside the metrics row's own visible box. */
  readonly onScreen: boolean;
  /** The chip's own width, to the hundredth of a pixel. */
  readonly width: number;
  /** The metrics row's scrollable content width, which is what overflows. */
  readonly rowScrollWidth: number;
}

async function show(page: Page, next: HudCountsViewModel): Promise<ChipReading> {
  await page.evaluate(
    (model) =>
      window.lockstateUiHarness.setHudViewModel({
        counts: model,
        clock: { day: 9, tickOfDay: 600, dayLengthTicks: 2_400, mode: 'paused', speed: 1 },
        alerts: [],
      }),
    next,
  );

  return page.evaluate(() => {
    const chip = document.querySelector<HTMLElement>('.ui-stat[data-metric="earned-today"]');
    const row = document.querySelector<HTMLElement>('.hud-strip__metrics');
    if (chip === null || row === null) throw new Error('no EARNED TODAY chip in the mounted HUD');
    const rowBox = row.getBoundingClientRect();
    const chipBox = chip.getBoundingClientRect();
    const badge = chip.querySelector<HTMLElement>('.ui-badge');
    return {
      title: chip.getAttribute('title'),
      screenReaderText: chip.querySelector<HTMLElement>('.ui-sr-only')?.textContent ?? null,
      badgeText: badge?.textContent?.trim() ?? null,
      badgeTone: badge?.dataset['tone'] ?? null,
      badgeWidth: badge === null ? 0 : badge.getBoundingClientRect().width,
      tone: chip.dataset['tone'] ?? null,
      value: chip.querySelector<HTMLElement>('.ui-stat__value')?.textContent ?? null,
      onScreen: chipBox.left >= rowBox.left - 0.5 && chipBox.right <= rowBox.right + 0.5,
      width: chipBox.width,
      rowScrollWidth: row.scrollWidth,
    };
  });
}

test.describe('the EARNED TODAY chip says what unmet needs withheld (#890)', () => {
  // The binding viewport, as every layout decision in this repository is
  // argued against -- and the one where the row is tightest, so `onScreen`
  // below is asserted where it is hardest to keep.
  test.use({ viewport: { width: 900, height: 600 } });

  test.beforeEach(async ({ page }) => {
    await page.goto(HARNESS_URL);
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
    await expect(page.locator('.hud-strip__metrics')).toBeVisible();
  });

  test('renders the withheld figure the way it renders the value, and only while something is withheld', async ({
    page,
  }) => {
    const withholding = await show(page, counts({ stateIncomeWithheldTodayMinorUnits: 96_400 }));

    // Grouped by the strip's own formatter, exactly as the chip's value is --
    // which is the reason this figure crosses as a number rather than a
    // string the projection formatted.
    expect(withholding.title).toBe(
      "Unmet needs have withheld 96,400 of today's grant so far — the state pays less for a resident whose needs are going unmet, and meeting one puts that share back.",
    );
    // A hover reaches one player and not the other, so the same sentence is in
    // the DOM as screen-reader text.
    expect(withholding.screenReaderText).toBe(withholding.title);
    /*
     * **The badge, grouped by the same formatter as the sentence and the
     * value** (the owner's ruling of 2026-09-23). This read
     * `expect(withholding.badgeText).toBeNull()` under the comment *"No
     * threshold was set and no colour is painted: the judgement #890 leaves
     * with the owner is loudness, and this is the quiet half."* The owner
     * judged it. Still no colour on the chip itself: the badge carries the
     * `warning` tone, the chip carries none.
     */
    expect(withholding.badgeText).toBe('96,400 withheld');
    expect(withholding.badgeTone).toBe('warning');
    expect(withholding.tone).toBeNull();
    /*
     * **And the sentence still costs the row nothing; only the badge does.**
     * This asserted the chip and row identical with and without the figure,
     * which was the property a description bought over a badge. With a badge
     * the chip grows, so what is asserted now is that it grows by exactly the
     * badge's own box -- the trailing slot it goes into is on every chip
     * already, badge or not, so it adds no gap of its own -- with the sentence
     * adding not a hundredth of a pixel on top, and that the row grows by
     * exactly what the chip did.
     */
    const unpublished = await show(page, counts());
    expect(unpublished.badgeText).toBeNull();
    expect(withholding.width, 'the chip grows by the badge, and by nothing else').toBeCloseTo(
      unpublished.width + withholding.badgeWidth,
      2,
    );
    expect(withholding.rowScrollWidth - unpublished.rowScrollWidth, 'and the row by what the chip grew').toBeCloseTo(
      withholding.width - unpublished.width,
      0,
    );

    // A prison meeting every need carries no sentence at all -- the tooltip is
    // removed rather than blanked, so a hover opens nothing.
    const clear = await show(page, counts({ stateIncomeWithheldTodayMinorUnits: 0 }));
    expect(clear.title).toBeNull();
    expect(clear.screenReaderText).toBe('');
    expect(clear.badgeText, 'and no badge: the ruling is "whenever it is above zero"').toBeNull();
    expect(clear.width).toBe(unpublished.width);
    expect(clear.value).toBe(withholding.value);
  });

  test('says nothing about a shortfall the worker did not publish', async ({ page }) => {
    // Absent is not zero: it is a payload written before this field existed,
    // which every fixture in this directory is. Both draw nothing, and they
    // are still different facts.
    const unpublished = await show(page, counts());
    expect(unpublished.title).toBeNull();
    expect(unpublished.screenReaderText).toBe('');
    expect(unpublished.badgeText).toBeNull();
  });
});
