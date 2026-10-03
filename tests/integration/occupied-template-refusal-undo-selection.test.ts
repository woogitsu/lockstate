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
function reload(runtime: Runtime, unknownOwner = false): Runtime {
  const original = captureSessionSnapshot(runtime);
  const bundle = unknownOwner ? { ...original, simulation: { ...original.simulation!, objects: {
    ...original.simulation!.objects!, placedObjects: original.simulation!.objects!.placedObjects.map(object => {
      if (object.objectId !== 'object.bed') return object;
      const { sourceOrderId: _owner, ...legacy } = object;
      return legacy;
    }),
  } } } : original;
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(createSaveEnvelope({
    gameVersion: 'test', prisonId: 'refused-history', revision: 1, createdAt: 0, updatedAt: 1,
    ...bundle,
  }))));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('The actual partial occupied row and latest independent purchase must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}

const surfaces = ['none', 'queue', 'stale', 'supply', 'pending-object', 'pending-wall', 'completed-wall', 'unknown-owner',
  'successful-queue', 'successful-wall', 'successful-object', 'successful-supply'] as const;
it.each([false, true].flatMap(saved => surfaces.map(surface => ({ saved, surface }))))(
  'latest independent purchase eligibility after a real reversal: saved=$saved surface=$surface',
  ({ saved, surface }) => {
    let runtime = createNewSimulationRuntime(73);
    send(runtime, { type: 'PurchaseMaterials', orderId: 'brick-stock', itemId: 'item.brick', quantity: 648 });
    until(runtime, () => runtime.procurement.pendingDeliveries.length === 0);
    send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-row-four', origin: { x: 10, y: 10 }, mirrorX: true, quarterTurns: 1 });
    until(runtime, () => runtime.construction.allOrders().some(order => order.definitionId === 'bed-wooden' && order.state === 'completed'));
    send(runtime, { type: 'AdmitPrisoner', sentenceLengthTicks: 1_000_000, priorIncidents: 0, x: 16, y: 16 });
    until(runtime, () => runtime.prisoners.roomInstances.totalOccupancy === 1);
    if (surface === 'supply') {
      send(runtime, { type: 'SellMaterials', itemId: 'item.brick', quantity: 3 });
      until(runtime, () => runtime.procurement.pendingDeliveries.some(delivery => delivery.itemId === 'item.wood-plank'));
    }
    if (surface === 'successful-supply') {
      send(runtime, { type: 'SellMaterials', itemId: 'item.brick', quantity: 2 });
      send(runtime, { type: 'PurchaseMaterials', orderId: 'independent-stock', itemId: 'item.brick', quantity: 1 });
      expect(runtime.procurement.pendingDeliveries.find(delivery => delivery.orderId === 'independent-stock')).toBeDefined();
    }
    send(runtime, { type: 'PlaceBuildOrder', orderId: 'latest-independent-wall', definitionId: 'wall-brick', x: 2, y: 2, footprint: 'square' });
    until(runtime, () => runtime.construction.getOrder('latest-independent-wall')?.state === 'completed');
    expect(runtime.construction.undoWouldReachPastTheLatestAction).toBe(false);
    expect(runtime.construction.allOrders().filter(order => order.definitionId === 'bed-wooden' && order.state === 'materials-pending')).toHaveLength(3);
    const funds = surface === 'supply' ? -1250 : -1245;
    expect(runtime.treasury.balanceMinorUnits).toBe(funds);
    if (saved || surface === 'unknown-owner') runtime = reload(runtime, surface === 'unknown-owner');
    const bed = runtime.construction.allOrders().find(order => order.definitionId === 'bed-wooden' && order.state === 'completed')!;
    const objects = runtime.placedObjects.getSnapshot();
    const templates = runtime.roomTemplates.snapshot();
    if (surface.startsWith('successful-')) {
      if (surface === 'successful-queue') send(runtime, { type: 'CancelBuildOrder', orderId: 'latest-independent-wall', expectedRevision: runtime.construction.revisionOf('latest-independent-wall') });
      if (surface === 'successful-wall') send(runtime, { type: 'RemoveWall', x: 2, y: 2, edge: 'north' });
      if (surface === 'successful-object') send(runtime, { type: 'RemoveObject', x: bed.location.x, y: bed.location.y });
      if (surface === 'successful-supply') {
        expect(runtime.procurement.pendingDeliveries.find(delivery => delivery.orderId === 'independent-stock')).toBeDefined();
        send(runtime, { type: 'CancelMaterialPurchase', orderId: 'independent-stock' });
      }
      expect(runtime.construction.undoWouldReachPastTheLatestAction).toBe(true);
      const { kernel: _beforeKernel, ...before } = captureSessionSnapshot(runtime);
      send(runtime, { type: 'Undo' });
      const { kernel: _afterKernel, ...after } = captureSessionSnapshot(runtime);
      // Existing Undo refusal records its event, while no world/history changes.
      expect(after.construction).toEqual(before.construction);
      expect(after.world).toEqual(before.world);
      expect(runtime.treasury.balanceMinorUnits).toBe(surface === 'successful-supply' ? funds + 40 : funds);
      return;
    }
    if (surface !== 'none') {
      const { kernel: _beforeKernel, ...before } = captureSessionSnapshot(runtime);
      if (surface === 'queue' || surface === 'unknown-owner' || surface === 'stale') send(runtime, {
        type: 'CancelBuildOrder', orderId: bed.id,
        expectedRevision: runtime.construction.revisionOf(bed.id)! + (surface === 'stale' ? 1 : 0),
      });
      if (surface === 'supply') {
        const delivery = runtime.procurement.pendingDeliveries.find(row => row.itemId === 'item.wood-plank')!;
        expect(delivery).toBeDefined();
        send(runtime, { type: 'CancelMaterialPurchase', orderId: delivery.orderId });
      }
      if (surface === 'pending-object' || surface === 'pending-wall') {
        const pending = runtime.construction.allOrders().find(order => order.definitionId === 'bed-wooden' && order.state === 'materials-pending')!;
        send(runtime, { type: surface === 'pending-object' ? 'RemoveObject' : 'RemoveWall', x: pending.location.x + 1, y: pending.location.y,
          ...(surface === 'pending-wall' ? { edge: 'north' as const } : {}),
        } as SimulationCommand);
      }
      if (surface === 'completed-wall') {
        const shell = runtime.construction.allOrders().find(order => order.definitionId === 'wall-brick' && order.id !== 'latest-independent-wall')!;
        send(runtime, { type: 'RemoveWall', x: shell.location.x, y: shell.location.y, edge: 'north' });
      }
      const { kernel: _afterKernel, ...after } = captureSessionSnapshot(runtime);
      expect(after).toEqual(before);
      expect(runtime.refusals.last).toMatchObject({ reason: surface === 'stale' ? 'cancel-build-order.stale-cancellation' :
        surface === 'unknown-owner' ? 'construction.object-ownership-unknown' : 'unzone.room-occupied' });
    }
    send(runtime, { type: 'Undo' });
    expect(runtime.construction.getOrder('latest-independent-wall')?.state).toBe('cancelled');
    expect(runtime.construction.getOrder(bed.id)?.state).toBe('completed');
    expect(runtime.placedObjects.getSnapshot()).toEqual(objects);
    expect(runtime.roomTemplates.snapshot()).toEqual(templates);
    expect(runtime.prisoners.roomInstances.totalOccupancy).toBe(1);
    expect(runtime.treasury.balanceMinorUnits).toBe(funds);
  },
);
