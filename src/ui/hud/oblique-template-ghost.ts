import { roomTemplateObjectSquares, type RoomTemplateId, type RoomTemplatePlan } from '../../content/room-template-catalog';
import type { RoomTemplateCostQuote, RoomTemplatePreflight } from '../room-template-tool';
import type { HudLocalizer } from './view-model';
import { HUD_MESSAGE_KEY } from './messages';
import { ROOM_TEMPLATE_NAME_KEYS } from './room-template-preview';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The composition root supplies scene geometry; the HUD only paints points. */
export interface ObliqueTemplateGhostGeometry {
  readonly viewport: { readonly width: number; readonly height: number };
  readonly tileQuad: (x: number, y: number) => readonly { readonly x: number; readonly y: number }[];
}

export interface ObliqueTemplateGhostView {
  readonly element: HTMLElement;
  update(plan: RoomTemplatePlan, geometry: ObliqueTemplateGhostGeometry, verdict: RoomTemplatePreflight | undefined, quote: RoomTemplateCostQuote | undefined): void;
  clear(): void;
}

/** Presentation only: the worker owns the verdict and the scene owns camera geometry. */
export function createObliqueTemplateGhost(localizer: HudLocalizer): ObliqueTemplateGhostView {
  const root = document.createElement('div');
  root.className = 'oblique-template-ghost';
  root.hidden = true;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.classList.add('oblique-template-ghost__map');
  svg.setAttribute('aria-hidden', 'true');
  const notice = document.createElement('div');
  notice.className = 'oblique-template-ghost__notice';
  notice.setAttribute('role', 'status');
  const identity = document.createElement('strong');
  identity.className = 'oblique-template-ghost__identity';
  const status = document.createElement('span');
  const marker = document.createElement('span');
  marker.className = 'oblique-template-ghost__marker';
  const cost = document.createElement('span');
  cost.className = 'oblique-template-ghost__cost';
  notice.append(identity, status, marker, cost);
  root.append(svg, notice);

  return {
    element: root,
    update(plan, geometry, verdict, quote): void {
      if (!Object.hasOwn(ROOM_TEMPLATE_NAME_KEYS, plan.id)) {
        throw new RangeError(`Unknown player-facing room template: ${plan.id}`);
      }
      root.hidden = false;
      const state = verdict === undefined ? 'pending' : verdict.ok ? 'clear' : 'blocked';
      root.dataset.verdict = state;
      notice.setAttribute('aria-busy', verdict === undefined ? 'true' : 'false');
      identity.textContent = localizer.format(HUD_MESSAGE_KEY.templateAriaLabel, {
        name: localizer.format(ROOM_TEMPLATE_NAME_KEYS[plan.id as RoomTemplateId]), width: plan.width, height: plan.height,
      });
      status.textContent = verdict === undefined ? '' : localizer.format(verdict.ok
        ? HUD_MESSAGE_KEY.templateReady
        : verdict.reason === 'unowned-land' ? HUD_MESSAGE_KEY.templateUnownedLand : HUD_MESSAGE_KEY.templateBlocked);
      marker.textContent = plan.id === 'delivery-bay-basic' ? localizer.format(HUD_MESSAGE_KEY.templateDockMarker) : '';
      marker.hidden = plan.id !== 'delivery-bay-basic';
      cost.textContent = quote === undefined ? '' : quote.catalogueCostMinorUnits === undefined
        ? localizer.format(HUD_MESSAGE_KEY.templateCatalogueValueUnavailable)
        : localizer.format(HUD_MESSAGE_KEY.templateCatalogueValue, { total: localizer.formatNumber(quote.catalogueCostMinorUnits) });
      svg.setAttribute('viewBox', `0 0 ${geometry.viewport.width} ${geometry.viewport.height}`);
      svg.replaceChildren();
      const walls = new Set(plan.wallSquares.map(({ x, y }) => `${x},${y}`));
      const doors = new Set(plan.doorSquares.map(({ x, y }) => `${x},${y}`));
      const furniture = new Set(roomTemplateObjectSquares(plan).map(({ x, y }) => `${x},${y}`));
      // The Delivery Bay's sole authored object is the delivery marker, not its doorway.
      const dock = plan.id === 'delivery-bay-basic' ? furniture : new Set<string>();
      for (let y = plan.origin.y; y < plan.origin.y + plan.height; y += 1) {
        for (let x = plan.origin.x; x < plan.origin.x + plan.width; x += 1) {
          const key = `${x},${y}`;
          const polygon = document.createElementNS(SVG_NS, 'polygon');
          polygon.setAttribute('points', geometry.tileQuad(x, y).map((point) => `${point.x},${point.y}`).join(' '));
          const blockedTile = verdict?.ok === false && verdict.tile.x === x && verdict.tile.y === y;
          polygon.setAttribute('data-kind', blockedTile ? 'blocked' : doors.has(key) && verdict?.ok === true ? 'door' : walls.has(key) ? 'wall' : dock.has(key) ? 'dock' : furniture.has(key) ? 'furniture' : 'floor');
          polygon.setAttribute('data-tile-x', String(x));
          polygon.setAttribute('data-tile-y', String(y));
          svg.append(polygon);
        }
      }
    },
    clear(): void {
      root.hidden = true;
      svg.replaceChildren();
      identity.textContent = '';
      status.textContent = '';
      marker.textContent = '';
      cost.textContent = '';
    },
  };
}
