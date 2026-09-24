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
 * **the rendered sentence and badge**. `vitest.config.ts` is `environment: 'node'` with
 * no jsdom, so `status-strip.ts` is unreachable there, and the whole point of
 * `HudMetricText.numberParameters` is that the figure goes through the strip's
 * own `Intl` formatter rather than `String()`. `96,400` and `96400` are
 * indistinguishable to every unit test in this repository and different on
 * screen, beside a chip that writes its own number the first way.
 *
 * The badge consumes width; the 900px probe below measures that cost, and the
 * wide probe verifies it is visible without hovering. The separate #719 fix
 * gives overflowed strips a visible route to every counter.
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
    return {
      title: chip.getAttribute('title'),
      screenReaderText: chip.querySelector<HTMLElement>('.ui-sr-only')?.textContent ?? null,
      badgeText: chip.querySelector<HTMLElement>('.ui-badge')?.textContent?.trim() ?? null,
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
    // Ruling 17 makes the withheld amount visible without hovering. It does
    // not invent a threshold for whether the total earned today is good.
    expect(withholding.badgeText).toBe('Withheld 96,400');
    expect(withholding.tone).toBeNull();
    // The badge is width the player can see; the description still costs no
    // separate pixels and supplies the causal explanation on hover and speech.
    const unpublished = await show(page, counts());
    expect(withholding.width).toBeGreaterThan(unpublished.width);
    expect(withholding.rowScrollWidth).toBeGreaterThanOrEqual(unpublished.rowScrollWidth);

    // A prison meeting every need carries no sentence at all -- the tooltip is
    // removed rather than blanked, so a hover opens nothing.
    const clear = await show(page, counts({ stateIncomeWithheldTodayMinorUnits: 0 }));
    expect(clear.title).toBeNull();
    expect(clear.screenReaderText).toBe('');
    expect(clear.badgeText).toBeNull();
    expect(clear.value).toBe(withholding.value);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const wide = await show(page, counts({ stateIncomeWithheldTodayMinorUnits: 96_400 }));
    expect(wide.onScreen).toBe(true);
    expect(wide.badgeText).toBe('Withheld 96,400');
  });

  test('says nothing about a shortfall the worker did not publish', async ({ page }) => {
    // Absent is not zero: it is a payload written before this field existed,
    // which every fixture in this directory is. Both draw nothing, and they
    // are still different facts.
    const unpublished = await show(page, counts());
    expect(unpublished.title).toBeNull();
    expect(unpublished.screenReaderText).toBe('');
  });

  test('names the dirty-room cost in the visible and accessible explanation', async ({ page }) => {
    const reading = await show(page, counts({
      stateIncomeWithheldTodayMinorUnits: 80,
      stateIncomeFilthWithheldTodayMinorUnits: 40,
    }));
    expect(reading.title).toBe(
      "Unmet needs and dirty rooms have withheld 80 of today's grant so far; 40 comes from dirty rooms. A Garbage Room with a Waste Bin clears their waste at the end of each day.",
    );
    expect(reading.screenReaderText).toBe(reading.title);
  });
});
