import type { TilePosition } from './coordinates';
import type { SparseWorld } from './sparse-world';

/** The physical face between neighboring ground squares in the new construction model. */
type SquareBoundary = 'open' | 'wall' | 'door';

function face(value: number, axis: 'horizontal' | 'vertical'): SquareBoundary {
  if (value === 1) return 'wall';
  if (value === 2) return axis === 'vertical' ? 'door' : 'wall';
  if (value === 3) return axis === 'horizontal' ? 'door' : 'wall';
  return 'open';
}

/**
 * Classifies a shared face using both square footprints. This deliberately
 * excludes the historical edge layers: a caller combines that independent
 * geometry with this answer, so old prison walls never move on restore.
 */
export function squareBoundary(world: SparseWorld, from: TilePosition, to: TilePosition): SquareBoundary {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) + Math.abs(dy) !== 1) {
    throw new RangeError('Square boundary requires orthogonally adjacent tiles.');
  }
  const axis = dx === 0 ? 'vertical' : 'horizontal';
  const left = face(world.getSquareStructure(from), axis);
  const right = face(world.getSquareStructure(to), axis);
  if (left === 'wall' || right === 'wall') return 'wall';
  if (left === 'door' || right === 'door') return 'door';
  return 'open';
}
