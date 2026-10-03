import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
import { obliqueAssetIdForObject } from '../../src/rendering/assets/oblique-object-mapping';

const root = new URL('../../', import.meta.url);
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const catalog = parseObliqueModuleCatalog(JSON.parse(readFileSync(
  new URL('public/game-content/oblique-cell-toilet.v1.json', root), 'utf8',
)) as unknown);

describe('existing toilet has a complete, square-aligned oblique model', () => {
  it('maps the existing 1x1 object to its registered art, without changing gameplay identity', () => {
    expect(defaultObjectRegistry.getById('object.toilet')?.footprint).toEqual({ width: 1, height: 1 });
    expect(obliqueAssetIdForObject('object.toilet')).toBe('fixture.cell.toilet_sink');
    const registry = JSON.parse(readFileSync(new URL('public/game-content/oblique-module-registry.v1.json', root), 'utf8')) as {
      entries: { assetId: string; manifest: string }[];
    };
    expect(registry.entries.filter(entry => entry.assetId === catalog.assetId)).toEqual([{
      assetId: 'fixture.cell.toilet_sink', manifest: '/game-content/oblique-cell-toilet.v1.json',
    }]);
  });

  it('loads the dedicated retained Blender source and exact-scale, square-aligned 72-frame export', () => {
    expect(catalog.source).toBe('assets/source/blender/fixture.cell.toilet_sink.soft-light.blend');
    expect(catalog.sourceSha256).toBe('1aa9169f65ea498fd1bfe6a2ee600f058c41f1a76685a0109a17da92db398ad5');
    expect(catalog.sourceSha256).toBe(sha256(readFileSync(new URL(catalog.source, root))));
    expect(catalog.resolutionPx).toEqual([512, 512]);
    expect(catalog.nominalPixelsPerTile).toBe(64);
    expect(catalog.pivotPx).toEqual([256, 256]);
    expect(catalog.cameraTargetTiles).toEqual([.5, .5, .5537500381469727]);
    const exporter = readFileSync(new URL('tooling/blender/render-oblique-cell-toilet.py', root), 'utf8');
    const scale = /camera_data\.ortho_scale = ([0-9.]+)/.exec(exporter);
    expect(scale).not.toBeNull();
    expect(catalog.resolutionPx[0] / Number(scale![1])).toBe(catalog.nominalPixelsPerTile);
    expect(exporter).toContain('Matrix.Translation((.5, .5, 0))');
    const provenance = JSON.parse(readFileSync(new URL('assets/source/blender/fixture.cell.toilet_sink.angled.provenance.json', root), 'utf8')) as { acceptedFitBaked: number[] };
    expect(provenance.acceptedFitBaked).toEqual([.8, .8, 1]);
    expect(catalog.yawDegrees).toHaveLength(12);
    expect(catalog.elevationDegrees).toEqual([20, 30, 40, 50, 60, 70]);
    expect(catalog.frames).toHaveLength(72);
    for (const frame of catalog.frames) {
      expect(sha256(readFileSync(new URL(`public${frame.image}`, root))), frame.image).toBe(frame.sha256);
    }
  });
});
