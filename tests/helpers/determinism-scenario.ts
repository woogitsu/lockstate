import { placedObjectAt } from '../../src/simulation/objects';
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

export interface DeterminismScenarioOptions {
  /**
   * Reverses the order in which *incidental* registrations happen -- room
   * instances, doors, sectors, schedules, containers, job workers, carry
   * jobs, contraband items and gangs. Every one of those registries is
   * read through a canonically ordered accessor, so reversing them must
   * change nothing at all about how the session plays out.
   *
   * Deliberately excluded: anything whose order is genuinely part of the
   * recorded input rather than incidental. Prisoner admission and guard
   * hiring allocate entity ids in call order; `IntelligenceLedger.report`
   * mints sequential record ids; the search queue is a FIFO whose order is
   * in its own snapshot. Reversing those is a different run, not the same
   * run built differently.
   */
  readonly reverseIncidentalRegistrationOrder?: boolean;
}

export function buildDeterminismScenario(masterSeed: number = SCENARIO_SEED, options: DeterminismScenarioOptions = {}): SimulationRuntime {
  const runtime = createNewSimulationRuntime(masterSeed);
  const incidental = <T>(entries: readonly T[]): readonly T[] =>
    options.reverseIncidentalRegistrationOrder === true ? [...entries].reverse() : entries;

  /*
   * -- rooms: registered out of id order on purpose, so anything that
   *    iterates the registry by insertion order rather than canonically
   *    diverges from a snapshot-restored session.
   *
   *    Every instance is registered with **zero derived capacity and a
   *    rectangle**, and the objects standing in those rectangles are placed
   *    below. That is not decoration: since ADR 0028 phase 1 a capacity is
   *    derived rather than persisted, so a scenario that registered
   *    `residentCapacity: 1` directly would have a live session and a
   *    snapshot-restored one disagree -- the restore recomputes from the
   *    objects, finds none, and writes 0. Placing real objects is what makes
   *    this scenario's rooms survive `snapshot() -> restore()`, which is the
   *    property every test in `tests/determinism/` is built on.
   *
   *    The four cells share one rectangle, as they already shared one anchor
   *    tile before this change. That is a fixture and not a state `zone` can
   *    produce (it refuses `overlaps-existing-room`); what matters here is that
   *    four instances exist, that each derives its capacity from the same two
   *    objects, and that no anchor tile moved -- so no prisoner's route
   *    changed and this scenario plays exactly as it did.
   */
  for (const instanceId of incidental(['cell-3', 'cell-1', 'cell-4', 'cell-2'])) {
    runtime.prisoners.roomInstances.register({
      instanceId,
      roomCatalogId: 'room.cell',
      anchorTile: TILE(6, 6),
      width: 2,
      height: 3,
      residentCapacity: 0,
      concurrentUseCapacity: 0,
      objectCapabilities: [],
    });
  }
  for (const instance of incidental([
    { instanceId: 'yard-1', roomCatalogId: 'room.yard', anchorTile: TILE(8, 8), width: 2, height: 1, residentCapacity: 0, concurrentUseCapacity: 0, objectCapabilities: [] },
    { instanceId: 'canteen-1', roomCatalogId: 'room.canteen', anchorTile: TILE(9, 9), width: 3, height: 2, residentCapacity: 0, concurrentUseCapacity: 0, objectCapabilities: ['dining'] },
  ])) {
    runtime.prisoners.roomInstances.register(instance);
  }

  /*
   * -- objects: placed directly rather than built, and placed out of tile
   *    order on purpose.
   *
   *    Directly, because a construction order takes sixty ticks and procured
   *    materials, and this scenario is about iteration order rather than about
   *    the build pipeline (`tests/integration/object-placement-loop.test.ts`
   *    drives the real route end to end). `PlacedObjectRegistry.place` is the
   *    same call `ObjectPlacementService` makes when an order finishes, so what
   *    is skipped is the waiting and not the writing.
   *
   *    A toilet as well as a bed in the cell, so the derived capability set is
   *    `['sanitation', 'sleep-surface']` -- exactly the pair this scenario
   *    registered by hand before, sorted by the resolver rather than by the
   *    author. The cell therefore derives `residentCapacity: 1` (the bed's
   *    footprint width) and `concurrentUseCapacity: 2`.
   *
   *    Out of tile order because the registry sorts by `(y, x)` and nothing may
   *    depend on insertion order: reversing these two lines must change
   *    nothing, which is what `reverseIncidentalRegistrationOrder` asserts for
   *    every other registry here.
   */
  for (const object of incidental([
    placedObjectAt('object.toilet', TILE(7, 6), 0),
    placedObjectAt('object.bed', TILE(6, 6), 0),
    placedObjectAt('object.bench', TILE(8, 8), 0),
    placedObjectAt('object.dining-table', TILE(9, 9), 0),
  ])) {
    if (!runtime.placedObjects.place(object)) {
      throw new Error(`the scenario's object at (${object.anchorTile.x}, ${object.anchorTile.y}) must be placeable`);
    }
  }
  // Event-driven, exactly as a completed build order would drive it: the
  // objects exist, so every room that contains one is re-derived once.
  runtime.roomCapacity.resolveAll();

  // -- prisoners: classification draws from `prisoners.classification`.
  const prisonerIds = [
    runtime.prisoners.admitPrisoner({ sentenceLengthTicks: 900, priorIncidents: 0 }, TILE(1, 1)),
    runtime.prisoners.admitPrisoner({ sentenceLengthTicks: 4_000, priorIncidents: 6 }, TILE(2, 1)),
    runtime.prisoners.admitPrisoner({ sentenceLengthTicks: 2_200, priorIncidents: 2 }, TILE(3, 1)),
    runtime.prisoners.admitPrisoner({ sentenceLengthTicks: 600, priorIncidents: 9 }, TILE(1, 2)),
  ];

  // -- security: doors, sectors (registered out of id order), schedules, patrol route.
  for (const door of incidental([
    createGradedDoor('door-2', TILE(5, 2), 'left', 'open', 'grade.general'),
    createGradedDoor('door-1', TILE(5, 3), 'left', 'open', 'grade.general'),
  ])) {
    runtime.navigation.doors.register(door);
  }
  for (const sector of incidental([
    { id: 'sector-b', gradeId: 'grade.general', doorIds: ['door-2'], postTile: TILE(7, 2) },
    { id: 'sector-a', gradeId: 'grade.general', doorIds: ['door-1'], postTile: TILE(7, 3), patrolRoute: [TILE(8, 3), TILE(8, 4)], expectedPatrolLoopTicks: 40 },
  ])) {
    runtime.securitySectors.register(sector);
  }
  runtime.securitySchedules.push(...incidental([constantDeploymentSchedule('sector-a', 1), constantDeploymentSchedule('sector-b', 1)]));

  // Hire order allocates entity ids, so it is recorded input, not incidental.
  for (let index = 0; index < 5; index += 1) runtime.securityGuards.hire('staff-role.guard', TILE(0, 0));

  // -- operations: real stock, a real delivery container and two carry jobs.
  const store = new Container('store');
  store.deposit('item.brick', 40);
  runtime.containers.register(store);
  // Registered in descending entity id, so a job system that trusted
  // registration order instead of `idleWorkers()`'s sort would diverge.
  for (const entityId of incidental([...prisonerIds].reverse())) runtime.jobWorkers.register(entityId);
  runtime.searchContainerLocations.set('store', TILE(2, 6));
  runtime.searchContainerLocations.set('construction-materials', TILE(3, 6));
  for (const job of incidental([
    { id: 'job-b', priority: 1, itemId: 'item.brick', quantity: 8, sourceContainerId: 'store', sourceTile: TILE(2, 6), destinationContainerId: 'construction-materials', destinationTile: TILE(3, 6) },
    { id: 'job-a', priority: 1, itemId: 'item.brick', quantity: 8, sourceContainerId: 'store', sourceTile: TILE(2, 6), destinationContainerId: 'construction-materials', destinationTile: TILE(3, 6) },
  ])) {
    runtime.jobs.submitCarryItem(job, 0);
  }

  // -- contraband: two concealed items in different cells, and two search
  //    orders submitted out of id order. Detection draws from
  //    `contraband.detection` in whatever order the search system advances
  //    its active jobs.
  for (const item of incidental([
    { id: 'item-b', categoryId: 'contraband.phone', holderId: 'cell-2', sourceId: 'workshop' },
    { id: 'item-a', categoryId: 'contraband.drug', holderId: 'cell-1', sourceId: 'visitor-1' },
  ])) {
    runtime.contraband.introduce(item.id, item.categoryId, { kind: 'cell', id: item.holderId }, { sourceType: 'room-object', sourceId: item.sourceId, introducedAtTick: 0 });
  }
  runtime.searchPolicies.push({ scope: 'cell', requiredGuardCount: 1, dwellTicksPerTarget: 5, baseDetectionProbability: 0.5, concealmentPenaltyPerPoint: 0, intelligenceConfidenceBonus: 0.2 });

  // Mints sequential `intel.<n>` ids, so report order is recorded input.
  runtime.intelligence.report('cell', 'cell-1', 0.7, 'informant', 0);

  // The search queue is a FIFO carried in its own snapshot -- submission
  // order is recorded input too, and decides which guard staffs which job.
  runtime.searchSystem.submitOrder({ id: 'search-b', scope: 'cell', targets: [{ holderKind: 'cell', holderId: 'cell-2' }] });
  runtime.searchSystem.submitOrder({ id: 'search-a', scope: 'cell', targets: [{ holderKind: 'cell', holderId: 'cell-1' }] });

  // -- incidents: two watched sectors and a live gang grudge.
  runtime.incidentSectorIds.push(...incidental(['sector-b', 'sector-a']));
  for (const gang of incidental([
    { id: 'gang-b', territorySectorIds: ['sector-a'] },
    { id: 'gang-a', territorySectorIds: ['sector-a'] },
  ])) {
    runtime.gangs.register(gang);
  }
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
