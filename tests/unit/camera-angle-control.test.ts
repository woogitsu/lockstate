import { describe, expect, it } from 'vitest';
import { cameraAngleDegrees } from '../../src/ui/hud/camera-angle-control';

describe('camera angle readout', () => {
  it('uses the scene radians as whole degrees, including negative yaw', () => {
    expect(cameraAngleDegrees(-Math.PI / 4)).toBe(-45);
    expect(cameraAngleDegrees(Math.PI / 4)).toBe(45);
    expect(cameraAngleDegrees(Math.PI / 18)).toBe(10);
  });
});
