import type { ActionId, InputContextId, SemanticActionEvent } from './actions';
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
    const started = this.eventsFor(event.code, 'started');
    // A key typed into a text field must not become a held world action when
    // focus leaves that field before keyup. Only latch keys that began an
    // action in the context that owned their original press.
    if (started.length === 0) return [];
    this.pressedCodes.add(event.code);
    return started;
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
   * Returns `void` rather than the `'ended'` events for the keys it drops, and
   * that is now a choice rather than a moot point: since #200 the one
   * production caller does consume what `keyDown` and `keyUp` return
   * (`WorldScene.handleActionEvents`). It reads `'started'` only, so emitting
   * releases here would change nothing it can see -- but a consumer that wanted
   * key-ups would want these, and the question is left for whoever writes one.
   * The keys really are released either way; only the notification is withheld.
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
    // There used to be a third step here:
    //
    //   .filter((event) => ACTION_REGISTRY[event.action].behavior === 'discrete'
    //                      || phase === 'started' || phase === 'ended')
    //
    // `phase` is typed `SemanticActionEvent['phase']`, which `actions.ts`
    // defines as `'started' | 'ended'` -- so the second disjunct was
    // **unconditionally true** and the predicate could never remove an element.
    // It read as a rule ("a continuous action only emits on a phase boundary")
    // and enforced nothing; the `behavior` term was never evaluated for its
    // answer. That is this repository's signature defect in its smallest
    // possible form, and issue #200 proved it with a matched pair: deleting the
    // whole filter survived the entire suite, while narrowing it to
    // `behavior === 'discrete'` was killed by an existing test -- so the
    // behaviour the suite pins depends on the tautology being true.
    //
    // Deleted rather than repaired, and still deliberately not replaced. The
    // events do have a consumer now (`WorldScene.handleActionEvents`, #200
    // items 2 and 3), and it turned out not to need this: the consumer's rule
    // is "act on `'started'`", which is about what a *reader* does with a
    // release, not about which events exist. Reinstating a phase rule here
    // would take that choice away from a future consumer that wants a key-up
    // -- a held modifier, a press-and-hold -- and buy nothing, since this
    // adapter emits at most one event per key per phase.
    return this.bindings
      .filter((binding) => binding.code === code && intersects(binding.contexts, contexts))
      .map((binding) => ({ action: binding.action, phase, source: 'keyboard' as const }));
  }
}

function intersects(left: readonly InputContextId[], right: readonly InputContextId[]): boolean {
  return left.some((context) => right.includes(context));
}
