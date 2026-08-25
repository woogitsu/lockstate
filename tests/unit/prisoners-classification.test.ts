import { describe, expect, it } from 'vitest';
import { deriveXoshiroState } from '../../src/simulation/rng/seed';
import { Xoshiro128StarStar } from '../../src/simulation/rng/xoshiro128starstar';
import { classifyPrisoner } from '../../src/simulation/prisoners/classification';

function rngFromSeed(seed: number, stream = 'test'): Xoshiro128StarStar {
  return new Xoshiro128StarStar(deriveXoshiroState(seed, stream).words);
}

describe('classifyPrisoner', () => {
  it('is deterministic for an identical RNG stream state', () => {
    const first = classifyPrisoner({ sentenceLengthTicks: 1_000, priorIncidents: 1 }, rngFromSeed(42));
    const second = classifyPrisoner({ sentenceLengthTicks: 1_000, priorIncidents: 1 }, rngFromSeed(42));
    expect(second).toEqual(first);
  });

  it('produces a different result for a different seed (real RNG influence, not ignored)', () => {
    const results = new Set<string>();
    for (let seed = 0; seed < 20; seed += 1) {
      const result = classifyPrisoner({ sentenceLengthTicks: 1_000, priorIncidents: 1 }, rngFromSeed(seed));
      results.add(JSON.stringify(result));
    }
    expect(results.size).toBeGreaterThan(1);
  });

  it('always returns a risk tier in [0, 3] regardless of extreme inputs', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const low = classifyPrisoner({ sentenceLengthTicks: 0, priorIncidents: 0 }, rngFromSeed(seed));
      const high = classifyPrisoner({ sentenceLengthTicks: 10_000_000, priorIncidents: 255 }, rngFromSeed(seed));
      expect(low.riskTier).toBeGreaterThanOrEqual(0);
      expect(low.riskTier).toBeLessThanOrEqual(3);
      expect(high.riskTier).toBeGreaterThanOrEqual(0);
      expect(high.riskTier).toBeLessThanOrEqual(3);
    }
  });

  it('maps risk tier 3 to the high-risk group and anything lower to general-population', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const result = classifyPrisoner({ sentenceLengthTicks: 500_000, priorIncidents: 5 }, rngFromSeed(seed));
      expect(result.classificationGroupId).toBe(result.riskTier >= 3 ? 'high-risk' : 'general-population');
    }
  });

  it('a long sentence with priors is more likely to reach high-risk than a short sentence with no priors', () => {
    let highSentenceHighRiskCount = 0;
    let lowSentenceHighRiskCount = 0;
    for (let seed = 0; seed < 200; seed += 1) {
      if (classifyPrisoner({ sentenceLengthTicks: 500_000, priorIncidents: 3 }, rngFromSeed(seed)).classificationGroupId === 'high-risk') highSentenceHighRiskCount += 1;
      if (classifyPrisoner({ sentenceLengthTicks: 0, priorIncidents: 0 }, rngFromSeed(seed)).classificationGroupId === 'high-risk') lowSentenceHighRiskCount += 1;
    }
    expect(highSentenceHighRiskCount).toBeGreaterThan(lowSentenceHighRiskCount);
  });

  /**
   * The whole draw space, not a sample of seeds.
   *
   * `classifyPrisoner` draws exactly one `nextInt(3)`, so an input's complete
   * set of outcomes is three values wide and can be *enumerated*. Every case
   * above samples seeds instead, which is right for the statistical claims they
   * make and wrong for a claim about what an input can never produce: a
   * 300-seed sweep that finds no tier 3 is evidence, and stubbing the draw is
   * proof. ADR 0028 recorded "across 300 seeds only tiers 0 and 1 occur" for
   * the Intake panel's request, which was true and was a sample where an
   * exhaustion was available -- and it was read as "unreachable" when what it
   * bounded was only the *panel's* request, not the command schema behind it.
   */
  describe('the reachable tiers of an input, enumerated over the whole draw space', () => {
    /** Every value `nextInt(3)` can return. The rejection loop makes it uniform over exactly `{0, 1, 2}`. */
    const DRAWS = [0, 1, 2] as const;

    function reachableTiers(input: { sentenceLengthTicks: number; priorIncidents: number }): readonly number[] {
      const tiers = new Set<number>();
      for (const draw of DRAWS) {
        const rng = { nextInt: () => draw } as unknown as Xoshiro128StarStar;
        tiers.add(classifyPrisoner(input, rng).riskTier);
      }
      return [...tiers].sort((a, b) => a - b);
    }

    it('cannot reach high-risk from what the Intake panel asks for, at any seed', () => {
      // `ADMISSION_REQUEST` in `src/main.ts`. Deliberately the least eventful
      // values in range: 0 priors and a sentence well under the 200,000-tick
      // threshold, so the score is 0 and the tier is the screening draw alone.
      expect(reachableTiers({ sentenceLengthTicks: 10_000, priorIncidents: 0 })).toEqual([0, 1]);
    });

    it('reaches high-risk from two priors alone, or from one plus a long sentence', () => {
      // The boundary in both directions, so a change to either term of the
      // score shows up here rather than as a surprise in intake. These are the
      // inputs a *wider* `AdmitPrisoner` can carry -- the schema permits
      // `priorIncidents` up to 255 -- and a queued command restored from a save
      // is a shape that reaches them today.
      expect(reachableTiers({ sentenceLengthTicks: 10_000, priorIncidents: 1 })).toEqual([0, 1, 2]);
      expect(reachableTiers({ sentenceLengthTicks: 10_000, priorIncidents: 2 })).toEqual([1, 2, 3]);
      expect(reachableTiers({ sentenceLengthTicks: 200_000, priorIncidents: 1 })).toEqual([1, 2, 3]);
      expect(reachableTiers({ sentenceLengthTicks: 200_000, priorIncidents: 0 })).toEqual([0, 1, 2]);
    });

    it('saturates rather than overflowing on a huge prior-incident count', () => {
      // `priorIncidents` contributes `min(2, max(0, n))`, so 255 -- the top of
      // the `Uint8Array` slot and of the command schema -- is worth the same as
      // 2 and cannot push the tier past its clamp.
      expect(reachableTiers({ sentenceLengthTicks: 10_000, priorIncidents: 255 })).toEqual(
        reachableTiers({ sentenceLengthTicks: 10_000, priorIncidents: 2 }),
      );
      expect(reachableTiers({ sentenceLengthTicks: 0xffff_ffff, priorIncidents: 255 })).toEqual([2, 3]);
    });
  });
});
