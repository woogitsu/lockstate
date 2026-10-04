import { afterEach, expect, it, vi } from 'vitest';
import { ObliqueWorldScene } from '../../src/rendering/scene/oblique-world-scene';
import { EMPTY_RENDER_FRAME } from '../../src/rendering/feed/render-feed';
import { computeObliqueFit } from '../../src/rendering/camera/oblique-fit';
import type { ObliqueCameraState } from '../../src/rendering/camera/oblique-projection';
import type { WorldPoint } from '../../src/rendering/build/edge-picking';
import type { TileRect } from '../../src/rendering/build/area-picking';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { packCommand } from '../../src/simulation/protocol/commands';

const plumbing = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => void>() }));
vi.mock('phaser', () => {
  const graphic = { setScrollFactor() { return this; }, setDepth() { return this; },
    clear() {}, fillStyle() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fillPath() {}, lineStyle() {}, lineBetween() {} };
  class Scene {
    readonly cameras = { main: { width: 1920, height: 1080, setBackgroundColor() {} } };
    readonly add = { graphics: () => graphic };
    readonly input = { mouse: { disableContextMenu() {} }, addPointer() {},
      on: (name: string, handler: (...args: unknown[]) => void) => plumbing.handlers.set(name, handler) };
    readonly events = { once() {} };
    readonly game = { canvas: new EventTarget() };
  }
  return { default: { Scene, Scenes: { Events: { SHUTDOWN: 'shutdown' } } } };
});
afterEach(() => { plumbing.handlers.clear(); vi.unstubAllGlobals(); });

// Independent forward projection; never use production inverse/forward to
// choose the point whose callback command we then assert.
function at(world: WorldPoint, pose: ObliqueCameraState, buttons = 0) {
  const dx = world.x - pose.target.x, dy = world.y - pose.target.y;
  const along = dx * Math.cos(pose.yawRadians) - dy * Math.sin(pose.yawRadians);
  const depth = dx * Math.sin(pose.yawRadians) + dy * Math.cos(pose.yawRadians);
  return { id: 1, wasTouch: false, button: 0, buttons,
    x: pose.viewport.width / 2 + along * pose.zoom,
    y: pose.viewport.height / 2 + depth * Math.sin(pose.elevationRadians) * pose.zoom };
}
const yaws = [...Array.from({ length: 12 }, (_, i) => i * 30), 37, 143, 217, 323];
const elevations = [20, 25, 30, 40, 45, 50, 53, 65, 80];
const viewports = [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 900, height: 600 }];

it.each(yaws.flatMap(yaw => elevations.map(elevation => ({ yaw, elevation }))))(
  'actual pointer ports preserve ground coordinates after fit and resize at yaw=$yaw elevation=$elevation',
  async ({ yaw, elevation }) => {
    vi.stubGlobal('window', new EventTarget());
    let mode: 'wall' | 'room' | 'object' = 'wall';
    let size = { width: 1, height: 2 };
    const squareTarget = vi.fn(), squarePlace = vi.fn(), roomTarget = vi.fn(), roomPlace = vi.fn();
    const objectTarget = vi.fn(), objectPlace = vi.fn();
    const actual = new ObliqueWorldScene({
      feed: { readFrame: () => EMPTY_RENDER_FRAME },
      keyValueStore: { getItem: () => null, setItem: () => undefined },
      buildTool: { isArmed: () => mode === 'wall', usesSquareFootprint: () => true,
        place: () => undefined, placeSquares: squarePlace, targetSquares: squareTarget },
      roomTool: { isArmed: () => mode === 'room', isRemoving: () => false, target: roomTarget, place: roomPlace },
      objectTool: { isArmed: () => mode === 'object', isRemoving: () => false, footprint: () => size, target: objectTarget, place: objectPlace },
    });
    // Texture/paint work is irrelevant to command production; pointer callbacks,
    // viewport update, pose changes, fit and preview/commit geometry remain real.
    Reflect.set(actual, 'loadCatalogTextures', async () => undefined);
    Reflect.set(actual, 'loadFloorTextures', async () => undefined);
    Reflect.set(actual, 'repaint', () => undefined);
    actual.create();
    await actual.ready();
    actual.restoreCameraView({ centre: { x: 1024, y: 1024 }, zoom: 1.25 });
    actual.setPoseRadians(yaw * Math.PI / 180, elevation * Math.PI / 180);
    const down = plumbing.handlers.get('pointerdown')!, move = plumbing.handlers.get('pointermove')!, up = plumbing.handlers.get('pointerup')!;
    const start = { x: 15.375 * 64, y: 15.25 * 64 };
    const end = { x: 18.375 * 64, y: 17.25 * 64 };
    for (const viewport of viewports) {
      Object.assign(actual.cameras.main, viewport);
      actual.update(0, 0);
      expect(actual.cameraPose.viewport).toEqual(viewport);
      const fit = computeObliqueFit({ camera: actual.cameraPose,
        groundBounds: { left: 15 * 64, top: 15 * 64, right: 22 * 64, bottom: 31 * 64 },
        safeScreenBounds: { left: viewport.width * 0.2, right: viewport.width * 0.75,
          top: viewport.height * 0.15, bottom: viewport.height * 0.85 },
        cursorScreen: { x: viewport.width / 2, y: viewport.height / 2 }, mode: 'pan-locked' });
      expect(fit.fits).toBe(true);
      expect(actual.applyCameraFit(fit)).toBe(true);
      const pose = actual.cameraPose;
      mode = 'wall';
      move(at(start, pose));
      expect(squareTarget).toHaveBeenLastCalledWith([{ x: 15, y: 15 }]);
      down(at(start, pose, 1)); move(at(end, pose, 1)); up(at(end, pose));
      expect(squarePlace).toHaveBeenLastCalledWith([{ x: 15, y: 15 }, { x: 16, y: 15 }, { x: 17, y: 15 }, { x: 18, y: 15 }]);
      mode = 'room';
      down(at(start, pose, 1)); move(at(end, pose, 1));
      expect(roomTarget).toHaveBeenLastCalledWith({ tileX: 15, tileY: 15, width: 4, height: 3 });
      up(at(end, pose));
      expect(roomPlace).toHaveBeenLastCalledWith({ tileX: 15, tileY: 15, width: 4, height: 3 });
      mode = 'object';
      for (const quarterTurns of [0, 1, 2, 3]) {
        size = quarterTurns % 2 === 0 ? { width: 1, height: 2 } : { width: 2, height: 1 };
        move(at(start, pose));
        expect(objectTarget).toHaveBeenLastCalledWith({ tileX: 15, tileY: 15, ...size } satisfies TileRect);
        down(at(start, pose, 1)); up(at(start, pose));
        expect(objectPlace).toHaveBeenLastCalledWith({ tileX: 15, tileY: 15, edge: 'north' });
      }
    }
    // Consume the actual scene-produced squares through the real kernel packet
    // path. Repeating them must reserve no extra footprint at another origin.
    const runtime = createNewSimulationRuntime(73);
    const run = squarePlace.mock.lastCall![0] as readonly { x: number; y: number }[];
    for (const [index, square] of run.entries()) runtime.kernel.submitCommand(`picked-${index}`, index, runtime.kernel.tick,
      packCommand({ type: 'PlaceBuildOrder', definitionId: 'wall-brick', orderId: `picked-${index}`, footprint: 'square', ...square }));
    runtime.kernel.step();
    expect(runtime.construction.allOrders().map(order => ({ x: order.location.x, y: order.location.y, footprint: order.footprint })))
      .toEqual([{ x: 15, y: 15, footprint: 'square' }, { x: 16, y: 15, footprint: 'square' },
        { x: 17, y: 15, footprint: 'square' }, { x: 18, y: 15, footprint: 'square' }]);
    for (const [index, square] of run.entries()) runtime.kernel.submitCommand(`duplicate-${index}`, index + 4, runtime.kernel.tick,
      packCommand({ type: 'PlaceBuildOrder', definitionId: 'wall-brick', orderId: `duplicate-${index}`, footprint: 'square', ...square }));
    runtime.kernel.step();
    expect(runtime.construction.allOrders().filter(order => order.state !== 'failed')).toHaveLength(4);
    for (let index = 0; index < 4; index += 1) expect(runtime.construction.getOrder(`duplicate-${index}`)?.state).toBe('failed');
  },
);
