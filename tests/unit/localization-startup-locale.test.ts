import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  Localizer,
  PSEUDO_LOCALE,
  buildPseudoLocaleCatalog,
  createChunkCatalogLoader,
  defaultMessageCatalogEn,
  resolveStartupLocale,
} from '../../src/services/localization';
import type { CatalogChunkImporter, LocaleSwitchFailure } from '../../src/services/localization/chunk-catalog-loader';

/**
 * The route between the catalogue and the page, driven over the **real**
 * Polish catalogue through the **real** chunk thunk (#662).
 *
 * ## What this adds to the two delivery tests beside it
 *
 * `localization-chunk-delivery.test.ts` proves the three states #662 demands
 * of the route, over a four-key fixture. `localization-second-locale-delivery.test.ts`
 * proves a second locale can be loaded over the whole 669-key reference,
 * using the pseudo-locale so that no word of any language has to be trusted.
 * Neither touches the thing that was actually missing for a fortnight: the
 * **production registry**, and whether the module `src/main.ts` names resolves,
 * decodes and renders.
 *
 * So the importer here is written exactly as `src/main.ts` writes it --
 * `() => import('.../pl-catalog')` -- and the assertions are the two facts a
 * registry can get wrong that a stub cannot: that the chunk's **default**
 * export is the catalogue (a named-export-only module resolves to a namespace
 * and `decodeMessageCatalog` refuses it, which is the failure this would have
 * shipped), and that what comes back survives the decode of a 669-key
 * catalogue rather than a four-key one.
 */

const PL_CHUNK: CatalogChunkImporter = () => import('../../src/services/localization/pl-catalog');

function bundledLocalizer(): Localizer {
  return new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });
}

const loader = (): ReturnType<typeof createChunkCatalogLoader> => createChunkCatalogLoader({ pl: PL_CHUNK });

describe('the locale a page starts in, resolved from the browser\'s own preferences (#662)', () => {
  it('loads the published Polish chunk for a Polish browser and renders Polish', async () => {
    const before = bundledLocalizer();
    expect(before.format('room.cell.name')).toBe('Cell');

    const outcome = await resolveStartupLocale(before, loader(), ['pl-PL', 'en-US']);

    expect(outcome.failure).toBeUndefined();
    expect(outcome.changed).toBe(true);
    expect(outcome.locale).toBe('pl');
    expect(outcome.localizer.format('room.cell.name')).toBe('Cela');
    expect(outcome.localizer.format('staff-role.guard.name')).toBe('Strażnik');
    // The service-layer half of the catalogue, which is the half a `pl`
    // catalogue stopping at `src/content/` would have left in English.
    expect(outcome.localizer.format('challenge.result.verified')).toBe('Wynik zweryfikowany');
  });

  it('keeps English underneath, so a key Polish did not carry falls back per key rather than per catalogue', async () => {
    const outcome = await resolveStartupLocale(bundledLocalizer(), loader(), ['pl']);

    // ADR 0011's chain, which is what makes a partial second locale a valid
    // shipping state: `pl` first, `en` behind it.
    expect(outcome.localizer.fallbackChain()).toEqual(['pl', 'en']);
    // Asserted over a key that really is absent from `pl` rather than over one
    // chosen for the test: the catalogue is 669 of 669 today, so this is a
    // key the bundled English catalogue does not have either, and both
    // localizers agree on returning it unresolved and greppable.
    expect(outcome.localizer.format('ui.no-such-key')).toBe('ui.no-such-key');
    // Every reference key resolves, and none of them resolves to a raw key.
    const unresolved = Object.keys(defaultMessageCatalogEn.messages).filter(
      (key) => !outcome.localizer.has(key),
    );
    expect(unresolved).toEqual([]);
  });

  it('requests no chunk at all for a browser no published locale matches', async () => {
    let requested = 0;
    const counting = createChunkCatalogLoader({
      pl: () => {
        requested += 1;
        return PL_CHUNK();
      },
    });
    const before = bundledLocalizer();

    const outcome = await resolveStartupLocale(before, counting, ['de-DE', 'fr']);

    expect(requested).toBe(0);
    expect(outcome.changed).toBe(false);
    expect(outcome.localizer).toBe(before);
    expect(outcome.localizer.format('room.cell.name')).toBe('Cell');
  });

  it('hands back the caller\'s own instance untouched when the answer is the bundled locale', async () => {
    // The property `tests/browser/pseudo-locale-sweep.spec.ts` depends on: it
    // patches `src/main.ts`'s bundled localizer to `en-XA` and the boot
    // resolution must not re-tag it `en` on a Chromium that asks for English.
    const pseudo = new Localizer({
      locale: PSEUDO_LOCALE,
      catalogs: [defaultMessageCatalogEn, buildPseudoLocaleCatalog(defaultMessageCatalogEn)],
    });

    const outcome = await resolveStartupLocale(pseudo, loader(), ['en-US']);

    expect(outcome.localizer).toBe(pseudo);
    expect(outcome.locale).toBe(PSEUDO_LOCALE);
    expect(outcome.localizer.format('room.cell.name')).not.toBe('Cell');
  });

  it('leaves the player in complete English, with a report, when the chunk never arrives', async () => {
    const before = bundledLocalizer();
    const failures: LocaleSwitchFailure[] = [];
    const broken = createChunkCatalogLoader({
      pl: () => Promise.reject(new Error('Failed to fetch dynamically imported module')),
    });

    const outcome = await resolveStartupLocale(before, broken, ['pl-PL'], {
      onFailure: (failure) => failures.push(failure),
    });

    expect(outcome.changed).toBe(false);
    expect(outcome.localizer).toBe(before);
    expect(outcome.localizer.format('room.cell.name')).toBe('Cell');
    expect(failures).toEqual([
      { requestedLocale: 'pl', message: 'Failed to fetch dynamically imported module' },
    ]);
  });

  it('delivers the catalogue as data: the chunk goes through `decodeMessageCatalog` like any fetched body', async () => {
    // The module's default export is a plain `{ version, locale, messages }`
    // object, which is what makes "the catalogue is data, not code" checkable
    // rather than asserted: nothing here is a `MessageCatalog` the loader
    // vouched for, and re-tagging it would be refused by the decode.
    const module = (await PL_CHUNK()) as { readonly default: { readonly version: number; readonly locale: string } };
    expect(module.default.locale).toBe('pl');
    expect(module.default.version).toBe(1);

    const wrongLocale = createChunkCatalogLoader({ de: () => PL_CHUNK() });
    const outcome = await resolveStartupLocale(bundledLocalizer(), wrongLocale, ['de']);
    expect(outcome.changed).toBe(false);
    expect(outcome.failure?.message).toContain('Catalog declares locale "pl"');
  });
});
