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
    });
