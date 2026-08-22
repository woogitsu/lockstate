import { ACTION_REGISTRY, type ActionId, type InputContextId, type SemanticActionEvent } from './actions';
import type { KeyboardBinding } from './bindings';

export interface KeyboardEventLike {
  readonly code: string;
  readonly repeat?: boolean;
}

export class KeyboardInputAdapter {
  private readonly pressedCodes = new Set<string>();

  public constructor(
    private readonly bindings: readonly KeyboardBinding[],
    private readonly activeContexts: () => readonly InputContextId[],
  ) {}

  public keyDown(event: KeyboardEventLike): readonly SemanticActionEvent[] {
    if (event.repeat || this.pressedCodes.has(event.code)) return [];
    this.pressedCodes.add(event.code);
    return this.eventsFor(event.code, 'started');
  }

  public keyUp(event: KeyboardEventLike): readonly SemanticActionEvent[] {
    if (!this.pressedCodes.delete(event.code)) return [];
    return this.eventsFor(event.code, 'ended');
  }

  public isActive(action: ActionId): boolean {
    const contexts = this.activeContexts();
    return this.bindings.some((binding) =>
      binding.action === action && this.pressedCodes.has(binding.code) && intersects(binding.contexts, contexts),
    );
  }

  private eventsFor(code: string, phase: SemanticActionEvent['phase']): readonly SemanticActionEvent[] {
    const contexts = this.activeContexts();
    return this.bindings
      .filter((binding) => binding.code === code && intersects(binding.contexts, contexts))
      .map((binding) => ({ action: binding.action, phase, source: 'keyboard' as const }))
      .filter((event) => ACTION_REGISTRY[event.action].behavior === 'discrete' || phase === 'started' || phase === 'ended');
  }
}

function intersects(left: readonly InputContextId[], right: readonly InputContextId[]): boolean {
  return left.some((context) => right.includes(context));
}
