import {afterEach,expect,it,vi} from 'vitest';
import {createRendererSelectionControl} from '../../src/ui/hud/renderer-selection-control';
class ElementStub extends EventTarget {
  readonly children:ElementStub[]=[];readonly attributes=new Map<string,string>();
  className='';textContent='';value='';validationMessage='';reported=0;
  private unavailable=false;
  get disabled():boolean{return this.unavailable;}
  set disabled(value:boolean){this.unavailable=value;if(value&&document.activeElement===this as unknown as Element) (document as unknown as DocumentStub).activeElement=(document as unknown as DocumentStub).body;}
  focus():void{(document as unknown as DocumentStub).activeElement=this;}

  readonly validity={valid:true};
  setCustomValidity(message:string):void {this.validationMessage=message;this.validity.valid=message==='';}
  reportValidity():boolean {this.reported+=1;return this.validity.valid;}
  setAttribute(key:string,value:string):void {this.attributes.set(key,value);}
  append(...nodes:ElementStub[]):void {this.children.push(...nodes);}
}
class DocumentStub extends EventTarget {
  readonly body=new ElementStub();activeElement:ElementStub=this.body;
  createElement():ElementStub{return new ElementStub();}
}
afterEach(()=>vi.unstubAllGlobals());
function setup() {
  vi.stubGlobal('document',new DocumentStub());
  let finish!:()=>void;
  const change=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;}));
  const error=vi.fn();
  const control=createRendererSelectionControl({region:'View',world:'Top-down',oblique:'Angled',failure:'Could not change view. Choose a view to try again.'},'world',change,error);
  return {control,select:control.element as unknown as ElementStub,change,error,finish:()=>finish()};
}
it('awaits actual renderer replacement and disables repeated requests while busy',async()=>{
  const s=setup();expect(s.select.value).toBe('world');
  expect(s.select.attributes.get('aria-label')).toBe('View');
  s.select.value='oblique';s.select.dispatchEvent(new Event('change'));
  expect(s.change).toHaveBeenCalledWith('oblique');
  expect(s.select.disabled).toBe(true);expect(s.select.attributes.get('aria-busy')).toBe('true');
  s.select.dispatchEvent(new Event('change'));expect(s.change).toHaveBeenCalledTimes(1);
  s.finish();await vi.waitFor(()=>expect(s.select.disabled).toBe(false));
  expect(s.select.value).toBe('oblique');expect(s.select.attributes.get('aria-busy')).toBe('false');
});
it('restores active mode on failure and reflects host rollback without issuing another request',async()=>{
  const s=setup();s.change.mockRejectedValueOnce(new Error('catalogue'));
  s.select.value='oblique';s.select.dispatchEvent(new Event('change'));
  await vi.waitFor(()=>expect(s.select.disabled).toBe(false));
  expect(s.select.value).toBe('world');expect(s.error).toHaveBeenCalledOnce();
  expect(s.select.validationMessage).toBe('Could not change view. Choose a view to try again.');
  expect(s.select.reported).toBe(1);
  s.control.update('oblique');expect(s.select.value).toBe('oblique');expect(s.change).toHaveBeenCalledTimes(1);
});

it('restores native focus lost to disabling after successful replacement',async()=>{
  const s=setup();s.select.focus();s.select.value='oblique';s.select.dispatchEvent(new Event('change'));
  expect(document.activeElement).toBe(document.body);s.finish();await vi.waitFor(()=>expect(s.select.disabled).toBe(false));
  expect(document.activeElement).toBe(s.select);
});
it.each(['Tab','pointer'])('does not undo intentional %s navigation while replacing',async navigation=>{
  const s=setup();s.select.focus();s.select.value='oblique';s.select.dispatchEvent(new Event('change'));
  const event=new Event(navigation==='Tab'?'keydown':'pointerdown');if(navigation==='Tab')Object.defineProperty(event,'key',{value:'Tab'});
  document.dispatchEvent(event);s.finish();await vi.waitFor(()=>expect(s.select.disabled).toBe(false));
  expect(document.activeElement).toBe(document.body);
});
it('does not steal focus moved to a different control while replacing',async()=>{
  const s=setup();s.select.focus();s.select.value='oblique';s.select.dispatchEvent(new Event('change'));
  const other=new ElementStub();other.focus();s.finish();await vi.waitFor(()=>expect(s.select.disabled).toBe(false));
  expect(document.activeElement).toBe(other);
});

it('keeps failure validity without opening a focus-stealing popup after navigation',async()=>{
  const s=setup();let refuse!:(error:Error)=>void;s.change.mockImplementationOnce(()=>new Promise<void>((_,reject)=>{refuse=reject;}));
  s.select.focus();s.select.value='oblique';s.select.dispatchEvent(new Event('change'));
  const event=new Event('keydown');Object.defineProperty(event,'key',{value:'Tab'});document.dispatchEvent(event);
  const other=new ElementStub();other.focus();refuse(new Error('503'));
  await vi.waitFor(()=>expect(s.select.disabled).toBe(false));
  expect(s.select.validity.valid).toBe(false);expect(s.select.reported).toBe(0);expect(s.error).toHaveBeenCalledOnce();expect(document.activeElement).toBe(other);
});
