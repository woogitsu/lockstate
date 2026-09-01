import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  Localizer,
  MESSAGE_CATALOG_VERSION,
  PSEUDO_LOCALE,
  buildMessageCatalog,
  buildPseudoLocaleCatalog,
  createChunkCatalogLoader,
  defaultMessageCatalogEn,
  selectSupportedLocale,
  switchLocale,
} from '../../src/services/localization';
import type { LocaleSwitchFailure } from '../../src/services/localization/chunk-catalog-loader';
import type { MessageEntry } from '../../src/services/localization/catalog';
import { findPseudoLocaleResidue } from '../helpers/pseudo-locale-residue';

/**
 * A second locale, loaded through the real port, over the real catalogue --
 * with no word of any language authored to do it (#662, #664).
 *
 * ## What this adds to `tests/unit/localization-chunk-delivery.test.ts`
 *
 * That file proves the three states #662 demanded of the delivery *route*,
 * through real dynamic `import()`s of real files, against a **four-key**
 * English catalogue and a four-key `pl` fixture. It is the right test for the
 * route and the wrong one for the question underneath it: whether a second
 * locale can actually be loaded over the 588 keys the game ships.
 *
 * The pseudo-locale is what makes that askable today. It is a complete,
 * mechanically derived non-default catalogue whose text is verifiable without
 * knowing any language: every message comes back accented and bracketed, so
 * "the UI is now in the other locale" is an assertion rather than a reading of
 * someone's translation. #661's `pl` catalogue replaces the importer here with
 * `() => import('.../pl.json')` and nothing else about this file changes.
 *
 * It is also why no production module was added for it: the loader is
 * assembled from pieces that already exist -- `createChunkCatalogLoader` takes
 * an importer thunk, and a thunk that resolves a locally derived catalogue is
 * as valid as one that resolves a network chunk. A `createPseudoLocaleLoader`
 * in `src/` would be production code nothing production reaches (ADR 0044),
 * and `tests/foundation/pseudo-locale-contract.test.ts` exists precisely to
 * keep `en-XA` out of the shipped build's reach.
 */

/** The bundled default, exactly as `src/main.ts` builds it. */
function bundledLocalizer(): Localizer {
  return new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });
}

/**
 * The chunk a second locale arrives in. Returned as a plain value, so
 * `loadMessageCatalog` runs `decodeMessageCatalog` over it exactly as it would
 * over a `fetch(...).json()` body -- the point of the port is that the loader
 * hands over untrusted data, not a `MessageCatalog` it has vouched for.
 */
function pseudoChunk(): unknown {
  return JSON.parse(JSON.stringify(buildPseudoLocaleCatalog(defaultMessageCatalogEn))) as unknown;
}

describe('a second locale reaches a running page over the real catalogue (#662)', () => {
  it('changes every one of the 588 messages, and none of them keeps its English', () => {
    const before = bundledLocalizer();
    expect(before.format('hud.clock.speed', { speed: 2 })).toBe('Speed 2x');

    const loader = createChunkCatalogLoader({ [PSEUDO_LOCALE]: () => Promise.resolve(pseudoChunk()) });
    return switchLocale(before, loader, PSEUDO_LOCALE).then((outcome) => {
      expect(outcome.failure).toBeUndefined();
      expect(outcome.changed).toBe(true);
      expect(outcome.locale).toBe(PSEUDO_LOCALE);

      const unchanged: string[] = [];
      let checked = 0;
      for (const [key, entry] of Object.entries(defaultMessageCatalogEn.messages)) {
        checked += 1;
        const english = typeof entry === 'string' ? entry : (entry as Exclude<MessageEntry, string>).other;
        const rendered = outcome.localizer.format(key);
        // Not merely "different": no ASCII word survives, so nothing came
        // through the fallback chain in English.
        if (rendered === english || findPseudoLocaleResidue(rendered).some((f) => f.kind !== 'interpolated-parameter')) {
          unchanged.push(`${key} -> ${rendered}`);
        }
      }
      // FLOOR at the measured catalogue size, so a switch over an empty
      // catalogue cannot pass this.
      expect(checked).toBeGreaterThanOrEqual(588);
      expect(unchanged, 'these keys did not come from the loaded catalogue').toEqual([]);
    });
  });

  it('falls back per key when the loaded catalogue is partial, which is a valid shipping state', async () => {
    // The property #664 turns on: a locale that translates some of the
    // catalogue is not broken, it is partial, and the untranslated keys read
    // in the default locale rather than as raw identifiers.
    const complete = buildPseudoLocaleCatalog(defaultMessageCatalogEn);
    const partialMessages: Record<string, MessageEntry> = {};
    for (const [key, entry] of Object.entries(complete.messages)) {
      if (key.startsWith('hud.')) partialMessages[key] = entry as MessageEntry;
    }
    const partial = buildMessageCatalog(PSEUDO_LOCALE, partialMessages);
    expect(Object.keys(partialMessages).length).toBeGreaterThanOrEqual(200);

    const loader = createChunkCatalogLoader({ [PSEUDO_LOCALE]: () => Promise.resolve(partial) });
    const outcome = await switchLocale(bundledLocalizer(), loader, PSEUDO_LOCALE);

    expect(outcome.changed).toBe(true);
    // Translated: comes back bracketed.
    expect(outcome.localizer.format('hud.clock.speed', { speed: 2 })).toContain('⟦');
    // Untranslated: comes back in English, not as the key.
    expect(outcome.localizer.format('save.list.empty')).toBe(defaultMessageCatalogEn.messages['save.list.empty']);
    expect(outcome.localizer.format('save.list.empty')).not.toBe('save.list.empty');
  });

  it('keeps the player reading English when the chunk never arrives', async () => {
    const before = bundledLocalizer();
    const failures: LocaleSwitchFailure[] = [];
    const loader = createChunkCatalogLoader({
      [PSEUDO_LOCALE]: () => Promise.reject(new Error('Failed to fetch dynamically imported module')),
    });

    const outcome = await switchLocale(before, loader, PSEUDO_LOCALE, { onFailure: (failure) => failures.push(failure) });

    expect(outcome.changed).toBe(false);
    expect(outcome.localizer).toBe(before);
    expect(failures).toEqual([
      { requestedLocale: PSEUDO_LOCALE, message: 'Failed to fetch dynamically imported module' },
    ]);
    // Not a page of raw keys and not a blank screen.
    expect(outcome.localizer.format('hud.clock.speed', { speed: 2 })).toBe('Speed 2x');
  });

  it('refuses a catalogue of the wrong version whole, over the real key set', async () => {
    // 588 valid keys and one wrong number: the refusal has to be about the
    // envelope, not about how much of the payload looked plausible.
    const wrongVersion = { ...(pseudoChunk() as object), version: MESSAGE_CATALOG_VERSION + 1 };
    const loader = createChunkCatalogLoader({ [PSEUDO_LOCALE]: () => Promise.resolve(wrongVersion) });
    const failures: LocaleSwitchFailure[] = [];

    const outcome = await switchLocale(bundledLocalizer(), loader, PSEUDO_LOCALE, {
      onFailure: (failure) => failures.push(failure),
    });

    expect(outcome.changed).toBe(false);
    expect(failures).toHaveLength(1);
    expect(outcome.localizer.format('hud.clock.speed', { speed: 2 })).toBe('Speed 2x');
  });

  it('composes with `selectSupportedLocale`, which is how a picker asks what exists', async () => {
    // The port answers "give me the bytes for this tag" and cannot answer
    // "which tags do you have" -- `ChunkCatalogLoader` adds `locales` and
    // `has` for that, and `selectSupportedLocale` has always taken a
    // `supported` list it had no way to obtain. This is the join.
    const loader = createChunkCatalogLoader({ [PSEUDO_LOCALE]: () => Promise.resolve(pseudoChunk()) });
    const offerable = [DEFAULT_LOCALE, ...loader.locales];

    expect(loader.locales).toEqual([PSEUDO_LOCALE]);
    expect(loader.has('EN-xa')).toBe(true);
    expect(loader.has('pl')).toBe(false);
    // A browser asking for `en-XA` gets it; one asking for Polish gets the
    // complete bundled locale rather than a half-empty one.
    expect(selectSupportedLocale(['en-XA', 'en'], offerable)).toBe(PSEUDO_LOCALE);
    expect(selectSupportedLocale(['pl-PL', 'pl'], offerable)).toBe(DEFAULT_LOCALE);

    // And a tag the loader does not publish is reported rather than attempted.
    const outcome = await switchLocale(bundledLocalizer(), loader, 'pl');
    expect(outcome.failure?.message).toBe('No catalog chunk is published for locale "pl".');
  });

  it('requests nothing until a locale is actually asked for', async () => {
    // The whole point of the code-split route: registering a locale must not
    // download it. A map of live promises would undo the split, which is why
    // the importer is a thunk.
    let requests = 0;
    const loader = createChunkCatalogLoader({
      [PSEUDO_LOCALE]: () => {
        requests += 1;
        return Promise.resolve(pseudoChunk());
      },
    });

    expect(requests).toBe(0);

    // Both halves, because either alone passes for the wrong reason:
    // measured, deleting the "the bundled default needs no load" branch
    // leaves `requests` at 0 -- the switch merely fails instead, since no
    // chunk is published for `en` and none ever will be.
    const home = await switchLocale(bundledLocalizer(), loader, DEFAULT_LOCALE);
    expect(home.failure, 'returning to the bundled default must not fail').toBeUndefined();
    expect(home.localizer.format('hud.clock.speed', { speed: 2 })).toBe('Speed 2x');
    expect(requests, 'returning to the bundled default must not fetch anything').toBe(0);

    await switchLocale(bundledLocalizer(), loader, PSEUDO_LOCALE);
    expect(requests).toBe(1);
  });
});
