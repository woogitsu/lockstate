import { describe, expect, it } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { NavigationSystem } from '../../src/simulation/navigation/navigation-system';
import { buildCellBlockFixture } from '../helpers/navigation-fixture';
import { SecuritySectorRegistry } from '../../src/simulation/security/sector';
import { GuardRoster } from '../../src/simulation/security/guard-roster';
import { DeploymentSystem } from '../../src/simulation/security/deployment-system';
import { PatrolSystem } from '../../src/simulation/security/patrol-system';
import { constantDeploymentSchedule } from '../../src/simulation/security/deployment-schedule';

function buildScenario(cellCount = 12) {
  const cellBlock = buildCellBlockFixture(cellCount);
  const navigation = new NavigationSystem(cellBlock.world, { workBudgetPerTick: 2_000, agingIntervalTicks: 10, flowFieldActivationThreshold: 100 }, cellBlock.doors);
  navigation.setLoadedChunks(cellBlock.chunkPositions);

  const sectors = new SecuritySectorRegistry(cellBlock.doors);
  const guards = new GuardRoster(64);
  return { cellBlock, navigation, sectors, guards };
}

describe('PatrolSystem: guards loop a defined route through real navigation', () => {
  it('a deployed guard with a patrol route walks it and records completions, without ever teleporting off its post/waypoints', () => {
    const { cellBlock, navigation, sectors, guards } = buildScenario();
    // Cell 2 (north side, cell-door-2) is the post; the corridor tile in
    // front of it and cell 3's corridor tile form a two-waypoint loop --
    // deliberately not adjacent to the post so genuine travel happens.
    sectors.register({
      id: 'block-a', gradeId: 'grade.general', doorIds: ['cell-door-2'], postTile: cellBlock.cellTiles[2]!,
      patrolRoute: [cellBlock.corridorTiles[2]!, cellBlock.corridorTiles[3]!],
      expectedPatrolLoopTicks: 1_000,
    });

    const deployment = new DeploymentSystem(sectors, guards, navigation, [constantDeploymentSchedule('block-a', 1)]);
    const patrol = new PatrolSystem(sectors, guards, navigation);

    const kernel = new Kernel();
    kernel.registerSystem(navigation);
    kernel.registerSystem(deployment);
    kernel.registerSystem(patrol);

    const g1 = guards.hire('staff-role.guard', cellBlock.canteenTiles[0]!);

    let sawTravellingWithWaypoint = false;
    for (let i = 0; i < 3_000 && patrol.getMetrics().loopsCompletedOnTime + patrol.getMetrics().loopsCompletedLate < 2; i += 1) {
      kernel.step();
      if (guards.getDeploymentPhase(g1) === 'travelling' && guards.getPatrolWaypointIndex(g1) !== undefined) sawTravellingWithWaypoint = true;
    }

    expect(sawTravellingWithWaypoint).toBe(true); // genuinely walked the route, not an instant jump
    const metrics = patrol.getMetrics();
    expect(metrics.loopsCompletedOnTime + metrics.loopsCompletedLate).toBeGreaterThanOrEqual(2);
    expect(metrics.loopsMissed).toBe(0);
  });

  it('a sector with no patrolRoute gets static coverage only -- PatrolSystem leaves the guard on-post', () => {
    const { cellBlock, navigation, sectors, guards } = buildScenario();
    sectors.register({ id: 'block-b', gradeId: 'grade.general', doorIds: ['cell-door-4'], postTile: cellBlock.cellTiles[4]! });

    const deployment = new DeploymentSystem(sectors, guards, navigation, [constantDeploymentSchedule('block-b', 1)]);
    const patrol = new PatrolSystem(sectors, guards, navigation);

    const kernel = new Kernel();
    kernel.registerSystem(navigation);
    kernel.registerSystem(deployment);
    kernel.registerSystem(patrol);

    const g1 = guards.hire('staff-role.guard', cellBlock.canteenTiles[0]!);
    for (let i = 0; i < 500; i += 1) kernel.step();

    expect(guards.getDeploymentPhase(g1)).toBe('on-post');
    expect(guards.getTile(g1)).toEqual(cellBlock.cellTiles[4]);
    expect(patrol.getMetrics()).toEqual({ loopsCompletedOnTime: 0, loopsCompletedLate: 0, loopsMissed: 0 });
  });

  it('a completed loop past its expected budget is recorded late, not on-time', () => {
    const { cellBlock, navigation, sectors, guards } = buildScenario();
    sectors.register({
      id: 'block-c', gradeId: 'grade.general', doorIds: ['cell-door-6'], postTile: cellBlock.cellTiles[6]!,
      patrolRoute: [cellBlock.corridorTiles[6]!],
      expectedPatrolLoopTicks: 1, // unrealistically tight -- every real loop takes longer than 1 tick
    });

    const deployment = new DeploymentSystem(sectors, guards, navigation, [constantDeploymentSchedule('block-c', 1)]);
    const patrol = new PatrolSystem(sectors, guards, navigation);

    const kernel = new Kernel();
    kernel.registerSystem(navigation);
    kernel.registerSystem(deployment);
    kernel.registerSystem(patrol);

    guards.hire('staff-role.guard', cellBlock.canteenTiles[0]!);
    for (let i = 0; i < 800 && patrol.getMetrics().loopsCompletedOnTime + patrol.getMetrics().loopsCompletedLate < 1; i += 1) kernel.step();

    expect(patrol.getMetrics().loopsCompletedLate).toBeGreaterThanOrEqual(1);
    expect(patrol.getMetrics().loopsCompletedOnTime).toBe(0);
  });

  it('a patrol leg blocked by a lockdown records a missed loop and retries from the post afterwards', () => {
    const { cellBlock, navigation, sectors, guards } = buildScenario();
    sectors.register({
      id: 'block-d', gradeId: 'grade.general', doorIds: ['cell-door-8'], postTile: cellBlock.cellTiles[8]!,
      patrolRoute: [cellBlock.corridorTiles[8]!, cellBlock.corridorTiles[9]!],
      expectedPatrolLoopTicks: 1_000,
    });

    const deployment = new DeploymentSystem(sectors, guards, navigation, [constantDeploymentSchedule('block-d', 1)]);
    const patrol = new PatrolSystem(sectors, guards, navigation);

    const kernel = new Kernel();
    kernel.registerSystem(navigation);
    kernel.registerSystem(deployment);
    kernel.registerSystem(patrol);

    const g1 = guards.hire('staff-role.guard', cellBlock.canteenTiles[0]!);
    // Let the guard deploy and start patrolling first.
    for (let i = 0; i < 300; i += 1) kernel.step();
    expect(guards.getSectorId(g1)).toBe('block-d');

    // Now seal the guard's own post door behind it -- the next leg back to post fails.
    cellBlock.doors.setState('cell-door-8', 'locked');
    for (let i = 0; i < 500 && patrol.getMetrics().loopsMissed < 1; i += 1) kernel.step();

    expect(patrol.getMetrics().loopsMissed).toBeGreaterThanOrEqual(1);
  });
});
