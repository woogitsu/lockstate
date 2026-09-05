import type { SourceArtRect } from './source-art-catalog';

/**
 * The reviewed extraction manifest for the environment sheets.
 *
 * `docs/ART_PIPELINE.md` ("Delivery and caching") says of the 23 owner-supplied
 * sheets: *"They remain a whole-sheet atlas until a later reviewed extraction
 * manifest selects individual variants."* This is that manifest. The generated
 * catalog (`public/game-content/source-art.v1.json`) describes each sheet as one
 * whole-sheet rectangle -- `tooling/build-source-art-catalog.mjs` writes
 * `sourceRectPx: {0, 0, 1448, 1086}` for every entry -- so which pixels of a
 * sheet are which piece of furniture is a judgement no generator made, and it
 * has to be recorded somewhere a reviewer can read. Here.
 *
 * ## How the rectangles were measured
 *
 * Not by eye. For each sheet the alpha channel was scanned for 8-connected
 * components of `alpha >= 16`, which isolates each rendered object on the
 * transparent sheet; the component's bounding box was then shrunk inwards while
 * any pixel on its outer row or column had `alpha < 240`. The threshold is 240
 * rather than 255 on purpose: these renders are not fully opaque, and their
 * interior alpha measures 252-253, so a "fully opaque" shrink collapses every
 * rectangle to nothing. Without the shrink the antialiased rim is included and
 * a tiled floor shows a one-pixel seam of whatever is behind it -- observed,
 * before the inset was applied.
 *
 * **The shrink is a rule for a frame that TILES, and the first frame that does
 * not tile does not follow it (`env.object.bed`, 2026-09-05).** The paragraph
 * above is kept rather than rewritten because it is still the whole method for
 * the four surface frames, and because the reason it stops is the interesting
 * part: an object is cut to be seen whole, so its outermost pixels are its own
 * silhouette -- a bed's head and foot rails -- and shrinking to `alpha >= 240`
 * removes them. An object frame is therefore the component's *bounding box*,
 * padded outwards with transparent sheet until the crop's aspect matches the
 * footprint it will be drawn into. Each such rectangle says so on itself.
 *
 * ## What is deliberately not here
 *
 * Only the sprites the renderer maps to something the simulation can produce
 * (`environment-art.ts`). A declared sprite costs its whole sheet's download,
 * because a sheet is delivered whole, so declaring art nothing draws would be
 * paid for in bytes on every first load. `environment-art.ts` records which
 * simulation identities are on the colour fallback and why.
 *
 * Nothing here touches Phaser or the DOM.
 */

/**
 * Every sprite this renderer can draw. A `Record` keyed by this union is how a
 * mapping row naming art that does not exist fails `tsc` rather than resolving
 * to a blank tile.
 */
export const ENVIRONMENT_SPRITE_IDS = [
  'env.floor.institutional',
  'env.wall.interior.face',
  'env.wall.interior.cap',
  'env.door.interior.face',
  'env.door.interior.cap',
  'env.object.bed',
] as const;

export type EnvironmentSpriteId = (typeof ENVIRONMENT_SPRITE_IDS)[number];

/**
 * A quarter-turn applied when the sprite is packed, not when it is drawn.
 *
 * A wall running north-south is seen in this projection almost entirely as its
 * cap, and no sheet holds a top-down wall cap: what the sheets hold is a front
 * elevation whose top band *is* that cap, running horizontally. Turning it in
 * the packer means the runtime draws an ordinary axis-aligned frame and the
 * rotation is a reviewable number in this file instead of a transform in the
 * painter.
 */
export type EnvironmentSpriteQuarterTurns = 0 | 1;

export interface EnvironmentSpriteDefinition {
  /** A `source-art.v1.json` asset id. The catalog names the file; this never does. */
  readonly assetId: string;
  /** The reviewed sub-rectangle of that sheet. */
  readonly sourceRectPx: SourceArtRect;
  /**
   * The size the crop is resampled to when it is packed, *before* any turn.
   *
   * Chosen so that the frame is drawn at exactly half scale in world units:
   * one 128px axis becomes one 64px tile (`TILE_SIZE_PX`). That keeps the art
   * crisp to zoom 2 and repeats a tiling frame on exact tile boundaries, so a
   * floor's joints and a wall's panel lines land on the grid the player builds
   * on rather than drifting across it.
   */
  readonly runtimeSizePx: { readonly width: number; readonly height: number };
  readonly quarterTurns: EnvironmentSpriteQuarterTurns;
  /** Why this rectangle and not another one. Read by nothing; the reason a reviewer can check it. */
  readonly note: string;
}

export const ENVIRONMENT_SPRITES: Readonly<Record<EnvironmentSpriteId, EnvironmentSpriteDefinition>> = {
  /**
   * The small clean swatch from the bottom-right of the linoleum sheet rather
   * than its large hero square top-left: the hero square carries a slightly
   * darker rim that reads as a grid line under every tile when it is repeated,
   * and this one tiles without a visible seam.
   */
  'env.floor.institutional': {
    assetId: 'floor.linoleum.institutional',
    sourceRectPx: { x: 732, y: 711, width: 304, height: 304 },
    runtimeSizePx: { width: 128, height: 128 },
    quarterTurns: 0,
    note: 'Speckled institutional linoleum, square swatch, tiles seamlessly at one tile per repeat.',
  },
  /**
   * A centre slice of the frontal wall module, not the whole module. The module
   * is 488x273 -- 1.79 tiles wide for one tile of height -- so drawing it whole
   * on a one-tile wall squashes it; a 290-wide slice is one tile at the same
   * scale, and repeats with its own panel joint landing on each tile boundary.
   */
  'env.wall.interior.face': {
    assetId: 'wall.interior.modules',
    sourceRectPx: { x: 150, y: 672, width: 290, height: 273 },
    runtimeSizePx: { width: 128, height: 124 },
    quarterTurns: 0,
    note: 'Frontal interior wall elevation: coping band, plaster, dark skirting. Drawn on east-west walls.',
  },
  /**
   * The coping band alone, turned a quarter. This is the only top-down wall
   * surface any sheet contains, and it is an approximation: the sheets hold
   * elevations and three-quarter views, never a cap seen from directly above.
   */
  'env.wall.interior.cap': {
    assetId: 'wall.interior.modules',
    sourceRectPx: { x: 150, y: 672, width: 290, height: 30 },
    runtimeSizePx: { width: 128, height: 28 },
    quarterTurns: 1,
    note: 'Top coping of the same wall module, turned to run north-south. Drawn on north-south walls.',
  },
  'env.door.interior.face': {
    assetId: 'door.interior.variants',
    sourceRectPx: { x: 48, y: 25, width: 255, height: 467 },
    runtimeSizePx: { width: 128, height: 124 },
    quarterTurns: 0,
    note: 'Closed interior door, frontal, with its frame. Drawn on east-west door edges.',
  },
  'env.door.interior.cap': {
    assetId: 'door.interior.variants',
    sourceRectPx: { x: 48, y: 25, width: 255, height: 22 },
    runtimeSizePx: { width: 128, height: 28 },
    quarterTurns: 1,
    note: 'Head of the same door frame, turned to run north-south. Drawn on north-south door edges.',
  },
  /**
   * The one *top-down* bed on the sheet, and the first frame here that is a
   * whole object rather than a slice of a surface.
   *
   * The sheet holds eight renders in two rows of four: three-quarter views, a
   * side elevation, a head-on view, and -- second row of the upper block --
   * one bed photographed from directly above, made, with the pillow to the
   * west. That last one is the only view this projection can use, because
   * `tile-layer.ts` draws the world from directly above and slightly in front
   * and an object sprite is a flat frame with no elevation of its own.
   *
   * **Measured with the alpha scan this file's header describes, but with its
   * *shrink* step deliberately omitted, and that is a real divergence rather
   * than an oversight.** The shrink exists so a *tiling* frame carries no
   * antialiased rim to smear into a seam; on a discrete object it would eat
   * the bed's own frame -- the tubular head and foot rails are the outermost
   * pixels and are exactly the ones a shrink to `alpha >= 240` discards. What
   * is used instead is the 8-connected component's bounding box: 428x197 at
   * (757, 305), which is the whole bed and nothing else (79,571 opaque pixels
   * inside the rect, and the same figure for the component alone).
   *
   * **Then padded outwards with transparent sheet to 460x230 at (740, 288),
   * which is exactly 2:1.** `object.bed`'s footprint is 1x2 tiles, so the
   * frame is drawn into a 1x2 rectangle; cutting the tight 428x197 box would
   * have resampled 2.172:1 into 2:1 and stretched the bed 8% along its length.
   * Padding is free -- the sheet is transparent between renders, and the
   * nearest other component is more than 6px outside this rectangle on every
   * side, so the crop carries no fragment of a neighbour and its own border
   * rows and columns are fully transparent.
   *
   * The turn is the same mechanism the wall caps use and is needed for the
   * same reason: the bed is authored lying east-west and stands north-south.
   * `environment-textures.ts` turns clockwise, so the pillow ends up at the
   * bed's northern end.
   */
  'env.object.bed': {
    assetId: 'furniture.cell.bed.single.variants',
    sourceRectPx: { x: 740, y: 288, width: 460, height: 230 },
    runtimeSizePx: { width: 256, height: 128 },
    quarterTurns: 1,
    note: 'Single bed seen from directly above, made, pillow to the north once turned. Drawn on object.bed.',
  },
};

/** The frame's size once its quarter-turn has been applied: what the atlas actually holds. */
export function environmentFrameSize(definition: EnvironmentSpriteDefinition): {
  readonly width: number;
  readonly height: number;
} {
  const { width, height } = definition.runtimeSizePx;
  return definition.quarterTurns === 0 ? { width, height } : { width: height, height: width };
}

/** Distinct sheets the declared sprites need, sorted. One download each. */
export function environmentSourceAssetIds(
  sprites: Readonly<Record<EnvironmentSpriteId, EnvironmentSpriteDefinition>> = ENVIRONMENT_SPRITES,
): readonly string[] {
  const ids = new Set<string>();
  for (const id of ENVIRONMENT_SPRITE_IDS) ids.add(sprites[id].assetId);
  return [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
