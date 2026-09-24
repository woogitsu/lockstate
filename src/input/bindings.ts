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
  // The arrow keys, because the Build panel's on-screen hint has always told the
  // player they work and no binding existed: `hud.build.arm-hint` says "the
  // arrow keys still move the camera", and all four moved the camera by exactly
  // zero while `KeyS` moved it 180.89 (issue #200, measured in a browser).
  //
  // Two ways to make that sentence true, and this is the one taken: the hint is
  // the player-visible contract and it already promised these keys, so matching
  // the code to the promise is smaller than withdrawing the promise. Arrow keys
  // for camera movement is also not a mechanic anyone has to be taught. The
  // alternative -- rewriting the hint to name W/A/S/D -- would have left a
  // player who reached for the arrows with the same "this build is broken"
  // impression on their first session.
  //
  // Deliberately the *same* action ids rather than new ones: this adds a second
  // way to reach a control that exists, not a control.
  { device: 'keyboard', code: 'ArrowUp', action: 'camera.up', contexts: ['world', 'construction'] },
  { device: 'keyboard', code: 'ArrowDown', action: 'camera.down', contexts: ['world', 'construction'] },
  { device: 'keyboard', code: 'ArrowLeft', action: 'camera.left', contexts: ['world', 'construction'] },
  { device: 'keyboard', code: 'ArrowRight', action: 'camera.right', contexts: ['world', 'construction'] },
  { device: 'keyboard', code: 'Equal', action: 'camera.zoom.in', contexts: ['world', 'construction'] },
  { device: 'keyboard', code: 'Minus', action: 'camera.zoom.out', contexts: ['world', 'construction'] },
  { device: 'keyboard', code: 'Escape', action: 'build.cancel', contexts: ['world', 'construction', 'modal'] },
  // Undo and redo the last build gesture (#261). The transaction stack
  // `ConstructionSystem` maintains could be pushed and never popped: `undo()`
  // and `redo()` are implemented, `Undo` and `Redo` are declared commands with
  // handler branches that call them, and nothing in the application could
  // produce one -- no control, no binding, no intent.
  //
  // ## No modifier is expressed here, because none can be
  //
  // `KeyboardBinding` has four fields and none of them is a modifier, and
  // `KeyboardEventLike` reads `code` and `repeat` and nothing else -- so the
  // adapter cannot tell `Z` from `Ctrl`+`Z` from `Cmd`+`Z`, and a binding
  // cannot ask it to. **All three therefore reach this entry**, which
  // `tests/browser/world-scene-input.spec.ts` measures rather than assumes:
  // the chord a player already has in their fingers works, and so does the
  // bare key.
  //
  // What is *not* available is the other half of a chord scheme -- undo on
  // `Ctrl`+`Z` and nothing at all on a bare `Z`. That needs a modifier
  // vocabulary in the binding record, which reaches the versioned settings
  // format (`src/input/settings.ts`) and the remapping validator, so it is a
  // schema decision rather than a line here; #261 raises it and deliberately
  // does not invent one. Until it is taken, the bare key is the control the
  // player can rely on and the chord is a coincidence that happens to work.
  //
  // Physical positions, like every binding above: on AZERTY these two are the
  // keys labelled `W` and `Y`. `text-entry` is absent from both contexts, so
  // typing a `z` into the Build panel's coordinate field cancels nothing.
  { device: 'keyboard', code: 'KeyZ', action: 'edit.undo', contexts: ['world', 'construction'] },
  { device: 'keyboard', code: 'KeyY', action: 'edit.redo', contexts: ['world', 'construction'] },
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

/** The actual world-context direction bindings, in the same order the HUD draws their directions. */
export async function cameraMovementKeyHint(
  bindings: readonly KeyboardBinding[],
  layoutSource?: KeyboardLabelSource,
): Promise<string | undefined> {
  const directions = [
    { action: 'camera.up', code: 'ArrowUp', glyph: '↑' },
    { action: 'camera.down', code: 'ArrowDown', glyph: '↓' },
    { action: 'camera.left', code: 'ArrowLeft', glyph: '←' },
    { action: 'camera.right', code: 'ArrowRight', glyph: '→' },
  ] as const;
  const selected = directions.map((direction) => ({
    ...direction,
    binding: bindings.find(
      (entry) => entry.action === direction.action && entry.code === direction.code && entry.contexts.includes('world'),
    ) ?? bindings.find((entry) => entry.action === direction.action && entry.contexts.includes('world')),
  }));
  const available = selected.filter(
    (entry): entry is typeof entry & { binding: KeyboardBinding } => entry.binding !== undefined,
  );
  if (available.length === 0) return undefined;
  if (available.length === 4 && available.every((entry) => entry.binding?.code === entry.code)) {
    return '↑ ↓ ← →';
  }
  const labels = await Promise.all(available.map(async (entry) => {
    const code = entry.binding.code;
    const label = code.startsWith('Arrow')
      ? directions.find((direction) => direction.code === code)?.glyph ?? await resolveKeyboardLabel(code, layoutSource)
      : await resolveKeyboardLabel(code, layoutSource);
    return `${entry.glyph} ${label}`;
  }));
  return labels.join(' · ');
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
