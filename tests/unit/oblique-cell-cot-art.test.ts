import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
import { defaultObjectRegistry } from '../../src/content/object-catalog';

const root = new URL('../../', import.meta.url);
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

describe('authored Cell cot variant catalog', () => {
  const catalog = parseObliqueModuleCatalog(JSON.parse(readFileSync(
    new URL('public/game-content/oblique-furniture.cell-cot.v1.json', root), 'utf8',
  )) as unknown);

  it('is reachable through the production module registry', () => {
    const registry = JSON.parse(readFileSync(new URL('public/game-content/oblique-module-registry.v1.json', root), 'utf8')) as {
      entries: { assetId: string; manifest: string }[];
    };
    expect(registry.entries.filter(entry => entry.assetId === catalog.assetId)).toEqual([{
      assetId: catalog.assetId,
      manifest: '/game-content/oblique-furniture.cell-cot.v1.json',
    }]);
  });

  it('preserves the two-square authored source and all 72 supported camera poses', () => {
    expect(defaultObjectRegistry.getById('object.bed')?.footprint).toEqual({ width: 1, height: 2 });
    expect(catalog.assetId).toBe('furniture.cell.cot.single');
    expect(catalog.source).toBe('assets/source/blender/furniture.cell.cot.single.angled-detail.blend');
    const physical = JSON.parse(readFileSync(new URL('assets/source/blender/furniture.cell.cot.single.angled-detail.provenance.json', root), 'utf8')) as {originalSource:string;originalSourceSha256:string};
    expect(physical.originalSource).toBe('assets/source/blender/furniture.cell.cot.single.blend');
    expect(physical.originalSourceSha256).toBe(sha256(readFileSync(new URL(physical.originalSource, root))));
    expect(catalog.sourceSha256).toBe(sha256(readFileSync(new URL(catalog.source, root))));
    expect(catalog.resolutionPx).toEqual([256, 256]);
    expect(catalog.nominalPixelsPerTile).toBe(64);
    const exporter = readFileSync(new URL('tooling/blender/render-cell-cot-oblique.py', root), 'utf8');
    const cameraScale = /^ORTHO_SCALE_TILES = ([0-9.]+)$/m.exec(exporter);
    expect(cameraScale).not.toBeNull();
    // Orthographic camera scale is the world-tile span of the square frame.
    // This detects a future camera or metadata change that visually shrinks
    // the 1x2 object while leaving every image hash internally consistent.
    expect(catalog.resolutionPx[0] / Number(cameraScale![1])).toBe(catalog.nominalPixelsPerTile);
    expect(catalog.pivotPx).toEqual([128, 128]);
    expect(catalog.cameraTargetTiles).toEqual([0.5, 1.0, 0.35]);
    expect(catalog.yawDegrees).toHaveLength(12);
    expect(catalog.elevationDegrees).toHaveLength(6);
    expect(catalog.frames).toHaveLength(72);
    for (const frame of catalog.frames) {
      expect(sha256(readFileSync(new URL(`public${frame.image}`, root))), frame.image).toBe(frame.sha256);
    }
  });
});
