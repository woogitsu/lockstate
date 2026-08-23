import { describe, expect, it } from 'vitest';
import { DEFAULT_ACCESSIBILITY_SETTINGS, DEFAULT_INPUT_SETTINGS, DEFAULT_KEYBOARD_BINDINGS, KeyboardInputAdapter, type KeyValueStore, PointerInputAdapter, TouchGestureTracker, decodeAccessibilitySettings, decodeInputSettings, findBindingConflicts, loadAccessibilitySettings, loadInputSettings, remapAndPersistKeyboardBinding, remapKeyboardBinding, resolveKeyboardLabel, saveAccessibilitySettings, saveInputSettings, validateInputSettings } from '../../src/input';

class MemoryStore implements KeyValueStore {
  private readonly values = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

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
    // The midpoint moved by half the moving finger's travel, which is the
    // translation a two-finger drag asks for. It is the only way to pan on
    // touch while the build tool owns the one-finger drag (#74).
    expect(gestures.move({ id: 2, x: 54, y: 7 })).toEqual({
      kind: 'pinch',
      centerX: 34,
      centerY: 7,
      scale: 2,
      deltaX: 10,
      deltaY: 0,
    });
  });

  it('translates by the midpoint over a two-finger drag, and comes back to the same zoom', () => {
    // A pointer event moves one finger at a time, so each individual move
    // *does* change the finger distance; what must hold over the pair is that
    // the translations add up to the midpoint's travel and the scales cancel.
    // Without this, a touch player with the build tool armed could zoom but
    // never pan (#74).
    const gestures = new TouchGestureTracker();
    gestures.begin({ id: 1, x: 0, y: 0 });
    gestures.begin({ id: 2, x: 20, y: 0 });

    const first = gestures.move({ id: 1, x: 6, y: 0 });
    const second = gestures.move({ id: 2, x: 26, y: 0 });
    expect(first?.kind).toBe('pinch');
    expect(second?.kind).toBe('pinch');
    if (first?.kind !== 'pinch' || second?.kind !== 'pinch') return;

    expect(first.deltaX + second.deltaX).toBeCloseTo(6); // both fingers moved +6
    expect(first.deltaY + second.deltaY).toBeCloseTo(0);
    expect(first.scale * second.scale).toBeCloseTo(1);
  });

  it('keeps accessibility preferences versioned and outside prison state', () => {
    expect(decodeAccessibilitySettings(DEFAULT_ACCESSIBILITY_SETTINGS)).toEqual(DEFAULT_ACCESSIBILITY_SETTINGS);
    expect(decodeAccessibilitySettings({ version: 1, reducedMotion: true, uiScale: 2.1 })).toBeUndefined();
  });

  it('falls back to defaults when no settings, or corrupted settings, are stored', () => {
    const empty = new MemoryStore();
    expect(loadInputSettings(empty)).toEqual(DEFAULT_INPUT_SETTINGS);
    expect(loadAccessibilitySettings(empty)).toEqual(DEFAULT_ACCESSIBILITY_SETTINGS);

    const corrupted = new MemoryStore();
    corrupted.setItem('lockstate.settings.input', '{not json');
    expect(loadInputSettings(corrupted)).toEqual(DEFAULT_INPUT_SETTINGS);
  });

  it('round-trips settings through an injectable store, independent of prison saves', () => {
    const store = new MemoryStore();
    const settings = { version: 1 as const, keyboardBindings: DEFAULT_KEYBOARD_BINDINGS };
    saveInputSettings(store, settings);
    expect(loadInputSettings(store)).toEqual(settings);

    const accessibility = { ...DEFAULT_ACCESSIBILITY_SETTINGS, reducedMotion: true };
    saveAccessibilitySettings(store, accessibility);
    expect(loadAccessibilitySettings(store)).toEqual(accessibility);
  });

  it('only persists a remap once it is conflict-free', () => {
    const store = new MemoryStore();
    saveInputSettings(store, DEFAULT_INPUT_SETTINGS);

    const rejected = remapAndPersistKeyboardBinding(store, DEFAULT_INPUT_SETTINGS, 1, 'KeyW');
    expect(rejected).toMatchObject({ ok: false, reason: 'binding-conflict' });
    expect(loadInputSettings(store)).toEqual(DEFAULT_INPUT_SETTINGS);

    const accepted = remapAndPersistKeyboardBinding(store, DEFAULT_INPUT_SETTINGS, 1, 'KeyJ');
    expect(accepted.ok).toBe(true);
    expect(loadInputSettings(store).keyboardBindings[1]).toMatchObject({ action: 'camera.down', code: 'KeyJ' });
  });
});
