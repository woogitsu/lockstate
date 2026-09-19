import { type Page, expect, test } from './network-changed-fixture';

/**
 * **The status strip holds its own rows, and the tab bar lays every tab inside
 * the viewport, under a 200 % browser page zoom** (issue
 * [#1312](https://github.com/woogitsu/lockstate/issues/1312), follow-up).
 *
 * ## Why this file exists beside `ui-rail-aside-content-floor.spec.ts`
 *
 * That file is the gate over the three combinations #1312 named. It closes
 * with the count it left behind -- *"16 of 36 still fail after this repair"* --
 * and names what they fail on: containment and reachability at the larger
 * interface scales. This file is the gate over two of those causes, repaired.
 * Different elements, different invariants, no shared rule in `hud.css`.
 *
 * ## The first defect: the strip was shorter than the rows it wrapped into
 *
 * `.hud-strip` is `flex-wrap: wrap` with `min-height: var(--hud-strip-height)`
 * and nothing else sizing it, and `.hud` is `grid-template-rows: auto ...` in a
 * viewport-height container. An `auto` row sizes a wrapping flex container from
 * an intrinsic contribution that under-counts the wraps -- its members are
 * measured where they need not wrap -- so the track came out at the floor while
 * the laid-out strip was taller than it.
 *
 * `align-content: center` then split that overflow between the two ends, and
 * the row it pushed off the top was the first one: the brand badge, which is
 * where a bug report reads the build id from. Measured on `faf7ce3a`, with the
 * window halved in each axis as a 200 % page zoom halves it:
 *
 * | combination | strip box | content | `.brand` top |
 * | --- | --- | --- | --- |
 * | 1024x768@200 % | 181px | 213px | -31.7 |
 * | 900x600@150 % | 147px | 165px | -18.4 |
 * | 390x844@150 % | 131px | 157px | -26.4 |
 * | 375x812@200 % | 175px | 210px | -34.7 |
 *
 * The strip has no `overflow` of its own, so those rows were drawn over the
 * page above and below the strip's box rather than inside it -- content the
 * interface draws and no gesture reaches, which constitution article 8's
 * *"Brak utraty treści i działań"* forbids through ADR 0112 decision 1
 * (`docs/VISUAL_IDENTITY.md`).
 *
 * ## The second defect: the tab bar clipped tabs below 375 CSS pixels
 *
 * `.hud-tabs__inner` wraps only under `:root[data-ui-scale-enlarged='true']`,
 * and its own `overflow: hidden` -- there to keep the tabs inside the rounded
 * corners -- clips whatever does not fit when it does not wrap. That gate was
 * derived at a 375 CSS pixel viewport, where the tabs shrink and fit. A 200 %
 * page zoom lays the same phone out in **188** CSS pixels, and a 390x844 one
 * in **195**, where they do not: every tab carries a `min-width` floor.
 *
 * Measured on `faf7ce3a` at 195 CSS pixels and a 100 % interface scale, two tab
 * centres were laid at **x=-14.5 and x=209.5** -- off both ends of the
 * viewport. At 188 pixels and 75 %, a tab's centre pixel resolved to
 * `.hud-tabs__inner` itself rather than to the tab: the clip, reported.
 *
 * ## What this file does not assert
 *
 * Not the sweep. `playtest-1164-the-200-percent-sweep.playtest.ts` measures all
 * 36 combinations and 13 of them still fail after these two repairs, on a
 * vertical budget the tab bar and the rail cannot both have at the larger
 * scales. Pinning that set would pin the defect in place, which is the
 * objection the playtest itself raises to being made a gate. What is asserted
 * here is two sentences that are never honestly false: **a box the player
 * cannot scroll must not be smaller than the content inside it**, and **a tab
 * the interface draws must be where a finger can land on it**.
 *
 * ## Watched red
 *
 * With `align-content: center` and no `height: max-content` on `.hud-strip`,
 * the four strip cases fail with the spills the table above implies -- 32, 18,
 * 26 and 35 pixels, in that order. With the narrow-viewport wrap removed from
 * `.hud-tabs__inner`, the three tab cases fail naming the two tabs by their
 * labels: *"Overview" centre (-14.5,387) is off a 195x422 viewport* and
 * *"Schedule" centre (209.5,387)* at 390x844@100 %, the same pair at
 * (-18,371) and (206,371) at 375x812@100 %, and *"Schedule" centre belongs to
 * div.hud-tabs__inner* at 375x812@75 %.
 */

const APP_URL = '/index.html';

const ACCESSIBILITY_SETTINGS_STORAGE_KEY = 'lockstate.settings.accessibility';

/**
 * Window size and interface scale, named as the sweep names them. The CSS
 * viewport is halved in each axis because that is what a 200 % browser page
 * zoom does to layout, and Playwright's Chromium cannot be driven to a page
 * zoom through the public API.
 */
interface Combination {
  readonly window: string;
  readonly width: number;
  readonly height: number;
  readonly scale: number;
}

/** The four widest spills the strip reported on `faf7ce3a`. */
const STRIP_CASES: readonly Combination[] = [
  { window: '1024x768', width: 1024, height: 768, scale: 2 },
  { window: '900x600', width: 900, height: 600, scale: 1.5 },
  { window: '390x844', width: 390, height: 844, scale: 1.5 },
  { window: '375x812', width: 375, height: 812, scale: 2 },
];

/** The three combinations the tab-bar wrap clears, and only those. */
const TAB_CASES: readonly Combination[] = [
  { window: '390x844', width: 390, height: 844, scale: 1 },
  { window: '375x812', width: 375, height: 812, scale: 0.75 },
  { window: '375x812', width: 375, height: 812, scale: 1 },
];

async function openHalvedAtScale(page: Page, combination: Combination): Promise<void> {
  await page.setViewportSize({
    width: Math.round(combination.width / 2),
    height: Math.round(combination.height / 2),
  });
  await page.addInitScript(
    ({ key, uiScale }) => {
      try {
        window.localStorage.setItem(key, JSON.stringify({ version: 1, reducedMotion: false, uiScale }));
      } catch {
        // A browser that will not store anything still boots; the assertion
        // below re-reads `--ui-scale` rather than assuming this landed.
      }
    },
    { key: ACCESSIBILITY_SETTINGS_STORAGE_KEY, uiScale: combination.scale },
  );
  await page.goto(APP_URL);
  await page.waitForSelector('.hud');
  await page.waitForSelector('.save-panel');

  // Non-vacuity: a scale that did not arrive would measure a different
  // combination than the one the test is named for.
  expect(
    await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim()),
    `the stored interface scale did not arrive at ${combination.window}`,
  ).toBe(String(combination.scale));
}

function label(combination: Combination): string {
  return `${combination.window}@${Math.round(combination.scale * 100)}%`;
}

test.describe('the HUD chrome under a 200 % page zoom (#1312)', () => {
  for (const combination of STRIP_CASES) {
    test(`the status strip holds its own rows at ${label(combination)}`, async ({ page }) => {
      await openHalvedAtScale(page, combination);

      const strip = await page.locator('.hud-strip').evaluate((node) => {
        const element = node as HTMLElement;
        return {
          client: element.clientHeight,
          scroll: element.scrollHeight,
          overflowY: getComputedStyle(element).overflowY,
          children: element.children.length,
        };
      });

      // An empty strip has nothing to wrap, so it would pass this vacuously.
      expect(
        strip.children,
        `the status strip drew nothing at ${label(combination)}, so this case measures an empty box`,
      ).toBeGreaterThan(0);

      // The reason the spill is unreachable rather than merely present. Were
      // the strip ever given its own scrollport, the sentence below would stop
      // being the right one to assert.
      expect(
        strip.overflowY,
        `.hud-strip now scrolls (${strip.overflowY}) at ${label(combination)}, so this invariant needs re-deriving`,
      ).toBe('visible');

      expect(
        strip.scroll - strip.client,
        `.hud-strip is ${strip.client}px around ${strip.scroll}px of content at ${label(combination)}, ` +
          `so ${strip.scroll - strip.client}px of it is drawn where no gesture reaches it`,
      ).toBeLessThanOrEqual(1);

      // The half of the defect a height alone does not settle: which end the
      // overflow came out of. `app-shell.spec.ts` requires `.brand` at
      // `top < 24` on the assembled page; this requires only that it is not
      // laid above the top of it.
      const brandTop = await page.locator('.brand').evaluate((node) => node.getBoundingClientRect().top);
      expect(
        brandTop,
        `the brand badge is laid at top=${Math.round(brandTop * 10) / 10} at ${label(combination)}, ` +
          `above the top of the page, where a bug report reads the build id from`,
      ).toBeGreaterThanOrEqual(-0.5);
    });
  }

  for (const combination of TAB_CASES) {
    test(`every tab is where a finger can land on it at ${label(combination)}`, async ({ page }) => {
      await openHalvedAtScale(page, combination);

      const tabs = await page.evaluate(() => {
        const unreachable: string[] = [];
        const nodes = [...document.querySelectorAll('.ui-tab')];
        const width = window.innerWidth;
        const height = window.innerHeight;
        const round = (value: number): number => Math.round(value * 10) / 10;

        for (const node of nodes) {
          const box = node.getBoundingClientRect();
          if (box.width === 0 && box.height === 0) continue;
          const x = box.left + box.width / 2;
          const y = box.top + box.height / 2;
          const name = node.textContent?.trim() ?? '(unlabelled)';
          if (x < 0 || y < 0 || x > width || y > height) {
            unreachable.push(`"${name}" centre (${round(x)},${round(y)}) is off a ${width}x${height} viewport`);
            continue;
          }
          const hit = document.elementFromPoint(x, y);
          if (hit === null) {
            unreachable.push(`"${name}" centre hits nothing`);
            continue;
          }
          if (hit !== node && !node.contains(hit)) {
            const owner = `${hit.tagName.toLowerCase()}${
              hit.className === '' ? '' : `.${String(hit.className).split(/\s+/)[0]}`
            }`;
            unreachable.push(`"${name}" centre belongs to ${owner}`);
          }
        }

        return { count: nodes.length, unreachable };
      });

      // A bar that drew no tabs would pass the assertion below vacuously.
      expect(
        tabs.count,
        `the tab bar drew no tabs at ${label(combination)}, so this case measures nothing`,
      ).toBeGreaterThan(0);

      expect(
        tabs.unreachable,
        `${tabs.unreachable.length} of ${tabs.count} tabs are drawn where no finger reaches them at ` +
          `${label(combination)}:\n  ${tabs.unreachable.join('\n  ')}`,
      ).toEqual([]);
    });
  }
});
