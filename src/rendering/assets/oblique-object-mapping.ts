import type { ObliqueModuleCatalog } from './oblique-module-catalog';

/** Stable object-id to oblique asset mapping. Unknown objects fail closed so the flat fallback remains authoritative. */
export const OBLIQUE_OBJECT_ASSET_IDS: Readonly<Record<string, string>> = Object.freeze({
  'object.medical-bed': 'furniture.medical-bed.variants',
  'object.medicine-cabinet': 'fixture.medicine-cabinet.variants',
});

export function obliqueAssetIdForObject(objectId: string): string | undefined {
  return OBLIQUE_OBJECT_ASSET_IDS[objectId];
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
