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
function reload(runtime: Runtime, legacy = false, restoredBookWithoutHistory = false): Runtime {
  const original = captureSessionSnapshot(runtime);
  const withMetadata = legacy ? { ...original, simulation: { ...original.simulation!, roomTemplates: { version: 1 as const, pending: [] } } } : original;
  const { currentTransaction: _current, currentTransactionId: _transactionId, ...book } = original.construction;
  // Explicit decoder/restore compatibility, not a claimed native history eviction.
  const bundle = restoredBookWithoutHistory ? { ...withMetadata, construction: { ...book, undoStack: [], redoStack: [] } } : withMetadata;
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
it.each(['RemoveObject', 'RemoveWall'] as const)('saved assigned template fixture %s releases its entire gesture while paused, then rebuilds', type => {
  let runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-row-four', origin: { x: 5, y: 5 }, mirrorX: true, quarterTurns: 1 });
  until(runtime, () => runtime.construction.allOrders().some(order => order.id.includes('-2-object-') && order.state === 'in-progress'));
  expect(runtime.construction.allOrders().filter(order => order.state === 'completed')).toHaveLength(58);
  expect(runtime.construction.allOrders().filter(order => order.state === 'assigned')).toHaveLength(7);
  runtime = reload(runtime);
  const selected = runtime.construction.allOrders().find(order => order.definitionId === 'bed-wooden' && order.state === 'assigned')!;
  expect(selected.objectOrientation).toBe(1);
  const tick = runtime.kernel.tick;
  // Real rotated second footprint tile, not the queued order anchor.
  remove(runtime, type, { x: selected.location.x + 1, y: selected.location.y });
  expect(runtime.kernel.tick).toBe(tick);
  expect(runtime.construction.allOrders().every(order => order.state === 'cancelled')).toBe(true);
  expect(runtime.prisoners.roomInstances.getSnapshot()).toEqual([]);
  expect(runtime.placedObjects.getSnapshot()).toEqual([]);
  runtime = reload(runtime);
  const beforeProjection = gameplay(runtime);
  expect(PROJECTION_CATALOG['world/room-template-preflight'].project(runtime, runtime.kernel.tick, {
    target: { kind: 'room-template', templateId: 'cell-row-four', origin: { x: 5, y: 5 }, mirrorX: true, quarterTurns: 1 },
  }).view).toMatchObject({ ok: true });
  expect(gameplay(runtime)).toEqual(beforeProjection);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-row-four', origin: { x: 5, y: 5 }, mirrorX: true, quarterTurns: 1 });
  finish(runtime);
  expect(runtime.placedObjects.getSnapshot()).toHaveLength(8);
  expect(runtime.prisoners.roomInstances.getSnapshot()).toHaveLength(4);
});
it.each([false, true])('saved occupied partial row refuses pending fixture removal before any changes, legacy=%s', legacy => {
  let runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-row-four', origin: { x: 10, y: 10 }, quarterTurns: 1 });
  until(runtime, () => runtime.construction.allOrders().some(order => order.id.includes('-2-object-') && order.state === 'completed'));
  send(runtime, { type: 'AdmitPrisoner', sentenceLengthTicks: 1_000_000, priorIncidents: 0, x: 16, y: 16 });
  until(runtime, () => runtime.prisoners.roomInstances.totalOccupancy === 1);
  runtime = reload(runtime, legacy);
  const selected = runtime.construction.allOrders().find(order => order.definitionId === 'bed-wooden' && order.state === 'assigned')!;
  expect(selected).toBeDefined();
  const revision = runtime.construction.revisionOf(selected.id);
  const before = gameplay(runtime);
  remove(runtime, 'RemoveObject', { x: selected.location.x + 1, y: selected.location.y });
  expect(gameplay(runtime)).toEqual(before);
  expect(runtime.construction.revisionOf(selected.id)).toBe(revision);
  expect(runtime.refusals.last).toMatchObject({ reason: 'unzone.room-occupied' });
});
it.each(['RemoveObject', 'RemoveWall'] as const)('ordinary queued bed %s stays a single cancellation beside a completed template', type => {
  const runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 } });
  finish(runtime);
  send(runtime, { type: 'PlaceObject', orderId: 'ordinary-bed-first', definitionId: 'bed-wooden', x: 12, y: 12 });
  send(runtime, { type: 'PlaceObject', orderId: 'ordinary-bed-second', definitionId: 'bed-wooden', x: 11, y: 13 });
  expect(runtime.construction.getOrder('ordinary-bed-first')?.state).toBe('approved');
  expect(runtime.construction.getOrder('ordinary-bed-second')?.state).toBe('approved');
  remove(runtime, type, { x: 11, y: 14 });
  expect(runtime.construction.getOrder('ordinary-bed-second')?.state).toBe('cancelled');
  expect(runtime.construction.allOrders().filter(order => order.state === 'cancelled')).toHaveLength(1);
  expect(runtime.construction.getOrder('ordinary-bed-first')?.state).toBe('approved');
  expect(runtime.placedObjects.getSnapshot()).toHaveLength(2);
  expect(runtime.prisoners.roomInstances.getSnapshot()).toHaveLength(1);
});

