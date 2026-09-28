import { describe, expect, it } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { NavigationSystem } from '../../src/simulation/navigation/navigation-system';
import { buildCellBlockFixture } from '../helpers/navigation-fixture';
import { DeploymentSystem } from '../../src/simulation/security/deployment-system';
import { constantDeploymentSchedule, type DeploymentSchedule } from '../../src/simulation/security/deployment-schedule';
import { GuardRoster } from '../../src/simulation/security/guard-roster';
import { SecuritySectorRegistry } from '../../src/simulation/security/sector';
import {
  DEFAULT_SECTOR_PRISONERS_PER_GUARD,
  resolveOccupancyScaledGuardCount,
  sectorOccupantCountIsComplete,
} from '../../src/simulation/security/sector-staffing';
import { DEFAULT_SECURITY_SECTOR_ID } from '../../src/simulation/security/default-sector';

/**
 * **A staffing requirement that moves with the population**
 * ([ADR 0048](../../docs/adr/0048-what-a-sectors-occupants-are.md) decision 3,
 * answering [ADR 0042](../../docs/adr/0042-attaching-consequences-to-the-simulation-loop.md)
 * open question 2).
 *
 * The defect it closes is arithmetic rather than behavioural, and worth
 * restating because a passing test does not show it: `staffingShortfall` is
 * `shortage / required`, so with `required` pinned at one it is `1` before the
 * first hire and `0` for ever after — issue #442's *"hiring one guard makes the
 * incident system unreachable"*. Every figure below is the requirement, which
 * is the denominator of that fraction.
 */

const SECTOR_ID = 'security-office';

function buildScenario() {
  const cellBlock = buildCellBlockFixture(12);
  const navigation = new NavigationSystem(cellBlock.world, { workBudgetPerTick: 2_000, agingIntervalTicks: 10, flowFieldActivationThreshold: 100 }, cellBlock.doors);
  navigation.setLoadedChunks(cellBlock.chunkPositions);
  const sectors = new SecuritySectorRegistry(cellBlock.doors);
  sectors.register({ id: SECTOR_ID, gradeId: 'grade.general', doorIds: ['cell-door-1'], postTile: cellBlock.cellTiles[1]! });
  const guards = new GuardRoster(64);
  return { cellBlock, navigation, sectors, guards };
}

describe('resolveOccupancyScaledGuardCount: the schedule is a floor, the population is a demand', () => {
  it('uses an explicit ratio without changing the authored schedule floor (#977)', () => {
    expect(resolveOccupancyScaledGuardCount(1, 17, false, 10)).toBe(2);
    expect(resolveOccupancyScaledGuardCount(5, 17, false, 10)).toBe(5);
    expect(() => resolveOccupancyScaledGuardCount(1, 17, false, 0)).toThrow(RangeError);
    expect(() => resolveOccupancyScaledGuardCount(1, 17, false, 2.5)).toThrow(RangeError);
  });

  it('leaves the authored count alone until the population has outgrown it', () => {
    // Eight per guard, so a sector of eight still asks for the one its schedule
    // authored, and the ninth arrival is what changes the answer.
    expect(DEFAULT_SECTOR_PRISONERS_PER_GUARD).toBe(8);
    expect(resolveOccupancyScaledGuardCount(1, 0)).toBe(1);
    expect(resolveOccupancyScaledGuardCount(1, 8)).toBe(1);
    expect(resolveOccupancyScaledGuardCount(1, 9)).toBe(2);
    expect(resolveOccupancyScaledGuardCount(1, 16)).toBe(2);
    expect(resolveOccupancyScaledGuardCount(1, 17)).toBe(3);
  });

  it('only ever raises, so a scenario that authored more than the rule asks for keeps it', () => {
    // A schedule is authored data — a scenario, a save payload or
    // `applyDefaultSecuritySector` put it there — and a rule that replaced it
    // would make the authored number unreadable.
    expect(resolveOccupancyScaledGuardCount(5, 8)).toBe(5);
    expect(resolveOccupancyScaledGuardCount(5, 40)).toBe(5);
    expect(resolveOccupancyScaledGuardCount(5, 41)).toBe(6);
  });

  it('asks for nobody in a sector holding nobody, whatever the schedule authored', () => {
    /*
     * Issue #533, and this assertion **replaces one that agreed with the bug**:
     * this file used to pin `resolveOccupancyScaledGuardCount(1, 0)` at `1`,
     * beside a comment about the ninth arrival that had nothing to do with the
     * empty case. An empty prison therefore read `Guard coverage · 0 of 1 ·
     * Unguarded` and told the player to hire, at 80 minor units on the click and
     * the same again at every day boundary, against no income -- and the suite
     * was green throughout, because the fixture and the composition root
     * computed the same wrong number.
     *
     * The authored floor is not consulted at all here, which is the half a
     * single `(1, 0)` case would not show: a scenario asking for five guards on
     * an empty sector is asking for five guards to cover nobody.
     */
    expect(resolveOccupancyScaledGuardCount(1, 0, true)).toBe(0);
    expect(resolveOccupancyScaledGuardCount(5, 0, true)).toBe(0);
    // A negative count is a caller's bug, not a demand: it must not read as one
    // and it must not read as a shortage either.
    expect(resolveOccupancyScaledGuardCount(1, -3, true)).toBe(0);
    // ...and the floor comes straight back with the first occupant, so this is
    // an exemption for an empty sector rather than a weakened floor.
    expect(resolveOccupancyScaledGuardCount(1, 1, true)).toBe(1);
    expect(resolveOccupancyScaledGuardCount(5, 1, true)).toBe(5);
  });

  it('keeps an authored schedule when the count is only of the post tile, which is the default', () => {
    /*
     * **The first cut of #533 got this wrong and three scenario fixtures caught
     * it**, so the case is pinned rather than left to them.
     * `resolveSectorOccupants` counts the whole prison for the derived sector
     * and *only the post tile* for any other, so a `0` from a scenario sector
     * means "nobody is standing on one tile" and not "this sector is empty".
     * Zeroing on that would silently withdraw a requirement its author wrote,
     * on the strength of a measure ADR 0048 itself calls a fallback.
     *
     * The default is the conservative one, so a caller that does not know keeps
     * the schedule -- which is also why every unit fixture written before #533
     * still measures what it measured.
     */
    expect(resolveOccupancyScaledGuardCount(1, 0, false)).toBe(1);
    expect(resolveOccupancyScaledGuardCount(1, 0)).toBe(1);
    expect(resolveOccupancyScaledGuardCount(5, 0)).toBe(5);
    // The raising direction is unaffected by the flag: an undercount that
    // happens to be non-zero has always been allowed to raise the floor.
    expect(resolveOccupancyScaledGuardCount(1, 9, false)).toBe(2);
    expect(resolveOccupancyScaledGuardCount(1, 9, true)).toBe(2);
  });

  it('names the derived sector as the only one whose occupant count is complete', () => {
    // ADR 0036 derives `security-sector.prison` from owned land and ADR 0048
    // decision 1 makes its occupants every prisoner on that land. Every other
    // sector has an area only its author knows.
    expect(sectorOccupantCountIsComplete(DEFAULT_SECURITY_SECTOR_ID)).toBe(true);
    expect(sectorOccupantCountIsComplete('sector-a')).toBe(false);
    expect(sectorOccupantCountIsComplete(SECTOR_ID)).toBe(false);
  });

  it('treats a zero as an exemption rather than as a small number', () => {
    // `applyDefaultSecuritySector`'s "anything already present wins" is what
    // lets a save carry a zero, and `tests/helpers/default-security-sector.ts`
    // relies on it for every fixture whose subject is not the default sector.
    // Scaling an exemption up would withdraw it, and only after a save round
    // trip.
    expect(resolveOccupancyScaledGuardCount(0, 0)).toBe(0);
    expect(resolveOccupancyScaledGuardCount(0, 500)).toBe(0);
  });
});

describe('DeploymentSystem reports and enforces the scaled requirement, not two different numbers', () => {
  it('uses the injected ratio for the report that drives posting (#977)', () => {
    const { navigation, sectors, guards } = buildScenario();
    const deployment = new DeploymentSystem(
      sectors, guards, navigation, [constantDeploymentSchedule(SECTOR_ID, 1)], undefined, () => 17, 10,
    );
    expect(deployment.getCoverageReport(0)).toEqual([{ sectorId: SECTOR_ID, required: 2, assigned: 0, shortage: 2 }]);
  });

  it('raises required, assigned and shortage together as the sector fills up', () => {
    const { cellBlock, navigation, sectors, guards } = buildScenario();
    const schedules: DeploymentSchedule[] = [constantDeploymentSchedule(SECTOR_ID, 1)];
    let occupants = 4;
    const deployment = new DeploymentSystem(sectors, guards, navigation, schedules, undefined, () => occupants);

    const kernel = new Kernel();
    kernel.registerSystem(navigation);
    kernel.registerSystem(deployment);

    for (let index = 0; index < 3; index += 1) guards.hire('staff-role.guard', cellBlock.cellTiles[1]!);
    for (let index = 0; index < 40; index += 1) kernel.step();

    // Four prisoners: the authored one guard is enough, and the other two hires
    // stay in the pool `IncidentResponseSystem` and `SearchSystem` draw from.
    expect(deployment.getCoverageReport(0)).toEqual([{ sectorId: SECTOR_ID, required: 1, assigned: 1, shortage: 0 }]);
    expect(guards.unassignedGuardIds()).toHaveLength(2);

    occupants = 20;
    for (let index = 0; index < 40; index += 1) kernel.step();

    // Twenty prisoners: three guards, and all three hires are now posted. The
    // requirement moved without the schedule moving — the schedule is still the
    // one the fixture authored.
    expect(deployment.getCoverageReport(0)).toEqual([{ sectorId: SECTOR_ID, required: 3, assigned: 3, shortage: 0 }]);
    expect(guards.unassignedGuardIds()).toEqual([]);
    expect(schedules).toEqual([constantDeploymentSchedule(SECTOR_ID, 1)]);
  });

  it('reports the shortage a growing prison has, rather than fabricating coverage', () => {
    const { cellBlock, navigation, sectors, guards } = buildScenario();
    const deployment = new DeploymentSystem(sectors, guards, navigation, [constantDeploymentSchedule(SECTOR_ID, 1)], undefined, () => 33);

    const kernel = new Kernel();
    kernel.registerSystem(navigation);
    kernel.registerSystem(deployment);
    guards.hire('staff-role.guard', cellBlock.cellTiles[1]!);
    for (let index = 0; index < 40; index += 1) kernel.step();

    // 33 occupants is five guards' worth; one is hired. `staffingShortfall`
    // reads 4/5, which is the number the risk sampler divides by and the
    // number the staff projection publishes.
    expect(deployment.getCoverageReport(0)).toEqual([{ sectorId: SECTOR_ID, required: 5, assigned: 1, shortage: 4 }]);
  });

  it('is exactly the old system when no occupancy source is supplied', () => {
    // The parameter is optional so every fixture written against a
    // hand-authored schedule keeps its meaning; this is the assertion that says
    // so rather than the type saying it.
    const { cellBlock, navigation, sectors, guards } = buildScenario();
    const deployment = new DeploymentSystem(sectors, guards, navigation, [constantDeploymentSchedule(SECTOR_ID, 1)]);

    const kernel = new Kernel();
    kernel.registerSystem(navigation);
    kernel.registerSystem(deployment);
    for (let index = 0; index < 4; index += 1) guards.hire('staff-role.guard', cellBlock.cellTiles[1]!);
    for (let index = 0; index < 40; index += 1) kernel.step();

    expect(deployment.getCoverageReport(0)).toEqual([{ sectorId: SECTOR_ID, required: 1, assigned: 1, shortage: 0 }]);
  });
});
