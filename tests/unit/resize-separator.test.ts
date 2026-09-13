import { describe, expect, it } from 'vitest';
import { ExclusivePointerGesture } from '../../src/input/pointer-gesture';
import {
  SEPARATOR_COARSE_STEP,
  SEPARATOR_STEP,
  SeparatorController,
  clampSeparatorSize,
  readSeparatorKey,
  type SeparatorGeometry,
  type SeparatorOutcome,
} from '../../src/ui/primitives/resize-separator';

/**
 * The drag-resizable separator's arithmetic, its keyboard, and every way a
 * gesture can end without committing (issue #1159, stage 3).
 *
 * **Node-environment, and that is why the production code is shaped the way it
 * is.** `vitest.config.ts` runs with no jsdom, so a rule that lived inside a
 * `pointerdown` listener would be unreachable from here -- not merely untested,
 * *unobservable*, so a mutation of it could not be watched going red. Every
 * decision the separator makes therefore lives in `SeparatorController` and
 * `ExclusivePointerGesture`, and `createResizeSeparator` is a listener-to-method
 * mapping with nothing in it to get wrong. What that mapping does with real
 * browser events -- pointer capture retargeting a drag away from the Phaser
 * canvas, a real `pointercancel` from a real touch, a real window blur -- is
 * `tests/browser/resize-separator.spec.ts`, and it cannot be settled here.
 *
 * Constitution article 17, *"Gest ma jednego właściciela"*, is what the second
 * half of this file is: `pointercancel`, lost capture, the cursor leaving the
 * window, a second touch arriving mid-drag and an abandoned drag all end the
 * gesture and put the size back where it started.
 */

/** A left rail: the handle is on its right edge, so rightwards makes it wider. */
const LEFT_RAIL: SeparatorGeometry = { axis: 'x', growth: 1 };
/** A right inspector: the handle is on its left edge, so rightwards makes it narrower. */
const RIGHT_INSPECTOR: SeparatorGeometry = { axis: 'x', growth: -1 };
/** A phone sheet: the handle is on its top edge, so downwards makes it shorter. */
const PHONE_SHEET: SeparatorGeometry = { axis: 'y', growth: -1 };

/**
 * The HUD's real left-rail limits, from `docs/IDENTITY_V5_ROLLOUT.md`'s stage 3.
 *
 * Used as *data* and never imported from the production module, because the
 * module deliberately holds no limits at all: the caller supplies them, and a
 * test that read them back out of the thing under test would be asserting that
 * a constant equals itself.
 */
const RAIL_RANGE = { min: 72, max: 180 } as const;

function controller(
  geometry: SeparatorGeometry,
  size = 120,
  range: { min: number; max: number } = RAIL_RANGE,
  defaultSize = 120,
): SeparatorController {
  return new SeparatorController({ ...geometry, size, range, defaultSize });
}

/** A whole drag, as the DOM layer would drive it, ending however the caller says. */
function drag(
  subject: SeparatorController,
  from: number,
  to: number,
): { readonly reports: SeparatorOutcome[]; readonly pointerId: number } {
  const reports: SeparatorOutcome[] = [];
  const pointerId = 7;
  reports.push(subject.pointerDown(pointerId, from));
  reports.push(subject.pointerMove(pointerId, to));
  return { reports, pointerId };
}

describe('clampSeparatorSize', () => {
  it('holds a size inside its range', () => {
    expect(clampSeparatorSize(120, RAIL_RANGE)).toBe(120);
    expect(clampSeparatorSize(40, RAIL_RANGE)).toBe(72);
    expect(clampSeparatorSize(4000, RAIL_RANGE)).toBe(180);
  });

  it('rounds, because the value is announced', () => {
    expect(clampSeparatorSize(120.4, RAIL_RANGE)).toBe(120);
    expect(clampSeparatorSize(120.5, RAIL_RANGE)).toBe(121);
    expect(clampSeparatorSize(183.9999999999998, { min: 72, max: 600 })).toBe(184);
  });

  /**
   * The inverted range is stage 3's right inspector on a narrow window: 260-600
   * px *bounded by the space the map has left*, which can be less than 260.
   */
  it('resolves an inverted range to its minimum rather than crushing the panel', () => {
    expect(clampSeparatorSize(400, { min: 260, max: 180 })).toBe(260);
    expect(clampSeparatorSize(100, { min: 260, max: 180 })).toBe(260);
  });

  it('answers the minimum for a value that is not a number', () => {
    expect(clampSeparatorSize(Number.NaN, RAIL_RANGE)).toBe(72);
    expect(clampSeparatorSize(Number.POSITIVE_INFINITY, RAIL_RANGE)).toBe(72);
  });
});

describe('readSeparatorKey', () => {
  it('moves an arrow by 10 and a Shift+arrow by 40', () => {
    expect(SEPARATOR_STEP).toBe(10);
    expect(SEPARATOR_COARSE_STEP).toBe(40);
    expect(readSeparatorKey('ArrowRight', false, 120, RAIL_RANGE, LEFT_RAIL)).toEqual({
      kind: 'resize',
      size: 130,
      reason: 'keyboard',
    });
    expect(readSeparatorKey('ArrowLeft', false, 120, RAIL_RANGE, LEFT_RAIL)).toEqual({
      kind: 'resize',
      size: 110,
      reason: 'keyboard',
    });
    expect(readSeparatorKey('ArrowRight', true, 120, RAIL_RANGE, LEFT_RAIL)).toEqual({
      kind: 'resize',
      size: 160,
      reason: 'keyboard',
    });
    expect(readSeparatorKey('ArrowLeft', true, 120, RAIL_RANGE, LEFT_RAIL)).toEqual({
      kind: 'resize',
      size: 80,
      reason: 'keyboard',
    });
  });

  /** The arrow moves the *separator*, so the same key grows one panel and shrinks the other. */
  it('reads the arrow against the panel the handle belongs to', () => {
    expect(readSeparatorKey('ArrowRight', false, 400, { min: 260, max: 600 }, RIGHT_INSPECTOR)).toEqual({
      kind: 'resize',
      size: 390,
      reason: 'keyboard',
    });
    expect(readSeparatorKey('ArrowDown', false, 400, { min: 180, max: 600 }, PHONE_SHEET)).toEqual({
      kind: 'resize',
      size: 390,
      reason: 'keyboard',
    });
    expect(readSeparatorKey('ArrowUp', false, 400, { min: 180, max: 600 }, PHONE_SHEET)).toEqual({
      kind: 'resize',
      size: 410,
      reason: 'keyboard',
    });
  });

  it('ignores the arrows that lie across its own axis', () => {
    expect(readSeparatorKey('ArrowUp', false, 120, RAIL_RANGE, LEFT_RAIL)).toEqual({ kind: 'none' });
    expect(readSeparatorKey('ArrowDown', true, 120, RAIL_RANGE, LEFT_RAIL)).toEqual({ kind: 'none' });
    expect(readSeparatorKey('ArrowLeft', false, 400, { min: 180, max: 600 }, PHONE_SHEET)).toEqual({ kind: 'none' });
    expect(readSeparatorKey('ArrowRight', false, 400, { min: 180, max: 600 }, PHONE_SHEET)).toEqual({ kind: 'none' });
  });

  it('sends Home to the minimum and End to the maximum', () => {
    expect(readSeparatorKey('Home', false, 120, RAIL_RANGE, LEFT_RAIL)).toEqual({
      kind: 'resize',
      size: 72,
      reason: 'keyboard',
    });
    expect(readSeparatorKey('End', false, 120, RAIL_RANGE, LEFT_RAIL)).toEqual({
      kind: 'resize',
      size: 180,
      reason: 'keyboard',
    });
  });

  /** The range's own ends, not the screen's: End on a right-hand panel goes left. */
  it('sends Home and End to the same ends whichever way the panel grows', () => {
    expect(readSeparatorKey('Home', false, 400, { min: 260, max: 600 }, RIGHT_INSPECTOR)).toEqual({
      kind: 'resize',
      size: 260,
      reason: 'keyboard',
    });
    expect(readSeparatorKey('End', false, 400, { min: 260, max: 600 }, RIGHT_INSPECTOR)).toEqual({
      kind: 'resize',
      size: 600,
      reason: 'keyboard',
    });
  });

  it('lands on the limit rather than past it', () => {
    expect(readSeparatorKey('ArrowLeft', true, 100, RAIL_RANGE, LEFT_RAIL)).toEqual({
      kind: 'resize',
      size: 72,
      reason: 'keyboard',
    });
    expect(readSeparatorKey('ArrowRight', true, 175, RAIL_RANGE, LEFT_RAIL)).toEqual({
      kind: 'resize',
      size: 180,
      reason: 'keyboard',
    });
  });

  /** A key held down at the limit must not make an owner persist the same number forever. */
  it('answers nothing for a step that would change nothing', () => {
    expect(readSeparatorKey('ArrowLeft', false, 72, RAIL_RANGE, LEFT_RAIL)).toEqual({ kind: 'none' });
    expect(readSeparatorKey('ArrowRight', true, 180, RAIL_RANGE, LEFT_RAIL)).toEqual({ kind: 'none' });
    expect(readSeparatorKey('Home', false, 72, RAIL_RANGE, LEFT_RAIL)).toEqual({ kind: 'none' });
    expect(readSeparatorKey('End', false, 180, RAIL_RANGE, LEFT_RAIL)).toEqual({ kind: 'none' });
  });

  it('collapses on Enter and does nothing on anything else', () => {
    expect(readSeparatorKey('Enter', false, 120, RAIL_RANGE, LEFT_RAIL)).toEqual({ kind: 'collapse' });
    expect(readSeparatorKey(' ', false, 120, RAIL_RANGE, LEFT_RAIL)).toEqual({ kind: 'none' });
    expect(readSeparatorKey('Escape', false, 120, RAIL_RANGE, LEFT_RAIL)).toEqual({ kind: 'none' });
    expect(readSeparatorKey('PageUp', false, 120, RAIL_RANGE, LEFT_RAIL)).toEqual({ kind: 'none' });
  });

  /**
   * End on an inverted range is the same answer `clampSeparatorSize` gives: the
   * minimum. Both sides of the comparison are clamped, so a size that is
   * already outside the range does not produce a resize to the value it was
   * already effectively at -- which is the shape a narrowed window hands this,
   * and `SeparatorController.setRange` has re-clamped by the time a key arrives
   * anyway.
   */
  it('does not send End below the minimum on an inverted range', () => {
    expect(readSeparatorKey('End', false, 260, { min: 260, max: 180 }, RIGHT_INSPECTOR)).toEqual({ kind: 'none' });
    expect(readSeparatorKey('End', false, 400, { min: 260, max: 180 }, RIGHT_INSPECTOR)).toEqual({ kind: 'none' });
    expect(readSeparatorKey('ArrowLeft', false, 400, { min: 260, max: 180 }, RIGHT_INSPECTOR)).toEqual({
      kind: 'none',
    });
  });
});

describe('SeparatorController, dragging', () => {
  it('grabs the pointer and reports the travel as a size', () => {
    const subject = controller(LEFT_RAIL);
    expect(subject.pointerDown(7, 400)).toEqual({ kind: 'grabbed', pointerId: 7 });
    expect(subject.isDragging).toBe(true);
    expect(subject.pointerMove(7, 430)).toEqual({ kind: 'resize', size: 150, reason: 'pointer' });
    expect(subject.pointerUp(7, 440)).toEqual({ kind: 'resize', size: 160, reason: 'pointer' });
    expect(subject.isDragging).toBe(false);
    expect(subject.size).toBe(160);
  });

  /**
   * Measured from the origin on every move, never accumulated. A drag pushed
   * past the maximum and pulled back must come away from the limit at once.
   */
  it('measures from the origin, so a drag past the limit comes back immediately', () => {
    const subject = controller(LEFT_RAIL);
    subject.pointerDown(7, 400);
    expect(subject.pointerMove(7, 900)).toEqual({ kind: 'resize', size: 180, reason: 'pointer' });
    expect(subject.pointerMove(7, 850)).toEqual({ kind: 'none' });
    expect(subject.pointerMove(7, 430)).toEqual({ kind: 'resize', size: 150, reason: 'pointer' });
  });

  it('drags the other way on a panel that grows the other way', () => {
    const subject = controller(RIGHT_INSPECTOR, 400, { min: 260, max: 600 }, 400);
    subject.pointerDown(7, 900);
    expect(subject.pointerMove(7, 860)).toEqual({ kind: 'resize', size: 440, reason: 'pointer' });
  });

  it('ignores a pointer it does not own', () => {
    const subject = controller(LEFT_RAIL);
    subject.pointerDown(7, 400);
    expect(subject.pointerMove(9, 900)).toEqual({ kind: 'none' });
    expect(subject.pointerUp(9, 900)).toEqual({ kind: 'none' });
    expect(subject.isDragging).toBe(true);
    expect(subject.size).toBe(120);
  });

  it('ignores a move that arrives with no drag in flight', () => {
    const subject = controller(LEFT_RAIL);
    expect(subject.pointerMove(7, 900)).toEqual({ kind: 'none' });
    expect(subject.size).toBe(120);
  });

  it('restores the default on a double-click and not while dragging', () => {
    const subject = controller(LEFT_RAIL, 96, RAIL_RANGE, 140);
    expect(subject.doubleClick()).toEqual({ kind: 'resize', size: 140, reason: 'reset' });
    expect(subject.doubleClick()).toEqual({ kind: 'none' });
    subject.pointerDown(7, 400);
    subject.pointerMove(7, 420);
    expect(subject.doubleClick()).toEqual({ kind: 'none' });
  });

  it('re-clamps silently when the viewport hands it a new range', () => {
    const subject = controller(RIGHT_INSPECTOR, 560, { min: 260, max: 600 }, 400);
    subject.setRange({ min: 260, max: 320 });
    expect(subject.size).toBe(320);
  });

  it('takes the owner correction over its own copy', () => {
    const subject = controller(LEFT_RAIL);
    subject.setSize(4000);
    expect(subject.size).toBe(180);
  });

  /** Arrowing a separator a hand is already holding would give the gesture a second owner. */
  it('ignores every key but Escape while a drag is live', () => {
    const subject = controller(LEFT_RAIL);
    subject.pointerDown(7, 400);
    subject.pointerMove(7, 430);
    expect(subject.key('ArrowRight', false)).toEqual({ kind: 'none' });
    expect(subject.key('Home', false)).toEqual({ kind: 'none' });
    expect(subject.key('Enter', false)).toEqual({ kind: 'none' });
    expect(subject.size).toBe(150);
    expect(subject.isDragging).toBe(true);
  });

  it('keeps the keyboard steps once the drag is over', () => {
    const subject = controller(LEFT_RAIL);
    expect(subject.key('ArrowRight', true)).toEqual({ kind: 'resize', size: 160, reason: 'keyboard' });
    expect(subject.key('Enter', false)).toEqual({ kind: 'collapse' });
    expect(subject.size).toBe(160);
  });
});

/**
 * Article 17's list, one test each.
 *
 * Every one of them asserts the same three things, because they are the three
 * the rule is about: the gesture is over, the control no longer owns a pointer,
 * and the size is back where the drag started. The third is what stops a
 * half-gesture becoming a panel width the player did not choose -- the moves a
 * cancellation loses are exactly the ones nobody saw.
 */
describe('SeparatorController, every way a gesture ends without committing', () => {
  const paths = [
    { name: 'pointercancel', end: () => ({ end: 'pointercancel' as const, pointerId: 7 }) },
    { name: 'lost pointer capture', end: () => ({ end: 'capture-lost' as const, pointerId: 7 }) },
    { name: 'the cursor leaving the window', end: () => ({ end: 'left-window' as const, pointerId: 7 }) },
    { name: 'the window losing focus', end: () => ({ end: 'window-blur' as const, pointerId: undefined }) },
    { name: 'Escape, or the control being torn down', end: () => ({ end: 'abandoned' as const, pointerId: undefined }) },
  ];

  for (const path of paths) {
    it(`puts the size back after ${path.name}`, () => {
      const subject = controller(LEFT_RAIL);
      drag(subject, 400, 460);
      expect(subject.size).toBe(180);

      const { end, pointerId } = path.end();
      expect(subject.interrupt(end, pointerId)).toEqual({ kind: 'resize', size: 120, reason: 'cancel' });
      expect(subject.isDragging).toBe(false);
      expect(subject.size).toBe(120);
    });
  }

  it('puts the size back when a second pointer lands anywhere in the document', () => {
    const subject = controller(LEFT_RAIL);
    drag(subject, 400, 440);
    expect(subject.size).toBe(160);

    expect(subject.foreignPointerDown(9)).toEqual({ kind: 'resize', size: 120, reason: 'cancel' });
    expect(subject.isDragging).toBe(false);
    expect(subject.size).toBe(120);
  });

  it('puts the size back when a second pointer lands on the handle itself', () => {
    const subject = controller(LEFT_RAIL);
    drag(subject, 400, 440);

    expect(subject.pointerDown(9, 400)).toEqual({ kind: 'resize', size: 120, reason: 'cancel' });
    expect(subject.isDragging).toBe(false);
  });

  it('takes Escape as the abandon key, exactly once', () => {
    const subject = controller(LEFT_RAIL);
    drag(subject, 400, 440);
    expect(subject.key('Escape', false)).toEqual({ kind: 'resize', size: 120, reason: 'cancel' });
    expect(subject.isDragging).toBe(false);
    expect(subject.key('Escape', false)).toEqual({ kind: 'none' });
  });

  it('does not act on a cancellation naming a pointer it never held', () => {
    const subject = controller(LEFT_RAIL);
    drag(subject, 400, 440);
    expect(subject.interrupt('pointercancel', 9)).toEqual({ kind: 'none' });
    expect(subject.isDragging).toBe(true);
    expect(subject.size).toBe(160);
  });

  /** A blur on a page with no drag in flight is free, and fires constantly. */
  it('does nothing when there is no gesture to end', () => {
    const subject = controller(LEFT_RAIL);
    expect(subject.interrupt('window-blur')).toEqual({ kind: 'none' });
    expect(subject.foreignPointerDown(9)).toEqual({ kind: 'none' });
    expect(subject.size).toBe(120);
  });

  /** The same drag committed, as the control the cancellations are measured against. */
  it('keeps the size when the same drag is released instead', () => {
    const subject = controller(LEFT_RAIL);
    const { pointerId } = drag(subject, 400, 440);
    expect(subject.pointerUp(pointerId, 440)).toEqual({ kind: 'none' });
    expect(subject.isDragging).toBe(false);
    expect(subject.size).toBe(160);
  });

  /** A press with no travel: nothing is reported, and the machinery still comes down. */
  it('ends a drag that never travelled', () => {
    const subject = controller(LEFT_RAIL);
    subject.pointerDown(7, 400);
    expect(subject.pointerUp(7, 400)).toEqual({ kind: 'none' });
    expect(subject.isDragging).toBe(false);
    expect(subject.size).toBe(120);
  });
});

describe('ExclusivePointerGesture', () => {
  it('owns one pointer at a time and reports travel from the origin', () => {
    const gesture = new ExclusivePointerGesture();
    expect(gesture.isActive).toBe(false);
    expect(gesture.claim(3, 100)).toEqual({ kind: 'claimed', pointerId: 3 });
    expect(gesture.activePointerId).toBe(3);
    expect(gesture.track(3, 130)).toEqual({ kind: 'travelled', pointerId: 3, offset: 30 });
    expect(gesture.track(3, 90)).toEqual({ kind: 'travelled', pointerId: 3, offset: -10 });
    expect(gesture.release(3)).toEqual({ kind: 'ended', pointerId: 3, end: 'released' });
    expect(gesture.isActive).toBe(false);
  });

  it('does not let a duplicated press on the same pointer move the origin', () => {
    const gesture = new ExclusivePointerGesture();
    gesture.claim(3, 100);
    expect(gesture.claim(3, 500)).toEqual({ kind: 'none' });
    expect(gesture.track(3, 130)).toEqual({ kind: 'travelled', pointerId: 3, offset: 30 });
  });

  it('ends rather than transfers when a second pointer arrives', () => {
    const gesture = new ExclusivePointerGesture();
    gesture.claim(3, 100);
    expect(gesture.claim(4, 200)).toEqual({ kind: 'ended', pointerId: 3, end: 'second-pointer' });
    expect(gesture.isActive).toBe(false);
    expect(gesture.activePointerId).toBeUndefined();
  });

  it('ignores everything to do with a pointer it does not hold', () => {
    const gesture = new ExclusivePointerGesture();
    gesture.claim(3, 100);
    expect(gesture.track(4, 200)).toEqual({ kind: 'none' });
    expect(gesture.release(4)).toEqual({ kind: 'none' });
    expect(gesture.cancel('pointercancel', 4)).toEqual({ kind: 'none' });
    expect(gesture.observeForeignPointerDown(3)).toEqual({ kind: 'none' });
    expect(gesture.isActive).toBe(true);
  });

  it('answers nothing on every path when it holds no pointer', () => {
    const gesture = new ExclusivePointerGesture();
    expect(gesture.track(3, 100)).toEqual({ kind: 'none' });
    expect(gesture.release(3)).toEqual({ kind: 'none' });
    expect(gesture.cancel('window-blur')).toEqual({ kind: 'none' });
    expect(gesture.observeForeignPointerDown(3)).toEqual({ kind: 'none' });
  });
});
