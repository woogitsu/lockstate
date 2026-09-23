import { describe, expect, it } from 'vitest';
import {
  resolveSectorCoverageState,
  SECTOR_COVERAGE_STATES,
  type SectorCoverageCounts,
} from '../../src/simulation/security/coverage-state';
import { DeploymentSystem, type CoverageReportEntry } from '../../src/simulation/security/deployment-system';
import { describeStaffCoverage } from '../../src/ui/hud/staff-panel';
import { HUD_MESSAGE_KEY } from '../../src/ui/hud/messages';
import { GuardRoster } from '../../src/simulation/security/guard-roster';
import { SecuritySectorRegistry } from '../../src/simulation/security/sector';
import { constantDeploymentSchedule } from '../../src/simulation/security/deployment-schedule';
import { DoorRegistry } from '../../src/simulation/navigation/door';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

/**
 * **The three-rung coverage ladder, and the one thing that keeps its two
 * copies honest** (issue #588).
 *
 * `describeStaffCoverage` (`src/ui/hud/staff-panel.ts`) has decided
 * `Covered` / `Understaffed` / `Unguarded` since
 * [ADR 0048](../../docs/adr/0048-what-a-sectors-occupants-are.md) consequence
 * 1. `resolveSectorCoverageState` now decides the same three on the
 * simulation side, because `SafetyCoverageSystem` provisions the `safety`
 * need from the rung a prisoner's sector is on.
 *
 * **They cannot be one function.** `AGENTS.md` boundary 1 forbids
 * `src/ui/hud/**` from importing `src/simulation/**` and
 * `tests/unit/ui-hud-messages.test.ts` enforces it, so neither can call the
 * other. A test can import both, and that is the whole reason the second case
 * below exists: it is the only place in the repository where the two
 * definitions meet. The panel alone splits the simulation's mathematically
 * covered zero-requirement case into a neutral presentation (#868): nobody
 * needs a post, but green "Covered" suggests a staffed prison.
 */

/** Every `(required, assigned)` pair a small prison can be in, plus the shortage each implies. */
function grid(): readonly SectorCoverageCounts[] {
  const rows: SectorCoverageCounts[] = [];
  for (let required = 0; required <= 4; required += 1) {
    for (let assigned = 0; assigned <= 4; assigned += 1) {
      rows.push({ required, assigned, shortage: Math.max(0, required - assigned) });
    }
  }
  return rows;
}

describe('the rung a sector is on', () => {
  it('is unguarded when the sector asks for somebody and nobody is on duty', () => {
    expect(resolveSectorCoverageState({ required: 1, assigned: 0, shortage: 1 })).toBe('unguarded');
    expect(resolveSectorCoverageState({ required: 4, assigned: 0, shortage: 4 })).toBe('unguarded');
  });

  it('is understaffed when somebody is on duty and it is not enough', () => {
    expect(resolveSectorCoverageState({ required: 2, assigned: 1, shortage: 1 })).toBe('understaffed');
    expect(resolveSectorCoverageState({ required: 4, assigned: 3, shortage: 1 })).toBe('understaffed');
  });

  it('is covered when the sector has what it asks for, and when it asks for nobody', () => {
    expect(resolveSectorCoverageState({ required: 2, assigned: 2, shortage: 0 })).toBe('covered');
    expect(resolveSectorCoverageState({ required: 2, assigned: 3, shortage: 0 })).toBe('covered');
    // A `DeploymentSchedule` of zero is an exemption a save can carry, and
    // since issue #533 it is also what an empty sector reads. "Has the guards
    // it asks for" is true of a sector that asks for none.
    expect(resolveSectorCoverageState({ required: 0, assigned: 0, shortage: 0 })).toBe('covered');
  });

  it('asks "nobody on duty" before "short", because the first is a subset of the second', () => {
    // Both branches are live for this triple: `shortage > 0` is true as well.
    // The order of the tests is what decides which sentence a player reads,
    // and the more specific one has to win.
    const both: SectorCoverageCounts = { required: 3, assigned: 0, shortage: 3 };
    expect(both.shortage).toBeGreaterThan(0);
    expect(resolveSectorCoverageState(both)).toBe('unguarded');
  });

  it('answers one of the three declared states for every triple, and never a fourth', () => {
    for (const row of grid()) expect(SECTOR_COVERAGE_STATES).toContain(resolveSectorCoverageState(row));
  });
});

describe('the simulation ladder and the Staff panel ladder', () => {
  /** The panel's badge key for each rung -- the mapping this file asserts, written out rather than derived from either side. */
  const PANEL_BADGE = {
    covered: HUD_MESSAGE_KEY.securityCoverageMet,
    understaffed: HUD_MESSAGE_KEY.securityCoverageShort,
    unguarded: HUD_MESSAGE_KEY.securityCoverageUnguarded,
  } as const;

  it('agree on every positive requirement and present zero as no posts', () => {
    for (const row of grid()) {
      const state = resolveSectorCoverageState(row);
      expect(describeStaffCoverage(row).badgeKey, `required ${String(row.required)}, assigned ${String(row.assigned)}`).toBe(
        row.required === 0 ? HUD_MESSAGE_KEY.securityCoverageNoPosts : PANEL_BADGE[state],
      );
    }
  });

  it('agree on a summed shortage the difference of the two counts cannot produce', () => {
    /*
     * `HudStaffCoverageViewModel` sums its three figures across sectors, so
     * `shortage` is not `required - assigned` there: two sectors at 1-of-2 and
     * 2-of-1 sum to 3 required, 3 assigned and 1 short. This is why
     * `resolveSectorCoverageState` takes the shortage rather than recomputing
     * it -- a version that recomputed would answer `covered` here and the
     * panel would say `Understaffed`.
     */
    const summed: SectorCoverageCounts = { required: 3, assigned: 3, shortage: 1 };
    expect(summed.required - summed.assigned).toBe(0);
    expect(resolveSectorCoverageState(summed)).toBe('understaffed');
    expect(describeStaffCoverage(summed).badgeKey).toBe(PANEL_BADGE.understaffed);
  });
});

describe('a real coverage report', () => {
  it('satisfies the structural shape the ladder takes, without a cast', () => {
    /*
     * `coverage-state.ts` imports nothing, so nothing in `src/` proves a
     * `CoverageReportEntry` can be handed to it. This does, with a real
     * `DeploymentSystem` rather than a literal typed as one: the compiler
     * checks the assignment and the assertion checks the value.
     */
    const sectors = new SecuritySectorRegistry(new DoorRegistry());
    sectors.register({ id: 'sector-a', gradeId: 'grade.general', doorIds: [], postTile: { x: tileCoordinate(0), y: tileCoordinate(0) } });
    // `undefined as never` for the navigation system: `getCoverageReport` is a
    // pure read over the registry and the roster and never routes anybody, so
    // standing one up would only make this case slower and less specific about
    // what it is proving. `update` is not called.
    const deployment = new DeploymentSystem(sectors, new GuardRoster(4), undefined as never, [constantDeploymentSchedule('sector-a', 2)]);

    const report: readonly CoverageReportEntry[] = deployment.getCoverageReport(0);
    expect(report).toEqual([{ sectorId: 'sector-a', required: 2, assigned: 0, shortage: 2 }]);
    expect(resolveSectorCoverageState(report[0]!)).toBe('unguarded');
  });
});
