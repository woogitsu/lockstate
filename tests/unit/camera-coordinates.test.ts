import { describe, expect, it } from 'vitest';
import { clampZoom, screenToWorld, tileRangeInBounds, visibleWorldBounds, worldToScreen, zoomAtScreenPoint } from '../../src/rendering/camera';

/**
 * Every assertion here is an **absolute** expected coordinate, worked out by
 * hand from Phaser's camera maths and written down as a literal.
 *
 * That is deliberate and it is the point of issue #115. This file used to
 * assert `screenToWorld(worldToScreen(p)) === p`, which is a round trip
 * against the function's own inverse: it passes for *any* invertible
 * transform, so it passed for two years while both functions disagreed with
 * the renderer they exist to serve. A literal cannot do that -- get the model
 * wrong and the number is wrong.
 *
 * These stay the fast, primary proof. What they cannot do is show that the
 * model matches the Phaser build actually installed, because a headless test
 * has no camera to compare against -- `docs/TESTING.md` keeps Phaser out of
 * the default environment. That comparison is
 * `tests/browser/camera-coordinates.spec.ts`, which reads the real camera's
 * `originX`/`originY` and its `getWorldPoint`/`worldView` answers. Neither
 * layer is sufficient alone.
 */
describe('camera coordinate contract', () => {
  // origin = viewport / 2 = (400, 300): the point Phaser scales zoom about.
  const camera = { scroll: { x: -20, y: 10 }, zoom: 2, viewport: { width: 800, height: 600 } };

  it('converts a screen point using the viewport centre as the zoom origin', () => {
    // -20 + 400 + (300 - 400) / 2 = 330, and 10 + 300 + (120 - 300) / 2 = 220.
    expect(screenToWorld({ x: 300, y: 120 }, camera)).toEqual({ x: 330, y: 220 });
    expect(worldToScreen({ x: 330, y: 220 }, camera)).toEqual({ x: 300, y: 120 });
  });

  it('round-trips world and screen points at negative coordinates', () => {
    // Kept as a cheap sanity check on the pair, *never* as the proof: it is
    // the assertion that let #115 ship.
    const world = { x: -6.25, y: 41.5 };
    expect(screenToWorld(worldToScreen(world, camera), camera)).toEqual(world);
  });

  it('agrees with a top-left zoom model at zoom 1, and only there', () => {
    // Why the defect shipped: nothing calls `setZoom` at startup, so the app
    // loads at Phaser's default zoom of 1, where the two origin terms cancel
    // and the wrong model is indistinguishable from the right one. Anyone who
    // tested the build tool without touching the scroll wheel saw it work.
    const topLeftModel = (screen: { x: number; y: number }, state: { scroll: { x: number; y: number }; zoom: number }) => ({
      x: state.scroll.x + screen.x / state.zoom,
      y: state.scroll.y + screen.y / state.zoom,
    });
    const viewport = { width: 1280, height: 720 };
    const screen = { x: 200, y: 150 };

    const atOne = { scroll: { x: 96, y: -32 }, zoom: 1, viewport };
    expect(screenToWorld(screen, atOne)).toEqual(topLeftModel(screen, atOne));

    // Zoomed out to half, the owner's reported case: the old model answers
    // with a world point 640 x 360 further along both axes -- exactly
    // `origin * (1 / zoom - 1)` -- so the wall landed down and to the right of
    // the cursor that placed it.
    const halfZoom = { scroll: { x: 96, y: -32 }, zoom: 0.5, viewport };
    const correct = screenToWorld(screen, halfZoom);
    const wrong = topLeftModel(screen, halfZoom);
    expect({ x: wrong.x - correct.x, y: wrong.y - correct.y }).toEqual({ x: 640, y: 360 });
  });

  it('clamps zoom and holds the world point under the cursor', () => {
    const pointer = { x: 300, y: 120 };
    const zoomed = zoomAtScreenPoint(camera, pointer, 99, { min: 0.5, max: 4 });
    expect(zoomed.zoom).toBe(4);
    // 330 - 400 - (300 - 400) / 4 = -45, and 220 - 300 - (120 - 300) / 4 = -35.
    expect(zoomed.scroll).toEqual({ x: -45, y: -35 });
    expect(zoomed.viewport).toEqual(camera.viewport);
    expect(screenToWorld(pointer, zoomed)).toEqual(screenToWorld(pointer, camera));
    expect(clampZoom(0.1, { min: 0.5, max: 4 })).toBe(0.5);
  });

  it('reports visible-world and integer tile bounds independent of DPR', () => {
    // 800 screen pixels at zoom 2 is 400 world units wide, centred on
    // `scroll + viewport / 2` = (380, 310): left 180, right 580.
    expect(visibleWorldBounds(camera)).toEqual({ left: 180, top: 160, right: 580, bottom: 460 });
    expect(tileRangeInBounds({ left: -0.1, top: 0.1, right: 2.1, bottom: 3 })).toEqual({ minX: -1, maxX: 3, minY: 0, maxY: 3 });
  });

  it('rejects invalid camera values at the public boundary', () => {
    expect(() => clampZoom(1, { min: 4, max: 1 })).toThrow(RangeError);
    expect(() =>
      screenToWorld({ x: 0, y: 0 }, { scroll: { x: 0, y: 0 }, zoom: 0, viewport: { width: 800, height: 600 } }),
    ).toThrow(RangeError);
    // A zero-sized viewport has no centre to zoom about, so it is rejected
    // rather than silently dividing the origin by nothing.
    expect(() =>
      screenToWorld({ x: 0, y: 0 }, { scroll: { x: 0, y: 0 }, zoom: 1, viewport: { width: 0, height: 600 } }),
    ).toThrow(RangeError);
  });
});
