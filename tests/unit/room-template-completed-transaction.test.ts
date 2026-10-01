import { expect, it } from 'vitest';
import { ROOM_TEMPLATE_IDS, instantiateRoomTemplate } from '../../src/content/room-template-catalog';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';

function reload(runtime: ReturnType<typeof createNewSimulationRuntime>) {
  const bundle = captureSessionSnapshot(runtime);
  const envelope = createSaveEnvelope({
    gameVersion: 'lockstate-0.0.0', prisonId: 'template-transaction', revision: 1,
    createdAt: 1700000000000, updatedAt: 1700000000001,
    kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
  });
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Transaction save must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}

function finish(runtime: ReturnType<typeof createNewSimulationRuntime>) {
  for (let tick = 0; tick < 25000; tick += 1) {
    runtime.kernel.step();
    if (runtime.roomTemplates.snapshot().pending.length === 0 && runtime.construction.allOrders().every((order) => order.state === 'completed')) return;
  }
  throw new Error('Template transaction did not complete');
}

function worldContents(runtime: ReturnType<typeof createNewSimulationRuntime>) {
  const snapshot = runtime.world.snapshot();
  // Undo/Redo correctly increments cache revisions; compare all persisted planes.
  return { ...snapshot, chunks: snapshot.chunks.map(({ geometryRevision: _geometryRevision, contentRevision: _contentRevision, ...planes }) => planes) };
}

// Every plan, including a shell-free Yard, is one reversible player gesture.
it.each(ROOM_TEMPLATE_IDS)('undoes and redoes completed %s with all fixtures and zoning across actual save envelopes', (templateId) => {
  let runtime = createNewSimulationRuntime(73);
  const plan = instantiateRoomTemplate(templateId, { x: 5, y: 5 });
  runtime.kernel.submitCommand('template', 0, runtime.kernel.tick, packCommand({ type: 'PlaceRoomTemplate', templateId, origin: plan.origin }));
  finish(runtime);
  const completedWorld = worldContents(runtime);
  runtime = reload(runtime);
  expect(runtime.roomTemplates.snapshot().completed).toHaveLength(1);
  runtime.kernel.submitCommand('undo', 1, runtime.kernel.tick, packCommand({ type: 'Undo' }));
  runtime.kernel.step();
  expect(runtime.placedObjects.getSnapshot()).toEqual([]);
  for (const zone of plan.zones) expect(runtime.prisoners.roomInstances.getById(`${zone.roomId}:${zone.x}:${zone.y}`)).toBeUndefined();
  expect(runtime.construction.allOrders().every((order) => order.state === 'cancelled')).toBe(true);
  runtime = reload(runtime);
  expect(runtime.roomTemplates.snapshot().undone).toHaveLength(1);
  runtime.kernel.submitCommand('redo', 2, runtime.kernel.tick, packCommand({ type: 'Redo' }));
  finish(runtime);
  expect(runtime.placedObjects.getSnapshot()).toHaveLength(plan.objects.length);
  for (const zone of plan.zones) expect(runtime.prisoners.roomInstances.getById(`${zone.roomId}:${zone.x}:${zone.y}`)).toBeDefined();
  expect(worldContents(runtime)).toEqual(completedWorld);
});

it('keeps two shell-free yards ordered across pending Undo, Save/Load and Redo without a fake build order', () => {
  let runtime = createNewSimulationRuntime(73);
  const submit = (sequence: number, type: 'PlaceRoomTemplate' | 'Undo' | 'Redo', origin = { x: 5, y: 5 }) => {
    runtime.kernel.submitCommand(`yard-${sequence}`, sequence, runtime.kernel.tick, packCommand(type === 'PlaceRoomTemplate' ? { type, templateId: 'yard-basic', origin } : { type }));
    runtime.kernel.step();
  };
  submit(0, 'PlaceRoomTemplate');
  finish(runtime);
  submit(1, 'PlaceRoomTemplate', { x: 20, y: 5 });
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(1);
  submit(2, 'Undo');
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(0);
  expect(runtime.prisoners.roomInstances.getById('room.yard:5:5')).toBeDefined();
  expect(runtime.prisoners.roomInstances.getById('room.yard:20:5')).toBeUndefined();
  expect(runtime.construction.allOrders()).toEqual([]);
  runtime = reload(runtime);
  submit(3, 'Redo');
  finish(runtime);
  expect(runtime.prisoners.roomInstances.getById('room.yard:20:5')).toBeDefined();
  submit(4, 'Undo');
  submit(5, 'Undo');
  expect(runtime.prisoners.roomInstances.getById('room.yard:5:5')).toBeUndefined();
  expect(runtime.prisoners.roomInstances.getById('room.yard:20:5')).toBeUndefined();
  expect(runtime.construction.allOrders()).toEqual([]);
});
