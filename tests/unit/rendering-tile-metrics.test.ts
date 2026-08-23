import { describe, expect, it } from 'vitest';
import {
  TILE_SIZE_PX,
  tileCentreToWorld,
  tileRangeArea,
  tileRangeContains,
  tileToWorld,
  visibleTileRange,
  worldToTile,
} from '../../src/rendering/tile-metrics';

/**
 * The tile/world conversion is the join between two coordinate systems that
 * must never drift: the simulation's integer tiles and the camera's continuous
 * world units (`docs/CAMERA.md`). These tests pin the join, including at
 * negative coordinates, which the world explicitly supports.
 */
describe('tile metrics', () => {
  it('places a tile corner and its centre a consistent half tile apart', () => {
    expect(tileToWorld(0)).toBe(0);
    expect(tileToWorld(3)).toBe(3 * TILE_SIZE_PX);
    expect(tileCentreToWorld(3) - tileToWorld(3)).toBe(TILE_SIZE_PX / 2);
    expect(tileCentreToWorld(-1)).toBe(-TILE_SIZE_PX / 2);
  });

  it('maps world coordinates back to whole tiles, including negative ones', () => {
    expect(worldToTile(0)).toBe(0);
    expect(worldToTile(TILE_SIZE_PX - 1)).toBe(0);
    expect(worldToTile(TILE_SIZE_PX)).toBe(1);
    expect(worldToTile(-1)).toBe(-1);
    expect(worldToTile(-TILE_SIZE_PX)).toBe(-1);
    expect(worldToTile(-TILE_SIZE_PX - 1)).toBe(-2);
  });

  it('round-trips a tile through its own centre', () => {
    for (const tile of [-9, -1, 0, 1, 17, 512]) {
      expect(worldToTile(tileCentreToWorld(tile))).toBe(tile);
    }
  });

  it('covers every tile the camera can see, with an optional margin', () => {
    const range = visibleTileRange({ left: 0, top: 0, right: TILE_SIZE_PX * 2.5, bottom: TILE_SIZE_PX * 1.5 });
    expect(range).toEqual({ minTileX: 0, maxTileX: 2, minTileY: 0, maxTileY: 1 });

    const grown = visibleTileRange({ left: 0, top: 0, right: TILE_SIZE_PX * 2.5, bottom: TILE_SIZE_PX * 1.5 }, 2);
    expect(grown).toEqual({ minTileX: -2, maxTileX: 4, minTileY: -2, maxTileY: 3 });
    expect(tileRangeArea(grown)).toBe(7 * 6);
  });

  it('tolerates inverted bounds rather than producing an empty range', () => {
    const range = visibleTileRange({ left: TILE_SIZE_PX * 3, top: TILE_SIZE_PX * 3, right: 0, bottom: 0 });
    expect(range).toEqual({ minTileX: 0, maxTileX: 3, minTileY: 0, maxTileY: 3 });
  });

  it('is the culling test the actor layer uses, inclusive at both edges', () => {
    const range = { minTileX: -1, maxTileX: 1, minTileY: 4, maxTileY: 6 };
    expect(tileRangeContains(range, -1, 4)).toBe(true);
    expect(tileRangeContains(range, 1, 6)).toBe(true);
    expect(tileRangeContains(range, 0.5, 5.5)).toBe(true);
    expect(tileRangeContains(range, -1.5, 5)).toBe(false);
    expect(tileRangeContains(range, 0, 6.5)).toBe(false);
  });

  it('rejects non-finite input instead of producing NaN geometry', () => {
    expect(() => tileToWorld(Number.NaN)).toThrow(RangeError);
    expect(() => worldToTile(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => visibleTileRange({ left: 0, top: 0, right: Number.NaN, bottom: 1 })).toThrow(RangeError);
    expect(() => visibleTileRange({ left: 0, top: 0, right: 1, bottom: 1 }, -1)).toThrow(RangeError);
  });
});
