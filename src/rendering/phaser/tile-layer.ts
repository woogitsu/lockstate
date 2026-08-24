import type Phaser from 'phaser';
import { FLOOR_DEPTH, depthForAnchor } from '../depth';
import type { RenderFrame } from '../feed/render-feed';
import { TILE_SIZE_PX, type TileRange } from '../tile-metrics';
import {
  EDGE_WALL_APPEARANCE,
  EDGE_WALL_THICKNESS_TILES,
  FLOOR_GRID_COLOR,
  OWNED_OUTLINE_COLOR,
  OWNED_OUTLINE_WIDTH,
  PLANNED_ALPHA,
  BUILDING_ALPHA,
  UNOWNED_SHADE_ALPHA,
  UNOWNED_SHADE_COLOR,
  ZONING_TINT_ALPHA,
  structureAppearance,
  terrainAppearance,
  zoningTint,
  type StructureAppearance,
} from '../world/appearance';
import { buildRowIndex, type RowContent } from '../world/row-index';
import type { StructurePhase } from '../world/structures';
import { createTileSample, type WorldRenderView } from '../world/world-view';

/**
 * Draws the tile world: ground, ownership, zoning, and everything with height.
 *
 * ### What this costs
 *
 * Two caches, both keyed by things that rarely change:
 *
 * - **Ground is painted per chunk, once.** A chunk's `Graphics` is filled when
 *   the chunk scrolls into view and then just sits there; panning and zooming
 *   move the camera, not the geometry. Chunks that scroll out go back to a
 *   pool. That is why the world's chunking (`AGENTS.md` boundary 8) is visible
 *   here rather than being flattened into one giant canvas.
 * - **Things with height are painted per world row, once.** They have to sort
 *   by row for occlusion to work (see `depth.ts`), so they cannot live in the
 *   chunk graphics; but only rows that actually contain something exist at
 *   all, and each is painted when it enters view.
 *
 * Both caches are dropped when the feed publishes a new revision -- i.e. when
 * the simulation actually changed the world, not every frame.
 *
 * Rebuilding the row index is the one piece of work a new revision pays for up
 * front, synchronously, here on the thread that draws. `buildRowIndex` reads
 * every materialised tile once and no tile that is not materialised, so that
 * cost tracks how much world exists and not how far apart its pieces sit
 * (issue #204).
 */

export class TileLayer {
  private readonly chunks = new Map<string, Phaser.GameObjects.Graphics>();
  private readonly chunkPool: Phaser.GameObjects.Graphics[] = [];
  private readonly rows = new Map<number, Phaser.GameObjects.Graphics>();
  private readonly rowPool: Phaser.GameObjects.Graphics[] = [];
  /** Reused across frames so culling allocates nothing. */
  private readonly liveChunkKeys = new Set<string>();
  private readonly liveRowKeys = new Set<number>();
  private readonly sample = createTileSample();

  private rowIndex: ReadonlyMap<number, RowContent> = new Map();
  private paintedRevision = -1;

  public constructor(private readonly scene: Phaser.Scene) {}

  public update(frame: RenderFrame, range: TileRange): void {
    if (frame.revision !== this.paintedRevision) {
      this.paintedRevision = frame.revision;
      this.rowIndex = buildRowIndex(frame.world, frame.structures);
      this.releaseAll();
    }

    this.updateChunks(frame.world, range);
    this.updateRows(range);
  }

  public get pooledObjectCount(): number {
    return this.chunks.size + this.chunkPool.length + this.rows.size + this.rowPool.length;
  }

  public destroy(): void {
    for (const graphics of this.chunks.values()) graphics.destroy();
    for (const graphics of this.rows.values()) graphics.destroy();
    for (const graphics of this.chunkPool) graphics.destroy();
    for (const graphics of this.rowPool) graphics.destroy();
    this.chunks.clear();
    this.rows.clear();
    this.chunkPool.length = 0;
    this.rowPool.length = 0;
  }

  private releaseAll(): void {
    for (const [key, graphics] of this.chunks) {
      this.chunks.delete(key);
      this.recycle(graphics, this.chunkPool);
    }
    for (const [key, graphics] of this.rows) {
      this.rows.delete(key);
      this.recycle(graphics, this.rowPool);
    }
  }

  private recycle(graphics: Phaser.GameObjects.Graphics, pool: Phaser.GameObjects.Graphics[]): void {
    graphics.clear();
    graphics.setVisible(false);
    pool.push(graphics);
  }

  private acquire(pool: Phaser.GameObjects.Graphics[], depth: number): Phaser.GameObjects.Graphics {
    const pooled = pool.pop();
    if (pooled !== undefined) {
      pooled.setVisible(true);
      pooled.setDepth(depth);
      return pooled;
    }
    return this.scene.add.graphics().setDepth(depth);
  }

  private updateChunks(world: WorldRenderView, range: TileRange): void {
    const size = world.chunkSize;
    const minChunkX = Math.floor(range.minTileX / size);
    const maxChunkX = Math.floor(range.maxTileX / size);
    const minChunkY = Math.floor(range.minTileY / size);
    const maxChunkY = Math.floor(range.maxTileY / size);

    this.liveChunkKeys.clear();
    for (let chunkY = minChunkY; chunkY <= maxChunkY; chunkY += 1) {
      for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX += 1) {
        // Unmaterialised land gets no draw calls at all; the camera's own
        // background is what "outside the world" looks like.
        if (!world.isChunkLoaded(chunkX, chunkY)) continue;
        const key = `${chunkX},${chunkY}`;
        this.liveChunkKeys.add(key);
        if (this.chunks.has(key)) continue;

        const graphics = this.acquire(this.chunkPool, FLOOR_DEPTH);
        graphics.setPosition(chunkX * size * TILE_SIZE_PX, chunkY * size * TILE_SIZE_PX);
        this.paintChunk(graphics, world, chunkX, chunkY);
        this.chunks.set(key, graphics);
      }
    }

    for (const [key, graphics] of this.chunks) {
      if (this.liveChunkKeys.has(key)) continue;
      this.chunks.delete(key);
      this.recycle(graphics, this.chunkPool);
    }
  }

  private paintChunk(
    graphics: Phaser.GameObjects.Graphics,
    world: WorldRenderView,
    chunkX: number,
    chunkY: number,
  ): void {
    const size = world.chunkSize;
    const originTileX = chunkX * size;
    const originTileY = chunkY * size;
    const sample = this.sample;

    graphics.clear();

    for (let localY = 0; localY < size; localY += 1) {
      const tileY = originTileY + localY;

      // Ground, merged into runs of equal colour so a 32x32 chunk costs far
      // fewer fills than it has tiles.
      let runStart = 0;
      let runFill = -1;
      for (let localX = 0; localX <= size; localX += 1) {
        let fill = -1;
        if (localX < size) {
          world.readTile(originTileX + localX, tileY, sample);
          const appearance = terrainAppearance(sample.terrainNumericId);
          fill = ((originTileX + localX + tileY) & 1) === 0 ? appearance.fill : appearance.fillAlternate;
        }
        if (fill === runFill) continue;
        if (runFill >= 0) {
          graphics.fillStyle(runFill, 1);
          graphics.fillRect(runStart * TILE_SIZE_PX, localY * TILE_SIZE_PX, (localX - runStart) * TILE_SIZE_PX, TILE_SIZE_PX);
        }
        runStart = localX;
        runFill = fill;
      }

      // Zoning and ownership are per tile and sparse, so they are drawn as
      // they are found rather than merged.
      for (let localX = 0; localX < size; localX += 1) {
        const tileX = originTileX + localX;
        world.readTile(tileX, tileY, sample);

        const tint = zoningTint(sample.zoning);
        if (tint !== undefined) {
          graphics.fillStyle(tint, ZONING_TINT_ALPHA);
          graphics.fillRect(localX * TILE_SIZE_PX, localY * TILE_SIZE_PX, TILE_SIZE_PX, TILE_SIZE_PX);
        }

        if (!sample.owned) {
          graphics.fillStyle(UNOWNED_SHADE_COLOR, UNOWNED_SHADE_ALPHA);
          graphics.fillRect(localX * TILE_SIZE_PX, localY * TILE_SIZE_PX, TILE_SIZE_PX, TILE_SIZE_PX);
          continue;
        }

        // Boundary of owned land, drawn edge by edge against unowned
        // neighbours. Neighbour lookups cross chunk borders because the view
        // is world-wide, so the outline never breaks at a chunk seam.
        graphics.lineStyle(OWNED_OUTLINE_WIDTH, OWNED_OUTLINE_COLOR, 0.9);
        const left = localX * TILE_SIZE_PX;
        const top = localY * TILE_SIZE_PX;
        const inset = OWNED_OUTLINE_WIDTH / 2;
        const right = left + TILE_SIZE_PX;
        const bottom = top + TILE_SIZE_PX;
        if (!world.isTileOwned(tileX, tileY - 1)) graphics.lineBetween(left, top + inset, right, top + inset);
        if (!world.isTileOwned(tileX, tileY + 1)) graphics.lineBetween(left, bottom - inset, right, bottom - inset);
        if (!world.isTileOwned(tileX - 1, tileY)) graphics.lineBetween(left + inset, top, left + inset, bottom);
        if (!world.isTileOwned(tileX + 1, tileY)) graphics.lineBetween(right - inset, top, right - inset, bottom);
      }
    }

    // Tile grid last, so it reads over the ground rather than under the
    // ownership shading.
    graphics.lineStyle(1, FLOOR_GRID_COLOR, 0.5);
    for (let line = 0; line <= size; line += 1) {
      const offset = line * TILE_SIZE_PX;
      graphics.lineBetween(offset, 0, offset, size * TILE_SIZE_PX);
      graphics.lineBetween(0, offset, size * TILE_SIZE_PX, offset);
    }
  }

  private updateRows(range: TileRange): void {
    this.liveRowKeys.clear();
    for (let tileY = range.minTileY; tileY <= range.maxTileY; tileY += 1) {
      const content = this.rowIndex.get(tileY);
      if (content === undefined) continue;
      this.liveRowKeys.add(tileY);
      if (this.rows.has(tileY)) continue;

      // Everything on a row shares one depth: the row's southern edge.
      const graphics = this.acquire(this.rowPool, depthForAnchor((tileY + 1) * TILE_SIZE_PX, 'structure'));
      graphics.setPosition(0, 0);
      this.paintRow(graphics, content);
      this.rows.set(tileY, graphics);
    }

    for (const [tileY, graphics] of this.rows) {
      if (this.liveRowKeys.has(tileY)) continue;
      this.rows.delete(tileY);
      this.recycle(graphics, this.rowPool);
    }
  }

  private paintRow(graphics: Phaser.GameObjects.Graphics, content: RowContent): void {
    graphics.clear();

    for (const edge of content.edges) {
      const left = edge.tileX * TILE_SIZE_PX;
      const top = content.tileY * TILE_SIZE_PX;
      const thickness = EDGE_WALL_THICKNESS_TILES * TILE_SIZE_PX;
      if (edge.top !== 0) {
        this.paintSlab(graphics, left, top, TILE_SIZE_PX, thickness, EDGE_WALL_APPEARANCE, 1);
      }
      if (edge.left !== 0) {
        this.paintSlab(graphics, left, top, thickness, TILE_SIZE_PX, EDGE_WALL_APPEARANCE, 1);
      }
    }

    for (const structure of content.structures) {
      const appearance = structureAppearance(structure.definitionId);
      this.paintSlab(
        graphics,
        structure.tileX * TILE_SIZE_PX,
        structure.tileY * TILE_SIZE_PX,
        appearance.footprintTiles.width * TILE_SIZE_PX,
        appearance.footprintTiles.height * TILE_SIZE_PX,
        appearance,
        alphaFor(structure.phase),
      );
    }
  }

  /**
   * A box seen from above and slightly in front: a side face rising from the
   * footprint's southern edge, with the top face above it. This is what gives
   * walls and objects visible sides, and what makes row-based depth sorting
   * mean something.
   */
  private paintSlab(
    graphics: Phaser.GameObjects.Graphics,
    left: number,
    top: number,
    width: number,
    depth: number,
    appearance: StructureAppearance,
    alpha: number,
  ): void {
    const height = appearance.heightTiles * TILE_SIZE_PX;

    graphics.fillStyle(appearance.sideFill, alpha);
    graphics.fillRect(left, top + depth - height, width, height);

    graphics.fillStyle(appearance.topFill, alpha);
    graphics.fillRect(left, top - height, width, depth);

    graphics.lineStyle(1, appearance.outline, alpha);
    graphics.strokeRect(left, top - height, width, depth);
    graphics.strokeRect(left, top + depth - height, width, height);
  }
}

function alphaFor(phase: StructurePhase): number {
  switch (phase) {
    case 'planned':
      return PLANNED_ALPHA;
    case 'building':
      return BUILDING_ALPHA;
    default:
      return 1;
  }
}
