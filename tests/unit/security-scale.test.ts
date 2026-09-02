import { describe, expect, it } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { NavigationSystem } from '../../src/simulation/navigation/navigation-system';
import { buildCellBlockFixture } from '../helpers/navigation-fixture';
import { SecuritySectorRegistry } from '../../src/simulation/security/sector';
import { GuardRoster } from '../../src/simulation/security/guard-roster';
import { DeploymentSystem } from '../../src/simulation/security/deployment-system';
import { PatrolSystem } from '../../src/simulation/security/patrol-system';
import { createGuardLocomotionSystem } from '../../src/simulation/security/guard-locomotion';
import { constantDeploymentSchedule, type DeploymentSchedule } from '../../src/simulation/security/deployment-schedule';

/**
 * Issue #26's "benchmark deployment matching and patrol updates at
 * representative staff counts" -- directional correctness-and-timing
 * evidence (no hard threshold, per `docs/BENCHMARKING.md`), not a
 * per-prisoner-scale (thousands) test: realistic guard counts are tens,
 * not thousands, so this proves deployment/patrol stay correct and fast at
 * a generous multiple of that (60 sectors, 120 guards).
 */
describe('security scale: many sectors deployed and patrolled concurrently', () => {
  it('deploys and patrols 120 guards across 60 sectors without pathological slowdown', () => {
    const sectorCount = 60;
    // buildCellBlockFixture gates every 5th cell (`i % 5 === 0`) behind a
    // 'medical-wing' permission a plain guard doesn't hold -- deliberately
    // excluded here so every sector this test creates is guard-accessible;
    // overshoot cellCount so `sectorCount` such indices still exist.
    const cellCount = Math.ceil(sectorCount * 1.3) + 5;
    const cellBlock = buildCellBlockFixture(cellCount);
    const navigation = new NavigationSystem(cellBlock.world, { workBudgetPerTick: 4_000, agingIntervalTicks: 10, flowFieldActivationThreshold: 8 }, cellBlock.doors);
    navigation.setLoadedChunks(cellBlock.chunkPositions);

    const guardAccessibleCellIndices: number[] = [];
    for (let i = 0; i < cellCount && guardAccessibleCellIndices.length < sectorCount; i += 1) {
      if (i % 5 !== 0) guardAccessibleCellIndices.push(i);
    }
    expect(guardAccessibleCellIndices).toHaveLength(sectorCount);

    const sectors = new SecuritySectorRegistry(cellBlock.doors);
    const schedules: DeploymentSchedule[] = [];
    for (const i of guardAccessibleCellIndices) {
      const sectorId = `sector-${i}`;
      sectors.register({
        id: sectorId,
        gradeId: 'grade.general',
        doorIds: [`cell-door-${i}`],
        postTile: cellBlock.cellTiles[i]!,
        patrolRoute: [cellBlock.corridorTiles[i]!],
        expectedPatrolLoopTicks: 2_000,
      });
      schedules.push(constantDeploymentSchedule(sectorId, 2));
    }

    const guards = new GuardRoster(256);
    const deployment = new DeploymentSystem(sectors, guards, navigation, schedules);
    const patrol = new PatrolSystem(sectors, guards, navigation);

    const kernel = new Kernel();
    kernel.registerSystem(navigation);
    kernel.registerSystem(createGuardLocomotionSystem(guards, navigation, deployment, patrol));
    kernel.registerSystem(deployment);
    kernel.registerSystem(patrol);

    const guardCount = sectorCount * 2;
    for (let i = 0; i < guardCount; i += 1) guards.hire('staff-role.guard', cellBlock.canteenTiles[0]!);

    const startedAt = performance.now();
    for (let i = 0; i < 3_000; i += 1) kernel.step();
    const wallMs = performance.now() - startedAt;
    console.log(`[security scale] sectors=${sectorCount} guards=${guardCount} wallMs=${wallMs.toFixed(1)} patrol=${JSON.stringify(patrol.getMetrics())}`);

    const coverage = deployment.getCoverageReport(0);
    expect(coverage.every((entry) => entry.shortage === 0)).toBe(true);
    expect(coverage).toHaveLength(sectorCount);

    const onPostCount = guards.allGuardIds().filter((id) => guards.getDeploymentPhase(id) !== 'unassigned').length;
    expect(onPostCount).toBe(guardCount);

    const metrics = patrol.getMetrics();
    expect(metrics.loopsCompletedOnTime + metrics.loopsCompletedLate).toBeGreaterThan(0);
    expect(metrics.loopsMissed).toBe(0);
  }, 30_000);
});
