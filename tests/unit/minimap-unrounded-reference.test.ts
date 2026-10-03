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
  // Actual Chromium inventory: these are configurable own DATA properties,
  // with no CSSStyleDeclaration prototype accessors. The native destination
  // below models exotic writes; the observer cannot depend on mocked setters.
  class StyleStub {
    left = ''; top = ''; width = ''; height = ''; writes: string[] = [];
    constructor() {
      return new Proxy(this, { set(target, key, value) {
        if (['left','top','width','height'].includes(String(key)) && typeof value === 'string') {
          target.writes.push(`${String(key)}:${value}`);
          value = value === '10.15625%' ? '10.1562%' : value.endsWith('%') ? `${Number(parseFloat(value).toPrecision(6))}%` : value;
        }
        return Reflect.set(target, key, value, target);
      } });
    }
  }
  class ElementStub {
    getterCalls = 0; nativeStyle = new StyleStub();
    classList = { contains: (name: string) => this.viewport && name === 'hud-minimap__viewport' };
    constructor(readonly viewport = true) {}
    get style() { this.getterCalls++; return this.nativeStyle; }
  }
  const node = new ElementStub(), other = new ElementStub(false), observed = {};
  const native = node.nativeStyle;
  Object.defineProperty(native, 'getPropertyValue', { configurable: true, value: function(this: StyleStub, key: string) {
    if (this !== native) throw Error('Illegal native receiver'); return Reflect.get(native, key);
  } });
  vi.stubGlobal('HTMLElement', ElementStub); vi.stubGlobal('CSSStyleDeclaration', StyleStub); vi.stubGlobal('window', observed);
  vi.stubGlobal('document', { querySelector: () => node });
  observeUnroundedMinimapViewport();
  return { style: node.style, native, node, other, read: () => (Reflect.get(observed, 'unroundedMinimapViewport') as () => MinimapViewportPercent)() };
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

it('supports actual own-data-property CSSOM shape and a stable narrow style proxy', () => {
  const h = install();
  expect(Object.getOwnPropertyDescriptor(Object.getPrototypeOf(h.native), 'top')).toBeUndefined();
  expect(Object.getOwnPropertyDescriptor(h.native, 'top')).toMatchObject({ value: '', configurable: true });
  expect(h.node.style).toBe(h.style); expect(h.node.style).not.toBe(h.native);
  expect(h.other.style).toBe(h.other.nativeStyle);
  const before = h.node.getterCalls; void h.node.style; expect(h.node.getterCalls).toBe(before + 1);
});
it('forwards original writes once and binds native CSSOM methods to their original receiver', () => {
  const h = install(); Reflect.set(h.style, 'top', '10.15625%');
  expect(h.native.writes).toEqual(['top:10.15625%']); expect(h.native.top).toBe('10.1562%');
  const method = Reflect.get(h.style, 'getPropertyValue') as (key: string) => string;
  expect(method('top')).toBe('10.1562%'); expect(Reflect.get(h.style, 'getPropertyValue')).toBe(method);
});
