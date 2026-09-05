import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SEARCH_POLICIES,
  applyDefaultSearchPolicies,
} from '../../src/simulation/contraband/default-search-policies';
import type { SearchPolicyDefinition, SearchScope } from '../../src/simulation/contraband/search-policy';
import type { SearchOrderInput } from '../../src/simulation/contraband/search-system';
import {
  DEFAULT_SECTOR_SEARCH_INTERVAL_TICKS,
  DEFAULT_SECTOR_SWEEP_MAX_TARGETS,
  SectorSearchDutySystem,
  selectSweepTargets,
  sectorSweepOrderId,
} from '../../src/simulation/contraband/sector-search-duty';
import type { EntityId } from '../../src/simulation/entity/entity-store';
import type { SimulationContext } from '../../src/simulation/kernel/system';
import { GuardRoster } from '../../src/simulation/security/guard-roster';
import { INCIDENT_RESPONSE_GUARD_RESERVE } from '../../src/simulation/security/post-eligibility';
import type { SecuritySectorDefinition } from '../../src/simulation/security/sector';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

/**
 * The producer for `SearchSystem.submitOrder`, and the four policies without
 * which the system it feeds throws
 * ([ADR 0073](../../docs/adr/0073-who-orders-a-contraband-search.md), issue
 * #552).
 *
 * These are the *conditions* -- who orders a sweep, when, and over whom. That a
 * sweep then actually walks, detects and confiscates is `SearchSystem`'s own
 * suite (`contraband-search-system.test.ts`) and, through the real command path
 * with nothing hand-assembled, `tests/integration/contraband-search-duty.test.ts`.
 */

const SECTOR: SecuritySectorDefinition = {
  id: 'security-sector.a',
  gradeId: 'grade.general',
  doorIds: [],
  postTile: { x: tileCoordinate(4), y: tileCoordinate(4) },
};

/** A second sector, so "one sweep per sector" is a claim about sectors and not about the prison. */
const OTHER_SECTOR: SecuritySectorDefinition = { ...SECTOR, id: 'security-sector.b', postTile: { x: tileCoordinate(9), y: tileCoordinate(9) } };

const ORIGIN = { x: tileCoordinate(0), y: tileCoordinate(0) };

/**
 * Records what the duty submits and answers what is outstanding, which is the
 * whole of the surface `SectorSearchDutySystem` uses.
 *
 * A double rather than a real `SearchSystem` because these cases are about the
 * *decision to order*, and a real one would need a navigation system, a world
 * and a guard walking to a tile before the first assertion could be made. It
 * implements `orderIds` from the orders it was actually given, so the
 * "one outstanding sweep per sector" case cannot pass by the double answering
 * something the real system would not.
 */
class RecordingSearchSystem {
  public readonly submitted: SearchOrderInput[] = [];
  /** Ids that have been "completed" -- removed from the outstanding set without being forgotten by `submitted`. */
  private readonly finished = new Set<string>();

  public submitOrder(input: SearchOrderInput): void {
    if (this.orderIds().includes(input.id)) throw new RangeError(`Duplicate search order id "${input.id}".`);
    this.submitted.push(input);
  }

  public orderIds(): readonly string[] {
    return this.submitted.map((order) => order.id).filter((id) => !this.finished.has(id));
  }

  public finish(orderId: string): void {
    this.finished.add(orderId);
  }
}

interface Harness {
  readonly guards: GuardRoster;
  readonly searches: RecordingSearchSystem;
  readonly policies: SearchPolicyDefinition[];
  readonly duty: SectorSearchDutySystem;
  readonly occupants: EntityId[];
  run(tick: number): void;
}

function buildHarness(options?: {
  readonly sectors?: readonly SecuritySectorDefinition[];
  readonly occupants?: readonly EntityId[];
  readonly maxTargets?: number;
}): Harness {
  const sectors = options?.sectors ?? [SECTOR];
  const guards = new GuardRoster(32);
  const searches = new RecordingSearchSystem();
  const policies: SearchPolicyDefinition[] = [];
  applyDefaultSearchPolicies(policies);
  const occupants = [...(options?.occupants ?? [1, 2, 3, 4, 5, 6])];
  const duty = new SectorSearchDutySystem(
    { all: () => sectors },
    guards,
    searches,
    policies,
    () => occupants,
    DEFAULT_SECTOR_SEARCH_INTERVAL_TICKS,
    options?.maxTargets ?? DEFAULT_SECTOR_SWEEP_MAX_TARGETS,
  );
  return {
    guards,
    searches,
    policies,
    duty,
    occupants,
    run: (tick: number) => {
      duty.update({ tick } as SimulationContext);
    },
  };
}

/** A guard standing this sector's post -- what makes the sector "staffed". */
function post(guards: GuardRoster, sectorId: string): EntityId {
  const guardId = guards.hire('staff-role.guard', ORIGIN);
  guards.assignToSector(guardId, sectorId);
  guards.setDeploymentPhase(guardId, 'on-post');
  return guardId;
}

/**
 * The spare guards a sweep needs: `count` to walk it, plus
 * `INCIDENT_RESPONSE_GUARD_RESERVE` the duty may not count
 * ([issue #996](https://github.com/matmaxalez/lockstate/issues/996)).
 *
 * Read from the constant rather than written out, so the cases below stay
 * about *their own* subject -- who orders a sweep and when. The case that is
 * about the reserve itself is the last one in this file, and it says the
 * number out loud.
 */
function spares(guards: GuardRoster, count = 1): void {
  for (let index = 0; index < count + INCIDENT_RESPONSE_GUARD_RESERVE; index += 1) guards.hire('staff-role.guard', ORIGIN);
}

describe('the four default search policies', () => {
  it('covers every scope exactly once, so `findPolicy` cannot throw for one nobody authored', () => {
    // Written out rather than derived from the module under test: an expected
    // value computed from `DEFAULT_SEARCH_POLICIES` would hold for any list.
    const scopes: readonly SearchScope[] = ['cell', 'delivery', 'person', 'sector'];
    expect(DEFAULT_SEARCH_POLICIES.map((policy) => policy.scope)).toEqual(scopes);
    for (const scope of scopes) {
      expect(DEFAULT_SEARCH_POLICIES.filter((policy) => policy.scope === scope)).toHaveLength(1);
    }
  });

  it('authors values a search can actually run on, rather than zeroes that would make one free or impossible', () => {
    for (const policy of DEFAULT_SEARCH_POLICIES) {
      expect(policy.requiredGuardCount, `${policy.scope} must cost a guard`).toBeGreaterThanOrEqual(1);
      expect(policy.dwellTicksPerTarget, `${policy.scope} must cost time`).toBeGreaterThan(0);
      expect(policy.baseDetectionProbability, `${policy.scope} must be able to find something`).toBeGreaterThan(0);
      expect(policy.baseDetectionProbability, `${policy.scope} must not be a certainty`).toBeLessThanOrEqual(1);
      expect(policy.concealmentPenaltyPerPoint, `${policy.scope} must let concealment matter`).toBeGreaterThan(0);
    }
  });

  it('fills an empty list, which is the state every save written before it carries', () => {
    const policies: SearchPolicyDefinition[] = [];
    applyDefaultSearchPolicies(policies);
    expect(policies.map((policy) => policy.scope)).toEqual(['cell', 'delivery', 'person', 'sector']);
  });

  it('leaves a policy already present alone and fills only the rest -- payload-wins, and idempotent', () => {
    const authored: SearchPolicyDefinition = { scope: 'cell', requiredGuardCount: 3, dwellTicksPerTarget: 999, baseDetectionProbability: 0.01, concealmentPenaltyPerPoint: 0.5, intelligenceConfidenceBonus: 0 };
    const policies: SearchPolicyDefinition[] = [{ ...authored }];

    applyDefaultSearchPolicies(policies);
    applyDefaultSearchPolicies(policies);

    // The authored one is untouched and still first, so `findPolicy`'s first
    // match is the save's own policy and not a default written over it.
    expect(policies[0]).toEqual(authored);
    expect(policies).toHaveLength(4);
    expect(policies.filter((policy) => policy.scope === 'cell')).toHaveLength(1);
    expect(policies.map((policy) => policy.scope).sort()).toEqual(['cell', 'delivery', 'person', 'sector']);
  });
});

describe('who a sweep covers', () => {
  it('takes a window of the sector occupants, as prisoner targets', () => {
    expect(selectSweepTargets([7, 8, 9, 10, 11], 0, 3)).toEqual([
      { holderKind: 'prisoner', holderId: '7' },
      { holderKind: 'prisoner', holderId: '8' },
      { holderKind: 'prisoner', holderId: '9' },
    ]);
  });

  it('rotates by a whole window, so consecutive sweeps look at different people', () => {
    const occupants = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(selectSweepTargets(occupants, 1, 4).map((target) => target.holderId)).toEqual(['5', '6', '7', '8']);
    expect(selectSweepTargets(occupants, 2, 4).map((target) => target.holderId)).toEqual(['1', '2', '3', '4']);
  });

  it('reaches every occupant of a prison too big for one sweep, which a fixed window never would', () => {
    const occupants = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const seen = new Set<string>();
    // `ceil(11 / 4)` sweeps is the claim; running exactly that many is what
    // makes it one, rather than "eventually".
    for (let sweepIndex = 0; sweepIndex < 3; sweepIndex += 1) {
      for (const target of selectSweepTargets(occupants, sweepIndex, 4)) seen.add(target.holderId);
    }
    expect([...seen].sort((left, right) => Number(left) - Number(right))).toEqual(occupants.map(String));
  });

  it('wraps rather than running short when the window overruns the roster', () => {
    expect(selectSweepTargets([1, 2, 3], 0, 2).map((target) => target.holderId)).toEqual(['1', '2']);
    expect(selectSweepTargets([1, 2, 3], 1, 2).map((target) => target.holderId)).toEqual(['3', '1']);
  });

  it('covers a prison smaller than one window exactly once, never naming anybody twice', () => {
    const targets = selectSweepTargets([4, 5], 3, 4);
    expect(targets.map((target) => target.holderId)).toHaveLength(2);
    expect(new Set(targets.map((target) => target.holderId)).size).toBe(2);
  });

  it('answers nothing for an empty sector rather than an order with no targets, which `submitOrder` refuses', () => {
    expect(selectSweepTargets([], 4, 4)).toEqual([]);
  });
});

describe('when a staffed sector orders a sweep', () => {
  it('orders one, over its own occupants, once a guard stands the post and another is spare', () => {
    const harness = buildHarness();
    post(harness.guards, SECTOR.id);
    spares(harness.guards); // the spare who will walk it, plus the reserve #996 keeps for incidents

    harness.run(600);

    expect(harness.searches.submitted).toEqual([
      {
        id: sectorSweepOrderId(SECTOR.id, 1),
        scope: 'sector',
        targets: [
          { holderKind: 'prisoner', holderId: '5' },
          { holderKind: 'prisoner', holderId: '6' },
          { holderKind: 'prisoner', holderId: '1' },
          { holderKind: 'prisoner', holderId: '2' },
        ],
      },
    ]);
  });

  it('orders nothing for a sector nobody is standing, however many guards are spare', () => {
    const harness = buildHarness();
    harness.guards.hire('staff-role.guard', ORIGIN);
    harness.guards.hire('staff-role.guard', ORIGIN);

    harness.run(600);

    expect(harness.searches.submitted).toEqual([]);
  });

  it('orders nothing when every guard is on a post, because posts come before searches', () => {
    const harness = buildHarness();
    post(harness.guards, SECTOR.id);

    harness.run(600);

    // The sector is staffed, so the first condition passes and this case is
    // about the second: `SearchSystem` staffs from the unassigned pool, so an
    // order given here would queue for ever instead of being walked.
    expect(harness.searches.submitted).toEqual([]);

    spares(harness.guards);
    harness.run(1_200);
    expect(harness.searches.submitted).toHaveLength(1);
  });

  it('does not count a spare who may not stand a security duty', () => {
    const harness = buildHarness();
    post(harness.guards, SECTOR.id);
    harness.guards.hire('staff-role.nurse', ORIGIN);

    harness.run(600);

    // ADR 0053: a nurse is unassigned but not claimable, so nothing could walk
    // this sweep. Counting the roster instead of the claimable pool would order
    // one anyway and leave it queued.
    expect(harness.searches.submitted).toEqual([]);
  });

  it('holds to one sweep per sector at a time, and orders the next once that one is done', () => {
    const harness = buildHarness();
    post(harness.guards, SECTOR.id);
    spares(harness.guards);

    harness.run(600);
    harness.run(1_200);
    harness.run(1_800);
    expect(harness.searches.submitted).toHaveLength(1);

    harness.searches.finish(sectorSweepOrderId(SECTOR.id, 1));
    harness.run(2_400);

    expect(harness.searches.submitted.map((order) => order.id)).toEqual([
      sectorSweepOrderId(SECTOR.id, 1),
      sectorSweepOrderId(SECTOR.id, 4),
    ]);
  });

  it('is per sector: a sweep outstanding in one does not silence another', () => {
    const harness = buildHarness({ sectors: [SECTOR, OTHER_SECTOR] });
    post(harness.guards, SECTOR.id);
    post(harness.guards, OTHER_SECTOR.id);
    spares(harness.guards);

    harness.run(600);

    expect(harness.searches.submitted.map((order) => order.id)).toEqual([
      sectorSweepOrderId(SECTOR.id, 1),
      sectorSweepOrderId(OTHER_SECTOR.id, 1),
    ]);
  });

  it('orders nothing for a staffed sector holding nobody', () => {
    const harness = buildHarness({ occupants: [] });
    post(harness.guards, SECTOR.id);
    // Enough spares that the empty sector is the only reason nothing is
    // ordered: after #996 a lone spare would satisfy the assertion for the
    // wrong reason.
    spares(harness.guards);

    harness.run(600);

    expect(harness.searches.submitted).toEqual([]);
  });

  it('returns rather than throwing when a scenario authored no sector policy', () => {
    const harness = buildHarness();
    post(harness.guards, SECTOR.id);
    spares(harness.guards);
    const index = harness.policies.findIndex((policy) => policy.scope === 'sector');
    expect(index, 'the harness must start from a list that does have one').toBeGreaterThanOrEqual(0);
    harness.policies.splice(index, 1);

    expect(() => {
      harness.run(600);
    }).not.toThrow();
    expect(harness.searches.submitted).toEqual([]);
  });

  it('needs as many spare guards as the sector policy asks for', () => {
    const harness = buildHarness();
    const index = harness.policies.findIndex((policy) => policy.scope === 'sector');
    harness.policies.splice(index, 1, { ...harness.policies[index]!, requiredGuardCount: 2 });
    post(harness.guards, SECTOR.id);
    // One walker plus the reserve: enough for a one-guard policy and one short
    // of this two-guard one, which is the condition under test.
    spares(harness.guards);

    harness.run(600);
    expect(harness.searches.submitted).toEqual([]);

    harness.guards.hire('staff-role.guard', ORIGIN);
    harness.run(1_200);
    expect(harness.searches.submitted).toHaveLength(1);
  });

  /**
   * The separate pool, at the gate rather than at the claim
   * ([issue #996](https://github.com/matmaxalez/lockstate/issues/996)).
   *
   * The number is written out here on purpose, against the rule the helper
   * above follows: this is the one case whose subject *is* the reserve, so it
   * asserts a prison with exactly one free guard orders nothing, and one with
   * `1 + INCIDENT_RESPONSE_GUARD_RESERVE` orders a sweep. Deriving the counts
   * from the constant would make it pass for a reserve of nine.
   */
  it('leaves the incident reserve alone: one spare orders nothing, and the reserve plus one orders a sweep (#996)', () => {
    expect(INCIDENT_RESPONSE_GUARD_RESERVE, 'this case is written against a reserve of one').toBe(1);
    const harness = buildHarness();
    post(harness.guards, SECTOR.id);
    harness.guards.hire('staff-role.guard', ORIGIN); // the reserve, and nothing else

    harness.run(600);
    expect(harness.searches.submitted, 'the only free guard is the one a response would be mounted from').toEqual([]);

    harness.guards.hire('staff-role.guard', ORIGIN); // now there is a walker as well
    harness.run(1_200);
    expect(harness.searches.submitted).toHaveLength(1);
  });

  it('mints an id that is a function of the sector and the tick, so a replayed tick cannot collide', () => {
    const harness = buildHarness();
    post(harness.guards, SECTOR.id);
    spares(harness.guards);

    harness.run(3_000);
    // The same tick again -- what a restore that resumes on a tick this system
    // has already run does. A duplicate id would throw out of `submitOrder`.
    expect(() => {
      harness.run(3_000);
    }).not.toThrow();

    expect(harness.searches.submitted.map((order) => order.id)).toEqual([sectorSweepOrderId(SECTOR.id, 5)]);
  });
});
