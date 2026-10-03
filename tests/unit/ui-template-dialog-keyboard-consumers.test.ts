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
import { DEFAULT_KEYBOARD_BINDINGS, validateInputSettings } from '../../src/input';
import { EMPTY_RENDER_FRAME } from '../../src/rendering/feed/render-feed';
import { BUILDABLE_REGISTRY } from '../../src/simulation/construction/definition';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { createRoomTemplatePreview } from '../../src/ui/hud/room-template-preview';
import { formatRoomTemplateQuote } from '../../src/ui/hud/room-template-quote';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import type { RoomTemplateId } from '../../src/content/room-template-catalog';

vi.mock('phaser', () => {
  const graphic = { setScrollFactor() { return this; }, setDepth() { return this; }, clear() {}, destroy() {} };
  class Scene {
    readonly cameras = { main: {} }; readonly scale = { displayScale: { x: 1, y: 1 } };
    readonly add = { graphics: () => graphic };
    readonly input = { mouse: { disableContextMenu() {} }, addPointer() {}, on() {} };
    readonly events = { once() {} }; readonly game = { canvas: new EventTarget() };
  }
  return { default: { Scene, Scenes: { Events: { SHUTDOWN: 'shutdown' } } } };
});
afterEach(() => vi.unstubAllGlobals());
class ElementStub extends EventTarget {
  constructor(readonly tagName = 'SPAN') { super(); }
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

function worker() {
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
  const snapshot = captureSessionSnapshot(createNewSimulationRuntime(73));
  channel.send({ protocolVersion: 1, messageId: 'init', kind: 'simulation/initialize', payload: { sessionId: 'hover-renderer-audit', source: {
    kind: 'snapshot', snapshot: { transport: 'structured-clone', schemaId: SESSION_SNAPSHOT_SCHEMA_ID, schemaVersion: SESSION_SNAPSHOT_SCHEMA_VERSION, data: snapshot as unknown as null },
  } } });
  channel.send({ protocolVersion: 1, messageId: 'baseline', kind: 'simulation/request-snapshot', payload: { reason: 'consistency-check' } });
  return { channel, commands, held, sent, snapshot() {
    const id = 'read-' + sent.length; let result: SessionSnapshotBundle | undefined;
    const reader = (message: WorkerToMainMessage) => { if (message.kind === 'simulation/snapshot' && message.replyTo === id) result = message.payload.snapshot.data as unknown as SessionSnapshotBundle; };
    listeners.push(reader); channel.send({ protocolVersion: 1, messageId: id, kind: 'simulation/request-snapshot', payload: { reason: 'consistency-check' } });
    listeners.splice(listeners.indexOf(reader), 1); if (result === undefined) throw Error('Actual worker snapshot missing'); return result;
  }, hold() { delay = true; }, releaseOne() { const message = held.shift(); if (message !== undefined) for (const listener of listeners) listener(message); }, release() { delay = false; for (const message of held.splice(0)) for (const listener of listeners) listener(message); } };
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
async function setup(mode: 'world' | 'oblique', templateId: RoomTemplateId, initialTurn: 0 | 1, remapped = false) {
  const frames: FrameRequestCallback[] = [], elements: ElementStub[] = [];
  const canvas = new ElementStub(); canvas.parentElement = new ElementStub(); const layers = canvas.parentElement.children;
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', { activeElement: null, createElement: (tag: string) => { const e = new ElementStub(tag.toUpperCase()); elements.push(e); return e; }, createElementNS: () => new ElementStub(), querySelector: () => elements.find(e => e.tagName === 'DIALOG' && e.open) ?? null });
  vi.stubGlobal('HTMLElement', ElementStub); vi.stubGlobal('Element', ElementStub);
  vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => { frames.push(frame); return frames.length; });
  const settings = { version: 1, keyboardBindings: DEFAULT_KEYBOARD_BINDINGS.map(b => ({ ...b, code: !remapped ? b.code : b.action === 'camera.zoom.in' ? 'Home' : b.action === 'camera.zoom.out' ? 'End' : b.code === 'KeyW' ? 'Enter' : b.code })) };
  expect(validateInputSettings(settings).ok).toBe(true);
  const scene = new (mode === 'world' ? WorldScene : ObliqueWorldScene)({ feed: { readFrame: () => EMPTY_RENDER_FRAME }, keyValueStore: { getItem: () => JSON.stringify(settings), setItem: () => undefined } });
  const camera = new Camera(0, 0, 1920, 1080); camera.setScroll(12 * 64 - 960, 12 * 64 - 540).setZoom(1.25); camera.preRender();
  Reflect.set(scene.cameras, 'main', camera);
  for (const name of ['loadCatalogTextures', 'loadFloorTextures', 'loadActorAtlases', 'loadEnvironmentArt']) Reflect.set(scene,name,async()=>undefined);
  scene.create();
  if (scene instanceof ObliqueWorldScene) {
    await scene.ready();
    Reflect.set(scene, 'pose', { target: { x: 12 * 64, y: 12 * 64 }, viewport: { width: 1920, height: 1080 }, zoom: 1.4, yawRadians: 35 * Math.PI / 180, elevationRadians: 65 * Math.PI / 180 });
  }
  // Display layers are not a keyboard/action substitute; update still consumes
  // the actual adapter and camera. This source-only harness renders no pixels.
  for (const name of ['tiles','roomLabels','roomConditions','actors','buildOverlay','areaOverlay','objectOverlay','homeIndicator']) Reflect.set(scene,name,undefined);
  Reflect.set(scene, 'repaint', () => undefined);
  const actors = worker();
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
    (scene, tool, root, WorldScene, ObliqueWorldScene, RoomTemplatePreviewFitController, installRoomTemplateWorldBridge, screenToGround, groundToScreen, computeObliqueFit, { readFrame: () => EMPTY_RENDER_FRAME }, 64, footprint,
      localizer, formatRoomTemplateQuote) as { withdraw: () => void };
  const point = { x: 900, y: 460 };
  const initialOrigin = scene instanceof ObliqueWorldScene ? originAt(point, scene.cameraPose) : (() => {
    const m = scene.cameras.main.matrixCombined, det = m.a * m.d - m.b * m.c;
    const x = point.x - m.e, y = point.y - m.f;
    return { x: Math.floor((m.d * x - m.c * y) / det / 64), y: Math.floor((-m.b * x + m.a * y) / det / 64) };
  })();
  const paint = async () => { for (const frame of frames.splice(0)) frame(0); await new Promise<void>(resolve => setImmediate(resolve)); };
  dispatch(canvas, 'pointermove', point); await paint();
  await paint(); expect(layers.at(-1)!.dataset.ready).toBe('clear');
  return { elements, canvas, scene, actors, tool, point, initialOrigin, paint, layer: () => layers.at(-1)!, setUiScale: () => { uiScale = 2; },
    preview, rotation, mirror, dialogDiagram: elements.find(e => e.className === 'hud-template__diagram')!,
    dimensions: elements.find(e => e.className === 'hud-template__dimensions')!,
    dialogQuote: elements.find(e => e.className === 'hud-template__quote')!,
    close: () => elements.find(e => e.className === 'hud-template__close')!.dispatchEvent(new Event('click')), dispose: main.withdraw };
}



function key(target: ElementStub, code: string, down = true) {
  // Minimal DOM propagation only; native spinbutton/select default actions are
  // not invented here. Production dialog/Scene/window handlers receive it.
  const event = new Event(down ? 'keydown' : 'keyup', {cancelable:true,bubbles:true});
  Object.assign(event,{code,key:code,repeat:false});
  let stopped = false;
  event.stopPropagation = () => {stopped=true;Event.prototype.stopPropagation.call(event);};
  for (let element:ElementStub|undefined=target;element!==undefined&&!stopped;element=element.parentElement) element.dispatchEvent(event);
  if (!stopped) window.dispatchEvent(event);
  return {stopped,prevented:event.defaultPrevented};
}
async function settle(h:Awaited<ReturnType<typeof setup>>) {for(let n=0;n<4;n++) await h.paint();}
const submitted = (h:Awaited<ReturnType<typeof setup>>) => h.actors.sent.filter(m=>m.kind==='simulation/submit-command');
for (const mode of ['world','oblique'] as const) for (const remapped of [false,true]) it(`${mode}/${remapped?'legal remaps':'default'}: numeric X/Y and rotation own public keys without camera/commands; Escape preserves armed tool`,async()=>{
 const h=await setup(mode,'cell-basic',1,remapped);
 try {
  h.preview.openButton.dispatchEvent(new Event('click'));await settle(h);
  if(h.scene instanceof WorldScene) h.scene.cameras.main.preRender();
  const before=h.scene.captureCameraView(), workerBefore=h.actors.snapshot();
  for(const control of [h.elements.find(e=>e.attributes.get('aria-label')==='Plan origin X')!,h.elements.find(e=>e.attributes.get('aria-label')==='Plan origin Y')!,h.rotation]) {
   control.focus();
   for(const code of ['ArrowUp','ArrowDown','Home','End','Enter']) {
    key(control,code);h.scene.update(500,300);if(h.scene instanceof WorldScene) h.scene.cameras.main.preRender();key(control,code,false);
    expect(h.scene.captureCameraView(),`${control.tagName}/${code} must not reach world camera`).toEqual(before);
    expect(submitted(h)).toHaveLength(0);expect(h.tool.isArmed()).toBe(true);
   }
  }
  const escaped=key(h.rotation,'Escape');
  expect(escaped).toEqual({stopped:true,prevented:true});expect(h.preview.dialog.open).toBe(false);
  expect(document.activeElement).toBe(h.preview.openButton);expect(h.tool.isArmed()).toBe(true);
  expect(h.actors.snapshot()).toEqual(workerBefore);
  const canvas=h.canvas;canvas.focus();key(canvas,'ArrowDown');h.scene.update(1000,300);if(h.scene instanceof WorldScene) h.scene.cameras.main.preRender();key(canvas,'ArrowDown',false);
  expect(h.scene.captureCameraView(),'fresh world arrow remains functional').not.toEqual(before);
  key(canvas,'Escape');key(canvas,'Escape',false);expect(h.tool.isArmed()).toBe(false);expect(submitted(h)).toHaveLength(0);
 } finally {h.dispose();}
});
for(const mode of ['world','oblique'] as const) it(`${mode}: real numeric input/rotation supersedes delayed verdict; one activation buys one current plan`,async()=>{
 const h=await setup(mode,'cell-basic',0);
 try {
  h.preview.openButton.dispatchEvent(new Event('click'));await settle(h);
  const x=h.elements.find(e=>e.attributes.get('aria-label')==='Plan origin X')!, y=h.elements.find(e=>e.attributes.get('aria-label')==='Plan origin Y')!;
  const place=h.elements.find(e=>e.textContent==='Place room plan')!;
  h.actors.hold();x.focus();x.value='4';x.dispatchEvent(new Event('input'));
  x.value='20';x.dispatchEvent(new Event('input'));y.value='5';y.dispatchEvent(new Event('input'));
  h.rotation.value='1';h.rotation.dispatchEvent(new Event('change'));
  expect(place.disabled).toBe(true);place.dispatchEvent(new Event('click'));expect(submitted(h)).toHaveLength(0);
  h.actors.release();await settle(h);expect(place.disabled).toBe(false);
  place.focus();place.dispatchEvent(new Event('click'));place.dispatchEvent(new Event('click'));await settle(h);
  expect(submitted(h)).toHaveLength(1);
  expect(submitted(h)[0]!.payload).toMatchObject({command:{data:{type:'PlaceRoomTemplate',templateId:'cell-basic',origin:{x:20,y:5},quarterTurns:1}}});
  const snapshot=h.actors.snapshot();expect(snapshot.construction.orders).toHaveLength(18);
  expect(snapshot.simulation?.roomTemplates?.pending).toMatchObject([{templateId:'cell-basic',origin:{x:20,y:5},quarterTurns:1}]);
  const walls=[];
  for(let yy=0;yy<4;yy++) for(let xx=0;xx<7;xx++) if((xx===0||xx===6||yy===0||yy===3)&&!(xx===0&&yy===1)) walls.push([20+xx,5+yy]);
  const sorted=(points:number[][])=>points.sort((a,b)=>a[1]!-b[1]!||a[0]!-b[0]!);
  expect(sorted(snapshot.construction.orders.filter(o=>o.definitionId==='wall-brick').map(o=>[o.location.x,o.location.y]))).toEqual(sorted(walls));
  expect(snapshot.construction.orders.filter(o=>o.definitionId==='door-wooden')).toMatchObject([{location:{x:21,y:6},edge:'west'}]);
  expect(h.tool.planAt({x:20,y:5}).objects.map(o=>[o.x,o.y,o.width,o.height])).toEqual([[24,6,2,1],[22,7,1,1]]);
  expect(await h.tool.quote()).toEqual({orderCount:20,materials:[{itemId:'item.brick',quantity:35},{itemId:'item.wood-plank',quantity:2}],catalogueCostMinorUnits:1530});

  expect(place.disabled).toBe(true);place.dispatchEvent(new Event('click'));await settle(h);expect(submitted(h)).toHaveLength(1);
 } finally {h.dispose();}
});
