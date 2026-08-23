import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const sourceDir = path.join(root, 'assets/source/generated');
const outputDir = path.join(root, 'public/game-content/source-art');
const outputManifest = path.join(root, 'public/game-content/source-art.v1.json');
const intake = JSON.parse(await readFile(path.join(sourceDir, 'manifest.json'), 'utf8'));
if (intake.schemaVersion !== 1 || !Array.isArray(intake.entries)) throw new Error('Invalid source-art intake manifest.');

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
