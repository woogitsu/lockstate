import { expect, test, type Page } from './network-changed-fixture';

/**
 * The HUD shell does what it looks like it does (2026-09-23).
 *
 * ## Why this file exists
 *
 * The owner looked at staging v0.0.755 and said *"powłoka hud itp nie wygląda
 * na zakończone, jest zbugowane"* -- the HUD shell does not look finished and
 * is buggy -- a week after stage 3 of the identity rollout (#1159) was closed
 * with `hud-layout-shell.spec.ts` green. Every defect behind that sentence was
 * a case where the shell's *state* was right and its *pixels* were not, and
 * each gate that could have caught one was asking about the state:
 *
 * - The fold test read `data-layout-navigation="collapsed"` and
 *   `aria-expanded="false"`, both correct, while the six tabs stayed on
 *   screen -- an author `display: flex` beat the `hidden` the fold set.
 *   `toBeVisible()` on the arrow passed for an arrow laid out past the
 *   window's right edge, because Playwright's visibility is "has a box", not
 *   "is on screen".
 * - The #88 sweep (`app-shell.spec.ts`) presses every *control* at its centre.
 *   A separator whose 12px hit strip covered the minimap's edge and the
 *   zoom-in button's right 7px left both of those centres reachable, and a
 *   hairline drawn through the world is not a control at all.
 * - `ui-hud-chrome-under-page-zoom.spec.ts` and the 200 % ratchet ask whether
 *   the chrome row's two *buttons* are reachable. A legend ellipsised to
 *   "SK..." sits beside a perfectly pressable button.
 * - `ui-rail-aside-content-floor.spec.ts` and `ARRIVAL_PANEL_HEIGHT_PX` guard
 *   heights; none of the defects was a height.
 *
 * So every assertion below is about what is painted and what a press reaches,
 * and each is written as the general rule a defect broke rather than as the
 * one pixel it broke it at -- the rule is what the next change has to answer
 * to. Each was watched red on the unfixed tree (`430906a`); the commit that
 * adds this file carries both outputs.
 */

const DESKTOP = { width: 1440, height: 900 };
const TABLET = { width: 1024, height: 768 };
const PHONE = { width: 375, height: 812 };

async function open(page: Page, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(viewport);
  await page.goto('/');
  await page.locator('.hud').waitFor();
  // The layout is re-resolved once the interface scale is installed; waiting
  // for the attribute the shell stamps is waiting for that second pass
  // (`hud-layout-shell.spec.ts`'s `open` says why).
  await expect(page.locator('.hud[data-layout-navigation-placement]')).toHaveCount(1);
}

/** Every element under `.hud` that carries `hidden` and is nonetheless rendered. */
async function renderedWhileHidden(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hud [hidden]')]
      .filter((node) => node.checkVisibility())
      .map((node) => {
        const box = node.getBoundingClientRect();
        return `${node.className} (${Math.round(box.width)}x${Math.round(box.height)})`;
      }),
  );
}

/**
 * Every fold handle that is laid out, and whether a press at its centre
 * reaches it. "Laid out" is a non-empty box: the metric strip's arrow lives in
 * the closed Layout menu and the phone's navigation arrow is `display: none`
 * by design (`hud.css` says why), and neither is a handle on screen.
 */
async function handles(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    for (const arrow of document.querySelectorAll<HTMLElement>('.hud-layout__arrow')) {
      const box = arrow.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      const region = arrow.dataset['layoutRegion'] ?? '?';
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) {
        problems.push(`${region}: centre (${Math.round(x)}, ${Math.round(y)}) is outside the window`);
        continue;
      }
      const hit = document.elementFromPoint(x, y);
      if (hit === null || (hit !== arrow && !arrow.contains(hit))) {
        problems.push(`${region}: centre reaches ${hit === null ? 'nothing' : hit.className}`);
      }
    }
    return problems;
  });
}

/** Every text box under `.hud` that is drawing its ellipsis right now. */
async function ellipsised(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hud *')]
      .filter((node) => getComputedStyle(node).textOverflow === 'ellipsis' && node.checkVisibility())
      .filter((node) => node.scrollWidth > node.clientWidth)
      .map((node) => `${node.className} "${node.textContent?.trim()}" ${node.scrollWidth}>${node.clientWidth}`),
  );
}

async function fold(page: Page, region: 'navigation' | 'inspector'): Promise<void> {
  await page.locator(`.hud-layout__arrow[data-layout-region="${region}"]`).click();
  await expect(page.locator('.hud')).toHaveAttribute(`data-layout-${region}`, 'collapsed');
}

async function mapOnly(page: Page): Promise<void> {
  await page.locator('.hud-layout__button').click();
  await page.locator('.hud-layout__map-only').click();
  await expect(page.locator('.hud')).toHaveAttribute('data-layout-map-only', 'true');
  await page.keyboard.press('Escape');
}

test.describe('the HUD shell is what it says it is', () => {
  for (const [name, viewport] of [
    ['desktop', DESKTOP],
    ['tablet', TABLET],
  ] as const) {
    test(`a fold takes its region off the screen and leaves its handle on it, at the ${name} width`, async ({
      page,
    }) => {
      await open(page, viewport);
      expect(await renderedWhileHidden(page), 'open').toEqual([]);
      expect(await handles(page), 'open').toEqual([]);

      for (const region of ['navigation', 'inspector'] as const) {
        await fold(page, region);
        expect(await renderedWhileHidden(page), `${region} folded`).toEqual([]);
        expect(await handles(page), `${region} folded`).toEqual([]);
        await page.locator(`.hud-layout__arrow[data-layout-region="${region}"]`).click();
        await expect(page.locator('.hud')).toHaveAttribute(`data-layout-${region}`, 'open');
      }

      await mapOnly(page);
      expect(await renderedWhileHidden(page), 'map only').toEqual([]);
      expect(await handles(page), 'map only').toEqual([]);
    });
  }

  test('a fold takes its region off the screen at the phone width', async ({ page }) => {
    await open(page, PHONE);
    expect(await handles(page), 'open').toEqual([]);
    // A phone has no navigation arrow (`hud.css`, "THE NAVIGATION'S OWN ARROW
    // IS NOT DRAWN ON A PHONE"), so the inspector's arrow and "map only" are
    // the two folds a phone player has.
    await fold(page, 'inspector');
    expect(await renderedWhileHidden(page), 'inspector folded').toEqual([]);
    expect(await handles(page), 'inspector folded').toEqual([]);
    await page.locator('.hud-layout__arrow[data-layout-region="inspector"]').click();

    await mapOnly(page);
    expect(await renderedWhileHidden(page), 'map only').toEqual([]);
  });

  test('no resize handle reaches into another region’s panel, or draws a line at rest', async ({ page }) => {
    // 1440x900 is at least 781px tall, so the minimap corner sits under the
    // navigation column (`hud.css`'s corner block), which is the arrangement a
    // full-height handle collides with. 1280x720 is below it and the corner
    // steps aside; both are asserted because the rule is the same at both.
    for (const viewport of [DESKTOP, { width: 1280, height: 720 }, { width: 1724, height: 972 }]) {
      await open(page, viewport);
      const report = await page.evaluate(() => {
        const problems: string[] = [];
        const overlap = (a: DOMRect, b: DOMRect): number =>
          Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
          Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        // Every surface that is a panel of its own: the `.ui-panel`s, and the
        // four surfaces this HUD draws that are not built from that primitive.
        const panels = [
          ...document.querySelectorAll<HTMLElement>(
            '.hud .ui-panel, .hud .hud-zoom, .hud .hud-chrome-prefs, .hud .save-panel, .hud .hud-tabs__inner',
          ),
        ].filter((node) => node.checkVisibility());
        for (const separator of document.querySelectorAll<HTMLElement>('.hud-layout__separator')) {
          if (!separator.checkVisibility()) continue;
          const own = separator.parentElement!;
          const box = separator.getBoundingClientRect();
          for (const panel of panels) {
            if (own.contains(panel)) continue;
            const area = overlap(box, panel.getBoundingClientRect());
            if (area > 0) problems.push(`${separator.className} covers ${Math.round(area)}px² of ${panel.className}`);
          }
          // At rest -- nothing hovered, nothing focused, no drag -- a vertical
          // handle draws nothing: the delivery's `.pane-splitter:after` is
          // transparent until `:hover` / `:focus-visible`, because a panel's
          // own edge is the line. A painted `::before` here is a line drawn
          // through whatever lies under the handle, which above 720px is the
          // world.
          if (separator.getAttribute('aria-orientation') === 'vertical') {
            const line = getComputedStyle(separator, '::before').backgroundColor;
            const alpha = line.startsWith('rgba') ? Number(line.split(',')[3]!.replace(')', '')) : 1;
            if (alpha > 0) problems.push(`${separator.className} paints ${line} at rest`);
          }
        }
        return problems;
      });
      expect(report, `${viewport.width}x${viewport.height}`).toEqual([]);
    }
  });

  test('the navigation’s tabs are as wide as the width a player sets, down to the ruled minimum', async ({
    page,
  }) => {
    await open(page, DESKTOP);
    const separator = page.locator('.hud-layout__separator--navigation');
    await separator.focus();
    for (const key of ['End', 'Home'] as const) {
      await page.keyboard.press(key);
      const measured = await page.evaluate(() => {
        const column = document.querySelector<HTMLElement>('.hud__tabs')!.getBoundingClientRect();
        const tabs = [...document.querySelectorAll<HTMLElement>('.hud-tabs__inner > .ui-tab')].map(
          (tab) => tab.getBoundingClientRect().width,
        );
        const tapTarget = Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue('--tap-target'),
        );
        return { column: column.width, narrowest: Math.min(...tabs), tapTarget };
      });
      // Every tab is a whole tap target wide (constitution article 7), at the
      // narrowest width the delivery allows as much as at the widest...
      expect(measured.narrowest, `${key}: narrowest tab`).toBeGreaterThanOrEqual(measured.tapTarget);
      // ...and the column's width goes to the tabs: nothing but the two
      // gutters either side of them comes out of it.
      expect(measured.column - measured.narrowest, `${key}: column less tabs`).toBeLessThanOrEqual(24 + 2);
    }
  });

  for (const locale of ['pl-PL', 'en-US'] as const) {
    test.describe(`in ${locale}`, () => {
      test.use({ locale });

      test('no HUD text is ellipsised on a fresh page at any desktop width', async ({ page }) => {
        // Four page loads, on a runner whose load average this repository has
        // measured at 20 (`docs/AGENT_WORKFLOW.md` §3): the budget is for the
        // loads, and nothing here waits on a race.
        test.slow();
        for (const viewport of [
          { width: 1280, height: 720 },
          { width: 1440, height: 900 },
          { width: 1724, height: 972 },
          { width: 1920, height: 1080 },
        ]) {
          await open(page, viewport);
          expect(await ellipsised(page), `${viewport.width}x${viewport.height}`).toEqual([]);
        }
      });

      test('no chrome reading is ellipsised in any theme the control can show', async ({ page }) => {
        await open(page, { width: 1280, height: 720 });
        // Pressed through in place: a reading changes inside a row whose own
        // box does not move, which is the case a width-only observer never
        // hears.
        const cycle = page.locator('.theme-control__cycle');
        const readings = new Set<string>();
        for (let press = 0; press < 3; press += 1) {
          const before = (await cycle.textContent()) ?? '';
          readings.add(before);
          await cycle.click();
          await expect(cycle).not.toHaveText(before);
          await expect.poll(() => ellipsised(page), `after ${press + 1} theme presses`).toEqual([]);
        }
        expect(readings.size, 'three presses visited three readings').toBe(3);
      });
    });
  }

  test.describe('in pl-PL, before any prison exists', () => {
    test.use({ locale: 'pl-PL' });

    test('the same sentence is never on screen at two sizes', async ({ page }) => {
      for (const viewport of [DESKTOP, { width: 1280, height: 720 }]) {
        await open(page, viewport);
        const sizes = await page.evaluate(() => {
          const bySentence = new Map<string, Set<string>>();
          for (const node of document.querySelectorAll<HTMLElement>('.hud *')) {
            if (!node.checkVisibility() || node.children.length > 0) continue;
            const text = node.textContent?.trim() ?? '';
            // A sentence, not a label or a figure: labels and values are a
            // hierarchy and may legitimately differ.
            if (text.length < 20 || !text.endsWith('.')) continue;
            const size = getComputedStyle(node).fontSize;
            bySentence.set(text, (bySentence.get(text) ?? new Set()).add(size));
          }
          return [...bySentence].filter(([, set]) => set.size > 1).map(([text, set]) => `${text} at ${[...set].join(' and ')}`);
        });
        expect(sizes, `${viewport.width}x${viewport.height}`).toEqual([]);
      }
    });
  });
});
