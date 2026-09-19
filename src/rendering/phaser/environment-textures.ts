import type Phaser from 'phaser';
import type { EnvironmentAtlasFrame, EnvironmentAtlasPlan } from '../assets/environment-atlas-plan';
import { environmentFrameName } from '../assets/environment-atlas-plan';
import type { EnvironmentSpriteId } from '../assets/environment-sprites';

/**
 * Publishes the environment sprites into Phaser's texture manager, by cutting
 * them out of the published source sheets in the browser.
 *
 * ### Why the cutting happens here and not in a build step
 *
 * `docs/ART_PIPELINE.md` publishes the 23 owner-supplied sheets whole, under
 * immutable content-hashed URLs, and ADR-0014 leaves "whether they should be
 * published at all" open on the grounds that nothing loads them. Something does
 * now. What a sheet cannot be is drawn *directly*: a floor slab is authored at
 * 367px for a 64px tile, and sampling that down in the shader with no mipmap
 * chain makes a floor that shimmers whenever the camera moves.
 *
 * `createImageBitmap` solves exactly that. Given a crop rectangle and a
 * `resizeWidth`/`resizeHeight` it resamples properly, off the main thread, and
 * the result is a small crisp frame. So the browser does once, at load, what an
 * offline packer would do at build time -- and the *plan* it follows is pure
 * data computed in `environment-atlas-plan.ts`, so replacing this with an
 * offline batch later changes this file and nothing above it.
 *
 * ### One texture, extruded
 *
 * Every frame lands in one canvas texture, so floors and walls batch together.
 * Each is drawn with a two-pixel border of its own duplicated edge pixels, for
 * the reason the actor packer extrudes: without it, linear sampling at a frame
 * boundary reaches into the neighbouring frame and a tiled floor grows seams.
 */

/** What the painter needs to know: one texture key, and a frame name per sprite. */
export interface EnvironmentTextureSet {
  readonly textureKey: string;
  /** Sprites actually present in the texture. */
  has(spriteId: EnvironmentSpriteId): boolean;
  /** Frame name inside `textureKey`. Undefined when the sprite is not in this set. */
  frameName(spriteId: EnvironmentSpriteId): string | undefined;
  /**
   * The frame's size in texture pixels.
   *
   * The painter needs it to work out what scale a tiling sprite repeats at, and
   * it comes from the plan rather than from Phaser so that the arithmetic is
   * about the art rather than about whatever the texture manager happens to
   * hold.
   */
  frameSize(spriteId: EnvironmentSpriteId): { readonly width: number; readonly height: number } | undefined;
}

/** Injectable so a test can supply decoded pixels without a network. */
export type SheetBitmapLoader = (url: string) => Promise<ImageBitmap>;

async function fetchSheetBitmap(url: string): Promise<ImageBitmap> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url}: HTTP ${response.status}.`);
  const blob = await response.blob();
  // A Git LFS pointer is served as `200 image/png` and is about 132 bytes of
  // text (`docs/ART_PIPELINE.md`). Decoding is the only step that can tell the
  // difference, and this is where it happens.
  return createImageBitmap(blob);
}

export async function loadEnvironmentAtlas(
  scene: Phaser.Scene,
  plan: EnvironmentAtlasPlan,
  options: { readonly loadSheet?: SheetBitmapLoader } = {},
): Promise<EnvironmentTextureSet> {
  const names = new Map<EnvironmentSpriteId, string>();
  const sizes = new Map<EnvironmentSpriteId, { readonly width: number; readonly height: number }>();
  for (const frame of plan.frames) {
    names.set(frame.spriteId, environmentFrameName(frame.spriteId));
    sizes.set(frame.spriteId, { width: frame.atlasRectPx.width, height: frame.atlasRectPx.height });
  }
  const set: EnvironmentTextureSet = {
    textureKey: plan.textureKey,
    has: (spriteId) => names.has(spriteId),
    frameName: (spriteId) => names.get(spriteId),
    frameSize: (spriteId) => sizes.get(spriteId),
  };

  // The key carries the content hashes of every sheet it was cut from, so an
  // existing texture under this key is this texture.
  if (scene.textures.exists(plan.textureKey)) return set;

  const loadSheet = options.loadSheet ?? fetchSheetBitmap;
  // In parallel, because these are independent multi-megabyte downloads and
  // fetching them one after another would make the world wait for the sum of
  // them rather than the slowest.
  //
  // Keyed by `sheetKey`, not `assetId`: two catalogs (owner sheets and
  // rendered objects, ADR 0100) are not guaranteed to use disjoint ids --
  // `fixture.cell.toilet_sink` names one entry in each -- and `sheetKey` is
  // the field `planEnvironmentAtlas` guarantees unique across both. Keying on
  // the raw id here would let one catalog's fetched bitmap silently stand in
  // for the other's frame whenever the two shared a string.
  const sheets = new Map<string, ImageBitmap>(
    await Promise.all(
      plan.sheets.map(async (sheet) => [sheet.sheetKey, await loadSheet(sheet.imageUrl)] as const),
    ),
  );

  const texture = scene.textures.createCanvas(plan.textureKey, plan.widthPx, plan.heightPx);
  if (texture === null) throw new Error(`Could not create the environment atlas texture "${plan.textureKey}".`);

  const context = texture.context;
  context.clearRect(0, 0, plan.widthPx, plan.heightPx);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  try {
    for (const frame of plan.frames) {
      const sheet = sheets.get(frame.sheetKey);
      if (sheet === undefined) throw new Error(`The plan asked for "${frame.assetId}" (${frame.sheetKey}), which was not downloaded.`);
      const cut = await createImageBitmap(
        sheet,
        frame.sourceRectPx.x,
        frame.sourceRectPx.y,
        frame.sourceRectPx.width,
        frame.sourceRectPx.height,
        { resizeWidth: frame.resizeToPx.width, resizeHeight: frame.resizeToPx.height, resizeQuality: 'high' },
      );
      try {
        drawFrame(context, cut, frame);
      } finally {
        cut.close();
      }
      extrude(context, frame.atlasRectPx, plan.gutterPx);
      texture.add(environmentFrameName(frame.spriteId), 0, frame.atlasRectPx.x, frame.atlasRectPx.y, frame.atlasRectPx.width, frame.atlasRectPx.height);
    }
  } finally {
    for (const sheet of sheets.values()) sheet.close();
  }

  texture.refresh();
  return set;
}

/**
 * Places one resampled crop, applying its quarter-turn.
 *
 * The turn is clockwise: the crop's top edge ends up on the destination's right
 * edge. `environment-sprites.ts` explains why a turn exists at all -- the only
 * top-down wall surface in the batch is a coping band authored running
 * horizontally.
 */
function drawFrame(context: CanvasRenderingContext2D, cut: ImageBitmap, frame: EnvironmentAtlasFrame): void {
  const { x, y, width, height } = frame.atlasRectPx;
  if (frame.quarterTurns === 0) {
    context.drawImage(cut, x, y, width, height);
    return;
  }
  context.save();
  context.translate(x + width, y);
  context.rotate(Math.PI / 2);
  context.drawImage(cut, 0, 0, height, width);
  context.restore();
}

/** Duplicates a frame's outer row and column outwards into its gutter, corners included. */
function extrude(
  context: CanvasRenderingContext2D,
  rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  gutter: number,
): void {
  if (gutter <= 0) return;
  const canvas = context.canvas;
  const { x, y, width: w, height: h } = rect;
  context.drawImage(canvas, x, y, w, 1, x, y - gutter, w, gutter);
  context.drawImage(canvas, x, y + h - 1, w, 1, x, y + h, w, gutter);
  context.drawImage(canvas, x, y, 1, h, x - gutter, y, gutter, h);
  context.drawImage(canvas, x + w - 1, y, 1, h, x + w, y, gutter, h);
  context.drawImage(canvas, x, y, 1, 1, x - gutter, y - gutter, gutter, gutter);
  context.drawImage(canvas, x + w - 1, y, 1, 1, x + w, y - gutter, gutter, gutter);
  context.drawImage(canvas, x, y + h - 1, 1, 1, x - gutter, y + h, gutter, gutter);
  context.drawImage(canvas, x + w - 1, y + h - 1, 1, 1, x + w, y + h, gutter, gutter);
}
