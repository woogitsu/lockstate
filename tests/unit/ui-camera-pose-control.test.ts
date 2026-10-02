import {afterEach,expect,it,vi} from 'vitest';
import {createCameraPoseControl} from '../../src/ui/hud/camera-pose-control';
import {Localizer,defaultMessageCatalogEn} from '../../src/services/localization';
class ElementStub extends EventTarget {
  readonly children:ElementStub[]=[];readonly attributes=new Map<string,string>();
  readonly dataset:Record<string,string>={}; className='';textContent='';disabled=false;
  setAttribute(key:string,value:string):void {this.attributes.set(key,value);}
  append(...nodes:ElementStub[]):void {this.children.push(...nodes);}
}
afterEach(()=>vi.unstubAllGlobals());
it('uses four compact icon controls with existing accessible labels and distinct action ports',()=>{
  const create=()=>new ElementStub();
  vi.stubGlobal('document',{createElement:create,createElementNS:create});
  const step=vi.fn();
  const group=createCameraPoseControl(new Localizer({locale:'en',catalogs:[defaultMessageCatalogEn]}),step) as unknown as ElementStub;
  const labels=['Rotate camera left','Rotate camera right','Raise camera angle','Lower camera angle'];
  expect(group.children).toHaveLength(4);
  group.children.forEach((button,index)=>{
    expect(button.className).toContain('ui-icon-button');
    expect(button.attributes.get('title')).toBe(labels[index]);
    expect(button.children[0]!.attributes.get('aria-hidden')).toBe('true');
    expect(button.children[1]!.className).toBe('ui-sr-only');
    expect(button.children[1]!.textContent).toBe(labels[index]);
    button.dispatchEvent(new Event('click'));
  });
  expect(step.mock.calls).toEqual([['yaw',-1],['yaw',1],['elevation',1],['elevation',-1]]);
});
