// Copies only the actual bounded native evidence; full traces stay in scratch.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const record = path.dirname(fileURLToPath(import.meta.url));
const scratchBase = process.env.TEMP;
if (scratchBase === undefined) throw new Error('TEMP is required for the actual evidence scratch directory');
const scratch = path.join(scratchBase, 'lockstate-object-rotation-native-20261003');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const native = path.join(record, 'native');
const manifest = [], geometry = [], pixels = [], cards = [], receipts = [];
for (const stage of ['original', 'negative', 'restored']) {
  const input = path.join(scratch, stage), output = path.join(native, stage);
  fs.mkdirSync(output, { recursive: true });
  for (const entry of fs.readdirSync(input, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const dir = path.join(input, entry.name);
    const locale = fs.readdirSync(dir).some(name => name.startsWith('en-')) ? 'en' : 'pl';
    for (const name of fs.readdirSync(dir)) {
      const selected = name.endsWith('.json') || name.endsWith('armed-q1-fullhd.png') || /q[01]-secondary\d\.png$/.test(name) || name === 'error-context.md';
      if (!selected) continue;
      const outputName = name === 'error-context.md' ? `${locale}-error-context.md` : name;
      const bytes = fs.readFileSync(path.join(dir, name)), relative = `native/${stage}/${outputName}`;
      fs.writeFileSync(path.join(output, outputName), bytes);
      manifest.push({ path: relative, bytes: bytes.length, sha256: hash(bytes) });
      if (!name.endsWith('.json')) continue;
      const value = JSON.parse(bytes.toString('utf8'));
      if (name.endsWith('geometry.json')) geometry.push({ stage, file: relative, ...value });
      if (name.endsWith('secondary-pixels.json')) pixels.push({ stage, file: relative, regions: value });
      if (name.endsWith('all20-cards.json')) cards.push({ stage, file: relative, failed: value.filter(c => !(c.text === c.accessible && c.fits && c.hit && c.top >= 0 && c.bottom <= 1080)) });
      if (name.endsWith('review-receipt.json')) receipts.push({ stage, file: relative, finalOrders: value.whole.construction.orders.length,
        treasury: value.whole.simulation.economy.treasury.balanceMinorUnits, objectCommands: value.commands.filter(c => c.type === 'PlaceObject'),
        trustedClicks: value.trace.clicks.every(c => c.trusted), trustedKeys: value.trace.keys.every(k => k.trusted) });
    }
    const trace = path.join(dir, 'trace.zip');
    if (fs.existsSync(trace)) manifest.push({ scratchOnly: trace, bytes: fs.statSync(trace).size, sha256: hash(fs.readFileSync(trace)) });
  }
}
const logs = ['built', 'built-negative', 'built-restored', 'native-original', 'native-negative', 'native-restored'];
for (const log of logs) {
  const name = `lockstate-object-rotation-review-${log}-20261003.txt`;
  const bytes = fs.readFileSync(path.join(scratchBase, name));
  fs.writeFileSync(path.join(record, 'evidence', `${log}.raw.txt`), bytes);
  manifest.push({ path: `evidence/${log}.raw.txt`, bytes: bytes.length, sha256: hash(bytes) });
}
const compiled = Object.fromEntries(['original', 'negative', 'restored'].map(stage => [stage,
  JSON.parse(fs.readFileSync(path.join(scratch, `${stage}-compiled.json`), 'utf8'))]));
const originalSource = fs.readFileSync(path.join(scratch, 'world-scene.original.bin'));
if (!originalSource.equals(fs.readFileSync(path.join(record, '../../../src/rendering/scene/world-scene.ts')))) throw Error('Scene restoration mismatch');
const result = { sourceSHA: '6edb4f21001d79c8e7adb69a87d746509f048c04', branchStatus: 'UNAPPROVED_DRAFT_NOT_RELEASE', port: 5371,
  buildExits: [0, 0, 0], originalNative: { cases: 2, failed: 2 }, negativeNative: { cases: 1, failed: 1 }, restoredNative: { cases: 2, failed: 2 },
  layoutAccepted: false, keyRChanged: false, sourceRestoredSHA256: hash(originalSource), compiled,
  compiledRestoredByteExact: compiled.restored.every(file => file.sha256 === file.expected), geometry, pixels, cards, receipts, manifest };
fs.writeFileSync(path.join(record, 'native-observed-receipt.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ copiedFiles: manifest.filter(x => x.path).length, receipts, pixelControls: pixels.map(p => ({ stage: p.stage, file: p.file, changed: p.regions.map(r => r.changed) })) }));
