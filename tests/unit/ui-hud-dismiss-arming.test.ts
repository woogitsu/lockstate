import { describe, expect, it } from 'vitest';
import {
  pressDismiss,
  retainDismissArming,
  type DismissArming,
} from '../../src/ui/hud/dismiss-arming';

/**
 * The two presses a dismissal takes, at the only layer they can be proved at.
 *
 * `vitest.config.ts` runs on `environment: 'node'` with no jsdom, so
 * `createStaffPanel` is unreachable from this suite -- which is why the decision
 * these tests are about was extracted rather than left inside the row's
 * `onActivate`, and it is the same move `hud/tool-arming.ts` and
 * `hud/pooled-row-binding.ts` record. A mutation inside a paint function or a
 * DOM listener survives because nothing here could observe it.
 *
 * The property every block below is about is one sentence: **a dismissal happens
 * only on a second press of the control that armed it, aimed at the same person
 * the first press was aimed at.** That, with `assignPooledRows` keeping the row
 * from being re-pointed under the player, is the owner's ruling of 2026-09-03 --
 * *"Jedno i drugie"*, a settle window and a confirmation step.
 */

const guard = (staffId: number, named = `Guard ${String(staffId)} · Unassigned`): DismissArming => ({
  staffId,
  named,
});

describe('pressDismiss', () => {
  it('arms rather than dismisses on the first press', () => {
    expect(pressDismiss(undefined, guard(7))).toEqual({ kind: 'arms', arming: guard(7) });
  });

  it('dismisses on the second press of the same person', () => {
    const first = pressDismiss(undefined, guard(7));
    expect(first.kind).toBe('arms');
    if (first.kind !== 'arms') throw new Error('unreachable');
    expect(pressDismiss(first.arming, guard(7))).toEqual({ kind: 'dismisses', staffId: 7 });
  });

  /**
   * The case a confirm step is *for*, and the one that would make it worse than
   * nothing if it went the other way: a player who armed the wrong row and
   * presses the right one must not sack the person they were correcting away
   * from. Switching aim is arming.
   */
  it('arms the new person rather than dismissing when the press moves to another row', () => {
    expect(pressDismiss(guard(7), guard(9))).toEqual({ kind: 'arms', arming: guard(9) });
  });

  /**
   * The label travels with the arm, because the confirmation box quotes it. A
   * re-arm takes the *fresh* row's label: the player is now asking about a
   * different row and the sentence has to say so.
   */
  it('carries the pressed row label onto the arming, and takes the fresh one on a re-arm', () => {
    const armed = pressDismiss(undefined, guard(7, 'Guard · On Post'));
    expect(armed).toEqual({ kind: 'arms', arming: { staffId: 7, named: 'Guard · On Post' } });
    expect(pressDismiss(guard(7, 'Guard · On Post'), guard(9, 'Guard · Unassigned'))).toEqual({
      kind: 'arms',
      arming: { staffId: 9, named: 'Guard · Unassigned' },
    });
  });

  /**
   * Keyed on the person, never on where the row sits. #877 is what happens when
   * a screen position is treated as a name for somebody: an arm recorded as
   * "row 2" and confirmed as "row 2" would be that defect with an extra press in
   * front of it. So a press on the armed *person* confirms however the label
   * beside them has since been repainted.
   */
  it('confirms on the person and not on what the row now says about them', () => {
    expect(pressDismiss(guard(7, 'Guard · Unassigned'), guard(7, 'Guard · On Post'))).toEqual({
      kind: 'dismisses',
      staffId: 7,
    });
  });

  it('never reports a dismissal for anybody but the armed person', () => {
    for (const armedId of [1, 2, 3, undefined] as const) {
      for (const pressedId of [1, 2, 3]) {
        const press = pressDismiss(armedId === undefined ? undefined : guard(armedId), guard(pressedId));
        if (press.kind === 'dismisses') expect(press.staffId).toBe(armedId);
        else expect(press.arming.staffId).toBe(pressedId);
      }
    }
  });
});

describe('retainDismissArming', () => {
  it('keeps an arm while a drawn row still names that person', () => {
    expect(retainDismissArming(guard(7), [5, 7, 9])).toEqual(guard(7));
  });

  /**
   * The arm is a question about somebody, so it goes the moment nobody on the
   * block is that somebody -- dismissed, slid off the window, or the whole block
   * having lost its box. One rule rather than a list of cases.
   */
  it('drops an arm whose person has left the rows', () => {
    expect(retainDismissArming(guard(7), [5, 9])).toBeUndefined();
  });

  it('drops an arm when the block draws nothing at all', () => {
    expect(retainDismissArming(guard(7), [])).toBeUndefined();
    expect(retainDismissArming(guard(7), [undefined, undefined, undefined])).toBeUndefined();
  });

  /**
   * A place holding itself open inside its settle window names nobody, and
   * `undefined` is how the panel reports that. It must not vouch for an arm: the
   * confirmation would be standing over a blank row.
   */
  it('does not let a place held open stand in for the person who was in it', () => {
    expect(retainDismissArming(guard(7), [undefined, 9])).toBeUndefined();
  });

  it('answers nothing when nothing is armed', () => {
    expect(retainDismissArming(undefined, [5, 7, 9])).toBeUndefined();
  });
});
