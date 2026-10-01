import { tileCoordinate, type TilePosition } from './coordinates';

/** Raw storage stays separate from the barriers created by occupied squares. */
export interface BarrierReader {
  getTopEdge(tile: TilePosition): number;
  getLeftEdge(tile: TilePosition): number;
  getSquareStructure?(tile: TilePosition): number;
}

export function getTopBarrier(world: BarrierReader, tile: TilePosition): number {
  if (world.getSquareStructure?.(tile) === 1 ||
      world.getSquareStructure?.({ x: tile.x, y: tileCoordinate(tile.y - 1) }) === 1) return 1;
  return world.getTopEdge(tile);
}

export function getLeftBarrier(world: BarrierReader, tile: TilePosition): number {
  if (world.getSquareStructure?.(tile) === 1 ||
      world.getSquareStructure?.({ x: tileCoordinate(tile.x - 1), y: tile.y }) === 1) return 1;
  return world.getLeftEdge(tile);
}
