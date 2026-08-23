/**
 * ICU-lite formatting on `Intl` (ADR 0011): named placeholders and
 * per-key plural forms, with numbers and dates delegated to the platform.
 * A full ICU MessageFormat parser is deliberately not adopted, and
 * deliberately not hand-written.
 */

export type PluralCategory = Intl.LDMLPluralRule;

export type PluralForms = Readonly<Partial<Record<PluralCategory, string>>> & { readonly other: string };

export type MessageParameters = Readonly<Record<string, string | number | boolean>>;

const PLACEHOLDER_SOURCE = '\\{([A-Za-z][A-Za-z0-9_]*)\\}';
const PLACEHOLDER_PATTERN = new RegExp(PLACEHOLDER_SOURCE, 'g');

/**
 * A fresh global regex per call. Shared global regexes carry `lastIndex`
 * state between callers, which produces intermittent, order-dependent
 * misses -- exactly the kind of bug `docs/TESTING.md` forbids depending on.
 */
export function createPlaceholderPattern(): RegExp {
  return new RegExp(PLACEHOLDER_SOURCE, 'g');
}

export interface InterpolationResult {
  readonly text: string;
  /** Placeholders present in the message but absent from the parameters. */
  readonly missingParameters: readonly string[];
}

/**
 * Substitutes `{name}` placeholders. A placeholder with no matching
 * parameter is left visible in the output and reported, rather than
 * silently becoming an empty string: a visible `{count}` in a screenshot
 * is a bug report; a missing word is not.
 */
export function interpolate(template: string, parameters: MessageParameters = {}): InterpolationResult {
  const missing: string[] = [];
  const text = template.replace(PLACEHOLDER_PATTERN, (match, name: string) => {
    const value = parameters[name];
    if (value === undefined) {
      missing.push(name);
      return match;
    }
    return String(value);
  });
  return { text, missingParameters: missing };
}

/**
 * Selects a plural form using the locale's own rules -- never `count === 1`,
 * which is wrong in most languages Lockstate might ship (Polish alone needs
 * `one`/`few`/`many`). `other` is mandatory, so selection always resolves.
 */
export function selectPluralForm(locale: string, count: number, forms: PluralForms): string {
  if (!Number.isFinite(count)) return forms.other;
  const category = new Intl.PluralRules(locale).select(count);
  return forms[category] ?? forms.other;
}

export function formatNumber(locale: string, value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/**
 * Requires an explicit time zone, defaulting to UTC rather than the host's.
 * Inheriting the machine's zone makes output depend on where the code runs,
 * which `docs/TESTING.md` forbids for tests and which would make a server-
 * rendered timestamp disagree with the client's.
 */
export function formatDate(
  locale: string,
  value: Date | number,
  options: Intl.DateTimeFormatOptions = {},
): string {
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...options }).format(value);
}
