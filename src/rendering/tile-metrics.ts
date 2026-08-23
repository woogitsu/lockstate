import type { WorldBounds } from './camera/coordinates';

/**
 * The one place the renderer decides how big a tile is in world units.
 *
 * `docs/CAMERA.md` defines world coordinates as continuous logical
 * coordinates and `zoom` as "screen pixels per world unit". It deliberately
 * does not say how many world units a tile spans, because that is a
 * presentation choice: the simulation addresses tiles as integers
 * (`src/simulation/world/coordinates.ts`) and never learns about pixels.
 *
 * Fixing it here rather than at each call site means a future art-scale
 * change is one constant, and means the culling maths below is the only
 * code that converts between the two spaces.
 *
 * 64 is chosen against the art rather than by taste: character frames are
 * authored 256px wide for a 1x1 tile footprint, so a 64px tile draws them at
 * a quarter scale and a close zoom approaches their native resolution. A
 * smaller tile would throw most of the authored detail away on every frame.
 */
export const TILE_SIZE_PX = 64;

/**
 * How many tiles wide a character atlas frame is drawn at.
 *
 * `assets/contracts/character-8-direction.contract.json` gives characters a
 * `logicalFootprintTiles` of 1x1, so one frame width is one tile and the
 * 384px-tall frame becomes 1.5 tiles tall. Held as a named constant so the
 * relationship to the contract is explicit rather than a magic `1`.
 */
export const ACTOR_FOOTPRINT_TILES = 1;

/** Inclusive tile bounds. */
export interface TileRange {
  readonly minTileX: number;
  readonly maxTileX: number;
  readonly minTileY: number;
  readonly maxTileY: number;
}

export interface TileBounds {
  readonly minTileX: number;
  readonly minTileY: number;
  readonly maxTileX: number;
  readonly maxTileY: number;
}

/** World coordinate of a tile's top-left corner. */
export function tileToWorld(tile: number): number {
  if (!Number.isFinite(tile)) throw new RangeError('Tile coordinate must be finite.');
  return tile * TILE_SIZE_PX;
}

/** World coordinate of a tile's centre -- where an actor standing on it plants its feet. */
export function tileCentreToWorld(tile: number): number {
  if (!Number.isFinite(tile)) throw new RangeError('Tile coordinate must be finite.');
  return (tile + 0.5) * TILE_SIZE_PX;
}

/** Tile containing a world coordinate. Floors, so negative space keeps whole tiles. */
export function worldToTile(world: number): number {
  if (!Number.isFinite(world)) throw new RangeError('World coordinate must be finite.');
  return Math.floor(world / TILE_SIZE_PX);
}

/**
 * Tiles a camera can see, optionally grown by a margin.
 *
 * This is the culling contract `docs/CAMERA.md` promises: it scales with the
 * viewport, never with the size of the world. A renderer that iterates this
 * range does bounded work no matter how much land the player owns.
 */
export function visibleTileRange(bounds: WorldBounds, marginTiles = 0): TileRange {
  if (!Number.isInteger(marginTiles) || marginTiles < 0) {
    throw new RangeError('Tile margin must be a non-negative integer.');
  }
  if (
    !Number.isFinite(bounds.left) ||
    !Number.isFinite(bounds.right) ||
    !Number.isFinite(bounds.top) ||
    !Number.isFinite(bounds.bottom)
  ) {
    throw new RangeError('Visible bounds must be finite.');
  }

  return {
    minTileX: worldToTile(Math.min(bounds.left, bounds.right)) - marginTiles,
    maxTileX: worldToTile(Math.max(bounds.left, bounds.right)) + marginTiles,
    minTileY: worldToTile(Math.min(bounds.top, bounds.bottom)) - marginTiles,
    maxTileY: worldToTile(Math.max(bounds.top, bounds.bottom)) + marginTiles,
  };
}

export function tileRangeContains(range: TileRange, tileX: number, tileY: number): boolean {
  return (
    tileX >= range.minTileX && tileX <= range.maxTileX && tileY >= range.minTileY && tileY <= range.maxTileY
  );
}

/** Tiles covered by a range, used to bound per-frame painting work. */
export function tileRangeArea(range: TileRange): number {
  const width = range.maxTileX - range.minTileX + 1;
  const height = range.maxTileY - range.minTileY + 1;
  return width <= 0 || height <= 0 ? 0 : width * height;
}
