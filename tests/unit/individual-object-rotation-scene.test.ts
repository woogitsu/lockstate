import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import type Phaser from 'phaser';
import { afterEach, expect, it, vi } from 'vitest';
import { WorldScene } from '../../src/rendering/scene/world-scene';
import { ObliqueWorldScene } from '../../src/rendering/scene/oblique-world-scene';
import { EMPTY_RENDER_FRAME } from '../../src/rendering/feed/render-feed';
import { ObjectTool } from '../../src/ui/object-tool';

const plumbing = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => void>() }));
vi.mock('phaser', () => {
  const graphic: object = new Proxy({}, { get: () => () => graphic });
  class Scene {
    readonly cameras = { main: { width: 1920, height: 1080, setBackgroundColor() {} } };
    readonly scale = { displayScale: { x: 1, y: 1 } };
    readonly add = { graphics: () => graphic };
    readonly input = { manager: { pointers: [] }, mouse: { disableContextMenu() {} }, addPointer() {},
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
const cached = require.cache[components];
let Camera: typeof Phaser.Cameras.Scene2D.Camera;
try {
  require.cache[components] = { id: components, filename: components, loaded: true, exports: { FilterList: class {} } } as NodeJS.Module;
  Camera = require(resolve(phaserSource, 'cameras/2d/Camera.js')) as typeof Phaser.Cameras.Scene2D.Camera;
} finally { if (cached === undefined) delete require.cache[components]; else require.cache[components] = cached; }
vi.stubGlobal('window', new EventTarget());
type NativePointer = Phaser.Input.Pointer & { down(event: MouseEvent): void; up(event: MouseEvent): void; move(event: MouseEvent): void; touchstart(touch: Touch, event: TouchEvent): void; touchend(touch: Touch, event: TouchEvent): void };
const Pointer = require(resolve(phaserSource, 'input/Pointer.js')) as new (manager: Phaser.Input.InputManager, id: number) => NativePointer;
const pluginSource = readFileSync(resolve(phaserSource, 'input/InputPlugin.js'), 'utf8');
const upBody = pluginSource.match(/processUpEvents: function \(pointer\)\r?\n    (\{[\s\S]*?\r?\n    \}),/);
if (upBody === null) throw Error('Actual Phaser release dispatch absent');
const actualUp = new Function('Events', `return function(pointer) ${upBody[1]}`)(require(resolve(phaserSource, 'input/events/index.js'))) as (this: unknown, pointer: Phaser.Input.Pointer) => void;

for (const mode of ['world', 'oblique'] as const) {
  it(`${mode}: public object refresh repaints a stationary held footprint, cancels stale release and admits a fresh press`, async () => {
    vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('document', { activeElement: null });
    const object = new ObjectTool();
    const reports: unknown[] = [];
    object.attachGestures(report => reports.push(report));
    const target = vi.spyOn(object, 'target');
    object.setArmed(true, { definitionId: 'desk-wooden', footprint: { width: 2, height: 1 } });
    const options = { feed: { readFrame: () => EMPTY_RENDER_FRAME }, objectTool: object,
      keyValueStore: { getItem: () => null, setItem: () => undefined } };
    const scene = mode === 'world' ? new WorldScene(options) : new ObliqueWorldScene(options);
    // Art/host plumbing is doubled; the scene handlers, camera, Phaser pointer
    // and Phaser primary-release dispatcher are the real production paths.
    for (const load of ['loadActorAtlases', 'loadEnvironmentArt', 'loadCatalogTextures', 'loadFloorTextures'])
      Reflect.set(scene, load, async () => undefined);
    Reflect.set(scene, 'repaint', () => undefined);
    if (scene instanceof WorldScene) {
      const camera = new Camera(0, 0, 1920, 1080);
      camera.setScroll(12 * 64 - 960, 12 * 64 - 540).setZoom(1.25); camera.preRender();
      Reflect.set(scene.cameras, 'main', camera);
    }
    scene.create();
    if (scene instanceof ObliqueWorldScene) {
      await scene.ready();
      scene.restoreCameraView({ centre: { x: 12 * 64, y: 12 * 64 }, zoom: 1.25, yawRadians: Math.PI / 6, elevationRadians: Math.PI / 3 });
    }
    const pointer = new Pointer({ transformPointer(p: Phaser.Input.Pointer, x: number, y: number) { p.position.set(x, y); } } as unknown as Phaser.Input.InputManager, 0);
    const mouse = (phase: 'down' | 'up'): void => {
      const event = { button: 0, buttons: phase === 'down' ? 1 : 0, pageX: 900, pageY: 460, target: scene.game.canvas, timeStamp: 1 } as unknown as MouseEvent;
      if (phase === 'down') { pointer.down(event); plumbing.handlers.get('pointerdown')!(pointer); }
      else { pointer.up(event); actualUp.call({ _temp: [], _eventData: { cancelled: false }, _eventContainer: {}, isActive: () => true,
        manager: { game: { canvas: scene.game.canvas } }, emit: (kind: string, value: Phaser.Input.Pointer) => plumbing.handlers.get(kind)?.(value) }, pointer); }
    };
    mouse('down');
    const original = target.mock.lastCall![0]!;
    expect(original).toMatchObject({ width: 2, height: 1 });
    object.setArmed(true, { quarterTurns: 1 });
    scene.refreshObjectToolPreview();
    expect(target.mock.lastCall![0]).toEqual({ tileX: original.tileX, tileY: original.tileY, width: 1, height: 2 });
    expect(pointer.primaryDown, 'the physical primary remains down during rotation').toBe(true);
    mouse('up');
    expect(reports, 'the old press must not silently build the newly rotated object').toHaveLength(0);
    mouse('down'); mouse('up');
    expect(reports).toEqual([{ kind: 'place', definitionId: 'desk-wooden', x: original.tileX, y: original.tileY, quarterTurns: 1 }]);
  });
}

