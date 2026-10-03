import { readFileSync } from 'node:fs';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { dirname, resolve } from 'node:path';
import type Phaser from 'phaser';
import { afterEach, expect, it, vi } from 'vitest';
import { WorldScene } from '../../src/rendering/scene/world-scene';
import { ObliqueWorldScene } from '../../src/rendering/scene/oblique-world-scene';
import { LiveRendererSelection } from '../../src/rendering/scene/live-renderer-selection';
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
import type { RenderFeed } from '../../src/rendering/feed/render-feed';

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
const changed = [...source.matchAll(/changed: selection => (\{\r?\n    productionSceneSelection[\s\S]*?\r?\n  \}),/g)];
if (changed.length !== 1) throw Error('Expected one actual renderer changed callback');
const require = createRequire(import.meta.url);
const phaserSource = resolve(dirname(require.resolve('phaser')), '../src');
const components = require.resolve(resolve(phaserSource, 'gameobjects/components/index.js'));
const cached = require.cache[components];
let Camera: typeof Phaser.Cameras.Scene2D.Camera;
try {
  require.cache[components] = { id: components, filename: components, loaded: true, exports: { FilterList: class {} } } as NodeJS.Module;
  Camera = require(resolve(phaserSource, 'cameras/2d/Camera.js')) as typeof Phaser.Cameras.Scene2D.Camera;
} finally { if (cached === undefined) delete require.cache[components]; else require.cache[components] = cached; }

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
  return { channel, commands, held, sent, release() { delay = false; for (const message of held.splice(0)) for (const listener of listeners) listener(message); } };
}
function pointer(canvas: ElementStub, kind: string, x = 900) {
  const event = new Event(kind, { cancelable: true });
  Object.assign(event, { clientX: x, clientY: 460, pointerId: 7, button: 0, buttons: kind === 'pointerdown' ? 1 : 0 });
  // Mirror the native window-capture phase before canvas capture consumes it.
  Object.defineProperty(event, 'target', { value: canvas });
  window.dispatchEvent(event);
  canvas.dispatchEvent(event);
}
async function setup(initialMode: 'world' | 'oblique', mirrored: boolean, controls: { uiDuringGap?: boolean; oldRefused?: boolean; changedBounds?: boolean } = {}) {
  const frames: FrameRequestCallback[] = [], layers: ElementStub[] = [];
  const canvas = new ElementStub(); canvas.parentElement = { append: layer => layers.push(layer) };
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', { activeElement: null, createElement: () => new ElementStub(), createElementNS: () => new ElementStub() });
  vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => { frames.push(frame); return frames.length; });
  const options = { feed: {} as RenderFeed, keyValueStore: { getItem: () => null, setItem: () => undefined } };
  const world = new WorldScene(options);
  const camera = new Camera(0, 0, 1920, 1080); camera.setScroll(12 * 64 - 960, 12 * 64 - 540).setZoom(1.25); camera.preRender();
  Reflect.set(world.cameras, 'main', camera);
  const angled = new ObliqueWorldScene(options);
  Reflect.set(angled, 'pose', { target: { x: 12 * 64, y: 12 * 64 }, viewport: { width: 1920, height: 1080 }, zoom: 1.4, yawRadians: 35 * Math.PI / 180, elevationRadians: 65 * Math.PI / 180 });
  if (controls.oldRefused) {
    if (initialMode === 'world') { camera.setScroll(-4 * 64 - 960, -4 * 64 - 540); camera.preRender(); }
    else Reflect.set(angled, 'pose', { ...angled.cameraPose, target: { x: -4 * 64, y: -4 * 64 } });
  }
  const actors = worker();
  const tool = new RoomTemplateTool({ preflight: createSimulationRoomTemplatePreflight(actors.channel), quote: createSimulationRoomTemplateQuote(actors.channel),
    place: async request => actors.commands.submit({ type: 'PlaceRoomTemplate', ...request }) });
  tool.select('cell-basic', mirrored, 1); tool.arm();
  const main = new Function('worldScene', 'roomTemplateTool', 'appRoot', 'WorldScene', 'ObliqueWorldScene', 'RoomTemplatePreviewFitController', 'installRoomTemplateWorldBridge',
    'screenToGround', 'groundToScreen', 'computeObliqueFit', 'TILE_SIZE_PX', 'objectFootprintOf', 'localizer', 'formatRoomTemplateQuote',
    `let reinstallPlanGhost = () => {}; let withdrawPlanGhost = () => {}; let productionSceneSelection; const rendererHudChanged = () => {};
    ${installBody}
    const changed = selection => ${changed[0]![1]};
    return { changed, withdraw: () => withdrawPlanGhost() };`)
    (initialMode === 'world' ? world : angled, tool, { querySelector: (selector: string) => selector === 'canvas' ? canvas : undefined }, WorldScene, ObliqueWorldScene,
      RoomTemplatePreviewFitController, installRoomTemplateWorldBridge, screenToGround, groundToScreen, computeObliqueFit, 64, () => undefined,
      { format: (key: string) => key }, (_localizer: unknown, quote: unknown) => JSON.stringify(quote)) as { changed: (value: unknown) => void; withdraw: () => void };
  let expectedOrigin: { x: number; y: number } | undefined;
  const independentPick = (scene: WorldScene | ObliqueWorldScene) => {
    const r = canvas.getBoundingClientRect();
    const sx = (900 - r.x) * canvas.width / r.width, sy = (460 - r.y) * canvas.height / r.height;
    if (scene instanceof WorldScene) {
      // Independently invert the rendered affine matrix, rather than main's picker.
      const m = scene.cameras.main.matrixCombined; const det = m.a * m.d - m.b * m.c;
      const x = sx - m.e, y = sy - m.f;
      return { x: Math.floor((m.d * x - m.c * y) / det / 64), y: Math.floor((-m.b * x + m.a * y) / det / 64) };
    }
    const p = scene.cameraPose;
    const u = (sx - p.viewport.width / 2) / p.zoom;
    const v = (sy - p.viewport.height / 2) / p.zoom / Math.sin(p.elevationRadians);
    const c = Math.cos(p.yawRadians), n = Math.sin(p.yawRadians);
    return { x: Math.floor((p.target.x + u * c + v * n) / 64), y: Math.floor((p.target.y - u * n + v * c) / 64) };
  };
  const switcher = new LiveRendererSelection({ mode: initialMode, scene: initialMode === 'world' ? world : angled }, {
    prepare: async mode => mode === 'world' ? world : angled, activate: async () => {
      if (controls.changedBounds) canvas.rect = { x: 30, y: 20, width: 960, height: 540 };
      if (controls.uiDuringGap) {
        const event = new Event('pointermove');
        Object.assign(event, { clientX: 100, clientY: 100 });
        Object.defineProperty(event, 'target', { value: new ElementStub() });
        window.dispatchEvent(event);
      }
    }, deactivate: main.withdraw, changed: value => { expectedOrigin = independentPick(value.scene); main.changed(value); }, unavailable: error => { throw error; },
  });
  const paint = async () => { for (const frame of frames.splice(0)) frame(0); await new Promise<void>(resolve => setImmediate(resolve)); };
  pointer(canvas, 'pointermove'); await paint();
  expect(actors.held).toHaveLength(1);
  const actual = actors.held[0]!;
  expect(actual.kind).toBe('simulation/projection');
  if (actual.kind === 'simulation/projection') expect(actual.payload.view?.data).toMatchObject({ ok: !controls.oldRefused });
  expect(layers.at(-1)!.hidden).toBe(false);
  expect(layers.at(-1)!.children[0]!.children).toHaveLength(28);
  await switcher.select(initialMode === 'world' ? 'oblique' : 'world');
  actors.release(); await paint(); await paint();
  expect(layers[0]!.removed).toBe(true); expect(tool.isArmed()).toBe(true);
  return { canvas, tool, actors, layers, paint, expectedOrigin };
}

for (const initialMode of ['world', 'oblique'] as const) for (const mirrored of [false, true]) {
  it(`${initialMode}→replacement rotated${mirrored ? '/mirrored' : ''} plan retains physical map cursor despite old worker reply`, async () => {
    const h = await setup(initialMode, mirrored);
    expect(h.layers.at(-1)!.hidden, 'current renderer must show the current armed whole-square plan without physical mouse movement').toBe(false);
    expect(h.layers.at(-1)!.children[0]!.children).toHaveLength(28);
    expect(h.layers.at(-1)!.dataset.ready).toBe('clear');
    const requests = h.actors.sent.filter(message => message.kind === 'simulation/request-projection' && message.payload.projectionId === 'world/room-template-preflight');
    expect(requests.length).toBeGreaterThanOrEqual(2);
    expect(requests.at(-1)?.payload).toMatchObject({ target: { origin: h.expectedOrigin, quarterTurns: 1, ...(mirrored ? { mirrorX: true } : {}) } });
    pointer(h.canvas, 'pointerdown'); pointer(h.canvas, 'pointerup');
    await h.paint(); await h.paint();
    const commands = h.actors.sent.filter(message => message.kind === 'simulation/submit-command');
    expect(commands).toHaveLength(1);
    expect(commands[0]!.payload).toMatchObject({ command: { data: { type: 'PlaceRoomTemplate', origin: h.expectedOrigin, quarterTurns: 1, ...(mirrored ? { mirrorX: true } : {}) } } });
    expect(h.tool.isArmed()).toBe(false);
  });
  it(`${initialMode}→replacement rotated${mirrored ? '/mirrored' : ''}: physical movement restores current legal preflight and command`, async () => {
    const h = await setup(initialMode, mirrored);
    pointer(h.canvas, 'pointermove', 902); await h.paint(); await h.paint();
    expect(h.layers.at(-1)!.hidden).toBe(false);
    expect(h.layers.at(-1)!.dataset.ready).toBe('clear');
    expect(h.layers.at(-1)!.children[0]!.children).toHaveLength(28);
    pointer(h.canvas, 'pointerdown', 902); pointer(h.canvas, 'pointerup', 902);
    await h.paint(); await h.paint();
    const commands = h.actors.sent.filter(message => message.kind === 'simulation/submit-command');
    expect(commands).toHaveLength(1);
    const message = commands[0]!;
    if (message.kind === 'simulation/submit-command') expect(message.payload.command.data).toMatchObject({ type: 'PlaceRoomTemplate', templateId: 'cell-basic', quarterTurns: 1, ...(mirrored ? { mirrorX: true } : {}) });
    expect(h.tool.isArmed()).toBe(false);
  });
}

for (const initialMode of ['world', 'oblique'] as const) for (const mirrored of [false, true]) {
  it(`${initialMode}?replacement${mirrored ? '/mirrored' : ''}: old real refusal cannot hide or block the newly picked legal plan`, async () => {
    const h = await setup(initialMode, mirrored, { oldRefused: true });
    expect(h.layers.at(-1)!.hidden).toBe(false);
    expect(h.layers.at(-1)!.dataset.ready).toBe('clear');
    expect(h.layers.at(-1)!.children[0]!.children).toHaveLength(28);
    expect(h.actors.sent.filter(message => message.kind === 'simulation/submit-command')).toHaveLength(0);
  });
  it(`${initialMode}?replacement${mirrored ? '/mirrored' : ''}: real UI movement while bridges are withdrawn invalidates physical hover`, async () => {
    const h = await setup(initialMode, mirrored, { uiDuringGap: true });
    expect(h.layers.at(-1)!.hidden).toBe(true);
    expect(h.actors.sent.filter(message => message.kind === 'simulation/request-projection' && message.payload.projectionId === 'world/room-template-preflight')).toHaveLength(1);
    expect(h.actors.sent.filter(message => message.kind === 'simulation/submit-command')).toHaveLength(0);
    pointer(h.canvas, 'pointermove', 902); await h.paint(); await h.paint();
    expect(h.layers.at(-1)!.hidden).toBe(false); expect(h.layers.at(-1)!.dataset.ready).toBe('clear');
  });
  it(`${initialMode}?replacement${mirrored ? '/mirrored' : ''}: current canvas bounds convert retained physical coordinates anew`, async () => {
    const h = await setup(initialMode, mirrored, { changedBounds: true });
    expect(h.layers.at(-1)!.hidden).toBe(false); expect(h.layers.at(-1)!.dataset.ready).toBe('clear');
    const requests = h.actors.sent.filter(message => message.kind === 'simulation/request-projection' && message.payload.projectionId === 'world/room-template-preflight');
    expect(requests.at(-1)?.payload).toMatchObject({ target: { origin: h.expectedOrigin } });
  });
}
