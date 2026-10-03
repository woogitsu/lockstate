import { afterEach, expect, it, vi } from 'vitest';
import { createRoomTemplatePreview } from '../../../src/ui/hud/room-template-preview';
import { RoomTemplateTool } from '../../../src/ui/room-template-tool';
import { createSimulationRoomTemplatePreflight, createSimulationRoomTemplateQuote } from '../../../src/ui/simulation-room-template-port';
import { SimulationCommandSender } from '../../../src/ui/simulation-commands';
import { SimulationWorkerStateMachine } from '../../../src/simulation/worker/state-machine';
import type { MainToWorkerMessage, WorkerToMainMessage } from '../../../src/simulation/protocol/types';
import { createNewSimulationRuntime } from '../../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, SESSION_SNAPSHOT_SCHEMA_ID, SESSION_SNAPSHOT_SCHEMA_VERSION, type SessionSnapshotBundle } from '../../../src/simulation/runtime/restore-session';
import { BUILDABLE_REGISTRY } from '../../../src/simulation/construction/definition';
import { defaultObjectRegistry } from '../../../src/content/object-catalog';
import { Localizer, defaultMessageCatalogEn } from '../../../src/services/localization';
import { formatRoomTemplateQuote } from '../../../src/ui/hud/room-template-quote';

// Source audit only: DOM plumbing runs production listeners. These are not
// trusted browser events and do not establish native dialog/window bubbling.
class ElementStub extends EventTarget {
  readonly attributes=new Map<string,string>();
  readonly style:Record<string,string>={}; readonly dataset:Record<string,string>={};
  readonly classes=new Set<string>();
  readonly classList={add:(n:string)=>{this.classes.add(n);},remove:(n:string)=>{this.classes.delete(n);},contains:(n:string)=>this.classes.has(n)};
  readonly children:ElementStub[]=[]; parentElement:ElementStub|undefined;
  className=''; textContent=''; value=''; checked=false; disabled=false; tabIndex=0; id=''; open=false;
  setAttribute(n:string,v:string):void {this.attributes.set(n,v);if(n==='value') this.value=v;}
  append(...nodes:ElementStub[]):void {for(const node of nodes) node.parentElement=this;this.children.push(...nodes);}
  after(...nodes:ElementStub[]):void {const p=this.parentElement;if(p===undefined)return;for(const n of nodes)n.parentElement=p;p.children.splice(p.children.indexOf(this)+1,0,...nodes);}
  replaceChildren(...nodes:ElementStub[]):void {this.children.splice(0,this.children.length,...nodes);}
  focus():void {Reflect.set(document,'activeElement',this);}
  showModal():void {this.open=true;}
  close():void {this.open=false;this.dispatchEvent(new Event('close'));}
}
afterEach(()=>vi.unstubAllGlobals());

function actualWorker() {
  const listeners:((message:WorkerToMainMessage)=>void)[]=[]; const sent:MainToWorkerMessage[]=[];
  const machine=new SimulationWorkerStateMachine({postMessage(message:WorkerToMainMessage){for(const listener of listeners)listener(message);}},'dialog-reopen-audit',()=>0);
  const channel={addListener:(listener:(message:WorkerToMainMessage)=>void)=>listeners.push(listener),send:(message:MainToWorkerMessage)=>{sent.push(message);machine.handleMessage(message);}};
  const commands=new SimulationCommandSender(channel);
  const initial=captureSessionSnapshot(createNewSimulationRuntime(73));
  channel.send({protocolVersion:1,messageId:'init',kind:'simulation/initialize',payload:{sessionId:'dialog-reopen-audit',source:{kind:'snapshot',snapshot:{transport:'structured-clone',schemaId:SESSION_SNAPSHOT_SCHEMA_ID,schemaVersion:SESSION_SNAPSHOT_SCHEMA_VERSION,data:initial as unknown as null}}}});
  return {channel,commands,sent,snapshot(){
    const id='read-'+sent.length;let result:SessionSnapshotBundle|undefined;
    const reader=(message:WorkerToMainMessage)=>{if(message.kind==='simulation/snapshot'&&message.replyTo===id)result=message.payload.snapshot.data as unknown as SessionSnapshotBundle;};
    listeners.push(reader);channel.send({protocolVersion:1,messageId:id,kind:'simulation/request-snapshot',payload:{reason:'consistency-check'}});
    listeners.splice(listeners.indexOf(reader),1);if(result===undefined)throw Error('Actual worker snapshot missing');return result;
  }};
}

for(const mirrorX of [false,true]) it(`actual public dialog q1 mirror=${mirrorX} Escape/reopen preserves owner then submits one shell`,async()=>{
  const elements:ElementStub[]=[];
  vi.stubGlobal('document',{activeElement:null,createElement:()=>{const e=new ElementStub();elements.push(e);return e;}});
  vi.stubGlobal('HTMLElement',ElementStub);
  const actors=actualWorker();
  const tool=new RoomTemplateTool({preflight:createSimulationRoomTemplatePreflight(actors.channel),quote:createSimulationRoomTemplateQuote(actors.channel),
    objectFootprint:id=>{const objectId=BUILDABLE_REGISTRY.get(id)?.placesObjectId;return objectId===undefined?undefined:defaultObjectRegistry.getById(objectId)?.footprint;},
    place:async request=>actors.commands.submit({type:'PlaceRoomTemplate',...request})});
  const localizer=new Localizer({locale:'en',catalogs:[defaultMessageCatalogEn]});
  const preview=createRoomTemplatePreview(localizer,tool),dialog=preview.dialog as unknown as ElementStub;
  const byClass=(c:string)=>elements.find(e=>e.className===c)!;
  const rotation=byClass('hud-template__rotation'),status=byClass('hud-template__status'),quote=byClass('hud-template__quote');
  const submit=elements.find(e=>e.textContent==='Place room plan')!;
  for(const label of ['Plan origin X','Plan origin Y']) {const input=elements.find(e=>e.attributes.get('aria-label')===label)!;input.value='5';input.dispatchEvent(new Event('input'));}
  preview.openButton.dispatchEvent(new Event('click'));
  elements.find(e=>e.textContent==='Place on map')!.dispatchEvent(new Event('click'));
  expect(dialog.open).toBe(false);expect(tool.isArmed()).toBe(true);
  preview.openButton.dispatchEvent(new Event('click'));
  rotation.value='1';rotation.dispatchEvent(new Event('change'));
  const mirror=elements.find(e=>e.attributes.get('type')==='checkbox')!;mirror.checked=mirrorX;mirror.dispatchEvent(new Event('change'));
  const expectedQuote={orderCount:20,materials:[{itemId:'item.brick',quantity:35},{itemId:'item.wood-plank',quantity:2}],catalogueCostMinorUnits:1530};
  await vi.waitFor(()=>{expect(submit.disabled).toBe(false);expect(quote.textContent).toBe(formatRoomTemplateQuote(localizer,expectedQuote));});
  expect(byClass('hud-template__dimensions').textContent).toBe('7 × 4');
  const revision=tool.revision,baseline=actors.snapshot();
  const escape=new Event('keydown',{cancelable:true});Object.assign(escape,{key:'Escape'});dialog.dispatchEvent(escape);
  expect(escape.defaultPrevented).toBe(true);expect(dialog.open).toBe(false);
  expect(document.activeElement).toBe(preview.openButton);expect(tool.isArmed()).toBe(true);expect(tool.revision).toBe(revision);
  expect(actors.sent.filter(m=>m.kind==='simulation/submit-command')).toEqual([]);expect(actors.snapshot()).toEqual(baseline);
  preview.openButton.dispatchEvent(new Event('click'));expect(dialog.open).toBe(true);
  expect(submit.disabled).toBe(true);expect(status.attributes.get('aria-busy')).toBe('true');
  await vi.waitFor(()=>{expect(submit.disabled).toBe(false);expect(status.textContent).toBe('This footprint is clear.');expect(quote.textContent).toBe(formatRoomTemplateQuote(localizer,expectedQuote));});
  expect(rotation.value).toBe('1');expect(mirror.checked).toBe(mirrorX);expect(tool.revision).toBe(revision);
  expect(actors.snapshot()).toEqual(baseline);
  submit.dispatchEvent(new Event('click'));
  await vi.waitFor(()=>expect(status.textContent).toBe('Room plan submitted.'));
  expect(tool.isArmed()).toBe(false);expect(actors.sent.filter(m=>m.kind==='simulation/submit-command')).toHaveLength(1);
  const actual=actors.snapshot();
  expect(actual.simulation?.roomTemplates?.pending).toEqual([{templateId:'cell-basic',origin:{x:5,y:5},mirrorX,quarterTurns:1,sequence:0}]);
  const doorY=mirrorX?2:1;
  const walls=[];for(let y=0;y<4;y++)for(let x=0;x<7;x++)if((x===0||y===0||x===6||y===3)&&!(x===0&&y===doorY))walls.push({definitionId:'wall-brick',location:{x:5+x,y:5+y},footprint:'square'});
  expect(actual.construction.orders).toHaveLength(18);
  const byTile=(a:{location:{x:number;y:number}},b:{location:{x:number;y:number}})=>a.location.y-b.location.y||a.location.x-b.location.x;
  expect(actual.construction.orders.filter(o=>o.definitionId==='wall-brick').map(o=>({definitionId:o.definitionId,location:o.location,footprint:o.footprint})).sort(byTile)).toEqual(walls.sort(byTile));
  expect(actual.construction.orders.filter(o=>o.definitionId==='door-wooden').map(o=>({location:o.location,edge:o.edge}))).toEqual([{location:{x:6,y:5+doorY},edge:'west'}]);
  submit.dispatchEvent(new Event('click'));for(let i=0;i<10;i++)await Promise.resolve();
  expect(actors.sent.filter(m=>m.kind==='simulation/submit-command')).toHaveLength(1);expect(actors.snapshot()).toEqual(actual);
});
