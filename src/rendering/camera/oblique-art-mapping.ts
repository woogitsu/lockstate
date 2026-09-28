import { DOOR_EDGE_NUMERIC_ID, WALL_EDGE_NUMERIC_ID } from '../../simulation/construction/definition';
import { catalogueObjectId } from '../world/structures';

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
};

export function artForNorthEdge(edgeNumericId: number): string | undefined {
  return NORTH_EDGE_ART.get(edgeNumericId);
}

export function artForWestEdge(edgeNumericId: number): string | undefined {
  return edgeNumericId === WALL_EDGE_NUMERIC_ID ? 'wall.interior.module.west.full' : undefined;
}

export function artForStructure(definitionId: string): string | undefined {
  const objectId = catalogueObjectId(definitionId);
  return objectId === undefined ? undefined : OBJECT_ART[objectId];
}
