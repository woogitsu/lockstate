import { describe, expect, it } from 'vitest';
import { GuardRoster } from '../../src/simulation/security/guard-roster';
import {
  INCIDENT_RESPONSE_GUARD_RESERVE,
  claimableGuardIds,
  claimableSearchGuardIds,
} from '../../src/simulation/security/post-eligibility';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

/**
 * **The pool a search may claim from, which is not the pool a response may
 * claim from** ([issue #996](https://github.com/matmaxalez/lockstate/issues/996),
 * the owner's ruling of 2026-09-05: *"osobna pula dla przeszukań"*).
 *
 * These are the arithmetic and the ordering. That a *sweep* is gated on this
 * pool is `tests/unit/contraband-search-duty.test.ts`, that a *job* is staffed
 * from it is `tests/unit/contraband-search-system.test.ts`, and that no sweep
 * ever empties the responder pool in a real prison is
 * `tests/integration/contraband-search-duty.test.ts`. The set of modules that
 * may call either function at all is pinned by
 * `tests/foundation/claimable-guard-pool-contract.test.ts`.
 *
 * A real `GuardRoster` rather than a stub source, because the property under
 * test is about *ordering* and the roster is what produces the order: a stub
 * returning a hand-written array would be asserting the ordering with the
 * ordering.
 */

const ORIGIN = { x: tileCoordinate(0), y: tileCoordinate(0) };

function rosterOf(...staffRoleIds: readonly string[]): GuardRoster {
  const guards = new GuardRoster(64);
  for (const staffRoleId of staffRoleIds) guards.hire(staffRoleId, ORIGIN);
  return guards;
}

describe('the search pool is the free pool less the incident reserve', () => {
  it('holds one guard back, and it is the highest id rather than an arbitrary one', () => {
    expect(INCIDENT_RESPONSE_GUARD_RESERVE, 'these cases are written against a reserve of one').toBe(1);
    const guards = rosterOf('staff-role.guard', 'staff-role.guard', 'staff-role.guard');

    // Written out rather than derived from the function under test: an
    // expectation computed from its own output would hold for any reserve.
    expect(claimableGuardIds(guards)).toEqual([0, 1, 2]);
    expect(claimableSearchGuardIds(guards)).toEqual([0, 1]);
  });

  it('answers nothing when the free pool is the reserve, or smaller', () => {
    expect(claimableSearchGuardIds(rosterOf('staff-role.guard'))).toEqual([]);
    expect(claimableSearchGuardIds(rosterOf())).toEqual([]);
  });

  it('reserves out of the *eligible* pool, so an ineligible role neither fills the reserve nor is claimed', () => {
    // A nurse is unassigned and never claimable (ADR 0053), so this roster's
    // free pool is one guard: the reserve, and nobody to search.
    const guards = rosterOf('staff-role.nurse', 'staff-role.guard');

    expect(guards.unassignedGuardIds()).toEqual([0, 1]);
    expect(claimableGuardIds(guards)).toEqual([1]);
    expect(claimableSearchGuardIds(guards)).toEqual([]);
  });

  it('leaves the responder pool exactly as it was: nothing here narrows what a response may claim', () => {
    const guards = rosterOf('staff-role.guard', 'staff-role.guard');

    expect(claimableGuardIds(guards)).toEqual([0, 1]);
    expect(claimableGuardIds(guards)).toEqual([...guards.unassignedGuardIds()]);
  });

  it('takes the reserve off the end whatever the reserve is, so a claim keeps the lowest ids it used to take', () => {
    const guards = rosterOf('staff-role.guard', 'staff-role.guard', 'staff-role.guard', 'staff-role.guard');

    expect(claimableSearchGuardIds(guards, undefined, 0)).toEqual([0, 1, 2, 3]);
    expect(claimableSearchGuardIds(guards, undefined, 2)).toEqual([0, 1]);
    expect(claimableSearchGuardIds(guards, undefined, 9)).toEqual([]);
  });

  it('is a filter and not a sort: a roster hired out of order still answers ascending', () => {
    const guards = new GuardRoster(64);
    const first = guards.hire('staff-role.guard', ORIGIN);
    const second = guards.hire('staff-role.guard', ORIGIN);
    const third = guards.hire('staff-role.guard', ORIGIN);
    guards.assignToSector(first, 'security-sector.a');
    guards.setDeploymentPhase(first, 'on-post');

    expect([second, third]).toEqual([1, 2]);
    expect(claimableSearchGuardIds(guards)).toEqual([second]);
  });
});
