import { describe, expect, it } from 'vitest';
import {
  ASSAULT_PARTICIPANT_COUNT,
  ASSAULT_SEVERITY_CEILING,
  DEFAULT_ASSAULT_POLICY,
  DEFAULT_ESCAPE_ATTEMPT_POLICY,
  ESCAPE_ATTEMPT_MINIMUM_RISK_TIER,
  canAttemptEscape,
  rankFlashpoints,
  scoreAssaultPressure,
  scoreEscapeAttemptPressure,
  type PrisonerFlashpoint,
} from '../../src/simulation/incidents/flashpoint';
import { DEFAULT_SECTOR_RISK_POLICY } from '../../src/simulation/incidents/sector-risk';
import { DEFAULT_INCIDENT_RESPONSE_POLICY } from '../../src/simulation/incidents/response-system';
import { classificationGroupIdForTier } from '../../src/simulation/prisoners/classification';

/**
 * **What one prisoner, rather than a sector average, is close to doing**
 * ([ADR 0061](../../docs/adr/0061-what-the-prison-produces-on-its-own.md)
 * decisions 3 and 4).
 *
 * The reachability half is `tests/integration/incident-trigger-reachability.test.ts`.
 * This file is the arithmetic and the three relationships that arithmetic has
 * to other modules -- the sector policy it copies its weights from, the
 * classification scale its gate reads, and the response policy its severity
 * ceiling is chosen against. Each of those is a **copied number**, and a copied
 * number that nothing compares is a number that drifts.
 */

function flashpoint(overrides: Partial<PrisonerFlashpoint> = {}): PrisonerFlashpoint {
  return { entityId: 0, needDeficit: 0, contrabandSeverity: 0, sentenceRemaining: 0, riskTier: 0, ...overrides };
}

describe('the assault score is the sector’s score asked about one person', () => {
  /**
   * Three of the four numbers in `DEFAULT_ASSAULT_POLICY` are copies of
   * `DEFAULT_SECTOR_RISK_POLICY`'s, and the copy is the design: a prison has one
   * weight for what unmet need is worth, one for what being unguarded is worth,
   * and one line for "this is bad". Nothing but this assertion stops the two
   * policies being tuned apart by somebody editing one of them.
   */
  it('shares the sector policy’s need weight, staffing weight and threshold', () => {
    expect(DEFAULT_ASSAULT_POLICY.needDeficitWeight).toBe(DEFAULT_SECTOR_RISK_POLICY.needsPressureWeight);
    expect(DEFAULT_ASSAULT_POLICY.staffingShortfallWeight).toBe(DEFAULT_SECTOR_RISK_POLICY.staffingShortfallWeight);
    expect(DEFAULT_ASSAULT_POLICY.threshold).toBe(DEFAULT_SECTOR_RISK_POLICY.hotThreshold);
  });

  it('is a weighted sum of the three terms, clamped', () => {
    // 0.48 * 1 + 0.9 * 0.4 + 0 = 0.84
    expect(scoreAssaultPressure(flashpoint({ needDeficit: 0.48, contrabandSeverity: 0.9 }), 0)).toBeCloseTo(0.84, 10);
    // Every term at its maximum runs over 1 and is clamped rather than trusted.
    expect(scoreAssaultPressure(flashpoint({ needDeficit: 1, contrabandSeverity: 1 }), 1)).toBe(1);
    // And an out-of-range input cannot pull the score below zero.
    expect(scoreAssaultPressure(flashpoint({ needDeficit: -3 }), -3)).toBe(0);
  });

  /** The rungs the policy's own docblock claims, checked against the arithmetic rather than taken on trust. */
  it('leaves a well-served prisoner alone and does not leave an unhoused one alone', () => {
    const wellServed = flashpoint({ needDeficit: 0.1 });
    const neglected = flashpoint({ needDeficit: 0.48 });
    const unhoused = flashpoint({ needDeficit: 0.95 });
    const line = DEFAULT_ASSAULT_POLICY.threshold;

    expect(scoreAssaultPressure(wellServed, 0)).toBeLessThan(line);
    expect(scoreAssaultPressure(wellServed, 1)).toBeLessThan(line);
    expect(scoreAssaultPressure(neglected, 0)).toBeLessThan(line);
    // Neglect plus something worth using is what crosses it in a staffed prison.
    expect(scoreAssaultPressure({ ...neglected, contrabandSeverity: 0.6 }, 0)).toBeGreaterThanOrEqual(line);
    // And being unhoused is enough on its own, however the prison is staffed.
    expect(scoreAssaultPressure(unhoused, 0)).toBeGreaterThanOrEqual(line);
  });
});

describe('the assault severity band', () => {
  /**
   * `IncidentRecord.severity` is an input, not a description:
   * `IncidentResponseSystem` sizes the response from it and locks the sector
   * down at `lockdownSeverityThreshold`. The ceiling exists so that two
   * prisoners fighting never asks for a prison-wide lockdown, and this is the
   * comparison that keeps the two numbers in a relationship rather than merely
   * both being 5 and 6 today.
   */
  it('stays below the severity at which a response locks the sector down', () => {
    expect(ASSAULT_SEVERITY_CEILING).toBeLessThan(DEFAULT_INCIDENT_RESPONSE_POLICY.lockdownSeverityThreshold);
  });

  it('asks for fewer responders than the participants it names is unreasonable', () => {
    // A response sized off the ceiling: `respondersPerSeverityPoint` is 0.5, so
    // the worst possible assault asks for three guards for two prisoners. The
    // pre-ceiling behaviour asked for five, and nine of eleven assaults in a
    // six-guard prison lapsed for want of them.
    const worst = Math.ceil(ASSAULT_SEVERITY_CEILING * DEFAULT_INCIDENT_RESPONSE_POLICY.respondersPerSeverityPoint);
    expect(worst).toBeLessThanOrEqual(ASSAULT_PARTICIPANT_COUNT + 1);
  });
});

describe('an escape attempt is gated, not merely scored', () => {
  /**
   * The gate is written in `incidents/` as a tier so that module need not
   * import the prisoner slice's content vocabulary. This is the assertion that
   * makes the copy safe: the tier it names is exactly the one at which
   * `classificationGroupIdForTier` starts answering `'high-risk'`, so moving
   * either fails here.
   */
  it('reads the tier at which the prison itself starts saying “high risk”', () => {
    expect(classificationGroupIdForTier(ESCAPE_ATTEMPT_MINIMUM_RISK_TIER)).toBe('high-risk');
    expect(classificationGroupIdForTier((ESCAPE_ATTEMPT_MINIMUM_RISK_TIER - 1) as 0 | 1 | 2 | 3)).toBe('general-population');
  });

  it('refuses a prisoner who is not high risk, and one who is carrying nothing', () => {
    expect(canAttemptEscape(flashpoint({ riskTier: 3, contrabandSeverity: 0.4 }))).toBe(true);
    expect(canAttemptEscape(flashpoint({ riskTier: 2, contrabandSeverity: 0.9 }))).toBe(false);
    expect(canAttemptEscape(flashpoint({ riskTier: 3, contrabandSeverity: 0 }))).toBe(false);
  });

  it('scores from the sentence, the means and the staffing, and reads no need at all', () => {
    const base = flashpoint({ riskTier: 3, sentenceRemaining: 1, contrabandSeverity: 0.9 });
    // 1 * 0.3 + 0.9 * 0.35 + 0 = 0.615
    expect(scoreEscapeAttemptPressure(base, 0)).toBeCloseTo(0.615, 10);
    // A prisoner's needs are the assault's subject, not this one's.
    expect(scoreEscapeAttemptPressure({ ...base, needDeficit: 1 }, 0)).toBeCloseTo(scoreEscapeAttemptPressure(base, 0), 10);
  });

  it('lets an unguarded prison lose a high-risk prisoner carrying anything, and a staffed one only an armed one', () => {
    const line = DEFAULT_ESCAPE_ATTEMPT_POLICY.threshold;
    const withPhone = flashpoint({ riskTier: 3, sentenceRemaining: 1, contrabandSeverity: 0.4 });
    const withWeapon = flashpoint({ riskTier: 3, sentenceRemaining: 1, contrabandSeverity: 0.9 });

    expect(scoreEscapeAttemptPressure(withPhone, 0)).toBeLessThan(line);
    expect(scoreEscapeAttemptPressure(withPhone, 1)).toBeGreaterThanOrEqual(line);
    expect(scoreEscapeAttemptPressure(withWeapon, 0)).toBeGreaterThanOrEqual(line);

    // A prisoner near release has less reason to run than one who just arrived.
    expect(scoreEscapeAttemptPressure({ ...withWeapon, sentenceRemaining: 0.3 }, 0)).toBeLessThan(line);
  });
});

describe('ranking is a function of state, never of the walk that produced it', () => {
  it('orders by score descending and breaks ties on ascending entity id', () => {
    const ranked = rankFlashpoints(
      [
        flashpoint({ entityId: 9, needDeficit: 0.5 }),
        flashpoint({ entityId: 3, needDeficit: 0.5 }),
        flashpoint({ entityId: 7, needDeficit: 0.9 }),
      ],
      (candidate) => scoreAssaultPressure(candidate, 0),
    );
    expect(ranked.map((entry) => entry.entityId)).toEqual([7, 3, 9]);
  });

  /**
   * The tie-break is what stops the answer depending on the order the occupant
   * walk happened to produce, and eight prisoners admitted on the same tick into
   * identical cells is the ordinary case rather than a contrived one.
   */
  it('gives the same answer for a reversed input', () => {
    const population = [
      flashpoint({ entityId: 1, needDeficit: 0.7 }),
      flashpoint({ entityId: 2, needDeficit: 0.7 }),
      flashpoint({ entityId: 3, needDeficit: 0.7 }),
    ];
    const score = (candidate: PrisonerFlashpoint): number => scoreAssaultPressure(candidate, 0);
    expect(rankFlashpoints([...population].reverse(), score)).toEqual(rankFlashpoints(population, score));
  });
});
