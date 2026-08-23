import {
  assetRegistrySchema,
  atlasManifestFileSchema,
  type AssetRegistry,
  type AtlasDirection,
  type AtlasFrameRect,
  type AtlasManifest,
} from './atlas-manifest';

/**
 * Resolves logical asset IDs to atlas frames at runtime (issue #32).
 *
 * The renderer asks for `('actor.prisoner.base', 'walk', 'north', tick)` and
 * gets back an image URL plus a source rectangle and pivot. It never spells a
 * filename: the registry names the manifests, the manifests name the images,
 * and both are generated. Swapping in a re-rendered atlas therefore needs no
 * renderer change.
 *
 * Loading is explicit and async because these are network resources on a
 * static-asset CDN. Nothing here touches Phaser or the DOM, so it is testable
 * in the default Node test environment.
 */

/** Where the generated batch is published. Kept in one place, not spread through the renderer. */
export const RUNTIME_ATLAS_BASE_PATH = '/assets/actors';

export interface ResolvedAtlasFrame {
  readonly assetId: string;
  readonly clipId: string;
  readonly direction: AtlasDirection;
  /** URL of the atlas image, relative to the site root. */
  readonly imageUrl: string;
  readonly rect: AtlasFrameRect;
  /** Anchor inside `rect`: the point that sits on the actor's world position. */
  readonly footPivotPx: { readonly x: number; readonly y: number };
}

export interface ResolvedAtlasClip {
  readonly assetId: string;
  readonly clipId: string;
  readonly direction: AtlasDirection;
  readonly fps: number;
  readonly loop: boolean;
  readonly frames: readonly ResolvedAtlasFrame[];
}

export type AtlasFetch = (url: string) => Promise<unknown>;

/** Default loader: plain JSON over fetch, no caching policy of its own. */
export async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url}: HTTP ${response.status}.`);
  return response.json();
}

interface LoadedAsset {
  readonly assetId: string;
  readonly clips: ReadonlyMap<string, { readonly manifest: AtlasManifest; readonly clipId: string }>;
}

export class AtlasLibrary {
  private constructor(
    private readonly basePath: string,
    private readonly registry: AssetRegistry,
    private readonly assets: ReadonlyMap<string, LoadedAsset>,
  ) {}

  /**
   * Loads the generated registry and every manifest it names. Both are parsed
   * through the schema, so a corrupt or partially deployed batch fails here
   * with a clear message instead of producing invisible sprites later.
   */
  public static async load(
    options: { readonly basePath?: string; readonly fetchJson?: AtlasFetch } = {},
  ): Promise<AtlasLibrary> {
    const basePath = options.basePath ?? RUNTIME_ATLAS_BASE_PATH;
    const load = options.fetchJson ?? fetchJson;

    const registry = assetRegistrySchema.parse(await load(`${basePath}/asset-registry.json`));
    const assets = new Map<string, LoadedAsset>();

    for (const entry of registry.assets) {
      const manifests = atlasManifestFileSchema.parse(await load(`${basePath}/${entry.manifest}`));
      const clips = new Map<string, { manifest: AtlasManifest; clipId: string }>();

      for (const manifest of manifests) {
        if (manifest.assetId !== entry.assetId) {
          throw new Error(`${entry.manifest} declares "${manifest.assetId}" but the registry lists it as "${entry.assetId}".`);
        }
        for (const clipId of Object.keys(manifest.clips)) {
          if (clips.has(clipId)) throw new Error(`Asset "${entry.assetId}" declares clip "${clipId}" more than once.`);
          clips.set(clipId, { manifest, clipId });
        }
      }

      for (const clipId of entry.clips) {
        if (!clips.has(clipId)) throw new Error(`Registry lists clip "${clipId}" for "${entry.assetId}", but no manifest provides it.`);
      }

      assets.set(entry.assetId, { assetId: entry.assetId, clips });
    }

    return new AtlasLibrary(basePath, registry, assets);
  }

  /** Sorted, so iteration never depends on registry ordering. */
  public assetIds(): readonly string[] {
    return [...this.assets.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }

  public has(assetId: string): boolean {
    return this.assets.has(assetId);
  }

  public clipIds(assetId: string): readonly string[] {
    return [...this.requireAsset(assetId).clips.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }

  /**
   * Every frame of one direction of one clip. A miss throws: the batch is
   * validated before release, so an unknown id here is a programming error, not
   * a recoverable condition.
   */
  public resolveClip(assetId: string, clipId: string, direction: AtlasDirection): ResolvedAtlasClip {
    const asset = this.requireAsset(assetId);
    const found = asset.clips.get(clipId);
    if (found === undefined) throw new RangeError(`Asset "${assetId}" has no clip "${clipId}".`);

    const clip = found.manifest.clips[clipId];
    if (clip === undefined) throw new RangeError(`Asset "${assetId}" has no clip "${clipId}".`);

    const imageUrl = `${this.basePath}/${found.manifest.image}`;
    const footPivotPx = found.manifest.frame.footPivotPx;

    return {
      assetId,
      clipId,
      direction,
      fps: clip.fps,
      loop: clip.loop,
      frames: clip.frames[direction].map((rect) => ({ assetId, clipId, direction, imageUrl, rect, footPivotPx })),
    };
  }

  /** One frame. `ordinal` wraps for a looping clip and clamps otherwise. */
  public resolveFrame(assetId: string, clipId: string, direction: AtlasDirection, ordinal: number): ResolvedAtlasFrame {
    if (!Number.isInteger(ordinal) || ordinal < 0) {
      throw new RangeError(`Frame ordinal must be a non-negative integer, received ${ordinal}.`);
    }
    const clip = this.resolveClip(assetId, clipId, direction);
    const position = clip.loop ? ordinal % clip.frames.length : Math.min(ordinal, clip.frames.length - 1);
    const frame = clip.frames[position];
    if (frame === undefined) throw new RangeError(`Clip "${clipId}" of "${assetId}" resolved no frame at ordinal ${ordinal}.`);
    return frame;
  }

  /** Distinct atlas image URLs, so a loader can preload a content group in one pass. */
  public imageUrls(): readonly string[] {
    const urls = new Set<string>();
    for (const asset of this.assets.values()) {
      for (const { manifest } of asset.clips.values()) urls.add(`${this.basePath}/${manifest.image}`);
    }
    return [...urls].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }

  public get schemaVersion(): number {
    return this.registry.schemaVersion;
  }

  private requireAsset(assetId: string): LoadedAsset {
    const asset = this.assets.get(assetId);
    if (asset === undefined) throw new RangeError(`Unknown logical asset id "${assetId}".`);
    return asset;
  }
}
