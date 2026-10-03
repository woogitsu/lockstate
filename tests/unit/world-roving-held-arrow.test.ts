import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import type Phaser from 'phaser';
import { afterEach, expect, it, vi } from 'vitest';
import { WorldScene } from '../../src/rendering/scene/world-scene';
import { EMPTY_RENDER_FRAME } from '../../src/rendering/feed/render-feed';
import { WorldRenderView } from '../../src/rendering/world/world-view';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { chunkCoordinate } from '../../src/simulation/world/coordinates';
import type { MinimapView } from '../../src/shared/minimap-view';

const host = vi.hoisted(() => ({ shutdown: undefined as (() => void) | undefined }));
vi.mock('phaser', () => {
  const graphic: object = new Proxy({}, { get: () => () => graphic });
  class Scene {
    readonly cameras = { main: undefined };
    readonly add = { graphics: () => graphic };
    readonly input = { addPointer() {}, on() {} };
    readonly events = { once: (_name: string, callback: () => void) => { host.shutdown = callback; } };
    readonly game = { canvas: new EventTarget() };
  }
  return { default: { Scene, Scenes: { Events: { SHUTDOWN: 'shutdown' } } } };
});

// Installed Phaser Camera math is genuine; only hosting/art work is doubled.
// Actual WorldScene.create listeners, keyboard adapter, update and public
// minimap producer execute. This is source proof, not browser acceptance.
const require = createRequire(import.meta.url);
const phaserSource = resolve(dirname(require.resolve('phaser')), '../src');
const components = require.resolve(resolve(phaserSource, 'gameobjects/components/index.js'));
const cached = require.cache[components];
let Camera: typeof Phaser.Cameras.Scene2D.Camera;
try {
  require.cache[components] = { id: components, filename: components, loaded: true, exports: { FilterList: class {} } } as NodeJS.Module;
  Camera = require(resolve(phaserSource, 'cameras/2d/Camera.js')) as typeof Phaser.Cameras.Scene2D.Camera;
} finally {
  if (cached === undefined) delete require.cache[components]; else require.cache[components] = cached;
}

class FocusNode {
  constructor(readonly radio = false, readonly grouped = false) {}
  readonly tagName = 'BUTTON';
  matches(selector: string): boolean { return this.radio && selector === '[role="radio"]'; }
  closest(selector: string): FocusNode | null { return this.grouped && selector === '[role="radiogroup"]' ? this : null; }
}

afterEach(() => { host.shutdown = undefined; vi.unstubAllGlobals(); });

function setup() {
  const win = new EventTarget();
  const doc = { activeElement: new FocusNode(), querySelector: () => null };
  vi.stubGlobal('window', win); vi.stubGlobal('document', doc); vi.stubGlobal('Element', FocusNode);
  const world = new SparseWorld(32); world.load({ x: chunkCoordinate(0), y: chunkCoordinate(0) });
  const view = WorldRenderView.fromSnapshot(world.snapshot());
  const scene = new WorldScene({ feed: { readFrame: () => ({ ...EMPTY_RENDER_FRAME, revision: 1, world: view }) },
    keyValueStore: { getItem: () => null, setItem: () => undefined } });
  const camera = new Camera(0, 0, 1920, 1080);
  camera.setScroll(64, 64).setZoom(1.25); camera.preRender();
  Reflect.set(scene.cameras, 'main', camera);
  Reflect.set(scene, 'framedOnWorld', true);
  Reflect.set(scene, 'loadActorAtlases', async () => undefined);
  Reflect.set(scene, 'loadEnvironmentArt', async () => undefined);
  scene.create();
  const sink = vi.fn<(value: MinimapView | undefined) => void>();
  scene.setMinimapSink(sink);
  let time = 0;
  const frame = () => { time += 100; scene.update(time, 100); return sink.mock.lastCall![0]!.viewport; };
  const key = (kind: 'keydown' | 'keyup', code: string, repeat = false) => {
    win.dispatchEvent(Object.assign(new Event(kind), { code, repeat }));
  };
  const focus = (node: FocusNode) => {
    doc.activeElement = node;
    const event = new Event('focusin');
    Object.defineProperty(event, 'target', { value: node });
    win.dispatchEvent(event);
  };
  return { scene, frame, key, focus };
}

it('World stops a previously held arrow on grouped radio focus, preserves held WASD and accepts a fresh arrow', () => {
  const h = setup();
  const initial = h.frame();
  h.key('keydown', 'ArrowDown'); h.key('keydown', 'KeyD');
  const moving = h.frame();
  // Independent physical default: 0.6 world units/ms, delta100, zoom1.25,
  // 32 tiles ×64px. No expected value is derived from the producer under test.
  const step = 48 / 2048;
  expect(moving.x - initial.x).toBeCloseTo(step, 10);
  expect(moving.y - initial.y).toBeCloseTo(step, 10);
  h.focus(new FocusNode(true, true));
  const atRadio = h.frame();
  console.log('WORLD_RADIO_FOCUS', JSON.stringify({ initial, moving, atRadio }));
  expect(atRadio.y, 'radio owns an already-held arrow, not merely its next keydown').toBe(moving.y);
  expect(atRadio.x - moving.x, 'unconsumed held KeyD keeps its documented world control').toBeCloseTo(step, 10);
  h.key('keyup', 'KeyD'); h.key('keydown', 'ArrowDown', true);
  expect(h.frame()).toEqual(atRadio);
  h.key('keyup', 'ArrowDown'); h.focus(new FocusNode());
  h.key('keydown', 'ArrowDown');
  const fresh = h.frame();
  expect(fresh.y - atRadio.y).toBeCloseTo(step, 10);
  h.key('keyup', 'ArrowDown'); expect(h.frame()).toEqual(fresh);
});

it('World retains an arrow when focus enters an ordinary HUD button or an ungrouped radio', () => {
  const h = setup(); const initial = h.frame();
  h.key('keydown', 'ArrowDown'); h.focus(new FocusNode());
  const button = h.frame();
  h.focus(new FocusNode(true, false)); const orphan = h.frame();
  expect(button.y - initial.y).toBeCloseTo(48 / 2048, 10);
  expect(orphan.y - button.y).toBeCloseTo(48 / 2048, 10);
  h.key('keyup', 'ArrowDown'); expect(h.frame()).toEqual(orphan);
});

it('World removes its radio ownership listener together with keyboard handlers on shutdown', () => {
  const h = setup(); const initial = h.frame();
  h.key('keydown', 'ArrowDown'); const moving = h.frame();
  expect(moving.y).not.toBe(initial.y);
  host.shutdown!();
  h.focus(new FocusNode(true, true));
  // Call actual update deliberately after shutdown to observe whether a leaked
  // focus listener changed the held adapter. Production no longer renders it.
  expect(h.frame().y - moving.y).toBeCloseTo(48 / 2048, 10);
});
