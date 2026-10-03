import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type Phaser from 'phaser';
import { createRequire, stripTypeScriptTypes } from 'node:module';
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
import { captureSessionSnapshot, SESSION_SNAPSHOT_SCHEMA_ID, SESSION_SNAPSHOT_SCHEMA_VERSION, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { SimulationSnapshotFeed } from '../../src/rendering/feed/simulation-snapshot-feed';
import { EMPTY_RENDER_FRAME } from '../../src/rendering/feed/render-feed';
import { BUILDABLE_REGISTRY } from '../../src/simulation/construction/definition';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { createRoomTemplatePreview } from '../../src/ui/hud/room-template-preview';
import { formatRoomTemplateQuote } from '../../src/ui/hud/room-template-quote';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { packCommand } from '../../src/simulation/protocol/commands';
import type { RoomTemplateId } from '../../src/content/room-template-catalog';

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
  value = ''; checked = false; disabled = false; tabIndex = 0; id = ''; open = false;
  readonly classes = new Set<string>();
  readonly classList = { add: (name: string) => { this.classes.add(name); }, remove: (name: string) => { this.classes.delete(name); }, contains: (name: string) => this.classes.has(name) };
  children: ElementStub[] = []; attributes = new Map<string, string>(); className = ''; textContent = '';
  namespaceURI = 'http://www.w3.org/2000/svg'; width = 1920; height = 1080; removed = false;
  rect = { x: 0, y: 0, width: 1920, height: 1080 };
  parentElement: ElementStub | undefined;
  append(...nodes: ElementStub[]) { for (const node of nodes) node.parentElement = this; this.children.push(...nodes); }
  after(...nodes: ElementStub[]) { const parent = this.parentElement; if (parent === undefined) return; for (const node of nodes) node.parentElement = parent; parent.children.splice(parent.children.indexOf(this) + 1, 0, ...nodes); }
  focus() { Reflect.set(document, 'activeElement', this); }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatchEvent(new Event('close')); }
  replaceChildren(...nodes: ElementStub[]) { this.children = nodes; }
  setAttribute(key: string, value: string) { this.attributes.set(key, value); if (key === 'value') this.value = value; }
  remove() { this.removed = true; }
  getBoundingClientRect() { const r = this.rect; return { ...r, left: r.x, top: r.y, right: r.x + r.width, bottom: r.y + r.height }; }
}
const source = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8');
const start = source.lastIndexOf('if (roomTemplateTool !== undefined) {');
const end = source.indexOf('// The save panel is laid out', start);
if (start < 0 || end < 0) throw Error('Actual main ghost-install producer missing');
const installBody = stripTypeScriptTypes(source.slice(start, end));
const require = createRequire(import.meta.url);
const phaserSource = resolve(dirname(require.resolve('phaser')), '../src');
const components = require.resolve(resolve(phaserSource, 'gameobjects/components/index.js'));
const cached = require.cache[components];
let Camera: typeof Phaser.Cameras.Scene2D.Camera;
try {
  require.cache[components] = { id: components, filename: components, loaded: true, exports: { FilterList: class {} } } as NodeJS.Module;
  Camera = require(resolve(phaserSource, 'cameras/2d/Camera.js')) as typeof Phaser.Cameras.Scene2D.Camera;
} finally { if (cached === undefined) delete require.cache[components]; else require.cache[components] = cached; }

function worker(origin: { x: number; y: number }) {
  const listeners: ((message: WorkerToMainMessage) => void)[] = [];
  const held: WorkerToMainMessage[] = []; const sent: MainToWorkerMessage[] = [];
  let delay = false;
  const machine = new SimulationWorkerStateMachine({ postMessage(message: WorkerToMainMessage) {
    if (delay && message.kind === 'simulation/projection' && message.payload.projectionId === 'world/room-template-preflight') held.push(message);
    else for (const listener of listeners) listener(message);
  } }, 'stationary-renderer-source-audit', () => 0);
  const channel = { addListener: (listener: (message: WorkerToMainMessage) => void) => listeners.push(listener),
    send: (message: MainToWorkerMessage) => { sent.push(message); machine.handleMessage(message); } };
  const commands = new SimulationCommandSender(channel);
  const actualFeed = new SimulationSnapshotFeed(channel);
  const runtime = createNewSimulationRuntime(73);
  runtime.kernel.submitCommand('completed-seed',0,runtime.kernel.tick,packCommand({type:'PlaceRoomTemplate',templateId:'cell-basic',origin,quarterTurns:1}));
  let completed = false;
  for(let i=0;i<25000;i++) {runtime.kernel.step();if(runtime.roomTemplates.snapshot().pending.length===0&&runtime.construction.allOrders().every(o=>o.state==='completed')) {completed=true;break;}}
  expect(completed).toBe(true);expect(runtime.placedObjects.getSnapshot()).toHaveLength(2);expect(runtime.roomTemplates.snapshot().completed).toHaveLength(1);
  const snapshot = captureSessionSnapshot(runtime);
  channel.send({ protocolVersion: 1, messageId: 'init', kind: 'simulation/initialize', payload: { sessionId: 'hover-renderer-audit', source: {
    kind: 'snapshot', snapshot: { transport: 'structured-clone', schemaId: SESSION_SNAPSHOT_SCHEMA_ID, schemaVersion: SESSION_SNAPSHOT_SCHEMA_VERSION, data: snapshot as unknown as null },
  } } });
  channel.send({protocolVersion:1,messageId:'pause',kind:'simulation/set-clock',payload:{mode:'paused'}});
  channel.send({ protocolVersion: 1, messageId: 'baseline', kind: 'simulation/request-snapshot', payload: { reason: 'consistency-check' } });
  return { feed: actualFeed, channel, commands, held, sent, snapshot() {
    const id = 'read-' + sent.length; let result: SessionSnapshotBundle | undefined;
    const reader = (message: WorkerToMainMessage) => { if (message.kind === 'simulation/snapshot' && message.replyTo === id) result = message.payload.snapshot.data as unknown as SessionSnapshotBundle; };
    listeners.push(reader); channel.send({ protocolVersion: 1, messageId: id, kind: 'simulation/request-snapshot', payload: { reason: 'consistency-check' } });
    listeners.splice(listeners.indexOf(reader), 1); if (result === undefined) throw Error('Actual worker snapshot missing'); return result;
  }, releaseOne() { const message = held.shift(); if (message !== undefined) for (const listener of listeners) listener(message); }, release() { delay = false; for (const message of held.splice(0)) for (const listener of listeners) listener(message); } };
}

function footprint(id: string) {
  const objectId = BUILDABLE_REGISTRY.get(id)?.placesObjectId;
  const object = objectId === undefined ? undefined : defaultObjectRegistry.getById(objectId);
  return object === undefined ? undefined : { width: object.footprint.width, height: object.footprint.height };
}
function dispatch(canvas: ElementStub, type: string, point: { x: number; y: number }, button = 0, buttons = type === 'pointerdown' ? 1 : 0) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { clientX: point.x, clientY: point.y, pointerId: 7, button, buttons });
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
async function setup(mode: 'world' | 'oblique', templateId: RoomTemplateId, initialTurn: 0 | 1) {
  const frames: FrameRequestCallback[] = [], elements: ElementStub[] = [];
  const canvas = new ElementStub(); canvas.parentElement = new ElementStub(); const layers = canvas.parentElement.children;
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', { activeElement: null, createElement: () => { const e = new ElementStub(); elements.push(e); return e; }, createElementNS: () => new ElementStub() });
  vi.stubGlobal('HTMLElement', ElementStub);
  vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => { frames.push(frame); return frames.length; });
  let renderFeed: SimulationSnapshotFeed | undefined; let frameTime = 0;
  const scene = new (mode === 'world' ? WorldScene : ObliqueWorldScene)({ feed: { readFrame: (now: number) => renderFeed?.readFrame(now) ?? EMPTY_RENDER_FRAME }, keyValueStore: { getItem: () => null, setItem: () => undefined } });
  if (scene instanceof WorldScene) {
    const camera = new Camera(0, 0, 1920, 1080); camera.setScroll(12 * 64 - 960, 12 * 64 - 540).setZoom(1.25); camera.preRender();
    Reflect.set(scene.cameras, 'main', camera);
  } else {
    Reflect.set(scene.cameras, 'main', { width: 1920, height: 1080 });
    Reflect.set(scene, 'pose', { target: { x: 12 * 64, y: 12 * 64 }, viewport: { width: 1920, height: 1080 }, zoom: 1.4, yawRadians: 35 * Math.PI / 180, elevationRadians: 65 * Math.PI / 180 });
  }
  Reflect.set(scene, 'repaint', () => undefined);
  const point = {x:900,y:460};
  const seedOrigin = scene instanceof ObliqueWorldScene ? originAt(point,scene.cameraPose) : (()=>{
    const m=scene.cameras.main.matrixCombined,det=m.a*m.d-m.b*m.c,x=point.x-m.e,y=point.y-m.f;
    return {x:Math.floor((m.d*x-m.c*y)/det/64),y:Math.floor((-m.b*x+m.a*y)/det/64)};
  })();
  const actors = worker(seedOrigin); renderFeed = actors.feed;
  const tool = new RoomTemplateTool({ preflight: createSimulationRoomTemplatePreflight(actors.channel), quote: createSimulationRoomTemplateQuote(actors.channel),
    objectFootprint: footprint, place: async request => actors.commands.submit({ type: 'PlaceRoomTemplate', ...request }) });
  const localizer = new Localizer({ locale: 'en', catalogs: [defaultMessageCatalogEn] });
  const preview = createRoomTemplatePreview(localizer, tool);
  const rotation = elements.find(e => e.className === 'hud-template__rotation')!;
  const mirror = elements.find(e => e.attributes.get('type') === 'checkbox')!;
  elements.find(e => e.attributes.get('data-template-id') === templateId)!.dispatchEvent(new Event('click'));
  rotation.value = String(initialTurn); rotation.dispatchEvent(new Event('change'));
  elements.find(e => e.textContent === 'Place on map')!.dispatchEvent(new Event('click'));
  let uiScale = 2;
  const box = (left: number, top: number, width: number, height: number) => ({ getBoundingClientRect: () => ({ left, right: left + width, top, bottom: top + height }) });
  const root = { querySelector: (selector: string) => selector === 'canvas' ? canvas : selector === '.hud__tabs' ? box(0, 130 * uiScale, 350 * uiScale, 200)
    : selector === '.hud__corner' ? box(0, 0, 350 * uiScale, 130 * uiScale) : selector === '.hud__rail' ? box(1920 - 250 * uiScale, 130 * uiScale, 250 * uiScale, 900)
    : selector === '.hud-strip' ? box(0, 0, 1920, 130 * uiScale) : undefined };
  const main = new Function('worldScene', 'roomTemplateTool', 'appRoot', 'WorldScene', 'ObliqueWorldScene', 'RoomTemplatePreviewFitController', 'installRoomTemplateWorldBridge',
    'screenToGround', 'groundToScreen', 'computeObliqueFit', 'renderFeed', 'TILE_SIZE_PX', 'objectFootprintOf', 'localizer', 'formatRoomTemplateQuote',
    `let reinstallPlanGhost = () => {}; let withdrawPlanGhost = () => {}; ${installBody} return { withdraw: () => withdrawPlanGhost() };`)
    (scene, tool, root, WorldScene, ObliqueWorldScene, RoomTemplatePreviewFitController, installRoomTemplateWorldBridge, screenToGround, groundToScreen, computeObliqueFit, renderFeed, 64, footprint,
      localizer, formatRoomTemplateQuote) as { withdraw: () => void };
  
  const initialOrigin = scene instanceof ObliqueWorldScene ? originAt(point, scene.cameraPose) : (() => {
    const m = scene.cameras.main.matrixCombined, det = m.a * m.d - m.b * m.c;
    const x = point.x - m.e, y = point.y - m.f;
    return { x: Math.floor((m.d * x - m.c * y) / det / 64), y: Math.floor((-m.b * x + m.a * y) / det / 64) };
  })();
  const paint = async () => { frameTime += .05; renderFeed!.readFrame(frameTime); for (const frame of frames.splice(0)) frame(0); await new Promise<void>(resolve => setImmediate(resolve)); };
  dispatch(canvas, 'pointermove', point); dispatch(canvas, 'pointerdown', point); await paint();
  await paint(); expect(layers.at(-1)!.dataset.ready).toBe('blocked');
  return { renderFeed, readFrame: () => renderFeed!.readFrame(frameTime), canvas, scene, actors, tool, point, initialOrigin, paint, layer: () => layers.at(-1)!, setUiScale: () => { uiScale = 2; },
    preview, rotation, mirror, dialogDiagram: elements.find(e => e.className === 'hud-template__diagram')!,
    dimensions: elements.find(e => e.className === 'hud-template__dimensions')!,
    dialogQuote: elements.find(e => e.className === 'hud-template__quote')!,
    close: () => elements.find(e => e.className === 'hud-template__close')!.dispatchEvent(new Event('click')), dispose: main.withdraw };
}


const requireStart=source.indexOf('function requireSimulation(');
const requireEnd=source.indexOf('\n}',requireStart)+2;
const requireBody=stripTypeScriptTypes(source.slice(requireStart,requireEnd));
function history(h:Awaited<ReturnType<typeof setup>>, kind:'undo'|'redo') {
  const start=source.indexOf(`case '${kind}':`)+`case '${kind}':`.length;
  const end=source.indexOf('return;',start)+'return;'.length;
  if(start<20||end<=start) throw Error('Actual public main history callback missing');
  new Function('commands',requireBody+'\n'+source.slice(start,end))(h.actors.commands);
}
function queries(h:Awaited<ReturnType<typeof setup>>) {return h.actors.sent.filter(m=>m.kind==='simulation/request-projection'&&m.payload.projectionId==='world/room-template-preflight').length;}
for(const mode of ['world','oblique'] as const) {
  it(`${mode}: stationary blocked ghost must refresh after actual public Undo removes completed template`,async()=>{
    const h=await setup(mode,'cell-basic',1);
    try {
      expect(h.actors.snapshot().simulation?.objects?.placedObjects).toHaveLength(2);
      const oldFrame=h.readFrame();expect(oldFrame.rooms).toHaveLength(1);
      const oldQueries=queries(h);history(h,'undo');await h.paint();await h.paint();
      const after=h.actors.snapshot();expect(after.simulation?.objects?.placedObjects).toHaveLength(0);
      const afterPaintQueries=queries(h);
      const afterFrame=h.readFrame();expect(afterFrame.revision).toBeGreaterThan(oldFrame.revision);expect(afterFrame.rooms).toHaveLength(0);expect(afterFrame.structures).toHaveLength(0);
      expect(after.construction.orders.every(o=>o.state==='cancelled')).toBe(true);
      const current=await h.tool.inspectAt(h.initialOrigin);expect(current.verdict).toEqual({ok:true});
      expect(h.tool.isArmed()).toBe(true);
      console.log('HISTORY_GHOST_STALE',JSON.stringify({mode,origin:h.initialOrigin,command:h.actors.sent.filter(m=>m.kind==='simulation/submit-command').map(m=>m.payload.command.data),oldQueries,afterPaintQueries,oldRenderRevision:oldFrame.revision,newRenderRevision:afterFrame.revision,actualVerdict:current.verdict,ghostReady:h.layer().dataset.ready,afterOrders:after.construction.orders.map(o=>({id:o.id,state:o.state})),afterObjects:after.simulation?.objects?.placedObjects,afterHistory:after.simulation?.roomTemplates}));
      expect(h.layer().dataset.ready,'real current worker is clear after Undo, but cached ghost remains blocked; prior queries '+oldQueries+' current '+queries(h)).toBe('clear');
      expect(afterPaintQueries).toBeGreaterThan(oldQueries);
    } finally {h.dispose();}
  });
  it(`${mode}: actual pointer move to adjacent square and back refreshes ghost after completed Undo`,async()=>{
    const h=await setup(mode,'cell-basic',1);
    try {
      history(h,'undo');await h.paint();await h.paint();
      dispatch(h.canvas,'pointermove',{x:h.point.x+150,y:h.point.y});await h.paint();await h.paint();
      dispatch(h.canvas,'pointermove',h.point);await h.paint();await h.paint();
      expect((await h.tool.inspectAt(h.tool.planAt(h.initialOrigin).origin)).verdict).toEqual({ok:true});
      expect(h.layer().dataset.ready).toBe('clear');
    } finally {h.dispose();}
  });
}

for(const mode of ['world','oblique'] as const) {
  for(const refresh of [false,true]) it(`${mode}: stationary clear ghost ${refresh?'public reselection control':'must refresh'} after actual public Redo restores same template reservation`,async()=>{
    const h=await setup(mode,'cell-basic',1);
    try {
      history(h,'undo');await h.paint();await h.paint();
      // Real public selection callback is the legal initial refresh control;
      // it keeps the existing independently chosen fit origin, not a fake verdict.
      h.rotation.value='0';h.rotation.dispatchEvent(new Event('change'));
      h.rotation.value='1';h.rotation.dispatchEvent(new Event('change'));await h.paint();await h.paint();
      expect(h.layer().dataset.ready).toBe('clear');
      const oldQueries=queries(h),oldFrame=h.readFrame();history(h,'redo');await h.paint();await h.paint();
      const after=h.actors.snapshot();expect(after.simulation?.roomTemplates?.pending).toMatchObject([{templateId:'cell-basic',origin:h.initialOrigin,quarterTurns:1}]);
      expect(after.construction.orders.filter(o=>o.state!=='cancelled'&&o.state!=='completed')).toHaveLength(20);
      const afterFrame=h.readFrame();expect(afterFrame.revision).toBeGreaterThan(oldFrame.revision);
      const actual=(await h.tool.inspectAt(h.initialOrigin)).verdict;expect(actual).toMatchObject({ok:false,reason:'structure-occupied'});
      if(refresh) {h.rotation.value='0';h.rotation.dispatchEvent(new Event('change'));h.rotation.value='1';h.rotation.dispatchEvent(new Event('change'));await h.paint();await h.paint();}
      console.log('HISTORY_REDO_STALE',JSON.stringify({mode,refresh,origin:h.initialOrigin,oldQueries,newQueries:queries(h),oldRenderRevision:oldFrame.revision,newRenderRevision:afterFrame.revision,actualVerdict:actual,ghostReady:h.layer().dataset.ready,commands:h.actors.sent.filter(m=>m.kind==='simulation/submit-command').map(m=>m.payload.command.data)}));
      expect(h.layer().dataset.ready,'actual Redo reservation blocks this plan; stationary ghost must not still advertise clear').toBe('blocked');
      expect(h.tool.isArmed()).toBe(true);
    } finally {h.dispose();}
  });
}
