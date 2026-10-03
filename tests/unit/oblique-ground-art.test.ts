import { describe, expect, it } from 'vitest';
import { obliqueFloorBatches } from '../../src/rendering/camera/oblique-ground-art';
import { projectedTileQuad } from '../../src/rendering/camera/oblique-geometry';
import type { ObliqueGroundTile } from '../../src/rendering/camera/oblique-world-projection';

describe('authored floor projection', () => {
  it('joins adjacent full UV tiles exactly at intermediate yaw and elevation', () => {
    const pose = { target: { x: 0, y: 0 }, viewport: { width: 1920, height: 1080 }, zoom: 1.25,
      yawRadians: 37 * Math.PI / 180, elevationRadians: 53 * Math.PI / 180 };
    const ground: ObliqueGroundTile[] = [3, 4].map((x) => ({
      tileX: x, tileY: 2, quad: projectedTileQuad(x, 2, pose), fill: 0, zoningTint: undefined,
      owned: true, floorSprite: 'env.floor.kitchen',
    }));
    const [batch] = obliqueFloorBatches(ground);
    expect(batch?.assetId).toBe('floor.kitchen.nonslip');
    expect(batch?.vertices).toHaveLength(32);
    expect(batch?.indices).toEqual([0, 1, 2, 0, 0, 2, 3, 0, 4, 5, 6, 0, 4, 6, 7, 0]);
    for (let tile = 0; tile < 2; tile += 1) {
      for (let corner = 0; corner < 4; corner += 1) {
        expect(batch?.vertices.slice(tile * 16 + corner * 4, tile * 16 + corner * 4 + 2))
          .toEqual([ground[tile]!.quad[corner]!.x, ground[tile]!.quad[corner]!.y]);
      }
    }
    expect(batch?.vertices.slice(4, 6)).toEqual(batch?.vertices.slice(16, 18));
    expect(batch?.vertices.slice(8, 10)).toEqual(batch?.vertices.slice(28, 30));
    expect(batch?.vertices.slice(2, 4)).toEqual([0, 0]);
    expect(batch?.vertices.slice(10, 12)).toEqual([1, 1]);
  });

  it('retains a separate material batch and omits declared unknown-art fallback', () => {
    const quad = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] as const;
    const base = { tileX: 0, tileY: 0, quad, fill: 0, zoningTint: undefined, owned: true };
    expect(obliqueFloorBatches([base, { ...base, floorSprite: 'env.floor.yard' },
      { ...base, floorSprite: 'env.terrain.grass' }]).map((batch) => batch.assetId))
      .toEqual(['floor.yard.compacted-earth', 'terrain.grass.mown']);
  });
});
