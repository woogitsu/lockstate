import { describe, expect, it } from 'vitest';
import { ASSAULT_SEVERITY_CEILING } from '../../src/simulation/incidents/flashpoint';
import { INCIDENT_SEVERITY_CEILING } from '../../src/simulation/incidents/incident';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { GuardRoster } from '../../src/simulation/security/guard-roster';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { claimableGuardIds } from '../../src/simulation/security/post-eligibility';
import {
  isResponseReserveShort,
  responseReserveGuardCount,
  spareGuardCount,
  type ResponseReserveCounts,
} from '../../src/simulation/security/response-reserve';
import { HUD_MESSAGE_KEY } from '../../src/ui/hud/messages';
import { describeStaffCoverage } from '../../src/ui/hud/staff-panel';

/**
 * **The response and search reserve, and the rung it decides**
 * ([ADR 0095](../../docs/adr/0095-what-the-guard-requirement-is-a-requirement-for.md)
 * decision 1, accepted by the owner on 2026-09-23).
 *
 * Three things are pinned here, each of which a later edit could break with
 * every other test green:
 *
 * 1. **The figure.** `responseReserveGuardCount` is the response system's own
 *    `requiredResponderCount` at `INCIDENT_SEVERITY_CEILING`, and that ceiling
 *    is the top of every severity band `IncidentTriggerSystem` writes --
 *    `ASSAULT_SEVERITY_CEILING` sits at or under it.
 * 2. **The pool.** `spareGuardCount` is exactly `claimableGuardIds` over a real
 *    `GuardRoster` -- including the role filter, so a free nurse is not a
 *    spare guard.
 * 3. **The rung, on both sides of the worker boundary.** `isResponseReserveShort`
 *    (simulation, read by the `COVERAGE` chip through `PrisonCondition`) and
 *    `describeStaffCoverage` (UI, the Staff panel) cannot share a function,
 *    `AGENTS.md` boundary 1; this drives both over one grid and fails the day
 *    they disagree, the pattern `tests/unit/security-coverage-state.test.ts`
 *    set for the three-rung ladder.
 *
 * Expected values are written out, never computed by the code under test
 * (`docs/AGENT_WORKFLOW.md` §3).
 */

const ORIGIN = { x: tileCoordinate(0), y: tileCoordinate(0) };

describe('the reserve figure', () => {
  it('is five free guards under the default response policy: ceil(10 x 0.5)', () => {
    const runtime = createNewSimulationRuntime(0x0095);
    expect(INCIDENT_SEVERITY_CEILING).toBe(10);
    expect(responseReserveGuardCount(runtime.incidentResponseSystem)).toBe(5);
  });

  it('asks the response system rather than recomputing its formula', () => {
    // A stub whose answer no formula over 10 produces, so a reimplementation
    // that multiplied by 0.5 itself would return 5 and fail.
    const asked: number[] = [];
    const reserve = responseReserveGuardCount({
      requiredResponderCount: (severity) => {
        asked.push(severity);
        return 7;
      },
    });
    expect(reserve).toBe(7);
    expect(asked).toEqual([10]);
  });

  it('is the top of every severity band, so it is the worst incident and not one type of it', () => {
    expect(ASSAULT_SEVERITY_CEILING).toBeLessThanOrEqual(INCIDENT_SEVERITY_CEILING);
  });
});

describe('the spare pool', () => {
  it('is the size of the pool a response claims from, role filter included', () => {
    const roster = new GuardRoster(16);
    const posted = roster.hire('staff-role.guard', ORIGIN);
    roster.hire('staff-role.guard', ORIGIN);
    roster.hire('staff-role.security-chief', ORIGIN);
    // Free, and not a guard: ADR 0053 decision 3 keeps her off every security duty.
    roster.hire('staff-role.nurse', ORIGIN);
    roster.assignToSector(posted, 'security-sector.prison');
    roster.setDeploymentPhase(posted, 'on-post');

    expect(roster.unassignedGuardIds()).toHaveLength(3);
    expect(claimableGuardIds(roster)).toHaveLength(2);
    expect(spareGuardCount(roster)).toBe(2);
  });

  it('does not count a guard walking to a post or away on a search', () => {
    const roster = new GuardRoster(16);
    const walking = roster.hire('staff-role.guard', ORIGIN);
    const searching = roster.hire('staff-role.guard', ORIGIN);
    roster.hire('staff-role.guard', ORIGIN);
    roster.assignToSector(walking, 'security-sector.prison');
    roster.setDeploymentPhase(walking, 'travelling');
    roster.setDeploymentPhase(searching, 'on-search');

    expect(spareGuardCount(roster)).toBe(1);
    expect(claimableGuardIds(roster)).toHaveLength(1);
  });
});

describe('the rung between Covered and Understaffed', () => {
  const base: ResponseReserveCounts = { required: 2, assigned: 2, shortage: 0, spare: 0, reserve: 5 };

  it('is reached with every post filled and nobody free -- ADR 0095 row 2', () => {
    expect(isResponseReserveShort(base)).toBe(true);
  });

  it('holds at every spare count below the reserve, and not at it', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((spare) => isResponseReserveShort({ ...base, spare }))).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
      false,
    ]);
  });

  it('is never asked of a prison short of its posts, or of one that asks for nobody', () => {
    expect(isResponseReserveShort({ ...base, assigned: 1, shortage: 1 })).toBe(false);
    expect(isResponseReserveShort({ ...base, assigned: 0, shortage: 2 })).toBe(false);
    expect(isResponseReserveShort({ required: 0, assigned: 0, shortage: 0, spare: 0, reserve: 5 })).toBe(false);
  });
});

describe('the simulation predicate and the Staff panel agree', () => {
  function grid(): readonly ResponseReserveCounts[] {
    const rows: ResponseReserveCounts[] = [];
    for (let required = 0; required <= 3; required += 1) {
      for (let assigned = 0; assigned <= 3; assigned += 1) {
        for (let spare = 0; spare <= 6; spare += 1) {
          rows.push({ required, assigned, shortage: Math.max(0, required - assigned), spare, reserve: 5 });
        }
      }
    }
    return rows;
  }

  it('on every prison in the grid: the panel says Tight exactly where the chip condition stands', () => {
    for (const row of grid()) {
      const panel = describeStaffCoverage(row);
      const label = JSON.stringify(row);
      expect(panel.badgeKey === HUD_MESSAGE_KEY.securityCoverageReserveShort, label).toBe(isResponseReserveShort(row));
    }
  });

  it('prices the rung in presses: reserve minus spare', () => {
    const panel = describeStaffCoverage({ required: 2, assigned: 2, shortage: 0, spare: 2, reserve: 5 });
    expect(panel).toMatchObject({
      tone: 'caution',
      badgeKey: HUD_MESSAGE_KEY.securityCoverageReserveShort,
      hintKey: HUD_MESSAGE_KEY.securityCoverageReserveShortHint,
      hireCount: 3,
    });
    expect(panel.consequenceKey).toBeUndefined();
  });

  it('keeps the three rungs it had when the view model carries no reserve', () => {
    expect(describeStaffCoverage({ required: 2, assigned: 2, shortage: 0 }).badgeKey).toBe(HUD_MESSAGE_KEY.securityCoverageMet);
    expect(describeStaffCoverage({ required: 2, assigned: 2, shortage: 0, spare: 0 }).badgeKey).toBe(
      HUD_MESSAGE_KEY.securityCoverageMet,
    );
  });
});
