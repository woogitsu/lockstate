import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
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
    expect(catalog.cameraTargetTiles).toEqual([0.5, 0.5, 0.505]);
    expect(catalog.yawDegrees).toHaveLength(12);
    expect(catalog.elevationDegrees).toHaveLength(6);
    expect(catalog.frames).toHaveLength(72);
    expect(lfsContentHash(readFileSync(source))).toBe(catalog.sourceSha256);
    for (const frame of catalog.frames) {
      expect(lfsContentHash(readFileSync(new URL(frame.image.slice(1), publicRoot)))).toBe(frame.sha256);
    }
  });
  it('preserves authored parts and decodes every shared-camera frame border', () => {
    const provenance = JSON.parse(readFileSync(new URL('../../assets/source/blender/fixture.cell.sink.handwash.provenance.json', import.meta.url), 'utf8')) as {
      sourceSha256: string; meshes: { name: string; evaluatedVertices: number }[];
    };
    const catalog = parseObliqueModuleCatalog(readJson(`game-content/${manifestName}`));
    expect(lfsContentHash(readFileSync(source))).toBe(provenance.sourceSha256);
    expect(provenance.sourceSha256).toBe('ffcf0973794e39e59b5ee65e259d7149daf616bd0518a1c78a1c5f5a9b502158');
    expect(provenance.meshes).toHaveLength(17);
    expect(new Set(provenance.meshes.map(mesh => mesh.name)).size).toBe(17);
    expect(provenance.meshes.map(mesh => mesh.name)).toContain('faucet stem');
    expect(defaultObjectRegistry.getById('object.sink')!.footprint).toEqual({ width: 1, height: 1 });
    expect(catalog.resolutionPx).toEqual([256, 256]);
    expect(catalog.pivotPx).toEqual([128, 128]);
    expect(catalog.nominalPixelsPerTile).toBe(64);
    for (const frame of catalog.frames) {
      const png = readFileSync(new URL(frame.image.slice(1), publicRoot));
      expect(hash(png), frame.image).toBe(frame.sha256);
      expect(png.subarray(0, 8), frame.image).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([256, 256]);
      expect(frame.image).toContain(`.${frame.sha256.slice(0, 12)}.png`);
      expect(hasTransparentBorder(png), frame.image).toBe(true);
    }
  });
});

function hasTransparentBorder(png: Buffer): boolean {
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  const compressed: Buffer[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') compressed.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const pixels = inflateSync(Buffer.concat(compressed));
  const stride = width * 4 + 1;
  if (pixels.length !== stride * height) return false;
  for (let y = 0; y < height; y++) {
    if (pixels[y * stride] !== 0) return false;
    for (let x = 0; x < width; x++) {
      if ((x === 0 || y === 0 || x === width - 1 || y === height - 1) && pixels[y * stride + 1 + x * 4 + 3] !== 0) return false;
    }
  }
  return true;
}
