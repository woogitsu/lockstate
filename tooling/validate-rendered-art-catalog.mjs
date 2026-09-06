/**
 * Rendered-art catalog validation gate (ADR 0100).
 *
 * `tooling/validate-runtime-atlas.mjs` validates the actor batch against the
 * character contract; this is that gate's sibling for the second publishing
 * lane ADR 0100 accepted, checking `public/game-content/rendered-art.v1.json`
 * against `assets/rendered/environment/environment-objects.render.json`
 * instead of against numbers repeated here. Wired into `pnpm verify:assets`
 * beside the actor check, and runnable standalone as
 * `node tooling/validate-rendered-art-catalog.mjs`.
 *
 * ## What this proves, precisely, and what it does not
 *
 * It proves three things, each independently, about every published entry:
 *
 * 1. **The published catalog entry's declared sha256 matches the committed
 *    render's own sha256**, `environment-objects.render.json`'s -- so a
 *    catalog hand-edited to point at the wrong file, or regenerated from a
 *    render that has since changed underneath it, fails here rather than
 *    shipping.
 * 2. **When real image bytes are on disk (a full checkout), those bytes hash
 *    to the declared sha256** -- both the committed render under
 *    `assets/rendered/environment/` and the published copy under
 *    `public/game-content/source-art/`. **When only a Git LFS pointer is on
 *    disk** (this container, and CI's `assets` job, which deliberately never
 *    pulls `public/game-content/` -- see `ci.yml`'s `assets` job comment),
 *    the pointer's own declared `oid` is compared against the catalog's
 *    sha256 instead, the same duality
 *    `tests/contract/art-pipeline-contract.test.ts` already uses for the
 *    owner sheets. Neither branch is vacuous; between them every checkout
 *    state is actually checked rather than silently skipped.
 * 3. **The geometry invariants ADR 0100 named**: `frameAspectDriftFromFootprint`
 *    is (very close to) zero, and the declared `frameTiles` never falls
 *    short of `footprintTiles` on either axis -- a frame is padding *outward*
 *    from the footprint, never a crop tighter than it.
 *
 * **What it deliberately does not do: re-invoke Blender.** `docs/ART_PIPELINE.md`
 * records that EEVEE needs an EGL library even in `--background` and runs at
 * roughly 50s/frame on software rasterisation, pinned to an exact Blender
 * version nothing in CI has installed -- so this gate cannot and does not
 * prove that running `render-environment-objects.py` again today would
 * reproduce these exact bytes. That claim rests entirely on the two
 * independent-run comparison already recorded in `docs/ART_PIPELINE.md`
 * ("Reproducibility"), which this gate does not repeat and could not without
 * Blender. What this gate *can* and does check is narrower and mechanical:
 * that the bytes actually published are the bytes the sidecar and the
 * catalog both claim they are, right now, in this checkout.
 */

import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG_PATH = path.join(repositoryRoot, 'public/game-content/rendered-art.v1.json');
const PUBLISHED_DIR = path.join(repositoryRoot, 'public/game-content');
const SIDECAR_PATH = path.join(repositoryRoot, 'assets/rendered/environment/environment-objects.render.json');
const RENDERED_DIR = path.join(repositoryRoot, 'assets/rendered/environment');

const PNG_SIGNATURE = '89504e470d0a1a0a';
const LFS_POINTER_PREFIX = 'version https://git-lfs.github.com/spec/v1';
/** `frameAspectDriftFromFootprint` is measured as an exact ratio comparison by the renderer itself
 * (`docs/ART_PIPELINE.md`: "the recorded drift is `0` for all 23 models"), so this tolerance exists
 * only for floating-point round-trip through JSON, not to admit real drift. */
const DRIFT_EPSILON = 1e-9;

/**
 * Either hashes real bytes, or -- for a Git LFS pointer -- reads the sha256 it
 * declares of itself. Returns `{ sha256, mode }` so a caller can report which
 * branch actually ran, the same distinction
 * `art-pipeline-contract.test.ts` makes.
 */
async function sha256OfPathOrPointer(filePath) {
  const buffer = await readFile(filePath);
  const head = buffer.subarray(0, LFS_POINTER_PREFIX.length).toString('utf8');
  if (head === LFS_POINTER_PREFIX) {
    const text = buffer.toString('utf8');
    const oid = /oid sha256:([a-f0-9]{64})/u.exec(text)?.[1];
    if (oid === undefined) throw new Error(`${filePath} is a Git LFS pointer with no oid line.`);
    return { sha256: oid, mode: 'pointer' };
  }
  return { sha256: createHash('sha256').update(buffer).digest('hex'), mode: 'bytes' };
}

/** Confirms real bytes really are a PNG of the declared size; a no-op (returns null) for a pointer. */
function checkDecodedSize(buffer, declared, imagePath, report) {
  if (buffer.subarray(0, LFS_POINTER_PREFIX.length).toString('utf8') === LFS_POINTER_PREFIX) return;
  if (buffer.subarray(0, 8).toString('hex') !== PNG_SIGNATURE) {
    report(`${imagePath} does not start with the PNG signature`);
    return;
  }
  if (buffer.subarray(12, 16).toString('ascii') !== 'IHDR') {
    report(`${imagePath} has no IHDR chunk`);
    return;
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width !== declared.width || height !== declared.height) {
    report(`${imagePath} decodes to ${width}x${height}, but the catalog declares ${declared.width}x${declared.height}`);
  }
}

/**
 * @returns {Promise<{ errors: string[], entryCount: number }>}
 */
export async function validateRenderedArtCatalog(options = {}) {
  const errors = [];
  const report = (message) => errors.push(message);

  const catalogPath = options.catalogPath ?? CATALOG_PATH;
  const sidecarPath = options.sidecarPath ?? SIDECAR_PATH;
  const renderedDir = options.renderedDir ?? RENDERED_DIR;
  const publishedDir = options.publishedDir ?? PUBLISHED_DIR;

  if (!existsSync(catalogPath)) {
    return { errors: [`${catalogPath} does not exist; run \`pnpm content:rendered-art\` first`], entryCount: 0 };
  }
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  if (catalog.schemaVersion !== 1 || catalog.kind !== 'lockstate.rendered-art-catalog' || !Array.isArray(catalog.entries)) {
    return { errors: [`${catalogPath} has an unsupported schema version or kind`], entryCount: 0 };
  }
  if (catalog.entries.length === 0) {
    return { errors: [`${catalogPath} publishes no entries`], entryCount: 0 };
  }

  const sidecar = JSON.parse(await readFile(sidecarPath, 'utf8'));
  const sidecarById = new Map((sidecar.entries ?? []).map((entry) => [entry.assetId, entry]));

  const seen = new Set();
  for (const entry of catalog.entries) {
    if (typeof entry.assetId !== 'string' || seen.has(entry.assetId)) {
      report(`${catalogPath} has a missing or duplicate assetId ("${entry.assetId}")`);
      continue;
    }
    seen.add(entry.assetId);

    const sidecarEntry = sidecarById.get(entry.assetId);
    if (sidecarEntry === undefined) {
      report(`"${entry.assetId}" is published but environment-objects.render.json no longer describes it`);
      continue;
    }

    // Check 1: catalog sha256 agrees with the sidecar's, unconditionally --
    // both are plain committed JSON, readable without pulling anything.
    if (entry.sha256 !== sidecarEntry.sha256) {
      report(
        `"${entry.assetId}": catalog declares sha256 ${entry.sha256} but the sidecar records ${sidecarEntry.sha256} for the same render`,
      );
    }
    if (!entry.image?.includes(entry.sha256.slice(0, 12))) {
      report(`"${entry.assetId}": published filename "${entry.image}" does not embed its own declared hash`);
    }

    // Check 2: the committed render, and the published copy, both hash (or
    // pointer-declare) to that same sha256.
    const committedRenderPath = path.join(renderedDir, sidecarEntry.image);
    const publishedPath = path.join(publishedDir, entry.image);
    for (const [label, filePath] of [
      ['committed render', committedRenderPath],
      ['published copy', publishedPath],
    ]) {
      if (!existsSync(filePath)) {
        report(`"${entry.assetId}": ${label} is missing at ${filePath}`);
        continue;
      }
      const { sha256, mode } = await sha256OfPathOrPointer(filePath);
      if (sha256 !== entry.sha256) {
        report(
          `"${entry.assetId}": ${label} at ${filePath} ${mode === 'pointer' ? 'declares oid' : 'hashes to'} ${sha256}, not the catalog's ${entry.sha256}`,
        );
      }
      if (mode === 'bytes') {
        const buffer = await readFile(filePath);
        checkDecodedSize(buffer, entry.dimensionsPx, filePath, report);
      }
    }

    // Check 3: the geometry invariants ADR 0100 named.
    const drift = entry.frameAspectDriftFromFootprint;
    if (typeof drift !== 'number' || Math.abs(drift) > DRIFT_EPSILON) {
      report(`"${entry.assetId}": frameAspectDriftFromFootprint is ${drift}, not (approximately) zero`);
    }
    const frame = entry.frameTiles;
    const footprint = entry.footprintTiles;
    if (!frame || !footprint || frame.width < footprint.width || frame.height < footprint.height) {
      report(
        `"${entry.assetId}": frameTiles (${frame?.width}x${frame?.height}) is narrower than footprintTiles (${footprint?.width}x${footprint?.height}); a render frame must pad outward, never crop inward`,
      );
    }
    if (
      entry.dimensionsPx?.width !== sidecarEntry.sizePx?.width ||
      entry.dimensionsPx?.height !== sidecarEntry.sizePx?.height
    ) {
      report(
        `"${entry.assetId}": catalog dimensionsPx (${entry.dimensionsPx?.width}x${entry.dimensionsPx?.height}) disagrees with the sidecar's sizePx (${sidecarEntry.sizePx?.width}x${sidecarEntry.sizePx?.height})`,
      );
    }
  }

  return { errors, entryCount: catalog.entries.length };
}

const isCommandLine = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCommandLine) {
  const { errors, entryCount } = await validateRenderedArtCatalog();
  if (errors.length > 0) {
    console.error(`Invalid rendered-art catalog:`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(`Validated ${entryCount} rendered-art catalog entries.`);
}
