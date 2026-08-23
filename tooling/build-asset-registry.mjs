import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const [directoryArgument] = process.argv.slice(2);
if (!directoryArgument) {
  console.error('Usage: node tooling/build-asset-registry.mjs <atlas-directory>');
  process.exit(2);
}

const directory = path.resolve(directoryArgument);
const manifestFiles = (await readdir(directory))
  .filter((name) => name.endsWith('.atlas-manifests.json'))
  .sort();
const entries = [];
for (const filename of manifestFiles) {
  const clips = JSON.parse(await readFile(path.join(directory, filename), 'utf8'));
  if (!Array.isArray(clips) || clips.length === 0 || typeof clips[0]?.assetId !== 'string') {
    throw new Error(`Cannot register malformed atlas manifest: ${filename}`);
  }
  const assetId = clips[0].assetId;
  if (clips.some((clip) => clip.assetId !== assetId)) {
    throw new Error(`Atlas manifest contains multiple asset IDs: ${filename}`);
  }
  entries.push({ assetId, manifest: filename, clips: clips.map((clip) => Object.keys(clip.clips)[0]).sort() });
}
entries.sort((left, right) => left.assetId.localeCompare(right.assetId));
if (new Set(entries.map((entry) => entry.assetId)).size !== entries.length) {
  throw new Error('Asset registry cannot contain duplicate asset IDs.');
}
const registry = { schemaVersion: 1, assets: entries };
await writeFile(path.join(directory, 'asset-registry.json'), `${JSON.stringify(registry, null, 2)}\n`);
console.log(`Wrote asset registry for ${entries.length} assets.`);
