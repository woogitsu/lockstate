import { describe, expect, it } from 'vitest';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { BARE_GATE_CAPACITY, deliveryCapacity, occupiedDeliveryUnits } from '../../src/simulation/economy/delivery-capacity';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

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
});
