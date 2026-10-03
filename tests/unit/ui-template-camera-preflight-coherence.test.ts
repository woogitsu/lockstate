import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { afterEach, expect, it, vi } from 'vitest';
import { WorldScene } from '../../src/rendering/scene/world-scene';
import { ObliqueWorldScene } from '../../src/rendering/scene/oblique-world-scene';
import { RoomTemplateTool } from '../../src/ui/room-template-tool';
import { RoomTemplatePreviewFitController } from '../../src/ui/room-template-preview-fit';
import { installRoomTemplateWorldBridge } from '../../src/ui/room-template-world-bridge';
import { groundToScreen, screenToGround } from '../../src/rendering/camera/oblique-projection';
import { computeObliqueFit } from '../../src/rendering/camera/oblique-fit';
import { createSimulationRoomTemplatePreflight, createSimulationRoomTemplateQuote } from '../../src/ui/simulation-room-template-port';
import { SimulationCommandSender } from '../../src/ui/simulation-commands';
import { SimulationWorkerStateMachine } from '../../src/simulation/worker/state-machine';
import type { MainToWorkerMessage, WorkerToMainMessage } from '../../src/simulation/protocol/types';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, SESSION_SNAPSHOT_SCHEMA_ID, SESSION_SNAPSHOT_SCHEMA_VERSION } from '../../src/simulation/runtime/restore-session';
import { EMPTY_RENDER_FRAME } from '../../src/rendering/feed/render-feed';
import { BUILDABLE_REGISTRY } from '../../src/simulation/construction/definition';
import { defaultObjectRegistry } from '../../src/content/object-catalog';

vi.mock('phaser', () => ({ default: { Scene: class { readonly cameras = { main: {} }; readonly scale = { displayScale: { x: 1, y: 1 } }; } } }));
afterEach(() => vi.unstubAllGlobals());
class ElementStub extends EventTarget {
  override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean) {
    super.addEventListener(type, listener, typeof options === 'boolean' ? { capture: options } : options);
  }
  override removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean) {
    // Node EventTarget's boolean removal does not model DOM capture matching.
    // Preserve browser capture semantics in the plumbing, not stale listeners.
    super.removeEventListener(type, listener, typeof options === 'boolean' ? { capture: options } : options);
  }
  style: Record<string, string> = {}; dataset: Record<string, string> = {}; hidden = false;
  children: ElementStub[] = []; attributes = new Map<string, string>(); className = ''; textContent = '';
  namespaceURI = 'http://www.w3.org/2000/svg'; width = 1920; height = 1080; removed = false;
  rect = { x: 0, y: 0, width: 1920, height: 1080 };
  parentElement: { append: (node: ElementStub) => void } | undefined;
  append(...nodes: ElementStub[]) { this.children.push(...nodes); }
  replaceChildren(...nodes: ElementStub[]) { this.children = nodes; }
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  remove() { this.removed = true; }
  getBoundingClientRect() { const r = this.rect; return { ...r, left: r.x, top: r.y, right: r.x + r.width, bottom: r.y + r.height }; }
}
const source = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8');
const start = source.lastIndexOf('if (roomTemplateTool !== undefined) {');
const end = source.indexOf('// The save panel is laid out', start);
if (start < 0 || end < 0) throw Error('Actual main ghost-install producer missing');
const installBody = stripTypeScriptTypes(source.slice(start, end));
function worker() {
  const listeners: ((message: WorkerToMainMessage) => void)[] = [];
  const held: WorkerToMainMessage[] = []; const sent: MainToWorkerMessage[] = [];
  let delay = true;
  const machine = new SimulationWorkerStateMachine({ postMessage(message: WorkerToMainMessage) {
    if (delay && message.kind === 'simulation/projection' && message.payload.projectionId === 'world/room-template-preflight') held.push(message);
    else for (const listener of listeners) listener(message);
  } }, 'stationary-renderer-source-audit', () => 0);
  const channel = { addListener: (listener: (message: WorkerToMainMessage) => void) => listeners.push(listener),
    send: (message: MainToWorkerMessage) => { sent.push(message); machine.handleMessage(message); } };
  const commands = new SimulationCommandSender(channel);
  const snapshot = captureSessionSnapshot(createNewSimulationRuntime(73));
  channel.send({ protocolVersion: 1, messageId: 'init', kind: 'simulation/initialize', payload: { sessionId: 'hover-renderer-audit', source: {
    kind: 'snapshot', snapshot: { transport: 'structured-clone', schemaId: SESSION_SNAPSHOT_SCHEMA_ID, schemaVersion: SESSION_SNAPSHOT_SCHEMA_VERSION, data: snapshot as unknown as null },
  } } });
  channel.send({ protocolVersion: 1, messageId: 'baseline', kind: 'simulation/request-snapshot', payload: { reason: 'consistency-check' } });
  return { channel, commands, held, sent, releaseOne() { const message = held.shift(); if (message !== undefined) for (const listener of listeners) listener(message); }, release() { delay = false; for (const message of held.splice(0)) for (const listener of listeners) listener(message); } };
}

function footprint(id: string) {
  const objectId = BUILDABLE_REGISTRY.get(id)?.placesObjectId;
  const object = objectId === undefined ? undefined : defaultObjectRegistry.getById(objectId);
  return object === undefined ? undefined : { width: object.footprint.width, height: object.footprint.height };
}
function dispatch(canvas: ElementStub, type: string, point: { x: number; y: number }) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { clientX: point.x, clientY: point.y, pointerId: 7, button: 0, buttons: type === 'pointerdown' ? 1 : 0 });
  Object.defineProperty(event, 'target', { value: canvas }); window.dispatchEvent(event); canvas.dispatchEvent(event);
}
function inverse(point: { x: number; y: number }, pose: ObliqueWorldScene['cameraPose']) {
  // Independently solve the rotated/compressed ground plane, no production inverse.
  const u = (point.x - pose.viewport.width / 2) / pose.zoom;
  const v = (point.y - pose.viewport.height / 2) / (pose.zoom * Math.sin(pose.elevationRadians));
  return { x: pose.target.x + u * Math.cos(pose.yawRadians) + v * Math.sin(pose.yawRadians),
    y: pose.target.y - u * Math.sin(pose.yawRadians) + v * Math.cos(pose.yawRadians) };
}
function originAt(point: { x: number; y: number }, pose: ObliqueWorldScene['cameraPose']) {
  const p = inverse(point, pose); return { x: Math.floor(p.x / 64), y: Math.floor(p.y / 64) };
}
async function setup(mirrored: boolean, measuredCameraA = false) {
  const frames: FrameRequestCallback[] = [], layers: ElementStub[] = [];
  const canvas = new ElementStub(); canvas.parentElement = { append: layer => layers.push(layer) };
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', { activeElement: null, createElement: () => new ElementStub(), createElementNS: () => new ElementStub() });
  vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => { frames.push(frame); return frames.length; });
  const scene = new ObliqueWorldScene({ feed: { readFrame: () => EMPTY_RENDER_FRAME }, keyValueStore: { getItem: () => null, setItem: () => undefined } });
  Reflect.set(scene.cameras, 'main', { width: 1920, height: 1080 });
  Reflect.set(scene, 'pose', { target: { x: 12 * 64, y: 12 * 64 }, viewport: { width: 1920, height: 1080 }, zoom: 1.4, yawRadians: 35 * Math.PI / 180, elevationRadians: 65 * Math.PI / 180 });
  Reflect.set(scene, 'repaint', () => undefined);
  const actors = worker();
  const tool = new RoomTemplateTool({ preflight: createSimulationRoomTemplatePreflight(actors.channel), quote: createSimulationRoomTemplateQuote(actors.channel),
    objectFootprint: footprint, place: async request => actors.commands.submit({ type: 'PlaceRoomTemplate', ...request }) });
  tool.select('cell-basic', mirrored, 1); tool.arm();
  let uiScale = 1;
  const box = (left: number, top: number, width: number, height: number) => ({ getBoundingClientRect: () => ({ left, right: left + width, top, bottom: top + height }) });
  const ordinaryRoot = { querySelector: (selector: string) => selector === 'canvas' ? canvas : selector === '.hud__tabs' ? box(0, 130 * uiScale, 350 * uiScale, 200)
    : selector === '.hud__corner' ? box(0, 0, 350 * uiScale, 130 * uiScale) : selector === '.hud__rail' ? box(1920 - 250 * uiScale, 130 * uiScale, 250 * uiScale, 900)
    : selector === '.hud-strip' ? box(0, 0, 1920, 130 * uiScale) : undefined };
  const geometry = JSON.parse(readFileSync(new URL('../../docs/research/2026-10-04-camera-a-template-safe-area/actual-85f-ui200-geometry.json', import.meta.url), 'utf8')) as Record<string, { left: number; top: number; right: number; bottom: number; width: number; height: number }>;
  const measuredNames: Record<string, string> = { '.hud__tabs': 'tabs', '.hud__corner': 'corner', '.hud__rail': 'rail', '.hud-strip': 'strip', '.hud-camera-panel': 'panel', '.hud__refusal': 'band' };
  let cameraOpen = true;
  const root = measuredCameraA ? { querySelector: (selector: string) => selector === 'canvas' ? canvas
    : measuredNames[selector] === undefined ? undefined : { getBoundingClientRect: () => selector === '.hud-camera-panel' && !cameraOpen
      ? { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 } : geometry[measuredNames[selector]!]! } } : ordinaryRoot;
  const main = new Function('worldScene', 'roomTemplateTool', 'appRoot', 'WorldScene', 'ObliqueWorldScene', 'RoomTemplatePreviewFitController', 'installRoomTemplateWorldBridge',
    'screenToGround', 'groundToScreen', 'computeObliqueFit', 'renderFeed', 'TILE_SIZE_PX', 'objectFootprintOf', 'localizer', 'formatRoomTemplateQuote',
    `let reinstallPlanGhost = () => {}; let withdrawPlanGhost = () => {}; ${installBody} return { withdraw: () => withdrawPlanGhost() };`)
    (scene, tool, root, WorldScene, ObliqueWorldScene, RoomTemplatePreviewFitController, installRoomTemplateWorldBridge, screenToGround, groundToScreen, computeObliqueFit, { readFrame: () => EMPTY_RENDER_FRAME }, 64, footprint,
      { format: (key: string) => key }, (_localizer: unknown, quote: unknown) => JSON.stringify(quote)) as { withdraw: () => void };
  const callback = (name: string) => {
    const begin = source.indexOf(name + ': ');
    if (begin < 0 || source.indexOf(name + ': ', begin + 1) !== -1) throw Error('Actual unique camera callback missing: ' + name);
    const rest = source.slice(begin + name.length + 2), end = rest.match(/\r?\n {4,6}\},/);
    if (end?.index === undefined) throw Error('Actual camera callback end missing: ' + name);
    const body = rest.slice(0, end.index + end[0].length - 1);
    return new Function('worldScene', 'ObliqueWorldScene', 'rendererChanging', 'liveRendererSelection', `return (${stripTypeScriptTypes(body)});`)
      (scene, ObliqueWorldScene, false, { current: { scene } }) as (...args: unknown[]) => void;
  };
  const point = measuredCameraA ? { x: 1000, y: 1000 } : { x: 900, y: 460 }, initialPose = scene.cameraPose;
  const initialOrigin = originAt(point, initialPose);
  const paint = async () => { for (const frame of frames.splice(0)) frame(0); await new Promise<void>(resolve => setImmediate(resolve)); };
  dispatch(canvas, 'pointermove', point); dispatch(canvas, 'pointerdown', point); await paint();
  expect(actors.held).toHaveLength(1);
  expect(actors.held[0]!.payload).toMatchObject({ view: { data: { ok: true } } });
  if (!measuredCameraA) expect(scene.cameraPose).toEqual(initialPose); // Initial whole footprint is visible: no fit lock.
  return { canvas, scene, actors, tool, point, initialOrigin, paint, layer: () => layers.at(-1)!, setUiScale: () => { uiScale = 2; },
    zoom: callback('onCameraZoom'), pose: callback('onCameraPoseStep'), setCameraOpen: (open: boolean) => { cameraOpen = open; }, geometry, dispose: main.withdraw };
}

it('actual 85f CameraA geometry: whole mirrored q1 floor fits outside open controls and retains accepted anchor on pose/release', async () => {
  const h = await setup(true, true);
  try {
    h.actors.release(); await h.paint(); await h.paint();
    const panel = h.geometry['panel']!, band = h.geometry['band']!;
    const assertExposed = () => {
      expect(h.layer().dataset.ready).toBe('clear');
      const polygons = h.layer().children[0]!.children;
      expect(polygons).toHaveLength(28);
      const centers = polygons.map(polygon => {
        const points = polygon.attributes.get('points')!.split(' ').map(p => p.split(',').map(Number));
        for (const p of points) {
          expect(p[0]).toBeGreaterThanOrEqual(855.34375 - 0.01); expect(p[0]).toBeLessThanOrEqual(1184 + 0.01);
          expect(p[1]).toBeGreaterThanOrEqual(band.bottom + 8 - 0.01); expect(p[1]).toBeLessThanOrEqual(1072 + 0.01);
        }
        return { x: points.reduce((sum, p) => sum + p[0]!, 0) / 4, y: points.reduce((sum, p) => sum + p[1]!, 0) / 4 };
      });
      const covered = centers.filter(p => p.x > panel.left && p.x < panel.right && p.y > panel.top && p.y < panel.bottom);
      console.log('ACTUAL_85F_CAMERA_A_FIT', JSON.stringify({ origin: h.initialOrigin, cells: polygons.length, coveredCenters: covered.length, pose: h.scene.cameraPose }));
      expect(covered, 'visible CameraA must not cover fitted floor centers').toHaveLength(0);
      // Independent rectangle separation also rejects a floor edge crossing the
      // panel even if no corner or cell center happens to land inside it.
      for (const polygon of polygons) {
        const points = polygon.attributes.get('points')!.split(' ').map(p => p.split(',').map(Number));
        const left = Math.min(...points.map(p => p[0]!)), right = Math.max(...points.map(p => p[0]!));
        const top = Math.min(...points.map(p => p[1]!)), bottom = Math.max(...points.map(p => p[1]!));
        expect(right <= panel.left || left >= panel.right || bottom <= panel.top || top >= panel.bottom).toBe(true);
      }
    };
    assertExposed();
    expect(h.initialOrigin).toEqual({ x: 15, y: 16 });
    expect(await h.tool.quote()).toEqual({ orderCount: 20, materials: [{ itemId: 'item.brick', quantity: 35 }, { itemId: 'item.wood-plank', quantity: 2 }], catalogueCostMinorUnits: 1530 });
    h.setCameraOpen(false); await h.paint();
    h.setCameraOpen(true); h.pose('yaw', 1); await h.paint(); await h.paint();
    assertExposed();
    const requests = h.actors.sent.filter(m => m.kind === 'simulation/request-projection' && m.payload.projectionId === 'world/room-template-preflight');
    expect(requests.at(-1)?.payload).toMatchObject({ target: { origin: { x: 15, y: 16 }, mirrorX: true, quarterTurns: 1 } });
    expect(h.actors.sent.filter(m => m.kind === 'simulation/submit-command')).toHaveLength(0);
    dispatch(h.canvas, 'pointerup', h.point); await h.paint(); await h.paint();
    const commands = h.actors.sent.filter(m => m.kind === 'simulation/submit-command');
    expect(commands).toHaveLength(1);
    expect(commands[0]!.payload).toMatchObject({ command: { data: { type: 'PlaceRoomTemplate', origin: { x: 15, y: 16 }, mirrorX: true, quarterTurns: 1 } } });
    expect(h.tool.isArmed()).toBe(false);
  } finally { h.dispose(); }
});

for (const change of ['pose', 'zoom', 'resize', 'ui-scale'] as const) for (const mirrored of [false, true]) {
  it(`actual angled ${change}/${mirrored ? 'mirrored' : 'normal'}: pending old preflight, stationary primary release retains displayed footprint/quote`, async () => {
    const h = await setup(mirrored);
    try {
      if (change === 'pose') { h.pose('yaw', 1); h.pose('elevation', -1); }
      else if (change === 'zoom') h.zoom('in');
      else if (change === 'resize') {
        h.canvas.width = 2048; h.canvas.height = 1152; h.canvas.rect = { x: 0, y: 0, width: 2048, height: 1152 };
        Reflect.set(h.scene.cameras.main, 'width', 2048); Reflect.set(h.scene.cameras.main, 'height', 1152); h.scene.update(0, 0);
      } else h.setUiScale();
      const expected = originAt(h.point, h.scene.cameraPose);
      await h.paint();
      const requests = h.actors.sent.filter(message => message.kind === 'simulation/request-projection' && message.payload.projectionId === 'world/room-template-preflight');
      expect(requests.at(-1)?.payload).toMatchObject({ target: { origin: expected, quarterTurns: 1, ...(mirrored ? { mirrorX: true } : {}) } });
      const changedOrigin = expected.x !== h.initialOrigin.x || expected.y !== h.initialOrigin.y;
      if (changedOrigin) {
        expect(h.actors.held).toHaveLength(2); h.actors.releaseOne(); await h.paint();
        expect(h.layer().dataset.ready).toBe('checking');
      }
      h.actors.release(); await h.paint(); await h.paint();
      expect(h.layer().dataset.ready).toBe('clear');
      const quote = await h.tool.quote(); expect(quote?.catalogueCostMinorUnits).toBeGreaterThan(0);
      expect(h.layer().children[1]!.textContent).toContain(JSON.stringify(quote));
      const plan = h.tool.planAt(expected), polygons = h.layer().children[0]!.children;
      expect(polygons).toHaveLength(plan.width * plan.height);
      for (let index = 0; index < polygons.length; index++) {
        const polygon = polygons[index]!, tile = { x: expected.x + index % plan.width, y: expected.y + Math.floor(index / plan.width) };
        const corners = polygon.attributes.get('points')!.split(' ').map(p => p.split(',').map(Number));
        expect(corners).toHaveLength(4);
        for (let j = 0; j < 4; j++) {
          const p = inverse({ x: corners[j]![0]!, y: corners[j]![1]! }, h.scene.cameraPose);
          expect(p.x / 64).toBeCloseTo(tile.x + [0, 1, 1, 0][j]!, 7);
          expect(p.y / 64).toBeCloseTo(tile.y + [0, 0, 1, 1][j]!, 7);
        }
      }
      expect(h.actors.sent.filter(m => m.kind === 'simulation/submit-command')).toHaveLength(0);
      dispatch(h.canvas, 'pointerup', h.point); await h.paint(); await h.paint();
      const commands = h.actors.sent.filter(m => m.kind === 'simulation/submit-command');
      expect(commands).toHaveLength(1);
      expect(commands[0]!.payload).toMatchObject({ command: { data: { type: 'PlaceRoomTemplate', origin: expected, quarterTurns: 1, ...(mirrored ? { mirrorX: true } : {}) } } });
      expect(h.tool.isArmed()).toBe(false);
      console.log('ACTUAL_TEMPLATE_CAMERA_REVISION', JSON.stringify({ change, mirrored, initial: h.initialOrigin, expected, changedOrigin, quote, squares: polygons.length, commands: commands.map(m => m.payload.command.data) }));
    } finally { h.dispose(); }
  });
}
