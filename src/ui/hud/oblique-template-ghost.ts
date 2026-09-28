import { roomTemplateObjectSquares, type RoomTemplatePlan } from '../../content/room-template-catalog';
import { projectedTileQuad } from '../../rendering/camera/oblique-geometry';
import type { ObliqueCameraState } from '../../rendering/camera/oblique-projection';
import type { RoomTemplateCostQuote, RoomTemplatePreflight } from '../room-template-tool';
import type { HudLocalizer } from './view-model';
import { HUD_MESSAGE_KEY } from './messages';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface ObliqueTemplateGhostView {
  readonly element: HTMLElement;
  update(plan: RoomTemplatePlan, pose: ObliqueCameraState, verdict: RoomTemplatePreflight | undefined, quote: RoomTemplateCostQuote | undefined): void;
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
  const status = document.createElement('span');
  const cost = document.createElement('span');
  cost.className = 'oblique-template-ghost__cost';
  notice.append(status, cost);
  root.append(svg, notice);

  return {
    element: root,
    update(plan, pose, verdict, quote): void {
      root.hidden = false;
      const state = verdict === undefined ? 'pending' : verdict.ok ? 'clear' : 'blocked';
      root.dataset.verdict = state;
      notice.setAttribute('aria-busy', verdict === undefined ? 'true' : 'false');
      status.textContent = verdict === undefined ? '' : localizer.format(verdict.ok
        ? HUD_MESSAGE_KEY.templateReady
        : verdict.reason === 'unowned-land' ? HUD_MESSAGE_KEY.templateUnownedLand : HUD_MESSAGE_KEY.templateBlocked);
      cost.textContent = quote === undefined ? '' : quote.catalogueCostMinorUnits === undefined
        ? localizer.format(HUD_MESSAGE_KEY.templateCatalogueValueUnavailable)
        : localizer.format(HUD_MESSAGE_KEY.templateCatalogueValue, { total: localizer.formatNumber(quote.catalogueCostMinorUnits) });
      svg.setAttribute('viewBox', `0 0 ${pose.viewport.width} ${pose.viewport.height}`);
      svg.replaceChildren();
      const walls = new Set(plan.wallSquares.map(({ x, y }) => `${x},${y}`));
      const doors = new Set(plan.doorSquares.map(({ x, y }) => `${x},${y}`));
      const furniture = new Set(roomTemplateObjectSquares(plan).map(({ x, y }) => `${x},${y}`));
      for (let y = plan.origin.y; y < plan.origin.y + plan.height; y += 1) {
        for (let x = plan.origin.x; x < plan.origin.x + plan.width; x += 1) {
          const key = `${x},${y}`;
          const polygon = document.createElementNS(SVG_NS, 'polygon');
          polygon.setAttribute('points', projectedTileQuad(x, y, pose).map((point) => `${point.x},${point.y}`).join(' '));
          const blockedTile = verdict?.ok === false && verdict.tile.x === x && verdict.tile.y === y;
          polygon.setAttribute('data-kind', blockedTile ? 'blocked' : doors.has(key) && verdict?.ok === true ? 'door' : walls.has(key) ? 'wall' : furniture.has(key) ? 'furniture' : 'floor');
          polygon.setAttribute('data-tile-x', String(x));
          polygon.setAttribute('data-tile-y', String(y));
          svg.append(polygon);
        }
      }
    },
    clear(): void {
      root.hidden = true;
      svg.replaceChildren();
      status.textContent = '';
      cost.textContent = '';
    },
  };
}
