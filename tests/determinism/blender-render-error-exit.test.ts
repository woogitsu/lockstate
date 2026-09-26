import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const blender = process.env.LOCKSTATE_BLENDER ?? 'blender';
const probe = spawnSync(blender, ['--version'], { encoding: 'utf8' });
const canRun = probe.status === 0 && /^Blender 5\.2\./.test(probe.stdout ?? '');

it.skipIf(!canRun)('returns failure from the documented direct renderer command after a Python error', () => {
  const work = mkdtempSync(join(tmpdir(), 'lockstate-blender-exit-'));
  try {
    const blockedOutput = join(work, 'existing-file');
    writeFileSync(blockedOutput, 'leave untouched');
    const result = spawnSync(blender, [
      '--background', '--factory-startup',
      join(root, 'assets/source/blender/environment.mvp.catalog.blend'),
      '--python', join(root, 'tooling/blender/render-environment-objects.py'),
      '--', '--only', 'door.interior.variants', '--output', blockedOutput,
    ], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    const log = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    expect(log).toContain('FileExistsError');
    expect(result.status, log).not.toBe(0);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}, 30_000);
