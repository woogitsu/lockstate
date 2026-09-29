import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '../..');
const output = join(root, 'assets/rendered/camera-study');

describe('canonical interior cell camera-angle study', () => {
  it('retains the original nine views and wall source for before/after review', () => {
    const baseline = JSON.parse(readFileSync(join(output, 'baseline/manifest.json'), 'utf8')) as {
      sourceCommit: string; wallSource: string; wallSourceSha256: string;
      entries: { image: string; sha256: string }[];
    };
    expect(baseline.sourceCommit).toBe('b72642c54152b18b7b24050cef2b43d0f6d9fc13');
    expect(baseline.entries).toHaveLength(9);
    const wall = readFileSync(join(root, 'assets/source/blender', baseline.wallSource));
    expect(createHash('sha256').update(wall).digest('hex')).toBe(baseline.wallSourceSha256);
    for (const entry of baseline.entries) {
      const png = readFileSync(join(output, 'baseline', entry.image));
      expect(createHash('sha256').update(png).digest('hex')).toBe(entry.sha256);
    }
  });

  it('renders one geometry and light at the complete 3 × 3 camera grid', () => {
    const manifest = JSON.parse(readFileSync(join(output, 'manifest.json'), 'utf8')) as {
      source: string;
      wallSource: string;
      wallSourceSha256: string;
      lighting: { type: string; location: number[]; energy: number; size: number };
      resolution: number[];
      projection: string;
      orthoScale: number;
      target: number[];
      yawDegrees: number[];
      elevationDegrees: number[];
      instances: { assetId: string }[];
      entries: { yawDegrees: number; elevationDegrees: number; image: string; sha256: string; orangePixelCount: number; cameraLocation: number[] }[];
      cutawayCandidate: {
        selectionRule: { yawDegreesAtMost: number; elevationDegreesAtMost: number };
        referenceImage: string; image: string; sha256: string; orangePixelCount: number;
        changedInstances: { name: string; assetId: string }[];
        yawDegrees: number; elevationDegrees: number;
      };
    };
    expect(readFileSync(join(root, 'assets/source/blender', manifest.source)).length).toBeGreaterThan(1000);
    const wallSource = readFileSync(join(root, 'assets/source/blender', manifest.wallSource));
    expect(createHash('sha256').update(wallSource).digest('hex')).toBe(manifest.wallSourceSha256);
    expect(manifest.lighting).toMatchObject({ type: 'one area light', location: [-4, -5, 9], energy: 900, size: 5 });
    expect(manifest.resolution).toEqual([1280, 720]);
    expect(manifest.projection).toBe('orthographic');
    expect(manifest.orthoScale).toBe(16.5);
    expect(manifest.target).toEqual([0, 1, 1]);
    expect(manifest.yawDegrees).toEqual([-45, 0, 45]);
    expect(manifest.elevationDegrees).toEqual([25, 45, 65]);
    expect(manifest.instances.length).toBeGreaterThanOrEqual(15);
    expect(manifest.instances.some((item) => item.assetId === 'wall.interior.doorframe.full')).toBe(true);
    expect(manifest.instances.some((item) => item.assetId === 'wall.interior.module.cutaway')).toBe(true);
    expect(manifest.entries.map((entry) => [entry.yawDegrees, entry.elevationDegrees])).toEqual(
      manifest.yawDegrees.flatMap((yaw) => manifest.elevationDegrees.map((elevation) => [yaw, elevation])),
    );
    for (const entry of manifest.entries) {
      const yaw = entry.yawDegrees;
      const elevation = entry.elevationDegrees;
      expect(entry.image).toBe(`cell-yaw${yaw >= 0 ? '+' : '-'}${String(Math.abs(yaw)).padStart(2, '0')}-elev${elevation}.png`);
      const png = readFileSync(join(output, entry.image));
      expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect([png.readUInt32BE(16), png.readUInt32BE(20), png[25]]).toEqual([1280, 720, 6]);
      expect(createHash('sha256').update(png).digest('hex')).toBe(entry.sha256);
      const azimuth = yaw * Math.PI / 180;
      const pitch = elevation * Math.PI / 180;
      expect(entry.cameraLocation).toEqual([
        Number((12 * Math.sin(azimuth)).toFixed(6)),
        Number((1 - 12 * Math.cos(azimuth)).toFixed(6)),
        Number((1 + 12 * Math.tan(pitch)).toFixed(6)),
      ]);
    }
    const lowWest = manifest.entries.find((entry) => entry.yawDegrees === -45 && entry.elevationDegrees === 25)!;
    const candidate = manifest.cutawayCandidate;
    expect(candidate.selectionRule).toEqual({ yawDegreesAtMost: -30, elevationDegreesAtMost: 30 });
    expect([candidate.yawDegrees, candidate.elevationDegrees]).toEqual([lowWest.yawDegrees, lowWest.elevationDegrees]);
    expect(candidate.referenceImage).toBe(lowWest.image);
    expect(candidate.changedInstances).toEqual([
      { name: 'west wall 1', assetId: 'wall.interior.module.cutaway' },
      { name: 'west wall 2', assetId: 'wall.interior.module.cutaway' },
      { name: 'west wall 3', assetId: 'wall.interior.module.cutaway' },
      { name: 'north-west corner', assetId: 'wall.interior.corner.inner.cutaway' },
    ]);
    expect(candidate.orangePixelCount).toBeGreaterThan(lowWest.orangePixelCount * 10);
    const png = readFileSync(join(output, candidate.image));
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect([png.readUInt32BE(16), png.readUInt32BE(20), png[25]]).toEqual([1280, 720, 6]);
    expect(createHash('sha256').update(png).digest('hex')).toBe(candidate.sha256);
  });
});
