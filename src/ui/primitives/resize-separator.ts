import { ExclusivePointerGesture, type PointerGestureEnd } from '../../input/pointer-gesture';
import { element } from './dom';

/**
 * A window splitter: a separator the player can drag, arrow, Home/End, collapse
 * and double-click back to its default.
 *
 * Stage 3 of the 2026-09-13 identity rollout (`docs/IDENTITY_V5_ROLLOUT.md`,
 * issue #1159). **It is deliberately not wired into the HUD here**: the token
 * architecture stages 1 and 2 rebuild are live on the same tree, and the
 * integration -- the left rail's 72-180 px, the right inspector's 260-600 px
 * bounded by the map's remaining space, the phone sheet's 180 px to about 66%
 * of the viewport with a 210 px reserve -- is stage 3's own later change. This
 * module therefore **bakes in no limits at all**: the caller supplies the
 * range, and supplies it again whenever the viewport moves it.
 *
 * ## The accessibility model, and what it is not
 *
 * `role="separator"` with `tabindex="0"`, an accessible name, and
 * `aria-valuenow` / `aria-valuemin` / `aria-valuemax` in the same unit the
 * caller's range is in (pixels, in every case stage 3 has). That is the W3C
 * window-splitter pattern, and the delivery's own backlog
 * (`DOKUMENTACJA/04-RESEARCH-I-BACKLOG.md`) records that the pattern's review
 * is unfinished -- **so it is an implementation hint here and never an
 * accessibility certificate**. Nothing in this file may be cited as evidence
 * that a screen reader announces a resize usefully; that is a playtest, and it
 * has not happened.
 *
 * `aria-orientation` is the one that is routinely written backwards, so it is
 * derived rather than passed: a separator between a **left and a right** pane
 * is itself a **vertical** line, so `axis: 'x'` announces
 * `aria-orientation="vertical"`. The axis names the coordinate the drag reads;
 * the orientation names the line the player sees.
 *
 * ## Controlled, with one deliberate exception
 *
 * Like `number-field.ts`, the owner holds the value and the control reports
 * what was asked for. **Unlike it, this control also advances its own copy on
 * every report it makes.** A separator is dragged at the frame rate, and an
 * owner that batches or throttles its writes would otherwise see every move
 * after the first measured against a stale size -- the handle would stick. So
 * `size` here is *the size this control last reported*, and `setSize` is how an
 * owner corrects it (after re-clamping to a range the viewport just changed,
 * say). Where the two disagree, the owner wins, and it wins at its own cadence.
 *
 * ## Styling
 *
 * Three inline properties and no stylesheet, which is a scope decision rather
 * than a taste one: `src/ui/primitives/primitives.css`, `src/ui/tokens.css` and
 * `src/styles.css` are being rebuilt by another agent on this same tree, and a
 * fourth file importing into them would conflict on the design and not merely
 * on the lines. The three set here are the ones without which the control is
 * *functionally* broken rather than merely unpainted -- `touch-action: none`
 * (or the browser scrolls instead of dragging), `user-select: none` (or a drag
 * selects the text either side of it) and a resize cursor. Everything visual --
 * width, hit area, hover, focus ring -- belongs to the integration change and
 * to the token work it waits on.
 */

/** The limits a separator is dragged between, in the caller's own unit. */
export interface SeparatorRange {
  readonly min: number;
  readonly max: number;
}

/** Why the size changed, so an owner can persist a settled value and not a frame of a drag. */
export type SeparatorResizeReason =
  /** A pointer drag, in flight or just committed. */
  | 'pointer'
  /** An arrow, Home or End. */
  | 'keyboard'
  /** A double-click, restoring the caller's default. */
  | 'reset'
  /** A gesture ended without committing; this is the size it started from. */
  | 'cancel';

/** What the control asks its owner to do. `none` is a press that meant nothing here. */
export type SeparatorOutcome =
  | { readonly kind: 'none' }
  /** A pointer was claimed. The DOM layer captures it; an owner learns nothing. */
  | { readonly kind: 'grabbed'; readonly pointerId: number }
  | { readonly kind: 'resize'; readonly size: number; readonly reason: SeparatorResizeReason }
  /** `Enter`. Collapsing is the owner's to define -- the control does not know what a collapsed panel is. */
  | { readonly kind: 'collapse' };

const NOTHING: SeparatorOutcome = { kind: 'none' };

/**
 * The keyboard steps, from the delivery.
 *
 * Named constants rather than literals because the *pair* is the decision: 10
 * and 40 are a 4x coarse step, which is what makes Shift worth pressing on a
 * 128 px range and still lands on the limits rather than overshooting them by
 * an awkward remainder.
 */
export const SEPARATOR_STEP = 10;
export const SEPARATOR_COARSE_STEP = 40;

/**
 * Hold a size inside its range, rounded to whole units.
 *
 * **An inverted range resolves to its minimum, and that case is real rather
 * than defensive.** Stage 3's right inspector is 260-600 px *bounded by the
 * space the map has left*, so a narrow window hands this a maximum below the
 * minimum. Of the two answers, `min` is the one that keeps a panel legible and
 * lets the layout above decide what to do about a window that cannot hold
 * everything; `max` would silently crush the panel to whatever was left and
 * present that as a size the player chose.
 *
 * Rounded because the value is announced: `aria-valuenow="183.9999999999998"`
 * is what a float accumulated over sixty drag frames reads as to a screen
 * reader.
 */
export function clampSeparatorSize(size: number, range: SeparatorRange): number {
  if (!Number.isFinite(size)) return Math.round(range.min);
  if (range.max < range.min) return Math.round(range.min);
  return Math.round(Math.min(Math.max(size, range.min), range.max));
}

/** Everything `readSeparatorKey` needs to answer, and nothing about the DOM. */
export interface SeparatorGeometry {
  /** Which coordinate a drag reads. `'x'` is a vertical line between two side-by-side panes. */
  readonly axis: 'x' | 'y';
  /**
   * `1` when moving along the axis makes the panel *bigger*, `-1` when smaller.
   *
   * The three cases stage 3 has: a left rail with the handle on its right edge
   * is `1`; a right inspector with the handle on its left edge is `-1`; a phone
   * sheet with the handle on its top edge is `-1`.
   */
  readonly growth: 1 | -1;
}

/**
 * The whole of the keyboard decision, as a pure function of a key name.
 *
 * A function and not four branches inside a listener for the reason
 * `readNumberFieldEntry` gives in `number-field.ts`: the unit suite runs in
 * `node` with no DOM, so a mutation inside a listener body is unobservable and
 * therefore ungated. Every step the delivery specifies is asserted against this
 * function; the browser spec then proves the listener reaches it.
 *
 * The rules:
 *
 *   - **Only the two keys that lie along the separator's own axis do
 *     anything.** A vertical separator answers Left and Right and ignores Up
 *     and Down, so the arrow key that would scroll the panel beside it still
 *     scrolls it.
 *   - **The arrow moves the separator, not the number.** `ArrowRight` on a
 *     right-hand inspector makes it *smaller*, because that is the direction
 *     the line goes. Pointer and keyboard must agree about which way is which
 *     -- article 17's *"Limity klawiatury i myszy są spójne"* -- and the growth
 *     multiplier is the single place that agreement is expressed.
 *   - **Home is the minimum and End is the maximum**, in the range's own terms
 *     rather than the screen's. So End on a right-hand inspector moves the
 *     separator *left*, which is the same direction `aria-valuemax` means, and
 *     a player who has just heard "260 to 600" gets the number they were told
 *     about.
 *   - A step that would leave the value where it already is answers `none`
 *     rather than a no-op resize, so an owner that persists on every report
 *     does not write on a key held down at the limit.
 */
export function readSeparatorKey(
  key: string,
  shiftKey: boolean,
  size: number,
  range: SeparatorRange,
  geometry: SeparatorGeometry,
): SeparatorOutcome {
  const settle = (next: number, reason: SeparatorResizeReason): SeparatorOutcome => {
    const clamped = clampSeparatorSize(next, range);
    return clamped === clampSeparatorSize(size, range) ? NOTHING : { kind: 'resize', size: clamped, reason };
  };

  if (key === 'Enter') return { kind: 'collapse' };
  if (key === 'Home') return settle(range.min, 'keyboard');
  if (key === 'End') return settle(range.max < range.min ? range.min : range.max, 'keyboard');

  const towards = geometry.axis === 'x' ? { ArrowLeft: -1, ArrowRight: 1 } : { ArrowUp: -1, ArrowDown: 1 };
  const direction = (towards as Record<string, number | undefined>)[key];
  if (direction === undefined) return NOTHING;

  const step = shiftKey ? SEPARATOR_COARSE_STEP : SEPARATOR_STEP;
  return settle(size + direction * geometry.growth * step, 'keyboard');
}

export interface SeparatorControllerOptions extends SeparatorGeometry {
  readonly size: number;
  readonly range: SeparatorRange;
  /** Where a double-click puts it back to. Clamped like everything else. */
  readonly defaultSize: number;
}

/**
 * The separator's whole behaviour, with no DOM in it.
 *
 * This is the half of the control that has to be provable. Every cancellation
 * path stage 3 names -- `pointercancel`, lost capture, the cursor leaving the
 * window, a second touch arriving mid-drag, a drag that begins on the handle
 * and ends over the map -- reaches the same `interrupt` here, and a node test
 * can drive each one and watch the size go back. The DOM layer below is then a
 * listener-to-method mapping with no decisions in it, and the browser spec
 * exists to prove that the real events arrive where this file says they do.
 */
export class SeparatorController {
  private readonly gesture = new ExclusivePointerGesture();
  private readonly geometry: SeparatorGeometry;
  private readonly defaultSize: number;
  private currentSize: number;
  private currentRange: SeparatorRange;
  /** The size the live drag started from. The value every cancellation restores. */
  private sizeAtGrab = 0;

  public constructor(options: SeparatorControllerOptions) {
    this.geometry = { axis: options.axis, growth: options.growth };
    this.currentRange = options.range;
    this.currentSize = clampSeparatorSize(options.size, options.range);
    this.defaultSize = options.defaultSize;
  }

  public get size(): number {
    return this.currentSize;
  }

  public get range(): SeparatorRange {
    return this.currentRange;
  }

  public get isDragging(): boolean {
    return this.gesture.isActive;
  }

  /** The owner's correction. Wins over whatever this control last reported. */
  public setSize(size: number): void {
    this.currentSize = clampSeparatorSize(size, this.currentRange);
  }

  /**
   * A new range, which the viewport changes without asking anyone.
   *
   * The size is re-clamped immediately, and **silently**: a window that got
   * narrower is not the player asking for a smaller panel, so reporting it as
   * a resize would write a size they never chose into whatever the owner
   * persists. The owner reads `size` back if it wants to know.
   */
  public setRange(range: SeparatorRange): void {
    this.currentRange = range;
    this.currentSize = clampSeparatorSize(this.currentSize, range);
  }

  public pointerDown(pointerId: number, coordinate: number): SeparatorOutcome {
    const event = this.gesture.claim(pointerId, coordinate);
    if (event.kind === 'claimed') {
      this.sizeAtGrab = this.currentSize;
      return { kind: 'grabbed', pointerId };
    }
    // A second pointer on the handle itself ends the first one's drag, exactly
    // as a second pointer anywhere else does.
    if (event.kind === 'ended') return this.restore();
    return NOTHING;
  }

  public pointerMove(pointerId: number, coordinate: number): SeparatorOutcome {
    const event = this.gesture.track(pointerId, coordinate);
    if (event.kind !== 'travelled') return NOTHING;
    return this.report(this.sizeAtGrab + event.offset * this.geometry.growth, 'pointer');
  }

  /**
   * The pointer came up on the handle -- or, under capture, anywhere at all.
   *
   * The release's own coordinate is applied before the gesture is closed. A
   * `pointerup` can carry a position no `pointermove` reported (the browser
   * coalesces, and a fast flick ends between two frames), and dropping it would
   * commit the panel a few pixels from where the hand let go.
   */
  public pointerUp(pointerId: number, coordinate: number): SeparatorOutcome {
    const travelled = this.gesture.track(pointerId, coordinate);
    if (this.gesture.release(pointerId).kind !== 'ended') return NOTHING;
    if (travelled.kind !== 'travelled') return NOTHING;
    return this.report(this.sizeAtGrab + travelled.offset * this.geometry.growth, 'pointer');
  }

  /**
   * End the gesture without committing, and put the size back where the drag
   * started.
   *
   * **Every abnormal end reverts; only a release commits.** The alternative --
   * keeping whatever size the last delivered move produced -- was rejected
   * because the moves a cancellation loses are exactly the ones nobody saw: a
   * `pointercancel` fires when the browser has decided the gesture was
   * something else, and the last coordinate before that decision is not a size
   * the player aimed at. Reverting costs a re-drag; committing a half-gesture
   * costs a panel width the player did not choose and cannot tell apart from a
   * bug.
   *
   * Answers `none` when there is nothing to end, so a `blur` on a page with no
   * drag in flight is free.
   */
  public interrupt(end: Exclude<PointerGestureEnd, 'released'>, pointerId?: number): SeparatorOutcome {
    const event = this.gesture.cancel(end, pointerId);
    if (event.kind !== 'ended') return NOTHING;
    return this.restore();
  }

  /** A pointer went down somewhere else in the document while this drag was live. */
  public foreignPointerDown(pointerId: number): SeparatorOutcome {
    const event = this.gesture.observeForeignPointerDown(pointerId);
    if (event.kind !== 'ended') return NOTHING;
    return this.restore();
  }

  /**
   * A key press, which is two different questions depending on whether a drag
   * is live.
   *
   * `Escape` mid-drag abandons it -- the same key that abandons a wall run or a
   * room rectangle (`docs/INPUT.md`), so the one key a player already knows
   * means "not that" means it here too. Every other key is ignored while
   * dragging rather than applied: arrowing a separator that a hand is holding
   * would give the gesture a second owner in the only sense that matters.
   */
  public key(key: string, shiftKey: boolean): SeparatorOutcome {
    if (this.isDragging) {
      if (key !== 'Escape') return NOTHING;
      return this.interrupt('abandoned');
    }
    return this.applyOutcome(readSeparatorKey(key, shiftKey, this.currentSize, this.currentRange, this.geometry));
  }

  /** A double-click on the handle, which the delivery gives to the default size. */
  public doubleClick(): SeparatorOutcome {
    if (this.isDragging) return NOTHING;
    return this.report(this.defaultSize, 'reset');
  }

  private restore(): SeparatorOutcome {
    return this.report(this.sizeAtGrab, 'cancel');
  }

  private report(size: number, reason: SeparatorResizeReason): SeparatorOutcome {
    const clamped = clampSeparatorSize(size, this.currentRange);
    if (clamped === this.currentSize) return NOTHING;
    this.currentSize = clamped;
    return { kind: 'resize', size: clamped, reason };
  }

  private applyOutcome(outcome: SeparatorOutcome): SeparatorOutcome {
    if (outcome.kind !== 'resize') return outcome;
    this.currentSize = outcome.size;
    return outcome;
  }
}

export interface ResizeSeparatorOptions extends SeparatorControllerOptions {
  /** The full sentence a screen reader announces. The control's visible content is a line. */
  readonly label: string;
  /** `id` of the panel this separator sizes, for `aria-controls`. */
  readonly controls?: string;
  readonly onResize: (size: number, reason: SeparatorResizeReason) => void;
  /** `Enter`. Absent means the separator does not collapse, and `Enter` then does nothing. */
  readonly onCollapse?: () => void;
  /**
   * Every end of a pointer gesture, named.
   *
   * `onResize` already says *what* the size became; this says *why the gesture
   * stopped*, which is the difference between a commit and each of the five
   * cancellations. An owner that persists a layout preference wants only
   * `'released'`; a browser spec asserting article 17 wants to know that the
   * path it provoked is the path that fired, rather than that something
   * cancelled. Optional, because a caller that needs neither should not have to
   * say so.
   */
  readonly onGestureEnd?: (end: PointerGestureEnd) => void;
}

export interface ResizeSeparator {
  readonly element: HTMLElement;
  /** The size the control currently believes it has. */
  size(): number;
  /** The owner's correction, after its own clamp or a restored preference. */
  setSize(size: number): void;
  /** A new range, most often because the viewport moved. Re-clamps silently. */
  setRange(range: SeparatorRange): void;
  isDragging(): boolean;
  /** Removes every listener, including the document-level ones a live drag installs. */
  destroy(): void;
}

/**
 * The DOM half: listeners in, controller out, and nothing decided here.
 *
 * The three things this layer does that the controller cannot, and each is the
 * enforcement half of article 17:
 *
 *   1. **`setPointerCapture` on `pointerdown`.** This is what stops a drag that
 *      begins on the handle and ends over the map from building anything.
 *      Phaser 4 listens for `mousemove`/`mouseup` **on the game canvas**
 *      (`tests/browser/world-scene-drag-under-the-hud.spec.ts` measured that,
 *      from the other direction), and pointer capture retargets both the
 *      pointer events and their compatibility mouse events to the capture
 *      element -- so while this handle holds the pointer, the canvas hears
 *      nothing at all.
 *   2. **`preventDefault` and `stopPropagation` on `pointerdown`.** The first
 *      suppresses the compatibility mouse events outright and the browser's own
 *      text selection and drag-start; the second keeps the press out of any
 *      ancestor that has opinions about presses. Capture alone would be enough
 *      for the canvas and is not enough for a panel that listens on itself.
 *   3. **Document and window listeners, installed only while a drag is live.**
 *      A second finger lands on the map, not on this handle, so only the
 *      document hears it; `blur` is a window event; and the cursor leaving the
 *      document fires on the document. They are added on grab and removed on
 *      every end, so a page with no drag in flight carries none of them.
 */
export function createResizeSeparator(options: ResizeSeparatorOptions): ResizeSeparator {
  const controller = new SeparatorController(options);

  const node = element('div', {
    className: 'ui-separator',
    attributes: {
      role: 'separator',
      tabindex: '0',
      'aria-label': options.label,
      'aria-orientation': options.axis === 'x' ? 'vertical' : 'horizontal',
      ...(options.controls === undefined ? {} : { 'aria-controls': options.controls }),
    },
  });

  // See the class docblock: the three properties without which the control is
  // functionally broken, and no others, because the stylesheets are being
  // rebuilt on this same tree.
  node.style.touchAction = 'none';
  node.style.userSelect = 'none';
  node.style.cursor = options.axis === 'x' ? 'col-resize' : 'row-resize';

  const announce = (): void => {
    node.setAttribute('aria-valuenow', String(controller.size));
    node.setAttribute('aria-valuemin', String(Math.round(controller.range.min)));
    node.setAttribute('aria-valuemax', String(Math.round(Math.max(controller.range.max, controller.range.min))));
  };
  announce();

  const coordinateOf = (event: PointerEvent): number => (options.axis === 'x' ? event.clientX : event.clientY);

  /** The pointer this element has captured, or `undefined` when no drag is live. */
  let capturedPointerId: number | undefined;
  let dragListenersInstalled = false;

  const report = (outcome: SeparatorOutcome): void => {
    if (outcome.kind === 'collapse') {
      options.onCollapse?.();
      return;
    }
    if (outcome.kind !== 'resize') return;
    announce();
    options.onResize(outcome.size, outcome.reason);
  };

  /**
   * Take the gesture's machinery down, whatever ended it.
   *
   * Driven by `controller.isDragging` rather than by the outcome that was just
   * delivered, because the two ends that produce **no resize at all** -- a
   * cancellation restoring a size the drag never moved from, and a release on a
   * drag that never travelled -- still have to release the capture and remove
   * the document listeners. Keying off the outcome would leak a listener set on
   * exactly the gestures nobody notices.
   */
  const settleGesture = (end?: PointerGestureEnd): void => {
    if (controller.isDragging) return;
    const wasLive = dragListenersInstalled || capturedPointerId !== undefined;
    removeDragListeners();
    node.removeAttribute('aria-busy');
    const pointerId = capturedPointerId;
    capturedPointerId = undefined;
    if (pointerId !== undefined && node.hasPointerCapture(pointerId)) node.releasePointerCapture(pointerId);
    if (wasLive && end !== undefined) options.onGestureEnd?.(end);
  };

  const onPointerDown = (event: PointerEvent): void => {
    // Primary button only. The middle drag is a camera pan at all times
    // (`docs/INPUT.md`) and the right button opens a menu; neither becomes a
    // resize because it happened to land on this handle.
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const outcome = controller.pointerDown(event.pointerId, coordinateOf(event));
    if (outcome.kind === 'grabbed') {
      capturedPointerId = outcome.pointerId;
      node.setPointerCapture(outcome.pointerId);
      addDragListeners();
      node.setAttribute('aria-busy', 'true');
      // A drag is a way of reaching this control, so it leaves the keyboard on
      // it: article 16's "a closed panel gives focus somewhere reachable" is
      // the same requirement one step earlier.
      node.focus();
      return;
    }
    report(outcome);
    settleGesture('second-pointer');
  };

  const onPointerMove = (event: PointerEvent): void => {
    report(controller.pointerMove(event.pointerId, coordinateOf(event)));
  };

  const onPointerUp = (event: PointerEvent): void => {
    report(controller.pointerUp(event.pointerId, coordinateOf(event)));
    settleGesture('released');
  };

  const onPointerCancel = (event: PointerEvent): void => {
    report(controller.interrupt('pointercancel', event.pointerId));
    settleGesture('pointercancel');
  };

  /**
   * Capture taken away by something other than a release.
   *
   * `lostpointercapture` also fires on a normal release, *after* `pointerup`
   * has already ended the gesture -- so this is guarded on the gesture still
   * being live, which is exactly what tells an ordinary release apart from the
   * element being removed, hidden, or having its capture stolen mid-drag.
   */
  const onLostCapture = (event: PointerEvent): void => {
    if (!controller.isDragging) return;
    report(controller.interrupt('capture-lost', event.pointerId));
    settleGesture('capture-lost');
  };

  /**
   * A second pointer, landing anywhere in the document.
   *
   * Listened for in the **capture** phase so it is seen before whatever it
   * landed on acts on it, and on the document because that is where it lands:
   * under pointer capture the first pointer's events are retargeted to this
   * handle, so a finger arriving on the map is invisible from here otherwise.
   * `a773f3a2` is the same rule on the world tools.
   */
  const onForeignPointerDown = (event: PointerEvent): void => {
    report(controller.foreignPointerDown(event.pointerId));
    settleGesture('second-pointer');
  };

  /**
   * The window losing focus, which is the case the release is delivered
   * somewhere else entirely.
   *
   * `blur` and not `visibilitychange`, for the reason `WorldScene` gives for
   * the same choice in `docs/INPUT.md`: an unfocused-but-visible window is
   * precisely the case that produces this, and `visibilitychange` does not fire
   * for one.
   */
  const onWindowBlur = (): void => {
    report(controller.interrupt('window-blur'));
    settleGesture('window-blur');
  };

  /**
   * The cursor leaving the document.
   *
   * `pointerout` on the document with a null `relatedTarget` is the signal that
   * survives pointer capture: `pointerleave` on the *element* cannot fire while
   * the element is the capture target, because under capture the pointer counts
   * as inside it wherever it goes. `relatedTarget === null` is what
   * distinguishes leaving the document from crossing between two elements in
   * it, which happens constantly during a drag across a page.
   */
  const onDocumentPointerOut = (event: PointerEvent): void => {
    if (event.relatedTarget !== null) return;
    report(controller.interrupt('left-window', event.pointerId));
    settleGesture('left-window');
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const outcome = controller.key(event.key, event.shiftKey);
    if (outcome.kind === 'none') return;
    // Only once the press meant something here: an unhandled arrow must still
    // reach whatever else wanted it.
    event.preventDefault();
    report(outcome);
    settleGesture('abandoned');
  };

  const onDoubleClick = (event: MouseEvent): void => {
    event.preventDefault();
    report(controller.doubleClick());
  };

  function addDragListeners(): void {
    if (dragListenersInstalled) return;
    dragListenersInstalled = true;
    document.addEventListener('pointerdown', onForeignPointerDown, true);
    document.addEventListener('pointerout', onDocumentPointerOut, true);
    window.addEventListener('blur', onWindowBlur);
  }

  function removeDragListeners(): void {
    if (!dragListenersInstalled) return;
    dragListenersInstalled = false;
    document.removeEventListener('pointerdown', onForeignPointerDown, true);
    document.removeEventListener('pointerout', onDocumentPointerOut, true);
    window.removeEventListener('blur', onWindowBlur);
  }

  node.addEventListener('pointerdown', onPointerDown);
  node.addEventListener('pointermove', onPointerMove);
  node.addEventListener('pointerup', onPointerUp);
  node.addEventListener('pointercancel', onPointerCancel);
  node.addEventListener('lostpointercapture', onLostCapture);
  node.addEventListener('keydown', onKeyDown);
  node.addEventListener('dblclick', onDoubleClick);

  return {
    element: node,
    size: () => controller.size,
    setSize(size: number): void {
      controller.setSize(size);
      announce();
    },
    setRange(range: SeparatorRange): void {
      controller.setRange(range);
      announce();
    },
    isDragging: () => controller.isDragging,
    destroy(): void {
      // A control torn down mid-drag is a cancellation like any other, and it
      // is the one that would otherwise leave the document listeners behind.
      report(controller.interrupt('abandoned'));
      settleGesture('abandoned');
      node.removeEventListener('pointerdown', onPointerDown);
      node.removeEventListener('pointermove', onPointerMove);
      node.removeEventListener('pointerup', onPointerUp);
      node.removeEventListener('pointercancel', onPointerCancel);
      node.removeEventListener('lostpointercapture', onLostCapture);
      node.removeEventListener('keydown', onKeyDown);
      node.removeEventListener('dblclick', onDoubleClick);
    },
  };
}
