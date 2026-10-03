import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { WorldScene } from '../../src/rendering/scene/world-scene';
import { ObliqueWorldScene } from '../../src/rendering/scene/oblique-world-scene';
import type { RenderFeed } from '../../src/rendering/feed/render-feed';
import type { ObliqueCameraState } from '../../src/rendering/camera/oblique-projection';
import { BuildTool } from '../../src/ui/build-tool';
import type { BuildPanelTarget, HudBuildOrder } from '../../src/ui/hud';

const plumbing = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => void>() }));
vi.mock('phaser', () => {
  const graphic = { setScrollFactor() { return this; }, setDepth() { return this; }, clear() {},
    fillStyle() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fillPath() {}, lineStyle() {}, lineBetween() {} };
  class Scene {
    readonly cameras = { main: { width: 1920, height: 1080, setBackgroundColor() {} } };
    readonly scale = { displayScale: { x: 1, y: 1 } };
    readonly add = { graphics: () => graphic };
    readonly input = { manager: { isOver: false }, activePointer: { id: 1, x: 830, y: 470, wasTouch: false, buttons: 0 },
      mouse: { disableContextMenu() {} }, addPointer() {},
      on: (name: string, handler: (...args: unknown[]) => void) => plumbing.handlers.set(name, handler) };
    readonly events = { once() {} };
    readonly game = { canvas: new EventTarget() };
  }
  return { default: { Scene, Scenes: { Events: { SHUTDOWN: 'shutdown' } } } };
});
afterEach(() => { plumbing.handlers.clear(); vi.unstubAllGlobals(); });
const require = createRequire(import.meta.url);
const phaserSource = resolve(dirname(require.resolve('phaser')), '../src');
const components = require.resolve(resolve(phaserSource, 'gameobjects/components/index.js'));
const previous = require.cache[components];
let Camera: typeof Phaser.Cameras.Scene2D.Camera;
try {
  require.cache[components] = { id: components, filename: components, loaded: true, exports: { FilterList: class {} } } as NodeJS.Module;
  Camera = require(resolve(phaserSource, 'cameras/2d/Camera.js')) as typeof Phaser.Cameras.Scene2D.Camera;
} finally { if (previous === undefined) delete require.cache[components]; else require.cache[components] = previous; }

const directions = ['up', 'down', 'left', 'right'] as const;
type Direction = typeof directions[number];
const options = () => ({ feed: {} as RenderFeed, keyValueStore: { getItem: () => null, setItem: () => undefined } });
function pan(scene: WorldScene | ObliqueWorldScene, direction: Direction) {
  const method = Reflect.get(scene, 'stepCameraPan') as ((direction: Direction) => void) | undefined;
  expect(typeof method, 'the current scene must expose the approved HUD pan port').toBe('function');
  method!.call(scene, direction);
}
function scaling(scene: WorldScene | ObliqueWorldScene, ratio: number) {
  // Actual ScaleManager defines displayScale = logical base size / CSS bounds.
  Reflect.set(scene.scale, 'displayScale', { x: 1 / ratio, y: 1 / ratio });
}
function vector(direction: Direction) { return { x: direction === 'right' ? 1 : direction === 'left' ? -1 : 0,
  y: direction === 'down' ? 1 : direction === 'up' ? -1 : 0 }; }
const worldCases = [0.5, 1.25, 3].flatMap(zoom => [1, 2].flatMap(ratio => directions.map(direction => ({ zoom, ratio, direction }))));
it.each(worldCases)('World pan $direction moves exactly128CSSpx at zoom$zoom CSSratio$ratio', ({ zoom, ratio, direction }) => {
  const scene = new WorldScene(options()); scaling(scene, ratio);
  const camera = new Camera(140, 90, 1920, 1080); camera.setScroll(100, 200).setZoom(zoom); camera.preRender();
  Reflect.set(scene.cameras, 'main', camera);
  const anchor = camera.getWorldPoint(980, 560);
  const before = camera.matrixCombined.transformPoint(anchor.x, anchor.y);
  const view = scene.captureCameraView();
  pan(scene, direction); camera.preRender();
  const after = camera.matrixCombined.transformPoint(anchor.x, anchor.y);
  const delta = vector(direction);
  expect((after.x - before.x) * ratio).toBeCloseTo(-128 * delta.x, 3);
  expect((after.y - before.y) * ratio).toBeCloseTo(-128 * delta.y, 3);
  expect(scene.captureCameraView().zoom).toBe(view.zoom);
  const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' } as const;
  pan(scene, opposite[direction]);
  camera.preRender();
  expect(scene.captureCameraView().centre.x).toBeCloseTo(view.centre.x, 3);
  expect(scene.captureCameraView().centre.y).toBeCloseTo(view.centre.y, 3);
});

function screenOf(point: { x: number; y: number }, pose: ObliqueCameraState) {
  // Independent ground-plane basis, not production forward/inverse helpers.
  const rotatedX = (point.x - pose.target.x) * Math.cos(pose.yawRadians) - (point.y - pose.target.y) * Math.sin(pose.yawRadians);
  const rotatedY = (point.x - pose.target.x) * Math.sin(pose.yawRadians) + (point.y - pose.target.y) * Math.cos(pose.yawRadians);
  return { x: pose.viewport.width / 2 + rotatedX * pose.zoom,
    y: pose.viewport.height / 2 + rotatedY * Math.sin(pose.elevationRadians) * pose.zoom };
}
async function angled(yaw: number, ratio: number) {
  vi.stubGlobal('window', new EventTarget());
  const scene = new ObliqueWorldScene(options()); scaling(scene, ratio);
  Reflect.set(scene, 'loadCatalogTextures', async () => undefined); Reflect.set(scene, 'loadFloorTextures', async () => undefined);
  scene.create(); await scene.ready();
  scene.restoreCameraView({ centre: { x: 748, y: -356 }, zoom: 1.6, yawRadians: yaw * Math.PI / 180,
    elevationRadians: (yaw === -75 ? 25 : yaw === 30 ? 55 : 75) * Math.PI / 180 });
  return scene;
}
const angledCases = [-75, 30, 125].flatMap(yaw => [1, 2].flatMap(ratio => directions.map(direction => ({ yaw, ratio, direction }))));
it.each(angledCases)('Angled pan $direction moves exactly128CSSpx at yaw$yaw CSSratio$ratio', async ({ yaw, ratio, direction }) => {
  const scene = await angled(yaw, ratio);
  const pose = Reflect.get(scene, 'pose') as ObliqueCameraState;
  const anchor = { x: 960, y: -240 };
  const before = screenOf(anchor, pose); const view = scene.captureCameraView();
  pan(scene, direction);
  const after = screenOf(anchor, Reflect.get(scene, 'pose') as ObliqueCameraState); const delta = vector(direction);
  expect((after.x - before.x) * ratio).toBeCloseTo(-128 * delta.x, 9);
  expect((after.y - before.y) * ratio).toBeCloseTo(-128 * delta.y, 9);
  const next = scene.captureCameraView();
  expect(next.zoom).toBe(view.zoom); expect(next.yawRadians).toBe(view.yawRadians); expect(next.elevationRadians).toBe(view.elevationRadians);
  const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' } as const;
  pan(scene, opposite[direction]);
  expect(scene.captureCameraView().centre.x).toBeCloseTo(view.centre.x, 9);
  expect(scene.captureCameraView().centre.y).toBeCloseTo(view.centre.y, 9);
});

it.each(['world', 'oblique'].flatMap(mode => directions.map(direction => ({ mode, direction }))))(
  '$mode pan $direction refreshes the stationary whole-square Build hover without ordering or changing the tool',
  async ({ mode, direction }) => {
    vi.stubGlobal('window', new EventTarget());
    const tool = new BuildTool(); tool.setArmed(true, 'wall-brick', true);
    const orders: HudBuildOrder[] = []; tool.attachOrders(order => orders.push(order));
    const targets: (BuildPanelTarget | undefined)[] = []; tool.attachReadout(target => targets.push(target));
    const scene = mode === 'world' ? new WorldScene({ ...options(), buildTool: tool })
      : new ObliqueWorldScene({ ...options(), buildTool: tool });
    const pointer = { id: 1, wasTouch: false, button: 0, buttons: 0, x: 830, y: 470 };
    Reflect.set(scene.input, 'activePointer', pointer); Reflect.set(scene.input.manager, 'isOver', true);
    scaling(scene, 1);
    let camera: Phaser.Cameras.Scene2D.Camera | undefined;
    if (scene instanceof ObliqueWorldScene) {
      Reflect.set(scene, 'loadCatalogTextures', async () => undefined); Reflect.set(scene, 'loadFloorTextures', async () => undefined);
      scene.create(); await scene.ready();
      scene.restoreCameraView({ centre: { x: 748, y: -356 }, zoom: 1.25, yawRadians: 37 * Math.PI / 180, elevationRadians: 35 * Math.PI / 180 });
      plumbing.handlers.get('pointermove')!(pointer);
    } else {
      camera = new Camera(0, 0, 1920, 1080); camera.setScroll(100, 200).setZoom(1.25); camera.preRender();
      Reflect.set(scene.cameras, 'main', camera);
      Reflect.get(scene, 'previewHover').call(scene, pointer);
    }
    const old = targets.at(-1)!;
    pan(scene, direction);
    const next = targets.at(-1)!;
    expect(next).not.toEqual(old);
    let ground: { x: number; y: number };
    if (camera !== undefined) { camera.preRender(); ground = camera.getWorldPoint(pointer.x, pointer.y); }
    else {
      const pose = Reflect.get(scene, 'pose') as ObliqueCameraState;
      // Solve the independent affine basis by its determinant.
      const origin = screenOf({ x: 0, y: 0 }, pose), ex = screenOf({ x: 1, y: 0 }, pose), ey = screenOf({ x: 0, y: 1 }, pose);
      const a = ex.x - origin.x, b = ey.x - origin.x, c = ex.y - origin.y, d = ey.y - origin.y;
      const x = pointer.x - origin.x, y = pointer.y - origin.y, det = a * d - b * c;
      ground = { x: (d * x - b * y) / det, y: (a * y - c * x) / det };
    }
    const expected = { x: Math.floor(ground.x / 64), y: Math.floor(ground.y / 64) };
    expect(next).toEqual({ ...expected, segments: 1, squareRun: true, definitionId: 'wall-brick' });
    expect(tool.isArmed()).toBe(true); expect(tool.selectedDefinitionId).toBe('wall-brick'); expect(orders).toEqual([]);
    // The real ordinary click consumes the same tile shown by the new preview.
    if (scene instanceof ObliqueWorldScene) {
      plumbing.handlers.get('pointerdown')!({ ...pointer, buttons: 1 });
      plumbing.handlers.get('pointerup')!({ ...pointer, buttons: 0 });
    } else {
      Reflect.get(scene, 'beginBuild').call(scene, { ...pointer, buttons: 1 });
      Reflect.get(scene, 'commitBuild').call(scene, { ...pointer, buttons: 0 });
    }
    expect(orders).toEqual([{ definitionId: 'wall-brick', edges: [], squares: [expected] }]);
  },
);
