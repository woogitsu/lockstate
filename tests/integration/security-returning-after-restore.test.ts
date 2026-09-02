import { describe, expect, it } from 'vitest';
import { defaultMessageCatalogEn } from '../../src/services/localization';
import { Localizer } from '../../src/services/localization';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { NavigationSystem } from '../../src/simulation/navigation/navigation-system';
import { projectStaff } from '../../src/simulation/presentation/staff-projection';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';
import { constantDeploymentSchedule } from '../../src/simulation/security/deployment-schedule';
import { DeploymentSystem } from '../../src/simulation/security/deployment-system';
import { createGuardLocomotionSystem } from '../../src/simulation/security/guard-locomotion';
import { GuardRoster } from '../../src/simulation/security/guard-roster';
import { PatrolSystem } from '../../src/simulation/security/patrol-system';
import { SecuritySectorRegistry, type SecuritySectorDefinition } from '../../src/simulation/security/sector';
import { staffRosterFromProjection } from '../../src/ui/simulation-staff-roster';
import { buildCellBlockFixture } from '../helpers/navigation-fixture';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **What a roster row says about a guard who was walking when the game was
 * saved** -- the owner's ruling 24 of 2026-08-31, and the question
 * `docs/research/2026-08-31-what-a-reload-keeps-and-what-it-says.md` §C.1
 * handed over rather than answered.
 *
 * That record measured the state this file is about, through every route in
 * `PROJECTION_CATALOG`, across a real save boundary:
 *
 * ```
 * [hud/staff] .view.roster.rows[0].assignment.deploymentPhase: "travelling" -> "on-post"
 * ```
 *
 * `GuardRoster.loadSnapshot` drops a `'travelling'` guard's path request --
 * it named a queue the previous `NavigationSystem` instance owned and no
 * fresh one will ever resolve it -- and settles the guard on `'on-post'`
 * when it has a sector. **That reset is not what these cases change.** What
 * they change is the word: the guard is standing wherever it had got to,
 * often nowhere near the post, and `On Post` is an assertion about a tile
 * the guard is not on.
 *
 * The word is the owner's: **Returning**. It is not a fifth
 * `DeploymentPhase` and nothing persists it -- see
 * `src/simulation/security/deployment-phase.ts` for why a derived word is
 * honest here rather than a trick, and `simulation-message-keys.ts`'s
 * `deployment-phase` group for where the label comes from.
 *
 * Four things are pinned here, and the third and fourth are the ones worth
 * arguing about:
 *
 * 1. the row says `Returning` after a reload, through the real save, the
 *    real projection and the real UI mapper -- no hand-written string;
 * 2. the word **ends**: the guard walks back and the row says `On Post`
 *    again, proven by running the ticks rather than by reading the code;
 * 3. a returning guard still **counts toward its sector's coverage**, which
 *    is what it did as `'on-post'` before this change -- so no behaviour
 *    change hides inside a label change;
 * 4. where the sector has a patrol route it is `PatrolSystem` that ends the
 *    word, and the row says `Travelling` rather than `Returning` for ever.
 */

/** Distinct from the other security seeds in the suite, so no shared fixture makes these figures true by accident. */
const SEED = 0x724;

/** `NEW_PRISON_ORIGIN_TILE` in `src/main.ts`, and since ADR 0036 the derived sector's post tile as well. */
const ORIGIN = { x: 16, y: 16 } as const;
/** A tile a guard has to walk from, so the save is taken over a real route request rather than an arrival by coincidence. */
const FAR_TILE = { x: 0, y: 0 } as const;

const DEFAULT_SECTOR_ID = 'security-sector.prison';
const CELL_RECT = { x: 4, y: 6, width: 2, height: 3 } as const;
const ADMISSION = { sentenceLengthTicks: 200_000, priorIncidents: 0 } as const;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepBy(runtime: SimulationRuntime, ticks: number): void {
  for (let index = 0; index < ticks; index += 1) runtime.kernel.step();
}

/**
 * One admission, so the derived sector asks for a guard at all
 * (`resolveOccupancyScaledGuardCount` answers `0` for a sector holding
 * nobody -- issue #533), then a landing on a tick `security.deployment` is
 * scheduled for, so the hire below is acted on the moment it lands.
 */
function admitOne(runtime: SimulationRuntime): void {
  wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...CELL_RECT }));
  submit(runtime, 'admit-occupant', packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ORIGIN }));
  if (runtime.refusals.count > 0) throw new Error('The admission this fixture depends on was refused.');
  while (runtime.kernel.tick % 10 !== 0) runtime.kernel.step();
}

/**
 * A session saved with guard 0 halfway to its post: the state §C.1 measured.
 *
 * `withSpareGuard` hires a second guard, standing on the post tile and
 * `'unassigned'` because guard 0 already covers the sector's requirement of
 * one. It is the coverage case's instrument rather than decoration: if a
 * returning guard stopped counting, the reload would read a shortage of one
 * and `assignUnassignedGuards` would post *that* guard on its next cycle --
 * on the post tile, so instantly and visibly. Without a spare in the prison
 * the same wrong decision would show only as an arithmetic difference.
 */
function prisonSavedMidJourney(withSpareGuard = false): SimulationRuntime {
  const live = createNewSimulationRuntime(SEED);
  admitOne(live);
  submit(live, 'hire-far', packCommand({ type: 'HireStaff', staffRoleId: 'staff-role.guard', ...FAR_TILE }));

  // Non-vacuity: the save is only interesting while the guard is genuinely
  // in transit, holding a request id against *this* session's navigation.
  expect(live.securityGuards.getDeploymentPhase(0)).toBe('travelling');
  expect(live.securityGuards.getPathRequestId(0)).toBeDefined();
  expect(live.securityGuards.getTile(0)).toEqual(FAR_TILE);

  if (withSpareGuard) {
    submit(live, 'hire-spare', packCommand({ type: 'HireStaff', staffRoleId: 'staff-role.guard', ...ORIGIN }));
    expect(live.securityGuards.getDeploymentPhase(0)).toBe('travelling');
    expect(live.securityGuards.getDeploymentPhase(1)).toBe('unassigned');
  }

  return restoreSimulationRuntime(captureSessionSnapshot(live), SEED).runtime;
}

function rosterPhases(runtime: SimulationRuntime): readonly string[] {
  const view = projectStaff(
    {
      staff: runtime.securityGuards,
      deployment: runtime.deploymentSystem,
      patrol: runtime.patrolSystem,
      sectors: runtime.securitySectors,
    },
    runtime.kernel.tick,
  );
  return view.roster.rows.map((row) => row.assignment.deploymentPhase);
}

/** What the Staff panel would actually render, through the same mapper `StaffRosterReader` uses. */
function rosterStatusWords(runtime: SimulationRuntime): readonly string[] {
  const localizer = new Localizer({ locale: 'en', catalogs: [defaultMessageCatalogEn] });
  const view = projectStaff(
    {
      staff: runtime.securityGuards,
      deployment: runtime.deploymentSystem,
      patrol: runtime.patrolSystem,
      sectors: runtime.securitySectors,
    },
    runtime.kernel.tick,
  );
  return staffRosterFromProjection(view, () => undefined).staff.map((row) => localizer.format(row.statusLabelKey));
}

describe('a guard who was walking when the prison was saved', () => {
  it('is not said to be on a post it is not standing on -- the row says Returning', () => {
    const restored = prisonSavedMidJourney();

    // The reset itself is unchanged, and this is the state that makes the
    // label wrong: settled on `'on-post'`, standing sixteen tiles away.
    expect(restored.securityGuards.getDeploymentPhase(0)).toBe('on-post');
    expect(restored.securityGuards.getTile(0)).toEqual(FAR_TILE);
    expect(restored.securitySectors.requireDefinition(DEFAULT_SECTOR_ID).postTile).toEqual(ORIGIN);

    expect(rosterPhases(restored)).toEqual(['returning']);
    // The word reaches the panel through the derived-key machinery -- the key
    // is computed from the id, and the text is the one the group table holds.
    expect(rosterStatusWords(restored)).toEqual(['Returning']);
  });

  it('still counts toward its sector, so a reload invents no shortage and posts no second guard', () => {
    const restored = prisonSavedMidJourney(true);

    // The decision, pinned in the direction it was taken: a returning guard is
    // an assigned guard. `assignedGuardCountFor` counts every guard whose
    // phase is not `'unassigned'`, which is what made a restored guard count
    // before this change, and the label change does not move it.
    expect(restored.deploymentSystem.getCoverageReport(restored.kernel.tick)).toEqual([
      { sectorId: DEFAULT_SECTOR_ID, required: 1, assigned: 1, shortage: 0 },
    ]);
    expect(rosterPhases(restored)).toEqual(['returning', 'unassigned']);

    // And the consequence that would have been the real cost of deciding the
    // other way, run rather than argued: an invented shortage is filled on the
    // next deployment cycle, so the prison would come back with two guards on
    // one post it was saved with one on.
    stepBy(restored, 100);
    expect(rosterPhases(restored)).toEqual(['on-post', 'unassigned']);
    expect(restored.deploymentSystem.getCoverageReport(restored.kernel.tick)).toEqual([
      { sectorId: DEFAULT_SECTOR_ID, required: 1, assigned: 1, shortage: 0 },
    ]);
  });

  it('walks back to the post on its own and stops being Returning, run rather than reasoned', () => {
    const restored = prisonSavedMidJourney();
    expect(rosterPhases(restored)).toEqual(['returning']);

    // The same 50-tick budget the live deployment of this fixture takes, plus
    // the 10-tick deployment cadence the restored session has to wait for.
    stepBy(restored, 100);

    expect(restored.securityGuards.getTile(0)).toEqual(ORIGIN);
    expect(restored.securityGuards.getDeploymentPhase(0)).toBe('on-post');
    expect(rosterPhases(restored)).toEqual(['on-post']);
    expect(rosterStatusWords(restored)).toEqual(['On Post']);
    // It got there by walking: a failed route unassigns the guard instead.
    expect(restored.deploymentSystem.getMetrics()).toEqual({ deploymentFailures: 0 });
  });

  it('cannot stay Returning: the word goes within one deployment cycle and does not come back', () => {
    const restored = prisonSavedMidJourney();
    const startedAt = restored.kernel.tick;
    // Non-vacuity: without this the loop below would pass on a build that
    // never says the word at all, which is exactly the build this file is
    // measured against.
    expect(rosterPhases(restored)).toEqual(['returning']);

    let settledAt: number | undefined;
    for (let index = 0; index < 400; index += 1) {
      restored.kernel.step();
      if (settledAt === undefined) {
        if (rosterPhases(restored)[0] !== 'returning') settledAt = restored.kernel.tick;
        continue;
      }
      // Once settled it stays settled: nothing puts the word back.
      expect(rosterPhases(restored)).not.toContain('returning');
    }

    expect(settledAt).toBeDefined();
    // `DeploymentSystem.schedule` is `{ intervalTicks: 10, phaseTicks: 0 }`,
    // so the longest a guard can wait to be picked up is one cadence; the
    // word ends when the walk is requested, not when it finishes.
    expect(settledAt! - startedAt).toBeLessThanOrEqual(10);
  });
});

/**
 * The same reload where the sector has a patrol route, which is the other
 * ending the word has: `PatrolSystem` starts the loop and the guard is
 * `Travelling` again.
 *
 * Driven on the `buildCellBlockFixture` sectors rather than on a session,
 * because ADR 0036 declines to derive a patrol route for the default sector
 * -- `tests/integration/security-default-sector.test.ts` measures that
 * absence -- so a route has to be authored to reach this path at all.
 */
describe('the same reload, in a sector that has a patrol route', () => {
  function patrolSession(): {
    readonly guards: GuardRoster;
    readonly sectors: SecuritySectorRegistry;
    readonly deployment: DeploymentSystem;
    readonly patrol: PatrolSystem;
    readonly kernel: Kernel;
    readonly definition: SecuritySectorDefinition;
  } {
    const cellBlock = buildCellBlockFixture(12);
    const navigation = new NavigationSystem(
      cellBlock.world,
      { workBudgetPerTick: 2_000, agingIntervalTicks: 10, flowFieldActivationThreshold: 100 },
      cellBlock.doors,
    );
    navigation.setLoadedChunks(cellBlock.chunkPositions);

    const definition: SecuritySectorDefinition = {
      id: 'block-a',
      gradeId: 'grade.general',
      doorIds: ['cell-door-2'],
      postTile: cellBlock.cellTiles[2]!,
      patrolRoute: [cellBlock.corridorTiles[2]!, cellBlock.corridorTiles[3]!],
      expectedPatrolLoopTicks: 1_000,
    };
    const sectors = new SecuritySectorRegistry(cellBlock.doors);
    sectors.register(definition);

    const guards = new GuardRoster(64);
    const deployment = new DeploymentSystem(sectors, guards, navigation, [constantDeploymentSchedule('block-a', 1)]);
    const patrol = new PatrolSystem(sectors, guards, navigation);

    const kernel = new Kernel();
    kernel.registerSystem(navigation);
    kernel.registerSystem(createGuardLocomotionSystem(guards, navigation, deployment, patrol));
    kernel.registerSystem(deployment);
    kernel.registerSystem(patrol);
    guards.hire('staff-role.guard', cellBlock.canteenTiles[0]!);

    return { guards, sectors, deployment, patrol, kernel, definition };
  }

  it('says Returning until the loop restarts, and Travelling after it', () => {
    const live = patrolSession();
    for (let index = 0; index < 400 && live.guards.getPatrolWaypointIndex(0) === undefined; index += 1) live.kernel.step();
    /*
     * Advance until the guard has genuinely left the post tile, not merely
     * requested the route. **This used to be a blind ten-tick wait for "a live
     * pathRequestId"; since ADR 0088 gave guards a walk, this short a leg
     * resolves and the guard is walking it well inside ten ticks, so a fixed
     * count could land on either state** -- marked in both directions
     * (`docs/AGENT_WORKFLOW.md` §4), the same correction
     * `security-snapshot-restore.test.ts` makes for the same reason. Waiting
     * for the tile itself to move is what the case below actually needs: a
     * walk's sub-tile progress is never saved (ADR 0059's rule, unchanged for
     * guards), so a snapshot taken before the first tile boundary is crossed
     * would restore onto the post tile and never say `Returning` at all.
     */
    const postTile = live.definition.postTile;
    for (let index = 0; index < 30 && live.guards.getTile(0).x === postTile.x && live.guards.getTile(0).y === postTile.y; index += 1) {
      live.kernel.step();
    }

    expect(live.guards.getDeploymentPhase(0)).toBe('travelling');
    expect(live.guards.getTile(0)).not.toEqual(postTile);
    const donor = live.guards.getSnapshot();

    const restored = patrolSession();
    restored.guards.loadSnapshot(donor);

    const phaseOf = (): string =>
      projectStaff({ staff: restored.guards, sectors: restored.sectors }, 0).roster.rows[0]!.assignment
        .deploymentPhase;

    // Mid-leg means off the post tile, so the restored guard is in exactly the
    // state the first describe is about -- reached down a different road.
    expect(restored.guards.getDeploymentPhase(0)).toBe('on-post');
    expect(restored.guards.getTile(0)).not.toEqual(restored.definition.postTile);
    expect(phaseOf()).toBe('returning');

    // `PatrolSystem.schedule` is every 10 ticks, and it is what ends the word
    // here: `DeploymentSystem` leaves a guard whose sector has a route alone.
    for (let index = 0; index < 20 && phaseOf() === 'returning'; index += 1) restored.kernel.step();

    expect(phaseOf()).toBe('travelling');
    expect(restored.guards.getPatrolWaypointIndex(0)).toBeDefined();
  });
});
