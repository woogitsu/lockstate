import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LFS_POINTER_PREFIX, assertSourceInputsAreImages } from '../../tooling/source-art-lfs-guard.mjs';

/**
 * `tooling/build-source-art-catalog.mjs` produces a committed artefact, and
 * issue #141 flagged what that combination costs: it was invoked by nothing —
 * not `package.json`, not a workflow, not another script, mentioned only in
 * prose — so editing an input silently did not regenerate the output. #141
 * calls that "the shape that silently goes stale", and it is the real defect
 * rather than the file's existence.
 *
 * It is now `pnpm content:source-art`. The other property that makes it safe to
 * invoke is its git-lfs guard: `assets/source/generated/*.png` is git-lfs
 * tracked, so in this container (and in CI's `verify` job, which stays on a
 * pointer-only checkout deliberately) every input is a ~132-byte pointer, and a
 * successful run would rewrite 23 tracked images.
 *
 * Measured, with the guard removed: the generator exits 0, prints "Generated 23
 * content-addressed source-art entries", replaces every published image with a
 * 132-byte pointer copy, and writes a catalog of pointer-text hashes. The
 * contract test in `tests/contract/` does fail on the result — its pointer
 * branch compares the catalog hash against the `oid` stated *inside* the
 * pointer, not the pointer's own bytes — so the corruption is not silent. The
 * guard's value is that the owner sheets are never replaced in the first place, and
 * that the operator is told to run `git lfs pull` instead of reading a hash
 * mismatch from a test about something else.
 *
 * ## Why the refusal is executed here and the ordering is still read
 *
 * This file used to assert the guard entirely by *reading the generator's
 * source* — that `pointers.push(` and `pointers.length > 0` appeared before
 * the first output write. That ordering is still asserted below, but
 * it can only ever prove the guard is **written**. Issue #264 measured the gap:
 * `if (pointers.length > 0 && false)` leaves every searched substring in place
 * and in the same order, so the refusal became unreachable with this file
 * green — and `tooling/` was outside `tsconfig`'s `include`, so `tsc` never saw
 * it either. Since #602 it is inside `tsconfig.tools.json`, which changes
 * nothing here: `&& false` is valid TypeScript and a typechecker has no
 * opinion about an unreachable refusal.
 *
 * So the refusal now lives in `tooling/source-art-lfs-guard.mjs` with its
 * reading injected, and the first test below *runs* it. The generator itself
 * still cannot be executed here — it would destroy 23 tracked images — which is
 * why the ordering assertion stays: running the guard proves it refuses,
 * reading the call site proves the generator awaits it before the `rm`.
 */

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GENERATOR = 'tooling/build-source-art-catalog.mjs';
const GUARD = 'tooling/source-art-lfs-guard.mjs';

/** The first bytes of a real PNG: the 8-byte signature, decoded the way the guard decodes them. */
const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('utf8');
/** A pointer file's head, exactly as the guard reads it: the prefix and nothing more. */
const POINTER_HEAD = LFS_POINTER_PREFIX;

/** Reads heads out of a map, so the refusal can be driven without a checkout in either state. */
function readerFor(heads: Readonly<Record<string, string>>): (assetId: string) => Promise<string> {
  return async (assetId) => {
    const head = heads[assetId];
    if (head === undefined) throw new Error(`the fixture has no input named ${assetId}`);
    return head;
  };
}

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
});

describe('the git-lfs guard the generator runs before publishing', () => {
  it('refuses a pointer-only checkout, naming the files and the remedy', async () => {
    // The state this container is actually in, and the one CI's `verify` job
    // stays in on purpose.
    const entries = ['guard-tower', 'cell-block', 'yard-gate'];
    const refusal = assertSourceInputsAreImages({
      entries,
      readHead: readerFor({ 'guard-tower': POINTER_HEAD, 'cell-block': POINTER_HEAD, 'yard-gate': POINTER_HEAD }),
    });

    // The whole point of the split: this is the refusal *executing*, not the
    // word "throw" appearing in a file. `if (pointers.length > 0 && false)`
    // survived the reading test and does not survive this one (#264).
    await expect(refusal).rejects.toThrow(/Refusing to run/u);
    const message = await refusal.then(
      () => '',
      (thrown: unknown) => (thrown instanceof Error ? thrown.message : String(thrown)),
    );
    // The operator has to be able to act on it: how many, which ones, and the
    // command that fixes it. A bare "refusing to run" would send them to read
    // the generator.
    expect(message).toContain('3 of 3');
    expect(message).toContain('guard-tower.png');
    expect(message).toContain('git lfs pull');
  });

  it('refuses when only one input is a pointer, rather than only when all of them are', async () => {
    // A partial `git lfs pull` is the realistic version of this failure, and a
    // guard that needed every input to be a pointer would publish 22 real
    // images and one pointer.
    await expect(
      assertSourceInputsAreImages({
        entries: ['guard-tower', 'cell-block'],
        readHead: readerFor({ 'guard-tower': PNG_HEAD, 'cell-block': POINTER_HEAD }),
      }),
    ).rejects.toThrow(/1 of 2/u);
  });

  it('lets a checkout with real image content through', async () => {
    // The other direction, so the guard cannot pass this file by refusing
    // everything: an operator who has run `git lfs pull` must be able to
    // regenerate the catalog.
    await expect(
      assertSourceInputsAreImages({
        entries: ['guard-tower', 'cell-block'],
        readHead: readerFor({ 'guard-tower': PNG_HEAD, 'cell-block': PNG_HEAD }),
      }),
    ).resolves.toBeUndefined();
  });

  it('knows what a git-lfs pointer looks like', async () => {
    const guard = await readFile(path.join(repositoryRoot, GUARD), 'utf8');
    expect(guard, 'the guard must know what a git-lfs pointer looks like').toContain('git-lfs.github.com/spec/v1');
    expect(LFS_POINTER_PREFIX, 'and the exported constant must be that line, not a paraphrase of it').toBe(
      'version https://git-lfs.github.com/spec/v1',
    );
  });

  it('is awaited by the generator before it publishes output', async () => {
    const source = await readFile(path.join(repositoryRoot, GENERATOR), 'utf8');

    // Anchored on the *call*, not on the pointer prefix constant. The first
    // version of this test used `indexOf('git-lfs.github.com/spec/v1')`, which
    // finds the constant's declaration -- so moving the entire scan and throw
    // to *after* the first output write left the test green, because the constant stayed
    // where it was. Only running that mutation showed it.
    //
    // `await` is part of the anchor: an un-awaited call returns a promise and
    // execution falls straight through to publishing, which is the same defect
    // as calling it late.
    const refusal = source.indexOf('await assertSourceInputsAreImages(');
    const firstWrite = source.indexOf('await mkdir(outputDir');

    expect(refusal, 'the generator must await the git-lfs guard').toBeGreaterThan(-1);
    expect(firstWrite, 'the generator must create its output directory').toBeGreaterThan(-1);
    expect(
      refusal,
      'the refusal must be awaited before publishing any output',
    ).toBeLessThan(firstWrite);

    // Unconditional: the call is the whole statement, not the consequent of
    // something. This is the same class of mutation as #264's
    // `pointers.length > 0 && false` -- the substring survives, the behaviour
    // does not -- and the bound is stated rather than papered over: a guard
    // wrapped in a multi-line `if (false) {` still reads as compliant here.
    // Only executing the generator could close that, and executing it in a
    // pointer-only checkout is precisely what destroys the images.
    const callLine = source.split('\n').find((line) => line.includes('assertSourceInputsAreImages({'));
    expect(callLine?.trim(), 'the guard must be called unconditionally').toMatch(
      /^await assertSourceInputsAreImages\(/u,
    );
  });
});
