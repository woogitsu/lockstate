import type { EntityId } from '../entity/entity-store';

/**
 * What one prisoner, rather than a sector average, is close to doing
 * ([ADR 0061](../../../docs/adr/0061-what-the-prison-produces-on-its-own.md)
 * decisions 3 and 4).
 *
 * ## The reading this exists to add
 *
 * `SectorRiskSample.needsPressure` is a **mean over the sector's occupants**
 * ([ADR 0048](../../../docs/adr/0048-what-a-sectors-occupants-are.md) decision
 * 2), and a mean is exactly the wrong instrument for an act one person commits.
 * Eight housed prisoners at 0.48 and one homeless prisoner at 0.95 average to
 * 0.53, which is nowhere near `hotThreshold` -- so a prison that is adequate
 * for almost everybody and intolerable for one person produces nothing at all.
 * That is the gap `'assault'` fills, and it is why the assault trigger reads
 * the individual and the riot trigger reads the mean: they are two different
 * questions about the same state, and neither answer follows from the other.
 *
 * `'escape-attempt'` reads state **neither** of them touches -- how much of a
 * sentence is left, what tier the prisoner is classified at -- so it is not a
 * lower threshold on the same score either. A well-run prison holding
 * long-sentence high-risk prisoners is a real security problem and nothing in
 * the risk model could previously say so.
 *
 * ## Why this is not a dice roll in a costume
 *
 * Every term is state the player moves, and moves by a different lever:
 *
 * | term | what the player does about it |
 * | --- | --- |
 * | `needDeficit` | builds the rooms and objects the six needs are served from |
 * | `contrabandSeverity` | chooses who to admit; searches, when there is a way to order one |
 * | `sentenceRemaining` | chooses who to admit, and for how long |
 * | `riskTier` | chooses who to admit -- and then whether their record gets worse (`ClassificationReviewSystem`) |
 * | `staffingShortfall` | hires |
 *
 * No term is a draw, and nothing here touches an RNG stream at all: both scores
 * are pure weighted sums clamped to [0,1], the same explicit-factor shape as
 * `scoreSectorRisk`, `resolveDetectionProbability` and
 * `resolveEscapeOpportunity`.
 *
 * ## Why neither score keeps a sustained window, when the riot's does
 *
 * `SectorRiskTracker` exists because `scoreSectorRisk`'s inputs include a term
 * that can change in one tick -- `staffingShortfall` moves the moment a guard
 * is posted or a sixteenth prisoner arrives -- so a single sample says nothing
 * about whether conditions are actually bad. Twelve consecutive hot samples do.
 *
 * The dominant term in both scores here cannot do that. `needDeficit` is a mean
 * over `NEED_IDS` of levels that decay between 0.01 and 0.08 of 255 per tick
 * (`NEED_DECAY_PER_TICK`), so moving one prisoner's mean deficit by a tenth
 * takes on the order of a thousand ticks even with every need decaying at once;
 * `sentenceRemaining` moves by one tick per tick; and `riskTier` is rewritten
 * once every 24,000 ticks by `ClassificationReviewSystem`. A spike is not
 * available to them. The aggregation these triggers need is therefore the one
 * they already have -- `IncidentTriggerSystem`'s per-type quiet period, which
 * bounds the *rate* -- and adding a second streak per sector per type would be
 * persisted state bought for a hazard the arithmetic rules out.
 *
 * `staffingShortfall` is in both scores and *is* fast-moving, which is the one
 * exception and it is a deliberate one: hiring a guard should take effect on
 * the next sampling point rather than twelve of them later. It cannot fire
 * either trigger on its own -- its weight is below both thresholds -- so the
 * fastest thing it can do is remove a condition, which is feedback rather than
 * oscillation.
 */

/** One occupant's individual pressures, all normalised to 0-1 except the tier. Read from real components by the session's sampler; nothing here knows where they come from. */
export interface PrisonerFlashpoint {
  readonly entityId: EntityId;
  /** Mean unmet-need deficit over `NEED_IDS` for this prisoner alone, 0 (all served) to 1 (all on the floor). */
  readonly needDeficit: number;
  /** Worst authored `severity` among the contraband this prisoner is concealing, scaled to 0-1. `0` for a prisoner carrying nothing. */
  readonly contrabandSeverity: number;
  /** Share of this prisoner's sentence still to serve, 0-1. */
  readonly sentenceRemaining: number;
  /** `PrisonerRecordComponent.riskTier`, 0 (minimal) to 3 (high risk). */
  readonly riskTier: number;
}

export interface AssaultPolicy {
  readonly needDeficitWeight: number;
  readonly contrabandSeverityWeight: number;
  readonly staffingShortfallWeight: number;
  /** Score at or above which the prison produces an assault. */
  readonly threshold: number;
}

export interface EscapeAttemptPolicy {
  readonly sentenceRemainingWeight: number;
  readonly contrabandSeverityWeight: number;
  readonly staffingShortfallWeight: number;
  readonly threshold: number;
}

/**
 * The classification an escape attempt requires.
 *
 * `3`, and it is not an arbitrary point on the tier scale: it is exactly where
 * `classificationGroupIdForTier` (`src/simulation/prisoners/classification.ts`)
 * stops answering `'general-population'` and starts answering `'high-risk'`.
 * ADR 0032 decision 3 makes the four-value tier and the two-value regime group
 * two axes rather than one, and the group is the coarse line the prison already
 * draws about who somebody is -- so gating on it reads a distinction the model
 * has instead of inventing a threshold.
 *
 * Written as a tier rather than as the group id so `incidents/` need not import
 * the prisoner slice's content vocabulary for one comparison;
 * `tests/unit/incident-flashpoint.test.ts` pins the two against each other so
 * the copy cannot drift.
 */
export const ESCAPE_ATTEMPT_MINIMUM_RISK_TIER = 3;

/**
 * Directional defaults, not a committed balance decision -- the standing
 * `DEFAULT_SECTOR_RISK_POLICY` carries, and issue #28 puts final balance out of
 * scope.
 *
 * ## The score is the sector's score, asked about one person
 *
 * `needDeficitWeight: 1` is `needsPressureWeight` and
 * `staffingShortfallWeight: 0.3` is itself, both copied deliberately: a prison
 * has one weight for "how much unmet need counts" and one for "how much being
 * unguarded counts", and two sets of dials somebody has to keep in step is how
 * they come to disagree. What is left is one number this policy owns -- what
 * contraband in a prisoner's hands is worth -- standing in for the sector
 * score's `contrabandPressure`, which is suspicion about a place rather than
 * an item in a hand.
 *
 * ## The threshold is the sector's too, and the separation is structural
 *
 * `threshold: 0.65` is `hotThreshold`. All three numbers are the sector's, and
 * the whole score is therefore *the sector's own judgement asked about one
 * person instead of about the average*.
 *
 * That only works because the two producers are separated somewhere other than
 * in their numbers. `IncidentTriggerSystem.tryOpenAssault` will not open one in
 * a sector whose hot streak is non-zero, and the gate is not tidiness: **with
 * the same weights and the same line, the assault front-ran the riot
 * everywhere.** Any prison whose mean is hot has individuals who are hot, the
 * riot needs twelve consecutive hot samples and the assault needs none, so the
 * assault fired first and took the sector's one open incident slot every time.
 * Measured on this tree: `tests/integration/riot-regime-loop.test.ts`'s
 * two-prisoner neglected prison produced an assault at tick 13,250 -- pressure
 * 0.8009 -- instead of the riot the whole of ADR 0057 is about. A producer that
 * displaces an existing one is not a new mechanic, it is a regression with a
 * new name.
 *
 * Raising this threshold above `hotThreshold` was tried first and is the wrong
 * shape: it makes the separation a matter of degree, so it holds for the
 * prisons somebody measured and fails for the next one. The structural gate
 * holds for every prison, and it says something true in one sentence: *a riot
 * is what a prison does when its conditions are collectively bad; an assault is
 * what happens in a prison that is not having one.*
 *
 * ## The ladder
 *
 * On need deficits this repository has already measured
 * (`tests/integration/room-gated-needs.test.ts`, ADR 0048's rungs, ADR 0057's
 * prison):
 *
 * | prisoner | staffed | unguarded |
 * | --- | --- | --- |
 * | well served (0.10), carrying nothing | 0.10 | 0.40 |
 * | well served, carrying a weapon (severity 9) | 0.46 | 0.76 |
 * | half-built prison (0.38), carrying nothing | 0.38 | 0.68 |
 * | no shower, no yard (0.48), carrying nothing | 0.48 | 0.78 |
 * | no shower, no yard, carrying a tool (6) | 0.72 | 1.00 **fires** |
 * | no shower, no yard, carrying a weapon | 0.84 **fires** | 1.00 **fires** |
 * | no accommodation at all (0.95) | 0.95 **fires** | 1.00 **fires** |
 *
 * Read down the "staffed" column, that is the answer to issue #477 -- *"with
 * one guard, two needs at zero cannot reach the riot threshold, so neglect
 * costs a staffed prison nothing"*. It costs it something now, in two places
 * and neither of them is the riot model: a prisoner the prison never housed is
 * enough on their own, and a prisoner the prison neglected is enough once
 * something serious gets into their hands. The sector score is untouched and
 * still reads 0.4824 in #477's own fixture.
 */
export const DEFAULT_ASSAULT_POLICY: AssaultPolicy = {
  needDeficitWeight: 1,
  contrabandSeverityWeight: 0.4,
  staffingShortfallWeight: 0.3,
  threshold: 0.65,
};

/**
 * Directional defaults -- and **two hard preconditions no weight can make up
 * for**: the prisoner is classified high risk, and they are concealing
 * something (`canAttemptEscape`).
 *
 * ## Reason, means, opportunity -- and why two of them are gates
 *
 * An escape needs a reason to run, the means, and the opportunity. The
 * *sentence* and the *staffing* are weights, because both are matters of
 * degree. The classification and the means are gates, because neither is:
 *
 * - **The classification.** An escape attempt is the one incident type whose
 *   whole content is "this person tried to leave", which is exactly what a
 *   security classification is about -- `DISCIPLINARY_POINTS_BY_INCIDENT_TYPE`
 *   already says so in those words, giving it 3 points where an assault gets 2.
 *   Read as a weight it became a matter of degree, and a prison then lost
 *   prisoners it had never been warned about. As a gate the rule is one
 *   sentence: **a prison loses the people it was told to worry about.** Only a
 *   tier-3 arrival can bring a weapon in either
 *   (`eligibleContrabandCategories`), so the two gates point at the same
 *   person.
 * - **The means.** This model has no perimeter to walk through: ADR 0036 gives
 *   the derived sector **no doors** on the stated grounds that a perimeter "is
 *   the one thing a derivation cannot know", `resolveEscapeOpportunity`
 *   therefore scores 0 for every prison in this repository, and
 *   `TunnelRegistry` has no producer. An escape with no means is the one part
 *   of this that the state genuinely cannot support, and asserting it anyway
 *   would be the costume issue #442 warns about. With the gate, an escape is
 *   always *about* something the prison failed to find -- which is the
 *   substrate issue #27 built and ADR 0061 decision 1 finally feeds.
 *
 * **Both gates were measured into existence.** With the tier and the means as
 * weights, a tier-3 prisoner scored 0.95 in an unguarded prison carrying
 * nothing, and a tier-2 prisoner carrying a tool scored 0.86 -- so escapes
 * fired in `tests/integration/riot-regime-loop.test.ts`'s two-prisoner
 * half-built prison and in `incident-trigger-reachability.test.ts`'s *well-run*
 * one, deleting the subjects of measurements about something else. An escape
 * removes a prisoner from the prison (ADR 0061 decision 5); a producer with
 * that much consequence has to be the rarest thing here, and these two
 * conditions are what make it so.
 *
 * ## The ladder, for a high-risk prisoner who is carrying something
 *
 * | | staffed | unguarded |
 * | --- | --- | --- |
 * | a phone (severity 4), whole sentence left | 0.44 | 0.79 **fires** |
 * | a weapon (9), whole sentence left | 0.615 **fires** | 0.965 **fires** |
 * | a weapon, a third of the sentence left | 0.405 | 0.755 **fires** |
 *
 * So: an unguarded prison loses its high-risk prisoners; a staffed one loses
 * them only if they are armed; and either way a prisoner close to release has
 * less reason to run than one who has just arrived.
 *
 * And tier 3 is not only an intake outcome: `ClassificationReviewSystem` raises
 * a tier from disciplinary findings every 24,000 ticks, so a prison that riots
 * and brawls for ten in-game days manufactures its own escape risks out of
 * prisoners who arrived as nobody in particular. That feedback loop is emergent
 * from systems that already existed and is the reason the gate is a tier rather
 * than a fact about the arrival.
 */
export const DEFAULT_ESCAPE_ATTEMPT_POLICY: EscapeAttemptPolicy = {
  sentenceRemainingWeight: 0.3,
  contrabandSeverityWeight: 0.35,
  staffingShortfallWeight: 0.35,
  threshold: 0.6,
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Pure, explicit-factor, clamped. `staffingShortfall` is the sector's, shared by every occupant of it. */
export function scoreAssaultPressure(
  flashpoint: PrisonerFlashpoint,
  staffingShortfall: number,
  policy: AssaultPolicy = DEFAULT_ASSAULT_POLICY,
): number {
  return clamp01(
    clamp01(flashpoint.needDeficit) * policy.needDeficitWeight +
      clamp01(flashpoint.contrabandSeverity) * policy.contrabandSeverityWeight +
      clamp01(staffingShortfall) * policy.staffingShortfallWeight,
  );
}

/**
 * Whether this prisoner could attempt an escape at all: classified high risk,
 * and carrying something.
 *
 * A predicate rather than two more terms, so the gates are legible at the call
 * site and cannot be satisfied by a high score elsewhere. See
 * `DEFAULT_ESCAPE_ATTEMPT_POLICY` for why each is a condition rather than a
 * weight.
 */
export function canAttemptEscape(flashpoint: PrisonerFlashpoint): boolean {
  return flashpoint.riskTier >= ESCAPE_ATTEMPT_MINIMUM_RISK_TIER && flashpoint.contrabandSeverity > 0;
}

/** Pure, explicit-factor, clamped. Reads no need at all -- see the header: this is a different question, not a weaker one. */
export function scoreEscapeAttemptPressure(
  flashpoint: PrisonerFlashpoint,
  staffingShortfall: number,
  policy: EscapeAttemptPolicy = DEFAULT_ESCAPE_ATTEMPT_POLICY,
): number {
  return clamp01(
    clamp01(flashpoint.sentenceRemaining) * policy.sentenceRemainingWeight +
      clamp01(flashpoint.contrabandSeverity) * policy.contrabandSeverityWeight +
      clamp01(staffingShortfall) * policy.staffingShortfallWeight,
  );
}

/** One prisoner and what they scored, so a caller can record the score as an `IncidentCauseFactor` rather than re-deriving it. */
export interface ScoredFlashpoint {
  readonly entityId: EntityId;
  readonly score: number;
}

/**
 * `flashpoints` scored and ranked: highest score first, ties broken by
 * ascending entity id.
 *
 * The tie-break is load-bearing rather than tidy. Every input is a float and
 * two prisoners in identical circumstances genuinely score identically -- eight
 * arrivals admitted on the same tick into identical cells are the ordinary
 * case, not a contrived one -- so without an explicit second key the choice
 * would fall out of `Array.prototype.sort`'s stability over whatever order the
 * occupant walk produced. That order is already canonical
 * (`resolveSectorOccupants` sorts by entity id), which makes the tie-break
 * agree with it rather than replace it: it is written down so that a future
 * occupancy rule cannot silently change which prisoner is in the incident.
 */
export function rankFlashpoints(
  flashpoints: readonly PrisonerFlashpoint[],
  score: (flashpoint: PrisonerFlashpoint) => number,
): readonly ScoredFlashpoint[] {
  return flashpoints
    .map((flashpoint) => ({ entityId: flashpoint.entityId, score: score(flashpoint) }))
    .sort((left, right) => (left.score !== right.score ? right.score - left.score : left.entityId - right.entityId));
}

/**
 * How many prisoners an assault names.
 *
 * **Two**, and it is the smallest number that is not a lie: an assault is one
 * prisoner acting on another, and `IncidentResponseSystem.lapse` injures every
 * participant -- so an assault naming one person is a prisoner assaulting
 * themselves, and a lapsed one injures the aggressor and not the person they
 * hit.
 *
 * It carries the fidelity limit `buildDisciplinaryIndex` already documents at
 * length and does not make it worse: `IncidentRecord` has no culprit field
 * anywhere in `src/`, `participantIds` means "who was in it", and both
 * participants are therefore charged
 * `DISCIPLINARY_POINTS_BY_INCIDENT_TYPE.assault`. Distinguishing an aggressor
 * from a victim is adjudication, which is issue #80's and needs a command type.
 */
export const ASSAULT_PARTICIPANT_COUNT = 2;

/**
 * The top of the severity band an assault is recorded in.
 *
 * `IncidentRecord.severity` is not a description, it is an input:
 * `IncidentResponseSystem` sizes the response from it
 * (`respondersPerSeverityPoint`, 0.5) and locks the whole sector down at
 * `lockdownSeverityThreshold`, which is 6. So scoring an assault on the same
 * 0-10 scale as a riot says two things about a fistfight that are not true --
 * that it needs five guards, and that it justifies sealing every door in the
 * prison.
 *
 * **Measured, before this constant existed.** A four-cell prison holding
 * sixteen prisoners with six guards on the payroll produced eleven assaults at
 * severities 7 to 10; two were contained and nine lapsed, because a severity-10
 * response wants five responders and the deployment requirement had already
 * taken two of the six. Every riot in the same run was contained. The prison was
 * losing fights it had the staff to stop, on a number that meant nothing.
 *
 * `5` is therefore the ceiling, one below the lockdown threshold, and the score
 * is *scaled* into `1..5` rather than clamped at it -- clamping would have made
 * every assault severity 5 and thrown away the gradation the score has. A
 * threshold-grazing assault is severity 3 and asks for two guards; the worst
 * possible one is severity 5 and asks for three.
 *
 * The riot keeps the full range, and the escape attempt does too: an escape is
 * exactly the incident a lockdown is *for*, so it is allowed to reach the
 * threshold that applies one.
 */
export const ASSAULT_SEVERITY_CEILING = 5;
