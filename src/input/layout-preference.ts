/**
 * The player's HUD layout preference: which regions are folded away and how
 * wide or tall the two resizable ones are (#1159, stage 3 of the 2026-09-13
 * identity rollout).
 *
 * **Its own record and its own storage key**, which is the whole of
 * constitution article 13 -- *"Szerokość panelu, zwinięcie i motyw są
 * preferencjami interfejsu. Nie zmieniają zegara, ekonomii, geometrii ani
 * schematu zapisu gry. Mają oddzielne klucze pamięci i niezależny reset."*
 * ("Panel width, collapse and theme are interface preferences. They do not
 * change the clock, the economy, the geometry or the save schema. They have
 * separate memory keys and an independent reset.") So this is neither a field
 * of `AccessibilitySettings` nor of `ThemeSettings` and never reaches
 * `SAVE_SCHEMA_VERSION`: a player resetting their layout keeps their interface
 * scale, their theme and their prison.
 *
 * `src/input/theme-preference.ts` is the module this one is shaped after, for
 * the reason that one gives: the vocabulary of a persisted setting lives in
 * `src/input/` because that is where `storage.ts` can read it without
 * `src/input/` learning about `src/ui/`.
 *
 * ## Why every size is optional, rather than defaulted to a number here
 *
 * Two of the three ranges depend on the viewport (`src/ui/hud/hud-layout.ts`
 * derives them), so a default written here would be a number this module
 * cannot check and the layout would have to re-clamp anyway. More importantly
 * the three have genuinely different "not chosen yet" answers -- the rail keeps
 * the width it has always had, the navigation opens with its labels legible,
 * and the phone sheet is simply as tall as the viewport allows -- and only an
 * absent field can mean "whatever the layout thinks", which is what makes
 * **Reset** a `delete` rather than a write of three magic numbers.
 *
 * A stored size is validated as a finite number and nothing more. It is not
 * range-checked here on purpose: the legal range moves with the viewport, so a
 * width that is legal on a desktop and illegal on the phone the player next
 * opens the game on is not a corrupt record, and refusing it would silently
 * reset a preference every time the window changed.
 */

export const LAYOUT_PREFERENCE_VERSION = 1 as const;

/**
 * The three regions the direction gives a collapse arrow to
 * (`DOKUMENTACJA/03-INTERAKCJE-I-URZADZENIA.md`: *"Strzałki zwijają lewą
 * nawigację, prawy inspektor i górny pasek metryk"*).
 *
 * Ordered as they are read on screen, left to right and then down, so a stored
 * list and a freshly built one compare equal member by member.
 */
export const LAYOUT_REGIONS = ['navigation', 'inspector', 'metrics'] as const;
export type LayoutRegion = (typeof LAYOUT_REGIONS)[number];

export interface LayoutSettings {
  readonly version: typeof LAYOUT_PREFERENCE_VERSION;
  /** Always in `LAYOUT_REGIONS` order, so equal preferences compare equal. */
  readonly collapsed: readonly LayoutRegion[];
  /** The left navigation's width in CSS px, absent until the player sizes it. */
  readonly navigationWidth?: number;
  /** The right inspector's width in CSS px on a tablet or desktop. */
  readonly inspectorWidth?: number;
  /** The inspector's height in CSS px on a phone, where it is a bottom sheet. */
  readonly sheetHeight?: number;
}

export const DEFAULT_LAYOUT_SETTINGS: LayoutSettings = {
  version: LAYOUT_PREFERENCE_VERSION,
  collapsed: [],
};

export function isLayoutRegion(value: unknown): value is LayoutRegion {
  return typeof value === 'string' && (LAYOUT_REGIONS as readonly string[]).includes(value);
}

/**
 * A stored list of collapsed regions, canonicalised.
 *
 * Unknown members are dropped rather than refused, and the reason is the one
 * the file header gives for not range-checking a size: a record written by a
 * later build that has a fourth region is not corrupt, and throwing the whole
 * preference away would cost the player the two regions this build does
 * understand. Duplicates collapse and the order is `LAYOUT_REGIONS`', so the
 * decoded value is the same object shape the reducer produces.
 */
function decodeCollapsed(value: unknown): readonly LayoutRegion[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return LAYOUT_REGIONS.filter((region) => value.includes(region));
}

/** A stored size: a finite number, or absent. Anything else is "not stored". */
function decodeSize(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return value;
}

/**
 * Decodes a stored record, treating anything unrecognised as "no preference
 * expressed".
 *
 * The same shape as `decodeThemeSettings`: a version that does not match or a
 * `collapsed` that is not a list produces `undefined` and the caller falls back
 * to the default. A layout is the least important thing in the tree to get
 * right and the worst thing to crash a boot over -- issue #199's lesson, which
 * `readJson` in `storage.ts` already applies one layer out.
 */
export function decodeLayoutSettings(input: unknown): LayoutSettings | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;
  const record = input as Record<string, unknown>;
  if (record.version !== LAYOUT_PREFERENCE_VERSION) return undefined;
  const collapsed = decodeCollapsed(record.collapsed);
  if (collapsed === undefined) return undefined;
  const navigationWidth = decodeSize(record.navigationWidth);
  const inspectorWidth = decodeSize(record.inspectorWidth);
  const sheetHeight = decodeSize(record.sheetHeight);
  return {
    version: LAYOUT_PREFERENCE_VERSION,
    collapsed,
    // Spread rather than written as `undefined`: `exactOptionalPropertyTypes`
    // is on, so an absent size has to be an absent property -- and "absent"
    // is what carries the meaning here (see the header).
    ...(navigationWidth === undefined ? {} : { navigationWidth }),
    ...(inspectorWidth === undefined ? {} : { inspectorWidth }),
    ...(sheetHeight === undefined ? {} : { sheetHeight }),
  };
}

export function isRegionCollapsed(settings: LayoutSettings, region: LayoutRegion): boolean {
  return settings.collapsed.includes(region);
}

/** Every region folded away at once -- what the Layout menu's "map only" asks for. */
export function isMapOnly(settings: LayoutSettings): boolean {
  return LAYOUT_REGIONS.every((region) => isRegionCollapsed(settings, region));
}

/**
 * A preference with one region's fold set, returning the **same object** when
 * nothing changes.
 *
 * The identity contract `hudShellReducer` already keeps, for the same reason:
 * a caller can skip a repaint and a storage write with `!==` rather than a
 * deep comparison, and a key held down on a separator therefore does not write
 * to `localStorage` sixty times a second.
 */
export function withRegionCollapsed(
  settings: LayoutSettings,
  region: LayoutRegion,
  collapsed: boolean,
): LayoutSettings {
  if (isRegionCollapsed(settings, region) === collapsed) return settings;
  const next = LAYOUT_REGIONS.filter((id) => (id === region ? collapsed : isRegionCollapsed(settings, id)));
  return { ...settings, collapsed: next };
}

/** Which stored size a region owns, or `undefined` for one that does not resize. */
export type LayoutSizeField = 'navigationWidth' | 'inspectorWidth' | 'sheetHeight';

export function withLayoutSize(settings: LayoutSettings, field: LayoutSizeField, size: number): LayoutSettings {
  if (!Number.isFinite(size)) return settings;
  if (settings[field] === size) return settings;
  return { ...settings, [field]: size };
}

/**
 * Everything back to "not chosen", which is what the Layout menu's **Reset**
 * restores.
 *
 * It returns `DEFAULT_LAYOUT_SETTINGS` itself rather than a copy of it, so a
 * caller comparing against the default with `===` gets the answer it expects,
 * and it clears the sizes by *dropping the fields* rather than by writing
 * numbers -- which is the half that makes a reset survive a later change to
 * what a default width is.
 */
export function resetLayoutSettings(): LayoutSettings {
  return DEFAULT_LAYOUT_SETTINGS;
}
