import { type Page, expect, test } from './network-changed-fixture';
import './ui-harness-api';

/**
 * The occupancy bar past capacity (issue #609), in a real browser.
 *
 * ## Why a browser is required for this and not just `tests/unit/`
 *
 * `overflowSegments` is pure and is proven headlessly in
 * `tests/unit/segment-overflow.test.ts`. Two things here are not provable
 * there, and `vitest.config.ts` is `environment: 'node'` with no jsdom, so the
 * DOM around it is unreachable from `pnpm test` **at all**:
 *
 * 1. **That the notch reaches the segments.** The rule writes
 *    `data-overflow`; a stylesheet turns that into two 1px hairlines. Only a
 *    browser resolves whether the borders actually computed -- which is what
 *    `readBar` reads, and it reads them rather than the attribute for a
 *    measured reason: a first version had every attribute set correctly on
 *    the right cells and drew nothing, because it named a custom property
 *    that does not exist.
 * 2. **That the bar does not change width when it overflows** -- which is the
 *    constraint that chose this design. The rejected alternative was extra
 *    segments appended past the ten, and it was rejected because this bar
 *    lives in a status-strip chip on a strip of eight, at a binding viewport
 *    of 900x600. A bar that widens exactly when the prison is in trouble is a
 *    layout change fired by a game state. **That is an assertion about
 *    computed geometry and nothing below a browser can make it.**
 *
 * ## Why the DOM is read directly rather than through a probe
 *
 * `ui-harness-api.ts`'s probes exist so a spec cannot re-derive what the HUD
 * *should* show. Here the spec supplies the counts and asks the browser for a
 * measured box and a computed style -- there is nothing to re-derive, and a
 * probe would be a second place for the selector to rot.
 */

const HARNESS_URL = '/tests/browser/ui-harness.html';

interface BarReading {
  readonly width: number;
  readonly height: number;
  readonly segmentHeight: number;
  readonly tone: string | null;
  readonly overCapacity: string | null;
  readonly filled: number;
  readonly overflow: number;
  readonly notched: number;
}

async function setOccupancy(page: Page, prisoners: number, prisonerCapacity: number): Promise<void> {
  await page.evaluate(
    ([value, capacity]) =>
      window.lockstateUiHarness.setHudViewModel({
        counts: {
          prisoners: value as number,
          prisonerCapacity: capacity as number,
          // The places a prison of this shape could actually have: a place is
          // a bed that exists, so it is bounded by the accommodation capacity
          // this bar is drawn against. The over-capacity cases therefore also
          // carry #609's "N with no bed" badge on the same chip -- which is
          // deliberate here, because the width assertions below are what prove
          // that badge does not move the bar it sits beside.
          occupiedPlaces: Math.min(value as number, capacity as number),
          staff: 27,
          staffUnassigned: 0,
          rooms: 61,
          prisonersCovered: 0,
          prisonersUnderstaffed: 0,
          prisonersUnguarded: 0,
          prisonersHighRisk: 0,
          activeIncidents: 0,
          contrabandFound: 0,
          treasuryMinorUnits: 0,
          stateIncomeAccruedTodayMinorUnits: 0,
        },
        clock: { day: 1, tickOfDay: 0, dayLengthTicks: 2_400, mode: 'running', speed: 1 },
        alerts: [],
      }),
    [prisoners, prisonerCapacity],
  );
}

async function readBar(page: Page): Promise<BarReading> {
  return page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>('.ui-bar');
    if (bar === null) throw new Error('no .ui-bar in the mounted HUD');
    const segments = [...bar.querySelectorAll<HTMLElement>('.ui-bar__segment')];
    // The notch is two hairlines in the strip's background colour. Read the
    // COMPUTED border rather than the `data-overflow` attribute: the attribute
    // being right is what a first version of this already had while nothing
    // drew, because it named a custom property that does not exist.
    const notched = segments.filter((cell) => {
      const computed = getComputedStyle(cell);
      return computed.borderTopWidth !== '0px' && computed.borderBottomWidth !== '0px';
    }).length;
    const first = segments[0];
    return {
      width: Math.round(bar.getBoundingClientRect().width * 100) / 100,
      height: Math.round(bar.getBoundingClientRect().height * 100) / 100,
      segmentHeight:
        first === undefined ? 0 : Math.round(first.getBoundingClientRect().height * 100) / 100,
      tone: bar.dataset['tone'] ?? null,
      overCapacity: bar.dataset['overCapacity'] ?? null,
      filled: segments.filter((cell) => cell.dataset['filled'] === 'true').length,
      overflow: segments.filter((cell) => cell.dataset['overflow'] === 'true').length,
      notched,
    };
  });
}

test.describe('the occupancy bar past capacity (#609)', () => {
  test.use({ viewport: { width: 900, height: 600 } });

  test('draws how far over capacity it is, without changing width', async ({ page }) => {
    await page.goto(HARNESS_URL);
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());

    await setOccupancy(page, 90, 180);
    const under = await readBar(page);

    await setOccupancy(page, 180, 180);
    const atCapacity = await readBar(page);

    await setOccupancy(page, 190, 180);
    const justOver = await readBar(page);

    await setOccupancy(page, 720, 180);
    const farOver = await readBar(page);

    // ---- the width constraint that chose this design ----------------------
    // Every state is the same width. This is the assertion the appended-segment
    // alternative would have failed, and it is measured rather than reasoned.
    expect(
      [atCapacity.width, justOver.width, farOver.width],
      'the occupancy bar changed width when it went over capacity, which is a layout change fired by a game state on a strip of eight chips at the binding 900x600 viewport',
    ).toEqual([under.width, under.width, under.width]);
    // Height too, because the notch is drawn with borders: without
    // `box-sizing: border-box` on the segment those borders would grow it.
    expect(
      [atCapacity.height, justOver.height, farOver.height],
      'the occupancy bar changed height when it went over capacity -- the over-capacity hairlines are costing geometry, so `box-sizing: border-box` is missing from `.ui-bar__segment`',
    ).toEqual([under.height, under.height, under.height]);
    expect(justOver.segmentHeight, 'an individual segment changed height').toBe(under.segmentHeight);
    expect(under.width, 'the bar measured zero width, so every comparison above is vacuous').toBeGreaterThan(0);
    expect(under.segmentHeight, 'a segment measured zero height, so the height comparisons are vacuous').toBeGreaterThan(0);

    // ---- #609's claim, which was false, kept as an assertion ---------------
    // "four times over capacity draws identically to exactly at capacity".
    // The segment counts are indeed equal -- and the tones are not, which is
    // the half the issue's inference left out.
    expect(atCapacity.filled).toBe(farOver.filled);
    expect(atCapacity.tone).toBe('warning');
    expect(farOver.tone).toBe('danger');

    // ---- what was actually true, and is now fixed --------------------------
    expect(atCapacity.overflow, 'a prison exactly at capacity is not over it').toBe(0);
    expect(atCapacity.overCapacity).toBe('false');
    expect(justOver.overCapacity).toBe('true');
    expect(
      justOver.overflow,
      'ten prisoners past a capacity of 180 lit no overflow segment, so being over reads as being full',
    ).toBeGreaterThan(0);
    expect(
      farOver.overflow,
      'four times capacity drew the same overflow as ten past it, which is the state #609 could not distinguish',
    ).toBeGreaterThan(justOver.overflow);

    // ---- the notch actually computed ---------------------------------------
    // `data-overflow` is an attribute; this is the stylesheet honouring it.
    expect(
      justOver.notched,
      'the overflow segments carry no computed border, so `data-overflow` is set and nothing draws it -- which is exactly the state this spec exists to catch',
    ).toBe(justOver.overflow);
    expect(under.notched, 'a bar under capacity drew a notch').toBe(0);
    expect(atCapacity.notched, 'a bar exactly at capacity drew a notch').toBe(0);
  });
});
