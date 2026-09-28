import { describe, expect, it } from 'vitest';
import {
  groundToScreen,
  screenToGround,
  visibleGroundBounds,
  changeObliquePoseAtScreenPoint,
  zoomObliqueCameraAtScreenPoint,
  panObliqueCameraByScreenDelta,
  obliqueFromTopDown,
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
});
