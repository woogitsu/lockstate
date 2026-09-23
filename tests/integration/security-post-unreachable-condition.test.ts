import { describe, expect, it } from 'vitest';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { projectStatusCounts } from '../../src/simulation/worker/status-counts';
import { projectStatusMetrics } from '../../src/ui/hud/projection';
import { hudCountsFromWorkerMessage } from '../../src/ui/simulation-counts';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { NavigationSystem } from '../../src/simulation/navigation/navigation-system';
import { constantDeploymentSchedule, type DeploymentSchedule } from '../../src/simulation/security/deployment-schedule';
import { DeploymentSystem } from '../../src/simulation/security/deployment-system';
import { createGuardLocomotionSystem, type PatrolArrivalSink } from '../../src/simulation/security/guard-locomotion';
import { GuardRoster } from '../../src/simulation/security/guard-roster';
import { SecuritySectorRegistry } from '../../src/simulation/security/sector';
import { buildCellBlockFixture } from '../helpers/navigation-fixture';
import { wallRoomPerimeter } from '../helpers/room-walls';

/** No sector here defines a `patrolRoute`, so a walk never belongs to a patrol leg -- this sink is never called and exists only to satisfy `createGuardLocomotionSystem`'s signature. */
const NO_PATROL: PatrolArrivalSink = { onArrivedAtLegTarget: () => {} };

/**
 * [ADR 0117](../../docs/adr/0117-what-happens-when-a-guards-post-is-walled-in.md),
 * **accepted by the owner on 2026-09-17, option 3 -- "say it"**: a prison
 * whose guard post cannot be routed to says so, on a surface a player is
 * already looking at, and stops saying so when they open the way back.
 *
 * ## What this file drives, and why it is not a unit test of the predicate
 *
 * The whole scenario runs through `createNewSimulationRuntime`: the real
 * kernel, the real command handler (`ZoneRoom`, `PlaceObject`,
 * `PurchaseMaterials`, `PlaceBuildOrder`, `HireStaff`, `AdmitPrisoner`,
 * `RemoveWall`), the real `NavigationSystem` and the real `DeploymentSystem`
 * cadence, and then the real projection and the real HUD mapping on top of
 * it. `DeploymentSystem.hasUnreachablePost` called directly with a
 * hand-built registry would prove that function works and would say nothing
 * about whether four ordinary build presses can reach the state -- which is
 * the half ADR 0117 §1a had to measure before any option could be priced.
 *
 * ## The four segments, which is the correction ADR 0117 §1a is about
 *
 * A wall in this simulation is an **edge**, not a tile, so sealing (16, 16)
 * takes the four edges bounding it: `north` and `west` of (16, 16), `north`
 * of (16, 17) and `west` of (17, 16). ADR 0036 open question 1 described this
 * as *"a wall at (16, 16)"*, and one, two or three of those edges leave the
 * post perfectly walkable. `SEALING` below is those four in that order, and
 * the first test walks all four counts rather than asserting the fourth
 * alone -- a condition that fired at three would be firing on something other
 * than the post being sealed.
 *
 * ## Every wall here is built by a real command, deliberately
 *
 * ADR 0117 §1d records the trap: `RemoveWall` resolves a press to *the
 * completed build order claiming that edge*
 * (`ConstructionSystem.completedOrderClaimingEdge`), so an edge written
 * straight into the layer by a fixture has no order behind it and is refused
 * `remove-wall.nothing-to-remove`. The cell's own perimeter uses
 * `wallRoomPerimeter` because this file never takes it down; the four
 * sealing segments never do.
 *
 * ## Mutate the production code and watch this go red before trusting it green
 *
 * Done by hand while writing this file; both outputs are in the report.
 * Reverting `hasUnreachablePost`'s conjunct 2 to read `deploymentFailures >
 * 0` -- the lifetime counter ADR 0117 §3 rules out by name -- passes
 * `'fires'` and fails `'clears'`, because that counter never decreases.
 * Reverting conjunct 4 from `hasPostEligibleGuard` to `claimableGuardIds`
 * passes both and fails `'does not flicker'` at 100 of 200 ticks.
 */

const CELL = { x: 10, y: 20, width: 2, height: 3 } as const;

/** The four edges that bound `NEW_PRISON_ORIGIN_TILE` (16, 16) -- the derived sector's post tile. */
const SEALING = [
  { x: 16, y: 16, edge: 'north' },
  { x: 16, y: 16, edge: 'west' },
  { x: 16, y: 17, edge: 'north' },
  { x: 17, y: 16, edge: 'west' },
] as const;

const CONDITION = 'security.post-unreachable';

interface Session {
  readonly runtime: SimulationRuntime;
  send(command: SimulationCommand): void;
  run(ticks: number): void;
}

function createSession(seed = 0x396): Session {
  const runtime = createNewSimulationRuntime(seed);
  let sequence = 0;
  const send = (command: SimulationCommand): void => {
    runtime.kernel.submitCommand(`cmd-${String(sequence)}`, sequence, runtime.kernel.tick, packCommand(command));
    sequence += 1;
    runtime.kernel.step();
  };
  const run = (ticks: number): void => {
    for (let step = 0; step < ticks; step += 1) runtime.kernel.step();
  };
  return { runtime, send, run };
}

/**
 * A prison with somewhere to sleep, bricks in stock, `segments` of the post's
 * boundary built by real presses, one guard hired **after** they are up, and
 * one prisoner so the sector's requirement is not the empty-sector zero
 * (issue #533's exemption).
 *
 * The hire comes last on purpose: a guard hired first walks to the post
 * before the walls exist and is then sealed *in* rather than out, which is a
 * different state and not the one ADR 0036 open question 1 describes.
 */
function sealedPrison(segments: number): Session {
  const session = createSession();
  const { runtime, send, run } = session;

  wallRoomPerimeter(runtime.world, CELL, { doors: runtime.navigation.doors });
  send({ type: 'ZoneRoom', roomId: 'room.cell', ...CELL });
  send({ type: 'PlaceObject', orderId: 'bed', definitionId: 'bed-wooden', x: CELL.x, y: CELL.y });
  send({ type: 'PurchaseMaterials', orderId: 'bricks', itemId: 'item.brick', quantity: 24 });
  run(600);

  for (let index = 0; index < segments; index += 1) {
    const segment = SEALING[index]!;
    send({ type: 'PlaceBuildOrder', orderId: `seal-${String(index)}`, definitionId: 'wall-brick', ...segment });
  }
  run(900);

  send({ type: 'HireStaff', staffRoleId: 'staff-role.guard', x: 0, y: 0 });
  send({ type: 'AdmitPrisoner', priorIncidents: 0, x: 12, y: 20 });
  run(600);

  // A refused command would make every reading below a measurement of a
  // different prison, so it is checked rather than assumed.
  expect(runtime.refusals.count, 'the fixture must build the prison it says it builds').toBe(0);
  return session;
}

/** The condition as the wire carries it -- through the real projection, never off the system. */
function publishedConditions(runtime: SimulationRuntime): readonly string[] {
  return projectStatusCounts(runtime, runtime.kernel.tick).conditions ?? [];
}

/** The `COVERAGE` chip as the status strip would paint it, through the real HUD mapping. */
function coverageChip(runtime: SimulationRuntime) {
  const counts = projectStatusCounts(runtime, runtime.kernel.tick);
  const viewModel = hudCountsFromWorkerMessage({
    kind: 'simulation/status-counts',
    payload: { tick: runtime.kernel.tick, counts },
  } as never);
  if (viewModel === undefined || viewModel === 'none') throw new Error('the worker message must produce a counts view model');
  const chip = projectStatusMetrics(viewModel).find((metric) => metric.id === 'coverage');
  if (chip === undefined) throw new Error('the status strip must still carry a coverage chip');
  return chip;
}

describe('a guard post nothing can route to is reported (ADR 0117)', () => {
  it('fires on the fourth sealing segment and on none of the first three', () => {
    for (const segments of [1, 2, 3] as const) {
      const { runtime } = sealedPrison(segments);
      expect(
        runtime.securityGuards.getDeploymentPhase(0),
        `${String(segments)} of the four bounding edges must leave the post walkable`,
      ).toBe('on-post');
      expect(publishedConditions(runtime), `${String(segments)} segments must not raise the condition`).not.toContain(CONDITION);
    }

    const { runtime } = sealedPrison(4);
    expect(runtime.securityGuards.getDeploymentPhase(0), 'the fourth segment strands the guard').toBe('unassigned');
    expect(
      runtime.deploymentSystem.getMetrics().deploymentFailures,
      'the route really is failing, rather than the guard simply being slow',
    ).toBeGreaterThan(0);
    expect(publishedConditions(runtime), 'the sealed post is published as a standing condition').toContain(CONDITION);
  });

  it('does not flicker, which is the defect it exists to stop reproducing', () => {
    const { runtime, run } = sealedPrison(4);

    // ADR 0117 §1b: `shortage`, and the strip's own coverage counts with it,
    // alternate on the ten-tick deployment cadence -- so a condition read off
    // either of them would blink the chip between two different sentences
    // twice a second. Both are counted here, so the contrast is measured in
    // one run rather than asserted from the ADR.
    let conditionTicks = 0;
    let coveredTicks = 0;
    const samples = 200;
    for (let sample = 0; sample < samples; sample += 1) {
      runtime.kernel.step();
      if (publishedConditions(runtime).includes(CONDITION)) conditionTicks += 1;
      if (projectStatusCounts(runtime, runtime.kernel.tick).prisonersUnguarded === 0) coveredTicks += 1;
    }

    expect(conditionTicks, 'the condition holds on every tick the post is sealed').toBe(samples);
    expect(coveredTicks, 'the coverage ladder underneath it does not, which is why the condition was needed').toBeGreaterThan(0);
    expect(coveredTicks).toBeLessThan(samples);
  });

  it('clears when one of the four walls comes down, through the real RemoveWall command', () => {
    const { runtime, send } = sealedPrison(4);
    expect(publishedConditions(runtime), 'the condition must stand before removal can clear it').toContain(CONDITION);
    const failuresWhileSealed = runtime.deploymentSystem.getMetrics().deploymentFailures;

    // One of the four, not all four: the hint this condition paints says that
    // taking down *a* wall beside the post opens the way back, and a test
    // that removed all four would not have proven that sentence.
    send({ type: 'RemoveWall', ...SEALING[0] });

    // **Every tick of the recovery is sampled, not only the end of it**, and
    // this is the assertion that pins the condition to a level rather than to
    // a counter. Between the press and the guard arriving there is a stretch
    // in which nobody is on post, guards are on the roster and the sector
    // still asks for one -- three of the four conjuncts -- and the only thing
    // saying the post is fine is that the route now succeeds. A predicate
    // reading `deploymentFailures > 0` instead satisfies all four for that
    // whole stretch and prints *"No guard can reach the post"* over a guard
    // visibly walking to it.
    let travellingTicks = 0;
    let conditionDuringRecovery = 0;
    for (let step = 0; step < 600; step += 1) {
      runtime.kernel.step();
      if (runtime.securityGuards.getDeploymentPhase(0) !== 'on-post') travellingTicks += 1;
      if (publishedConditions(runtime).includes(CONDITION)) conditionDuringRecovery += 1;
    }
    expect(travellingTicks, 'the recovery must really have a walk in it for the sampling to mean anything').toBeGreaterThan(0);

    /*
     * **Not zero, and the residue is exactly one deployment cadence.** The
     * condition is a level over route outcomes, and no route is attempted
     * between the press and the next `assignUnassignedGuards` pass, so for
     * that one interval the system genuinely has not yet learned the wall is
     * gone. Closing it would take a re-derivation triggered by a world
     * change, which is ADR 0117 option 2's machinery and a reversal of ADR
     * 0036 decision 4 -- not something option 3 buys.
     *
     * Measured on seed `0x396`: **74** ticks when the level was cleared only
     * on arrival at the post, **10** once the successful route branch clears
     * it too. The bound is read off the system's own schedule rather than
     * written as a literal, so a change to the cadence moves the bound with
     * it instead of going red for the wrong reason.
     */
    const cadence = runtime.deploymentSystem.schedule.intervalTicks;
    expect(
      conditionDuringRecovery,
      'once a route to the post succeeds nothing may still call it unreachable, beyond the one cadence before any route is tried',
    ).toBeLessThanOrEqual(cadence);
    expect(conditionDuringRecovery, 'and it must be over long before the walk is').toBeLessThan(travellingTicks);

    expect(runtime.refusals.count, 'RemoveWall must be accepted -- see the fixture note about fixture-written edges').toBe(0);
    expect(runtime.securityGuards.getDeploymentPhase(0), 'the guard walks to the post once one edge is open').toBe('on-post');
    expect(publishedConditions(runtime), 'the condition clears, which a lifetime counter could never do').not.toContain(CONDITION);
    expect(
      runtime.deploymentSystem.getMetrics().deploymentFailures,
      'the lifetime counter is still standing where it was -- the condition is not read off it',
    ).toBeGreaterThanOrEqual(failuresWhileSealed);
  });

  it('is not raised by a prison that has simply hired nobody', () => {
    const session = createSession();
    const { runtime, send, run } = session;
    wallRoomPerimeter(runtime.world, CELL, { doors: runtime.navigation.doors });
    send({ type: 'ZoneRoom', roomId: 'room.cell', ...CELL });
    send({ type: 'PlaceObject', orderId: 'bed', definitionId: 'bed-wooden', x: CELL.x, y: CELL.y });
    send({ type: 'PurchaseMaterials', orderId: 'bricks', itemId: 'item.brick', quantity: 24 });
    run(600);
    for (let index = 0; index < SEALING.length; index += 1) {
      const segment = SEALING[index]!;
      send({ type: 'PlaceBuildOrder', orderId: `seal-${String(index)}`, definitionId: 'wall-brick', ...segment });
    }
    run(900);
    send({ type: 'AdmitPrisoner', priorIncidents: 0, x: 12, y: 20 });
    run(600);

    // The post is just as sealed; what is missing is anybody who could take
    // it. The true sentence for this prison is "hire a guard", which the
    // coverage chip's `unguarded` rung already says.
    expect(publishedConditions(runtime), 'a prison with no guards is understaffed, not cut off').not.toContain(CONDITION);
  });

  it('takes the COVERAGE chip off "Covered" and gives it the sentence', () => {
    const sealed = sealedPrison(4);
    const chip = coverageChip(sealed.runtime);

    expect(chip.badge?.textKey, 'the badge states the condition in the chip itself').toBe('hud.security.post-unreachable');
    expect(chip.tone, 'and carries the tone the strip reserves for an operational failure').toBe('danger');
    expect(chip.description?.textKey, 'the sentence rides the chip title and its screen-reader text').toBe(
      'hud.security.post-unreachable-hint',
    );

    // ADR 0117 §4's second decision, measured rather than argued: without
    // this, the badge beside a permanently unguarded prison reads "Covered"
    // on half of all ticks.
    const walkable = sealedPrison(3);
    //
    // **Read `'hud.security.coverage-met'` and "says nothing extra" until ADR
    // 0095 decision 1 (2026-09-23).** The ladder this prison keeps now has a
    // reserve rung, and a walkable prison with its post filled and fewer than
    // five guards free is on it -- so the assertion is what it always meant:
    // the ladder's word and the ladder's sentence, not the stranded post's.
    expect(coverageChip(walkable.runtime).badge?.textKey, 'an unsealed prison keeps the ladder it always had').toBe(
      'hud.security.coverage-stretched',
    );
    expect(coverageChip(walkable.runtime).description, 'and says nothing about a post').toEqual({
      textKey: 'hud.security.coverage-stretched-description',
    });
  });
});

/**
 * The fourth conjunct of `hasUnreachablePost` that the prison above cannot
 * reach: **a sector whose post is manned and whose *second* guard cannot get
 * to it**.
 *
 * ## Why this one has a narrower rig, and what it still drives
 *
 * The derived sector asks for one guard per eight occupants
 * (`DEFAULT_SECTOR_PRISONERS_PER_GUARD`), so reaching a requirement of two
 * through `createNewSimulationRuntime` means housing nine prisoners -- nine
 * beds, their materials and their intake -- to exercise one boolean. This
 * still runs the **real** `Kernel`, the real `NavigationSystem` over a real
 * world fixture, the real `GuardRoster`, the real `DeploymentSystem` cadence
 * and the real guard locomotion; what it does not stand up is the economy and
 * the intake pipeline, which have nothing to say about this conjunct.
 *
 * **Mutation-tested.** Deleting the `hasGuardOnPost` line from
 * `hasUnreachablePost` leaves every test in the file above green and turns
 * this one red -- which is why it exists: without it the condition prints
 * *"nobody is on duty"* over a post somebody is standing on.
 */
describe('a post that is manned is not reported as unreachable (ADR 0117)', () => {
  it('stays silent while one guard holds the post and a second cannot be routed to it', () => {
    const cellBlock = buildCellBlockFixture(12);
    const navigation = new NavigationSystem(
      cellBlock.world,
      { workBudgetPerTick: 2_000, agingIntervalTicks: 10, flowFieldActivationThreshold: 100 },
      cellBlock.doors,
    );
    navigation.setLoadedChunks(cellBlock.chunkPositions);

    const sectors = new SecuritySectorRegistry(cellBlock.doors);
    const postTile = cellBlock.cellTiles[1]!;
    sectors.register({ id: 'security-office', gradeId: 'grade.general', doorIds: ['cell-door-1'], postTile });

    const guards = new GuardRoster(64);
    // Mutable on purpose: the requirement rises after the first guard is in,
    // which is the only ordering that produces "manned, and short by one".
    const schedules: DeploymentSchedule[] = [constantDeploymentSchedule('security-office', 1)];
    const deployment = new DeploymentSystem(sectors, guards, navigation, schedules);

    const kernel = new Kernel();
    kernel.registerSystem(navigation);
    kernel.registerSystem(createGuardLocomotionSystem(guards, navigation, deployment, NO_PATROL));
    kernel.registerSystem(deployment);

    const first = guards.hire('staff-role.guard', cellBlock.canteenTiles[0]!);
    for (let step = 0; step < 400; step += 1) kernel.step();
    expect(guards.getDeploymentPhase(first), 'the first guard must actually reach the post').toBe('on-post');

    schedules[0] = constantDeploymentSchedule('security-office', 2);
    const second = guards.hire('staff-role.guard', cellBlock.canteenTiles[0]!);
    // `cell-door-1` is the sole passage into the post's region, so locking it
    // is a real route failure rather than a stubbed one.
    cellBlock.doors.setState('cell-door-1', 'locked');
    for (let step = 0; step < 400; step += 1) kernel.step();

    expect(
      deployment.getMetrics().deploymentFailures,
      'the second guard must really be failing to route, or this proves nothing',
    ).toBeGreaterThan(0);
    expect(guards.getDeploymentPhase(second), 'and must not have got there').not.toBe('on-post');
    expect(guards.getDeploymentPhase(first), 'while the first is still standing on the post').toBe('on-post');

    expect(
      deployment.hasUnreachablePost(kernel.tick),
      'a post somebody is standing on is not a post nobody can reach -- the sentence would be false',
    ).toBe(false);
  });

  /**
   * The remaining conjunct: **a sector that has stopped asking for anybody**.
   *
   * `resolveOccupancyScaledGuardCount` answers `0` for the derived sector of
   * an empty prison (issue #533's exemption), so a prison whose last prisoner
   * leaves stops having a post to fail to man -- and the failed route that is
   * still on the level from when it did must not keep printing a sentence
   * about it.
   *
   * **Mutation-tested.** Deleting the `requiredGuardCountFor(...) <= 0` line
   * from `hasUnreachablePost` leaves every other test in this file green and
   * turns this one red.
   */
  it('stops reporting once the sector asks for nobody', () => {
    const cellBlock = buildCellBlockFixture(12);
    const navigation = new NavigationSystem(
      cellBlock.world,
      { workBudgetPerTick: 2_000, agingIntervalTicks: 10, flowFieldActivationThreshold: 100 },
      cellBlock.doors,
    );
    navigation.setLoadedChunks(cellBlock.chunkPositions);

    const sectors = new SecuritySectorRegistry(cellBlock.doors);
    sectors.register({ id: 'security-office', gradeId: 'grade.general', doorIds: ['cell-door-1'], postTile: cellBlock.cellTiles[1]! });

    const guards = new GuardRoster(64);
    const schedules: DeploymentSchedule[] = [constantDeploymentSchedule('security-office', 1)];
    const deployment = new DeploymentSystem(sectors, guards, navigation, schedules);

    const kernel = new Kernel();
    kernel.registerSystem(navigation);
    kernel.registerSystem(createGuardLocomotionSystem(guards, navigation, deployment, NO_PATROL));
    kernel.registerSystem(deployment);

    cellBlock.doors.setState('cell-door-1', 'locked');
    guards.hire('staff-role.guard', cellBlock.canteenTiles[0]!);
    for (let step = 0; step < 400; step += 1) kernel.step();

    expect(deployment.getMetrics().deploymentFailures, 'the route must really be failing first').toBeGreaterThan(0);
    expect(deployment.hasUnreachablePost(kernel.tick), 'while the sector still asks for a guard, it is reported').toBe(true);

    schedules[0] = constantDeploymentSchedule('security-office', 0);
    expect(
      deployment.hasUnreachablePost(kernel.tick),
      'a sector asking for nobody has no post to fail to man, whatever the last route did',
    ).toBe(false);
  });
});
