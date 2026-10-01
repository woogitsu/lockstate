import { fetchObliqueModuleSet } from '../assets/oblique-module-registry';
import type { ObliqueModuleCatalog } from '../assets/oblique-module-catalog';

/** Composition seam for the opt-in oblique renderer; disabled mode does no network work. */
export async function resolveObliqueCatalogs(enabled: boolean): Promise<ReadonlyMap<string, ObliqueModuleCatalog> | undefined> {
  if (!enabled) return undefined;
  // Deliberately propagate registry errors: an enabled renderer must not silently fall back.
  return fetchObliqueModuleSet();
}
