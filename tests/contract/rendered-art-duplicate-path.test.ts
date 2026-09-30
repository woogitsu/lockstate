import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { validateRenderedArtCatalog } from '../../tooling/validate-rendered-art-catalog.mjs';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(images: Array<string | undefined>) {
  const root = await mkdtemp(path.join(tmpdir(), 'lockstate-rendered-duplicate-'));
  roots.push(root);
  const renderedDir = path.join(root, 'rendered');
  const publishedDir = path.join(root, 'public');
  await Promise.all([mkdir(renderedDir), mkdir(path.join(publishedDir, 'source-art'), { recursive: true })]);
  const hash = 'a'.repeat(64);
  const image = `source-art/rendered.fixture.${hash.slice(0, 12)}.png`;
  const pointer = `version https://git-lfs.github.com/spec/v1\noid sha256:${hash}\nsize 100\n`;
  await writeFile(path.join(publishedDir, image), pointer);
  const entries = images.map((entryImage, index) => ({
    assetId: `fixture.${index}`, image: entryImage, sha256: hash,
    dimensionsPx: { width: 256, height: 256 },
    footprintTiles: { width: 1, height: 1 },
    frameTiles: { width: 1.2, height: 1.2 },
    frameAspectDriftFromFootprint: 0,
  }));
  const sidecarEntries = entries.map((entry, index) => ({
    assetId: entry.assetId, image: `fixture-${index}.png`, sha256: hash,
    sizePx: { width: 256, height: 256 },
  }));
  await Promise.all(sidecarEntries.map((entry) => writeFile(path.join(renderedDir, entry.image), pointer)));
  const catalogPath = path.join(root, 'catalog.json');
  const sidecarPath = path.join(root, 'sidecar.json');
  await Promise.all([
    writeFile(catalogPath, JSON.stringify({ schemaVersion: 1, kind: 'lockstate.rendered-art-catalog', entries })),
    writeFile(sidecarPath, JSON.stringify({ entries: sidecarEntries })),
  ]);
  return { catalogPath, sidecarPath, renderedDir, publishedDir, image };
}

it('rejects two distinct asset ids pointing at one published image', async () => {
  const paths = await fixture(['source-art/rendered.fixture.aaaaaaaaaaaa.png', 'source-art/rendered.fixture.aaaaaaaaaaaa.png']);
  const result = await validateRenderedArtCatalog(paths);
  expect(result.errors).toContain(`${paths.catalogPath} has a duplicate published image path ("${paths.image}")`);
});

it('reports a missing image path without throwing or storing an undefined path', async () => {
  const paths = await fixture([undefined, pathsImage()]);
  const result = await validateRenderedArtCatalog(paths);
  expect(result.errors).toContain('"fixture.0": published image path "undefined" is not a safe rendered-art path');
  expect(result.errors).not.toContain(`${paths.catalogPath} has a duplicate published image path ("${paths.image}")`);
});

function pathsImage() {
  return 'source-art/rendered.fixture.aaaaaaaaaaaa.png';
}
