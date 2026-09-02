import type { EntityId, EntityStore } from '../entity/entity-store';
import type { EntityQuery } from '../entity/query';
import type { SimulationContext, SystemRegistration } from '../kernel/system';
import { classifiedAtTickOf, REVIEWABLE_STAGES } from './classification-review-system';
import { classificationGroupIdForTier, EARLY_WARNING_TIER_CEILING, reviewClassification, type RiskTier } from './classification';
import { classificationGroupIndex, intakeStageFromIndex, type PrisonerRecordComponent } from './components';
import {
  buildDisciplinaryIndex,
  CLEAN_DISCIPLINARY_RECORD,
  NO_DISCIPLINARY_EVIDENCE,
  type DisciplinaryEvidenceSource,
  type DisciplinaryRecord,
} from './disciplinary-record';
import { DAY_LENGTH_TICKS } from './regime';

/** Observability only, and not persisted -- the same standing shape `ClassificationReviewMetrics` has. */
export interface ClassificationEarlyWarningMetrics {
  /** How many times this system has raised a prisoner's tier. */
  readonly warningsIssued: number;
}

/**
 * A faster, capped-lower companion to `ClassificationReviewSystem` -- issue
 * #788's ruling, ADR 0090.
 *
 * ## The gap this fills
 *
 * `ClassificationReviewSystem` is the authoritative review: absolute,
 * unbounded within the tier scale, and batched on a schedule whose earliest
 * possible run for any prisoner classified in a session's first review period
 * is tick 47,999 (`CLASSIFICATION_REVIEW_INTERVAL_TICKS * 2 - 1` -- see that
 * system's own `schedule` docblock for the derivation). The owner's ruling on
 * #788 keeps that pacing exactly as it is for reaching `High`, and separately
 * requires that a prisoner **not** jump there with nothing shown in between:
 * a single lapsed incident already saturates `MAX_FINDINGS_TERM`
 * (`disciplinary-record.ts`), so the authoritative review's one evaluation
 * point before day 20 goes straight from whatever intake gave to `High`, and
 * `Medium` is never actually written by anything, ever, in that scenario.
 *
 * Both halves of the ruling cannot be satisfied by changing the authoritative
 * review alone: showing `Medium` at some tick strictly before `High` needs a
 * second evaluation point, and the authoritative review's own floor puts none
 * before 47,999. So this is a second, independent system rather than a
 * retuned constant on the first one.
 *
 * ## What it is allowed to do, and why that is enough
 *
 * - **Runs once a day** (`DAY_LENGTH_TICKS`, not
 *   `CLASSIFICATION_REVIEW_INTERVAL_TICKS`), so it can catch disciplinary
 *   evidence within a day or two of the incident that produced it, rather than
 *   waiting for the ten-to-twenty-day review window.
 * - **Can only raise `riskTier`, and only ever as far as
 *   `EARLY_WARNING_TIER_CEILING` (`Medium`).** It never lowers a tier -- clean
 *   -conduct credit stays exclusively `ClassificationReviewSystem`'s job, so
 *   there is exactly one place a prisoner's tier ever goes down, and nothing
 *   here can flicker a warning on and off from one day to the next. And it
 *   never writes `High`: crossing into `High` is what carries real
 *   consequences (the high-risk regime, ADR 0080's contraband-introduction
 *   question), and reserving that write to the authoritative review is what
 *   keeps every one of those consequences arriving at exactly the tick they
 *   did before this system existed.
 * - **Reuses `reviewClassification` rather than a second formula.** The score
 *   this system reads and the score the authoritative review will eventually
 *   confirm or exceed are the same four named factors, computed the same way,
 *   so a player told "this is why you're at Medium" is told the truth about
 *   what the *next* review will find too -- capped, not re-decided.
 *
 * A prisoner this system raises to `Medium` still gets the exact same
 * authoritative review at the exact same tick as before, computing the exact
 * same score from the exact same evidence. If that score is `High`, `High` is
 * still what gets written, at the tick it always was. This system only ever
 * moves *when a lower bound becomes visible*, never *when the final answer
 * arrives*.
 *
 * ## Determinism
 *
 * Pure function of `context.tick` and the same evidence fold
 * `ClassificationReviewSystem` reads (`buildDisciplinaryIndex`), computed
 * fresh every run rather than accumulated -- so it is idempotent for the same
 * reason `reviewClassification` is, and running it twice at one tick writes
 * the same thing the first pass did. No RNG: this system never crosses into
 * `High`, so ADR 0080's contraband-introduction draw -- gated to exactly that
 * crossing -- never applies here, and nothing in this file reads
 * `context.rng`.
 *
 * ## Cost
 *
 * `buildDisciplinaryIndex` is a full scan of `IncidentLog` and
 * `ConfiscationLedger` (ADR 0032's own consequences already name this cost for
 * the authoritative review). Running it ten times more often -- daily instead
 * of every ten days -- multiplies that cost by the same factor. ADR 0032's
 * own answer to that shape of growth is unchanged by this system existing: "if
 * the log grows to where [this cadence] is too often, the answer is a
 * per-participant index in `IncidentLog`", not a change to either review.
 */
export class ClassificationEarlyWarningSystem implements SystemRegistration {
  public readonly id = 'prisoners.classification-early-warning';
  /**
   * Between intake (50) and the authoritative review (55) -- after a
   * prisoner's intake classification exists, before the system whose result
   * this one must never disagree with once both have run in the same tick.
   * `CLASSIFICATION_REVIEW_INTERVAL_TICKS` (24,000) is an exact multiple of
   * `DAY_LENGTH_TICKS` (2,400), so this system's own schedule fires on every
   * one of the authoritative review's ticks too; running first there simply
   * means the authoritative review's write -- which can reach `High` -- is
   * the one that stands, exactly as it would if this system did not exist.
   */
  public readonly order = 52;
  /** Once a day, at day's end -- the same end-of-period convention `economy.state-income` and `ClassificationReviewSystem` both use. */
  public readonly schedule = { intervalTicks: DAY_LENGTH_TICKS, phaseTicks: DAY_LENGTH_TICKS - 1 };

  private warningsIssued = 0;

  public constructor(
    private readonly store: EntityStore,
    private readonly query: EntityQuery,
    private readonly records: PrisonerRecordComponent,
    /** Same port and same default as `ClassificationReviewSystem`'s -- a session that wires no incident pipeline simply never has evidence to raise a tier from. */
    private readonly evidence: DisciplinaryEvidenceSource = NO_DISCIPLINARY_EVIDENCE,
  ) {}

  public getMetrics(): ClassificationEarlyWarningMetrics {
    return { warningsIssued: this.warningsIssued };
  }

  public update(context: SimulationContext): void {
    // One fold for the whole population, not one per prisoner -- the same
    // shape `ClassificationReviewSystem.update` uses, for the same reason.
    const disciplinaryIndex = buildDisciplinaryIndex(this.evidence);

    for (const entityId of this.query.execute()) {
      this.tryWarn(entityId, context.tick, disciplinaryIndex.get(entityId) ?? CLEAN_DISCIPLINARY_RECORD);
    }
  }

  private tryWarn(entityId: EntityId, tick: number, disciplinary: DisciplinaryRecord): void {
    const index = this.store.getIndex(entityId);
    if (!REVIEWABLE_STAGES.includes(intakeStageFromIndex(this.records.intakeStage[index]!))) return;

    const classifiedAtTick = classifiedAtTickOf(this.records.sentenceEndTick[index]!, this.records.sentenceLengthTicks[index]!);
    if (classifiedAtTick === undefined) return;

    const assessment = reviewClassification({
      sentenceLengthTicks: this.records.sentenceLengthTicks[index]!,
      priorIncidentsAtIntake: this.records.priorIncidentsAtIntake[index]!,
      classifiedAtTick,
      tick,
      disciplinary,
    });

    const cappedTier = Math.min(EARLY_WARNING_TIER_CEILING, assessment.riskTier) as RiskTier;
    const currentTier = this.records.riskTier[index]! as RiskTier;
    if (cappedTier <= currentTier) return;

    // `classificationGroupIdForTier(cappedTier)`, not
    // `assessment.classificationGroupId` -- the assessment's own group id is
    // derived from the *uncapped* tier, which can be `High`/`'high-risk'`
    // even when this system is only allowed to write `cappedTier`. And
    // `cappedTier` is at most `EARLY_WARNING_TIER_CEILING` (2), which
    // `classificationGroupIdForTier` always maps to `'general-population'` --
    // only tier 3 ever crosses into `'high-risk'` -- so this write can never
    // move a prisoner's regime, only their published tier.
    this.records.riskTier[index] = cappedTier;
    this.records.classificationGroupIndex[index] = classificationGroupIndex(classificationGroupIdForTier(cappedTier));
    this.warningsIssued += 1;
  }
}
