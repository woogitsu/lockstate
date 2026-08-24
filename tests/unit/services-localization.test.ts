import { describe, expect, it } from 'vitest';
import {
  defaultContrabandRegistry,
  defaultItemRegistry,
  defaultObjectRegistry,
  defaultRoomContentRegistry,
  defaultSecurityGradeRegistry,
  defaultStaffRoleRegistry,
} from '../../src/content';
import {
  DEFAULT_LOCALE,
  Localizer,
  type MissingMessageReport,
  PSEUDO_LOCALE,
  buildLocaleFallbackChain,
  buildMessageCatalog,
  buildPseudoLocaleCatalog,
  decodeMessageCatalog,
  defaultMessageCatalogEn,
  formatDate,
  formatNumber,
  loadMessageCatalog,
  normalizeLocaleTag,
  pseudoLocalizeText,
  selectPluralForm,
  selectSupportedLocale,
} from '../../src/services/localization';

const englishCatalog = buildMessageCatalog('en', {
  'ui.start': 'Start',
  'ui.greeting': 'Welcome, {name}',
  'ui.prisoners': { one: '{count} prisoner', other: '{count} prisoners' },
  'ui.only-english': 'Fallback only',
});

const polishCatalog = buildMessageCatalog('pl', {
  'ui.start': 'Rozpocznij',
  'ui.prisoners': { one: '{count} więzień', few: '{count} więźniów', many: '{count} więźniów', other: '{count} więźnia' },
});

const brazilianCatalog = buildMessageCatalog('pt-BR', { 'ui.start': 'Começar' });
const portugueseCatalog = buildMessageCatalog('pt', { 'ui.greeting': 'Bem-vindo, {name}' });

describe('locale tags', () => {
  it.each([
    ['en', 'en'],
    ['PT-br', 'pt-BR'],
    ['zh-hant-tw', 'zh-Hant-TW'],
    ['  fr  ', 'fr'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeLocaleTag(input)).toBe(expected);
  });

  it.each(['', 'english', 'e', 'en-US-POSIX-extra', 'en-!!'])('rejects %s', (input) => {
    expect(normalizeLocaleTag(input)).toBeUndefined();
  });

  it('builds a most-specific-first chain ending at the default locale', () => {
    expect(buildLocaleFallbackChain('pt-BR')).toEqual(['pt-BR', 'pt', 'en']);
    expect(buildLocaleFallbackChain('en')).toEqual(['en']);
    expect(buildLocaleFallbackChain('zh-Hant-TW')).toEqual(['zh-Hant-TW', 'zh-Hant', 'zh', 'en']);
  });

  it('picks the best supported locale for a preference list', () => {
    expect(selectSupportedLocale(['pt-PT', 'pt-BR'], ['en', 'pt'])).toBe('pt');
    expect(selectSupportedLocale(['de-DE'], ['en', 'pl'])).toBe('en');
    expect(selectSupportedLocale(['pl'], ['en', 'pl'])).toBe('pl');
  });
});

describe('message catalogs', () => {
  it('rejects a catalog with an invalid locale or shape rather than partially loading it', () => {
    expect(decodeMessageCatalog({ version: 1, locale: 'not a locale', messages: {} }).ok).toBe(false);
    expect(decodeMessageCatalog({ version: 2, locale: 'en', messages: {} }).ok).toBe(false);
    expect(decodeMessageCatalog({ version: 1, locale: 'en', messages: { 'ui.x': { one: 'a' } } }).ok).toBe(false);
  });

  it('refuses a fetched catalog that declares a different locale than requested', async () => {
    const result = await loadMessageCatalog({ load: async () => englishCatalog }, 'pl');
    expect(result).toMatchObject({ ok: false, locale: 'pl' });
  });

  it('reports a loader failure instead of throwing into the caller', async () => {
    const result = await loadMessageCatalog(
      {
        load: async () => {
          throw new Error('network down');
        },
      },
      'pl',
    );
    expect(result).toMatchObject({ ok: false, message: 'network down' });
  });

  it('loads and normalizes a valid catalog', async () => {
    const result = await loadMessageCatalog({ load: async () => brazilianCatalog }, 'pt-br');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.catalog.locale).toBe('pt-BR');
  });
});

describe('localizer', () => {
  it('resolves from the requested locale first', () => {
    const localizer = new Localizer({ locale: 'pl', catalogs: [englishCatalog, polishCatalog] });
    expect(localizer.format('ui.start')).toBe('Rozpocznij');
  });

  it('falls back per key, not per catalog', () => {
    const localizer = new Localizer({ locale: 'pt-BR', catalogs: [englishCatalog, portugueseCatalog, brazilianCatalog] });
    expect(localizer.format('ui.start')).toBe('Começar');
    expect(localizer.format('ui.greeting', { name: 'Ana' })).toBe('Bem-vindo, Ana');
    expect(localizer.format('ui.only-english')).toBe('Fallback only');
    expect(localizer.fallbackChain()).toEqual(['pt-BR', 'pt', 'en']);
  });

  it('returns the key itself for a missing message and reports it', () => {
    const reports: MissingMessageReport[] = [];
    const localizer = new Localizer({
      locale: 'pl',
      catalogs: [englishCatalog, polishCatalog],
      onMissingKey: (report) => reports.push(report),
    });

    expect(localizer.format('ui.nonexistent')).toBe('ui.nonexistent');
    expect(localizer.has('ui.nonexistent')).toBe(false);
    expect(reports).toEqual([
      { key: 'ui.nonexistent', requestedLocale: 'pl', chain: ['pl', 'en'], kind: 'missing-key' },
    ]);
  });

  it('leaves an unfilled placeholder visible and reports it', () => {
    const reports: MissingMessageReport[] = [];
    const localizer = new Localizer({
      locale: 'en',
      catalogs: [englishCatalog],
      onMissingKey: (report) => reports.push(report),
    });

    expect(localizer.format('ui.greeting')).toBe('Welcome, {name}');
    expect(reports[0]).toMatchObject({ kind: 'missing-parameter', parameters: ['name'] });
  });

  it('selects plural forms with the locale rules, not an English one/other guess', () => {
    const localizer = new Localizer({ locale: 'pl', catalogs: [englishCatalog, polishCatalog] });
    expect(localizer.formatPlural('ui.prisoners', 1)).toBe('1 więzień');
    expect(localizer.formatPlural('ui.prisoners', 3)).toBe('3 więźniów');
    expect(localizer.formatPlural('ui.prisoners', 25)).toBe('25 więźniów');
  });

  it('uses the resolving locale rules when a message falls back', () => {
    const localizer = new Localizer({ locale: 'fr', catalogs: [englishCatalog] });
    expect(localizer.formatPlural('ui.prisoners', 1)).toBe('1 prisoner');
    expect(localizer.formatPlural('ui.prisoners', 4)).toBe('4 prisoners');
  });

  it('treats a plain string entry as its own other-form', () => {
    const localizer = new Localizer({ locale: 'en', catalogs: [englishCatalog] });
    expect(localizer.formatPlural('ui.start', 3)).toBe('Start');
  });

  it('formats numbers and dates in the active locale, with an explicit time zone', () => {
    const localizer = new Localizer({ locale: 'pl', catalogs: [polishCatalog] });
    // Normalizes the non-breaking group separator CLDR uses for `pl`.
    expect(localizer.formatNumber(1_234_567.5).replace(/\s/g, ' ')).toBe('1 234 567,5');
    expect(formatNumber('en', 1_234_567.5)).toBe('1,234,567.5');
    // Fixed instant: 2026-08-23T00:30:00Z. A host in UTC+2 would render the
    // 23rd locally; pinning UTC keeps the assertion host-independent.
    expect(formatDate('en', Date.UTC(2026, 7, 23, 0, 30), { dateStyle: 'short' })).toBe('8/23/26');
    expect(formatDate('en', Date.UTC(2026, 7, 23, 0, 30), { timeZone: 'Pacific/Auckland', dateStyle: 'short' })).toBe('8/23/26');
  });

  it('selects the other form for a non-finite count rather than throwing', () => {
    expect(selectPluralForm('en', Number.NaN, { one: 'one', other: 'many' })).toBe('many');
  });
});

/**
 * Issue #136: the formatters are cached per `(locale, options)`.
 *
 * A cache is hard to assert without asserting elapsed time, which
 * `docs/BENCHMARKING.md` and `docs/TESTING.md` both forbid. So these tests
 * assert the *observable* consequence instead -- how many times the platform
 * constructor runs -- by counting constructions through a `Proxy` with a
 * `construct` trap. The proxy forwards to the real `Intl` implementation, so
 * every case also asserts the formatted output: a cache that returns the
 * wrong formatter would pass a call-count assertion on its own.
 *
 * The caches are module-level and live for the whole file, so each case uses
 * its own locale tag and warms the entry it is about to count. Anything else
 * would make a case's result depend on which case ran before it.
 */
describe('formatter caching (#136)', () => {
  interface IntlConstructionCounts {
    numberFormat: number;
    dateTimeFormat: number;
    pluralRules: number;
  }

  function countingIntl<T>(run: () => T): { readonly value: T; readonly counts: IntlConstructionCounts } {
    const counts: IntlConstructionCounts = { numberFormat: 0, dateTimeFormat: 0, pluralRules: 0 };
    const originals = {
      NumberFormat: Intl.NumberFormat,
      DateTimeFormat: Intl.DateTimeFormat,
      PluralRules: Intl.PluralRules,
    };

    // `defineProperty` rather than assignment: TypeScript's lib declares
    // `Intl.PluralRules` read-only, while the specification makes every `Intl`
    // constructor writable and configurable. The alternative would be a cast
    // that hides which of the three is being replaced.
    const install = (name: 'NumberFormat' | 'DateTimeFormat' | 'PluralRules', value: unknown): void => {
      Object.defineProperty(Intl, name, { value, writable: true, configurable: true, enumerable: false });
    };

    install(
      'NumberFormat',
      new Proxy(originals.NumberFormat, {
        construct: (target, args: readonly unknown[]) => {
          counts.numberFormat += 1;
          return Reflect.construct(target, args);
        },
      }),
    );
    install(
      'DateTimeFormat',
      new Proxy(originals.DateTimeFormat, {
        construct: (target, args: readonly unknown[]) => {
          counts.dateTimeFormat += 1;
          return Reflect.construct(target, args);
        },
      }),
    );
    install(
      'PluralRules',
      new Proxy(originals.PluralRules, {
        construct: (target, args: readonly unknown[]) => {
          counts.pluralRules += 1;
          return Reflect.construct(target, args);
        },
      }),
    );

    try {
      return { value: run(), counts };
    } finally {
      install('NumberFormat', originals.NumberFormat);
      install('DateTimeFormat', originals.DateTimeFormat);
      install('PluralRules', originals.PluralRules);
    }
  }

  it('counts a construction, so the counter itself is not vacuous', () => {
    const { counts } = countingIntl(() => new Intl.NumberFormat('en').format(1));
    expect(counts.numberFormat).toBe(1);
  });

  it('builds one number formatter for repeated calls with the same locale and options', () => {
    formatNumber('en-GB', 1);
    const { value, counts } = countingIntl(() => [
      formatNumber('en-GB', 1_000),
      formatNumber('en-GB', 2_000),
      formatNumber('en-GB', 3_000),
      formatNumber('en-GB', 4_000),
    ]);
    expect(value).toEqual(['1,000', '2,000', '3,000', '4,000']);
    expect(counts.numberFormat).toBe(0);
  });

  it('keys on the options rather than on the options object, whatever order they were written in', () => {
    // Two literals with the same options in the opposite order. `JSON.stringify`
    // on the raw object would key these separately; the sorted key does not.
    formatNumber('de-AT', 0.5, { style: 'percent', maximumFractionDigits: 0 });
    const { value, counts } = countingIntl(() =>
      [
        formatNumber('de-AT', 0.5, { maximumFractionDigits: 0, style: 'percent' }),
        formatNumber('de-AT', 0.25, { style: 'percent', maximumFractionDigits: 0 }),
        // Normalizes the non-breaking space CLDR puts before the percent sign
        // for `de-AT`, exactly as the `pl` grouping assertion above does.
      ].map((text) => text.replace(/\s/g, ' ')),
    );
    expect(value).toEqual(['50 %', '25 %']);
    expect(counts.numberFormat).toBe(0);
  });

  it('treats an explicitly-undefined option as an absent one, as Intl does', () => {
    formatNumber('en-CA', 1);
    const { value, counts } = countingIntl(() => formatNumber('en-CA', 1_500, { style: undefined }));
    expect(value).toBe('1,500');
    expect(counts.numberFormat).toBe(0);
  });

  it('keys different options separately, so a percent is never formatted as a plain number', () => {
    const { value, counts } = countingIntl(() => [
      formatNumber('en-IE', 0.5),
      formatNumber('en-IE', 0.5, { style: 'percent', maximumFractionDigits: 0 }),
    ]);
    expect(value).toEqual(['0.5', '50%']);
    expect(counts.numberFormat).toBe(2);
  });

  it('bounds the cache, so a caller with unbounded options cannot grow it without limit', () => {
    // More distinct option sets than the cache holds. The earliest entries are
    // therefore evicted, and formatting with the first one again has to build a
    // formatter -- which is the observable difference between a bounded cache
    // and a leak.
    // 40 distinct option sets: `minimumIntegerDigits` alone is capped at 21 by
    // the `Intl` specification, so the pair is what makes every key different.
    const optionSets = Array.from({ length: 40 }, (_, index) => ({
      minimumIntegerDigits: (index % 20) + 1,
      maximumFractionDigits: index < 20 ? 0 : 1,
    }));
    for (const options of optionSets) formatNumber('en-NZ', 1, options);
    const first = optionSets[0];
    expect(first).toBeDefined();
    const { value, counts } = countingIntl(() => formatNumber('en-NZ', 1, first));
    expect(value).toBe('1');
    expect(counts.numberFormat).toBe(1);
  });

  it('builds one date formatter per locale and options, and keeps the time zone part of the key', () => {
    const instant = Date.UTC(2026, 7, 23, 0, 30);
    formatDate('en-GB', instant, { dateStyle: 'short' });
    formatDate('en-GB', instant, { timeZone: 'Pacific/Auckland', dateStyle: 'short' });
    const { value, counts } = countingIntl(() => [
      formatDate('en-GB', instant, { dateStyle: 'short' }),
      formatDate('en-GB', instant, { timeZone: 'Pacific/Auckland', dateStyle: 'short' }),
    ]);
    // The same instant in two zones, which is also what proves the two keys did
    // not collapse into one.
    expect(value).toEqual(['23/08/2026', '23/08/2026']);
    expect(counts.dateTimeFormat).toBe(0);
  });

  it('builds one plural-rules instance per locale', () => {
    const forms = { one: 'one', few: 'few', many: 'many', other: 'other' } as const;
    selectPluralForm('pl-PL', 1, forms);
    const { value, counts } = countingIntl(() => [
      selectPluralForm('pl-PL', 1, forms),
      selectPluralForm('pl-PL', 3, forms),
      selectPluralForm('pl-PL', 25, forms),
    ]);
    expect(value).toEqual(['one', 'few', 'many']);
    expect(counts.pluralRules).toBe(0);
  });
});

describe('pseudo-locale', () => {
  const pseudo = buildPseudoLocaleCatalog(englishCatalog);

  it('accents text, expands it and brackets it so truncation is visible', () => {
    const text = pseudoLocalizeText('Start');
    expect(text.startsWith('⟦')).toBe(true);
    expect(text.endsWith('⟧')).toBe(true);
    expect(text).toContain('Šţářţ');
    expect(text.length).toBeGreaterThan('Start'.length + 2);
  });

  it('preserves placeholders byte-for-byte so interpolation still works', () => {
    const localizer = new Localizer({ locale: PSEUDO_LOCALE, catalogs: [englishCatalog, pseudo] });
    const greeting = localizer.format('ui.greeting', { name: 'Ana' });
    expect(greeting).toContain('Ana');
    expect(greeting).not.toContain('{name}');
    expect(pseudoLocalizeText('Welcome, {name}')).toContain('{name}');
  });

  it('covers every key and every plural form of the source catalog', () => {
    expect(Object.keys(pseudo.messages).sort()).toEqual(Object.keys(englishCatalog.messages).sort());
    const prisoners = pseudo.messages['ui.prisoners'];
    expect(typeof prisoners).toBe('object');
    if (typeof prisoners === 'object') {
      expect(prisoners.one).toContain('{count}');
      expect(prisoners.other).toContain('{count}');
    }
  });

  it('leaves a hard-coded string unaccented, which is exactly how it is detected', () => {
    const localizer = new Localizer({ locale: PSEUDO_LOCALE, catalogs: [englishCatalog, pseudo] });
    expect(localizer.format('ui.start')).not.toBe('Start');
  });
});

describe('stable ids stay language-independent', () => {
  const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });

  const registries = [
    ['room', defaultRoomContentRegistry],
    ['object', defaultObjectRegistry],
    ['staff role', defaultStaffRoleRegistry],
    ['item', defaultItemRegistry],
    ['contraband', defaultContrabandRegistry],
    ['security grade', defaultSecurityGradeRegistry],
  ] as const;

  it.each(registries)('every %s definition resolves its nameKey in the default catalog', (_label, registry) => {
    const entries = registry.all();
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(localizer.has(entry.nameKey), `${entry.id} has no default-locale message`).toBe(true);
      expect(localizer.format(entry.nameKey)).not.toBe(entry.nameKey);
    }
  });

  it.each(registries)('every %s id is ASCII and distinct from its translated label', (_label, registry) => {
    for (const entry of registry.all()) {
      expect(entry.id).toMatch(/^[a-z0-9][a-z0-9.-]*$/);
      expect(entry.id).not.toBe(localizer.format(entry.nameKey));
    }
  });
});
