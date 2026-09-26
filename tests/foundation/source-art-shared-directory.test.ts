import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

const root = resolve(__dirname, '../..');

it('regenerates owner sheets without removing immutable published URLs', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'lockstate-source-art-shared-'));
  try {
    const tooling = join(fixture, 'tooling');
    const source = join(fixture, 'assets/source/generated');
    const published = join(fixture, 'public/game-content/source-art');
    await Promise.all([mkdir(tooling, { recursive: true }), mkdir(source, { recursive: true }), mkdir(published, { recursive: true })]);
    await Promise.all([
      copyFile(join(root, 'tooling/build-source-art-catalog.mjs'), join(tooling, 'build-source-art-catalog.mjs')),
      copyFile(join(root, 'tooling/source-art-lfs-guard.mjs'), join(tooling, 'source-art-lfs-guard.mjs')),
      writeFile(join(fixture, 'package.json'), '{"type":"module"}\n'),
      writeFile(join(source, 'manifest.json'), '{"schemaVersion":1,"batchId":"fixture","entries":["fixture.sheet"]}\n'),
      writeFile(join(source, 'fixture.sheet.png'), Buffer.from('89504e470d0a1a0a', 'hex')),
      writeFile(join(published, 'rendered.fixture.object.abcdef012345.png'), 'blender-bytes'),
      writeFile(join(published, `fixture.sheet.${'a'.repeat(12)}.png`), 'old-sheet'),
      writeFile(join(fixture, 'public/game-content/source-art.v1.json'), JSON.stringify({
        schemaVersion: 1,
        entries: [{ assetId: 'fixture.sheet', sha256: 'a'.repeat(64), image: `source-art/fixture.sheet.${'a'.repeat(12)}.png` }],
      })),
    ]);
    const result = spawnSync(process.execPath, [join(tooling, 'build-source-art-catalog.mjs')], { cwd: fixture, encoding: 'utf8' });
    expect(result.status, `${result.stdout ?? ''}\n${result.stderr ?? ''}`).toBe(0);
    expect(await readFile(join(published, 'rendered.fixture.object.abcdef012345.png'), 'utf8')).toBe('blender-bytes');
    expect(await readFile(join(published, `fixture.sheet.${'a'.repeat(12)}.png`), 'utf8')).toBe('old-sheet');
    const catalog = JSON.parse(await readFile(join(fixture, 'public/game-content/source-art.v1.json'), 'utf8'));
    expect(catalog.entries).toHaveLength(1);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
