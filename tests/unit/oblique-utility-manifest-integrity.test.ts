import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseObliqueModuleCatalog, selectObliqueModuleFrame } from '../../src/rendering/assets/oblique-module-catalog';
import { parseObliqueModuleRegistry } from '../../src/rendering/assets/oblique-module-registry';

const root = new URL('../../public/game-content/', import.meta.url);
const readJson = (name: string): unknown => JSON.parse(readFileSync(new URL(name, root), 'utf8').replace(/^\uFEFF/, '')) as unknown;

describe('utility oblique manifest integration', () => {
  it('selects a 180 degree frame from a 0 to 330 degree authored grid', () => {
    const catalog = parseObliqueModuleCatalog(readJson('oblique-furniture.medical-bed.v1.json'));
    const frame = selectObliqueModuleFrame(catalog, {
      yawRadians: Math.PI,
      elevationRadians: 20 * Math.PI / 180,
    });
    expect(frame.yawDegrees).toBe(180);
    expect(frame.elevationDegrees).toBe(20);
  });

  it.each([
    ['utility.security-console.variants', 'oblique-utility.security-console.v1.json'],
    ['utility.loading-dock-door.variants', 'oblique-utility.loading-dock-door.v1.json'],
    ['utility.utility-panel.variants', 'oblique-utility.utility-panel.v1.json'],
  ])('registers and selects a frame for %s', (assetId, manifest) => {
    const registry = parseObliqueModuleRegistry(readJson('oblique-module-registry.v1.json'));
    const entry = registry.entries.find((candidate) => candidate.assetId === assetId);
    expect(entry?.manifest).toBe(`/game-content/${manifest}`);
    const catalog = parseObliqueModuleCatalog(readJson(manifest));
    expect(catalog.assetId).toBe(assetId);
    const frame = selectObliqueModuleFrame(catalog, { yawRadians: Math.PI / 6, elevationRadians: Math.PI / 4 });
    expect(frame.yawDegrees).toBe(30);
    expect(frame.elevationDegrees).toBe(40);
    expect(frame.image).toMatch(/^\/assets\/environment\/oblique\/.+\.png$/);
  });
});
