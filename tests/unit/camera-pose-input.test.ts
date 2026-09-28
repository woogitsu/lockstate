import { describe, expect, it } from 'vitest';
import { CameraPoseInputAdapter, DEFAULT_CAMERA_POSE_BINDINGS, remapCameraPoseBinding } from '../../src/input/camera-pose-input';

function scene() {
  const calls: { yaw: number; elevation: number; pivot?: { x: number; y: number } }[] = [];
  const port = {
    cameraPose: { yawRadians: -Math.PI / 4, elevationRadians: Math.PI / 4 },
    setPoseRadians(yaw: number, elevation: number, pivot?: { x: number; y: number }) {
      calls.push({ yaw, elevation, ...(pivot === undefined ? {} : { pivot }) });
      this.cameraPose = { yawRadians: yaw, elevationRadians: elevation };
    },
  };
  return { port, calls };
}

describe('camera pose input port before oblique scene activation', () => {
  it('routes all five default physical keys to the matching camera action', () => {
    const { port, calls } = scene();
    const adapter = new CameraPoseInputAdapter(port, () => ['world'], () => false);
    for (const code of ['KeyQ', 'KeyE', 'PageUp', 'PageDown', 'Home']) {
      expect(adapter.keyDown({ code })).toBe(true);
    }
    expect(calls).toHaveLength(5);
    expect(calls[0]?.yaw).toBeCloseTo(-Math.PI / 4 - Math.PI / 12);
    expect(calls[1]?.yaw).toBeCloseTo(-Math.PI / 4);
    expect(calls[2]?.elevation).toBeCloseTo(Math.PI / 4 + Math.PI / 18);
    expect(calls[3]?.elevation).toBeCloseTo(Math.PI / 4);
    expect(calls[4]).toMatchObject({ yaw: -Math.PI / 4, elevation: Math.PI / 4 });
  });

  it('maps keyboard, HUD intent and right drag to the same scene pose port', () => {
    const { port, calls } = scene();
    const adapter = new CameraPoseInputAdapter(port, () => ['world'], () => false);
    expect(adapter.keyDown({ code: 'KeyE' })).toBe(true);
    expect(calls[0]?.yaw).toBeCloseTo(-Math.PI / 4 + Math.PI / 12);
    expect(adapter.activate('elevation-up')).toBe(true);
    expect(calls[1]?.elevation).toBeCloseTo(Math.PI / 4 + Math.PI / 18);
    expect(adapter.pointerDrag({ button: 2, dx: 20, dy: -10, pivot: { x: 400, y: 300 } })).toBe(true);
    expect(calls[2]?.pivot).toEqual({ x: 400, y: 300 });
    expect(calls[2]?.yaw).toBeCloseTo(calls[1]!.yaw + 0.1);
    expect(calls[2]?.elevation).toBeCloseTo(calls[1]!.elevation + 0.05);
    expect(adapter.activate('reset')).toBe(true);
    expect(calls.at(-1)).toMatchObject({ yaw: -Math.PI / 4, elevation: Math.PI / 4 });
  });

  it('blocks every turn during placement, text entry or a modal', () => {
    const { port, calls } = scene();
    let contexts: readonly ('world' | 'construction' | 'text-entry' | 'modal')[] = ['construction'];
    let placing = true;
    const adapter = new CameraPoseInputAdapter(port, () => contexts, () => placing);
    expect(adapter.keyDown({ code: 'KeyE' })).toBe(false);
    expect(adapter.activate('yaw-left')).toBe(false);
    expect(adapter.pointerDrag({ button: 2, dx: 20, dy: 0 })).toBe(false);
    placing = false;
    contexts = ['text-entry'];
    expect(adapter.keyDown({ code: 'KeyE' })).toBe(false);
    contexts = ['modal'];
    expect(adapter.activate('reset')).toBe(false);
    contexts = ['construction'];
    expect(adapter.keyDown({ code: 'KeyE' })).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('remaps a physical key without allowing duplicate bindings', () => {
    const remapped = remapCameraPoseBinding(DEFAULT_CAMERA_POSE_BINDINGS, 'yaw-right', 'KeyR');
    expect(remapped.ok).toBe(true);
    if (!remapped.ok) return;
    const { port, calls } = scene();
    const adapter = new CameraPoseInputAdapter(port, () => ['world'], () => false, remapped.bindings);
    expect(adapter.keyDown({ code: 'KeyE' })).toBe(false);
    expect(adapter.keyDown({ code: 'KeyR' })).toBe(true);
    expect(calls).toHaveLength(1);
    expect(remapCameraPoseBinding(remapped.bindings, 'yaw-left', 'KeyR')).toEqual({ ok: false, reason: 'duplicate-code' });
  });
});
