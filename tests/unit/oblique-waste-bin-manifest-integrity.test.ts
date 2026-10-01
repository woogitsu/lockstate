import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
import { parseObliqueModuleRegistry } from '../../src/rendering/assets/oblique-module-registry';
const root = new URL('../../public/game-content/', import.meta.url);
function json(name: string): unknown { return JSON.parse(readFileSync(new URL(name, root), 'utf8').replace(/^\uFEFF/, '')); }
describe('waste-bin oblique manifest integrity', () => {
  it('keeps the 1x1 Blender module and all 72 directional frames registered', () => {
    const registry = parseObliqueModuleRegistry(json('oblique-module-registry.v1.json'));
    const entry = registry.entries.find(({ assetId }) => assetId === 'fixture.cell.waste_bin');
    expect(entry?.manifest).toBe('/game-content/oblique-fixture-cell-waste-bin.v1.json');
    const catalog = parseObliqueModuleCatalog(json('oblique-fixture-cell-waste-bin.v1.json'));
    expect(catalog.assetId).toBe('fixture.cell.waste_bin');
    expect(catalog.yawDegrees).toEqual([0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]);
    expect(catalog.elevationDegrees).toEqual([20, 30, 40, 50, 60, 70]);
    expect(catalog.frames).toHaveLength(72);
    expect(new Set(catalog.frames.map((frame) => frame.image)).size).toBe(72);
  });
});
