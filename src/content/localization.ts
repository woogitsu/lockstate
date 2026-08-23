/**
 * Localization keys are logic-independent labels for translatable text.
 * Content definitions reference a `LocalizationKey`, never a literal
 * string label -- so switching or adding a locale never touches gameplay
 * logic or persisted IDs (AGENTS.md: "content definitions belong in data
 * modules"; issue #23: "localization keys separate from logic IDs").
 *
 * This module stays the stable-ID-side primitive: the key type plus a
 * dependency-free flat lookup, enough for headless tests and any dev UI to
 * show a real label. The actual localization runtime -- fallback chains,
 * plurals, `Intl` formatting, catalog loading and the pseudo-locale --
 * lives in `src/services/localization/` (issue #36, ADR 0011) and consumes
 * these keys. Content modules deliberately do not depend on it, so the
 * catalogs stay importable from anywhere.
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
