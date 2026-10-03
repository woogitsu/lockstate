import { expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';

type Runtime = ReturnType<typeof createNewSimulationRuntime>;
function send(runtime: Runtime, command: SimulationCommand) {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`refused-history-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}
function until(runtime: Runtime, predicate: () => boolean) {
  for (let tick = 0; tick < 30_000 && !predicate(); tick++) runtime.kernel.step();
  expect(predicate()).toBe(true);
}
function reload(runtime: Runtime): Runtime {
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(createSaveEnvelope({
    gameVersion: 'test', prisonId: 'refused-history', revision: 1, createdAt: 0, updatedAt: 1,
    ...captureSessionSnapshot(runtime),
  }))));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('The actual partial occupied row and latest independent purchase must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}

it.each([false, true].flatMap(saved => [false, true].map(refusedCancellation => ({ saved, refusedCancellation }))))(
  'latest independent purchase still undoes after an occupied template refusal: saved=$saved refused=$refusedCancellation',
  ({ saved, refusedCancellation }) => {
    let runtime = createNewSimulationRuntime(73);
    send(runtime, { type: 'PurchaseMaterials', orderId: 'brick-stock', itemId: 'item.brick', quantity: 648 });
    until(runtime, () => runtime.procurement.pendingDeliveries.length === 0);
    send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-row-four', origin: { x: 10, y: 10 }, mirrorX: true, quarterTurns: 1 });
    until(runtime, () => runtime.construction.allOrders().some(order => order.definitionId === 'bed-wooden' && order.state === 'completed'));
    send(runtime, { type: 'AdmitPrisoner', sentenceLengthTicks: 1_000_000, priorIncidents: 0, x: 16, y: 16 });
    until(runtime, () => runtime.prisoners.roomInstances.totalOccupancy === 1);
    send(runtime, { type: 'PlaceBuildOrder', orderId: 'latest-independent-wall', definitionId: 'wall-brick', x: 2, y: 2, footprint: 'square' });
    until(runtime, () => runtime.construction.getOrder('latest-independent-wall')?.state === 'completed');
    expect(runtime.construction.undoWouldReachPastTheLatestAction).toBe(false);
    expect(runtime.construction.allOrders().filter(order => order.definitionId === 'bed-wooden' && order.state === 'materials-pending')).toHaveLength(3);
    expect(runtime.treasury.balanceMinorUnits).toBe(-1245);
    if (saved) runtime = reload(runtime);
    const bed = runtime.construction.allOrders().find(order => order.definitionId === 'bed-wooden' && order.state === 'completed')!;
    const objects = runtime.placedObjects.getSnapshot();
    const templates = runtime.roomTemplates.snapshot();
    if (refusedCancellation) {
      const { kernel: _beforeKernel, ...before } = captureSessionSnapshot(runtime);
      send(runtime, { type: 'CancelBuildOrder', orderId: bed.id, expectedRevision: runtime.construction.revisionOf(bed.id) });
      const { kernel: _afterKernel, ...after } = captureSessionSnapshot(runtime);
      expect(after).toEqual(before);
      expect(runtime.refusals.last).toMatchObject({ reason: 'unzone.room-occupied' });
    }
    send(runtime, { type: 'Undo' });
    expect(runtime.construction.getOrder('latest-independent-wall')?.state).toBe('cancelled');
    expect(runtime.construction.getOrder(bed.id)?.state).toBe('completed');
    expect(runtime.placedObjects.getSnapshot()).toEqual(objects);
    expect(runtime.roomTemplates.snapshot()).toEqual(templates);
    expect(runtime.prisoners.roomInstances.totalOccupancy).toBe(1);
    expect(runtime.treasury.balanceMinorUnits).toBe(-1245);
  },
);
