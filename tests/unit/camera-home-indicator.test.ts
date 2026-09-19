import { describe, expect, it } from 'vitest';
import { type CameraState, offscreenHomeIndicator } from '../../src/rendering/camera';

/**
 * `offscreenHomeIndicator` -- the marker that tells a player which way their
 * prison is when it has left the viewport (issue #794).
 *
 * Every expectation below is an **absolute** number worked out by hand from
 * `docs/CAMERA.md`'s transform, for the reason that document already gives
 * about `camera-coordinates.test.ts`: a round trip through the module's own
 * arithmetic passes for any self-consistent implementation, including a wrong
 * one. The companion real-browser gate is
 * `tests/browser/world-scene-home-indicator.spec.ts`, which drives the same
 * function through the scene against a live Phaser camera.
 *
 * The fixture is a 1000x600 viewport at zoom 1 and scroll `0,0`. At zoom 1 the
 * origin terms of `screenToWorld` cancel, so the visible world rectangle is
 * exactly `0..1000` by `0..600` and the hand arithmetic below is readable.
 */
const CAMERA: CameraState = { scroll: { x: 0, y: 0 }, zoom: 1, viewport: { width: 1000, height: 600 } };

/** Half the viewport minus this is how far the marker may ride from the centre. */
const INSET = 50;

const degrees = (radians: number): number => (radians * 180) / Math.PI;

describe('offscreenHomeIndicator', () => {
  it('says nothing while any part of the prison is on screen', () => {
    // Overlaps the visible rectangle at its bottom-right corner only.
    expect(offscreenHomeIndicator(CAMERA, { left: 900, top: 500, right: 1200, bottom: 800 }, INSET)).toBeUndefined();
  });

  it('says nothing when the camera is inside a prison larger than the viewport', () => {
    // The state a distance-from-centre test would get wrong: the centre is far
    // away and yet the player is standing in the middle of their own prison.
    expect(offscreenHomeIndicator(CAMERA, { left: -5000, top: -5000, right: 5000, bottom: 5000 }, INSET)).toBeUndefined();
  });

  it('points straight right, on the right-hand inset edge, for a prison due east', () => {
    // Centre (2000, 300) -> screen (2000, 300); dx = 1500, dy = 0.
    // reachX = 500 - 50 = 450, so the ray is scaled by 450 / 1500 = 0.3 and
    // lands at 500 + 450 = 950, on the viewport's vertical middle.
    const indicator = offscreenHomeIndicator(CAMERA, { left: 1900, top: 200, right: 2100, bottom: 400 }, INSET);
    expect(indicator).toBeDefined();
    expect(indicator?.position.x).toBeCloseTo(950, 10);
    expect(indicator?.position.y).toBeCloseTo(300, 10);
    expect(degrees(indicator?.angleRadians ?? Number.NaN)).toBeCloseTo(0, 10);
  });

  it('rides the nearer edge and points back along the ray for a prison up and to the left', () => {
    // Centre (-500, -300) -> screen (-500, -300); dx = -1000, dy = -600.
    // 450 / 1000 = 0.45 against 250 / 600 = 0.41666..., so the vertical edge is
    // the binding one: y lands exactly on 300 - 250 = 50 and x on
    // 500 - 1000 * (5/12) = 83.3333...
    // The bearing is atan2(-600, -1000): a reference angle of
    // arctan(0.6) = 30.9637565 degrees in the third screen quadrant, i.e.
    // -(180 - 30.9637565).
    const indicator = offscreenHomeIndicator(CAMERA, { left: -600, top: -400, right: -400, bottom: -200 }, INSET);
    expect(indicator).toBeDefined();
    expect(indicator?.position.y).toBeCloseTo(50, 10);
    expect(indicator?.position.x).toBeCloseTo(500 - 1000 * (5 / 12), 10);
    expect(degrees(indicator?.angleRadians ?? Number.NaN)).toBeCloseTo(-149.0362435, 6);
  });

  it('is decided by what the viewport shows and not by world distance', () => {
    // The same prison and the same scroll as the "due east" case above, zoomed
    // out: the visible rectangle becomes -2000..3000, the prison is on screen,
    // and the marker must stop. A test written against a distance would pass
    // here while the marker sat on the edge of a view already showing it.
    const zoomedOut: CameraState = { ...CAMERA, zoom: 0.2 };
    expect(offscreenHomeIndicator(zoomedOut, { left: 1900, top: 200, right: 2100, bottom: 400 }, INSET)).toBeUndefined();
    expect(offscreenHomeIndicator(CAMERA, { left: 1900, top: 200, right: 2100, bottom: 400 }, INSET)).toBeDefined();
  });

  it('refuses an inverted rectangle and a negative inset', () => {
    expect(() => offscreenHomeIndicator(CAMERA, { left: 2100, top: 200, right: 1900, bottom: 400 }, INSET)).toThrow(RangeError);
    expect(() => offscreenHomeIndicator(CAMERA, { left: 1900, top: 200, right: 2100, bottom: 400 }, -1)).toThrow(RangeError);
  });
});
