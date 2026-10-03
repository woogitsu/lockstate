import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import type Phaser from 'phaser';
import { afterEach, expect, it, vi } from 'vitest';
import { WorldScene } from '../../src/rendering/scene/world-scene';
import { ObliqueWorldScene } from '../../src/rendering/scene/oblique-world-scene';
import { EMPTY_RENDER_FRAME } from '../../src/rendering/feed/render-feed';
import { BLOCKED_PLACEMENT_PREVIEW_TINT, PLANNED_OBJECT_TINT } from '../../src/rendering/world/appearance';
import { ObjectTool } from '../../src/ui/object-tool';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';

const plumbing = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => void>(), fills: [] as number[] }));
vi.mock('phaser', () => {
  const graphic: object = new Proxy({}, { get: (_target, name) => (...args: unknown[]) => {
    if (name === 'fillStyle') plumbing.fills.push(args[0] as number);
    return graphic;
  } });
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
afterEach(() => { plumbing.handlers.clear(); plumbing.fills.length = 0; vi.unstubAllGlobals(); });
const require = createRequire(import.meta.url), phaserSource = resolve(dirname(require.resolve('phaser')), '../src');
const components = require.resolve(resolve(phaserSource, 'gameobjects/components/index.js')), cached = require.cache[components];
let Camera: typeof Phaser.Cameras.Scene2D.Camera;
try {
  require.cache[components] = { id: components, filename: components, loaded: true, exports: { FilterList: class {} } } as NodeJS.Module;
  Camera = require(resolve(phaserSource, 'cameras/2d/Camera.js')) as typeof Phaser.Cameras.Scene2D.Camera;
} finally { if (cached === undefined) delete require.cache[components]; else require.cache[components] = cached; }
vi.stubGlobal('window', new EventTarget());
type NativePointer = Phaser.Input.Pointer & { down(event: MouseEvent): void; move(event: MouseEvent): void };
const Pointer = require(resolve(phaserSource, 'input/Pointer.js')) as new (manager: Phaser.Input.InputManager, id: number) => NativePointer;
const main = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8');
const tint = main.match(/objectTint: \(\): number =>\s*([\s\S]*?) \}\),/);
if (tint === null) throw new Error('Actual main object tint consumer absent');
const actualTint = new Function('objectTool', 'BLOCKED_PLACEMENT_PREVIEW_TINT', 'PLANNED_OBJECT_TINT',
  `return () => (${tint[1]})`) as (tool: ObjectTool, blocked: number, planned: number) => () => number;

for (const mode of ['world', 'oblique'] as const) {
  it(`${mode}: actual pointer ghost repaints an asynchronous real verdict without moving a held press`, async () => {
    vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('document', { activeElement: null });
    const runtime = createNewSimulationRuntime(73); // real placement says outside-room, not a fabricated verdict
    let scene: WorldScene | ObliqueWorldScene;
    const object = new ObjectTool({ preflight: async target => runtime.objectPlacement.preflight({
      definitionId: target.definitionId, x: target.anchor.x, y: target.anchor.y }),
      worldRevision: () => 1, onPreviewChanged: () => scene.refreshObjectToolVerdict() });
    object.setArmed(true, { definitionId: 'desk-wooden', footprint: { width: 2, height: 1 } });
    const options = { feed: { readFrame: () => EMPTY_RENDER_FRAME }, objectTool: object,
      objectTint: actualTint(object, BLOCKED_PLACEMENT_PREVIEW_TINT, PLANNED_OBJECT_TINT),
      keyValueStore: { getItem: () => null, setItem: () => undefined } };
    scene = mode === 'world' ? new WorldScene(options) : new ObliqueWorldScene(options);
    // Only host/art plumbing is doubled. Actual scene input, camera, pointer,
    // overlay/quad paint, ObjectTool and admission producer are executed.
    for (const load of ['loadActorAtlases', 'loadEnvironmentArt', 'loadCatalogTextures', 'loadFloorTextures'])
      Reflect.set(scene, load, async () => undefined);
    Reflect.set(scene, 'repaint', () => undefined);
    if (scene instanceof WorldScene) {
      const camera = new Camera(0, 0, 1920, 1080);
      camera.setScroll(12 * 64 - 960, 12 * 64 - 540).setZoom(1.25); camera.preRender();
      Reflect.set(scene.cameras, 'main', camera);
    }
    scene.create();
    if (scene instanceof ObliqueWorldScene) { await scene.ready();
      scene.restoreCameraView({ centre: { x: 12 * 64, y: 12 * 64 }, zoom: 1.25, yawRadians: Math.PI / 6, elevationRadians: Math.PI / 3 }); }
    const pointer = new Pointer({ transformPointer(p: Phaser.Input.Pointer, x: number, y: number) { p.position.set(x, y); } } as unknown as Phaser.Input.InputManager, 0);
    plumbing.fills.length = 0;
    const event = { button: 0, buttons: 1, pageX: 900, pageY: 460, target: scene.game.canvas, timeStamp: 1 } as unknown as MouseEvent;
    pointer.down(event); plumbing.handlers.get('pointerdown')!(pointer);
    expect(object.previewVerdict()).toBeUndefined();
    expect(plumbing.fills.at(-1)).toBe(mode === 'world' ? PLANNED_OBJECT_TINT : 0x6dc9bb);
    await Promise.resolve(); await Promise.resolve();
    expect(object.previewVerdict()).toBe('blocked');
    expect(plumbing.fills.at(-1)).toBe(BLOCKED_PLACEMENT_PREVIEW_TINT);
    expect(pointer.primaryDown).toBe(true);
    pointer.move({ ...event, pageX: 970 } as unknown as MouseEvent); plumbing.handlers.get('pointermove')!(pointer);
    expect(object.previewVerdict()).toBeUndefined();
    expect(plumbing.fills.at(-1), 'new aim cannot borrow the old blocked verdict for a frame').toBe(mode === 'world' ? PLANNED_OBJECT_TINT : 0x6dc9bb);
  });
}
