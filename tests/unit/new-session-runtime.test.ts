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
