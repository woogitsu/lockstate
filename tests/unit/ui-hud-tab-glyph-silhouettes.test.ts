import { describe, expect, it } from 'vitest';
import { HUD_TABS } from '../../src/ui/hud/hud';
import { ICON_PATHS } from '../../src/ui/primitives/icon';

/**
 * The HUD tab glyphs must differ by silhouette, not only by ink.
 *
 * The owner ruled on 2026-09-16 (#1192) that the tab bar goes icon-only below
 * 720px. That makes the glyph the sole carrier of a section's meaning on a
 * phone, and it broke an assumption the icons were drawn under: they were
 * designed to sit *above a word*.
 *
 * When that was measured, three of the five tabs -- `build`, `rooms` (drawn
 * for Zones) and `regime` (drawn for Day plan) -- were each a full-bleed
 * axis-aligned rectangle with interior strokes:
 *
 *   build:  M3.75 5.75h16.5v12.5H3.75z
 *   rooms:  M3.75 4.75h16.5v14.5H3.75z
 *   regime: M3.75 6.25h16.5v13.5H3.75z
 *
 * Rasterised at `--icon-size-lg` they were still distinct pixel sets, so an
 * ink-overlap measurement passed them. A player reads a shape before they read
 * its ink, and at 20px three of the five bar positions were the same shape.
 *
 * This is the gate that makes that a failure rather than a review note. It is
 * deliberately coarse: it does not score similarity, it counts how many of the
 * five tabs are drawn as one big rectangle. One may be (the calendar the Day
 * plan tab shows is worth more than the uniqueness of its bounding box); two
 * is a silhouette collision.
 *
 * What this test does NOT establish, and no test here can: that a player who
 * has never seen the application can tell which glyph means which section.
 * Distinguishable is not identifiable. That is a question for a person.
 */

const VIEWBOX = 24;

/** Half the viewBox: below this in either axis a rectangle is a detail, not a frame. */
const FULL_BLEED_MIN = VIEWBOX / 2;

/**
 * `M<x> <y>h<w>v<h>H<x>z` or the `h-<w>` spelling of the same closing edge --
 * the only two forms an axis-aligned rectangle outline is written in here.
 */
const RECTANGLE_OUTLINE = /^M(-?[\d.]+) (-?[\d.]+)h(-?[\d.]+)v(-?[\d.]+)[Hh](-?[\d.]+)z$/;

function fullBleedRectangle(paths: readonly string[]): boolean {
  const first = paths[0];
  if (first === undefined) return false;
  const match = RECTANGLE_OUTLINE.exec(first);
  if (match === null) return false;
  const width = Math.abs(Number(match[3]));
  const height = Math.abs(Number(match[4]));
  return width >= FULL_BLEED_MIN && height >= FULL_BLEED_MIN;
}

describe('HUD tab glyph silhouettes', () => {
  it('draws at most one tab as a full-bleed rectangle', () => {
    const rectangles = HUD_TABS.filter((tab) => fullBleedRectangle(ICON_PATHS[tab.icon])).map((tab) => tab.id);

    expect(rectangles.length, `tabs drawn as a full-bleed rectangle: ${rectangles.join(', ')}`).toBeLessThanOrEqual(1);
  });

  it('recognises the shape it is guarding against', () => {
    // The three path strings that motivated this file, so a future edit to
    // `fullBleedRectangle` that stops matching them fails here rather than
    // silently passing the assertion above.
    expect(fullBleedRectangle(['M3.75 5.75h16.5v12.5H3.75z'])).toBe(true);
    expect(fullBleedRectangle(['M3.75 4.75h16.5v14.5H3.75z'])).toBe(true);
    expect(fullBleedRectangle(['M3.75 6.25h16.5v13.5H3.75z'])).toBe(true);
    // A small rectangle is a detail: `overview` is four of them and reads as a
    // grid, not as a frame.
    expect(fullBleedRectangle(['M4.25 4.25h6v6h-6z'])).toBe(false);
    // The shapes that replaced them.
    expect(fullBleedRectangle(['M4.75 4.75h7v7h7.5v7.5H4.75z'])).toBe(false);
    expect(fullBleedRectangle(['M13.17 3.91 20.24 10.98 15.43 15.79 8.36 8.72z'])).toBe(false);
  });

  it('gives every tab a glyph that exists', () => {
    for (const tab of HUD_TABS) {
      expect(ICON_PATHS[tab.icon].length, `${tab.id} has no drawing`).toBeGreaterThan(0);
    }
  });
});
