import { expect, test } from 'vitest';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { constantDeploymentSchedule, createGradedDoor } from '../../src/simulation/security';
import {
  chunkCoordinate,
  tileCoordinate,
} from '../../src/simulation/world/coordinates';

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

  for (let i = 0; i < 200 && runtime.securityGuards.getDeploymentPhase(guardId) !== 'on-post'; i += 1) {
    runtime.kernel.step();
  }

  expect(runtime.securityGuards.getDeploymentPhase(guardId)).toBe('on-post');
  expect(runtime.deploymentSystem.getCoverageReport(0)).toEqual([
    { sectorId: 'sector-1', required: 1, assigned: 1, shortage: 0 },
  ]);
});

test('new-session runtime wires contraband, intelligence and search through the real prisoner room-instance registry', () => {
  const runtime = createNewSimulationRuntime();

  runtime.prisoners.roomInstances.register({ instanceId: 'cell-1', roomCatalogId: 'room.cell', anchorTile: { x: tileCoordinate(5), y: tileCoordinate(5) }, capacity: 1, objectCapabilities: [] });
  runtime.contraband.introduce('item-1', 'contraband.phone', { kind: 'cell', id: 'cell-1' }, { sourceType: 'room-object', sourceId: 'workshop', introducedAtTick: 0 });
  runtime.searchPolicies.push({ scope: 'cell', requiredGuardCount: 1, dwellTicksPerTarget: 5, baseDetectionProbability: 1, concealmentPenaltyPerPoint: 0, intelligenceConfidenceBonus: 0 });
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
  expect(runtime.incidentSectorIds).toEqual([]);
  expect(runtime.contraband.all()).toEqual([]);
  expect(runtime.intelligence.all()).toEqual([]);
  expect(runtime.searchPolicies).toEqual([]);
  expect(runtime.securitySchedules).toEqual([]);
});
