import { describe, expect, it } from 'vitest';
import { resolveDetectionProbability, type SearchPolicyDefinition } from '../../src/simulation/contraband/search-policy';

const POLICY: SearchPolicyDefinition = {
  scope: 'cell',
  requiredGuardCount: 1,
  dwellTicksPerTarget: 10,
  baseDetectionProbability: 0.5,
  concealmentPenaltyPerPoint: 0.05,
  intelligenceConfidenceBonus: 0.3,
};

describe('resolveDetectionProbability: explicit, deterministic, clamped factors', () => {
  it('applies base probability with no concealment or intelligence', () => {
    expect(resolveDetectionProbability(POLICY, 0, 0)).toBeCloseTo(0.5, 10);
  });

  it('concealment reduces detection probability', () => {
    expect(resolveDetectionProbability(POLICY, 6, 0)).toBeCloseTo(0.5 - 6 * 0.05, 10);
  });

  it('intelligence confidence raises detection probability', () => {
    expect(resolveDetectionProbability(POLICY, 0, 1)).toBeCloseTo(0.5 + 0.3, 10);
  });

  it('clamps to [0, 1] regardless of how extreme the inputs are', () => {
    expect(resolveDetectionProbability(POLICY, 100, 0)).toBe(0);
    expect(resolveDetectionProbability(POLICY, 0, 100)).toBe(1);
  });
});
