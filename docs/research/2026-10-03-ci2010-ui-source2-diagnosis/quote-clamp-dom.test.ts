import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { afterEach, expect, it, vi } from 'vitest';
import { WorldScene } from '../../../src/rendering/scene/world-scene';
import { ObliqueWorldScene } from '../../../src/rendering/scene/oblique-world-scene';
import { RoomTemplateTool } from '../../../src/ui/room-template-tool';
import { RoomTemplatePreviewFitController } from '../../../src/ui/room-template-preview-fit';
import { installRoomTemplateWorldBridge } from '../../../src/ui/room-template-world-bridge';
import { groundToScreen, screenToGround } from '../../../src/rendering/camera/oblique-projection';
import { computeObliqueFit } from '../../../src/rendering/camera/oblique-fit';
import { createSimulationRoomTemplatePreflight, createSimulationRoomTemplateQuote } from '../../../src/ui/simulation-room-template-port';
import { SimulationCommandSender } from '../../../src/ui/simulation-commands';
import { SimulationWorkerStateMachine } from '../../../src/simulation/worker/state-machine';
import type { MainToWorkerMessage } from '../../../src/simulation/protocol/types';
import { SimulationSnapshotFeed } from '../../../src/rendering/feed/simulation-snapshot-feed';
import { SimulationWorkerChannel } from '../../../src/simulation/worker/worker-channel';
import { WorkerPerSessionHost } from '../../../src/persistence/session/worker-per-session-host';
import type { SimulationClient, WorkerMessageHandler } from '../../../src/simulation/worker/client';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../../src/persistence/save-schema';
import type { SessionSnapshotBundle } from '../../../src/simulation/runtime/restore-session';
import { formatRoomTemplateQuote } from '../../../src/ui/hud/room-template-quote';
import { createRoomTemplatePreview } from '../../../src/ui/hud/room-template-preview';
import { Localizer, defaultMessageCatalogEn } from '../../../src/services/localization';
import { EMPTY_RENDER_FRAME } from '../../../src/rendering/feed/render-feed';
import { BUILDABLE_REGISTRY } from '../../../src/simulation/construction/definition';
import { defaultObjectRegistry } from '../../../src/content/object-catalog';

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
  getBoundingClientRect() { if(this.className==='room-template-world-ghost__label'){
      // Independent DOM sizing surrogate for the CI-observed authored CSS:
      // content maximum340 + horizontal padding24 + borders2 =366px.
      const content=this.style.maxWidth===undefined?340:Number.parseFloat(this.style.maxWidth);
      const width=Math.min(340,content)+26,x=Number.parseFloat(this.style.left??'0'),y=Number.parseFloat(this.style.top??'0');
      return{x,y,width,height:298,left:x,top:y,right:x+width,bottom:y+298};
    }
    const r=this.rect;return{...r,left:r.x,top:r.y,right:r.x+r.width,bottom:r.y+r.height}; }
}
const source = readFileSync(new URL('../../../src/main.ts', import.meta.url), 'utf8');
const start = source.lastIndexOf('if (roomTemplateTool !== undefined) {');
const end = source.indexOf('// The save panel is laid out', start);
if (start < 0 || end < 0) throw Error('Actual main ghost-install producer missing');
const installBody = stripTypeScriptTypes(source.slice(start, end));
class InProcessClient {
 readonly listeners=new Set<WorkerMessageHandler>(); readonly sent:MainToWorkerMessage[]=[]; terminated=false;
 readonly machine=new SimulationWorkerStateMachine({postMessage:m=>{for(const l of this.listeners)l(m);}},'camera-sequence-audit',()=>0);
 addListener(l:WorkerMessageHandler){this.listeners.add(l);} removeListener(l:WorkerMessageHandler){this.listeners.delete(l);}
 send(m:MainToWorkerMessage){this.sent.push(m);this.machine.handleMessage(m);} terminate(){this.terminated=true;}
}
async function worker() {
 const clients:InProcessClient[]=[];
 const channel=new SimulationWorkerChannel(()=>{const c=new InProcessClient();clients.push(c);return c as unknown as SimulationClient;});channel.open();
 const commands=new SimulationCommandSender(channel,{now:()=>0});const feed=new SimulationSnapshotFeed(channel);
 const host=new WorkerPerSessionHost(channel);
 await host.startNew(73);channel.send({protocolVersion:1,messageId:'pause',kind:'simulation/set-clock',payload:{mode:'paused'}});await host.capture();
 return {channel,commands,feed,host,clients,sent:clients[0]!.sent};
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
async function setup(mirrored: boolean) {
  const frames: FrameRequestCallback[] = [], elements: ElementStub[] = [];
  const canvas = new ElementStub(); canvas.parentElement = new ElementStub(); const layers = canvas.parentElement.children;
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', { activeElement: null, createElement: () => {const e=new ElementStub();elements.push(e);return e;}, createElementNS: () => new ElementStub() });
  vi.stubGlobal('HTMLElement', ElementStub);
  vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => { frames.push(frame); return frames.length; });
  let actualFeed: SimulationSnapshotFeed | undefined; let frameTime=0;
  const scene = new ObliqueWorldScene({ feed: { readFrame: (now:number) => actualFeed?.readFrame(now) ?? EMPTY_RENDER_FRAME }, keyValueStore: { getItem: () => null, setItem: () => undefined } });
  Reflect.set(scene.cameras, 'main', { width: 1920, height: 1080 });
  Reflect.set(scene, 'pose', { target: { x: 12 * 64, y: 12 * 64 }, viewport: { width: 1920, height: 1080 }, zoom: 1.4, yawRadians: 35 * Math.PI / 180, elevationRadians: 65 * Math.PI / 180 });
  Reflect.set(scene, 'repaint', () => undefined);
  const actors = await worker(); actualFeed=actors.feed;
  const tool = new RoomTemplateTool({ preflight: createSimulationRoomTemplatePreflight(actors.channel), quote: createSimulationRoomTemplateQuote(actors.channel),
    objectFootprint: footprint, place: async request => actors.commands.submit({ type: 'PlaceRoomTemplate', ...request }) });
  const localizer=new Localizer({locale:'en',catalogs:[defaultMessageCatalogEn]});
  const preview=createRoomTemplatePreview(localizer,tool);
  elements.find(e=>e.attributes.get('data-template-id')==='cell-basic')!.dispatchEvent(new Event('click'));
  const rotation=elements.find(e=>e.className==='hud-template__rotation')!;rotation.value='1';rotation.dispatchEvent(new Event('change'));
  const mirror=elements.find(e=>e.attributes.get('type')==='checkbox')!;mirror.checked=mirrored;mirror.dispatchEvent(new Event('change'));
  elements.find(e=>e.textContent==='Place on map')!.dispatchEvent(new Event('click'));
  let uiScale = 1;
  const box = (left: number, top: number, width: number, height: number) => ({ getBoundingClientRect: () => ({ left, right: left + width, top, bottom: top + height }) });
  const root = { querySelector: (selector: string) => selector === 'canvas' ? canvas : selector === '.hud__tabs' ? box(0,267,256,200)
    : selector === '.hud__corner' ? box(0,0,838,130) : selector === '.hud__rail' ? box(1192,267,728,813)
    : selector === '.hud-strip' ? box(0,0,1920,259) : undefined };
  const main = new Function('worldScene', 'roomTemplateTool', 'appRoot', 'WorldScene', 'ObliqueWorldScene', 'RoomTemplatePreviewFitController', 'installRoomTemplateWorldBridge',
    'screenToGround', 'groundToScreen', 'computeObliqueFit', 'renderFeed', 'TILE_SIZE_PX', 'objectFootprintOf', 'localizer', 'formatRoomTemplateQuote',
    `let reinstallPlanGhost = () => {}; let withdrawPlanGhost = () => {}; ${installBody} return { withdraw: () => withdrawPlanGhost() };`)
    (scene, tool, root, WorldScene, ObliqueWorldScene, RoomTemplatePreviewFitController, installRoomTemplateWorldBridge, screenToGround, groundToScreen, computeObliqueFit, actualFeed, 64, footprint,
      localizer, formatRoomTemplateQuote) as { withdraw: () => void };
  const callback = (name: string) => {
    const begin = source.indexOf(name + ': ');
    if (begin < 0 || source.indexOf(name + ': ', begin + 1) !== -1) throw Error('Actual unique camera callback missing: ' + name);
    const rest = source.slice(begin + name.length + 2), end = rest.match(/\r?\n {4,6}\},/);
    if (end?.index === undefined) throw Error('Actual camera callback end missing: ' + name);
    const body = rest.slice(0, end.index + end[0].length - 1);
    return new Function('worldScene', 'ObliqueWorldScene', 'rendererChanging', 'liveRendererSelection', `return (${stripTypeScriptTypes(body)});`)
      (scene, ObliqueWorldScene, false, { current: { scene } }) as (...args: unknown[]) => void;
  };
  const point = { x: 900, y: 460 }, initialPose = scene.cameraPose;
  const initialOrigin = originAt(point, initialPose);
  const paint = async () => {frameTime+=.05; actualFeed!.readFrame(frameTime); for (const frame of frames.splice(0)) frame(0); await new Promise<void>(resolve => setImmediate(resolve)); };
  dispatch(canvas, 'pointermove', point); dispatch(canvas, 'pointerdown', point); await paint();
  await paint();expect(layers.at(-1)!.dataset.ready).toBe('clear');

  return { canvas, scene, actors, tool, point, initialOrigin, paint, layer: () => layers.at(-1)!, setUiScale: () => { uiScale = 2; },
    zoom: callback('onCameraZoom'), pan: callback('onCameraPan'), pose: callback('onCameraPoseStep'), dispose: main.withdraw, preview };
}



it('actual ghost producer caps the authored366px quote to the CI-measured338px safe width',async()=>{
 const h=await setup(true);try{
  await h.paint();await h.paint();const label=h.layer().children[1]!,box=label.getBoundingClientRect();
  expect(box.width,'338px exposed safe area cannot fit366px readout').toBeLessThanOrEqual(338);
  expect(box.left).toBeGreaterThanOrEqual(846);expect(box.right).toBeLessThanOrEqual(1184);
  expect(h.actors.sent.filter(m=>m.kind==='simulation/submit-command')).toHaveLength(0);
  writeFileSync(new URL('./quote-clamp-dom-observation.json',import.meta.url),JSON.stringify({safe:{left:846,right:1184,width:338},box,text:label.textContent,placementCommands:0},null,2)+'\n');
 }finally{h.dispose();await h.actors.host.stop();}
});
