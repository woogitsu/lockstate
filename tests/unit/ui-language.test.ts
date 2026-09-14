import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from '../../src/shared/key-value-store';
import {
  DEFAULT_LANGUAGE_SETTINGS,
  LANGUAGE_PREFERENCES,
  LANGUAGE_PREFERENCE_VERSION,
  OFFERED_LOCALES,
  decodeLanguageSettings,
  isLanguagePreference,
  languagePreferenceRequest,
  nextLanguagePreference,
} from '../../src/input/language-preference';
import {
  loadLanguageSettings,
  loadThemeSettings,
  saveLanguageSettings,
  saveThemeSettings,
} from '../../src/input/storage';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import { selectSupportedLocale } from '../../src/services/localization/locale';

/**
 * The language preference, end to end without a browser (#663).
 *
 * The whole of choosing a language is decidable in `node`, and deliberately
 * so: the vocabulary is a pure record, and what a preference *means* is one
 * pure function (`languagePreferenceRequest`) that hands
 * `selectSupportedLocale` a list. Everything a DOM is needed for -- the
 * control, the row it sits in, the reload -- is in
 * `tests/browser/ui-language-picker.spec.ts`.
 *
 * The property this file exists for is the one a stored locale tag alone
 * cannot express, and it is asserted directly below rather than implied: *"the
 * player chose English"* and *"the player has not chosen and their browser
 * says English"* must behave differently when the browser later changes its
 * mind.
 */

function memoryStore(): KeyValueStore {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
  };
}

/** A store that throws on every access, which is what a browser with site data blocked hands over. */
function hostileStore(): KeyValueStore {
  return {
    getItem: () => {
      throw new Error('site data is blocked for this origin');
    },
    setItem: () => {
      throw new Error('site data is blocked for this origin');
    },
  };
}

/** What the composition root does with a preference, in one line, as it does it. */
function resolve(preference: (typeof LANGUAGE_PREFERENCES)[number], browser: readonly string[]): string {
  return selectSupportedLocale(languagePreferenceRequest(preference, browser), OFFERED_LOCALES, DEFAULT_LOCALE);
}

describe('the language preference vocabulary', () => {
  it('offers one value per published locale plus following the browser, and defaults to following it', () => {
    expect(LANGUAGE_PREFERENCES).toEqual(['auto', 'en', 'pl']);
    expect(DEFAULT_LANGUAGE_SETTINGS.preference).toBe('auto');
    // `'auto'` first is what makes the default the first thing a cycle reaches
    // back round to, and what makes a player who has said nothing follow their
    // browser.
    expect(LANGUAGE_PREFERENCES[0]).toBe('auto');
  });

  it('cycles through every preference and back, so one button can offer all three', () => {
    const seen: (typeof LANGUAGE_PREFERENCES)[number][] = [LANGUAGE_PREFERENCES[0]!];
    for (let step = 0; step < LANGUAGE_PREFERENCES.length - 1; step += 1) {
      seen.push(nextLanguagePreference(seen[seen.length - 1]!));
    }
    expect(seen).toEqual([...LANGUAGE_PREFERENCES]);
    expect(nextLanguagePreference(seen[seen.length - 1]!)).toBe(LANGUAGE_PREFERENCES[0]);
  });

  it('recognises exactly its own vocabulary', () => {
    for (const preference of LANGUAGE_PREFERENCES) expect(isLanguagePreference(preference)).toBe(true);
    // A locale tag that is real, and is not published here, is not a
    // preference: it would decode to a picker entry nothing can load.
    expect(isLanguagePreference('de')).toBe(false);
    expect(isLanguagePreference('en-XA')).toBe(false);
    expect(isLanguagePreference(2)).toBe(false);
  });

  it('treats anything it does not recognise as no preference expressed', () => {
    expect(decodeLanguageSettings(undefined)).toBeUndefined();
    expect(decodeLanguageSettings(null)).toBeUndefined();
    expect(decodeLanguageSettings(['pl'])).toBeUndefined();
    expect(decodeLanguageSettings({ version: 99, preference: 'pl' })).toBeUndefined();
    expect(decodeLanguageSettings({ version: LANGUAGE_PREFERENCE_VERSION, preference: 'de' })).toBeUndefined();
    expect(decodeLanguageSettings({ version: LANGUAGE_PREFERENCE_VERSION, preference: 'pl' })).toEqual({
      version: LANGUAGE_PREFERENCE_VERSION,
      preference: 'pl',
    });
  });
});

describe('a chosen language and a negotiated one are different states (#663)', () => {
  const polishFirst = ['pl-PL', 'pl', 'en-GB'];
  const englishOnly = ['en-GB', 'en'];

  it('follows the browser while nothing has been chosen', () => {
    expect(resolve('auto', polishFirst)).toBe('pl');
    expect(resolve('auto', englishOnly)).toBe('en');
  });

  it('ignores the browser once something has been chosen, in both directions', () => {
    // The direction a stored tag alone gets wrong. A player who chose English
    // on a Polish browser must stay in English -- and, the harder half, must
    // stay there when their browser list changes later, which is exactly the
    // event `'auto'` exists to keep following.
    expect(resolve('en', polishFirst)).toBe('en');
    expect(resolve('pl', englishOnly)).toBe('pl');
  });

  it('is what separates "chose English" from "browser said English"', () => {
    // Identical today...
    expect(resolve('auto', englishOnly)).toBe(resolve('en', englishOnly));
    // ...and not identical the moment the browser's list changes, which is the
    // whole reason the preference is not stored as the resolved tag.
    expect(resolve('auto', polishFirst)).toBe('pl');
    expect(resolve('en', polishFirst)).toBe('en');
  });

  it('falls back to the complete bundled catalogue for a browser nothing matches', () => {
    expect(resolve('auto', ['de-DE', 'fr'])).toBe(DEFAULT_LOCALE);
    expect(resolve('auto', [])).toBe(DEFAULT_LOCALE);
  });

  it('hands the negotiator a list of one for a chosen locale and the browser list otherwise', () => {
    // The mechanism, asserted directly: there is no second negotiator, only a
    // different input to the one `selectSupportedLocale` #662 already uses.
    expect(languagePreferenceRequest('auto', polishFirst)).toEqual(polishFirst);
    expect(languagePreferenceRequest('pl', polishFirst)).toEqual(['pl']);
    expect(languagePreferenceRequest('en', polishFirst)).toEqual(['en']);
  });
});

describe('the language is a preference with its own key (constitution article 13)', () => {
  it('round-trips through a key no other setting reads or writes', () => {
    const store = memoryStore();
    expect(loadLanguageSettings(store).preference).toBe('auto');
    expect(saveLanguageSettings(store, { version: LANGUAGE_PREFERENCE_VERSION, preference: 'pl' })).toBe(true);
    expect(loadLanguageSettings(store).preference).toBe('pl');

    // The half article 13 is actually about: a neighbouring preference is
    // untouched by it, and clearing either would not clear the other.
    expect(saveThemeSettings(store, { version: 1, preference: 'dark' })).toBe(true);
    expect(loadLanguageSettings(store).preference).toBe('pl');
    expect(loadThemeSettings(store).preference).toBe('dark');
  });

  it('reports a refused write rather than swallowing it, which no other preference here has to', () => {
    // The theme may switch on a store that refuses and simply not remember.
    // This one may not: the reload is what applies the change, so a refused
    // write has to reach the caller for it to decline to reload.
    const store = hostileStore();
    expect(saveLanguageSettings(store, { version: LANGUAGE_PREFERENCE_VERSION, preference: 'pl' })).toBe(false);
    // And the read still answers, rather than throwing out of a boot path.
    expect(loadLanguageSettings(store).preference).toBe('auto');
  });
});
