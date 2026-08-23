/**
 * Draw ordering for a top-down view in which objects have visible sides.
 *
 * Anything with height is drawn from its *foot* (its southernmost world row),
 * so a thing further south covers a thing further north, exactly as it would
 * if you were looking down at the prison from in front of it. That anchor is
 * deterministic shared metadata -- the same rule a placement preview uses --
 * and never simulation authority (`AGENTS.md` boundary 1).
 *
 * Nothing here imports Phaser: `depth` is just a number the view layer hands
 * to a display list.
 */

/** Layers that sort by world row. Higher bias wins a tie on the same row. */
export const ROW_SORTED_LAYERS = ['structure', 'actor'] as const;
export type RowSortedLayer = (typeof ROW_SORTED_LAYERS)[number];

/**
 * Multiplier applied to the anchor row before the layer bias is added.
 *
 * It only has to exceed the largest bias so that a bias can never promote
 * something past an object on a later row; 8 leaves room for more layers
 * without revisiting the constant.
 */
export const DEPTH_ROW_STRIDE = 8;

const LAYER_BIAS: Readonly<Record<RowSortedLayer, number>> = {
  /** Walls, doors and placed objects. */
  structure: 0,
  /** Actors, so someone standing in a doorway reads as being in front of it. */
  actor: 1,
};

/**
 * The ground, which does not participate in row sorting: it has no height, so
 * nothing can stand in front of it.
 *
 * It is far enough below the row-sorted band that no plausible world
 * coordinate reaches it -- a row would have to sit 125 million pixels (about
 * 3.9 million tiles) north of the origin to collide.
 */
export const FLOOR_DEPTH = -1_000_000_000;

/**
 * Depth for something whose base sits at `anchorWorldY`.
 *
 * Pure and total: given the same anchor and layer it always returns the same
 * number, so the renderer and any preview agree on occlusion.
 */
export function depthForAnchor(anchorWorldY: number, layer: RowSortedLayer): number {
  if (!Number.isFinite(anchorWorldY)) throw new RangeError('Depth anchor must be finite.');
  const bias = LAYER_BIAS[layer];
  if (bias === undefined) throw new RangeError(`Unknown row-sorted layer "${layer}".`);
  return anchorWorldY * DEPTH_ROW_STRIDE + bias;
}
