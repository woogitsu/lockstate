import Phaser from 'phaser';
import type { EdgeTarget } from '../build/edge-picking';
import type { RoomTemplatePlan } from '../../content/room-template-catalog';
import type { TemplateGhostVerdict } from '../build/template-ghost';
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

  /** The entire tile is the occupied footprint; the raised face is presentation only. */
  public updateSquares(squares: readonly { readonly x: number; readonly y: number }[]): void {
    this.graphics.clear();
    this.graphics.fillStyle(EDGE_WALL_APPEARANCE.topFill, PLANNED_ALPHA);
    this.graphics.lineStyle(2, EDGE_WALL_APPEARANCE.outline, 1);
    for (const square of squares) {
      const left = square.x * TILE_SIZE_PX;
      const top = square.y * TILE_SIZE_PX;
      this.graphics.fillRect(left, top, TILE_SIZE_PX, TILE_SIZE_PX);
      this.graphics.strokeRect(left + 1, top + 1, TILE_SIZE_PX - 2, TILE_SIZE_PX - 2);
    }
  }

  /** Every footprint square is visible. The doorway is revealed only by a clear worker verdict. */
  public updateTemplate(plan: RoomTemplatePlan, verdict: TemplateGhostVerdict | undefined): void {
    this.graphics.clear();
    const blocked = verdict?.ok === false;
    const wall = new Set(plan.wallSquares.map(({ x, y }) => `${x},${y}`));
    const door = new Set(plan.doorSquares.map(({ x, y }) => `${x},${y}`));
    const objects = new Set(plan.objects.map(({ x, y }) => `${x},${y}`));
    for (let y = plan.origin.y; y < plan.origin.y + plan.height; y += 1) {
      for (let x = plan.origin.x; x < plan.origin.x + plan.width; x += 1) {
        const key = `${x},${y}`;
        const isBlockedTile = blocked && verdict.tile?.x === x && verdict.tile?.y === y;
        const fill = isBlockedTile ? 0xb23b45 : wall.has(key) ? 0x5c7480 : 0x9db5b9;
        this.graphics.fillStyle(fill, isBlockedTile ? 0.72 : 0.38);
        this.graphics.fillRect(x * TILE_SIZE_PX, y * TILE_SIZE_PX, TILE_SIZE_PX, TILE_SIZE_PX);
        this.graphics.lineStyle(1, blocked ? 0xb23b45 : 0x245c63, 0.9);
        this.graphics.strokeRect(x * TILE_SIZE_PX + 1, y * TILE_SIZE_PX + 1, TILE_SIZE_PX - 2, TILE_SIZE_PX - 2);
        // A pending or refused preflight must not show an apparent entrance.
        if (verdict?.ok === true && door.has(key)) {
          this.graphics.fillStyle(0x008b88, 0.9);
          this.graphics.fillRect(x * TILE_SIZE_PX + 8, y * TILE_SIZE_PX + 8, TILE_SIZE_PX - 16, TILE_SIZE_PX - 16);
        }
        if (objects.has(key)) {
          this.graphics.fillStyle(0x173843, 0.8);
          this.graphics.fillCircle((x + 0.5) * TILE_SIZE_PX, (y + 0.5) * TILE_SIZE_PX, TILE_SIZE_PX * 0.13);
        }
      }
    }
  }

  public clear(): void {
    this.graphics.clear();
  }

  public destroy(): void {
    this.graphics.destroy();
  }
}
