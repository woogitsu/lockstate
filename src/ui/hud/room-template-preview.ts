import { ROOM_TEMPLATE_IDS, instantiateRoomTemplate, type RoomTemplateId } from '../../content/room-template-catalog';
import type { LocalizationKey } from '../../content/localization';
import { element, nextUiId } from '../primitives/dom';
import type { HudLocalizer } from './view-model';

const NAME_KEYS: Record<RoomTemplateId, LocalizationKey> = {
  'cell-basic': 'hud.build.template-cell-basic',
  'cell-large': 'hud.build.template-cell-large',
  'shower-room': 'hud.build.template-shower-room',
};

/** A catalogue of authored plans. Selection previews geometry; it never places an order. */
export function createRoomTemplatePreview(localizer: HudLocalizer): { readonly openButton: HTMLButtonElement; readonly dialog: HTMLDialogElement } {
  const t = (key: LocalizationKey): string => localizer.format(key);
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
      element('p', { text: t('hud.build.template-preview-only') }),
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
  function select(id: RoomTemplateId): void {
    const plan = instantiateRoomTemplate(id, { x: 0, y: 0 });
    for (const [rowId, button] of buttons) button.setAttribute('aria-pressed', rowId === id ? 'true' : 'false');
    dimensions.textContent = `${plan.width} × ${plan.height}`;
    const counts = new Map<string, number>();
    for (const object of plan.objects) counts.set(object.buildableId, (counts.get(object.buildableId) ?? 0) + 1);
    const objectNames: Record<string, LocalizationKey> = {
      'bed-wooden': 'hud.build.template-bed',
      'toilet-brick': 'hud.build.template-toilet',
      'shower-head-brick': 'hud.build.template-shower',
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
  }
  for (const id of ROOM_TEMPLATE_IDS) {
    const button = element('button', { text: t(NAME_KEYS[id]), attributes: { type: 'button' } });
    button.addEventListener('click', () => select(id));
    buttons.set(id, button);
    choices.append(button);
  }
  select(ROOM_TEMPLATE_IDS[0]);
  openButton.addEventListener('click', () => dialog.showModal());
  closeButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => openButton.focus());
  return { openButton, dialog };
}
