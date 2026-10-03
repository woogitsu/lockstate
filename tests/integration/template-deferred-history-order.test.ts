import { expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';

type Runtime = ReturnType<typeof createNewSimulationRuntime>;
function send(runtime: Runtime, command: SimulationCommand) {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`history-interleave-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}
function finish(runtime: Runtime) {
  const done = () => runtime.roomTemplates.snapshot().pending.length === 0 &&
    runtime.construction.allOrders().every(order => ['completed', 'cancelled', 'failed'].includes(order.state));
  for (let tick = 0; tick < 30_000 && !done(); tick++) runtime.kernel.step();
  expect(done()).toBe(true);
}
function reload(runtime: Runtime): Runtime {
  const bundle = captureSessionSnapshot(runtime);
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(createSaveEnvelope({
    gameVersion: 'test', prisonId: 'history-interleave', revision: 1, createdAt: 0, updatedAt: 1, ...bundle,
  }))));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Actual completed history V8 save must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}

it.each([false, true].flatMap(load => [false, true].flatMap(buyBeforeCompletion =>
  [false, true].map(rotated => ({ load, buyBeforeCompletion, rotated })))))
  ('latest actual legal purchase must Undo after template completion: load=$load early=$buyBeforeCompletion rotated=$rotated',
    ({ load, buyBeforeCompletion, rotated }) => {
      let runtime = createNewSimulationRuntime(73);
      send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 }, mirrorX: rotated, quarterTurns: rotated ? 1 : 0 });
      if (!buyBeforeCompletion) finish(runtime);
      send(runtime, { type: 'PlaceBuildOrder', orderId: 'latest-independent-bed', definitionId: 'bed-wooden', x: 11, y: 8 });
      expect(runtime.construction.getOrder('latest-independent-bed')?.state).toBe('approved');
      finish(runtime);
      expect(runtime.placedObjects.getSnapshot()).toHaveLength(3);
      expect(runtime.roomTemplates.snapshot().completed).toHaveLength(1);
      if (load) runtime = reload(runtime);
      const before = captureSessionSnapshot(runtime);
      const funds = runtime.treasury.balanceMinorUnits;
      send(runtime, { type: 'Undo' });

      expect(runtime.construction.getOrder('latest-independent-bed')?.state).toBe('cancelled');
      expect(runtime.placedObjects.getSnapshot()).toHaveLength(2);
      expect(runtime.roomTemplates.snapshot().completed).toEqual(before.simulation?.roomTemplates?.completed);
      expect(runtime.construction.allOrders().filter(order => order.id !== 'latest-independent-bed').every(order => order.state === 'completed')).toBe(true);
      expect(runtime.treasury.balanceMinorUnits).toBe(funds);
      send(runtime, { type: 'Undo' });
      expect(runtime.placedObjects.getSnapshot()).toEqual([]);
      expect(runtime.roomTemplates.snapshot().undone).toHaveLength(1);
      runtime = reload(runtime);
      send(runtime, { type: 'Redo' });
      finish(runtime);
      expect(runtime.placedObjects.getSnapshot()).toHaveLength(2);
      expect(runtime.construction.getOrder('latest-independent-bed')?.state).toBe('cancelled');
      send(runtime, { type: 'Redo' });
      finish(runtime);
      expect(runtime.placedObjects.getSnapshot()).toHaveLength(3);
      expect(runtime.construction.getOrder('latest-independent-bed')?.state).toBe('completed');
      expect(runtime.roomTemplates.snapshot().completed).toHaveLength(1);
    });

it.each([false, true])('deferred work preserves the live newer unrelated action refusal, rotated=%s', rotated => {
  const runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 }, quarterTurns: rotated ? 1 : 0, mirrorX: rotated });
  send(runtime, { type: 'HireStaff', staffRoleId: 'staff-role.guard', x: 4, y: 4 });
  expect(runtime.construction.undoWouldReachPastTheLatestAction).toBe(true);
  finish(runtime);
  expect(runtime.construction.undoWouldReachPastTheLatestAction).toBe(true);
  const { kernel: _beforeKernel, ...before } = captureSessionSnapshot(runtime);
  send(runtime, { type: 'Undo' });
  const { kernel: _afterKernel, ...after } = captureSessionSnapshot(runtime);
  const alerts = before.simulation!.alerts!;
  expect(after).toEqual({
    ...before,
    simulation: {
      ...before.simulation,
      alerts: {
        ...alerts, sequence: alerts.sequence + 1,
        records: [...alerts.records, { sequence: alerts.sequence + 1, tick: runtime.kernel.tick, type: 'construction.undo-refused-newer-action' }],
      },
    },
  });
});

it.each([false, true])('deferred completion preserves genuine independent Redo, load=%s', load => {
  let runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 } });
  send(runtime, { type: 'PlaceBuildOrder', orderId: 'independent-to-redo', definitionId: 'bed-wooden', x: 11, y: 8 });
  send(runtime, { type: 'Undo' });
  const redo = runtime.construction.snapshot().redoStack;
  expect(redo).toEqual([['independent-to-redo']]);
  finish(runtime);
  expect(runtime.construction.snapshot().redoStack).toEqual(redo);
  expect(runtime.placedObjects.getSnapshot()).toHaveLength(2);
  if (load) runtime = reload(runtime);
  send(runtime, { type: 'Redo' });
  finish(runtime);
  expect(runtime.construction.getOrder('independent-to-redo')?.state).toBe('completed');
  expect(runtime.placedObjects.getSnapshot().some(object => object.sourceOrderId === 'independent-to-redo')).toBe(true);
});

it('unmatched deferred history creates no newer gesture and preserves the existing Redo', () => {
  const runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceBuildOrder', orderId: 'existing-redo', definitionId: 'bed-wooden', x: 5, y: 5 });
  send(runtime, { type: 'Undo' });
  const history = runtime.construction.snapshot();
  expect(runtime.construction.hasSomethingToUndo).toBe(false);
  runtime.construction.registerTransactionOrder('unrecorded-deferred-fixture', 'old-plan', ['unrecorded-shell']);
  expect(runtime.construction.snapshot()).toEqual(history);
  expect(runtime.construction.hasSomethingToUndo).toBe(false);
});
