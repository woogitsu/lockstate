import { DEFAULT_LOCALE } from '../../content/localization';

/**
 * Locale tags are data, not display text: they are normalized once, at the
 * boundary, so every lookup, `Intl` call and catalog key downstream sees
 * the same canonical form (ADR 0011).
 */
export { DEFAULT_LOCALE };

/** Pseudo-locale used for layout/hard-coded-string testing; never offered to players. */
export const PSEUDO_LOCALE = 'en-XA' as const;

const LANGUAGE_PATTERN = /^[A-Za-z]{2,3}$/;
const SCRIPT_PATTERN = /^[A-Za-z]{4}$/;
const REGION_PATTERN = /^([A-Za-z]{2}|\d{3})$/;

/**
 * Canonicalizes casing per BCP 47 conventions (`pt-BR`, `zh-Hant-TW`) and
 * rejects anything that is not a plain language[-script][-region] tag.
 * Extensions and private-use subtags are refused rather than passed
 * through: nothing in this design uses them, and accepting them would make
 * catalog keys ambiguous.
 */
export function normalizeLocaleTag(tag: string): string | undefined {
  const parts = tag.trim().split('-').filter((part) => part !== '');
  if (parts.length === 0 || parts.length > 3) return undefined;

  const [language, second, third] = parts;
  if (language === undefined || !LANGUAGE_PATTERN.test(language)) return undefined;
  const normalized: string[] = [language.toLowerCase()];

  const applySubtag = (subtag: string | undefined, allowScript: boolean): boolean => {
    if (subtag === undefined) return true;
    if (allowScript && SCRIPT_PATTERN.test(subtag)) {
      normalized.push(`${subtag[0]!.toUpperCase()}${subtag.slice(1).toLowerCase()}`);
      return true;
    }
    if (REGION_PATTERN.test(subtag)) {
      normalized.push(subtag.toUpperCase());
      return true;
    }
    return false;
  };

  if (!applySubtag(second, true)) return undefined;
  if (!applySubtag(third, false)) return undefined;
  return normalized.join('-');
}

/**
 * `pt-BR` -> `['pt-BR', 'pt', 'en']`. Lookup walks this chain *per key*,
 * so a partially translated locale falls back message by message instead
 * of abandoning the whole catalog.
 */
export function buildLocaleFallbackChain(tag: string, defaultLocale: string = DEFAULT_LOCALE): readonly string[] {
  const normalized = normalizeLocaleTag(tag);
  const normalizedDefault = normalizeLocaleTag(defaultLocale) ?? DEFAULT_LOCALE;
  const chain: string[] = [];

  if (normalized !== undefined) {
    const parts = normalized.split('-');
    for (let length = parts.length; length >= 1; length -= 1) {
      chain.push(parts.slice(0, length).join('-'));
    }
  }
  if (!chain.includes(normalizedDefault)) chain.push(normalizedDefault);
  return chain.filter((entry, index) => chain.indexOf(entry) === index);
}

/**
 * Picks the best available locale for a player's preference list (e.g.
 * `navigator.languages`), falling back to the default rather than to
 * "whatever the browser said" -- an unsupported locale must resolve to a
 * complete catalog, never to a half-empty one.
 */
export function selectSupportedLocale(
  requested: readonly string[],
  supported: readonly string[],
  defaultLocale: string = DEFAULT_LOCALE,
): string {
  const supportedSet = new Set(
    supported.map((tag) => normalizeLocaleTag(tag)).filter((tag): tag is string => tag !== undefined),
  );
  for (const tag of requested) {
    for (const candidate of buildLocaleFallbackChain(tag, defaultLocale)) {
      if (supportedSet.has(candidate)) return candidate;
    }
  }
  return normalizeLocaleTag(defaultLocale) ?? DEFAULT_LOCALE;
}
