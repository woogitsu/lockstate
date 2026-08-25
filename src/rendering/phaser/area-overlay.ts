import Phaser from 'phaser';
import type { TileRect } from '../build/area-picking';
import { TILE_SIZE_PX } from '../tile-metrics';
import { PLANNED_ALPHA, ZONING_TINT_ALPHA } from '../world/appearance';

/**
 * Above every row-sorted layer, and above the wall preview.
 *
 * `BuildOverlay` uses `1_000_000_000` for the same reason -- a fixed constant
 * is honest about the fact that a preview is not part of the world's depth
 * ordering at all -- and this sits one above it so that, in the impossible-by-
 * construction case of both tools being armed at once, the answer on screen is
 * defined rather than whichever drew last.
 */
const AREA_PREVIEW_DEPTH = 1_000_000_001;

/**
 * How a removal preview is drawn. Neutral rather than a category colour,
 * because a removal names no room type: what comes out is whatever is there,
 * and tinting it with one room's colour would claim otherwise.
 */
const REMOVE_FILL = 0x05070a;
const REMOVE_OUTLINE = 0xf0f4f8;

/**
 * The area the player is *about* to designate, or clear, drawn under the
 * pointer.
 *
 * The sibling of `BuildOverlay`, and it exists for a different reason than
 * that one does. The wall ghost exists because the pick is genuinely
 * ambiguous: "nearest edge" is a rule a player cannot run in their head at
 * speed. A rectangle is not ambiguous at all -- the press corner and the
 * release corner say everything. What this shows instead is **extent**: how
 * many tiles the drag has actually swallowed, which at a zoomed-out camera is
 * the thing a player genuinely cannot judge, and which matters here far more
 * than it does for a wall because a room is refused as a whole. A 6x6 canteen
 * that is really 6x5 is refused for being below its minimum, and a player who
 * cannot see the extent has no way to know which side was short.
 *
 * It is the first area preview in the tree. `BuildOverlay`'s lifecycle is
 * reused unchanged -- one `Graphics`, a fixed preview depth, cleared the moment
 * the gesture ends -- and its signature is not, which is exactly the split
 * ADR 0022 §4 predicted.
 *
 * Purely a preview: it holds nothing, it is never read back, and the real
 * designation arrives later from a snapshot through the zoning plane the tile
 * layer already paints. Drawn at `ZONING_TINT_ALPHA` over the fill and
 * `PLANNED_ALPHA` on the outline, so a pending room reads as the same kind of
 * mark a finished one does at a lower confidence -- the same rule
 * `BuildOverlay` follows for a wall.
 */
export class AreaOverlay {
  private readonly graphics: Phaser.GameObjects.Graphics;

  public constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(AREA_PREVIEW_DEPTH);
  }

  /**
   * `tint` is the selected room category's colour, or `undefined` for a
   * removal gesture.
   *
   * The colour is passed in rather than derived here, because deriving it
   * would mean this module knowing which room is selected -- and the selection
   * lives in the HUD, three layers away. The scene is handed the tint by the
   * same port that arms the tool.
   */
  public update(rect: TileRect | undefined, tint: number | undefined): void {
    this.graphics.clear();
    if (rect === undefined || rect.width < 1 || rect.height < 1) return;

    const left = rect.tileX * TILE_SIZE_PX;
    const top = rect.tileY * TILE_SIZE_PX;
    const width = rect.width * TILE_SIZE_PX;
    const height = rect.height * TILE_SIZE_PX;

    const removing = tint === undefined;
    this.graphics.fillStyle(removing ? REMOVE_FILL : tint, ZONING_TINT_ALPHA);
    this.graphics.lineStyle(2, removing ? REMOVE_OUTLINE : tint, PLANNED_ALPHA);
    this.graphics.fillRect(left, top, width, height);
    this.graphics.strokeRect(left, top, width, height);

    // Every tile of the rectangle gets its own hairline, so the count is
    // readable off the preview instead of having to be inferred from its size
    // against a zoom the player is not tracking. Bounded by the rectangle's
    // own area, which `MAX_ZONE_SIDE_TILES` caps at 64 per side -- so at worst
    // 128 strokes, once per pointer move, against the 4,096 fills the tile
    // layer already does for the same area.
    this.graphics.lineStyle(1, removing ? REMOVE_OUTLINE : tint, PLANNED_ALPHA * 0.5);
    for (let offset = 1; offset < rect.width; offset += 1) {
      const x = left + offset * TILE_SIZE_PX;
      this.graphics.lineBetween(x, top, x, top + height);
    }
    for (let offset = 1; offset < rect.height; offset += 1) {
      const y = top + offset * TILE_SIZE_PX;
      this.graphics.lineBetween(left, y, left + width, y);
    }
  }

  public clear(): void {
    this.graphics.clear();
  }

  public destroy(): void {
    this.graphics.destroy();
  }
}
