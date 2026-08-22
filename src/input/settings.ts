import { ACTION_IDS, type ActionId, type InputContextId } from './actions';
import { findBindingConflicts, type KeyboardBinding } from './bindings';

export const INPUT_SETTINGS_VERSION = 1 as const;

export interface InputSettings {
  readonly version: typeof INPUT_SETTINGS_VERSION;
  readonly keyboardBindings: readonly KeyboardBinding[];
}

function isActionId(value: unknown): value is ActionId {
  return typeof value === 'string' && ACTION_IDS.includes(value as ActionId);
}

function isContext(value: unknown): value is InputContextId {
  return value === 'world' || value === 'construction' || value === 'modal' || value === 'text-entry';
}

export function decodeInputSettings(input: unknown): InputSettings | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;
  const record = input as Record<string, unknown>;
  if (record.version !== INPUT_SETTINGS_VERSION || !Array.isArray(record.keyboardBindings)) return undefined;
  const bindings: KeyboardBinding[] = [];
  for (const item of record.keyboardBindings) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return undefined;
    const binding = item as Record<string, unknown>;
    if (binding.device !== 'keyboard' || typeof binding.code !== 'string' || !isActionId(binding.action) || !Array.isArray(binding.contexts) || !binding.contexts.every(isContext)) return undefined;
    bindings.push({ device: 'keyboard', code: binding.code, action: binding.action, contexts: binding.contexts });
  }
  if (findBindingConflicts(bindings).length > 0) return undefined;
  return { version: INPUT_SETTINGS_VERSION, keyboardBindings: bindings };
}
