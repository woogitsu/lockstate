import type { EntityId, EntityStore } from '../entity/entity-store';
import type { EntityQuery } from '../entity/query';
import type { SimulationContext, SystemRegistration } from '../kernel/system';
import {
  CLASSIFICATION_REVIEW_INTERVAL_TICKS,
  reviewClassification,
  type ClassificationAssessment,
  type RiskTier,
} from './classification';
import { classificationGroupIndex, intakeStageFromIndex, type PrisonerRecordComponent } from './components';
import {
  buildDisciplinaryIndex,
  CLEAN_DISCIPLINARY_RECORD,
  NO_DISCIPLINARY_EVIDENCE,
  type DisciplinaryEvidenceSource,
  type DisciplinaryRecord,
} from './disciplinary-record';

/**
 * Observability only, and **not persisted** -- the same standing
 * `IntakeMetrics` has (no save section carries `completedCount` either). A
 * counter that resets on restore is safe here precisely because nothing reads
 * it back into simulation state: the tier a review writes is a function of
 * tick and evidence, so a restored session recomputes the same tier whatever
 * these say.
 */
export interface ClassificationReviewMetrics {
  /** How many individual prisoner reviews have been carried out. */
  readonly reviewsCompleted: number;
  /** Reviews that raised a prisoner's tier. */
  readonly tierIncreases: number;
  /** Reviews that lowered it. */
  readonly tierDecreases: number;
  /** Reviews that moved a prisoner between `general-population` and `high-risk`, in either direction -- the subset that changes which regime timetable they live under. */
  readonly groupChanges: number;
}

/**
 * The tick a prisoner's intake classification was written, or `undefined`
 * when it cannot be established.
 *
 * **Derived from two fields the save already carries, which is the whole
 * reason this change needs no schema bump** (ADR 0032 decision 1).
 * `IntakeSystem` writes `sentenceEndTick = tick + sentenceLengthTicks` at the
 * `'classification'` stage and both operands are persisted, so the difference
 * is exactly that tick. No new per-prisoner field, no V6, no migration.
 *
 * `undefined` covers the one case the arithmetic cannot survive:
 * `sentenceEndTick` is a `Uint32Array` slot and `sentenceLengthTicks` may be
 * up to `MAX_SENTENCE_LENGTH_TICKS` (`0xffff_ffff`), so the sum wraps for a
 * long enough sentence and the difference is no longer the classification
 * tick. Detected rather than guessed: a wrapped sum is strictly less than the
 * sentence length it was added to. Such a prisoner is **never reviewed**,
 * which is the honest answer -- inventing a classification tick would move
 * their tier on evidence about somebody else's clock.
 */
export function classifiedAtTickOf(sentenceEndTick: number, sentenceLengthTicks: number): number | undefined {
  if (sentenceEndTick < sentenceLengthTicks) return undefined;
  return sentenceEndTick - sentenceLengthTicks;
}

/**
 * The stages at which a prisoner has a classification to review.
 *
 * `'queued'`, `'reception'` and `'classification'` have not written one yet --
 * `riskTier` is still the zero a fresh slot holds, which is the same reason
 * `prisoner-projection.ts` reports `classified: false` for them.
 *
 * `'failed'` is excluded because a tier written there could never reach a
 * regime or a placement: no branch of `IntakeSystem.update` matches the stage.
 *
 * **This used to give a second reason and that reason is now false.** It read
 * *"it is terminal and inert (ADR 0028 decision 8): no branch of
 * `IntakeSystem.update` matches it and **nothing releases the record**"*.
 * `PrisonerDischargeSystem` releases it: `SENTENCE_BEARING_STAGES` is
 * `['accommodation-assignment', 'completed', 'failed']`, and that file states
 * the difference from this list explicitly, from its own side -- *"a
 * `'failed'` record is a prisoner the prison is holding, counted in the
 * population and drawn on the map, whose sentence is running exactly like
 * anybody else's"*. Only this side was left saying the old thing.
 *
 * The exclusion itself is unchanged and still right; what changed is that it
 * rests on one reason rather than two. A `'failed'` prisoner is released at
 * the end of their sentence like anybody else -- they are simply never
 * *reviewed* while they are held, because a tier written at that stage has
 * nowhere to go.
 */
const REVIEWABLE_STAGES: readonly string[] = ['accommodation-assignment', 'completed'];

/**
 * Periodic classification review -- issue #78's "periodic review that can move
 * someone in either direction", driven by issue #80's consequence for the
 * prisoner involved in an incident or a contraband find.
 *
 * ## What it does
 *
 * Once every `CLASSIFICATION_REVIEW_INTERVAL_TICKS`, every prisoner who has
 * been classified for at least that long is reassessed by
 * `reviewClassification` and their `riskTier` and `classificationGroupIndex`
 * are rewritten. Both are existing, already-persisted slots on
 * `PrisonerRecordComponent`; this system adds no state of its own beyond the
 * unpersisted metrics above.
 *
 * ## What a rewritten tier reaches
 *
 * Three consumers, all of them already wired, which is why this is a small
 * change with real consequences rather than a bookkeeping one:
 *
 * - **`ActionSystem`** reads `classificationGroupIndex` on every
 *   reconsideration and resolves the regime schedule from it, so a prisoner who
 *   reaches tier 3 is moved onto the high-risk timetable -- confined to
 *   sleep/meal/hygiene for 2,200 of the day's 2,400 ticks. That is the
 *   consequence a player watches happen.
 * - **`rateCellSharing`**, through `IntakeSystem.findBestAvailable`: the
 *   rating's one term is the worst classification distance across a cell's live
 *   occupants, so a sitting prisoner's tier moving changes where the *next*
 *   arrival is housed. ADR 0027 recorded that this needed #78's mutability to
 *   become a loop rather than a filter; this is it.
 * - **`projectPrisonerRoster`/`projectPrisonerDetail`** and
 *   `projectStatusStrip`'s `prisonersHighRisk`, which are published already.
 *   That count could previously only ever change on an admission.
 *
 * ## Determinism
 *
 * - **No RNG.** `context.rng` is not touched, so no named stream advances and
 *   the `prisoners.classification` sequence a later admission draws from is
 *   untouched. See `reviewClassification`'s note for why a draw here would be
 *   worse than it looks.
 * - **No clock.** Every temporal input is `context.tick` or a persisted tick.
 * - **Canonical iteration.** `EntityQuery.execute()`, ascending entity index,
 *   the same walk `IntakeSystem` and `ActionSystem` use. The disciplinary index
 *   is a `Map` that is only ever `get`-ed, never enumerated.
 * - **Order-independent anyway.** Each prisoner's new tier is a pure function
 *   of their own record and the shared evidence fold, and nothing written in
 *   this pass is read by it, so the outcome does not depend on the walk order
 *   even though the walk is canonical.
 * - **Idempotent.** `reviewClassification` is absolute rather than
 *   incremental, so running this system twice at one tick writes the same
 *   values the first pass did.
 */
export class ClassificationReviewSystem implements SystemRegistration {
  public readonly id = 'prisoners.classification-review';
  /**
   * Immediately after `prisoners.intake` (50) and before everything that reads
   * a classification. It is appended into the gap between intake and
   * `prisoners.needs-decay` (60) rather than at the end of the order so that a
   * tier written this tick is the tier `prisoners.actions` (250) resolves a
   * regime from on the same tick, instead of one tick late.
   */
  public readonly order = 55;
  /**
   * The last tick of every review period, mirroring `economy.state-income`'s
   * end-of-day phase. The phase matters more than it looks: at
   * `phaseTicks: 0` the first run is tick 0, where nobody is classified and
   * every prisoner is skipped, so the readout would be a system that has
   * "run" and done nothing.
   */
  public readonly schedule = {
    intervalTicks: CLASSIFICATION_REVIEW_INTERVAL_TICKS,
    phaseTicks: CLASSIFICATION_REVIEW_INTERVAL_TICKS - 1,
  };

  private reviewsCompleted = 0;
  private tierIncreases = 0;
  private tierDecreases = 0;
  private groupChanges = 0;

  public constructor(
    private readonly store: EntityStore,
    private readonly query: EntityQuery,
    private readonly records: PrisonerRecordComponent,
    /**
     * Defaults to "no evidence at all" so a session that wires no incident
     * pipeline reviews against a clean record rather than throwing. A prisoner
     * in such a session still moves -- clean-conduct credit is the term that
     * needs no evidence to accrue.
     */
    private readonly evidence: DisciplinaryEvidenceSource = NO_DISCIPLINARY_EVIDENCE,
  ) {}

  public getMetrics(): ClassificationReviewMetrics {
    return {
      reviewsCompleted: this.reviewsCompleted,
      tierIncreases: this.tierIncreases,
      tierDecreases: this.tierDecreases,
      groupChanges: this.groupChanges,
    };
  }

  /**
   * What a review would decide for one prisoner at `tick`, without writing
   * anything -- issue #78's "the panel can explain *why* someone sits where
   * they do", answerable on demand rather than only at a scheduled tick.
   *
   * `undefined` for an id that is not alive, has not been classified yet, or
   * whose classification tick cannot be established (see
   * `classifiedAtTickOf`).
   *
   * Folds the whole evidence set per call, so it is a projection/inspection
   * entry point and deliberately not on any per-tick path. `update` folds once
   * for the entire population instead.
   */
  public assess(entityId: EntityId, tick: number): ClassificationAssessment | undefined {
    if (!this.store.isAlive(entityId)) return undefined;
    const index = this.store.getIndex(entityId);
    const disciplinary = buildDisciplinaryIndex(this.evidence).get(entityId) ?? CLEAN_DISCIPLINARY_RECORD;
    return this.assessOne(index, tick, disciplinary);
  }

  private assessOne(index: number, tick: number, disciplinary: DisciplinaryRecord): ClassificationAssessment | undefined {
    if (!REVIEWABLE_STAGES.includes(intakeStageFromIndex(this.records.intakeStage[index]!))) return undefined;
    const classifiedAtTick = classifiedAtTickOf(this.records.sentenceEndTick[index]!, this.records.sentenceLengthTicks[index]!);
    if (classifiedAtTick === undefined) return undefined;
    return reviewClassification({
      sentenceLengthTicks: this.records.sentenceLengthTicks[index]!,
      priorIncidentsAtIntake: this.records.priorIncidentsAtIntake[index]!,
      classifiedAtTick,
      tick,
      disciplinary,
    });
  }

  public update(context: SimulationContext): void {
    // One fold for the whole population, not one per prisoner: the incident log
    // has no per-participant index (ADR 0027 records that a participant query
    // is a full scan), so asking it once per review period is the shape that
    // keeps this off any hot path.
    const disciplinaryIndex = buildDisciplinaryIndex(this.evidence);

    for (const entityId of this.query.execute()) {
      const index = this.store.getIndex(entityId);

      const classifiedAtTick = classifiedAtTickOf(this.records.sentenceEndTick[index]!, this.records.sentenceLengthTicks[index]!);
      if (classifiedAtTick === undefined) continue;
      // A prisoner classified less than a full period ago is not due: their
      // intake screening draw stands until they have served one review
      // interval, which is what keeps that draw meaningful rather than a value
      // the next scheduled tick overwrites.
      if (context.tick - classifiedAtTick < CLASSIFICATION_REVIEW_INTERVAL_TICKS) continue;

      const assessment = this.assessOne(index, context.tick, disciplinaryIndex.get(entityId) ?? CLEAN_DISCIPLINARY_RECORD);
      if (assessment === undefined) continue;

      const previousTier = this.records.riskTier[index]! as RiskTier;
      const previousGroupIndex = this.records.classificationGroupIndex[index]!;
      const nextGroupIndex = classificationGroupIndex(assessment.classificationGroupId);

      this.records.riskTier[index] = assessment.riskTier;
      this.records.classificationGroupIndex[index] = nextGroupIndex;

      this.reviewsCompleted += 1;
      if (assessment.riskTier > previousTier) this.tierIncreases += 1;
      else if (assessment.riskTier < previousTier) this.tierDecreases += 1;
      if (nextGroupIndex !== previousGroupIndex) this.groupChanges += 1;
    }
  }
}
