import { expect, test, type Page } from './network-changed-fixture';
import { installTee, openApp, press, tab } from './playtest-harness';

/**
 * **The app-level gate for issue #1054: `.hud__corner`'s blank chrome no
 * longer eats a press meant for the world underneath it.**
 *
 * ## The defect, measured on the real page before this file's fix existed
 *
 * `hud.css`'s "every interactive island opts back in" rule used to list
 * `.hud__corner > *` beside `.hud-strip`, `.hud__aside > *`, `.hud__side > *`
 * and `.hud-tabs__inner`, granting `pointer-events: auto` to the *whole* of
 * `.hud-zoom` and `.hud-minimap` -- not only their two buttons and the
 * minimap surface, but their header, their title and every pixel of their own
 * padding. A real mouse press at the centre of `.hud-minimap`'s `<h2>` title,
 * on the assembled page at 1440x900 with the removal tool armed, produced:
 *
 * ```
 * elementFromPoint -> H2.ui-panel__title, pointer-events: auto
 * commands: []
 * ```
 * (measured against `origin/main` before this branch touched `hud.css`, by
 * running this file's own first test against the unfixed CSS -- see this
 * branch's commit message for the exact console output).
 *
 * The title carries no click handler in `hud.ts` and never will -- a panel's
 * name is not a button -- so the press was not refused, deferred or answered
 * by anything: it went nowhere. Nothing is charged, nothing is drawn, and
 * nothing tells the player why, which is issue #1054's whole complaint.
 *
 * ## Why `.hud__corner` and not the other four opted-in selectors
 *
 * `.hud-strip`, `.hud__aside > *`, `.hud__side > *` and `.hud-tabs__inner`
 * stay opted in whole, and that is a finding this file's authoring pass made
 * before touching anything, not an assumption carried over from the issue.
 * Every panel `.hud__aside` and `.hud__side` can hold is `overflow-y: auto`
 * **on the panel's own root element**, verified by opening each rule rather
 * than trusting its neighbours:
 *
 *   - `.ui-panel.hud-build`  -- `hud.css:1248-1249`
 *   - `.ui-panel.hud-staff`  -- `hud.css:1589-1590`
 *   - `.ui-panel.hud-rooms`  -- `hud.css:3529-3530`
 *   - `.ui-panel.hud-regime` -- `hud.css:2709-2710`
 *   - `.save-panel`          -- `src/styles.css:56-76` ("`overflow-y: auto`
 *     makes this a scroll container... a long prison list or a short window
 *     scrolls *here*")
 *
 * so a wheel turn or a touch drag over any pixel of one of those five --
 * blank padding included -- has to reach the scrolling element itself, and
 * narrowing the opt-in the way this file narrows `.hud__corner` would trade
 * #1054's defect for its mirror image: a scroll gesture that silently pans or
 * zooms the camera instead of scrolling the panel the player is looking at.
 * (The Intake panel sets no `overflow` of its own and stays covered by the
 * same blanket rule regardless -- it costs nothing to leave it there, and
 * nothing here argues it should be singled out. It was `.hud__side`'s fifth
 * occupant when this was written; the Overview panel made six on 2026-09-14
 * and is `overflow-y: auto` on its own root like the four above, so the
 * finding is unchanged in both directions.) `.hud-tabs__inner` is `gap: 0` with every tab `align-items: stretch`,
 * so there is no blank interior between its buttons to begin with.
 *
 * `.hud__corner`'s two panels are neither. Nothing in `.hud-zoom` or
 * `.hud-minimap` scrolls except `.hud-alerts__list`, which is opted in by
 * name below -- `hud.css:481-486` is `overflow-y: auto` on that element and
 * on nothing above it. So narrowing `.hud__corner` buys exactly issue #1054's
 * fix and costs no scroll gesture anywhere.
 *
 * ## What this file asserts, and what it deliberately leaves to others
 *
 * 1. **Blank chrome passes a press through to the world.** `.hud-minimap`'s
 *    title and `.hud-zoom`'s own background (not a button) both resolve to
 *    `CANVAS` at `elementFromPoint`, and a real press there submits a
 *    `RemoveWall` for whatever tile is under it (`RemoveObject` before
 *    ADR 0106, which taught the world press to always resolve an edge).
 * 2. **The mirror-image defect does not exist.** Narrowing an opt-in can
 *    overshoot and take the pointer away from a real control, which the
 *    issue itself names as the risk worth pricing. So this file also presses
 *    the minimap's collapse toggle, both zoom buttons, the minimap surface
 *    and the alerts section's own fold header on the real assembled page, and
 *    asserts each still receives the click instead of falling through.
 * 3. **Not restated here:** that the minimap surface navigates the camera
 *    (`hud-minimap-navigates.spec.ts`, #793) and that the zoom buttons zoom
 *    (`hud-zoom-control.spec.ts`, #1023) -- those files already drive the
 *    *effect* of a press that reaches its control; this file only checks
 *    which pixels a press reaches a control from.
 */

async function elementAt(page: Page, point: { readonly x: number; readonly y: number }): Promise<{ tag: string; cls: string }> {
  return page.evaluate(
    ([px, py]) => {
      const el = document.elementFromPoint(px, py);
      return el === null ? { tag: 'NONE', cls: '' } : { tag: el.tagName, cls: typeof el.className === 'string' ? el.className : '' };
    },
    [point.x, point.y] as const,
  );
}

async function centreOfSelector(page: Page, selector: string): Promise<{ readonly x: number; readonly y: number }> {
  const rect = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el === null) return undefined;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return undefined;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, selector);
  if (rect === undefined) throw new Error(`${selector} is not on the page, or has no box -- instrument is stale`);
  return rect;
}

test.describe("#1054: `.hud__corner`'s blank chrome is transparent to the pointer", () => {
  test("a press on `.hud-minimap`'s title, and on `.hud-zoom`'s own background, reaches the world", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await tab(page, 'build').click();
    // The removal tool, not a placement buildable: `RemoveWall` is submitted
    // for whatever tile a press names with nothing checked first (ADR 0106 --
    // a world press always resolves an edge, where the wall tool's own
    // edge-snap tolerance can legitimately produce nothing at a pixel that
    // still, correctly, reached the canvas -- so this is the instrument that
    // isolates whether the press reached the canvas at all, not whether it
    // also satisfied a second tool's own geometry.
    await page.locator('.hud-build__remove').click();

    const title = await centreOfSelector(page, '.hud-minimap .ui-panel__title');
    const titleHit = await elementAt(page, title);
    expect(titleHit.tag, `a press at the minimap title landed on ${JSON.stringify(titleHit)}, not the canvas`).toBe('CANVAS');
    const fromTitle = await press(page, title.x, title.y);
    expect(
      fromTitle.some((command) => command['type'] === 'RemoveWall'),
      `a press on the minimap's own title produced ${JSON.stringify(fromTitle)} -- the panel's name swallowed a press meant for the world`,
    ).toBe(true);

    // A point inside `.hud-zoom`'s pill that is not one of its two buttons:
    // the legend's own background, `aria-hidden` and never wired to a
    // handler. `.hud-zoom__legend`'s own box, not the pill's, because the
    // pill's padding is thin enough that its centre can land on a button.
    const legend = await centreOfSelector(page, '.hud-zoom__legend');
    const legendHit = await elementAt(page, legend);
    expect(legendHit.tag, `a press at the zoom legend landed on ${JSON.stringify(legendHit)}, not the canvas`).toBe('CANVAS');
    const fromLegend = await press(page, legend.x, legend.y);
    expect(
      fromLegend.some((command) => command['type'] === 'RemoveWall'),
      `a press on the zoom island's own legend produced ${JSON.stringify(fromLegend)} -- the island's chrome swallowed a press meant for the world`,
    ).toBe(true);
  });

  test("every real control in `.hud__corner` still keeps its own press -- narrowing the opt-in must not overshoot", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await installTee(page);
    await openApp(page);
    await tab(page, 'build').click();

    const controls: readonly [string, string][] = [
      ['.hud-minimap .ui-panel__toggle', 'the minimap collapse toggle'],
      ['.hud-zoom__out', 'the zoom-out button'],
      ['.hud-zoom__in', 'the zoom-in button'],
      ['.hud-minimap__surface', 'the minimap navigation surface'],
      ['.hud-minimap .ui-section__header', "the alerts section's fold header"],
    ];

    for (const [selector, label] of controls) {
      const point = await centreOfSelector(page, selector);
      // `target.contains(el)`, not an exact tag/class match: the pixel at a
      // control's centre can resolve to a descendant (an icon glyph, the
      // toggle's screen-reader text span) rather than the control element
      // itself -- the same check `hud-minimap-navigates.spec.ts` and
      // `hud-zoom-control.spec.ts` already use for the same reason.
      const result = await page.evaluate(
        ([px, py, sel]) => {
          const el = document.elementFromPoint(px as number, py as number);
          const target = document.querySelector(sel as string);
          const describe = el === null ? 'nothing' : `${el.tagName}.${typeof el.className === 'string' ? el.className : ''}`;
          return { ok: el !== null && target !== null && (el === target || target.contains(el)), describe };
        },
        [point.x, point.y, selector] as const,
      );
      expect(
        result.ok,
        `a press meant for ${label} (${selector}) would land on ${result.describe} instead -- narrowing the corner's opt-in took the pointer away from a real control`,
      ).toBe(true);
    }
  });

  test('the alerts list keeps a whole-list wheel scroll, not just its individual rows', async ({ page }) => {
    // The one nested scroll container inside `.hud__corner`: `.hud-alerts__list`
    // is `overflow-y: auto` on itself (`hud.css:481-486`), not on some
    // ancestor, so it has to be opted back in by name rather than inherit
    // `auto` from a panel-level rule the way the four scroll-panel islands do.
    // This test presses blank list padding below the rows -- the same class of
    // pixel #1054 measured on the minimap title -- and asserts the list, not
    // the canvas, receives it.
    await page.setViewportSize({ width: 1440, height: 900 });
    await installTee(page);
    await openApp(page);
    /*
     * **A prison has to be reporting before there is a list to press**, as of
     * issue #1184. `HudViewModel.alerts` is absent until the first
     * `simulation/status-counts` publication -- the state the section now
     * spells *"No prison is reporting."* rather than *"No active alerts"* --
     * and `hud.ts` takes `.hud-alerts__list` off screen for it, so on the boot
     * page this measurement was reading a zero-sized box.
     *
     * Starting a session is the honest fix rather than a widening: this test's
     * subject is a **scroll container with rows in it**, which only exists once
     * something is reporting. The two lines below are the same pair the
     * `openApp` above is paired with in the test one block up.
     */
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    const listBox = await page.evaluate(() => {
      const el = document.querySelector('.hud-alerts__list');
      if (el === null) return undefined;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    });
    expect(listBox, '.hud-alerts__list is not on the page -- instrument is stale').toBeDefined();
    const point = { x: listBox!.left + listBox!.width / 2, y: listBox!.top + Math.max(2, listBox!.height - 4) };
    const hit = await page.evaluate(
      ([px, py]) => {
        const el = document.elementFromPoint(px, py);
        const list = document.querySelector('.hud-alerts__list');
        return { insideList: el !== null && list !== null && (el === list || list.contains(el)) };
      },
      [point.x, point.y] as const,
    );
    expect(
      hit.insideList,
      'the bottom of the alerts list no longer receives a press inside its own box -- a wheel or touch scroll there would fall through to the canvas',
    ).toBe(true);
  });
});
