import { describe, expect, it } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { NavigationSystem } from '../../src/simulation/navigation/navigation-system';
import { buildCellBlockFixture } from '../helpers/navigation-fixture';
import { SecuritySectorRegistry } from '../../src/simulation/security/sector';
import { GuardRoster } from '../../src/simulation/security/guard-roster';
import { DeploymentSystem } from '../../src/simulation/security/deployment-system';
import { constantDeploymentSchedule, type DeploymentSchedule } from '../../src/simulation/security/deployment-schedule';

/**
 * `cell-door-1` (fixture-authored: state 'open', requiredSecurityClearance
 * 1, no permission -- see `buildCellBlockFixture`) is the *sole* passage
 * into `cellTiles[1]`, its own region reachable from the corridor through
 * exactly that one door -- a reliable single point of failure to lock,
 * unlike the fixture's fully-open, multiply-connected canteen interior.
 */
function buildScenario(cellCount = 12) {
  const cellBlock = buildCellBlockFixture(cellCount);
  const navigation = new NavigationSystem(cellBlock.world, { workBudgetPerTick: 2_000, agingIntervalTicks: 10, flowFieldActivationThreshold: 100 }, cellBlock.doors);
  navigation.setLoadedChunks(cellBlock.chunkPositions);

  const sectors = new SecuritySectorRegistry(cellBlock.doors);
  sectors.register({ id: 'security-office', gradeId: 'grade.general', doorIds: ['cell-door-1'], postTile: cellBlock.cellTiles[1]! });

  const guards = new GuardRoster(64);
  return { cellBlock, navigation, sectors, guards };
}

describe('DeploymentSystem: deterministic assignment and no-teleport travel to post', () => {
  it('assigns the required number of guards (ascending id) and moves them to the post via real navigation', () => {
    const { cellBlock, navigation, sectors, guards } = buildScenario();
    const schedules: DeploymentSchedule[] = [constantDeploymentSchedule('security-office', 2)];
    const deployment = new DeploymentSystem(sectors, guards, navigation, schedules);

    const kernel = new Kernel();
    kernel.registerSystem(navigation);
    kernel.registerSystem(deployment);

    const g1 = guards.hire('staff-role.guard', cellBlock.canteenTiles[0]!);
    const g2 = guards.hire('staff-role.guard', cellBlock.canteenTiles[0]!);
    const g3 = guards.hire('staff-role.guard', cellBlock.canteenTiles[0]!); // surplus -- stays unassigned

    for (let i = 0; i < 400; i += 1) kernel.step();

    expect(guards.getDeploymentPhase(g1)).toBe('on-post');
    expect(guards.getDeploymentPhase(g2)).toBe('on-post');
    expect(guards.getDeploymentPhase(g3)).toBe('unassigned');
    expect(guards.getTile(g1)).toEqual(cellBlock.cellTiles[1]);
    expect(guards.getTile(g2)).toEqual(cellBlock.cellTiles[1]);

    const coverage = deployment.getCoverageReport(0);
    expect(coverage).toEqual([{ sectorId: 'security-office', required: 2, assigned: 2, shortage: 0 }]);
  });

  it('reports a shortage, without fabricating a guard, when fewer are hired than required', () => {
    const { cellBlock, navigation, sectors, guards } = buildScenario();
    const schedules: DeploymentSchedule[] = [constantDeploymentSchedule('security-office', 3)];
    const deployment = new DeploymentSystem(sectors, guards, navigation, schedules);

    const kernel = new Kernel();
    kernel.registerSystem(navigation);
    kernel.registerSystem(deployment);

    guards.hire('staff-role.guard', cellBlock.canteenTiles[0]!);
    for (let i = 0; i < 400; i += 1) kernel.step();

    expect(deployment.getCoverageReport(0)).toEqual([{ sectorId: 'security-office', required: 3, assigned: 1, shortage: 2 }]);
  });

  it('a sector with no matching schedule requires zero guards -- not an implicit assumption', () => {
    const { sectors, guards, navigation } = buildScenario();
    const deployment = new DeploymentSystem(sectors, guards, navigation, []);
    expect(deployment.getCoverageReport(0)).toEqual([{ sectorId: 'security-office', required: 0, assigned: 0, shortage: 0 }]);
  });

  it('required guard count varies by time of day per the deployment schedule', () => {
    const { sectors, guards, navigation } = buildScenario();
    const schedule: DeploymentSchedule = { sectorId: 'security-office', blocks: [
      { startTickOfDay: 0, endTickOfDay: 1_200, requiredGuardCount: 1 },
      { startTickOfDay: 1_200, endTickOfDay: 2_400, requiredGuardCount: 4 },
    ] };
    const deployment = new DeploymentSystem(sectors, guards, navigation, [schedule]);
    expect(deployment.getCoverageReport(0)[0]?.required).toBe(1);
    expect(deployment.getCoverageReport(1_200)[0]?.required).toBe(4);
  });

  it('a guard whose route to post is blocked is released back to unassigned, retryable rather than permanently lost', () => {
    const { cellBlock, navigation, sectors, guards } = buildScenario();
    cellBlock.doors.setState('cell-door-1', 'locked'); // the sole passage to the post -- now impassable without emergencyOverride
    const schedules: DeploymentSchedule[] = [constantDeploymentSchedule('security-office', 1)];
    const deployment = new DeploymentSystem(sectors, guards, navigation, schedules);

    const kernel = new Kernel();
    kernel.registerSystem(navigation);
    kernel.registerSystem(deployment);

    const g1 = guards.hire('staff-role.guard', cellBlock.canteenTiles[0]!);
    for (let i = 0; i < 300; i += 1) kernel.step();

    expect(guards.getDeploymentPhase(g1)).toBe('unassigned');
    expect(deployment.getMetrics().deploymentFailures).toBeGreaterThan(0);
  });
});
