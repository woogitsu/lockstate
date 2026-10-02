import { element } from '../primitives/dom';

export type HudRendererMode = 'world' | 'oblique';
export interface RendererSelectionLabels { readonly region: string; readonly world: string; readonly oblique: string; readonly failure: string }
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
    select.setCustomValidity('');
    const focusedBeforeChange=document.activeElement===select;
    let navigatedAway=false;
    const navigationKey=(event:KeyboardEvent)=>{if(event.key==='Tab') navigatedAway=true;};
    const navigationPointer=()=>{navigatedAway=true;};
    if(focusedBeforeChange){
      document.addEventListener('keydown',navigationKey,true);
      document.addEventListener('pointerdown',navigationPointer,true);
    }
    select.disabled=true;
    select.setAttribute('aria-busy','true');
    void onSelect(requested).then(()=>{current=requested;select.value=current;},error=>{select.value=current;select.setCustomValidity(labels.failure);onError(error);}).finally(()=>{
      document.removeEventListener('keydown',navigationKey,true);
      document.removeEventListener('pointerdown',navigationPointer,true);
      select.disabled=false;select.setAttribute('aria-busy','false');
      if(focusedBeforeChange&&!navigatedAway&&document.activeElement===document.body) select.focus({preventScroll:true});
      if (!select.validity.valid&&!navigatedAway&&(document.activeElement===document.body||document.activeElement===select)) select.reportValidity();
    });
  });
  return {element:select,update:(mode)=>{current=mode;select.value=mode;}};
}
