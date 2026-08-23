import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const directions = ['south', 'southWest', 'west', 'northWest', 'north', 'northEast', 'east', 'southEast'];

function fail(message) {
  throw new Error(`Invalid runtime atlas: ${message}`);
}

function readPngSize(buffer, imagePath) {
  const pngSignature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== pngSignature) {
    fail(`${imagePath} is not a PNG`);
  }
  if (buffer.subarray(12, 16).toString('ascii') !== 'IHDR') {
    fail(`${imagePath} has no IHDR chunk`);
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function isFrame(value) {
  return typeof value === 'object' && value !== null
    && Number.isInteger(value.x) && Number.isInteger(value.y)
    && Number.isInteger(value.width) && Number.isInteger(value.height);
}

async function validateManifest(manifest, atlasDirectory) {
  if (manifest?.schemaVersion !== 1 || typeof manifest.assetId !== 'string') {
    fail('manifest has an unsupported schema version or asset id');
  }
  if (!Array.isArray(manifest.directions) || manifest.directions.join('|') !== directions.join('|')) {
    fail(`${manifest.assetId} has a non-canonical direction order`);
  }
  if (!Number.isInteger(manifest.widthPx) || !Number.isInteger(manifest.heightPx)) {
    fail(`${manifest.assetId} has invalid atlas dimensions`);
  }
  const imagePath = path.join(atlasDirectory, manifest.image);
  const image = await readFile(imagePath);
  const imageSize = readPngSize(image, manifest.image);
  if (imageSize.width !== manifest.widthPx || imageSize.height !== manifest.heightPx) {
    fail(`${manifest.image} dimensions do not match its manifest`);
  }
  const clips = Object.entries(manifest.clips ?? {});
  if (clips.length !== 1) {
    fail(`${manifest.assetId} must emit exactly one clip per image`);
  }
  const [clipName, clip] = clips[0] ?? [];
  if (!clip || typeof clip !== 'object' || typeof clip.fps !== 'number' || typeof clip.loop !== 'boolean') {
    fail(`${manifest.image} has an invalid clip`);
  }
  const expectedFrameCount = clipName === 'walk' ? 8 : clipName === 'idle' ? 1 : 0;
  if (expectedFrameCount === 0) {
    fail(`${manifest.image} uses an unsupported clip '${clipName}'`);
  }
  for (const direction of directions) {
    const frames = clip.frames?.[direction];
    if (!Array.isArray(frames) || frames.length !== expectedFrameCount) {
      fail(`${manifest.image} has invalid ${direction} frames`);
    }
    for (const frame of frames) {
      if (!isFrame(frame) || frame.x < 0 || frame.y < 0
        || frame.x + frame.width > manifest.widthPx || frame.y + frame.height > manifest.heightPx) {
        fail(`${manifest.image} has an out-of-bounds ${direction} frame`);
      }
    }
  }
}

const [atlasDirectoryArgument, manifestName] = process.argv.slice(2);
if (!atlasDirectoryArgument) {
  console.error('Usage: node tooling/validate-runtime-atlas.mjs <atlas-directory>');
  process.exit(2);
}
const atlasDirectory = path.resolve(atlasDirectoryArgument);
const manifestFiles = manifestName
  ? [manifestName]
  : (await readdir(atlasDirectory)).filter((name) => name.endsWith('.atlas-manifests.json')).sort();
if (manifestFiles.length === 0) {
  fail('no atlas manifest files were found');
}
let atlasCount = 0;
for (const file of manifestFiles) {
  const manifestPath = path.join(atlasDirectory, file);
  await stat(manifestPath);
  const manifests = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (!Array.isArray(manifests) || manifests.length === 0) {
    fail(`${file} must contain at least one clip manifest`);
  }
  await Promise.all(manifests.map((manifest) => validateManifest(manifest, atlasDirectory)));
  atlasCount += manifests.length;
}
console.log(`Validated ${atlasCount} clip atlases in ${atlasDirectory}`);
