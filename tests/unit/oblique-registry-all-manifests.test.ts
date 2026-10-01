import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
import { parseObliqueModuleRegistry } from '../../src/rendering/assets/oblique-module-registry';

const root = new URL('../../public/game-content/', import.meta.url);
const readJson = (name: string): unknown => JSON.parse(readFileSync(new URL(name, root), 'utf8').replace(/^\uFEFF/, '')) as unknown;

describe('oblique registry catalog integrity', () => {
  it('parses every registered wall, door, and furniture manifest', () => {
    const registry = parseObliqueModuleRegistry(readJson('oblique-module-registry.v1.json'));
    const selected = registry.entries.filter(({ assetId }) => /^(wall|door|furniture\.)/.test(assetId));
    expect(selected.length).toBeGreaterThan(0);
    for (const entry of selected) {
      const catalog = parseObliqueModuleCatalog(readJson(entry.manifest.replace('/game-content/', '')));
      expect(catalog.assetId).toBe(entry.assetId);
    }
  });
});
