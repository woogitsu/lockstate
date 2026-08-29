import { describe, expect, it } from 'vitest';
import { readNumberFieldEntry } from '../../src/ui/primitives/number-field';

/**
 * The decision a keystroke makes, away from the DOM that makes it (#548).
 *
 * `NumberField` used to report only on `change`, which fires when a field is
 * *left* -- and the click on the button beside the field is what leaves it. So
 * the Build panel's Buy control read `Buy 2 x Brick - 80` at the instant it was
 * pressed and took 1,320: the report and the activation arrived in the same
 * event turn, in that order. Listening on `input` as well is what makes the
 * owner's state true *before* the press, and `readNumberFieldEntry` is the
 * whole of what that costs -- `input` fires on half-typed text, where `change`
 * never did.
 *
 * Node-environment, and legitimately so. `vitest.config.ts` runs with no jsdom,
 * so a listener body is unreachable from this suite entirely and a mutation
 * inside one survives because nothing can observe it. That is why the rules
 * below are a pure function rather than four lines in an event handler. The
 * *wiring* -- that typing into the real box and clicking the real Buy button
 * charge what the label said -- is a DOM fact and is asserted in
 * `tests/browser/app-shell.spec.ts`, where a real field exists.
 */
describe('readNumberFieldEntry', () => {
  describe('while the player is still typing', () => {
    it('reports nothing and leaves an emptied box empty', () => {
      // Select-all then Delete. Refilling the box here is the difference
      // between a field a player can retype and one that fights back.
      expect(readNumberFieldEntry('', 'typing', 1, 999)).toEqual({ report: undefined, restore: false });
    });

    it('leaves a lone minus sign alone, so a negative coordinate can be typed', () => {
      // `type="number"` reports raw text that is not yet a number as `""`, so
      // this is what the box says between the `-` and the `4` of `-4`. The
      // Build panel's tile fields have no floor and negatives are legal there.
      expect(readNumberFieldEntry('', 'typing', undefined, undefined)).toEqual({
        report: undefined,
        restore: false,
      });
    });

    it('reports a digit as soon as it is typed, rather than waiting for the blur', () => {
      expect(readNumberFieldEntry('33', 'typing', 1, undefined)).toEqual({ report: 33, restore: false });
    });

    it('clamps what it reports but never rewrites the box mid-word', () => {
      // 152 is what a Rooms width says while a caret sits between the 1 and
      // the 5 of 12. The owner is told 64; the text stays 152 until the entry
      // settles, because rewriting it would move the caret to the end.
      expect(readNumberFieldEntry('152', 'typing', 1, 64)).toEqual({ report: 64, restore: false });
    });

    it('clamps up to the floor as well', () => {
      expect(readNumberFieldEntry('0', 'typing', 1, 999)).toEqual({ report: 1, restore: false });
    });
  });

  describe('once the entry has settled', () => {
    it('snaps an empty box back to the value the owner still holds', () => {
      // The behaviour this field has always had: an unparseable entry does not
      // silently become zero. `restore` is the caller's instruction to write
      // `current` back over the text.
      expect(readNumberFieldEntry('', 'settled', 1, 999)).toEqual({ report: undefined, restore: true });
    });

    it('reports a parseable value clamped, and asks for no restore', () => {
      // No restore because the report is the reconciliation: the owner answers
      // it with `setValue`, which writes the clamped value into the box.
      expect(readNumberFieldEntry('1000', 'settled', 1, 999)).toEqual({ report: 999, restore: false });
    });
  });

  it('truncates rather than rounding, in both phases', () => {
    // `Number.parseInt` stops at the point. A field whose value is an integer
    // count of bricks must not turn 2.9 into 3 of them.
    expect(readNumberFieldEntry('2.9', 'typing', 1, 999).report).toBe(2);
    expect(readNumberFieldEntry('2.9', 'settled', 1, 999).report).toBe(2);
  });

  it('leaves a value inside the bounds exactly as typed', () => {
    expect(readNumberFieldEntry('7', 'typing', 1, 999)).toEqual({ report: 7, restore: false });
    expect(readNumberFieldEntry('7', 'settled', 1, 999)).toEqual({ report: 7, restore: false });
  });
});
