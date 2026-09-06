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

/**
 * There is one bias for every actor, and splitting it per population would not
 * help -- read this before adding `prisoner` and `guard` entries below.
 *
 * Issue [#944](https://github.com/matmaxalez/lockstate/issues/944) §4 step 2
 * proposes exactly that: co-located actors get the identical depth from
 * `depthForAnchor`, Phaser's sort is stable, and the tie therefore fell to the
 * feed's array order -- prisoners first, guards second -- so on a shared tile
 * the guard always won and the prisoners were always the hidden ones. A
 * distinct bias per population does fit: `DEPTH_ROW_STRIDE` leaves room, and
 * the row term is in world units, so adjacent rows are 512 apart.
 *
 * **It was not done, because it cannot do the thing that is wanted.** A bias
 * decides which of two figures drawn at one point is on top; it cannot make
 * both of them visible, so it would move the guarantee from "the prisoners are
 * always hidden" to "the guards are always hidden" and leave 22 prisoners on
 * one tile drawing as one figure either way. Two figures where two actors
 * stood is a *placement* problem, and the answer is
 * `src/rendering/actors/crowd-spread.ts`: co-located actors are drawn at
 * distinct points inside their own tile, `ActorLayer` takes this function's
 * anchor from the drawn foot, and the tie is gone rather than re-pointed.
 * `tests/unit/rendering-crowd-spread.test.ts` and
 * `tests/browser/actor-crowding.spec.ts` are the gates.
 */
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
 * coordinate reaches it -- a row would have to sit 125 million world units
 * (about 1.95 million tiles at `TILE_SIZE_PX` 64) north of the origin to
 * collide.
 */
export const FLOOR_DEPTH = -1_000_000_000;

/**
 * Floor artwork, which sits one step *below* the ground `Graphics`.
 *
 * Below, not above, and that is what makes it one `Graphics` per chunk instead
 * of two. The ground layer paints four things in one buffer -- terrain colour,
 * the room tint, the unowned shade and the grid -- and only the first of them
 * belongs under the art. So the painter skips the terrain fill on any tile a
 * floor sprite covers and lets the sprite show through from underneath, which
 * leaves the other three drawing over it exactly as they always did.
 *
 * It is still a billion units below the row-sorted band, so nothing with height
 * can reach it.
 */
export const FLOOR_ART_DEPTH = FLOOR_DEPTH - 1;

/**
 * A room's name, written across its floor.
 *
 * **Above the row-sorted band, and that is a reversal of what ADR 0098 option C
 * priced, taken on a measurement rather than on taste.** That option describes
 * a per-room mark *"drawn over the floor and under the objects"*, so the first
 * version of this constant was `FLOOR_DEPTH + 1`. Measured in Chromium at 1280
 * x 720 with one finished bed standing at the centre of a named Canteen, the
 * name rendered as **"teen" at zoom 1.0 and "een" at zoom 3.0** -- the bed is
 * drawn with height, from its foot, so it covers the room's middle, which is
 * exactly where a centred name goes. A name that cannot be read has not done
 * the one thing the owner's ruling asked of it.
 *
 * What the reversal costs is small and bounded in the other direction: the name
 * is a constant 13 screen pixels tall whatever the zoom, so at zoom 1 it hides
 * 16 of a 64-pixel tile's height and at zoom 3 it hides 16 of 192. An object is
 * identifiable around it; a word is not identifiable through it. ADR 0098's
 * option C is a costing of an option, not a decision -- that document is
 * Proposed, not Accepted -- so nothing approved is contradicted here.
 *
 * `-FLOOR_DEPTH - 1` rather than a bare literal, because the two bounds are one
 * bound and writing it this way makes that the declaration: the ground sits as
 * far below the row-sorted band as the name sits above it, so a world would
 * have to extend about 1.95 million tiles from the origin -- in either
 * direction -- for a row to reach either of them. The `- 1` leaves
 * `BuildOverlay`'s fixed `1_000_000_000` preview depth on top, so a wall ghost
 * the player is currently dragging still draws over a room's name.
 */
export const ROOM_LABEL_DEPTH = -FLOOR_DEPTH - 1;

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
