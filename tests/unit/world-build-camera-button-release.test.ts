import { readFileSync } from 'node:fs';
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
  return { commands, sent, submitted: () => sent.filter(message => message.kind === 'simulation/submit-command') };
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
  return { actors, actual, mouse, pointer, roomReports, tools: { wall, object, room } };
}
for (const tool of ['wall', 'object', 'room'] as const) {
  for (const mode of ['world', 'oblique'] as const) {
    for (const outside of [false, true]) it(`${mode}/${tool}/${outside ? 'outside' : 'canvas'}: a middle-button release cannot commit the still-held left construction press`, async () => {
      const h = await setup(mode, tool);
      h.mouse('down', 0, 1); h.mouse('move', 0, 1, 920);
      h.mouse('down', 1, 5); h.mouse('move', 1, 5, 940);
      h.mouse('up', 1, 1, 940, outside);
      expect(h.pointer.primaryDown).toBe(true); expect(h.pointer.buttons).toBe(1);
      console.log('ACTUAL_CHORD_RELEASE', JSON.stringify({ mode, tool, outside, primaryDown: h.pointer.primaryDown, buttons: h.pointer.buttons, commands: h.actors.submitted().map(message => message.payload.command.data), roomReports: h.roomReports }));
      expect(h.roomReports, 'room completion must wait for its primary release before the HUD offers explicit confirmation').toHaveLength(0);
      expect(h.actors.submitted(), 'the real main/worker path must stay empty until the primary construction button is released').toHaveLength(0);
      h.mouse('up', 0, 0, 940);
      expect(tool === 'room' ? h.roomReports.length : h.actors.submitted().length).toBeGreaterThan(0);
      const finishedView = h.actual.captureCameraView(); h.mouse('move', 0, 0, 960);
      expect(h.actual.captureCameraView()).toEqual(finishedView); // released middle cannot leave a lingering pan
    });
    it(`${mode}/${tool}: middle camera gesture alone sends no construction command and a fresh left gesture still works`, async () => {
      const h = await setup(mode, tool); const before = h.actual.captureCameraView();
      h.mouse('down', 1, 4); h.mouse('move', 1, 4, 980); h.mouse('up', 1, 0, 980);
      expect(h.actual.captureCameraView()).not.toEqual(before); expect(h.actors.submitted()).toHaveLength(0);
      h.mouse('down', 0, 1); h.mouse('move', 0, 1, 920); h.mouse('up', 0, 0, 920);
      expect(tool === 'room' ? h.roomReports.length : h.actors.submitted().length).toBeGreaterThan(0);
    });
  }
}

for (const tool of ['wall', 'object', 'room'] as const) {
  for (const cancel of ['Escape', 'blur']) it(`World/${tool}: ${cancel} cancels a held chord before either remaining release`, async () => {
    const h = await setup('world', tool); h.mouse('down', 0, 1); h.mouse('down', 1, 5);
    if (cancel === 'blur') window.dispatchEvent(new Event('blur'));
    else {
      window.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape', code: 'Escape' }));
      window.dispatchEvent(Object.assign(new Event('keyup'), { key: 'Escape', code: 'Escape' }));
    }
    h.mouse('up', 1, 1); h.mouse('up', 0, 0);
    expect(h.actors.submitted()).toHaveLength(0); expect(h.roomReports).toHaveLength(0);
  });
  it(`World/${tool}: a genuine single touch still completes its owning gesture`, async () => {
    const h = await setup('world', tool);
    const touch = new Pointer(h.pointer.manager, 1);
    Reflect.set(h.actual.input.manager, 'pointers', [h.pointer, touch]);
    const contact = { identifier: 1, target: h.actual.game.canvas, pageX: 900, pageY: 460 } as unknown as Touch;
    const event = { timeStamp: 1 } as TouchEvent;
    touch.touchstart(contact, event); plumbing.handlers.get('pointerdown')!(touch);
    touch.touchend(contact, event); plumbing.handlers.get('pointerup')!(touch);
    expect(touch.wasTouch).toBe(true); expect(tool === 'room' ? h.roomReports : h.actors.submitted()).toHaveLength(1);
  });
  it(`World/${tool}: second real touch arrival cancels construction before either release`, async () => {
    const h = await setup('world', tool);
    const first = new Pointer(h.pointer.manager, 1), second = new Pointer(h.pointer.manager, 2);
    Reflect.set(h.actual.input.manager, 'pointers', [h.pointer, first, second]);
    const contact = { identifier: 1, target: h.actual.game.canvas, pageX: 900, pageY: 460 } as unknown as Touch;
    const another = { ...contact, identifier: 2, pageX: 920 } as Touch;
    const event = { timeStamp: 1 } as TouchEvent;
    first.touchstart(contact, event); plumbing.handlers.get('pointerdown')!(first);
    second.touchstart(another, event); plumbing.handlers.get('pointerdown')!(second);
    first.touchend(contact, event); plumbing.handlers.get('pointerup')!(first);
    second.touchend(another, event); plumbing.handlers.get('pointerup')!(second);
    expect(h.actors.submitted()).toHaveLength(0); expect(h.roomReports).toHaveLength(0);
  });
}
