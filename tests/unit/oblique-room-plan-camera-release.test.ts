import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import type Phaser from 'phaser';
import { afterEach, expect, it, vi } from 'vitest';
import { ObliqueWorldScene } from '../../src/rendering/scene/oblique-world-scene';
import { EMPTY_RENDER_FRAME } from '../../src/rendering/feed/render-feed';
import { RoomTemplateTool } from '../../src/ui/room-template-tool';
import { installRoomTemplateWorldBridge } from '../../src/ui/room-template-world-bridge';
import { createSimulationRoomTemplatePreflight, createSimulationRoomTemplateQuote } from '../../src/ui/simulation-room-template-port';
import { groundToScreen, screenToGround } from '../../src/rendering/camera/oblique-projection';
import { SimulationCommandSender } from '../../src/ui/simulation-commands';
import { SimulationWorkerStateMachine } from '../../src/simulation/worker/state-machine';
import type { MainToWorkerMessage, WorkerToMainMessage } from '../../src/simulation/protocol/types';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, SESSION_SNAPSHOT_SCHEMA_ID, SESSION_SNAPSHOT_SCHEMA_VERSION } from '../../src/simulation/runtime/restore-session';

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
    readonly game = { canvas: new Surface() };
  }
  return { default: { Scene, Scenes: { Events: { SHUTDOWN: 'shutdown' } } } };
});
afterEach(() => { plumbing.handlers.clear(); vi.unstubAllGlobals(); });
const require = createRequire(import.meta.url);
const phaserSource = resolve(dirname(require.resolve('phaser')), '../src');
vi.stubGlobal('window', new EventTarget());
type NativePointer = Phaser.Input.Pointer & { down(event: MouseEvent): void; up(event: MouseEvent): void; move(event: MouseEvent): void; touchstart(touch: Touch, event: TouchEvent): void; touchend(touch: Touch, event: TouchEvent): void };
const Pointer = require(resolve(phaserSource, 'input/Pointer.js')) as new (manager: Phaser.Input.InputManager, id: number) => NativePointer;
const pluginSource = readFileSync(resolve(phaserSource, 'input/InputPlugin.js'), 'utf8');
const upBody = pluginSource.match(/processUpEvents: function \(pointer\)\r?\n    (\{[\s\S]*?\r?\n    \}),/);
if (upBody === null) throw Error('Actual Phaser release dispatch absent');
const actualUp = new Function('Events', `return function(pointer) ${upBody[1]}`)(require(resolve(phaserSource, 'input/events/index.js'))) as (this: unknown, pointer: Phaser.Input.Pointer) => void;

function worker() {
  const listeners: ((message: WorkerToMainMessage) => void)[] = [], sent: MainToWorkerMessage[] = [];
  const machine = new SimulationWorkerStateMachine({ postMessage: (message: WorkerToMainMessage) => listeners.forEach(listener => listener(message)) }, 'button-release', () => 0);
  const channel = { addListener: (listener: (message: WorkerToMainMessage) => void) => listeners.push(listener), send: (message: MainToWorkerMessage) => { sent.push(message); machine.handleMessage(message); } };
  const commands = new SimulationCommandSender(channel);
  const snapshot = captureSessionSnapshot(createNewSimulationRuntime(73));
  channel.send({ protocolVersion: 1, messageId: 'init', kind: 'simulation/initialize', payload: { sessionId: 'button-release', source: { kind: 'snapshot', snapshot: {
    transport: 'structured-clone', schemaId: SESSION_SNAPSHOT_SCHEMA_ID, schemaVersion: SESSION_SNAPSHOT_SCHEMA_VERSION, data: snapshot as unknown as null,
  } } } });
  channel.send({ protocolVersion: 1, messageId: 'baseline', kind: 'simulation/request-snapshot', payload: { reason: 'consistency-check' } });
  return { channel, commands, sent, submitted: () => sent.filter(message => message.kind === 'simulation/submit-command') };
}

class Surface extends EventTarget {
  style: Record<string, string> = {}; dataset: Record<string, string> = {}; className = ''; hidden = false;
  width = 1920; height = 1080; namespaceURI = 'http://www.w3.org/2000/svg'; textContent = '';
  children: Surface[] = []; parentElement = { append: (child: Surface) => this.children.push(child) };
  append(...children: Surface[]) { this.children.push(...children); }
  remove() {} setAttribute() {} replaceChildren(...children: Surface[]) { this.children = children; }
  getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, right: 1920, bottom: 1080, width: 1920, height: 1080 }; }
}
const cases = [1, 2].flatMap(ratio => [false, true].flatMap(outside => [1, 2].map(button => ({ ratio, outside, button }))));
it.each(cases)('armed mirrored q1 template survives camera button$button release outside=$outside CSSratio$ratio and fresh placement remains possible', async ({ ratio, outside, button }) => {
  const page = new EventTarget(); const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('window', page); vi.stubGlobal('document', { activeElement: null,
    createElement: () => new Surface(), createElementNS: () => new Surface() });
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { frames.push(fn); return frames.length; });
  const actual = new ObliqueWorldScene({ feed: { readFrame: () => EMPTY_RENDER_FRAME }, keyValueStore: { getItem: () => null, setItem: () => undefined } });
  Reflect.set(actual, 'loadCatalogTextures', async () => undefined); Reflect.set(actual, 'loadFloorTextures', async () => undefined);
  Reflect.set(actual, 'repaint', () => undefined);
  actual.create(); await actual.ready();
  actual.restoreCameraView({ centre: { x: 12 * 64, y: 12 * 64 }, zoom: 1.25, yawRadians: Math.PI / 6, elevationRadians: Math.PI / 3 });
  const state = worker();
  const tool = new RoomTemplateTool({ preflight: createSimulationRoomTemplatePreflight(state.channel), quote: createSimulationRoomTemplateQuote(state.channel),
    place: async request => { state.commands.submit({ type: 'PlaceRoomTemplate', ...request }); } });
  tool.select('cell-basic', true, 1); tool.arm(); const revision = tool.revision;
  const canvas = actual.game.canvas as unknown as Surface;
  canvas.getBoundingClientRect = () => ({ x: 100, y: 40, left: 100, top: 40, right: 100 + 1920 / ratio, bottom: 40 + 1080 / ratio, width: 1920 / ratio, height: 1080 / ratio });
  const dispose = installRoomTemplateWorldBridge(canvas as unknown as HTMLCanvasElement, tool, {
    tileSize: 64, pick: screen => { const point = screenToGround(screen, actual.cameraPose); return { x: Math.floor(point.x / 64), y: Math.floor(point.y / 64) }; },
    project: world => groundToScreen(world, actual.cameraPose), objectFootprint: () => undefined, label: () => '',
  });
  const pointer = new Pointer({ transformPointer(p: Phaser.Input.Pointer, x: number, y: number) { p.position.set(x, y); } } as unknown as Phaser.Input.InputManager, 0);
  function bridge(kind: string, buttons: number, released = button) {
    const event = Object.assign(new Event(kind, { cancelable: true }), { pointerId: 1, pointerType: 'mouse', button: released, buttons,
      clientX: 100 + pointer.x / ratio, clientY: 40 + pointer.y / ratio });
    canvas.dispatchEvent(event);
  }
  function mouse(kind: 'down' | 'up' | 'move', buttons: number, x: number, y: number, released = button) {
    const native = { button: released, buttons, pageX: x, pageY: y, target: outside && kind === 'up' ? page : canvas, timeStamp: 1 } as unknown as MouseEvent;
    if (kind === 'down') pointer.down(native); else if (kind === 'up') pointer.up(native); else pointer.move(native);
    if (kind === 'up') actualUp.call({ _temp: [], _eventData: { cancelled: false }, _eventContainer: {}, isActive: () => true,
      manager: { game: { canvas } }, emit: (name: string, value: Phaser.Input.Pointer) => plumbing.handlers.get(name)?.(value) }, pointer);
    else plumbing.handlers.get(kind === 'down' ? 'pointerdown' : 'pointermove')!(pointer);
    if (kind === 'move') bridge('pointermove', buttons);
  }
  const held = button === 1 ? 4 : 2;
  mouse('move', 0, 940, 510);
  const before = actual.captureCameraView(); mouse('down', held, 940, 510); mouse('move', held, 980, 490);
  expect(actual.captureCameraView()).not.toEqual(before);
  mouse('up', 0, 980, 490);
  const released = actual.captureCameraView(); mouse('move', 0, 1030, 480);
  expect(actual.captureCameraView()).toEqual(released);
  // The final wheel/tilt changes are legitimate input, and do not revive a released drag.
  plumbing.handlers.get('wheel')!(pointer, [], 0, -1);
  actual.setPoseRadians(actual.cameraPose.yawRadians, 75 * Math.PI / 180);
  const finalView = actual.captureCameraView(); mouse('move', 0, 1050, 470);
  expect(actual.captureCameraView()).toEqual(finalView);
  frames.shift()!(0); await Promise.resolve(); await Promise.resolve();
  expect(tool.isArmed()).toBe(true); expect(tool.revision).toBe(revision); expect(state.submitted()).toHaveLength(0);
  expect(state.sent.filter(m => m.kind === 'simulation/request-projection').length).toBeGreaterThan(0);
  // Fresh primary pointer press and release travels through the actual bridge/tool/worker.
  bridge('pointerdown', 1, 0); bridge('pointerup', 0, 0);
  await vi.waitFor(() => expect(state.submitted()).toHaveLength(1));
  expect(state.submitted()[0]!.payload.command.data).toMatchObject({ type: 'PlaceRoomTemplate', templateId: 'cell-basic', mirrorX: true, quarterTurns: 1 });
  dispose();
});
