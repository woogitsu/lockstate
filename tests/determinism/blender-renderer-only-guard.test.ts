import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const blender = process.env.LOCKSTATE_BLENDER ?? 'blender';
const probe = spawnSync(blender, ['--version'], { encoding: 'utf8' });
const canRun = probe.status === 0 && /^Blender 5\.2\./.test(probe.stdout ?? '');

it.skipIf(!canRun)('rejects an unknown --only asset before publishing a partial render', () => {
  const output = mkdtempSync(join(tmpdir(), 'lockstate-blender-unknown-only-'));
  try {
    const result = spawnSync(blender, [
      '--background', '--factory-startup', '--python-exit-code', '1',
      join(root, 'assets/source/blender/environment.mvp.catalog.blend'),
      '--python', join(root, 'tooling/blender/render-environment-objects.py'),
      '--', '--output', output, '--only', 'door.interior.variants,missing.collection',
    ], { encoding: 'utf8', cwd: root, maxBuffer: 8 * 1024 * 1024 });
    const log = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    expect(result.status, log).not.toBe(0);
    expect(log).toContain('missing.collection');
    expect(existsSync(join(output, 'door.interior.variants.png'))).toBe(false);
    expect(existsSync(join(output, 'environment-objects.render.json'))).toBe(false);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
}, 180_000);
