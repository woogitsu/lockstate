import { readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { AtlasFrameIndex } from '../../src/rendering/assets/atlas-frame-index';
import { AtlasLibrary, RUNTIME_ATLAS_BASE_PATH } from '../../src/rendering/assets/atlas-library';
import { LIVE_ACTOR_ASSET_IDS } from '../../src/rendering/feed/actors-from-delta';

const directory = resolve(__dirname, '../../public/assets/actors');
const MIB = 1024 * 1024;

async function atlasMetrics(assetIds?: readonly string[]): Promise<{ count: number; transfer: number; decoded: number }> {
  const library = await AtlasLibrary.load({
    fetchJson: async (url) => JSON.parse(await readFile(join(directory, url.slice(RUNTIME_ATLAS_BASE_PATH.length + 1)), 'utf8')),
  });
  const index = AtlasFrameIndex.fromLibrary(library, assetIds);
  const dimensions = new Map<string, { width: number; height: number }>();
  for (const assetId of index.assetIds()) {
    const manifests = JSON.parse(await readFile(join(directory, `${assetId}.atlas-manifests.json`), 'utf8')) as {
      image: string; widthPx: number; heightPx: number;
    }[];
    for (const manifest of manifests) dimensions.set(manifest.image, { width: manifest.widthPx, height: manifest.heightPx });
  }
  let transfer = 0;
  let decoded = 0;
  for (const image of index.images()) {
    const file = join(directory, basename(image.imageUrl));
    const bytes = await readFile(file);
    const size = dimensions.get(basename(image.imageUrl));
    expect(size, image.imageUrl).toBeDefined();
    if (bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') {
      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([size!.width, size!.height]);
      transfer += bytes.length;
    } else {
      const pointer = bytes.toString('utf8');
      expect(pointer, file).toContain('version https://git-lfs.github.com/spec/v1');
      const declaredBytes = /^size (\d+)$/m.exec(pointer)?.[1];
      expect(declaredBytes, file).toBeDefined();
      transfer += Number(declaredBytes);
    }
    decoded += size!.width * size!.height * 4;
  }
  return { count: index.images().length, transfer, decoded };
}

it('keeps live prisoner and guard startup atlases within their initial-load budget', async () => {
  const metrics = await atlasMetrics(LIVE_ACTOR_ASSET_IDS);
  expect(metrics.count).toBe(4);
  expect(metrics.transfer).toBeLessThanOrEqual(5 * MIB);
  expect(metrics.decoded).toBeLessThanOrEqual(64 * MIB);
});

it('keeps the complete five-role demo catalog within its authoring budget', async () => {
  const metrics = await atlasMetrics();
  expect(metrics.count).toBe(10);
  expect(metrics.transfer).toBeLessThanOrEqual(12 * MIB);
  expect(metrics.decoded).toBeLessThanOrEqual(160 * MIB);
});
