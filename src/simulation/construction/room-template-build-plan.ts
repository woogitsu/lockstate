import { instantiateRoomTemplate, type RoomTemplatePlan } from '../../content/room-template-catalog';
import { createBuildOrder, type BuildOrder } from './build-order';
import { tileCoordinate } from '../world/coordinates';

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
): RoomTemplateBuildPlan {
  const plan = instantiateRoomTemplate(templateId, origin, { mirrorX });
  const prefix = `room-template-${sequence.toString().padStart(12, '0')}`;
  const location = (square: { readonly x: number; readonly y: number }) => ({
    x: tileCoordinate(square.x), y: tileCoordinate(square.y),
  });
  const edgeForWall = (square: { readonly x: number; readonly y: number }): { readonly location: { readonly x: number; readonly y: number }; readonly edge: 'north' | 'west' } => {
    const left = plan.origin.x;
    const top = plan.origin.y;
    const right = left + plan.width - 1;
    const bottom = top + plan.height - 1;
    if (square.y === top) return { location: { x: square.x, y: square.y }, edge: 'north' };
    if (square.y === bottom) return { location: { x: square.x, y: square.y + 1 }, edge: 'north' };
    if (square.x === left) return { location: { x: square.x, y: square.y }, edge: 'west' };
    if (square.x === right) return { location: { x: square.x + 1, y: square.y }, edge: 'west' };
    throw new RangeError(`Room template wall square ${square.x},${square.y} is not on the perimeter.`);
  };
  const walls = plan.wallSquares.map((square, index) => {
    const edge = edgeForWall(square);
    return createBuildOrder(`${prefix}-0-wall-${index.toString().padStart(3, '0')}`, 'wall-brick', location(edge.location), edge.edge, sequence, 'square');
  });
  const doors = plan.doorSquares.map((square, index) =>
    // The template door is on the south boundary; north edges are stored on
    // the tile immediately outside that boundary, just like bottom walls.
    createBuildOrder(`${prefix}-1-door-${index.toString().padStart(3, '0')}`, 'door-wooden', location({ x: square.x, y: square.y + 1 }), 'north', sequence));
  const objects = plan.objects.map((object, index) =>
    createBuildOrder(`${prefix}-2-object-${index.toString().padStart(3, '0')}`, object.buildableId, location(object), undefined, sequence));
  return {
    plan,
    orders: [...walls, ...doors, ...objects],
    shellOrderIds: [...walls, ...doors].map((order) => order.id),
  };
}
