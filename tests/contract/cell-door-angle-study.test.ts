import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '../..');
const output = join(root, 'assets/rendered/cell-door-angle-study');
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

type Aperture = {
  uniqueSamplePixels: number;
  clearSamplePixels: number;
  samplePositionsPx: [number, number][];
  sampleHeightTiles: number;
  sampleXRangeTiles: number[];
};
type Render = {
  furnishedImage: string; furnishedSha256: string;
  apertureImage: string; apertureSha256: string;
  aperture: Aperture;
};

function canonicalRows(png: Buffer): Buffer {
  const idat: Buffer[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') idat.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  return inflateSync(Buffer.concat(idat));
}

function verifyRender(render: Render): void {
  for (const [image, hash] of [
    [render.furnishedImage, render.furnishedSha256],
    [render.apertureImage, render.apertureSha256],
  ] as const) {
    const png = readFileSync(join(output, image));
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect([png.readUInt32BE(16), png.readUInt32BE(20), png[25]]).toEqual([1920, 1080, 6]);
    expect(sha256(png)).toBe(hash);
  }
  const aperture = render.aperture;
  expect(aperture.sampleHeightTiles).toBe(1.2);
  expect(aperture.sampleXRangeTiles).toEqual([-0.32, 0.32]);
  expect(aperture.uniqueSamplePixels).toBe(aperture.samplePositionsPx.length);
  expect(new Set(aperture.samplePositionsPx.map(([x, y]) => `${x},${y}`)).size).toBe(aperture.uniqueSamplePixels);
  const mask = canonicalRows(readFileSync(join(output, render.apertureImage)));
  const stride = 1920 * 4;
  let clear = 0;
  for (const [x, y] of aperture.samplePositionsPx) {
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThan(1920);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThan(1080);
    const alpha = mask[y * (stride + 1) + 1 + x * 4 + 3]!;
    if (alpha < 16) clear++;
  }
  expect(clear).toBe(aperture.clearSamplePixels);
}

describe('open cell door in the canonical nine camera poses', () => {
  it('preserves a real wall opening and distinguishes full/cutaway frame from solid wall', () => {
    const source = JSON.parse(readFileSync(join(root, 'assets/source/blender/door.interior.leaf.open.manifest.json'), 'utf8')) as {
      source: string; assetId: string; sha256: string; footprintTiles: number[];
      pivotTile: number[]; hingeWorld: number[]; leafClearWidthTiles: number;
      leafHeightTiles: number; openDegrees: number; swingsToward: string;
    };
    expect(source.assetId).toBe('door.interior.leaf.open');
    expect(sha256(readFileSync(join(root, 'assets/source/blender', source.source)))).toBe(source.sha256);
    expect(source.footprintTiles).toEqual([1, 1]);
    expect(source.pivotTile).toEqual([0.5, 0.5]);
    expect(source.hingeWorld).toEqual([-0.36, 0, 0]);
    expect(source.leafClearWidthTiles).toBe(0.76);
    expect(source.leafHeightTiles).toBe(2.28);
    expect(source.openDegrees).toBe(-125);
    expect(source.swingsToward).toBe('corridor (negative Y)');

    const manifest = JSON.parse(readFileSync(join(output, 'manifest.json'), 'utf8')) as {
      source: string; cellSource: string; cellSourceSha256: string;
      leafSource: string; leafSourceSha256: string; wallSource: string; wallSourceSha256: string;
      leafCollection: string; frameCollection: string; resolution: number[];
      projection: string; orthoScale: number; nominalPixelsPerTile: number;
      target: number[]; lighting: { type: string; location: number[]; energy: number; size: number };
      yawDegrees: number[]; elevationDegrees: number[];
      entries: (Render & { yawDegrees: number; elevationDegrees: number; cameraLocation: number[] })[];
      comparison: { yawDegrees: number; elevationDegrees: number; fullFrameReference: string;
        cutawayLeafHidden: boolean;
        cutawayFrame: Render; solidWall: Render };
    };
    for (const [name, hash] of [
      [manifest.cellSource, manifest.cellSourceSha256],
      [manifest.leafSource, manifest.leafSourceSha256],
      [manifest.wallSource, manifest.wallSourceSha256],
    ] as const) expect(sha256(readFileSync(join(root, 'assets/source/blender', name)))).toBe(hash);
    expect(readFileSync(join(root, 'assets/source/blender', manifest.source)).length).toBeGreaterThan(1000);
    expect(manifest.leafCollection).toBe(source.assetId);
    expect(manifest.frameCollection).toBe('wall.interior.doorframe.full');
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
      verifyRender(entry);
      // Even at the shallowest oblique pose, most of the doorway's sampled
      // mid-height span must remain visibly open at the game's 64 px tile scale.
      expect(entry.aperture.clearSamplePixels).toBeGreaterThanOrEqual(20);
    }
    const reference = manifest.entries.find((entry) => entry.yawDegrees === 0 && entry.elevationDegrees === 45)!;
    expect(manifest.comparison.fullFrameReference).toBe(reference.furnishedImage);
    expect([manifest.comparison.yawDegrees, manifest.comparison.elevationDegrees]).toEqual([0, 45]);
    expect(manifest.comparison.cutawayLeafHidden).toBe(true);
    verifyRender(manifest.comparison.cutawayFrame);
    verifyRender(manifest.comparison.solidWall);
    expect(manifest.comparison.solidWall.aperture.clearSamplePixels).toBe(0);
    expect(manifest.comparison.cutawayFrame.aperture.clearSamplePixels)
      .toBeGreaterThanOrEqual(reference.aperture.clearSamplePixels);
  });
});
