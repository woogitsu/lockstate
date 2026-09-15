import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from '../../src/shared/key-value-store';
import {
  type ThemePreference,
  DEFAULT_THEME_SETTINGS,
  nextThemePreference,
  THEME_PREFERENCES,
  decodeThemeSettings,
  resolveTheme,
} from '../../src/input/theme-preference';
import { loadThemeSettings, saveThemeSettings } from '../../src/input/storage';
import { applyTheme, createThemeController, type SystemThemeQuery } from '../../src/ui/theme';

/**
 * The theme preference, end to end without a browser (#1157).
 *
 * `src/ui/theme.ts` takes its root element, its store and its system query as
 * parameters for exactly this reason: every rule the rollout document states
 * about a theme -- default light, follow the system only while no preference
 * has been expressed, remember it under its own key, keep switching when the
 * store refuses -- is decidable here, in `node`, against a fake DOM element and
 * a `Map`. `tests/browser/ui-theme.spec.ts` is what proves the stylesheet
 * actually repaints.
 */

/** The two methods `applyTheme` touches, and nothing else. */
function fakeRoot(): HTMLElement {
  const dataset: Record<string, string> = {};
  return { dataset } as unknown as HTMLElement;
}

function memoryStore(): KeyValueStore {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
  };
}

/** A store that throws on every access, which is what a browser with site data blocked hands over. */
function hostileStore(): KeyValueStore {
  return {
    getItem: () => {
      throw new Error('site data is blocked for this origin');
    },
    setItem: () => {
      throw new Error('site data is blocked for this origin');
    },
  };
}

/**
 * The two halves `src/main.ts` supplies, assembled from a store the way the
 * composition root assembles them -- so these tests drive the real
 * `loadThemeSettings` / `saveThemeSettings` pair rather than a stand-in for
 * them, while `src/ui/theme.ts` itself stays clear of the settings store.
 */
function persistence(store: KeyValueStore): { preference: ThemePreference; persist: (preference: ThemePreference) => void } {
  return {
    preference: loadThemeSettings(store).preference,
    persist: (preference) => {
      saveThemeSettings(store, { version: 1, preference });
    },
  };
}

function fakeSystem(prefersDark: boolean): SystemThemeQuery & { change(next: boolean): void } {
  let matches = prefersDark;
  let listener: ((prefersDark: boolean) => void) | undefined;
  return {
    get matches(): boolean {
      return matches;
    },
    subscribe(next: (prefersDark: boolean) => void): void {
      listener = next;
    },
    change(next: boolean): void {
      matches = next;
      listener?.(next);
    },
  };
}

describe('the theme preference vocabulary', () => {
  it('offers three preferences and defaults to following the device', () => {
    // Three, not two: "follow the device" is a choice, not the absence of one,
    // and a boolean cannot hold it.
    expect([...THEME_PREFERENCES]).toEqual(['system', 'light', 'dark']);
    expect(DEFAULT_THEME_SETTINGS.preference).toBe('system');
  });

  it('cycles through every preference and back, so one button can offer all three', () => {
    // The control beside it is a cycling button, so "the next one" has to
    // reach every value and return: a cycle that skipped one would hide a
    // preference behind no press at all.
    expect(nextThemePreference('system')).toBe('light');
    expect(nextThemePreference('light')).toBe('dark');
    expect(nextThemePreference('dark')).toBe('system');
    const seen = new Set<ThemePreference>();
    let at: ThemePreference = 'system';
    for (let step = 0; step < THEME_PREFERENCES.length; step += 1) {
      seen.add(at);
      at = nextThemePreference(at);
    }
    expect([...seen].sort()).toEqual([...THEME_PREFERENCES].sort());
    expect(at).toBe('system');
  });

  it('resolves every preference against both device states', () => {
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('system', true)).toBe('dark');
    // The two explicit preferences ignore the device, in both directions.
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('treats anything it does not recognise as no preference expressed', () => {
    for (const input of [undefined, null, 42, 'dark', [], {}, { version: 1 }, { version: 2, preference: 'dark' }, { version: 1, preference: 'sepia' }]) {
      expect(decodeThemeSettings(input), JSON.stringify(input) ?? 'undefined').toBeUndefined();
    }
    expect(decodeThemeSettings({ version: 1, preference: 'dark' })).toEqual({ version: 1, preference: 'dark' });
  });
});

describe('the theme is a preference with its own key (constitution article 13)', () => {
  it('round-trips through a key no other setting reads or writes', () => {
    const store = memoryStore();
    saveThemeSettings(store, { version: 1, preference: 'dark' });
    expect(loadThemeSettings(store).preference).toBe('dark');
    // Named rather than derived, because the whole point of the article is
    // that clearing this one clears nothing else.
    expect(store.getItem('lockstate.settings.theme')).toBe('{"version":1,"preference":"dark"}');
    expect(store.getItem('lockstate.settings.accessibility')).toBeNull();
    expect(store.getItem('lockstate.settings.input')).toBeNull();
  });
});

describe('the theme controller', () => {
  it('paints the light theme when the device asks for nothing, before any control exists', () => {
    const root = fakeRoot();
    createThemeController({ root, ...persistence(memoryStore()), system: fakeSystem(false) });
    // Written explicitly rather than left absent: "no attribute" and "the
    // player is on the light theme" are the same pixels and not the same fact.
    expect(root.dataset['theme']).toBe('light');
  });

  it('follows a device that asks for dark', () => {
    const root = fakeRoot();
    const controller = createThemeController({ root, ...persistence(memoryStore()), system: fakeSystem(true) });
    expect(root.dataset['theme']).toBe('dark');
    expect(controller.preference).toBe('system');
  });

  it('keeps following the device while no preference has been expressed', () => {
    const root = fakeRoot();
    const system = fakeSystem(false);
    const changes: string[] = [];
    createThemeController({
      root,
      ...persistence(memoryStore()),
      system,
      onChange: (theme) => changes.push(theme),
    });
    system.change(true);
    expect(root.dataset['theme']).toBe('dark');
    system.change(false);
    expect(root.dataset['theme']).toBe('light');
    expect(changes).toEqual(['dark', 'light']);
  });

  /**
   * **This test passed on a mutant and had to be strengthened, which is worth
   * recording rather than quietly fixing.** Deleting the
   * `if (preference !== 'system') return;` guard from the subscription in
   * `src/ui/theme.ts` left all twelve of these green and all seven browser
   * assertions green -- because `resolveTheme('light', true)` already ignores
   * the device, so the *theme* could not move whether the guard ran or not.
   *
   * The guard's actual job is the second half: not reporting a change that did
   * not happen. Without it every system flip calls `onChange`, and `main.ts`
   * hands that to `themeControl.setPreference` -- so the mutant is a control
   * being rewritten on an event that concerns it in no way, which is the kind
   * of thing that is invisible until it races something. Both halves are
   * asserted here now.
   */
  it('stops following the device once the player has chosen, and says nothing about it', () => {
    const root = fakeRoot();
    const system = fakeSystem(false);
    const seen: string[] = [];
    const controller = createThemeController({
      root,
      ...persistence(memoryStore()),
      system,
      onChange: (theme, preference) => seen.push(`${preference}:${theme}`),
    });
    controller.select('light');
    expect(seen).toEqual(['light:light']);

    // The asymmetry the third preference exists for: a laptop switching at
    // sunset must not move a player who has said what they want.
    system.change(true);
    expect(root.dataset['theme']).toBe('light');
    expect(controller.preference).toBe('light');
    expect(seen, 'a device change that cannot move this player is not a change to report').toEqual(['light:light']);
  });

  it('remembers the preference across a reload', () => {
    const store = memoryStore();
    const first = createThemeController({ root: fakeRoot(), ...persistence(store), system: fakeSystem(false) });
    first.select('dark');
    const root = fakeRoot();
    const second = createThemeController({ root, ...persistence(store), system: fakeSystem(false) });
    expect(second.preference).toBe('dark');
    expect(root.dataset['theme']).toBe('dark');
  });

  it('switches on a store that throws, and simply does not remember', () => {
    const root = fakeRoot();
    const controller = createThemeController({ root, ...persistence(hostileStore()), system: fakeSystem(false) });
    expect(root.dataset['theme']).toBe('light');
    // The requirement in #1157's own words: a browser that throws must still
    // switch themes, it merely must not remember.
    expect(() => controller.select('dark')).not.toThrow();
    expect(root.dataset['theme']).toBe('dark');
    expect(controller.preference).toBe('dark');
    // And the next page load starts from the default again, because nothing
    // could be written -- which is the honest consequence, not a failure.
    expect(loadThemeSettings(hostileStore()).preference).toBe('system');
  });

  it('reports a change once per change and not on a no-op', () => {
    const root = fakeRoot();
    const system = fakeSystem(false);
    const seen: string[] = [];
    const controller = createThemeController({
      root,
      ...persistence(memoryStore()),
      system,
      onChange: (theme, preference) => seen.push(`${preference}:${theme}`),
    });
    controller.select('light');
    controller.select('light');
    // `'system'` and `'light'` resolve to the same *theme* here, so the
    // attribute never moves -- but the preference did, and the control has to
    // hear about it or its selected option stops matching what is stored.
    expect(seen).toEqual(['light:light', 'light:light']);
    expect(root.dataset['theme']).toBe('light');
  });
});

describe('applyTheme', () => {
  it('is the only write a theme needs', () => {
    const root = fakeRoot();
    applyTheme(root, 'dark');
    expect(root.dataset['theme']).toBe('dark');
    applyTheme(root, 'light');
    expect(root.dataset['theme']).toBe('light');
  });
});

describe('a theme another tab chose (#1199)', () => {
  it('is applied, reported, and not written back', () => {
    const root = fakeRoot();
    const store = memoryStore();
    const changes: ThemePreference[] = [];
    const controller = createThemeController({
      root,
      ...persistence(store),
      system: fakeSystem(false),
      onChange: (_theme, preference) => changes.push(preference),
    });
    expect(root.dataset['theme']).toBe('light');

    // The other tab has already written the key -- that is how a `storage`
    // event exists at all -- so this one applies it and stores nothing. The
    // store staying empty is the assertion: a controller that persisted what
    // it was told would make "this player chose dark here" and "some other tab
    // did" indistinguishable at the one place that knows the difference.
    controller.adopt('dark');

    expect(root.dataset['theme']).toBe('dark');
    expect(controller.preference).toBe('dark');
    expect(store.getItem('lockstate.settings.theme')).toBeNull();
    // And the control follows, so the button cannot be left naming the theme
    // that used to be on screen.
    expect(changes).toEqual(['dark']);
  });

  it('carries `system` across as `system`, not as the theme it happens to resolve to', () => {
    const root = fakeRoot();
    const system = fakeSystem(true);
    const controller = createThemeController({
      root,
      ...persistence(memoryStore()),
      system,
      preference: 'light',
    });
    expect(root.dataset['theme']).toBe('light');

    controller.adopt('system');

    expect(controller.preference).toBe('system');
    expect(root.dataset['theme']).toBe('dark');
    // And the adopting tab is now following the device live, exactly as the
    // tab that made the choice is: an adopted `'system'` that had been flattened
    // to a theme would stop moving at sunset.
    system.change(false);
    expect(root.dataset['theme']).toBe('light');
  });
});
