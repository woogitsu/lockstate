import { ROOM_TEMPLATE_IDS, instantiateRoomTemplate, type RoomTemplateId } from '../../content/room-template-catalog';
import type { LocalizationKey } from '../../content/localization';
import { element, nextUiId } from '../primitives/dom';
import type { HudLocalizer } from './view-model';
import type { RoomTemplateTool } from '../room-template-tool';
import { HUD_MESSAGE_KEY } from './messages';

const NAME_KEYS: Record<RoomTemplateId, LocalizationKey> = {
  'cell-basic': HUD_MESSAGE_KEY.buildTemplateCellBasic,
  'cell-large': HUD_MESSAGE_KEY.buildTemplateCellLarge,
  'shower-room': HUD_MESSAGE_KEY.buildTemplateShowerRoom,
  'cell-row-four': 'hud.build.template-cell-row-four',
  'canteen-basic': 'room.canteen.name',
  'kitchen-basic': 'room.kitchen.name',
};

/** A catalogue of authored plans. Selection previews geometry; it never places an order. */
export function createRoomTemplatePreview(localizer: HudLocalizer, tool?: RoomTemplateTool): { readonly openButton: HTMLButtonElement; readonly dialog: HTMLDialogElement } {
  const t = (key: LocalizationKey): string => localizer.format(key);
  const openButton = element('button', {
    className: 'hud-build__template-open',
    text: t(HUD_MESSAGE_KEY.buildTemplatesShort),
    attributes: { type: 'button', 'aria-label': t(HUD_MESSAGE_KEY.buildTemplates) },
  });
  const title = element('h2', { text: t(HUD_MESSAGE_KEY.buildTemplates) });
  const closeButton = element('button', {
    className: 'hud-template__close',
    text: t(HUD_MESSAGE_KEY.buildTemplateClose),
    attributes: { type: 'button' },
  });
  const choices = element('div', { className: 'hud-template__choices', attributes: { role: 'group', 'aria-label': t(HUD_MESSAGE_KEY.buildTemplates) } });
  const dimensions = element('p', { className: 'hud-template__dimensions' });
  const contents = element('p', { className: 'hud-template__contents' });
  const diagram = element('div', { className: 'hud-template__diagram', attributes: { role: 'img' } });
  const legend = element('div', {
    className: 'hud-template__legend',
    children: ([[ 'wall', HUD_MESSAGE_KEY.buildTemplateWall], ['door', HUD_MESSAGE_KEY.buildTemplateDoor], ['object', HUD_MESSAGE_KEY.buildTemplateFurniture]] as const).map(([kind, key]) =>
      element('span', { children: [element('span', { className: `hud-template__tile hud-template__tile--${kind}`, attributes: { 'aria-hidden': 'true' } }), element('span', { text: t(key) })] }),
    ),
  });
  const dialog = element('dialog', {
    className: 'hud-template',
    children: [
      element('div', { className: 'hud-template__header', children: [title, closeButton] }),
      element('p', { text: t(tool === undefined ? HUD_MESSAGE_KEY.buildTemplatePreviewOnly : HUD_MESSAGE_KEY.buildTemplatePositionHint) }),
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
    const plan = instantiateRoomTemplate(id, { x: 0, y: 0 });
    for (const [rowId, button] of buttons) button.setAttribute('aria-pressed', rowId === id ? 'true' : 'false');
    dimensions.textContent = `${plan.width} × ${plan.height}`;
    const counts = new Map<string, number>();
    for (const object of plan.objects) counts.set(object.buildableId, (counts.get(object.buildableId) ?? 0) + 1);
    const objectNames: Record<string, LocalizationKey> = {
      'bed-wooden': HUD_MESSAGE_KEY.buildTemplateBed,
      'toilet-brick': HUD_MESSAGE_KEY.buildTemplateToilet,
      'shower-head-brick': HUD_MESSAGE_KEY.buildTemplateShower,
      'dining-table-wooden': 'object.dining-table.name',
      'bench-wooden': 'object.bench.name',
      'stove-brick': 'object.stove.name',
      'prep-counter-brick': 'object.prep-counter.name',
      'fridge-brick': 'object.fridge.name',
    };
    contents.textContent = [...counts].map(([objectId, count]) => `${t(objectNames[objectId]!) } × ${count}`).join(' · ');
    diagram.setAttribute('aria-label', `${t(NAME_KEYS[id])}, ${plan.width} × ${plan.height}`);
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
    void refreshPlacement();
  }

  // This form is absent in the shipped app until both worker preflight and
  // atomic placement are supplied. A selectable preview must never masquerade
  // as a working build action while that backend is missing.
  let refreshPlacement = async (): Promise<void> => {};
  if (tool !== undefined) {
    const x = element('input', { attributes: { type: 'number', step: '1', value: '0', 'aria-label': t(HUD_MESSAGE_KEY.buildTemplateX) } });
    const y = element('input', { attributes: { type: 'number', step: '1', value: '0', 'aria-label': t(HUD_MESSAGE_KEY.buildTemplateY) } });
    const mirror = element('input', { attributes: { type: 'checkbox' } });
    const place = element('button', { text: t(HUD_MESSAGE_KEY.buildTemplatePlace), attributes: { type: 'button' } });
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
        status.textContent = t(HUD_MESSAGE_KEY.buildTemplateInvalidPosition);
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
        status.textContent = verdict.ok ? t(HUD_MESSAGE_KEY.buildTemplateReady) : `${t(HUD_MESSAGE_KEY.buildTemplateBlocked)} (${verdict.tile.x}, ${verdict.tile.y})`;
      } catch {
        if (current === revision) status.textContent = t(HUD_MESSAGE_KEY.buildTemplateUnavailable);
      }
    };
    x.addEventListener('input', () => void refreshPlacement());
    y.addEventListener('input', () => void refreshPlacement());
    mirror.addEventListener('change', () => {
      mirrorX = mirror.checked;
      tool.select(selectedId, mirrorX);
      void refreshPlacement();
    });
    place.addEventListener('click', async () => {
      const tile = origin();
      if (tile === undefined || place.disabled) return;
      place.disabled = true;
      try {
        const result = await tool.placeAt(tile);
        status.textContent = result.ok ? t(HUD_MESSAGE_KEY.buildTemplateSubmitted) : t(HUD_MESSAGE_KEY.buildTemplateBlocked);
      } catch {
        status.textContent = t(HUD_MESSAGE_KEY.buildTemplateUnavailable);
      }
      // Keep this origin locked after queuing. The worker may not have run the
      // command yet, so an immediate read can still say "clear" and allow a
      // second press. Editing the origin or choice asks for a fresh verdict.
    });
    dialog.append(element('div', {
      className: 'hud-template__placement',
      children: [x, y, element('label', { children: [mirror, element('span', { text: t(HUD_MESSAGE_KEY.buildTemplateMirror) })] }), place, status],
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
