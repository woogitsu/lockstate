import { instantiateRoomTemplate, type RoomTemplateId, type TemplateSquare } from '../../content/room-template-catalog';
import type { RoomTemplateCoordinator } from '../construction/room-template-coordinator';
import type { RoomTemplatePlacement } from '../construction/room-template-placement';

/** Read-only projection from authoritative worker state for one authored plan. */
export function projectRoomTemplatePreflight(
  source: Pick<RoomTemplateCoordinator, 'preflight'>,
  templateId: RoomTemplateId,
  origin: TemplateSquare,
  mirrorX = false,
): RoomTemplatePlacement {
  return source.preflight(instantiateRoomTemplate(templateId, origin, { mirrorX }));
}
