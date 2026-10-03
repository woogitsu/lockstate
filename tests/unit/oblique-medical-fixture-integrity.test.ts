import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { inflateSync } from 'node:zlib';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';

it.each([
  ['object.medical-bed', 'oblique-furniture.medical-bed.v1.json', 0.675],
  ['object.medicine-cabinet', 'oblique-fixture.medicine-cabinet.v1.json', 0.59],
] as const)('exports %s around its occupied footprint with verified source and all pose bytes', (objectId, manifest, targetZ) => {
  const root = new URL('../../', import.meta.url);
  const catalog = parseObliqueModuleCatalog(JSON.parse(readFileSync(new URL(`public/game-content/${manifest}`, root), 'utf8')) as unknown);
  const footprint = defaultObjectRegistry.getById(objectId)!.footprint;
  const sha = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
  expect(catalog.cameraTargetTiles).toEqual([footprint.width / 2, footprint.height / 2, targetZ]);
  expect(catalog.resolutionPx).toEqual([256, 256]);
  expect(catalog.nominalPixelsPerTile).toBe(64);
  expect(catalog.pivotPx).toEqual([128, 128]);
  expect(sha(readFileSync(new URL(catalog.source, root)))).toBe(catalog.sourceSha256);
  expect(catalog.frames).toHaveLength(72);
  for (const frame of catalog.frames) {
    const bytes = readFileSync(new URL(`public${frame.image}`, root));
    expect(sha(bytes), frame.image).toBe(frame.sha256);
    expect(frame.image).toContain(`.${frame.sha256.slice(0, 12)}.png`);
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], frame.image).toEqual(catalog.resolutionPx);
    expect(hasTransparentNormalizedBorder(bytes), frame.image).toBe(true);
  }
});

/** Read the exported pixels, including the four edges, independently of Blender. */
function hasTransparentNormalizedBorder(png: Buffer): boolean {
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
