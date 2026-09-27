import { placedObjectAt } from '../../src/simulation/objects/placed-object-registry';
import type { SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

/** Furnishes real storage racks for economy probes that deliberately buy in bulk. */
export function addBulkPurchaseStorage(runtime: SimulationRuntime, roomCount = 1): void {
  for (let index = 0; index < roomCount; index += 1) {
    const left = 48 + 4 * (index % 4);
    const top = 48 + 4 * Math.floor(index / 4);
    runtime.prisoners.roomInstances.register({
      instanceId: `test-bulk-storage-${index}`, roomCatalogId: 'room.storage-room',
      anchorTile: { x: tileCoordinate(left), y: tileCoordinate(top) },
      width: 3, height: 3, residentCapacity: 0, concurrentUseCapacity: 0,
      objectCapabilities: [],
    });
    for (const x of [left, left + 1]) {
      if (!runtime.placedObjects.place(placedObjectAt('object.storage-rack', { x: tileCoordinate(x), y: tileCoordinate(top) }, 0))) {
        throw new Error('Could not place storage rack in bulk purchase fixture.');
      }
    }
  }
  runtime.roomCapacity.resolveAll();
}
