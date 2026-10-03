import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { observeUnroundedMinimapViewport, minimapGroundReference, type MinimapViewportPercent } from '../browser/minimap-unrounded-reference';

const require = createRequire(import.meta.url);
const phaserSource = resolve(dirname(require.resolve('phaser')), '../src');
const components = require.resolve(resolve(phaserSource, 'gameobjects/components/index.js'));
const previous = require.cache[components];
let Camera: typeof Phaser.Cameras.Scene2D.Camera;
try {
  require.cache[components] = { id: components, filename: components, loaded: true, exports: { FilterList: class {} } } as NodeJS.Module;
  Camera = require(resolve(phaserSource, 'cameras/2d/Camera.js')) as typeof Phaser.Cameras.Scene2D.Camera;
} finally {
  if (previous === undefined) delete require.cache[components]; else require.cache[components] = previous;
}
const source = readFileSync(new URL('../../src/ui/hud/hud.ts', import.meta.url), 'utf8');
const writes = [...source.matchAll(/    const \{ x, y, width, height \} = view.viewport;([\s\S]*?)\r?\n  \}\r?\n  function setMinimapSessionActive/g)];
if (writes.length !== 1) throw Error('Expected one actual HUD viewport assignment block');
const write = new Function('view', 'minimapViewport', `const { x, y, width, height } = view.viewport;${writes[0]![1]}`) as (view: { viewport: { x: number; y: number; width: number; height: number } }, node: { style: object }) => void;

function install() {
  // The exact diagnostic tie is supplied as the known six-digit example;
  // this destination is not a claimed general Chromium serializer.
  class StyleStub { values: Record<string, string> = {}; writes: string[] = []; }
  for (const field of ['left', 'top', 'width', 'height']) Object.defineProperty(StyleStub.prototype, field, {
    configurable: true, get(this: StyleStub) { return this.values[field] ?? ''; },
    set(this: StyleStub, value: string) { this.writes.push(`${field}:${value}`); this.values[field] = value === '10.15625%' ? '10.1562%' : value.endsWith('%') ? `${Number(parseFloat(value).toPrecision(6))}%` : value; },
  });
  const style = new StyleStub();
  const observed = {};
  vi.stubGlobal('CSSStyleDeclaration', StyleStub); vi.stubGlobal('window', observed);
  vi.stubGlobal('document', { querySelector: () => ({ style }) });
  observeUnroundedMinimapViewport();
  return { style, read: () => (Reflect.get(observed, 'unroundedMinimapViewport') as () => MinimapViewportPercent)() };
}
afterEach(() => vi.unstubAllGlobals());

for (const zoom of [1, 1.25]) for (const cssRatio of [1, 2]) for (const offset of [0, 140]) {
  it(`original HUD assignment reference matches real Camera four corners at zoom${zoom}, CSS ratio${cssRatio}, offset${offset}`, () => {
    const h = install();
    const camera = new Camera(0, 0, 1920, 1080); camera.setScroll(100, 100).setZoom(zoom); camera.preRender();
    const topLeft = camera.getWorldPoint(0, 0), bottomRight = camera.getWorldPoint(1920, 1080);
    write({ viewport: { x: topLeft.x / 2048, y: topLeft.y / 2048, width: (bottomRight.x - topLeft.x) / 2048, height: (bottomRight.y - topLeft.y) / 2048 } }, { style: h.style });
    expect(h.style.writes).toHaveLength(4);
    const reference = minimapGroundReference({ width: 1920, height: 1080, left: offset, top: offset, widthCss: 1920 / cssRatio, heightCss: 1080 / cssRatio }, { width: 32, height: 32 }, h.read());
    for (const [x, y] of [[16,8],[20,8],[20,15],[16,15]]) {
      const point = camera.matrixCombined.transformPoint(x! * 64, y! * 64);
      const expected = { x: offset + point.x / cssRatio, y: offset + point.y / cssRatio };
      const actual = reference.screen(x!, y!);
      expect(actual.x).toBeCloseTo(expected.x, 3); expect(actual.y).toBeCloseTo(expected.y, 3);
      // Bad old raw-scroll forward reader is rejected at the same precision;
      // zoom1 remains a legal control where both formulas agree.
      const wrong = { x: offset + (x! * 64 - camera.scrollX) * zoom / cssRatio, y: offset + (y! * 64 - camera.scrollY) * zoom / cssRatio };
      if (zoom === 1) { expect(wrong.x).toBeCloseTo(actual.x, 3); expect(wrong.y).toBeCloseTo(actual.y, 3); }
      else { expect(Math.abs(wrong.x - actual.x)).toBeGreaterThan(0.0005); expect(Math.abs(wrong.y - actual.y)).toBeGreaterThan(0.0005); }
    }
  });
}
it('preserves the original percentage and demonstrates the exact observed 0.00128px quantization error', () => {
  const h = install();
  write({ viewport: { x: 0.1, y: 208 / 2048, width: 1536 / 2048, height: 864 / 2048 } }, { style: h.style });
  expect(h.style.writes[1]).toBe('top:10.15625%');
  expect(Reflect.get(h.style, 'top')).toBe('10.1562%');
  expect(h.read().top).toBe(10.15625);
  const canvas = { width: 1920, height: 1080, left: 0, top: 0, widthCss: 1920, heightCss: 1080 };
  const reference = minimapGroundReference(canvas, { width: 32, height: 32 }, h.read());
  const quantized = { ...h.read(), top: parseFloat(Reflect.get(h.style, 'top') as string) };
  const rounded = minimapGroundReference(canvas, { width: 32, height: 32 }, quantized);
  expect(reference.screen(16,8).y).toBe(380);
  expect(rounded.screen(16,8).y).toBe(380.00128000000007);
  expect(Math.abs(rounded.screen(16,8).y - reference.screen(16,8).y)).toBeGreaterThan(0.0005);
});
it('refuses an absent channel instead of guessing a camera origin', () => {
  const h = install(); expect(h.read).toThrow('No complete existing minimap viewport assignment observed');
});
it('refuses overwritten non-percent values instead of retaining stale percent observations', () => {
  const h = install(); write({ viewport: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 } }, { style: h.style });
  Reflect.set(h.style, 'top', '3px'); expect(h.read).toThrow('No complete existing minimap viewport assignment observed');
});
