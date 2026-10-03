import { afterEach, expect, it, vi } from 'vitest';
import { createCameraControlsPresentation } from '../../src/ui/hud/renderer-selection-control';

class ElementStub extends EventTarget {
  readonly children: ElementStub[] = []; readonly attributes = new Map<string, string>();
  readonly dataset: Record<string, string> = {}; readonly style: Record<string, string> = {};
  className = ''; textContent = ''; id = ''; hidden = false; removed = false;
  parent: ElementStub | undefined;
  bounds = { right: 0, left: 0, bottom: 0, top: 0, height: 0 };
  readonly selectors = new Map<string, ElementStub>();
  setAttribute(key: string, value: string) { this.attributes.set(key, value); if (key === 'id') this.id = value; }
  append(...nodes: ElementStub[]) { for (const node of nodes) { if (node.parent !== undefined) node.parent.children.splice(node.parent.children.indexOf(node), 1); this.children.push(node); node.parent = this; } }
  focus() { (document as unknown as { activeElement: ElementStub }).activeElement = this; this.dispatchEvent(new Event('focus')); }
  remove() { this.removed = true; if (this.parent !== undefined) this.parent.children.splice(this.parent.children.indexOf(this), 1); }
  querySelector(selector: string) { return this.selectors.get(selector) ?? null; }
  getBoundingClientRect() { return this.bounds; }
}
class ObserverStub {
  static latest: ObserverStub;
  readonly observed: ElementStub[] = []; disconnected = false;
  constructor(readonly callback: () => void) { ObserverStub.latest = this; }
  observe(element: ElementStub) { this.observed.push(element); }
  disconnect() { this.disconnected = true; }
}
afterEach(() => vi.unstubAllGlobals());
function setup(variant: 'disclosure' | 'always', withNotice = false, withCorner = false) {
  const doc = { createElement: () => new ElementStub(), activeElement: new ElementStub(), documentElement: new ElementStub() };
  vi.stubGlobal('document', doc); vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('ResizeObserver', ObserverStub);
  let scale = 1;
  vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => String(scale) }));
  const hud = new ElementStub(), zoom = new ElementStub(), select = new ElementStub(), pan = new ElementStub(), pose = new ElementStub();
  const tabs = new ElementStub(), strip = new ElementStub(), rail = new ElementStub();
  tabs.bounds.right = 180; strip.bounds.bottom = 80; rail.bounds.left = 1100;
  hud.selectors.set('.hud__tabs', tabs); hud.selectors.set('.hud-strip', strip); hud.selectors.set('.hud__rail', rail);
  const notice = new ElementStub(); notice.bounds.bottom = 142;
  if (withNotice) hud.selectors.set('.hud__refusal', notice);
  const corner = new ElementStub();
  if (withCorner) hud.selectors.set('.hud__corner', corner);
  const focus = vi.fn(); const click = vi.fn(); pan.addEventListener('click', click); pose.hidden = true;
  zoom.append(select, pan, pose);
  const view = createCameraControlsPresentation({ variant, viewLabel: 'View', hud: hud as unknown as HTMLElement,
    zoom: zoom as unknown as HTMLElement, select: select as unknown as HTMLElement,
    controls: [pan, pose] as unknown as HTMLElement[], onFocus: focus });
  return { view, panel: view.element as unknown as ElementStub, trigger: view.trigger as unknown as ElementStub | undefined,
    hud, select, pan, pose, zoom, focus, click, tabs, strip, rail, notice, corner, scale: (next: number) => { scale = next; } };
}
it('A reuses original nodes/listeners, transfers keyboard ownership, opens/selects and closes/returns focus', () => {
  const s = setup('disclosure');
  expect(s.panel.children).toEqual([s.select, s.pan, s.pose]); expect(s.pose.hidden).toBe(true);
  expect(s.panel.hidden).toBe(true); s.trigger!.focus(); expect(s.focus).toHaveBeenCalledOnce();
  s.trigger!.dispatchEvent(new Event('click')); expect(s.panel.hidden).toBe(false); expect(document.activeElement).toBe(s.select);
  s.pan.dispatchEvent(new Event('click')); expect(s.click).toHaveBeenCalledOnce();
  const escape = new Event('keydown'); Object.defineProperty(escape, 'key', { value: 'Escape' });
  const stopped = vi.spyOn(escape, 'stopPropagation'); s.panel.dispatchEvent(escape);
  expect(stopped).toHaveBeenCalledOnce(); expect(s.panel.hidden).toBe(true); expect(document.activeElement).toBe(s.trigger);
  expect(s.trigger!.attributes.get('aria-expanded')).toBe('false');
});
it('B keeps the same panel visible without creating a second disclosure or reviving World-hidden pose', () => {
  const s = setup('always'); expect(s.trigger).toBeUndefined(); expect(s.panel.hidden).toBe(false);
  expect(s.panel.children).toEqual([s.select, s.pan, s.pose]); expect(s.zoom.children).toHaveLength(0);
  s.pan.dispatchEvent(new Event('click')); expect(s.click).toHaveBeenCalledOnce(); expect(s.pose.hidden).toBe(true);
});
it.each(['disclosure', 'always'] as const)('%s follows supplied DOM bounds on UI scale/layout and disconnects on destroy', variant => {
  const s = setup(variant), observer = ObserverStub.latest;
  expect(observer.observed).toEqual([s.strip, s.tabs, s.rail, s.panel]);
  expect(s.panel.style).toMatchObject({ left: '192px', top: '92px', width: '396px' });
  s.scale(2); s.tabs.bounds.right = 256; s.strip.bounds.bottom = 259; s.rail.bounds.left = 1192; observer.callback();
  expect(s.panel.style).toMatchObject({ left: '280px', top: '283px', width: '792px' });
  s.rail.bounds.left = 700; window.dispatchEvent(new Event('resize')); expect(s.panel.style.width).toBe('396px');
  s.view.destroy(); expect(observer.disconnected).toBe(true); expect(s.panel.removed).toBe(true);
  const old = s.panel.style.width; s.rail.bounds.left = 600; window.dispatchEvent(new Event('resize')); expect(s.panel.style.width).toBe(old);
});
it.each(['disclosure', 'always'] as const)('%s keeps a visible refusal band above the panel and follows its publication', variant => {
  const s = setup(variant, true), observer = ObserverStub.latest;
  expect(s.panel.style.top).toBe('154px'); expect(observer.observed).toContain(s.notice);
  s.notice.hidden = true; observer.callback(); expect(s.panel.style.top).toBe('92px');
  s.scale(2); s.notice.hidden = false; s.notice.bounds.bottom = 300; observer.callback(); expect(s.panel.style.top).toBe('324px');
});

it('fits the expanded Angled panel beside the unchanged 200% corner when measured vertical space is insufficient', () => {
  const s = setup('disclosure', true, true);
  s.scale(2); s.tabs.bounds.right = 256; s.strip.bounds.bottom = 259; s.notice.bounds.bottom = 332; s.rail.bounds.left = 1192;
  s.corner.bounds = { left: 280, right: 847.34375, top: 552, bottom: 1080, height: 528 };
  s.panel.bounds.height = 258;
  s.trigger!.dispatchEvent(new Event('click'));
  expect(s.panel.style).toMatchObject({ left: '871.34375px', top: '356px', width: '296.65625px' });
  expect(s.zoom.children).toEqual([s.trigger]);
});

it('keeps the ordinary above-corner fit and follows actual World/Angled height changes without moving Zoom', () => {
  const s = setup('disclosure', true, true);
  s.scale(2); s.tabs.bounds.right = 256; s.strip.bounds.bottom = 259; s.notice.bounds.bottom = 332; s.rail.bounds.left = 1192;
  s.corner.bounds = { left: 280, right: 847.34375, top: 552, bottom: 1080, height: 528 };
  s.panel.bounds.height = 146;
  s.trigger!.dispatchEvent(new Event('click'));
  expect(s.panel.style).toMatchObject({ left: '280px', top: '356px', width: '792px' });
  s.panel.bounds.height = 258; s.pose.hidden = false; ObserverStub.latest.callback();
  expect(s.panel.style.left).toBe('871.34375px');
  s.panel.bounds.height = 146; s.pose.hidden = true; ObserverStub.latest.callback();
  expect(s.panel.style).toMatchObject({ left: '280px', top: '356px', width: '792px' });
  expect(s.zoom.children).toEqual([s.trigger]);
});
