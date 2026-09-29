import { describe, expect, it } from 'vitest';
import {
  groundToScreen,
  screenToGround,
  visibleGroundBounds,
  changeObliquePoseAtScreenPoint,
  zoomObliqueCameraAtScreenPoint,
  panObliqueCameraByScreenDelta,
  obliqueFromTopDown,
  fitObliqueGroundRectangle,
  type ObliqueCameraState,
} from '../../src/rendering/camera/oblique-projection';

describe('oblique ground-plane projection', () => {
  const camera: ObliqueCameraState = {
    target: { x: 100, y: 200 },
    viewport: { width: 1920, height: 1080 },
    zoom: 2,
    yawRadians: 0,
    elevationRadians: Math.PI / 6,
  };

  it('projects absolute world positions, including height, at a 30-degree elevation', () => {
    expect(groundToScreen({ x: 110, y: 220, z: 0 }, camera)).toEqual({ x: 980, y: 560 });
    const elevated = groundToScreen({ x: 110, y: 220, z: 10 }, camera);
    expect(elevated.x).toBe(980);
    expect(elevated.y).toBeCloseTo(542.6794919, 6);
  });

  it('rotates the ground axes 90 degrees without moving the selected world square', () => {
    const rotated = { ...camera, yawRadians: Math.PI / 2 };
    const screen = groundToScreen({ x: 110, y: 220 }, rotated);
    expect(screen.x).toBe(920);
    expect(screen.y).toBe(550);
    const ground = screenToGround(screen, rotated);
    expect(ground.x).toBeCloseTo(110, 9);
    expect(ground.y).toBeCloseTo(220, 9);
  });

  it('anchors the same ground position below an off-centre cursor when changing yaw and elevation', () => {
    const pointer = { x: 520, y: 310 };
    const groundBefore = screenToGround(pointer, camera);
    const turned = changeObliquePoseAtScreenPoint(camera, pointer, Math.PI / 3, Math.PI / 4);
    const groundAfter = screenToGround(pointer, turned);
    expect(groundAfter.x).toBeCloseTo(groundBefore.x, 9);
    expect(groundAfter.y).toBeCloseTo(groundBefore.y, 9);
    expect(turned.yawRadians).toBe(Math.PI / 3);
    expect(turned.elevationRadians).toBe(Math.PI / 4);
  });

  it('keeps the exact pointed ground position under the cursor while zooming at an angle', () => {
    const angled = { ...camera, yawRadians: Math.PI / 4, elevationRadians: Math.PI / 3 };
    const pointer = { x: 1330, y: 710 };
    const before = screenToGround(pointer, angled);
    const zoomed = zoomObliqueCameraAtScreenPoint(angled, pointer, 2.5);
    const after = screenToGround(pointer, zoomed);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it('pans along screen axes at an angle without changing zoom or orientation', () => {
    const angled = { ...camera, yawRadians: -Math.PI / 4, elevationRadians: Math.PI / 3 };
    const source = screenToGround({ x: 1020, y: 590 }, angled);
    const panned = panObliqueCameraByScreenDelta(angled, 60, 50);
    expect(groundToScreen(source, panned).x).toBeCloseTo(960, 9);
    expect(groundToScreen(source, panned).y).toBeCloseTo(540, 9);
    expect(panned.zoom).toBe(angled.zoom);
    expect(panned.yawRadians).toBe(angled.yawRadians);
  });

  it('culls by the inverse projection of all four viewport corners', () => {
    const bounds = visibleGroundBounds(camera);
    expect(bounds.left).toBe(-380);
    expect(bounds.right).toBe(580);
    expect(bounds.top).toBeCloseTo(-340, 9);
    expect(bounds.bottom).toBeCloseTo(740, 9);
  });

  it('starts at the existing Phaser camera position without a tile jump', () => {
    const topDown = { scroll: { x: -20, y: 10 }, zoom: 2, viewport: { width: 800, height: 600 } };
    const bridged = obliqueFromTopDown(topDown);
    expect(bridged.target).toEqual({ x: 380, y: 310 });
    expect(groundToScreen({ x: 330, y: 220 }, bridged).x).toBeCloseTo(300, 9);
    expect(groundToScreen({ x: 330, y: 220 }, bridged).y).toBeCloseTo(120, 9);
  });

  it('rejects a flat or invalid camera before picking tiles', () => {
    expect(() => screenToGround({ x: 0, y: 0 }, { ...camera, elevationRadians: 0 })).toThrow(RangeError);
    expect(() => groundToScreen({ x: 0, y: 0 }, { ...camera, zoom: 0 })).toThrow(RangeError);
    expect(() => groundToScreen({ x: 0, y: 0 }, { ...camera, yawRadians: Number.NaN })).toThrow(RangeError);
  });

  it('fits every corner of a 7 by 16 tile plan within the Full HD world opening', () => {
    const world = { left: 10 * 128, top: 10 * 128, right: 17 * 128, bottom: 26 * 128 };
    const safe = { left: 1920 * 0.21, top: 1080 * 0.17, right: 1920 * 0.79, bottom: 1080 * 0.83 };
    const corners = [
      { x: world.left, y: world.top }, { x: world.right, y: world.top },
      { x: world.right, y: world.bottom }, { x: world.left, y: world.bottom },
    ];
    for (const yawRadians of [-Math.PI / 4, 0, Math.PI / 4]) {
      const initial: ObliqueCameraState = {
        target: { x: 16 * 128, y: 16 * 128 }, viewport: { width: 1920, height: 1080 },
        zoom: 1.25, yawRadians, elevationRadians: Math.PI / 4,
      };
      const before = corners.map((corner) => groundToScreen(corner, initial));
      expect(before.some((point) => point.x < safe.left || point.x > safe.right || point.y < safe.top || point.y > safe.bottom)).toBe(true);
      const fitted = fitObliqueGroundRectangle(initial, world, safe, 0.2, 3);
      expect(fitted.yawRadians).toBe(yawRadians);
      for (const corner of corners) {
        const point = groundToScreen(corner, fitted);
        expect(point.x).toBeGreaterThanOrEqual(safe.left - 0.001);
        expect(point.x).toBeLessThanOrEqual(safe.right + 0.001);
        expect(point.y).toBeGreaterThanOrEqual(safe.top - 0.001);
        expect(point.y).toBeLessThanOrEqual(safe.bottom + 0.001);
        const picked = screenToGround(point, fitted);
        expect(picked.x).toBeCloseTo(corner.x, 8);
        expect(picked.y).toBeCloseTo(corner.y, 8);
      }
    }
  });

  it('moves the fitted centre when the HUD leaves an asymmetric screen opening', () => {
    const initial: ObliqueCameraState = {
      target: { x: 0, y: 0 }, viewport: { width: 1600, height: 900 },
      zoom: 1, yawRadians: -Math.PI / 4, elevationRadians: Math.PI / 4,
    };
    const fitted = fitObliqueGroundRectangle(initial,
      { left: 100, top: 200, right: 500, bottom: 600 },
      { left: 400, top: 100, right: 1200, bottom: 700 }, 0.2, 3);
    const centre = groundToScreen({ x: 300, y: 400 }, fitted);
    expect(centre.x).toBeCloseTo(800, 8);
    expect(centre.y).toBeCloseTo(400, 8);
  });
});
