import { z } from 'zod';

/**
 * Typed runtime contract for the generated rendered-art catalog
 * (`public/game-content/rendered-art.v1.json`, ADR 0100).
 *
 * `source-art-catalog.ts` is this module's sibling and its model: the
 * renderer names a logical asset id, the generated catalog names the file,
 * and a re-hashed image therefore needs no renderer change. The two catalogs
 * are not merged into one, because `tooling/build-rendered-art-catalog.mjs`
 * writes this one from a different generator, over a different producer
 * (`tooling/blender/render-environment-objects.py`), with different
 * per-entry metadata -- ADR 0100's whole Decision is that stretching the
 * owner-sheet catalog's schema to also describe a render was the wrong move.
 *
 * ## Why the entries carry `dimensionsPx`, `footprintTiles` and `frameTiles`
 * rather than a fixed size
 *
 * `source-art.v1.json` hardcodes `dimensionsPx: {1448,1086}` because every
 * owner sheet really is that size. No two renders share a size --
 * `environment-objects.render.json` records a `sizePx` and a `frameTiles` per
 * asset, sized from that object's own declared footprint -- so this schema
 * takes each entry's geometry from the sidecar the generator read, rather
 * than repeating a number that would be wrong for the next object this lane
 * publishes.
 *
 * Everything in it is presentation metadata. None of it is simulation
 * authority (`AGENTS.md` boundary 1).
 */

const nonNegativeIntSchema = z.number().int().min(0);
const pixelSizeSchema = z.number().int().min(1);
const tileSizeSchema = z.object({ width: z.number().positive(), height: z.number().positive() }).strict();

/** Same underscore-admitting pattern `source-art-catalog.ts` uses, for the same reason: `fixture.cell.toilet_sink`. */
const renderedArtAssetIdSchema = z.string().regex(/^[a-z][a-z0-9_]*(?:[.-][a-z0-9_]+)*$/);

export const renderedArtEntrySchema = z
  .object({
    assetId: renderedArtAssetIdSchema,
    contentVersion: z.number().int().min(1),
    /** Catalog-relative, content-hashed, under the owner sheets' own directory: `source-art/rendered.<assetId>.<12 hex>.png`.
     * The `rendered.` prefix is load-bearing -- see `tooling/build-rendered-art-catalog.mjs`'s docblock for the collision it avoids. */
    image: z.string().regex(/^source-art\/rendered\.[a-z0-9][a-z0-9._-]*\.png$/),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    dimensionsPx: z.object({ width: pixelSizeSchema, height: pixelSizeSchema }).strict(),
    footprintTiles: tileSizeSchema,
    frameTiles: tileSizeSchema,
    frameAspectDriftFromFootprint: z.number(),
    sourceAttribution: z
      .object({ license: z.string().min(1), producedBy: z.string().min(1), catalog: z.string().min(1), blenderVersion: z.string().min(1) })
      .strict(),
  })
  .strict();
export type RenderedArtEntry = z.infer<typeof renderedArtEntrySchema>;

export const renderedArtCatalogSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal('lockstate.rendered-art-catalog'),
    entries: z.array(renderedArtEntrySchema).min(1),
  })
  .strict();
export type RenderedArtCatalogFile = z.infer<typeof renderedArtCatalogSchema>;

/**
 * Where the catalog and its images are published.
 *
 * Same base path and directory as `SOURCE_ART_BASE_PATH` / the `source-art/`
 * subdirectory -- `tooling/build-rendered-art-catalog.mjs`'s docblock says
 * why: reusing them costs no `public/_headers` change, and that file is
 * outside what ADR 0100's acceptance released.
 */
export const RENDERED_ART_BASE_PATH = '/game-content';
export const RENDERED_ART_CATALOG_FILE = 'rendered-art.v1.json';

export type RenderedArtFetch = (url: string) => Promise<unknown>;

/** Default loader: plain JSON over fetch, no caching policy of its own. */
export async function fetchRenderedArtJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url}: HTTP ${response.status}.`);
  return response.json();
}

export class RenderedArtCatalog {
  private constructor(
    private readonly basePath: string,
    private readonly entries: ReadonlyMap<string, RenderedArtEntry>,
  ) {}

  public static async load(
    options: { readonly basePath?: string; readonly fetchJson?: RenderedArtFetch } = {},
  ): Promise<RenderedArtCatalog> {
    const basePath = options.basePath ?? RENDERED_ART_BASE_PATH;
    const load = options.fetchJson ?? fetchRenderedArtJson;
    const parsed = renderedArtCatalogSchema.parse(await load(`${basePath}/${RENDERED_ART_CATALOG_FILE}`));
    return RenderedArtCatalog.fromParsed(basePath, parsed);
  }

  /** For a caller that already holds the catalog -- a test, or a contract check reading it off disk. */
  public static fromParsed(basePath: string, file: RenderedArtCatalogFile): RenderedArtCatalog {
    const entries = new Map<string, RenderedArtEntry>();
    for (const entry of file.entries) {
      if (entries.has(entry.assetId)) throw new Error(`Rendered-art catalog lists "${entry.assetId}" more than once.`);
      entries.set(entry.assetId, entry);
    }
    return new RenderedArtCatalog(basePath, entries);
  }

  /** Sorted, so iteration never depends on catalog ordering. */
  public assetIds(): readonly string[] {
    return [...this.entries.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }

  public has(assetId: string): boolean {
    return this.entries.has(assetId);
  }

  public entry(assetId: string): RenderedArtEntry | undefined {
    return this.entries.get(assetId);
  }

  /**
   * URL of a render. Throws on an unknown id: the catalog is generated and
   * hash-verified, so an id the renderer names and the catalog lacks is a
   * programming error rather than a recoverable condition.
   */
  public imageUrl(assetId: string): string {
    return `${this.basePath}/${this.requireEntry(assetId).image}`;
  }

  /** The render's own pixel size -- unlike the owner sheets, never a shared constant. */
  public dimensions(assetId: string): { readonly width: number; readonly height: number } {
    return this.requireEntry(assetId).dimensionsPx;
  }

  private requireEntry(assetId: string): RenderedArtEntry {
    const entry = this.entries.get(assetId);
    if (entry === undefined) throw new RangeError(`Unknown rendered-art asset id "${assetId}".`);
    return entry;
  }
}
