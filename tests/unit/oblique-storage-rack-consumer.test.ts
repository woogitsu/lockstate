import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { obliqueCatalogForObject } from '../../src/rendering/assets/oblique-object-mapping';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
import { parseObliqueModuleRegistry } from '../../src/rendering/assets/oblique-module-registry';

const readContent = (path: string): unknown => JSON.parse(readFileSync(new URL(`../../public/game-content/${path}`, import.meta.url), 'utf8').replace(/^\uFEFF/, '')) as unknown;

it('connects the buildable storage rack to its Blender catalog', () => {
  const registry = parseObliqueModuleRegistry(readContent('oblique-module-registry.v1.json'));
  const entry = registry.entries.find((candidate) => candidate.assetId === 'furniture.storage.rack.wooden');
  expect(entry?.manifest).toBe('/game-content/oblique-cell-storage-rack.v1.json');
  const catalog = parseObliqueModuleCatalog(readContent('oblique-cell-storage-rack.v1.json'));
  expect(obliqueCatalogForObject('object.storage-rack', new Map([[catalog.assetId, catalog]]))).toBe(catalog);
});
