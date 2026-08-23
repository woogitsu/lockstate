import {
  type AccessibilitySettings,
  DEFAULT_ACCESSIBILITY_SETTINGS,
  decodeAccessibilitySettings,
} from './accessibility';
import { DEFAULT_KEYBOARD_BINDINGS } from './bindings';
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
 */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const DEFAULT_INPUT_SETTINGS: InputSettings = {
  version: INPUT_SETTINGS_VERSION,
  keyboardBindings: DEFAULT_KEYBOARD_BINDINGS,
};

const INPUT_SETTINGS_STORAGE_KEY = 'lockstate.settings.input';
const ACCESSIBILITY_SETTINGS_STORAGE_KEY = 'lockstate.settings.accessibility';

function readJson(store: KeyValueStore, key: string): unknown {
  const raw = store.getItem(key);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export function loadInputSettings(store: KeyValueStore): InputSettings {
  return decodeInputSettings(readJson(store, INPUT_SETTINGS_STORAGE_KEY)) ?? DEFAULT_INPUT_SETTINGS;
}

export function saveInputSettings(store: KeyValueStore, settings: InputSettings): void {
  store.setItem(INPUT_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function loadAccessibilitySettings(store: KeyValueStore): AccessibilitySettings {
  return decodeAccessibilitySettings(readJson(store, ACCESSIBILITY_SETTINGS_STORAGE_KEY)) ?? DEFAULT_ACCESSIBILITY_SETTINGS;
}

export function saveAccessibilitySettings(store: KeyValueStore, settings: AccessibilitySettings): void {
  store.setItem(ACCESSIBILITY_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
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
