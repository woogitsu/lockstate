import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import type Phaser from 'phaser';
import { afterEach, expect, it, vi } from 'vitest';
import { WorldScene } from '../../src/rendering/scene/world-scene';
import { ObliqueWorldScene } from '../../src/rendering/scene/oblique-world-scene';
import { EMPTY_RENDER_FRAME } from '../../src/rendering/feed/render-feed';
import { pressArm } from '../../src/ui/hud/tool-arming';
import { BUILDABLE_REGISTRY } from '../../src/simulation/construction';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
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

const hudSource = readFileSync(new URL('../../src/ui/hud/build-panel.ts', import.meta.url), 'utf8');
const marker = hudSource.indexOf('  const armButton: ActionButton = createActionButton(');
const activation = hudSource.slice(marker).match(/onActivate: \(\) => \{([\s\S]*?)\r?\n    \},/);
const armReport = hudSource.match(/const reportArmed = \(\): void => ([^\r\n]+);/);
const armCase = source.match(/case 'arm-build-tool': \{([\s\S]*?)\r?\n        \}\r?\n\r?\n        case 'arm-room-tool':/);
if (marker < 0 || activation === null || armReport === null || armCase === null) throw Error('Unique actual HUD/main arming callbacks absent');
const applyArm = new Function('intent', 'roomTemplateTool', 'tool', 'objects', 'objectFootprintOf', 'BUILDABLE_REGISTRY', 'worldScene', armCase[1]!);
function armButton(h: Awaited<ReturnType<typeof setup>>, selected: 'wall' | 'object' | 'room') {
  h.tools.wall.setArmed(false); h.tools.object.setArmed(false);
  h.tools.room.setArmed(false);
  if (selected === 'room') {
    const roomSource = readFileSync(new URL('../../src/ui/hud/rooms-panel.ts', import.meta.url), 'utf8');
    const marker = roomSource.indexOf('  const armButton: ActionButton = createActionButton(');
    const action = roomSource.slice(marker).match(/onActivate: \(\) => \{([\s\S]*?)\r?\n    \},/);
    const arm = source.match(/case 'arm-room-tool':([\s\S]*?)\r?\n        case 'set-clock':/);
    if (marker < 0 || action === null || arm === null) throw Error('Actual Rooms arming callback absent');
    const apply = new Function('intent', 'roomTemplateTool', 'rooms', 'worldScene', arm[1]!); const transitions: boolean[] = [];
    const options = { onArm: (armed: boolean, values: { roomId: string; removing: boolean }) => { transitions.push(armed); apply({ armed, ...values }, undefined, h.tools.room, h.actual); } };
    const activate = new Function('options', 'selectedId', 'paintActions', 'pressArm', `let armed=false; let removing=false; let drawingFolded=false; return () => {${action[1]}};`)(options, 'room.yard', () => undefined, pressArm) as () => void;
    activate(); return { activate, transitions };
  }
  const definitionId = selected === 'wall' ? 'wall-brick' : 'bed-wooden';
  const transitions: boolean[] = [];
  const objectFootprintOf = (id: string) => { const objectId = BUILDABLE_REGISTRY.get(id)?.placesObjectId;
    const found = objectId === undefined ? undefined : defaultObjectRegistry.getById(objectId); return found?.footprint; };
  const options = { onArm: (armed: boolean, definitionId: string, removing: boolean, quarterTurns: 0 | 1 | 2 | 3) => {
    transitions.push(armed); applyArm({ armed, definitionId, removing, quarterTurns }, undefined, h.tools.wall, h.tools.object, objectFootprintOf, BUILDABLE_REGISTRY, h.actual);
  } };
  const activate = new Function('options', 'selectedId', 'paintArmed',
    `let armed = false; let removing = false; let quarterTurns = 0;
     const reportArmed = () => ${armReport![1]};
     return () => {${activation![1]}};`)(options, definitionId, () => undefined) as () => void;
  activate(); return { activate, transitions };
}
for (const mode of ['world', 'oblique'] as const) for (const tool of ['wall', 'object', 'room'] as const) {
  it(`${mode}/${tool}: HUD cancel then re-arm before next render frame must not complete the cancelled old left press`, async () => {
    const h = await setup(mode, tool); const hud = armButton(h, tool);
    h.mouse('down', 0, 1); h.mouse('move', 0, 1, 940);
    hud.activate(); hud.activate();
    expect(hud.transitions).toEqual([true, false, true]); expect(h.pointer.primaryDown).toBe(true);
    // No update/frame occurs between these real HUD callbacks and the old release.
    h.mouse('up', 0, 0, 940);
    console.log('CANCEL_REARM_OLD_RELEASE', JSON.stringify({ mode, tool, transitions: hud.transitions, commands: h.actors.submitted().map(m => m.payload.command.data), roomReports: h.roomReports }));
    expect(h.roomReports, 'cancelled room rectangle must not reach pending confirmation').toHaveLength(0);
    expect(h.actors.submitted(), 'a cancelled old press cannot buy after re-arm without a fresh primary down').toHaveLength(0);
    h.mouse('down', 0, 1); h.mouse('up', 0, 0);
    expect(tool === 'room' ? h.roomReports.length : h.actors.submitted().length).toBeGreaterThan(0);
  });
  it(`${mode}/${tool}: HUD cancel alone prevents old release and fresh primary press after re-arm still works`, async () => {
    const h = await setup(mode, tool); const hud = armButton(h, tool);
    h.mouse('down', 0, 1); hud.activate(); h.mouse('up', 0, 0);
    expect(h.actors.submitted()).toHaveLength(0); expect(h.roomReports).toHaveLength(0); hud.activate(); h.mouse('down', 0, 1); h.mouse('up', 0, 0);
    expect(tool === 'room' ? h.roomReports.length : h.actors.submitted().length).toBeGreaterThan(0);
  });
  it(`${mode}/${tool}: ordinary fresh armed gesture submits its genuine command`, async () => {
    const h = await setup(mode, tool); armButton(h, tool);
    h.mouse('down', 0, 1); h.mouse('up', 0, 0);
    expect(tool === 'room' ? h.roomReports : h.actors.submitted()).toHaveLength(1);
  });
}

for (const [mode, button, buttons] of [['world', 1, 4], ['oblique', 1, 4], ['oblique', 2, 2]] as const) {
  it(`${mode}: HUD disarm/re-arm preserves active camera button${button} ownership without submitting construction`, async () => {
    const h = await setup(mode, 'wall'); const hud = armButton(h, 'wall');
    h.mouse('down', button, buttons); h.mouse('move', button, buttons, 930);
    const before = h.actual.captureCameraView(); hud.activate(); hud.activate();
    expect(h.actual.captureCameraView()).toEqual(before);
    h.mouse('move', button, buttons, 970);
    expect(h.actual.captureCameraView()).not.toEqual(before);
    expect(h.actors.submitted()).toHaveLength(0); expect(h.roomReports).toHaveLength(0);
    h.mouse('up', button, 0, 970);
  });
}
