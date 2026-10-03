import { expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';

type Runtime = ReturnType<typeof createNewSimulationRuntime>;
function send(runtime: Runtime, command: SimulationCommand) {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`unzone-history-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}
function until(runtime: Runtime, predicate: () => boolean) {
  for (let tick = 0; tick < 30_000 && !predicate(); tick++) runtime.kernel.step();
  expect(predicate()).toBe(true);
}
function reload(runtime: Runtime): Runtime {
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(createSaveEnvelope({
    gameVersion: 'test', prisonId: 'refused-unzone', revision: 1, createdAt: 0, updatedAt: 1,
    ...captureSessionSnapshot(runtime),
  }))));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Actual completed template and independent purchase must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}

it.each([false, true].flatMap(saved => ['none', 'refused', 'successful'].map(surface => ({ saved, surface }))))(
  'manual template unzone preserves truthful independent Undo: saved=$saved surface=$surface', ({ saved, surface }) => {
    let runtime = createNewSimulationRuntime(73);
    send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 5, y: 5 }, mirrorX: true, quarterTurns: 1 });
    until(runtime, () => runtime.roomTemplates.snapshot().pending.length === 0 && runtime.construction.allOrders().every(order => order.state === 'completed'));
    if (surface !== 'successful') {
      send(runtime, { type: 'AdmitPrisoner', sentenceLengthTicks: 1_000_000, priorIncidents: 0, x: 16, y: 16 });
      until(runtime, () => runtime.prisoners.roomInstances.totalOccupancy === 1);
    }
    send(runtime, { type: 'PlaceBuildOrder', orderId: 'latest-independent-wall', definitionId: 'wall-brick', x: 2, y: 2, footprint: 'square' });
    until(runtime, () => runtime.construction.getOrder('latest-independent-wall')?.state === 'completed');
    if (saved) runtime = reload(runtime);
    const room = runtime.prisoners.roomInstances.allByRoomCatalogId('room.cell')[0]!;
    const owners = runtime.placedObjects.getSnapshot();
    const templates = runtime.roomTemplates.snapshot();
    const funds = runtime.treasury.balanceMinorUnits;
    const { kernel: _beforeKernel, ...before } = captureSessionSnapshot(runtime);
    if (surface === 'refused') {
      send(runtime, { type: 'UnzoneRoom', ...room.anchorTile, width: room.width!, height: room.height! });
      expect(runtime.refusals.last).toMatchObject({ reason: 'unzone.room-occupied' });
      const { kernel: _afterKernel, ...after } = captureSessionSnapshot(runtime);
      expect(after).toEqual(before);
    }
    if (surface === 'successful') {
      send(runtime, { type: 'UnzoneRoom', ...room.anchorTile, width: room.width!, height: room.height! });
      expect(runtime.refusals.count).toBe(0);
      expect(runtime.prisoners.roomInstances.allByRoomCatalogId('room.cell')).toHaveLength(0);
      const successful = captureSessionSnapshot(runtime);
      send(runtime, { type: 'Undo' });
      expect(runtime.construction.getOrder('latest-independent-wall')?.state).toBe('completed');
      const afterUndo = captureSessionSnapshot(runtime);
      expect(afterUndo.world).toEqual(successful.world);
      expect(afterUndo.construction).toEqual(successful.construction);
      expect(runtime.placedObjects.getSnapshot()).toEqual(owners);
      expect(runtime.treasury.balanceMinorUnits).toBe(funds);
      return;
    }
    send(runtime, { type: 'Undo' });
    expect(runtime.construction.getOrder('latest-independent-wall')?.state).toBe('cancelled');
    expect(runtime.placedObjects.getSnapshot()).toEqual(owners);
    expect(runtime.roomTemplates.snapshot()).toEqual(templates);
    expect(runtime.prisoners.roomInstances.totalOccupancy).toBe(1);
    expect(runtime.treasury.balanceMinorUnits).toBe(funds);
  },
);
