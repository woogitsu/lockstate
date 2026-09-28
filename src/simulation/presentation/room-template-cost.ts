import type { AuthoredRoomTemplateId } from '../../content/room-template-catalog';
import { createRoomTemplateBuildPlan } from '../construction/room-template-build-plan';
import { getBuildableDefinition, type MaterialRequirement } from '../construction/definition';
import { placementCostMinorUnits } from '../economy/placement-cost';

export interface RoomTemplateCostView {
  readonly orderCount: number;
  readonly materials: readonly MaterialRequirement[];
  /** Catalogue value of all materials; held stock may reduce the actual debit. */
  readonly catalogueCostMinorUnits?: number;
}

/** A static quote over the exact orders the coordinator will submit. */
export function projectRoomTemplateCost(templateId: AuthoredRoomTemplateId): RoomTemplateCostView {
  const { orders } = createRoomTemplateBuildPlan(templateId, { x: 0, y: 0 }, false, 0);
  const quantities = new Map<string, number>();
  for (const order of orders) {
    for (const material of getBuildableDefinition(order.definitionId).materialsRequired) {
      quantities.set(material.itemId, (quantities.get(material.itemId) ?? 0) + material.quantity);
    }
  }
  const materials = [...quantities].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([itemId, quantity]) => ({ itemId, quantity }));
  const catalogueCostMinorUnits = placementCostMinorUnits(materials);
  return {
    orderCount: orders.length,
    materials,
    ...(catalogueCostMinorUnits === undefined ? {} : { catalogueCostMinorUnits }),
  };
}
