/**
 * One sector's aggregated risk inputs at a single sampling point. All
 * values are 0-1 so a policy's weights are directly comparable; the
 * caller (a session/scenario, or `IncidentTriggerSystem`'s own sampler)
 * derives them from real simulation state -- needs deficits, coverage
 * shortage, contraband/intelligence pressure -- rather than this module
 * reaching into every other subsystem itself.
 */
export interface SectorRiskSample {
  /**
   * Mean unmet-need pressure across the sector's prisoners (1 = fully unmet).
   *
   * "Mean" over two axes since [ADR 0048](../../../docs/adr/0048-what-a-sectors-occupants-are.md)
   * decision 2: each occupant's deficit is the mean over `NEED_IDS`, and the
   * sample is the mean of those. It used to be the `safety` deficit alone,
   * which `action.sleep` restores twenty times faster than it decays, so the
   * term was pinned near zero for anybody with a bed.
   */
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

/**
 * Directional defaults, not a committed balance decision (issue #28 explicitly
 * excludes final balance; see `docs/BENCHMARKING.md`'s no-hard-threshold
 * policy).
 *
 * **Three of the five moved with [ADR 0048](../../../docs/adr/0048-what-a-sectors-occupants-are.md),
 * and the ladder they were chosen against is in that document.** The shape they
 * now express, in one sentence each:
 *
 * - `needsPressureWeight: 1` — **neglect alone can cause a riot.** It was `0.5`
 *   against a `hotThreshold` of `0.6`, so the needs term could contribute at
 *   most `0.5` and no prison, however badly run, could riot while its single
 *   guard was on post. That is the second half of issue #442, and it made
 *   staffing the cause of unrest rather than its amplifier.
 *
 *   **Measured 2026-08-28 on #436's re-verification pass, and the sentence
 *   above is true of the *weight* and not yet of the *game*.** Raising it to 1
 *   made neglect able in principle to reach `hotThreshold` on its own; what
 *   reaches it in practice is homelessness, not neglect. A prisoner who holds a
 *   furnished cell has `sleep`, `hunger`, `bladder` and `safety` all served
 *   from it, so the only needs a *built* prison can pin at zero are `hygiene`
 *   and `recreation` — ADR 0054 decision 1 rules those room-gated — and two of
 *   six at zero is a ceiling of about `0.48` on `needsPressure`, under the
 *   `0.65` line. Measured over **ten** in-game days -- the fixture's 24,000
 *   ticks at `DAY_LENGTH_TICKS` 2,400, which this bullet and four documents
 *   beside it called twenty until
 *   [ADR 0064](../../../docs/adr/0064-what-an-unmet-need-costs-a-prison.md)
 *   checked the division -- eight prisoners in eight furnished
 *   cells with no shower room and no yard: peak score **0.4824** and **zero**
 *   riots with one guard on post, **0.7979** and three riots with none
 *   (`tests/integration/room-gated-needs.test.ts`; 0.7981 on the same fixture
 *   since ADR 0059). The prisoner who does
 *   push the term past the line is the one with no accommodation at all, whose
 *   six needs all decay unopposed — which is what
 *   `tests/integration/security-default-sector.test.ts`'s and
 *   `incident-trigger-reachability.test.ts`'s riot fixtures are actually made
 *   of. So the bullet is kept rather than rewritten, and this paragraph is what
 *   it does not yet say: **at these numbers, staffing is still the amplifier
 *   that decides, for every prison whose prisoners have somewhere to live.**
 *   Whether that is the balance wanted is #442's and ADR 0048's, not a thing to
 *   settle in this docblock.
 *
 *   **And since
 *   [ADR 0064](../../../docs/adr/0064-what-an-unmet-need-costs-a-prison.md)
 *   that staffed row is no longer free, without this weight moving at all.** What an unmet need costs a prison that never riots is on
 *   the income line: `StateIncomeSystem` withholds part of the state's
 *   prisoner-day grant for each of the six needs a place's occupant has at or
 *   below `STATE_INCOME_UNMET_NEED_LEVEL`, so the prison above earns 20,800
 *   over its ten days where a prison with a shower room and a yard earns
 *   24,000 (`tests/integration/needs-state-grant-loop.test.ts`). That was
 *   deliberately built *outside* this score: ADR 0061 already declined to feed
 *   `contrabandPressure` into it because doing so moved the 0.4824 row to
 *   ~0.60 and destroyed the evidence #477 exists to present, and the same
 *   argument forbids reaching for `needsPressureWeight` here.
 * - `staffingShortfallWeight: 0.3` — **unchanged, and now the amplifier it was
 *   named for.** A completely unguarded sector adds `0.3`, which turns a
 *   mediocre prison into a rioting one and leaves a well-run one alone:
 *   measured, a furnished prison sits at `0.164` at its worst and is still
 *   below the line with no guards at all.
 * - `contrabandPressureWeight: 0.2` — unchanged, and still structurally zero:
 *   `IntelligenceLedger.report`'s only caller in `src/` is `reportInformantTip`,
 *   which has no caller at all (ADR 0042 §#442).
 * - `hotThreshold: 0.65` — the line, read directly off `needsPressure` now that
 *   its weight is 1: a sector is hot when its prisoners' needs are on average
 *   about two-thirds unmet, or a third unmet with nobody guarding them.
 * - `sustainedSamplesRequired: 12` — twelve samples at the trigger's 50-tick
 *   cadence is 600 ticks, a quarter of an in-game day of *continuously* bad
 *   conditions. It was three, which is 150 ticks; the window is what makes a
 *   riot the end of a bad stretch rather than of a bad moment.
 */
export const DEFAULT_SECTOR_RISK_POLICY: SectorRiskPolicy = {
  needsPressureWeight: 1,
  staffingShortfallWeight: 0.3,
  contrabandPressureWeight: 0.2,
  hotThreshold: 0.65,
  sustainedSamplesRequired: 12,
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
