import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { WorldScene } from '../../src/rendering/scene/world-scene';
import { EMPTY_RENDER_FRAME } from '../../src/rendering/feed/render-feed';
import { WorldRenderView } from '../../src/rendering/world/world-view';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { chunkCoordinate } from '../../src/simulation/world/coordinates';
import type { MinimapView } from '../../src/shared/minimap-view';

// Only the host Scene shell is replaced. Actual WorldScene.update, its
// cameraState and minimap projection execute; the installed real camera below
// supplies the unchanged Phaser preRender/matrix/getWorldPoint implementation.
vi.mock('phaser', () => ({ default: { Scene: class { cameras = { main: undefined }; } } }));
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

const cases = [0.2, 0.5, 1, 1.25, 2, 3].flatMap(zoom =>
  [{ x: 0, y: 0 }, { x: 140, y: 90 }].flatMap(offset => [0, -2].map(chunkY => ({ zoom, offset, chunkY }))));

it.each(cases)('actual World minimap rectangle names real Camera corners at zoom=$zoom offset=$offset chunkY=$chunkY', ({ zoom, offset, chunkY }) => {
  const camera = new Camera(offset.x, offset.y, 1920, 1080);
  camera.setScroll(100, 200).setZoom(zoom);
  camera.preRender();
  const world = new SparseWorld(32);
  world.load({ x: chunkCoordinate(-1), y: chunkCoordinate(chunkY) });
  world.load({ x: chunkCoordinate(0), y: chunkCoordinate(chunkY) });
  const view = WorldRenderView.fromSnapshot(world.snapshot());
  const readFrame = vi.fn(() => ({ ...EMPTY_RENDER_FRAME, revision: 1, world: view }));
  const actual = new WorldScene({ feed: { readFrame }, keyValueStore: { getItem: () => null, setItem: () => undefined } });
  Reflect.set(actual.cameras, 'main', camera);
  // First-world framing is a separate accepted lifecycle. Hold the deliberately
  // panned real camera stable, as an already framed active session does.
  Reflect.set(actual, 'framedOnWorld', true);
  const sink = vi.fn<(value: MinimapView | undefined) => void>();
  actual.setMinimapSink(sink);
  actual.update(100, 0);
  expect(readFrame).toHaveBeenCalledExactlyOnceWith(0.1);
  expect(sink).toHaveBeenCalledTimes(1);
  const emitted = sink.mock.calls[0]![0]!;
  expect(emitted.width).toBe(64); expect(emitted.height).toBe(32);
  const bounds = view.loadedBounds!;
  const spanX = (bounds.maxTileX - bounds.minTileX + 1) * 64;
  const spanY = (bounds.maxTileY - bounds.minTileY + 1) * 64;
  const corners = [[0, 0], [1, 0], [1, 1], [0, 1]] as const;
  for (const [dx, dy] of corners) {
    const expected = camera.getWorldPoint(camera.x + dx * camera.width, camera.y + dy * camera.height);
    const shown = { x: bounds.minTileX * 64 + (emitted.viewport.x + dx * emitted.viewport.width) * spanX,
      y: bounds.minTileY * 64 + (emitted.viewport.y + dy * emitted.viewport.height) * spanY };
    expect(shown.x).toBeCloseTo(expected.x, 3);
    expect(shown.y).toBeCloseTo(expected.y, 3);
  }
});
