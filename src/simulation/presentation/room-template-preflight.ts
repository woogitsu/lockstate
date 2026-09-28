import { roomTemplateOriginFitsSafeCoordinates, type AuthoredRoomTemplateId, type TemplateSquare } from '../../content/room-template-catalog';
import type { TemplateQuarterTurns } from '../../content/room-template-rotation-geometry';
import { createRoomTemplateBuildPlan } from '../construction/room-template-build-plan';
import { tileCoordinate } from '../world/coordinates';
import type { RoomTemplateCoordinator } from '../construction/room-template-coordinator';
import type { RoomTemplatePlacement } from '../construction/room-template-placement';

/** Read-only projection from authoritative worker state for one authored plan. */
export function projectRoomTemplatePreflight(
  source: Pick<RoomTemplateCoordinator, 'preflight'>,
  templateId: AuthoredRoomTemplateId,
  origin: TemplateSquare,
  mirrorX = false,
  quarterTurns: TemplateQuarterTurns = 0,
): RoomTemplatePlacement {
  if (!roomTemplateOriginFitsSafeCoordinates(templateId, origin)) {
    return { ok: false, reason: 'unowned-land', tile: {
      x: tileCoordinate(origin.x), y: tileCoordinate(origin.y),
    } };
  }
  return source.preflight(createRoomTemplateBuildPlan(templateId, origin, mirrorX, 0, quarterTurns).plan);
}
