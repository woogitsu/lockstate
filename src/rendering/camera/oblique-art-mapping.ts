import { DOOR_EDGE_NUMERIC_ID, WALL_EDGE_NUMERIC_ID } from '../../simulation/construction/definition';
import { catalogueObjectId } from '../world/structures';
import { defaultRoomContentRegistry } from '../../content/room-catalog';
import { DEFAULT_TERRAIN_DEFINITIONS } from '../../simulation/world/terrain';

/** Authored modules currently match a north edge or a catalogued object origin. */
const NORTH_EDGE_ART: ReadonlyMap<number, string> = new Map([
  [WALL_EDGE_NUMERIC_ID, 'wall.interior.module.full'],
  [DOOR_EDGE_NUMERIC_ID, 'door.interior.open.full'],
]);

const OBJECT_ART: Readonly<Record<string, string>> = {
  'object.bed': 'furniture.cell.bed.single.variants',
  'object.toilet': 'fixture.cell.toilet_sink',
  'object.storage-rack': 'furniture.storage.rack.wooden',
  'object.chair': 'furniture.chair.wooden',
  'object.shower-head': 'fixture.shower.head',
};

const ROOM_FLOOR_ART: Readonly<Record<string, string>> = {
  'room.cell': 'floor.cell.sealed-concrete',
  'room.canteen': 'floor.canteen.terrazzo',
  'room.shower-room': 'floor.shower.ceramic',
};
const DIRT_TERRAIN_NUMERIC_ID = DEFAULT_TERRAIN_DEFINITIONS.find((terrain) => terrain.id === 'dirt')?.numericId;
export const GRASS_TERRAIN_NUMERIC_ID = DEFAULT_TERRAIN_DEFINITIONS.find((terrain) => terrain.id === 'grass')?.numericId;
export { DIRT_TERRAIN_NUMERIC_ID };

export function artForGround(zoningNumericId: number, terrainNumericId?: number): string | undefined {
  const room = defaultRoomContentRegistry.getByNumericId(zoningNumericId);
  const roomFloor = room === undefined ? undefined : ROOM_FLOOR_ART[room.id];
  if (roomFloor !== undefined) return roomFloor;
  if (terrainNumericId === undefined) return undefined;
  if (terrainNumericId === DIRT_TERRAIN_NUMERIC_ID) return 'floor.terrain.dirt';
  if (terrainNumericId === GRASS_TERRAIN_NUMERIC_ID) return 'floor.terrain.grass';
  return undefined;
}

export function artForNorthEdge(edgeNumericId: number, northZoningNumericId?: number): string | undefined {
  if (edgeNumericId === DOOR_EDGE_NUMERIC_ID &&
      northZoningNumericId !== undefined &&
      defaultRoomContentRegistry.getByNumericId(northZoningNumericId)?.id === 'room.shower-room') {
    return 'door.shower.privacy.open.full';
  }
  return NORTH_EDGE_ART.get(edgeNumericId);
}

export function artForWestEdge(edgeNumericId: number): string | undefined {
  if (edgeNumericId === WALL_EDGE_NUMERIC_ID) return 'wall.interior.module.west.full';
  if (edgeNumericId === DOOR_EDGE_NUMERIC_ID) return 'door.interior.open.west.full';
  return undefined;
}

export function artForStructure(definitionId: string): string | undefined {
  const objectId = catalogueObjectId(definitionId);
  return objectId === undefined ? undefined : OBJECT_ART[objectId];
}
