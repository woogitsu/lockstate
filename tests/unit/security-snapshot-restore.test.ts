import { describe, expect, it } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { NavigationSystem } from '../../src/simulation/navigation/navigation-system';
import { buildCellBlockFixture } from '../helpers/navigation-fixture';
import { SecuritySectorRegistry, type SecuritySectorDefinition } from '../../src/simulation/security/sector';
import { GuardRoster } from '../../src/simulation/security/guard-roster';
import { DeploymentSystem } from '../../src/simulation/security/deployment-system';
import { PatrolSystem } from '../../src/simulation/security/patrol-system';
import { constantDeploymentSchedule, type DeploymentSchedule } from '../../src/simulation/security/deployment-schedule';

/**
 * Issue #26's "snapshot/restore preserves assignments, patrol progress and
 * overrides" -- proven together in one scenario, matching #25's combined
 * (not per-class) restore test: a sector under a `'restricted'` control-
 * state override, one guard mid-patrol-leg (a live `pathRequestId` against
 * the *old* `NavigationSystem`), and one still-unassigned guard -- all
 * restored into fresh `Kernel`/`NavigationSystem`/`DeploymentSystem`/
 * `PatrolSystem` instances, the only realistic restore scenario.
 */
describe('security snapshot/restore: sector control state and guard roster together', () => {
  it('resumes an interrupted patrol, preserves the restricted override and the still-unassigned guard after a full restore', () => {
    const cellBlock = buildCellBlockFixture(12);
    const navigation = new NavigationSystem(cellBlock.world, { workBudgetPerTick: 2_000, agingIntervalTicks: 10, flowFieldActivationThreshold: 100 }, cellBlock.doors);
    navigation.setLoadedChunks(cellBlock.chunkPositions);

    const sectorDefinition: SecuritySectorDefinition = {
      id: 'block-a', gradeId: 'grade.general', doorIds: ['cell-door-2'], postTile: cellBlock.cellTiles[2]!,
      patrolRoute: [cellBlock.corridorTiles[2]!, cellBlock.corridorTiles[3]!], expectedPatrolLoopTicks: 1_000,
    };
    const sectors = new SecuritySectorRegistry(cellBlock.doors);
    sectors.register(sectorDefinition);
    // A second, unrelated sector governed by an always-open door -- verifies
    // 'restricted' overrides are per-sector, not global, across the restore.
    sectors.register({ id: 'block-far', gradeId: 'grade.general', doorIds: ['cell-door-3'], postTile: cellBlock.cellTiles[3]! });
    sectors.setControlState('block-a', 'restricted');

    const guards = new GuardRoster(64);
    const schedules: DeploymentSchedule[] = [constantDeploymentSchedule('block-a', 1), constantDeploymentSchedule('block-far', 0)];
    const deployment = new DeploymentSystem(sectors, guards, navigation, schedules);
    const patrol = new PatrolSystem(sectors, guards, navigation);

    const kernel = new Kernel();
    kernel.registerSystem(navigation);
    kernel.registerSystem(deployment);
    kernel.registerSystem(patrol);

    const g1 = guards.hire('staff-role.guard', cellBlock.canteenTiles[0]!);
    const g2 = guards.hire('staff-role.guard', cellBlock.canteenTiles[0]!); // no slot -- stays unassigned

    let tick = 0;
    for (; tick < 400 && guards.getPatrolWaypointIndex(g1) === undefined; tick += 1) kernel.step();
    // One more scheduled cycle so the guard is genuinely mid-leg (a live pathRequestId), not merely just-started.
    for (let i = 0; i < 10; i += 1, tick += 1) kernel.step();

    expect(guards.getDeploymentPhase(g1)).toBe('travelling');
    expect(guards.getPatrolWaypointIndex(g1)).not.toBeUndefined();
    expect(guards.getPathRequestId(g1)).toBeDefined();
    expect(guards.getDeploymentPhase(g2)).toBe('unassigned');
    expect(sectors.getControlState('block-a')).toBe('restricted');
    expect(cellBlock.doors.getById('cell-door-2')?.state).toBe('closed'); // fixture-authored 'open' baseline (i=2, not %7==0), restricted -> closed

    const sectorSnapshot = sectors.getSnapshot();
    const guardSnapshot = guards.getSnapshot();

    // A restore never reuses the interrupted process's live objects, nor its
    // already-mutated door states -- #21/#22's `DoorRegistry` has no
    // snapshot/restore of its own (out of #26's scope), so a real restore's
    // scenario/session setup reconstructs the world/doors fresh from their
    // originally-authored definitions, exactly like this fresh fixture call.
    const restoredCellBlock = buildCellBlockFixture(12);
    const restoredNavigation = new NavigationSystem(restoredCellBlock.world, { workBudgetPerTick: 2_000, agingIntervalTicks: 10, flowFieldActivationThreshold: 100 }, restoredCellBlock.doors);
    restoredNavigation.setLoadedChunks(restoredCellBlock.chunkPositions);
    expect(restoredCellBlock.doors.getById('cell-door-2')?.state).toBe('open'); // fresh, pre-restriction baseline

    const restoredSectors = new SecuritySectorRegistry(restoredCellBlock.doors);
    restoredSectors.register({ ...sectorDefinition, doorIds: ['cell-door-2'], postTile: restoredCellBlock.cellTiles[2]!, patrolRoute: [restoredCellBlock.corridorTiles[2]!, restoredCellBlock.corridorTiles[3]!] });
    restoredSectors.register({ id: 'block-far', gradeId: 'grade.general', doorIds: ['cell-door-3'], postTile: restoredCellBlock.cellTiles[3]! });
    restoredSectors.loadSnapshot(sectorSnapshot);

    const restoredGuards = new GuardRoster(64);
    restoredGuards.loadSnapshot(guardSnapshot);

    // The stale in-flight patrol leg is dropped back to 'on-post' on restore
    // (GuardRoster.loadSnapshot) so PatrolSystem re-requests it here rather
    // than waiting forever on a request id the fresh NavigationSystem never received.
    expect(restoredGuards.getDeploymentPhase(g1)).toBe('on-post');
    expect(restoredGuards.getPathRequestId(g1)).toBeUndefined();
    expect(restoredGuards.getDeploymentPhase(g2)).toBe('unassigned');
    expect(restoredSectors.getControlState('block-a')).toBe('restricted');
    expect(restoredCellBlock.doors.getById('cell-door-2')?.state).toBe('closed'); // cascade reapplied from the correct pre-restriction baseline, onto the freshly re-registered sector

    const restoredDeployment = new DeploymentSystem(restoredSectors, restoredGuards, restoredNavigation, schedules);
    const restoredPatrol = new PatrolSystem(restoredSectors, restoredGuards, restoredNavigation);
    const restoredKernel = new Kernel();
    restoredKernel.registerSystem(restoredNavigation);
    restoredKernel.registerSystem(restoredDeployment);
    restoredKernel.registerSystem(restoredPatrol);

    for (let i = 0; i < 2_000 && restoredPatrol.getMetrics().loopsCompletedOnTime + restoredPatrol.getMetrics().loopsCompletedLate < 1; i += 1) restoredKernel.step();

    expect(restoredPatrol.getMetrics().loopsCompletedOnTime + restoredPatrol.getMetrics().loopsCompletedLate).toBeGreaterThanOrEqual(1);
    expect(restoredPatrol.getMetrics().loopsMissed).toBe(0);
    expect(restoredDeployment.getCoverageReport(0)).toEqual([
      { sectorId: 'block-a', required: 1, assigned: 1, shortage: 0 },
      { sectorId: 'block-far', required: 0, assigned: 0, shortage: 0 },
    ]);
  });
});
