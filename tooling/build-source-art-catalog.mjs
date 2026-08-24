import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const sourceDir = path.join(root, 'assets/source/generated');
const outputDir = path.join(root, 'public/game-content/source-art');
const outputManifest = path.join(root, 'public/game-content/source-art.v1.json');
const intake = JSON.parse(await readFile(path.join(sourceDir, 'manifest.json'), 'utf8'));
if (intake.schemaVersion !== 1 || !Array.isArray(intake.entries)) throw new Error('Invalid source-art intake manifest.');

const LFS_POINTER_PREFIX = 'version https://git-lfs.github.com/spec/v1';

/**
 * Every input is validated before anything is written, because the failure this
 * guards against is destructive.
 *
 * `assets/source/generated/*.png` is git-lfs tracked. In a checkout without LFS
 * content each one is a ~132-byte pointer file, and this script hashes whatever
 * bytes it reads: run there, it `rm -rf`s the real published output, republishes
 * 23 pointer files under content-addressed names, and writes a catalog whose
 * `sha256` values are the hashes of pointer text. Verified by execution with
 * this check removed -- it exits 0, reports "Generated 23 content-addressed
 * source-art entries", and leaves 132-byte files where the images were.
 *
 * It is **not** silent afterwards: `tests/contract/art-pipeline-contract.test.ts`
 * fails on the result, because its pointer branch compares the catalog hash to
 * the `oid` *stated inside* the pointer rather than to the pointer's own bytes,
 * and those differ. That check (#154) is doing its job. What this guard adds is
 * that the damage never happens -- 23 tracked images replaced, recoverable only
 * from git -- and that the operator gets "run `git lfs pull` first" instead of a
 * hash mismatch reported minutes later by a test about something else.
 *
 * The check runs before the `rm` on purpose. A guard that fires after the output
 * directory is gone has already done the damage.
 */
const pointers = [];
for (const assetId of intake.entries) {
  const input = path.join(sourceDir, `${assetId}.png`);
  const head = (await readFile(input)).subarray(0, LFS_POINTER_PREFIX.length).toString('utf8');
  if (head === LFS_POINTER_PREFIX) pointers.push(`${assetId}.png`);
}
if (pointers.length > 0) {
  throw new Error(
    `Refusing to run: ${pointers.length} of ${intake.entries.length} inputs under assets/source/generated/ are git-lfs pointer files, not images ` +
      `(${pointers.slice(0, 3).join(', ')}${pointers.length > 3 ? ', …' : ''}). ` +
      'Run `git lfs pull --include="assets/source/generated"` first. Hashing pointer bytes would publish a catalog of pointer hashes and delete the real output.',
  );
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
const entries = [];
for (const assetId of [...intake.entries].sort()) {
  const input = path.join(sourceDir, `${assetId}.png`);
  const buffer = await readFile(input);
  const hash = createHash('sha256').update(buffer).digest('hex');
  const image = `${assetId}.${hash.slice(0, 12)}.png`;
  await copyFile(input, path.join(outputDir, image));
  entries.push({
    assetId,
    contentVersion: 1,
    image: `source-art/${image}`,
    sha256: hash,
    dimensionsPx: { width: 1448, height: 1086 },
    sourceRectPx: { x: 0, y: 0, width: 1448, height: 1086 },
    pivotPx: { x: 724, y: 1085 },
    depthAnchor: 'bottom-center',
    sourceAttribution: { license: 'owner-supplied, project-internal', batchId: intake.batchId },
  });
}
await mkdir(path.dirname(outputManifest), { recursive: true });
await writeFile(outputManifest, `${JSON.stringify({ schemaVersion: 1, kind: 'lockstate.source-art-catalog', entries }, null, 2)}\n`);
console.log(`Generated ${entries.length} content-addressed source-art entries.`);
