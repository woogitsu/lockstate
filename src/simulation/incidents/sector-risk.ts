/**
 * One sector's aggregated risk inputs at a single sampling point. All
 * values are 0-1 so a policy's weights are directly comparable; the
 * caller (a session/scenario, or `IncidentTriggerSystem`'s own sampler)
 * derives them from real simulation state -- needs deficits, coverage
 * shortage, contraband/intelligence pressure -- rather than this module
 * reaching into every other subsystem itself.
 */
export interface SectorRiskSample {
  /** Mean unmet-need pressure across the sector's prisoners (1 = fully unmet). */
  readonly needsPressure: number;
  /** Guard coverage shortfall (1 = zero of the required guards present). */
  readonly staffingShortfall: number;
  /** Known contraband/intelligence pressure on the sector (1 = maximum suspicion). */
  readonly contrabandPressure: number;
}

export interface SectorRiskPolicy {
  readonly needsPressureWeight: number;
  readonly staffingShortfallWeight: number;
  readonly contrabandPressureWeight: number;
  /** Instantaneous score at/above which a sample counts as "hot" for the sustained window. */
  readonly hotThreshold: number;
  /**
   * Consecutive hot samples required before a trigger fires. Architecture
   * notes: "triggers use sustained/aggregated conditions to prevent
   * single-tick oscillation" -- one spike above `hotThreshold` never
   * fires, and one sample below it resets the streak to zero.
   */
  readonly sustainedSamplesRequired: number;
}

/** Directional defaults, not a committed balance decision (issue #28 explicitly excludes final balance; see `docs/BENCHMARKING.md`'s no-hard-threshold policy). */
export const DEFAULT_SECTOR_RISK_POLICY: SectorRiskPolicy = {
  needsPressureWeight: 0.5,
  staffingShortfallWeight: 0.3,
  contrabandPressureWeight: 0.2,
  hotThreshold: 0.6,
  sustainedSamplesRequired: 3,
};

/** Pure, explicit-factor weighted sum, clamped to [0,1] -- the same "explicit factors, no hidden condition chain" shape as #27's `resolveDetectionProbability`. */
export function scoreSectorRisk(sample: SectorRiskSample, policy: SectorRiskPolicy): number {
  const raw =
    sample.needsPressure * policy.needsPressureWeight +
    sample.staffingShortfall * policy.staffingShortfallWeight +
    sample.contrabandPressure * policy.contrabandPressureWeight;
  return Math.max(0, Math.min(1, raw));
}

interface SectorRiskState {
  latestScore: number;
  consecutiveHotSamples: number;
}

/**
 * Tracks each sector's risk streak across sampling points. Deliberately
 * a small per-sector `Map` (sectors number in the tens, like guards --
 * see `docs/SECURITY.md`'s guard-roster note), not a hot typed-array
 * component.
 */
export class SectorRiskTracker {
  private readonly states = new Map<string, SectorRiskState>();

  public constructor(private readonly policy: SectorRiskPolicy = DEFAULT_SECTOR_RISK_POLICY) {}

  /** Records one sample and returns the resulting score. A sample below `hotThreshold` resets the streak -- never a decay, so a sector that briefly calms down genuinely starts over. */
  public sample(sectorId: string, sample: SectorRiskSample): number {
    const score = scoreSectorRisk(sample, this.policy);
    const state = this.states.get(sectorId) ?? { latestScore: 0, consecutiveHotSamples: 0 };
    state.latestScore = score;
    state.consecutiveHotSamples = score >= this.policy.hotThreshold ? state.consecutiveHotSamples + 1 : 0;
    this.states.set(sectorId, state);
    return score;
  }

  public getScore(sectorId: string): number {
    return this.states.get(sectorId)?.latestScore ?? 0;
  }

  public getConsecutiveHotSamples(sectorId: string): number {
    return this.states.get(sectorId)?.consecutiveHotSamples ?? 0;
  }

  /** True only once a sector has been continuously hot for the policy's full window. */
  public isSustainedHot(sectorId: string): boolean {
    return this.getConsecutiveHotSamples(sectorId) >= this.policy.sustainedSamplesRequired;
  }

  /** Clears a sector's streak -- called after a trigger fires so one sustained window produces one incident, not one per subsequent sample. */
  public resetStreak(sectorId: string): void {
    const state = this.states.get(sectorId);
    if (state !== undefined) state.consecutiveHotSamples = 0;
  }

  /** Deterministic: sorted by sector id. */
  public getSnapshot(): readonly (readonly [string, SectorRiskState])[] {
    return [...this.states.keys()].sort().map((id) => [id, { ...this.states.get(id)! }] as const);
  }

  public loadSnapshot(snapshot: ReturnType<SectorRiskTracker['getSnapshot']>): void {
    this.states.clear();
    for (const [id, state] of snapshot) this.states.set(id, { ...state });
  }
}
