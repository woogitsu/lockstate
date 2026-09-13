import type { PointerGestureEnd } from '../../src/input/pointer-gesture';
import type { SeparatorResizeReason } from '../../src/ui/primitives/resize-separator';

/**
 * The contract between `resize-separator-harness.ts` and
 * `resize-separator.spec.ts`. Every value crossing `page.evaluate` is
 * structured-clone-safe, so nothing here is a live node.
 */

/** One call the separator made to its owner, in the order it made them. */
export interface SeparatorReport {
  readonly size: number;
  readonly reason: SeparatorResizeReason;
}

/** A rectangle in page pixels, so the spec can aim a real pointer at the handle. */
export interface HandleRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** What the control is announcing right now, read off the real attributes. */
export interface SeparatorAria {
  readonly role: string | null;
  readonly orientation: string | null;
  readonly label: string | null;
  readonly controls: string | null;
  readonly valueNow: string | null;
  readonly valueMin: string | null;
  readonly valueMax: string | null;
  readonly tabIndex: number;
  readonly busy: string | null;
}

export interface LockstateSeparatorHarness {
  /** The size the panel is actually laid out at, read back from the DOM. */
  panelWidth(): number;
  /** The size the control believes it has. */
  size(): number;
  isDragging(): boolean;
  /** Every `onResize`, in order. */
  reports(): readonly SeparatorReport[];
  /** Every `onGestureEnd`, in order: which path ended each gesture. */
  gestureEnds(): readonly PointerGestureEnd[];
  /** How many times `Enter` reached `onCollapse`. */
  collapses(): number;
  clear(): void;
  handleRect(): HandleRect;
  aria(): SeparatorAria;
  /** Puts the keyboard on the handle, for the keyboard-parity assertions. */
  focusHandle(): void;
  /** True when the handle is `document.activeElement`. */
  handleHasFocus(): boolean;
  /**
   * `pointerId` of the last press the handle received.
   *
   * Needed by one spec only, and for a reason worth naming: a synthetic
   * `pointerout` has to carry the id of the pointer the gesture actually holds,
   * or the separator correctly ignores it -- and Chromium's mouse is not
   * pointer 0.
   */
  lastPointerId(): number | undefined;
  /**
   * Every pointer event that reached the element *under* the handle, by type.
   *
   * The Phaser canvas is the real subject of "no world command was issued" and
   * is asserted through `window.lockstateWorldSceneHarness`; this is the
   * cheaper, blunter tripwire beside it, and it catches the leak one layer
   * earlier -- a press that bubbles past the handle at all, whether or not the
   * engine beneath happened to do anything with it.
   */
  underlayEvents(): readonly string[];
}

declare global {
  interface Window {
    lockstateSeparatorHarness?: LockstateSeparatorHarness;
  }
}
