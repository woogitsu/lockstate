import { describe, expect, it } from 'vitest';
import { computeObliqueFit, type ObliqueFitMode } from '../../src/rendering/camera/oblique-fit';
import { groundToScreen, screenToGround, type ObliqueCameraState } from '../../src/rendering/camera/oblique-projection';

const camera: ObliqueCameraState = {
  target: { x: 16 * 64, y: 16 * 64 },
  viewport: { width: 1920, height: 1080 },
  zoom: 1.25,
  yawRadians: -Math.PI / 4,
  elevationRadians: Math.PI / 4,
};
const groundBounds = { left: 10 * 64, top: 10 * 64, right: 17 * 64, bottom: 26 * 64 };
const safeScreenBounds = { left: 550, top: 94, right: 1556, bottom: 1080 };
const centre = { x: (groundBounds.left + groundBounds.right) / 2,
  y: (groundBounds.top + groundBounds.bottom) / 2 };

function candidate(mode: ObliqueFitMode, cursorScreen = { x: 1000, y: 500 }) {
  return computeObliqueFit({ camera, groundBounds, safeScreenBounds, cursorScreen, mode });
}

describe('honest Full HD fit candidates for a four-cell row', () => {
  it('zooms out while keeping the same ground point under the cursor', () => {
    const cursor = { x: 1000, y: 500 };
    const result = candidate('cursor-origin', cursor);
    expect(result.fits).toBe(true);
    expect(result.camera.zoom).toBeLessThan(camera.zoom);
    const before = screenToGround(cursor, camera);
    const after = screenToGround(cursor, result.camera);
    expect(after.x).toBeCloseTo(before.x, 7);
    expect(after.y).toBeCloseTo(before.y, 7);
  });

  it('reports impossible edge anchoring instead of claiming a clipped plan fits', () => {
    const result = candidate('cursor-origin', { x: 1550, y: 1070 });
    expect(result.requiredZoom).toBeLessThan(0.2);
    expect(result.camera.zoom).toBe(0.2);
    expect(result.fits).toBe(false);
    expect(result.projectedBounds.right > safeScreenBounds.right ||
      result.projectedBounds.bottom > safeScreenBounds.bottom).toBe(true);
  });

  it('centres the plan under the cursor in the second proposed mode', () => {
    const cursor = { x: 1000, y: 500 };
    const result = candidate('cursor-center', cursor);
    expect(result.fits).toBe(true);
    const position = groundToScreen(centre, result.camera);
    expect(position.x).toBeCloseTo(cursor.x, 7);
    expect(position.y).toBeCloseTo(cursor.y, 7);
  });

  it('pans the locked world footprint into the unobscured playfield', () => {
    const result = candidate('pan-locked', { x: 1550, y: 1070 });
    expect(result.fits).toBe(true);
    const position = groundToScreen(centre, result.camera);
    expect(position.x).toBeCloseTo((safeScreenBounds.left + safeScreenBounds.right) / 2, 7);
    expect(position.y).toBeCloseTo((safeScreenBounds.top + safeScreenBounds.bottom) / 2, 7);
    expect(result.projectedBounds.left).toBeGreaterThanOrEqual(safeScreenBounds.left - 0.01);
    expect(result.projectedBounds.bottom).toBeLessThanOrEqual(safeScreenBounds.bottom + 0.01);
  });

  it('rejects invalid rectangles before returning any camera state', () => {
    expect(() => computeObliqueFit({ camera, groundBounds: { ...groundBounds, right: groundBounds.left },
      safeScreenBounds, cursorScreen: { x: 960, y: 540 }, mode: 'pan-locked' })).toThrow(RangeError);
  });
});
