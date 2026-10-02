import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { WorldScene } from '../../src/rendering/scene/world-scene';
import { EMPTY_RENDER_FRAME } from '../../src/rendering/feed/render-feed';
import type { TileRange } from '../../src/rendering/tile-metrics';

const host = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => void>(), rects: [] as number[][] }));
vi.mock('phaser', () => {
  const graphic = { setDepth() { return this; }, setScrollFactor() { return this; }, clear() {},
    fillStyle() {}, lineStyle() {}, fillRect(...args: number[]) { host.rects.push(args); }, strokeRect() {} };
  return { default: { Scene: class {
    cameras = { main: undefined };
    add = { graphics: () => graphic };
    input = { mouse: { disableContextMenu() {} }, addPointer() {},
      on: (name: string, handler: (...args: unknown[]) => void) => host.handlers.set(name, handler) };
    game = { canvas: new EventTarget() };
    events = { once() {} };
  }, Scenes: { Events: { SHUTDOWN: 'shutdown' } } } };
});
const require = createRequire(import.meta.url);
const phaserSource = resolve(dirname(require.resolve('phaser')), '../src');
const components = require.resolve(resolve(phaserSource, 'gameobjects/components/index.js'));
const previous = require.cache[components];
let Camera: typeof Phaser.Cameras.Scene2D.Camera;
try {
  require.cache[components] = { id: components, filename: components, loaded: true, exports: { FilterList: class {} } } as NodeJS.Module;
  Camera = require(resolve(phaserSource, 'cameras/2d/Camera.js')) as typeof Phaser.Cameras.Scene2D.Camera;
} finally {
  if (previous === undefined) delete require.cache[components];
  else require.cache[components] = previous;
}
afterEach(() => { host.handlers.clear(); host.rects.length = 0; vi.unstubAllGlobals(); });

const cases = [0.2, 0.5, 1, 1.25, 2, 3].flatMap(zoom =>
  [{ width: 1920, height: 1080 }, { width: 960, height: 540 }].flatMap(viewport => [-1, 1].map(direction => ({ zoom, viewport, direction }))));

async function pannedScene({ zoom, viewport, direction }: (typeof cases)[number]) {
  vi.stubGlobal('window', new EventTarget());
  const camera = new Camera(0, 0, viewport.width, viewport.height);
  camera.setZoom(zoom).setScroll(100, 200);
  let armed = false;
  const placeSquares = vi.fn(); const placeEdge = vi.fn(); const targetSquares = vi.fn();
  const actual = new WorldScene({ feed: { readFrame: () => EMPTY_RENDER_FRAME },
    keyValueStore: { getItem: () => null, setItem: () => undefined },
    buildTool: { isArmed: () => armed, usesSquareFootprint: () => true, place: placeEdge, placeSquares, targetSquares } });
  Reflect.set(actual.cameras, 'main', camera);
  Reflect.set(actual, 'loadActorAtlases', async () => undefined);
  Reflect.set(actual, 'loadEnvironmentArt', async () => undefined);
  actual.create();
  const pointer = (x: number, y: number, button: number, down: boolean) => ({ id: 1, x, y, button, wasTouch: false, isDown: down, leftButtonDown: () => button === 0 && down });
  host.handlers.get('pointerdown')!(pointer(400, 250, 1, true));
  host.handlers.get('pointermove')!(pointer(400 + direction * 145.2, 250 - direction * 96.6, 1, true));
  host.handlers.get('pointerup')!(pointer(400 + direction * 145.2, 250 - direction * 96.6, 1, false));
  expect(camera.scrollX).toBeCloseTo(100 - direction * 145.2 / zoom, 7);
  expect(camera.scrollY).toBeCloseTo(200 + direction * 96.6 / zoom, 7);
  camera.preRender(); // use the same completed rendered frame as real picking
  return { camera, actual, pointer, arm: () => { armed = true; }, placeSquares, placeEdge, targetSquares };
}

it.each(cases)('World actual culling agrees with real Camera corners after zoom=$zoom viewport=$viewport pan=$direction', async scenario => {
  const { camera, actual } = await pannedScene(scenario);
  const { viewport } = scenario;
  const cornerWorld = [[0, 0], [viewport.width, 0], [viewport.width, viewport.height], [0, viewport.height]]
    .map(([x, y]) => camera.getWorldPoint(x!, y!));
  const expectedRange = { minTileX: Math.floor(Math.min(...cornerWorld.map(p => p.x)) / 64) - 1,
    maxTileX: Math.floor(Math.max(...cornerWorld.map(p => p.x)) / 64) + 1,
    minTileY: Math.floor(Math.min(...cornerWorld.map(p => p.y)) / 64) - 1,
    maxTileY: Math.floor(Math.max(...cornerWorld.map(p => p.y)) / 64) + 1 };
  const tileUpdate = vi.fn(); Reflect.set(actual, 'tiles', { update: tileUpdate });
  actual.update(100, 0);
  expect(tileUpdate.mock.calls[0]![1] as TileRange).toEqual(expectedRange);
});

it.each(cases)('World registered square picking agrees with real Camera after zoom=$zoom viewport=$viewport pan=$direction', async scenario => {
  const { camera, actual, pointer, arm, placeSquares, placeEdge, targetSquares } = await pannedScene(scenario);
  const { viewport } = scenario;
  for (const point of [{ x: 1, y: 1 }, { x: viewport.width - 1, y: 1 },
    { x: viewport.width - 1, y: viewport.height - 1 }, { x: 460, y: 290 }]) {
    const picked = Reflect.get(actual, 'worldPointOf').call(actual, pointer(point.x, point.y, 0, false)) as { x: number; y: number };
    const expected = camera.getWorldPoint(point.x, point.y);
    expect(picked.x).toBeCloseTo(expected.x, 3); expect(picked.y).toBeCloseTo(expected.y, 3);
  }

  arm();
  const centre = camera.getWorldPoint(viewport.width / 2, viewport.height / 2);
  const tile = { x: Math.floor(centre.x / 64), y: Math.floor(centre.y / 64) };
  const start = camera.matrixCombined.transformPoint((tile.x + 0.5) * 64, (tile.y + 0.5) * 64);
  const end = camera.matrixCombined.transformPoint((tile.x + 3.5) * 64, (tile.y + 0.5) * 64);
  host.handlers.get('pointermove')!(pointer(start.x, start.y, 0, false));
  expect(targetSquares).toHaveBeenLastCalledWith([tile]);
  expect(host.rects.at(-1)).toEqual([tile.x * 64, tile.y * 64, 64, 64]);
  host.handlers.get('pointerdown')!(pointer(start.x, start.y, 0, true));
  host.handlers.get('pointermove')!(pointer(end.x, end.y, 0, true));
  const expectedSquares = [0, 1, 2, 3].map(dx => ({ x: tile.x + dx, y: tile.y }));
  expect(targetSquares).toHaveBeenLastCalledWith(expectedSquares);
  expect(placeSquares).not.toHaveBeenCalled();
  host.handlers.get('pointerup')!(pointer(end.x, end.y, 0, false));
  expect(placeSquares).toHaveBeenCalledExactlyOnceWith(expectedSquares);
  expect(placeEdge).not.toHaveBeenCalled();
});
