import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '../..');
const directory = join(root, 'public/assets/environment/modules');

describe('interior wall cutaway source module', () => {
  it('exports a common-footprint pair with distinct heights and verified transparent images', () => {
    const manifest = JSON.parse(readFileSync(join(directory, 'wall.interior.modules.manifest.json'), 'utf8')) as {
      source: string;
      entries: { assetId: string; image: string; footprintTiles: number[]; heightTiles: number; sha256: string }[];
    };
    expect(readFileSync(join(root, 'assets/source/blender', manifest.source)).length).toBeGreaterThan(1000);
    expect(manifest.entries.map((entry) => entry.assetId)).toEqual([
      'wall.interior.module.full', 'wall.interior.module.cutaway',
    ]);
    expect(manifest.entries.map((entry) => entry.heightTiles)).toEqual([2.5, 0.52]);
    for (const entry of manifest.entries) {
      expect(entry.footprintTiles).toEqual([1, 0.25]);
      expect(entry.image).toBe(`${entry.assetId}.png`);
      const png = readFileSync(join(directory, entry.image));
      expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([256, 256]);
      expect(png[25]).toBe(6); // RGBA rather than an opaque background
      expect(createHash('sha256').update(png).digest('hex')).toBe(entry.sha256);
    }
  });
});
