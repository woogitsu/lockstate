import { readFileSync } from 'node:fs';
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
import type { MainToWorkerMessage, WorkerToMainMessage } from '../../../src/simulation/protocol/types';
import { createNewSimulationRuntime } from '../../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, SESSION_SNAPSHOT_SCHEMA_ID, SESSION_SNAPSHOT_SCHEMA_VERSION } from '../../../src/simulation/runtime/restore-session';
import { SimulationSnapshotFeed } from '../../../src/rendering/feed/simulation-snapshot-feed';
import { SimulationWorkerChannel } from '../../../src/simulation/worker/worker-channel';
import { WorkerPerSessionHost } from '../../../src/persistence/session/worker-per-session-host';
import type { SimulationClient, WorkerMessageHandler } from '../../../src/simulation/worker/client';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../../src/persistence/save-schema';
import type { SessionSnapshotBundle } from '../../../src/simulation/runtime/restore-session';
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
  getBoundingClientRect() { const r = this.rect; return { ...r, left: r.x, top: r.y, right: r.x + r.width, bottom: r.y + r.height }; }
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
  const root = { querySelector: (selector: string) => selector === 'canvas' ? canvas : selector === '.hud__tabs' ? box(0, 130 * uiScale, 350 * uiScale, 200)
    : selector === '.hud__corner' ? box(0, 0, 350 * uiScale, 130 * uiScale) : selector === '.hud__rail' ? box(1920 - 250 * uiScale, 130 * uiScale, 250 * uiScale, 900)
    : selector === '.hud-strip' ? box(0, 0, 1920, 130 * uiScale) : undefined };
  const main = new Function('worldScene', 'roomTemplateTool', 'appRoot', 'WorldScene', 'ObliqueWorldScene', 'RoomTemplatePreviewFitController', 'installRoomTemplateWorldBridge',
    'screenToGround', 'groundToScreen', 'computeObliqueFit', 'renderFeed', 'TILE_SIZE_PX', 'objectFootprintOf', 'localizer', 'formatRoomTemplateQuote',
    `let reinstallPlanGhost = () => {}; let withdrawPlanGhost = () => {}; ${installBody} return { withdraw: () => withdrawPlanGhost() };`)
    (scene, tool, root, WorldScene, ObliqueWorldScene, RoomTemplatePreviewFitController, installRoomTemplateWorldBridge, screenToGround, groundToScreen, computeObliqueFit, actualFeed, 64, footprint,
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
  const point = { x: 900, y: 460 }, initialPose = scene.cameraPose;
  const initialOrigin = originAt(point, initialPose);
  const paint = async () => {frameTime+=.05; actualFeed!.readFrame(frameTime); for (const frame of frames.splice(0)) frame(0); await new Promise<void>(resolve => setImmediate(resolve)); };
  dispatch(canvas, 'pointermove', point); dispatch(canvas, 'pointerdown', point); await paint();
  await paint();expect(layers.at(-1)!.dataset.ready).toBe('clear');
  expect(scene.cameraPose).toEqual(initialPose); // Initial whole footprint is visible: no fit lock.
  return { canvas, scene, actors, tool, point, initialOrigin, paint, layer: () => layers.at(-1)!, setUiScale: () => { uiScale = 2; },
    zoom: callback('onCameraZoom'), pan: callback('onCameraPan'), pose: callback('onCameraPoseStep'), dispose: main.withdraw, preview };
}


function history(h:Awaited<ReturnType<typeof setup>>,kind:'undo'|'redo') {
 const a=source.indexOf('function requireSimulation('), b=source.indexOf('\n}',a)+2;
 const c=source.indexOf(`case '${kind}':`)+`case '${kind}':`.length,d=source.indexOf('return;',c)+'return;'.length;
 if(a<0||b<=a||c<20||d<=c)throw Error('Actual public history producer missing');
 new Function('commands',stripTypeScriptTypes(source.slice(a,b))+'\n'+source.slice(c,d))(h.actors.commands);
}
function shell(snapshot:SessionSnapshotBundle,origin:{x:number;y:number}) {
 expect(snapshot.construction.orders).toHaveLength(18);
 const orders=snapshot.construction.orders.map(o=>({definitionId:o.definitionId,x:o.location.x-origin.x,y:o.location.y-origin.y,...(o.footprint===undefined?{}:{footprint:o.footprint}),...(o.edge===undefined?{}:{edge:o.edge})}));
 const walls:{definitionId:string;x:number;y:number;footprint:string}[]=[];
 for(let y=0;y<4;y++)for(let x=0;x<7;x++)if((x===0||y===0||x===6||y===3)&&!(x===0&&y===2))walls.push({definitionId:'wall-brick',x,y,footprint:'square'});
 const sort=(a:{x:number;y:number},b:{x:number;y:number})=>a.y-b.y||a.x-b.x;
 expect(orders.filter(o=>o.definitionId==='wall-brick').sort(sort)).toEqual(walls.sort(sort));
 expect(orders.filter(o=>o.definitionId==='door-wooden')).toEqual([{definitionId:'door-wooden',x:1,y:2,edge:'west'}]);
 expect(snapshot.simulation?.roomTemplates?.pending).toMatchObject([{templateId:'cell-basic',origin,mirrorX:true,quarterTurns:1}]);
 expect(snapshot.simulation?.economy?.treasury.balanceMinorUnits).toBe(25000);
}
it('oblique public q1+mirror held plan: actual pan/yaw/elevation/zoom, release, Undo, Redo, V8 fresh-worker Load',async()=>{
 const h=await setup(true);
 try {
  const before=await h.actors.host.capture();expect(before.construction.orders).toHaveLength(0);
  const startPose=structuredClone(h.scene.cameraPose);
  h.pan('right');h.pose('yaw',1);h.pose('elevation',-1);h.zoom('in');
  expect(h.scene.cameraPose).not.toEqual(startPose);
  const expected=originAt(h.point,h.scene.cameraPose);expect(expected).not.toEqual(h.initialOrigin);
  await h.paint();await h.paint();
  expect(h.layer().dataset.ready).toBe('clear');
  const quote=await h.tool.quote();expect(quote).toEqual({orderCount:20,materials:[{itemId:'item.brick',quantity:35},{itemId:'item.wood-plank',quantity:2}],catalogueCostMinorUnits:1530});
  const polygons=h.layer().children[0]!.children;expect(polygons).toHaveLength(28);
  for(let i=0;i<polygons.length;i++){
   const corners=polygons[i]!.attributes.get('points')!.split(' ').map(p=>p.split(',').map(Number));
   for(let j=0;j<4;j++){
    const p=inverse({x:corners[j]![0]!,y:corners[j]![1]!},h.scene.cameraPose);
    expect(p.x/64).toBeCloseTo(expected.x+i%7+[0,1,1,0][j]!,7);
    expect(p.y/64).toBeCloseTo(expected.y+Math.floor(i/7)+[0,0,1,1][j]!,7);
   }
  }
  expect(h.actors.sent.filter(m=>m.kind==='simulation/submit-command')).toHaveLength(0);
  expect(await h.actors.host.capture()).toEqual(before);
  dispatch(h.canvas,'pointerup',h.point);await h.paint();await h.paint();
  const submitted=h.actors.sent.filter(m=>m.kind==='simulation/submit-command');expect(submitted).toHaveLength(1);
  expect(submitted[0]!.payload).toMatchObject({command:{data:{type:'PlaceRoomTemplate',templateId:'cell-basic',origin:expected,mirrorX:true,quarterTurns:1}}});
  expect(h.tool.isArmed()).toBe(false);const accepted=await h.actors.host.capture();shell(accepted,expected);
  dispatch(h.canvas,'pointerup',h.point);await h.paint();expect(await h.actors.host.capture()).toEqual(accepted);
  history(h,'undo');await h.paint();const undone=await h.actors.host.capture();
  expect(undone.simulation?.roomTemplates?.pending).toHaveLength(0);expect(undone.construction.orders.every(o=>o.state==='cancelled')).toBe(true);
  history(h,'redo');await h.paint();const redone=await h.actors.host.capture();
  expect(redone.simulation?.roomTemplates?.pending).toMatchObject([{templateId:'cell-basic',origin:expected,mirrorX:true,quarterTurns:1}]);
  expect(redone.construction.orders.filter(o=>o.state!=='cancelled')).toHaveLength(18);
  const envelope=createSaveEnvelope({gameVersion:'camera-audit',prisonId:'held-q1-mirror',revision:1,createdAt:0,updatedAt:1,...redone});
  expect(envelope.saveSchemaVersion).toBe(8);const decoded=decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)));expect(decoded.ok).toBe(true);
  if(!decoded.ok)throw Error('Real V8 refused');
  await h.actors.host.startFromSnapshot(decoded.value.payload as unknown as SessionSnapshotBundle);
  h.actors.channel.send({protocolVersion:1,messageId:'loaded-pause',kind:'simulation/set-clock',payload:{mode:'paused'}});
  const loaded=await h.actors.host.capture();expect(loaded).toEqual(redone);expect(h.actors.clients).toHaveLength(2);expect(h.actors.clients[0]!.terminated).toBe(true);
  console.log('CAMERA_SEQUENCE_NO_FINDING',JSON.stringify({initial:h.initialOrigin,expected,poseBefore:startPose,poseAfter:h.scene.cameraPose,quote,polygons:polygons.length,acceptedOrders:accepted.construction.orders.length,undoStates:undone.construction.orders.map(o=>o.state),redoOrders:redone.construction.orders.length,loadedWholeSnapshotEqual:true,commands:h.actors.sent.filter(m=>m.kind==='simulation/submit-command').map(m=>m.payload.command.data)}));
 }finally{h.dispose();await h.actors.host.stop();}
});
