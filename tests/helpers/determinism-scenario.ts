import { packCommand } from '../../src/simulation/protocol/commands';
import { Container } from '../../src/simulation/operations/inventory';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { constantDeploymentSchedule, createGradedDoor } from '../../src/simulation/security';
import { tileCoordinate, type TilePosition } from '../../src/simulation/world/coordinates';

/**
 * One scenario, built identically every time, that touches every
 * subsystem `createNewSimulationRuntime` wires: intake/classification
 * (which draws from the `prisoners.classification` RNG stream), needs
 * decay, regime-driven action selection, navigation, construction with
 * real materials, carry jobs, guard deployment and patrol, contraband
 * searches (which draw from the `contraband.detection` stream), gang
 * grudges and the incident pipeline.
 *
 * The point of building it in *one* place is that every determinism test
 * compares runs of the same rich scenario, so a regression in any of those
 * systems has somewhere to show up. Nothing here reads a clock, a locale
 * or `Math.random()`; the only inputs are `masterSeed` and the fixed
 * command stream below.
 */

const TILE = (x: number, y: number): TilePosition => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

export const SCENARIO_SEED = 10;

/** Submitted through the kernel's ordered command queue, exactly like ADR 0009 evidence replays a recorded stream. */
export const SCENARIO_COMMANDS: readonly { readonly id: string; readonly executeAtTick: number; readonly payload: ReturnType<typeof packCommand> }[] = [
  { id: 'cmd-0', executeAtTick: 0, payload: packCommand({ type: 'PlaceBuildOrder', orderId: 'wall-b', definitionId: 'wall-brick', x: 4, y: 2 }) },
  { id: 'cmd-1', executeAtTick: 0, payload: packCommand({ type: 'PlaceBuildOrder', orderId: 'wall-a', definitionId: 'wall-brick', x: 4, y: 3 }) },
  { id: 'cmd-2', executeAtTick: 30, payload: packCommand({ type: 'PlaceBuildOrder', orderId: 'wall-c', definitionId: 'wall-brick', x: 4, y: 4 }) },
  { id: 'cmd-3', executeAtTick: 70, payload: packCommand({ type: 'PlaceBuildOrder', orderId: 'wall-d', definitionId: 'wall-brick', x: 4, y: 5 }) },
];

export function buildDeterminismScenario(masterSeed: number = SCENARIO_SEED): SimulationRuntime {
  const runtime = createNewSimulationRuntime(masterSeed);

  // -- rooms: registered out of id order on purpose, so anything that
  //    iterates the registry by insertion order rather than canonically
  //    diverges from a snapshot-restored session.
  for (const instanceId of ['cell-3', 'cell-1', 'cell-4', 'cell-2']) {
    runtime.prisoners.roomInstances.register({
      instanceId,
      roomCatalogId: 'room.cell',
      anchorTile: TILE(6, 6),
      capacity: 1,
      objectCapabilities: ['sleep-surface', 'sanitation'],
    });
  }
  runtime.prisoners.roomInstances.register({
    instanceId: 'yard-1',
    roomCatalogId: 'room.yard',
    anchorTile: TILE(8, 8),
    capacity: 8,
    objectCapabilities: [],
  });
  runtime.prisoners.roomInstances.register({
    instanceId: 'canteen-1',
    roomCatalogId: 'room.canteen',
    anchorTile: TILE(9, 9),
    capacity: 8,
    objectCapabilities: ['dining'],
  });

  // -- prisoners: classification draws from `prisoners.classification`.
  const prisonerIds = [
    runtime.prisoners.admitPrisoner({ sentenceLengthTicks: 900, priorIncidents: 0 }, TILE(1, 1)),
    runtime.prisoners.admitPrisoner({ sentenceLengthTicks: 4_000, priorIncidents: 6 }, TILE(2, 1)),
    runtime.prisoners.admitPrisoner({ sentenceLengthTicks: 2_200, priorIncidents: 2 }, TILE(3, 1)),
    runtime.prisoners.admitPrisoner({ sentenceLengthTicks: 600, priorIncidents: 9 }, TILE(1, 2)),
  ];

  // -- security: doors, sectors (registered out of id order), schedules, patrol route.
  runtime.navigation.doors.register(createGradedDoor('door-2', TILE(5, 2), 'left', 'open', 'grade.general'));
  runtime.navigation.doors.register(createGradedDoor('door-1', TILE(5, 3), 'left', 'open', 'grade.general'));
  runtime.securitySectors.register({ id: 'sector-b', gradeId: 'grade.general', doorIds: ['door-2'], postTile: TILE(7, 2) });
  runtime.securitySectors.register({
    id: 'sector-a',
    gradeId: 'grade.general',
    doorIds: ['door-1'],
    postTile: TILE(7, 3),
    patrolRoute: [TILE(8, 3), TILE(8, 4)],
    expectedPatrolLoopTicks: 40,
  });
  runtime.securitySchedules.push(constantDeploymentSchedule('sector-a', 1), constantDeploymentSchedule('sector-b', 1));
  for (let index = 0; index < 5; index += 1) runtime.securityGuards.hire('staff-role.guard', TILE(0, 0));

  // -- operations: real stock, a real delivery container and two carry jobs.
  const store = new Container('store');
  store.deposit('brick', 40);
  runtime.containers.register(store);
  // Registered in descending entity id, so a job system that trusted
  // registration order instead of `idleWorkers()`'s sort would diverge.
  for (const entityId of [...prisonerIds].reverse()) runtime.jobWorkers.register(entityId);
  runtime.searchContainerLocations.set('store', TILE(2, 6));
  runtime.searchContainerLocations.set('construction-materials', TILE(3, 6));
  runtime.jobs.submitCarryItem(
    { id: 'job-b', priority: 1, itemId: 'brick', quantity: 8, sourceContainerId: 'store', sourceTile: TILE(2, 6), destinationContainerId: 'construction-materials', destinationTile: TILE(3, 6) },
    0,
  );
  runtime.jobs.submitCarryItem(
    { id: 'job-a', priority: 1, itemId: 'brick', quantity: 8, sourceContainerId: 'store', sourceTile: TILE(2, 6), destinationContainerId: 'construction-materials', destinationTile: TILE(3, 6) },
    0,
  );

  // -- contraband: two concealed items in different cells, and two search
  //    orders submitted out of id order. Detection draws from
  //    `contraband.detection` in whatever order the search system advances
  //    its active jobs.
  runtime.contraband.introduce('item-b', 'contraband.phone', { kind: 'cell', id: 'cell-2' }, { sourceType: 'room-object', sourceId: 'workshop', introducedAtTick: 0 });
  runtime.contraband.introduce('item-a', 'contraband.drug', { kind: 'cell', id: 'cell-1' }, { sourceType: 'visit', sourceId: 'visitor-1', introducedAtTick: 0 });
  runtime.searchPolicies.push({ scope: 'cell', requiredGuardCount: 1, dwellTicksPerTarget: 5, baseDetectionProbability: 0.5, concealmentPenaltyPerPoint: 0, intelligenceConfidenceBonus: 0.2 });
  runtime.intelligence.report('cell', 'cell-1', 0.7, 'informant', 0);
  runtime.searchSystem.submitOrder({ id: 'search-b', scope: 'cell', targets: [{ holderKind: 'cell', holderId: 'cell-2' }] });
  runtime.searchSystem.submitOrder({ id: 'search-a', scope: 'cell', targets: [{ holderKind: 'cell', holderId: 'cell-1' }] });

  // -- incidents: two watched sectors and a live gang grudge.
  runtime.incidentSectorIds.push('sector-b', 'sector-a');
  runtime.gangs.register({ id: 'gang-b', territorySectorIds: ['sector-a'] });
  runtime.gangs.register({ id: 'gang-a', territorySectorIds: ['sector-a'] });
  runtime.gangs.addGrudge('gang-a', 'gang-b', 0.8);

  return runtime;
}

/** Submits `SCENARIO_COMMANDS` in sequence order. Separate from the builder so a test can restore a session and *then* resume the stream. */
export function submitScenarioCommands(runtime: SimulationRuntime, fromSequence = 0): void {
  for (let sequence = fromSequence; sequence < SCENARIO_COMMANDS.length; sequence += 1) {
    const command = SCENARIO_COMMANDS[sequence]!;
    runtime.kernel.submitCommand(command.id, sequence, command.executeAtTick, command.payload);
  }
}
