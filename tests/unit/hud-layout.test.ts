import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HUD_TAB_IDS } from '../../src/ui/hud/hud-state';
import {
  DEFAULT_LAYOUT_SETTINGS,
  LAYOUT_REGIONS,
  type LayoutSettings,
  decodeLayoutSettings,
  isMapOnly,
  isRegionCollapsed,
  resetLayoutSettings,
  withLayoutSize,
  withRegionCollapsed,
} from '../../src/input/layout-preference';
import {
  DEFAULT_INSPECTOR_WIDTH_PX,
  FULL_HD_INSPECTOR_WIDTH_PX,
  DEFAULT_SHEET_HEIGHT_PX,
  DEFAULT_NAVIGATION_WIDTH_PX,
  FULL_HD_NAVIGATION_WIDTH_PX,
  INSPECTOR_WIDTH_RANGE,
  MAP_WIDTH_RESERVE_PX,
  NAVIGATION_WIDTH_RANGE,
  PHONE_MAX_WIDTH_PX,
  SHEET_MAX_VIEWPORT_FRACTION,
  SHEET_MIN_HEIGHT_PX,
  SHEET_VIEWPORT_RESERVE_PX,
  inspectorRange,
  layoutCustomProperties,
  isPhoneLayout,
  NAVIGATION_RAIL_PADDING_PX,
  NAVIGATION_RAIL_SLACK_PX,
  NAVIGATION_TAB_HEIGHT_PX,
  navigationPlacement,
  navigationRange,
  resolveHudLayout,
  resolveLayoutSize,
  sizeFieldFor,
} from '../../src/ui/hud/hud-layout';

/**
 * The HUD shell's layout preference and its geometry (#1159, stage 3).
 *
 * Two modules, tested together because they are one decision split across the
 * boundary `src/input/` draws: the record says what a player chose and the
 * geometry says what the viewport allows, and every interesting case is a
 * disagreement between the two.
 *
 * Node-environment, like every unit test here: neither module touches the DOM,
 * which is what makes the ruled numbers assertable at all rather than only
 * observable through a browser.
 */

const DESKTOP = { width: 1280, height: 720, uiScale: 1 };
const PHONE = { width: 375, height: 812, uiScale: 1 };
const TABLET = { width: 1024, height: 768, uiScale: 1 };

describe('the layout preference record', () => {
  it('defaults to nothing collapsed and no size chosen', () => {
    expect(DEFAULT_LAYOUT_SETTINGS.collapsed).toEqual([]);
    expect(DEFAULT_LAYOUT_SETTINGS.navigationWidth).toBeUndefined();
    expect(DEFAULT_LAYOUT_SETTINGS.inspectorWidth).toBeUndefined();
    expect(DEFAULT_LAYOUT_SETTINGS.sheetHeight).toBeUndefined();
  });

  it('names exactly the three regions the direction gives an arrow to', () => {
    expect(LAYOUT_REGIONS).toEqual(['navigation', 'inspector', 'metrics']);
  });

  it('round-trips a record it wrote itself', () => {
    const settings = withLayoutSize(
      withRegionCollapsed(DEFAULT_LAYOUT_SETTINGS, 'metrics', true),
      'inspectorWidth',
      420,
    );
    expect(decodeLayoutSettings(JSON.parse(JSON.stringify(settings)))).toEqual(settings);
  });

  it('refuses a record from another version, and one whose collapse list is not a list', () => {
    expect(decodeLayoutSettings({ version: 99, collapsed: [] })).toBeUndefined();
    expect(decodeLayoutSettings({ version: 1, collapsed: 'metrics' })).toBeUndefined();
    expect(decodeLayoutSettings(null)).toBeUndefined();
    expect(decodeLayoutSettings([])).toBeUndefined();
    expect(decodeLayoutSettings('layout')).toBeUndefined();
  });

  it('keeps the regions it understands out of a list that also names one it does not', () => {
    // A record written by a later build with a fourth region is not corrupt.
    // Throwing it away would cost the player the two regions this build does
    // understand, which is the whole reason the list is filtered rather than
    // validated.
    const decoded = decodeLayoutSettings({ version: 1, collapsed: ['inspector', 'sidebar', 'inspector'] });
    expect(decoded?.collapsed).toEqual(['inspector']);
  });

  it('drops a stored size that is not a finite number, and keeps one that is out of today’s range', () => {
    expect(decodeLayoutSettings({ version: 1, collapsed: [], inspectorWidth: 'wide' })?.inspectorWidth).toBeUndefined();
    expect(decodeLayoutSettings({ version: 1, collapsed: [], inspectorWidth: Number.NaN })?.inspectorWidth).toBeUndefined();
    // Out of range is not corrupt: the legal range moves with the viewport, so
    // a width that is legal on a desktop and illegal on the phone the player
    // next opens the game on has to survive the trip.
    expect(decodeLayoutSettings({ version: 1, collapsed: [], inspectorWidth: 5_000 })?.inspectorWidth).toBe(5_000);
  });

  it('returns the same object when a fold or a size changes nothing', () => {
    const collapsed = withRegionCollapsed(DEFAULT_LAYOUT_SETTINGS, 'navigation', true);
    expect(withRegionCollapsed(collapsed, 'navigation', true)).toBe(collapsed);
    expect(withRegionCollapsed(DEFAULT_LAYOUT_SETTINGS, 'navigation', false)).toBe(DEFAULT_LAYOUT_SETTINGS);
    const sized = withLayoutSize(DEFAULT_LAYOUT_SETTINGS, 'navigationWidth', 120);
    expect(withLayoutSize(sized, 'navigationWidth', 120)).toBe(sized);
  });

  it('keeps its collapse list in region order however the folds arrived', () => {
    let settings: LayoutSettings = DEFAULT_LAYOUT_SETTINGS;
    settings = withRegionCollapsed(settings, 'metrics', true);
    settings = withRegionCollapsed(settings, 'navigation', true);
    expect(settings.collapsed).toEqual(['navigation', 'metrics']);
  });

  it('calls every region folded at once "map only", and nothing less', () => {
    let settings: LayoutSettings = DEFAULT_LAYOUT_SETTINGS;
    for (const region of LAYOUT_REGIONS) {
      expect(isMapOnly(settings)).toBe(false);
      settings = withRegionCollapsed(settings, region, true);
    }
    expect(isMapOnly(settings)).toBe(true);
    expect(LAYOUT_REGIONS.every((region) => isRegionCollapsed(settings, region))).toBe(true);
  });

  it('resets by dropping the sizes rather than by writing numbers over them', () => {
    const settings = withLayoutSize(
      withRegionCollapsed(DEFAULT_LAYOUT_SETTINGS, 'inspector', true),
      'sheetHeight',
      200,
    );
    const reset = resetLayoutSettings();
    expect(reset).toBe(DEFAULT_LAYOUT_SETTINGS);
    expect(Object.hasOwn(settings, 'sheetHeight')).toBe(true);
    expect(Object.hasOwn(reset, 'sheetHeight')).toBe(false);
  });
});

describe('the device tier', () => {
  it('changes at the same width the stylesheet changes at', () => {
    // A geometry module that thought a phone started at a different width from
    // `hud.css` would hand the inspector a width range while the rail was
    // being laid out as a full-width sheet. Read out of the stylesheet rather
    // than restated, so the two cannot drift.
    const css = readFileSync(new URL('../../src/ui/hud/hud.css', import.meta.url), 'utf8');
    expect(css).toContain(`@media (max-width: ${PHONE_MAX_WIDTH_PX}px)`);
    expect(isPhoneLayout({ width: PHONE_MAX_WIDTH_PX, height: 800, uiScale: 1 })).toBe(true);
    expect(isPhoneLayout({ width: PHONE_MAX_WIDTH_PX + 1, height: 800, uiScale: 1 })).toBe(false);
  });
});

describe('where the five sections are laid out', () => {
  // `HUD_TAB_IDS.length` rather than five, for the reason the production code
  // reads it rather than counting: a sixth section must move this test's own
  // arithmetic, not silently clip itself out of the rail.
  const needed = (scale: number): number =>
    (HUD_TAB_IDS.length * NAVIGATION_TAB_HEIGHT_PX + NAVIGATION_RAIL_PADDING_PX) * scale;

  it('is a bottom bar on a phone at every scale, because that is the tier\u2019s layout', () => {
    expect(navigationPlacement(PHONE, 0)).toBe('bar');
    expect(navigationPlacement({ ...PHONE, uiScale: 0.75 }, 0)).toBe('bar');
  });

  it('is a left column wherever the tabs fit in what the strip leaves', () => {
    const strip = 84;
    const height = strip + NAVIGATION_RAIL_SLACK_PX + needed(1);
    expect(navigationPlacement({ width: 1280, height, uiScale: 1 }, strip)).toBe('rail');
    expect(navigationPlacement({ width: 1280, height: height - 1, uiScale: 1 }, strip)).toBe('bar');
  });

  it('hands the sections back to the bar when the interface scale takes the room', () => {
    // 900x600 at 200 %: the strip alone is 176px, and five tabs are 588.
    expect(navigationPlacement({ width: 900, height: 600, uiScale: 2 }, 176)).toBe('bar');
    // The same window at 100 %, where they fit comfortably.
    expect(navigationPlacement({ width: 900, height: 600, uiScale: 1 }, 84)).toBe('rail');
  });

  it('is what `resolveHudLayout` reports, and a bar takes no width from the map', () => {
    const geometry = resolveHudLayout(DEFAULT_LAYOUT_SETTINGS, { width: 900, height: 600, uiScale: 2 }, 176);
    expect(geometry.navigationPlacement).toBe('bar');
    expect(geometry.navigationExtent).toBe(0);
    // ...which the inspector is then free to spend.
    expect(geometry.inspector.range.max).toBe(900 - MAP_WIDTH_RESERVE_PX);
  });
});

describe('the ruled limits', () => {
  it('gives the navigation the delivery’s 72 to 180, at every tier', () => {
    expect(NAVIGATION_WIDTH_RANGE).toEqual({ min: 72, max: 180 });
    expect(navigationRange(DESKTOP)).toEqual({ min: 72, max: 180 });
    expect(navigationRange(PHONE)).toEqual({ min: 72, max: 180 });
  });

  it('gives the inspector 260 to 600 where the window is wide enough for both', () => {
    expect(INSPECTOR_WIDTH_RANGE).toEqual({ min: 260, max: 600 });
    // 1920 - 180 navigation - 320 map reserve = 1420, well past the ruled 600.
    expect(inspectorRange({ width: 1920, height: 1080, uiScale: 1 }, 180)).toEqual({ min: 260, max: 600 });
  });

  it('takes the map’s reserve out of the inspector’s maximum, not out of the map', () => {
    // 1280 - 180 - 320 = 780, still past 600.
    expect(inspectorRange(DESKTOP, 180).max).toBe(600);
    // 1024 - 180 - 320 = 524, which is the binding limit at this width.
    expect(inspectorRange(TABLET, 180)).toEqual({ min: 260, max: 1024 - 180 - MAP_WIDTH_RESERVE_PX });
    // Folding the navigation hands its width straight to the inspector --
    // 1024 - 320 = 704, at which point the delivery's own 600 binds again.
    expect(inspectorRange(TABLET, 0).max).toBe(INSPECTOR_WIDTH_RANGE.max);
    expect(1024 - MAP_WIDTH_RESERVE_PX).toBeGreaterThan(INSPECTOR_WIDTH_RANGE.max);
  });

  it('reports an inverted range rather than a crushed panel when the window cannot hold both', () => {
    // 800 - 180 - 320 = 300 is still legal; 721 - 180 - 320 = 221 is not.
    expect(inspectorRange({ width: 800, height: 720, uiScale: 1 }, 180).max).toBe(300);
    const squeezed = inspectorRange({ width: 721, height: 720, uiScale: 1 }, 180);
    expect(squeezed.max).toBeLessThan(squeezed.min);
    // And the primitive's documented resolution of that is the minimum: 260px
    // of legible panel, with the layout above free to decide what to do about
    // a window that cannot hold everything.
    expect(resolveLayoutSize('inspector', DEFAULT_LAYOUT_SETTINGS, { width: 721, height: 720, uiScale: 1 }, 180)).toBe(260);
  });

  it('gives a phone a height from 180px to the smaller of 66% and the 210px reserve', () => {
    expect(SHEET_MIN_HEIGHT_PX).toBe(180);
    expect(SHEET_MAX_VIEWPORT_FRACTION).toBe(0.66);
    expect(SHEET_VIEWPORT_RESERVE_PX).toBe(210);
    // 812: 66% is 535.92, the reserve leaves 602. The fraction binds.
    expect(inspectorRange(PHONE, 0)).toEqual({ min: 180, max: 812 * 0.66 });
    // 500: 66% is 330, the reserve leaves 290. The reserve binds.
    expect(inspectorRange({ width: 375, height: 500, uiScale: 1 }, 0)).toEqual({ min: 180, max: 290 });
  });
});

describe('which field a region resizes through', () => {
  it('sizes the inspector by width on a desktop and by height on a phone', () => {
    expect(sizeFieldFor('inspector', DESKTOP)).toBe('inspectorWidth');
    expect(sizeFieldFor('inspector', PHONE)).toBe('sheetHeight');
  });

  it('gives the navigation no width to drag on a phone, where it is a bottom bar', () => {
    expect(sizeFieldFor('navigation', DESKTOP)).toBe('navigationWidth');
    expect(sizeFieldFor('navigation', PHONE)).toBeUndefined();
  });

  it('gives the metric strip no drag at all, at any tier', () => {
    expect(sizeFieldFor('metrics', DESKTOP)).toBeUndefined();
    expect(sizeFieldFor('metrics', PHONE)).toBeUndefined();
  });
});

describe('what a region is before a player has ever sized it', () => {
  it('opens the navigation with its labels legible', () => {
    expect(DEFAULT_NAVIGATION_WIDTH_PX).toBe(180);
    expect(resolveLayoutSize('navigation', DEFAULT_LAYOUT_SETTINGS, DESKTOP, 180)).toBe(180);
  });

  it('uses the slimmer labelled rail only at Full HD, while respecting a stored width', () => {
    const fullHd = { width: 1920, height: 1080, uiScale: 1 };
    expect(resolveLayoutSize('navigation', DEFAULT_LAYOUT_SETTINGS, fullHd, 0)).toBe(FULL_HD_NAVIGATION_WIDTH_PX);
    expect(resolveLayoutSize('navigation', DEFAULT_LAYOUT_SETTINGS, { ...fullHd, height: 1079 }, 0)).toBe(180);
    expect(resolveLayoutSize('navigation', withLayoutSize(DEFAULT_LAYOUT_SETTINGS, 'navigationWidth', 160), fullHd, 0)).toBe(160);
  });

  it('opens a readable Full HD inspector while respecting a stored width', () => {
    const fullHd = { width: 1920, height: 1080, uiScale: 1 };
    expect(resolveLayoutSize('inspector', DEFAULT_LAYOUT_SETTINGS, fullHd, FULL_HD_NAVIGATION_WIDTH_PX))
      .toBe(FULL_HD_INSPECTOR_WIDTH_PX);
    expect(resolveLayoutSize('inspector', DEFAULT_LAYOUT_SETTINGS, { ...fullHd, height: 1079 }, FULL_HD_NAVIGATION_WIDTH_PX))
      .toBe(DEFAULT_INSPECTOR_WIDTH_PX);
    expect(resolveLayoutSize('inspector', withLayoutSize(DEFAULT_LAYOUT_SETTINGS, 'inspectorWidth', 300), fullHd, FULL_HD_NAVIGATION_WIDTH_PX))
      .toBe(300);
    expect(resolveLayoutSize('inspector', DEFAULT_LAYOUT_SETTINGS, { ...fullHd, uiScale: 2 }, FULL_HD_NAVIGATION_WIDTH_PX * 2))
      .toBe(FULL_HD_INSPECTOR_WIDTH_PX * 2);
  });

  it('opens the inspector at exactly the rail this repository has always drawn', () => {
    // `--hud-rail-panel-width: calc(264px * var(--ui-scale))` in tokens.css, so
    // arriving at this stage moves no pinned desktop measurement.
    const tokens = readFileSync(new URL('../../src/ui/tokens.css', import.meta.url), 'utf8');
    expect(tokens).toContain(`--hud-rail-panel-width: calc(${DEFAULT_INSPECTOR_WIDTH_PX}px * var(--ui-scale))`);
    expect(resolveLayoutSize('inspector', DEFAULT_LAYOUT_SETTINGS, DESKTOP, 180)).toBe(264);
  });

  it('opens a phone sheet as tall as the tier allows, which is not a number it could store', () => {
    expect(resolveLayoutSize('inspector', DEFAULT_LAYOUT_SETTINGS, PHONE, 0)).toBe(Math.round(812 * 0.66));
    expect(resolveLayoutSize('inspector', DEFAULT_LAYOUT_SETTINGS, { width: 375, height: 640, uiScale: 1 }, 0)).toBe(
      Math.round(640 * 0.66),
    );
  });

  it('clamps a stored size into the range the viewport allows without forgetting it', () => {
    const wide = withLayoutSize(DEFAULT_LAYOUT_SETTINGS, 'inspectorWidth', 580);
    expect(resolveLayoutSize('inspector', wide, { width: 1920, height: 1080, uiScale: 1 }, 180)).toBe(580);
    // The same preference on a tablet, where 1024 - 180 - 320 = 524 binds.
    expect(resolveLayoutSize('inspector', wide, TABLET, 180)).toBe(524);
    // And it is still 580 in the record, so the desktop gets it back.
    expect(wide.inspectorWidth).toBe(580);
  });
});

describe('resolving a whole frame', () => {
  it('resolves the navigation first, because its width is the inspector’s ceiling', () => {
    const geometry = resolveHudLayout(DEFAULT_LAYOUT_SETTINGS, TABLET);
    expect(geometry.navigation.size).toBe(180);
    expect(geometry.inspector.range.max).toBe(1024 - 180 - MAP_WIDTH_RESERVE_PX);
  });

  it('hands a folded navigation’s width to the inspector in the same frame', () => {
    const folded = withRegionCollapsed(DEFAULT_LAYOUT_SETTINGS, 'navigation', true);
    const geometry = resolveHudLayout(folded, TABLET);
    expect(geometry.navigationExtent).toBe(0);
    // 1024 - 320 = 704, so with the navigation folded the delivery's ruled
    // 600 is the binding limit again rather than the map's reserve.
    expect(geometry.inspector.range.max).toBe(INSPECTOR_WIDTH_RANGE.max);
  });

  it('reports a folded region as occupying nothing while remembering the size it comes back to', () => {
    const settings = withRegionCollapsed(
      withLayoutSize(DEFAULT_LAYOUT_SETTINGS, 'inspectorWidth', 420),
      'inspector',
      true,
    );
    const geometry = resolveHudLayout(settings, DESKTOP);
    expect(geometry.inspectorExtent).toBe(0);
    // Folding a panel away is not the player choosing a width of zero.
    expect(geometry.inspector.size).toBe(420);
    expect(geometry.inspector.collapsed).toBe(true);
  });

  it('gives a phone no navigation width at all, folded or not', () => {
    expect(resolveHudLayout(DEFAULT_LAYOUT_SETTINGS, PHONE).navigationExtent).toBe(0);
    expect(resolveHudLayout(withRegionCollapsed(DEFAULT_LAYOUT_SETTINGS, 'navigation', true), PHONE).navigationExtent).toBe(0);
  });
});

describe('the three custom properties the stylesheet reads (#529)', () => {
  /*
   * The tier is decided twice -- by `@media (max-width: 720px)` and by this
   * module -- and the two do not land together: CSS switches the instant the
   * window crosses, this module is told by a `resize` event. Every assertion
   * here is about the frame in between, which is where #529 failed.
   */

  it('carries a legal desktop inspector width while the window is still a phone', () => {
    const geometry = resolveHudLayout(DEFAULT_LAYOUT_SETTINGS, PHONE);
    const lengths = layoutCustomProperties(geometry, DEFAULT_LAYOUT_SETTINGS, PHONE);
    /*
     * This was `0` and that is the whole defect: the desktop rules read it the
     * moment the window crossed 720px, so `--hud-rail-panel-width` became 0 and
     * every panel in the rail was 2px wide. Measured on the assembled page at
     * 1024x768: the Rooms panel's status block at y = 1287 against a fold at
     * y = 755, where a settled frame puts it at y = 747.
     */
    expect(lengths.inspectorWidth).toBe(DEFAULT_INSPECTOR_WIDTH_PX);
    expect(lengths.inspectorWidth).toBeGreaterThanOrEqual(INSPECTOR_WIDTH_RANGE.min);
    // The height is the tier the window is actually in, so it is the resolved one.
    expect(lengths.inspectorHeight).toBe(geometry.inspector.size);
  });

  it('carries the player’s own stored width across the tier, not merely a default', () => {
    const settings = withLayoutSize(DEFAULT_LAYOUT_SETTINGS, 'inspectorWidth', 420);
    expect(layoutCustomProperties(resolveHudLayout(settings, PHONE), settings, PHONE).inspectorWidth).toBe(420);
  });

  it('scales an off-tier width with the interface, because the value it stands in for is painted', () => {
    const phoneAt150 = { width: 375, height: 812, uiScale: 1.5 };
    const lengths = layoutCustomProperties(
      resolveHudLayout(DEFAULT_LAYOUT_SETTINGS, phoneAt150),
      DEFAULT_LAYOUT_SETTINGS,
      phoneAt150,
    );
    expect(lengths.inspectorWidth).toBe(DEFAULT_INSPECTOR_WIDTH_PX * 1.5);
  });

  it('still reports nothing for a region the player has folded away', () => {
    const folded = withRegionCollapsed(DEFAULT_LAYOUT_SETTINGS, 'inspector', true);
    expect(layoutCustomProperties(resolveHudLayout(folded, PHONE), folded, PHONE).inspectorWidth).toBe(0);
    const nav = withRegionCollapsed(DEFAULT_LAYOUT_SETTINGS, 'navigation', true);
    expect(layoutCustomProperties(resolveHudLayout(nav, PHONE), nav, PHONE).navigationWidth).toBe(0);
  });

  it('carries a legal phone sheet height while the window is a desktop', () => {
    const geometry = resolveHudLayout(DEFAULT_LAYOUT_SETTINGS, DESKTOP);
    const lengths = layoutCustomProperties(geometry, DEFAULT_LAYOUT_SETTINGS, DESKTOP);
    // It used to be the inspector's *width*, which was legal by luck.
    expect(lengths.inspectorHeight).toBe(DEFAULT_SHEET_HEIGHT_PX);
    expect(lengths.inspectorHeight).toBeGreaterThanOrEqual(SHEET_MIN_HEIGHT_PX);
    expect(lengths.inspectorWidth).toBe(geometry.inspectorExtent);
  });

  it('agrees with the defaults tokens.css ships, so a first frame before any script is the same layout', () => {
    const tokens = readFileSync(new URL('../../src/ui/tokens.css', import.meta.url), 'utf8');
    const declared = (name: string): number => {
      const match = new RegExp(`--hud-${name}:\\s*(\\d+)px`).exec(tokens);
      expect(match, `tokens.css declares no default for --hud-${name}`).not.toBeNull();
      return Number(match![1]);
    };
    expect(declared('inspector-height')).toBe(DEFAULT_SHEET_HEIGHT_PX);
    expect(declared('inspector-width')).toBe(DEFAULT_INSPECTOR_WIDTH_PX);
    expect(declared('navigation-width')).toBe(DEFAULT_NAVIGATION_WIDTH_PX);
  });
});
