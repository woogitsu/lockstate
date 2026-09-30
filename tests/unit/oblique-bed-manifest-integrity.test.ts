import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
import { parseObliqueModuleRegistry } from '../../src/rendering/assets/oblique-module-registry';

const contentRoot = new URL('../../public/game-content/', import.meta.url);

function readJson(name: string): unknown {
  const text = readFileSync(new URL(name, contentRoot), 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(text) as unknown;
}

describe('standard bed oblique manifest integrity', () => {
  it('keeps the registry entry and the authored 3x3 catalog in lockstep', () => {
    const registry = parseObliqueModuleRegistry(readJson('oblique-module-registry.v1.json'));
    const entry = registry.entries.find(({ assetId }) => assetId === 'furniture.cell.bed.single.variants');
    expect(entry?.manifest).toBe('/game-content/oblique-cell-bed.v1.json');

    const catalog = parseObliqueModuleCatalog(readJson('oblique-cell-bed.v1.json'));
    expect(catalog.assetId).toBe(entry?.assetId);
    expect(catalog.yawDegrees).toEqual([-45, 0, 45]);
    expect(catalog.elevationDegrees).toEqual([25, 45, 65]);
    expect(catalog.frames).toHaveLength(9);
  });
});
