import { TILE_SIZE_PX } from '../tile-metrics';
import { groundToScreen, type ObliqueCameraState } from './oblique-projection';
import type { Point } from './coordinates';

/** Clockwise ground footprint of one whole logical square. */
export type TileQuad = readonly [Point, Point, Point, Point];

export function projectedTileQuad(tileX: number, tileY: number, camera: ObliqueCameraState): TileQuad {
  if (!Number.isInteger(tileX) || !Number.isInteger(tileY)) throw new RangeError('Tile coordinates must be integers.');
  const x = tileX * TILE_SIZE_PX;
  const y = tileY * TILE_SIZE_PX;
  return [
    groundToScreen({ x, y }, camera),
    groundToScreen({ x: x + TILE_SIZE_PX, y }, camera),
    groundToScreen({ x: x + TILE_SIZE_PX, y: y + TILE_SIZE_PX }, camera),
    groundToScreen({ x, y: y + TILE_SIZE_PX }, camera),
  ];
}

export interface ProjectedWallPrism {
  /** Exactly the filled construction/collision square, independent of height. */
  readonly footprint: TileQuad;
  readonly top: TileQuad;
  readonly heightTiles: number;
}

/** A projected rectangular footprint with a raised top, in world units. */
export function projectedRectPrism(
  x: number,
  y: number,
  width: number,
  depth: number,
  height: number,
  camera: ObliqueCameraState,
): { readonly footprint: TileQuad; readonly top: TileQuad } {
  if (![x, y, width, depth, height].every(Number.isFinite) || width <= 0 || depth <= 0 || height <= 0) {
    throw new RangeError('Projected prism dimensions must be positive and finite.');
  }
  const footprint: TileQuad = [
    groundToScreen({ x, y }, camera),
    groundToScreen({ x: x + width, y }, camera),
    groundToScreen({ x: x + width, y: y + depth }, camera),
    groundToScreen({ x, y: y + depth }, camera),
  ];
  const top: TileQuad = [
    groundToScreen({ x, y, z: height }, camera),
    groundToScreen({ x: x + width, y, z: height }, camera),
    groundToScreen({ x: x + width, y: y + depth, z: height }, camera),
    groundToScreen({ x, y: y + depth, z: height }, camera),
  ];
  return { footprint, top };
}

/**
 * View-only full-square wall volume. Swapping full/cutaway height must never
 * move the base polygon that placement, selection and pathfinding refer to.
 */
export function projectedWallPrism(
  tileX: number,
  tileY: number,
  heightTiles: number,
  camera: ObliqueCameraState,
): ProjectedWallPrism {
  if (!Number.isFinite(heightTiles) || heightTiles <= 0) throw new RangeError('Wall height must be positive and finite.');
  const x = tileX * TILE_SIZE_PX;
  const y = tileY * TILE_SIZE_PX;
  const z = heightTiles * TILE_SIZE_PX;
  const { footprint, top } = projectedRectPrism(x, y, TILE_SIZE_PX, TILE_SIZE_PX, z, camera);
  return { footprint, top, heightTiles };
}

/** Base-foot depth replaces fixed southern-row sorting when the camera yaws. */
export function obliqueDepthForAnchor(world: Point, yawRadians: number): number {
  if (!Number.isFinite(world.x) || !Number.isFinite(world.y) || !Number.isFinite(yawRadians)) {
    throw new RangeError('Anchor and yaw must be finite.');
  }
  return Math.sin(yawRadians) * world.x + Math.cos(yawRadians) * world.y;
}
