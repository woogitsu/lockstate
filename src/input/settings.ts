import { ACTION_IDS, type ActionId, type InputContextId } from './actions';
import { findBindingConflicts, type KeyboardBinding } from './bindings';

export const INPUT_SETTINGS_VERSION = 1 as const;

export interface InputSettings {
  readonly version: typeof INPUT_SETTINGS_VERSION;
  readonly keyboardBindings: readonly KeyboardBinding[];
}

export type InputSettingsValidationResult =
  | { readonly ok: true; readonly value: InputSettings }
  | {
      readonly ok: false;
      readonly reason: 'invalid-shape' | 'binding-conflict';
      readonly conflicts?: ReturnType<typeof findBindingConflicts>;
    };

function isActionId(value: unknown): value is ActionId {
  return typeof value === 'string' && ACTION_IDS.includes(value as ActionId);
}

function isContext(value: unknown): value is InputContextId {
  return value === 'world' || value === 'construction' || value === 'modal' || value === 'text-entry';
}

export function decodeInputSettings(input: unknown): InputSettings | undefined {
  const result = validateInputSettings(input);
  return result.ok ? result.value : undefined;
}

export function validateInputSettings(input: unknown): InputSettingsValidationResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, reason: 'invalid-shape' };
  }
  const record = input as Record<string, unknown>;
  if (record.version !== INPUT_SETTINGS_VERSION || !Array.isArray(record.keyboardBindings)) return { ok: false, reason: 'invalid-shape' };
  const bindings: KeyboardBinding[] = [];
  for (const item of record.keyboardBindings) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return { ok: false, reason: 'invalid-shape' };
    const binding = item as Record<string, unknown>;
    if (binding.device !== 'keyboard' || typeof binding.code !== 'string' || !isActionId(binding.action) || !Array.isArray(binding.contexts) || !binding.contexts.every(isContext)) return { ok: false, reason: 'invalid-shape' };
    bindings.push({ device: 'keyboard', code: binding.code, action: binding.action, contexts: binding.contexts });
  }
  const conflicts = findBindingConflicts(bindings);
  if (conflicts.length > 0) return { ok: false, reason: 'binding-conflict', conflicts };
  return { ok: true, value: { version: INPUT_SETTINGS_VERSION, keyboardBindings: bindings } };
}

export function remapKeyboardBinding(
  settings: InputSettings,
  bindingIndex: number,
  code: string,
): InputSettingsValidationResult {
  if (!Number.isInteger(bindingIndex) || bindingIndex < 0 || bindingIndex >= settings.keyboardBindings.length || code.length === 0) {
    return { ok: false, reason: 'invalid-shape' };
  }
  const keyboardBindings = settings.keyboardBindings.map((binding, index) =>
    index === bindingIndex ? { ...binding, code } : binding,
  );
  return validateInputSettings({ version: INPUT_SETTINGS_VERSION, keyboardBindings });
}
