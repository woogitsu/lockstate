import type { LocalizationKey } from '../content/localization';

/**
 * Every string the language control renders (#663).
 *
 * Shaped like `src/ui/theme-messages.ts`, and in the same `display.` namespace
 * for the same reason: this is page chrome. It projects no prison state, it is
 * not in `HudViewModel`, and what it changes is a device preference rather
 * than anything the simulation has an opinion about.
 *
 * ## The language names are endonyms, and that is a decision rather than a
 * translation convenience
 *
 * `english` and `polish` below resolve to **`English`** and **`Polski`** in
 * *every* catalogue, byte for byte. A picker that names languages in the
 * *current* interface language is unusable to exactly the player who needs it:
 * somebody who cannot read English is handed a list of English words and asked
 * to find their own language in it. Naming each language in itself -- the
 * endonym -- is the convention that works, because the one entry a player is
 * looking for is the one entry they can read whatever the page is currently
 * in.
 *
 * They still go through the catalogue rather than being string literals here,
 * for a reason that is measured rather than stylistic:
 * `tests/browser/pseudo-locale-sweep.spec.ts`'s *"no hard-coded English
 * reaches the page outside document.title and `<html lang>`"* fails on any run
 * of two or more ASCII letters that did not come out of `Localizer.format`.
 * A literal `'English'` in this file would be that, and the only way to ship
 * it would be to add a third exemption to that test -- weakening a gate to
 * make room for a string, which is the trade this repository does not make.
 *
 * What holds them identical across catalogues is
 * `tests/foundation/second-locale-contract.test.ts`, which compares the value
 * of each endonym key in every audited catalogue against the default one. A
 * translator who "translates" `display.language.polish` to `Polish` in the
 * English catalogue fails that test rather than shipping a picker a Polish
 * speaker cannot use.
 */
export const LANGUAGE_MESSAGE_KEY = {
  /** The small-caps legend above the row, and the group's accessible name. */
  region: 'display.language.region',
  /**
   * Follow whatever the browser's language list asks for.
   *
   * It names the resolved language in a `{language}` parameter rather than
   * standing alone, because "Automatic" by itself tells a player nothing about
   * what they are currently reading -- and assembling that from two fragments
   * in code is what `docs/LOCALIZATION.md`'s authoring checklist forbids. One
   * message with one placeholder is the shape that survives word order
   * changing between languages.
   */
  automatic: 'display.language.automatic',
  /** English, named in English. See this module's docblock on endonyms. */
  english: 'display.language.english',
  /** Polish, named in Polish. See this module's docblock on endonyms. */
  polish: 'display.language.polish',
  /**
   * The `title` on the one button, which is what says the button *does*
   * something -- and, here, that it does something abrupt.
   *
   * The button's accessible name is its own content (the language it is on),
   * so this is a tooltip beside that name rather than an `aria-label`, which
   * would replace it. The same arrangement as `display.theme.cycle`, for the
   * same reason.
   */
  cycle: 'display.language.cycle',
} as const satisfies Readonly<Record<string, LocalizationKey>>;

export type LanguageMessageKey = (typeof LANGUAGE_MESSAGE_KEY)[keyof typeof LANGUAGE_MESSAGE_KEY];

export const LANGUAGE_MESSAGE_KEYS: readonly LanguageMessageKey[] = Object.values(LANGUAGE_MESSAGE_KEY);
