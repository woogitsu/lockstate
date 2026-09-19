import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ACCESSIBILITY_SETTINGS,
  type AccessibilitySettings,
} from '../../src/input/accessibility';
import { DEFAULT_LAYOUT_SETTINGS, type LayoutSettings } from '../../src/input/layout-preference';
import { DEFAULT_THEME_SETTINGS, type ThemeSettings } from '../../src/input/theme-preference';
import {
  type SettingsChangeTarget,
  type SettingsStorageEvent,
  subscribeToSettingsChanges,
} from '../../src/input/storage';

/**
 * What a second tab is told, and what it is deliberately not told (#1199).
 *
 * `docs/adr/drafts/what-a-second-tab-follows.md` is the decision: the
 * interface scale, the theme and the HUD layout follow across tabs; the
 * language does not, because nothing in this interface can be handed a
 * different `Localizer` after boot.
 *
 * The event target is a parameter, so every rule here is decidable in `node`
 * against three lines of fake: `src/input/**` reaches for exactly two browser
 * globals and `tests/unit/input-module-boundaries.test.ts` pins that, so this
 * subscription could not read `window` itself even if it wanted to.
 * `tests/browser/ui-cross-tab-preferences.spec.ts` is what proves two real
 * pages in one browser context actually follow each other.
 */

/** The one method the subscription calls, plus a way to fire at it. */
function fakeTarget(): SettingsChangeTarget & {
  fire(event: SettingsStorageEvent): void;
  listenerCount(): number;
} {
  const listeners = new Set<(event: SettingsStorageEvent) => void>();
  return {
    addEventListener(_type, listener) {
      listeners.add(listener);
    },
    removeEventListener(_type, listener) {
      listeners.delete(listener);
    },
    fire(event) {
      for (const listener of [...listeners]) listener(event);
    },
    listenerCount: () => listeners.size,
  };
}

interface Heard {
  readonly accessibility: AccessibilitySettings[];
  readonly theme: ThemeSettings[];
  readonly layout: LayoutSettings[];
}

function listen(target: SettingsChangeTarget): { heard: Heard; unsubscribe: () => void } {
  const heard: Heard = { accessibility: [], theme: [], layout: [] };
  const unsubscribe = subscribeToSettingsChanges(target, {
    onAccessibilityChange: (settings) => heard.accessibility.push(settings),
    onThemeChange: (settings) => heard.theme.push(settings),
    onLayoutChange: (settings) => heard.layout.push(settings),
  });
  return { heard, unsubscribe };
}

describe('a preference written by another tab', () => {
  it('reaches the handler for its own key and no other', () => {
    const target = fakeTarget();
    const { heard } = listen(target);

    target.fire({
      key: 'lockstate.settings.theme',
      newValue: JSON.stringify({ version: 1, preference: 'dark' }),
    });

    expect(heard.theme).toEqual([{ version: 1, preference: 'dark' }]);
    // The half that matters as much: one key changing must not repaint the
    // other two, because each of those handlers is an apply-path with a cost.
    expect(heard.accessibility).toHaveLength(0);
    expect(heard.layout).toHaveLength(0);
  });

  it('carries the interface scale through, decoded', () => {
    const target = fakeTarget();
    const { heard } = listen(target);

    target.fire({
      key: 'lockstate.settings.accessibility',
      newValue: JSON.stringify({ ...DEFAULT_ACCESSIBILITY_SETTINGS, uiScale: 1.5 }),
    });

    expect(heard.accessibility.map((settings) => settings.uiScale)).toEqual([1.5]);
  });

  it('carries the HUD layout through, decoded', () => {
    const target = fakeTarget();
    const { heard } = listen(target);
    const collapsed: LayoutSettings = { ...DEFAULT_LAYOUT_SETTINGS, collapsed: ['metrics'] };

    target.fire({
      key: 'lockstate.settings.layout',
      newValue: JSON.stringify(collapsed),
    });

    expect(heard.layout).toEqual([collapsed]);
  });

  it('says nothing at all about the language, which is the decision rather than an oversight', () => {
    const target = fakeTarget();
    const { heard } = listen(target);

    // The key a language change writes, with a value that decodes perfectly
    // well. Nineteen modules under `src/ui/` hold the one `Localizer` built at
    // boot and none of them can be handed another, so a tab that acted on this
    // could only turn part of itself Polish -- see
    // `docs/adr/drafts/what-a-second-tab-follows.md`.
    target.fire({
      key: 'lockstate.settings.language',
      newValue: JSON.stringify({ version: 1, preference: 'pl' }),
    });

    expect(heard).toEqual({ accessibility: [], theme: [], layout: [] });
  });

  it('ignores every other key on the origin', () => {
    const target = fakeTarget();
    const { heard } = listen(target);

    target.fire({ key: 'lockstate.settings.input', newValue: '{}' });
    target.fire({ key: 'some-other-site-thing', newValue: '{}' });

    expect(heard).toEqual({ accessibility: [], theme: [], layout: [] });
  });
});

describe('a value another tab wrote is checked exactly as a value read at boot is', () => {
  it('falls back to that key defaults when the value will not parse', () => {
    const target = fakeTarget();
    const { heard } = listen(target);

    target.fire({ key: 'lockstate.settings.theme', newValue: 'not json at all' });

    expect(heard.theme).toEqual([DEFAULT_THEME_SETTINGS]);
  });

  it('falls back to that key defaults when the value parses but is not that record', () => {
    const target = fakeTarget();
    const { heard } = listen(target);

    target.fire({
      key: 'lockstate.settings.accessibility',
      newValue: JSON.stringify({ version: 1, uiScale: 'enormous' }),
    });

    expect(heard.accessibility).toEqual([DEFAULT_ACCESSIBILITY_SETTINGS]);
  });

  it('reads a removed key as that key defaults rather than as nothing', () => {
    const target = fakeTarget();
    const { heard } = listen(target);

    // `removeItem` in another tab: the key is named and the value is `null`.
    // A tab that ignored this would keep painting a preference that no longer
    // exists anywhere.
    target.fire({ key: 'lockstate.settings.layout', newValue: null });

    expect(heard.layout).toEqual([DEFAULT_LAYOUT_SETTINGS]);
  });

  it('reads a cleared store as all three reverting at once', () => {
    const target = fakeTarget();
    const { heard } = listen(target);

    // `localStorage.clear()` reports one event with no key, not one per key.
    target.fire({ key: null, newValue: null });

    expect(heard.accessibility).toEqual([DEFAULT_ACCESSIBILITY_SETTINGS]);
    expect(heard.theme).toEqual([DEFAULT_THEME_SETTINGS]);
    expect(heard.layout).toEqual([DEFAULT_LAYOUT_SETTINGS]);
  });
});

describe('the subscription itself', () => {
  it('attaches one listener and takes it off again', () => {
    const target = fakeTarget();
    const { heard, unsubscribe } = listen(target);
    expect(target.listenerCount()).toBe(1);

    unsubscribe();
    expect(target.listenerCount()).toBe(0);
    target.fire({
      key: 'lockstate.settings.theme',
      newValue: JSON.stringify({ version: 1, preference: 'dark' }),
    });
    expect(heard.theme).toHaveLength(0);
  });

  it('is happy with a caller that wants only one of the three', () => {
    const target = fakeTarget();
    const seen: ThemeSettings[] = [];
    subscribeToSettingsChanges(target, { onThemeChange: (settings) => seen.push(settings) });

    target.fire({ key: 'lockstate.settings.accessibility', newValue: null });
    target.fire({ key: null, newValue: null });
    target.fire({
      key: 'lockstate.settings.theme',
      newValue: JSON.stringify({ version: 1, preference: 'light' }),
    });

    expect(seen).toEqual([DEFAULT_THEME_SETTINGS, { version: 1, preference: 'light' }]);
  });
});
