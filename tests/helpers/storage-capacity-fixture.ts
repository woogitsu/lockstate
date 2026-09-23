import { placedObjectAt } from '../../src/simulation/objects/placed-object-registry';
import type { SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

/**
 * Gives an economy test room for an intentionally exceptional bulk purchase.
 * These older tests measure treasury rules and construction after buying
 * hundreds of units; #587 correctly refuses that in a new prison with no
 * racks. The fixture supplies the storage those tests now require.
 */
export function addBulkPurchaseStorage(runtime: SimulationRuntime): void {
  runtime.prisoners.roomInstances.register({
    instanceId: 'test-bulk-storage',
    roomCatalogId: 'room.storage-room',
    anchorTile: { x: tileCoordinate(48), y: tileCoordinate(48) },
    width: 3,
    height: 3,
    residentCapacity: 0,
    concurrentUseCapacity: 0,
    objectCapabilities: ['item-storage'],
  });
  for (const x of [48, 49]) {
    if (!runtime.placedObjects.place(placedObjectAt('object.storage-rack', { x: tileCoordinate(x), y: tileCoordinate(48) }, 0))) {
      throw new Error('Could not seed storage rack in bulk purchase fixture.');
    }
  }
}
