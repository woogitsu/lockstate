import { describe, expect, it } from 'vitest';
import { obliqueDepthForAnchor, projectedTileQuad, projectedWallPrism } from '../../src/rendering/camera/oblique-geometry';
import type { ObliqueCameraState } from '../../src/rendering/camera/oblique-projection';

describe('square world geometry in an oblique camera', () => {
  const camera: ObliqueCameraState = {
    target: { x: 0, y: 0 },
    viewport: { width: 800, height: 600 },
    zoom: 1,
    yawRadians: 0,
    elevationRadians: Math.PI / 6,
  };

  it('draws the whole 1x1 tile rather than an edge line', () => {
    expect(projectedTileQuad(1, 2, camera)).toEqual([
      { x: 464, y: 364 },
      { x: 528, y: 364 },
      { x: 528, y: 396 },
      { x: 464, y: 396 },
    ]);
  });

  it('keeps the same occupied square when a near wall is cut down', () => {
    const full = projectedWallPrism(1, 2, 2.5, camera);
    const cutaway = projectedWallPrism(1, 2, 0.52, camera);
    expect(full.footprint).toEqual(cutaway.footprint);
    expect(full.footprint).toEqual(projectedTileQuad(1, 2, camera));
    expect(full.top[0].y).toBeCloseTo(225.4359, 3);
    expect(cutaway.top[0].y).toBeCloseTo(335.1787, 3);
    expect(full.top[0].y).toBeLessThan(cutaway.top[0].y);
  });

  it('rotates occlusion order with yaw instead of continuing to sort by south row', () => {
    expect(obliqueDepthForAnchor({ x: 64, y: 0 }, 0)).toBeCloseTo(0, 9);
    expect(obliqueDepthForAnchor({ x: 0, y: 64 }, 0)).toBeCloseTo(64, 9);
    expect(obliqueDepthForAnchor({ x: 64, y: 0 }, Math.PI / 2)).toBeCloseTo(64, 9);
    expect(obliqueDepthForAnchor({ x: 0, y: 64 }, Math.PI / 2)).toBeCloseTo(0, 9);
  });

  it('rejects fractional tile picks and empty wall heights', () => {
    expect(() => projectedTileQuad(1.5, 2, camera)).toThrow(RangeError);
    expect(() => projectedWallPrism(1, 2, 0, camera)).toThrow(RangeError);
  });
});
