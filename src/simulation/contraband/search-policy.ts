import type { ContrabandHolderKind } from './item';

/** The four search scopes issue #27 names explicitly. */
export type SearchScope = 'person' | 'cell' | 'sector' | 'delivery';

/** One location `SearchSystem` visits and checks -- `'sector'` scope supplies several (a sweep across many cells/persons); the other scopes supply exactly one. */
export interface SearchTarget {
  readonly holderKind: ContrabandHolderKind;
  readonly holderId: string;
}

/**
 * Policy-driven cost/detection tuning per scope -- issue #27's "search
 * policy changes affect workload and detection behavior measurably."
 * Session/scenario-provided data, not a Zod content catalog (like
 * `DeploymentSchedule`, this is runtime staffing/timing configuration, not
 * localized static content).
 */
export interface SearchPolicyDefinition {
  readonly scope: SearchScope;
  /** Guards a search of this scope requires before it can begin -- unmet demand leaves the order queued, "consuming staff/time rather than resolving instantly." */
  readonly requiredGuardCount: number;
  /** Ticks spent actually searching each target in the order (travel time is separate, via the real `NavigationSystem`). */
  readonly dwellTicksPerTarget: number;
  /** Detection probability at zero concealment, before any penalty/bonus. */
  readonly baseDetectionProbability: number;
  /** Subtracted from detection probability per point of a category's `baseConcealment`. */
  readonly concealmentPenaltyPerPoint: number;
  /** Added to detection probability, scaled by the strongest matching intelligence record's confidence (0-1) for the target being searched. */
  readonly intelligenceConfidenceBonus: number;
}

/**
 * Deterministic, explicit-factor detection probability -- issue #27's
 * "detection uses explicit factors and named RNG," never a hidden
 * condition chain. Pure function: the same inputs always produce the same
 * probability; the only randomness is the caller's own named-RNG draw
 * against this result. Clamped to [0,1] -- a policy/category combination
 * with an extreme concealment value never overflows into a probability
 * outside its own defined range.
 */
export function resolveDetectionProbability(policy: SearchPolicyDefinition, categoryConcealment: number, intelligenceConfidence: number): number {
  const raw = policy.baseDetectionProbability - categoryConcealment * policy.concealmentPenaltyPerPoint + intelligenceConfidence * policy.intelligenceConfidenceBonus;
  return Math.max(0, Math.min(1, raw));
}
