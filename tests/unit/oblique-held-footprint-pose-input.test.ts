import { afterEach, expect, it, vi } from 'vitest';
import { ObliqueWorldScene } from '../../src/rendering/scene/oblique-world-scene';
import { EMPTY_RENDER_FRAME } from '../../src/rendering/feed/render-feed';
import { DEFAULT_KEYBOARD_BINDINGS } from '../../src/input/bindings';
import type { ObliqueCameraState } from '../../src/rendering/camera/oblique-projection';
import type { Point } from '../../src/rendering/camera/coordinates';

const input = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => void>(), layers: [] as Array<{ polygons: Point[][] }> }));
vi.mock('phaser', () => {
  class Graphics {
    polygons: Point[][] = []; path: Point[] = [];
    setScrollFactor() { return this; } setDepth() { return this; }
    clear() { this.polygons = []; } fillStyle() {} lineStyle() {} lineBetween() {}
    beginPath() { this.path = []; } moveTo(x: number, y: number) { this.path.push({ x, y }); }
    lineTo(x: number, y: number) { this.path.push({ x, y }); } closePath() {}
    fillPath() { this.polygons.push(this.path); }
  }
  class Scene {
    cameras = { main: { width: 1920, height: 1080, setBackgroundColor() {} } };
    add = { graphics: () => { const g = new Graphics(); input.layers.push(g); return g; } };
    input = { mouse: { disableContextMenu() {} }, addPointer() {},
      on: (name: string, f: (...args: unknown[]) => void) => input.handlers.set(name, f) };
    events = { once() {} }; game = { canvas: new EventTarget() };
  }
  return { default: { Scene, Scenes: { Events: { SHUTDOWN: 'shutdown' } } } };
});
afterEach(() => { input.handlers.clear(); input.layers.length = 0; vi.unstubAllGlobals(); });

// Independent equations, rather than a roundtrip through the producer's own
// projection/inverse. We assert both target coordinates and painted corners.
function project(p: Point, pose: ObliqueCameraState): Point {
  const x = p.x - pose.target.x, y = p.y - pose.target.y;
  return { x: pose.viewport.width / 2 + (x * Math.cos(pose.yawRadians) - y * Math.sin(pose.yawRadians)) * pose.zoom,
    y: pose.viewport.height / 2 + (x * Math.sin(pose.yawRadians) + y * Math.cos(pose.yawRadians)) * Math.sin(pose.elevationRadians) * pose.zoom };
}
function unproject(p: Point, pose: ObliqueCameraState): Point {
  const x = (p.x - pose.viewport.width / 2) / pose.zoom;
  const y = (p.y - pose.viewport.height / 2) / pose.zoom / Math.sin(pose.elevationRadians);
  return { x: pose.target.x + x * Math.cos(pose.yawRadians) + y * Math.sin(pose.yawRadians),
    y: pose.target.y - x * Math.sin(pose.yawRadians) + y * Math.cos(pose.yawRadians) };
}
function key(type: string, code: string) { window.dispatchEvent(Object.assign(new Event(type), { code })); }
function pointer(p: Point, button = 0, buttons = 1) { return { ...p, id: 1, wasTouch: false, button, buttons }; }
const controls = [
  { code: 'KeyQ', axis: 'yawRadians', direction: -1 }, { code: 'KeyE', axis: 'yawRadians', direction: 1 },
  { code: 'KeyR', axis: 'elevationRadians', direction: 1 }, { code: 'KeyF', axis: 'elevationRadians', direction: -1 },
] as const;
const tools = ['wall', 'room', 'object-q0', 'object-q1'] as const;

it.each(tools.flatMap(tool => controls.flatMap(control => [false, true].map(remapped => ({ tool, ...control, remapped })))))(
  'held $tool footprint follows registered $code pose input (remapped=$remapped) before release',
  async ({ tool, code, axis, direction, remapped }) => {
    vi.stubGlobal('window', new EventTarget());
    const target = vi.fn(), place = vi.fn();
    const footprint = tool === 'object-q1' ? { width: 2, height: 1 } : { width: 1, height: 2 };
    const bindings = DEFAULT_KEYBOARD_BINDINGS.map(b => remapped && b.code === code ? { ...b, code: 'KeyJ' } : b);
    const actual = new ObliqueWorldScene({
      feed: { readFrame: () => EMPTY_RENDER_FRAME },
      keyValueStore: { getItem: name => name === 'lockstate.settings.input' ? JSON.stringify({ version: 1, keyboardBindings: bindings }) : null, setItem() {} },
      buildTool: { isArmed: () => tool === 'wall', usesSquareFootprint: () => true, place() {}, targetSquares: target, placeSquares: place },
      roomTool: { isArmed: () => tool === 'room', isRemoving: () => false, target, place },
      objectTool: { isArmed: () => tool.startsWith('object'), isRemoving: () => false, footprint: () => footprint, target, place },
    });
    Reflect.set(actual, 'loadCatalogTextures', async () => undefined);
    Reflect.set(actual, 'loadFloorTextures', async () => undefined);
    Reflect.set(actual, 'repaint', () => undefined);
    actual.create(); await actual.ready();
    actual.restoreCameraView({ centre: { x: 1024, y: 1024 }, zoom: 1.25 });
    const initial = actual.cameraPose;
    const press = { x: 15.375 * 64, y: 15.25 * 64 };
    const endpoint = project({ x: 20.375 * 64, y: 17.25 * 64 }, initial);
    input.handlers.get('pointerdown')!(pointer(project(press, initial)));
    input.handlers.get('pointermove')!(pointer(endpoint));
    const previous = input.layers[3]!.polygons.map(polygon => polygon.map(point => ({ ...point })));
    key('keydown', remapped ? 'KeyJ' : code);
    actual.update(0, 400);
    key('keyup', remapped ? 'KeyJ' : code);
    const changed = actual.cameraPose;
    const wantedAngle = axis === 'elevationRadians' ? Math.min(80 * Math.PI / 180, Math.max(20 * Math.PI / 180, initial[axis] + direction * 0.6)) : initial[axis] + direction * 0.6;
    expect(changed[axis]).toBeCloseTo(wantedAngle, 10);
    const current = unproject(endpoint, changed);
    const tile = { x: Math.floor(current.x / 64), y: Math.floor(current.y / 64) };
    let rect: { tileX: number; tileY: number; width: number; height: number };
    let expected: unknown;
    if (tool === 'wall') {
      const horizontal = Math.abs(tile.x - 15) >= Math.abs(tile.y - 15);
      const end = horizontal ? tile.x : tile.y;
      expected = Array.from({ length: Math.abs(end - 15) + 1 }, (_, i) => horizontal
        ? { x: 15 + Math.sign(end - 15) * i, y: 15 } : { x: 15, y: 15 + Math.sign(end - 15) * i });
      rect = { tileX: 0, tileY: 0, width: 0, height: 0 };
    } else {
      rect = tool === 'room'
        ? { tileX: Math.min(15, tile.x), tileY: Math.min(15, tile.y), width: Math.abs(tile.x - 15) + 1, height: Math.abs(tile.y - 15) + 1 }
        : { tileX: tile.x, tileY: tile.y, ...footprint };
      expected = rect;
    }
    expect(target).toHaveBeenLastCalledWith(expected);
    const rectangles = tool === 'wall' ? (expected as Array<Point>).map(p => ({ tileX: p.x, tileY: p.y, width: 1, height: 1 })) : [rect];
    const polygons = input.layers[3]!.polygons;
    expect(polygons).toHaveLength(rectangles.length);
    expect(polygons, 'the actual camera change must redraw the footprint corners').not.toEqual(previous);
    rectangles.forEach((r, index) => {
      const corners = [{ x: r.tileX * 64, y: r.tileY * 64 }, { x: (r.tileX + r.width) * 64, y: r.tileY * 64 },
        { x: (r.tileX + r.width) * 64, y: (r.tileY + r.height) * 64 }, { x: r.tileX * 64, y: (r.tileY + r.height) * 64 }];
      corners.forEach((corner, c) => {
        const wanted = project(corner, changed);
        expect(polygons[index]![c]!.x).toBeCloseTo(wanted.x, 8);
        expect(polygons[index]![c]!.y).toBeCloseTo(wanted.y, 8);
      });
    });
    expect(place).not.toHaveBeenCalled();
    actual.update(1, 400);
    expect(actual.cameraPose).toEqual(changed);
    input.handlers.get('pointerup')!(pointer(endpoint, 0, 0));
    if (tool === 'wall' || tool === 'room') expect(place).toHaveBeenCalledExactlyOnceWith(expected);
    else {
      const fx = current.x / 64 - tile.x, fy = current.y / 64 - tile.y;
      const edge = Math.min(fy, 1 - fy) <= Math.min(fx, 1 - fx) ? 'north' : 'west';
      expect(place).toHaveBeenCalledExactlyOnceWith({ tileX: tile.x, tileY: tile.y, edge });
    }
  },
);
