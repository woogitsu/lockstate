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
  readonly classList={add:()=>{},remove:()=>{}};
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
