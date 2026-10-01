import type { RotatedRoomTemplateGeometry } from './room-template-rotation';

/** Draft expansion descriptors; no worker command/save schema is extended here. */
export function roomTemplateConstructionGeometry(plan: RotatedRoomTemplateGeometry) {
  const walls = plan.wallSquares.map(square => ({definitionId:'wall-brick' as const, ...square, footprint:'square' as const}));
  // A north edge rotates to east, south, west. Existing storage represents
  // east as the neighbouring tile's west and south as the next tile's north.
  const doors = plan.doorSquares.map(door => {
    const tile = door.orderTile ?? door;
    const horizontal = plan.quarterTurns % 2 === 0;
    return {definitionId:'door-wooden' as const,
      x: tile.x + (plan.quarterTurns === 1 ? 1 : 0),
      y: tile.y + (plan.quarterTurns === 2 ? 1 : 0),
      edge: horizontal ? 'north' as const : 'west' as const};
  });
  const objects = plan.objects.map(object => ({definitionId:object.buildableId, x:object.x, y:object.y, orientation:object.quarterTurns}));
  return {walls,doors,objects,zones:plan.zones};
}
