import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseObliqueModuleCatalog, selectObliqueModuleFrame } from '../../src/rendering/assets/oblique-module-catalog';

const root = join(__dirname, '../..');
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(readFileSync(join(root, 'public/game-content/oblique-modules.v1.json'), 'utf8')) as unknown;

describe('oblique Blender wall module publication', () => {
  it('publishes all nine isolated, hashed transparent frames at one pivot and scale', () => {
    const catalog = parseObliqueModuleCatalog(manifest);
    expect(catalog.assetId).toBe('wall.interior.module.full');
    expect(sha256(readFileSync(join(root, 'assets/source/blender', catalog.source)))).toBe(catalog.sourceSha256);
    expect(catalog.resolutionPx).toEqual([512, 512]);
    expect(catalog.nominalPixelsPerTile).toBe(64);
    expect(catalog.pivotPx).toEqual([256, 256]);
    expect(catalog.cameraTargetTiles).toEqual([0, 0, 0]);
    expect(catalog.yawDegrees).toEqual([-45, 0, 45]);
    expect(catalog.elevationDegrees).toEqual([25, 45, 65]);
    expect(catalog.frames).toHaveLength(9);
    expect(new Set(catalog.frames.map((frame) => frame.sha256)).size).toBe(9);
    for (const frame of catalog.frames) {
      expect(frame.image).toContain(`.${frame.sha256.slice(0, 12)}.png`);
      const png = readFileSync(join(root, 'public', frame.image.slice(1)));
      expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect([png.readUInt32BE(16), png.readUInt32BE(20), png[25]]).toEqual([512, 512, 6]);
      expect(sha256(png)).toBe(frame.sha256);
      expect(selectObliqueModuleFrame(catalog, {
        yawRadians: frame.yawDegrees * Math.PI / 180,
        elevationRadians: frame.elevationDegrees * Math.PI / 180,
      }).image).toBe(frame.image);
    }
  });

  it('uses nearest authored pose and rejects incomplete/duplicated manifests', () => {
    const catalog = parseObliqueModuleCatalog(manifest);
    expect(selectObliqueModuleFrame(catalog, { yawRadians: 40 * Math.PI / 180,
      elevationRadians: 28 * Math.PI / 180 }).image).toContain('yaw+45-elev25');
    expect(selectObliqueModuleFrame(catalog, { yawRadians: -36 * Math.PI / 180,
      elevationRadians: 62 * Math.PI / 180 }).image).toContain('yaw-45-elev65');
    expect(() => selectObliqueModuleFrame(catalog, { yawRadians: NaN, elevationRadians: 1 })).toThrow(RangeError);
    expect(() => parseObliqueModuleCatalog({ ...catalog, frames: catalog.frames.slice(1) })).toThrow(/Missing/);
    expect(() => parseObliqueModuleCatalog({ ...catalog, frames: [...catalog.frames, catalog.frames[0]] })).toThrow(/Duplicate/);
  });
});
