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
  parentElement: { append: (node: ElementStub) => void } | undefined;
  append(...nodes: ElementStub[]) { this.children.push(...nodes); }
  replaceChildren(...nodes: ElementStub[]) { this.children = nodes; }
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  remove() { this.removed = true; }
  getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, right: this.width, bottom: this.height, width: this.width, height: this.height }; }
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
  canvas.dispatchEvent(event);
}
async function setup(initialMode: 'world' | 'oblique', mirrored: boolean) {
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
  const switcher = new LiveRendererSelection({ mode: initialMode, scene: initialMode === 'world' ? world : angled }, {
    prepare: async mode => mode === 'world' ? world : angled, activate: async () => {}, deactivate: main.withdraw, changed: main.changed, unavailable: error => { throw error; },
  });
  const paint = async () => { for (const frame of frames.splice(0)) frame(0); await new Promise<void>(resolve => setImmediate(resolve)); };
  pointer(canvas, 'pointermove'); await paint();
  expect(actors.held).toHaveLength(1);
  const actual = actors.held[0]!;
  expect(actual.kind).toBe('simulation/projection');
  if (actual.kind === 'simulation/projection') expect(actual.payload.view?.data).toEqual({ ok: true });
  expect(layers.at(-1)!.hidden).toBe(false);
  expect(layers.at(-1)!.children[0]!.children).toHaveLength(28);
  await switcher.select(initialMode === 'world' ? 'oblique' : 'world');
  actors.release(); await paint(); await paint();
  expect(layers[0]!.removed).toBe(true); expect(tool.isArmed()).toBe(true);
  return { canvas, tool, actors, layers, paint };
}

for (const initialMode of ['world', 'oblique'] as const) for (const mirrored of [false, true]) {
  it(`${initialMode}→replacement rotated${mirrored ? '/mirrored' : ''} plan retains physical map cursor despite old worker reply`, async () => {
    const h = await setup(initialMode, mirrored);
    expect(h.layers.at(-1)!.hidden, 'current renderer must show the current armed whole-square plan without physical mouse movement').toBe(false);
    expect(h.layers.at(-1)!.children[0]!.children).toHaveLength(28);
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
