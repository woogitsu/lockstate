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

  /**
   * Focus left the page: every held key is treated as released.
   *
   * A `keyup` is delivered to whichever window has focus, so holding a camera
   * key and alt-tabbing sends the release somewhere else and leaves the code in
   * `pressedCodes` forever. Phaser's loop runs on `requestAnimationFrame`, which
   * an unfocused-but-visible tab is not throttled out of, so the camera keeps
   * panning: measured at **1,419 world units over three seconds** with nobody
   * touching the keyboard, and it did not stop on refocus or on a click
   * (issue #202). The player's only recovery was to guess which key was stuck.
   *
   * Returns `void` rather than the `'ended'` events for the keys it drops.
   * Whether a synthetic release should emit them is a real question, and it is
   * moot today: both `keyDown` and `keyUp` have their return values discarded
   * at the one production call site (#200). Returning events nobody reads would
   * be inventing a contract to look complete.
   */
  public releaseAll(): void {
    this.pressedCodes.clear();
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
