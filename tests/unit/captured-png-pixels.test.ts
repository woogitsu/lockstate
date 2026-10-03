import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import { countCapturedPalettePixels, type CapturedPaletteSample } from '../browser/captured-png-pixels';

const requirePlaywright = createRequire(createRequire(import.meta.url).resolve('@playwright/test'));
const { PNG } = requirePlaywright('playwright-core/lib/utilsBundle') as {
  PNG: { sync: { write(image: { width: number; height: number; data: Buffer; gamma?: number }): Buffer } };
};
const fixtureRoot = new URL('../fixtures/captured-model-pngs-20261003/', import.meta.url);
const captures = JSON.parse(readFileSync(new URL('manifest.json', fixtureRoot), 'utf8')) as {
  file: string; sha256: string; samples: CapturedPaletteSample[];
  independentPillowCounts: number[]; recordedBrowserCounts: number[] | null;
}[];

it.each(captures)('retains exact captured PNG/hash and palette counts for $file', capture => {
  const png = readFileSync(new URL(capture.file, fixtureRoot));
  expect(createHash('sha256').update(png).digest('hex')).toBe(capture.sha256);
  const counts = countCapturedPalettePixels(png, capture.samples);
  expect(counts).toEqual(capture.independentPillowCounts);
  if (capture.recordedBrowserCounts !== null) expect(counts).toEqual(capture.recordedBrowserCounts);
});

const sample: CapturedPaletteSample = { rect: [0, 0, 2, 2], colour: [20, 30, 40] };
function tinyPng(alpha = 255, gamma?: number): Buffer {
  return PNG.sync.write({ width: 2, height: 2, data: Buffer.from([
    20, 30, 40, alpha, 20, 30, 41, 255,
    20, 31, 40, 255, 21, 30, 40, 255,
  ]), ...(gamma === undefined ? {} : { gamma }) });
}

it('requires all three exact channels and keeps caller rectangles unchanged', () => {
  expect(countCapturedPalettePixels(tinyPng(), [sample, { rect: [1, 0, 1, 1], colour: [20, 30, 41] }])).toEqual([1, 1]);
  expect(countCapturedPalettePixels(tinyPng(), [{ rect: [0, 1, 2, 1], colour: sample.colour }])).toEqual([0]);
});
it('rejects alpha that would require browser canvas compositing', () => {
  expect(() => countCapturedPalettePixels(tinyPng(254), [sample])).toThrow(/opaque/);
  expect(() => countCapturedPalettePixels(tinyPng(0), [sample])).toThrow(/opaque/);
});
it('rejects a valid gamma-tagged PNG instead of assuming browser colour equivalence', () => {
  const png = tinyPng(255, 1);
  expect(png.includes(Buffer.from('gAMA'))).toBe(true);
  expect(() => countCapturedPalettePixels(png, [sample])).toThrow(/metadata: gAMA/);
});
it.each([
  [-1, 0, 1, 1], [0, -1, 1, 1], [1, 0, 2, 1], [0, 1, 1, 2],
  [0, 0, 0, 1], [0, 0, 1, 0], [0.5, 0, 1, 1], [NaN, 0, 1, 1], [0, 0, Infinity, 1],
])('rejects out-of-bounds or invalid caller rectangle %j', (...rect) => {
  expect(() => countCapturedPalettePixels(tinyPng(), [{ rect: rect as [number, number, number, number], colour: sample.colour }])).toThrow(/rectangle/);
});
it.each([[NaN, 0, 0], [-1, 0, 0], [256, 0, 0], [0.5, 0, 0]])('rejects invalid RGB %j', (...colour) => {
  expect(() => countCapturedPalettePixels(tinyPng(), [{ rect: sample.rect, colour: colour as [number, number, number] }])).toThrow(/RGB bytes/);
});
it('rejects an empty sample list', () => {
  expect(() => countCapturedPalettePixels(tinyPng(), [])).toThrow(/At least one/);
});
it('rejects malformed, truncated, trailing and corrupted PNG buffers', () => {
  const good = tinyPng(), corrupted = Buffer.from(good);
  corrupted[29] = corrupted[29]! ^ 1; // IHDR CRC, without changing image channels.
  for (const png of [Buffer.alloc(0), Buffer.from('not a PNG'), good.subarray(0, 40),
    good.subarray(0, good.length - 1), Buffer.concat([good, Buffer.from([0])]), corrupted]) {
    expect(() => countCapturedPalettePixels(png, [sample])).toThrow();
  }
});
