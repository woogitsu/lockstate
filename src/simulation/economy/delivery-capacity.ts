import {
  DELIVERY_BAY_CAPABILITY,
  DELIVERY_BAY_ROOM_CATALOG_ID,
  STORAGE_ROOM_CAPABILITY,
  STORAGE_ROOM_ROOM_CATALOG_ID,
} from '../operations/delivery-route';
import type { ContainerRegistry } from '../operations/inventory';
import type { JobBoard } from '../operations/job';
import type { RoomInstanceRegistry } from '../prisoners/room-instance-registry';

/** #587: a small gate pile, enlarged by a working delivery bay and storage racks. */
export const BARE_GATE_CAPACITY = 600;
export const FURNISHED_BAY_CAPACITY = 100;
export const STORAGE_RACK_CAPACITY = 200;

/** Physical stock includes goods in a carrier's hands during a drop-off leg. */
export function occupiedDeliveryUnits(containers: ContainerRegistry, jobs: JobBoard): number {
  const stored = containers.all().reduce(
    (sum, container) => sum + container.getSnapshot().reduce((held, [, quantity]) => held + quantity, 0),
    0,
  );
  const carried = jobs.activeJobs().reduce((sum, job) => sum + (job.leg === 'dropoff' ? job.quantity : 0), 0);
  return stored + carried;
}

export function deliveryCapacity(roomInstances: RoomInstanceRegistry): number {
  const bays = roomInstances.allByRoomCatalogId(DELIVERY_BAY_ROOM_CATALOG_ID)
    .filter((room) => room.objectCapabilities.includes(DELIVERY_BAY_CAPABILITY)).length;
  const rackSlots = roomInstances.allByRoomCatalogId(STORAGE_ROOM_ROOM_CATALOG_ID)
    .reduce((sum, room) => sum + roomInstances.concurrentUseCapacityFor(room, STORAGE_ROOM_CAPABILITY), 0);
  return BARE_GATE_CAPACITY + bays * FURNISHED_BAY_CAPACITY + rackSlots * STORAGE_RACK_CAPACITY;
}
