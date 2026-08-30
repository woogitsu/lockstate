import { describe, expect, it } from 'vitest';
import { ComponentBitset } from '../../src/simulation/entity/component';
import { EntityStore } from '../../src/simulation/entity/entity-store';
import { EntityQuery } from '../../src/simulation/entity/query';
import { Kernel } from '../../src/simulation/kernel/kernel';
import type { ConfiscationEvent } from '../../src/simulation/contraband/confiscation';
import { IncidentLog, type IncidentRecord } from '../../src/simulation/incidents/incident';
import {
  CLASSIFICATION_REVIEW_INTERVAL_TICKS,
  CLEAN_CONDUCT_CREDIT_PERIOD_TICKS,
  MAX_CLEAN_CONDUCT_CREDIT,
  MAX_FINDINGS_TERM,
  classificationGroupIdForTier,
  reviewClassification,
} from '../../src/simulation/prisoners/classification';
import { ClassificationReviewSystem, classifiedAtTickOf } from '../../src/simulation/prisoners/classification-review-system';
import { MAX_SENTENCE_LENGTH_TICKS, PrisonerRecordComponent, intakeStageIndex } from '../../src/simulation/prisoners/components';
import type { DisciplinaryEvidenceSource } from '../../src/simulation/prisoners/disciplinary-record';
import { MAX_SENTENCE_LENGTH_TICKS_DRAWN, MIN_SENTENCE_LENGTH_TICKS } from '../../src/simulation/prisoners/sentence';

/**
 * The scored, reviewable classification issues #78 and #80 ask for
 * ([ADR 0032](../../docs/adr/0032-incident-consequences-and-classification-review.md)).
 *
 * `reviewClassification` is pure, so it is asserted directly rather than
 * through a session; `tests/integration/incident-consequence-loop.test.ts` is
 * the end-to-end half and is the file whose red proof on `origin/main` matters.
 */

const SHORT_SENTENCE = 10_000;
const LONG_SENTENCE = 200_000;
const CLASSIFIED_AT = 1_000;

function assess(overrides: Partial<Parameters<typeof reviewClassification>[0]> = {}) {
  return reviewClassification({
    sentenceLengthTicks: SHORT_SENTENCE,
    priorIncidentsAtIntake: 0,
    classifiedAtTick: CLASSIFIED_AT,
    tick: CLASSIFIED_AT + CLASSIFICATION_REVIEW_INTERVAL_TICKS,
    ...overrides,
  });
}

describe('reviewClassification: named factors that sum to a tier', () => {
  it('reports factors that sum to exactly the score it reports', () => {
    // The property that makes the object an explanation rather than a
    // decoration: a panel that renders the four factors and the total must not
    // be able to show four numbers that do not add up.
    for (const priors of [0, 1, 2, 255]) {
      for (const points of [0, 1, 3, 99]) {
        for (const elapsed of [0, CLEAN_CONDUCT_CREDIT_PERIOD_TICKS, 9 * CLEAN_CONDUCT_CREDIT_PERIOD_TICKS]) {
          const result = assess({
            priorIncidentsAtIntake: priors,
            sentenceLengthTicks: LONG_SENTENCE,
            tick: CLASSIFIED_AT + elapsed,
            disciplinary: { points, findingCount: 1, lastFindingTick: CLASSIFIED_AT },
          });
          const { sentence, intakeHistory, findings, cleanConduct } = result.factors;
          expect(sentence + intakeHistory + findings + cleanConduct, JSON.stringify(result)).toBe(result.score);
          expect(result.riskTier).toBe(Math.max(0, Math.min(3, result.score)));
        }
      }
    }
  });

  it('weighs sentence length and intake history exactly as the intake classifier does', () => {
    // Not a new opinion about who is dangerous: a review that re-decided the
    // two terms intake already weighed would move every prisoner's tier at
    // their first review for reasons that have nothing to do with conduct.
    expect(assess({ sentenceLengthTicks: LONG_SENTENCE - 1, tick: CLASSIFIED_AT }).factors.sentence).toBe(0);
    expect(assess({ sentenceLengthTicks: LONG_SENTENCE, tick: CLASSIFIED_AT }).factors.sentence).toBe(1);
    expect(assess({ priorIncidentsAtIntake: 0, tick: CLASSIFIED_AT }).factors.intakeHistory).toBe(0);
    expect(assess({ priorIncidentsAtIntake: 1, tick: CLASSIFIED_AT }).factors.intakeHistory).toBe(1);
    expect(assess({ priorIncidentsAtIntake: 2, tick: CLASSIFIED_AT }).factors.intakeHistory).toBe(2);
    // Saturating, exactly as `classifyPrisoner`'s `min(2, max(0, n))` does:
    // 255 is the top of the `Uint8Array` slot and of the command schema.
    expect(assess({ priorIncidentsAtIntake: 255, tick: CLASSIFIED_AT }).factors.intakeHistory).toBe(2);
  });

  it('caps the findings term, so a long record is not permanently un-redeemable', () => {
    expect(assess({ tick: CLASSIFIED_AT, disciplinary: { points: 3, findingCount: 1, lastFindingTick: CLASSIFIED_AT } }).factors.findings).toBe(3);
    expect(assess({ tick: CLASSIFIED_AT, disciplinary: { points: 99, findingCount: 30, lastFindingTick: CLASSIFIED_AT } }).factors.findings).toBe(MAX_FINDINGS_TERM);
  });

  it('credits one point per clean period since the last finding, up to the cap', () => {
    const withFinding = (elapsed: number) =>
      assess({
        tick: CLASSIFIED_AT + elapsed,
        disciplinary: { points: 3, findingCount: 1, lastFindingTick: CLASSIFIED_AT },
      }).factors.cleanConduct;

    expect(withFinding(0)).toBe(0);
    expect(withFinding(CLEAN_CONDUCT_CREDIT_PERIOD_TICKS - 1)).toBe(0);
    expect(withFinding(CLEAN_CONDUCT_CREDIT_PERIOD_TICKS)).toBe(-1);
    expect(withFinding(2 * CLEAN_CONDUCT_CREDIT_PERIOD_TICKS)).toBe(-2);
    expect(withFinding(50 * CLEAN_CONDUCT_CREDIT_PERIOD_TICKS)).toBe(-MAX_CLEAN_CONDUCT_CREDIT);
  });

  it('runs the clean clock from classification for a prisoner who has never had a finding', () => {
    // Otherwise "no finding ever" would be a special case with no clock at
    // all, and time served would count for nothing until the first offence.
    expect(assess({ tick: CLASSIFIED_AT }).factors.cleanConduct).toBe(0);
    expect(assess({ tick: CLASSIFIED_AT + CLEAN_CONDUCT_CREDIT_PERIOD_TICKS }).factors.cleanConduct).toBe(-1);
  });

  it('does not credit a penalty for a finding dated after the tick being reviewed', () => {
    // Reachable from a restored log whose evidence outlives the tick it was
    // restored to. Without the clamp the elapsed time is negative and
    // `Math.floor` of a negative quotient makes the credit *positive*, which
    // would push the tier up for a finding that has not happened yet.
    const result = assess({ tick: CLASSIFIED_AT, disciplinary: { points: 0, findingCount: 1, lastFindingTick: CLASSIFIED_AT + 10 * CLEAN_CONDUCT_CREDIT_PERIOD_TICKS } });
    expect(result.factors.cleanConduct).toBe(0);
    expect(result.score).toBe(0);
  });

  it('moves in both directions from one riot, and settles one tier above clean', () => {
    // The worked example the ADR records, as a trajectory rather than a point.
    // A short sentence, no priors, one lapsed riot worth 3 points at the cap.
    const trajectory = [0, 1, 2, 3, 4].map(
      (periods) =>
        assess({
          tick: CLASSIFIED_AT + periods * CLEAN_CONDUCT_CREDIT_PERIOD_TICKS,
          disciplinary: { points: 3, findingCount: 1, lastFindingTick: CLASSIFIED_AT },
        }).riskTier,
    );
    expect(trajectory).toEqual([3, 2, 1, 1, 1]);
  });

  it('is idempotent: the same inputs give the same answer however often it is asked', () => {
    const input = {
      sentenceLengthTicks: LONG_SENTENCE,
      priorIncidentsAtIntake: 1,
      classifiedAtTick: CLASSIFIED_AT,
      tick: CLASSIFIED_AT + 3 * CLASSIFICATION_REVIEW_INTERVAL_TICKS,
      disciplinary: { points: 2, findingCount: 1, lastFindingTick: CLASSIFIED_AT + 100 },
    };
    const first = reviewClassification(input);
    for (let again = 0; again < 5; again += 1) expect(reviewClassification(input)).toEqual(first);
  });

  it('derives the group from the tier through the one definition intake uses', () => {
    for (const tier of [0, 1, 2, 3] as const) {
      expect(classificationGroupIdForTier(tier)).toBe(tier >= 3 ? 'high-risk' : 'general-population');
    }
    expect(assess({ tick: CLASSIFIED_AT, disciplinary: { points: 3, findingCount: 1, lastFindingTick: CLASSIFIED_AT } }).classificationGroupId).toBe('high-risk');
    expect(assess({ tick: CLASSIFIED_AT }).classificationGroupId).toBe('general-population');
  });
});

describe('classifiedAtTickOf: the classification tick, recovered from two persisted fields', () => {
  it('is the difference between the sentence end and the sentence length', () => {
    // `IntakeSystem` writes `sentenceEndTick = tick + sentenceLengthTicks` at
    // the `'classification'` stage. This is that arithmetic run backwards, and
    // it is why no new persisted field is needed.
    expect(classifiedAtTickOf(11_215, 10_000)).toBe(1_215);
    expect(classifiedAtTickOf(10_000, 10_000)).toBe(0);
  });

  it('refuses to guess when the stored sum wrapped', () => {
    // `sentenceEndTick` is a `Uint32Array` slot and `admitPrisonerSchema`
    // permits a sentence of `MAX_SENTENCE_LENGTH_TICKS`, so the sum wraps for a
    // long enough sentence and the difference stops being the classification
    // tick. Measured through the real component rather than argued: the write
    // is what wraps.
    const records = new PrisonerRecordComponent(1);
    records.sentenceLengthTicks[0] = MAX_SENTENCE_LENGTH_TICKS;
    records.sentenceEndTick[0] = 500 + MAX_SENTENCE_LENGTH_TICKS;
    expect(records.sentenceEndTick[0]).toBe(499); // wrapped, and not 4,295,467,795
    expect(classifiedAtTickOf(records.sentenceEndTick[0]!, records.sentenceLengthTicks[0]!)).toBeUndefined();
  });
});

// --- The system ----------------------------------------------------------

const PRISONER_COMPONENT_ID = 0;

interface Fixture {
  readonly store: EntityStore;
  readonly records: PrisonerRecordComponent;
  readonly system: ClassificationReviewSystem;
  readonly kernel: Kernel;
  admit(options: { readonly sentenceLengthTicks?: number; readonly priorIncidentsAtIntake?: number; readonly riskTier: number; readonly classifiedAtTick: number; readonly stage?: 'accommodation-assignment' | 'completed' | 'queued' | 'failed' }): number;
}

function fixture(evidence?: DisciplinaryEvidenceSource): Fixture {
  const store = new EntityStore(8);
  const bitset = new ComponentBitset(8);
  const query = new EntityQuery(store, bitset);
  query.mask.require(PRISONER_COMPONENT_ID);
  const records = new PrisonerRecordComponent(8);
  const system = new ClassificationReviewSystem(store, query, records, evidence);
  const kernel = new Kernel(0, 0);
  kernel.registerSystem(system);

  return {
    store,
    records,
    system,
    kernel,
    admit(options) {
      const entityId = store.spawn();
      const index = store.getIndex(entityId);
      bitset.add(index, PRISONER_COMPONENT_ID);
      records.reset(index);
      const sentence = options.sentenceLengthTicks ?? SHORT_SENTENCE;
      records.sentenceLengthTicks[index] = sentence;
      records.priorIncidentsAtIntake[index] = options.priorIncidentsAtIntake ?? 0;
      // The same relation `IntakeSystem` writes, so the fixture cannot disagree
      // with the simulation about what a classification tick is.
      records.sentenceEndTick[index] = options.classifiedAtTick + sentence;
      records.riskTier[index] = options.riskTier;
      records.intakeStage[index] = intakeStageIndex(options.stage ?? 'completed');
      return entityId;
    },
  };
}

function stepTo(kernel: Kernel, tick: number): void {
  while (kernel.tick < tick) kernel.step();
}

function evidenceOf(incidents: readonly IncidentRecord[], confiscations: readonly ConfiscationEvent[] = []): DisciplinaryEvidenceSource {
  return { incidents: () => incidents, confiscations: () => confiscations };
}

function lapsedRiot(participantIds: readonly number[], startedAtTick: number, endedAtTick: number): IncidentRecord {
  const log = new IncidentLog();
  log.open({ id: 'i', type: 'riot', sectorId: 's', participantIds, severity: 6, causeFactors: [] }, startedAtTick);
  log.transition('i', 'lapsed', endedAtTick, { injuredEntityIds: [...participantIds], propertyDamage: 6, escaped: false });
  return log.get('i')!;
}

describe('ClassificationReviewSystem', () => {
  it('leaves a prisoner alone until they have served a full review period', () => {
    const f = fixture();
    const entityId = f.admit({ riskTier: 2, classifiedAtTick: 10 });
    const index = f.store.getIndex(entityId);

    // Fires at 23,999 and finds them 10 ticks short of due.
    stepTo(f.kernel, CLASSIFICATION_REVIEW_INTERVAL_TICKS);
    expect(f.records.riskTier[index]).toBe(2);
    expect(f.system.getMetrics().reviewsCompleted).toBe(0);

    // Fires at 47,999, and now they are.
    stepTo(f.kernel, 2 * CLASSIFICATION_REVIEW_INTERVAL_TICKS);
    expect(f.system.getMetrics().reviewsCompleted).toBe(1);
    expect(f.records.riskTier[index]).toBe(0);
  });

  it('cannot review anybody on its first scheduled run, whatever tick they were classified at', () => {
    // The `schedule` comment used to justify `phaseTicks: 23,999` as avoiding
    // an empty first run. It does not: eligibility needs
    // `tick - classifiedAt >= 24,000` and `classifiedAtTickOf` never returns a
    // negative, so at tick 23,999 the largest tenure anybody can hold is
    // 23,999. The extremal case is a prisoner classified at tick 0, who holds
    // exactly that -- if any classification tick could be reviewed on the first
    // run, this is the one, and it is not.
    const f = fixture();
    const entityId = f.admit({ riskTier: 3, classifiedAtTick: 0 });

    stepTo(f.kernel, CLASSIFICATION_REVIEW_INTERVAL_TICKS);
    expect(f.system.getMetrics().reviewsCompleted, 'the run at 23,999 is empty by arithmetic, not by circumstance').toBe(0);
    expect(f.records.riskTier[f.store.getIndex(entityId)]).toBe(3);

    // One tick of tenure short is the whole of it: the next scheduled run does
    // review them, so this is a claim about the phase and not about the record.
    stepTo(f.kernel, 2 * CLASSIFICATION_REVIEW_INTERVAL_TICKS);
    expect(f.system.getMetrics().reviewsCompleted).toBe(1);
  });

  it('reviews a prisoner whose elapsed time is exactly one period, not one tick more', () => {
    // The boundary the `<` in `update` decides, and it was unguarded until
    // #593's re-range made a review something most prisoners actually reach.
    // Reachable only from one arrival tick per period: the schedule fires at
    // ticks congruent to 23,999 modulo 24,000, so `tick - classifiedAt` is
    // exactly `CLASSIFICATION_REVIEW_INTERVAL_TICKS` only for a prisoner
    // classified at 23,999. Every other case in this file is strictly inside or
    // strictly outside the window, so `<` and `<=` are indistinguishable in all
    // of them -- which is what a mutation run showed before this case existed.
    const f = fixture();
    const entityId = f.admit({ riskTier: 2, classifiedAtTick: CLASSIFICATION_REVIEW_INTERVAL_TICKS - 1 });
    const index = f.store.getIndex(entityId);

    // Fires at 23,999, when the prisoner has been classified for 0 ticks.
    stepTo(f.kernel, CLASSIFICATION_REVIEW_INTERVAL_TICKS);
    expect(f.system.getMetrics().reviewsCompleted).toBe(0);

    // Fires at 47,999: 47,999 - 23,999 = 24,000, exactly one period. "Served a
    // full review period" includes the tick the period ends on.
    stepTo(f.kernel, 2 * CLASSIFICATION_REVIEW_INTERVAL_TICKS);
    expect(f.system.getMetrics().reviewsCompleted).toBe(1);
    expect(f.records.riskTier[index]).toBe(0);
  });

  it('never reviews a prisoner who has not been classified, or one who failed', () => {
    // `'queued'` still holds the zero a fresh slot has, which decodes as a
    // classified general-population tier-0 prisoner -- the same trap
    // `prisoner-projection.ts` reports `classified: false` to avoid.
    // `'failed'` is terminal and inert (ADR 0028 decision 8), so a tier
    // written there could never reach a regime or a placement.
    for (const stage of ['queued', 'failed'] as const) {
      const f = fixture();
      const entityId = f.admit({ riskTier: 3, classifiedAtTick: 0, stage });
      stepTo(f.kernel, 2 * CLASSIFICATION_REVIEW_INTERVAL_TICKS);
      expect(f.records.riskTier[f.store.getIndex(entityId)], stage).toBe(3);
      expect(f.system.getMetrics().reviewsCompleted, stage).toBe(0);
    }
  });

  it('counts a rise, a fall and a change of regime separately', () => {
    const riser = 0;
    // The riot ends at 40,000, so at the 47,999 review the finding is 7,999
    // ticks old -- inside the first credit period, so the full 3 points stand.
    const f = fixture(evidenceOf([lapsedRiot([riser], 39_900, 40_000)]));
    // `riser` is entity id 0 by construction: it is the first spawn.
    expect(f.admit({ riskTier: 0, classifiedAtTick: 0 })).toBe(riser);
    // A second prisoner with a clean record and no reason to move: tier 0 in,
    // tier 0 out, so it must not be counted as a review that changed anything.
    f.admit({ riskTier: 0, classifiedAtTick: 0 });

    stepTo(f.kernel, 2 * CLASSIFICATION_REVIEW_INTERVAL_TICKS);
    expect(f.system.getMetrics()).toEqual({ reviewsCompleted: 2, tierIncreases: 1, tierDecreases: 0, groupChanges: 1 });
    expect(f.records.riskTier[f.store.getIndex(riser)]).toBe(3);

    // Two more reviews later the finding is over two credit periods old and the
    // rioter is back in general population -- a second group change, in the
    // other direction, which is the half issue #80 insists on.
    stepTo(f.kernel, 4 * CLASSIFICATION_REVIEW_INTERVAL_TICKS);
    const metrics = f.system.getMetrics();
    expect(metrics.tierDecreases).toBeGreaterThan(0);
    expect(metrics.groupChanges).toBe(2);
    expect(f.records.riskTier[f.store.getIndex(riser)]).toBe(1);
  });

  it('takes no RNG draw, so an admission after a review classifies as it would have before one', () => {
    // The hazard this rules out is specific: a draw here would advance
    // `prisoners.classification` on a tick that has nothing to do with an
    // admission, shifting the tier of every prisoner admitted afterwards. The
    // kernel is built with no streams registered at all, so any draw throws.
    const f = fixture(evidenceOf([lapsedRiot([0], 100, 200)]));
    f.admit({ riskTier: 0, classifiedAtTick: 0 });
    expect(() => stepTo(f.kernel, 2 * CLASSIFICATION_REVIEW_INTERVAL_TICKS)).not.toThrow();
    expect(f.system.getMetrics().reviewsCompleted).toBe(1);
  });

  it('answers what a review would decide without writing anything', () => {
    const f = fixture(evidenceOf([lapsedRiot([0], 100, 200)]));
    const entityId = f.admit({ riskTier: 0, classifiedAtTick: 0 });
    const index = f.store.getIndex(entityId);

    // 0 (short sentence) + 0 (no priors) + 3 (findings, capped) - 1 (the
    // finding is 29,800 ticks old, one whole credit period) = 2.
    const assessment = f.system.assess(entityId, 30_000);
    expect(assessment?.riskTier).toBe(2);
    expect(assessment?.score).toBe(2);
    expect(assessment?.factors).toEqual({ sentence: 0, intakeHistory: 0, findings: 3, cleanConduct: -1 });
    // Read-only: the record is still the tier intake wrote.
    expect(f.records.riskTier[index]).toBe(0);
    expect(f.system.getMetrics().reviewsCompleted).toBe(0);
  });

  it('has nothing to say about an id that is not alive', () => {
    const f = fixture();
    const entityId = f.admit({ riskTier: 1, classifiedAtTick: 0 });
    f.store.destroy(entityId);
    expect(f.system.assess(entityId, 30_000)).toBeUndefined();
  });

  it('reviews against a clean record when no evidence source is wired', () => {
    // A scenario or test with no incident pipeline must not throw, and must
    // still see a tier move: clean-conduct credit needs no evidence to accrue.
    const f = fixture();
    const entityId = f.admit({ riskTier: 3, classifiedAtTick: 0, sentenceLengthTicks: LONG_SENTENCE, priorIncidentsAtIntake: 2 });
    stepTo(f.kernel, 2 * CLASSIFICATION_REVIEW_INTERVAL_TICKS);
    // At tick 47,999, classified at 0: 47,999 clean ticks is one whole credit
    // period and not two, so 1 (long sentence) + 2 (priors) + 0 - 1 = 2.
    expect(f.records.riskTier[f.store.getIndex(entityId)]).toBe(2);

    // And one more review later, two periods have elapsed and the credit caps.
    stepTo(f.kernel, 3 * CLASSIFICATION_REVIEW_INTERVAL_TICKS);
    expect(f.records.riskTier[f.store.getIndex(entityId)]).toBe(1);
  });
});

// --- How much of a sentence a review actually reaches ----------------------

/**
 * **The measurement the owner's ruling on
 * [#593](https://github.com/matmaxalez/lockstate/issues/593) was taken to
 * change**, run against the real system rather than derived on paper.
 *
 * The schedule is global -- `intervalTicks: 24,000`, `phaseTicks: 23,999`, so
 * it fires at every tick congruent to 23,999 modulo 24,000 -- while
 * eligibility is per record: `tick - classifiedAt >= 24,000`. A prisoner
 * classified at `c` with sentence `s` is reviewed only if a scheduled tick
 * falls in `[c + 24,000, c + s]`, which is a window of `s - 24,000 + 1` ticks
 * (inclusive at both ends because `PrisonerDischargeSystem` is order 65 and
 * this system is order 55, so the review at the discharge tick happens first).
 * **The two only coincide for whoever arrives first**, which is what made the
 * arithmetic easy to get wrong before it was measured.
 *
 * Nothing below re-implements that rule: the system decides, and each
 * prisoner's reviews are counted by writing an out-of-range marker into
 * `riskTier` and watching the system overwrite it with a legal tier, restoring
 * the marker each time so a second review is counted as well as a first.
 * Detection is driven by the system's own `reviewsCompleted` metric changing,
 * so the schedule is not assumed here either.
 */
describe('how many reviews a sentence actually reaches', () => {
  const PRISONER_COMPONENT = 0;
  /** Outside `RiskTier`'s `0..3`, so "the system wrote a tier here" is unambiguous. */
  const NOT_YET_REVIEWED = 200;
  const PHASE_STEP = 2_400;

  /** The old range's floor and ceiling, and the new range's, as literals. */
  const OLD_MIN = 4_800;
  const OLD_MAX = 38_400;

  interface Member {
    readonly sentence: number;
    readonly classifiedAtTick: number;
    readonly index: number;
    reviews: number;
  }

  function reviewCounts(sentences: readonly number[]): Map<number, readonly number[]> {
    const phases: number[] = [];
    for (let phase = 0; phase < CLASSIFICATION_REVIEW_INTERVAL_TICKS; phase += PHASE_STEP) phases.push(phase);

    const capacity = 1 << Math.ceil(Math.log2(sentences.length * phases.length + 2));
    const store = new EntityStore(capacity);
    const bitset = new ComponentBitset(capacity);
    const query = new EntityQuery(store, bitset);
    query.mask.require(PRISONER_COMPONENT);
    const records = new PrisonerRecordComponent(capacity);
    const system = new ClassificationReviewSystem(store, query, records);
    const kernel = new Kernel(0, 0);
    kernel.registerSystem(system);

    const cohort: Member[] = [];
    const expireAt = new Map<number, Member[]>();
    for (const sentence of sentences) {
      for (const classifiedAtTick of phases) {
        const index = store.getIndex(store.spawn());
        bitset.add(index, PRISONER_COMPONENT);
        records.reset(index);
        records.sentenceLengthTicks[index] = sentence;
        records.priorIncidentsAtIntake[index] = 0;
        // The relation `IntakeSystem` writes, so the fixture cannot disagree
        // with the simulation about what a classification tick is.
        records.sentenceEndTick[index] = classifiedAtTick + sentence;
        records.riskTier[index] = NOT_YET_REVIEWED;
        records.intakeStage[index] = intakeStageIndex('completed');
        const member: Member = { sentence, classifiedAtTick, index, reviews: 0 };
        cohort.push(member);
        const end = classifiedAtTick + sentence;
        if (!expireAt.has(end)) expireAt.set(end, []);
        expireAt.get(end)!.push(member);
      }
    }

    // `'failed'` is a stage `REVIEWABLE_STAGES` excludes, so it stands in for
    // the discharge that removes the prisoner one order later.
    const discharged = intakeStageIndex('failed');
    const lastTick = Math.max(...cohort.map((member) => member.classifiedAtTick + member.sentence));
    let seen = 0;
    for (let tick = 0; tick <= lastTick; tick += 1) {
      kernel.step();
      if (system.getMetrics().reviewsCompleted !== seen) {
        seen = system.getMetrics().reviewsCompleted;
        for (const member of cohort) {
          if (records.riskTier[member.index] !== NOT_YET_REVIEWED) {
            member.reviews += 1;
            records.riskTier[member.index] = NOT_YET_REVIEWED;
          }
        }
      }
      for (const member of expireAt.get(tick) ?? []) records.intakeStage[member.index] = discharged;
    }

    const byLength = new Map<number, readonly number[]>();
    for (const sentence of sentences) byLength.set(sentence, cohort.filter((m) => m.sentence === sentence).map((m) => m.reviews));
    return byLength;
  }

  it('reaches no sentence the old range could draw, and every sentence the new one can', () => {
    const counts = reviewCounts([OLD_MIN, 24_000, OLD_MAX, MIN_SENTENCE_LENGTH_TICKS, 45_600, 48_000, 72_000, MAX_SENTENCE_LENGTH_TICKS_DRAWN]);
    const reaching = (sentence: number, atLeast: number): number => counts.get(sentence)!.filter((n) => n >= atLeast).length;
    const phases = counts.get(OLD_MIN)!.length;
    expect(phases).toBe(10);

    // The old range's floor, and a sentence of exactly one review interval:
    // no phase of arrival reaches a review, at all.
    expect(reaching(OLD_MIN, 1)).toBe(0);
    expect(reaching(24_000, 1)).toBe(0);
    // The old range's ceiling reached one only 6 arrivals in 10 -- which is the
    // best any sentence the game used to draw could do.
    expect(reaching(OLD_MAX, 1)).toBe(6);
    expect(reaching(OLD_MAX, 2)).toBe(0);

    // The new range's floor. Possible for the first time -- but not certain,
    // because the schedule is global: 14 in-game days leaves a 9,601-tick
    // window inside a 24,000-tick period.
    expect(reaching(MIN_SENTENCE_LENGTH_TICKS, 1)).toBe(4);
    // 19 days, the last length that is still a lottery.
    expect(reaching(45_600, 1)).toBe(9);
    // 20 days: the window is a whole period, so every arrival is reviewed
    // whatever tick it arrives on.
    expect(reaching(48_000, 1)).toBe(phases);
    // 30 days: two whole periods, so every arrival is reviewed twice.
    expect(reaching(72_000, 2)).toBe(phases);
    // The top of the range gets eight.
    expect(counts.get(MAX_SENTENCE_LENGTH_TICKS_DRAWN)!.every((n) => n === 8)).toBe(true);
  });
});
