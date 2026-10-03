import { afterEach, expect, it, vi } from 'vitest';
import { ObliqueWorldScene } from '../../src/rendering/scene/oblique-world-scene';
import type { RenderFeed } from '../../src/rendering/feed/render-feed';
import type { ObliqueCameraState } from '../../src/rendering/camera/oblique-projection';

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

// Independent linear ground-plane solve. No production forward/inverse helper
// supplies the reference, and no anchor is read from the scene's drag fields.
function groundAt(x: number, y: number, pose: ObliqueCameraState) {
  const a = Math.cos(pose.yawRadians) * pose.zoom;
  const b = -Math.sin(pose.yawRadians) * pose.zoom;
  const c = Math.sin(pose.yawRadians) * Math.sin(pose.elevationRadians) * pose.zoom;
  const d = Math.cos(pose.yawRadians) * Math.sin(pose.elevationRadians) * pose.zoom;
  const determinant = a * d - b * c;
  const sx = x - pose.viewport.width / 2, sy = y - pose.viewport.height / 2;
  return { x: pose.target.x + (d * sx - b * sy) / determinant,
    y: pose.target.y + (a * sy - c * sx) / determinant };
}
function sameGround(actual: { x: number; y: number }, expected: { x: number; y: number }) {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
}
function poseOf(scene: ObliqueWorldScene): ObliqueCameraState {
  return Reflect.get(scene, 'pose') as ObliqueCameraState;
}
function emit(name: string, ...args: unknown[]) { plumbing.handlers.get(name)!(...args); }
// A logical FullHD canvas stretched by CSS ratio 1/2. These are the normalized
// Phaser callback coordinates; native ScaleManager normalization is out of scope.
function pointer(button: number, buttons: number, cssRatio: number, x: number, y: number) {
  const client = { x: x * cssRatio, y: y * cssRatio };
  return { id: 1, wasTouch: false, button, buttons, x: client.x / cssRatio, y: client.y / cssRatio };
}
const cases = [-75, 30, 125].flatMap(yaw => [1, 2].flatMap(cssRatio => [-120, 120].map(dy =>
  [yaw, cssRatio, dy] as const)));
async function create(yaw: number) {
  vi.stubGlobal('window', new EventTarget());
  const scene = new ObliqueWorldScene({ feed: {} as RenderFeed,
    keyValueStore: { getItem: () => null, setItem: () => undefined } });
  Reflect.set(scene, 'loadCatalogTextures', async () => undefined);
  Reflect.set(scene, 'loadFloorTextures', async () => undefined);
  scene.create(); await scene.ready();
  scene.restoreCameraView({ centre: { x: 748, y: -356 }, zoom: 1.6,
    yawRadians: yaw * Math.PI / 180, elevationRadians: (yaw === -75 ? 25 : yaw === 30 ? 55 : 75) * Math.PI / 180 });
  return scene;
}

it.each(cases)('keeps a grabbed ground point through middle drag/wheel/drag at yaw%s CSSratio%s wheel%s', async (yaw, ratio, dy) => {
  const scene = await create(yaw);
  const down = pointer(1, 4, ratio, 820, 430);
  const anchor = groundAt(down.x, down.y, poseOf(scene));
  emit('pointerdown', down);
  const moved = pointer(1, 4, ratio, 875, 465);
  emit('pointermove', moved);
  sameGround(groundAt(moved.x, moved.y, poseOf(scene)), anchor);
  const beforeWheel = scene.captureCameraView();
  emit('wheel', moved, [], 35, dy);
  expect(scene.captureCameraView().zoom).toBeCloseTo(beforeWheel.zoom * (dy < 0 ? 1.25 : 0.8), 9);
  sameGround(groundAt(moved.x, moved.y, poseOf(scene)), anchor);
  const next = pointer(1, 4, ratio, 960, 500);
  emit('pointermove', next);
  sameGround(groundAt(next.x, next.y, poseOf(scene)), anchor);
  expect(scene.captureCameraView()).not.toEqual(beforeWheel);
  emit('pointerup', { ...next, buttons: 0 });
  const released = scene.captureCameraView();
  emit('pointermove', pointer(1, 0, ratio, 1080, 550));
  expect(scene.captureCameraView()).toEqual(released);
});

it.each(cases)('keeps the current ground pivot through right drag/wheel/drag at yaw%s CSSratio%s wheel%s', async (yaw, ratio, dy) => {
  const scene = await create(yaw);
  const down = pointer(2, 2, ratio, 820, 430);
  emit('pointerdown', down);
  const moved = pointer(2, 2, ratio, 875, 450);
  const initial = poseOf(scene);
  const orbitPivot = groundAt(moved.x, moved.y, initial);
  emit('pointermove', moved);
  expect(poseOf(scene).yawRadians).toBeCloseTo(initial.yawRadians + 55 * 0.005, 9);
  expect(poseOf(scene).elevationRadians).toBeCloseTo(Math.max(20 * Math.PI / 180, initial.elevationRadians - 20 * 0.005), 9);
  sameGround(groundAt(moved.x, moved.y, poseOf(scene)), orbitPivot);
  const beforeWheel = scene.captureCameraView();
  emit('wheel', moved, [], 35, dy);
  expect(scene.captureCameraView().zoom).toBeCloseTo(beforeWheel.zoom * (dy < 0 ? 1.25 : 0.8), 9);
  sameGround(groundAt(moved.x, moved.y, poseOf(scene)), orbitPivot);
  const next = pointer(2, 2, ratio, 920, 420);
  const nextPivot = groundAt(next.x, next.y, poseOf(scene));
  const beforeNext = poseOf(scene);
  emit('pointermove', next);
  expect(poseOf(scene).yawRadians).toBeCloseTo(beforeNext.yawRadians + 45 * 0.005, 9);
  sameGround(groundAt(next.x, next.y, poseOf(scene)), nextPivot);
  const exited = scene.captureCameraView();
  emit('gameout', 123, { timeStamp: 123, buttons: 2 });
  emit('pointermove', pointer(2, 2, ratio, 1080, 550));
  expect(scene.captureCameraView()).toEqual(exited);
});
