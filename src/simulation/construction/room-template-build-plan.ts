import { instantiateRoomTemplate, type RoomTemplatePlan } from '../../content/room-template-catalog';
import { defaultObjectRegistry } from '../../content/object-catalog';
import { instantiateOrientedRoomTemplate, type QuarterTurns } from '../../content/room-template-rotation';
import { roomTemplateConstructionGeometry } from '../../content/room-template-construction-geometry';
import { getBuildableDefinition } from './definition';
import { createBuildOrder, type BuildOrder } from './build-order';
import { tileCoordinate } from '../world/coordinates';

export interface RoomTemplateBuildPlan {
  readonly plan: RoomTemplatePlan;
  readonly orders: readonly BuildOrder[];
  readonly shellOrderIds: readonly string[];
}

/** One shared authoritative geometry reader for preflight, claims and history. */
export function instantiateRoomTemplateForConstruction(
  templateId: RoomTemplatePlan['id'], origin: RoomTemplatePlan['origin'], mirrorX = false,
  quarterTurns: QuarterTurns = 0,
) {
  return instantiateOrientedRoomTemplate(templateId, origin, { mirrorX, quarterTurns }, (id) => {
    const objectId = getBuildableDefinition(id).placesObjectId;
    const object = objectId === undefined ? undefined : defaultObjectRegistry.getById(objectId);
    if (object === undefined) throw new Error(`Room template fixture ${id} has no object definition`);
    return object.footprint;
  });
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
  quarterTurns: QuarterTurns = 0,
): RoomTemplateBuildPlan {
  const oriented = instantiateRoomTemplateForConstruction(templateId, origin, mirrorX, quarterTurns);
  const geometry = roomTemplateConstructionGeometry(oriented);
  // Retain the old unrotated shape for existing geometry consumers and saves.
  const plan = quarterTurns === 0 ? instantiateRoomTemplate(templateId, origin, { mirrorX }) : oriented;
  const prefix = `room-template-${sequence.toString().padStart(12, '0')}`;
  const location = (square: { readonly x: number; readonly y: number }) => ({
    x: tileCoordinate(square.x), y: tileCoordinate(square.y),
  });
  const walls = geometry.walls.map((square, index) =>
    createBuildOrder(`${prefix}-0-wall-${index.toString().padStart(3, '0')}`, 'wall-brick', location(square), undefined, sequence, 'square'));
  const doors = geometry.doors.map((door, index) =>
    createBuildOrder(`${prefix}-1-door-${index.toString().padStart(3, '0')}`, 'door-wooden', location(door), door.edge, sequence));
  const objects = geometry.objects.map((object, index) =>
    createBuildOrder(`${prefix}-2-object-${index.toString().padStart(3, '0')}`, object.definitionId, location(object), undefined, sequence,
      undefined, object.orientation === 0 ? undefined : object.orientation));
  return {
    plan,
    orders: [...walls, ...doors, ...objects],
    shellOrderIds: [...walls, ...doors].map((order) => order.id),
  };
}
