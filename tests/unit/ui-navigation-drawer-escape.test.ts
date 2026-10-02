import { afterEach, expect, it, vi } from 'vitest';
import { createHudLayoutShell } from '../../src/ui/hud/layout-shell';
import { DEFAULT_LAYOUT_SETTINGS } from '../../src/input/layout-preference';
import { ObliqueWorldScene } from '../../src/rendering/scene/oblique-world-scene';
import { EMPTY_RENDER_FRAME } from '../../src/rendering/feed/render-feed';
import type { HudLocalizer } from '../../src/ui/hud/view-model';

const input = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => void>() }));
vi.mock('phaser', () => {
  const graphics = { setScrollFactor() { return this; }, setDepth() { return this; }, clear() {},
    fillStyle() {}, lineStyle() {}, strokeRect() {}, fillRect() {}, lineBetween() {} };
  class Scene {
    readonly cameras = { main: { width: 960, height: 540, setBackgroundColor() {} } };
    readonly add = { graphics: () => graphics };
    readonly input = { mouse: { disableContextMenu() {} }, addPointer() {},
      on: (name: string, handler: (...args: unknown[]) => void) => input.handlers.set(name, handler) };
    readonly events = { once() {} };
    readonly game = { canvas: new EventTarget() };
  }
  return { default: { Scene, Scenes: { Events: { SHUTDOWN: 'shutdown' } } } };
});
// Resize/paint are outside this keyboard diagnostic; the real shell still
// resolves its supported geometry and registers the actual drawer handler.
vi.mock('../../src/ui/primitives/resize-separator', async (original) => ({
  ...await original<typeof import('../../src/ui/primitives/resize-separator')>(), createResizeSeparator: () => ({
  element: document.createElement('div'), setRange() {}, setSize() {}, destroy() {},
}) }));
vi.mock('../../src/ui/primitives/icon', () => ({ createIcon: () => document.createElement('span') }));

class NodeStub extends EventTarget {
  readonly children: NodeStub[] = [];
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly style = { setProperty() {}, removeProperty() {} };
  readonly classList = { add() {}, remove() {}, toggle() {} };
  hidden = false;
  parentNode: NodeStub | undefined;
  className = '';
  textContent = '';
  value = '';
  disabled = false;
  constructor(readonly tagName = 'DIV') { super(); }
  append(...nodes: NodeStub[]): void { this.children.push(...nodes); nodes.forEach(node => { node.parentNode = this; }); }
  prepend(...nodes: NodeStub[]): void { this.children.unshift(...nodes); nodes.forEach(node => { node.parentNode = this; }); }
  setAttribute(key: string, value: string): void { this.attributes.set(key, value); }
  getAttribute(key: string): string | null { return this.attributes.get(key) ?? null; }
  removeAttribute(key: string): void { this.attributes.delete(key); }
  remove(): void {}
  contains(node: unknown): boolean { return node === this || this.children.some(child => child.contains(node)); }
  querySelector(): null { return null; }
  getBoundingClientRect(): { height: number } { return { height: 206 }; }
  focus(): void { Reflect.set(document, 'activeElement', this); }
}
class KeyFlow extends Event {
  readonly key = 'Escape';
  readonly code = 'Escape';
  stopped = false;
  constructor() { super('keydown', { bubbles: true, cancelable: true }); }
  override stopPropagation(): void { this.stopped = true; super.stopPropagation(); }
}
afterEach(() => { input.handlers.clear(); vi.unstubAllGlobals(); });

async function setup() {
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', {
    activeElement: null, querySelector: () => null, createTextNode: () => new NodeStub('#text'),
    createElement: (tag: string) => new NodeStub(tag.toUpperCase()),
  });
  const root = new NodeStub(); const navigation = new NodeStub(); const section = new NodeStub('BUTTON');
  navigation.append(section);
  const shell = createHudLayoutShell({
    root: root as unknown as HTMLElement, settings: DEFAULT_LAYOUT_SETTINGS,
    localizer: { format: (key: string) => key } as unknown as HudLocalizer,
    navigation: { container: navigation as unknown as HTMLElement, content: [section as unknown as HTMLElement] },
    inspector: { container: new NodeStub() as unknown as HTMLElement, content: [] },
    metrics: { container: new NodeStub() as unknown as HTMLElement, content: [] },
    inspectorSheet: new NodeStub() as unknown as HTMLElement, strip: new NodeStub() as unknown as HTMLElement,
    onChange: () => undefined, measureViewport: () => ({ width: 960, height: 540, uiScale: 2 }),
  });
  let armed = true;
  const standDown = vi.fn(() => { armed = false; });
  const scene = new ObliqueWorldScene({
    feed: { readFrame: () => EMPTY_RENDER_FRAME },
    keyValueStore: { getItem: () => null, setItem: () => undefined }, toolStandDown: { standDown },
  });
  Reflect.set(scene, 'loadCatalogTextures', async () => undefined);
  Reflect.set(scene, 'loadFloorTextures', async () => undefined);
  Reflect.set(scene, 'repaint', () => undefined);
  scene.create(); await scene.ready();
  const trigger = shell.controls[1] as unknown as NodeStub;
  function escape(target: NodeStub): KeyFlow {
    const event = new KeyFlow();
    // Node has no DOM bubbling. Model only delivery order; all registered
    // handlers and their cancellation/stand-down behavior are production code.
    target.dispatchEvent(event);
    if (!event.stopped) window.dispatchEvent(event);
    window.dispatchEvent(Object.assign(new Event('keyup'), { code: 'Escape' }));
    return event;
  }
  return { root, navigation, section, trigger, shell, standDown, escape, armed: () => armed };
}

it('navigation drawer Escape closes and returns focus without reaching armed world Build', async () => {
  const actual = await setup();
  expect(actual.root.dataset['layoutNavigationPlacement']).toBe('drawer');
  actual.trigger.dispatchEvent(new Event('click'));
  expect(actual.root.dataset['navigationDrawerOpen']).toBe('true');
  actual.section.focus();
  const event = actual.escape(actual.navigation);
  expect(event.defaultPrevented).toBe(true);
  expect(actual.root.dataset['navigationDrawerOpen']).toBe('false');
  expect(document.activeElement).toBe(actual.trigger);
  expect(actual.armed()).toBe(true);
  expect(actual.standDown).not.toHaveBeenCalled();
  actual.shell.destroy();
});

it('ordinary Escape after drawer closure still reaches world Build stand-down', async () => {
  const actual = await setup();
  actual.escape(actual.navigation);
  expect(actual.armed()).toBe(false);
  expect(actual.standDown).toHaveBeenCalledOnce();
  actual.shell.destroy();
});

it('the existing Layout menu Escape already owns cancellation before the world listener', async () => {
  const actual = await setup();
  actual.shell.controls[4]!.dispatchEvent(new Event('click'));
  const event = actual.escape(actual.shell.menu as unknown as NodeStub);
  expect(event.defaultPrevented).toBe(true);
  expect(actual.armed()).toBe(true);
  expect(actual.standDown).not.toHaveBeenCalled();
  actual.shell.destroy();
});
