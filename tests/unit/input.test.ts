import { describe, expect, it } from 'vitest';
import { DEFAULT_ACCESSIBILITY_SETTINGS, DEFAULT_KEYBOARD_BINDINGS, KeyboardInputAdapter, PointerInputAdapter, TouchGestureTracker, decodeAccessibilitySettings, decodeInputSettings, findBindingConflicts, remapKeyboardBinding, resolveKeyboardLabel, validateInputSettings } from '../../src/input';

describe('semantic input', () => {
  it('uses physical movement keys, independently of the keyboard layout', () => {
    const adapter = new KeyboardInputAdapter(DEFAULT_KEYBOARD_BINDINGS, () => ['world']);
    expect(adapter.keyDown({ code: 'KeyW' })).toEqual([{ action: 'camera.up', phase: 'started', source: 'keyboard' }]);
    expect(adapter.isActive('camera.up')).toBe(true);
    expect(adapter.keyUp({ code: 'KeyW' })).toEqual([{ action: 'camera.up', phase: 'ended', source: 'keyboard' }]);
  });

  it('does not dispatch world controls when their context is inactive', () => {
    const adapter = new KeyboardInputAdapter(DEFAULT_KEYBOARD_BINDINGS, () => ['text-entry']);
    expect(adapter.keyDown({ code: 'KeyW' })).toEqual([]);
  });

  it('detects only overlapping-context keyboard conflicts', () => {
    expect(findBindingConflicts([
      { device: 'keyboard', code: 'KeyQ', action: 'camera.up', contexts: ['world'] },
      { device: 'keyboard', code: 'KeyQ', action: 'build.confirm', contexts: ['construction'] },
    ])).toEqual([]);
    expect(findBindingConflicts([
      { device: 'keyboard', code: 'KeyQ', action: 'camera.up', contexts: ['world'] },
      { device: 'keyboard', code: 'KeyQ', action: 'selection.primary', contexts: ['world'] },
    ])).toMatchObject([{ code: 'duplicate-binding', bindingIndex: 1, conflictingBindingIndex: 0 }]);
  });

  it('round-trips a versioned settings shape and rejects conflicts', () => {
    const settings = { version: 1 as const, keyboardBindings: DEFAULT_KEYBOARD_BINDINGS };
    expect(decodeInputSettings(JSON.parse(JSON.stringify(settings)))).toEqual(settings);
    expect(decodeInputSettings({ version: 1, keyboardBindings: [
      { device: 'keyboard', code: 'KeyQ', action: 'camera.up', contexts: ['world'] },
      { device: 'keyboard', code: 'KeyQ', action: 'selection.primary', contexts: ['world'] },
    ] })).toBeUndefined();
  });

  it('uses a browser keyboard-layout label when available, with deterministic fallbacks', async () => {
    await expect(resolveKeyboardLabel('KeyW', { getLayoutMap: async () => new Map([['KeyW', 'z']]) })).resolves.toBe('z');
    await expect(resolveKeyboardLabel('KeyW')).resolves.toBe('W');
    await expect(resolveKeyboardLabel('Escape')).resolves.toBe('Esc');
  });

  it('reports a remapping conflict without changing valid settings', () => {
    const settings = { version: 1 as const, keyboardBindings: DEFAULT_KEYBOARD_BINDINGS };
    const result = remapKeyboardBinding(settings, 1, 'KeyW');
    expect(result).toMatchObject({ ok: false, reason: 'binding-conflict' });
    expect(validateInputSettings(settings)).toEqual({ ok: true, value: settings });
  });

  it('maps mouse, pen and touch primary input to the shared semantic contract', () => {
    const adapter = new PointerInputAdapter(() => ['world']);
    expect(adapter.pointerDown({ pointerId: 1, pointerType: 'touch' })).toEqual([
      { action: 'selection.primary', phase: 'started', source: 'pointer' },
    ]);
    expect(adapter.pointerUp({ pointerId: 1, pointerType: 'touch' })).toEqual([
      { action: 'selection.primary', phase: 'ended', source: 'pointer' },
    ]);
    expect(adapter.pointerDown({ pointerId: 2, pointerType: 'mouse', button: 2 })).toEqual([]);
  });

  it('maps construction primary and cancellation gestures without raw-device checks in consumers', () => {
    const adapter = new PointerInputAdapter(() => ['construction']);
    expect(adapter.pointerDown({ pointerId: 1, pointerType: 'pen' })).toEqual([
      { action: 'build.confirm', phase: 'started', source: 'pointer' },
    ]);
    expect(adapter.pointerCancel({ pointerId: 1, pointerType: 'pen' })).toEqual([
      { action: 'build.cancel', phase: 'started', source: 'pointer' },
    ]);
  });

  it('normalizes single-touch pan and two-touch pinch', () => {
    const gestures = new TouchGestureTracker();
    gestures.begin({ id: 1, x: 10, y: 10 });
    expect(gestures.move({ id: 1, x: 14, y: 7 })).toEqual({ kind: 'pan', deltaX: 4, deltaY: -3 });
    gestures.begin({ id: 2, x: 34, y: 7 });
    expect(gestures.move({ id: 2, x: 54, y: 7 })).toEqual({ kind: 'pinch', centerX: 34, centerY: 7, scale: 2 });
  });

  it('keeps accessibility preferences versioned and outside prison state', () => {
    expect(decodeAccessibilitySettings(DEFAULT_ACCESSIBILITY_SETTINGS)).toEqual(DEFAULT_ACCESSIBILITY_SETTINGS);
    expect(decodeAccessibilitySettings({ version: 1, reducedMotion: true, uiScale: 2.1 })).toBeUndefined();
  });
});
