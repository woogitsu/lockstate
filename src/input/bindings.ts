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
