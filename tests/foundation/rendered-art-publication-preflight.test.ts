import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, expect, it } from 'vitest';

const run = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

it('leaves published art untouched when the last render disagrees with its sidecar', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'lockstate-art-preflight-'));
  roots.push(root);
  const toolingDir = path.join(root, 'tooling');
  const renderedDir = path.join(root, 'assets/rendered/environment');
  const publishedDir = path.join(root, 'public/game-content/source-art');
  await Promise.all([mkdir(toolingDir), mkdir(renderedDir, { recursive: true }), mkdir(publishedDir, { recursive: true })]);
  await Promise.all(['build-rendered-art-catalog.mjs', 'source-art-lfs-guard.mjs'].map((name) =>
    copyFile(path.join(repositoryRoot, 'tooling', name), path.join(toolingDir, name))));

  const generator = await readFile(path.join(toolingDir, 'build-rendered-art-catalog.mjs'), 'utf8');
  const literal = /export const PUBLISHED_ASSET_IDS = \[([^\]]*)\]/u.exec(generator)?.[1];
  expect(literal, 'the generator must declare a published list').toBeDefined();
  const ids = [...literal!.matchAll(/'([^']+)'/gu)].map((match) => match[1]!);
  expect(ids.length).toBeGreaterThan(1);
  const lastId = [...ids].sort().at(-1)!;

  // A small PNG-shaped fixture is enough here: this test concerns publication
  // order, not decoding. The guard sees a real PNG signature, not an LFS pointer.
  const bytes = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
  const hash = createHash('sha256').update(bytes).digest('hex');
  const entries = ids.map((assetId) => ({
    assetId, image: `${assetId}.png`, sha256: assetId === lastId ? '0'.repeat(64) : hash,
    sizePx: { width: 1, height: 1 }, footprintTiles: { width: 1, height: 1 },
    frameTiles: { width: 1, height: 1 }, frameAspectDriftFromFootprint: 0,
  }));
  await Promise.all(entries.map((entry) => writeFile(path.join(renderedDir, entry.image), bytes)));
  await writeFile(path.join(renderedDir, 'environment-objects.render.json'), JSON.stringify({
    schemaVersion: 1, producedBy: 'fixture', catalog: 'fixture', blenderVersion: '5.2.1', entries,
  }));

  await expect(run(process.execPath, [path.join(toolingDir, 'build-rendered-art-catalog.mjs')])).rejects.toThrow();
  expect(await readdir(publishedDir), 'a late hash error must not leave earlier copied files behind').toEqual([]);
});
