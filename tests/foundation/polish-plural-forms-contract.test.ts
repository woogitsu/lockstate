import { describe, expect, it } from 'vitest';
import type { MessageCatalog, MessageEntry } from '../../src/services/localization/catalog';
import { buildMessageCatalog, messageCatalogFromLocalizationCatalog } from '../../src/services/localization/catalog';
import { defaultMessageCatalogEn } from '../../src/services/localization/default-catalog';
import { messageCatalogPl } from '../../src/services/localization/pl-catalog';
import { type PluralCategory, type PluralForms, selectPluralForm } from '../../src/services/localization/format';
import { Localizer } from '../../src/services/localization/localizer';
import {
  type LocalizationEntry,
  type LocalizationPluralForms,
  buildLocalizationCatalog,
  resolveLocalizationKey,
} from '../../src/content/localization';
import type { HudLocalizer } from '../../src/ui/hud/view-model';

/**
 * Polish plural forms: the mechanism, and what a migrated key owes.
 *
 * ## What this gate is for, and what it deliberately is not
 *
 * Until the change that added this file, two mechanical things stopped any
 * counted HUD or save-panel message from carrying real Polish forms, and
 * **neither of them was about permission**. Three docblocks recorded them
 * independently:
 *
 * - the catalogue type. `src/ui/save-panel-messages.ts` on `save.list.item`:
 *   *"`src/content/default-locale-en.ts` is a `Record<string, string>`, so a
 *   per-key plural form cannot be authored there at all"*.
 * - the HUD's port. `src/services/localization/pl-catalog.ts`: *"`Localizer.format`
 *   reads `entry.value.other` for a plural entry, and the HUD's `HudLocalizer`
 *   exposes `format` and not `formatPlural`"*.
 *
 * `LocalizationPluralForms` answers the first and `HudLocalizer.formatPlural`
 * answers the second. This file gates both, plus the rules a key must satisfy
 * **once it is migrated**.
 *
 * ## It is not a completeness gate, on purpose
 *
 * #664's rule -- *"Do not make a gate that can only pass by having a complete
 * translation, and then complete the translation to make the gate pass"* --
 * applies here more sharply than anywhere, because plural forms are exactly
 * the kind of thing a gate could demand and an agent could then supply. So
 * nothing below requires any key to be migrated. Every assertion is of the
 * form *if* a key carries forms, *then* it carries the ones its locale
 * selects between -- which fails on a half-migrated key and stays silent on
 * an unmigrated one.
 *
 * The one counting assertion is a **floor at today's two**
 * (`save-slots.available`, `save-slots.over-capacity`), which exists so the
 * rules above are never vacuously true against a catalogue with no plural
 * entry left in it.
 */

/**
 * The categories `Intl.PluralRules('pl')` can select, and therefore the
 * forms a Polish plural entry must carry.
 *
 * `other` is the one an author's instinct gets wrong: in Polish it is the
 * **fraction** form (*1,5 slotu*), not the 5-and-up form, which is `many`.
 * `pl-catalog.ts`'s own docblock says so beside the two entries that get it
 * right.
 */
const POLISH_REQUIRED_CATEGORIES: readonly PluralCategory[] = ['one', 'few', 'many', 'other'];

/** English selects between exactly these two. */
const ENGLISH_REQUIRED_CATEGORIES: readonly PluralCategory[] = ['one', 'other'];

/**
 * The counts the hard cases live at, for both locales.
 *
 * 12 and 112 are the trap: they end in 2 and are `many` in Polish, not `few`,
 * because the teens are excluded. 22 is `few` and 25 is `many`. Hand-rolled
 * modulo arithmetic gets one of those wrong roughly every time it is written,
 * which is why nothing in this tree hand-rolls it.
 */
const COUNTS = [0, 1, 2, 5, 12, 22, 25, 101, 112] as const;

function pluralEntries(catalog: MessageCatalog): readonly (readonly [string, PluralForms])[] {
  return Object.entries(catalog.messages).filter(
    (entry): entry is [string, PluralForms] => typeof entry[1] !== 'string',
  );
}

describe('a Polish plural entry carries every form Polish selects between', () => {
  it('is measured against a catalogue that has plural entries in it', () => {
    // The control. Every assertion below is "if a key has forms, then ...",
    // which an entirely flat catalogue satisfies vacuously.
    expect(
      pluralEntries(messageCatalogPl).length,
      'no Polish plural entry is left, so the rules in this file assert nothing',
    ).toBeGreaterThanOrEqual(2);
    expect(
      pluralEntries(defaultMessageCatalogEn).length,
      'no English plural entry is left, so the reference side asserts nothing',
    ).toBeGreaterThanOrEqual(2);
  });

  it('has no Polish plural entry missing one, few, many or other', () => {
    const incomplete = pluralEntries(messageCatalogPl)
      .map(([key, forms]) => ({ key, missing: POLISH_REQUIRED_CATEGORIES.filter((c) => forms[c] === undefined) }))
      .filter((row) => row.missing.length > 0)
      .map((row) => `${row.key}: missing ${row.missing.join(', ')}`);

    expect(
      incomplete,
      'Intl.PluralRules("pl") selects one (1), few (2-4, 22-24), many (0, 5+) and other (fractions): ' +
        'a form it can select and the entry does not carry silently falls back to `other`, which in Polish is the fraction form',
    ).toEqual([]);
  });

  it('has no English plural entry missing one or other', () => {
    const incomplete = pluralEntries(defaultMessageCatalogEn)
      .map(([key, forms]) => ({ key, missing: ENGLISH_REQUIRED_CATEGORIES.filter((c) => forms[c] === undefined) }))
      .filter((row) => row.missing.length > 0)
      .map((row) => `${row.key}: missing ${row.missing.join(', ')}`);

    expect(incomplete).toEqual([]);
  });

  it('has no Polish plural entry whose forms are all the same string', () => {
    // A completeness check alone is passable by copying one sentence into
    // four slots, which is the flat string it replaced wearing a costume.
    const undifferentiated = pluralEntries(messageCatalogPl)
      .filter(([, forms]) => new Set(POLISH_REQUIRED_CATEGORIES.map((c) => forms[c])).size === 1)
      .map(([key]) => key);

    expect(
      undifferentiated,
      'four identical forms is a flat string with extra steps: if the sentence really does not inflect, leave it flat',
    ).toEqual([]);
  });
});

describe('a key migrated in English is migrated in Polish too', () => {
  it('has no reference plural key answered by a flat Polish string', () => {
    const flattened = pluralEntries(defaultMessageCatalogEn)
      .map(([key]) => key)
      .filter((key) => {
        const entry = messageCatalogPl.messages[key] as MessageEntry | undefined;
        return entry !== undefined && typeof entry === 'string';
      });

    expect(
      flattened,
      'a flat Polish string answering a counted reference key renders one grammatical shape for every number: ' +
        'author the forms, or leave the key flat in English too',
    ).toEqual([]);
  });
});

describe('selection is Intl.PluralRules, not arithmetic', () => {
  /** One probe entry per category, so the selected form names the category it came from. */
  const probe: PluralForms = { zero: 'zero', one: 'one', two: 'two', few: 'few', many: 'many', other: 'other' };

  it('picks what Intl.PluralRules picks, for Polish and for English', () => {
    for (const locale of ['pl', 'en'] as const) {
      const rules = new Intl.PluralRules(locale);
      for (const count of COUNTS) {
        expect(selectPluralForm(locale, count, probe), `${locale} at ${count}`).toBe(rules.select(count));
      }
    }
  });

  it('puts the Polish teens in many and the plain twenties in few', () => {
    // Stated as literals as well as against `Intl`, so a platform whose ICU
    // data disagreed would fail here rather than agreeing with itself.
    const expected: Readonly<Record<number, PluralCategory>> = {
      0: 'many',
      1: 'one',
      2: 'few',
      5: 'many',
      12: 'many',
      22: 'few',
      25: 'many',
      101: 'many',
      112: 'many',
    };
    for (const count of COUNTS) {
      expect(selectPluralForm('pl', count, probe), `pl at ${count}`).toBe(expected[count]);
    }
    expect(selectPluralForm('pl', 1.5, probe), 'a fraction is `other` in Polish, which is why `other` is not the 5+ form').toBe(
      'other',
    );
  });

  it('leaves English at one and other', () => {
    expect(selectPluralForm('en', 1, probe)).toBe('one');
    for (const count of COUNTS.filter((c) => c !== 1)) {
      expect(selectPluralForm('en', count, probe), `en at ${count}`).toBe('other');
    }
  });

  it('selects on the locale the message resolved in, not the one requested', () => {
    // An English fallback inside a Polish page must use English rules, or it
    // asks for a `few` the fallback text does not have.
    const en = buildMessageCatalog('en', { 'probe.only-en': { one: 'one dog', other: 'dogs' } });
    const pl = buildMessageCatalog('pl', {});
    const localizer = new Localizer({ locale: 'pl', catalogs: [en, pl] });
    expect(localizer.formatPlural('probe.only-en', 2)).toBe('dogs');
    expect(localizer.formatPlural('probe.only-en', 1)).toBe('one dog');
  });
});

describe('a content catalogue can hold plural forms, end to end', () => {
  /**
   * The mechanism proof. Before `LocalizationPluralForms` this test could not
   * be written: `buildLocalizationCatalog` took `Record<string, string>`, so
   * the first line below would not compile.
   */
  const forms: LocalizationPluralForms = {
    one: '{count} więzień czeka',
    few: '{count} więźniów czeka',
    many: '{count} więźniów czeka na miejsce',
    other: '{count} więźnia czeka',
  };

  it('carries a plural entry from src/content through to a selected form', () => {
    const content = buildLocalizationCatalog({ 'probe.waiting': forms, 'probe.flat': 'płaski' });
    const catalog = messageCatalogFromLocalizationCatalog('pl', content);
    const localizer = new Localizer({ locale: 'pl', catalogs: [catalog] });

    expect(localizer.formatPlural('probe.waiting', 1)).toBe('1 więzień czeka');
    expect(localizer.formatPlural('probe.waiting', 2)).toBe('2 więźniów czeka');
    expect(localizer.formatPlural('probe.waiting', 5)).toBe('5 więźniów czeka na miejsce');
    expect(localizer.formatPlural('probe.flat', 5)).toBe('płaski');
  });

  it('renders a plural entry the same way through every unnumbered path', () => {
    // `resolveLocalizationKey` (headless, `src/simulation/`'s label lookups)
    // and `Localizer.format` (a call site that forgot the count) must not
    // disagree about what a plural entry says when nobody supplied a number.
    const content = buildLocalizationCatalog({ 'probe.waiting': forms });
    const localizer = new Localizer({ locale: 'pl', catalogs: [messageCatalogFromLocalizationCatalog('pl', content)] });

    expect(resolveLocalizationKey(content, 'probe.waiting')).toBe(forms.other);
    expect(localizer.format('probe.waiting', { count: 3 })).toBe('3 więźnia czeka');
  });

  it('still answers an unresolved key with the key itself', () => {
    const content = buildLocalizationCatalog({});
    expect(resolveLocalizationKey(content, 'probe.absent')).toBe('probe.absent');
  });

  it('keeps the content-side and runtime plural shapes assignable in both directions', () => {
    // The two types are declared separately -- `src/content/` is
    // dependency-free by contract -- so their agreement is asserted rather
    // than enforced by an import.
    const runtime: PluralForms = forms;
    const contentSide: LocalizationPluralForms = runtime;
    const entry: LocalizationEntry = contentSide;
    expect(typeof entry === 'string' ? entry : entry.other).toBe(forms.other);
  });
});

describe('the HUD port can select a form', () => {
  it('is satisfied by the real Localizer', () => {
    const catalog = buildMessageCatalog('pl', {
      'probe.slots': {
        one: '{count} wolny slot',
        few: '{count} wolne sloty',
        many: '{count} wolnych slotów',
        other: '{count} wolnego slotu',
      },
    });
    // The structural check: a `Localizer` is assignable to the port, which is
    // what `src/main.ts` relies on when it hands one to the HUD.
    const port: HudLocalizer = new Localizer({ locale: 'pl', catalogs: [catalog] });

    expect(port.formatPlural('probe.slots', 1)).toBe('1 wolny slot');
    expect(port.formatPlural('probe.slots', 3)).toBe('3 wolne sloty');
    expect(port.formatPlural('probe.slots', 12)).toBe('12 wolnych slotów');
    expect(port.formatPlural('probe.slots', 22)).toBe('22 wolne sloty');
  });
});
