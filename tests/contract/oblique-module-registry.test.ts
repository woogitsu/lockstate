import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseObliqueModuleCatalog, selectObliqueModuleFrame } from '../../src/rendering/assets/oblique-module-catalog';
import { parseObliqueModuleRegistry } from '../../src/rendering/assets/oblique-module-registry';

const root = join(__dirname, '../..');
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const json = (path: string): unknown => JSON.parse(readFileSync(join(root, 'public', path.slice(1)), 'utf8')) as unknown;

describe('oblique cell module registry', () => {
  it('publishes six logical modules with complete 3×3 hashed poses and a shared ground pivot', () => {
    const registry = parseObliqueModuleRegistry(json('/game-content/oblique-module-registry.v1.json'));
    expect(registry.entries.map((entry) => entry.assetId)).toEqual([
      'wall.interior.module.full', 'furniture.cell.bed.single.variants', 'door.interior.open.full',
      'fixture.cell.toilet_sink', 'furniture.storage.rack.wooden', 'furniture.chair.wooden',
    ]);
    for (const entry of registry.entries) {
      const catalog = parseObliqueModuleCatalog(json(entry.manifest));
      expect(catalog.assetId).toBe(entry.assetId);
      expect(catalog.resolutionPx).toEqual([512, 512]);
      expect(catalog.nominalPixelsPerTile).toBe(64);
      expect(catalog.pivotPx).toEqual([256, 256]);
      expect(catalog.cameraTargetTiles).toEqual([0, 0, 0]);
      expect(catalog.yawDegrees).toEqual(entry.assetId === 'wall.interior.module.full'
        ? Array.from({ length: 24 }, (_, index) => -180 + index * 15)
        : [-45, 0, 45]);
      expect(catalog.elevationDegrees).toEqual([25, 45, 65]);
      expect(catalog.frames).toHaveLength(entry.assetId === 'wall.interior.module.full' ? 72 : 9);
      expect(digest(readFileSync(join(root, 'assets/source/blender', catalog.source)))).toBe(catalog.sourceSha256);
      for (const dependency of catalog.sourceDependencies ?? []) {
        expect(digest(readFileSync(join(root, 'assets/source/blender', dependency.source)))).toBe(dependency.sha256);
      }
      for (const frame of catalog.frames) {
        const bytes = readFileSync(join(root, 'public', frame.image.slice(1)));
        expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
        expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20), bytes[25]]).toEqual([512, 512, 6]);
        expect(digest(bytes)).toBe(frame.sha256);
        expect(frame.image).toContain(`.${frame.sha256.slice(0, 12)}.png`);
        expect(selectObliqueModuleFrame(catalog, {
          yawRadians: frame.yawDegrees * Math.PI / 180,
          elevationRadians: frame.elevationDegrees * Math.PI / 180,
        })).toEqual(frame);
      }
    }
    const door = parseObliqueModuleCatalog(json('/game-content/oblique-cell-door-open.v1.json'));
    expect(door.sourceDependencies?.map((dependency) => dependency.source)).toEqual(['wall.interior.cutaway.blend']);
  });

  it('rejects duplicate registry identities', () => {
    const registry = parseObliqueModuleRegistry(json('/game-content/oblique-module-registry.v1.json'));
    expect(() => parseObliqueModuleRegistry({ ...registry, entries: [...registry.entries, registry.entries[0]] }))
      .toThrow(/Duplicate/);
  });
});
