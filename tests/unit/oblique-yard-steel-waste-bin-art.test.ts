import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';

const root = new URL('../../', import.meta.url);
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

describe('authored outdoor waste bin variant catalog', () => {
  const catalog = parseObliqueModuleCatalog(JSON.parse(readFileSync(
    new URL('public/game-content/oblique-fixture.yard-steel-waste-bin.v1.json', root), 'utf8',
  )) as unknown);

  it('preserves the one-square authored source and all 72 supported camera poses', () => {
    expect(catalog.assetId).toBe('fixture.yard.steel-waste-bin');
    expect(catalog.source).toBe('assets/source/blender/fixture.yard.steel-waste-bin.blend');
    expect(catalog.sourceSha256).toBe(sha256(readFileSync(new URL(catalog.source, root))));
    expect(catalog.resolutionPx).toEqual([256, 256]);
    expect(catalog.nominalPixelsPerTile).toBe(64);
    const exporter = readFileSync(new URL('tooling/blender/render-yard-waste-bin-oblique.py', root), 'utf8');
    const cameraScale = /^ORTHO_SCALE_TILES = ([0-9.]+)$/m.exec(exporter);
    expect(cameraScale).not.toBeNull();
    // Orthographic camera scale is the world-tile span of the square frame.
    // This detects a future camera or metadata change that visually shrinks
    // the 1x1 object while leaving every image hash internally consistent.
    expect(catalog.resolutionPx[0] / Number(cameraScale![1])).toBe(catalog.nominalPixelsPerTile);
    expect(catalog.pivotPx).toEqual([128, 128]);
    expect(catalog.cameraTargetTiles).toEqual([0.5, 0.5, 0.62]);
    expect(catalog.yawDegrees).toHaveLength(12);
    expect(catalog.elevationDegrees).toHaveLength(6);
    expect(catalog.frames).toHaveLength(72);
    for (const frame of catalog.frames) {
      expect(sha256(readFileSync(new URL(`public${frame.image}`, root))), frame.image).toBe(frame.sha256);
    }
  });
});
