import { describe, expect, it } from 'vitest';
import {
  applyDefaultGangs,
  CROSS_GANG_ASSAULT_GRUDGE_WEIGHT,
  DEFAULT_GANG_IDS,
  defaultGangIdForArrival,
  recordGrudgeFromAdjudicatedAssault,
} from '../../src/simulation/incidents/default-gangs';
import { GangRegistry, resolveRetaliationRisk } from '../../src/simulation/incidents/gangs';
import { IncidentLog, type IncidentRecord, type IncidentType } from '../../src/simulation/incidents/incident';

/**
 * [ADR 0103](../../docs/adr/0103-what-a-gang-is-and-how-a-grudge-forms.md)
 * decisions 1, 2 and 6 as a unit: what is seeded, who joins, and what one
 * adjudicated cross-gang assault writes.
 *
 * The session-level facts -- that a real prison seeds these two, that a real
 * assault reaches this rule, and that the retaliation then opens -- are
 * `tests/integration/gang-grudge-loop.test.ts`, through the real kernel. This
 * file is about the rule alone.
 */

const SECTOR = 'security-sector.prison';

function assaultRecord(participantIds: readonly number[], instigatorId: number | undefined, type: IncidentType = 'assault'): IncidentRecord {
  const log = new IncidentLog();
  log.open(
    {
      id: 'incident.assault.1',
      type,
      sectorId: SECTOR,
      participantIds,
      severity: 3,
      causeFactors: [],
      ...(instigatorId === undefined ? {} : { instigatorId }),
    },
    100,
  );
  return log.get('incident.assault.1')!;
}

function twoGangsWithMembers(): GangRegistry {
  const gangs = new GangRegistry();
  applyDefaultGangs(gangs, SECTOR);
  gangs.addMember(DEFAULT_GANG_IDS[0], 2);
  gangs.addMember(DEFAULT_GANG_IDS[1], 7);
  return gangs;
}

describe('applyDefaultGangs: decision 1', () => {
  it('seeds exactly two gangs, both claiming the sector it was given', () => {
    const gangs = new GangRegistry();
    applyDefaultGangs(gangs, SECTOR);

    expect(gangs.all()).toEqual([
      { id: 'gang.alpha', territorySectorIds: [SECTOR] },
      { id: 'gang.beta', territorySectorIds: [SECTOR] },
    ]);
    // Context 2: a gang that claims nothing is never selected as `offended`,
    // so "two gangs exist" is not the requirement -- "two gangs claim the
    // watched sector" is.
    expect(gangs.gangsClaiming(SECTOR)).toEqual(['gang.alpha', 'gang.beta']);
  });

  it('is idempotent and payload-wins: a second call adds nothing and overwrites no territory', () => {
    const gangs = new GangRegistry();
    // The shape a restored save leaves behind: `loadSnapshot` has replayed a
    // definition of its own for one of the two ids, with different territory.
    gangs.register({ id: 'gang.alpha', territorySectorIds: ['block-a', 'block-b'] });

    applyDefaultGangs(gangs, SECTOR);
    applyDefaultGangs(gangs, SECTOR);

    expect(gangs.all()).toEqual([
      { id: 'gang.alpha', territorySectorIds: ['block-a', 'block-b'] },
      { id: 'gang.beta', territorySectorIds: [SECTOR] },
    ]);
  });

  it('writes no member, no reputation change and no grudge', () => {
    const gangs = new GangRegistry();
    applyDefaultGangs(gangs, SECTOR);

    expect(DEFAULT_GANG_IDS.map((gangId) => gangs.membersOf(gangId))).toEqual([[], []]);
    expect(gangs.allGrudges()).toEqual([]);
    // `register` sets the starting standing; this asserts the seeding did not
    // also decide a gang was already resented.
    expect(DEFAULT_GANG_IDS.map((gangId) => gangs.getReputation(gangId))).toEqual([0.5, 0.5]);
  });
});

describe('defaultGangIdForArrival: decision 6', () => {
  it('assigns only high-risk arrivals, and alternates the two on entity id parity', () => {
    expect(defaultGangIdForArrival(0, 'high-risk')).toBe('gang.alpha');
    expect(defaultGangIdForArrival(1, 'high-risk')).toBe('gang.beta');
    expect(defaultGangIdForArrival(2, 'high-risk')).toBe('gang.alpha');
    expect(defaultGangIdForArrival(7, 'high-risk')).toBe('gang.beta');

    expect(defaultGangIdForArrival(0, 'general-population')).toBeUndefined();
    expect(defaultGangIdForArrival(1, 'general-population')).toBeUndefined();
  });

  it('splits a run of high-risk arrivals across both gangs rather than filling one', () => {
    const assigned = Array.from({ length: 8 }, (_unused, entityId) => defaultGangIdForArrival(entityId, 'high-risk'));
    expect(assigned.filter((gangId) => gangId === 'gang.alpha')).toHaveLength(4);
    expect(assigned.filter((gangId) => gangId === 'gang.beta')).toHaveLength(4);
  });
});

describe('recordGrudgeFromAdjudicatedAssault: decision 2', () => {
  it('writes both directions at half weight -- ADR 0103 open question 2, answered 2026-09-10', () => {
    const gangs = twoGangsWithMembers();

    const written = recordGrudgeFromAdjudicatedAssault(gangs, assaultRecord([2, 7], 2));

    // Entity 2 is the instigator and is in `gang.alpha`, entity 7 (the victim)
    // is in `gang.beta`. The pair is still named in the return value, but
    // "offended"/"offending" no longer picks a winner: both directional keys
    // get written, each at half the per-assault weight.
    expect(written).toEqual(['gang.beta', 'gang.alpha']);
    expect(gangs.getGrudge('gang.beta', 'gang.alpha')).toBe(CROSS_GANG_ASSAULT_GRUDGE_WEIGHT / 2);
    // The opposite key is NO LONGER untouched -- this is the change the
    // owner's ruling made. Before 2026-09-10 this asserted 0.
    expect(gangs.getGrudge('gang.alpha', 'gang.beta')).toBe(CROSS_GANG_ASSAULT_GRUDGE_WEIGHT / 2);
  });

  it('accumulates identically in both directions, and the second cross-gang assault is what clears the retaliation threshold', () => {
    const gangs = twoGangsWithMembers();

    recordGrudgeFromAdjudicatedAssault(gangs, assaultRecord([2, 7], 2));
    // Measured against the trigger's own default threshold of 0.6, not
    // recomputed from the code under test: one assault at half of a 0.4
    // weight is 0.2 a key, and 0.2 * 1.5 = 0.3 on contested ground in EITHER
    // direction, which is below it.
    //
    // **THIS FILE READ 0.15 HERE, AND FOR ONE DAY THAT WAS RIGHT.** Two
    // rulings landed on top of each other. The owner's answer to open
    // question 2 (2026-09-10) halved every write, and with the weight still
    // at 0.2 that left 0.1 a key and a risk of 0.15 -- which doubled the
    // assaults a retaliation needed, from two to four, because the threshold
    // is on ONE key. That consequence was not named when they answered, so it
    // was put to them, and on 2026-09-11 they ruled the weight to 0.4 so a
    // key accrues what a key accrued before. Both figures are kept here
    // because a reader should see which number moved and why.
    expect(resolveRetaliationRisk(gangs, 'gang.beta', 'gang.alpha', SECTOR)).toBeCloseTo(0.3, 10);
    expect(resolveRetaliationRisk(gangs, 'gang.alpha', 'gang.beta', SECTOR)).toBeCloseTo(0.3, 10);

    recordGrudgeFromAdjudicatedAssault(gangs, assaultRecord([2, 7], 2));
    // Two assaults, any direction mix (this fixture keeps the same instigator
    // throughout, and it makes no difference): 0.4 grudge each way, risk 0.6
    // each way -- exactly at the threshold, in BOTH directions
    // simultaneously.
    //
    // That simultaneity is the part neither ruling bought on purpose and both
    // produced: the pre-2026-09-10 one-directional ledger also cleared on the
    // second assault, but in ONE direction only. The owner was told before
    // choosing 0.4 that a retaliation can now fire twice where it fired once.
    expect(resolveRetaliationRisk(gangs, 'gang.beta', 'gang.alpha', SECTOR)).toBeCloseTo(0.6, 10);
    expect(resolveRetaliationRisk(gangs, 'gang.alpha', 'gang.beta', SECTOR)).toBeCloseTo(0.6, 10);
  });

  it('accumulates the same way when the instigator alternates, which the one-directional ledger could not do', () => {
    const gangs = twoGangsWithMembers();

    // Entity 2 (gang.alpha) instigates once, then entity 7 (gang.beta) does.
    // Under the pre-2026-09-10 one-directional ledger this wrote 0.2 to
    // 'gang.beta->gang.alpha' and 0.2 to 'gang.alpha->gang.beta' -- two
    // different keys, NEITHER reaching the 0.4 a 0.6 risk needs, which is ADR
    // 0103 decision 2.5's "an alternating pair never retaliates at all".
    // Under both-directions-at-half-weight every assault credits both keys
    // equally regardless of who instigated, so an alternating pair now
    // accumulates exactly as a one-sided pair does.
    //
    // **THIS CASE USED FOUR ASSAULTS AND ASSERTED 0.4 A KEY, AND THAT WAS
    // RIGHT WHILE THE WEIGHT WAS 0.2.** The owner ruled the weight to 0.4 on
    // 2026-09-11, so a key accrues 0.2 an assault again and four assaults
    // would now clamp the risk at 1 rather than sit at the threshold. Two is
    // what demonstrates the property at the ruled weight; the point the case
    // was written to make is unchanged.
    recordGrudgeFromAdjudicatedAssault(gangs, assaultRecord([2, 7], 2));
    recordGrudgeFromAdjudicatedAssault(gangs, assaultRecord([2, 7], 7));

    expect(gangs.getGrudge('gang.beta', 'gang.alpha')).toBeCloseTo(0.4, 10);
    expect(gangs.getGrudge('gang.alpha', 'gang.beta')).toBeCloseTo(0.4, 10);
    expect(resolveRetaliationRisk(gangs, 'gang.beta', 'gang.alpha', SECTOR)).toBeCloseTo(0.6, 10);
    expect(resolveRetaliationRisk(gangs, 'gang.alpha', 'gang.beta', SECTOR)).toBeCloseTo(0.6, 10);
  });

  it('stops resolveRetaliationRisk returning the zero it returns for every prison today', () => {
    const gangs = twoGangsWithMembers();

    // `if (grudge === 0) return 0;` -- the line ADR 0103 Context 1 calls the
    // decisive one, asserted before and after the one writer that exists.
    expect(resolveRetaliationRisk(gangs, 'gang.beta', 'gang.alpha', SECTOR)).toBe(0);
    recordGrudgeFromAdjudicatedAssault(gangs, assaultRecord([2, 7], 2));
    expect(resolveRetaliationRisk(gangs, 'gang.beta', 'gang.alpha', SECTOR)).toBeGreaterThan(0);
  });

  it('writes nothing for an assault that is not between two gangs', () => {
    const gangs = twoGangsWithMembers();
    gangs.addMember(DEFAULT_GANG_IDS[0], 3); // same gang as entity 2

    // Same gang on both sides.
    expect(recordGrudgeFromAdjudicatedAssault(gangs, assaultRecord([2, 3], 2))).toBeUndefined();
    // The victim is in no gang.
    expect(recordGrudgeFromAdjudicatedAssault(gangs, assaultRecord([2, 9], 2))).toBeUndefined();
    // The instigator is in no gang.
    expect(recordGrudgeFromAdjudicatedAssault(gangs, assaultRecord([9, 7], 9))).toBeUndefined();
    // No instigator named at all -- every incident type but an assault.
    expect(recordGrudgeFromAdjudicatedAssault(gangs, assaultRecord([2, 7], undefined))).toBeUndefined();
    // An assault record whose participant list does not name exactly one other
    // prisoner: refused rather than guessed at.
    expect(recordGrudgeFromAdjudicatedAssault(gangs, assaultRecord([2], 2))).toBeUndefined();

    expect(gangs.allGrudges()).toEqual([]);
  });

  it('writes nothing for an incident that is not an assault, even when it names an instigator and two gangs', () => {
    const gangs = twoGangsWithMembers();

    expect(recordGrudgeFromAdjudicatedAssault(gangs, assaultRecord([2, 7], 2, 'riot'))).toBeUndefined();
    expect(recordGrudgeFromAdjudicatedAssault(gangs, assaultRecord([2, 7], 2, 'gang-retaliation'))).toBeUndefined();
    expect(gangs.allGrudges()).toEqual([]);
  });
});
