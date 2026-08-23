import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Determinism contract for the Blender-to-atlas pipeline (issues #32 and #64).
 *
 * Issue #32 requires a "deterministic generation/hash test on representative
 * fixture". Issue #64 measured that it could not pass: two full runs of the same
 * commit, on one machine and one Blender, produced different walk atlases. Four
 * causes were isolated, and this file is the regression gate for all four.
 *
 * It has two halves, for a reason.
 *
 * The **live** half runs `tooling/verify-pipeline-determinism.mjs`, which is the
 * real check: build the pipeline twice from the same inputs and compare digests
 * of the artefacts that can be stable. It needs Blender, which CI does not have,
 * so it skips when Blender is absent. It uses `--mode scene`, which stops after
 * source-scene construction: that is where the nondeterminism actually lived,
 * and it costs a second per run instead of the three minutes a 72-frame render
 * takes. `--mode full` is the same comparison carried through the render and the
 * packer, and is run by hand -- see `docs/ART_PIPELINE.md`.
 *
 * The **static** half asserts that each of the four fixes is still in the
 * scripts. It is not a substitute for the live check and does not pretend to be;
 * it is what keeps the fixes from being quietly reverted on a machine, and in a
 * CI run, that cannot execute Blender at all.
 *
 * Neither half hashes rendered frames. They can never be byte-stable: Blender
 * writes `Date`, `RenderTime` and the absolute source `.blend` path into every
 * PNG as `tEXt` chunks. A test asserting equality of something that can never be
 * equal would be worse than no test.
 */

const REPOSITORY_ROOT = resolve(__dirname, '../..');
const BLENDER_SCRIPT_DIRECTORY = join(REPOSITORY_ROOT, 'tooling/blender');
const SHARED_MODULE = 'pipeline_common.py';

function read(relativePath: string): string {
  return readFileSync(join(BLENDER_SCRIPT_DIRECTORY, relativePath), 'utf8');
}

/**
 * Strips docstrings and comments before matching. Every one of these files
 * *documents* the operators and defaults it must not use, so a naive search of
 * the raw text would flag the explanation as the offence.
 */
function code(relativePath: string): string {
  return read(relativePath)
    .replace(/"""[\s\S]*?"""|'''[\s\S]*?'''/g, '')
    .replace(/#.*$/gm, '');
}

/** Every Blender entry point, discovered rather than listed, so a new script is covered automatically. */
const entryPoints = readdirSync(BLENDER_SCRIPT_DIRECTORY)
  .filter((name) => name.endsWith('.py') && name !== SHARED_MODULE)
  .sort();

const sharedModule = read(SHARED_MODULE);

function pinnedVersion(): readonly [number, number] {
  const match = /^SUPPORTED_BLENDER_VERSION = \((\d+), (\d+)\)$/m.exec(sharedModule);
  if (match === null) throw new Error(`${SHARED_MODULE} does not pin a concrete Blender version`);
  return [Number(match[1]), Number(match[2])];
}

function detectBlender(): { command: string; version: readonly [number, number] } | undefined {
  const command = process.env.LOCKSTATE_BLENDER ?? 'blender';
  const probe = spawnSync(command, ['--version'], { encoding: 'utf8' });
  if (probe.status !== 0) return undefined;
  const match = /Blender (\d+)\.(\d+)/.exec(probe.stdout ?? '');
  if (match === null) return undefined;
  return { command, version: [Number(match[1]), Number(match[2])] };
}

const blender = detectBlender();
const pinned = pinnedVersion();
const versionMatches = blender !== undefined && blender.version[0] === pinned[0] && blender.version[1] === pinned[1];
const canRunLive = blender !== undefined && (versionMatches || process.env.LOCKSTATE_ALLOW_BLENDER_MISMATCH === '1');

describe('Blender-to-atlas pipeline determinism', () => {
  it.skipIf(!canRunLive)(
    'produces byte-identical artefacts from two independent runs',
    () => {
      const result = spawnSync(
        process.execPath,
        [join(REPOSITORY_ROOT, 'tooling/verify-pipeline-determinism.mjs'), '--mode', 'scene', '--runs', '2'],
        { encoding: 'utf8', cwd: REPOSITORY_ROOT },
      );
      expect(`${result.stdout ?? ''}${result.stderr ?? ''}`).toContain('scene-fingerprint.json');
      expect(result.status, `${result.stdout ?? ''}\n${result.stderr ?? ''}`).toBe(0);
    },
    120_000,
  );

  it('pins a concrete Blender version and asserts it in every Blender entry point', () => {
    expect(pinned[0]).toBeGreaterThan(0);
    expect(entryPoints.length).toBeGreaterThan(0);
    const unguarded = entryPoints.filter((name) => !read(name).includes('pipeline_common.require_blender_version()'));
    expect(
      unguarded,
      'A Blender script that does not assert bpy.app.version will render silently different pixels on the wrong toolchain.',
    ).toEqual([]);
  });

  it('never builds geometry through an order-unstable primitive operator', () => {
    // `primitive_uv_sphere_add` returns identical vertices and an identical face
    // set in a different face and loop order on every call. `primitive_ico_sphere_add`
    // is built through the same BMesh path and is no better; only explicit
    // `from_pydata` topology is order-stable.
    const offenders = entryPoints.concat(SHARED_MODULE).filter((name) => /primitive_(?:uv|ico)_sphere_add/.test(code(name)));
    expect(offenders).toEqual([]);
    expect(sharedModule).toContain('def uv_sphere_mesh(');
    expect(sharedModule).toContain('mesh.from_pydata(');
  });

  it('disables dither and pins every byte-visible image setting', () => {
    // Blender defaults dither_intensity to 1.0; issue #64 measured it perturbing
    // 17.4% of pixels by exactly one 8-bit step.
    expect(sharedModule).toMatch(/render\.dither_intensity = 0(?:\.0)?\b/);
    for (const setting of ['file_format', 'color_mode', 'color_depth', 'compression']) {
      expect(sharedModule, `image_settings.${setting} is not pinned`).toContain(`image_settings.${setting} =`);
    }
  });

  it('writes every generated text file with LF endings on all platforms', () => {
    // `Path.write_text` translates newlines, which is why the committed 534-line
    // manifest is exactly 534 bytes larger than the one produced on Linux.
    expect(code(SHARED_MODULE)).toMatch(/def write_text\([\s\S]*?newline="\\n"/);
    const directWriters = entryPoints.filter((name) =>
      /\bwrite_text\(/.test(code(name).replaceAll('pipeline_common.write_text(', 'PINNED_WRITE(')),
    );
    expect(
      directWriters,
      'Text must be written through pipeline_common.write_text so newline translation cannot vary by platform.',
    ).toEqual([]);
  });
});
