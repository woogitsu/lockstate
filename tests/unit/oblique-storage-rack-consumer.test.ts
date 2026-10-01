import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { obliqueCatalogForObject } from '../../src/rendering/assets/oblique-object-mapping';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
import { parseObliqueModuleRegistry } from '../../src/rendering/assets/oblique-module-registry';

const readContent = (path: string): unknown => JSON.parse(readFileSync(new URL(`../../public/game-content/${path}`, import.meta.url), 'utf8').replace(/^\uFEFF/, '')) as unknown;

it.each([
  ['object.storage-rack', 'furniture.storage.rack.wooden', 'oblique-cell-storage-rack.v1.json'],
  ['object.chair', 'furniture.chair.wooden', 'oblique-cell-chair.v1.json'],
])('connects %s to its Blender catalog', (objectId, assetId, manifest) => {
  const registry = parseObliqueModuleRegistry(readContent('oblique-module-registry.v1.json'));
  const entry = registry.entries.find((candidate) => candidate.assetId === assetId);
  expect(entry?.manifest).toBe(`/game-content/${manifest}`);
  const catalog = parseObliqueModuleCatalog(readContent(manifest));
  expect(obliqueCatalogForObject(objectId, new Map([[catalog.assetId, catalog]]))).toBe(catalog);
});
