import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CAMERA_ORIENTATION,
  DEFAULT_ORIENTATION_BINDINGS,
  cameraOrientationReadout,
  orientationKeyIntent,
  orientationMouseIntents,
  reduceCameraOrientation,
  validateOrientationBindings,
} from '../../src/input/camera-orientation';

const free = { context: 'construction', placementInProgress: false } as const;

describe('dormant camera orientation input', () => {
  it('maps physical keys and accepts a safe remap without changing live pan bindings', () => {
    expect(validateOrientationBindings(DEFAULT_ORIENTATION_BINDINGS)).toBe(true);
    expect(orientationKeyIntent('KeyQ', DEFAULT_ORIENTATION_BINDINGS, free)).toEqual({ axis: 'yaw', degrees: -15 });
    const remapped = {
      ...DEFAULT_ORIENTATION_BINDINGS,
      keys: DEFAULT_ORIENTATION_BINDINGS.keys.map((key) => key.code === 'KeyQ' ? { ...key, code: 'KeyR' } : key),
    };
    expect(validateOrientationBindings(remapped)).toBe(true);
    expect(orientationKeyIntent('KeyQ', remapped, free)).toBeUndefined();
    expect(orientationKeyIntent('KeyR', remapped, free)).toEqual({ axis: 'yaw', degrees: -15 });
    expect(validateOrientationBindings({ ...remapped, keys: [{ code: 'KeyW', axis: 'yaw', direction: 1 }] })).toBe(false);
  });

  it('keeps a primary-button placement and text entry from rotating the camera', () => {
    const dragging = { ...free, placementInProgress: true };
    const mouse = { button: 2, altKey: true, ctrlKey: false, shiftKey: false, dx: 80, dy: 20 };
    expect(orientationKeyIntent('KeyE', DEFAULT_ORIENTATION_BINDINGS, dragging)).toBeUndefined();
    expect(orientationMouseIntents(mouse, DEFAULT_ORIENTATION_BINDINGS, dragging)).toEqual([]);
    expect(orientationKeyIntent('KeyE', DEFAULT_ORIENTATION_BINDINGS, { context: 'text-entry', placementInProgress: false })).toBeUndefined();
    expect(orientationMouseIntents({ ...mouse, button: 0 }, DEFAULT_ORIENTATION_BINDINGS, free)).toEqual([]);
  });

  it('translates a modified secondary drag into desired angles and a numeric readout', () => {
    const intents = orientationMouseIntents(
      { button: 2, altKey: true, ctrlKey: false, shiftKey: false, dx: 80, dy: 20 },
      DEFAULT_ORIENTATION_BINDINGS,
      free,
    );
    expect(intents).toEqual([{ axis: 'yaw', degrees: 32 }, { axis: 'tilt', degrees: -8 }]);
    const state = intents.reduce(reduceCameraOrientation, DEFAULT_CAMERA_ORIENTATION);
    expect(cameraOrientationReadout(state)).toEqual({ yaw: 32, tilt: -8 });
    expect(reduceCameraOrientation(state, { axis: 'yaw', degrees: -47 }).yawDegrees).toBe(345);
  });
});
