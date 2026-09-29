import { z } from 'zod';
import { fetchObliqueModuleCatalog, type ObliqueModuleCatalog } from './oblique-module-catalog';

export const obliqueModuleRegistrySchema = z.object({
  schemaVersion: z.literal(1),
  entries: z.array(z.object({
    assetId: z.string().min(1),
    manifest: z.string().regex(/^\/game-content\/oblique-[a-z0-9-]+\.v1\.json$/),
  }).strict()).min(1),
}).strict();

export type ObliqueModuleRegistry = z.infer<typeof obliqueModuleRegistrySchema>;

export function parseObliqueModuleRegistry(input: unknown): ObliqueModuleRegistry {
  const registry = obliqueModuleRegistrySchema.parse(input);
  if (new Set(registry.entries.map((entry) => entry.assetId)).size !== registry.entries.length) {
    throw new Error('Duplicate oblique module asset id.');
  }
  return registry;
}

/** Resolve stable logical IDs to verified per-module catalogs before loading Phaser textures. */
export async function fetchObliqueModuleSet(url = '/game-content/oblique-module-registry.v1.json'):
  Promise<Map<string, ObliqueModuleCatalog>> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load oblique module registry: HTTP ${response.status}.`);
  const registry = parseObliqueModuleRegistry(await response.json());
  const catalogs = await Promise.all(registry.entries.map(async (entry) => {
    const catalog = await fetchObliqueModuleCatalog(entry.manifest);
    if (catalog.assetId !== entry.assetId) throw new Error(`Oblique module registry id mismatch: ${entry.assetId}.`);
    return [entry.assetId, catalog] as const;
  }));
  return new Map(catalogs);
}
