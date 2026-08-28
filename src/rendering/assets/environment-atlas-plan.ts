import {
  ENVIRONMENT_SPRITE_IDS,
  ENVIRONMENT_SPRITES,
  environmentFrameSize,
  type EnvironmentSpriteDefinition,
  type EnvironmentSpriteId,
  type EnvironmentSpriteQuarterTurns,
} from './environment-sprites';
import type { SourceArtCatalog, SourceArtRect } from './source-art-catalog';

/**
 * Turns the catalog and the extraction manifest into one packing plan: which
 * sheets to fetch, which rectangle to cut out of each, how big to resample it,
 * and where the result lands in a single texture.
 *
 * Pure, allocation-once, Phaser-free and DOM-free, so every decision in it is
 * reachable from the default Node test environment -- which matters here more
 * than usual, because the only part that cannot be is the part that actually
 * touches a canvas (`src/rendering/phaser/environment-textures.ts`). Splitting
 * it this way is the same move `AtlasFrameIndex` makes for the actors: the
 * index decides, the Phaser module publishes.
 *
 * ### Why one texture
 *
 * The frames are drawn by two different kinds of game object -- tiling floors
 * and tiling wall runs -- and both batch only while they share a texture.
 * Phaser 4 wraps a tiling frame in the shader (`TexCoordFrameWrap`), so a
 * repeating frame does not need a texture of its own and does not need
 * power-of-two dimensions; that is what makes one packed sheet possible at all.
 */

/** Transparent border reserved around every frame, filled by extruding its edge pixels. */
export const ENVIRONMENT_ATLAS_GUTTER_PX = 2;

/**
 * Fixed atlas width. Every declared frame is at most 128px on its long axis, so
 * a 512px shelf holds three per row and the packer never has to grow sideways;
 * only the height is computed.
 */
export const ENVIRONMENT_ATLAS_WIDTH_PX = 512;

export interface EnvironmentAtlasFrame {
  readonly spriteId: EnvironmentSpriteId;
  readonly assetId: string;
  /** Sheet the crop comes from, as the catalog names it. No filename is spelled here. */
  readonly imageUrl: string;
  readonly sourceRectPx: SourceArtRect;
  /** Size the crop is resampled to, before its quarter-turn. */
  readonly resizeToPx: { readonly width: number; readonly height: number };
  readonly quarterTurns: EnvironmentSpriteQuarterTurns;
  /** Where the turned frame sits in the packed texture, gutter excluded. */
  readonly atlasRectPx: SourceArtRect;
}

export interface EnvironmentAtlasSheet {
  readonly assetId: string;
  readonly imageUrl: string;
}

export interface EnvironmentAtlasPlan {
  /**
   * Texture key, derived from the content-hashed filenames the catalog gave.
   *
   * Derived rather than invented for the reason `atlas-textures.ts` states: a
   * key that cannot drift from the content it names. Re-render a sheet, its
   * hash changes, the catalog changes, and this key changes with it.
   */
  readonly textureKey: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly gutterPx: number;
  /** Distinct sheets to download, sorted by asset id. One fetch each. */
  readonly sheets: readonly EnvironmentAtlasSheet[];
  /** Frames in sprite-id order, so the plan is identical on every run. */
  readonly frames: readonly EnvironmentAtlasFrame[];
}

function rectFitsInside(rect: SourceArtRect, size: { readonly width: number; readonly height: number }): boolean {
  return rect.x + rect.width <= size.width && rect.y + rect.height <= size.height;
}

/**
 * Builds the plan, or throws naming the sprite that is wrong.
 *
 * It throws rather than skipping because every failure it can detect is an
 * authoring mistake in `environment-sprites.ts` -- an id the catalog does not
 * hold, or a rectangle that runs off the edge of its sheet -- and a renderer
 * that quietly dropped one would draw a prison with a hole in it and no
 * message. `tests/unit/environment-art.test.ts` drives both, in
 * `describe('environment atlas plan')` at `:128`, whose `:172` is *"refuses a
 * rectangle that runs off its sheet, naming the sprite"* and whose `:181` is
 * *"refuses a sprite naming a sheet the catalog does not hold"*.
 *
 * This named `environment-atlas-plan.test.ts` until 2026-08-28. No such file
 * has ever existed -- `git log --all --diff-filter=A` finds no commit adding
 * it -- so the citation was wrong on the day it was written rather than
 * overtaken by a rename, and the tests it claimed were checked before the name
 * was corrected. The dead name is recorded as a bare filename rather than a
 * rooted path on purpose; `tests/foundation/documentation-links-contract.test.ts`
 * says why.
 */
export function planEnvironmentAtlas(
  catalog: SourceArtCatalog,
  sprites: Readonly<Record<EnvironmentSpriteId, EnvironmentSpriteDefinition>> = ENVIRONMENT_SPRITES,
): EnvironmentAtlasPlan {
  const gutter = ENVIRONMENT_ATLAS_GUTTER_PX;
  const width = ENVIRONMENT_ATLAS_WIDTH_PX;

  const frames: EnvironmentAtlasFrame[] = [];
  const sheets = new Map<string, EnvironmentAtlasSheet>();

  let shelfX = gutter;
  let shelfY = gutter;
  let shelfHeight = 0;

  // Sorted by sprite id, so the packing is the same on every run and a frame
  // rectangle asserted in a test is a fact about the packer rather than about
  // the order a record happened to enumerate in.
  for (const spriteId of [...ENVIRONMENT_SPRITE_IDS].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    const definition = sprites[spriteId];
    const entry = catalog.entry(definition.assetId);
    if (entry === undefined) {
      throw new Error(`Environment sprite "${spriteId}" names source-art asset "${definition.assetId}", which the catalog does not hold.`);
    }
    if (!rectFitsInside(definition.sourceRectPx, entry.dimensionsPx)) {
      const { x, y, width: w, height: h } = definition.sourceRectPx;
      throw new RangeError(
        `Environment sprite "${spriteId}" reads ${w}x${h} at (${x}, ${y}) from "${definition.assetId}", which is only ${entry.dimensionsPx.width}x${entry.dimensionsPx.height}.`,
      );
    }

    sheets.set(definition.assetId, { assetId: definition.assetId, imageUrl: catalog.imageUrl(definition.assetId) });

    const size = environmentFrameSize(definition);
    if (size.width + gutter * 2 > width) {
      throw new RangeError(`Environment sprite "${spriteId}" is ${size.width}px wide, which does not fit a ${width}px atlas.`);
    }
    if (shelfX + size.width + gutter > width) {
      shelfX = gutter;
      shelfY += shelfHeight + gutter * 2;
      shelfHeight = 0;
    }

    frames.push({
      spriteId,
      assetId: definition.assetId,
      imageUrl: catalog.imageUrl(definition.assetId),
      sourceRectPx: definition.sourceRectPx,
      resizeToPx: definition.runtimeSizePx,
      quarterTurns: definition.quarterTurns,
      atlasRectPx: { x: shelfX, y: shelfY, width: size.width, height: size.height },
    });

    shelfX += size.width + gutter * 2;
    if (size.height > shelfHeight) shelfHeight = size.height;
  }

  const usedHeight = shelfY + shelfHeight + gutter;
  const sheetList = [...sheets.values()].sort((a, b) => (a.assetId < b.assetId ? -1 : a.assetId > b.assetId ? 1 : 0));

  return {
    textureKey: `lockstate.environment-atlas:${sheetList.map((sheet) => sheet.imageUrl).join('|')}`,
    widthPx: width,
    heightPx: usedHeight,
    gutterPx: gutter,
    sheets: sheetList,
    frames,
  };
}

/** The frame name a sprite is registered under inside the packed texture. */
export function environmentFrameName(spriteId: EnvironmentSpriteId): string {
  return spriteId;
}
