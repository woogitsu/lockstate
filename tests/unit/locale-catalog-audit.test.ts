import { describe, expect, it } from 'vitest';
import {
  LOCALE_CATALOG_FINDING_KINDS,
  type LocaleCatalogFindingKind,
  auditLocaleCatalog,
  describeFindings,
} from '../helpers/locale-catalog-audit';
import type { MessageEntry } from '../../src/services/localization/catalog';
import { buildMessageCatalog } from '../../src/services/localization/catalog';

/**
 * The non-default-locale audit, one control per finding kind (#664).
 *
 * ## The fixtures are deliberately not Polish
 *
 * Every candidate below is built from synthetic strings, not translations.
 * #664's own warning is that a gate which can only pass by having a complete
 * translation becomes a reason to produce one, and the catalogue is the
 * owner's to approve. The audit judges *shape* -- which keys, which plural
 * categories, which placeholders -- and shape needs no words. `pl` is used as
 * the tag because its four plural categories are what makes the plural rules
 * bite; nothing here claims to be Polish text.
 *
 * ## Both directions, per kind
 *
 * A finding kind that no fixture produces is a branch nobody has seen run,
 * and this repository has shipped exactly that: #644 caught a gate passing
 * 3/3 against a live defect because its fixtures taught it the wrong lesson.
 * So `every kind has a control` below fails if a kind is added without one,
 * and `a partial but well-formed catalogue is clean` fails if the audit has
 * started firing on everything.
 */

const reference = buildMessageCatalog('en', {
  'ui.start': 'Start',
  'ui.greeting': 'Welcome, {name}',
  'ui.prisoners': { one: '{count} prisoner', other: '{count} prisoners' },
  'ui.only-english': 'Fallback only',
});

function candidate(locale: string, messages: Readonly<Record<string, MessageEntry>>) {
  return buildMessageCatalog(locale, messages);
}

/** One fixture per kind, each producing that kind against `reference`. */
const FIXTURES: Readonly<Record<LocaleCatalogFindingKind, () => ReturnType<typeof candidate>>> = {
  // A key `en` does not have: nothing looks it up, and a typo'd key looks
  // exactly like this while the correct spelling falls back to English.
  'unknown-key': () => candidate('pl', { 'ui.strat': 'PL-1' }),
  // `pl` selects one/few/many/other; this carries the English pair.
  'missing-plural-category': () => candidate('pl', { 'ui.prisoners': { one: 'PL-1 {count}', other: 'PL-N {count}' } }),
  // A counted message answered with one flat form.
  'flattened-plural': () => candidate('pl', { 'ui.prisoners': 'PL-FLAT {count}' }),
  // A placeholder no call site passes; `interpolate` leaves it on screen.
  'unfillable-placeholder': () => candidate('pl', { 'ui.greeting': 'PL {name} {oops}' }),
  // A value the call site computed that never reaches the screen.
  'dropped-placeholder': () => candidate('pl', { 'ui.greeting': 'PL-GREETING' }),
  // Blank renders as nothing; an absent key would have fallen back to English.
  'empty-message': () => candidate('pl', { 'ui.start': '   ' }),
  // A well-formed tag `Intl` does not know: it resolves to something else and
  // would silently judge four categories against two.
  'plural-rules-unavailable': () => candidate('zzz', { 'ui.prisoners': { one: 'X-1 {count}', other: 'X-N {count}' } }),
};

describe('auditing a non-default locale catalogue (#664)', () => {
  it('has a control for every kind it can report', () => {
    expect([...LOCALE_CATALOG_FINDING_KINDS].sort()).toEqual(Object.keys(FIXTURES).sort());
  });

  for (const kind of LOCALE_CATALOG_FINDING_KINDS) {
    it(`reports ${kind}`, () => {
      const audit = auditLocaleCatalog(FIXTURES[kind](), reference);
      expect(
        audit.findings.map((finding) => finding.kind),
        describeFindings(audit).join('; '),
      ).toContain(kind);
    });
  }

  it('treats a partial but well-formed catalogue as clean, because partial is a valid shipping state', () => {
    // The negative control, and the rule the whole audit is built around:
    // `buildLocaleFallbackChain` walks per key, so the three untranslated keys
    // here render in English and nothing is wrong with that.
    const partial = candidate('pl', {
      'ui.start': 'PL-START',
      'ui.prisoners': { one: 'PL-1 {count}', few: 'PL-F {count}', many: 'PL-M {count}', other: 'PL-N {count}' },
    });
    const audit = auditLocaleCatalog(partial, reference);

    expect(describeFindings(audit)).toEqual([]);
    expect(audit.translatedKeyCount).toBe(2);
    expect(audit.referenceKeyCount).toBe(4);
    expect(audit.untranslatedKeys).toEqual(['ui.greeting', 'ui.only-english']);
  });

  it('does not demand {count} inside a plural form, which is what plural forms are for', () => {
    // "one prisoner" becomes a word in many languages. Reporting the dropped
    // placeholder here would push a translator to write digits where their
    // language writes a word, so `count` is exempt on a plural entry -- and
    // only there.
    const spelled = candidate('pl', {
      'ui.prisoners': { one: 'PL-ONE-WORD', few: 'PL-F {count}', many: 'PL-M {count}', other: 'PL-N {count}' },
    });
    expect(describeFindings(auditLocaleCatalog(spelled, reference))).toEqual([]);

    // The exemption does not leak to a flat message: `{name}` still has to
    // arrive somewhere.
    const dropped = candidate('pl', { 'ui.greeting': 'PL-GREETING' });
    expect(describeFindings(auditLocaleCatalog(dropped, reference))).toEqual([
      'pl: ui.greeting drops {name}, which en shows',
    ]);
  });

  it('asks Intl for the categories rather than carrying a table of its own', () => {
    // The audit's plural rule is only as good as its idea of what `pl`
    // selects. A hand-written table would be a second copy of CLDR; this
    // pins the platform's answer instead, so a host whose ICU cannot do
    // Polish is visible here rather than as a silently weaker gate.
    expect(new Intl.PluralRules('pl').resolvedOptions().pluralCategories.sort()).toEqual([
      'few',
      'many',
      'one',
      'other',
    ]);
    expect(new Intl.PluralRules('en').resolvedOptions().pluralCategories.sort()).toEqual(['one', 'other']);
  });

  it('does not call a single-category locale flattened', () => {
    // `ja` has one cardinal form, so answering a counted English message with
    // one flat string is correct there and must not be reported.
    expect(new Intl.PluralRules('ja').resolvedOptions().pluralCategories).toEqual(['other']);
    const japanese = candidate('ja', { 'ui.prisoners': 'JA-FLAT {count}' });
    expect(describeFindings(auditLocaleCatalog(japanese, reference))).toEqual([]);
  });
});
