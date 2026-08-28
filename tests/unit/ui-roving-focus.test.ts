import { describe, expect, it } from 'vitest';
import { rovingFocusMove, rovingTabStop } from '../../src/ui/primitives/roving-focus';

/**
 * The arithmetic behind the Rooms catalogue's one tab stop (#411).
 *
 * `vitest.config.ts` runs in `environment: 'node'` with no jsdom, so the
 * `keydown` listener that consumes these answers is unreachable from this
 * suite and is proved in Playwright instead (`docs/TESTING.md`). What *is*
 * reachable, and is the part that has edges worth pinning, is the arithmetic:
 * which member holds the group's `0`, where each key moves, that the ring
 * wraps at both ends, and -- the load-bearing one -- which keys the group must
 * refuse to take from the browser.
 *
 * The eighteen in these cases is the shipped room catalogue's length
 * (`src/content/room-catalog.ts`), used because the wrap-around is the whole
 * point and a two-member group cannot tell a wrap from an off-by-one.
 */
describe('which member of a single-select group holds its one tab stop', () => {
  it('is the selected member, so tabbing back in lands on the choice already made', () => {
    expect(rovingTabStop(18, 7)).toBe(7);
    expect(rovingTabStop(18, 0)).toBe(0);
    expect(rovingTabStop(18, 17)).toBe(17);
  });

  it('is the first member when nothing is selected, because a group with no tab stop cannot be entered', () => {
    expect(rovingTabStop(18, undefined)).toBe(0);
  });

  it('falls back to the first member rather than naming one that does not exist', () => {
    // A selection index out of step with the group is a bug elsewhere; the
    // answer here still has to be a member, or the whole group leaves the tab
    // order and eighteen controls become unreachable.
    expect(rovingTabStop(18, 18)).toBe(0);
    expect(rovingTabStop(18, -1)).toBe(0);
    expect(rovingTabStop(18, 1.5)).toBe(0);
  });

  it('has no answer for an empty group', () => {
    expect(rovingTabStop(0, undefined)).toBeUndefined();
    expect(rovingTabStop(0, 0)).toBeUndefined();
    expect(rovingTabStop(-1, undefined)).toBeUndefined();
  });
});

describe('where a key moves focus inside the group', () => {
  it('steps forward on Down and Right, and back on Up and Left', () => {
    expect(rovingFocusMove('ArrowDown', 3, 18)).toBe(4);
    expect(rovingFocusMove('ArrowRight', 3, 18)).toBe(4);
    expect(rovingFocusMove('ArrowUp', 3, 18)).toBe(2);
    expect(rovingFocusMove('ArrowLeft', 3, 18)).toBe(2);
  });

  it('wraps at both ends, so neither end of the list is a dead stop', () => {
    expect(rovingFocusMove('ArrowDown', 17, 18)).toBe(0);
    expect(rovingFocusMove('ArrowUp', 0, 18)).toBe(17);
  });

  it('jumps to the ends on Home and End, from anywhere', () => {
    expect(rovingFocusMove('Home', 9, 18)).toBe(0);
    expect(rovingFocusMove('End', 9, 18)).toBe(17);
    expect(rovingFocusMove('Home', 0, 18)).toBe(0);
    expect(rovingFocusMove('End', 17, 18)).toBe(17);
  });

  /**
   * The answer that keeps the group from becoming a trap.
   *
   * `undefined` is what tells the caller not to call `preventDefault`. A
   * composite widget that consumed every key would take `Tab` away from the
   * player -- and this group lives *inside* an `overflow-y: auto` scroller, so
   * consuming an unhandled key would also stop that scroller scrolling.
   */
  it('refuses every key that is not its own, including the ones that must stay the browser’s', () => {
    for (const key of ['Tab', 'Enter', ' ', 'Escape', 'PageDown', 'PageUp', 'a', 'ArrowDownLeft']) {
      expect(rovingFocusMove(key, 3, 18), `${key} was consumed by the group`).toBeUndefined();
    }
  });

  it('has no answer for an empty group or an index outside it', () => {
    expect(rovingFocusMove('ArrowDown', 0, 0)).toBeUndefined();
    expect(rovingFocusMove('ArrowDown', 18, 18)).toBeUndefined();
    expect(rovingFocusMove('ArrowDown', -1, 18)).toBeUndefined();
    expect(rovingFocusMove('ArrowDown', 1.5, 18)).toBeUndefined();
  });

  /**
   * A single-member group is a ring of one, not a broken one.
   *
   * Reachable in the shipped application only through a host that passes one
   * room type, but the wrap arithmetic is where an off-by-one would hide and
   * `% 1` is the case that would expose it.
   */
  it('leaves a single-member group where it is, in both directions', () => {
    expect(rovingFocusMove('ArrowDown', 0, 1)).toBe(0);
    expect(rovingFocusMove('ArrowUp', 0, 1)).toBe(0);
    expect(rovingFocusMove('End', 0, 1)).toBe(0);
  });
});
