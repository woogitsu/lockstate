import {
  type LayoutRegion,
  type LayoutSettings,
  type LayoutSizeField,
  isRegionCollapsed,
} from '../../input/layout-preference';
import { type SeparatorRange, clampSeparatorSize } from '../primitives/resize-separator';

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
 * ## Why these are unscaled CSS pixels
 *
 * Every length token in `src/ui/tokens.css` is multiplied by `--ui-scale`, and
 * these are not. Two reasons, and the second is the binding one:
 *
 *   1. They are announced. `aria-valuemin` / `aria-valuemax` on the separator
 *      are read out in the unit the player is dragging in, and a range that
 *      said "90 to 225" at 125 % would be a different contract from the one the
 *      direction wrote down.
 *   2. **What they protect is unscaled.** The phone reserve is 210 px of
 *      *screen*, and the map reserve is room for a world a finger can aim at.
 *      Neither gets bigger because the player asked for larger text -- if
 *      anything the opposite -- so multiplying them would spend the scale twice.
 *
 * The panels' own type and padding still scale, which is the behaviour that was
 * wanted: a 180 px navigation at 150 % holds fewer characters, and the player
 * drags it wider or folds it away. `--ui-scale` and this file therefore never
 * fight over the same pixel.
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

export interface LayoutViewport {
  readonly width: number;
  readonly height: number;
}

export function isPhoneLayout(viewport: LayoutViewport): boolean {
  return viewport.width <= PHONE_MAX_WIDTH_PX;
}

/**
 * The navigation's range, which does not depend on the viewport.
 *
 * It is still a function of one, so that every range in this file is asked for
 * the same way and a later rule -- a tier that has no room for labels, say --
 * has somewhere to live that its callers already call.
 */
export function navigationRange(_viewport: LayoutViewport): SeparatorRange {
  return NAVIGATION_WIDTH_RANGE;
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
  if (isPhoneLayout(viewport)) {
    return {
      min: SHEET_MIN_HEIGHT_PX,
      max: Math.min(
        viewport.height * SHEET_MAX_VIEWPORT_FRACTION,
        viewport.height - SHEET_VIEWPORT_RESERVE_PX,
      ),
    };
  }
  const available = viewport.width - navigationWidth - MAP_WIDTH_RESERVE_PX;
  return { min: INSPECTOR_WIDTH_RANGE.min, max: Math.min(INSPECTOR_WIDTH_RANGE.max, available) };
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
  const stored = settings[field];
  if (stored !== undefined) return clampSeparatorSize(stored, range);
  if (field === 'navigationWidth') return clampSeparatorSize(DEFAULT_NAVIGATION_WIDTH_PX, range);
  if (field === 'inspectorWidth') return clampSeparatorSize(DEFAULT_INSPECTOR_WIDTH_PX, range);
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
  readonly navigation: { readonly size: number; readonly range: SeparatorRange; readonly collapsed: boolean };
  readonly inspector: { readonly size: number; readonly range: SeparatorRange; readonly collapsed: boolean };
  readonly metricsCollapsed: boolean;
  /** The width or height each rail occupies right now, after its fold. */
  readonly navigationExtent: number;
  readonly inspectorExtent: number;
}

export function resolveHudLayout(settings: LayoutSettings, viewport: LayoutViewport): HudLayoutGeometry {
  const phone = isPhoneLayout(viewport);
  const navCollapsed = isRegionCollapsed(settings, 'navigation');
  const navSize = resolveLayoutSize('navigation', settings, viewport, DEFAULT_NAVIGATION_WIDTH_PX);
  // A folded navigation has taken its width back, so the inspector may have it.
  const navExtent = navCollapsed || phone ? 0 : navSize;
  const inspectorCollapsed = isRegionCollapsed(settings, 'inspector');
  const inspectorSize = resolveLayoutSize('inspector', settings, viewport, navExtent);
  return {
    phone,
    navigation: { size: navSize, range: navigationRange(viewport), collapsed: navCollapsed },
    inspector: { size: inspectorSize, range: inspectorRange(viewport, navExtent), collapsed: inspectorCollapsed },
    metricsCollapsed: isRegionCollapsed(settings, 'metrics'),
    navigationExtent: navExtent,
    inspectorExtent: inspectorCollapsed ? 0 : inspectorSize,
  };
}
