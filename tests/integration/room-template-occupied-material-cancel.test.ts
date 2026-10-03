import { expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';

type Runtime = ReturnType<typeof createNewSimulationRuntime>;
function send(runtime: Runtime, command: SimulationCommand) {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`occupied-material-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}
function until(runtime: Runtime, predicate: () => boolean) {
  for (let tick = 0; tick < 30_000 && !predicate(); tick++) runtime.kernel.step();
  expect(predicate()).toBe(true);
}
function reload(runtime: Runtime): Runtime {
  const bundle = captureSessionSnapshot(runtime);
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(createSaveEnvelope({
    gameVersion: 'test', prisonId: 'occupied-material', revision: 1, createdAt: 0, updatedAt: 1, ...bundle,
  }))));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('The actual partially furnished row must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}
function partiallyFurnishedRow(): Runtime {
  const runtime = createNewSimulationRuntime(73);
  // A genuine stock purchase leaves enough construction headroom for four
  // doors and one bed. Brick stock funds all walls and toilets without a debit.
  send(runtime, { type: 'PurchaseMaterials', orderId: 'stock-for-row', itemId: 'item.brick', quantity: 648 });
  expect(runtime.treasury.balanceMinorUnits).toBe(-920);
  until(runtime, () => runtime.procurement.pendingDeliveries.length === 0);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-row-four', origin: { x: 10, y: 10 }, quarterTurns: 1, mirrorX: true });
  until(runtime, () => runtime.construction.allOrders().some(order => order.definitionId === 'bed-wooden' && order.state === 'completed'));
  expect(runtime.construction.allOrders()).toHaveLength(66);
  expect(runtime.construction.allOrders().filter(order => order.definitionId === 'bed-wooden' && order.state === 'materials-pending')).toHaveLength(3);
  expect(runtime.placedObjects.getSnapshot().filter(object => object.objectId === 'object.bed')).toHaveLength(1);
  expect(runtime.treasury.balanceMinorUnits).toBe(-1245);
  return runtime;
}
function buyNextBedMaterial(runtime: Runtime) {
  send(runtime, { type: 'SellMaterials', itemId: 'item.brick', quantity: 3 });
  until(runtime, () => runtime.procurement.pendingDeliveries.some(delivery => delivery.itemId === 'item.wood-plank'));
  const delivery = runtime.procurement.pendingDeliveries.find(row => row.itemId === 'item.wood-plank')!;
  expect(delivery).toMatchObject({ quantity: 1, paidMinorUnits: 65 });
  expect(runtime.treasury.balanceMinorUnits).toBe(-1250);
  return delivery.orderId;
}

it.each([false, true])('refuses JIT cancellation before refund or demolition of an occupied row, encodedLoad=%s', saved => {
  let runtime = partiallyFurnishedRow();
  send(runtime, { type: 'AdmitPrisoner', sentenceLengthTicks: 1_000_000, priorIncidents: 0, x: 16, y: 16 });
  until(runtime, () => runtime.prisoners.roomInstances.totalOccupancy === 1);
  const deliveryId = buyNextBedMaterial(runtime);
  if (saved) runtime = reload(runtime);
  const { kernel: _beforeKernel, ...before } = captureSessionSnapshot(runtime);
  send(runtime, { type: 'CancelMaterialPurchase', orderId: deliveryId });
  // Funds is an independent, short assertion before the full atomic snapshot.
  expect(runtime.treasury.balanceMinorUnits).toBe(-1250);
  const { kernel: _afterKernel, ...after } = captureSessionSnapshot(runtime);
  expect(after).toEqual(before);
  expect(runtime.refusals.last).toMatchObject({ reason: 'unzone.room-occupied' });
});

it.each([false, true])('retains whole-gesture JIT cancellation of the same unoccupied row, encodedLoad=%s', saved => {
  let runtime = partiallyFurnishedRow();
  const deliveryId = buyNextBedMaterial(runtime);
  if (saved) runtime = reload(runtime);
  send(runtime, { type: 'CancelMaterialPurchase', orderId: deliveryId });
  expect(runtime.construction.allOrders()).toHaveLength(66);
  expect(runtime.construction.allOrders().every(order => order.state === 'cancelled')).toBe(true);
  expect(runtime.placedObjects.getSnapshot()).toEqual([]);
  expect(runtime.prisoners.roomInstances.allByRoomCatalogId('room.cell')).toEqual([]);
  expect(runtime.roomTemplates.snapshot()).toEqual({ version: 1, pending: [] });
  expect(runtime.procurement.pendingDeliveries).toEqual([]);
  expect(runtime.treasury.balanceMinorUnits).toBe(-1185);
  runtime = reload(runtime);
  for (let tick = 0; tick < 150; tick++) runtime.kernel.step();
  expect(runtime.treasury.balanceMinorUnits).toBe(-1185);
  expect(runtime.procurement.pendingDeliveries).toEqual([]);
});
