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
  const category = pluralRulesFor(locale).select(count);
  return forms[category] ?? forms.other;
}

/**
 * Formatter caches (issue #136).
 *
 * Constructing an `Intl.*` formatter is the expensive half of these APIs --
 * it resolves the locale, negotiates the options and builds the internal
 * pattern -- while `format()`/`select()` on an existing instance is cheap.
 * The instances are immutable and stateless, so one per `(locale, options)`
 * is reused rather than rebuilt. These formatters are used from the HUD's
 * repaint path -- `docs/ARCHITECTURE.md` names the localization runtime as the
 * deliberate synchronous exception there, on condition it stays
 * allocation-cheap -- and one status-strip repaint formats ten values with the
 * occupancy bar showing and eight without (counted in
 * `tests/browser/ui-shell.spec.ts`), at the worker's 250 ms clock cadence.
 *
 * **Nothing here is simulation-visible.** These are presentation strings; no
 * simulation value depends on one, no snapshot carries one, and
 * `src/simulation/**` cannot reach this module at all -- the import-graph
 * contract in `tests/determinism/ambient-nondeterminism-contract.test.ts`
 * rejects every `Intl` use from that side, so the cache cannot become a
 * source of cross-session divergence.
 */
const numberFormatters = new Map<string, Intl.NumberFormat>();
const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const pluralRules = new Map<string, Intl.PluralRules>();

/**
 * A cache keyed on caller-supplied options is a slow leak if it is unbounded
 * (the same shape as the defect #102 fixed), and the callers here draw from a
 * small fixed set of option objects -- so the bound is deliberate rather than
 * accidental. Eviction is insertion order (the oldest key goes), because
 * `Map` already keeps that order and a recency list would cost more than the
 * construction it saves.
 */
const MAX_CACHED_FORMATTERS = 32;

/**
 * A deterministic key for one `(locale, options)` pair, or `undefined` when
 * the options cannot be keyed and the formatter must be built per call.
 *
 * Object identity is unusable: the HUD builds a fresh options literal at each
 * call site, so identity would never hit. Bare `JSON.stringify(options)` is
 * unusable too -- its output follows the object's own insertion order, which
 * belongs to the caller, so `{style, maximumFractionDigits}` and
 * `{maximumFractionDigits, style}` would key two entries for one formatter.
 * Sorting the own enumerable entries by key removes that dependency, in
 * code-unit order (never `localeCompare`, which is itself locale-dependent).
 *
 * `undefined` values are dropped, because `Intl` treats an absent option and
 * an explicitly-`undefined` one identically, so they must not key separately.
 *
 * Every field of `Intl.NumberFormatOptions` and `Intl.DateTimeFormatOptions`
 * is a primitive, so serializing each value is order-independent as well. A
 * non-primitive value is therefore something this function does not know how
 * to key: it returns `undefined` rather than guessing, and the caller pays
 * the construction instead of risking a wrong cache hit.
 */
function formatterCacheKey(locale: string, options: object | undefined): string | undefined {
  if (options === undefined) return locale;
  // `Intl`'s option bags are interfaces with no index signature, so their
  // fields are read through one `Record` view here rather than through a cast
  // at each call site. Nothing below mutates the object.
  const fields = options as Readonly<Record<string, unknown>>;
  const entries: [string, string | number | boolean][] = [];
  for (const [name, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return undefined;
    entries.push([name, value]);
  }
  if (entries.length === 0) return locale;
  entries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  // `\u0000` cannot appear in a well-formed BCP 47 tag, so the locale and the
  // options can never run together into a colliding key.
  return `${locale}\u0000${JSON.stringify(entries)}`;
}

function cachedFormatter<T>(cache: Map<string, T>, key: string | undefined, create: () => T): T {
  if (key === undefined) return create();
  const existing = cache.get(key);
  if (existing !== undefined) return existing;
  const created = create();
  if (cache.size >= MAX_CACHED_FORMATTERS) {
    const oldest = cache.keys().next();
    if (oldest.done !== true) cache.delete(oldest.value);
  }
  cache.set(key, created);
  return created;
}

function pluralRulesFor(locale: string): Intl.PluralRules {
  return cachedFormatter(pluralRules, locale, () => new Intl.PluralRules(locale));
}

export function formatNumber(locale: string, value: number, options?: Intl.NumberFormatOptions): string {
  const key = formatterCacheKey(locale, options);
  return cachedFormatter(numberFormatters, key, () => new Intl.NumberFormat(locale, options)).format(value);
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
  const resolved: Intl.DateTimeFormatOptions = { timeZone: 'UTC', ...options };
  const key = formatterCacheKey(locale, resolved);
  return cachedFormatter(dateFormatters, key, () => new Intl.DateTimeFormat(locale, resolved)).format(value);
}
