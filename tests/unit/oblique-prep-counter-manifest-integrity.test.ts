import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseObliqueModuleCatalog, selectObliqueModuleFrame } from '../../src/rendering/assets/oblique-module-catalog';
import { parseObliqueModuleRegistry } from '../../src/rendering/assets/oblique-module-registry';
import { obliqueAssetIdForObject } from '../../src/rendering/assets/oblique-object-mapping';

const root = new URL('../../public/game-content/', import.meta.url);
const readJson = (name: string): unknown => JSON.parse(readFileSync(new URL(name, root), 'utf8').replace(/^\uFEFF/, '')) as unknown;

describe('kitchen prep counter oblique manifest integrity', () => {
  it('registers all 72 deterministic views and maps the buildable object', () => {
    const registry = parseObliqueModuleRegistry(readJson('oblique-module-registry.v1.json'));
    const entry = registry.entries.find(({ assetId }) => assetId === 'furniture.kitchen.prep-counter.variants');
    expect(entry?.manifest).toBe('/game-content/oblique-furniture.kitchen-prep-counter.v1.json');
    expect(obliqueAssetIdForObject('object.prep-counter')).toBe(entry?.assetId);
    const catalog = parseObliqueModuleCatalog(readJson('oblique-furniture.kitchen-prep-counter.v1.json'));
    expect(catalog.assetId).toBe(entry?.assetId);
    expect(catalog.yawDegrees).toEqual([0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]);
    expect(catalog.elevationDegrees).toEqual([20, 30, 40, 50, 60, 70]);
    expect(catalog.frames).toHaveLength(72);
    const frame = selectObliqueModuleFrame(catalog, { yawRadians: Math.PI / 6, elevationRadians: Math.PI / 4 });
    expect(frame.yawDegrees).toBe(30);
    expect(frame.elevationDegrees).toBe(40);
    expect(frame.image).toMatch(/^\/assets\/environment\/oblique\/furniture\.kitchen\.prep-counter\.variants-yaw\+30-elev40\.[0-9a-f]{12}\.png$/);
  });
});
