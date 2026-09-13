/**
 * Single-owner pointer gestures: who holds a pointer, and every way they lose
 * it.
 *
 * ## Why this is in `src/input/` and not in the control that uses it
 *
 * Constitution article 17 -- *"Gest ma jednego właściciela"* -- is a rule about
 * **arbitration**, not about a separator: a resize drag must not pan the
 * camera or place a building, a `pointercancel` and a lost capture must end the
 * gesture, and a second finger must not leave the first one's gesture live.
 * `docs/IDENTITY_V5_ROLLOUT.md` says the same thing in this repository's terms:
 * *"`src/input/` already owns pointer and touch tiers -- the resize handle
 * belongs inside that abstraction, not beside it."*
 *
 * Two properties follow from putting it here rather than inside
 * `src/ui/primitives/resize-separator.ts`:
 *
 *   - **It is reachable from the unit suite.** `vitest.config.ts` runs
 *     `environment: 'node'` with no jsdom, so anything that touches `document`
 *     is not merely untested but *unreachable* -- a mutation to a listener body
 *     survives because nothing can observe it (the same argument
 *     `readNumberFieldEntry` makes for itself in `number-field.ts`). Every
 *     cancellation path this repository has to prove is decided here, in a
 *     class a node test can drive event by event.
 *   - **The next gesture that needs an owner does not re-derive it.** The world
 *     tools already learned one of these rules the expensive way: `a773f3a2`,
 *     *"cancel placement when a second touch arrives"*, found that a second
 *     stationary finger left the first finger's wall, room or object preview
 *     live, so a release could place it. That fix lives in `WorldScene`; this
 *     is the same rule stated once, where a second consumer can reach it.
 *
 * ## What it deliberately does not do
 *
 * It does not touch the DOM. `setPointerCapture`, `preventDefault` and the
 * listener set are the calling control's job, because they are what *enforce*
 * the decision this class *makes*, and only a real browser can verify them.
 * It also carries no notion of a threshold: gesture arbitration for building is
 * modal rather than threshold-based in this repository (`docs/INPUT.md`), and a
 * separator is modal in the strongest possible sense -- the gesture starts on a
 * handle whose only purpose is to start it.
 *
 * ## One axis, not two
 *
 * A separator moves along exactly one axis, so a claim carries a single
 * `origin` coordinate and reports a single offset. A two-axis consumer would
 * hold two of these or widen the type; nothing here needs it yet, and a
 * `{x, y}` that every caller half-ignores is worse than a number.
 */

/** How a claimed gesture ended. Exactly one of these is not a cancellation. */
export type PointerGestureEnd =
  /** The owned pointer came up where it was expected to. The only committing end. */
  | 'released'
  /** The browser withdrew the pointer: a touch became a scroll, a pen left range. */
  | 'pointercancel'
  /** `lostpointercapture` arrived while the gesture still believed it held the pointer. */
  | 'capture-lost'
  /** A second pointer went down anywhere while this one was held. */
  | 'second-pointer'
  /** The window stopped being focused, so the release will be delivered elsewhere. */
  | 'window-blur'
  /** The cursor left the document entirely. */
  | 'left-window'
  /** The owner gave up: `Escape`, or the control being torn down mid-drag. */
  | 'abandoned';

export type PointerGestureEvent =
  /** Nothing happened: the pointer is not ours, or there is no gesture to end. */
  | { readonly kind: 'none' }
  /** The gesture now owns this pointer. The caller should capture it. */
  | { readonly kind: 'claimed'; readonly pointerId: number }
  /** The owned pointer moved. `offset` is signed travel from the claim's origin. */
  | { readonly kind: 'travelled'; readonly pointerId: number; readonly offset: number }
  /** The gesture is over, however it got there. */
  | { readonly kind: 'ended'; readonly pointerId: number; readonly end: PointerGestureEnd };

const NOTHING: PointerGestureEvent = { kind: 'none' };

interface Claim {
  readonly pointerId: number;
  readonly origin: number;
}

/**
 * A gesture that owns at most one pointer at a time.
 *
 * Every method answers with what happened rather than mutating something the
 * caller then has to re-read, so a test can assert the whole transition and a
 * caller cannot act on a state that no longer holds.
 */
export class ExclusivePointerGesture {
  private held: Claim | undefined;

  /** The pointer this gesture owns, or `undefined` when it owns none. */
  public get activePointerId(): number | undefined {
    return this.held?.pointerId;
  }

  public get isActive(): boolean {
    return this.held !== undefined;
  }

  /**
   * Take ownership of a pointer that went down on the owner's own element.
   *
   * **A second pointer does not steal the gesture and does not join it: it ends
   * it.** That is `a773f3a2`'s lesson applied here rather than re-learned. Two
   * fingers on a screen mean a pinch (`src/input/gestures.ts`), and a separator
   * that kept dragging under one of them while the map zoomed under the other
   * would be exactly the two-owner gesture article 17 forbids. Ending is also
   * the safe direction: a cancelled resize costs the player one re-drag, where
   * a gesture left live costs them a panel that jumps when the second finger
   * lifts.
   *
   * Re-entry on the *same* pointer is `none` rather than a second claim, so a
   * duplicated `pointerdown` (a control that listens on itself and on an
   * ancestor) cannot move the origin out from under an in-flight drag.
   */
  public claim(pointerId: number, origin: number): PointerGestureEvent {
    if (this.held !== undefined) {
      if (this.held.pointerId === pointerId) return NOTHING;
      return this.end('second-pointer');
    }
    this.held = { pointerId, origin };
    return { kind: 'claimed', pointerId };
  }

  /**
   * A pointer went down somewhere that is *not* the owner's element.
   *
   * The owner hears about this only because it listens on the document while a
   * drag is live. Under pointer capture the first pointer's own events are
   * retargeted to the handle, so this is the only way a second finger landing
   * on the map is ever seen -- and it has to be seen, or the pinch below the
   * drag goes unnoticed.
   */
  public observeForeignPointerDown(pointerId: number): PointerGestureEvent {
    if (this.held === undefined) return NOTHING;
    if (this.held.pointerId === pointerId) return NOTHING;
    return this.end('second-pointer');
  }

  /**
   * Report where the owned pointer is now.
   *
   * The offset is measured from the claim's origin on every move rather than
   * accumulated from the previous one. Accumulation drifts, and -- more
   * importantly for a clamped range -- it desynchronises from the pointer the
   * moment the value hits a limit: a drag pushed 200 px past the maximum and
   * then pulled back would have to travel 200 px before the handle moved again
   * under an accumulating implementation, and travels back immediately under
   * this one, which is what a hand on a splitter expects.
   */
  public track(pointerId: number, coordinate: number): PointerGestureEvent {
    if (this.held === undefined || this.held.pointerId !== pointerId) return NOTHING;
    return { kind: 'travelled', pointerId, offset: coordinate - this.held.origin };
  }

  /** The owned pointer came up. The only end that commits. */
  public release(pointerId: number): PointerGestureEvent {
    if (this.held === undefined || this.held.pointerId !== pointerId) return NOTHING;
    return this.end('released');
  }

  /**
   * End the gesture without a commit.
   *
   * `pointerId` is optional because half of these arrive from events that name
   * no pointer at all -- `blur` is a window event, and an owner tearing itself
   * down has only its own intent. When it is given it is checked, so a
   * `pointercancel` for a pointer this gesture never held cannot end the one it
   * does.
   */
  public cancel(end: Exclude<PointerGestureEnd, 'released'>, pointerId?: number): PointerGestureEvent {
    if (this.held === undefined) return NOTHING;
    if (pointerId !== undefined && this.held.pointerId !== pointerId) return NOTHING;
    return this.end(end);
  }

  private end(end: PointerGestureEnd): PointerGestureEvent {
    const claim = this.held;
    if (claim === undefined) return NOTHING;
    this.held = undefined;
    return { kind: 'ended', pointerId: claim.pointerId, end };
  }
}
