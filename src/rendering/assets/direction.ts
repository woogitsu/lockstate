import type { AtlasDirection } from './atlas-manifest';

/**
 * Maps a world-space movement vector to one of the eight authored directions.
 *
 * `assets/contracts/character-8-direction.contract.json` defines direction as
 * *intended world movement* with `+x` east and `+y` south, deliberately not as
 * a screen vector. This function is the single place that interpretation is
 * encoded, so a future camera change cannot quietly reinterpret the art.
 *
 * This is a pure presentation lookup. It reads a movement vector the simulation
 * already produced; it never decides where an actor goes.
 */

/** Ordered by increasing atan2(y, x) angle from east, in 45-degree steps. */
const BY_OCTANT: readonly AtlasDirection[] = [
  'east',
  'southEast',
  'south',
  'southWest',
  'west',
  'northWest',
  'north',
  'northEast',
];

/** Direction used when an actor is not moving. */
export const DEFAULT_FACING: AtlasDirection = 'south';

export function directionFromMovement(
  deltaX: number,
  deltaY: number,
  fallback: AtlasDirection = DEFAULT_FACING,
): AtlasDirection {
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) {
    throw new RangeError('Movement components must be finite.');
  }
  if (deltaX === 0 && deltaY === 0) return fallback;

  const octant = Math.round((Math.atan2(deltaY, deltaX) * 4) / Math.PI);
  const index = ((octant % 8) + 8) % 8;
  const direction = BY_OCTANT[index];
  if (direction === undefined) throw new RangeError(`Movement (${deltaX}, ${deltaY}) produced octant ${index}.`);
  return direction;
}

/**
 * Frame index for a looping clip at a given elapsed time. Deterministic given
 * the same inputs, so a placement preview and the live renderer agree.
 */
export function clipFrameOrdinal(elapsedSeconds: number, fps: number, frameCount: number, loop: boolean): number {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) throw new RangeError('Elapsed time must be finite and non-negative.');
  if (!Number.isFinite(fps) || fps <= 0) throw new RangeError('Clip fps must be positive and finite.');
  if (!Number.isInteger(frameCount) || frameCount < 1) throw new RangeError('A clip needs at least one frame.');

  const advanced = Math.floor(elapsedSeconds * fps);
  return loop ? advanced % frameCount : Math.min(advanced, frameCount - 1);
}
