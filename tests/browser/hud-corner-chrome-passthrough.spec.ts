import { expect, test, type Page } from './network-changed-fixture';
import { installTee, openApp, press, tab } from './playtest-harness';

/**
 * **The app-level gate for issue #1054: `.hud__corner`'s blank chrome no
 * longer eats a press meant for the world underneath it.**
 *
 * ## The defect this closes, measured rather than read off the CSS
 *
 * `hud.css`'s *"every interactive island opts back in"* rule used to include
 * `.hud__corner > *` in its selector list, granting `pointer-events: auto` to
 * the *whole* of `.hud-zoom` and `.hud-minimap` -- not just their buttons and
 * their clickable surface, but their headers, their titles and their padding
 * too. Driven on the real assembled page, wall-brick armed, a real mouse press
 * at the centre of `.hud-minimap`'s own `<h2>` title:
 *
 * ```
 * topmost={"tag":"H2","cls":"ui-panel__title","pe":"auto"} newCommands=[]
 * ```
 *
 * (The gate below arms the removal tool rather than `wall-brick` for the same
 * press -- see the test's own comment for why: `RemoveObject` names whatever
 * tile a press lands on with nothing checked first, where the wall tool's own
 * edge-snap tolerance can legitimately produce nothing at a pixel that still,
 * correctly, reached the canvas. The measurement above is the one that found
 * the defect and is kept verbatim; the gate needs an instrument that is not
 * hostage to a second tool's own geometry.)
 *
 * Zero commands, no refusal, no console line -- indistinguishable, from the
 * player's chair, from a press that landed and had nothing to say (the same
 * reading `docs/research/2026-09-02-the-world-view.md` §1 gives the identical
 * shape of defect on `.hud-minimap` before issue #793 gave the surface itself
 * a handler). The title carries no click handler anywhere in `hud.ts` and
 * never will -- a panel's name is not a button -- so the fix is not to give it
 * one, it is to stop granting it the pointer at all.
 *
 * ## Why `.hud__corner` and not the other four opted-in selectors
 *
 * `.hud-strip`, `.hud__aside > *`, `.hud__side > *` and `.hud-tabs__inner` stay
 * opted in whole, and that is deliberate, not an oversight this file should
 * also be closing. `.hud__side`'s panels (Build, Rooms, Staff, Regime, Intake)
 * and `.hud__aside`'s save panel are each `overflow-y: auto` **on the panel
 * itself** -- `.ui-panel.hud-build`'s own comment calls it "the outer scroll
 * container... this one is what catches whatever the catalogue's floor will
 * not let it absorb" -- so a wheel or a touch-drag over any pixel of one of
 * those panels, blank padding included, has to reach the scrolling element or
 * the gesture is lost to the canvas behind it. Narrowing those the way this
 * file narrows `.hud__corner` would trade issue #1054's defect for the mirror
 * image: a scroll gesture that silently pans or zooms the world instead of
 * scrolling the list the player is looking at. `.hud__corner`'s two panels are
 * not scroll containers themselves -- only `.hud-alerts__list` inside
 * `.hud-minimap` is, and it is opted in by name -- so narrowing them buys
 * exactly this fix and costs nothing there.
 *
 * ## What this file asserts, and what it deliberately leaves to others
 *
 * 1. **Blank chrome passes a press through to the world.** `.hud-minimap`'s
 *    title and `.hud-zoom`'s own background (not a button) both resolve to
 *    `CANVAS` at `elementFromPoint` and a real press there submits a
 *    `RemoveObject` for whatever tile is under it, removal tool armed.
 * 2. **The mirror-image defect does not exist.** Narrowing the opt-in could
 *    overshoot and take the pointer away from a real control -- a worse defect
 *    than the one being closed, per the issue's own framing. So this file also
 *    presses the minimap's collapse toggle, the zoom buttons, the minimap
 *    surface and the alerts section's fold header, on the real assembled page,
 *    and asserts each still receives the click rather than falling through to
 *    the canvas.
 * 3. **Not restated here:** that the minimap surface navigates the camera
 *    (`hud-minimap-navigates.spec.ts`, #793) and that the zoom buttons zoom
 *    (`hud-zoom-control.spec.ts`, #1023) -- those files already drive the
 *    *effect* of a press that reaches its control; this file is the one
 *    checking that a press reaches a control, or does not, on the right
 *    pixels.
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

test.describe('#1054: `.hud__corner`\'s blank chrome is transparent to the pointer', () => {
  test('a press on `.hud-minimap`\'s title, and on `.hud-zoom`\'s own background, reaches the world', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await tab(page, 'build').click();
    // The removal tool, not a placement buildable: `hud-zoom-control.spec.ts`
    // uses the identical instrument for the identical reason -- `RemoveObject`
    // is submitted for whatever tile a press names, with nothing checked
    // first, so the assertion below is not hostage to a wall tool's own
    // edge-snap tolerance at an arbitrary pixel the way a first attempt at
    // this file (armed with `wall-brick`) measured: a press that
    // `elementFromPoint` confirmed landed on `CANVAS` still produced zero
    // commands, because the point was not close enough to a tile edge for the
    // wall tool to name one -- a real property of that tool, not of whether
    // the press reached the world at all.
    await page.locator('.hud-build__remove').click();

    const title = await centreOfSelector(page, '.hud-minimap .ui-panel__title');
    const titleHit = await elementAt(page, title);
    expect(titleHit.tag, `a press at the minimap title landed on ${JSON.stringify(titleHit)}, not the canvas`).toBe('CANVAS');
    const fromTitle = await press(page, title.x, title.y);
    expect(
      fromTitle.some((command) => command['type'] === 'RemoveObject'),
      `a press on the minimap's own title produced ${JSON.stringify(fromTitle)} -- the panel's name swallowed a press meant for the world`,
    ).toBe(true);

    // A point inside `.hud-zoom`'s pill that is not one of its two buttons:
    // the legend's own background, `aria-hidden` and never wired to a
    // handler. `.hud-zoom__legend`'s box, not the pill's, because the pill's
    // own padding is thin enough that its centre can land on a button instead.
    const legend = await centreOfSelector(page, '.hud-zoom__legend');
    const legendHit = await elementAt(page, legend);
    expect(legendHit.tag, `a press at the zoom legend landed on ${JSON.stringify(legendHit)}, not the canvas`).toBe('CANVAS');
    const fromLegend = await press(page, legend.x, legend.y);
    expect(
      fromLegend.some((command) => command['type'] === 'RemoveObject'),
      `a press on the zoom island's own legend produced ${JSON.stringify(fromLegend)} -- the island's chrome swallowed a press meant for the world`,
    ).toBe(true);
  });

  test('every real control in `.hud__corner` still keeps its own press -- narrowing the opt-in must not overshoot', async ({ page }) => {
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
      // itself, which is exactly the check `hud-minimap-navigates.spec.ts`
      // and `hud-zoom-control.spec.ts` already use for the same reason.
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
});
