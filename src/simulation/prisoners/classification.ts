import type { Xoshiro128StarStar } from '../rng/xoshiro128starstar';
import { CLEAN_DISCIPLINARY_RECORD, type DisciplinaryRecord } from './disciplinary-record';

/** 0 = minimal, 3 = high risk. */
export type RiskTier = 0 | 1 | 2 | 3;

export interface ClassificationInput {
  readonly sentenceLengthTicks: number;
  /** Count of prior disciplinary/security incidents on record -- a simple integer input, not a real history system. */
  readonly priorIncidents: number;
}

/**
 * What an admission asks for -- `ClassificationInput` with the sentence made
 * optional (#535 decision 5).
 *
 * The two types are deliberately separate rather than one type with an
 * optional field. `ClassificationInput` is what `classifyPrisoner` reads, and
 * by then the length is a number: it was either named by the admission or
 * drawn at the `classification` stage from `prisoners.sentence`
 * (`src/simulation/prisoners/sentence.ts`). This type is what crosses the
 * command boundary, where "the simulation decides" is a legal answer and the
 * one `src/main.ts` gives.
 *
 * A `ClassificationInput` is assignable to this, which is why every existing
 * caller that names a length -- every fixture in `tests/`, every queued
 * `AdmitPrisoner` in a save written before this change -- keeps its exact
 * behaviour: a named length is used, never redrawn.
 */
export interface AdmissionRequest {
  /** Omitted: drawn inside the simulation. Present: used exactly as given, and `admitPrisonerSchema` has already refused a non-positive or out-of-range one. */
  readonly sentenceLengthTicks?: number;
  readonly priorIncidents: number;
}

export interface ClassificationResult {
  readonly riskTier: RiskTier;
  readonly classificationGroupId: string;
}

const LONG_SENTENCE_THRESHOLD_TICKS = 200_000;

/**
 * Which regime a tier is housed and timetabled under.
 *
 * **The tier scale and the housing group are two axes, not one** (ADR 0032
 * decision 3, answering issue #78's "decide whether person-classification and
 * room-grade are the same axis or two, and say which"). The tier is the
 * four-value person-classification `RiskTier`; the group is the two-value
 * regime key `CLASSIFICATION_GROUP_IDS` declares, and a group is a
 * `RegimeSchedule` -- adding a third means authoring a gapless daily timetable
 * and a message key under `simulation-message-keys.ts`'s completeness gate,
 * which is content work this decision does not take on.
 *
 * One definition, called from both the intake draw and the periodic review, so
 * the two cannot drift about what tier 3 means.
 */
export function classificationGroupIdForTier(riskTier: RiskTier): string {
  return riskTier >= 3 ? 'high-risk' : 'general-population';
}

function clampTier(score: number): RiskTier {
  return Math.max(0, Math.min(3, score)) as RiskTier;
}

/**
 * Deterministic classification: a small, explicit, ordered rule list (not
 * a hidden condition chain) plus one narrow, intentional named-RNG draw
 * modeling intake-screening variance -- issue #24's "deterministic
 * tie-breaking and named RNG only where explicitly intended." This is the
 * *only* RNG use in the prisoner slice; need decay, regime resolution,
 * utility-based action selection and `reviewClassification` below are all pure
 * functions of state.
 *
 * **What this tier now is.** Since ADR 0032 it is the arrival's *provisional*
 * classification: `ClassificationReviewSystem` reassesses it once the prisoner
 * has served a full review period, and the screening variance this draw adds
 * is not carried past that first review. That is deliberate -- the variance
 * models a screening at the gate being imprecise, and a full review correcting
 * it is what issue #78's "classification is not permanent" describes.
 */
export function classifyPrisoner(input: ClassificationInput, rng: Xoshiro128StarStar): ClassificationResult {
  let score = 0;
  if (input.sentenceLengthTicks >= LONG_SENTENCE_THRESHOLD_TICKS) score += 1;
  score += Math.min(2, Math.max(0, input.priorIncidents));

  const screeningVariance = rng.nextInt(3) - 1; // -1 | 0 | +1
  const riskTier = clampTier(score + screeningVariance);

  return { riskTier, classificationGroupId: classificationGroupIdForTier(riskTier) };
}

// --- Periodic review (issues #78 and #80, ADR 0032) -----------------------

/**
 * How long a prisoner must have been classified before their first review,
 * and the interval between reviews after that.
 *
 * Ten in-game days (`DAY_LENGTH_TICKS` is 2,400). A **candidate value, not a
 * locked balance decision** -- the same standing `regime.ts` gives
 * `DAY_LENGTH_TICKS` itself. Issue #78 cites twelve months as real practice;
 * an in-game day is already a deliberately short abstraction, so ten of them
 * is the analogue rather than a literal year.
 */
export const CLASSIFICATION_REVIEW_INTERVAL_TICKS = 24_000;

/**
 * How long a prisoner must go without a finding to earn one point back.
 *
 * Issue #80: "time without a finding must count for something, or the loop
 * only ratchets one way." One review period per point, up to
 * `MAX_CLEAN_CONDUCT_CREDIT`.
 */
export const CLEAN_CONDUCT_CREDIT_PERIOD_TICKS = CLASSIFICATION_REVIEW_INTERVAL_TICKS;

/**
 * The most a clean record can take off, and the most findings can add.
 *
 * Both caps are the reason the loop cannot dead-end in either direction. With
 * the findings term capped at 3 and the credit at 2, a prisoner who has done
 * everything can still come down to 1 (plus whatever their sentence and intake
 * history are worth), and a prisoner who has done nothing cannot fall below
 * their sentence-and-history floor minus 2. An uncapped findings term would
 * make a long record permanently un-redeemable; an uncapped credit would make
 * every long-serving prisoner minimal-risk regardless of what they had done.
 */
export const MAX_FINDINGS_TERM = 3;
export const MAX_CLEAN_CONDUCT_CREDIT = 2;

/**
 * The named factors a review's score is built from -- issue #78's "a
 * classification score built from named, inspectable factors rather than one
 * opaque number, so the panel can explain *why* someone sits where they do".
 *
 * Every field is a signed integer and they sum to `score`, so an explanation
 * is the object itself rather than a re-derivation.
 */
export interface ClassificationFactors {
  /** `+1` for a sentence at or over the long-sentence threshold. The same term intake applies, so a review does not re-decide what intake already weighed. */
  readonly sentence: number;
  /** `+0..2` from `priorIncidentsAtIntake` -- what the prisoner arrived with, saturating exactly as intake's term does. */
  readonly intakeHistory: number;
  /** `+0..MAX_FINDINGS_TERM` from disciplinary findings in custody. */
  readonly findings: number;
  /** `-0..MAX_CLEAN_CONDUCT_CREDIT` for elapsed time since the last finding, or since classification for a prisoner with none. */
  readonly cleanConduct: number;
}

export interface ClassificationAssessment {
  readonly factors: ClassificationFactors;
  /** The factors' sum, before clamping. Kept because a score of 5 and a score of 3 are the same tier and not the same situation. */
  readonly score: number;
  readonly riskTier: RiskTier;
  readonly classificationGroupId: string;
}

export interface ClassificationReviewInput {
  readonly sentenceLengthTicks: number;
  readonly priorIncidentsAtIntake: number;
  /** The tick this prisoner's intake classification was written. Clean conduct runs from here for a prisoner with no finding. */
  readonly classifiedAtTick: number;
  readonly tick: number;
  readonly disciplinary?: DisciplinaryRecord;
}

/**
 * Reassess one prisoner's classification from named factors.
 *
 * ## Absolute, not incremental, and that is a determinism decision
 *
 * This returns the tier the evidence supports *now*; it does not step the
 * recorded tier towards it. The alternative considered was "move at most one
 * tier per review", which reads well and is how a real board behaves, and it
 * was rejected because it makes the recorded tier a function of **how many
 * times the review system happened to run** rather than of state. Two sessions
 * at the same tick with the same evidence could then hold different tiers
 * because one of them was saved and restored across a scheduled review, or
 * because the interval was retuned between builds. An absolute recomputation
 * is idempotent: running it twice, or a hundred times, at the same tick with
 * the same evidence gives the same answer, so nothing about the schedule can
 * leak into the outcome.
 *
 * ## Determinism
 *
 * Pure. **No RNG at all**, and that is not an omission: the one draw in this
 * module is `classifyPrisoner`'s, on the `prisoners.classification` stream, and
 * a draw taken here would advance that stream on a tick that has nothing to do
 * with an admission -- shifting the classification of every prisoner admitted
 * afterwards. Integer arithmetic throughout, no clock, no iteration.
 */
export function reviewClassification(input: ClassificationReviewInput): ClassificationAssessment {
  const disciplinary = input.disciplinary ?? CLEAN_DISCIPLINARY_RECORD;

  const sentence = input.sentenceLengthTicks >= LONG_SENTENCE_THRESHOLD_TICKS ? 1 : 0;
  const intakeHistory = Math.min(2, Math.max(0, input.priorIncidentsAtIntake));
  const findings = Math.min(MAX_FINDINGS_TERM, Math.max(0, disciplinary.points));

  // The clock runs from the last finding, or from classification for a
  // prisoner who has never had one -- so "no findings ever" and "no findings
  // since the last one" are credited the same way and neither is a special
  // case. `Math.max(0, ...)` guards a finding recorded at a tick after this
  // one, which a restored log could hold if evidence outlived the tick it was
  // restored to; a negative elapsed time would otherwise credit a *penalty*.
  const cleanSince = disciplinary.lastFindingTick ?? input.classifiedAtTick;
  const cleanTicks = Math.max(0, input.tick - cleanSince);
  const cleanCredit = Math.min(MAX_CLEAN_CONDUCT_CREDIT, Math.floor(cleanTicks / CLEAN_CONDUCT_CREDIT_PERIOD_TICKS));
  // `cleanCredit === 0 ? 0 : -cleanCredit`, not `-cleanCredit`, because
  // negating zero in JavaScript gives `-0`: a factor a panel would render as
  // "-0", and a value `Object.is` and `toEqual` both distinguish from `0`.
  const cleanConduct = cleanCredit === 0 ? 0 : -cleanCredit;

  const factors: ClassificationFactors = { sentence, intakeHistory, findings, cleanConduct };
  const score = sentence + intakeHistory + findings + cleanConduct;
  const riskTier = clampTier(score);

  return { factors, score, riskTier, classificationGroupId: classificationGroupIdForTier(riskTier) };
}

// --- Early warning (issue #788, ADR 0090) ----------------------------------

/**
 * The highest tier `ClassificationEarlyWarningSystem` may ever write.
 *
 * **Medium, and not higher, on purpose.** The owner's ruling on #788 is in two
 * parts: the twenty in-game days a neglected prison takes to reach `High`
 * through `ClassificationReviewSystem` is *right and not to be changed*, and
 * the fact that `Medium` never appears on the way there — a single lapsed
 * incident already saturates `MAX_FINDINGS_TERM`, so the full review's one
 * evaluation point jumps straight from whatever intake gave to `High` — is
 * *wrong*. `CLASSIFICATION_REVIEW_INTERVAL_TICKS` and its batch schedule
 * (`ClassificationReviewSystem`'s `phaseTicks = intervalTicks - 1`) put a hard
 * floor under the full review: for any prisoner classified in a session's
 * first review period, the earliest that review can ever run is exactly
 * `2 * CLASSIFICATION_REVIEW_INTERVAL_TICKS - 1` (47,999), independent of when
 * in that period they were admitted (see that system's own schedule
 * docblock). So there is no earlier point at which the *full* review could
 * show `Medium` without either delaying `High` past that floor — which the
 * ruling forbids — or reaching it early, which would move the very pacing the
 * ruling says is right.
 *
 * A ceiling of `2` is what lets a second, faster check add the missing
 * waypoint without touching either one: capped here, it can raise a prisoner
 * as far as `Medium` **long before** the full review's floor, and it can
 * never write `High` itself, so the full review's own arithmetic, schedule
 * and result at tick 47,999 are exactly what they were before this system
 * existed. It is a floor under how *late* a warning can be, not a ceiling
 * that limits what `reviewClassification` itself can reach.
 */
export const EARLY_WARNING_TIER_CEILING: RiskTier = 2;
