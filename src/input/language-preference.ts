/**
 * The player's language preference, and the vocabulary a stored one is checked
 * against (#663).
 *
 * **Three values rather than two, for the reason `theme-preference.ts` has
 * three**: a stored locale tag alone cannot distinguish *"the player chose
 * English"* from *"the player has not chosen and their browser asked for
 * English"*, and the difference is behavioural. A player who chose English
 * must keep English when they later add Polish to their browser's language
 * list; a player who chose nothing must follow it. So `'auto'` is a real
 * value, not the absence of one, and resolving it against the browser's list
 * is the composition root's job.
 *
 * **Why a locale tag is a settings value here and not only in
 * `src/services/localization/`.** `src/input/` is where every other persisted
 * preference's vocabulary lives, and where `storage.ts` can read it without
 * `src/input/` learning about `src/ui/`. The tags in `OFFERED_LOCALES` are
 * *data* -- they are never rendered, never compared against translated text,
 * and never reach a save payload -- which is the same footing `THEMES` is on.
 *
 * This module holds no DOM reference and imports nothing at all.
 */

export const LANGUAGE_PREFERENCE_VERSION = 1 as const;

/**
 * The locales a player may pick by name, newest last.
 *
 * **Pinned to what the application actually publishes**, by
 * `tests/foundation/second-locale-contract.test.ts`: this list must equal the
 * default locale plus every key of `CATALOG_CHUNKS` in `src/main.ts`. A locale
 * a player can load and cannot pick is a delivery route nobody can reach; a
 * locale offered here and published nowhere is a picker entry that would fall
 * back to English silently, which is exactly the half-switch #663 exists to
 * forbid.
 *
 * `en` first because it is the bundled default and the one that needs no
 * download.
 */
export const OFFERED_LOCALES = ['en', 'pl'] as const;
export type OfferedLocale = (typeof OFFERED_LOCALES)[number];

/**
 * What a player may choose. `'auto'` first because it is the default: a player
 * who has expressed no preference gets the one that follows their browser.
 */
export const LANGUAGE_PREFERENCES = ['auto', ...OFFERED_LOCALES] as const;
export type LanguagePreference = (typeof LANGUAGE_PREFERENCES)[number];

export interface LanguageSettings {
  readonly version: typeof LANGUAGE_PREFERENCE_VERSION;
  readonly preference: LanguagePreference;
}

export const DEFAULT_LANGUAGE_SETTINGS: LanguageSettings = {
  version: LANGUAGE_PREFERENCE_VERSION,
  preference: 'auto',
};

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return typeof value === 'string' && (LANGUAGE_PREFERENCES as readonly string[]).includes(value);
}

/**
 * Decodes a stored record, treating anything it does not recognise as "no
 * preference expressed" rather than as an error.
 *
 * The same shape as `decodeThemeSettings`, and for the same reason: a version
 * that does not match, a field of the wrong type, or a preference outside the
 * vocabulary all produce `undefined`, and the caller falls back to `'auto'`.
 * That fallback is the one that cannot be wrong -- it asks the browser, which
 * is what a player with no stored preference gets anyway.
 *
 * A locale retired from `OFFERED_LOCALES` therefore decodes to `undefined` and
 * the player returns to following their browser, rather than being pinned to a
 * catalogue that is no longer published.
 */
export function decodeLanguageSettings(input: unknown): LanguageSettings | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;
  const record = input as Record<string, unknown>;
  if (record.version !== LANGUAGE_PREFERENCE_VERSION || !isLanguagePreference(record.preference)) return undefined;
  return { version: LANGUAGE_PREFERENCE_VERSION, preference: record.preference };
}

/**
 * The preference after this one, wrapping -- `auto` -> `en` -> `pl` -> `auto`.
 *
 * Beside the vocabulary rather than in the control, exactly as
 * `nextThemePreference` sits beside `THEME_PREFERENCES`: which values exist,
 * and what "the next one" means, are properties of the record. A control that
 * decided for itself could offer a value the decoder rejects.
 */
export function nextLanguagePreference(preference: LanguagePreference): LanguagePreference {
  const index = LANGUAGE_PREFERENCES.indexOf(preference);
  return LANGUAGE_PREFERENCES[(index + 1) % LANGUAGE_PREFERENCES.length] ?? 'auto';
}

/**
 * The ordered preference list to resolve a locale from, given what the player
 * chose and what their browser asks for.
 *
 * Pure, and deliberately *not* a locale: it hands back the list
 * `selectSupportedLocale` already takes, so no second negotiator exists.
 * `'auto'` is the browser's own list; a chosen locale is a list of one, which
 * is what makes the choice immune to the browser's list changing later.
 */
export function languagePreferenceRequest(
  preference: LanguagePreference,
  browserPreferences: readonly string[],
): readonly string[] {
  return preference === 'auto' ? browserPreferences : [preference];
}
