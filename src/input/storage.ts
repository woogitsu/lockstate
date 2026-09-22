import type { KeyValueStore } from '../shared/key-value-store';
import {
  type AccessibilitySettings,
  DEFAULT_ACCESSIBILITY_SETTINGS,
  decodeAccessibilitySettings,
} from './accessibility';
import { DEFAULT_KEYBOARD_BINDINGS } from './bindings';
import {
  type LanguageSettings,
  DEFAULT_LANGUAGE_SETTINGS,
  decodeLanguageSettings,
} from './language-preference';
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
 * The interface language's **own** key, for the reason the theme and the
 * layout each have one (#663).
 *
 * Constitution article 13 asks for *"oddzielne klucze pamięci i niezależny
 * reset"* -- separate memory keys and an independent reset -- and the Layout
 * menu already ships a Reset control that clears the layout key. A language
 * folded into that record would be reset by a player putting their panels
 * back, which is the one preference they are least likely to expect to lose:
 * a player who cannot read English would land on an English page with the
 * control they need to undo it labelled in English.
 *
 * It is also why the language is **not** a field of the save payload.
 * `docs/LOCALIZATION.md`'s standing rule is that no translated string may be
 * persisted, and the tag itself is not prison state either: a save carried to
 * another machine must not change that machine's language, and
 * `SAVE_SCHEMA_VERSION` does not move for a device preference.
 */
const LANGUAGE_SETTINGS_STORAGE_KEY = 'lockstate.settings.language';

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

/**
 * The language preference, through the same guarded read as every other
 * setting.
 *
 * Nothing new is defended here and that is the point: a store that throws on
 * access is answered by `resolveBrowserKeyValueStore`'s in-memory `Map`, and a
 * corrupt value by `readJson`'s `undefined` -- which decodes to `'auto'`, so a
 * browser with site data blocked still boots in the language its own
 * `navigator.languages` asks for.
 */
export function loadLanguageSettings(store: KeyValueStore): LanguageSettings {
  return decodeLanguageSettings(readJson(store, LANGUAGE_SETTINGS_STORAGE_KEY)) ?? DEFAULT_LANGUAGE_SETTINGS;
}

/**
 * Returns whether the write landed, and **this caller is the first that must
 * not ignore it.**
 *
 * A theme that fails to persist still switches; the page is simply back to the
 * old one after a reload. A language change *is* a reload (see the ADR draft
 * `docs/adr/0119-how-a-language-change-reaches-a-running-page.md`), so a
 * refused write would reload the page straight back into the language the
 * player just asked to leave -- a control that appears to do nothing. The
 * composition root reads this and declines to reload instead.
 */
export function saveLanguageSettings(store: KeyValueStore, settings: LanguageSettings): boolean {
  return writeJson(store, LANGUAGE_SETTINGS_STORAGE_KEY, settings);
}

/**
 * One `storage` event, as much of it as this module needs (#1199).
 *
 * A structural port rather than the DOM's `StorageEvent`, for the reason every
 * other seam in this tree is one: `docs/INPUT.md`'s rule is that settings
 * persistence goes through an injectable contract "so tests stay headless",
 * and a `node` test can construct these two fields and cannot construct a
 * `StorageEvent`. A real `StorageEvent` satisfies it structurally, so the
 * composition root hands the browser's own event straight through.
 */
export interface SettingsStorageEvent {
  /** The key that changed, or `null` when the whole store was cleared. */
  readonly key: string | null;
  /** The value now at that key, or `null` when it was removed. */
  readonly newValue: string | null;
}

/** The event surface `subscribeToSettingsChanges` attaches to -- `window` in the running app. */
export interface SettingsChangeTarget {
  addEventListener(type: 'storage', listener: (event: SettingsStorageEvent) => void): void;
  removeEventListener(type: 'storage', listener: (event: SettingsStorageEvent) => void): void;
}

/**
 * What a second tab is told when a first tab writes a preference.
 *
 * **Three of the four settings keys are here and the fourth is deliberately
 * not.** `lockstate.settings.language` has no handler because this repository
 * has no path that hands a different `Localizer` to an interface that is
 * already mounted -- 19 modules under `src/ui/` hold one across 331 call
 * sites and none of them exposes a setter, which is the count
 * `docs/adr/0119-how-a-language-change-reaches-a-running-page.md` measured
 * and the reason a language change is applied by reloading the page. A
 * `storage` handler for that key could only do one of two things, and both are
 * worse than doing nothing: re-texting what happens to repaint would turn the
 * world's room labels Polish under an English HUD (`WorldSceneOptions.roomName`
 * closes over the localizer and `RoomLabelLayer` re-reads it every refresh,
 * while a tab label is written once at construction), and reloading a tab the
 * player did not touch would interrupt a game they are in the middle of
 * playing to apply a preference they expressed somewhere else.
 *
 * So the decision this subscription records is that the **cheap** three
 * follow and the expensive one does not: the language a tab booted in is the
 * language it stays in until it is reloaded, and nothing on screen says
 * otherwise.
 */
export interface SettingsChangeHandlers {
  readonly onAccessibilityChange?: (settings: AccessibilitySettings) => void;
  readonly onThemeChange?: (settings: ThemeSettings) => void;
  readonly onLayoutChange?: (settings: LayoutSettings) => void;
}

/**
 * Follows preference writes made by **other** tabs of this origin (#1199).
 *
 * `storage` is the browser's own cross-document notification and it has one
 * property that makes this safe without any loop guard: **it does not fire in
 * the document that performed the write.** So a tab that applies what it is
 * told here cannot echo the value back to the tab it came from, and the
 * handlers below are free to be the same apply-paths the local controls use.
 *
 * Every decode goes through the same `decode*` the load path uses, so a value
 * another tab wrote is checked exactly as a value read at boot is; an
 * unparseable or unrecognised one becomes that key's defaults rather than
 * being ignored, because "another tab wrote rubbish here" and "this key is
 * empty" are the same fact for a reader.
 *
 * `event.key === null` is the whole store being cleared -- `localStorage.clear()`
 * reports no key rather than one event per key -- so it is answered as all
 * three keys reverting to their defaults, which is what the store now holds.
 *
 * Returns its own unsubscribe, so a caller with a teardown has one. The
 * composition root has no teardown and does not use it: the subscription lives
 * exactly as long as the document does.
 */
export function subscribeToSettingsChanges(
  target: SettingsChangeTarget,
  handlers: SettingsChangeHandlers,
): () => void {
  const listener = (event: SettingsStorageEvent): void => {
    const changed = event.key;
    if (changed === null) {
      handlers.onAccessibilityChange?.(DEFAULT_ACCESSIBILITY_SETTINGS);
      handlers.onThemeChange?.(DEFAULT_THEME_SETTINGS);
      handlers.onLayoutChange?.(DEFAULT_LAYOUT_SETTINGS);
      return;
    }
    // `JSON.parse` on a value another document wrote, so the same `try` the
    // read path puts around `getItem` is around this: a tab with a corrupt
    // entry must not take the page down.
    let parsed: unknown;
    try {
      parsed = event.newValue === null ? undefined : JSON.parse(event.newValue);
    } catch {
      parsed = undefined;
    }
    switch (changed) {
      case ACCESSIBILITY_SETTINGS_STORAGE_KEY:
        handlers.onAccessibilityChange?.(
          decodeAccessibilitySettings(parsed) ?? DEFAULT_ACCESSIBILITY_SETTINGS,
        );
        return;
      case THEME_SETTINGS_STORAGE_KEY:
        handlers.onThemeChange?.(decodeThemeSettings(parsed) ?? DEFAULT_THEME_SETTINGS);
        return;
      case LAYOUT_SETTINGS_STORAGE_KEY:
        handlers.onLayoutChange?.(decodeLayoutSettings(parsed) ?? DEFAULT_LAYOUT_SETTINGS);
        return;
      default:
        // Every other key on this origin, `lockstate.settings.language` and
        // `lockstate.settings.input` among them. Saved prisons live in
        // IndexedDB and never reach this event at all.
        return;
    }
  };
  target.addEventListener('storage', listener);
  return () => {
    target.removeEventListener('storage', listener);
  };
}
