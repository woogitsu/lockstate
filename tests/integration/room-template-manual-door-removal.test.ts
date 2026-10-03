import { expect, it } from 'vitest';
import { resolveBuildEdge } from '../../src/simulation/construction/build-order';
import { PROJECTION_CATALOG } from '../../src/simulation/worker/projection-catalog';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';

type Runtime = ReturnType<typeof createNewSimulationRuntime>;
function send(runtime: Runtime, command: SimulationCommand) {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`manual-template-removal-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
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
function cell(mirrorX = false, quarterTurns: 0 | 1 = 0): Runtime {
  const runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 }, mirrorX, quarterTurns });
  finish(runtime);
  expect(runtime.placedObjects.getSnapshot()).toHaveLength(2);
  return runtime;
}
function removeDoor(runtime: Runtime, newest = false) {
  const door = runtime.construction.allOrders().filter(order => order.id.includes('-1-door-000')).at(newest ? -1 : 0)!;
  expect(door).toMatchObject({ state: 'completed' });
  const beforeRevision = runtime.construction.revisionOf(door.id);
  expect(beforeRevision).toBeDefined();
  send(runtime, { type: 'RemoveWall', x: door.location.x, y: door.location.y, edge: resolveBuildEdge(door) });
  return { doorId: door.id, beforeRevision };
}
function gameplay(runtime: Runtime) {
  const { kernel: _kernel, ...snapshot } = captureSessionSnapshot(runtime);
  return snapshot;
}
const orientations = [false, true].flatMap(mirrorX => ([0, 1] as const).map(quarterTurns => ({ mirrorX, quarterTurns })));
it.each(orientations.flatMap(orientation => [false, true].map(legacy => ({ ...orientation, legacy }))))(
  'manual completed door removal refuses the occupied whole gesture, mirror=$mirrorX turn=$quarterTurns legacy=$legacy', ({ mirrorX, quarterTurns, legacy }) => {
    let runtime = cell(mirrorX, quarterTurns);
    send(runtime, { type: 'AdmitPrisoner', sentenceLengthTicks: 1_000_000, priorIncidents: 0, x: 16, y: 16 });
    until(runtime, () => runtime.prisoners.roomInstances.totalOccupancy === 1);
    runtime = reload(runtime, legacy);
    const before = gameplay(runtime);
    const { doorId, beforeRevision } = removeDoor(runtime);
    console.log(JSON.stringify({ mirrorX, quarterTurns, legacy, doorState: runtime.construction.getOrder(doorId)?.state,
      ordersCancelled: runtime.construction.allOrders().filter(order => order.state === 'cancelled').length,
      rooms: runtime.prisoners.roomInstances.getSnapshot(), objects: runtime.placedObjects.getSnapshot().length }));
    expect(gameplay(runtime)).toEqual(before);
    expect(runtime.construction.revisionOf(doorId)).toBe(beforeRevision);
    expect(runtime.refusals.last).toMatchObject({ reason: 'unzone.room-occupied' });
  });
it.each([false, true])('unoccupied rotated door removal reverses its actual gesture and permits adjacent rebuilding, legacy=%s', legacy => {
  let runtime = reload(cell(true, 1), legacy);
  const balance = runtime.treasury.balanceMinorUnits;
  removeDoor(runtime);
  expect(runtime.placedObjects.getSnapshot()).toHaveLength(0);
  expect(runtime.prisoners.roomInstances.getSnapshot()).toHaveLength(0);
  expect(runtime.construction.allOrders().every(order => order.state === 'cancelled')).toBe(true);
  expect(runtime.treasury.balanceMinorUnits).toBe(balance);
  const request = { templateId: 'cell-basic' as const, origin: { x: 3, y: 10 }, mirrorX: true, quarterTurns: 1 as const };
  const beforeProjection = gameplay(runtime);
  expect(PROJECTION_CATALOG['world/room-template-preflight'].project(runtime, runtime.kernel.tick, {
    target: { kind: 'room-template', ...request },
  }).view).toMatchObject({ ok: true });
  expect(gameplay(runtime)).toEqual(beforeProjection);
  send(runtime, { type: 'PlaceRoomTemplate', ...request });
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(1);
  finish(runtime);
  expect(runtime.placedObjects.getSnapshot()).toHaveLength(2);
  expect(runtime.prisoners.roomInstances.getSnapshot()).toHaveLength(1);
  expect(runtime.treasury.balanceMinorUnits).toBeLessThan(balance);
});
it.each(['north', 'west'] as const)('ordinary finished edge removal stays single-order beside an occupied Cell, edge=%s', edge => {
  let runtime = cell(false, 1);
  send(runtime, { type: 'AdmitPrisoner', sentenceLengthTicks: 1_000_000, priorIncidents: 0, x: 16, y: 16 });
  until(runtime, () => runtime.prisoners.roomInstances.totalOccupancy === 1);
  send(runtime, { type: 'PlaceBuildOrder', orderId: 'ordinary-wall', definitionId: 'wall-brick', x: 2, y: 2, edge });
  finish(runtime);
  runtime = reload(runtime);
  const beforeFunds = runtime.treasury.balanceMinorUnits;
  send(runtime, { type: 'RemoveWall', x: 2, y: 2, edge });
  expect(runtime.construction.getOrder('ordinary-wall')?.state).toBe('cancelled');
  expect(runtime.construction.allOrders().filter(order => order.state === 'cancelled')).toHaveLength(1);
  expect(runtime.placedObjects.getSnapshot()).toHaveLength(2);
  expect(runtime.prisoners.roomInstances.totalOccupancy).toBe(1);
  expect(runtime.treasury.balanceMinorUnits).toBe(beforeFunds);
});
it('manual completed bed removal retains the accepted single-object best-effort rule', () => {
  const runtime = cell(true, 1);
  send(runtime, { type: 'AdmitPrisoner', sentenceLengthTicks: 1_000_000, priorIncidents: 0, x: 16, y: 16 });
  until(runtime, () => runtime.prisoners.roomInstances.totalOccupancy === 1);
  const bed = runtime.placedObjects.getSnapshot().find(object => object.objectId === 'object.bed')!;
  expect(bed).toBeDefined();
  send(runtime, { type: 'RemoveObject', x: bed.anchorTile.x, y: bed.anchorTile.y });
  expect(runtime.placedObjects.getSnapshot()).toHaveLength(1);
  expect(runtime.prisoners.roomInstances.totalOccupancy).toBe(1);
  expect(runtime.construction.allOrders().every(order => order.state === 'completed')).toBe(true);
});


it.each([false, true])('manual door removal relocates into a genuine older spare before coupled reversal, legacy=%s', legacy => {
  let runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 20, y: 5 } });
  finish(runtime);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 }, mirrorX: true, quarterTurns: 1 });
  finish(runtime);
  send(runtime, { type: 'AdmitPrisoner', sentenceLengthTicks: 1_000_000, priorIncidents: 0, x: 16, y: 16 });
  until(runtime, () => runtime.prisoners.roomInstances.totalOccupancy === 1);
  runtime = reload(runtime, legacy);
  expect(runtime.prisoners.roomInstances.occupancyOf('room.cell:11:11')).toBe(1);
  const funds = runtime.treasury.balanceMinorUnits;
  removeDoor(runtime, true);
  expect(runtime.prisoners.roomInstances.getById('room.cell:11:11')).toBeUndefined();
  expect(runtime.prisoners.roomInstances.occupancyOf('room.cell:21:6')).toBe(1);
  expect(runtime.placedObjects.getSnapshot()).toHaveLength(2);
  expect(runtime.construction.allOrders().filter(order => order.state === 'cancelled')).toHaveLength(20);
  expect(runtime.construction.allOrders().filter(order => order.state === 'completed')).toHaveLength(20);
  expect(runtime.treasury.balanceMinorUnits).toBe(funds);
  runtime = reload(runtime);
  expect(runtime.prisoners.roomInstances.occupancyOf('room.cell:21:6')).toBe(1);
});
it.each([false, true])('actual Undo/SaveLoad/Redo/complete preserves the manual occupied cancellation boundary, legacy=%s', legacy => {
  let runtime = cell(true, 1);
  send(runtime, { type: 'Undo' });
  expect(runtime.placedObjects.getSnapshot()).toHaveLength(0);
  runtime = reload(runtime);
  send(runtime, { type: 'Redo' });
  finish(runtime);
  expect(runtime.placedObjects.getSnapshot()).toHaveLength(2);
  send(runtime, { type: 'AdmitPrisoner', sentenceLengthTicks: 1_000_000, priorIncidents: 0, x: 16, y: 16 });
  until(runtime, () => runtime.prisoners.roomInstances.totalOccupancy === 1);
  runtime = reload(runtime, legacy);
  const before = gameplay(runtime);
  const { doorId, beforeRevision } = removeDoor(runtime);
  expect(gameplay(runtime)).toEqual(before);
  expect(runtime.construction.revisionOf(doorId)).toBe(beforeRevision);
  expect(runtime.refusals.last).toMatchObject({ reason: 'unzone.room-occupied' });
});

