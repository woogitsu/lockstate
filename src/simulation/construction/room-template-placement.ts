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
  // The exclusive bounds must stay safe: incrementing 2^53 never advances a
  // JavaScript number and would otherwise trap this worker in the loop below.
  if (!Number.isSafeInteger(plan.origin.x + plan.width) ||
      !Number.isSafeInteger(plan.origin.y + plan.height)) {
    return { ok: false, reason: 'unowned-land', tile: {
      x: tileCoordinate(plan.origin.x), y: tileCoordinate(plan.origin.y),
    } };
  }
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
  // Every doorway needs its outside approach open. The door edge separates
  // interior from its perimeter square; an older wall beyond that gap would
  // otherwise pass the rectangle scan and seal a turned plan's entrance.
  for (const door of plan.doorSquares) {
    const north = door.y === plan.origin.y;
    const south = door.y === plan.origin.y + plan.height - 1;
    const west = door.x === plan.origin.x;
    const east = door.x === plan.origin.x + plan.width - 1;
    const outsideX = door.x + (west ? -1 : east ? 1 : 0);
    const outsideY = door.y + (north ? -1 : south ? 1 : 0);
    if (!Number.isSafeInteger(outsideX) || !Number.isSafeInteger(outsideY)) continue;
    const doorTile = { x: tileCoordinate(door.x), y: tileCoordinate(door.y) };
    const outside = { x: tileCoordinate(outsideX), y: tileCoordinate(outsideY) };
    if (!world.isTileOwned(outside)) {
      return { ok: false, reason: 'unowned-land', tile: outside };
    }
    const edgeBlocked = north ? world.getTopEdge(doorTile) !== 0 :
      south ? world.getTopEdge(outside) !== 0 :
      west ? world.getLeftEdge(doorTile) !== 0 :
      east && world.getLeftEdge(outside) !== 0;
    if (world.getSquareStructure(outside) !== 0 || structureIsClaimed(outside) || edgeBlocked) {
      return { ok: false, reason: 'structure-occupied', tile: { x: tileCoordinate(door.x), y: tileCoordinate(door.y) } };
    }
    if (objectOccupies(outside)) {
      return { ok: false, reason: 'object-occupied', tile: { x: tileCoordinate(door.x), y: tileCoordinate(door.y) } };
    }
  }
  return { ok: true };
}
