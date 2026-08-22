import { describe, expect, it } from 'vitest';
import { DEFAULT_KEYBOARD_BINDINGS, KeyboardInputAdapter, decodeInputSettings, findBindingConflicts, remapKeyboardBinding, resolveKeyboardLabel, validateInputSettings } from '../../src/input';

describe('semantic input', () => {
  it('uses physical movement keys, independently of the keyboard layout', () => {
    const adapter = new KeyboardInputAdapter(DEFAULT_KEYBOARD_BINDINGS, () => ['world']);
    expect(adapter.keyDown({ code: 'KeyW' })).toEqual([{ action: 'camera.up', phase: 'started' }]);
    expect(adapter.isActive('camera.up')).toBe(true);
    expect(adapter.keyUp({ code: 'KeyW' })).toEqual([{ action: 'camera.up', phase: 'ended' }]);
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
});
