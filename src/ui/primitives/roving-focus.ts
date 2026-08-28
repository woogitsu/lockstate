/**
 * The two decisions a roving tab stop makes, as arithmetic rather than as DOM.
 *
 * A group of controls that is one choice -- eighteen room types, of which
 * exactly one is selected -- should cost the keyboard **one** tab stop and not
 * one per member. That is the WAI-ARIA composite-widget rule, and the mechanism
 * is a *roving* `tabindex`: every member carries `-1` except the one the group
 * would hand focus to, which carries `0`, and the arrow keys move both the
 * focus and that `0` between them.
 *
 * Both halves of that are pure functions of an index and a count, so they live
 * here rather than inside the panel that uses them. `vitest.config.ts` runs in
 * `environment: 'node'` with no jsdom, so a decision buried in a `keydown`
 * listener is a decision the unit suite cannot reach at all; extracted, the
 * wrap-around, the bounds and the key mapping are all node-testable and only
 * the *wiring* needs a browser (`docs/TESTING.md`).
 *
 * Nothing here touches `document`, and nothing here knows what the members are.
 */

/**
 * Which member of a single-select group holds the group's one tab stop.
 *
 * The selected member, so that tabbing into a group the player has already
 * chosen from lands on their choice rather than at the top -- and the first
 * member when nothing is selected yet, because a group with no tab stop at all
 * is a group the keyboard cannot enter.
 *
 * Answers `undefined` for an empty group: there is nothing to give a tab stop
 * to, and `0` would name a member that does not exist.
 */
export function rovingTabStop(count: number, selectedIndex: number | undefined): number | undefined {
  if (count <= 0) return undefined;
  if (selectedIndex === undefined) return 0;
  if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= count) return 0;
  return selectedIndex;
}

/**
 * Where a key press moves focus inside the group, or `undefined` when the key
 * is not one of the group's own.
 *
 * `undefined` is the load-bearing answer: it is what tells the caller to leave
 * the event alone. A composite widget that swallowed every key would take
 * `Tab` away from the player and trap them in it, which is a worse defect than
 * the one the roving tab stop exists to fix.
 *
 * **Both axes move, and they wrap.** Up/Left go back and Down/Right go
 * forward, because a vertical list drawn in a narrow rail is still a list a
 * player may arrow through either way, and a screen reader announcing
 * "radio button, 3 of 18" has already told them the group is a ring.
 */
export function rovingFocusMove(key: string, currentIndex: number, count: number): number | undefined {
  if (count <= 0) return undefined;
  if (!Number.isInteger(currentIndex) || currentIndex < 0 || currentIndex >= count) return undefined;
  switch (key) {
    case 'ArrowDown':
    case 'ArrowRight':
      return (currentIndex + 1) % count;
    case 'ArrowUp':
    case 'ArrowLeft':
      return (currentIndex - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return undefined;
  }
}
