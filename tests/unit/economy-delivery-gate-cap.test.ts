import { describe, expect, it } from 'vitest';
import { ProcurementSystem, Treasury } from '../../src/simulation/economy';
import { DeliveryGateCapacity } from '../../src/simulation/operations/delivery-route';
import { Container, ContainerRegistry } from '../../src/simulation/operations/inventory';
import { JobBoard } from '../../src/simulation/operations/job';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

describe('delivery gate capacity (#587)', () => {
  it('refuses an unaffordable-to-store order before charging, including stock already in flight', () => {
    const treasury = new Treasury(25_000);
    const stock = new Container('construction-materials');
    const capacity = { capacityUnits: () => 600, stockedUnits: () => stock.quantityOf('item.brick') };
    const procurement = new ProcurementSystem(treasury, stock, undefined, capacity);

    expect(procurement.purchase('catastrophic', 'item.brick', 625, 0, 'deliveries'))
      .toEqual({ ok: false, reason: 'delivery-capacity' });
    expect(treasury.balanceMinorUnits).toBe(25_000);
    expect(procurement.pendingDeliveries).toEqual([]);

    expect(procurement.purchase('first', 'item.brick', 400, 0, 'deliveries').ok).toBe(true);
    expect(procurement.purchase('second', 'item.brick', 201, 0, 'deliveries'))
      .toEqual({ ok: false, reason: 'delivery-capacity' });
    expect(procurement.purchase('second', 'item.brick', 200, 0, 'deliveries').ok).toBe(true);
    expect(procurement.purchase('third', 'item.brick', 1, 0, 'deliveries'))
      .toEqual({ ok: false, reason: 'delivery-capacity' });
    expect(procurement.cancel('first').ok).toBe(true);
    expect(procurement.purchase('third', 'item.brick', 400, 0, 'deliveries').ok).toBe(true);
  });

  it('derives capacity from racks inside storage rooms and counts both warehouse and bay stock', () => {
    const containers = new ContainerRegistry();
    const warehouse = new Container('construction-materials');
    const bay = new Container('container:bay-1');
    containers.register(warehouse);
    containers.register(bay);
    warehouse.deposit('item.brick', 25);
    bay.deposit('item.wood-plank', 5);
    const rooms = {
      allByRoomCatalogId: (id: string) => id === 'room.storage-room'
        ? [{ instanceId: 'store-1', anchorTile: { x: tileCoordinate(10), y: tileCoordinate(10) }, width: 3, height: 3, objectCapabilities: ['item-storage'] }]
        : [],
    };
    const standingObjects = [{ objectId: 'object.chair' }];
    const objects = { inRect: () => standingObjects };
    const jobs = new JobBoard();
    const capacity = new DeliveryGateCapacity(rooms, objects, containers, jobs);
    expect(capacity.capacityUnits()).toBe(600);
    standingObjects.push({ objectId: 'object.storage-rack' });
    expect(capacity.capacityUnits()).toBe(800);
    standingObjects.push({ objectId: 'object.storage-rack' });
    expect(capacity.capacityUnits()).toBe(1_000);
    expect(capacity.stockedUnits()).toBe(30);
    const carried = jobs.submitCarryItem({
      id: 'carry-1', priority: 1, itemId: 'item.brick', quantity: 7,
      sourceContainerId: bay.id, sourceTile: { x: tileCoordinate(1), y: tileCoordinate(1) },
      destinationContainerId: warehouse.id, destinationTile: { x: tileCoordinate(10), y: tileCoordinate(10) },
    }, 0);
    carried.leg = 'dropoff';
    expect(capacity.stockedUnits(), 'picked-up goods still claim gate space').toBe(37);
  });
});
