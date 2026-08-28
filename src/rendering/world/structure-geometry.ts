/**
 * Where a raised thing's faces land on screen, in world pixels.
 *
 * `tile-layer.ts` draws everything with height as a box seen from above and
 * slightly in front: a side face rising from the footprint's southern edge with
 * the top face above it (`docs/RENDERING.md`, "Depth"). That arithmetic used to
 * live inside the painter, which put it out of reach of the Node test
 * environment entirely -- and it stopped being only the painter's business the
 * moment a sprite had to cover exactly the same rectangle the coloured block
 * would have.
 *
 * `bounds` is that rectangle. It is derived from the two faces here rather than
 * asserted alongside them, so a sprite and the block it replaces cannot drift
 * apart: change one face and the bounds follow.
 *
 * Pure, Phaser-free, DOM-free.
 */

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SlabFaces {
  /** The face seen from above, offset north by the apparent height. */
  readonly top: Rect;
  /** The face rising from the footprint's southern edge. */
  readonly side: Rect;
  /** The union of the two: everything the slab covers. */
  readonly bounds: Rect;
}

/**
 * @param leftPx  west edge of the footprint
 * @param topPx   north edge of the footprint
 * @param widthPx east-west extent of the footprint
 * @param depthPx north-south extent of the footprint
 * @param heightPx apparent height, which is how far north the top face is lifted
 */
export function slabFaces(leftPx: number, topPx: number, widthPx: number, depthPx: number, heightPx: number): SlabFaces {
  const top: Rect = { x: leftPx, y: topPx - heightPx, width: widthPx, height: depthPx };
  const side: Rect = { x: leftPx, y: topPx + depthPx - heightPx, width: widthPx, height: heightPx };
  const minY = Math.min(top.y, side.y);
  const maxY = Math.max(top.y + top.height, side.y + side.height);
  return { top, side, bounds: { x: leftPx, y: minY, width: widthPx, height: maxY - minY } };
}
