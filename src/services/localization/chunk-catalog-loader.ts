import { type LoadedCatalogResult, type MessageCatalogLoader, loadMessageCatalog } from './catalog';
import { DEFAULT_LOCALE, normalizeLocaleTag } from './locale';
import { Localizer } from './localizer';

/**
 * PROTOTYPE (#662). Nothing in `src/main.ts` uses this yet -- see
 * `docs/research/2026-08-30-how-a-second-catalogue-reaches-a-running-page.md`
 * §7 for what remains before it is the shipping path.
 *
 * The delivery route ADR 0011 asks for, implemented as the
 * `MessageCatalogLoader` port that has existed without an implementation
 * since #36: a non-default locale is a code-split chunk fetched by
 * `import()` when the player asks for it.
 *
 * Why a chunk rather than a `fetch` of a static file: measured on
 * 2026-08-30 against a real production build, a dynamically imported
 * catalogue module is emitted as `dist/assets/<name>-<hash>.js` -- a
 * content-hashed name in a single path segment, so `public/_headers`'
 * existing `/assets/:file` rule already gives it the one-year immutable
 * cache contract, and `script-src 'self'` already permits it. It therefore
 * needs no change to deploy configuration, which is the owner's
 * (`AGENTS.md`, "The owner's standing mandate", exclusion 3). A static
 * `/locales/*.json` would land outside every existing `_headers` rule and
 * would need one written, for a wire size that measured 74 bytes smaller.
 *
 * The catalogue is still *data*, not code, at every point that matters: the
 * chunk's default export is a plain object literal, and it goes through
 * `decodeMessageCatalog` (via `loadMessageCatalog`) exactly as a fetched
 * JSON body would. `import()` of a `.json` module code-splits identically,
 * so the authored form may be JSON.
 */

/**
 * One locale's chunk, as a thunk: `() => import('./catalogs/pl.json')`.
 * A thunk rather than a promise so the chunk is requested when the player
 * switches, not when this module is evaluated -- a map of live promises
 * would download every locale at boot and undo the split.
 */
export type CatalogChunkImporter = () => Promise<unknown>;

export interface ChunkCatalogLoader extends MessageCatalogLoader {
  /** Normalized tags this loader can supply, for a language picker to offer. */
  readonly locales: readonly string[];
  /** Whether a chunk exists for `locale`; false for an unparseable tag. */
  has(locale: string): boolean;
}

/**
 * A dynamic `import()` resolves to a module namespace, and the catalogue is
 * its default export. Unwrapped here rather than in `decodeMessageCatalog`,
 * which must keep seeing the same untrusted plain value whatever route
 * delivered it.
 */
function unwrapCatalogModule(module: unknown): unknown {
  if (typeof module === 'object' && module !== null && 'default' in module) {
    return (module as { readonly default: unknown }).default;
  }
  return module;
}

export function createChunkCatalogLoader(
  importers: Readonly<Record<string, CatalogChunkImporter>>,
): ChunkCatalogLoader {
  const byLocale = new Map<string, CatalogChunkImporter>();
  for (const [tag, importer] of Object.entries(importers)) {
    const normalized = normalizeLocaleTag(tag);
    if (normalized === undefined) {
      // A typo in the registry is a build-time mistake, not a player-facing
      // failure, so it is loud here rather than silently unofferable later.
      throw new RangeError(`Catalog chunk registered under an invalid locale tag "${tag}".`);
    }
    byLocale.set(normalized, importer);
  }

  return {
    locales: [...byLocale.keys()],
    has(locale: string): boolean {
      const normalized = normalizeLocaleTag(locale);
      return normalized !== undefined && byLocale.has(normalized);
    },
    async load(locale: string): Promise<unknown> {
      const importer = byLocale.get(locale);
      if (importer === undefined) throw new Error(`No catalog chunk is published for locale "${locale}".`);
      return unwrapCatalogModule(await importer());
    },
  };
}

export interface LocaleSwitchFailure {
  readonly requestedLocale: string;
  readonly message: string;
}

export interface LocaleSwitchOutcome {
  /**
   * The localizer to render with. On failure this is the *caller's own*
   * instance, unchanged: the player keeps the language they were reading
   * rather than getting a page of raw keys or a blank screen (ADR 0011,
   * "A catalog fails validation -> the game keeps the previous/default
   * locale").
   */
  readonly localizer: Localizer;
  readonly locale: string;
  readonly changed: boolean;
  readonly failure?: LocaleSwitchFailure;
}

export interface SwitchLocaleOptions {
  /**
   * Called instead of throwing, for the same reason `onMissingKey` exists:
   * a translation that did not arrive must not crash a running game. Wire
   * it to a console warning in development or a telemetry event.
   */
  readonly onFailure?: (failure: LocaleSwitchFailure) => void;
  readonly defaultLocale?: string;
}

/**
 * Loads one locale and returns the localizer to render with. Never throws
 * and never returns a half-applied catalogue: `loadMessageCatalog` refuses
 * a catalogue whole -- wrong `version`, wrong shape, or a `locale` field
 * that disagrees with what was asked for -- and this returns the previous
 * localizer when it does.
 */
export async function switchLocale(
  current: Localizer,
  loader: ChunkCatalogLoader,
  locale: string,
  options: SwitchLocaleOptions = {},
): Promise<LocaleSwitchOutcome> {
  const defaultLocale = normalizeLocaleTag(options.defaultLocale ?? DEFAULT_LOCALE) ?? DEFAULT_LOCALE;
  const normalized = normalizeLocaleTag(locale);

  const fail = (requestedLocale: string, message: string): LocaleSwitchOutcome => {
    const failure: LocaleSwitchFailure = { requestedLocale, message };
    options.onFailure?.(failure);
    return { localizer: current, locale: current.locale, changed: false, failure };
  };

  if (normalized === undefined) return fail(locale, 'Invalid locale tag.');

  // The default locale is bundled and complete, so returning to it is not a
  // load at all -- and must keep working with the network off.
  if (normalized === defaultLocale) {
    if (current.locale === normalized) return { localizer: current, locale: normalized, changed: false };
    return { localizer: current.withLocale(normalized), locale: normalized, changed: true };
  }

  if (!loader.has(normalized)) return fail(normalized, `No catalog chunk is published for locale "${normalized}".`);

  const result: LoadedCatalogResult = await loadMessageCatalog(loader, normalized);
  if (!result.ok) return fail(result.locale, result.message);

  return {
    localizer: current.withLocale(result.catalog.locale, [result.catalog]),
    locale: result.catalog.locale,
    changed: true,
  };
}
