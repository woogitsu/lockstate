import { describe, expect, it } from 'vitest';
import { occupancyTone } from '../../src/ui/hud/projection';
import { NEED_BAR_MAX_PERMILLE } from '../../src/ui/hud/roster-panel';
import { DEFAULT_BAR_SEGMENTS, filledSegments, overflowSegments } from '../../src/ui/primitives/segmented-bar';

/**
 * The second lap of a segmented bar (issue #609).
 *
 * ## What this exists to pin, and what it deliberately does not
 *
 * #609 reported that *"four times over capacity draws identically to exactly
 * at capacity"*. **That was false**, and the falsification is the first thing
 * asserted below, because a test that only covered the new rule would leave
 * the retracted claim looking true. `occupancyTone` already separates those
 * two states -- amber at capacity, red past it -- and it did so before this
 * work started.
 *
 * What was true is narrower: every over-capacity state drew identically to
 * *every other one*. 4-of-3 and 12-of-3 were both ten red segments.
 * `overflowSegments` is the channel that separates them.
 */
describe('a segmented bar past its own maximum', () => {
  it('was already distinguishable from a full bar by tone, which is what #609 got wrong', () => {
    // The claim #609 rested on. Kept as an assertion so nobody restores it.
    expect(filledSegments(3, 3)).toBe(filledSegments(12, 3));
    // And the reason it did not follow.
    expect(occupancyTone(3, 3)).toBe('warning');
    expect(occupancyTone(4, 3)).toBe('danger');
    expect(occupancyTone(12, 3)).toBe('danger');
  });

  it('lights no overflow at or under capacity, which is what keeps bounded bars unchanged', () => {
    expect(overflowSegments(0, 3)).toBe(0);
    expect(overflowSegments(2, 3)).toBe(0);
    expect(overflowSegments(3, 3)).toBe(0);
  });

  it('lights one segment for one prisoner past capacity rather than rounding to none', () => {
    // The same `ceil` argument `filledSegments` makes: a value that is over is
    // visibly over. `Math.max(1, ...)` inside the shared rule carries this.
    expect(overflowSegments(181, 180)).toBeGreaterThanOrEqual(1);
    expect(overflowSegments(4, 3)).toBeGreaterThanOrEqual(1);
  });

  it('separates the states #609 could not: 4-of-3 from 12-of-3', () => {
    expect(overflowSegments(4, 3)).not.toBe(overflowSegments(12, 3));
  });

  it('saturates at twice capacity, and that limit is asserted rather than left to be discovered', () => {
    // Ten segments are ten buckets. The second lap uses all of them, so a
    // third lap cannot be drawn and is not claimed to be. The exact pair of
    // numbers lives on the chip beside the bar.
    expect(overflowSegments(6, 3)).toBe(DEFAULT_BAR_SEGMENTS);
    expect(overflowSegments(12, 3)).toBe(DEFAULT_BAR_SEGMENTS);
    expect(overflowSegments(300, 3)).toBe(DEFAULT_BAR_SEGMENTS);
  });

  it('is inert for every input the Regime panel can produce', () => {
    // Need bars pass a permille against 1000, so they reach the maximum and
    // never pass it. If that ever changes, this fails rather than the panel
    // quietly growing a hatch.
    for (const permille of [0, 1, 500, 999, NEED_BAR_MAX_PERMILLE]) {
      expect(overflowSegments(permille, NEED_BAR_MAX_PERMILLE)).toBe(0);
    }
  });

  it('lights nothing for a max that cannot bound anything', () => {
    expect(overflowSegments(5, 0)).toBe(0);
    expect(overflowSegments(5, -1)).toBe(0);
    expect(overflowSegments(5, Number.NaN)).toBe(0);
    expect(overflowSegments(Number.POSITIVE_INFINITY, 3)).toBe(0);
  });
});
