import { type Page, expect, test } from './network-changed-fixture';
import './ui-harness-api';

/**
 * *"N with no bed"* on the PRISONERS chip, in a real browser (issue #609).
 *
 * ## Why a browser is required and `pnpm test` cannot cover this
 *
 * The decision is pure and is proven headlessly in
 * `tests/unit/ui-hud-projection.test.ts`: which badge the projection emits,
 * with which count, and when it emits none. What that cannot reach is the DOM
 * around it. `vitest.config.ts` is `environment: 'node'` with no jsdom, so
 * `status-strip.ts` -- the module that turns a descriptor into an element and
 * a message key into text -- is not merely untested there, it is
 * **unreachable**. A badge the projection describes perfectly and the strip
 * never appends would pass every unit test in the repository.
 *
 * ## And why the geometry is asserted rather than the text alone
 *
 * `.hud-strip__metrics` is `overflow-x: auto` with `scrollbar-width: none`
 * (`src/ui/hud/hud.css:155-165`). A chip that does not fit is therefore
 * scrolled out of sight **with no scrollbar to say so** -- present in the
 * DOM, reachable by `innerText`, and visible to nobody. Issue #629 is a
 * standing owner directive that information which exists and reaches nobody
 * does not count, and #627 is its worked example: *"Awaiting Materials"* was
 * on the page the whole time, inside a fold that starts shut.
 *
 * The badge is appended into the PRISONERS chip's trailing box, beside the
 * occupancy bar that is already there, and 900x600 is the binding viewport.
 * So the question "does it fit" is a real one with a real wrong answer, and
 * only a browser can settle it.
 */

const HARNESS_URL = '/tests/browser/ui-harness.html';

interface BadgeReading {
  /** `null` when the strip drew no badge on the PRISONERS chip at all. */
  readonly text: string | null;
  readonly tone: string | null;
  /** Whether the badge's box lies inside the metrics row's own visible box. */
  readonly insideMetricsRow: boolean | null;
  readonly width: number;
  readonly height: number;
  /** The chip's own value, so "the badge appeared" is never read as "the chip changed". */
  readonly chipValue: string | null;
  readonly chipInsideMetricsRow: boolean;
  readonly metricsRowOverflow: number;
}

async function setCounts(
  page: Page,
  counts: { prisoners: number; occupiedPlaces: number; prisonerCapacity: number },
): Promise<void> {
  await page.evaluate(
    ([prisoners, occupiedPlaces, prisonerCapacity]) =>
      window.lockstateUiHarness.setHudViewModel({
        counts: {
          prisoners: prisoners as number,
          prisonerCapacity: prisonerCapacity as number,
          occupiedPlaces: occupiedPlaces as number,
          // The rest of the strip is held at a busy prison's figures rather
          // than at zero: eight chips compete for the width this badge has to
          // fit into, and a strip whose other seven chips read "0" is a
          // narrower strip than any player sees.
          staff: 27,
          rooms: 61,
          prisonersCovered: 100,
          prisonersUnderstaffed: 30,
          prisonersUnguarded: 12,
          activeIncidents: 2,
          contrabandFound: 4,
          treasuryMinorUnits: 24_920,
          stateIncomeAccruedTodayMinorUnits: 10_667,
        },
        clock: { day: 3, tickOfDay: 600, dayLengthTicks: 2_400, mode: 'paused', speed: 1 },
        alerts: [],
      }),
    [counts.prisoners, counts.occupiedPlaces, counts.prisonerCapacity],
  );
}

async function readBadge(page: Page): Promise<BadgeReading> {
  return page.evaluate(() => {
    const chip = document.querySelector<HTMLElement>('.ui-stat[data-metric="prisoners"]');
    if (chip === null) throw new Error('no PRISONERS chip in the mounted HUD');
    const row = document.querySelector<HTMLElement>('.hud-strip__metrics');
    if (row === null) throw new Error('no metrics row in the mounted HUD');
    const badge = chip.querySelector<HTMLElement>('.ui-badge');
    const value = chip.querySelector<HTMLElement>('.ui-stat__value');
    const rowBox = row.getBoundingClientRect();
    const chipBox = chip.getBoundingClientRect();
    const box = badge?.getBoundingClientRect();
    return {
      text: badge?.textContent ?? null,
      tone: badge?.dataset['tone'] ?? null,
      insideMetricsRow:
        box === undefined ? null : box.left >= rowBox.left - 0.5 && box.right <= rowBox.right + 0.5,
      width: box === undefined ? 0 : Math.round(box.width * 100) / 100,
      height: box === undefined ? 0 : Math.round(box.height * 100) / 100,
      chipValue: value?.textContent ?? null,
      chipInsideMetricsRow: chipBox.left >= rowBox.left - 0.5 && chipBox.right <= rowBox.right + 0.5,
      // Anything above zero means the row is scrolling, which is the state
      // where being in the DOM stops meaning being on screen.
      metricsRowOverflow: row.scrollWidth - row.clientWidth,
    };
  });
}

test.describe('the PRISONERS chip says how many have no bed (#609)', () => {
  // The binding viewport. Every layout decision in this repository is argued
  // against it, and it is the width the badge has to fit into beside an
  // occupancy bar on a strip of eight chips.
  test.use({ viewport: { width: 900, height: 600 } });

  test('renders the shortfall, on screen and not merely in the DOM', async ({ page }) => {
    await page.goto(HARNESS_URL);
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());

    // Issue #609's own prison: twelve admitted into three beds, nine of them
    // earning the prison nothing and no channel on the strip saying so.
    await setCounts(page, { prisoners: 12, occupiedPlaces: 3, prisonerCapacity: 3 });
    const shortfall = await readBadge(page);

    expect(
      shortfall.text,
      'the strip drew no "with no bed" badge for a twelve-prisoner prison with three beds',
    ).toBe('9 with no bed');
    expect(shortfall.tone).toBe('warning');
    expect(shortfall.chipValue, 'the chip must still answer "how many prisoners are there"').toBe('12');

    // The assertions the DOM alone cannot make. A badge with a zero-sized box
    // is not rendered, and a badge outside the metrics row's own box has been
    // scrolled out of a container with no visible scrollbar.
    expect(shortfall.width, 'the badge measured zero width, so it is in the DOM and not on the screen').toBeGreaterThan(0);
    expect(shortfall.height, 'the badge measured zero height').toBeGreaterThan(0);
    expect(
      shortfall.insideMetricsRow,
      'the badge sits outside the metrics row it was appended into, so it is present and reaches nobody -- issue #629',
    ).toBe(true);

    /*
     * **The metrics row already overflows at this viewport, and that is not
     * this badge's doing.** Measured here rather than asserted away, because
     * the number is the reason the assertion above is the one that matters:
     * at 900x600 the row's `clientWidth` is 524px and its `scrollWidth` is
     * **1,306px with no badge on the chip at all** -- which is `main`'s own
     * strip, since a chip with no badge builds byte-identical DOM. Five of
     * the eight chips are already past the visible edge, in a container that
     * hides its scrollbar.
     *
     * So "the badge is in the DOM" would have been a vacuous gate here: the
     * DOM is where five chips already are. What is asserted is that this one
     * is inside the box a player can see, which it is because `prisoners` is
     * the leftmost chip. The chip's own right edge is checked too, so a
     * future reordering that moves `prisoners` rightwards fails here rather
     * than silently posting the badge off-screen.
     *
     * The overflow itself is reported, not fixed: it is a layout decision
     * about a strip of eight chips and it predates this change.
     */
    expect(
      shortfall.metricsRowOverflow,
      'the metrics row stopped overflowing at 900x600, so the reasoning above is stale and this spec should now assert the stronger thing',
    ).toBeGreaterThan(0);
    expect(
      shortfall.chipInsideMetricsRow,
      'the PRISONERS chip itself is no longer wholly on screen at 900x600, so its badge cannot be either',
    ).toBe(true);
  });

  test('is still right after a bed is taken out from under a resident', async ({ page }) => {
    await page.goto(HARNESS_URL);
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());

    // The case that chose `occupiedPlaces` over `roomOccupants`, measured
    // through real commands in
    // `tests/integration/economy-occupied-place-exists.test.ts`: a 3x3
    // `room.cell` with two beds and two prisoners housed, one bed then taken
    // out. ADR 0028 decision 2 keeps both assignments -- "Nobody is evicted"
    // -- so residency still reads 2 while one place exists and the day pays
    // 300 instead of 600.
    await setCounts(page, { prisoners: 2, occupiedPlaces: 1, prisonerCapacity: 1 });
    const afterRemoval = await readBadge(page);

    expect(
      afterRemoval.text,
      'the badge is silent in the one prison it exists for: a bed removed under a sleeping prisoner',
    ).toBe('1 with no bed');
    expect(afterRemoval.width).toBeGreaterThan(0);
    expect(afterRemoval.insideMetricsRow).toBe(true);
    expect(afterRemoval.chipValue).toBe('2');
  });

  test('leaves the chip bare when everybody has a bed, and takes the badge back off', async ({ page }) => {
    await page.goto(HARNESS_URL);
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());

    // Shown first, so what is asserted below is the badge being **removed**
    // rather than never having been added. The strip updates one DOM in
    // place; a badge that is appended and never taken away is a strip that
    // reports a prison that has already been fixed.
    await setCounts(page, { prisoners: 12, occupiedPlaces: 3, prisonerCapacity: 3 });
    expect((await readBadge(page)).text).toBe('9 with no bed');

    await setCounts(page, { prisoners: 12, occupiedPlaces: 12, prisonerCapacity: 16 });
    const housed = await readBadge(page);

    // Not "0 with no bed" and not an empty badge: no badge. `coverageTone`'s
    // recorded reason -- a strip where several things are always on teaches
    // players to ignore the one that matters -- and that note extends it past
    // amber to green.
    expect(housed.text, 'a prison with everybody housed still carries a badge').toBeNull();
    expect(housed.chipValue).toBe('12');
  });

  test('renders no unresolved message key anywhere on the strip', async ({ page }) => {
    // ADR 0011's own failure mode: an unresolved key renders as itself, which
    // is visible and obviously wrong -- and only if something looks. A new key
    // with no default-locale entry would put `hud.status.prisoners-without-bed`
    // on the busiest chip on the strip.
    await page.goto(HARNESS_URL);
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
    await setCounts(page, { prisoners: 12, occupiedPlaces: 3, prisonerCapacity: 3 });

    const text = await page.locator('.hud-strip').innerText();
    expect(text.length, 'the strip rendered nothing at all').toBeGreaterThan(20);
    expect(text, `an unresolved message key is on screen: ${text}`).not.toMatch(/\bhud\.[a-z0-9.-]+/);
  });
});
