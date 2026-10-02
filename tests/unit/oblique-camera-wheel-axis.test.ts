import { afterEach, expect, it, vi } from 'vitest';
import { ObliqueWorldScene } from '../../src/rendering/scene/oblique-world-scene';
import { WorldScene } from '../../src/rendering/scene/world-scene';
import { groundToScreen, screenToGround, type ObliqueCameraState } from '../../src/rendering/camera/oblique-projection';
import { screenToWorld, worldToScreen, type CameraState } from '../../src/rendering/camera/coordinates';
import type { RenderFeed } from '../../src/rendering/feed/render-feed';

const plumbing = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => void>() }));
vi.mock('phaser', () => {
  const graphic = { setScrollFactor() { return this; }, setDepth() { return this; }, clear() {} };
  class Scene {
    readonly cameras = { main: {
      x: 0, y: 0, width: 1920, height: 1080, zoom: 1.25, scrollX: 0, scrollY: 0,
      setBackgroundColor() {},
      setZoom(value: number) { this.zoom = value; return this; },
      setScroll(x: number, y: number) { this.scrollX = x; this.scrollY = y; return this; },
      getWorldPoint(x: number, y: number) {
        return { x: (x - this.width / 2) / this.zoom + this.width / 2 + this.scrollX,
          y: (y - this.height / 2) / this.zoom + this.height / 2 + this.scrollY };
      },
    } };
    readonly add = { graphics: () => graphic };
    readonly input = {
      mouse: { disableContextMenu() {} }, addPointer() {},
      on: (name: string, handler: (...args: unknown[]) => void) => plumbing.handlers.set(name, handler),
    };
    readonly events = { once() {} };
    readonly game = { canvas: new EventTarget() };
  }
  return { default: { Scene, Scenes: { Events: { SHUTDOWN: 'shutdown' } } } };
});

afterEach(() => { plumbing.handlers.clear(); vi.unstubAllGlobals(); });

async function scene(mode: 'world' | 'oblique'): Promise<WorldScene | ObliqueWorldScene> {
  vi.stubGlobal('window', new EventTarget());
  const options = {
    feed: {} as RenderFeed,
    keyValueStore: { getItem: () => null, setItem: () => undefined },
  };
  const result = mode === 'oblique' ? new ObliqueWorldScene(options) : new WorldScene(options);
  // Asset loading is unrelated to wheel dispatch. The real create(), registered
  // callback, zoom producer and public camera snapshot all execute unchanged.
  Reflect.set(result, 'loadCatalogTextures', async () => undefined);
  Reflect.set(result, 'loadFloorTextures', async () => undefined);
  Reflect.set(result, 'loadActorAtlases', async () => undefined);
  Reflect.set(result, 'loadEnvironmentArt', async () => undefined);
  result.create();
  if (result instanceof ObliqueWorldScene) await result.ready();
  return result;
}

const modes = ['world', 'oblique'] as const;
it.each(modes.flatMap(mode => [[-120, 0], [120, 0], [0, 0]].map(([dx, dy]) => [mode, dx!, dy!] as const)))(
  'keeps the whole %s view unchanged for wheel deltaX=%s, deltaY=%s',
  async (mode, deltaX, deltaY) => {
    const actual = await scene(mode);
    const before = actual.captureCameraView();
    plumbing.handlers.get('wheel')!({ x: 800, y: 440 }, [], deltaX, deltaY);
    expect(actual.captureCameraView()).toEqual(before);
  },
);

it.each(modes.flatMap(mode => [[0, -120], [120, -120], [0, 120], [-120, 120]].map(([dx, dy]) => [mode, dx!, dy!] as const)))(
  'retains %s vertical direction and cursor anchor for wheel deltaX=%s, deltaY=%s',
  async (mode, deltaX, deltaY) => {
    const actual = await scene(mode);
    const pivot = { x: 800, y: 440 };
    const before = actual.captureCameraView();
    // Read the inverse independently before dispatch; the same fixed cursor
    // must keep the same world point even for a diagonal wheel gesture.
    const anchor = mode === 'oblique' ? screenToGround(pivot, Reflect.get(actual, 'pose') as ObliqueCameraState)
      : screenToWorld(pivot, Reflect.get(actual, 'cameraState').call(actual) as CameraState);
    plumbing.handlers.get('wheel')!(pivot, [], deltaX, deltaY);
    const after = actual.captureCameraView();
    const factor = mode === 'oblique' ? (deltaY > 0 ? 1 / 1.25 : 1.25) : (deltaY > 0 ? 0.9 : 1.1);
    expect(after.zoom).toBeCloseTo(before.zoom * factor, 10);
    const projected = mode === 'oblique' ? groundToScreen(anchor, Reflect.get(actual, 'pose') as ObliqueCameraState)
      : worldToScreen(anchor, Reflect.get(actual, 'cameraState').call(actual) as CameraState);
    expect(projected.x).toBeCloseTo(pivot.x, 10);
    expect(projected.y).toBeCloseTo(pivot.y, 10);
  },
);
