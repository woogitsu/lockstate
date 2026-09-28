import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '../..');
const output = join(root, 'assets/rendered/cell-bed-angle-study');
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

function canonicalRows(png: Buffer): Buffer {
  const chunks: Buffer[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  return inflateSync(Buffer.concat(chunks));
}

function silhouetteFromCanonicalPng(png: Buffer): { opaquePixelCount: number; boundsPx: [number, number, number, number]; widthPx: number; heightPx: number } {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const raw = canonicalRows(png);
  const stride = width * 4;
  let count = 0;
  let minX = width; let minY = height; let maxX = -1; let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1);
    expect(raw[row]).toBe(0); // stable_png writes unfiltered rows
    for (let x = 0; x < width; x++) {
      if (raw[row + 1 + x * 4 + 3] === 0) continue;
      count++;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  return { opaquePixelCount: count, boundsPx: [minX, minY, maxX + 1, maxY + 1],
    widthPx: maxX - minX + 1, heightPx: maxY - minY + 1 };
}

function visibleBlanketPixels(scenePng: Buffer, maskPng: Buffer): number {
  const scene = canonicalRows(scenePng);
  const mask = canonicalRows(maskPng);
  expect(scene.length).toBe(mask.length);
  const width = scenePng.readUInt32BE(16);
  const height = scenePng.readUInt32BE(20);
  const stride = width * 4;
  let count = 0;
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1);
    for (let x = 0; x < width; x++) {
      const pixel = row + 1 + x * 4;
      if (mask[pixel + 3] === 0) continue;
      const red = scene[pixel]!; const green = scene[pixel + 1]!; const blue = scene[pixel + 2]!;
      if (red > 105 && red > green * 1.45 && green > 35 && blue < green * 0.9) count++;
    }
  }
  return count;
}

describe('shipped cell bed at canonical camera angles and default zoom', () => {
  it('uses the Blender catalog model in the same nine-view scene', () => {
    const manifest = JSON.parse(readFileSync(join(output, 'manifest.json'), 'utf8')) as {
      source: string; cellSource: string; cellSourceSha256: string;
      bedCatalogSource: string; bedCatalogSha256: string; bedCollection: string;
      bedOriginTile: number[]; resolution: number[]; projection: string;
      orthoScale: number; nominalPixelsPerTile: number; target: number[];
      lighting: { type: string; location: number[]; energy: number; size: number };
      yawDegrees: number[]; elevationDegrees: number[];
      entries: {
        yawDegrees: number; elevationDegrees: number; furnishedImage: string;
        furnishedSha256: string; silhouetteImage: string; silhouetteSha256: string;
        silhouette: { opaquePixelCount: number; boundsPx: [number, number, number, number]; widthPx: number; heightPx: number };
        cameraLocation: number[];
      }[];
      cutawayCandidate: {
        selectionRule: { yawDegreesAtLeast: number; elevationDegreesAtMost: number };
        referenceImage: string; image: string; sha256: string;
        yawDegrees: number; elevationDegrees: number;
        changedInstances: { name: string; assetId: string }[];
        visibleBlanketPixelsBefore: number; visibleBlanketPixelsAfter: number;
      };
    };
    expect(readFileSync(join(root, 'assets/source/blender', manifest.source)).length).toBeGreaterThan(1000);
    expect(sha256(readFileSync(join(root, 'assets/source/blender', manifest.cellSource)))).toBe(manifest.cellSourceSha256);
    expect(sha256(readFileSync(join(root, 'assets/source/blender', manifest.bedCatalogSource)))).toBe(manifest.bedCatalogSha256);
    expect(manifest.bedCollection).toBe('furniture.cell.bed.single.variants');
    expect(manifest.bedOriginTile).toEqual([1, 2.1, 0]);
    expect(manifest.resolution).toEqual([1920, 1080]);
    expect(manifest.projection).toBe('orthographic');
    expect(manifest.orthoScale).toBe(30);
    expect(manifest.nominalPixelsPerTile).toBe(64);
    expect(manifest.target).toEqual([0, 1, 1]);
    expect(manifest.lighting).toEqual({ type: 'one area light', location: [-4, -5, 9], energy: 900, size: 5 });
    expect(manifest.yawDegrees).toEqual([-45, 0, 45]);
    expect(manifest.elevationDegrees).toEqual([25, 45, 65]);
    expect(manifest.entries.map((entry) => [entry.yawDegrees, entry.elevationDegrees])).toEqual(
      manifest.yawDegrees.flatMap((yaw) => manifest.elevationDegrees.map((elevation) => [yaw, elevation])),
    );
    for (const entry of manifest.entries) {
      for (const [image, hash] of [
        [entry.furnishedImage, entry.furnishedSha256],
        [entry.silhouetteImage, entry.silhouetteSha256],
      ] as const) {
        const png = readFileSync(join(output, image));
        expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
        expect([png.readUInt32BE(16), png.readUInt32BE(20), png[25]]).toEqual([1920, 1080, 6]);
        expect(sha256(png)).toBe(hash);
      }
      const { opaquePixelCount, boundsPx, widthPx, heightPx } = entry.silhouette;
      expect(silhouetteFromCanonicalPng(readFileSync(join(output, entry.silhouetteImage)))).toEqual(entry.silhouette);
      expect(opaquePixelCount).toBeGreaterThanOrEqual(4_800);
      expect(widthPx).toBeGreaterThanOrEqual(60);
      expect(heightPx).toBeGreaterThanOrEqual(95);
      expect(widthPx).toBe(boundsPx[2] - boundsPx[0]);
      expect(heightPx).toBe(boundsPx[3] - boundsPx[1]);
      expect(boundsPx[0]).toBeGreaterThanOrEqual(0);
      expect(boundsPx[1]).toBeGreaterThanOrEqual(0);
      expect(boundsPx[2]).toBeLessThanOrEqual(1920);
      expect(boundsPx[3]).toBeLessThanOrEqual(1080);
      expect(opaquePixelCount).toBeLessThanOrEqual(widthPx * heightPx);
    }
    const lowEast = manifest.entries.find((entry) => entry.yawDegrees === 45 && entry.elevationDegrees === 25)!;
    const candidate = manifest.cutawayCandidate;
    expect(candidate.selectionRule).toEqual({ yawDegreesAtLeast: 30, elevationDegreesAtMost: 30 });
    expect([candidate.yawDegrees, candidate.elevationDegrees]).toEqual([lowEast.yawDegrees, lowEast.elevationDegrees]);
    expect(candidate.referenceImage).toBe(lowEast.furnishedImage);
    expect(candidate.changedInstances).toEqual([
      { name: 'east wall 1', assetId: 'wall.interior.module.cutaway' },
      { name: 'east wall 2', assetId: 'wall.interior.module.cutaway' },
      { name: 'east wall 3', assetId: 'wall.interior.module.cutaway' },
      { name: 'north-east corner', assetId: 'wall.interior.corner.outer.cutaway' },
    ]);
    const candidatePng = readFileSync(join(output, candidate.image));
    expect([candidatePng.readUInt32BE(16), candidatePng.readUInt32BE(20), candidatePng[25]]).toEqual([1920, 1080, 6]);
    expect(sha256(candidatePng)).toBe(candidate.sha256);
    const maskPng = readFileSync(join(output, lowEast.silhouetteImage));
    expect(visibleBlanketPixels(readFileSync(join(output, lowEast.furnishedImage)), maskPng)).toBe(candidate.visibleBlanketPixelsBefore);
    expect(visibleBlanketPixels(candidatePng, maskPng)).toBe(candidate.visibleBlanketPixelsAfter);
    expect(candidate.visibleBlanketPixelsBefore).toBe(0);
    expect(candidate.visibleBlanketPixelsAfter).toBeGreaterThan(700);
  });
});
