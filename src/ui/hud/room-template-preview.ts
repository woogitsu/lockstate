import { ROOM_TEMPLATE_IDS, instantiateRoomTemplate, roomTemplateObjectSquares, type RoomTemplateId } from '../../content/room-template-catalog';
import { defaultItemRegistry } from '../../content/item-catalog';
import type { LocalizationKey } from '../../content/localization';
import { element, nextUiId } from '../primitives/dom';
import type { HudLocalizer } from './view-model';
import { HUD_MESSAGE_KEY } from './messages';
import type { RoomTemplateCostQuote, RoomTemplateTool } from '../room-template-tool';

export const ROOM_TEMPLATE_NAME_KEYS: Record<RoomTemplateId, LocalizationKey> = {
  'cell-basic': HUD_MESSAGE_KEY.templateCellBasic,
  'cell-large': HUD_MESSAGE_KEY.templateCellLarge,
  'shower-room': HUD_MESSAGE_KEY.templateShowerRoom,
  'cell-row-four': HUD_MESSAGE_KEY.templateCellRowFour,
  'canteen-basic': 'room.canteen.name',
  'kitchen-basic': 'room.kitchen.name',
  'infirmary-basic': 'room.infirmary.name',
  'classroom-basic': 'room.classroom.name',
  'laundry-basic': 'room.laundry.name',
  'common-room-basic': 'room.common-room.name',
  'security-office-basic': 'room.security-office.name',
  'storage-room-basic': 'room.storage-room.name',
  'staff-room-basic': 'room.staff-room.name',
  'solitary-cell-basic': 'room.solitary-cell.name',
  'holding-cell-basic': 'room.holding-cell.name',
  'delivery-bay-basic': 'room.delivery-bay.name',
  'reception-basic': 'room.reception.name',
};

/** A catalogue of authored plans. Selection previews geometry; it never places an order. */
export function createRoomTemplatePreview(localizer: HudLocalizer, tool?: RoomTemplateTool, onArmMap?: () => void, quote?: (id: RoomTemplateId) => Promise<RoomTemplateCostQuote>): { readonly openButton: HTMLButtonElement; readonly dialog: HTMLDialogElement } {
  const t = (key: LocalizationKey, parameters?: Record<string, string | number>): string => localizer.format(key, parameters);
  const openButton = element('button', {
    className: 'hud-build__template-open',
    text: t(HUD_MESSAGE_KEY.templatePlansShort),
    attributes: { type: 'button', 'aria-label': t(HUD_MESSAGE_KEY.templatePlans) },
  });
  const title = element('h2', { text: t(HUD_MESSAGE_KEY.templatePlans) });
  const closeButton = element('button', {
    className: 'hud-template__close',
    text: t(HUD_MESSAGE_KEY.templateClose),
    attributes: { type: 'button' },
  });
  const choices = element('div', { className: 'hud-template__choices', attributes: { role: 'group', 'aria-label': t(HUD_MESSAGE_KEY.templatePlans) } });
  const dimensions = element('p', { className: 'hud-template__dimensions' });
  const contents = element('p', { className: 'hud-template__contents' });
  const materials = element('p', { className: 'hud-template__materials' });
  const catalogueValue = element('p', { className: 'hud-template__catalogue-value' });
  const diagram = element('div', { className: 'hud-template__diagram', attributes: { role: 'img' } });
  const legendItem = (kind: string, key: LocalizationKey): HTMLElement => element('span', { children: [
    element('span', { className: `hud-template__tile hud-template__tile--${kind}`, attributes: { 'aria-hidden': 'true' } }),
    element('span', { text: t(key) }),
  ] });
  const furnitureLegend = legendItem('object', HUD_MESSAGE_KEY.templateFurniture);
  const interiorLegend = legendItem('interior', HUD_MESSAGE_KEY.templateInterior);
  const dockLegend = legendItem('dock', HUD_MESSAGE_KEY.templateDockMarker);
  const legend = element('div', {
    className: 'hud-template__legend',
    children: [legendItem('wall', HUD_MESSAGE_KEY.templateWall), legendItem('door', HUD_MESSAGE_KEY.templateDoor), furnitureLegend],
  });
  const dialog = element('dialog', {
    className: 'hud-template',
    children: [
      element('div', { className: 'hud-template__header', children: [title, closeButton] }),
      element('p', { text: t(tool === undefined ? HUD_MESSAGE_KEY.templatePreviewOnly : HUD_MESSAGE_KEY.templatePositionHint) }),
      choices,
      dimensions,
      diagram,
      legend,
      contents,
      materials,
      catalogueValue,
    ],
  });
  title.id = nextUiId('hud-template-title');
  dialog.setAttribute('aria-labelledby', title.id);

  const buttons = new Map<RoomTemplateId, HTMLButtonElement>();
  let selectedId: RoomTemplateId = ROOM_TEMPLATE_IDS[0];
  let mirrorX = false;
  let halfTurn = false;
  let halfTurnCheckbox: HTMLInputElement | undefined;
  let halfTurnLabel: HTMLElement | undefined;
  let quoteRevision = 0;
  async function refreshQuote(id: RoomTemplateId, revision: number): Promise<void> {
    if (quote === undefined) return;
    try {
      const cost = await quote(id);
      if (revision !== quoteRevision) return;
      const materialNames = cost.materials.map(({ itemId, quantity }) => {
        const item = defaultItemRegistry.getById(itemId);
        if (item === undefined) throw new Error(`Unknown room-template material: ${itemId}`);
        return t(HUD_MESSAGE_KEY.templateObjectCount, { name: t(item.nameKey as LocalizationKey), count: localizer.formatNumber(quantity) });
      });
      materials.textContent = t(HUD_MESSAGE_KEY.templateMaterials, { materials: materialNames.join(' · ') });
      catalogueValue.textContent = cost.catalogueCostMinorUnits === undefined
        ? t(HUD_MESSAGE_KEY.templateCatalogueValueUnavailable)
        : t(HUD_MESSAGE_KEY.templateCatalogueValue, { total: localizer.formatNumber(cost.catalogueCostMinorUnits) });
      materials.hidden = false;
      catalogueValue.hidden = false;
    } catch {
      if (revision === quoteRevision) {
        materials.hidden = true;
        catalogueValue.hidden = true;
      }
    }
  }
  function select(id: RoomTemplateId): void {
    selectedId = id;
    if (id !== 'cell-row-four') halfTurn = false;
    if (halfTurnCheckbox !== undefined) halfTurnCheckbox.checked = halfTurn;
    if (halfTurnLabel !== undefined) halfTurnLabel.hidden = id !== 'cell-row-four';
    tool?.select(id, mirrorX, halfTurn ? 2 : 0);
    const plan = tool?.planAt({ x: 0, y: 0 }) ?? instantiateRoomTemplate(id, { x: 0, y: 0 }, { mirrorX });
    for (const [rowId, button] of buttons) button.setAttribute('aria-pressed', rowId === id ? 'true' : 'false');
    dimensions.textContent = t(HUD_MESSAGE_KEY.templateSize, { width: plan.width, height: plan.height });
    const counts = new Map<string, number>();
    for (const object of plan.objects) counts.set(object.buildableId, (counts.get(object.buildableId) ?? 0) + 1);
    const objectNames: Record<string, LocalizationKey> = {
      'bed-wooden': HUD_MESSAGE_KEY.templateBed,
      'toilet-brick': HUD_MESSAGE_KEY.templateToilet,
      'shower-head-brick': HUD_MESSAGE_KEY.templateShower,
      'dining-table-wooden': 'object.dining-table.name',
      'bench-wooden': 'object.bench.name',
      'stove-brick': 'object.stove.name',
      'prep-counter-brick': 'object.prep-counter.name',
      'fridge-brick': 'object.fridge.name',
      'medical-bed-wooden': 'object.medical-bed.name',
      'medicine-cabinet-wooden': 'object.medicine-cabinet.name',
      'bookshelf-wooden': 'object.bookshelf.name',
      'chair-wooden': 'object.chair.name',
      'washing-machine-brick': 'object.washing-machine.name',
      'security-console-brick': 'object.security-console.name',
      'storage-rack-wooden': 'object.storage-rack.name',
      'desk-wooden': 'object.desk.name',
      'loading-dock-door-wooden': 'object.loading-dock-door.name',
    };
    contents.textContent = [...counts].map(([objectId, count]) => t(HUD_MESSAGE_KEY.templateObjectCount, { name: t(objectNames[objectId]!), count })).join(' · ');
    materials.hidden = true;
    catalogueValue.hidden = true;
    void refreshQuote(id, ++quoteRevision);
    diagram.setAttribute('aria-label', t(HUD_MESSAGE_KEY.templateAriaLabel, { name: t(ROOM_TEMPLATE_NAME_KEYS[id]), width: plan.width, height: plan.height }));
    diagram.style.gridTemplateColumns = `repeat(${plan.width}, 1.5rem)`;
    diagram.replaceChildren();
    const wall = new Set(plan.wallSquares.map(({ x, y }) => `${x},${y}`));
    const door = new Set(plan.doorSquares.map(({ x, y }) => `${x},${y}`));
    const objects = new Set(roomTemplateObjectSquares(plan).map(({ x, y }) => `${x},${y}`));
    // This authored plan's only object is the three-square delivery marker.
    const dock = id === 'delivery-bay-basic' ? objects : new Set<string>();
    if (id === 'delivery-bay-basic') {
      furnitureLegend.remove();
      legend.append(interiorLegend, dockLegend);
    } else {
      interiorLegend.remove();
      dockLegend.remove();
      legend.append(furnitureLegend);
    }
    for (let y = 0; y < plan.height; y += 1) {
      for (let x = 0; x < plan.width; x += 1) {
        const key = `${x},${y}`;
        const kind = wall.has(key) ? 'wall' : door.has(key) ? 'door' : dock.has(key) ? 'dock' : objects.has(key) ? 'object' : 'floor';
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
    const x = element('input', { attributes: { type: 'number', step: '1', value: '0', 'aria-label': t(HUD_MESSAGE_KEY.templateX) } });
    const y = element('input', { attributes: { type: 'number', step: '1', value: '0', 'aria-label': t(HUD_MESSAGE_KEY.templateY) } });
    const mirror = element('input', { attributes: { type: 'checkbox' } });
    halfTurnCheckbox = element('input', { attributes: { type: 'checkbox' } });
    halfTurnLabel = element('label', { children: [halfTurnCheckbox, element('span', { text: t(HUD_MESSAGE_KEY.templateRotateHalf) })] });
    halfTurnLabel.hidden = true;
    const place = element('button', { text: t(HUD_MESSAGE_KEY.templatePlace), attributes: { type: 'button' } });
    const map = element('button', { text: t(HUD_MESSAGE_KEY.templateMap), attributes: { type: 'button' } });
    const status = element('p', { className: 'hud-template__status', attributes: { role: 'status' } });
    place.disabled = true;
    const origin = (): { x: number; y: number } | undefined => {
      if (x.value.trim() === '' || y.value.trim() === '') return undefined;
      const next = { x: Number(x.value), y: Number(y.value) };
      return Number.isSafeInteger(next.x) && Number.isSafeInteger(next.y) ? next : undefined;
    };
    const wholePlanFitsSafeTiles = (tile: { readonly x: number; readonly y: number }): boolean => {
      const plan = tool.planAt({ x: 0, y: 0 });
      return Number.isSafeInteger(tile.x + plan.width - 1) && Number.isSafeInteger(tile.y + plan.height - 1);
    };
    let revision = 0;
    refreshPlacement = async (): Promise<void> => {
      const current = ++revision;
      place.disabled = true;
      const tile = origin();
      if (tile === undefined) {
        status.textContent = t(HUD_MESSAGE_KEY.templateInvalidPosition);
        return;
      }
      if (!wholePlanFitsSafeTiles(tile)) {
        status.textContent = t(HUD_MESSAGE_KEY.templateOutsideSafeTiles);
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
        status.textContent = verdict.ok ? t(HUD_MESSAGE_KEY.templateReady) : t(HUD_MESSAGE_KEY.templateBlocked);
      } catch {
        if (current === revision) status.textContent = t(HUD_MESSAGE_KEY.templateUnavailable);
      }
    };
    x.addEventListener('input', () => void refreshPlacement());
    y.addEventListener('input', () => void refreshPlacement());
    mirror.addEventListener('change', () => {
      mirrorX = mirror.checked;
      select(selectedId);
    });
    halfTurnCheckbox.addEventListener('change', () => {
      halfTurn = halfTurnCheckbox?.checked === true;
      select(selectedId);
    });
    place.addEventListener('click', async () => {
      const tile = origin();
      if (tile === undefined || !wholePlanFitsSafeTiles(tile) || place.disabled) return;
      const current = ++revision;
      place.disabled = true;
      try {
        const result = await tool.placeAt(tile);
        if (current === revision) status.textContent = result.ok ? t(HUD_MESSAGE_KEY.templateSubmitted) : t(HUD_MESSAGE_KEY.templateBlocked);
      } catch {
        if (current === revision) status.textContent = t(HUD_MESSAGE_KEY.templateUnavailable);
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
      children: [
        element('label', { className: 'hud-template__coordinate', children: [element('span', { text: t(HUD_MESSAGE_KEY.templateX) }), x] }),
        element('label', { className: 'hud-template__coordinate', children: [element('span', { text: t(HUD_MESSAGE_KEY.templateY) }), y] }),
        element('label', { children: [mirror, element('span', { text: t(HUD_MESSAGE_KEY.templateMirror) })] }),
        halfTurnLabel,
        place, map, status,
      ],
    }));
  }
  for (const id of ROOM_TEMPLATE_IDS) {
    const button = element('button', { text: t(ROOM_TEMPLATE_NAME_KEYS[id]), attributes: { type: 'button' } });
    button.addEventListener('click', () => select(id));
    buttons.set(id, button);
    choices.append(button);
  }
  select(ROOM_TEMPLATE_IDS[0]);
  openButton.addEventListener('click', () => { dialog.showModal(); void refreshQuote(selectedId, ++quoteRevision); void refreshPlacement(); });
  closeButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => openButton.focus());
  return { openButton, dialog };
}
