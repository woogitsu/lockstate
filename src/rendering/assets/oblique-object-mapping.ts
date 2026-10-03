import type { ObliqueModuleCatalog } from './oblique-module-catalog';

import type { RenderRoom } from '../feed/render-feed';

/** Stable object-id to oblique asset mapping. Unknown objects fail closed so the flat fallback remains authoritative. */
export const OBLIQUE_OBJECT_ASSET_IDS: Readonly<Record<string, string>> = Object.freeze({
  'object.bed': 'furniture.cell.cot.single',
  'object.toilet': 'fixture.cell.toilet_sink',
  'object.shower-head': 'fixture.shower.head',
  'object.dining-table': 'furniture.dining.table.wooden',
  'object.exercise-station': 'furniture.yard.exercise-station',
  'object.bench': 'furniture.corridor.bench.variants',
  'object.medical-bed': 'furniture.medical-bed.variants',
  'object.medicine-cabinet': 'fixture.medicine-cabinet.variants',
  'object.storage-rack': 'furniture.storage.rack.wooden',
  'object.chair': 'furniture.chair.wooden',
  'object.prep-counter': 'furniture.kitchen.prep-counter.variants',
  'object.security-console': 'utility.security-console.variants',
  'object.loading-dock-door': 'utility.loading-dock-door.variants',
  'object.utility-panel': 'utility.utility-panel.variants',
  'object.washing-machine': 'utility.washing-machine.variants',
  'object.stove': 'furniture.kitchen.stove.variants',
  'object.fridge': 'furniture.kitchen.fridge.variants',
  'object.bookshelf': 'furniture.library.bookshelf.variants',
  'object.waste-bin': 'fixture.cell.waste_bin',
  'object.desk': 'furniture.office.desk.generic',
  'object.sink': 'fixture.cell.sink.handwash',
});

export function obliqueAssetIdForObject(objectId: string): string | undefined {
  return OBLIQUE_OBJECT_ASSET_IDS[objectId];
}

const ROOM_VISUAL_VARIANTS: readonly {
  readonly roomCatalogId: string;
  readonly objectAssets: Readonly<Record<string, string>>;
}[] = Object.freeze([
  { roomCatalogId: 'room.yard', objectAssets: Object.freeze({
    'object.bench': 'furniture.yard.steel-bench',
    'object.waste-bin': 'fixture.yard.steel-waste-bin',
  }) },
  { roomCatalogId: 'room.common-room', objectAssets: Object.freeze({
    'object.bench': 'furniture.common-room.upholstered-bench',
  }) },
  { roomCatalogId: 'room.classroom', objectAssets: Object.freeze({
    'object.chair': 'furniture.classroom.school-chair',
    'object.desk': 'furniture.classroom.teacher-desk',
  }) },
  { roomCatalogId: 'room.reception', objectAssets: Object.freeze({
    'object.chair': 'furniture.reception.waiting-armchair',
  }) },
  { roomCatalogId: 'room.garbage-room', objectAssets: Object.freeze({
    'object.waste-bin': 'fixture.garbage-room.waste-bin',
  }) },
  { roomCatalogId: 'room.storage-room', objectAssets: Object.freeze({
    'object.storage-rack': 'furniture.storage-room.timber-rack',
  }) },
  { roomCatalogId: 'room.staff-room', objectAssets: Object.freeze({
    'object.desk': 'furniture.office.desk.employee.variants',
  }) },
]);

/** Presentation-only skin for a completed object wholly inside a published room rectangle. */
export function obliqueAssetIdForPlacedObject(
  objectId: string,
  tileX: number,
  tileY: number,
  footprint: { readonly width: number; readonly height: number },
  rooms: readonly RenderRoom[],
): string | undefined {
  for (const variant of ROOM_VISUAL_VARIANTS) {
    const assetId = variant.objectAssets[objectId];
    if (assetId !== undefined && rooms.some(room => room.roomCatalogId === variant.roomCatalogId &&
      tileX >= room.anchorTileX && tileY >= room.anchorTileY &&
      tileX + footprint.width <= room.anchorTileX + room.width &&
      tileY + footprint.height <= room.anchorTileY + room.height)) {
      return assetId;
    }
  }
  return obliqueAssetIdForObject(objectId);
}

export function obliqueCatalogForObject(
  objectId: string,
  catalogs: ReadonlyMap<string, ObliqueModuleCatalog>,
): ObliqueModuleCatalog | undefined {
  const assetId = obliqueAssetIdForObject(objectId);
  if (assetId === undefined) return undefined;
  // Fail closed when the registry did not load or omitted this mapped asset.
  return catalogs.get(assetId);
}

export type ObliqueWallEdge = 'north' | 'west';
export interface ObliqueObjectAliasOptions {
  readonly edge?: ObliqueWallEdge;
  readonly cutaway?: boolean;
}

/** Resolve approved legacy logical ids to canonical registry asset ids. Unknown ids fail closed. */
export function obliqueCanonicalAssetIdForObject(
  objectId: string,
  options: ObliqueObjectAliasOptions = {},
): string | undefined {
  if (objectId === 'wall.interior.module') {
    if (options.edge === 'west') {
      return options.cutaway ? 'wall.interior.module.west.cutaway' : 'wall.interior.module.west.full';
    }
    return options.cutaway ? 'wall.interior.module.cutaway' : 'wall.interior.module.full';
  }
  if (objectId !== 'door.interior') return obliqueAssetIdForObject(objectId);
  if (options.edge === 'west') {
    return options.cutaway ? 'door.interior.open.west.cutaway' : 'door.interior.open.west.full';
  }
  return options.cutaway ? 'door.interior.open.cutaway' : 'door.interior.open.full';
}

