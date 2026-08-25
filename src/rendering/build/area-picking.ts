import { type TileRange, worldToTile } from '../tile-metrics';
import type { WorldPoint } from './edge-picking';

/**
 * Turning a drag across the world into the rectangle of tiles a player meant.
 *
 * The area counterpart of `./edge-picking.ts`, and a separate module rather
 * than more functions in that one because the two answer questions that do
 * not overlap. Edge picking exists because a wall lives on a tile *edge* and
 * only two of the four sides are stored, so "which edge did you mean" is a
 * genuine ambiguity a ghost has to resolve before the player commits. A room
 * lives on tiles. There is nothing to disambiguate: the tile under the press
 * and the tile under the release are the two opposite corners, and every tile
 * between them is in. `edgeRunFromDrag` has to commit a drag to one axis; this
 * must not, because a rectangle is exactly the shape that has two.
 *
 * Pure geometry -- no Phaser, no DOM, no simulation -- for the reason edge
 * picking is: the whole of the decision is testable without waving a pointer
 * at a canvas.
 *
 * ### Why a rectangle and not a paint stroke
 *
 * Because a rectangle is the only shape the consumer accepts.
 * `RoomZoningService.zone` takes a `width` and a `height` and refuses
 * `invalid-area` for anything else, and it checks every tile of the rectangle
 * before writing any of them. A paint gesture would let the player express a
 * shape that could only ever be refused, or would have to be decomposed into
 * several commands behind their back -- and each of those is a separate room,
 * a separate refusal and a separate thing to remove. ADR 0022 records the
 * genre agreeing: the drag is what Prison Architect, Two Point Hospital and
 * RimWorld all use for this.
 */

/** A rectangle of tiles, in the shape a zoning command carries one. */
export interface TileRect {
  readonly tileX: number;
  readonly tileY: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The longest side a drag may express, per axis.
 *
 * The simulation's own ceiling, not a number chosen here:
 * `MAX_ZONE_DIMENSION_TILES` is 64 and `RoomZoningService.zone` refuses
 * `invalid-area` above it, so a drag clamped to this can always be *expressed*
 * as a command even when it is refused for some other reason. Clamping rather
 * than refusing, for the reason `MAX_RUN_SEGMENTS` clamps a wall run: a
 * careless flick across a zoomed-out world should give the player the biggest
 * legal rectangle under their pointer, not a silent nothing.
 *
 * It is deliberately *not* imported from `src/simulation/**`.
 * `tests/unit/rendering-module-boundaries.test.ts` forbids that, and the two
 * numbers agreeing is asserted by a test that may import both rather than by a
 * dependency this layer is not allowed to have.
 */
export const MAX_ZONE_SIDE_TILES = 64;

/**
 * The single tile under a world point.
 *
 * The degenerate rectangle, and the one a tap produces. It exists so a tap and
 * a drag go down the same path: `beginArea` sets the pending rectangle from
 * this, and a release with no move commits it unchanged.
 */
export function pickTileAtWorld(point: WorldPoint): TileRect {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError('World point must be finite.');
  }
  return { tileX: worldToTile(point.x), tileY: worldToTile(point.y), width: 1, height: 1 };
}

/**
 * The rectangle spanned by two world points.
 *
 * Both corners are *inclusive*, which is what makes a press and release inside
 * one tile a 1x1 rectangle rather than an empty one, and it is why the width
 * is a tile count and not a coordinate difference. Direction does not matter:
 * dragging up-left gives the same rectangle as dragging down-right, because a
 * room has no direction and asking the player to start at a particular corner
 * would be a rule with nothing behind it.
 *
 * Each side is clamped independently, and the clamp keeps the **pressed**
 * corner: the tile the player put their finger on is the one they aimed at,
 * and the release is wherever the flick ended up. Clamping symmetrically would
 * move the rectangle away from the tile they chose.
 */
export function tileRectFromDrag(press: WorldPoint, release: WorldPoint): TileRect {
  const from = pickTileAtWorld(press);
  const to = pickTileAtWorld(release);

  const spanX = Math.min(Math.abs(to.tileX - from.tileX) + 1, MAX_ZONE_SIDE_TILES);
  const spanY = Math.min(Math.abs(to.tileY - from.tileY) + 1, MAX_ZONE_SIDE_TILES);

  return {
    tileX: to.tileX < from.tileX ? from.tileX - (spanX - 1) : from.tileX,
    tileY: to.tileY < from.tileY ? from.tileY - (spanY - 1) : from.tileY,
    width: spanX,
    height: spanY,
  };
}

export function tileRectsEqual(left: TileRect | undefined, right: TileRect | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return (
    left.tileX === right.tileX &&
    left.tileY === right.tileY &&
    left.width === right.width &&
    left.height === right.height
  );
}

/** Inclusive tile bounds, for a caller that draws or culls by range. */
export function tileRectToRange(rect: TileRect): TileRange {
  return {
    minTileX: rect.tileX,
    minTileY: rect.tileY,
    maxTileX: rect.tileX + rect.width - 1,
    maxTileY: rect.tileY + rect.height - 1,
  };
}

/**
 * What the renderer needs from whoever owns the room tool.
 *
 * A **second port beside `BuildToolPort`**, not a mode on it, and
 * `EditHistoryPort` in the same file is the precedent for that shape: the two
 * are asked different questions. `BuildToolPort.place` takes
 * `readonly EdgeTarget[]`, and its `isArmed()` carries no shape at all, so a
 * scene holding only that port cannot tell an edge tool from an area tool --
 * which is precisely the gap ADR 0022 §4 names. Widening `place` to a union of
 * edges-or-rectangle would make every existing caller destructure a shape it
 * does not use, and would still leave `isArmed()` unable to say which preview
 * to draw.
 *
 * Two ports also make the arbitration statable: at most one of
 * `BuildToolPort.isArmed()` and `RoomToolPort.isArmed()` is true, because both
 * are armed from panels on different tabs and leaving a tab disarms its tool.
 * The scene asks the build tool first and the room tool second, so even a
 * caller that armed both by hand gets one defined answer rather than an
 * interleaved gesture.
 */
export interface RoomToolPort {
  /** True while world pointer input designates an area instead of panning. */
  isArmed(): boolean;
  /** True while the armed gesture *removes* designations rather than creating one. */
  isRemoving(): boolean;
  /** The player finished a gesture. One rectangle per gesture. */
  place(rect: TileRect): void;
  /** Live feedback for the panel's readout. `undefined` when nothing is targeted. */
  target?(rect: TileRect | undefined): void;
}
