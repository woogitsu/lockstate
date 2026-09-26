import type { PlacedObject } from '../objects/placed-object';
import { roomContains } from '../objects/room-capacity';
import type { RoomInstanceRegistry } from './room-instance-registry';

/** Directional default from #595: one panel supplies eight provisioning objects. */
export const OBJECTS_PER_UTILITY_PANEL = 8;

const PROVISIONERS: ReadonlyMap<string, string> = new Map([
  ['object.shower-head', 'room.shower-room'],
  ['object.stove', 'room.kitchen'],
  ['object.washing-machine', 'room.laundry'],
] as const);

/**
 * Derived from placed objects and zoned rooms, so changing a build or loading
 * a save requires no parallel power state. Objects are assigned the available
 * panel slots in canonical tile order; a room with mixed supply gets the mean
 * rate across its provisioners because use claims name a room, not an object.
 */
export function utilityProvisionFactors(
  rooms: RoomInstanceRegistry,
  objects: { all(): readonly PlacedObject[] },
): ReadonlyMap<string, number> {
  const placed = objects.all();
  const panels = rooms.allByRoomCatalogId('room.utility-room');
  let slots = 0;
  for (const object of placed) {
    if (object.objectId === 'object.utility-panel' && panels.some((room) => roomContains(room, object.anchorTile))) {
      slots += OBJECTS_PER_UTILITY_PANEL;
    }
  }
  const counts = new Map<string, { total: number; powered: number }>();
  for (const object of placed) {
    const roomType = PROVISIONERS.get(object.objectId);
    if (roomType === undefined) continue;
    const room = rooms.allByRoomCatalogId(roomType).find((candidate) => roomContains(candidate, object.anchorTile));
    if (room === undefined) continue;
    const count = counts.get(room.instanceId) ?? { total: 0, powered: 0 };
    count.total += 1;
    if (slots > 0) {
      count.powered += 1;
      slots -= 1;
    }
    counts.set(room.instanceId, count);
  }
  return new Map([...counts].map(([id, count]) => [id, 0.5 + count.powered / (2 * count.total)]));
}
