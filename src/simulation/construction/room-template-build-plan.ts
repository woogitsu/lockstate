import { instantiateRoomTemplate, type RoomTemplatePlan } from '../../content/room-template-catalog';
import { createBuildOrder, type BuildOrder } from './build-order';
import { tileCoordinate } from '../world/coordinates';
import { rotateRoomTemplateLayout, type TemplateQuarterTurns } from '../../content/room-template-rotation-geometry';
import { BUILDABLE_REGISTRY } from './definition';
import { defaultObjectRegistry } from '../../content/object-catalog';

export interface RoomTemplateBuildPlan {
  readonly plan: RoomTemplatePlan;
  readonly orders: readonly BuildOrder[];
  readonly shellOrderIds: readonly string[];
}

/**
 * Expand a template gesture once into stable build orders. The queue sequence
 * survives save/reload; IDs sort shell work before furniture for equal sequence.
 * Door geometry stays on an edge even though walls now occupy full squares.
 */
export function createRoomTemplateBuildPlan(
  templateId: RoomTemplatePlan['id'],
  origin: RoomTemplatePlan['origin'],
  mirrorX: boolean,
  sequence: number,
  quarterTurns: TemplateQuarterTurns = 0,
): RoomTemplateBuildPlan {
  const authored = instantiateRoomTemplate(templateId, origin, { mirrorX });
  if (quarterTurns !== 0 && templateId !== 'canteen-basic') {
    throw new RangeError(`Room template ${templateId} has no valid quarter-turn layout.`);
  }
  const plan: RoomTemplatePlan = quarterTurns === 0 ? authored : (() => {
    const rotated = rotateRoomTemplateLayout(authored, quarterTurns, (buildableId) => {
      const objectId = BUILDABLE_REGISTRY.get(buildableId)?.placesObjectId;
      const footprint = defaultObjectRegistry.getById(objectId ?? '')?.footprint;
      if (footprint === undefined) throw new RangeError(`No object footprint for ${buildableId}.`);
      return footprint;
    });
    return {
      ...authored,
      width: rotated.width,
      height: rotated.height,
      wallSquares: rotated.walls,
      doorSquares: rotated.doors.map(({ square, orderEdge }) => ({
        ...square, orderTile: { x: orderEdge.x, y: orderEdge.y }, edge: orderEdge.edge,
      })),
      zones: rotated.zones,
      zone: rotated.zones[0]!,
      objects: rotated.objects.map(({ buildableId, x, y, orientation }) => ({ buildableId, x, y, orientation })),
    };
  })();
  const prefix = `room-template-${sequence.toString().padStart(12, '0')}`;
  const location = (square: { readonly x: number; readonly y: number }) => ({
    x: tileCoordinate(square.x), y: tileCoordinate(square.y),
  });
  const walls = plan.wallSquares.map((square, index) =>
    createBuildOrder(`${prefix}-0-wall-${index.toString().padStart(3, '0')}`, 'wall-brick', location(square), undefined, sequence, 'square'));
  const doors = plan.doorSquares.map((square, index) =>
    createBuildOrder(`${prefix}-1-door-${index.toString().padStart(3, '0')}`, 'door-wooden', location(square.orderTile ?? square), square.edge ?? 'north', sequence));
  const objects = plan.objects.map((object, index) =>
    createBuildOrder(`${prefix}-2-object-${index.toString().padStart(3, '0')}`, object.buildableId, location(object), undefined, sequence, undefined, object.orientation));
  return {
    plan,
    orders: [...walls, ...doors, ...objects],
    shellOrderIds: [...walls, ...doors].map((order) => order.id),
  };
}
