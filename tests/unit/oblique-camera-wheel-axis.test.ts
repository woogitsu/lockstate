import { afterEach, expect, it, vi } from 'vitest';
import { ObliqueWorldScene } from '../../src/rendering/scene/oblique-world-scene';
import { groundToScreen, screenToGround, type ObliqueCameraState } from '../../src/rendering/camera/oblique-projection';
import type { RenderFeed } from '../../src/rendering/feed/render-feed';

const plumbing = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => void>() }));
vi.mock('phaser', () => {
  const graphic = { setScrollFactor() { return this; }, setDepth() { return this; }, clear() {} };
  class Scene {
    readonly cameras = { main: { width: 1920, height: 1080, setBackgroundColor() {} } };
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

async function scene(): Promise<ObliqueWorldScene> {
  vi.stubGlobal('window', new EventTarget());
  const result = new ObliqueWorldScene({
    feed: {} as RenderFeed,
    keyValueStore: { getItem: () => null, setItem: () => undefined },
  });
  // Asset loading is unrelated to wheel dispatch. The real create(), registered
  // callback, zoom producer and public camera snapshot all execute unchanged.
  Reflect.set(result, 'loadCatalogTextures', async () => undefined);
  Reflect.set(result, 'loadFloorTextures', async () => undefined);
  result.create();
  await result.ready();
  return result;
}

it.each([[-120, 0], [120, 0], [0, 0]])(
  'keeps the whole angled view unchanged for wheel deltaX=%s, deltaY=%s',
  async (deltaX, deltaY) => {
    const actual = await scene();
    const before = actual.captureCameraView();
    plumbing.handlers.get('wheel')!({ x: 800, y: 440 }, [], deltaX, deltaY);
    expect(actual.captureCameraView()).toEqual(before);
  },
);

it.each([[0, -120], [120, -120], [0, 120], [-120, 120]])(
  'retains vertical direction and cursor anchor for wheel deltaX=%s, deltaY=%s',
  async (deltaX, deltaY) => {
    const actual = await scene();
    const pivot = { x: 800, y: 440 };
    const before = actual.captureCameraView();
    const poseBefore = Reflect.get(actual, 'pose') as ObliqueCameraState;
    // Read the inverse independently before dispatch; the same fixed cursor
    // must keep the same world point even for a diagonal wheel gesture.
    const anchor = screenToGround(pivot, poseBefore);
    plumbing.handlers.get('wheel')!(pivot, [], deltaX, deltaY);
    const after = actual.captureCameraView();
    expect(after.zoom).toBeCloseTo(before.zoom * (deltaY > 0 ? 1 / 1.25 : 1.25), 10);
    const projected = groundToScreen(anchor, Reflect.get(actual, 'pose') as ObliqueCameraState);
    expect(projected.x).toBeCloseTo(pivot.x, 10);
    expect(projected.y).toBeCloseTo(pivot.y, 10);
  },
);
