import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Determinism gate for the environment-object renderer (issue #1041 follow-up).
 *
 * PR #1041 landed `tooling/blender/render-environment-objects.py` and claimed,
 * in its own docblock, byte-identical output across independent runs. Until
 * this file, nothing executable checked that claim -- the docblock said so of
 * itself: "NOTHING CHECKS THAT AUTOMATICALLY... Writing that gate is owed
 * work." `tooling/verify-environment-render-determinism.mjs` is that gate;
 * this file wires its fast form into `pnpm test`, with the same
 * `it.skipIf(!canRunLive)` idiom `tests/determinism/art-pipeline-determinism.test.ts`
 * already uses for the character pipeline's own live check, for the same
 * reason: it needs Blender, `.github/workflows/ci.yml` installs Blender on
 * none of its three jobs (read on 2026-09-06, not assumed), so this SKIPS --
 * visibly, in vitest's own skip count, never silently passing -- wherever
 * Blender is absent or is not the pinned 5.2.x, and actually renders and
 * compares two independent runs wherever it is present.
 *
 * It renders exactly one collection, `door.interior.variants` -- the
 * smallest frame among the 23 (256x64) and therefore the fastest render in
 * the catalogue, chosen the same way the character pipeline's live test uses
 * `--mode scene` instead of `--mode full`: this is the cheap form of the real
 * check, not a different one. `docs/ART_PIPELINE.md` ("Reproducibility")
 * records the full-batch, all-23 comparison as the authoritative evidence;
 * that one takes minutes and is run by hand, matching `--mode full` there.
 *
 * A green run here proves the renderer is reproducible on the Blender actually
 * present. It does NOT prove the *committed* renders under
 * `assets/rendered/environment/` would reproduce today, and does not touch
 * that directory at all -- see the script's own docblock for what a green
 * run does and does not establish.
 */

const REPOSITORY_ROOT = resolve(__dirname, '../..');
const SCRIPT_PATH = join(REPOSITORY_ROOT, 'tooling/verify-environment-render-determinism.mjs');
const RENDERER_PATH = join(REPOSITORY_ROOT, 'tooling/blender/render-environment-objects.py');
const SHARED_MODULE_PATH = join(REPOSITORY_ROOT, 'tooling/blender/pipeline_common.py');

function pinnedVersion(): readonly [number, number] {
  const sharedModule = readFileSync(SHARED_MODULE_PATH, 'utf8');
  const match = /^SUPPORTED_BLENDER_VERSION = \((\d+), (\d+)\)$/m.exec(sharedModule);
  if (match === null) throw new Error(`${SHARED_MODULE_PATH} does not pin a concrete Blender version`);
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
// Deliberately does NOT read LOCKSTATE_ALLOW_BLENDER_MISMATCH: a mismatched
// Blender must SKIP this test, not run it with the version assertion
// downgraded to a warning. AGENTS.md's brief for this gate is explicit that
// this variable must never be set by any script, in any environment.
const canRunLive = blender !== undefined && versionMatches;

describe('environment-object render determinism', () => {
  it.skipIf(!canRunLive)(
    'produces byte-identical output from two independent runs of one collection',
    () => {
      const result = spawnSync(
        process.execPath,
        [SCRIPT_PATH, '--only', 'door.interior.variants', '--runs', '2'],
        { encoding: 'utf8', cwd: REPOSITORY_ROOT },
      );
      const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
      expect(output).toContain('door.interior.variants.png');
      expect(output).toContain('environment-objects.render.json');
      expect(result.status, output).toBe(0);
    },
    180_000,
  );

  it('renders through the pinned-version guard and cannot bypass it via the mismatch override', () => {
    const source = readFileSync(RENDERER_PATH, 'utf8');
    expect(source).toContain('pipeline_common.require_blender_version()');
    // The gate script itself must never set the override -- a script that did
    // would make its own green meaningless on the wrong Blender.
    const gateSource = readFileSync(SCRIPT_PATH, 'utf8');
    expect(gateSource).not.toMatch(/LOCKSTATE_ALLOW_BLENDER_MISMATCH\s*=/);
  });

  it("strips Blender's per-render metadata before the file this gate hashes exists", () => {
    // The regression this guards: PR #1041's renderer writes the PNG, then
    // rewrites it in place to flip row order and drop every chunk but IHDR,
    // the four colour-space chunks and IDAT. Reinstating `tEXt` in that
    // passthrough set reintroduces Blender's own `Date`/`RenderTime`/absolute
    // path stamps, which cannot be equal between two runs -- measured directly
    // in this container: two runs of the unmodified renderer agree on
    // `door.interior.variants.png` (`baa834a5…`), and reinstating `tEXt` in
    // the passthrough set makes two runs disagree on both the PNG and the
    // sidecar, going through `verify-environment-render-determinism.mjs`
    // itself. Asserting the passthrough set here is the static form of that
    // same regression class, the same split
    // `tests/determinism/art-pipeline-determinism.test.ts` draws between its
    // live check and its static one.
    const source = readFileSync(RENDERER_PATH, 'utf8');
    const match = /elif kind in \(([^)]+)\):\s*\n\s*passthrough\.append/.exec(source);
    expect(match, 'no passthrough chunk set found in _flip_and_rewrite_png').not.toBeNull();
    expect(match![1]).not.toMatch(/tEXt/);
  });
});
