import { ROOM_TEMPLATE_IDS, instantiateRoomTemplate, type RoomTemplateId } from '../../content/room-template-catalog';
import type { LocalizationKey } from '../../content/localization';
import { element, nextUiId } from '../primitives/dom';
import { bindRovingFocusKeydown } from '../primitives/roving-focus-keydown';
import type { HudLocalizer } from './view-model';
import type { RoomTemplateTool } from '../room-template-tool';
import { HUD_MESSAGE_KEY } from './messages';
import { formatRoomTemplateQuote } from './room-template-quote';
import { roomTemplateMiniatureFixtures } from './room-template-miniature';
import type { QuarterTurns } from '../../content/room-template-rotation';

const NAME_KEYS: Record<RoomTemplateId, LocalizationKey> = {
  'cell-basic': HUD_MESSAGE_KEY.buildTemplateCellBasic,
  'cell-large': HUD_MESSAGE_KEY.buildTemplateCellLarge,
  'shower-room': HUD_MESSAGE_KEY.buildTemplateShowerRoom,
  'cell-row-four': HUD_MESSAGE_KEY.buildTemplateCellRowFour,
  'canteen-basic': 'room.canteen.name',
  'kitchen-basic': 'room.kitchen.name',
  'holding-cell-basic': 'room.holding-cell.name',
  'solitary-cell-basic': 'room.solitary-cell.name',
  'reception-basic': 'room.reception.name',
  'laundry-basic': 'room.laundry.name',
  'yard-basic': 'room.yard.name',
  'common-room-basic': 'room.common-room.name',
  'classroom-basic': 'room.classroom.name',
  'infirmary-basic': 'room.infirmary.name',
  'security-office-basic': 'room.security-office.name',
  'staff-room-basic': 'room.staff-room.name',
  'storage-room-basic': 'room.storage-room.name',
  'delivery-bay-basic': 'room.delivery-bay.name',
  'garbage-room-basic': 'room.garbage-room.name',
  'utility-room-basic': 'room.utility-room.name',
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
  const quoteReadout = element('p', { className: 'hud-template__quote', attributes: { 'aria-live': 'polite' } });
  const contents = element('p', { className: 'hud-template__contents' });
  const diagram = element('div', { className: 'hud-template__diagram', attributes: { role: 'img' } });
  const legend = element('div', {
    className: 'hud-template__legend',
    children: ([[ 'wall', HUD_MESSAGE_KEY.buildTemplateWall], ['door', HUD_MESSAGE_KEY.buildTemplateDoor], ['object', HUD_MESSAGE_KEY.buildTemplateFurniture]] as const).map(([kind, key]) =>
      element('span', { children: [element('span', { className: kind === 'object' ? 'hud-template__tile hud-template__fixture' : `hud-template__tile hud-template__tile--${kind}`, attributes: { 'aria-hidden': 'true' } }), element('span', { text: t(key) })] }),
    ),
  });
  const dialog = element('dialog', {
    className: 'hud-template',
    children: [
      element('div', { className: 'hud-template__header', children: [title, closeButton] }),
      element('p', { text: t(tool === undefined ? HUD_MESSAGE_KEY.buildTemplatePreviewOnly : HUD_MESSAGE_KEY.buildTemplatePositionHint) }),
      choices,
      dimensions,
      quoteReadout,
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
  let quarterTurns: QuarterTurns = 0;
  let diagramFixtures: Array<{ element: HTMLElement; x: number; y: number; width: number; height: number }> = [];
  function select(id: RoomTemplateId): void {
    selectedId = id;
    tool?.select(id, mirrorX, quarterTurns);
    const plan = tool?.planAt({ x: 0, y: 0 }) ?? instantiateRoomTemplate(id, { x: 0, y: 0 }, { mirrorX });
    for (const [rowId, button] of buttons) {
      button.setAttribute('aria-pressed', rowId === id ? 'true' : 'false');
      button.tabIndex = rowId === id ? 0 : -1;
    }
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
      'desk-wooden': 'object.desk.name',
      'chair-wooden': 'object.chair.name',
      'washing-machine-brick': 'object.washing-machine.name',
      'bookshelf-wooden': 'object.bookshelf.name',
      'medical-bed-wooden': 'object.medical-bed.name',
      'medicine-cabinet-wooden': 'object.medicine-cabinet.name',
      'security-console-brick': 'object.security-console.name',
      'storage-rack-wooden': 'object.storage-rack.name',
      'loading-dock-door-wooden': 'object.loading-dock-door.name',
      'waste-bin-brick': 'object.waste-bin.name',
      'utility-panel-brick': 'object.utility-panel.name',
    };
    contents.textContent = [...counts].map(([objectId, count]) => `${t(objectNames[objectId]!) } × ${count}`).join(' · ');
    diagram.setAttribute('aria-label', `${t(NAME_KEYS[id])}, ${plan.width} × ${plan.height}`);
    const tileSize = Math.min(24, (220 - 2 * (plan.height - 1)) / plan.height, (320 - 2 * (plan.width - 1)) / plan.width);
    diagram.style.gridAutoRows = `${tileSize}px`;
    diagram.style.gridTemplateColumns = `repeat(${plan.width}, ${tileSize}px)`;
    diagram.replaceChildren();
    diagramFixtures = [];
    const wall = new Set(plan.wallSquares.map(({ x, y }) => `${x},${y}`));
    const door = new Set(plan.doorSquares.map(({ x, y }) => `${x},${y}`));
    const objects = new Set<string>();
    for (const fixture of roomTemplateMiniatureFixtures(plan, id => tool?.objectFootprint(id) ?? { width: 1, height: 1 })) {
      for (let dy = 0; dy < fixture.height; dy += 1) for (let dx = 0; dx < fixture.width; dx += 1) objects.add(`${fixture.x + dx},${fixture.y + dy}`);
    }
    for (let y = 0; y < plan.height; y += 1) {
      for (let x = 0; x < plan.width; x += 1) {
        const key = `${x},${y}`;
        const kind = wall.has(key) ? 'wall' : door.has(key) ? 'door' : objects.has(key) ? 'object' : 'floor';
        const tile = element('span', { className: `hud-template__tile hud-template__tile--${kind}`, attributes: { 'aria-hidden': 'true' } });
        tile.style.width = `${tileSize}px`;
        tile.style.height = `${tileSize}px`;
        tile.style.gridColumn = String(x + 1);
        tile.style.gridRow = String(y + 1);
        diagram.append(tile);
      }
    }
    for (const fixture of roomTemplateMiniatureFixtures(plan, id => tool?.objectFootprint(id) ?? { width: 1, height: 1 })) {
      const marker = element('span', { className: 'hud-template__fixture', attributes: { 'aria-hidden': 'true' } });
      marker.style.gridColumn = `${fixture.x + 1} / span ${fixture.width}`;
      marker.style.gridRow = `${fixture.y + 1} / span ${fixture.height}`;
      diagramFixtures.push({ ...fixture, element: marker });
      diagram.append(marker);
    }
    void refreshPlacement();
  }

  // This form is absent in the shipped app until both worker preflight and
  // atomic placement are supplied. A selectable preview must never masquerade
  // as a working build action while that backend is missing.
  let refreshPlacement = async (): Promise<void> => {};
  if (tool !== undefined) {
    const rotation = element('select', {
      className: 'hud-template__rotation',
      attributes: { 'aria-label': t(HUD_MESSAGE_KEY.buildTemplateRotation) },
      children: ([0, 1, 2, 3] as const).map(turn => element('option', {
        text: `${turn * 90}°`, attributes: { value: String(turn) },
      })),
    });
    rotation.addEventListener('change', () => {
      quarterTurns = Number(rotation.value) as QuarterTurns;
      select(selectedId);
    });
    // Native select provides pointer and keyboard operation in the form input
    // context, without taking the player's remapped camera rotation keys.
    const orientationControls = element('div', { className: 'hud-template__orientation' });
    orientationControls.append(element('label', { children: [
      element('span', { text: t(HUD_MESSAGE_KEY.buildTemplateRotation) }), rotation,
    ] }));
    choices.after(orientationControls);
    const onMap = element('button', { text: t(HUD_MESSAGE_KEY.buildTemplateOnMap), attributes: { type: 'button' } });
    onMap.addEventListener('click', () => { tool.arm(); dialog.close(); });
    dialog.append(onMap);
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
      quoteReadout.textContent = '';
      // The previous verdict is not a result of this new worker query.
      status.textContent = '';
      status.setAttribute('aria-busy', 'true');
      for (const square of diagram.children) square.classList.remove('hud-template__tile--blocked');
      // A static catalogue quote also serves map placement. Invalid advanced
      // coordinates may disable that submit, but cannot erase the map quote.
      void tool.quote().then((quote) => {
        if (current === revision) quoteReadout.textContent = formatRoomTemplateQuote(localizer, quote);
      }).catch(() => {
        // An unavailable quote remains empty, never a fabricated zero.
      });
      const tile = origin();
      if (tile === undefined) {
        status.setAttribute('aria-busy', 'false');
        status.textContent = t(HUD_MESSAGE_KEY.buildTemplateInvalidPosition);
        return;
      }
      try {
        const { plan, verdict } = await tool.inspectAt(tile);
        if (current !== revision) return;
        status.setAttribute('aria-busy', 'false');
        place.disabled = !verdict.ok;
        for (const square of diagram.children) square.classList.remove('hud-template__tile--blocked');
        if (!verdict.ok) {
          const localX = verdict.tile.x - plan.origin.x;
          const localY = verdict.tile.y - plan.origin.y;
          diagram.children[localY * plan.width + localX]?.classList.add('hud-template__tile--blocked');
          // A fixture overlay must not conceal the worker's blocked square.
          for (const fixture of diagramFixtures) {
            if (localX >= fixture.x && localX < fixture.x + fixture.width && localY >= fixture.y && localY < fixture.y + fixture.height) {
              fixture.element.classList.add('hud-template__tile--blocked');
            }
          }
        }
        status.textContent = verdict.ok ? t(HUD_MESSAGE_KEY.buildTemplateReady) : `${t(HUD_MESSAGE_KEY.buildTemplateBlocked)} (${verdict.tile.x}, ${verdict.tile.y})`;
      } catch {
        if (current === revision) {
          status.setAttribute('aria-busy', 'false');
          status.textContent = t(HUD_MESSAGE_KEY.buildTemplateUnavailable);
        }
      }
    };
    x.addEventListener('input', () => void refreshPlacement());
    y.addEventListener('input', () => void refreshPlacement());
    mirror.addEventListener('change', () => {
      mirrorX = mirror.checked;
      select(selectedId);
    });
    place.addEventListener('click', async () => {
      const tile = origin();
      if (tile === undefined || place.disabled) return;
      place.disabled = true;
      const current = revision;
      try {
        const result = await tool.placeAt(tile);
        if (current !== revision) return;
        status.textContent = result.ok ? t(HUD_MESSAGE_KEY.buildTemplateSubmitted) : t(HUD_MESSAGE_KEY.buildTemplateBlocked);
      } catch {
        if (current === revision) status.textContent = t(HUD_MESSAGE_KEY.buildTemplateUnavailable);
      }
      // Keep this origin locked after queuing. The worker may not have run the
      // command yet, so an immediate read can still say "clear" and allow a
      // second press. Editing the origin or choice asks for a fresh verdict.
    });
    orientationControls.append(element('label', { children: [mirror, element('span', { text: t(HUD_MESSAGE_KEY.buildTemplateMirror) })] }));
    dialog.append(element('details', {
      className: 'hud-template__coordinates',
      children: [
        element('summary', { text: t(HUD_MESSAGE_KEY.buildCoordinates) }),
        element('div', {
          className: 'hud-template__placement',
          children: [
            element('label', { children: [element('span', { text: t(HUD_MESSAGE_KEY.buildTemplateX) }), x] }),
            element('label', { children: [element('span', { text: t(HUD_MESSAGE_KEY.buildTemplateY) }), y] }),
            place,
          ],
        }),
      ],
    }));
    dialog.append(status);
  }
  for (const id of ROOM_TEMPLATE_IDS) {
    const plan = instantiateRoomTemplate(id, { x: 0, y: 0 });
    const miniature = element('span', { className: 'hud-template__miniature', attributes: { 'aria-hidden': 'true' } });
    const cellSize = Math.min(8, 56 / plan.height, 56 / plan.width);
    miniature.style.gridAutoRows = `${cellSize}px`;
    miniature.style.gridTemplateColumns = `repeat(${plan.width}, ${cellSize}px)`;
    const walls = new Set(plan.wallSquares.map(p => `${p.x},${p.y}`));
    const doors = new Set(plan.doorSquares.map(p => `${p.x},${p.y}`));
    const fixtures = new Set<string>();
    for (const object of plan.objects) {
      const footprint = tool?.objectFootprint(object.buildableId) ?? { width: 1, height: 1 };
      for (let dy = 0; dy < footprint.height; dy += 1) for (let dx = 0; dx < footprint.width; dx += 1) fixtures.add(`${object.x + dx},${object.y + dy}`);
    }
    for (let y = 0; y < plan.height; y += 1) for (let x = 0; x < plan.width; x += 1) {
      const key = `${x},${y}`;
      const kind = walls.has(key) ? 'wall' : doors.has(key) ? 'door' : fixtures.has(key) ? 'object' : 'floor';
      const tile = element('span', { className: `hud-template__tile hud-template__tile--${kind}` });
      tile.style.width = `${cellSize}px`;
      tile.style.height = `${cellSize}px`;
      tile.style.gridColumn = String(x + 1);
      tile.style.gridRow = String(y + 1);
      miniature.append(tile);
    }
    for (const fixture of roomTemplateMiniatureFixtures(plan, id => tool?.objectFootprint(id) ?? { width: 1, height: 1 })) {
      const marker = element('span', { className: 'hud-template__fixture' });
      marker.style.gridColumn = `${fixture.x + 1} / span ${fixture.width}`;
      marker.style.gridRow = `${fixture.y + 1} / span ${fixture.height}`;
      miniature.append(marker);
    }
    const button = element('button', {
      className: 'hud-template__card',
      attributes: { type: 'button', 'aria-label': t(NAME_KEYS[id]), 'data-template-id': id },
      children: [miniature, element('span', { className: 'hud-template__card-details', children: [
        element('strong', { text: t(NAME_KEYS[id]) }),
        element('span', { text: `${plan.width} \u00d7 ${plan.height}` }),
        element('span', { text: `${t(HUD_MESSAGE_KEY.buildTemplateFurniture)} × ${plan.objects.length}` }),
      ] })],
    });
    button.addEventListener('click', () => select(id));
    buttons.set(id, button);
    choices.append(button);
  }
  // Match the existing Build/Rooms catalogue contract: arrows move focus,
  // while Enter/Space explicitly selects and updates the worker quote.
  bindRovingFocusKeydown(choices, {
    datasetAttribute: 'templateId', order: () => ROOM_TEMPLATE_IDS,
    rows: new Map([...buttons].map(([id, button]) => [id, { element: button }])),
  });
  select(ROOM_TEMPLATE_IDS[0]);
  openButton.addEventListener('click', () => { dialog.showModal(); void refreshPlacement(); });
  closeButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => openButton.focus());
  return { openButton, dialog };
}
