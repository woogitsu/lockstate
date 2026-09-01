import type { MessageCatalog, MessageEntry } from '../../src/services/localization/catalog';
import { type PluralCategory, createPlaceholderPattern } from '../../src/services/localization/format';

/**
 * What a **non-default** locale catalogue may and may not do, given the one
 * the game ships as reference (#664).
 *
 * ## Why a second locale cannot simply be held to the default's rule
 *
 * `tests/foundation/localization-key-completeness.test.ts` demands that every
 * declared key resolve to real text. That is right for `en`, which ADR 0011
 * requires to be complete and bundled so the game always has text offline. It
 * is wrong for every other locale: `buildLocaleFallbackChain` walks the chain
 * **per key**, so a partial `pl` falls back message by message to English and
 * a half-translated locale is a valid shipping state.
 *
 * A gate demanding 588 of 588 on day one would do one of two things, both
 * bad: block the work, or make "paste machine output until it is green" the
 * cheapest way past it. So **a missing key is not a finding here.** Every
 * finding below is something that is wrong *whatever* the coverage is.
 *
 * ## The findings, and why each one is a defect rather than a shortfall
 *
 * - **`unknown-key`** -- a translation of a key nothing looks up. Dead weight
 *   at best; at worst a typo, and a typo'd key is invisible without this
 *   check because the correctly-spelled key simply falls back to English and
 *   the screen looks fine.
 * - **`missing-plural-category`** -- a plural entry lacking a category the
 *   locale's own `Intl.PluralRules` requires. English needs `one` and
 *   `other`; Polish needs `one`, `few`, `many` and `other`, so a `pl` entry
 *   carrying only the English pair renders the `other` form for 2, 3 and 4.
 * - **`flattened-plural`** -- the reference counts something and the
 *   candidate answers with one flat string. `Localizer.formatPlural` treats a
 *   plain string as its own `other` form, so this does not fail: it silently
 *   uses one grammatical form for every number.
 * - **`unfillable-placeholder`** -- a placeholder the reference does not
 *   have, so no call site passes it. `interpolate` leaves it visible and
 *   reports it: the player reads `{count}`.
 * - **`dropped-placeholder`** -- a placeholder the reference has and the
 *   candidate does not, so a value the call site computed never reaches the
 *   screen. `{count}` is exempt on a plural entry, because spelling the
 *   number as a word ("one prisoner" -> "jeden więzień") is exactly what
 *   plural forms are for.
 * - **`empty-message`** -- blank text renders as nothing at all, which is
 *   worse than the missing-key behaviour it replaces: an absent key falls
 *   back to English, a blank one does not.
 * - **`plural-rules-unavailable`** -- the host's `Intl` does not know the
 *   locale and resolved it to a different language. Not a defect in the
 *   catalogue; a defect in this audit's ability to judge it, and it must be
 *   loud rather than silently checking Polish against English's two
 *   categories.
 *
 * ## Where this lives, and why not in `src/`
 *
 * It is a gate instrument, like `tests/browser/clipping.ts`. Nothing in the
 * shipped build calls it, and ADR 0044 is the record of what happens when
 * production tiers grow code no production path reaches. If #663's language
 * picker later wants to refuse a junk catalogue at runtime, promoting this
 * into `src/services/localization/` is the right move *then*, with a
 * consumer.
 */

export type LocaleCatalogFinding =
  | { readonly kind: 'unknown-key'; readonly key: string }
  | { readonly kind: 'missing-plural-category'; readonly key: string; readonly category: PluralCategory }
  | { readonly kind: 'flattened-plural'; readonly key: string }
  | { readonly kind: 'unfillable-placeholder'; readonly key: string; readonly parameter: string }
  | { readonly kind: 'dropped-placeholder'; readonly key: string; readonly parameter: string }
  | { readonly kind: 'empty-message'; readonly key: string }
  | { readonly kind: 'plural-rules-unavailable'; readonly key: string; readonly resolved: string };

export type LocaleCatalogFindingKind = LocaleCatalogFinding['kind'];

/**
 * Every kind the audit can produce. A gate asserts that each one is exercised
 * by a control, so a kind cannot be added and then never fire.
 */
export const LOCALE_CATALOG_FINDING_KINDS = [
  'unknown-key',
  'missing-plural-category',
  'flattened-plural',
  'unfillable-placeholder',
  'dropped-placeholder',
  'empty-message',
  'plural-rules-unavailable',
] as const satisfies readonly LocaleCatalogFindingKind[];

export interface LocaleCatalogAudit {
  readonly locale: string;
  readonly referenceLocale: string;
  readonly referenceKeyCount: number;
  /** Keys the candidate carries that the reference also has. The ratchet reads this. */
  readonly translatedKeyCount: number;
  /** Reference keys the candidate leaves to the fallback chain. Not a finding. */
  readonly untranslatedKeys: readonly string[];
  readonly findings: readonly LocaleCatalogFinding[];
}

function formsOf(entry: MessageEntry): readonly string[] {
  return typeof entry === 'string' ? [entry] : Object.values(entry);
}

function placeholdersIn(entry: MessageEntry): ReadonlySet<string> {
  const names = new Set<string>();
  for (const form of formsOf(entry)) {
    for (const match of form.matchAll(createPlaceholderPattern())) names.add(match[1]!);
  }
  return names;
}

/**
 * The categories the locale's own rules can select. Asked of the platform
 * rather than tabulated here: a hand-written table of plural categories per
 * language is a second copy of CLDR that goes stale silently, and `Intl` is
 * the same source `selectPluralForm` selects with at runtime.
 */
function cardinalCategories(locale: string): { readonly categories: readonly PluralCategory[]; readonly resolved: string } {
  const rules = new Intl.PluralRules(locale);
  const options = rules.resolvedOptions();
  return { categories: options.pluralCategories as readonly PluralCategory[], resolved: options.locale };
}

function languageOf(tag: string): string {
  return tag.split('-')[0]!.toLowerCase();
}

export function auditLocaleCatalog(candidate: MessageCatalog, reference: MessageCatalog): LocaleCatalogAudit {
  const findings: LocaleCatalogFinding[] = [];
  const referenceKeys = Object.keys(reference.messages);
  const candidateKeys = Object.keys(candidate.messages);

  const { categories, resolved } = cardinalCategories(candidate.locale);
  const rulesAreForThisLanguage = languageOf(resolved) === languageOf(candidate.locale);

  let translatedKeyCount = 0;

  for (const key of candidateKeys) {
    const entry = candidate.messages[key] as MessageEntry | undefined;
    if (entry === undefined) continue;
    const referenceEntry = reference.messages[key] as MessageEntry | undefined;

    if (referenceEntry === undefined) {
      findings.push({ kind: 'unknown-key', key });
      // Everything below compares against the reference, so there is nothing
      // further to say about a key the reference does not have.
      continue;
    }
    translatedKeyCount += 1;

    for (const form of formsOf(entry)) {
      if (form.trim().length === 0) {
        findings.push({ kind: 'empty-message', key });
        break;
      }
    }

    const isPlural = typeof entry !== 'string';
    const referenceIsPlural = typeof referenceEntry !== 'string';

    if (!rulesAreForThisLanguage && (isPlural || referenceIsPlural)) {
      findings.push({ kind: 'plural-rules-unavailable', key, resolved });
    } else if (isPlural) {
      for (const category of categories) {
        if (entry[category] === undefined) findings.push({ kind: 'missing-plural-category', key, category });
      }
    } else if (referenceIsPlural && categories.length > 1) {
      // A locale with a single category (`ja`) is not flattened by a flat
      // string -- it has one grammatical form and that is the one.
      findings.push({ kind: 'flattened-plural', key });
    }

    const candidatePlaceholders = placeholdersIn(entry);
    const referencePlaceholders = placeholdersIn(referenceEntry);
    // `formatPlural` injects `count` itself, and a plural form is entitled to
    // spell the number as a word instead of printing it.
    const countIsImplicit = isPlural || referenceIsPlural;

    for (const parameter of candidatePlaceholders) {
      if (referencePlaceholders.has(parameter)) continue;
      if (countIsImplicit && parameter === 'count') continue;
      findings.push({ kind: 'unfillable-placeholder', key, parameter });
    }
    for (const parameter of referencePlaceholders) {
      if (candidatePlaceholders.has(parameter)) continue;
      if (countIsImplicit && parameter === 'count') continue;
      findings.push({ kind: 'dropped-placeholder', key, parameter });
    }
  }

  return {
    locale: candidate.locale,
    referenceLocale: reference.locale,
    referenceKeyCount: referenceKeys.length,
    translatedKeyCount,
    untranslatedKeys: referenceKeys.filter((key) => candidate.messages[key] === undefined).sort(),
    findings,
  };
}

/** One line per finding, for a failure message that names what to fix. */
export function describeFindings(audit: LocaleCatalogAudit): readonly string[] {
  return audit.findings.map((finding) => {
    switch (finding.kind) {
      case 'missing-plural-category':
        return `${audit.locale}: ${finding.key} has no "${finding.category}" form, which ${audit.locale} selects`;
      case 'unfillable-placeholder':
        return `${audit.locale}: ${finding.key} uses {${finding.parameter}}, which no call site passes`;
      case 'dropped-placeholder':
        return `${audit.locale}: ${finding.key} drops {${finding.parameter}}, which ${audit.referenceLocale} shows`;
      case 'plural-rules-unavailable':
        return `${audit.locale}: Intl resolved plural rules to "${finding.resolved}" for ${finding.key}`;
      default:
        return `${audit.locale}: ${finding.key} is ${finding.kind}`;
    }
  });
}
