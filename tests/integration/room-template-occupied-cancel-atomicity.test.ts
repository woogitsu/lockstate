import { expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';

type Runtime = ReturnType<typeof createNewSimulationRuntime>;
function send(runtime: Runtime, command: SimulationCommand) {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`occupied-cancel-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
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
function cell(templateId: 'cell-basic' | 'cell-row-four' = 'cell-basic', mirrorX = false, quarterTurns: 0 | 1 | 2 | 3 = 0): Runtime {
  const runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceRoomTemplate', templateId, origin: { x: 10, y: 10 }, mirrorX, quarterTurns });
  until(runtime, () => runtime.roomTemplates.snapshot().pending.length === 0 &&
    runtime.construction.allOrders().every(order => order.state === 'completed'));
  expect(runtime.placedObjects.getSnapshot()).toHaveLength(templateId === 'cell-basic' ? 2 : 8);
  return runtime;
}
it.each([false, true])('refuses cancelling an occupied template fixture without partial reversal, saved=%s', saved => {
  let runtime = cell();
  send(runtime, { type: 'AdmitPrisoner', sentenceLengthTicks: 1_000_000, priorIncidents: 0, x: 16, y: 16 });
  until(runtime, () => runtime.prisoners.roomInstances.totalOccupancy === 1);
  if (saved) runtime = reload(runtime);
  const fixture = runtime.construction.allOrders().find(order => order.id.includes('-2-object-000'))!;
  expect(fixture).toMatchObject({ state: 'completed' });
  const { kernel: _beforeKernel, ...before } = captureSessionSnapshot(runtime);
  send(runtime, { type: 'CancelBuildOrder', orderId: fixture.id, expectedRevision: runtime.construction.revisionOf(fixture.id) });
  const { kernel: _afterKernel, ...after } = captureSessionSnapshot(runtime);
  expect(after).toEqual(before);
  expect(runtime.refusals.last).toMatchObject({ reason: 'unzone.room-occupied' });
});
const orientations = [false, true].flatMap(mirrorX => ([0, 1, 2, 3] as const).map(quarterTurns => ({ mirrorX, quarterTurns })));
it.each(orientations.flatMap(orientation => [false, true].map(legacy => ({ ...orientation, legacy }))))(
  'keeps an occupied row intact when cancelling one shell door, mirror=$mirrorX turn=$quarterTurns legacy=$legacy', ({ mirrorX, quarterTurns, legacy }) => {
    let runtime = cell('cell-row-four', mirrorX, quarterTurns);
    send(runtime, { type: 'AdmitPrisoner', sentenceLengthTicks: 1_000_000, priorIncidents: 0, x: 16, y: 16 });
    until(runtime, () => runtime.prisoners.roomInstances.totalOccupancy === 1);
    runtime = reload(runtime, legacy);
    const door = runtime.construction.allOrders().find(order => order.id.includes('-1-door-000'))!;
    expect(door).toMatchObject({ state: 'completed' });
    const { kernel: _beforeKernel, ...before } = captureSessionSnapshot(runtime);
    send(runtime, { type: 'CancelBuildOrder', orderId: door.id, expectedRevision: runtime.construction.revisionOf(door.id) });
    const { kernel: _afterKernel, ...after } = captureSessionSnapshot(runtime);
    expect(after).toEqual(before);
    expect(runtime.refusals.last).toMatchObject({ reason: 'unzone.room-occupied' });
  });
it('leaves stale occupied cancellation on its existing refusal path before any relocation', () => {
  const runtime = cell();
  send(runtime, { type: 'AdmitPrisoner', sentenceLengthTicks: 1_000_000, priorIncidents: 0, x: 16, y: 16 });
  until(runtime, () => runtime.prisoners.roomInstances.totalOccupancy === 1);
  const fixture = runtime.construction.allOrders().find(order => order.id.includes('-2-object-000'))!;
  const { kernel: _beforeKernel, ...before } = captureSessionSnapshot(runtime);
  send(runtime, { type: 'CancelBuildOrder', orderId: fixture.id, expectedRevision: (BigInt(runtime.construction.revisionOf(fixture.id)) - 1n).toString() });
  const { kernel: _afterKernel, ...after } = captureSessionSnapshot(runtime);
  expect(after).toEqual(before);
  expect(runtime.refusals.last).toMatchObject({ reason: 'cancel-build-order.stale-cancellation' });
});
it('keeps an ordinary unrelated completed wall cancellation legal beside an occupied template', () => {
  const runtime = cell();
  send(runtime, { type: 'PlaceBuildOrder', orderId: 'ordinary', definitionId: 'wall-brick', x: 2, y: 2, footprint: 'square' });
  until(runtime, () => runtime.construction.getOrder('ordinary')?.state === 'completed');
  send(runtime, { type: 'AdmitPrisoner', sentenceLengthTicks: 1_000_000, priorIncidents: 0, x: 16, y: 16 });
  until(runtime, () => runtime.prisoners.roomInstances.totalOccupancy === 1);
  send(runtime, { type: 'CancelBuildOrder', orderId: 'ordinary', expectedRevision: runtime.construction.revisionOf('ordinary') });
  expect(runtime.world.getSquareStructure({ x: tileCoordinate(2), y: tileCoordinate(2) })).toBe(0);
  expect(runtime.placedObjects.getSnapshot()).toHaveLength(2);
  expect(runtime.prisoners.roomInstances.totalOccupancy).toBe(1);
});
it.each([false, true])('relocates to an older real spare before saved whole-gesture cancellation, legacy=%s', legacy => {
  let runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 20, y: 5 } });
  until(runtime, () => runtime.construction.allOrders().every(order => order.state === 'completed') && runtime.roomTemplates.snapshot().pending.length === 0);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 }, mirrorX: true, quarterTurns: 1 });
  until(runtime, () => runtime.construction.allOrders().every(order => order.state === 'completed') && runtime.roomTemplates.snapshot().pending.length === 0);
  send(runtime, { type: 'AdmitPrisoner', sentenceLengthTicks: 1_000_000, priorIncidents: 0, x: 16, y: 16 });
  until(runtime, () => runtime.prisoners.roomInstances.totalOccupancy === 1);
  runtime = reload(runtime, legacy);
  const resident = runtime.prisoners.roomInstances.occupantsOf('room.cell:11:11')[0]!;
  expect(resident).toBeDefined();
  const fixture = runtime.construction.allOrders().find(order => order.id.includes('000000000001-2-object-000'))!;
  expect(fixture).toMatchObject({ state: 'completed' });
  send(runtime, { type: 'CancelBuildOrder', orderId: fixture.id, expectedRevision: runtime.construction.revisionOf(fixture.id) });
  expect(runtime.prisoners.roomInstances.getById('room.cell:11:11')).toBeUndefined();
  expect(runtime.prisoners.roomInstances.occupantsOf('room.cell:21:6')).toEqual([resident]);
  expect(runtime.placedObjects.getSnapshot()).toHaveLength(2);
  expect(runtime.construction.allOrders().filter(order => order.state === 'cancelled')).toHaveLength(20);
  runtime = reload(runtime);
  expect(runtime.prisoners.roomInstances.occupantsOf('room.cell:21:6')).toEqual([resident]);
  expect(runtime.placedObjects.getSnapshot()).toHaveLength(2);
});
it('allows the same cancellation after the actual sentence releases the only resident', () => {
  let runtime = cell();
  send(runtime, { type: 'AdmitPrisoner', sentenceLengthTicks: 400, priorIncidents: 0, x: 16, y: 16 });
  until(runtime, () => runtime.prisoners.roomInstances.totalOccupancy === 1);
  runtime = reload(runtime);
  const fixture = runtime.construction.allOrders().find(order => order.id.includes('-2-object-000'))!;
  send(runtime, { type: 'CancelBuildOrder', orderId: fixture.id, expectedRevision: runtime.construction.revisionOf(fixture.id) });
  expect(runtime.refusals.last).toMatchObject({ reason: 'unzone.room-occupied' });
  until(runtime, () => runtime.prisoners.roomInstances.totalOccupancy === 0);
  send(runtime, { type: 'CancelBuildOrder', orderId: fixture.id, expectedRevision: runtime.construction.revisionOf(fixture.id) });
  expect(runtime.placedObjects.getSnapshot()).toEqual([]);
  expect(runtime.prisoners.roomInstances.getById('room.cell:11:11')).toBeUndefined();
  expect(runtime.refusals.last?.reason).not.toBe('unzone.room-occupied');
  expect(reload(runtime).placedObjects.getSnapshot()).toEqual([]);
});
it('honors actual completed metadata in a valid restored order book without an Undo group', () => {
  let runtime = cell();
  send(runtime, { type: 'AdmitPrisoner', sentenceLengthTicks: 1_000_000, priorIncidents: 0, x: 16, y: 16 });
  until(runtime, () => runtime.prisoners.roomInstances.totalOccupancy === 1);
  runtime = reload(runtime, false, true);
  expect(runtime.roomTemplates.snapshot().completed).toHaveLength(1);
  expect(runtime.construction.hasSomethingToUndo).toBe(false);
  const fixture = runtime.construction.allOrders().find(order => order.id.includes('-2-object-000'))!;
  const { kernel: _beforeKernel, ...before } = captureSessionSnapshot(runtime);
  send(runtime, { type: 'CancelBuildOrder', orderId: fixture.id, expectedRevision: runtime.construction.revisionOf(fixture.id) });
  const { kernel: _afterKernel, ...after } = captureSessionSnapshot(runtime);
  expect(after).toEqual(before);
  expect(runtime.refusals.last).toMatchObject({ reason: 'unzone.room-occupied' });
});
it.each([false, true])('protects a genuinely undone, saved and redone Cell after admission, legacy=%s', legacy => {
  let runtime = cell();
  send(runtime, { type: 'Undo' });
  expect(runtime.placedObjects.getSnapshot()).toEqual([]);
  runtime = reload(runtime);
  send(runtime, { type: 'Redo' });
  until(runtime, () => runtime.roomTemplates.snapshot().pending.length === 0 && runtime.construction.allOrders().every(order => order.state === 'completed'));
  send(runtime, { type: 'AdmitPrisoner', sentenceLengthTicks: 1_000_000, priorIncidents: 0, x: 16, y: 16 });
  until(runtime, () => runtime.prisoners.roomInstances.totalOccupancy === 1);
  runtime = reload(runtime, legacy);
  const fixture = runtime.construction.allOrders().find(order => order.id.includes('-2-object-000'))!;
  const { kernel: _beforeKernel, ...before } = captureSessionSnapshot(runtime);
  send(runtime, { type: 'CancelBuildOrder', orderId: fixture.id, expectedRevision: runtime.construction.revisionOf(fixture.id) });
  const { kernel: _afterKernel, ...after } = captureSessionSnapshot(runtime);
  expect(after).toEqual(before);
  expect(runtime.refusals.last).toMatchObject({ reason: 'unzone.room-occupied' });
});
it('retains the existing full-gesture cancellation of a completed unoccupied template fixture', () => {
  const runtime = reload(cell());
  const fixture = runtime.construction.allOrders().find(order => order.id.includes('-2-object-000'))!;
  send(runtime, { type: 'CancelBuildOrder', orderId: fixture.id, expectedRevision: runtime.construction.revisionOf(fixture.id) });
  expect(runtime.construction.allOrders().every(order => order.state === 'cancelled')).toBe(true);
  expect(runtime.placedObjects.getSnapshot()).toEqual([]);
  expect(runtime.prisoners.roomInstances.getById('room.cell:11:11')).toBeUndefined();
});
