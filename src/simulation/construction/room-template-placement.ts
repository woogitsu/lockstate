import type { RoomTemplatePlan } from '../../content/room-template-catalog';
import { tileCoordinate, type TilePosition } from '../world/coordinates';
import type { SparseWorld } from '../world/sparse-world';

export type RoomTemplatePlacement =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'unowned-land' | 'structure-occupied' | 'object-occupied'; readonly tile: TilePosition };

/**
 * Read-only preflight over the entire template footprint. A single blocked
 * square refuses the complete plan, before any wall, door, zone or object order
 * can be submitted. The object reader comes from the placed-object registry.
 */
export function validateRoomTemplatePlacement(
  world: SparseWorld,
  plan: RoomTemplatePlan,
  objectOccupies: (tile: TilePosition) => boolean = () => false,
  structureIsClaimed: (tile: TilePosition) => boolean = () => false,
): RoomTemplatePlacement {
  for (let y = plan.origin.y; y < plan.origin.y + plan.height; y += 1) {
    for (let x = plan.origin.x; x < plan.origin.x + plan.width; x += 1) {
      const tile = { x: tileCoordinate(x), y: tileCoordinate(y) };
      if (!world.isTileOwned(tile)) return { ok: false, reason: 'unowned-land', tile };
      if (
        world.getSquareStructure(tile) !== 0 || world.getTopEdge(tile) !== 0 || world.getLeftEdge(tile) !== 0 ||
        world.getZoning(tile) !== 0 || structureIsClaimed(tile)
      ) {
        return { ok: false, reason: 'structure-occupied', tile };
      }
      if (objectOccupies(tile)) return { ok: false, reason: 'object-occupied', tile };
    }
  }
  // A south-facing doorway needs its outside approach open. Its door edge is
  // between the interior and the perimeter gap; an older edge wall just beyond
  // that gap would otherwise pass the rectangle scan and seal the entrance.
  for (const door of plan.doorSquares) {
    if (door.y !== plan.origin.y + plan.height - 1) continue;
    const outsideY = door.y + 1;
    if (!Number.isSafeInteger(outsideY)) continue;
    if (world.getTopEdge({ x: tileCoordinate(door.x), y: tileCoordinate(outsideY) }) !== 0) {
      return { ok: false, reason: 'structure-occupied', tile: { x: tileCoordinate(door.x), y: tileCoordinate(door.y) } };
    }
  }
  return { ok: true };
}
