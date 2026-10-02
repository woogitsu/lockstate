import { roomTemplateOriginFitsSafeCoordinates, type AuthoredRoomTemplateId, type TemplateSquare } from '../../content/room-template-catalog';
import type { QuarterTurns } from '../../content/room-template-rotation';
import { instantiateRoomTemplateForConstruction } from '../construction/room-template-build-plan';
import { tileCoordinate } from '../world/coordinates';
import type { RoomTemplateCoordinator } from '../construction/room-template-coordinator';
import type { RoomTemplatePlacement } from '../construction/room-template-placement';

/** Read-only projection from authoritative worker state for one authored plan. */
export function projectRoomTemplatePreflight(
  source: Pick<RoomTemplateCoordinator, 'preflight'>,
  templateId: AuthoredRoomTemplateId,
  origin: TemplateSquare,
  mirrorX = false,
  quarterTurns: QuarterTurns = 0,
): RoomTemplatePlacement {
  if (!roomTemplateOriginFitsSafeCoordinates(templateId, origin, quarterTurns)) {
    return { ok: false, reason: 'unowned-land', tile: {
      x: tileCoordinate(origin.x), y: tileCoordinate(origin.y),
    } };
  }
  return source.preflight(instantiateRoomTemplateForConstruction(templateId, origin, mirrorX, quarterTurns));
}
