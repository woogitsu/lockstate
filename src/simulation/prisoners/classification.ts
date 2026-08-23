import type { Xoshiro128StarStar } from '../rng/xoshiro128starstar';

/** 0 = minimal, 3 = high risk. */
export type RiskTier = 0 | 1 | 2 | 3;

export interface ClassificationInput {
  readonly sentenceLengthTicks: number;
  /** Count of prior disciplinary/security incidents on record -- a simple integer input, not a real history system. */
  readonly priorIncidents: number;
}

export interface ClassificationResult {
  readonly riskTier: RiskTier;
  readonly classificationGroupId: string;
}

const LONG_SENTENCE_THRESHOLD_TICKS = 200_000;

/**
 * Deterministic classification: a small, explicit, ordered rule list (not
 * a hidden condition chain) plus one narrow, intentional named-RNG draw
 * modeling intake-screening variance -- issue #24's "deterministic
 * tie-breaking and named RNG only where explicitly intended." This is the
 * *only* RNG use in the prisoner slice; need decay, regime resolution and
 * utility-based action selection are all pure functions of state.
 */
export function classifyPrisoner(input: ClassificationInput, rng: Xoshiro128StarStar): ClassificationResult {
  let score = 0;
  if (input.sentenceLengthTicks >= LONG_SENTENCE_THRESHOLD_TICKS) score += 1;
  score += Math.min(2, Math.max(0, input.priorIncidents));

  const screeningVariance = rng.nextInt(3) - 1; // -1 | 0 | +1
  const riskTier = Math.max(0, Math.min(3, score + screeningVariance)) as RiskTier;
  const classificationGroupId = riskTier >= 3 ? 'high-risk' : 'general-population';

  return { riskTier, classificationGroupId };
}
