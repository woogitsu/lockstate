import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * The git-lfs guard for `build-source-art-catalog.mjs`, kept in a module of
 * its own so it can be **executed** by a test rather than only read.
 *
 * The generator hashes whatever bytes it reads, and `assets/source/generated/*.png`
 * is git-lfs tracked. In a checkout without LFS content each input is a
 * ~132-byte pointer file, so an unguarded run `rm -rf`s the real published
 * output, republishes 23 pointer files under content-addressed names, and
 * writes a catalog whose `sha256` values are the hashes of pointer text.
 * Verified by execution with this check removed -- the generator exits 0,
 * reports "Generated 23 content-addressed source-art entries", and leaves
 * 132-byte files where the images were.
 *
 * It is **not** silent afterwards: `tests/contract/art-pipeline-contract.test.ts`
 * fails on the result, because its pointer branch compares the catalog hash to
 * the `oid` *stated inside* the pointer rather than to the pointer's own bytes,
 * and those differ. That check (#154) is doing its job. What this guard adds is
 * that the damage never happens -- 23 tracked images replaced, recoverable only
 * from git -- and that the operator gets "run `git lfs pull` first" instead of a
 * hash mismatch reported minutes later by a test about something else.
 *
 * Reading is injected because the point of the split is testability: a pointer-only
 * checkout is exactly the state this refuses, so a test that used the real files
 * would either need LFS content it does not have or would have to write some.
 * `tests/foundation/art-catalog-generator-contract.test.ts` drives it with a
 * reader of its own and asserts the refusal, and separately asserts that the
 * generator awaits this before its `rm`.
 */

/** The first line of a git-lfs pointer file, and the whole tell. */
export const LFS_POINTER_PREFIX = 'version https://git-lfs.github.com/spec/v1';

/**
 * The reader the generator uses: the leading bytes of `<sourceDir>/<assetId>.png`.
 *
 * Only `LFS_POINTER_PREFIX.length` bytes are decoded as UTF-8. A real PNG's
 * leading bytes are not valid text and must never be compared as such beyond
 * the length that settles the question.
 */
export function readSourceHead(sourceDir) {
  return async (assetId) => {
    const buffer = await readFile(path.join(sourceDir, `${assetId}.png`));
    return buffer.subarray(0, LFS_POINTER_PREFIX.length).toString('utf8');
  };
}

/**
 * Refuses the run when any input is a git-lfs pointer file rather than an image.
 *
 * Every input is inspected before anything is reported, so the operator is told
 * how many of them are pointers rather than being sent back one file at a time.
 */
export async function assertSourceInputsAreImages({ entries, readHead }) {
  const pointers = [];
  for (const assetId of entries) {
    const head = await readHead(assetId);
    if (head === LFS_POINTER_PREFIX) pointers.push(`${assetId}.png`);
  }
  if (pointers.length > 0) {
    throw new Error(
      `Refusing to run: ${pointers.length} of ${entries.length} inputs under assets/source/generated/ are git-lfs pointer files, not images ` +
        `(${pointers.slice(0, 3).join(', ')}${pointers.length > 3 ? ', …' : ''}). ` +
        'Run `git lfs pull --include="assets/source/generated"` first. Hashing pointer bytes would publish a catalog of pointer hashes and delete the real output.',
    );
  }
}
