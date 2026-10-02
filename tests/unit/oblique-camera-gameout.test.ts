import { afterEach, expect, it, vi } from 'vitest';
import { ObliqueWorldScene } from '../../src/rendering/scene/oblique-world-scene';
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
  Reflect.set(result, 'loadCatalogTextures', async () => undefined);
  Reflect.set(result, 'loadFloorTextures', async () => undefined);
  result.create();
  await result.ready();
  return result;
}

const gestures = [['middle pan', 1, 4], ['right turn', 2, 2]] as const;
function pointer(button: number, buttons: number, x: number) {
  return { id: 1, wasTouch: false, button, buttons, x, y: 440 };
}

it.each(gestures)('ends %s when the real Phaser canvas-exit event arrives', async (_name, button, buttons) => {
  const actual = await scene();
  const initial = actual.captureCameraView();
  plumbing.handlers.get('pointerdown')!(pointer(button, buttons, 900));
  plumbing.handlers.get('pointermove')!(pointer(button, buttons, 960));
  const moved = actual.captureCameraView();
  expect(moved).not.toEqual(initial);
  // Shipped InputPlugin.onGameOut emits (nativeEvent.timeStamp, nativeEvent),
  // not a Phaser Pointer. POINTER_OUT explicitly excludes canvas exits.
  plumbing.handlers.get('gameout')?.(123, { type: 'mouseout', timeStamp: 123, buttons });
  plumbing.handlers.get('pointermove')!(pointer(button, buttons, 1040));
  expect(actual.captureCameraView()).toEqual(moved);
});

it.each(gestures)('keeps an unbroken %s responsive', async (_name, button, buttons) => {
  const actual = await scene();
  plumbing.handlers.get('pointerdown')!(pointer(button, buttons, 900));
  plumbing.handlers.get('pointermove')!(pointer(button, buttons, 960));
  const moved = actual.captureCameraView();
  plumbing.handlers.get('pointermove')!(pointer(button, buttons, 1040));
  expect(actual.captureCameraView()).not.toEqual(moved);
});

it.each(gestures)('already ends %s on its existing GameObject pointerout handler', async (_name, button, buttons) => {
  const actual = await scene();
  plumbing.handlers.get('pointerdown')!(pointer(button, buttons, 900));
  plumbing.handlers.get('pointermove')!(pointer(button, buttons, 960));
  const moved = actual.captureCameraView();
  plumbing.handlers.get('pointerout')!(pointer(button, buttons, 960));
  plumbing.handlers.get('pointermove')!(pointer(button, buttons, 1040));
  expect(actual.captureCameraView()).toEqual(moved);
});
