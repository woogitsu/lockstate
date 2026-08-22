import { describe, expect, it } from 'vitest';
import { clampZoom, screenToWorld, tileRangeInBounds, visibleWorldBounds, worldToScreen, zoomAtScreenPoint } from '../../src/rendering/camera';

describe('camera coordinate contract', () => {
  const camera = { scroll: { x: -20, y: 10 }, zoom: 2 };

  it('round-trips world and screen points at negative coordinates', () => {
    const world = { x: -6.25, y: 41.5 };
    expect(screenToWorld(worldToScreen(world, camera), camera)).toEqual(world);
  });

  it('clamps zoom and retains the pointer world position', () => {
    const pointer = { x: 300, y: 120 };
    const before = screenToWorld(pointer, camera);
    const zoomed = zoomAtScreenPoint(camera, pointer, 99, { min: 0.5, max: 4 });
    expect(zoomed.zoom).toBe(4);
    expect(screenToWorld(pointer, zoomed)).toEqual(before);
    expect(clampZoom(0.1, { min: 0.5, max: 4 })).toBe(0.5);
  });

  it('reports visible-world and integer tile bounds independent of DPR', () => {
    const bounds = visibleWorldBounds(camera, { width: 800, height: 600 });
    expect(bounds).toEqual({ left: -20, top: 10, right: 380, bottom: 310 });
    expect(tileRangeInBounds({ left: -0.1, top: 0.1, right: 2.1, bottom: 3 })).toEqual({ minX: -1, maxX: 3, minY: 0, maxY: 3 });
  });

  it('rejects invalid camera values at the public boundary', () => {
    expect(() => clampZoom(1, { min: 4, max: 1 })).toThrow(RangeError);
    expect(() => screenToWorld({ x: 0, y: 0 }, { scroll: { x: 0, y: 0 }, zoom: 0 })).toThrow(RangeError);
  });
});
