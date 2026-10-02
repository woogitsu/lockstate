import { element } from '../primitives/dom';

export type HudRendererMode = 'world' | 'oblique';
export interface RendererSelectionLabels { readonly region: string; readonly world: string; readonly oblique: string }
export interface RendererSelectionControl {
  readonly element: HTMLElement;
  update(mode: HudRendererMode): void;
}

/** Renderer-only host port: the control never reloads a page or submits a game command. */
export function createRendererSelectionControl(
  labels: RendererSelectionLabels,
  initial: HudRendererMode,
  onSelect: (mode: HudRendererMode) => Promise<void>,
  onError: (error: unknown) => void,
): RendererSelectionControl {
  let current=initial;
  const select=element('select', {
    className: 'hud-build__category',
    attributes: {'aria-label': labels.region},
    children: [element('option',{text:labels.world,attributes:{value:'world'}}),element('option',{text:labels.oblique,attributes:{value:'oblique'}})],
  });
  select.value=initial;
  select.addEventListener('change',()=>{
    if(select.disabled) return;
    const requested=select.value;
    if(requested!=='world'&&requested!=='oblique') {select.value=current;return;}
    select.disabled=true;
    select.setAttribute('aria-busy','true');
    void onSelect(requested).then(()=>{current=requested;select.value=current;},error=>{select.value=current;onError(error);}).finally(()=>{
      select.disabled=false;select.setAttribute('aria-busy','false');
    });
  });
  return {element:select,update:(mode)=>{current=mode;select.value=mode;}};
}
