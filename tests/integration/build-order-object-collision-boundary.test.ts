import { expect, it } from 'vitest';
import { PROJECTION_CATALOG } from '../../src/simulation/worker/projection-catalog';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';

type Runtime = ReturnType<typeof createNewSimulationRuntime>;
function send(runtime: Runtime, command: SimulationCommand) {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`pending-object-removal-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}
function until(runtime: Runtime, predicate: () => boolean) {
  for (let tick = 0; tick < 30_000 && !predicate(); tick++) runtime.kernel.step();
  expect(predicate()).toBe(true);
}
function reload(runtime: Runtime, legacy = false): Runtime {
  const original = captureSessionSnapshot(runtime);
  const bundle = legacy ? { ...original, simulation: { ...original.simulation!, roomTemplates: { version: 1 as const, pending: [] } } } : original;
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(createSaveEnvelope({
    gameVersion: 'test', prisonId: 'occupied-template-cancel', revision: 1, createdAt: 0, updatedAt: 1,
    kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
  }))));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Occupied cancellation save must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}
function finish(runtime: Runtime) {
  until(runtime, () => runtime.roomTemplates.snapshot().pending.length === 0 &&
    runtime.construction.allOrders().every(order => order.state === 'completed' || order.state === 'cancelled'));
}
function remove(runtime: Runtime, type: 'RemoveObject' | 'RemoveWall', location: { x: number; y: number }) {
  send(runtime, type === 'RemoveObject' ? { type, ...location } : { type, ...location, edge: 'north' });
}
function gameplay(runtime: Runtime) {
  const { kernel: _kernel, ...snapshot } = captureSessionSnapshot(runtime);
  return snapshot;
}
it.each(['pending', 'completed'].flatMap(stage => (['PlaceObject', 'PlaceBuildOrder'] as const).map(type => ({ stage, type }))))('saved $stage furniture refuses a second-tile-only $type collision', ({ stage, type }) => {
  let runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 } });
  finish(runtime);
  if (stage === 'pending') {
    send(runtime, { type: 'RemoveObject', x: 11, y: 11 });
    send(runtime, { type: 'PlaceObject', orderId: 'source-pending-bed', definitionId: 'bed-wooden', x: 11, y: 11 });
    expect(runtime.construction.getOrder('source-pending-bed')?.state).toBe('approved');
  }
  runtime = reload(runtime);
  expect(runtime.placedObjects.isTileOccupied({ x: tileCoordinate(11), y: tileCoordinate(12) })).toBe(stage === 'completed');
  send(runtime, { type, orderId: 'later-desk', definitionId: 'desk-wooden', x: 11, y: 12 });
  expect(runtime.construction.getOrder('later-desk')?.state).not.toBe('approved');
  expect(runtime.placedObjects.getSnapshot()).toHaveLength(stage === 'completed' ? 2 : 1);
});
it('the ordinary build-order route can complete a genuinely free desk beside saved completed furniture', () => {
  let runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 } });
  finish(runtime);
  runtime = reload(runtime);
  send(runtime, { type: 'PlaceBuildOrder', orderId: 'free-desk', definitionId: 'desk-wooden', x: 11, y: 13 });
  expect(runtime.construction.getOrder('free-desk')?.state).toBe('approved');
  finish(runtime);
  expect(runtime.placedObjects.getSnapshot()).toHaveLength(3);
  expect(runtime.placedObjects.objectAt({ x: tileCoordinate(11), y: tileCoordinate(13) })?.objectId).toBe('object.desk');
});
