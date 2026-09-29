import type { ObliqueModuleCatalog } from './oblique-module-catalog';

/** Stable object-id to oblique asset mapping. Unknown objects fail closed so the flat fallback remains authoritative. */
export const OBLIQUE_OBJECT_ASSET_IDS: Readonly<Record<string, string>> = Object.freeze({
  'object.medical-bed': 'furniture.medical-bed.variants',
  'object.medicine-cabinet': 'fixture.medicine-cabinet.variants',
});

export function obliqueAssetIdForObject(objectId: string): string | undefined {
  return OBLIQUE_OBJECT_ASSET_IDS[objectId];
}

export function obliqueCatalogForObject(objectId: string, catalogs: ReadonlyMap<string, ObliqueModuleCatalog>): ObliqueModuleCatalog | undefined {`n  const assetId = obliqueAssetIdForObject(objectId);`n  if (assetId === undefined) return undefined;`n  // Fail closed when the registry did not load or omitted this mapped asset.`n  return catalogs.get(assetId);`n}

