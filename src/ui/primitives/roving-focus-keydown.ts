import { rovingFocusMove } from './roving-focus';

/**
 * The `keydown` wiring every roving-tabindex group in this HUD needs, so a
 * group cannot ship without the half of it that turned out to matter.
 *
 * `roving-focus.ts` keeps `rovingFocusMove` and `rovingTabStop` free of
 * `document` on purpose -- it is what lets the arithmetic run under
 * `vitest.config.ts`'s `environment: 'node'`, with no jsdom -- so this is the
 * sibling that actually touches an element and a real `KeyboardEvent`. Two
 * panels each wrote this listener by hand (`build-panel.ts`, `rooms-panel.ts`,
 * both for issue #411) and both got the arithmetic right and the propagation
 * wrong in the same way: each called `event.preventDefault()` for the key it
 * consumed and never `event.stopPropagation()`.
 *
 * That is not cosmetic. `preventDefault()` only cancels the browser's own
 * default action for the key -- page scroll on an arrow -- it does not stop
 * the event bubbling on to whatever else is listening. `WorldScene` binds its
 * own camera controls on `window`, in the bubble phase
 * (`src/rendering/scene/world-scene.ts:364-365`), gated only by
 * `isTextEntryFocused()` (`src/input/focus.ts`) -- which is deliberately not
 * about *this*: a focused `<button role="radio">` is not a text field, was
 * never meant to be treated as one, and the same keystroke that moves the
 * catalogue's own focus therefore also reaches the camera. Measured on the
 * assembled page: six `ArrowDown` presses inside the Build catalogue moved a
 * fixed world-tile probe from (16,14) to (16,16) -- a 2026-09-01 keyboard
 * playtest of the assembled page, recorded on an unmerged research branch at
 * the time of this fix and reproduced here in `tests/browser/app-shell.spec.ts`.
 *
 * `stopPropagation()` belongs here rather than as a wider gate on the camera
 * binding (checking, say, whether focus lives anywhere inside `.hud`) because
 * that would be the wrong shape of fix: the Build panel's own on-screen hint
 * promises that the arrow keys still move the camera, and that is true today
 * even while an ordinary HUD button -- the arm control, a disclosure header,
 * the category filter -- holds focus (`src/rendering/scene/world-scene.ts`'s
 * `activeContexts` callback does not care what has focus, only whether it is
 * a text field). A gate keyed on "is anything in the HUD focused" would take
 * that promise away every time a player had last clicked a button, which is
 * most of the time. Stopping propagation only where a key was *actually*
 * consumed for list navigation -- which is exactly what `next !== undefined`
 * below means -- fixes the real conflict without touching that unrelated,
 * working case at all.
 *
 * Centralising the wiring, rather than pasting a corrected copy into each
 * panel a second time, is what makes this a fix for the *shape* of the
 * defect and not only for the two instances found: a third roving-tabindex
 * group that calls this instead of writing its own listener cannot
 * reintroduce the gap, because there is no longer a `stopPropagation()` line
 * for it to forget.
 */
export function bindRovingFocusKeydown<Row extends { readonly element: HTMLElement }>(
  list: HTMLElement,
  options: {
    /** The `data-*` attribute (camelCase, as `HTMLElement.dataset` reads it) each row carries its id under. */
    readonly datasetAttribute: string;
    /** The ids currently in the ring, in order -- read fresh on every keypress, since a filter can change it. */
    readonly order: () => readonly string[];
    /** Every row, keyed by id, so the moved-to one can be found and focused. */
    readonly rows: ReadonlyMap<string, Row>;
  },
): void {
  list.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const focused = event.target;
    if (!(focused instanceof HTMLElement)) return;
    const id = focused.dataset[options.datasetAttribute];
    if (id === undefined) return;
    const order = options.order();
    const next = rovingFocusMove(event.key, order.indexOf(id), order.length);
    if (next === undefined) return;
    const targetId = order[next];
    const target = options.rows.get(targetId ?? '');
    if (target === undefined) return;
    event.preventDefault();
    // The half `preventDefault` does not buy -- see the module comment above.
    event.stopPropagation();
    // The moved-to row has to be able to take focus before it is given focus:
    // every row but the tab stop carries `-1`, and `focus()` on a `-1` element
    // works, but leaving the group's `0` behind would mean tabbing back in
    // returns to the row the player arrowed away from.
    for (const [rowId, row] of options.rows) row.element.tabIndex = rowId === targetId ? 0 : -1;
    target.element.focus();
  });
}
