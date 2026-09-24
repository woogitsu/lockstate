import { describe, expect, it } from 'vitest';
import { ACTION_REGISTRY, DEFAULT_ACCESSIBILITY_SETTINGS, MAX_UI_SCALE, MIN_UI_SCALE, UI_SCALE_STEPS, isUiScaleEnlarged, nextUiScaleStep, snapUiScaleToStep, DEFAULT_INPUT_SETTINGS, DEFAULT_KEYBOARD_BINDINGS, KeyboardInputAdapter, type KeyValueStore, PointerInputAdapter, TouchGestureTracker, decodeAccessibilitySettings, decodeInputSettings, findBindingConflicts, loadAccessibilitySettings, loadInputSettings, remapAndPersistKeyboardBinding, remapKeyboardBinding, isTextEntryFocused, resolveBrowserKeyValueStore, resolveKeyboardLabel, saveAccessibilitySettings, saveInputSettings, validateInputSettings } from '../../src/input';
import { expectOk } from '../helpers/expect-ok';

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

  it('does not turn a key pressed in text entry into a held world action on blur', () => {
    let typing = true;
    const adapter = new KeyboardInputAdapter(DEFAULT_KEYBOARD_BINDINGS, () => (typing ? ['text-entry'] : ['world']));
    expect(adapter.keyDown({ code: 'KeyD' })).toEqual([]);
    typing = false;
    expect(adapter.isActive('camera.right')).toBe(false);
    expect(adapter.keyUp({ code: 'KeyD' })).toEqual([]);
    expect(adapter.keyDown({ code: 'KeyD' })).toEqual([{ action: 'camera.right', phase: 'started', source: 'keyboard' }]);
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

  it('computes a gesture from two fingers, so a third one is a spare rather than a term', () => {
    // The half of `world-scene.ts`'s `addPointer(2)` comment that is about
    // this file: three touch pointers are "one spare beyond the two the
    // gestures use" (issue #209). `move` pairs the finger that moved with a
    // single peer, so a third finger already down must not change what the
    // other two produce -- otherwise the spare would be a term in the
    // arithmetic and three would be the number the gestures *use*.
    const twoFingers = new TouchGestureTracker();
    twoFingers.begin({ id: 1, x: 0, y: 0 });
    twoFingers.begin({ id: 2, x: 20, y: 0 });

    const threeFingers = new TouchGestureTracker();
    threeFingers.begin({ id: 1, x: 0, y: 0 });
    threeFingers.begin({ id: 2, x: 20, y: 0 });
    threeFingers.begin({ id: 3, x: 100, y: 40 });

    const withoutSpare = twoFingers.move({ id: 1, x: 6, y: 0 });
    expect(withoutSpare?.kind).toBe('pinch');
    // A third finger 80px away and 40px down would move a three-point centroid
    // a long way. It moves this by nothing.
    expect(threeFingers.move({ id: 1, x: 6, y: 0 })).toEqual(withoutSpare);
  });

  it('keeps accessibility preferences versioned and outside prison state', () => {
    expect(decodeAccessibilitySettings(DEFAULT_ACCESSIBILITY_SETTINGS)).toEqual(DEFAULT_ACCESSIBILITY_SETTINGS);
    expect(decodeAccessibilitySettings({ version: 1, reducedMotion: true, uiScale: 2.1 })).toBeUndefined();
  });

  /*
   * The interface scale, as arithmetic (#545).
   *
   * These live here rather than beside the control because
   * `vitest.config.ts` runs `environment: 'node'` with no jsdom: a decision
   * inside a `click` listener is unreachable from this suite entirely, so a
   * mutation to one survives because nothing can observe it. The same move
   * `orderPrisonsForDisplay` and `readNumberFieldEntry` were extracted for.
   *
   * The expected values are written out rather than derived from
   * `UI_SCALE_STEPS`, which is the fixture rule `docs/TESTING.md` states:
   * a list computed from the code under test holds for any implementation
   * of it, including a broken one.
   */
  it('offers exactly the six fixed steps, 25 percentage points apart', () => {
    expect(UI_SCALE_STEPS).toEqual([0.75, 1, 1.25, 1.5, 1.75, 2]);
    // Every step is a quarter, so every step is exact in binary floating
    // point and `===` against one is safe. That is load-bearing: `stepUiScale`
    // finds the current step with `indexOf`, and `canStepUiScale` compares
    // two answers with `!==`.
    for (const step of UI_SCALE_STEPS) expect(step * 4).toBe(Math.round(step * 4));
    // The band the persisted record is checked against, restated from the
    // other side: the steps run from the floor to the ceiling and leave
    // neither unreachable.
    expect(UI_SCALE_STEPS[0]).toBe(MIN_UI_SCALE);
    expect(UI_SCALE_STEPS[UI_SCALE_STEPS.length - 1]).toBe(MAX_UI_SCALE);
  });

  it('snaps a scale that is not a step to the nearest one, ties to the larger', () => {
    for (const step of [0.75, 1, 1.25, 1.5, 1.75, 2]) expect(snapUiScaleToStep(step)).toBe(step);

    // Nearer the lower neighbour, nearer the upper, and the exact midpoints.
    expect(snapUiScaleToStep(0.8)).toBe(0.75);
    expect(snapUiScaleToStep(0.9)).toBe(1);
    expect(snapUiScaleToStep(1.3)).toBe(1.25);
    expect(snapUiScaleToStep(1.4)).toBe(1.5);
    expect(snapUiScaleToStep(0.875)).toBe(1);
    expect(snapUiScaleToStep(1.125)).toBe(1.25);
    expect(snapUiScaleToStep(1.875)).toBe(2);

    // Outside the band it still answers a step: the *decoder* is what refuses
    // an out-of-range record, and this function is also called on a number a
    // caller hands `applyUiScale` directly.
    expect(snapUiScaleToStep(0.1)).toBe(0.75);
    expect(snapUiScaleToStep(9)).toBe(2);
    // Not a scale at all -> the default, never NaN.
    expect(snapUiScaleToStep(Number.NaN)).toBe(1);
    expect(snapUiScaleToStep(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it('cycles one place at a time and wraps from the top back to the bottom', () => {
    expect(nextUiScaleStep(0.75)).toBe(1);
    expect(nextUiScaleStep(1)).toBe(1.25);
    expect(nextUiScaleStep(1.25)).toBe(1.5);
    expect(nextUiScaleStep(1.5)).toBe(1.75);
    expect(nextUiScaleStep(1.75)).toBe(2);

    // The ring closes. One button is the whole control, so a step that stopped
    // at the top would be a control the player can press into a state they
    // cannot press out of.
    expect(nextUiScaleStep(2)).toBe(0.75);

    // Six presses from any step return to it, which is the property that makes
    // one button enough for six values. Written as a loop over the steps rather
    // than as six literals so it says the *ring* is closed and not that one
    // path through it happens to be.
    for (const step of [0.75, 1, 1.25, 1.5, 1.75, 2]) {
      let value = step;
      for (let press = 0; press < 6; press += 1) value = nextUiScaleStep(value);
      expect(value).toBe(step);
    }

    // A value restored from a build that allowed any number advances from its
    // *nearest step*, not from nothing. Without the snap inside, `indexOf`
    // answers -1 and a press on a stored 0.9 would land on 0.75 -- a press
    // that makes the interface smaller.
    expect(nextUiScaleStep(0.9)).toBe(1.25);
    expect(nextUiScaleStep(0.8)).toBe(1);
  });

  it('knows which steps are larger than the one the layout was designed at', () => {
    // A layout decision, and the only one a multiplier cannot express in CSS:
    // the HUD's tab bar may wrap to a second row, and must above 100 % or its
    // own `overflow: hidden` clips tabs away -- but a flex line breaks on
    // max-content, so a bar that *may* wrap also wraps at 375x812 at 100 %,
    // where the tabs shrink and fit. Measured, that second row cost the Rooms
    // panel 70.2px of arrival height at a viewport nobody asked to change.
    expect(isUiScaleEnlarged(0.75)).toBe(false);
    expect(isUiScaleEnlarged(1)).toBe(false);
    expect(isUiScaleEnlarged(1.25)).toBe(true);
    expect(isUiScaleEnlarged(2)).toBe(true);

    // It answers about the *step*, not the raw number, so a value restored
    // from a build that allowed any number is classified as what it will
    // actually be rendered at. 1.2 renders at 1.25 and is therefore enlarged;
    // 1.1 and 0.9 both render at 1 and are not -- which is the answer the
    // first draft of this test got wrong, having assumed 1.1 rounds up.
    expect(isUiScaleEnlarged(1.2)).toBe(true);
    expect(isUiScaleEnlarged(1.1)).toBe(false);
    expect(isUiScaleEnlarged(0.9)).toBe(false);
  });

  it('snaps a persisted scale that is no longer a legal step, and still refuses one out of range', () => {
    // The migration question #545 raises, decided in the decoder. 0.9 was a
    // legal stored value before the steps existed and is not one now.
    // Rejecting the record would take `reducedMotion` down with it -- the
    // decoder answers `undefined` for the whole record or nothing at all --
    // so the scale is normalised and the rest of the record survives.
    expect(decodeAccessibilitySettings({ version: 1, reducedMotion: true, uiScale: 0.9 })).toEqual({
      version: 1,
      reducedMotion: true,
      uiScale: 1,
    });
    expect(decodeAccessibilitySettings({ version: 1, reducedMotion: false, uiScale: 1.6 })?.uiScale).toBe(1.5);

    // And the range check is untouched: a value outside [0.75, 2] is refused
    // exactly as it always was, so a stored 0.63 still falls back to the
    // default rather than being clamped up to 75 %.
    expect(decodeAccessibilitySettings({ version: 1, reducedMotion: true, uiScale: 0.63 })).toBeUndefined();
    const store = new MemoryStore();
    store.setItem('lockstate.settings.accessibility', JSON.stringify({ version: 1, reducedMotion: true, uiScale: 0.63 }));
    expect(loadAccessibilitySettings(store)).toEqual(DEFAULT_ACCESSIBILITY_SETTINGS);

    // A record written by this build round-trips unchanged, so the snap is
    // idempotent and a load/save cycle cannot walk a player's setting.
    const stepped = { ...DEFAULT_ACCESSIBILITY_SETTINGS, uiScale: 1.75 };
    saveAccessibilitySettings(store, stepped);
    expect(loadAccessibilitySettings(store)).toEqual(stepped);
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
    expectOk(accepted, 'the conflict-free remap to KeyJ');
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
    expectOk(result, 'the remap whose write the store refused');
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

  it('recognises controls that capture typing or arrow-key selection', () => {
    expect(isTextEntryFocused(withActive({ tagName: 'INPUT' }))).toBe(true);
    expect(isTextEntryFocused(withActive({ tagName: 'TEXTAREA' }))).toBe(true);
    expect(isTextEntryFocused(withActive({ tagName: 'SELECT' }))).toBe(true);
    expect(isTextEntryFocused(withActive({ tagName: 'DIV', isContentEditable: true }))).toBe(true);
  });

  it('does not treat a control that never wanted the keys as text entry', () => {
    // Stopping the camera for these would make the game feel broken whenever a
    // button had focus, which is most of the time after any click.
    expect(isTextEntryFocused(withActive({ tagName: 'BUTTON' }))).toBe(false);
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

/**
 * Issue #200: `hud.build.arm-hint` is painted into the Build panel and says "the
 * arrow keys still move the camera". No `Arrow*` binding existed -- measured in a
 * browser, all four moved the camera by exactly zero while `KeyS` moved it
 * 180.89. An advertised key that does nothing reads as a broken build, which is
 * worse than an unadvertised one.
 *
 * The arrows are bound to the **same action ids** as their WASD twins, so this
 * adds a second way to reach a control rather than a control. That is the
 * property asserted here, exactly, rather than in a browser: a browser test can
 * only observe that the camera moved, and "moved the same amount" is a
 * wall-clock sample of a running game loop. An earlier draft of this did try it
 * there and produced an assertion that could not fail, which is the #140 shape.
 */
describe('the arrow keys reach the same camera controls as WASD', () => {
  const TWINS: readonly (readonly [arrow: string, wasd: string])[] = [
    ['ArrowUp', 'KeyW'],
    ['ArrowDown', 'KeyS'],
    ['ArrowLeft', 'KeyA'],
    ['ArrowRight', 'KeyD'],
  ];

  it('binds each arrow to the same action as its WASD twin, in the same contexts', () => {
    for (const [arrow, wasd] of TWINS) {
      const arrowBinding = DEFAULT_KEYBOARD_BINDINGS.find((binding) => binding.code === arrow);
      const wasdBinding = DEFAULT_KEYBOARD_BINDINGS.find((binding) => binding.code === wasd);
      expect(arrowBinding, `${arrow} is not bound`).toBeDefined();
      expect(arrowBinding!.action, `${arrow} and ${wasd} must be the same control`).toBe(wasdBinding!.action);
      // Same contexts too: an arrow that worked in a context its twin did not
      // would be a second control wearing the same action id.
      expect(arrowBinding!.contexts).toEqual(wasdBinding!.contexts);
    }
  });

  it('holding both an arrow and its twin is indistinguishable from holding one', () => {
    // `isActive` is a boolean over held codes, so "twice as fast" is not
    // expressible -- and this pins that, so a future change to an accumulating
    // poll would have to face the assertion rather than slip past it.
    const adapter = new KeyboardInputAdapter(DEFAULT_KEYBOARD_BINDINGS, () => ['world']);
    adapter.keyDown({ code: 'KeyD' });
    expect(adapter.isActive('camera.right')).toBe(true);
    adapter.keyDown({ code: 'ArrowRight' });
    expect(adapter.isActive('camera.right')).toBe(true);

    // And releasing one leaves the other holding it, which is what a player
    // rolling from the arrows onto WASD mid-pan actually does.
    adapter.keyUp({ code: 'KeyD' });
    expect(adapter.isActive('camera.right')).toBe(true);
    adapter.keyUp({ code: 'ArrowRight' });
    expect(adapter.isActive('camera.right')).toBe(false);
  });

  it('reports no binding conflict, because mutually reachable codes are not a collision', () => {
    // `findBindingConflicts` keys on device/code/context, so two codes sharing
    // one action is not a conflict -- and this asserts that rather than assuming
    // it, since adding four bindings to a set of seven is exactly the kind of
    // change a collision rule could reject.
    expect(findBindingConflicts(DEFAULT_KEYBOARD_BINDINGS)).toEqual([]);
  });
});

/**
 * The undo pair (#261), at the layer that decides *whether the key counts*.
 *
 * `ConstructionSystem` has had a transaction-grouped undo since #108 and
 * nothing could reach it: no control, no binding, no intent. These assert the
 * binding half -- that the two codes produce the actions they are supposed to,
 * and that a focused text field silences them. The half that cannot be
 * asserted here is that the scene *acts* on the event, which is
 * `tests/browser/world-scene-input.spec.ts`'s.
 */
describe('the undo and redo keys', () => {
  it('emits a discrete started event for KeyZ and KeyY in the world context', () => {
    const adapter = new KeyboardInputAdapter(DEFAULT_KEYBOARD_BINDINGS, () => ['world']);
    expect(adapter.keyDown({ code: 'KeyZ' })).toEqual([{ action: 'edit.undo', phase: 'started', source: 'keyboard' }]);
    expect(adapter.keyDown({ code: 'KeyY' })).toEqual([{ action: 'edit.redo', phase: 'started', source: 'keyboard' }]);
    // Distinct actions, not one control reached two ways: a redo key wired to
    // `edit.undo` would pass an "it emitted something" check and reverse the
    // player's work twice.
    expect(ACTION_REGISTRY['edit.undo'].behavior).toBe('discrete');
    expect(ACTION_REGISTRY['edit.redo'].behavior).toBe('discrete');
  });

  it('emits nothing while a text field owns the keyboard', () => {
    // The Build panel's coordinate fields are the exposure, and `z` and `y`
    // are characters a player types into them. #201 is this class of defect
    // measured: a focused `<input>` received the character *and* the camera
    // panned.
    const adapter = new KeyboardInputAdapter(DEFAULT_KEYBOARD_BINDINGS, () => ['text-entry']);
    expect(adapter.keyDown({ code: 'KeyZ' })).toEqual([]);
    expect(adapter.keyDown({ code: 'KeyY' })).toEqual([]);
  });

  it('declares neither action in the text-entry context, which is what makes the guard possible', () => {
    // The binding and the registry have to agree: `isActive` and `eventsFor`
    // both intersect the *binding's* contexts, so a binding that listed
    // `text-entry` would fire there however the registry described the action.
    for (const code of ['KeyZ', 'KeyY'] as const) {
      const binding = DEFAULT_KEYBOARD_BINDINGS.find((entry) => entry.code === code);
      expect(binding, `${code} is not bound`).toBeDefined();
      expect(binding!.contexts).not.toContain('text-entry');
      expect(ACTION_REGISTRY[binding!.action].contexts).not.toContain('text-entry');
    }
  });

  it('carries no modifier, so the chord and the bare key are the same binding', () => {
    // Not a preference: `KeyboardBinding` has no modifier field and
    // `KeyboardEventLike` reads `code` and `repeat`, so `Ctrl`+`Z` and a bare
    // `Z` are indistinguishable here by construction. Asserted so that adding
    // a modifier vocabulary -- which reaches the versioned settings format --
    // has to face this test rather than silently changing what a player who
    // presses `Z` alone gets.
    const binding = DEFAULT_KEYBOARD_BINDINGS.find((entry) => entry.code === 'KeyZ');
    expect(Object.keys(binding!).sort()).toEqual(['action', 'contexts', 'code', 'device'].sort());
  });
});
