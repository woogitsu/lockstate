import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect, it } from 'vitest';
import type Phaser from 'phaser';

// Execute the actual composition-root callback instead of reproducing its
// arithmetic in the test. Loading all of main would start the whole game.
const source = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8');
// Both bodies are plain JavaScript. Keep their actual bytes and require unique
// producer markers; do not substitute a copied projection implementation.
const projects = [...source.matchAll(/project: point => (\{[\s\S]*?\r?\n      \}),\r?\n      label:/g)];
const picks = [...source.matchAll(/const pickTemplateSquare = [^\r\n]+=> (\{[\s\S]*?\r?\n    \});/g)];
if (projects.length !== 1 || picks.length !== 1) throw new Error('Expected one actual room-plan project/pick producer in main');
const executable = `const project = point => ${projects[0]![1]}; const pick = point => ${picks[0]![1]};`;
function ports(camera: Phaser.Cameras.Scene2D.Camera) {
  return new Function('worldScene', 'ObliqueWorldScene', 'groundToScreen', 'screenToGround', 'TILE_SIZE_PX',
    `${executable}\nreturn { project, pick };`)({ cameras: { main: camera } }, class {}, () => { throw Error('Unexpected angled branch'); }, () => { throw Error('Unexpected angled branch'); }, 64) as {
      project: (p: { x: number; y: number }) => { x: number; y: number };
      pick: (p: { x: number; y: number }) => { x: number; y: number };
    };
}

const require = createRequire(import.meta.url);
const phaserSource = resolve(dirname(require.resolve('phaser')), '../src');
// Camera's unused GPU filter aggregator initializes browser device probes.
// Replace only its FilterList constructor in Node. Real Camera, BaseCamera,
// preRender, getWorldPoint and all TransformMatrix implementations stay intact.
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
  [1, 2].flatMap(canvasToCssScale => [{ x: 0, y: 0 }, { x: 140, y: 90 }].map(offset => ({ zoom, canvasToCssScale, offset }))));

it.each(cases)('World room-plan projector matches real Camera at zoom=$zoom, CSS ratio=$canvasToCssScale, offset=$offset', ({ zoom, canvasToCssScale, offset }) => {
  const camera = new Camera(offset.x, offset.y, 1920, 1080);
  camera.setScroll(100, 200).setZoom(zoom);
  camera.preRender();
  const actual = ports(camera);
  const cursor = { x: offset.x + 960, y: offset.y + 540 };
  const selected = actual.pick(cursor);
  expect(selected).toEqual({ x: 16, y: 11 });
  const corners = [{ x: 16 * 64, y: 11 * 64 }, { x: 20 * 64, y: 11 * 64 },
    { x: 20 * 64, y: 18 * 64 }, { x: 16 * 64, y: 18 * 64 }];
  for (const corner of corners) {
    const shown = actual.project(corner);
    const expected = camera.matrixCombined.transformPoint(corner.x, corner.y);
    expect(shown.x / canvasToCssScale).toBeCloseTo(expected.x / canvasToCssScale, 5);
    expect(shown.y / canvasToCssScale).toBeCloseTo(expected.y / canvasToCssScale, 5);
    const hit = camera.getWorldPoint(shown.x, shown.y);
    expect(hit.x).toBeCloseTo(corner.x, 3);
    expect(hit.y).toBeCloseTo(corner.y, 3);
  }
});
