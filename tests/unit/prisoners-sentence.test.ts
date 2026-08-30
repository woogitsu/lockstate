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
import { CLASSIFICATION_REVIEW_INTERVAL_TICKS, classifyPrisoner, reviewClassification } from '../../src/simulation/prisoners/classification';

/**
 * The sentence draw (#535 decision 5, re-ranged by the owner's ruling on
 * [#593](https://github.com/matmaxalez/lockstate/issues/593) and
 * [ADR 0079](../../docs/adr/0079-a-sentence-long-enough-to-be-a-history.md)).
 *
 * **Every expected figure here is a literal**, never a call to the module
 * under test and never a recomputation of its own arithmetic.
 * `docs/TESTING.md`'s rule is the reason: `expect(draw).toBeLessThanOrEqual(MAX_SENTENCE_DAYS * DAY_LENGTH_TICKS)`
 * would hold for any bounds anybody ever writes, including a bound of zero, so
 * it asserts nothing about *these* bounds. `33_600` and `216_000` are written
 * out, so re-ranging has to fail this file before it can ship -- the
 * same discipline `tests/determinism/save-rng-stream-compatibility.test.ts`
 * applies to the stream set.
 *
 * **The reason the literals matter changed with the ruling, and is now
 * stronger rather than weaker.** They used to guard *a proposal awaiting the
 * owner*; they now guard *a decision the owner took*, and one whose whole
 * point is which side of 200,000 the top of the range falls on. A range edited
 * without this file going red would move `ClassificationFactors.sentence` back
 * to dead, silently, which is exactly the state #593 was opened about.
 */
describe('the sentence a prisoner is admitted to serve', () => {
  const streamAt = (seed: number): Xoshiro128StarStar =>
    new Xoshiro128StarStar(deriveXoshiroState(seed, PRISONER_SENTENCE_RNG_STREAM).words);

  /**
   * `classification.ts`'s `LONG_SENTENCE_THRESHOLD_TICKS`, which is not
   * exported -- written out here on purpose. Importing it would make this file
   * agree with `classification.ts` by construction, and the claim being made is
   * precisely that two independently-authored numbers stand in a particular
   * relation to each other.
   */
  const LONG_SENTENCE_THRESHOLD_TICKS = 200_000;

  it('names the stream, the sentinel and the bounds as the figures they are', () => {
    expect(PRISONER_SENTENCE_RNG_STREAM).toBe('prisoners.sentence');
    // The sentinel is `0` because that is what `records.reset` leaves and what
    // `admitPrisonerSchema.positive()` can never carry -- see `sentence.ts`.
    expect(SENTENCE_UNSET_TICKS).toBe(0);
    expect(MIN_SENTENCE_DAYS).toBe(14);
    expect(MAX_SENTENCE_DAYS).toBe(90);
    expect(MIN_SENTENCE_LENGTH_TICKS).toBe(33_600);
    expect(MAX_SENTENCE_LENGTH_TICKS_DRAWN).toBe(216_000);
  });

  it('draws only whole in-game days inside the bounds, and reaches both ends', () => {
    const rng = streamAt(0x5eed_1234);
    const drawn = new Set<number>();
    for (let index = 0; index < 60_000; index += 1) {
      const sentence = drawSentenceLengthTicks(rng);
      expect(sentence % 2_400).toBe(0);
      expect(sentence).toBeGreaterThanOrEqual(33_600);
      expect(sentence).toBeLessThanOrEqual(216_000);
      drawn.add(sentence);
    }
    // All seventy-seven whole-day values, none of them missing and none of them
    // invented: a draw that could only ever return the middle of the range
    // would satisfy every bound above and fail here.
    expect([...drawn].sort((left, right) => left - right)).toEqual([
      33_600, 36_000, 38_400, 40_800, 43_200, 45_600, 48_000, 50_400,
      52_800, 55_200, 57_600, 60_000, 62_400, 64_800, 67_200, 69_600,
      72_000, 74_400, 76_800, 79_200, 81_600, 84_000, 86_400, 88_800,
      91_200, 93_600, 96_000, 98_400, 100_800, 103_200, 105_600, 108_000,
      110_400, 112_800, 115_200, 117_600, 120_000, 122_400, 124_800, 127_200,
      129_600, 132_000, 134_400, 136_800, 139_200, 141_600, 144_000, 146_400,
      148_800, 151_200, 153_600, 156_000, 158_400, 160_800, 163_200, 165_600,
      168_000, 170_400, 172_800, 175_200, 177_600, 180_000, 182_400, 184_800,
      187_200, 189_600, 192_000, 194_400, 196_800, 199_200, 201_600, 204_000,
      206_400, 208_800, 211_200, 213_600, 216_000,
    ]);
  });

  it('straddles the long-sentence threshold, which is the whole of what the owner ruled', () => {
    // The single fact #593 turns on. `sentence.ts`'s old docblock put the range
    // *entirely below* 200,000 deliberately, so that `classifyPrisoner`'s
    // sentence term could only ever be 0 and every risk tier drawn from a seed
    // was bit-identical; the owner's 2026-08-30 ruling replaced that position.
    // Both directions are asserted, because a range wholly *above* the
    // threshold would be as wrong as one wholly below it: a term that is always
    // 1 explains no more than a term that is always 0.
    expect(MIN_SENTENCE_LENGTH_TICKS).toBeLessThan(LONG_SENTENCE_THRESHOLD_TICKS);
    expect(MAX_SENTENCE_LENGTH_TICKS_DRAWN).toBeGreaterThanOrEqual(LONG_SENTENCE_THRESHOLD_TICKS);

    // 200,000 ticks is 83.33 in-game days, so the first drawable length that
    // carries the term is 84 days and the last that does not is 83. Written as
    // literals rather than as `Math.ceil(200_000 / 2_400)`, which would hold
    // for any threshold and any day length.
    expect(199_200).toBeLessThan(LONG_SENTENCE_THRESHOLD_TICKS);
    expect(201_600).toBeGreaterThan(LONG_SENTENCE_THRESHOLD_TICKS);
  });

  it('makes `ClassificationFactors.sentence` reachable, in both directions, from drawable lengths alone', () => {
    // The dead statistic #593 was opened about. This is asserted through the
    // production classifiers rather than against the threshold constant,
    // because "the number is bigger than 200,000" and "the factor a panel would
    // render is non-zero" are different claims and only the second one is the
    // mechanic.
    const factorAt = (sentenceLengthTicks: number): number =>
      reviewClassification({ sentenceLengthTicks, priorIncidentsAtIntake: 0, classifiedAtTick: 0, tick: 0 }).factors.sentence;

    expect(factorAt(MIN_SENTENCE_LENGTH_TICKS)).toBe(0);
    expect(factorAt(199_200)).toBe(0);
    expect(factorAt(201_600)).toBe(1);
    expect(factorAt(MAX_SENTENCE_LENGTH_TICKS_DRAWN)).toBe(1);

    // And at intake, where the same term is applied by a different function.
    // The screening draw is stubbed to its middle value so the tier moves only
    // for the reason under test.
    const tierAt = (sentenceLengthTicks: number): number =>
      classifyPrisoner({ sentenceLengthTicks, priorIncidents: 0 }, { nextInt: () => 1 } as unknown as Xoshiro128StarStar).riskTier;
    expect(tierAt(MIN_SENTENCE_LENGTH_TICKS)).toBe(0);
    expect(tierAt(MAX_SENTENCE_LENGTH_TICKS_DRAWN)).toBe(1);
  });

  it('puts every drawable sentence past the first review interval, and a thin tail past the threshold', () => {
    const rng = streamAt(0xa11c_e001);
    const sample = Array.from({ length: 30_000 }, () => drawSentenceLengthTicks(rng));

    // Under the old range, eight of fifteen lengths were shorter than
    // `CLASSIFICATION_REVIEW_INTERVAL_TICKS` and could never be reviewed at
    // all. Every length in this range outlasts it. That is necessary and not
    // sufficient -- the review schedule is global while eligibility is per
    // record, so a 14-day sentence still only meets a review 40% of the time;
    // `tests/unit/prisoners-classification-review.test.ts` owns that half.
    expect(CLASSIFICATION_REVIEW_INTERVAL_TICKS).toBe(24_000);
    expect(sample.every((sentence) => sentence > 24_000)).toBe(true);

    // Seven of the seventy-seven values -- 84 to 90 days -- carry the
    // long-sentence term. A share, not a count, so the sample size can change
    // without the claim moving; the bounds are wide enough to survive sampling
    // noise and narrow enough to fail if the range stops straddling 200,000.
    const long = sample.filter((sentence) => sentence >= LONG_SENTENCE_THRESHOLD_TICKS).length / sample.length;
    expect(long).toBeGreaterThan(0.07);
    expect(long).toBeLessThan(0.12);

    // Both room-gated needs now cross inside every sentence, where under the
    // old range `recreation` cleared its 14,399 income boundary in only ten of
    // fifteen. 14,399 is the first day boundary after the crossing, which is
    // the tick that actually charges (`StateIncomeSystem`).
    expect(sample.every((sentence) => sentence > 14_399)).toBe(true);
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
