import { expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { DEFAULT_ACTIONS } from '../../src/simulation/prisoners/actions';
import type { ActionCategory } from '../../src/simulation/prisoners/regime';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

function command(runtime: SimulationRuntime, value: SimulationCommand): void {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`anchor-${sequence}`, sequence, runtime.kernel.tick, packCommand(value));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}

function until(runtime: SimulationRuntime, predicate: () => boolean): void {
  for (let tick = 0; tick < 40_000 && !predicate(); tick += 1) runtime.kernel.step();
  expect(predicate()).toBe(true);
}

function reload(runtime: SimulationRuntime): SimulationRuntime {
  const envelope = createSaveEnvelope({ ...captureSessionSnapshot(runtime),
    gameVersion: 'test', prisonId: 'blocked-anchor', revision: 1, createdAt: 0, updatedAt: 1 });
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Genuine V8 fixture must decode');
  expect(decoded.value.saveSchemaVersion).toBe(9);
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}

function regime(runtime: SimulationRuntime, categories: readonly ActionCategory[]): void {
  const schedule = runtime.prisoners.regimes.all().find(row => row.classificationGroupId === 'general-population');
  if (schedule === undefined) throw new Error('Default regime must exist');
  for (const block of schedule.blocks) command(runtime, { type: 'EditRegimeBlock',
    classificationGroupId: 'general-population', startTickOfDay: block.startTickOfDay,
    allowedCategories: [...categories] });
}

// #2008: use real resource delivery and sentence departure, so neither injected
// stock nor an old prisoner's continuing Carry can disguise the target failure.
it.each([[0, false], [0, true], [1, false], [1, true]] as const)(
  'uses existing meal fallback when q1 Canteen anchor is blocked: wall offset%s / V8%s', (offset, load) => {
    let runtime = createNewSimulationRuntime(73);
    for (const [templateId, x, y] of [
      ['storage-room-basic', 5, 5], ['delivery-bay-basic', 12, 5],
    ] as const) command(runtime, { type: 'PlaceRoomTemplate', templateId, origin: tile(x, y) });
    const completed = () => runtime.roomTemplates.snapshot().pending.length === 0
      && runtime.construction.allOrders().every(order => order.state === 'completed');
    until(runtime, completed);
    for (const [templateId, x, y] of [
      ['canteen-basic', 20, 5], ['laundry-basic', 20, 16], ['cell-basic', 5, 20],
    ] as const) command(runtime, { type: 'PlaceRoomTemplate', templateId, origin: tile(x, y), quarterTurns: 1 });
    until(runtime, completed);
    runtime = reload(runtime);
    const canteen = runtime.prisoners.roomInstances.allByRoomCatalogId('room.canteen')[0];
    if (canteen === undefined) throw new Error('Actual Canteen must complete');
    expect(canteen.anchorTile).toEqual(tile(21, 6));
    expect(runtime.placedObjects.isTileOccupied(canteen.anchorTile)).toBe(false);
    expect(runtime.prisoners.roomInstances.concurrentUseCapacityFor(canteen, 'dining')).toBe(6);
    expect(runtime.placedObjects.getSnapshot().filter(row => row.objectId === 'object.dining-table')
      .map(row => ({ anchor: row.anchorTile, orientation: row.orientation, owner: row.sourceOrderId })))
      .toEqual([
        { anchor: tile(25, 6), orientation: 1, owner: 'room-template-000000000002-2-object-000' },
        { anchor: tile(25, 9), orientation: 1, owner: 'room-template-000000000002-2-object-001' },
      ]);
    command(runtime, { type: 'HireStaff', staffRoleId: 'staff-role.guard', x: 16, y: 16 });
    command(runtime, { type: 'AdmitPrisoner', sentenceLengthTicks: 10_000, priorIncidents: 0, x: 16, y: 16 });
    until(runtime, () => runtime.prisoners.roomInstances.totalOccupancy === 1);
    for (const category of ['meal', 'work', 'sleep', 'hygiene'] as const) {
      regime(runtime, [category]);
      for (let tick = 0; tick < 1_500; tick += 1) runtime.kernel.step();
    }
    regime(runtime, ['work', 'meal', 'sleep', 'hygiene']);
    command(runtime, { type: 'PlaceBuildOrder', definitionId: 'wall-brick', orderId: 'later-interior-wall',
      x: 21, y: 6 + offset, footprint: 'square' });
    until(runtime, () => runtime.construction.getOrder('later-interior-wall')?.state === 'completed');
    expect(runtime.world.getSquareStructure(tile(21, 6 + offset))).toBe(1);
    runtime.navigation.requestRoute('usable-floor', tile(16, 16), tile(22, 7),
      { role: 'prisoner', securityClearance: 0 }, 0, runtime.kernel.tick);
    until(runtime, () => runtime.navigation.getResult('usable-floor') !== undefined);
    expect(runtime.navigation.getResult('usable-floor')?.result.ok).toBe(true);
    runtime.navigation.clearResult('usable-floor');
    regime(runtime, ['meal']);
    until(runtime, () => !runtime.prisoners.entityStore.isIndexAlive(0));
    command(runtime, { type: 'AdmitPrisoner', sentenceLengthTicks: 100_000, priorIncidents: 0, x: 16, y: 16 });
    until(runtime, () => runtime.prisoners.roomInstances.totalOccupancy === 1);
    const entityId = runtime.prisoners.entityStore.getIdByIndex(0);
    expect(entityId).toBe(1_048_576);
    if (load) runtime = reload(runtime);
    const metricsBefore = runtime.prisoners.actionSystem.getMetrics();
    const performing = new Set<string>();
    for (let tick = 0; tick < 9_000; tick += 1) {
      runtime.kernel.step();
      if (runtime.prisoners.currentAction.phase[0] === 2) {
        const action = DEFAULT_ACTIONS[runtime.prisoners.currentAction.actionIndex[0]!];
        if (action !== undefined) performing.add(action.id);
      }
    }
    expect(performing).toContain(offset === 0 ? 'action.eat-in-cell' : 'action.eat-meal');
    expect(performing.has(offset === 0 ? 'action.eat-meal' : 'action.eat-in-cell')).toBe(false);
    expect(runtime.prisoners.needs.getScaled(0, 'hunger')).toBeGreaterThan(0);
    expect(runtime.prisoners.actionSystem.getMetrics().routeFailures - metricsBefore.routeFailures).toBe(0);
    expect(runtime.prisoners.actionSystem.getMetrics().actionsCompleted - metricsBefore.actionsCompleted).toBeGreaterThan(0);
    expect(runtime.prisoners.entityStore.getIdByIndex(0)).toBe(entityId);
    expect(runtime.prisoners.roomInstances.getById(canteen.instanceId)?.anchorTile).toEqual(tile(21, 6));
  });
