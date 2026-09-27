import type { ContrabandItemView } from '../contraband/item';
import type { RoomInstance } from '../prisoners/room-instance-registry';
import { DEFAULT_SECURITY_SECTOR_ID } from './default-sector';

interface OfficeRooms {
  allByRoomCatalogId(id: string): readonly Pick<RoomInstance, 'objectCapabilities'>[];
}

interface ContrabandItems {
  all(): readonly Pick<ContrabandItemView, 'state'>[];
}

/**
 * A console in a security office purchases information, never incident
 * suppression. The only sector with a defined extent today is the derived
 * prison-wide sector; authored sectors have posts and doors but no polygons,
 * so claiming a count for one would invent a spatial membership rule.
 *
 * No console means no measurement (`undefined`), whereas an equipped office
 * observing no concealed items means a measured zero. Confiscated and departed
 * evidence no longer circulates and therefore cannot be counted as concealed.
 */
export function observedContrabandBySecurityOffice(
  rooms: OfficeRooms,
  contraband: ContrabandItems,
): ReadonlyMap<string, number> | undefined {
  const equipped = rooms.allByRoomCatalogId('room.security-office').some((room) =>
    room.objectCapabilities.includes('surveillance'),
  );
  if (!equipped) return undefined;

  let concealedCount = 0;
  for (const item of contraband.all()) if (item.state === 'concealed') concealedCount += 1;
  return new Map([[DEFAULT_SECURITY_SECTOR_ID, concealedCount]]);
}
