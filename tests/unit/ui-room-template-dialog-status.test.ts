import {afterEach,expect,it,vi} from 'vitest';
import {createRoomTemplatePreview} from '../../src/ui/hud/room-template-preview';
import {RoomTemplateTool} from '../../src/ui/room-template-tool';
import {Localizer,defaultMessageCatalogEn} from '../../src/services/localization';

// Small DOM test double; executes the actual dialog event listeners without
// a browser, including its async worker-facing tool rather than copied logic.
class ElementStub extends EventTarget {
  readonly children:ElementStub[]=[];
  readonly attributes=new Map<string,string>();
  readonly style:Record<string,string>={};
  readonly dataset:Record<string,string>={};
  readonly classes=new Set<string>();
  readonly classList={add:(name:string)=>{this.classes.add(name);},remove:(name:string)=>{this.classes.delete(name);},contains:(name:string)=>this.classes.has(name)};
  className=''; textContent=''; value=''; checked=false; disabled=false; tabIndex=0; id='';
  setAttribute(name:string,value:string):void {this.attributes.set(name,value);if(name==='value') this.value=value;}
  append(...elements:ElementStub[]):void {this.children.push(...elements);}
  replaceChildren(...elements:ElementStub[]):void {this.children.splice(0,this.children.length,...elements);}
  focus():void {focused=this;}
  showModal():void {}
  close():void {this.dispatchEvent(new Event('close'));}
}
let focused:ElementStub|undefined;
afterEach(()=>{vi.unstubAllGlobals();focused=undefined;});

it.each(['preflight','accepted','rejected'] as const)('ignores obsolete %s completion after a new room card is selected',async phase=>{
  const elements:ElementStub[]=[];
  vi.stubGlobal('document',{createElement:()=>{const element=new ElementStub();elements.push(element);return element;}});
  vi.stubGlobal('HTMLElement',ElementStub);
  let hold=false;
  let finish!:()=>void;
  const preflight=vi.fn(async()=>{
    if(hold&&phase==='preflight') {hold=false;await new Promise<void>(resolve=>{finish=resolve;});}
    return {ok:true as const};
  });
  const place=vi.fn(async()=>{
    if(hold) {hold=false;await new Promise<void>((resolve,reject)=>{finish=phase==='rejected'?()=>reject(new Error('obsolete worker error')):resolve;});}
  });
  const tool=new RoomTemplateTool({preflight,place,quote:async()=>({orderCount:0,materials:[],catalogueCostMinorUnits:0})});
  createRoomTemplatePreview(new Localizer({locale:'en',catalogs:[defaultMessageCatalogEn]}),tool);
  const status=elements.find(e=>e.className==='hud-template__status')!;
  const submit=elements.find(e=>e.textContent==='Place room plan')!;
  const yard=elements.find(e=>e.attributes.get('data-template-id')==='yard-basic')!;
  await vi.waitFor(()=>expect(submit.disabled).toBe(false));
  hold=true;submit.dispatchEvent(new Event('click'));
  await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));
  yard.focus();yard.dispatchEvent(new Event('click'));
  await vi.waitFor(()=>expect(submit.disabled).toBe(false));
  expect(status.textContent).toBe('This footprint is clear.');
  finish();
  // Exhaust the actual async tool -> listener promise chain before checking.
  for(let i=0;i<10;i+=1) await Promise.resolve();
  expect(status.textContent).toBe('This footprint is clear.');
  expect(submit.disabled).toBe(false);
  expect(focused).toBe(yard);
  expect(yard.attributes.get('aria-pressed')).toBe('true');
  expect(place).toHaveBeenCalledTimes(phase==='preflight'?0:1);
});

it('groups the selected full bed and keeps worker collision visible over its overlay in both orientations', async () => {
  const elements:ElementStub[]=[];
  vi.stubGlobal('document',{createElement:()=>{const element=new ElementStub();elements.push(element);return element;}});
  vi.stubGlobal('HTMLElement',ElementStub);
  const tool=new RoomTemplateTool({
    objectFootprint:id=>id==='bed-wooden'?{width:1,height:2}:{width:1,height:1},
    preflight:async request=>({ok:false as const,reason:'object-occupied' as const,tile:{x:request.mirrorX?2:1,y:2}}),
    place:async()=>{},
  });
  createRoomTemplatePreview(new Localizer({locale:'en',catalogs:[defaultMessageCatalogEn]}),tool);
  const diagram=elements.find(e=>e.className==='hud-template__diagram')!;
  const status=elements.find(e=>e.className==='hud-template__status')!;
  await vi.waitFor(()=>expect(status.textContent).toContain('2)'));
  const fixtures=()=>diagram.children.filter(e=>e.className==='hud-template__fixture');
  expect(diagram.children.filter(e=>e.className.startsWith('hud-template__tile '))).toHaveLength(28);
  expect(fixtures()).toHaveLength(2);
  expect(fixtures()[0]!.style['gridRow']).toBe('2 / span 2');
  expect(diagram.children[9]!.classList.contains('hud-template__tile--blocked')).toBe(true);
  expect(fixtures()[0]!.classList.contains('hud-template__tile--blocked')).toBe(true);
  expect(fixtures()[0]!.attributes.get('aria-hidden')).toBe('true');
  const mirror=elements.find(e=>e.attributes.get('type')==='checkbox')!;
  mirror.checked=true;mirror.dispatchEvent(new Event('change'));
  await vi.waitFor(()=>expect(status.textContent).toContain('(2, 2)'));
  expect(fixtures()[0]!.style['gridColumn']).toBe('3 / span 1');
  expect(fixtures()[0]!.style['gridRow']).toBe('2 / span 2');
  expect(fixtures()[0]!.classList.contains('hud-template__tile--blocked')).toBe(true);
});

it.each(['ready','blocked'] as const)('withdraws previous %s and collision marks while a reopened check is pending', async previous => {
  const elements:ElementStub[]=[];
  vi.stubGlobal('document',{createElement:()=>{const element=new ElementStub();elements.push(element);return element;}});
  vi.stubGlobal('HTMLElement',ElementStub);
  let pending=false,finish!:()=>void;
  const tool=new RoomTemplateTool({
    objectFootprint:id=>id==='bed-wooden'?{width:1,height:2}:{width:1,height:1},
    preflight:async()=>{
      if(pending) {await new Promise<void>(resolve=>{finish=resolve;});return {ok:true as const};}
      return previous==='ready'?{ok:true as const}:{ok:false as const,reason:'object-occupied' as const,tile:{x:1,y:2}};
    },place:async()=>{},
  });
  const preview=createRoomTemplatePreview(new Localizer({locale:'en',catalogs:[defaultMessageCatalogEn]}),tool);
  const status=elements.find(e=>e.className==='hud-template__status')!;
  const submit=elements.find(e=>e.textContent==='Place room plan')!;
  const diagram=elements.find(e=>e.className==='hud-template__diagram')!;
  await vi.waitFor(()=>expect(status.textContent).toContain(previous==='ready'?'This footprint is clear.':'This footprint is blocked.'));
  if(previous==='blocked') expect(diagram.children.filter(e=>e.classList.contains('hud-template__tile--blocked'))).toHaveLength(2);
  pending=true;preview.openButton.dispatchEvent(new Event('click'));
  expect(submit.disabled).toBe(true);
  expect(status.textContent).toBe('');
  expect(status.attributes.get('aria-busy')).toBe('true');
  expect(diagram.children.some(e=>e.classList.contains('hud-template__tile--blocked'))).toBe(false);
  finish();
  await vi.waitFor(()=>expect(status.textContent).toBe('This footprint is clear.'));
  expect(status.attributes.get('aria-busy')).toBe('false');
  expect(submit.disabled).toBe(false);
});
