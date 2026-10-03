import { element, nextUiId } from '../primitives/dom';

export type CameraControlPresentationVariant = 'disclosure' | 'always';

/** Owner-selected #1292 A presentation. Reuses original control nodes/ports. */
export function createCameraControlsPresentation(options: {
  readonly variant: CameraControlPresentationVariant;
  readonly viewLabel: string;
  readonly hud: HTMLElement;
  readonly zoom: HTMLElement;
  readonly select?: HTMLElement;
  readonly controls: readonly HTMLElement[];
  readonly onFocus?: () => void;
}) {
  const panel = element('section', { className: 'hud-camera-panel', attributes: {
    id: nextUiId('camera-view'), role: 'region', 'aria-label': options.viewLabel,
  }, children: [...(options.select === undefined ? [] : [options.select]), ...options.controls] });
  panel.dataset['presentation'] = options.variant;
  options.hud.append(panel);
  const trigger = options.variant === 'disclosure' ? element('button', {
    className: 'ui-icon-button ui-icon-button--bordered hud-camera-panel__trigger', text: options.viewLabel,
    attributes: { type: 'button', 'aria-controls': panel.id, 'aria-expanded': 'false' },
  }) : undefined;
  panel.hidden = trigger !== undefined;
  if (trigger !== undefined) {
    options.zoom.append(trigger);
    trigger.addEventListener('focus', () => options.onFocus?.());
    trigger.addEventListener('click', () => {
      panel.hidden = !panel.hidden; trigger.setAttribute('aria-expanded', String(!panel.hidden));
      position();
      if (!panel.hidden) options.select?.focus({ preventScroll: true });
    });
    panel.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      event.stopPropagation(); panel.hidden = true; trigger.setAttribute('aria-expanded', 'false');
      trigger.focus({ preventScroll: true });
    });
  }
  function position() {
    const tabs = options.hud.querySelector('.hud__tabs')?.getBoundingClientRect();
    const strip = options.hud.querySelector('.hud-strip')?.getBoundingClientRect();
    const rail = options.hud.querySelector('.hud__rail')?.getBoundingClientRect();
    const scale = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale'));
    if (tabs === undefined || strip === undefined || rail === undefined || !Number.isFinite(scale)) return;
    const gap = 12 * scale, left = tabs.right + gap;
    // Existing transient notices occupy rows below the strip. A camera panel
    // must follow their actual bottom too, rather than covering a refusal.
    let top = strip.bottom;
    for (const selector of ['.hud__unavailable', '.hud__refusal', '.hud__event']) {
      const band = options.hud.querySelector<HTMLElement>(selector);
      if (band !== null && !band.hidden) top = Math.max(top, band.getBoundingClientRect().bottom);
    }
    panel.style.left = `${left}px`; panel.style.top = `${top + gap}px`;
    panel.style.width = `${Math.max(0, Math.min(396 * scale, rail.left - left - gap))}px`;
  }
  const observer = new ResizeObserver(position);
  for (const selector of ['.hud-strip', '.hud__tabs', '.hud__rail', '.hud__unavailable', '.hud__refusal', '.hud__event']) {
    const bounds = options.hud.querySelector(selector); if (bounds !== null) observer.observe(bounds);
  }
  window.addEventListener('resize', position);
  position();
  return { element: panel, trigger, reposition: position, destroy: () => {
    observer.disconnect(); window.removeEventListener('resize', position); panel.remove(); trigger?.remove();
  } };
}

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
  onFocus?: () => void,
): RendererSelectionControl {
  let current=initial;
  const select=element('select', {
    className: 'hud-build__category',
    attributes: {'aria-label': labels.region},
    children: [element('option',{text:labels.world,attributes:{value:'world'}}),element('option',{text:labels.oblique,attributes:{value:'oblique'}})],
  });
  select.value=initial;
  // Native popups may swallow keyup. Transfer existing keyboard ownership
  // before opening one, without discarding the world's pointer/tool state.
  select.addEventListener('focus',()=>onFocus?.());
  select.addEventListener('keydown',event=>{
    // Native option navigation belongs to the selector. Preserve its default
    // change while keeping the same key out of the still-live world scene.
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown'].includes(event.key)) event.stopPropagation();
  });
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
