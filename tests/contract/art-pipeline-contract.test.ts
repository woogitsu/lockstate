import { createHash } from 'node:crypto';
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
      'actor.guard.response',
      'actor.guard.search',
      'actor.medic.base',
      'actor.prisoner.base',
      'actor.prisoner.riot',
      'actor.staff.base',
    ]);
    expect(registry.assets.every((asset) => asset.clips.join('|') ===
      (asset.assetId === 'actor.guard.response' ? 'idle|respond' : asset.assetId === 'actor.guard.search' ? 'idle|search' : asset.assetId === 'actor.prisoner.riot' ? 'agitate|idle' : 'idle|walk'))).toBe(true);
  });

  /**
   * The declared hash is checked against the bytes it claims to describe.
   *
   * This test used to assert that `sha256` was 64 hex characters and that a
   * file existed at the declared path -- it imported no hashing function at
   * all (issue #140). So the catalog could declare **any** well-formed hash
   * for **any** image, or the same hash for all 23, and it passed. The one
   * thing a content hash exists for went unchecked.
   *
   * It is checkable in every checkout, including CI's, which is the part that
   * makes this worth doing rather than skipping. `git-lfs` tracks these PNGs,
   * and the `verify` job deliberately stays on a pointer-only checkout to keep
   * off metered LFS bandwidth -- only the `assets` job pulls content, and it
   * pulls `public/assets/actors` rather than this directory. So the bytes are
   * usually absent here. But an LFS pointer file **states the sha256 of the
   * content it stands for**, so the declared hash can be verified against the
   * pointer's own `oid` without transferring anything.
   *
   * Both paths are therefore real checks, and neither is vacuous:
   * pointer-only compares against the `oid`, a full checkout hashes the bytes.
   */
  it('declares a content hash that matches the bytes, in a full or a pointer-only checkout', async () => {
    const catalogPath = resolve(root, 'public/game-content/source-art.v1.json');
    const catalog = JSON.parse(await readFile(catalogPath, 'utf8')) as {
      schemaVersion: number;
      entries: Array<{ assetId: string; image: string; sha256: string; sourceAttribution: { license: string } }>;
    };
    expect(catalog.schemaVersion).toBe(1);
    expect(catalog.entries).toHaveLength(23);

    let pointerOnly = 0;
    let hashedBytes = 0;

    for (const entry of catalog.entries) {
      expect(entry.sha256, `${entry.assetId} must declare a sha256`).toMatch(/^[a-f0-9]{64}$/);
      expect(entry.sourceAttribution.license).toBe('owner-supplied, project-internal');

      // `readFile` rather than `access`: the bytes are the point, and a
      // missing file fails here with its own path in the error.
      const bytes = await readFile(resolve(root, 'public/game-content', entry.image));
      const asText = bytes.subarray(0, 200).toString('utf8');

      if (asText.startsWith('version https://git-lfs.github.com/spec/v1')) {
        const oid = /oid sha256:([a-f0-9]{64})/u.exec(asText)?.[1];
        expect(oid, `${entry.image} is an LFS pointer but declares no sha256 oid`).toBeDefined();
        expect(oid, `${entry.image}: the catalog hash must match the LFS pointer's oid`).toBe(entry.sha256);
        pointerOnly += 1;
      } else {
        const digest = createHash('sha256').update(bytes).digest('hex');
        expect(digest, `${entry.image}: the catalog hash must match the image bytes`).toBe(entry.sha256);
        hashedBytes += 1;
      }

      // The filename carries the first twelve characters of the same hash, so
      // a re-render that updated one and not the other is caught here rather
      // than by a reader noticing two different hashes for one file.
      expect(entry.image, `${entry.image} must embed the first 12 characters of its hash`).toContain(
        entry.sha256.slice(0, 12),
      );
    }

    // Every entry went down one branch or the other. Without this a future
    // refactor could make both branches unreachable and leave the loop
    // asserting nothing -- which is how the original defect read.
    expect(pointerOnly + hashedBytes).toBe(catalog.entries.length);
  });
});
