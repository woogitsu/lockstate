import { expect, test } from 'vitest';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { constantDeploymentSchedule, createGradedDoor } from '../../src/simulation/security';
import {
  chunkCoordinate,
  tileCoordinate,
} from '../../src/simulation/world/coordinates';
import { wallRoomPerimeter } from '../helpers/room-walls';

/** One command through the real handler, then the one step that applies it. */
function submitCommand(runtime: SimulationRuntime, id: string, command: SimulationCommand): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, packCommand(command));
  runtime.kernel.step();
}

test('new-session runtime owns an initial loaded chunk and applies build commands', () => {
  const runtime = createNewSimulationRuntime();
  const initialChunk = { x: chunkCoordinate(0), y: chunkCoordinate(0) };

  expect(runtime.world.getChunk(initialChunk)?.lifecycle).toBe('loaded');
  expect(runtime.world.isOwned(initialChunk)).toBe(true);

  runtime.kernel.submitCommand(
    'build-1',
    0,
    0,
    packCommand({
      type: 'PlaceBuildOrder',
      orderId: 'wall-1',
      definitionId: 'wall-brick',
      x: 1,
      y: 1,
    }),
  );
  runtime.kernel.step();

  expect(runtime.construction.getOrder('wall-1')?.state).toBe('materials-pending');
  expect(runtime.world.getLeftEdge({
    x: tileCoordinate(1),
    y: tileCoordinate(1),
  })).toBe(0);
});

test('new-session runtime wires security sectors, guard deployment and patrol', () => {
  const runtime = createNewSimulationRuntime();

  const doorPosition = { x: tileCoordinate(2), y: tileCoordinate(1) };
  runtime.navigation.doors.register(createGradedDoor('door-1', doorPosition, 'left', 'open', 'grade.general'));

  const postTile = { x: tileCoordinate(3), y: tileCoordinate(1) };
  runtime.securitySectors.register({ id: 'sector-1', gradeId: 'grade.general', doorIds: ['door-1'], postTile });
  runtime.securitySchedules.push(constantDeploymentSchedule('sector-1', 1));

  const guardId = runtime.securityGuards.hire('staff-role.guard', { x: tileCoordinate(0), y: tileCoordinate(0) });

  /*
   * **Somebody to guard, since issue #533**, and it is the derived sector this
   * reaches rather than `'sector-1'` above.
   *
   * `resolveOccupancyScaledGuardCount` now answers `0` for a sector holding
   * nobody, so before this admission both sectors asked for nobody and the
   * guard hired above stayed `'unassigned'` for ever -- which would have made
   * this case assert that deployment is wired by watching it do nothing.
   * `resolveSectorOccupants` counts a prisoner for `'sector-1'` only if they
   * stand exactly on its post tile, and for the derived sector if they stand
   * anywhere on owned land (ADR 0048), so one ordinary admission moves the
   * second sector's requirement and not the first's. The walk the loop below
   * waits for is therefore a real route across the prison to (16, 16).
   */
  const CELL = { x: 4, y: 6, width: 2, height: 3 } as const;
  wallRoomPerimeter(runtime.world, CELL, { doors: runtime.navigation.doors });
  submitCommand(runtime, 'zone-cell', { type: 'ZoneRoom', roomId: 'room.cell', ...CELL });
  submitCommand(runtime, 'admit-1', { type: 'AdmitPrisoner', sentenceLengthTicks: 200_000, priorIncidents: 0, x: 16, y: 16 });
  expect(runtime.refusals.count).toBe(0);

  for (let i = 0; i < 200 && runtime.securityGuards.getDeploymentPhase(guardId) !== 'on-post'; i += 1) {
    runtime.kernel.step();
  }

  expect(runtime.securityGuards.getDeploymentPhase(guardId)).toBe('on-post');
  // Two sectors: this test's own, and the derived default every session now
  // carries (ADR 0036). Sorted by id, `'sector-1'` before
  // `'security-sector.prison'`, which is also the order `assignUnassignedGuards`
  // fills them in. **The figures moved with #533 and the reason is the
  // occupancy rule, not the ordering**: `'sector-1'`'s post tile has nobody
  // standing on it, so it asks for nobody and the ordering never gets to
  // matter; the derived sector holds the one admitted prisoner, asks for one,
  // and is where the single hire goes.
  expect(runtime.deploymentSystem.getCoverageReport(0)).toEqual([
    { sectorId: 'sector-1', required: 0, assigned: 0, shortage: 0 },
    { sectorId: 'security-sector.prison', required: 1, assigned: 1, shortage: 0 },
  ]);
});

test('new-session runtime wires contraband, intelligence and search through the real prisoner room-instance registry', () => {
  const runtime = createNewSimulationRuntime();

  runtime.prisoners.roomInstances.register({ instanceId: 'cell-1', roomCatalogId: 'room.cell', anchorTile: { x: tileCoordinate(5), y: tileCoordinate(5) }, residentCapacity: 1, concurrentUseCapacity: 1, objectCapabilities: [] });
  runtime.contraband.introduce('item-1', 'contraband.phone', { kind: 'cell', id: 'cell-1' }, { sourceType: 'room-object', sourceId: 'workshop', introducedAtTick: 0 });
  runtime.searchPolicies.push({ scope: 'cell', requiredGuardCount: 1, dwellTicksPerTarget: 5, baseDetectionProbability: 1, concealmentPenaltyPerPoint: 0, intelligenceConfidenceBonus: 0 });
  // Two guards for a one-guard search, because the derived default sector takes
  // the first (ADR 0036): `DeploymentSystem` runs at order 270 and
  // `SearchSystem` at 295, both drawing from `unassignedGuardIds()`, so a single
  // hire would be standing on a post rather than available to search.
  runtime.securityGuards.hire('staff-role.guard', { x: tileCoordinate(0), y: tileCoordinate(0) });
  runtime.securityGuards.hire('staff-role.guard', { x: tileCoordinate(0), y: tileCoordinate(0) });
  runtime.searchSystem.submitOrder({ id: 'search-1', scope: 'cell', targets: [{ holderKind: 'cell', holderId: 'cell-1' }] });

  for (let i = 0; i < 500 && runtime.searchSystem.getMetrics().searchesCompleted < 1; i += 1) runtime.kernel.step();

  expect(runtime.searchSystem.getMetrics()).toEqual({ itemsDiscovered: 1, itemsMissed: 0, searchesCompleted: 1, searchesCancelled: 0, searchesQueued: 0 });
  expect(runtime.contraband.get('item-1')?.state).toBe('confiscated');
  expect(runtime.confiscations.all()).toHaveLength(1);
});

test('new-session runtime wires the incident pipeline through real sectors, guards and navigation', () => {
  const runtime = createNewSimulationRuntime();

  const doorPosition = { x: tileCoordinate(2), y: tileCoordinate(1) };
  runtime.navigation.doors.register(createGradedDoor('door-1', doorPosition, 'left', 'open', 'grade.general'));
  const postTile = { x: tileCoordinate(3), y: tileCoordinate(1) };
  runtime.securitySectors.register({ id: 'sector-1', gradeId: 'grade.general', doorIds: ['door-1'], postTile });
  runtime.incidentSectorIds.push('sector-1');

  // Two guards for a one-responder incident, for the reason the search case
  // above hires two: the derived default sector's requirement claims the first
  // (ADR 0036), and `claimableResponders` draws from the unassigned pool.
  runtime.securityGuards.hire('staff-role.guard', { x: tileCoordinate(0), y: tileCoordinate(0) });
  runtime.securityGuards.hire('staff-role.guard', { x: tileCoordinate(0), y: tileCoordinate(0) });

  // An incident opened directly on the runtime's own log is driven to resolution by the wired response system.
  runtime.incidents.open({ id: 'incident-1', type: 'assault', sectorId: 'sector-1', participantIds: [1], severity: 2, causeFactors: [] }, 0);

  for (let i = 0; i < 1_000 && runtime.incidentResponseSystem.getMetrics().incidentsResolved < 1; i += 1) runtime.kernel.step();

  expect(runtime.incidents.get('incident-1')!.state).toBe('resolved');
  expect(runtime.incidentResponseSystem.getMetrics().incidentsResolved).toBe(1);
  expect(runtime.securitySectors.getControlState('sector-1')).toBe('normal');
});

test('new-session runtime starts with no fabricated incident, gang or contraband content', () => {
  const runtime = createNewSimulationRuntime();

  expect(runtime.incidents.all()).toEqual([]);
  expect(runtime.gangs.all()).toEqual([]);
  expect(runtime.tunnels.all()).toEqual([]);
  expect(runtime.contraband.all()).toEqual([]);
  expect(runtime.intelligence.all()).toEqual([]);
  expect(runtime.searchPolicies).toEqual([]);
});

/**
 * The exception to the rule above, and it is the one issue #396 is about
 * ([ADR 0036](../../docs/adr/0036-a-derived-default-security-sector.md)).
 *
 * `incidentSectorIds` and `securitySchedules` were both asserted empty by the
 * test above, alongside the registries that genuinely hold authored content.
 * That was the bug rather than the invariant: with all three of them empty,
 * `DeploymentSystem`, `PatrolSystem`, `IncidentTriggerSystem` and
 * `IncidentResponseSystem` were no-ops in every session a player could start.
 *
 * A derived sector is not fabricated content: it carries no authored geometry,
 * no name, no grade nobody chose, and it is a pure function of the world -- so
 * it is re-derived on load rather than persisted, and `SAVE_SCHEMA_VERSION`
 * stays 5. The three values below are written out rather than imported from the
 * module that produces them, so a change to the derivation has to change this
 * test too.
 */
test('new-session runtime derives exactly one security sector, its staffing requirement and its watch entry', () => {
  const runtime = createNewSimulationRuntime();

  expect(runtime.securitySectors.all()).toEqual([
    { id: 'security-sector.prison', gradeId: 'grade.general', doorIds: [], postTile: { x: 16, y: 16 } },
  ]);
  expect(runtime.securitySectors.getControlState('security-sector.prison')).toBe('normal');
  expect(runtime.securitySchedules).toEqual([
    { sectorId: 'security-sector.prison', blocks: [{ startTickOfDay: 0, endTickOfDay: 2_400, requiredGuardCount: 1 }] },
  ]);
  expect(runtime.incidentSectorIds).toEqual(['security-sector.prison']);
});
