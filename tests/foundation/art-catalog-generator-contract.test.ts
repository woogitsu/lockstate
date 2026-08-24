import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `tooling/build-source-art-catalog.mjs` produces a committed artefact, and
 * issue #141 flagged what that combination costs: it was invoked by nothing —
 * not `package.json`, not a workflow, not another script, mentioned only in
 * prose — so editing an input silently did not regenerate the output. #141
 * calls that "the shape that silently goes stale", and it is the real defect
 * rather than the file's existence.
 *
 * It is now `pnpm content:source-art`. These assertions are about the two
 * properties that make it safe to invoke, because it cannot be run here to
 * check them directly: `assets/source/generated/*.png` is git-lfs tracked, so
 * in this container (and in CI's `verify` job, which stays on a pointer-only
 * checkout deliberately) every input is a ~132-byte pointer, and a successful
 * run would rewrite 23 tracked images. A test must never do that, so what is
 * asserted is the *source order* that makes the guard load-bearing.
 *
 * Measured, with the guard removed: the generator exits 0, prints "Generated 23
 * content-addressed source-art entries", replaces every published image with a
 * 132-byte pointer copy, and writes a catalog of pointer-text hashes. The
 * contract test in `tests/contract/` does fail on the result — its pointer
 * branch compares the catalog hash against the `oid` stated *inside* the
 * pointer, not the pointer's own bytes — so the corruption is not silent. The
 * guard's value is that the images are never deleted in the first place, and
 * that the operator is told to run `git lfs pull` instead of reading a hash
 * mismatch from a test about something else.
 */

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GENERATOR = 'tooling/build-source-art-catalog.mjs';

describe('the source-art catalog generator', () => {
  it('is reachable from package.json rather than only from prose', async () => {
    const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8')) as {
      readonly scripts?: Readonly<Record<string, string>>;
    };
    const invoking = Object.entries(packageJson.scripts ?? {}).filter(([, command]) => command.includes(GENERATOR));

    expect(
      invoking.map(([name]) => name),
      `${GENERATOR} writes a committed artefact and must be invocable by name, or editing an input silently does not regenerate it (#141)`,
    ).not.toEqual([]);
  });

  it('is documented with the command that runs it', async () => {
    const artPipeline = await readFile(path.join(repositoryRoot, 'docs/ART_PIPELINE.md'), 'utf8');
    expect(artPipeline, 'docs/ART_PIPELINE.md must name the script').toContain(GENERATOR);
    expect(artPipeline, 'and the command an operator actually types').toContain('pnpm content:source-art');
  });

  it('validates its inputs before deleting the published output', async () => {
    const source = await readFile(path.join(repositoryRoot, GENERATOR), 'utf8');

    // Anchored on the *check*, not on the pointer prefix constant. The first
    // version of this test used `indexOf('git-lfs.github.com/spec/v1')`, which
    // finds `LFS_POINTER_PREFIX`'s declaration -- so moving the entire scan and
    // throw to *after* the `rm` left the test green, because the constant stayed
    // where it was. Only running that mutation showed it.
    const scan = source.indexOf('pointers.push(');
    const refusal = source.indexOf('pointers.length > 0');
    const destructiveRemove = source.indexOf('rm(outputDir');

    expect(source, 'the generator must know what a git-lfs pointer looks like').toContain('git-lfs.github.com/spec/v1');
    expect(scan, 'the generator must scan its inputs for pointer files').toBeGreaterThan(-1);
    expect(refusal, 'the generator must refuse when it finds any').toBeGreaterThan(-1);
    expect(destructiveRemove, 'the generator is expected to clear its output directory').toBeGreaterThan(-1);

    for (const [label, index] of [
      ['the input scan', scan],
      ['the refusal', refusal],
    ] as const) {
      expect(
        index,
        `${label} must appear before rm(outputDir): a guard that fires after the output directory is gone has already done the damage`,
      ).toBeLessThan(destructiveRemove);
    }
  });
});
