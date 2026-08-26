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
 *
 * ## The half this file said "full restore" about and never performed (#375)
 *
 * `DeploymentSystem` and `PatrolSystem` each own a `loadSnapshot`, each is
 * called by exactly one place in `src/` -- `restoreSimulationRuntime` in
 * `src/simulation/runtime/session-systems.ts` -- and, until this change,
 * **by nothing in `tests/` at all**. The case below constructs both restored
 * systems fresh and never hands either one a snapshot, so the counters it
 * then reads start at zero because they were never loaded, not because a
 * restore preserved a zero.
 *
 * Measured at v0.0.98, on the mutation each method's own body names as its
 * subject: replacing `PatrolSystem.loadSnapshot`'s three assignments with
 * `return;` left the whole suite green -- **217 files / 2,463 tests**,
 * `pnpm vitest run` -- and so did replacing `DeploymentSystem.loadSnapshot`'s
 * single assignment, each measured alone and both measured together. Both are
 * player-visible: `patrolMetrics` and `deploymentMetrics` reach the Staff and
 * Security panels through `src/simulation/presentation/staff-projection.ts`,
 * and `src/persistence/save-schema.ts` validates both sections of every save,
 * so a restore that dropped them would show a loaded prison a patrol record
 * of nothing having ever happened.
 *
 * The session-level guards do not cover it either, and the reason is the
 * shape issue #375 is about rather than an oversight in any one of them:
 * `tests/helpers/determinism-state.ts`'s `carriedScopeState` -- what the
 * save/restore comparisons hash -- deliberately omits both metric surfaces
 * (`fullRuntimeState`, which does include them, compares two *live* runs);
 * and `snapshot-restore-fidelity.test.ts`'s bundle comparison names its
 * fields one at a time and names neither `security.patrol` nor
 * `security.deployment`, while its fixed-point half compares one restored
 * bundle against another restored bundle, which a no-op restore satisfies at
 * zero.
 */
describe('security snapshot/restore: sector control state and guard roster together', () => {
  it('resumes an interrupted patrol, preserves the restricted override and the still-unassigned guard after a full restore, except for the two metric surfaces below', () => {
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
    // Narrower than it reads, and permanently true as read that way: this is a
    // patrol system that was *never given a snapshot*, so the zero is "no loop
    // has been missed since this object was constructed" and says nothing about
    // whether a restore carries the counter. The case below is the one that
    // does. See the file comment for the measurement.
    expect(restoredPatrol.getMetrics().loopsMissed).toBe(0);
    expect(restoredDeployment.getCoverageReport(0)).toEqual([
      { sectorId: 'block-a', required: 1, assigned: 1, shortage: 0 },
      { sectorId: 'block-far', required: 0, assigned: 0, shortage: 0 },
    ]);
  });
});

/**
 * The two `loadSnapshot`s the case above never calls, driven directly.
 *
 * Both halves are here on purpose and neither replaces the other. A running
 * fixture proves the state is one a real session reaches -- a counter nothing
 * hand-wrote, moved by real patrol legs -- but a short run leaves
 * `loopsCompletedLate`, `loopsMissed` and `deploymentFailures` at zero, so it
 * cannot tell a `loadSnapshot` that assigns all three counters from one that
 * assigns `loopsCompletedOnTime` three times. The literal donors settle that:
 * three distinct non-zero patrol counters and a distinct
 * `deploymentFailures`, written out here rather than read back from anything,
 * so dropping a field or transposing two fails.
 */
describe('the patrol and deployment counters a restore is given', () => {
  /** A fixture whose patrol really completes legs, so the donor below is a state a session reaches. */
  function patrollingSession(): { readonly patrol: PatrolSystem; readonly deployment: DeploymentSystem; readonly step: () => void } {
    const cellBlock = buildCellBlockFixture(12);
    const navigation = new NavigationSystem(cellBlock.world, { workBudgetPerTick: 2_000, agingIntervalTicks: 10, flowFieldActivationThreshold: 100 }, cellBlock.doors);
    navigation.setLoadedChunks(cellBlock.chunkPositions);

    const sectors = new SecuritySectorRegistry(cellBlock.doors);
    sectors.register({
      id: 'block-a', gradeId: 'grade.general', doorIds: ['cell-door-2'], postTile: cellBlock.cellTiles[2]!,
      patrolRoute: [cellBlock.corridorTiles[2]!, cellBlock.corridorTiles[3]!], expectedPatrolLoopTicks: 1_000,
    });

    const guards = new GuardRoster(64);
    const deployment = new DeploymentSystem(sectors, guards, navigation, [constantDeploymentSchedule('block-a', 1)]);
    const patrol = new PatrolSystem(sectors, guards, navigation);

    const kernel = new Kernel();
    kernel.registerSystem(navigation);
    kernel.registerSystem(deployment);
    kernel.registerSystem(patrol);
    guards.hire('staff-role.guard', cellBlock.canteenTiles[0]!);

    return { patrol, deployment, step: () => kernel.step() };
  }

  it('carries a patrol record a real session earned onto a system that has none', () => {
    const source = patrollingSession();
    for (let i = 0; i < 2_000 && source.patrol.getMetrics().loopsCompletedOnTime + source.patrol.getMetrics().loopsCompletedLate < 2; i += 1) source.step();

    const donor = source.patrol.getSnapshot();
    // Non-vacuity, in the direction that matters: the donor is not the value a
    // fresh `PatrolSystem` already holds, so adopting it is observable.
    expect(donor.metrics.loopsCompletedOnTime + donor.metrics.loopsCompletedLate).toBeGreaterThanOrEqual(2);

    const restored = patrollingSession();
    expect(restored.patrol.getMetrics()).toEqual({ loopsCompletedOnTime: 0, loopsCompletedLate: 0, loopsMissed: 0 });

    restored.patrol.loadSnapshot(donor);
    expect(restored.patrol.getMetrics()).toEqual(donor.metrics);

    // And the record keeps accumulating from what it was handed rather than
    // restarting: a restored prison's patrol history is the prison's, not the
    // session's.
    for (let i = 0; i < 2_000 && restored.patrol.getMetrics().loopsCompletedOnTime + restored.patrol.getMetrics().loopsCompletedLate < donor.metrics.loopsCompletedOnTime + donor.metrics.loopsCompletedLate + 1; i += 1) restored.step();
    expect(restored.patrol.getMetrics().loopsCompletedOnTime + restored.patrol.getMetrics().loopsCompletedLate).toBeGreaterThan(
      donor.metrics.loopsCompletedOnTime + donor.metrics.loopsCompletedLate,
    );
  });

  it('adopts every counter it is handed, each to its own value', () => {
    // Three different non-zero numbers, so no assignment can stand in for
    // another. `loopsCompletedLate` and `loopsMissed` are reachable states --
    // `security-patrol.test.ts` drives a late loop and a missed one through the
    // real systems -- so this is a document a save can carry.
    const restored = patrollingSession();
    restored.patrol.loadSnapshot({ metrics: { loopsCompletedOnTime: 4, loopsCompletedLate: 3, loopsMissed: 2 } });
    expect(restored.patrol.getMetrics()).toEqual({ loopsCompletedOnTime: 4, loopsCompletedLate: 3, loopsMissed: 2 });

    expect(restored.deployment.getMetrics()).toEqual({ deploymentFailures: 0 });
    restored.deployment.loadSnapshot({ metrics: { deploymentFailures: 5 } });
    expect(restored.deployment.getMetrics()).toEqual({ deploymentFailures: 5 });
  });
});
