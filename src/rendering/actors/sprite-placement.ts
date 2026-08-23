import type { AtlasFrameRect } from '../assets/atlas-manifest';
import { ACTOR_FOOTPRINT_TILES, TILE_SIZE_PX } from '../tile-metrics';

/**
 * Where a foot-pivoted atlas frame goes.
 *
 * `assets/contracts/character-8-direction.contract.json` puts every character
 * frame at 256x384 with its foot pivot at (128, 352) and a 1x1 logical
 * footprint. The consequence the renderer has to honour is that the *pivot*,
 * not the frame's corner or centre, sits on the actor's world position --
 * otherwise sprites float above or sink into their tile, and differently per
 * role if the pivots ever diverge.
 *
 * This is the only place that maths lives, so a placement preview and the live
 * renderer cannot disagree. Pure and Phaser-free.
 */

export interface FootPivotFrame {
  readonly rect: AtlasFrameRect;
  readonly footPivotPx: { readonly x: number; readonly y: number };
}

/**
 * Fields are mutable and the result is filled in place, because the actor
 * layer computes one of these per visible actor per frame and per-frame
 * garbage at thousands of actors is a cost, not a detail. Callers treat it as
 * a value: nothing keeps a reference past the call that filled it.
 */
export interface SpritePlacement {
  /** World position of the pivot -- what a display object's x/y is set to. */
  x: number;
  y: number;
  /** Normalised origin inside the frame, so the display object's x/y *is* the pivot. */
  originX: number;
  originY: number;
  scale: number;
  displayWidth: number;
  displayHeight: number;
  /** Frame corner in world space. Not needed to draw, but it is what culling and tests check. */
  topLeftX: number;
  topLeftY: number;
}

export function createSpritePlacement(): SpritePlacement {
  return { x: 0, y: 0, originX: 0, originY: 0, scale: 1, displayWidth: 0, displayHeight: 0, topLeftX: 0, topLeftY: 0 };
}

export interface FootPivotPlacementOptions {
  readonly tileSizePx?: number;
  /** How many tiles wide the frame is drawn, from the art contract's logical footprint. */
  readonly footprintTiles?: number;
}

export function placeFootPivotSprite(
  footWorldX: number,
  footWorldY: number,
  frame: FootPivotFrame,
  options: FootPivotPlacementOptions = {},
  out: SpritePlacement = createSpritePlacement(),
): SpritePlacement {
  if (!Number.isFinite(footWorldX) || !Number.isFinite(footWorldY)) {
    throw new RangeError('Foot position must be finite.');
  }

  const tileSizePx = options.tileSizePx ?? TILE_SIZE_PX;
  const footprintTiles = options.footprintTiles ?? ACTOR_FOOTPRINT_TILES;
  if (!Number.isFinite(tileSizePx) || tileSizePx <= 0) throw new RangeError('Tile size must be positive and finite.');
  if (!Number.isFinite(footprintTiles) || footprintTiles <= 0) {
    throw new RangeError('Sprite footprint must be positive and finite.');
  }
  if (frame.rect.width <= 0 || frame.rect.height <= 0) throw new RangeError('Frame rectangle must have positive size.');

  const scale = (tileSizePx * footprintTiles) / frame.rect.width;

  out.x = footWorldX;
  out.y = footWorldY;
  out.originX = frame.footPivotPx.x / frame.rect.width;
  out.originY = frame.footPivotPx.y / frame.rect.height;
  out.scale = scale;
  out.displayWidth = frame.rect.width * scale;
  out.displayHeight = frame.rect.height * scale;
  out.topLeftX = footWorldX - frame.footPivotPx.x * scale;
  out.topLeftY = footWorldY - frame.footPivotPx.y * scale;
  return out;
}
