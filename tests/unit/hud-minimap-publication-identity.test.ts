import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type { MinimapView } from '../../src/shared/minimap-view';
import { HUD_MESSAGE_KEY } from '../../src/ui/hud/messages';

// Run the actual enclosed consumer, as minimap-unrounded-reference does.
// Node has no browser DOM. This explicit port implements textContent's
// replace-all child identity semantics; it is not native performance evidence.
const source = readFileSync(new URL('../../src/ui/hud/hud.ts', import.meta.url), 'utf8');
const enclosed = source.match(/  function updateMinimap\(view: MinimapView \| undefined\): void \{([\s\S]*?)\r?\n  const alertList =/);
if (enclosed === null) throw Error('Actual minimap consumer/session/click absent');
const executable = (`function updateMinimap(view) {${enclosed[1]}`)
  .replace('function setMinimapSessionActive(active: boolean): void', 'function setMinimapSessionActive(active)')
  .replace('(event: MouseEvent)', '(event)');

class TextChild { constructor(readonly data: string) {} }
class Placeholder {
  childNodes: TextChild[] = [];
  readonly classes = new Set<string>();
  readonly classList = { toggle: (key: string, enabled: boolean) => { if (enabled) this.classes.add(key); else this.classes.delete(key); } };
  get textContent(): string { return this.childNodes.map(node => node.data).join(''); }
  set textContent(value: string) { this.childNodes = value === '' ? [] : [new TextChild(value)]; }
}
function setup() {
  const placeholder = new Placeholder();
  const draws: unknown[][] = [];
  const canvas = { hidden: false, width: 0, height: 0, getContext: () => ({ fillStyle: '', fillRect: (...values: unknown[]) => draws.push(values) }) };
  const viewport = { hidden: false, style: { left: '', top: '', width: '', height: '' } };
  const surface = Object.assign(new EventTarget(), { disabled: false, getBoundingClientRect: () => ({ left: 100, top: 200, width: 200, height: 100 }) });
  let locale = 'en';
  const navigations: unknown[] = [];
  const factory = new Function('minimapCanvas', 'minimapViewport', 'minimapPlaceholder', 'minimapSurface', 't', 'HUD_MESSAGE_KEY', 'options', `let lastMinimapPixels; let currentMinimapView; let hasActivePrison=true; const minimapPalette=['#16232b','#607569','#89a76b','#b89468','#3c7990','#34424d']; ${executable}; return {updateMinimap,setMinimapSessionActive};`);
  const consumer = factory(canvas, viewport, placeholder, surface, (key: string) => `${locale}:${key}`, HUD_MESSAGE_KEY, { onMinimapNavigate: (point: unknown) => { navigations.push(point); return true; } }) as { updateMinimap(view: MinimapView | undefined): void; setMinimapSessionActive(active: boolean): void };
  return { ...consumer, canvas, viewport, placeholder, surface, draws, navigations, locale: (value: string) => { locale = value; }, click: (detail: number, clientX = 0, clientY = 0) => surface.dispatchEvent(Object.assign(new Event('click'), { detail, clientX, clientY })) };
}
const view = (): MinimapView => ({ width: 2, height: 2, pixels: new Uint8Array([0, 1, 2, 5]), viewport: { x: .1, y: .2, width: .3, height: .4 } });

it('keeps the actual placeholder child on 120 identical publications without repainting cached pixels', () => {
  const h = setup(), initial = view(); h.updateMinimap(initial);
  const child = h.placeholder.childNodes[0];
  for (let i = 0; i < 120; i++) h.updateMinimap({ ...initial });
  expect(h.placeholder.childNodes[0]).toBe(child);
  expect(h.placeholder.textContent).toBe(`en:${HUD_MESSAGE_KEY.minimapMapReady}`);
  expect(h.draws).toHaveLength(4);
});
it('keeps the empty-prison child on repeated inactive publications', () => {
  const h = setup(); h.setMinimapSessionActive(false); const child = h.placeholder.childNodes[0];
  h.updateMinimap(view()); h.updateMinimap(undefined); h.setMinimapSessionActive(false);
  expect(h.placeholder.childNodes[0]).toBe(child);
  expect(h.placeholder.textContent).toBe(`en:${HUD_MESSAGE_KEY.minimapNoPrison}`);
  expect(h.canvas.hidden).toBe(true); expect(h.surface.disabled).toBe(true); expect(h.draws).toHaveLength(0);
});
it('updates viewport and clipping with unchanged pixels, without treating pose as text or terrain change', () => {
  const h = setup(), initial = view(); h.updateMinimap(initial); const child = h.placeholder.childNodes[0];
  h.updateMinimap({ ...initial, viewport: { x: -.1, y: .8, width: .5, height: .4 } });
  expect(h.viewport.style.left).toBe('0%'); expect(h.viewport.style.top).toBe('80%');
  expect(parseFloat(h.viewport.style.width)).toBeCloseTo(40); expect(parseFloat(h.viewport.style.height)).toBeCloseTo(20);
  expect(h.placeholder.childNodes[0]).toBe(child); expect(h.draws).toHaveLength(4);
  h.updateMinimap({ ...initial, viewport: { x: 2, y: 2, width: .1, height: .1 } }); expect(h.viewport.hidden).toBe(true);
});
it('replaces text for locale/status changes and repaints actual fresh-world pixels after session reset', () => {
  const h = setup(), initial = view(); h.updateMinimap(initial); const child = h.placeholder.childNodes[0];
  h.locale('pl'); h.updateMinimap(initial); expect(h.placeholder.childNodes[0]).not.toBe(child);
  expect(h.placeholder.textContent).toBe(`pl:${HUD_MESSAGE_KEY.minimapMapReady}`);
  h.setMinimapSessionActive(false); expect(h.placeholder.textContent).toBe(`pl:${HUD_MESSAGE_KEY.minimapNoPrison}`);
  h.setMinimapSessionActive(true); expect(h.draws).toHaveLength(8); expect(h.canvas.hidden).toBe(false);
  h.updateMinimap({ ...initial, pixels: new Uint8Array([3, 3, 3, 3]) }); expect(h.draws).toHaveLength(12);
  h.updateMinimap(undefined); expect(h.placeholder.textContent).toBe(`pl:${HUD_MESSAGE_KEY.minimapPlaceholder}`);
});
it('preserves native-button keyboard/pointer routing and inactive refusal', () => {
  const h = setup(); h.updateMinimap(view()); h.click(0); h.click(1, 150, 275);
  expect(h.navigations).toEqual([{ fx: .5, fy: .5 }, { fx: .25, fy: .75 }]);
  h.setMinimapSessionActive(false); h.click(0); expect(h.navigations).toHaveLength(2);
});
it('preserves navigable placeholder feedback then restores current publication status', () => {
  const h = setup(); h.updateMinimap(undefined); h.click(0);
  expect(h.placeholder.textContent).toBe(`en:${HUD_MESSAGE_KEY.minimapNavigable}`);
  h.updateMinimap(undefined); expect(h.placeholder.textContent).toBe(`en:${HUD_MESSAGE_KEY.minimapPlaceholder}`);
});
