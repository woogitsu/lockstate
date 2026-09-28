import { instantiateRoomTemplate, orientRoomTemplatePlan, type RoomTemplatePlan } from '../../content/room-template-catalog';
import { createBuildOrder, type BuildOrder } from './build-order';
import { tileCoordinate } from '../world/coordinates';
import type { TemplateQuarterTurns } from '../../content/room-template-rotation-geometry';

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
  const plan: RoomTemplatePlan = orientRoomTemplatePlan(instantiateRoomTemplate(templateId, origin, { mirrorX }), quarterTurns);
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
