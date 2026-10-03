import { afterEach, expect, it, vi } from 'vitest';
import { appendFileSync, readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { SimulationWorkerChannel } from '../../src/simulation/worker/worker-channel';
import { SimulationWorkerStateMachine } from '../../src/simulation/worker/state-machine';
import type { SimulationClient, WorkerMessageHandler } from '../../src/simulation/worker/client';
import type { MainToWorkerMessage, WorkerToMainMessage } from '../../src/simulation/protocol/types';
import { WorkerPerSessionHost } from '../../src/persistence/session/worker-per-session-host';
import { SimulationCommandSender } from '../../src/ui/simulation-commands';
import { WorldScene } from '../../src/rendering/scene/world-scene';
import { ObliqueWorldScene } from '../../src/rendering/scene/oblique-world-scene';
import { EMPTY_RENDER_FRAME } from '../../src/rendering/feed/render-feed';
import { createRoomTemplatePreview } from '../../src/ui/hud/room-template-preview';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { RoomTemplateTool } from '../../src/ui/room-template-tool';
import { createSimulationRoomTemplatePreflight, createSimulationRoomTemplateQuote } from '../../src/ui/simulation-room-template-port';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import type { SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';

// Transport-only delay: actual worker machine computes every response. No
// substituted verdict/runtime/world/ownership data is introduced.
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

const source = readFileSync('src/main.ts', 'utf8');
const start = source.indexOf('onWorkerAvailability: (available) => {');
const end = source.indexOf('\n      },', start);
if (start < 0 || end < 0) throw Error('Real worker availability callback missing');
const callback = stripTypeScriptTypes(source.slice(start, end + '\n      }'.length).replace(/^onWorkerAvailability: /, ''), { mode: 'strip' });
function availability(tool: RoomTemplateTool, scene: WorldScene | ObliqueWorldScene) {
  return new Function('roomTemplateTool', 'worldScene', 'ObliqueWorldScene', 'hud', 'SIMULATION_UNAVAILABLE_NOTICE', 'crashReporter', `return (${callback});`)
    (tool, scene, ObliqueWorldScene, { setUnavailable() {} }, 'unavailable', undefined) as (available: boolean) => void;
}
afterEach(() => {vi.useRealTimers();vi.unstubAllGlobals();});
vi.mock('phaser',()=>({default:{Scene:class{readonly cameras={main:{width:1920,height:1080}};readonly scale={displayScale:{x:1,y:1}};}}}));

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

async function setup(mode:'world'|'oblique') {
 vi.useFakeTimers();
 const elements:ElementStub[]=[];
 vi.stubGlobal('document',{activeElement:null,createElement:(tag:string)=>{const e=new ElementStub(tag.toUpperCase());elements.push(e);return e;}});
 vi.stubGlobal('HTMLElement',ElementStub);vi.stubGlobal('window',new EventTarget());
 const clients:InProcessClient[]=[];
 const channel=new SimulationWorkerChannel(()=>{const client=new InProcessClient();clients.push(client);return client as unknown as SimulationClient;});channel.open();
 const commands=new SimulationCommandSender(channel,{now:()=>0});
 const tool=new RoomTemplateTool({preflight:createSimulationRoomTemplatePreflight(channel),quote:createSimulationRoomTemplateQuote(channel),place:async request=>commands.submit({type:'PlaceRoomTemplate',...request})});
 const scene=new (mode==='world'?WorldScene:ObliqueWorldScene)({feed:{readFrame:()=>EMPTY_RENDER_FRAME},keyValueStore:{getItem:()=>null,setItem:()=>undefined}});
 const host=new WorkerPerSessionHost(channel,{onWorkerAvailability:availability(tool,scene)});
 await host.startNew(73);await host.capture();
 commands.submit({type:'PlaceRoomTemplate',templateId:'cell-basic',origin:{x:20,y:5},quarterTurns:1});
 const saved=await host.capture();expect(saved.construction.orders).toHaveLength(18);
 const decoded=decodeSaveEnvelope(JSON.parse(JSON.stringify(createSaveEnvelope({gameVersion:'test',prisonId:'numeric-readiness',revision:1,createdAt:0,updatedAt:1,...saved}))));
 expect(decoded.ok).toBe(true);if(!decoded.ok)throw Error('Actual V8 saved fixture must decode');
 const preview=createRoomTemplatePreview(new Localizer({locale:'en',catalogs:[defaultMessageCatalogEn]}),tool);
 const x=elements.find(e=>e.attributes.get('aria-label')==='Plan origin X')!,y=elements.find(e=>e.attributes.get('aria-label')==='Plan origin Y')!,rotation=elements.find(e=>e.className==='hud-template__rotation')!;
 x.value='20';x.dispatchEvent(new Event('input'));y.value='5';y.dispatchEvent(new Event('input'));rotation.value='1';rotation.dispatchEvent(new Event('change'));
 const flush=async()=>{for(let n=0;n<16;n++) await Promise.resolve();};await flush();
 return{host,clients,tool,preview,x,y,rotation,flush,saved:decoded.value.payload as unknown as SessionSnapshotBundle,submit:elements.find(e=>e.textContent==='Place room plan')!,status:elements.find(e=>e.className==='hud-template__status')!};
}
for(const mode of ['world','oblique'] as const) for(const replacement of ['new','load'] as const) it(`${mode}/${replacement}: legal close-session-reopen numeric verdict belongs to real replacement worker`,async()=>{
 const h=await setup(mode);
 try {
  expect(h.submit.disabled).toBe(true);expect(h.status.textContent).toContain('This footprint is blocked.');
  h.tool.arm();h.preview.openButton.dispatchEvent(new Event('click'));await h.flush();
  h.clients[0]!.holdPreflight=true;h.x.dispatchEvent(new Event('input'));await h.flush();
  expect(h.clients[0]!.held).toHaveLength(1);expect(h.submit.disabled).toBe(true);
  h.preview.dialog.close(); // Actual modal must close before outside session controls are reachable.
  if(replacement==='new')await h.host.startNew(74);else await h.host.startFromSnapshot(h.saved);
  const replacementWorld=await h.host.capture();expect(h.clients).toHaveLength(2);expect(h.clients[0]!.terminated).toBe(true);expect(h.tool.isArmed()).toBe(false);
  h.preview.openButton.dispatchEvent(new Event('click'));await h.flush();
  const currentStatus=h.status.textContent,currentDisabled=h.submit.disabled;
  expect(currentDisabled).toBe(replacement==='load');expect(currentStatus).toContain(replacement==='load'?'This footprint is blocked.':'This footprint is clear.');
  h.clients[0]!.release();await h.flush();expect(h.status.textContent).toBe(currentStatus);expect(h.submit.disabled).toBe(currentDisabled);
  await vi.advanceTimersByTimeAsync(15000);await h.flush(); // Original requester timeout, not raised.
  expect(h.status.textContent).toBe(currentStatus);expect(h.submit.disabled).toBe(currentDisabled);
  h.submit.dispatchEvent(new Event('click'));await h.flush();
  const actualCommands=h.clients[1]!.sent.filter(m=>m.kind==='simulation/submit-command');expect(actualCommands).toHaveLength(replacement==='new'?1:0);
  if(replacement==='new')expect(actualCommands[0]!.payload).toMatchObject({command:{data:{type:'PlaceRoomTemplate',templateId:'cell-basic',origin:{x:20,y:5},quarterTurns:1}}});
  const final=await h.host.capture();expect(final.construction.orders).toHaveLength(18);
  expect(final.simulation?.roomTemplates?.pending).toMatchObject([{templateId:'cell-basic',origin:{x:20,y:5},quarterTurns:1}]);
  if(replacement==='load')expect(final).toEqual(replacementWorld);
  if(process.env.TEMPLATE_NUMERIC_SESSION_RECEIPT!==undefined)appendFileSync(process.env.TEMPLATE_NUMERIC_SESSION_RECEIPT,JSON.stringify({mode,replacement,oldPreflightReplyDropped:true,status:currentStatus,disabled:currentDisabled,actualCommands:actualCommands.map(m=>m.payload.command.data),orders:final.construction.orders.length})+'\n');
 } finally {await h.host.stop();}
});
