import { placedObjectAt } from '../../src/simulation/objects/placed-object-registry';
import type { SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

/** Furnishes real storage racks for economy probes that deliberately buy in bulk. */
export function addBulkPurchaseStorage(runtime: SimulationRuntime): void {
  runtime.prisoners.roomInstances.register({
    instanceId: 'test-bulk-storage', roomCatalogId: 'room.storage-room',
    anchorTile: { x: tileCoordinate(48), y: tileCoordinate(48) },
    width: 3, height: 3, residentCapacity: 0, concurrentUseCapacity: 0,
    objectCapabilities: [],
  });
  for (const x of [48, 49]) {
    if (!runtime.placedObjects.place(placedObjectAt('object.storage-rack', { x: tileCoordinate(x), y: tileCoordinate(48) }, 0))) {
      throw new Error('Could not place storage rack in bulk purchase fixture.');
    }
  }
  runtime.roomCapacity.resolveAll();
}
