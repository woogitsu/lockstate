import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
import { parseObliqueModuleRegistry } from '../../src/rendering/assets/oblique-module-registry';

const readContent = (path: string): unknown => JSON.parse(readFileSync(new URL(`../../public/game-content/${path}`, import.meta.url), 'utf8').replace(/^\uFEFF/, '')) as unknown;

it('loads the Blender washing machine from the oblique registry', () => {
  const registry = parseObliqueModuleRegistry(readContent('oblique-module-registry.v1.json'));
  const entry = registry.entries.find((candidate) => candidate.assetId === 'utility.washing-machine.variants');
  expect(entry?.manifest).toBe('/game-content/oblique-utility.washing-machine.v1.json');
  const catalog = parseObliqueModuleCatalog(readContent('oblique-utility.washing-machine.v1.json'));
  expect(catalog.assetId).toBe(entry?.assetId);
  expect(catalog.frames).toHaveLength(72);
});
