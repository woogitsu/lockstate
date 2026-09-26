import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { selectActorPose } from '../../src/rendering/actors/actor-pose';
import { placeFootPivotSprite } from '../../src/rendering/actors/sprite-placement';
import { AtlasFrameIndex, atlasFrameName } from '../../src/rendering/assets/atlas-frame-index';
import { AtlasLibrary, RUNTIME_ATLAS_BASE_PATH } from '../../src/rendering/assets/atlas-library';
import { ATLAS_DIRECTIONS } from '../../src/rendering/assets/atlas-manifest';
import { TILE_SIZE_PX, tileCentreToWorld } from '../../src/rendering/tile-metrics';

/**
 * Issue #32's acceptance criterion is that the renderer loads representative
 * assets *through the manifest*. `runtime-atlas-library.test.ts` proves the
 * loader does that; this proves the thing the renderer actually draws from
 * does, end to end: a logical asset id and a movement vector in, a real
 * rectangle of a real atlas and a world position out, with no filename spelled
 * anywhere in the renderer.
 *
 * Manifests are plain JSON, so this needs no Git LFS content and stays in the
 * ordinary `pnpm test` gate; `pnpm verify:assets` is what checks image bytes.
 */

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..');
const publishedAtlasDirectory = path.join(repositoryRoot, 'public', 'assets', 'actors');

async function loadPublishedIndex(): Promise<AtlasFrameIndex> {
  const library = await AtlasLibrary.load({
    fetchJson: async (url) => {
      const filename = url.slice(RUNTIME_ATLAS_BASE_PATH.length + 1);
      return JSON.parse(await readFile(path.join(publishedAtlasDirectory, filename), 'utf8'));
    },
  });
  return AtlasFrameIndex.fromLibrary(library);
}

describe('runtime atlas frame index', () => {
  it('indexes every published asset, clip and direction', async () => {
    const index = await loadPublishedIndex();

    expect(index.assetIds()).toEqual([
      'actor.cook.base',
      'actor.guard.base',
      'actor.guard.response',
      'actor.guard.search',
      'actor.medic.base',
      'actor.prisoner.base',
      'actor.prisoner.riot',
      'actor.staff.base',
    ]);

    for (const assetId of index.assetIds()) {
      const idle = index.clip(assetId, 'idle');
      const motionClipId = assetId === 'actor.guard.response' ? 'respond' : assetId === 'actor.guard.search' ? 'search' : assetId === 'actor.prisoner.riot' ? 'agitate' : 'walk';
      const walk = index.clip(assetId, motionClipId);
      expect(idle, `${assetId} idle`).toBeDefined();
      expect(walk, `${assetId} walk`).toBeDefined();
      expect(idle?.frameCount).toBe(1);
      expect(walk?.frameCount).toBe(assetId === 'actor.guard.response' || assetId === 'actor.guard.search' || assetId === 'actor.prisoner.riot' ? 4 : 8);
      expect(walk?.fps).toBe(assetId === 'actor.guard.response' || assetId === 'actor.guard.search' || assetId === 'actor.prisoner.riot' ? 6 : 10);
      expect(walk?.loop).toBe(true);

      for (const direction of ATLAS_DIRECTIONS) {
        expect(walk?.byDirection.get(direction)?.length, `${assetId} walk ${direction}`).toBe(assetId === 'actor.guard.response' || assetId === 'actor.guard.search' || assetId === 'actor.prisoner.riot' ? 4 : 8);
        expect(idle?.byDirection.get(direction)?.length, `${assetId} idle ${direction}`).toBe(1);
      }
    }
  });

  it('gives every frame of an atlas image a distinct name', async () => {
    const index = await loadPublishedIndex();
    const images = index.images();
    // Two clips per asset, one image each.
    expect(images).toHaveLength(index.assetIds().length * 2);

    for (const image of images) {
      const names = image.frames.map((frame) => frame.name);
      expect(new Set(names).size, image.imageUrl).toBe(names.length);
      expect(image.imageUrl.startsWith(`${RUNTIME_ATLAS_BASE_PATH}/`)).toBe(true);
    }
  });

  it('resolves the same frames the library does, without rebuilding them per call', async () => {
    const index = await loadPublishedIndex();
    const first = index.frame('actor.prisoner.base', 'walk', 'north', 3);
    const second = index.frame('actor.prisoner.base', 'walk', 'north', 3);

    expect(first).toBeDefined();
    expect(second).toBe(first);
    expect(first?.frameName).toBe(atlasFrameName('walk', 'north', 3));
  });

  it('keeps every frame inside its atlas and on the contract geometry', async () => {
    const index = await loadPublishedIndex();
    const manifestsByImage = new Map<string, { widthPx: number; heightPx: number }>();
    for (const assetId of index.assetIds()) {
      const manifests = JSON.parse(
        await readFile(path.join(publishedAtlasDirectory, `${assetId}.atlas-manifests.json`), 'utf8'),
      ) as Array<{ image: string; widthPx: number; heightPx: number }>;
      for (const manifest of manifests) {
        manifestsByImage.set(`${RUNTIME_ATLAS_BASE_PATH}/${manifest.image}`, manifest);
      }
    }

    for (const image of index.images()) {
      const bounds = manifestsByImage.get(image.imageUrl);
      expect(bounds, image.imageUrl).toBeDefined();
      for (const frame of image.frames) {
        expect(frame.rect.width).toBe(256);
        expect(frame.rect.height).toBe(384);
        expect(frame.rect.x + frame.rect.width).toBeLessThanOrEqual(bounds!.widthPx);
        expect(frame.rect.y + frame.rect.height).toBeLessThanOrEqual(bounds!.heightPx);
      }
    }
  });

  it('anchors every role on the same foot pivot, so no role needs an offset', async () => {
    const index = await loadPublishedIndex();
    for (const assetId of index.assetIds()) {
      for (const clipId of ['idle', assetId === 'actor.guard.response' ? 'respond' : assetId === 'actor.guard.search' ? 'search' : assetId === 'actor.prisoner.riot' ? 'agitate' : 'walk']) {
        const frame = index.frame(assetId, clipId, 'south', 0);
        expect(frame?.footPivotPx, `${assetId} ${clipId}`).toEqual({ x: 128, y: 352 });
      }
    }
  });

  it('turns a logical id and a movement vector into a placed frame', async () => {
    const index = await loadPublishedIndex();

    // A prisoner walking due south, half a second into the cycle.
    const pose = selectActorPose({ deltaX: 0, deltaY: 1.4 });
    expect(pose).toEqual({ clipId: 'walk', direction: 'south' });

    const frame = index.frame('actor.prisoner.base', pose.clipId, pose.direction, 5);
    expect(frame).toBeDefined();
    expect(frame?.imageUrl).toBe(`${RUNTIME_ATLAS_BASE_PATH}/actor.prisoner.base.walk.png`);

    const placement = placeFootPivotSprite(tileCentreToWorld(4), tileCentreToWorld(9), frame!);
    // Feet land on the centre of tile (4, 9); the frame hangs up and to the left of that.
    expect(placement.x).toBe(4.5 * TILE_SIZE_PX);
    expect(placement.y).toBe(9.5 * TILE_SIZE_PX);
    expect(placement.topLeftY).toBeLessThan(placement.y);
    expect(placement.displayWidth).toBe(TILE_SIZE_PX);
  });

  it('answers for an unknown asset or clip instead of throwing into the frame loop', async () => {
    const index = await loadPublishedIndex();
    expect(index.has('actor.warden.base')).toBe(false);
    expect(index.clip('actor.warden.base', 'walk')).toBeUndefined();
    expect(index.clip('actor.prisoner.base', 'sprint')).toBeUndefined();
    expect(index.frame('actor.prisoner.base', 'walk', 'south', 99)).toBeUndefined();
  });
});
