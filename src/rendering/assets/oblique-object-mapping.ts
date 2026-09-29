import type { ObliqueModuleCatalog } from './oblique-module-catalog';

/** Stable object-id to oblique asset mapping. Unknown objects fail closed so the flat fallback remains authoritative. */
export const OBLIQUE_OBJECT_ASSET_IDS: Readonly<Record<string, string>> = Object.freeze({
  'object.medical-bed': 'furniture.medical-bed.variants',
  'object.medicine-cabinet': 'fixture.medicine-cabinet.variants',
});

export function obliqueAssetIdForObject(objectId: string): string | undefined {
  return OBLIQUE_OBJECT_ASSET_IDS[objectId];
}

export function obliqueCatalogForObject(objectId: string, catalogs: ReadonlyMap<string, ObliqueModuleCatalog>): ObliqueModuleCatalog | undefined {
  const assetId = obliqueAssetIdForObject(objectId);
  return assetId === undefined ? undefined : catalogs.get(assetId);
}
