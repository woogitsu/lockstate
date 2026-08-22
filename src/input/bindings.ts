import { ACTION_REGISTRY, type ActionId, type InputContextId } from './actions';

export interface KeyboardBinding {
  readonly device: 'keyboard';
  readonly code: string;
  readonly action: ActionId;
  readonly contexts: readonly InputContextId[];
}

export const DEFAULT_KEYBOARD_BINDINGS: readonly KeyboardBinding[] = [
  { device: 'keyboard', code: 'KeyW', action: 'camera.up', contexts: ['world', 'construction'] },
  { device: 'keyboard', code: 'KeyS', action: 'camera.down', contexts: ['world', 'construction'] },
  { device: 'keyboard', code: 'KeyA', action: 'camera.left', contexts: ['world', 'construction'] },
  { device: 'keyboard', code: 'KeyD', action: 'camera.right', contexts: ['world', 'construction'] },
  { device: 'keyboard', code: 'Equal', action: 'camera.zoom.in', contexts: ['world', 'construction'] },
  { device: 'keyboard', code: 'Minus', action: 'camera.zoom.out', contexts: ['world', 'construction'] },
  { device: 'keyboard', code: 'Escape', action: 'build.cancel', contexts: ['world', 'construction', 'modal'] },
];

export interface BindingConflict {
  readonly code: 'duplicate-binding' | 'invalid-action' | 'empty-contexts';
  readonly bindingIndex: number;
  readonly conflictingBindingIndex?: number;
}

export interface KeyboardLayoutMap {
  get(code: string): string | undefined;
}

export interface KeyboardLabelSource {
  getLayoutMap(): Promise<KeyboardLayoutMap>;
}

const FALLBACK_KEY_LABELS: Readonly<Record<string, string>> = {
  Escape: 'Esc',
  Equal: '+',
  Minus: '-',
  Space: 'Space',
};

export function fallbackKeyboardLabel(code: string): string {
  if (code in FALLBACK_KEY_LABELS) return FALLBACK_KEY_LABELS[code] as string;
  if (code.startsWith('Key') && code.length === 4) return code.slice(3);
  if (code.startsWith('Digit') && code.length === 6) return code.slice(5);
  return code;
}

export async function resolveKeyboardLabel(
  code: string,
  layoutSource?: KeyboardLabelSource,
): Promise<string> {
  if (layoutSource !== undefined) {
    try {
      const label = (await layoutSource.getLayoutMap()).get(code);
      if (label !== undefined && label.length > 0) return label;
    } catch {
      // Keyboard layout APIs are optional and must not make controls unavailable.
    }
  }
  return fallbackKeyboardLabel(code);
}

export function findBindingConflicts(
  bindings: readonly KeyboardBinding[],
): readonly BindingConflict[] {
  const conflicts: BindingConflict[] = [];
  const seen = new Map<string, number>();
  bindings.forEach((binding, bindingIndex) => {
    if (!(binding.action in ACTION_REGISTRY)) {
      conflicts.push({ code: 'invalid-action', bindingIndex });
      return;
    }
    if (binding.contexts.length === 0) {
      conflicts.push({ code: 'empty-contexts', bindingIndex });
      return;
    }
    for (const context of binding.contexts) {
      const key = `${binding.device}:${binding.code}:${context}`;
      const previousIndex = seen.get(key);
      if (previousIndex !== undefined && bindings[previousIndex]?.action !== binding.action) {
        conflicts.push({ code: 'duplicate-binding', bindingIndex, conflictingBindingIndex: previousIndex });
      } else {
        seen.set(key, bindingIndex);
      }
    }
  });
  return conflicts;
}
