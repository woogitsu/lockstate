import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { validateRenderedArtCatalog } from '../../tooling/validate-rendered-art-catalog.mjs';

const temporaryRoots: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

it('rejects a published render filename that claims a different asset id', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'lockstate-rendered-path-'));
  temporaryRoots.push(root);
  const renderedDir = path.join(root, 'rendered');
  const publishedDir = path.join(root, 'public');
  await Promise.all([mkdir(renderedDir), mkdir(publishedDir)]);

  const hash = 'a'.repeat(64);
  const image = `rendered.some-other-asset.${hash.slice(0, 12)}.png`;
  const pointer = `version https://git-lfs.github.com/spec/v1\noid sha256:${hash}\nsize 100\n`;
  await writeFile(path.join(renderedDir, 'fixture.png'), pointer);
  // The path resolves and has the expected content, but advertises another asset id.
  await mkdir(path.join(publishedDir, 'source-art'));
  await writeFile(path.join(publishedDir, 'source-art', image), pointer);

  const catalogPath = path.join(root, 'catalog.json');
  const sidecarPath = path.join(root, 'sidecar.json');
  await writeFile(catalogPath, JSON.stringify({
    schemaVersion: 1,
    kind: 'lockstate.rendered-art-catalog',
    entries: [{
      assetId: 'fixture.test', image: `source-art/${image}`, sha256: hash,
      dimensionsPx: { width: 256, height: 256 },
      footprintTiles: { width: 1, height: 1 },
      frameTiles: { width: 1.2, height: 1.2 },
      frameAspectDriftFromFootprint: 0,
    }],
  }));
  await writeFile(sidecarPath, JSON.stringify({
    entries: [{ assetId: 'fixture.test', image: 'fixture.png', sha256: hash, sizePx: { width: 256, height: 256 } }],
  }));

  const result = await validateRenderedArtCatalog({ catalogPath, sidecarPath, renderedDir, publishedDir });
  expect(result.errors).toContain(`"fixture.test": published image must be "source-art/rendered.fixture.test.${hash.slice(0, 12)}.png", got "source-art/${image}"`);
});
