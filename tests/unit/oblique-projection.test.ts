import { describe, expect, it } from 'vitest';
import {
  groundToScreen,
  screenToGround,
  visibleGroundBounds,
  changeObliquePoseAtScreenPoint,
  zoomObliqueAtScreenPoint,
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

  it('keeps the ground square beneath an off-centre wheel cursor across shallow and steep camera poses', () => {
    const pointer = { x: 1410, y: 760 };
    for (const yawDegrees of [37, 217]) {
      for (const elevationDegrees of [25, 65]) {
        const angled = {
          ...camera,
          yawRadians: yawDegrees * Math.PI / 180,
          elevationRadians: elevationDegrees * Math.PI / 180,
        };
        const groundBefore = screenToGround(pointer, angled);
        const zoomed = zoomObliqueAtScreenPoint(angled, pointer, angled.zoom * 1.25);
        const groundAfter = screenToGround(pointer, zoomed);
        expect(groundAfter.x).toBeCloseTo(groundBefore.x, 8);
        expect(groundAfter.y).toBeCloseTo(groundBefore.y, 8);
        expect(zoomed.zoom).toBe(angled.zoom * 1.25);
        expect(zoomed.yawRadians).toBe(angled.yawRadians);
        expect(zoomed.elevationRadians).toBe(angled.elevationRadians);
      }
    }
  });

  it('keeps the camera target when a keyboard or HUD zoom uses the viewport centre', () => {
    const centre = { x: camera.viewport.width / 2, y: camera.viewport.height / 2 };
    const zoomed = zoomObliqueAtScreenPoint(camera, centre, camera.zoom / 1.25);
    expect(zoomed.target.x).toBeCloseTo(camera.target.x, 9);
    expect(zoomed.target.y).toBeCloseTo(camera.target.y, 9);
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
