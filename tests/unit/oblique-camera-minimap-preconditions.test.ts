import { afterEach, expect, it, vi } from 'vitest';
import { ObliqueWorldScene } from '../../src/rendering/scene/oblique-world-scene';
import { EMPTY_RENDER_FRAME } from '../../src/rendering/feed/render-feed';
import { WorldRenderView } from '../../src/rendering/world/world-view';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { chunkCoordinate } from '../../src/simulation/world/coordinates';
import type { MinimapView } from '../../src/shared/minimap-view';
import { parseMinimapCameraObservation } from '../browser/minimap-camera-observation';

vi.mock('phaser', () => {
  const graphic = { setScrollFactor() { return this; }, setDepth() { return this; }, clear() {} };
  class Scene {
    cameras = { main: { width: 1920, height: 1080, setBackgroundColor() {} } };
    add = { graphics: () => graphic };
    input = { mouse: { disableContextMenu() {} }, addPointer() {}, on() {} };
    events = { once() {} }; game = { canvas: new EventTarget() };
  }
  return { default: { Scene, Scenes: { Events: { SHUTDOWN: 'shutdown' } } } };
});
afterEach(() => vi.unstubAllGlobals());

it('reads the original CI held-arrow movement despite the reported identical map PNGs', () => {
  // Exact published CSS nodes from before/after the same screenshot operation
  // in artifact11245699264; not values read from a ghost or a camera transform.
  const before = parseMinimapCameraObservation(['0%', '5.51475%', '94.4853%', '94.4853%']);
  const after = parseMinimapCameraObservation(['0%', '9.421%', '90.579%', '90.579%']);
  expect(after).not.toEqual(before);
  expect(after.top - before.top).toBeCloseTo(3.90625, 6);
});

it.each([
  ['', '0%', '100%', '100%'],
  ['0%', '0px', '100%', '100%'],
  ['0%', 'NaN%', '100%', '100%'],
  ['0%', '0%', '100%'],
].map(values => ({ values })))('rejects unpublished or invalid independent camera observation %j', ({ values }) => {
  expect(() => parseMinimapCameraObservation(values)).toThrow();
});

class FocusNode {
  constructor(readonly tagName: string, readonly radio = false) {}
  matches(selector: string): boolean { return this.radio && selector === '[role="radio"]'; }
  closest(selector: string): FocusNode | null { return this.radio && selector === '[role="radiogroup"]' ? this : null; }
}

it.each([16, 240])('actual registered world arrow publishes movement and radio focus stops it, delta%d', async delta => {
  const handlers = new Map<string, EventListener>();
  const button = new FocusNode('BUTTON'), radio = new FocusNode('BUTTON', true);
  const doc = { activeElement: button, querySelector: () => null };
  vi.stubGlobal('Element', FocusNode);
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', {
    addEventListener: (name: string, handler: EventListener) => handlers.set(name, handler),
    removeEventListener() {},
  });
  const world = new SparseWorld(32); world.load({ x: chunkCoordinate(0), y: chunkCoordinate(0) });
  const view = WorldRenderView.fromSnapshot(world.snapshot());
  const scene = new ObliqueWorldScene({
    feed: { readFrame: () => ({ ...EMPTY_RENDER_FRAME, revision: 1, world: view }) },
    keyValueStore: { getItem: () => null, setItem: () => undefined },
  });
  // Engine hosting/art work is doubled; actual input, pose update and minimap
  // producer run unchanged. This is source proof, not native pixel acceptance.
  Reflect.set(scene, 'loadCatalogTextures', async () => undefined);
  Reflect.set(scene, 'loadFloorTextures', async () => undefined);
  Reflect.set(scene, 'repaint', () => undefined);
  scene.create(); await scene.ready();
  scene.restoreCameraView({ centre: { x: 1024, y: 1024 }, zoom: 1.25 });
  const sink = vi.fn<(value: MinimapView | undefined) => void>();
  scene.setMinimapSink(sink); scene.update(0, 0);
  const initial = sink.mock.lastCall![0]!.viewport;
  const key = (name: 'keydown' | 'keyup') => handlers.get(name)!({ code: 'ArrowDown' } as KeyboardEvent);
  key('keydown'); scene.update(delta, delta);
  const moving = sink.mock.lastCall![0]!.viewport;
  // Solve the view plane basis independently: a screen-down movement s at
  // yaw-45/elevation45 has world x=-s/zoom, y=+s/zoom.
  const shift = 0.6 * delta / 1.25 / (32 * 64);
  expect(moving.x).toBeCloseTo(initial.x - shift, 10);
  expect(moving.y).toBeCloseTo(initial.y + shift, 10);
  expect(moving.width).toBeCloseTo(initial.width, 10); expect(moving.height).toBeCloseTo(initial.height, 10);
  expect(moving).not.toEqual(initial);
  doc.activeElement = radio;
  handlers.get('focusin')!({ target: radio } as unknown as FocusEvent);
  scene.update(2 * delta, delta);
  expect(sink.mock.lastCall![0]!.viewport).toEqual(moving);
  key('keyup'); doc.activeElement = button;
  key('keydown'); scene.update(3 * delta, delta);
  const fresh = sink.mock.lastCall![0]!.viewport;
  expect(fresh.y).toBeCloseTo(initial.y + 2 * shift, 10);
  key('keyup'); scene.update(4 * delta, delta);
  expect(sink.mock.lastCall![0]!.viewport).toEqual(fresh);
});
