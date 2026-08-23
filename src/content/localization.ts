/**
 * Localization keys are logic-independent labels for translatable text.
 * Content definitions reference a `LocalizationKey`, never a literal
 * string label -- so switching or adding a locale never touches gameplay
 * logic or persisted IDs (AGENTS.md: "content definitions belong in data
 * modules"; issue #23: "localization keys separate from logic IDs").
 *
 * There is no bundler-loaded translation system yet -- that belongs to a
 * future UI/localization issue. `resolveLocalizationKey` below resolves
 * against an in-memory default-locale catalog only, enough for headless
 * tests and any current dev UI to show a real label without inventing a
 * translation pipeline prematurely.
 */
export type LocalizationKey = string;

export const DEFAULT_LOCALE = 'en' as const;

export type LocalizationCatalog = ReadonlyMap<LocalizationKey, string>;

export function buildLocalizationCatalog(entries: Readonly<Record<LocalizationKey, string>>): LocalizationCatalog {
  return new Map(Object.entries(entries));
}

/** Falls back to the key itself if unresolved, so a missing translation is visible/debuggable rather than blank. */
export function resolveLocalizationKey(catalog: LocalizationCatalog, key: LocalizationKey): string {
  return catalog.get(key) ?? key;
}
