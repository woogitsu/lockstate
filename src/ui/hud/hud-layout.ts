import {
  type LayoutRegion,
  type LayoutSettings,
  type LayoutSizeField,
  isRegionCollapsed,
} from '../../input/layout-preference';
import { type SeparatorRange, clampSeparatorSize } from '../primitives/resize-separator';
import { HUD_TAB_IDS } from './hud-state';

/**
 * The HUD shell's geometry: which limits each resizable region has, at which
 * device tier, given the viewport it is drawn in (#1159).
 *
 * **Pure arithmetic, no DOM.** The unit suite runs in `node` with no jsdom, so
 * a limit decided inside a listener body is unobservable and therefore ungated
 * -- the argument `readSeparatorKey` and `readNumberFieldEntry` both make for
 * themselves. Every number the direction rules on is asserted here; `hud.ts`
 * then only has to apply what this file returns, and the browser specs prove
 * that the applied value is the painted one.
 *
 * ## The ruled limits, and which of them are the delivery's
 *
 * From `DOKUMENTACJA/03-INTERAKCJE-I-URZADZENIA.md`, verbatim:
 *
 * > - Lewy: 72–180 px.
 * > - Prawy desktop: 260–600 px, z limitem pozostawiającym miejsce na mapę.
 * > - Telefon: wysokość od 180 px do ograniczenia zależnego od ekranu
 * >   (maks. około 66% wysokości i rezerwa 210 px).
 *
 * So 72, 180, 260, 600, 66 % and 210 are ruled. **`MAP_WIDTH_RESERVE_PX` is
 * not**: the delivery says the right panel is bounded *"z limitem
 * pozostawiającym miejsce na mapę"* -- with a limit leaving room for the map --
 * and names no number for it. 320 is this repository's choice and the reason is
 * written at the constant.
 *
 * ## Design pixels, painted pixels, and which of the six numbers scale
 *
 * **The ruled limits above are design pixels at 100 % and are multiplied by
 * `--ui-scale` before anything is clamped to them.** `MAP_WIDTH_RESERVE_PX`,
 * `SHEET_MAX_VIEWPORT_FRACTION` and `SHEET_VIEWPORT_RESERVE_PX` are **not**:
 * they are the screen's share rather than the interface's, and a player asking
 * for larger text is not asking for a smaller map.
 *
 * **This paragraph said the opposite for one commit and the measurement that
 * refuted it is worth keeping.** The first version held every limit unscaled,
 * on the argument that `aria-valuemin` is announced in the unit the player
 * drags in and should read the delivery's own numbers. It is wrong in a way a
 * token test could not see: at 200 % the rail was 264 px holding controls at
 * twice their size, and `app-shell.spec.ts` caught it as the theme control
 * intercepting every press on the interface-scale button at 1280x720
 * (`.hud-chrome-prefs` 264 px wide around two 130 px controls that had been
 * 528 px of room before this stage). `--ui-scale` magnifies the interface; a
 * box whose limits do not magnify with it cannot hold what it is given.
 *
 * So the contract is: a **stored** size is a design pixel, scale-independent,
 * so a preference set on a 100 % desktop still means the same panel at 150 %.
 * A **resolved** size and the range it is clamped to are painted pixels, which
 * is what the separator drags in, what the slider offers and what
 * `aria-valuenow` announces -- all three in the same unit, which is the exit
 * criterion's *"identical limits"*.
 */

/**
 * The width at and below which the HUD is the phone layout: a bottom navigation
 * bar and a bottom sheet rather than two side rails.
 *
 * It is `hud.css`'s own `@media (max-width: 720px)` boundary, not a second
 * opinion about where a phone starts. `tests/unit/hud-layout.test.ts` reads the
 * stylesheet and asserts the two agree, because a geometry module that thought
 * the tier changed at a different width from the stylesheet would hand the
 * inspector a width range while the rail was laid out as a full-width sheet.
 */
export const PHONE_MAX_WIDTH_PX = 720;

/** The delivery's left navigation range: icons alone, to icons with labels. */
export const NAVIGATION_WIDTH_RANGE: SeparatorRange = { min: 72, max: 180 };

/** The delivery's right inspector range on a tablet or desktop. */
export const INSPECTOR_WIDTH_RANGE: SeparatorRange = { min: 260, max: 600 };

/** The delivery's floor under the phone sheet. */
export const SHEET_MIN_HEIGHT_PX = 180;

/** *"maks. około 66% wysokości"* -- the fraction of the viewport a sheet may take. */
export const SHEET_MAX_VIEWPORT_FRACTION = 0.66;

/** *"i rezerwa 210 px"* -- the band of map a phone keeps above the sheet. */
export const SHEET_VIEWPORT_RESERVE_PX = 210;

/**
 * How much width the map keeps between the two rails. **This number is ours,
 * not the delivery's.**
 *
 * 320 px, because that is the narrowest viewport this interface has ever had to
 * be usable at -- `hud.css`'s phone rules are measured at 375 and the world is
 * aimed at with a finger there -- so a desktop that has squeezed the map below
 * a whole phone's width has stopped being a desktop layout and the inspector
 * should give ground instead. It is deliberately a **width** and not a
 * fraction: a fraction would let a 4 K window hand the map 1 000 px it does not
 * need while a 1 024 px one starves it.
 *
 * When the window is too narrow to honour it, the inspector's range comes back
 * inverted and `clampSeparatorSize` resolves that to its **minimum** -- 260 px
 * of legible panel and whatever map is left -- which is the primitive's
 * documented choice and the one that keeps a panel readable rather than
 * crushing it to the remainder.
 */
export const MAP_WIDTH_RESERVE_PX = 320;

/** The width the navigation opens at before a player has ever sized it. */
export const DEFAULT_NAVIGATION_WIDTH_PX = 180;

/**
 * The width the inspector opens at, which is exactly what the rail has always
 * been: `--hud-rail-panel-width` is `264px * var(--ui-scale)` in
 * `src/ui/tokens.css`, and 264 is the unscaled value.
 *
 * Chosen so that arriving at this stage changes no desktop measurement at all.
 * Every pinned panel arithmetic in `app-shell.spec.ts` was taken against a
 * 264 px rail, and a stage whose first frame moved them would make every one of
 * those numbers a question about this change rather than about the panel it
 * names.
 */
export const DEFAULT_INSPECTOR_WIDTH_PX = 264;

/**
 * The height one tab occupies in the vertical rail at 100 %: icon over label,
 * `--tap-target`'s 44 px floor plus the label's own line.
 *
 * **Measured, not derived.** Read off the assembled page at 900x600 and 150 %,
 * where `.hud-tabs__inner` held five tabs in 405 px -- 81 px each, which is 54
 * at 100 %. A sum of tokens was tried first and is wrong by the label's
 * line-height, which is exactly the kind of `calc()` this repository has
 * already found itself unable to keep honest (`hud.css` on the Build panel's
 * floors: "the sums cannot be derived ... so something has to check them").
 * `tests/browser/hud-layout-shell.spec.ts` is what checks it.
 */
export const NAVIGATION_TAB_HEIGHT_PX = 54;

/** The rail's own vertical padding at 100 %, one `--space-3` at each end. */
export const NAVIGATION_RAIL_PADDING_PX = 24;

/**
 * How much of the window the rail may not use: the status strip is measured,
 * and this is the slack left for the rows between it and the middle (the
 * unavailable band, the refusal line, the event band), each of which is `auto`
 * and costs nothing while it is hidden.
 */
export const NAVIGATION_RAIL_SLACK_PX = 24;

export interface LayoutViewport {
  readonly width: number;
  readonly height: number;
  /**
   * `--ui-scale`, the interface magnification the player chose
   * (`src/input/accessibility.ts` owns the six legal steps).
   *
   * Part of the viewport rather than a parameter beside it, because every
   * question this module answers needs both and neither is meaningful without
   * the other: "how wide may the inspector be" has a different answer at
   * 1280x720 and 200 % from the one it has at 1280x720 and 100 %, and a caller
   * that could pass one without the other would eventually pass a stale pair.
   */
  readonly uiScale: number;
}

export function isPhoneLayout(viewport: LayoutViewport): boolean {
  return viewport.width <= PHONE_MAX_WIDTH_PX;
}

/** Where the five sections are laid out. */
export type NavigationPlacement = 'rail' | 'bar';

/**
 * Whether the navigation is the left rail the direction asks for, or the bottom
 * bar this repository has always drawn.
 *
 * **A fit test rather than a breakpoint, and the difference is `--ui-scale`.**
 * A media query cannot ask about the interface scale, and the scale is what
 * decides this: five tabs are 270 px of column at 100 % and 540 px at 200 %,
 * while the window does not grow at all. Measured on the assembled page --
 * 900x600 at 200 % leaves 416 px for 588 px of tabs, and the overflow showed up
 * as `app-shell.spec.ts` reporting a tab covered by its own scroll container,
 * which is #545's containment check refusing exactly what it was written to
 * refuse.
 *
 * Where it does not fit, the bar comes back **and wraps**, which is the
 * behaviour #545 already built and already gates. That is why this is a
 * fallback rather than a defect: the column is the direction's layout and the
 * bar is a working one, and a player at 200 % on a short window gets the
 * second.
 *
 * `reservedHeight` is the status strip's measured height. It is passed in
 * rather than derived, for the reason `NAVIGATION_TAB_HEIGHT_PX` is measured:
 * the strip wraps to two and three rows on rules spread over four media
 * queries, and a sum of them here would be a fourth copy to keep in step.
 */
export function navigationPlacement(viewport: LayoutViewport, reservedHeight: number): NavigationPlacement {
  if (isPhoneLayout(viewport)) return 'bar';
  const available = viewport.height - reservedHeight - NAVIGATION_RAIL_SLACK_PX;
  return available >= navigationRailBlock(viewport) ? 'rail' : 'bar';
}

/**
 * How tall the rail's tab column is: every section's button plus the column's
 * own padding, at the interface scale in force.
 *
 * **Extracted from `navigationPlacement` on 2026-09-19 because a second caller
 * appeared, and the second caller is the reason it is exported at all.** The
 * fit test above asks whether the column fits *the rail*; it has never asked
 * whether the column fits the rail **beside the bottom-left corner**, which
 * shares the middle row with it and is bottom-anchored. With five sections the
 * two cleared each other at every viewport where the corner does not step
 * aside, and `hud.css`'s corner-shift block carries that arithmetic in as many
 * words. A sixth section ends it: measured on the assembled page at 1280x800,
 * the column runs `y = 92.69..420.81` and `.hud-zoom__in` sits at `415..459`,
 * so a press meant for the zoom control landed on a `.ui-tab`.
 *
 * `layout-shell.ts` publishes this as `--hud-navigation-block`, and `hud.css`
 * caps the corner with it inside the one media query where the corner does not
 * move -- so the corner yields its slack (its alerts list is already a scroll
 * container) instead of being covered. **A `calc()` in the stylesheet was the
 * other candidate and is wrong for this repository's own reason**: it would
 * have to write the section count into CSS, and a tally is the sentence shape
 * `docs/AGENT_WORKFLOW.md` §4 says rots first. Here it is `HUD_TAB_IDS.length`,
 * so the next section added moves the cap with it.
 */
export function navigationRailBlock(viewport: LayoutViewport): number {
  const scale = Number.isFinite(viewport.uiScale) && viewport.uiScale > 0 ? viewport.uiScale : 1;
  // `HUD_TAB_IDS.length` rather than five: a tally in a comment is the sentence
  // shape `docs/AGENT_WORKFLOW.md` §4 says rots first, and this one would rot
  // silently into a rail that clips the tab somebody just added.
  return (HUD_TAB_IDS.length * NAVIGATION_TAB_HEIGHT_PX + NAVIGATION_RAIL_PADDING_PX) * scale;
}

/**
 * The navigation's range, which does not depend on the viewport.
 *
 * It is still a function of one, so that every range in this file is asked for
 * the same way and a later rule -- a tier that has no room for labels, say --
 * has somewhere to live that its callers already call.
 */
export function navigationRange(viewport: LayoutViewport): SeparatorRange {
  return scaleRange(NAVIGATION_WIDTH_RANGE, viewport.uiScale);
}

/** A design-pixel range in the painted pixels the player actually drags. */
function scaleRange(range: SeparatorRange, uiScale: number): SeparatorRange {
  const scale = Number.isFinite(uiScale) && uiScale > 0 ? uiScale : 1;
  return { min: range.min * scale, max: range.max * scale };
}

/**
 * The inspector's range: the delivery's 260-600 on a desktop, narrowed by
 * whatever the map and the navigation have already taken.
 *
 * `navigationWidth` is passed in rather than read back out of the settings,
 * because the binding case is a **live drag of the navigation**: widening the
 * left rail has to take the right one's maximum down with it in the same frame,
 * or the two ranges disagree about how much window there is and the map is the
 * one that pays.
 *
 * On a phone this is a height, and the navigation is a bottom bar that takes no
 * width at all, so the parameter is ignored there.
 */
export function inspectorRange(viewport: LayoutViewport, navigationWidth: number): SeparatorRange {
  const scale = Number.isFinite(viewport.uiScale) && viewport.uiScale > 0 ? viewport.uiScale : 1;
  if (isPhoneLayout(viewport)) {
    return {
      min: SHEET_MIN_HEIGHT_PX * scale,
      max: Math.min(
        viewport.height * SHEET_MAX_VIEWPORT_FRACTION,
        viewport.height - SHEET_VIEWPORT_RESERVE_PX,
      ),
    };
  }
  const available = viewport.width - navigationWidth - MAP_WIDTH_RESERVE_PX;
  return { min: INSPECTOR_WIDTH_RANGE.min * scale, max: Math.min(INSPECTOR_WIDTH_RANGE.max * scale, available) };
}

/** Which stored field a region's size lives in at this tier, or none when it does not resize. */
export function sizeFieldFor(region: LayoutRegion, viewport: LayoutViewport): LayoutSizeField | undefined {
  if (region === 'navigation') return isPhoneLayout(viewport) ? undefined : 'navigationWidth';
  if (region === 'inspector') return isPhoneLayout(viewport) ? 'sheetHeight' : 'inspectorWidth';
  // The metric strip folds and does not resize: the direction gives it an arrow
  // and no drag, and inventing one would be a rule this repository made up.
  return undefined;
}

/**
 * The size a region actually has, given what the player has stored and what the
 * viewport allows.
 *
 * The **absent** case is where the three regions differ, and it is why
 * `LayoutSettings`' sizes are optional rather than defaulted (see that file's
 * header): a navigation nobody has sized opens with its labels legible, a rail
 * nobody has sized is exactly the rail this repository has always drawn, and a
 * phone sheet nobody has sized is as tall as the tier lets it be -- which is
 * the only one of the three that cannot be written down as a number, because it
 * is a property of the phone in the player's hand.
 */
export function resolveLayoutSize(
  region: LayoutRegion,
  settings: LayoutSettings,
  viewport: LayoutViewport,
  navigationWidth: number,
): number {
  const range = region === 'navigation' ? navigationRange(viewport) : inspectorRange(viewport, navigationWidth);
  const field = sizeFieldFor(region, viewport);
  if (field === undefined) return clampSeparatorSize(range.max, range);
  const scale = Number.isFinite(viewport.uiScale) && viewport.uiScale > 0 ? viewport.uiScale : 1;
  const stored = settings[field];
  // A stored size is a design pixel; everything below this line is painted.
  if (stored !== undefined) return clampSeparatorSize(stored * scale, range);
  if (field === 'navigationWidth') return clampSeparatorSize(DEFAULT_NAVIGATION_WIDTH_PX * scale, range);
  if (field === 'inspectorWidth') return clampSeparatorSize(DEFAULT_INSPECTOR_WIDTH_PX * scale, range);
  // The phone sheet: as tall as the tier allows until the player says otherwise.
  return clampSeparatorSize(range.max, range);
}

/**
 * The whole geometry of one frame, resolved in the one order the two rails'
 * ranges can be resolved in.
 *
 * The order is load-bearing and is the reason this is one function rather than
 * three call sites: the navigation's width is an **input** to the inspector's
 * maximum, so a caller that resolved them in the other order would size the
 * inspector against a navigation width it was about to change.
 *
 * A collapsed region reports `0` rather than the size it will come back to. The
 * size it will come back to is in the settings, untouched -- folding a panel
 * away is not the player choosing a width of zero, and the two would otherwise
 * be indistinguishable on the next reload.
 */
export interface HudLayoutGeometry {
  readonly phone: boolean;
  /** `'rail'` when the five sections are the left column, `'bar'` when they are the bottom bar. */
  readonly navigationPlacement: NavigationPlacement;
  readonly navigation: { readonly size: number; readonly range: SeparatorRange; readonly collapsed: boolean };
  readonly inspector: { readonly size: number; readonly range: SeparatorRange; readonly collapsed: boolean };
  readonly metricsCollapsed: boolean;
  /** The width or height each rail occupies right now, after its fold. */
  readonly navigationExtent: number;
  readonly inspectorExtent: number;
}

export function resolveHudLayout(
  settings: LayoutSettings,
  viewport: LayoutViewport,
  reservedHeight = 0,
): HudLayoutGeometry {
  const phone = isPhoneLayout(viewport);
  const placement = navigationPlacement(viewport, reservedHeight);
  const navCollapsed = isRegionCollapsed(settings, 'navigation');
  const navSize = resolveLayoutSize('navigation', settings, viewport, 0);
  // A folded navigation has taken its width back, so the inspector may have it
  // -- and so has one that is laid out as a bottom bar rather than a column.
  const navExtent = navCollapsed || placement === 'bar' ? 0 : navSize;
  const inspectorCollapsed = isRegionCollapsed(settings, 'inspector');
  const inspectorSize = resolveLayoutSize('inspector', settings, viewport, navExtent);
  return {
    phone,
    navigationPlacement: placement,
    navigation: { size: navSize, range: navigationRange(viewport), collapsed: navCollapsed },
    inspector: { size: inspectorSize, range: inspectorRange(viewport, navExtent), collapsed: inspectorCollapsed },
    metricsCollapsed: isRegionCollapsed(settings, 'metrics'),
    navigationExtent: navExtent,
    inspectorExtent: inspectorCollapsed ? 0 : inspectorSize,
  };
}

/**
 * The default phone sheet ceiling, which is `tokens.css`'s own
 * `--hud-inspector-height` default: 66 % of an 812 px viewport, the delivery's
 * limit applied to the tallest phone the browser specs visit.
 *
 * It is duplicated here rather than read out of the stylesheet because this
 * module may not touch the DOM, and `tests/unit/hud-layout.test.ts` asserts the
 * two agree -- the same arrangement `DEFAULT_INSPECTOR_WIDTH_PX` already has
 * with `--hud-rail-panel-width`.
 */
export const DEFAULT_SHEET_HEIGHT_PX = 536;

/**
 * The three lengths the stylesheet reads, each resolved for **the tier that
 * reads it** rather than for the tier the window is in right now.
 *
 * ## Why this exists, and the failure that bought it
 *
 * The tier is decided twice and the two decisions do not land together. CSS
 * switches at `@media (max-width: 720px)` the instant the window crosses it;
 * this module's values reach CSS through custom properties that JavaScript
 * writes, and JavaScript is only told about the crossing by a `resize` event.
 * Between the two there is a frame in which the stylesheet is already reading
 * the desktop rules and the variables still hold whatever the phone left
 * behind.
 *
 * `refresh()` used to write `--hud-inspector-width: 0px` on a phone, on the
 * reasonable-looking argument that no phone rule reads it. In that one frame
 * the desktop rules did read it: `.hud__rail` became `2 * --space-3` wide and
 * `--hud-rail-panel-width` became `0`, so every panel in the rail was **2 px
 * wide** and its text wrapped one character per line. Measured on the assembled
 * page at 1024x768 (`tests/browser/hud-layout-shell.spec.ts`, *"no frame paints
 * a rail narrower than the delivery's own floor"*): the Rooms panel's status
 * block ended at **y = 1287** against a fold at y = 755, where a settled frame
 * puts it at y = 747. CI caught it as #529 -- *"the Rooms panel's last block is
 * below its fold with room.canteen selected at 1024x768: it ends at y=1270 in a
 * panel clipped at y=686"* -- on a run whose retained trace shows the variables
 * already corrected by the time the snapshot was taken, which is why it
 * reproduced only under a full suite and never in isolation.
 *
 * So: **every one of the three always carries a value that is legal for its own
 * tier.** An off-tier value is the player's stored preference in painted
 * pixels, clamped to the ruled range alone -- the map reserve needs a width
 * this module does not have while the window is still the other tier, and a
 * width that is merely 4 px stale is a different kind of thing from a width of
 * zero.
 */
export interface HudLayoutCustomProperties {
  readonly navigationWidth: number;
  readonly inspectorWidth: number;
  readonly inspectorHeight: number;
}

export function layoutCustomProperties(
  geometry: HudLayoutGeometry,
  settings: LayoutSettings,
  viewport: LayoutViewport,
): HudLayoutCustomProperties {
  const scale = Number.isFinite(viewport.uiScale) && viewport.uiScale > 0 ? viewport.uiScale : 1;
  const storedOr = (field: LayoutSizeField, fallback: number): number => settings[field] ?? fallback;

  if (geometry.phone) {
    // Off-tier: the widths the desktop rules will read the moment the window
    // crosses 720 px, which may be before this module hears about it.
    const navCollapsed = isRegionCollapsed(settings, 'navigation');
    const inspectorCollapsed = isRegionCollapsed(settings, 'inspector');
    return {
      navigationWidth: navCollapsed
        ? 0
        : clampSeparatorSize(storedOr('navigationWidth', DEFAULT_NAVIGATION_WIDTH_PX) * scale, {
            min: NAVIGATION_WIDTH_RANGE.min * scale,
            max: NAVIGATION_WIDTH_RANGE.max * scale,
          }),
      inspectorWidth: inspectorCollapsed
        ? 0
        : clampSeparatorSize(storedOr('inspectorWidth', DEFAULT_INSPECTOR_WIDTH_PX) * scale, {
            min: INSPECTOR_WIDTH_RANGE.min * scale,
            max: INSPECTOR_WIDTH_RANGE.max * scale,
          }),
      inspectorHeight: geometry.inspector.size,
    };
  }

  return {
    navigationWidth: geometry.navigationExtent,
    inspectorWidth: geometry.inspectorExtent,
    // Off-tier: the ceiling the phone rules will read. It was the inspector's
    // **width** here until #529, which was legal by luck rather than by
    // meaning.
    inspectorHeight: clampSeparatorSize(storedOr('sheetHeight', DEFAULT_SHEET_HEIGHT_PX) * scale, {
      min: SHEET_MIN_HEIGHT_PX * scale,
      max: Number.POSITIVE_INFINITY,
    }),
  };
}
