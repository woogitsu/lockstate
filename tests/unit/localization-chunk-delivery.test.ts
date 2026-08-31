import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LOCALE,
  Localizer,
  buildMessageCatalog,
  createChunkCatalogLoader,
  switchLocale,
} from '../../src/services/localization';
import type { LocaleSwitchFailure } from '../../src/services/localization/chunk-catalog-loader';

/**
 * #662: the three states a catalogue delivery route has to be shown in,
 * exercised through a real dynamic `import()` of a real file rather than a
 * stubbed loader -- the point of the route is what the module system and
 * the bundler do with it, and a stub proves neither.
 *
 * The English catalogue here stands in for the bundled default
 * (`defaultMessageCatalogEn`), kept small so a failure names a key instead
 * of a diff of 579 of them.
 */
const englishCatalog = buildMessageCatalog(DEFAULT_LOCALE, {
  'ui.start': 'Start',
  'ui.prisoners': { one: '{count} prisoner', other: '{count} prisoners' },
  'ui.only-english': 'Fallback only',
});

function bundledLocalizer(): Localizer {
  return new Localizer({ locale: DEFAULT_LOCALE, catalogs: [englishCatalog] });
}

const chunks = {
  pl: () => import('../fixtures/localization/catalog-pl.json'),
  'pl-BAD-VERSION': () => import('../fixtures/localization/catalog-pl-bad-version.json'),
  'pl-INVALID': () => import('../fixtures/localization/catalog-pl-schema-violation.json'),
  'pl-WRONG': () => import('../fixtures/localization/catalog-wrong-locale.json'),
} as const;

describe('a second catalogue delivered as a code-split chunk (#662)', () => {
  it('state 1: the chunk loads and the text changes', async () => {
    const before = bundledLocalizer();
    expect(before.format('ui.start')).toBe('Start');

    const loader = createChunkCatalogLoader({ pl: chunks.pl });
    const outcome = await switchLocale(before, loader, 'pl');

    expect(outcome.failure).toBeUndefined();
    expect(outcome.changed).toBe(true);
    expect(outcome.locale).toBe('pl');
    expect(outcome.localizer.format('ui.start')).toBe('Rozpocznij');
    // Polish plural rules against the Polish catalogue's own forms.
    expect(outcome.localizer.formatPlural('ui.prisoners', 5)).toBe('5 więźniów');
    // A key the Polish catalogue does not carry still falls back per key.
    expect(outcome.localizer.format('ui.only-english')).toBe('Fallback only');
  });

  it('state 2: the chunk fails to load, the UI stays English, and the failure is reported', async () => {
    const before = bundledLocalizer();
    const failures: LocaleSwitchFailure[] = [];
    const loader = createChunkCatalogLoader({
      pl: () => Promise.reject(new Error('Failed to fetch dynamically imported module')),
    });

    const outcome = await switchLocale(before, loader, 'pl', { onFailure: (failure) => failures.push(failure) });

    expect(outcome.changed).toBe(false);
    expect(outcome.localizer).toBe(before);
    expect(outcome.locale).toBe(DEFAULT_LOCALE);
    expect(failures).toEqual([
      { requestedLocale: 'pl', message: 'Failed to fetch dynamically imported module' },
    ]);
    // Not a page of raw keys and not a blank screen: English text.
    expect(outcome.localizer.format('ui.start')).toBe('Start');
    expect(outcome.localizer.formatPlural('ui.prisoners', 2)).toBe('2 prisoners');
  });

  it('state 3a: a catalogue with the wrong MESSAGE_CATALOG_VERSION is refused whole', async () => {
    const before = bundledLocalizer();
    const failures: LocaleSwitchFailure[] = [];
    const loader = createChunkCatalogLoader({ pl: chunks['pl-BAD-VERSION'] });

    const outcome = await switchLocale(before, loader, 'pl', { onFailure: (failure) => failures.push(failure) });

    expect(outcome.changed).toBe(false);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.message).toContain('version');
    // Refused, not partially applied: nothing from that catalogue resolves,
    // including the keys in it that were individually well formed.
    expect(outcome.localizer.format('ui.start')).toBe('Start');
    expect(outcome.localizer.has('ui.only-in-bad-catalog')).toBe(false);
    expect(outcome.localizer.format('ui.only-in-bad-catalog')).toBe('ui.only-in-bad-catalog');
  });

  it('state 3b: a schema violation anywhere refuses the whole catalogue', async () => {
    const before = bundledLocalizer();
    const loader = createChunkCatalogLoader({ pl: chunks['pl-INVALID'] });

    const outcome = await switchLocale(before, loader, 'pl');

    expect(outcome.changed).toBe(false);
    // The mandatory `other` plural form is missing on one key only.
    expect(outcome.failure?.message).toContain('ui.prisoners');
    expect(outcome.localizer.format('ui.start')).toBe('Start');
    expect(outcome.localizer.has('ui.only-in-bad-catalog')).toBe(false);
  });

  it('state 3c: a catalogue that declares a different locale than requested is refused', async () => {
    const before = bundledLocalizer();
    const loader = createChunkCatalogLoader({ pl: chunks['pl-WRONG'] });

    const outcome = await switchLocale(before, loader, 'pl');

    expect(outcome.changed).toBe(false);
    expect(outcome.failure?.message).toBe('Catalog declares locale "de".');
    expect(outcome.localizer.has('ui.only-in-bad-catalog')).toBe(false);
  });
});

describe('the chunk registry itself (#662)', () => {
  it('requests no chunk until a locale is actually switched to', async () => {
    const importer = vi.fn(chunks.pl);
    const loader = createChunkCatalogLoader({ pl: importer });

    expect(loader.locales).toEqual(['pl']);
    expect(importer).not.toHaveBeenCalled();

    await switchLocale(bundledLocalizer(), loader, 'pl');
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it('returns to the bundled default locale without loading anything', async () => {
    const importer = vi.fn(chunks.pl);
    const loader = createChunkCatalogLoader({ pl: importer });
    const polish = (await switchLocale(bundledLocalizer(), loader, 'pl')).localizer;
    importer.mockClear();

    const outcome = await switchLocale(polish, loader, DEFAULT_LOCALE);

    expect(outcome.failure).toBeUndefined();
    expect(outcome.locale).toBe(DEFAULT_LOCALE);
    expect(outcome.localizer.format('ui.start')).toBe('Start');
    // The default locale is bundled, so going back must work with the
    // network off -- nothing may be requested for it.
    expect(importer).not.toHaveBeenCalled();
  });

  it('normalizes the tags it is registered under and the tag it is asked for', async () => {
    const loader = createChunkCatalogLoader({ PL: chunks.pl });
    expect(loader.locales).toEqual(['pl']);
    expect(loader.has('pl')).toBe(true);

    const outcome = await switchLocale(bundledLocalizer(), loader, '  Pl  ');
    expect(outcome.locale).toBe('pl');
  });

  it('refuses a registry entry whose tag is not a language tag', () => {
    expect(() => createChunkCatalogLoader({ 'not a locale': chunks.pl })).toThrow(RangeError);
  });

  it('reports an unpublished locale instead of throwing', async () => {
    const loader = createChunkCatalogLoader({ pl: chunks.pl });
    const outcome = await switchLocale(bundledLocalizer(), loader, 'de');
    expect(outcome.changed).toBe(false);
    expect(outcome.failure?.message).toBe('No catalog chunk is published for locale "de".');
  });

  it('reports an unparseable requested tag instead of throwing', async () => {
    const loader = createChunkCatalogLoader({ pl: chunks.pl });
    const outcome = await switchLocale(bundledLocalizer(), loader, 'english');
    expect(outcome.failure).toEqual({ requestedLocale: 'english', message: 'Invalid locale tag.' });
  });
});
