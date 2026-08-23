import Phaser from 'phaser';
import type { EdgeTarget } from '../build/edge-picking';
import { TILE_SIZE_PX } from '../tile-metrics';
import { EDGE_WALL_APPEARANCE, EDGE_WALL_THICKNESS_TILES, PLANNED_ALPHA } from '../world/appearance';

/**
 * Above every row-sorted layer. `depthForAnchor` maps a world Y onto a depth,
 * so any real row lands far below this; a fixed constant is honest about the
 * fact that the preview is not part of the world's depth ordering at all.
 */
const BUILD_PREVIEW_DEPTH = 1_000_000_000;

/**
 * The wall the player is *about* to place, drawn under the pointer.
 *
 * Purely a preview. It holds nothing, it is never read back, and it is
 * cleared the moment the gesture ends — the real wall arrives later, from a
 * snapshot, like everything else the renderer draws.
 *
 * It exists because the pick is genuinely ambiguous near a tile corner:
 * "nearest edge" is a rule the player cannot run in their head at speed, and
 * touch has no hover to explore with. Showing the answer before the commit is
 * what makes the rule learnable instead of surprising, and is why the drag
 * preview updates on every move rather than only at the end.
 *
 * Drawn at the same thickness and colour as a real edge wall so the preview
 * is the thing itself at a lower alpha, not a different symbol the player has
 * to translate.
 */
export class BuildOverlay {
  private readonly graphics: Phaser.GameObjects.Graphics;

  public constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics();
    // A preview that could be hidden behind a wall is not a preview.
    this.graphics.setDepth(BUILD_PREVIEW_DEPTH);
  }

  public update(segments: readonly EdgeTarget[]): void {
    this.graphics.clear();
    if (segments.length === 0) return;

    const thickness = EDGE_WALL_THICKNESS_TILES * TILE_SIZE_PX;
    this.graphics.fillStyle(EDGE_WALL_APPEARANCE.topFill, PLANNED_ALPHA);
    this.graphics.lineStyle(1, EDGE_WALL_APPEARANCE.outline, PLANNED_ALPHA);

    for (const segment of segments) {
      const left = segment.tileX * TILE_SIZE_PX;
      const top = segment.tileY * TILE_SIZE_PX;
      const width = segment.edge === 'north' ? TILE_SIZE_PX : thickness;
      const height = segment.edge === 'north' ? thickness : TILE_SIZE_PX;
      this.graphics.fillRect(left, top, width, height);
      this.graphics.strokeRect(left, top, width, height);
    }
  }

  public clear(): void {
    this.graphics.clear();
  }

  public destroy(): void {
    this.graphics.destroy();
  }
}
