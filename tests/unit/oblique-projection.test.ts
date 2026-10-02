import { describe, expect, it } from 'vitest';
import {
  groundToScreen,
  screenToGround,
  visibleGroundBounds,
  changeObliquePoseAtScreenPoint,
  panObliqueGroundAnchorToScreen,
  obliqueFromTopDown,
  type ObliqueCameraState,
} from '../../src/rendering/camera/oblique-projection';
import { pickTileAtWorld } from '../../src/rendering/build/area-picking';
import { TILE_SIZE_PX } from '../../src/rendering/tile-metrics';

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

  it('returns the authored square for projected interior picks at shallow intermediate angles', () => {
    // Camera dragging can stop between the 10-degree HUD steps. At the lowest
    // legal elevation a screen pixel covers more ground depth, so this is the
    // highest-risk range for a ghost and a command disagreeing on a square.
    for (const yawDegrees of [37, 143, 217, 323]) {
      for (const elevationDegrees of [20, 25, 65]) {
        const angled = {
          ...camera,
          target: { x: 16 * TILE_SIZE_PX, y: 16 * TILE_SIZE_PX },
          zoom: 1.25,
          yawRadians: yawDegrees * Math.PI / 180,
          elevationRadians: elevationDegrees * Math.PI / 180,
        };
        for (const tileX of [-1, 0, 15, 31, 32]) {
          for (const tileY of [-1, 0, 15, 31, 32]) {
            for (const inset of [0.001, TILE_SIZE_PX / 2, TILE_SIZE_PX - 0.001]) {
              const world = { x: tileX * TILE_SIZE_PX + inset, y: tileY * TILE_SIZE_PX + inset };
              const screen = groundToScreen(world, angled);
              expect(pickTileAtWorld(screenToGround(screen, angled))).toEqual({
                tileX, tileY, width: 1, height: 1,
              });
            }
          }
        }
      }
    }
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

  it('keeps the grabbed ground point beneath a middle-drag cursor at low and high angles', () => {
    for (const yawRadians of [0, Math.PI / 4, Math.PI]) {
      for (const elevationRadians of [Math.PI / 9, Math.PI / 3]) {
        const angled = { ...camera, yawRadians, elevationRadians };
        const anchor = screenToGround({ x: 720, y: 480 }, angled);
        const panned = panObliqueGroundAnchorToScreen(angled, anchor, { x: 900, y: 560 });
        const projected = groundToScreen(anchor, panned);
        expect(projected.x).toBeCloseTo(900, 8);
        expect(projected.y).toBeCloseTo(560, 8);
        expect(panned.yawRadians).toBe(yawRadians);
        expect(panned.elevationRadians).toBe(elevationRadians);
      }
    }
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
