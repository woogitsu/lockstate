import { describe, expect, it } from 'vitest';
import { DEFAULT_ACCESSIBILITY_SETTINGS, DEFAULT_INPUT_SETTINGS, DEFAULT_KEYBOARD_BINDINGS, KeyboardInputAdapter, type KeyValueStore, PointerInputAdapter, TouchGestureTracker, decodeAccessibilitySettings, decodeInputSettings, findBindingConflicts, loadAccessibilitySettings, loadInputSettings, remapAndPersistKeyboardBinding, remapKeyboardBinding, isTextEntryFocused, resolveBrowserKeyValueStore, resolveKeyboardLabel, saveAccessibilitySettings, saveInputSettings, validateInputSettings } from '../../src/input';

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

/**
 * Issue #199: a browser that blocks site data for the origin does not hand over
 * a store that returns null -- it throws, either from `getItem` or from the
 * `window.localStorage` property getter itself. Every assertion below is about
 * that difference, because the guard that existed covered a corrupt *value* and
 * not an unavailable *store*: `store.getItem(key)` sat above the `try`, not
 * inside it.
 *
 * The consequence was not a lost setting. The renderer read the store in a class
 * field initializer at module top level, so the throw aborted the rest of
 * `src/main.ts` and the player got an empty `<body>` -- no canvas, no HUD, no
 * save panel. `tests/browser/app-shell.spec.ts` holds that end of it in a real
 * browser; this holds the unit behaviour underneath.
 */
describe('settings survive a store that refuses to work', () => {
  class ThrowingStore implements KeyValueStore {
    public getItem(): string | null {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    }

    public setItem(): void {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    }
  }

  it('falls back to defaults when reading throws, not only when parsing fails', () => {
    expect(loadInputSettings(new ThrowingStore())).toEqual(DEFAULT_INPUT_SETTINGS);
    expect(loadAccessibilitySettings(new ThrowingStore())).toEqual(DEFAULT_ACCESSIBILITY_SETTINGS);
  });

  it('does not propagate a refused write, because a lost setting is not worth a crash', () => {
    const store = new ThrowingStore();
    expect(() => saveInputSettings(store, DEFAULT_INPUT_SETTINGS)).not.toThrow();
    expect(() => saveAccessibilitySettings(store, DEFAULT_ACCESSIBILITY_SETTINGS)).not.toThrow();
  });

  it('still reports a remap as valid when the write is refused, so the session keeps the binding', () => {
    // The remap itself succeeded; only persistence failed. Reporting failure
    // here would make a player think the key did not change, when it did.
    const result = remapAndPersistKeyboardBinding(new ThrowingStore(), DEFAULT_INPUT_SETTINGS, 0, 'KeyJ');
    expect(result.ok).toBe(true);
  });

  it('resolves a usable store when the localStorage getter itself throws', () => {
    // The harder shape, and the one a method stub cannot reach: Chrome raises
    // from the property access, so a guard wrapping `getItem` never runs.
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get(): never {
        throw new DOMException('Access to storage is not allowed from this context.', 'SecurityError');
      },
    });
    try {
      const store = resolveBrowserKeyValueStore();
      // A real fallback, not a black hole: a setting changed in this page load
      // keeps working. It just does not survive a reload, which is the honest
      // consequence of a browser that will not store it.
      store.setItem('probe', 'value');
      expect(store.getItem('probe')).toBe('value');
      expect(store.getItem('absent')).toBeNull();
      expect(loadInputSettings(store)).toEqual(DEFAULT_INPUT_SETTINGS);
    } finally {
      if (original === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
      else Object.defineProperty(globalThis, 'localStorage', original);
    }
  });

  it('rejects a store that resolves and then throws on every read', () => {
    // Returning it would be worse than the fallback: every caller would take
    // the default path on every read while believing the value persisted.
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new ThrowingStore() });
    try {
      const store = resolveBrowserKeyValueStore();
      store.setItem('probe', 'value');
      expect(store.getItem('probe')).toBe('value');
    } finally {
      if (original === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
      else Object.defineProperty(globalThis, 'localStorage', original);
    }
  });
});

/**
 * Issue #202: a `keyup` is delivered to whichever window has focus, so holding a
 * camera key and alt-tabbing leaves the code held forever and the camera pans
 * with nobody at the keyboard -- 1,419 world units over three seconds, measured,
 * continuing through refocus and through a click.
 *
 * Issue #201: the scene supplied a literal `() => ['world']`, so `'text-entry'`
 * was never active and a focused text field received a character *and* panned
 * the camera at the same time.
 *
 * The mutation both of these leave surviving is why the first test here exists:
 * `keyUp`'s `pressedCodes.delete` could be replaced with `has` -- a key that
 * sticks down forever, the defect in its purest form -- and all 145 test files
 * stayed green, because the existing `keyUp` test asserts only the returned
 * event array and never re-reads the state the camera actually consumes.
 */
describe('a held key is released by a real keyup, by focus loss, and by nothing else', () => {
  it('stops being active after keyUp, not merely reporting an ended event', () => {
    const adapter = new KeyboardInputAdapter(DEFAULT_KEYBOARD_BINDINGS, () => ['world']);
    adapter.keyDown({ code: 'KeyW' });
    expect(adapter.isActive('camera.up')).toBe(true);
    adapter.keyUp({ code: 'KeyW' });
    // The line that kills the mutation. `keyUp`'s return value was asserted;
    // the state half -- the half the camera reads every frame -- was not.
    expect(adapter.isActive('camera.up')).toBe(false);
  });

  it('releases every held key when focus leaves the page', () => {
    const adapter = new KeyboardInputAdapter(DEFAULT_KEYBOARD_BINDINGS, () => ['world']);
    adapter.keyDown({ code: 'KeyW' });
    adapter.keyDown({ code: 'KeyD' });
    expect(adapter.isActive('camera.up')).toBe(true);
    expect(adapter.isActive('camera.right')).toBe(true);

    adapter.releaseAll();

    // Both, not just the last one: a player alt-tabbing mid-diagonal held two.
    expect(adapter.isActive('camera.up')).toBe(false);
    expect(adapter.isActive('camera.right')).toBe(false);
  });

  it('accepts the same key again after a synthetic release, so the keyboard is not left dead', () => {
    // `keyDown` ignores a code already in the set, so a release that failed to
    // clear it would make that key permanently inert rather than permanently
    // held -- the opposite failure, and just as bad.
    const adapter = new KeyboardInputAdapter(DEFAULT_KEYBOARD_BINDINGS, () => ['world']);
    adapter.keyDown({ code: 'KeyW' });
    adapter.releaseAll();
    expect(adapter.keyDown({ code: 'KeyW' })).toEqual([{ action: 'camera.up', phase: 'started', source: 'keyboard' }]);
    expect(adapter.isActive('camera.up')).toBe(true);
  });

  it('goes inactive when a text field takes focus mid-hold, without dropping the key', () => {
    // `isActive` re-reads `activeContexts()` on every call, so the context
    // change alone is enough -- and the key stays in `pressedCodes`, so
    // releasing it after the field is blurred still behaves.
    let typing = false;
    const adapter = new KeyboardInputAdapter(DEFAULT_KEYBOARD_BINDINGS, () => (typing ? ['text-entry'] : ['world']));
    adapter.keyDown({ code: 'KeyW' });
    expect(adapter.isActive('camera.up')).toBe(true);

    typing = true;
    expect(adapter.isActive('camera.up')).toBe(false);

    typing = false;
    expect(adapter.isActive('camera.up')).toBe(true);
  });
});

/**
 * `isTextEntryFocused` is what makes `docs/INPUT.md`'s claim true (#201). The
 * document is a parameter precisely so this can be asserted headlessly, which is
 * the point of the `activeContexts` seam.
 */
describe('text entry is recognised from the document, not assumed', () => {
  const withActive = (activeElement: unknown): Pick<Document, 'activeElement'> =>
    ({ activeElement }) as Pick<Document, 'activeElement'>;

  it('recognises the three shapes that capture typing', () => {
    expect(isTextEntryFocused(withActive({ tagName: 'INPUT' }))).toBe(true);
    expect(isTextEntryFocused(withActive({ tagName: 'TEXTAREA' }))).toBe(true);
    expect(isTextEntryFocused(withActive({ tagName: 'DIV', isContentEditable: true }))).toBe(true);
  });

  it('does not treat a control that never wanted the keys as text entry', () => {
    // Stopping the camera for these would make the game feel broken whenever a
    // button had focus, which is most of the time after any click.
    expect(isTextEntryFocused(withActive({ tagName: 'BUTTON' }))).toBe(false);
    expect(isTextEntryFocused(withActive({ tagName: 'SELECT' }))).toBe(false);
    expect(isTextEntryFocused(withActive({ tagName: 'CANVAS' }))).toBe(false);
    expect(isTextEntryFocused(withActive({ tagName: 'DIV', isContentEditable: false }))).toBe(false);
  });

  it('reads a missing or absent focus as not text entry, rather than throwing', () => {
    // A document with nothing focused reports `activeElement: null` in some
    // states and `<body>` in others; both must be safe, and so must no document
    // at all -- this module is imported by a scene that a headless test may
    // construct.
    expect(isTextEntryFocused(withActive(null))).toBe(false);
    expect(isTextEntryFocused(withActive({ tagName: 'BODY' }))).toBe(false);
    expect(isTextEntryFocused(undefined)).toBe(false);
    // An element with no `tagName` at all, which is what a stubbed focus target
    // can look like.
    expect(isTextEntryFocused(withActive({}))).toBe(false);
  });
});
