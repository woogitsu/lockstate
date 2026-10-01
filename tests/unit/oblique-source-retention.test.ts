import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
import { parseObliqueModuleRegistry } from '../../src/rendering/assets/oblique-module-registry';

const root = new URL('../../public/game-content/', import.meta.url);
const repo = new URL('../../', import.meta.url);
const readJson = (name: string): unknown => JSON.parse(readFileSync(new URL(name, root), 'utf8').replace(/^\uFEFF/, '')) as unknown;

describe('oblique source retention', () => {
  it('keeps every registered source blend addressable', () => {
    const registry = parseObliqueModuleRegistry(readJson('oblique-module-registry.v1.json'));
    for (const entry of registry.entries) {
      const catalog = parseObliqueModuleCatalog(readJson(entry.manifest.replace('/game-content/', '')));
      const source = catalog.source.replace(/\\/g, '/');
      const sourcePath = new URL(
        source.startsWith('assets/') ? source : `assets/source/blender/${source}`,
        repo,
      );
      expect(existsSync(sourcePath), `${entry.assetId}: ${catalog.source}`).toBe(true);
    }
  });
});
