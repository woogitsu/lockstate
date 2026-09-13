/**
 * The player's theme preference, and the vocabulary a stored one is checked
 * against (#1157).
 *
 * **Three values, not two, and that is what makes "follow the system" a
 * preference rather than an absence.** A boolean `dark` cannot distinguish
 * "the player asked for the light theme" from "the player has not said", and
 * the difference is behavioural: the first must ignore a system that later
 * switches to dark, the second must follow it. So the stored value is one of
 * `'system' | 'light' | 'dark'`, and resolving it against the system is
 * `src/ui/theme.ts`'s job.
 *
 * **Its own record and its own storage key** -- constitution article 13, which
 * the owner accepted on 2026-09-13 (ADR 0112 decision 1): a preference is not
 * part of the save, and resetting it resets nothing else. It is deliberately
 * *not* a field of `AccessibilitySettings`, even though that record also holds
 * display preferences: a player clearing their theme would otherwise clear
 * their interface scale and their reduced-motion setting with it.
 *
 * This module holds no DOM reference at all. `src/input/` is where the
 * vocabulary lives because that is where the other persisted settings records
 * live and where `storage.ts` can read them without `src/input/` learning
 * about `src/ui/`.
 */

export const THEME_PREFERENCE_VERSION = 1 as const;

/**
 * The themes `tokens.css` can actually paint, by the `data-theme` value that
 * selects each. A resolved theme is always one of these two -- `'system'` is a
 * preference, never a theme.
 */
export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

/**
 * What a player may choose. `'system'` first because it is the default: a
 * player who has expressed no preference gets the one that follows their
 * device.
 */
export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export interface ThemeSettings {
  readonly version: typeof THEME_PREFERENCE_VERSION;
  readonly preference: ThemePreference;
}

export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  version: THEME_PREFERENCE_VERSION,
  preference: 'system',
};

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value);
}

/**
 * Decodes a stored record, treating anything it does not recognise as "no
 * preference expressed" rather than as an error.
 *
 * The same shape as `decodeAccessibilitySettings`: a version that does not
 * match, a field of the wrong type, or a preference outside the vocabulary all
 * produce `undefined`, and the caller falls back to the default. A theme is
 * the least important thing in the tree to get right and the worst thing to
 * crash a boot over.
 */
export function decodeThemeSettings(input: unknown): ThemeSettings | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;
  const record = input as Record<string, unknown>;
  if (record.version !== THEME_PREFERENCE_VERSION || !isThemePreference(record.preference)) return undefined;
  return { version: THEME_PREFERENCE_VERSION, preference: record.preference };
}

/**
 * The theme a preference means, given what the device asks for.
 *
 * `prefersDark` is passed in rather than read here, for the reason
 * `applyUiScale` takes its root element as a parameter: a browser access at
 * module scope is a boot failure waiting for a hostile environment (issue
 * #199), and a pure function is one a `node` test can drive through all six
 * combinations without a DOM.
 */
export function resolveTheme(preference: ThemePreference, prefersDark: boolean): Theme {
  if (preference === 'system') return prefersDark ? 'dark' : 'light';
  return preference;
}
