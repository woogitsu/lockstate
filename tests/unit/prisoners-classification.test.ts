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
});
