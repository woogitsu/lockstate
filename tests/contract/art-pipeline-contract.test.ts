import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..', '..');

interface CharacterContract {
  schemaVersion: number;
  coordinateSystem: { clockwiseDirectionOrder: string[] };
  frame: { widthPx: number; heightPx: number; footPivotPx: { x: number; y: number } };
  clips: Record<string, { framesPerDirection: number; fps: number; loop: boolean }>;
  atlas: { extrudePx: number; maxDimensionPx: number };
}

describe('art pipeline contract', () => {
  it('keeps the eight-direction order, frame pivot and atlases deterministic', async () => {
    const path = resolve(root, 'assets/contracts/character-8-direction.contract.json');
    const contract = JSON.parse(await readFile(path, 'utf8')) as CharacterContract;
    expect(contract.schemaVersion).toBe(1);
    expect(contract.coordinateSystem.clockwiseDirectionOrder).toEqual([
      'south', 'southWest', 'west', 'northWest', 'north', 'northEast', 'east', 'southEast',
    ]);
    expect(contract.frame.widthPx).toBe(256);
    expect(contract.frame.heightPx).toBe(384);
    expect(contract.frame.footPivotPx).toEqual({ x: 128, y: 352 });
    expect(contract.clips.idle).toEqual({ framesPerDirection: 1, fps: 1, loop: true });
    expect(contract.clips.walk).toEqual({ framesPerDirection: 8, fps: 10, loop: true });
    expect(contract.atlas).toMatchObject({ extrudePx: 2, maxDimensionPx: 4096 });
  });

  it('ships the reviewed prisoner atlas and its runtime manifest', async () => {
    const manifestPath = resolve(root, 'public/assets/actors/actor.prisoner.base.atlas-manifests.json');
    const manifests = JSON.parse(await readFile(manifestPath, 'utf8')) as Array<{
      assetId: string;
      image: string;
      widthPx: number;
      heightPx: number;
      clips: Record<string, { frames: Record<string, unknown[]> }>;
    }>;
    expect(manifests).toHaveLength(2);
    for (const manifest of manifests) {
      expect(manifest.assetId).toBe('actor.prisoner.base');
      expect(manifest.widthPx).toBeLessThanOrEqual(4096);
      expect(manifest.heightPx).toBeLessThanOrEqual(4096);
      expect(Object.values(manifest.clips)[0]?.frames.south).toHaveLength(manifest.image.includes('.walk.') ? 8 : 1);
      await access(resolve(root, 'public/assets/actors', manifest.image));
    }
  });

  it('registers runtime assets by stable ID instead of renderer-side lists', async () => {
    const registryPath = resolve(root, 'public/assets/actors/asset-registry.json');
    const registry = JSON.parse(await readFile(registryPath, 'utf8')) as {
      schemaVersion: number;
      assets: Array<{ assetId: string; manifest: string; clips: string[] }>;
    };
    expect(registry.schemaVersion).toBe(1);
    expect(registry.assets.map((asset) => asset.assetId)).toEqual([
      'actor.cook.base',
      'actor.guard.base',
      'actor.medic.base',
      'actor.prisoner.base',
      'actor.staff.base',
    ]);
    expect(registry.assets.every((asset) => asset.clips.join('|') === 'idle|walk')).toBe(true);
  });

  it('publishes every owner-supplied object sheet with a content hash and attribution', async () => {
    const catalogPath = resolve(root, 'public/game-content/source-art.v1.json');
    const catalog = JSON.parse(await readFile(catalogPath, 'utf8')) as {
      schemaVersion: number;
      entries: Array<{ assetId: string; image: string; sha256: string; sourceAttribution: { license: string } }>;
    };
    expect(catalog.schemaVersion).toBe(1);
    expect(catalog.entries).toHaveLength(23);
    for (const entry of catalog.entries) {
      expect(entry.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(entry.sourceAttribution.license).toBe('owner-supplied, project-internal');
      await access(resolve(root, 'public/game-content', entry.image));
    }
  });
});
