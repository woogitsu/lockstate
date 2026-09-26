/**
 * Runtime atlas validation gate (issue #32).
 *
 * Issue #32 requires that "missing/inconsistent/oversized assets fail
 * validation before build/release". This is the check that enforces it; it is
 * wired into CI as the `assets` job (see `.github/workflows/ci.yml`) and is
 * available locally as `pnpm verify:assets`.
 *
 * It validates the *generated* runtime batch against the *authored* eight-view
 * contract. The guard radio response uses its four-frame cadence in
 * `guard-response-8-direction.contract.json`; all other actors use
 * `character-8-direction.contract.json`. Anything a manifest asserts -- direction
 * order, frame size, foot pivot, extrusion, atlas dimensions -- is checked
 * against that contract and against the PNG actually on disk.
 *
 * It reports every failure it finds rather than stopping at the first, so a
 * broken batch produces one complete, actionable report.
 *
 * Usage:
 *   node tooling/validate-runtime-atlas.mjs <atlas-directory> [manifest-file]
 *                                           [--contract <path>]
 */

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultContractPath = path.join(repositoryRoot, 'assets', 'contracts', 'character-8-direction.contract.json');
const responseContractPath = path.join(repositoryRoot, 'assets', 'contracts', 'guard-response-8-direction.contract.json');
const searchContractPath = path.join(repositoryRoot, 'assets', 'contracts', 'guard-search-8-direction.contract.json');
const riotContractPath = path.join(repositoryRoot, 'assets', 'contracts', 'prisoner-riot-8-direction.contract.json');
const assaultContractPath = path.join(repositoryRoot, 'assets', 'contracts', 'prisoner-assault-8-direction.contract.json');
const PNG_SIGNATURE = '89504e470d0a1a0a';
const LFS_POINTER_PREFIX = 'version https://git-lfs.github.com/spec/v1';

function parseArguments(argv) {
  const options = { directory: undefined, manifestName: undefined, contract: undefined };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--contract') {
      options.contract = path.resolve(argv[index + 1] ?? '');
      index += 1;
      continue;
    }
    positional.push(argv[index]);
  }

  options.directory = positional[0];
  options.manifestName = positional[1];
  return options;
}

/** Reads the IHDR dimensions, distinguishing a Git LFS pointer from corrupt bytes. */
function readPngSize(buffer, imagePath, report) {
  if (buffer.subarray(0, LFS_POINTER_PREFIX.length).toString('utf8') === LFS_POINTER_PREFIX) {
    report(
      `${imagePath} is a Git LFS pointer, not image data. Run "git lfs pull" (or check out with lfs: true) before validating; a pointer-only checkout cannot prove anything about the art.`,
    );
    return undefined;
  }
  if (buffer.subarray(0, 8).toString('hex') !== PNG_SIGNATURE) {
    report(`${imagePath} is not a PNG`);
    return undefined;
  }
  if (buffer.subarray(12, 16).toString('ascii') !== 'IHDR') {
    report(`${imagePath} has no IHDR chunk`);
    return undefined;
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function isFrameRect(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    Number.isInteger(value.x) &&
    Number.isInteger(value.y) &&
    Number.isInteger(value.width) &&
    Number.isInteger(value.height)
  );
}

function samePoint(left, right) {
  return left?.x === right?.x && left?.y === right?.y;
}

async function validateClipManifest(manifest, context) {
  const { atlasDirectory, contract, report, pivots } = context;
  const label = typeof manifest?.image === 'string' ? manifest.image : '<manifest without an image>';
  const directions = contract.coordinateSystem.clockwiseDirectionOrder;

  if (manifest?.schemaVersion !== 1 || typeof manifest.assetId !== 'string') {
    report(`${label} has an unsupported schema version or asset id`);
    return;
  }
  if (!new RegExp(contract.naming.assetIdPattern).test(manifest.assetId)) {
    report(`${manifest.assetId} does not match the contract asset id pattern ${contract.naming.assetIdPattern}`);
  }
  if (!Array.isArray(manifest.directions) || manifest.directions.join('|') !== directions.join('|')) {
    report(`${manifest.assetId} has a non-canonical direction order`);
  }
  if (!Number.isInteger(manifest.widthPx) || !Number.isInteger(manifest.heightPx)) {
    report(`${manifest.assetId} has invalid atlas dimensions`);
    return;
  }

  // Oversized texture. The previous revision compared the atlas only against
  // its own image, so an atlas that was genuinely too large for a baseline
  // WebGL2 device passed as long as the PNG agreed with the manifest.
  const maxDimension = contract.atlas.maxDimensionPx;
  if (manifest.widthPx > maxDimension || manifest.heightPx > maxDimension) {
    report(`${label} is ${manifest.widthPx}x${manifest.heightPx}, over the ${maxDimension}px contract limit`);
  }

  const imagePath = path.join(atlasDirectory, manifest.image ?? '');
  if (!existsSync(imagePath)) {
    report(`${label} has no image file on disk`);
  } else {
    const image = await readFile(imagePath);
    const size = readPngSize(image, manifest.image, report);
    if (size !== undefined && (size.width !== manifest.widthPx || size.height !== manifest.heightPx)) {
      report(`${manifest.image} dimensions do not match its manifest`);
    }
  }

  // Frame geometry and pivot. None of this was checked before: the `frame`
  // block could be absent, wrong, or disagree between an asset's own clips,
  // which is exactly the drift that makes a sprite swim between animations.
  const frame = manifest.frame;
  if (typeof frame !== 'object' || frame === null) {
    report(`${label} has no frame block, so its pivot and frame size are unverifiable`);
  } else {
    if (frame.widthPx !== contract.frame.widthPx || frame.heightPx !== contract.frame.heightPx) {
      report(
        `${label} declares ${frame.widthPx}x${frame.heightPx} frames but the contract fixes them at ${contract.frame.widthPx}x${contract.frame.heightPx}`,
      );
    }
    if (frame.extrudePx !== contract.atlas.extrudePx) {
      report(`${label} declares an extrusion of ${frame.extrudePx}px but the contract fixes it at ${contract.atlas.extrudePx}px`);
    }
    if (!samePoint(frame.footPivotPx, contract.frame.footPivotPx)) {
      report(
        `${label} has foot pivot (${frame.footPivotPx?.x}, ${frame.footPivotPx?.y}) but the contract fixes it at (${contract.frame.footPivotPx.x}, ${contract.frame.footPivotPx.y})`,
      );
    } else if (
      frame.footPivotPx.x < 0 ||
      frame.footPivotPx.y < 0 ||
      frame.footPivotPx.x > frame.widthPx ||
      frame.footPivotPx.y > frame.heightPx
    ) {
      report(`${label} has a foot pivot outside its own frame bounds`);
    }

    const previousPivot = pivots.get(manifest.assetId);
    if (previousPivot === undefined) {
      pivots.set(manifest.assetId, { pivot: frame.footPivotPx, source: label });
    } else if (!samePoint(previousPivot.pivot, frame.footPivotPx)) {
      report(
        `${manifest.assetId} has inconsistent pivots: ${previousPivot.source} uses (${previousPivot.pivot?.x}, ${previousPivot.pivot?.y}) and ${label} uses (${frame.footPivotPx?.x}, ${frame.footPivotPx?.y})`,
      );
    }
  }

  const clips = Object.entries(manifest.clips ?? {});
  if (clips.length !== 1) {
    report(`${manifest.assetId} must emit exactly one clip per image`);
    return;
  }

  const [clipName, clip] = clips[0];
  const clipContract = contract.clips[clipName];
  if (clipContract === undefined) {
    report(`${label} uses an unsupported clip '${clipName}'`);
    return;
  }
  if (!clip || typeof clip !== 'object' || typeof clip.fps !== 'number' || typeof clip.loop !== 'boolean') {
    report(`${label} has an invalid clip`);
    return;
  }
  if (clip.fps !== clipContract.fps || clip.loop !== clipContract.loop) {
    report(`${label} clip '${clipName}' declares ${clip.fps}fps/loop=${clip.loop} but the contract fixes ${clipContract.fps}fps/loop=${clipContract.loop}`);
  }

  const expectedFrameCount = clipContract.framesPerDirection;
  for (const direction of directions) {
    const frames = clip.frames?.[direction];
    if (!Array.isArray(frames)) {
      report(`${label} is missing the ${direction} direction`);
      continue;
    }
    if (frames.length !== expectedFrameCount) {
      report(`${label} has ${frames.length} ${direction} frames but clip '${clipName}' declares ${expectedFrameCount}`);
    }
    for (const rect of frames) {
      if (!isFrameRect(rect)) {
        report(`${label} has a malformed ${direction} frame rectangle`);
        continue;
      }
      if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > manifest.widthPx || rect.y + rect.height > manifest.heightPx) {
        report(`${label} has an out-of-bounds ${direction} frame`);
      }
      if (typeof frame === 'object' && frame !== null && (rect.width !== frame.widthPx || rect.height !== frame.heightPx)) {
        report(`${label} has a ${direction} frame of ${rect.width}x${rect.height}, which is not the declared frame size`);
      }
    }
  }

  for (const key of Object.keys(clip.frames ?? {})) {
    if (!directions.includes(key)) report(`${label} declares an unknown direction '${key}'`);
  }
}

async function validateRegistry(atlasDirectory, manifestsByFile, report) {
  const registryPath = path.join(atlasDirectory, 'asset-registry.json');
  if (!existsSync(registryPath)) {
    report('asset-registry.json is missing, so runtime code has no logical-id entry point');
    return;
  }

  const registry = JSON.parse(await readFile(registryPath, 'utf8'));
  if (registry?.schemaVersion !== 1 || !Array.isArray(registry.assets)) {
    report('asset-registry.json has an unsupported schema version or asset list');
    return;
  }

  const registered = new Set();
  for (const entry of registry.assets) {
    if (registered.has(entry?.assetId)) {
      report(`asset-registry.json registers duplicate logical asset id "${entry.assetId}"`);
      continue;
    }
    registered.add(entry?.assetId);

    const manifests = manifestsByFile.get(entry?.manifest);
    if (manifests === undefined) {
      report(`asset-registry.json points "${entry?.assetId}" at ${entry?.manifest}, which is not in this directory`);
      continue;
    }
    const clips = manifests.map((manifest) => Object.keys(manifest.clips ?? {})[0]).sort();
    if (clips.join('|') !== [...(entry.clips ?? [])].sort().join('|')) {
      report(`asset-registry.json lists clips [${entry.clips}] for "${entry.assetId}" but its manifest holds [${clips}]`);
    }
  }

  for (const [file, manifests] of manifestsByFile) {
    const assetId = manifests[0]?.assetId;
    if (typeof assetId === 'string' && !registered.has(assetId)) {
      report(`${file} declares "${assetId}" but asset-registry.json does not register it`);
    }
  }
}

/**
 * @returns {Promise<{ errors: string[], atlasCount: number }>}
 */
export async function validateAtlasDirectory(atlasDirectory, options = {}) {
  const errors = [];
  const report = (message) => errors.push(message);
  const contract = JSON.parse(await readFile(options.contract ?? defaultContractPath, 'utf8'));
  const responseContract = options.contract === undefined
    ? JSON.parse(await readFile(responseContractPath, 'utf8'))
    : contract;
  const searchContract = options.contract === undefined
    ? JSON.parse(await readFile(searchContractPath, 'utf8'))
    : contract;
  const riotContract = options.contract === undefined
    ? JSON.parse(await readFile(riotContractPath, 'utf8'))
    : contract;
  const assaultContract = options.contract === undefined
    ? JSON.parse(await readFile(assaultContractPath, 'utf8'))
    : contract;

  const manifestFiles = options.manifestName
    ? [options.manifestName]
    : (await readdir(atlasDirectory)).filter((name) => name.endsWith('.atlas-manifests.json')).sort();

  if (manifestFiles.length === 0) {
    return { errors: ['no atlas manifest files were found'], atlasCount: 0 };
  }

  const pivots = new Map();
  const assetIdSources = new Map();
  const manifestsByFile = new Map();
  let atlasCount = 0;

  for (const file of manifestFiles) {
    const manifestPath = path.join(atlasDirectory, file);
    if (!existsSync(manifestPath)) {
      report(`${file} does not exist`);
      continue;
    }

    const manifests = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (!Array.isArray(manifests) || manifests.length === 0) {
      report(`${file} must contain at least one clip manifest`);
      continue;
    }
    manifestsByFile.set(file, manifests);

    // Duplicate logical id. `tooling/build-asset-registry.mjs` refuses to
    // *generate* one, but nothing re-checked the generated batch, so a
    // hand-edited or merged manifest could ship two assets under one id.
    const assetId = manifests[0]?.assetId;
    if (typeof assetId === 'string') {
      const previous = assetIdSources.get(assetId);
      if (previous !== undefined) {
        report(`duplicate logical asset id "${assetId}" declared by both ${previous} and ${file}`);
      } else {
        assetIdSources.set(assetId, file);
      }
    }
    if (manifests.some((manifest) => manifest?.assetId !== assetId)) {
      report(`${file} mixes several asset ids in one manifest file`);
    }

    for (const manifest of manifests) {
      const authoredContract = manifest.assetId === 'actor.guard.response' ? responseContract : manifest.assetId === 'actor.guard.search' ? searchContract : manifest.assetId === 'actor.prisoner.riot' ? riotContract : manifest.assetId === 'actor.prisoner.assault' ? assaultContract : contract;
      await validateClipManifest(manifest, { atlasDirectory, contract: authoredContract, report, pivots });
      atlasCount += 1;
    }
  }

  if (options.manifestName === undefined) {
    await validateRegistry(atlasDirectory, manifestsByFile, report);
  }

  return { errors, atlasCount };
}

const isCommandLine = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCommandLine) {
  const options = parseArguments(process.argv.slice(2));
  if (!options.directory) {
    console.error('Usage: node tooling/validate-runtime-atlas.mjs <atlas-directory> [manifest-file] [--contract <path>]');
    process.exit(2);
  }

  const atlasDirectory = path.resolve(options.directory);
  const { errors, atlasCount } = await validateAtlasDirectory(atlasDirectory, {
    contract: options.contract,
    manifestName: options.manifestName,
  });

  if (errors.length > 0) {
    console.error(`Invalid runtime atlas batch in ${atlasDirectory}:`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  console.log(`Validated ${atlasCount} clip atlases in ${atlasDirectory}`);
}
