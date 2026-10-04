import { expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { PROJECTION_CATALOG } from '../../src/simulation/worker/projection-catalog';

type Runtime = ReturnType<typeof createNewSimulationRuntime>;
function send(runtime: Runtime, command: SimulationCommand): void {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`id-admission-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}
function reload(runtime: Runtime): Runtime {
  const bundle = captureSessionSnapshot(runtime);
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(createSaveEnvelope({
    gameVersion: 'test', prisonId: 'template-id-admission', revision: 1, createdAt: 0, updatedAt: 1, ...bundle,
  }))));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Actual order book must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}
function gameplay(runtime: Runtime) {
  const { kernel: _kernel, ...snapshot } = captureSessionSnapshot(runtime);
  return snapshot;
}

it.each(['0-wall-005', '2-object-000'].flatMap(suffix => [false, true].map(load => ({ suffix, load }))))(
  'refuses the complete rotated mirrored template before any mutation when a real unrelated order owns $suffix, load=$load',
  ({ suffix, load }) => {
    let runtime = createNewSimulationRuntime(73);
    const id = `room-template-000000000001-${suffix}`;
    send(runtime, { type: 'PlaceBuildOrder', orderId: id, definitionId: 'wall-brick', x: 2, y: 2, footprint: 'square' });
    expect(runtime.construction.getOrder(id)?.state).toBe('approved');
    if (load) runtime = reload(runtime);
    const before = gameplay(runtime);
    const request = { templateId: 'cell-basic' as const, origin: { x: 10, y: 10 }, quarterTurns: 1 as const, mirrorX: true };
    // The geometric query is write-free; order identity belongs to the actual
    // command sequence, which the public preflight target intentionally lacks.
    expect(PROJECTION_CATALOG['world/room-template-preflight'].project(runtime, runtime.kernel.tick,
      { target: { kind: 'room-template', ...request } }).view).toEqual({ ok: true });
    expect(gameplay(runtime)).toEqual(before);
    expect(() => send(runtime, { type: 'PlaceRoomTemplate', ...request })).not.toThrow();
    console.log(JSON.stringify({ suffix, load, tick: runtime.kernel.tick, orders: runtime.construction.allOrders().length,
      balance: runtime.treasury.balanceMinorUnits, pending: runtime.roomTemplates.snapshot().pending.length }));
    expect(gameplay(runtime)).toEqual(before);
    expect(runtime.refusals.last?.reason).toBe('build.unbuildable');
  },
);

it.each([false, true])('keeps genuine independent order and rotated mirrored completion/Undo/Redo when IDs differ, load=%s', load => {
  let runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceBuildOrder', orderId: 'independent-square-wall', definitionId: 'wall-brick', x: 2, y: 2, footprint: 'square' });
  if (load) runtime = reload(runtime);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 }, quarterTurns: 3, mirrorX: true });
  const finish = () => {
    for (let ticks = 0; ticks < 30_000 && !runtime.construction.allOrders().every(order => order.state === 'completed'); ticks++) runtime.kernel.step();
    expect(runtime.construction.allOrders().every(order => order.state === 'completed')).toBe(true);
  };
  finish();
  const owners = runtime.placedObjects.getSnapshot();
  expect(owners).toHaveLength(2);
  expect(owners.every(object => object.orientation === 3 && object.sourceOrderId?.startsWith('room-template-000000000001-'))).toBe(true);
  const funds = runtime.treasury.balanceMinorUnits;
  runtime = reload(runtime);
  send(runtime, { type: 'Undo' });
  expect(runtime.construction.getOrder('independent-square-wall')?.state).toBe('completed');
  expect(runtime.placedObjects.size).toBe(0);
  expect(runtime.treasury.balanceMinorUnits).toBe(funds);
  runtime = reload(runtime);
  send(runtime, { type: 'Redo' });
  finish();
  expect(runtime.placedObjects.getSnapshot()).toEqual(owners);
});

it.each([false, true])('preserves a cancelled independently purchased ID instead of overwriting its retained history, load=%s', load => {
  let runtime = createNewSimulationRuntime(73);
  const id = 'room-template-000000000002-0-wall-005';
  send(runtime, { type: 'PlaceBuildOrder', orderId: id, definitionId: 'wall-brick', x: 2, y: 2, footprint: 'square' });
  send(runtime, { type: 'CancelBuildOrder', orderId: id, expectedRevision: runtime.construction.revisionOf(id) });
  expect(runtime.construction.getOrder(id)?.state).toBe('cancelled');
  if (load) runtime = reload(runtime);
  const before = gameplay(runtime);
  expect(() => send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 },
    quarterTurns: 3, mirrorX: true })).not.toThrow();
  expect(gameplay(runtime)).toEqual(before);
  expect(runtime.refusals.last?.reason).toBe('build.unbuildable');
});
