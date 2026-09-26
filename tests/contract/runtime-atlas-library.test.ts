import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ATLAS_DIRECTIONS,
  AtlasLibrary,
  DEFAULT_FACING,
  RUNTIME_ATLAS_BASE_PATH,
  clipFrameOrdinal,
  directionFromMovement,
} from '../../src/rendering/assets';

/**
 * Issue #32 requires that the renderer load representative assets *through the
 * manifest*. These tests drive the real committed batch through the real
 * runtime loader, so "runtime code references logical asset IDs, not
 * filenames" is executable rather than aspirational.
 *
 * They read the manifests from disk instead of over the network: the manifests
 * are JSON, so no Git LFS content is needed and this stays in the ordinary
 * `pnpm test` gate. `pnpm verify:assets` is what checks the image bytes.
 */

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..');
const publishedAtlasDirectory = path.join(repositoryRoot, 'public', 'assets', 'actors');

/** Serves the published batch from disk, standing in for the static-asset CDN. */
async function loadPublishedLibrary(): Promise<AtlasLibrary> {
  return AtlasLibrary.load({
    fetchJson: async (url) => {
      expect(url.startsWith(`${RUNTIME_ATLAS_BASE_PATH}/`)).toBe(true);
      const filename = url.slice(RUNTIME_ATLAS_BASE_PATH.length + 1);
      return JSON.parse(await readFile(path.join(publishedAtlasDirectory, filename), 'utf8'));
    },
  });
}

describe('runtime atlas library', () => {
  it('loads every published asset through the generated registry', async () => {
    const library = await loadPublishedLibrary();
    expect(library.schemaVersion).toBe(1);
    expect(library.assetIds()).toEqual([
      'actor.cook.base',
      'actor.guard.base',
      'actor.guard.response',
      'actor.medic.base',
      'actor.prisoner.base',
      'actor.staff.base',
    ]);
    for (const assetId of library.assetIds()) {
      expect(library.clipIds(assetId)).toEqual(assetId === 'actor.guard.response' ? ['idle', 'respond'] : ['idle', 'walk']);
    }
  });

  it('resolves a logical id, clip and direction to an in-bounds atlas rectangle', async () => {
    const library = await loadPublishedLibrary();
    const manifests = JSON.parse(
      await readFile(path.join(publishedAtlasDirectory, 'actor.prisoner.base.atlas-manifests.json'), 'utf8'),
    ) as Array<{ image: string; widthPx: number; heightPx: number }>;
    const bounds = new Map(manifests.map((manifest) => [manifest.image, manifest]));

    for (const direction of ATLAS_DIRECTIONS) {
      const clip = library.resolveClip('actor.prisoner.base', 'walk', direction);
      expect(clip.frames).toHaveLength(8);
      expect(clip.fps).toBe(10);
      expect(clip.loop).toBe(true);

      for (const frame of clip.frames) {
        const atlas = bounds.get(frame.imageUrl.split('/').pop() ?? '');
        expect(atlas).toBeDefined();
        expect(frame.rect.x + frame.rect.width).toBeLessThanOrEqual(atlas!.widthPx);
        expect(frame.rect.y + frame.rect.height).toBeLessThanOrEqual(atlas!.heightPx);
        expect(frame.footPivotPx).toEqual({ x: 128, y: 352 });
      }
    }
  });

  it('never leaks a filename into the caller-facing API surface', async () => {
    const library = await loadPublishedLibrary();
    // The only place an image path appears is the resolved frame, produced by
    // the manifest -- callers address everything else by logical id.
    const frame = library.resolveFrame('actor.guard.base', 'idle', 'south', 0);
    expect(frame.imageUrl).toBe('/assets/actors/actor.guard.base.idle.png');
    expect(library.imageUrls()).toHaveLength(12);
  });

  it('wraps a looping clip and clamps a non-looping one', async () => {
    const library = await loadPublishedLibrary();
    const first = library.resolveFrame('actor.prisoner.base', 'walk', 'north', 0);
    expect(library.resolveFrame('actor.prisoner.base', 'walk', 'north', 8).rect).toEqual(first.rect);
    expect(clipFrameOrdinal(0.35, 10, 8, true)).toBe(3);
    expect(clipFrameOrdinal(99, 10, 8, false)).toBe(7);
  });

  it('throws on an unknown logical id rather than rendering nothing', async () => {
    const library = await loadPublishedLibrary();
    expect(() => library.resolveClip('actor.warden.base', 'walk', 'south')).toThrow(/Unknown logical asset id/);
    expect(() => library.resolveClip('actor.prisoner.base', 'sprint', 'south')).toThrow(/no clip "sprint"/);
  });

  it('refuses a registry that names a manifest the batch does not provide', async () => {
    await expect(
      AtlasLibrary.load({
        fetchJson: async (url) => {
          if (url.endsWith('asset-registry.json')) {
            return { schemaVersion: 1, assets: [{ assetId: 'actor.ghost.base', manifest: 'actor.ghost.base.atlas-manifests.json', clips: ['idle'] }] };
          }
          throw new Error(`Failed to load ${url}: HTTP 404.`);
        },
      }),
    ).rejects.toThrow(/HTTP 404/);
  });

  it('refuses a manifest whose asset id contradicts the registry', async () => {
    const manifests = JSON.parse(
      await readFile(path.join(publishedAtlasDirectory, 'actor.cook.base.atlas-manifests.json'), 'utf8'),
    ) as Array<{ assetId: string }>;
    for (const manifest of manifests) manifest.assetId = 'actor.impostor.base';

    await expect(
      AtlasLibrary.load({
        fetchJson: async (url) => {
          if (url.endsWith('asset-registry.json')) {
            return { schemaVersion: 1, assets: [{ assetId: 'actor.cook.base', manifest: 'actor.cook.base.atlas-manifests.json', clips: ['idle', 'walk'] }] };
          }
          return manifests;
        },
      }),
    ).rejects.toThrow(/declares "actor.impostor.base"/);
  });

  it('refuses a manifest missing a direction instead of parsing it as partial', async () => {
    const manifests = JSON.parse(
      await readFile(path.join(publishedAtlasDirectory, 'actor.medic.base.atlas-manifests.json'), 'utf8'),
    ) as Array<{ clips: Record<string, { frames: Record<string, unknown> }> }>;
    delete manifests[1]?.clips.walk?.frames.northWest;

    await expect(
      AtlasLibrary.load({
        fetchJson: async (url) => {
          if (url.endsWith('asset-registry.json')) {
            return { schemaVersion: 1, assets: [{ assetId: 'actor.medic.base', manifest: 'actor.medic.base.atlas-manifests.json', clips: ['idle', 'walk'] }] };
          }
          return manifests;
        },
      }),
    ).rejects.toThrow();
  });
});

describe('world movement to authored direction', () => {
  it('maps the eight cardinal and diagonal movements to their authored rows', () => {
    // The contract defines +x east and +y south in world space.
    expect(directionFromMovement(1, 0)).toBe('east');
    expect(directionFromMovement(1, 1)).toBe('southEast');
    expect(directionFromMovement(0, 1)).toBe('south');
    expect(directionFromMovement(-1, 1)).toBe('southWest');
    expect(directionFromMovement(-1, 0)).toBe('west');
    expect(directionFromMovement(-1, -1)).toBe('northWest');
    expect(directionFromMovement(0, -1)).toBe('north');
    expect(directionFromMovement(1, -1)).toBe('northEast');
  });

  it('snaps an off-axis vector to the nearest authored direction', () => {
    expect(directionFromMovement(10, 1)).toBe('east');
    expect(directionFromMovement(10, 8)).toBe('southEast');
    expect(directionFromMovement(-0.2, -9)).toBe('north');
  });

  it('keeps the previous facing when an actor stops', () => {
    expect(directionFromMovement(0, 0)).toBe(DEFAULT_FACING);
    expect(directionFromMovement(0, 0, 'west')).toBe('west');
  });

  it('rejects a non-finite movement vector rather than guessing', () => {
    expect(() => directionFromMovement(Number.NaN, 0)).toThrow(RangeError);
    expect(() => clipFrameOrdinal(1, 0, 4, true)).toThrow(RangeError);
  });
});
