import { describe, expect, it } from 'vitest';
import {
  drawSentenceLengthTicks,
  MAX_SENTENCE_DAYS,
  MAX_SENTENCE_LENGTH_TICKS_DRAWN,
  MIN_SENTENCE_DAYS,
  MIN_SENTENCE_LENGTH_TICKS,
  PRISONER_SENTENCE_RNG_STREAM,
  SENTENCE_UNSET_TICKS,
} from '../../src/simulation/prisoners/sentence';
import { deriveXoshiroState } from '../../src/simulation/rng/seed';
import { Xoshiro128StarStar } from '../../src/simulation/rng/xoshiro128starstar';
import { DAY_LENGTH_TICKS } from '../../src/simulation/prisoners/regime';

/**
 * The sentence draw (#535 decision 5).
 *
 * **Every expected figure here is a literal**, never a call to the module
 * under test and never a recomputation of its own arithmetic.
 * `docs/TESTING.md`'s rule is the reason: `expect(draw).toBeLessThanOrEqual(MAX_SENTENCE_DAYS * DAY_LENGTH_TICKS)`
 * would hold for any bounds anybody ever writes, including a bound of zero, so
 * it asserts nothing about *these* bounds. `4_800` and `38_400` are written
 * out, so widening the range has to fail this file before it can ship -- the
 * same discipline `tests/determinism/save-rng-stream-compatibility.test.ts`
 * applies to the stream set, and for the same reason: the bounds are a
 * proposal awaiting the owner, and a proposal that can be changed without
 * anything going red is not a proposal anybody is reviewing.
 */
describe('the sentence a prisoner is admitted to serve', () => {
  const streamAt = (seed: number): Xoshiro128StarStar =>
    new Xoshiro128StarStar(deriveXoshiroState(seed, PRISONER_SENTENCE_RNG_STREAM).words);

  it('names the stream, the sentinel and the bounds as the figures they are', () => {
    expect(PRISONER_SENTENCE_RNG_STREAM).toBe('prisoners.sentence');
    // The sentinel is `0` because that is what `records.reset` leaves and what
    // `admitPrisonerSchema.positive()` can never carry -- see `sentence.ts`.
    expect(SENTENCE_UNSET_TICKS).toBe(0);
    expect(MIN_SENTENCE_DAYS).toBe(2);
    expect(MAX_SENTENCE_DAYS).toBe(16);
    expect(MIN_SENTENCE_LENGTH_TICKS).toBe(4_800);
    expect(MAX_SENTENCE_LENGTH_TICKS_DRAWN).toBe(38_400);
  });

  it('draws only whole in-game days inside the bounds, and reaches both ends', () => {
    const rng = streamAt(0x5eed_1234);
    const drawn = new Set<number>();
    for (let index = 0; index < 20_000; index += 1) {
      const sentence = drawSentenceLengthTicks(rng);
      expect(sentence % 2_400).toBe(0);
      expect(sentence).toBeGreaterThanOrEqual(4_800);
      expect(sentence).toBeLessThanOrEqual(38_400);
      drawn.add(sentence);
    }
    // All fifteen whole-day values, none of them missing and none of them
    // invented: a draw that could only ever return the middle of the range
    // would satisfy every bound above and fail here.
    expect([...drawn].sort((left, right) => left - right)).toEqual([
      4_800, 7_200, 9_600, 12_000, 14_400, 16_800, 19_200, 21_600, 24_000, 26_400, 28_800, 31_200, 33_600, 36_000, 38_400,
    ]);
  });

  it('puts a clear majority of sentences past the recreation threshold the owner named', () => {
    // #535 decision 5 asks for "some clearly longer than 13,600 ticks", which
    // is where `recreation` -- the slower of the two room-gated needs -- falls
    // to `STATE_INCOME_UNMET_NEED_LEVEL`. Eleven of the fifteen values clear
    // it, so the share is a property of the *bounds* and not of the sample.
    const rng = streamAt(0xa11c_e001);
    const sample = Array.from({ length: 30_000 }, () => drawSentenceLengthTicks(rng));
    const longer = sample.filter((sentence) => sentence > 13_600).length;
    expect(longer / sample.length).toBeGreaterThan(0.68);
    expect(longer / sample.length).toBeLessThan(0.78);
    // And the old fixed sentence is below the floor of the range entirely, so
    // "shorter than 10,000" is now something no draw can produce.
    expect(sample.every((sentence) => sentence >= 4_800)).toBe(true);
    // Twelve of the fifteen values (days 5 through 16) clear the old fixed
    // 10,000, so four in five admissions now outlast what every admission used
    // to get exactly.
    const pastTheOldConstant = sample.filter((sentence) => sentence > 10_000).length / sample.length;
    expect(pastTheOldConstant).toBeGreaterThan(0.75);
    expect(pastTheOldConstant).toBeLessThan(0.85);
  });

  it('is a pure function of the stream state, so the same seed gives the same sentences', () => {
    const first = Array.from({ length: 32 }, () => drawSentenceLengthTicks(streamAt(7)));
    // Thirty-two draws from thirty-two *freshly seeded* streams are the same
    // number thirty-two times -- the draw reads no clock and no ambient state.
    expect(new Set(first).size).toBe(1);

    const runA = streamAt(7);
    const runB = streamAt(7);
    const runC = streamAt(8);
    const sequenceA = Array.from({ length: 64 }, () => drawSentenceLengthTicks(runA));
    const sequenceB = Array.from({ length: 64 }, () => drawSentenceLengthTicks(runB));
    const sequenceC = Array.from({ length: 64 }, () => drawSentenceLengthTicks(runC));
    expect(sequenceA).toEqual(sequenceB);
    expect(sequenceA).not.toEqual(sequenceC);
  });

  it('states its bounds in days, so the day length carries them', () => {
    // Not a tautology check: it pins that the range is expressed as a multiple
    // of `DAY_LENGTH_TICKS` rather than as two tick literals that would drift
    // away from the income boundary and the regime timetable if the day ever
    // changed. `DAY_LENGTH_TICKS` is itself "a candidate value, not a locked
    // balance decision" (`regime.ts`).
    expect(DAY_LENGTH_TICKS).toBe(2_400);
    expect(MIN_SENTENCE_LENGTH_TICKS / DAY_LENGTH_TICKS).toBe(MIN_SENTENCE_DAYS);
    expect(MAX_SENTENCE_LENGTH_TICKS_DRAWN / DAY_LENGTH_TICKS).toBe(MAX_SENTENCE_DAYS);
  });
});
