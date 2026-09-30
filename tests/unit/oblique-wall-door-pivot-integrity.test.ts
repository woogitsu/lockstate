import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
import { parseObliqueModuleRegistry } from '../../src/rendering/assets/oblique-module-registry';

const root = new URL('../../public/game-content/', import.meta.url);
const readJson = (name: string): unknown => JSON.parse(readFileSync(new URL(name, root), 'utf8').replace(/^\uFEFF/, '')) as unknown;

describe('wall and door oblique pivots', () => {
  it('keeps every registered wall and door pivot inside its frame', () => {
    const registry = parseObliqueModuleRegistry(readJson('oblique-module-registry.v1.json'));
    const entries = registry.entries.filter(({ assetId }) => assetId.startsWith('wall.') || assetId.startsWith('door.'));
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      const catalog = parseObliqueModuleCatalog(readJson(entry.manifest.replace('/game-content/', '')));
      expect(catalog.pivotPx[0], entry.assetId).toBeGreaterThanOrEqual(0);
      expect(catalog.pivotPx[0], entry.assetId).toBeLessThanOrEqual(catalog.resolutionPx[0]);
      expect(catalog.pivotPx[1], entry.assetId).toBeGreaterThanOrEqual(0);
      expect(catalog.pivotPx[1], entry.assetId).toBeLessThanOrEqual(catalog.resolutionPx[1]);
    }
  });
});
