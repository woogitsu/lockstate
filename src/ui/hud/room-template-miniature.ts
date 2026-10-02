/** A decorative card diagram preserves each fixture as one occupied rectangle. */
import type { RoomTemplatePlan } from '../../content/room-template-catalog';

export function roomTemplateMiniatureFixtures(
  plan: RoomTemplatePlan,
  footprintOf: (id: string) => { readonly width: number; readonly height: number },
) {
  return plan.objects.map(object => ({
    x: object.x - plan.origin.x,
    y: object.y - plan.origin.y,
    ...footprintOf(object.buildableId),
  }));
}
