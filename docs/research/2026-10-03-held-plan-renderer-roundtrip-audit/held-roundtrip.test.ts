import { readFileSync, writeFileSync } from 'node:fs';
import {dirname,resolve} from 'node:path';
import {EventEmitter} from 'node:events';
import type Phaser from 'phaser';
import {LiveRendererSelection} from '../../../src/rendering/scene/live-renderer-selection';
import { createHash } from 'node:crypto';
import { createRequire, stripTypeScriptTypes } from 'node:module';
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
const require = createRequire(import.meta.url);
const phaserSource = resolve(dirname(require.resolve('phaser')), '../src');
const components = require.resolve(resolve(phaserSource, 'gameobjects/components/index.js'));
const cached = require.cache[components];
let Camera: typeof Phaser.Cameras.Scene2D.Camera;
try {
  require.cache[components] = { id: components, filename: components, loaded: true, exports: { FilterList: class {} } } as NodeJS.Module;
  Camera = require(resolve(phaserSource, 'cameras/2d/Camera.js')) as typeof Phaser.Cameras.Scene2D.Camera;
} finally { if (cached === undefined) delete require.cache[components]; else require.cache[components] = cached; }


type Scene=WorldScene|ObliqueWorldScene;
async function setup(){
 const frames:FrameRequestCallback[]=[],elements:ElementStub[]=[];const canvas=new ElementStub();canvas.parentElement=new ElementStub();const layers=canvas.parentElement.children;
 vi.stubGlobal('window',new EventTarget());vi.stubGlobal('HTMLElement',ElementStub);vi.stubGlobal('document',{activeElement:null,createElement:()=>{const e=new ElementStub();elements.push(e);return e;},createElementNS:()=>new ElementStub()});vi.stubGlobal('requestAnimationFrame',(f:FrameRequestCallback)=>{frames.push(f);return frames.length;});
 const actors=await worker();let frameTime=0;const scenes:Scene[]=[];
 const create=(mode:'world'|'oblique')=>{
  const scene=new (mode==='world'?WorldScene:ObliqueWorldScene)({feed:actors.feed,keyValueStore:{getItem:()=>null,setItem:()=>undefined}});
  Reflect.set(scene,'sys',{isActive:()=>true,settings:{key:mode==='world'?'WorldScene':'ObliqueWorldScene'}});Reflect.set(scene,'events',new EventEmitter());Reflect.set(scene,'repaint',()=>undefined);
  if(scene instanceof WorldScene){const c=new Camera(0,0,1920,1080);c.setScroll(768-960,768-540).setZoom(scenes.length===0?1.25:.75);c.preRender();Reflect.set(scene.cameras,'main',c);}
  else{Reflect.set(scene.cameras,'main',{width:1920,height:1080});Reflect.set(scene,'pose',{target:{x:9999,y:8888},viewport:{width:1920,height:1080},zoom:1.4,yawRadians:35*Math.PI/180,elevationRadians:65*Math.PI/180});Reflect.set(scene,'ready',async()=>{});}
  scenes.push(scene);return scene;
 };
 const initial=create('world'),tool=new RoomTemplateTool({preflight:createSimulationRoomTemplatePreflight(actors.channel),quote:createSimulationRoomTemplateQuote(actors.channel),objectFootprint:footprint,place:async request=>actors.commands.submit({type:'PlaceRoomTemplate',...request})});
 const localizer=new Localizer({locale:'en',catalogs:[defaultMessageCatalogEn]});createRoomTemplatePreview(localizer,tool);elements.find(e=>e.attributes.get('data-template-id')==='cell-basic')!.dispatchEvent(new Event('click'));
 const rotation=elements.find(e=>e.className==='hud-template__rotation')!;rotation.value='1';rotation.dispatchEvent(new Event('change'));const mirror=elements.find(e=>e.attributes.get('type')==='checkbox')!;mirror.checked=true;mirror.dispatchEvent(new Event('change'));elements.find(e=>e.textContent==='Place on map')!.dispatchEvent(new Event('click'));
 const root={querySelector:(selector:string)=>selector==='canvas'?canvas:undefined};
 const lifecycle=(name:string,next:string)=>{const a=source.indexOf(name),b=source.indexOf(next,a);if(a<0||b<=a)throw Error('Actual lifecycle missing');return stripTypeScriptTypes(source.slice(a+name.length,b).replace(/,\s*$/,''));};
 const deactivate=lifecycle('deactivate: scene => ','  activate:'),activate=lifecycle('activate: async scene => ','  changed:'),changed=lifecycle('changed: selection => ','  unavailable:');
 const callback=(name:string)=>{const a=source.indexOf(name+': '),rest=source.slice(a+name.length+2),end=rest.match(/\r?\n {4,6}\},/);if(a<0||end?.index===undefined)throw Error('Actual callback missing');return stripTypeScriptTypes(rest.slice(0,end.index+end[0].length-1));};
 const a=source.indexOf('rendererSelection: { mode:'),b=source.indexOf('select: async mode => ',a),c=source.indexOf('\n    } },',b);if(a<0||b<a||c<b)throw Error('Public select missing');const selectBody=stripTypeScriptTypes(source.slice(b+'select: async mode => '.length,c));
 const hosted=new Map<string,Scene>(),host={scene:{stop:()=>{},remove:(key:string)=>hosted.delete(key),add:(key:string,scene:Scene)=>hosted.set(key,scene),start:(key:string)=>hosted.get(key)!.events.emit('create')}};
 const ports=new Function('worldScene','roomTemplateTool','appRoot','WorldScene','ObliqueWorldScene','RoomTemplatePreviewFitController','installRoomTemplateWorldBridge','screenToGround','groundToScreen','computeObliqueFit','renderFeed','TILE_SIZE_PX','objectFootprintOf','localizer','formatRoomTemplateQuote','phaserGame','Phaser',
  `let productionSceneSelection={mode:'world',scene:worldScene};let logicalViewCentre;const rendererViewMemory=new Map();let rendererChanging=false;let liveRendererSelection;const rendererHudChanged=()=>{};let reinstallPlanGhost=()=>{};let withdrawPlanGhost=()=>{};${installBody}
  return {deactivate:scene=>${deactivate},activate:async scene=>${activate},changed:selection=>${changed},select:async mode=>${selectBody},pan:${callback('onCameraPan')},zoom:${callback('onCameraZoom')},pose:${callback('onCameraPoseStep')},bind:v=>{liveRendererSelection=v;},current:()=>worldScene,memory:()=>[...rendererViewMemory],withdraw:()=>withdrawPlanGhost()};`)
  (initial,tool,root,WorldScene,ObliqueWorldScene,RoomTemplatePreviewFitController,installRoomTemplateWorldBridge,screenToGround,groundToScreen,computeObliqueFit,actors.feed,64,footprint,localizer,formatRoomTemplateQuote,host,{Scenes:{Events:{CREATE:'create'}}}) as {deactivate(s:Scene):void;activate(s:Scene):Promise<void>;changed(s:unknown):void;select(m:'world'|'oblique'):Promise<void>;pan(d:string):void;zoom(d:string):void;pose(a:string,d:number):void;bind(v:unknown):void;current():Scene;memory():unknown[];withdraw():void};
 const controller=new LiveRendererSelection<Scene>({mode:'world',scene:initial},{prepare:async mode=>create(mode),deactivate:ports.deactivate,activate:ports.activate,changed:ports.changed,unavailable:e=>{throw e;}});ports.bind(controller);
 const paint=async()=>{frameTime+=.05;const active=ports.current();if(active instanceof WorldScene)active.cameras.main.preRender();actors.feed.readFrame(frameTime);for(const f of frames.splice(0))f(0);await new Promise<void>(r=>setImmediate(r));};
 const point={x:900,y:460};dispatch(canvas,'pointermove',point);dispatch(canvas,'pointerdown',point);await paint();await paint();expect(layers.at(-1)!.dataset.ready).toBe('clear');return{actors,tool,canvas,point,initial,ports,scenes,paint,layer:()=>layers.at(-1)!,dispose:ports.withdraw};
}
function independentWorldOrigin(scene:WorldScene,p:{x:number;y:number}){const m=scene.cameras.main.matrixCombined,det=m.a*m.d-m.b*m.c,x=p.x-m.e,y=p.y-m.f;return{x:Math.floor((m.d*x-m.c*y)/det/64),y:Math.floor((-m.b*x+m.a*y)/det/64)};}
it('World-Angled-fresh World q1 mirrored held plan: camera restoration, stale release cancelled, fresh press only',async()=>{
 const h=await setup();try{
  const before=await h.actors.host.capture(),original=h.initial.captureCameraView(),oldLayer=h.layer();await h.ports.select('oblique');await h.paint();await h.paint();
  const angled=h.ports.current();expect(angled).toBeInstanceOf(ObliqueWorldScene);const angledScene=angled as ObliqueWorldScene;expect(angledScene.captureCameraView()).toMatchObject({centre:original.centre,zoom:1.4});expect(oldLayer.removed).toBe(true);expect(h.tool.isArmed()).toBe(true);expect(h.layer().dataset.ready).toBe('clear');
  h.ports.pan('right');h.ports.zoom('in');h.ports.pose('yaw',1);await h.paint();await h.paint();const angledView=angledScene.captureCameraView();expect(angledView.centre).not.toEqual(original.centre);expect(angledView.zoom).toBe(1.75);
  await h.ports.select('world');await h.paint();await h.paint();const returned=h.ports.current();expect(returned).toBeInstanceOf(WorldScene);expect(returned).not.toBe(h.initial);const returnedScene=returned as WorldScene,returnedView=returned.captureCameraView();expect(returnedView.zoom).toBe(original.zoom);expect(returnedView.centre.x).toBeCloseTo(angledView.centre.x,8);expect(returnedView.centre.y).toBeCloseTo(angledView.centre.y,8);
  expect(h.scenes).toHaveLength(3);expect(h.layer().dataset.ready).toBe('clear');expect(h.layer().children[0]!.children).toHaveLength(28);expect(h.actors.sent.filter(m=>m.kind==='simulation/submit-command')).toHaveLength(0);expect(await h.actors.host.capture()).toEqual(before);
  dispatch(h.canvas,'pointerup',h.point);await h.paint();await h.paint();expect(await h.actors.host.capture()).toEqual(before);expect(h.tool.isArmed()).toBe(true);
  const expected=independentWorldOrigin(returnedScene,h.point);dispatch(h.canvas,'pointerdown',h.point);await h.paint();expect(await h.actors.host.capture()).toEqual(before);dispatch(h.canvas,'pointerup',h.point);await h.paint();await h.paint();
  const commands=h.actors.sent.filter(m=>m.kind==='simulation/submit-command');expect(commands).toHaveLength(1);expect(commands[0]!.payload).toMatchObject({command:{data:{type:'PlaceRoomTemplate',templateId:'cell-basic',origin:expected,quarterTurns:1,mirrorX:true}}});const accepted=await h.actors.host.capture();expect(accepted.construction.orders).toHaveLength(18);expect(accepted.simulation?.roomTemplates?.pending).toMatchObject([{origin:expected,quarterTurns:1,mirrorX:true}]);expect(h.tool.isArmed()).toBe(false);
  writeFileSync(new URL('./observed-roundtrip.json',import.meta.url),JSON.stringify({original,angledView,returnedView,memory:h.ports.memory(),expected,orders:accepted.construction.orders.length,originalReleasePreservedWholeSnapshot:true,freshPressOnlyPurchase:true,wholeBeforeHash:createHash('sha256').update(JSON.stringify(before)).digest('hex'),wholeAcceptedHash:createHash('sha256').update(JSON.stringify(accepted)).digest('hex'),commands:commands.map(m=>m.payload.command.data)},null,2)+'\n');
 }finally{h.dispose();await h.actors.host.stop();}
});
