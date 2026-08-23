import { TILE_SIZE_PX, worldToTile } from '../tile-metrics';

/**
 * Turning a point on the world into the tile edge a player meant.
 *
 * Pure geometry: no Phaser, no DOM, no simulation. It is the whole of the
 * "which edge did I just click" decision, so it can be reasoned about in a
 * unit test instead of by waving a mouse at a canvas.
 *
 * ### Why the pointer picks the edge, and not a separate control
 *
 * A wall lives on a tile edge, not on a tile (`docs/WORLD.md`). A pointer
 * lands somewhere *inside* a tile, and the part of the tile it lands in
 * already says which edge was meant -- near the top means the north edge,
 * near the left means the west edge. Making the player state that again in a
 * second control would be asking for information the gesture already carried.
 *
 * All four sides are pickable even though the world stores only two, because
 * "the bottom of this tile" and "the top of the tile below" are the same
 * edge: a south pick resolves to the north edge of `(x, y + 1)`, and an east
 * pick to the west edge of `(x + 1, y)`. The player never has to know that.
 */

export type BuildEdgeId = 'north' | 'west';

export interface EdgeTarget {
  readonly tileX: number;
  readonly tileY: number;
  readonly edge: BuildEdgeId;
}

export interface WorldPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * A drag longer than this is clamped rather than obeyed.
 *
 * A run is one command per segment, and a careless flick across a zoomed-out
 * world would otherwise submit hundreds of build orders in one gesture --
 * every one of them consuming materials, and every one of them needing an
 * undo. Sixty-four is far longer than any wall a player draws deliberately
 * and far shorter than an accident.
 */
export const MAX_RUN_SEGMENTS = 64;

export function edgeTargetKey(target: EdgeTarget): string {
  return `${target.tileX},${target.tileY},${target.edge}`;
}

export function edgeTargetsEqual(left: EdgeTarget | undefined, right: EdgeTarget | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.tileX === right.tileX && left.tileY === right.tileY && left.edge === right.edge;
}

/**
 * The edge nearest a world point.
 *
 * Ties break towards north, then west -- the two edges the world actually
 * stores -- so a pick that lands exactly on a corner is still a single,
 * repeatable answer rather than a coin toss. Which edge a near-corner pick
 * resolves to is exactly what the on-screen ghost exists to show before the
 * player commits.
 */
export function pickEdgeAtWorld(point: WorldPoint): EdgeTarget {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError('World point must be finite.');
  }

  const tileX = worldToTile(point.x);
  const tileY = worldToTile(point.y);
  const withinX = point.x / TILE_SIZE_PX - tileX;
  const withinY = point.y / TILE_SIZE_PX - tileY;

  const toNorth = withinY;
  const toSouth = 1 - withinY;
  const toWest = withinX;
  const toEast = 1 - withinX;
  const nearest = Math.min(toNorth, toWest, toSouth, toEast);

  if (nearest === toNorth) return { tileX, tileY, edge: 'north' };
  if (nearest === toWest) return { tileX, tileY, edge: 'west' };
  // The two sides the world keeps no slot of its own for.
  if (nearest === toSouth) return { tileX, tileY: tileY + 1, edge: 'north' };
  return { tileX: tileX + 1, tileY, edge: 'west' };
}

/**
 * The run of edges a drag from `anchor` to `point` asks for.
 *
 * The axis is fixed by the anchor, not re-chosen as the drag moves: a north
 * edge runs east-west, a west edge runs north-south. Letting the drag flip
 * the axis mid-gesture would make the wall you get depend on the exact path
 * your hand took, and would silently abandon the edge the player deliberately
 * aimed at.
 *
 * Always ascending, whichever way the drag went, so the same wall submits the
 * same commands in the same order (`docs/DETERMINISM.md`). Always includes
 * the anchor, so a press with no movement is a run of one -- a tap and a drag
 * are the same code path.
 */
export function edgeRunBetween(anchor: EdgeTarget, point: WorldPoint): readonly EdgeTarget[] {
  const alongX = anchor.edge === 'north';
  const from = alongX ? anchor.tileX : anchor.tileY;
  const rawTo = alongX ? worldToTile(point.x) : worldToTile(point.y);
  const direction = rawTo >= from ? 1 : -1;
  const span = Math.min(Math.abs(rawTo - from), MAX_RUN_SEGMENTS - 1);
  const to = from + direction * span;

  const segments: EdgeTarget[] = [];
  for (let value = Math.min(from, to); value <= Math.max(from, to); value += 1) {
    segments.push(
      alongX
        ? { tileX: value, tileY: anchor.tileY, edge: 'north' }
        : { tileX: anchor.tileX, tileY: value, edge: 'west' },
    );
  }
  return segments;
}

/**
 * What the renderer needs from whoever owns the build tool.
 *
 * A port, not a class: the scene must not know that a build order is a
 * protocol command, and `src/rendering/**` may not submit one (pinned by
 * `tests/unit/rendering-module-boundaries.test.ts`). The scene reports a
 * gesture; the composition root turns it into commands.
 */
export interface BuildToolPort {
  /** True while world pointer input should build instead of pan. */
  isArmed(): boolean;
  /** The player finished a gesture. Segments are canonical and de-duplicated. */
  place(segments: readonly EdgeTarget[]): void;
  /** Live feedback for the panel's readout. `undefined` when nothing is targeted. */
  target?(segments: readonly EdgeTarget[] | undefined): void;
}
