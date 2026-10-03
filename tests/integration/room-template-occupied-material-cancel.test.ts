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
function partiallyFurnishedRow(spare = false): Runtime {
  const runtime = createNewSimulationRuntime(73);
  if (spare) {
    send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 20, y: 24 } });
    until(runtime, () => runtime.construction.allOrders().every(order => order.state === 'completed') && runtime.roomTemplates.snapshot().pending.length === 0);
  }
  // A genuine stock purchase leaves enough construction headroom for four
  // doors and one bed. Brick stock funds all walls and toilets without a debit.
  send(runtime, { type: 'PurchaseMaterials', orderId: 'stock-for-row', itemId: 'item.brick', quantity: spare ? 609 : 648 });
  expect(runtime.treasury.balanceMinorUnits).toBe(spare ? -890 : -920);
  until(runtime, () => runtime.procurement.pendingDeliveries.length === 0);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-row-four', origin: { x: 10, y: 10 }, quarterTurns: 1, mirrorX: true });
  until(runtime, () => runtime.construction.allOrders().some(order => order.placementSequence === (spare ? 2 : 1) && order.definitionId === 'bed-wooden' && order.state === 'completed'));
  expect(runtime.construction.allOrders()).toHaveLength(spare ? 86 : 66);
  expect(runtime.construction.allOrders().filter(order => order.definitionId === 'bed-wooden' && order.state === 'materials-pending')).toHaveLength(3);
  expect(runtime.placedObjects.getSnapshot().filter(object => object.objectId === 'object.bed')).toHaveLength(spare ? 2 : 1);
  expect(runtime.treasury.balanceMinorUnits).toBe(spare ? -1215 : -1245);
  return runtime;
}
function buyNextBedMaterial(runtime: Runtime, spare = false) {
  send(runtime, { type: 'SellMaterials', itemId: 'item.brick', quantity: spare ? 2 : 3 });
  until(runtime, () => runtime.procurement.pendingDeliveries.some(delivery => delivery.itemId === 'item.wood-plank'));
  const delivery = runtime.procurement.pendingDeliveries.find(row => row.itemId === 'item.wood-plank')!;
  expect(delivery).toMatchObject({ quantity: 1, paidMinorUnits: 65 });
  expect(runtime.treasury.balanceMinorUnits).toBe(spare ? -1240 : -1250);
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

it.each([false, true])('relocates into a genuinely completed independent spare before refunding the row delivery, encodedLoad=%s', saved => {
  let runtime = partiallyFurnishedRow(true);
  send(runtime, { type: 'AdmitPrisoner', sentenceLengthTicks: 1_000_000, priorIncidents: 0, x: 16, y: 16 });
  until(runtime, () => runtime.prisoners.roomInstances.totalOccupancy === 1);
  const occupied = runtime.prisoners.roomInstances.allByRoomCatalogId('room.cell').find(room => runtime.prisoners.roomInstances.occupantsOf(room.instanceId).length > 0)!;
  expect(occupied.instanceId).not.toBe('room.cell:21:25');
  const residents = runtime.prisoners.roomInstances.occupantsOf(occupied.instanceId);
  const deliveryId = buyNextBedMaterial(runtime, true);
  if (saved) runtime = reload(runtime);
  const spareObjects = runtime.placedObjects.getSnapshot().filter(object => object.anchorTile.y >= 25);
  send(runtime, { type: 'CancelMaterialPurchase', orderId: deliveryId });
  expect(runtime.treasury.balanceMinorUnits).toBe(-1175);
  expect(runtime.construction.allOrders().filter(order => order.state === 'cancelled')).toHaveLength(66);
  expect(runtime.construction.allOrders().filter(order => order.state === 'completed')).toHaveLength(20);
  expect(runtime.prisoners.roomInstances.allByRoomCatalogId('room.cell').map(room => room.instanceId)).toEqual(['room.cell:21:25']);
  expect(runtime.prisoners.roomInstances.occupantsOf('room.cell:21:25')).toEqual(residents);
  expect(runtime.placedObjects.getSnapshot()).toEqual(spareObjects);
  runtime = reload(runtime);
  expect(runtime.prisoners.roomInstances.occupantsOf('room.cell:21:25')).toEqual(residents);
});

it.each([false, true])('keeps ordinary stock cancellation independent of an occupied template, encodedLoad=%s', saved => {
  let runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 } });
  until(runtime, () => runtime.construction.allOrders().every(order => order.state === 'completed') && runtime.roomTemplates.snapshot().pending.length === 0);
  send(runtime, { type: 'AdmitPrisoner', sentenceLengthTicks: 1_000_000, priorIncidents: 0, x: 16, y: 16 });
  until(runtime, () => runtime.prisoners.roomInstances.totalOccupancy === 1);
  send(runtime, { type: 'PurchaseMaterials', orderId: 'ordinary-stock', itemId: 'item.wood-plank', quantity: 2 });
  if (saved) runtime = reload(runtime);
  const before = captureSessionSnapshot(runtime);
  const funds = runtime.treasury.balanceMinorUnits;
  send(runtime, { type: 'CancelMaterialPurchase', orderId: 'ordinary-stock' });
  expect(runtime.treasury.balanceMinorUnits).toBe(funds + 130);
  expect(captureSessionSnapshot(runtime).construction).toEqual(before.construction);
  expect(captureSessionSnapshot(runtime).world).toEqual(before.world);
  expect(runtime.placedObjects.getSnapshot()).toHaveLength(2);
  expect(runtime.prisoners.roomInstances.totalOccupancy).toBe(1);
});

it.each([false, true])('refuses a delivery affecting occupied and unoccupied gestures collectively, encodedLoad=%s', saved => {
  let runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PurchaseMaterials', orderId: 'stock-for-two-rows', itemId: 'item.brick', quantity: 641 });
  until(runtime, () => runtime.procurement.pendingDeliveries.length === 0);
  for (const x of [2, 12]) send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-row-four', origin: { x, y: 2 } });
  until(runtime, () => runtime.roomTemplates.snapshot().completed?.length === 2 && runtime.placedObjects.getSnapshot().some(object => object.objectId === 'object.bed'));
  send(runtime, { type: 'AdmitPrisoner', sentenceLengthTicks: 1_000_000, priorIncidents: 0, x: 10, y: 18 });
  until(runtime, () => runtime.prisoners.roomInstances.totalOccupancy === 1);
  expect(runtime.procurement.pendingDeliveries).toEqual([]);
  send(runtime, { type: 'SellMaterials', itemId: 'item.brick', quantity: 2 });
  until(runtime, () => runtime.procurement.pendingDeliveries.some(delivery => delivery.itemId === 'item.wood-plank'));
  const delivery = runtime.procurement.pendingDeliveries.find(row => row.itemId === 'item.wood-plank')!;
  if (saved) runtime = reload(runtime);
  const beforePreview = captureSessionSnapshot(runtime);
  const ids = runtime.construction.previewMaterialWithdrawalOrderIds(delivery.itemId, delivery.quantity);
  expect(captureSessionSnapshot(runtime)).toEqual(beforePreview);
  expect(new Set(ids.map(id => runtime.construction.getOrder(id)!.placementSequence)).size).toBe(2);
  const { kernel: _beforeKernel, ...before } = captureSessionSnapshot(runtime);
  send(runtime, { type: 'CancelMaterialPurchase', orderId: delivery.orderId });
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
