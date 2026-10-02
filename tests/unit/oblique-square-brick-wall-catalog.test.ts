import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
import { parseObliqueModuleRegistry } from '../../src/rendering/assets/oblique-module-registry';

const content = new URL('../../public/game-content/', import.meta.url);
const publicRoot = new URL('../../public/', import.meta.url);
const sourceRoot = new URL('../../assets/source/blender/', import.meta.url);
const readJson = (name: string): unknown => JSON.parse(readFileSync(new URL(name, content), 'utf8').replace(/^\uFEFF/, '')) as unknown;
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

describe('square brick wall art for normal and cutaway camera poses', () => {
  const registry = parseObliqueModuleRegistry(readJson('oblique-module-registry.v1.json'));

  it.each(['full', 'low'] as const)('registers a complete 72-frame %s Blender catalog', (kind) => {
    const id = `wall.square.brick.${kind}`;
    const entry = registry.entries.find((candidate) => candidate.assetId === id);
    expect(entry).toBeDefined();
    const catalog = parseObliqueModuleCatalog(readJson(entry!.manifest.slice('/game-content/'.length)));
    expect(catalog.assetId).toBe(id);
    expect(catalog.source).toBe(`${id}.blend`);
    expect(catalog.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(catalog.sourceSha256).toBe(kind === 'full'
      ? 'c73fcc00471682135b53049e0b74f1d71588909b245bfeac0cac6cd93d696ae1'
      : '583c49382bf24191ee0d0e10518c0678716eb036c9638558036d5a06b0fbd1f1');
    expect(sha256(readFileSync(new URL(catalog.source, sourceRoot)))).toBe(catalog.sourceSha256);
    expect(catalog.resolutionPx).toEqual([512, 512]);
    expect(catalog.pivotPx).toEqual([256, 256]);
    expect(catalog.nominalPixelsPerTile).toBe(64);
    expect(catalog.cameraTargetTiles).toEqual([0.5, 0.5, 0]);
    expect(catalog.yawDegrees).toEqual(Array.from({ length: 24 }, (_, i) => -180 + i * 15));
    expect(catalog.elevationDegrees).toEqual([25, 45, 65]);
    expect(catalog.frames).toHaveLength(72);
    for (const frame of catalog.frames) {
      const png = readFileSync(new URL(frame.image.slice(1), publicRoot));
      expect(sha256(png), frame.image).toBe(frame.sha256);
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([512, 512]);
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
