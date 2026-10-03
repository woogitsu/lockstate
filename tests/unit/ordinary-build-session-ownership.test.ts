import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { SimulationWorkerChannel } from '../../src/simulation/worker/worker-channel';
import { WorkerPerSessionHost } from '../../src/persistence/session/worker-per-session-host';
import type { SimulationClient, WorkerMessageHandler } from '../../src/simulation/worker/client';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import type Phaser from 'phaser';
import { afterEach, expect, it, vi } from 'vitest';
import { WorldScene } from '../../src/rendering/scene/world-scene';
import { ObliqueWorldScene } from '../../src/rendering/scene/oblique-world-scene';
import { EMPTY_RENDER_FRAME } from '../../src/rendering/feed/render-feed';
import { BuildTool } from '../../src/ui/build-tool';
import { ObjectTool } from '../../src/ui/object-tool';
import { RoomTool } from '../../src/ui/room-tool';
import type { HudRoomGesture } from '../../src/ui/hud';
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

const source = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8');
const build = source.match(/case 'place-build-order': \{([\s\S]*?)\r?\n        \}\r?\n/);
const object = source.match(/case 'place-object':([\s\S]*?)\r?\n          return;/);
if (build === null || object === null) throw Error('Actual main command producer absent');
const producers = { wall: new Function('intent', 'commands', 'requireSimulation', build[1]!),
  object: new Function('intent', 'commands', 'requireSimulation', object[1]!) };
class InProcessClient {
  readonly listeners = new Set<WorkerMessageHandler>();
  readonly held: WorkerToMainMessage[] = [];
  readonly sent: MainToWorkerMessage[] = [];
  holdPreflight = false;
  terminated = false;
  readonly machine = new SimulationWorkerStateMachine({ postMessage: message => {
    if (this.holdPreflight && message.kind === 'simulation/projection'
      && message.payload.projectionId === 'world/room-template-preflight') this.held.push(message);
    else this.emit(message);
  } }, 'template-session-diagnostic', () => 0);
  addListener(listener: WorkerMessageHandler) { this.listeners.add(listener); }
  removeListener(listener: WorkerMessageHandler) { this.listeners.delete(listener); }
  send(message: MainToWorkerMessage) { this.sent.push(message); this.machine.handleMessage(message); }
  terminate() { this.terminated = true; }
  emit(message: WorkerToMainMessage) { for (const listener of this.listeners) listener(message); }
  release() { this.holdPreflight = false; for (const message of this.held.splice(0)) this.emit(message); }
}

const begin = source.indexOf('onWorkerAvailability: (available) => {');
const end = source.indexOf('\n      },', begin);
if (begin < 0 || end < 0) throw Error('Actual session callback absent');
const boundary = stripTypeScriptTypes(source.slice(begin, end + '\n      }'.length).replace(/^onWorkerAvailability: /, ''), { mode: 'strip' });
const hudSource = readFileSync(new URL('../../src/ui/hud/hud.ts', import.meta.url), 'utf8');
const unavailable = hudSource.match(/function setUnavailable\(notice: HudUnavailableNotice \| undefined\): void (\{[\s\S]*?\r?\n  \})/);
if (unavailable === null) throw Error('Actual HUD unavailable callback absent');
const hud = { setUnavailable: new Function('unavailable', 'unavailableText', 't', `return notice => ${unavailable[1]};`)({ hidden: false }, { textContent: '' }, (key: string) => key) };
function worker() {
  const clients: InProcessClient[] = [];
  const channel = new SimulationWorkerChannel(() => { const client = new InProcessClient(); clients.push(client); return client as unknown as SimulationClient; });
  channel.open(); const commands = new SimulationCommandSender(channel);
  let activeScene: WorldScene | ObliqueWorldScene | undefined;
  const host = new WorkerPerSessionHost(channel, { onWorkerAvailability: available => {
    const apply = new Function('roomTemplateTool', 'worldScene', 'ObliqueWorldScene', 'hud', 'SIMULATION_UNAVAILABLE_NOTICE', 'crashReporter', `return (${boundary});`)
      (undefined, activeScene, ObliqueWorldScene, hud, { labelKey: 'unavailable' }, undefined) as (available: boolean) => void;
    apply(available);
  } });
  return { commands, clients, host, setScene: (scene: WorldScene | ObliqueWorldScene) => { activeScene = scene; },
    submitted: () => clients.at(-1)!.sent.filter(message => message.kind === 'simulation/submit-command') };
}

type Tool = 'wall' | 'object' | 'room';
async function setup(mode: 'world' | 'oblique', selected: Tool) {
  vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('document', { activeElement: null });
  const actors = worker(); const wall = new BuildTool(), object = new ObjectTool(), room = new RoomTool();
  wall.setArmed(selected === 'wall', 'wall-brick', true);
  object.setArmed(selected === 'object', { definitionId: 'bed-wooden', footprint: { width: 1, height: 2 } });
  room.setArmed(selected === 'room', { roomId: 'room.yard' });
  const sender = (value: SimulationCommandSender) => value;
  wall.attachOrders(intent => producers.wall(intent, actors.commands, sender));
  object.attachGestures(intent => producers.object(intent, actors.commands, sender));
  // Rooms owns an explicit confirm step downstream. Observe the real report;
  // do not bypass that UI and pretend the scene automatically sends ZoneRoom.
  const roomReports: HudRoomGesture[] = [];
  room.attachGestures(intent => roomReports.push(intent));
  const options = { feed: { readFrame: () => EMPTY_RENDER_FRAME }, keyValueStore: { getItem: () => null, setItem: () => undefined }, buildTool: wall, objectTool: object, roomTool: room };
  const actual = mode === 'world' ? new WorldScene(options) : new ObliqueWorldScene(options);
  Reflect.set(actual, 'loadActorAtlases', async () => undefined); Reflect.set(actual, 'loadEnvironmentArt', async () => undefined);
  Reflect.set(actual, 'loadCatalogTextures', async () => undefined); Reflect.set(actual, 'loadFloorTextures', async () => undefined);
  Reflect.set(actual, 'repaint', () => undefined);
  if (actual instanceof WorldScene) { const camera = new Camera(0, 0, 1920, 1080); camera.setScroll(12 * 64 - 960, 12 * 64 - 540).setZoom(1.25); camera.preRender(); Reflect.set(actual.cameras, 'main', camera); }
  actual.create(); if (actual instanceof ObliqueWorldScene) { await actual.ready(); actual.restoreCameraView({ centre: { x: 12 * 64, y: 12 * 64 }, zoom: 1.25, yawRadians: Math.PI / 6, elevationRadians: Math.PI / 3 }); }
  const pointer = new Pointer({ transformPointer(p: Phaser.Input.Pointer, x: number, y: number) { p.position.set(x, y); } } as unknown as Phaser.Input.InputManager, 0);
  function mouse(kind: 'down' | 'up' | 'move', button: number, buttons: number, x = 900, outside = false) {
    const event = { button, buttons, pageX: x, pageY: 460, target: outside ? new EventTarget() : actual.game.canvas, timeStamp: 1 } as MouseEvent;
    if (kind === 'down') pointer.down(event); else if (kind === 'up') pointer.up(event); else pointer.move(event);
    const handler = plumbing.handlers.get(kind === 'down' ? 'pointerdown' : kind === 'up' ? 'pointerup' : 'pointermove')!;
    if (kind === 'up') actualUp.call({ _temp: [], _eventData: { cancelled: false }, _eventContainer: {},
      isActive: () => true, manager: { game: { canvas: actual.game.canvas } },
      emit: (kind: string, value: Phaser.Input.Pointer) => plumbing.handlers.get(kind)?.(value),
    }, pointer);
    else handler(pointer);
    if (actual instanceof WorldScene) actual.cameras.main.preRender(); return pointer;
  }
  actors.setScene(actual);
  await actors.host.startNew(73); await actors.host.capture();
  return { actors, actual, mouse, pointer, roomReports, tools: { wall, object, room } };
}

for (const mode of ['world', 'oblique'] as const) for (const operation of ['new', 'load'] as const) for (const tool of ['wall', 'object', 'room'] as const) {
  it(`${mode}/${operation}/${tool}: outgoing held gesture cannot report or submit into replacement worker`, async () => {
    const h = await setup(mode, tool);
    try {
      const saved = await h.actors.host.capture();
      h.mouse('down', 0, 1); h.mouse('move', 0, 1, 940);
      expect(h.pointer.primaryDown).toBe(true);
      if (operation === 'new') await h.actors.host.startNew(74); else await h.actors.host.startFromSnapshot(saved);
      const before = await h.actors.host.capture();
      expect(h.actors.clients).toHaveLength(2); expect(h.actors.clients[0]!.terminated).toBe(true);
      h.mouse('up', 0, 0, 940);
      const after = await h.actors.host.capture();
      console.log('ACTUAL_SESSION_OLD_PRIMARY_RELEASE', JSON.stringify({ mode, operation, tool, commands: h.actors.submitted().map(m => m.payload.command.data), roomReports: h.roomReports,
        beforeOrders: before.construction.orders.length, afterOrders: after.construction.orders.length }));
      expect(h.actors.submitted(), 'the cancelled outgoing press must not enter the new worker').toHaveLength(0);
      expect(h.roomReports, 'old room rectangle must not become new-session pending confirmation').toHaveLength(0);
      expect(after).toEqual(before);
      h.mouse('down', 0, 1); h.mouse('up', 0, 0);
      expect(tool === 'room' ? h.roomReports.length : h.actors.submitted().length).toBeGreaterThan(0);
    } finally { await h.actors.host.stop(); }
  });
}

for (const mode of ['world', 'oblique'] as const) for (const tool of ['wall', 'object', 'room'] as const) {
  it(`${mode}/${tool}: ordinary same-session held primary release remains legal`, async () => {
    const h = await setup(mode, tool);
    try {
      h.mouse('down', 0, 1); h.mouse('move', 0, 1, 940); h.mouse('up', 0, 0, 940);
      expect(tool === 'room' ? h.roomReports : h.actors.submitted()).toHaveLength(tool === 'wall' && mode === 'oblique' ? 2 : 1);
    } finally { await h.actors.host.stop(); }
  });
  for (const operation of ['new', 'load'] as const) it(`${mode}/${operation}/${tool}: a fresh replacement-session press remains legal`, async () => {
    const h = await setup(mode, tool);
    try {
      const saved = await h.actors.host.capture();
      if (operation === 'new') await h.actors.host.startNew(74); else await h.actors.host.startFromSnapshot(saved);
      await h.actors.host.capture(); h.mouse('down', 0, 1); h.mouse('up', 0, 0);
      expect(tool === 'room' ? h.roomReports : h.actors.submitted()).toHaveLength(1);
    } finally { await h.actors.host.stop(); }
  });
}
