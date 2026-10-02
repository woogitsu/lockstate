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
it.each(([0, 1] as const).flatMap(quarterTurns => [false, true].flatMap(legacy => ['bed-wooden', 'toilet-brick'].map(definitionId => ({ quarterTurns, legacy, definitionId })))))
  ('old rotated template cancellation preserves the later independent $definitionId purchase, legacy=$legacy turn=$quarterTurns', ({ quarterTurns, legacy, definitionId }) => {
    let runtime = createNewSimulationRuntime(73);
    send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 }, quarterTurns });
    finish(runtime);
    const original = runtime.construction.allOrders().find(order => order.definitionId === 'bed-wooden')!;
    expect(original.objectOrientation ?? 0).toBe(quarterTurns);
    send(runtime, { type: 'RemoveObject', x: original.location.x, y: original.location.y });
    expect(runtime.construction.getOrder(original.id)?.state).toBe('completed');
    send(runtime, { type: 'PlaceObject', orderId: 'independent-replacement', definitionId, x: original.location.x, y: original.location.y });
    expect(runtime.construction.getOrder('independent-replacement')?.state).toBe('approved');
    finish(runtime);
    runtime = reload(runtime, legacy);
    const replacement = runtime.placedObjects.objectAt(original.location)!;
    expect(replacement).toMatchObject({ objectId: definitionId === 'bed-wooden' ? 'object.bed' : 'object.toilet', orientation: 0 });
    const balance = runtime.treasury.balanceMinorUnits;
    send(runtime, { type: 'CancelBuildOrder', orderId: original.id, expectedRevision: runtime.construction.revisionOf(original.id) });
    expect(runtime.construction.getOrder('independent-replacement')?.state).toBe('completed');
    expect(runtime.treasury.balanceMinorUnits).toBe(balance);
    expect(runtime.construction.allOrders().filter(order => order.state === 'cancelled')).toHaveLength(20);
    expect(runtime.prisoners.roomInstances.getSnapshot()).toHaveLength(0);
    expect(runtime.placedObjects.objectAt(original.location)).toEqual(replacement);
    runtime = reload(runtime);
    expect(runtime.placedObjects.objectAt(original.location)).toEqual(replacement);
  });
