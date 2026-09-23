import { expect, test, type Page } from './network-changed-fixture';

/**
 * **What a full refusal history costs the layout, measured and pinned**
 * ([ADR 0125](../../docs/adr/0125-what-a-refusal-leaves-in-the-history.md)
 * decision 5, and the weakest claim that ADR named).
 *
 * The owner's ruling 26 of 2026-09-23 (#985) turned the alerts list's one
 * refusal row into up to `MAX_REFUSAL_HISTORY_RECORDS` (8) rows. The eight was
 * chosen to match the event list, not measured. This file is the measurement,
 * and it keeps the eight on the terms below.
 *
 * **Measured 2026-09-23 on the branch that added it**, one to eight refused
 * off-map build orders, at the three viewports the rail budget is tightest at:
 *
 * - **900x600 and 1280x720: no rail panel moves.** `.hud__aside`,
 *   `.save-panel` and `.hud-build` are the same height at one row and at
 *   eight. The rail never scrolls. The **corner** grows by one row per
 *   refusal until it reaches the rail's height (484.3 px at 900x600, reached
 *   at three rows; 604.3 px at 1280x720, reached at six). From then on the
 *   list scrolls inside itself (164 of 375 px, and 246 of 375 px). That growth
 *   covers more of the world. It is the growth any eight *event* rows already
 *   cause, and it stops at the rail.
 * - **375x812: the history takes height from the aside.** Below 720 px the
 *   alerts fold lives in the Overview panel (#1201), and the list has no
 *   height bound of its own there. Each row costs about 47 px:
 *   - the save panel spills past its own fold from two rows on (211 of 246 px),
 *     and stays scrollable;
 *   - `.hud__aside` reaches its 25 % floor at five rows (143 px of a 572 px
 *     rail);
 *   - after that the Overview panel scrolls (387 of 538 px at eight rows).
 *   Nothing is stuck, nothing leaves the viewport and the rail never scrolls.
 *   But "no panel past its fold" holds at this viewport only for a history of
 *   one, the state before the ruling. Lowering the constant to 1 would undo the
 *   ruling, so it stays 8. The phone tier's unbounded list is recorded as its
 *   own finding and not solved here, because two event rows already do the
 *   same.
 *
 * The #88 sweep ("every control can actually be pressed") was also run with
 * eight refusals loaded into its shell at these three viewports, and it passed.
 * So did `ui-alert-row-presses-to-its-place.spec.ts`'s 200 % case with eight:
 * 6 of 6 unreachable, the same set as its ceiling. Neither run was committed:
 * both were measurements on temporarily patched copies of those specs.
 *
 * **What this pins**, comparing one row and eight in the same page load:
 * - the rail never scrolls, and no rail panel leaves the viewport;
 * - every rail panel, and the list, that holds more than its box is still
 *   scrollable and owns its right edge, which is the #88 sweep's own "stuck"
 *   test (`railIntegrity` in `app-shell.spec.ts`);
 * - above 720 px, the rail panels do not move and the corner stops at the rail;
 * - at 375x812, `.hud__aside` gives height down to its floor and no further.
 *
 * **Watched going red, and where it did not.** Setting `.hud-alerts__list`
 * to `overflow-y: visible` turned 900x600 and 1280x720 red on *"holds more
 * than its box and cannot be scrolled (stuck)"*. Setting `.hud-overview` to
 * `overflow-y: hidden` turned 375x812 red the same way. Replacing
 * `.hud__aside`'s `min-height: 25%` with `0` did **not** turn the 375x812
 * floor assertion red: something else in the rail still holds the aside at
 * 143 px. So that assertion describes the measured layout; it is not proved to
 * guard the floor rule itself.
 */

const APP_URL = '/index.html';

/** `MAX_REFUSAL_HISTORY_RECORDS`, restated as the number this file puts on screen. */
const FULL_HISTORY = 8;

const VIEWPORTS = [
  [900, 600],
  [1280, 720],
  [375, 812],
] as const;

const REFUSAL_ROW = '.hud-alerts__list [data-alert]:not([data-alert="empty"])';

/** The rail panels a player scrolls, and the list. */
const PANELS = ['.save-panel', '.hud-build', '.hud-overview', '.hud-alerts__list'] as const;
/** Those, plus the rail's own boxes and the corner. */
const BOXES: readonly string[] = ['.hud__rail', '.hud__aside', '.hud__corner', ...PANELS];

interface Box {
  readonly top: number;
  readonly bottom: number;
  readonly height: number;
  readonly client: number;
  readonly scroll: number;
  /** Scrollable and owning its right edge: the #88 sweep's "not stuck". */
  readonly reachable: boolean;
}

interface Layout {
  readonly boxes: Readonly<Record<string, Box | null>>;
  readonly railOverflow: number;
  readonly viewportHeight: number;
}

async function measure(page: Page): Promise<Layout> {
  return page.evaluate((selectors: readonly string[]) => {
    const boxes: Record<string, Box | null> = {};
    for (const selector of selectors) {
      const node = document.querySelector<HTMLElement>(selector);
      if (node === null || node.getClientRects().length === 0) {
        boxes[selector] = null;
        continue;
      }
      const rect = node.getBoundingClientRect();
      const scrollable = ['auto', 'scroll'].includes(getComputedStyle(node).overflowY);
      // Probed inside the part of the box that is on screen: a list whose box
      // runs past a scrolling parent is judged at a point a player can press.
      const probeY = Math.min(rect.top + rect.height / 2, window.innerHeight - 2);
      const edge = document.elementFromPoint(rect.right - 3, probeY);
      boxes[selector] = {
        top: Math.round(rect.top * 10) / 10,
        bottom: Math.round(rect.bottom * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
        client: node.clientHeight,
        scroll: node.scrollHeight,
        reachable: scrollable && edge !== null && node.contains(edge),
      };
    }
    const rail = document.querySelector<HTMLElement>('.hud__rail');
    return {
      boxes,
      railOverflow: rail === null ? 0 : rail.scrollHeight - rail.clientHeight,
      viewportHeight: window.innerHeight,
    };
  }, BOXES);
}

async function refuseOffTheMap(page: Page, index: number): Promise<void> {
  await page.getByRole('spinbutton', { name: 'Tile X' }).fill(String(100 + index));
  await page.getByRole('spinbutton', { name: 'Tile Y' }).fill('100');
  await page.locator('.hud-build__coordinates .ui-action').click();
}

/** The log is in the corner above 720 px and in the Overview panel below it (#1201). */
async function showTheLog(page: Page, width: number): Promise<void> {
  if (width < 720) await page.locator('.ui-tab[data-tab="overview"]').click();
  const header = page
    .locator('.ui-section', { has: page.locator('.hud-alerts__list') })
    .last()
    .locator(':scope > .ui-section__header');
  if ((await header.count()) > 0 && (await header.first().getAttribute('aria-expanded')) === 'false') {
    await header.first().click();
  }
}

/** The invariants that must hold at every viewport, one row or eight. */
function expectIntact(layout: Layout, label: string): void {
  expect(layout.railOverflow, `${label}: the rail itself scrolls`).toBe(0);
  for (const selector of PANELS) {
    const box = layout.boxes[selector];
    if (box === null || box === undefined) continue;
    if (selector !== '.hud-alerts__list') {
      expect(box.top, `${label}: ${selector} starts above the viewport`).toBeGreaterThanOrEqual(-0.5);
      expect(box.bottom, `${label}: ${selector} ends below the viewport`).toBeLessThanOrEqual(layout.viewportHeight + 0.5);
    }
    if (box.scroll > box.client) {
      expect(box.reachable, `${label}: ${selector} holds more than its box and cannot be scrolled (stuck)`).toBe(true);
    }
  }
}

for (const [width, height] of VIEWPORTS) {
  test(`a full refusal history leaves every rail panel reachable at ${width}x${height} (ADR 0125)`, async ({ page }) => {
    test.slow();
    await page.setViewportSize({ width, height });
    await page.goto(APP_URL);
    await page.waitForSelector('.hud');
    await page.waitForSelector('.save-panel');
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day'), 'the prison was never created').toHaveText('1');

    const coordinates = page.locator('.hud-build__coordinates > .ui-section__header');
    const refuse = async (from: number, to: number): Promise<void> => {
      await page.locator('.ui-tab[data-tab="build"]').click();
      if ((await coordinates.getAttribute('aria-expanded')) === 'false') await coordinates.click();
      for (let index = from; index < to; index += 1) await refuseOffTheMap(page, index);
      // Folded again, so the Build panel is in its arrival state at both
      // measurements and only the history differs between them.
      await coordinates.click();
      await showTheLog(page, width);
      await expect(page.locator(REFUSAL_ROW), `the history did not reach ${to} rows`).toHaveCount(to, { timeout: 20_000 });
    };

    await refuse(0, 1);
    const one = await measure(page);
    await refuse(1, FULL_HISTORY);
    const full = await measure(page);
    console.log(`[ADR 0125] ${width}x${height} one: ${JSON.stringify(one)}`);
    console.log(`[ADR 0125] ${width}x${height} full: ${JSON.stringify(full)}`);

    const label = `${width}x${height}`;
    expectIntact(one, `${label}, one row`);
    expectIntact(full, `${label}, eight rows`);

    const at = (layout: Layout, selector: string): Box => {
      const box = layout.boxes[selector];
      if (box === null || box === undefined) throw new Error(`${label}: ${selector} has no box`);
      return box;
    };
    const rail = at(full, '.hud__rail').height;

    if (width >= 720) {
      for (const selector of ['.hud__aside', '.save-panel', '.hud-build']) {
        expect(at(full, selector).height, `${label}: ${selector} moved when the history filled`).toBe(at(one, selector).height);
      }
      expect(at(full, '.hud__corner').height, `${label}: the corner grew past the rail`).toBeLessThanOrEqual(rail + 0.5);
      // Non-vacuity: eight rows do not fit the corner here, so the list is
      // what absorbs them, and it has to be scrolling to do that.
      expect(at(full, '.hud-alerts__list').scroll, `${label}: eight rows fit without scrolling`).toBeGreaterThan(
        at(full, '.hud-alerts__list').client,
      );
    } else {
      // The phone tier gives the history the aside's height, down to the
      // aside's `min-height: 25%` floor and no further. The Overview panel
      // then scrolls, and `expectIntact` has already held it reachable.
      expect(at(full, '.hud__aside').height, `${label}: the aside went below its 25 % floor`).toBeGreaterThanOrEqual(
        Math.floor(rail * 0.25),
      );
      expect(at(full, '.hud__aside').height, `${label}: the history took nothing from the aside`).toBeLessThan(
        at(one, '.hud__aside').height,
      );
    }
  });
}
