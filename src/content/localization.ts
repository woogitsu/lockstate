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

/**
 * The plural categories CLDR defines, restated here rather than imported.
 *
 * `Intl.LDMLPluralRule` is the same six names, and
 * `src/services/localization/format.ts`'s `PluralForms` is the same shape --
 * but this module is the one the docblock above promises stays
 * dependency-free, so it repeats the names instead of reaching for the
 * runtime's. `tests/foundation/polish-plural-forms-contract.test.ts` asserts
 * the two shapes are assignable to each other in both directions, so the
 * repetition cannot drift into a difference.
 */
export type LocalizationPluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

/**
 * Per-key plural forms, with `other` mandatory so selection always resolves.
 *
 * ## Why this type exists (#1093-adjacent; the blocker three docblocks name)
 *
 * Until this type existed, `LocalizationCatalog` was
 * `ReadonlyMap<LocalizationKey, string>`, and three places in this tree
 * recorded the same consequence independently:
 *
 * - `src/ui/save-panel-messages.ts`, on `save.list.item`: *"`{count}` is
 *   interpolated rather than pluralized, and that is a real limitation rather
 *   than an oversight ... only `src/services/localization/default-catalog.ts`
 *   carries `PluralForms`, and that file is the trusted-services layer's."*
 * - `src/services/localization/pl-catalog.ts`, on why the Polish catalogue
 *   authors no plural forms: *"every counted message in `locale-pl.ts` is
 *   written to be correct at every count with no plural forms instead."*
 * - `tests/foundation/second-locale-contract.test.ts`, on the counted
 *   messages it pins: *"a translator **cannot fix it from the catalogue**,
 *   because a locale may only supply the forms the key already has: a flat
 *   key has no `few` slot to fill."*
 *
 * Polish is the locale that makes it matter: `Intl.PluralRules('pl')` puts
 * **1** in `one`, **2-4 and 22-24** in `few`, **0 and 5+** in `many`, and
 * **fractions** in `other`, so a counted noun needs three written forms where
 * English needs two.
 *
 * **This widens what a catalogue may hold; it migrates nothing.** Every entry
 * in both shipped content catalogues is still a plain string, and a plain
 * string is still treated as its own `other` form by
 * `Localizer.formatPlural`, so adding forms to a key later stays a catalogue
 * change rather than a call-site change.
 */
export type LocalizationPluralForms = Readonly<Partial<Record<LocalizationPluralCategory, string>>> & {
  readonly other: string;
};

/** One catalogue value: a whole sentence, or the forms one count selects between. */
export type LocalizationEntry = string | LocalizationPluralForms;

export type LocalizationCatalog = ReadonlyMap<LocalizationKey, LocalizationEntry>;

export function buildLocalizationCatalog(
  entries: Readonly<Record<LocalizationKey, LocalizationEntry>>,
): LocalizationCatalog {
  return new Map(Object.entries(entries));
}

/**
 * Falls back to the key itself if unresolved, so a missing translation is
 * visible/debuggable rather than blank.
 *
 * A plural entry resolves to its `other` form. This function has no count to
 * select with -- its callers are the headless ones (`src/simulation/`'s room
 * and event-log labels) that have a key and no player in front of them -- and
 * `other` is the form `Localizer.format` already returns for a plural entry,
 * so the two unnumbered paths agree rather than disagreeing silently.
 */
export function resolveLocalizationKey(catalog: LocalizationCatalog, key: LocalizationKey): string {
  const entry = catalog.get(key);
  if (entry === undefined) return key;
  return typeof entry === 'string' ? entry : entry.other;
}
