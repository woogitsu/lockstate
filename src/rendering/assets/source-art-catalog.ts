import { z } from 'zod';

/**
 * Typed runtime contract for the generated source-art catalog
 * (`public/game-content/source-art.v1.json`, issue #32 / ADR-0014).
 *
 * This is the environment half of what `atlas-manifest.ts` is for actors, and
 * it exists for the same reason: the renderer names a logical asset id, the
 * generated catalog names the file, and a re-hashed sheet therefore needs no
 * renderer change. `tooling/build-source-art-catalog.mjs` writes the catalog;
 * nothing here may spell one of its filenames.
 *
 * Everything in it is presentation metadata. None of it is simulation
 * authority (`AGENTS.md` boundary 1).
 *
 * ## Why the ids need their own pattern
 *
 * `atlas-manifest.ts`'s `assetIdSchema` is `/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/`
 * and would reject three of the catalogued sheets outright --
 * `fixture.cell.toilet_sink`, `furniture.cell.table_stool` and
 * `perimeter.vehicle_gate.sliding.variants` all carry an underscore. Reusing it
 * would have failed at load on real content, so the underscore is admitted here
 * rather than the actor pattern being widened to match art it does not
 * describe.
 */

const sourceArtAssetIdSchema = z.string().regex(/^[a-z][a-z0-9_]*(?:[.-][a-z0-9_]+)*$/);
const nonNegativeIntSchema = z.number().int().min(0);
const pixelSizeSchema = z.number().int().min(1);

export const sourceArtRectSchema = z
  .object({ x: nonNegativeIntSchema, y: nonNegativeIntSchema, width: pixelSizeSchema, height: pixelSizeSchema })
  .strict();
export type SourceArtRect = z.infer<typeof sourceArtRectSchema>;

export const sourceArtEntrySchema = z
  .object({
    assetId: sourceArtAssetIdSchema,
    contentVersion: z.number().int().min(1),
    /** Catalog-relative, content-hashed: `source-art/<assetId>.<12 hex>.png`. */
    image: z.string().regex(/^source-art\/[a-z0-9][a-z0-9._-]*\.png$/),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    dimensionsPx: z.object({ width: pixelSizeSchema, height: pixelSizeSchema }).strict(),
    sourceRectPx: sourceArtRectSchema,
    pivotPx: z.object({ x: nonNegativeIntSchema, y: nonNegativeIntSchema }).strict(),
    depthAnchor: z.literal('bottom-center'),
    sourceAttribution: z.object({ license: z.string().min(1), batchId: z.string().min(1) }).strict(),
  })
  .strict();
export type SourceArtEntry = z.infer<typeof sourceArtEntrySchema>;

export const sourceArtCatalogSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal('lockstate.source-art-catalog'),
    entries: z.array(sourceArtEntrySchema).min(1),
  })
  .strict();
export type SourceArtCatalogFile = z.infer<typeof sourceArtCatalogSchema>;

/**
 * Where the catalog and its sheets are published.
 *
 * `docs/ART_PIPELINE.md` ("Delivery and caching") and `public/_headers:75`
 * serve `/game-content/source-art/*` with immutable content-hashed URLs and the
 * catalog beside it revalidating. Kept in one place so no renderer module ever
 * spells a path.
 */
export const SOURCE_ART_BASE_PATH = '/game-content';
export const SOURCE_ART_CATALOG_FILE = 'source-art.v1.json';

export type SourceArtFetch = (url: string) => Promise<unknown>;

/** Default loader: plain JSON over fetch, no caching policy of its own. */
export async function fetchSourceArtJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url}: HTTP ${response.status}.`);
  return response.json();
}

export class SourceArtCatalog {
  private constructor(
    private readonly basePath: string,
    private readonly entries: ReadonlyMap<string, SourceArtEntry>,
  ) {}

  public static async load(
    options: { readonly basePath?: string; readonly fetchJson?: SourceArtFetch } = {},
  ): Promise<SourceArtCatalog> {
    const basePath = options.basePath ?? SOURCE_ART_BASE_PATH;
    const load = options.fetchJson ?? fetchSourceArtJson;
    const parsed = sourceArtCatalogSchema.parse(await load(`${basePath}/${SOURCE_ART_CATALOG_FILE}`));
    return SourceArtCatalog.fromParsed(basePath, parsed);
  }

  /** For a caller that already holds the catalog -- a test, or a contract check reading it off disk. */
  public static fromParsed(basePath: string, file: SourceArtCatalogFile): SourceArtCatalog {
    const entries = new Map<string, SourceArtEntry>();
    for (const entry of file.entries) {
      if (entries.has(entry.assetId)) throw new Error(`Source-art catalog lists "${entry.assetId}" more than once.`);
      entries.set(entry.assetId, entry);
    }
    return new SourceArtCatalog(basePath, entries);
  }

  /** Sorted, so iteration never depends on catalog ordering. */
  public assetIds(): readonly string[] {
    return [...this.entries.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }

  public has(assetId: string): boolean {
    return this.entries.has(assetId);
  }

  public entry(assetId: string): SourceArtEntry | undefined {
    return this.entries.get(assetId);
  }

  /**
   * URL of a sheet. Throws on an unknown id: the catalog is generated and
   * hash-verified, so an id the renderer names and the catalog lacks is a
   * programming error rather than a recoverable condition.
   */
  public imageUrl(assetId: string): string {
    return `${this.basePath}/${this.requireEntry(assetId).image}`;
  }

  public dimensions(assetId: string): { readonly width: number; readonly height: number } {
    return this.requireEntry(assetId).dimensionsPx;
  }

  private requireEntry(assetId: string): SourceArtEntry {
    const entry = this.entries.get(assetId);
    if (entry === undefined) throw new RangeError(`Unknown source-art asset id "${assetId}".`);
    return entry;
  }
}
