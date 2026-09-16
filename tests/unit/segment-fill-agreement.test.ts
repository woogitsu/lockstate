import { describe, expect, it } from 'vitest';
import {
  BOUNDED_VALUE_SEGMENTS,
  toBoundedValue,
} from '../../src/simulation/presentation/view-model';
import { DEFAULT_BAR_SEGMENTS, filledSegments } from '../../src/ui/primitives/segmented-bar';

/**
 * One rule, two implementations, and the pin that keeps them the same rule.
 *
 * `toBoundedValue` (the projection) and `filledSegments` (the DOM primitive)
 * both answer "how many segments does this value light". They are written
 * twice on purpose: `AGENTS.md` boundary 1 forbids `src/ui/primitives/**`
 * importing `src/simulation/**` at all -- `tests/unit/ui-hud-messages.test.ts`
 * enforces that -- so the primitive cannot call the projection, and the
 * projection must not depend on the DOM tree.
 *
 * This is the same shape as `HUD_BUILD_EDGES`, the one deliberate
 * re-declaration in this repository that is already pinned
 * (`tests/unit/ui-hud-build-panel.test.ts:47`). #123 item 1 is the version of
 * that shape *without* the pin, and this file is the pin.
 *
 * ## What was actually wrong
 *
 * They disagreed, and had since both were written. The projection computed
 * `floor(permille * segments / 1000)` and the primitive `ceil(value / max *
 * segments)`, so every small-but-nonzero value read as an empty bar on one
 * side and a one-segment bar on the other -- exactly the case the primitive's
 * own comment says must not render as empty. #123 measured seven such pairs;
 * they are DIVERGENCE_TABLE below, and this file asserts they now *agree*.
 *
 * Both were also wrong about the other end, which the fix had to face rather
 * than pick around: pure `ceil` lights all ten segments at 254/255, a full
 * bar for a prisoner who is not sated, which
 * `tests/unit/hud-projections.test.ts`'s "never shows a full bar for a value
 * below its maximum" forbids. The two documented rules -- non-zero lights one,
 * full means full -- are both kept by reserving the last segment for
 * `value >= max`, and no assertion in either existing file was weakened to get
 * there.
 *
 * ## What this file does not claim
 *
 * That a player sees a difference. Nothing paints `BoundedValue.filled`
 * today; the projection layer reaches the main thread (#104) but no HUD
 * component renders a bounded value's fill yet. This removes a trap rather
 * than fixing a visible bug: whoever wires the first bar would otherwise have
 * chosen, by accident, which of two answers the player gets.
 */

/** The two segment counts are independently declared, and both are 10. */
const SEGMENTS = BOUNDED_VALUE_SEGMENTS;

/**
 * The pairs #123 measured, with the answer both sides now give.
 *
 * Kept as the issue's own numbers, in the issue's own order, so this table can
 * be read against it directly. The `expected` column is the primitive's
 * former column: the `ceil` semantics won, because "one prisoner in a
 * 180-capacity prison must light one segment" is a product statement about how
 * the game reads and the `floor` side never argued for its own behaviour.
 */
const DIVERGENCE_TABLE: readonly (readonly [value: number, max: number, expected: number])[] = [
  [1, 180, 1],
  [5, 180, 1],
  [9, 180, 1],
  [1, 255, 1],
  [13, 255, 1],
  [26, 255, 2],
  [50, 180, 3],
];

describe('the two segment-fill implementations are one rule', () => {
  it('declares the same segment count on both sides', () => {
    // If these ever differ the sweep below compares two different questions,
    // and would keep passing while every bar in the game changed length.
    expect(DEFAULT_BAR_SEGMENTS).toBe(BOUNDED_VALUE_SEGMENTS);
  });

  it.each(DIVERGENCE_TABLE)('agrees on %i of %i, which #123 measured as a disagreement', (value, max, expected) => {
    expect(filledSegments(value, max), 'the UI primitive').toBe(expected);
    expect(toBoundedValue(value, max).filled, 'the projection').toBe(expected);
  });

  it('agrees over a full sweep, not only where the issue happened to look', () => {
    // Exhaustive over both real maxima: 255 is the need storage width
    // (`src/simulation/prisoners/needs.ts`) and 180 the prison capacity the
    // status strip uses. Every value in range, so a rule that agrees at the
    // sampled points and diverges one step away is caught.
    const mismatches: string[] = [];
    for (const max of [180, 255, 7, 1_000, 2_500]) {
      for (let value = 0; value <= max; value += 1) {
        const primitive = filledSegments(value, max, SEGMENTS);
        const projection = toBoundedValue(value, max, SEGMENTS).filled;
        if (primitive !== projection) mismatches.push(`${value}/${max}: primitive ${primitive}, projection ${projection}`);
      }
    }
    expect(mismatches, 'the two implementations of one rule have drifted apart again (#123)').toEqual([]);
  });

  it('agrees at segment counts other than the default, so neither hard-codes ten', () => {
    const mismatches: string[] = [];
    for (const segments of [2, 3, 5, 10, 16]) {
      for (let value = 0; value <= 255; value += 1) {
        const primitive = filledSegments(value, 255, segments);
        const projection = toBoundedValue(value, 255, segments).filled;
        if (primitive !== projection) mismatches.push(`${value}/255 in ${segments}: ${primitive} vs ${projection}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  describe('the rule both sides implement', () => {
    it('lights one segment for any value above zero', () => {
      for (const [value, max] of [[1, 180], [1, 255], [1, 1_000_000]] as const) {
        expect(filledSegments(value, max), `primitive ${value}/${max}`).toBe(1);
        expect(toBoundedValue(value, max).filled, `projection ${value}/${max}`).toBe(1);
      }
    });

    it('lights one segment even when the ratio underflows to zero', () => {
      // The case that makes `max(1, ...)` a mechanism rather than a restatement
      // of what `ceil` already does. `5e-324 / 1e300` is exactly `0` in
      // doubles, so `ceil` returns `0` and a non-zero value would draw as an
      // empty bar. Measured: without the clamp, on either side, every other
      // assertion in this file still passes.
      expect((5e-324 / 1e300) === 0, 'the underflow this pins no longer happens').toBe(true);
      expect(filledSegments(5e-324, 1e300)).toBe(1);
      expect(toBoundedValue(5e-324, 1e300).filled).toBe(1);

      // And the honest reading of the pair: `permille` rounds this to `0`
      // while `filled` is `1`. They answer different questions -- a rounded
      // share, and whether there is anything there at all -- and this is the
      // input where the difference is visible.
      expect(toBoundedValue(5e-324, 1e300).permille).toBe(0);
    });

    it('reserves the last segment for the true maximum', () => {
      // The half a pure `ceil` gets wrong. 254/255 is 99.6 %, and the fix is
      // only correct if it is still not a full bar.
      expect(filledSegments(254, 255)).toBe(SEGMENTS - 1);
      expect(toBoundedValue(254, 255).filled).toBe(SEGMENTS - 1);
      expect(filledSegments(999_999, 1_000_000)).toBe(SEGMENTS - 1);
      expect(toBoundedValue(999_999, 1_000_000).filled).toBe(SEGMENTS - 1);

      expect(filledSegments(255, 255)).toBe(SEGMENTS);
      expect(toBoundedValue(255, 255).filled).toBe(SEGMENTS);
    });

    it('lights nothing at zero', () => {
      expect(filledSegments(0, 255)).toBe(0);
      expect(toBoundedValue(0, 255).filled).toBe(0);
    });

    it('never reports more segments than exist', () => {
      // Both clamp out-of-range input rather than throwing, by different
      // routes -- the primitive returns `segments` outright, the projection
      // clamps the value first -- so this is worth asserting on both.
      expect(filledSegments(500, 180)).toBe(SEGMENTS);
      expect(toBoundedValue(500, 180).filled).toBe(SEGMENTS);
    });
  });

  it('leaves the per-mille figure to its own rounding, which is not this rule', () => {
    // The fill is computed from the ratio, not from `permille`. Said as an
    // assertion because the two now genuinely differ in direction: 1/255 is
    // `permille: 4` (round) and `filled: 1` (ceil-with-floor-of-one), and a
    // future fill derived from `permille` would still pass every agreement
    // assertion above while quantizing twice.
    const tiny = toBoundedValue(1, 255);
    expect(tiny.permille).toBe(4);
    expect(tiny.filled).toBe(1);
    expect(toBoundedValue(254, 255).permille).toBe(996);

    // And the case where the two routes give different answers, which is what
    // makes this an assertion rather than a preference. 251 of 2500 is 10.04 %
    // -- 1.004 segments, so `ceil` lights two. Rounded to `permille` first it
    // is exactly 100, and a fill derived from 100 lights one. Measured: with
    // this pair absent, rewriting the fill to go through `permille` again
    // passes every other assertion in this file, including the sweep.
    const straddling = toBoundedValue(251, 2_500);
    expect(straddling.permille).toBe(100);
    expect(straddling.filled).toBe(2);
    expect(filledSegments(251, 2_500)).toBe(2);
  });
});
