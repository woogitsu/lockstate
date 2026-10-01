import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';

const gameContent = new URL('../../public/game-content/', import.meta.url);
const publicRoot = new URL('../../public/', import.meta.url);
const readCatalog = (name: string) => parseObliqueModuleCatalog(JSON.parse(readFileSync(new URL(name, gameContent), 'utf8').replace(/^\uFEFF/, '')) as unknown);

describe('issue 1821 medical oblique manifests', () => {
  it.each([
    ['oblique-furniture.medical-bed.v1.json', 'furniture.medical-bed.variants'],
    ['oblique-fixture.medicine-cabinet.v1.json', 'fixture.medicine-cabinet.variants'],
  ] as const)('keeps %s complete and image-backed', (manifest, assetId) => {
    const catalog = readCatalog(manifest);
    expect(catalog.assetId).toBe(assetId);
    expect(catalog.yawDegrees).toHaveLength(12);
    expect(catalog.elevationDegrees).toHaveLength(6);
    expect(catalog.frames).toHaveLength(72);
    for (const frame of catalog.frames) {
      expect(existsSync(new URL(frame.image.replace(/^\//, ''), publicRoot)), frame.image).toBe(true);
    }
  });
});
