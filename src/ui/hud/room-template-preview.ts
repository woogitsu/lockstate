import { ROOM_TEMPLATE_IDS, instantiateRoomTemplate, type RoomTemplateId } from '../../content/room-template-catalog';
import type { LocalizationKey } from '../../content/localization';
import { element, nextUiId } from '../primitives/dom';
import type { HudLocalizer } from './view-model';
import type { RoomTemplateTool } from '../room-template-tool';

const NAME_KEYS: Record<RoomTemplateId, LocalizationKey> = {
  'cell-basic': 'hud.build.template-cell-basic',
  'cell-large': 'hud.build.template-cell-large',
  'shower-room': 'hud.build.template-shower-room',
};

/** A catalogue of authored plans. Selection previews geometry; it never places an order. */
export function createRoomTemplatePreview(localizer: HudLocalizer, tool?: RoomTemplateTool, onArmMap?: () => void): { readonly openButton: HTMLButtonElement; readonly dialog: HTMLDialogElement } {
  const t = (key: LocalizationKey, parameters?: Record<string, string | number>): string => localizer.format(key, parameters);
  const openButton = element('button', {
    className: 'hud-build__template-open',
    text: t('hud.build.templates-short'),
    attributes: { type: 'button', 'aria-label': t('hud.build.templates') },
  });
  const title = element('h2', { text: t('hud.build.templates') });
  const closeButton = element('button', {
    className: 'hud-template__close',
    text: t('hud.build.template-close'),
    attributes: { type: 'button' },
  });
  const choices = element('div', { className: 'hud-template__choices', attributes: { role: 'group', 'aria-label': t('hud.build.templates') } });
  const dimensions = element('p', { className: 'hud-template__dimensions' });
  const contents = element('p', { className: 'hud-template__contents' });
  const diagram = element('div', { className: 'hud-template__diagram', attributes: { role: 'img' } });
  const legend = element('div', {
    className: 'hud-template__legend',
    children: ([['wall', 'hud.build.template-wall'], ['door', 'hud.build.template-door'], ['object', 'hud.build.template-furniture']] as const).map(([kind, key]) =>
      element('span', { children: [element('span', { className: `hud-template__tile hud-template__tile--${kind}`, attributes: { 'aria-hidden': 'true' } }), element('span', { text: t(key) })] }),
    ),
  });
  const dialog = element('dialog', {
    className: 'hud-template',
    children: [
      element('div', { className: 'hud-template__header', children: [title, closeButton] }),
      element('p', { text: t(tool === undefined ? 'hud.build.template-preview-only' : 'hud.build.template-position-hint') }),
      choices,
      dimensions,
      diagram,
      legend,
      contents,
    ],
  });
  title.id = nextUiId('hud-template-title');
  dialog.setAttribute('aria-labelledby', title.id);

  const buttons = new Map<RoomTemplateId, HTMLButtonElement>();
  let selectedId: RoomTemplateId = ROOM_TEMPLATE_IDS[0];
  let mirrorX = false;
  function select(id: RoomTemplateId): void {
    selectedId = id;
    tool?.select(id, mirrorX);
    const plan = instantiateRoomTemplate(id, { x: 0, y: 0 }, { mirrorX });
    for (const [rowId, button] of buttons) button.setAttribute('aria-pressed', rowId === id ? 'true' : 'false');
    dimensions.textContent = t('hud.build.template-size', { width: plan.width, height: plan.height });
    const counts = new Map<string, number>();
    for (const object of plan.objects) counts.set(object.buildableId, (counts.get(object.buildableId) ?? 0) + 1);
    const objectNames: Record<string, LocalizationKey> = {
      'bed-wooden': 'hud.build.template-bed',
      'toilet-brick': 'hud.build.template-toilet',
      'shower-head-brick': 'hud.build.template-shower',
    };
    contents.textContent = [...counts].map(([objectId, count]) => t('hud.build.template-object-count', { name: t(objectNames[objectId]!), count })).join(' · ');
    diagram.setAttribute('aria-label', t('hud.build.template-aria-label', { name: t(NAME_KEYS[id]), width: plan.width, height: plan.height }));
    diagram.style.gridTemplateColumns = `repeat(${plan.width}, 1.5rem)`;
    diagram.replaceChildren();
    const wall = new Set(plan.wallSquares.map(({ x, y }) => `${x},${y}`));
    const door = new Set(plan.doorSquares.map(({ x, y }) => `${x},${y}`));
    const objects = new Map(plan.objects.map(({ x, y, buildableId }) => [`${x},${y}`, buildableId]));
    for (let y = 0; y < plan.height; y += 1) {
      for (let x = 0; x < plan.width; x += 1) {
        const key = `${x},${y}`;
        const kind = wall.has(key) ? 'wall' : door.has(key) ? 'door' : objects.has(key) ? 'object' : 'floor';
        diagram.append(element('span', { className: `hud-template__tile hud-template__tile--${kind}`, attributes: { 'aria-hidden': 'true' } }));
      }
    }
    if (dialog.open) void refreshPlacement();
  }

  // This form is absent in the shipped app until both worker preflight and
  // atomic placement are supplied. A selectable preview must never masquerade
  // as a working build action while that backend is missing.
  let refreshPlacement = async (): Promise<void> => {};
  if (tool !== undefined) {
    const x = element('input', { attributes: { type: 'number', step: '1', value: '0', 'aria-label': t('hud.build.template-x') } });
    const y = element('input', { attributes: { type: 'number', step: '1', value: '0', 'aria-label': t('hud.build.template-y') } });
    const mirror = element('input', { attributes: { type: 'checkbox' } });
    const place = element('button', { text: t('hud.build.template-place'), attributes: { type: 'button' } });
    const map = element('button', { text: t('hud.build.template-map'), attributes: { type: 'button' } });
    const status = element('p', { className: 'hud-template__status', attributes: { role: 'status' } });
    place.disabled = true;
    const origin = (): { x: number; y: number } | undefined => {
      if (x.value.trim() === '' || y.value.trim() === '') return undefined;
      const next = { x: Number(x.value), y: Number(y.value) };
      return Number.isSafeInteger(next.x) && Number.isSafeInteger(next.y) ? next : undefined;
    };
    let revision = 0;
    refreshPlacement = async (): Promise<void> => {
      const current = ++revision;
      place.disabled = true;
      const tile = origin();
      if (tile === undefined) {
        status.textContent = t('hud.build.template-invalid-position');
        return;
      }
      try {
        const { plan, verdict } = await tool.inspectAt(tile);
        if (current !== revision) return;
        place.disabled = !verdict.ok;
        for (const square of diagram.children) square.classList.remove('hud-template__tile--blocked');
        if (!verdict.ok) {
          const localX = verdict.tile.x - plan.origin.x;
          const localY = verdict.tile.y - plan.origin.y;
          diagram.children[localY * plan.width + localX]?.classList.add('hud-template__tile--blocked');
        }
        status.textContent = verdict.ok ? t('hud.build.template-ready') : t('hud.build.template-blocked');
      } catch {
        if (current === revision) status.textContent = t('hud.build.template-unavailable');
      }
    };
    x.addEventListener('input', () => void refreshPlacement());
    y.addEventListener('input', () => void refreshPlacement());
    mirror.addEventListener('change', () => {
      mirrorX = mirror.checked;
      tool.select(selectedId, mirrorX);
      select(selectedId);
    });
    place.addEventListener('click', async () => {
      const tile = origin();
      if (tile === undefined || place.disabled) return;
      place.disabled = true;
      try {
        const result = await tool.placeAt(tile);
        status.textContent = result.ok ? t('hud.build.template-submitted') : t('hud.build.template-blocked');
      } catch {
        status.textContent = t('hud.build.template-unavailable');
      }
      // Keep this origin locked after queuing. The worker may not have run the
      // command yet, so an immediate read can still say "clear" and allow a
      // second press. Editing the origin or choice asks for a fresh verdict.
    });
    map.addEventListener('click', () => {
      onArmMap?.();
      dialog.close();
    });
    dialog.append(element('div', {
      className: 'hud-template__placement',
      children: [x, y, element('label', { children: [mirror, element('span', { text: t('hud.build.template-mirror') })] }), place, map, status],
    }));
  }
  for (const id of ROOM_TEMPLATE_IDS) {
    const button = element('button', { text: t(NAME_KEYS[id]), attributes: { type: 'button' } });
    button.addEventListener('click', () => select(id));
    buttons.set(id, button);
    choices.append(button);
  }
  select(ROOM_TEMPLATE_IDS[0]);
  openButton.addEventListener('click', () => { dialog.showModal(); void refreshPlacement(); });
  closeButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => openButton.focus());
  return { openButton, dialog };
}
