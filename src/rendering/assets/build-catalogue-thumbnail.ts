import { selectObliqueModuleFrame, type ObliqueModuleCatalog } from './oblique-module-catalog';
import { obliqueCatalogForObject } from './oblique-object-mapping';

/** Presentation-only URL from a verified authored catalog. No scene or simulation state crosses into HUD. */
export function buildCatalogueThumbnail(objectId: string | undefined, catalogs: ReadonlyMap<string, ObliqueModuleCatalog>): string | undefined {
  if (objectId === undefined) return undefined;
  const catalog = obliqueCatalogForObject(objectId, catalogs);
  if (catalog === undefined) return undefined;
  return selectObliqueModuleFrame(catalog, { yawRadians: Math.PI / 4, elevationRadians: Math.PI / 4 }).image;
}
