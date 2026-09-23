import { tileCoordinate, type TilePosition } from './coordinates';

/**
 * A walk of orthogonal one-tile steps as a save writes it: one letter per step,
 * `E` for x+1, `W` for x-1, `S` for y+1 and `N` for y-1, read from a start tile
 * the caller carries beside it.
 *
 * ## Why a save needs this, measured
 *
 * Issue #1373's save carries two kinds of tile path: a walker's remaining legs
 * (`simulation.inFlight.*.locomotion`) and a cached route
 * (`simulation.inFlight.navigation.caches`). Written as one `{ "x": .., "y": .. }`
 * object per tile, a walk costs about 20 bytes a step as the cloud trigger
 * measures a payload (`octet_length(payload::text)`, ADR 0013 §4). A
 * 1,080-prisoner prison at a meal rush -- 1,024 prisoners walking -- carried
 * 2.85 MB of walks that way and a 4,272,270-byte payload, over ADR 0013's
 * 4,194,304. A letter is one byte.
 *
 * Every path this encodes is already one orthogonal step per leg, and both
 * owners check it: `LocomotionStore.beginWalk`/`loadSnapshot` refuse any other
 * leg, and a route is `boundedLocalSearch`'s four-neighbour walk. So the
 * encoding loses nothing; `encodeStepPath` throws on a leg it cannot write
 * rather than approximating one.
 */
export type StepLetter = 'E' | 'W' | 'S' | 'N';

const OFFSETS: Readonly<Record<StepLetter, readonly [number, number]>> = { E: [1, 0], W: [-1, 0], S: [0, 1], N: [0, -1] };

function letterFor(from: TilePosition, to: TilePosition): StepLetter {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 1 && dy === 0) return 'E';
  if (dx === -1 && dy === 0) return 'W';
  if (dx === 0 && dy === 1) return 'S';
  if (dx === 0 && dy === -1) return 'N';
  throw new Error(`Invariant violated: a path steps from ${String(from.x)},${String(from.y)} to ${String(to.x)},${String(to.y)}, which is not one orthogonal step.`);
}

/** The letters for `waypoints`, which must be non-empty; its first tile is the caller's to carry. */
export function encodeStepPath(waypoints: readonly TilePosition[]): string {
  let path = '';
  for (let index = 1; index < waypoints.length; index += 1) path += letterFor(waypoints[index - 1]!, waypoints[index]!);
  return path;
}

/**
 * The tiles `path` walks from `start`, `start` included -- so one more than
 * the path's length. Throws `RangeError` on a letter that is not a step.
 */
export function decodeStepPath(start: TilePosition, path: string): TilePosition[] {
  const waypoints: TilePosition[] = [{ x: tileCoordinate(start.x), y: tileCoordinate(start.y) }];
  for (const letter of path) {
    const offset = OFFSETS[letter as StepLetter] as readonly [number, number] | undefined;
    if (offset === undefined) throw new RangeError(`A path step "${letter}" is not one of E, W, S, N.`);
    const last = waypoints[waypoints.length - 1]!;
    waypoints.push({ x: tileCoordinate(last.x + offset[0]), y: tileCoordinate(last.y + offset[1]) });
  }
  return waypoints;
}
