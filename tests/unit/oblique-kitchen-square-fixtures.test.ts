import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
import { obliqueAssetIdForObject } from '../../src/rendering/assets/oblique-object-mapping';

const root = new URL('../../', import.meta.url);
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const fixtures = [
  ['object.stove', 'furniture.kitchen.stove.variants', 'oblique-furniture.kitchen-stove.v1.json', [1, 0.5, 0.95]],
  ['object.prep-counter', 'furniture.kitchen.prep-counter.variants', 'oblique-furniture.kitchen-prep-counter.v1.json', [1, 0.5, 0.7]],
  ['object.fridge', 'furniture.kitchen.fridge.variants', 'oblique-furniture.kitchen-fridge.v1.json', [0.5, 0.5, 1.1]],
] as const;

describe('square-aligned Kitchen fixture exports', () => {
  const exporter = readFileSync(new URL('tooling/blender/render-kitchen-fixtures-oblique.py', root), 'utf8');
  const scale = /^ORTHO_SCALE_TILES = ([0-9.]+)$/m.exec(exporter);

  it('pins the authored camera scale to the exact 64-pixel world-tile contract', () => {
    expect(scale).not.toBeNull();
    expect(256 / Number(scale![1])).toBe(64);
    expect(exporter).toContain('escapes its {width} x {height} occupied footprint');
  });

  it.each(fixtures)('%s loads all 72 source-backed frames with verified bytes', (objectId, assetId, filename, target) => {
    const catalog = parseObliqueModuleCatalog(JSON.parse(readFileSync(
      new URL(`public/game-content/${filename}`, root), 'utf8',
    )) as unknown);
    expect(obliqueAssetIdForObject(objectId)).toBe(assetId);
    expect(catalog.assetId).toBe(assetId);
    expect(catalog.sourceSha256).toBe(sha256(readFileSync(new URL(catalog.source, root))));
    expect(catalog.resolutionPx).toEqual([256, 256]);
    expect(catalog.nominalPixelsPerTile).toBe(64);
    expect(catalog.pivotPx).toEqual([128, 128]);
    expect(catalog.cameraTargetTiles).toEqual(target);
    expect(catalog.yawDegrees).toHaveLength(12);
    expect(catalog.elevationDegrees).toHaveLength(6);
    expect(catalog.frames).toHaveLength(72);
    for (const frame of catalog.frames) {
      expect(sha256(readFileSync(new URL(`public${frame.image}`, root))), frame.image).toBe(frame.sha256);
    }
  });
});
