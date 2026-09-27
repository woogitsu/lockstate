import { describe, expect, it } from 'vitest';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';
import { BARE_GATE_CAPACITY, deliveryCapacity, occupiedDeliveryUnits } from '../../src/simulation/economy/delivery-capacity';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { addBulkPurchaseStorage } from '../helpers/storage-capacity-fixture';
import { reportMaterialsFunding } from '../../src/simulation/construction/handler';

describe('delivery gate capacity (#587)', () => {
  it('refuses a bulk purchase before charging a fresh prison', () => {
    const runtime = createNewSimulationRuntime(587);
    const before = runtime.treasury.balanceMinorUnits;
    runtime.kernel.submitCommand(
      'bulk-bricks', runtime.kernel.expectedSequence, runtime.kernel.tick,
      packCommand({ type: 'PurchaseMaterials', orderId: 'bulk-bricks', itemId: 'item.brick', quantity: 625 }),
    );
    runtime.kernel.step();

    expect(runtime.refusals.last?.reason).toBe('purchase.storage-full');
    expect(runtime.treasury.balanceMinorUnits).toBe(before);
    expect(runtime.procurement.pendingDeliveries).toHaveLength(0);
  });

  it('reserves pending space, then frees it on cancellation, use, and sell-back', () => {
    const runtime = createNewSimulationRuntime(588);
    const buy = (id: string, quantity: number) => runtime.procurement.purchase(id, 'item.brick', quantity, runtime.kernel.tick, 'deliveries');
    expect(deliveryCapacity(runtime.prisoners.roomInstances)).toBe(BARE_GATE_CAPACITY);
    expect(buy('first', BARE_GATE_CAPACITY).ok).toBe(true);
    expect(buy('overflow', 1)).toEqual({ ok: false, reason: 'storage-full' });
    expect(runtime.procurement.cancel('first').ok).toBe(true);
    expect(buy('second', BARE_GATE_CAPACITY).ok).toBe(true);
    while (runtime.kernel.tick < 110) runtime.kernel.step();
    expect(runtime.procurement.pendingDeliveries).toHaveLength(0);
    expect(occupiedDeliveryUnits(runtime.containers, runtime.jobs)).toBe(BARE_GATE_CAPACITY);
    expect(buy('still-full', 1)).toEqual({ ok: false, reason: 'storage-full' });
    expect(runtime.procurement.sellStock('item.brick', 1).ok).toBe(true);
    expect(buy('freed', 1).ok).toBe(true);
  });

  it('grows only for furnished bay and storage capability, including rack count', () => {
    const runtime = createNewSimulationRuntime(589);
    const rooms = runtime.prisoners.roomInstances;
    rooms.register({
      instanceId: 'bay', roomCatalogId: 'room.delivery-bay',
      anchorTile: { x: tileCoordinate(1), y: tileCoordinate(1) },
      residentCapacity: 0, concurrentUseCapacity: 0, objectCapabilities: [],
    });
    rooms.register({
      instanceId: 'store', roomCatalogId: 'room.storage-room',
      anchorTile: { x: tileCoordinate(5), y: tileCoordinate(5) },
      residentCapacity: 0, concurrentUseCapacity: 0, objectCapabilities: [],
    });
    expect(deliveryCapacity(rooms)).toBe(600);
    rooms.updateDerived('bay', { residentCapacity: 0, concurrentUseCapacity: 1,
      concurrentUseCapacityByCapability: [['delivery-access', 1]], objectCapabilities: ['delivery-access'] });
    rooms.updateDerived('store', { residentCapacity: 0, concurrentUseCapacity: 2,
      concurrentUseCapacityByCapability: [['item-storage', 2]], objectCapabilities: ['item-storage'] });
    expect(deliveryCapacity(rooms)).toBe(1_100);
    expect(runtime.procurement.purchase('bulk', 'item.brick', 654, 0, 'deliveries').ok).toBe(true);
    runtime.containers.require('construction-materials').deposit('item.brick', 446);
    expect(runtime.procurement.purchase('overflow', 'item.brick', 1, 0, 'deliveries')).toEqual({ ok: false, reason: 'storage-full' });
  });

  it('derives two real racks and preserves reserved space across save and reload', () => {
    const runtime = createNewSimulationRuntime(590);
    addBulkPurchaseStorage(runtime);
    expect(deliveryCapacity(runtime.prisoners.roomInstances)).toBe(1_000);
    expect(runtime.procurement.purchase('ordinary', 'item.brick', 400, 0, 'deliveries').ok).toBe(true);
    const restored = restoreSimulationRuntime(captureSessionSnapshot(runtime), 590).runtime;
    expect(deliveryCapacity(restored.prisoners.roomInstances)).toBe(1_000);
    expect(restored.procurement.pendingDeliveries.map((delivery) => delivery.quantity)).toEqual([400]);
    restored.treasury.credit(20_000);
    expect(restored.procurement.purchase('fits', 'item.brick', 200, 0, 'deliveries').ok).toBe(true);
    expect(restored.procurement.purchase('over', 'item.brick', 401, 0, 'deliveries'))
      .toEqual({ ok: false, reason: 'storage-full' });
  });

  it('explains a just-in-time build stalled on full storage without calling it poverty', () => {
    const runtime = createNewSimulationRuntime(591);
    runtime.containers.require('construction-materials').deposit('item.brick', BARE_GATE_CAPACITY);
    const before = runtime.treasury.balanceMinorUnits;
    const report = runtime.justInTimeMaterials.procureForPendingOrders([
      { orderId: 'bed', requirements: [{ itemId: 'item.wood-plank', quantity: 1 }] },
    ], runtime.kernel.tick);
    reportMaterialsFunding(report, runtime.refusals, runtime.kernel.tick);
    expect(report.unfunded).toEqual([]);
    expect(report.unprocurable).toEqual([{ itemId: 'item.wood-plank', quantity: 1, reason: 'storage-full' }]);
    expect(runtime.refusals.last?.reason).toBe('purchase.storage-full');
    expect(runtime.treasury.balanceMinorUnits).toBe(before);
  });

  it('keeps a two-material build order atomic when only one delivery slot remains', () => {
    const runtime = createNewSimulationRuntime(592);
    runtime.containers.require('construction-materials').deposit('item.brick', BARE_GATE_CAPACITY - 1);
    const before = runtime.treasury.balanceMinorUnits;
    const report = runtime.justInTimeMaterials.procureForPendingOrders([
      { orderId: 'door', requirements: [
        { itemId: 'item.brick', quantity: BARE_GATE_CAPACITY },
        { itemId: 'item.wood-plank', quantity: 1 },
      ] },
    ], 0);
    expect(report.purchased).toEqual([]);
    expect(report.unprocurable).toEqual([
      { itemId: 'item.brick', quantity: 1, reason: 'storage-full' },
      { itemId: 'item.wood-plank', quantity: 1, reason: 'storage-full' },
    ]);
    expect(runtime.procurement.pendingDeliveries).toEqual([]);
    expect(runtime.treasury.balanceMinorUnits).toBe(before);
  });
});
