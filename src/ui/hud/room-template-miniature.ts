/** A decorative card diagram preserves each fixture as one occupied rectangle. */
import type { RoomTemplatePlan } from '../../content/room-template-catalog';
import type { RotatedRoomTemplateGeometry } from '../../content/room-template-rotation';

export function roomTemplateMiniatureFixtures(
  plan: RoomTemplatePlan | RotatedRoomTemplateGeometry,
  footprintOf: (id: string) => { readonly width: number; readonly height: number },
) {
  return plan.objects.map(object => ({
    x: object.x - plan.origin.x,
    y: object.y - plan.origin.y,
    ...('width' in object && 'height' in object
      ? { width: object.width, height: object.height }
      : footprintOf(object.buildableId)),
  }));
}
