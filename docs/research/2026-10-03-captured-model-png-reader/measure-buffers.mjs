import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { countCapturedPalettePixels } from '../../../tests/browser/captured-png-pixels.ts';

const fixtures = new URL('../../../tests/fixtures/captured-model-pngs-20261003/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', fixtures), 'utf8'));
// File I/O and module startup happen before timing. Only the SAME in-memory
// buffers' PNG validation/decode/opacity check/exact RGB sampling are measured.
const captures = manifest.map(capture => ({ capture, buffer: readFileSync(new URL(capture.file, fixtures)) }));
const results = [];
for (let round = 0; round < 3; round += 1) {
  for (const { capture, buffer } of captures) {
    const start = performance.now();
    const counts = countCapturedPalettePixels(buffer, capture.samples);
    const milliseconds = performance.now() - start;
    if (JSON.stringify(counts) !== JSON.stringify(capture.independentPillowCounts)) throw Error(`Changed counts: ${capture.file}`);
    results.push({ round, file: capture.file, milliseconds, counts });
  }
}
const ordered = results.map(result => result.milliseconds).sort((a, b) => a - b);
process.stdout.write(JSON.stringify({
  node: process.version, platform: process.platform, captures: 12, rounds: 3,
  measuredOperation: 'in-memory PNG validation/decode/opacity/exact RGB sampling only',
  excludes: ['file I/O', 'module startup', 'browser', 'screenshot capture', 'worker/construction', 'full suite duration'],
  minMs: ordered[0], medianMs: (ordered[17] + ordered[18]) / 2, maxMs: ordered.at(-1), results,
}, null, 2) + '\n');
