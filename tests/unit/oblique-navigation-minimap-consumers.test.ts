import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { ObliqueWorldScene } from '../../src/rendering/scene/oblique-world-scene';
import { groundToScreen, screenToGround, type ObliqueCameraState } from '../../src/rendering/camera/oblique-projection';
import { EMPTY_RENDER_FRAME } from '../../src/rendering/feed/render-feed';
import { WorldRenderView } from '../../src/rendering/world/world-view';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { chunkCoordinate } from '../../src/simulation/world/coordinates';
import type { MinimapView } from '../../src/shared/minimap-view';

const plumbing = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => void>() }));
vi.mock('phaser', () => {
  const graphic = { setScrollFactor() { return this; }, setDepth() { return this; }, clear() {}, fillStyle() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fillPath() {}, lineStyle() {}, lineBetween() {} };
  class Scene {
    cameras = { main: { width: 1920, height: 1080, setBackgroundColor() {} } };
    add = { graphics: () => graphic };
    input = { mouse: { disableContextMenu() {} }, addPointer() {}, on: (name: string, handler: (...args: unknown[]) => void) => plumbing.handlers.set(name, handler) };
    events = { once() {} }; game = { canvas: new EventTarget() };
  }
  return { default: { Scene, Scenes: { Events: { SHUTDOWN: 'shutdown' } } } };
});
afterEach(() => { plumbing.handlers.clear(); vi.unstubAllGlobals(); });

// Derive the view plane's linear basis and solve its 2x2 system. Expected
// ground bounds/picking never call production projection or its inverse.
function reference(pose: ObliqueCameraState) {
  const a = Math.cos(pose.yawRadians) * pose.zoom, b = -Math.sin(pose.yawRadians) * pose.zoom;
  const c = Math.sin(pose.yawRadians) * Math.sin(pose.elevationRadians) * pose.zoom;
  const d = Math.cos(pose.yawRadians) * Math.sin(pose.elevationRadians) * pose.zoom;
  const determinant = a * d - b * c;
  return {
    ground: (screen: { x: number; y: number }) => {
      const u = screen.x - pose.viewport.width / 2, v = screen.y - pose.viewport.height / 2;
      return { x: pose.target.x + (d * u - b * v) / determinant, y: pose.target.y + (a * v - c * u) / determinant };
    },
    screen: (world: { x: number; y: number }) => {
      const x = world.x - pose.target.x, y = world.y - pose.target.y;
      return { x: pose.viewport.width / 2 + a * x + b * y, y: pose.viewport.height / 2 + c * x + d * y };
    },
  };
}
const main = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8');
const projects = [...main.matchAll(/project: point => (\{[\s\S]*?\r?\n      \}),\r?\n      label:/g)];
const picks = [...main.matchAll(/const pickTemplateSquare = [^\r\n]+=> (\{[\s\S]*?\r?\n    \});/g)];
if (projects.length !== 1 || picks.length !== 1) throw Error('Expected unique actual main bridge projection/picking bodies');
function mainPorts(scene: ObliqueWorldScene) {
  return new Function('worldScene', 'ObliqueWorldScene', 'groundToScreen', 'screenToGround', 'TILE_SIZE_PX',
    `const project = point => ${projects[0]![1]}; const pick = point => ${picks[0]![1]}; return {project,pick};`)(scene, ObliqueWorldScene, groundToScreen, screenToGround, 64) as {
      project(point: { x: number; y: number }): { x: number; y: number }; pick(point: { x: number; y: number }): { x: number; y: number };
    };
}
const poses = [{ yaw: -45, elevation: 20 }, { yaw: 0, elevation: 45 }, { yaw: 37, elevation: 53 }, { yaw: 90, elevation: 80 }, { yaw: 217, elevation: 25 }, { yaw: 323, elevation: 65 }];

it.each(poses.flatMap(pose => [1, 2].map(cssRatio => ({ ...pose, cssRatio }))))(
  'actual angled minimap/whole-square/main bridge consumers after registered navigation yaw$yaw elevation$elevation CSSratio$cssRatio',
  async ({ yaw, elevation, cssRatio }) => {
    vi.stubGlobal('window', new EventTarget());
    const world = new SparseWorld(32); world.load({ x: chunkCoordinate(-1), y: chunkCoordinate(-1) }); world.load({ x: chunkCoordinate(0), y: chunkCoordinate(-1) }); world.load({ x: chunkCoordinate(0), y: chunkCoordinate(0) });
    const view = WorldRenderView.fromSnapshot(world.snapshot());
    const target = vi.fn(), place = vi.fn();
    const scene = new ObliqueWorldScene({ feed: { readFrame: () => ({ ...EMPTY_RENDER_FRAME, revision: 1, world: view }) },
      keyValueStore: { getItem: () => null, setItem: () => undefined },
      buildTool: { isArmed: () => true, usesSquareFootprint: () => true, place: () => undefined, placeSquares: place, targetSquares: target },
    });
    Reflect.set(scene, 'loadCatalogTextures', async () => undefined); Reflect.set(scene, 'loadFloorTextures', async () => undefined); Reflect.set(scene, 'repaint', () => undefined);
    scene.create(); await scene.ready(); scene.restoreCameraView({ centre: { x: 1024, y: 1024 }, zoom: 1.25 });
    scene.setPoseRadians(yaw * Math.PI / 180, elevation * Math.PI / 180);
    const sink = vi.fn<(view: MinimapView | undefined) => void>(); scene.setMinimapSink(sink);
    const ports = mainPorts(scene);
    const pointer = (x: number, y: number, button = 0, buttons = 0) => ({ id: 7, wasTouch: false, button, buttons, x, y });
    const callbacks = { down: plumbing.handlers.get('pointerdown')!, move: plumbing.handlers.get('pointermove')!, up: plumbing.handlers.get('pointerup')!, wheel: plumbing.handlers.get('wheel')! };
    const check = () => {
      scene.update(100, 0);
      const pose = scene.cameraPose, independent = reference(pose), emitted = sink.mock.lastCall![0]!;
      expect(emitted).toBeDefined(); expect(emitted.width).toBe(64); expect(emitted.height).toBe(64);
      const grounds = [[0,0],[1920,0],[1920,1080],[0,1080]].map(([x,y]) => independent.ground({ x: x!, y: y! }));
      const bounds = view.loadedBounds!;
      const spanX = (bounds.maxTileX - bounds.minTileX + 1) * 64, spanY = (bounds.maxTileY - bounds.minTileY + 1) * 64;
      const actual = { left: bounds.minTileX * 64 + emitted.viewport.x * spanX, top: bounds.minTileY * 64 + emitted.viewport.y * spanY,
        right: bounds.minTileX * 64 + (emitted.viewport.x + emitted.viewport.width) * spanX, bottom: bounds.minTileY * 64 + (emitted.viewport.y + emitted.viewport.height) * spanY };
      const expected = { left: Math.min(...grounds.map(p => p.x)), right: Math.max(...grounds.map(p => p.x)), top: Math.min(...grounds.map(p => p.y)), bottom: Math.max(...grounds.map(p => p.y)) };
      for (const field of ['left','right','top','bottom'] as const) expect(actual[field]).toBeCloseTo(expected[field], 6);
      const screen = { x: 1100, y: 460 }, ground = independent.ground(screen), square = { x: Math.floor(ground.x / 64), y: Math.floor(ground.y / 64) };
      callbacks.move(pointer(screen.x, screen.y));
      expect(target).toHaveBeenLastCalledWith([square]); expect(ports.pick(screen)).toEqual(square);
      for (const [dx,dy] of [[0,0],[4,0],[4,7],[0,7]]) {
        const point = { x: (square.x + dx!) * 64, y: (square.y + dy!) * 64 };
        const shown = ports.project(point), wanted = independent.screen(point);
        expect(shown.x / cssRatio).toBeCloseTo(wanted.x / cssRatio, 6); expect(shown.y / cssRatio).toBeCloseTo(wanted.y / cssRatio, 6);
      }
      expect(place).not.toHaveBeenCalled();
      return square;
    };
    check();
    const panStart = pointer(830, 420, 1, 4), panEnd = pointer(910, 450, 1, 4);
    const panAnchor = reference(scene.cameraPose).ground(panStart);
    callbacks.down(panStart); callbacks.move(panEnd); callbacks.up(pointer(910,450,1));
    const grabbed = reference(scene.cameraPose).screen(panAnchor);
    expect(grabbed.x).toBeCloseTo(panEnd.x, 6); expect(grabbed.y).toBeCloseTo(panEnd.y, 6); check();
    const turnStart = pointer(910,450,2,2), turnEnd = pointer(955,430,2,2);
    const turnAnchor = reference(scene.cameraPose).ground(turnEnd);
    callbacks.down(turnStart); callbacks.move(turnEnd); callbacks.up(pointer(955,430,2));
    const turned = reference(scene.cameraPose).screen(turnAnchor);
    expect(turned.x).toBeCloseTo(turnEnd.x, 6); expect(turned.y).toBeCloseTo(turnEnd.y, 6); check();
    const wheelPoint = pointer(1100,460), wheelAnchor = reference(scene.cameraPose).ground(wheelPoint);
    callbacks.wheel(wheelPoint, [], 80, -120);
    const zoomed = reference(scene.cameraPose).screen(wheelAnchor);
    expect(zoomed.x).toBeCloseTo(wheelPoint.x, 6); expect(zoomed.y).toBeCloseTo(wheelPoint.y, 6);
    const square = check();
    callbacks.down(wheelPoint); callbacks.up(wheelPoint);
    expect(place).toHaveBeenCalledExactlyOnceWith([square]);
  },
);
