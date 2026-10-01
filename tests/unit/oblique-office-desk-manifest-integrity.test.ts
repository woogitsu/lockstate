import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
import { parseObliqueModuleRegistry } from '../../src/rendering/assets/oblique-module-registry';

const publicRoot = new URL('../../public/', import.meta.url);
const source = new URL('../../assets/source/blender/furniture.office.desk.generic.blend', import.meta.url);
const manifestName = 'oblique-furniture-office-desk-generic.v1.json';
const readJson = (name: string): unknown => JSON.parse(readFileSync(new URL(name, publicRoot), 'utf8').replace(/^\uFEFF/, ''));
const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

describe('generic office desk oblique art', () => {
  it('registers the 2×1 workstation for every camera pose', () => {
    const registry = parseObliqueModuleRegistry(readJson('game-content/oblique-module-registry.v1.json'));
    expect(registry.entries.find((entry) => entry.assetId === 'furniture.office.desk.generic')?.manifest)
      .toBe(`/game-content/${manifestName}`);
    const catalog = parseObliqueModuleCatalog(readJson(`game-content/${manifestName}`));
    expect(catalog.assetId).toBe('furniture.office.desk.generic');
    expect(catalog.cameraTargetTiles).toEqual([1, 0.5, 0.55]);
    expect(catalog.yawDegrees).toHaveLength(12);
    expect(catalog.elevationDegrees).toHaveLength(6);
    expect(catalog.frames).toHaveLength(72);
    expect(hash(readFileSync(source))).toBe(catalog.sourceSha256);
    for (const frame of catalog.frames) {
      expect(hash(readFileSync(new URL(frame.image.slice(1), publicRoot)))).toBe(frame.sha256);
    }
  });
});
