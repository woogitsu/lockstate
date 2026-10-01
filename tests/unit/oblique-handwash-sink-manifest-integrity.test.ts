import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
import { parseObliqueModuleRegistry } from '../../src/rendering/assets/oblique-module-registry';

const publicRoot = new URL('../../public/', import.meta.url);
const source = new URL('../../assets/source/blender/fixture.cell.sink.handwash.blend', import.meta.url);
const manifestName = 'oblique-fixture-cell-sink-handwash.v1.json';
const readJson = (name: string): unknown => JSON.parse(readFileSync(new URL(name, publicRoot), 'utf8').replace(/^\uFEFF/, ''));
const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const lfsContentHash = (bytes: Buffer): string => {
  const pointer = /^version https:\/\/git-lfs\.github\.com\/spec\/v1\r?\noid sha256:([0-9a-f]{64})\r?\n/m.exec(bytes.toString('utf8'));
  return pointer?.[1] ?? hash(bytes);
};

describe('cell hand-washing sink oblique art', () => {
  it('checks the referenced bytes when CI leaves a Blender LFS pointer unhydrated', () => {
    const catalog = parseObliqueModuleCatalog(readJson(`game-content/${manifestName}`));
    const pointer = Buffer.from(`version https://git-lfs.github.com/spec/v1\noid sha256:${catalog.sourceSha256}\nsize 1\n`);
    expect(lfsContentHash(pointer)).toBe(catalog.sourceSha256);
  });
  it('registers the one-tile fixture for every camera pose', () => {
    const registry = parseObliqueModuleRegistry(readJson('game-content/oblique-module-registry.v1.json'));
    expect(registry.entries.find((entry) => entry.assetId === 'fixture.cell.sink.handwash')?.manifest)
      .toBe(`/game-content/${manifestName}`);
    const catalog = parseObliqueModuleCatalog(readJson(`game-content/${manifestName}`));
    expect(catalog.assetId).toBe('fixture.cell.sink.handwash');
    expect(catalog.cameraTargetTiles).toEqual([0.5, 0.5, 0.4]);
    expect(catalog.yawDegrees).toHaveLength(12);
    expect(catalog.elevationDegrees).toHaveLength(6);
    expect(catalog.frames).toHaveLength(72);
    expect(lfsContentHash(readFileSync(source))).toBe(catalog.sourceSha256);
    for (const frame of catalog.frames) {
      expect(lfsContentHash(readFileSync(new URL(frame.image.slice(1), publicRoot)))).toBe(frame.sha256);
    }
  });
});
