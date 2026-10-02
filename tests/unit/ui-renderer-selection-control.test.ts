import {afterEach,expect,it,vi} from 'vitest';
import {createRendererSelectionControl} from '../../src/ui/hud/renderer-selection-control';
class ElementStub extends EventTarget {
  readonly children:ElementStub[]=[];readonly attributes=new Map<string,string>();
  className='';textContent='';disabled=false;value='';
  setAttribute(key:string,value:string):void {this.attributes.set(key,value);}
  append(...nodes:ElementStub[]):void {this.children.push(...nodes);}
}
afterEach(()=>vi.unstubAllGlobals());
function setup() {
  vi.stubGlobal('document',{createElement:()=>new ElementStub()});
  let finish!:()=>void;
  const change=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;}));
  const error=vi.fn();
  const control=createRendererSelectionControl({region:'View',world:'Top-down',oblique:'Angled'},'world',change,error);
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
  s.control.update('oblique');expect(s.select.value).toBe('oblique');expect(s.change).toHaveBeenCalledTimes(1);
});
