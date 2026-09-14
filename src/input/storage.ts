import type { KeyValueStore } from '../shared/key-value-store';
import {
  type AccessibilitySettings,
  DEFAULT_ACCESSIBILITY_SETTINGS,
  decodeAccessibilitySettings,
} from './accessibility';
import { DEFAULT_KEYBOARD_BINDINGS } from './bindings';
import {
  type LayoutSettings,
  DEFAULT_LAYOUT_SETTINGS,
  decodeLayoutSettings,
} from './layout-preference';
import {
  type ThemeSettings,
  DEFAULT_THEME_SETTINGS,
  decodeThemeSettings,
} from './theme-preference';
import {
  type InputSettings,
  type InputSettingsValidationResult,
  INPUT_SETTINGS_VERSION,
  decodeInputSettings,
  remapKeyboardBinding,
} from './settings';

/**
 * User-settings persistence is a separate concern from prison save snapshots
 * (AGENTS.md: persistence consumes explicit snapshots). Any key/value store
 * satisfies this, so tests can inject an in-memory store instead of the DOM.
 *
 * The interface itself now lives in `src/shared/key-value-store.ts` because
 * the trusted-services layer (#36) needs the same boundary for entitlement
 * projections and telemetry consent; it is re-exported here so input
 * consumers keep importing it from where they always did.
 */
export type { KeyValueStore };

export const DEFAULT_INPUT_SETTINGS: InputSettings = {
  version: INPUT_SETTINGS_VERSION,
  keyboardBindings: DEFAULT_KEYBOARD_BINDINGS,
};

const INPUT_SETTINGS_STORAGE_KEY = 'lockstate.settings.input';
const ACCESSIBILITY_SETTINGS_STORAGE_KEY = 'lockstate.settings.accessibility';
/**
 * The theme's **own** key, which is the whole of constitution article 13 as it
 * applies here (#1157): the theme is a preference, it is not part of the save,
 * and resetting it resets nothing else. Folding it into
 * `lockstate.settings.accessibility` would have been fewer lines and would
 * have made one `removeItem` clear a player's interface scale as well.
 */
const THEME_SETTINGS_STORAGE_KEY = 'lockstate.settings.theme';

/**
 * The HUD layout's **own** key, for the reason the theme has one (#1159).
 *
 * Constitution article 13 asks for *"oddzielne klucze pamięci i niezależny
 * reset"* -- separate memory keys and an independent reset -- and the Layout
 * menu ships a Reset control, so this is the difference between a player
 * putting their panels back and a player losing their keyboard remap with
 * them. It is also why the layout is not a field of the save payload: nothing
 * here is prison state, and `SAVE_SCHEMA_VERSION` does not move for a panel
 * width.
 */
const LAYOUT_SETTINGS_STORAGE_KEY = 'lockstate.settings.layout';

/**
 * Reads and parses one entry, treating **any** failure as "no entry".
 *
 * `store.getItem(key)` is inside the `try` deliberately. It used to be above
 * it, which covered a corrupt *value* and not an unavailable *store* -- and a
 * `localStorage` whose `getItem` throws is exactly what a browser hands over
 * when site data is blocked for the origin. That asymmetry produced issue
 * #199: the throw escaped a class field initializer at module top level and
 * aborted the rest of `main.ts`, so the player got an empty `<body>` with no
 * canvas, no HUD and no save panel.
 *
 * `docs/INPUT.md` has always said settings "fall back to defaults rather than
 * failing boot". This is the line that makes that sentence true for a store
 * that is unreachable as well as for one holding rubbish.
 */
function readJson(store: KeyValueStore, key: string): unknown {
  try {
    const raw = store.getItem(key);
    if (raw === null) return undefined;
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/**
 * Writes one entry, treating a refusal as "not persisted" rather than as an
 * error to propagate.
 *
 * The read path falling back to defaults is only half of surviving a hostile
 * store: a browser that blocks site data throws on `setItem` too, and so does
 * one that is simply full. Losing a settings write is a small, recoverable
 * disappointment; crashing the caller is not, and the callers here are a
 * keyboard remap and an accessibility toggle -- both things a player does
 * mid-session.
 *
 * It returns whether the write landed, so a caller that wants to say so can.
 * Nothing does yet, and that is deliberate: telling the player "your settings
 * will not be remembered" is a UI decision, not one to make inside a storage
 * helper.
 */
function writeJson(store: KeyValueStore, key: string, value: unknown): boolean {
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * The browser's own key/value store, or an in-memory stand-in when it cannot
 * be reached.
 *
 * Reaching for `window.localStorage` is itself a throwing operation: Chrome
 * raises `SecurityError` from the **property getter** when site data is blocked
 * for the origin, so a guard that only wraps `getItem` never runs. Both shapes
 * are covered here -- the access and the first call -- because a store that
 * resolves and then throws on every read is not usable either.
 *
 * The fallback is a real `Map`, not a store that drops writes: within one page
 * load, settings a player changes then keep working. They simply do not
 * survive a reload, which is the honest consequence of a browser that will not
 * store them.
 *
 * This lives in `src/input/` rather than beside the `KeyValueStore` interface
 * in `src/shared/`, on purpose: nothing under `src/shared/` references a DOM
 * global today, and `src/services/` consumes that interface under an asserted
 * no-I/O rule (issue #121 item 1). Putting a `window` access there would be
 * the first, and would put a browser dependency underneath modules that are
 * checked for not having one. When a second consumer needs a browser store,
 * that is the moment to decide where a shared one belongs.
 */
export function resolveBrowserKeyValueStore(): KeyValueStore {
  try {
    const store = globalThis.localStorage;
    // A store that exists but refuses reads is worse than none: every caller
    // would take the fallback path on every read while believing it persisted.
    // One probe settles it, and `getItem` on an absent key is side-effect free.
    store.getItem(INPUT_SETTINGS_STORAGE_KEY);
    return store;
  } catch {
    const memory = new Map<string, string>();
    return {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => {
        memory.set(key, value);
      },
    };
  }
}

export function loadInputSettings(store: KeyValueStore): InputSettings {
  return decodeInputSettings(readJson(store, INPUT_SETTINGS_STORAGE_KEY)) ?? DEFAULT_INPUT_SETTINGS;
}

export function saveInputSettings(store: KeyValueStore, settings: InputSettings): void {
  writeJson(store, INPUT_SETTINGS_STORAGE_KEY, settings);
}

export function loadAccessibilitySettings(store: KeyValueStore): AccessibilitySettings {
  return decodeAccessibilitySettings(readJson(store, ACCESSIBILITY_SETTINGS_STORAGE_KEY)) ?? DEFAULT_ACCESSIBILITY_SETTINGS;
}

export function saveAccessibilitySettings(store: KeyValueStore, settings: AccessibilitySettings): void {
  writeJson(store, ACCESSIBILITY_SETTINGS_STORAGE_KEY, settings);
}

/** Persists a remap only when it is valid, so a rejected binding never reaches storage. */
export function remapAndPersistKeyboardBinding(
  store: KeyValueStore,
  settings: InputSettings,
  bindingIndex: number,
  code: string,
): InputSettingsValidationResult {
  const result = remapKeyboardBinding(settings, bindingIndex, code);
  if (result.ok) saveInputSettings(store, result.value);
  return result;
}

/**
 * The theme preference, through the same guarded read as every other setting.
 *
 * A store that throws on access is the case `resolveBrowserKeyValueStore`
 * already answers with an in-memory `Map`, and `readJson` answers a corrupt
 * value with `undefined` -- so a browser with site data blocked still gets a
 * theme, still switches it, and simply does not remember it. That is the
 * behaviour #1157 requires, and it is inherited rather than reimplemented.
 */
export function loadThemeSettings(store: KeyValueStore): ThemeSettings {
  return decodeThemeSettings(readJson(store, THEME_SETTINGS_STORAGE_KEY)) ?? DEFAULT_THEME_SETTINGS;
}

/** Returns whether the write landed, so a caller that wants to say so can. */
export function saveThemeSettings(store: KeyValueStore, settings: ThemeSettings): boolean {
  return writeJson(store, THEME_SETTINGS_STORAGE_KEY, settings);
}

/**
 * The layout preference, through the same guarded read as every other setting.
 *
 * Nothing new is defended here and that is the point: a store that throws on
 * access is answered by `resolveBrowserKeyValueStore`'s in-memory `Map`, and a
 * corrupt value by `readJson`'s `undefined`. A browser with site data blocked
 * still collapses panels and drags separators for the rest of the page load
 * and simply does not remember them.
 */
export function loadLayoutSettings(store: KeyValueStore): LayoutSettings {
  return decodeLayoutSettings(readJson(store, LAYOUT_SETTINGS_STORAGE_KEY)) ?? DEFAULT_LAYOUT_SETTINGS;
}

/** Returns whether the write landed, so a caller that wants to say so can. */
export function saveLayoutSettings(store: KeyValueStore, settings: LayoutSettings): boolean {
  return writeJson(store, LAYOUT_SETTINGS_STORAGE_KEY, settings);
}
