import type Phaser from 'phaser';
import type { EnvironmentSpriteId } from '../assets/environment-sprites';
import { FLOOR_ART_DEPTH, FLOOR_DEPTH, depthForAnchor } from '../depth';
import type { RenderFrame } from '../feed/render-feed';
import { TILE_SIZE_PX, type TileRange } from '../tile-metrics';
import {
  EDGE_WALL_THICKNESS_TILES,
  FLOOR_GRID_COLOR,
  OWNED_OUTLINE_COLOR,
  OWNED_OUTLINE_WIDTH,
  PLANNED_ALPHA,
  BUILDING_ALPHA,
  UNOWNED_SHADE_ALPHA,
  UNOWNED_SHADE_COLOR,
  ZONING_TINT_ALPHA,
  ZONING_TINT_ALPHA_OVER_ART,
  edgeAppearance,
  structureAppearance,
  terrainAppearance,
  zoningTint,
  type StructureAppearance,
} from '../world/appearance';
import { edgeArt, objectSprite, zonedFloorSprite } from '../world/environment-art';
import { buildRowIndex, type RowContent } from '../world/row-index';
import { slabFaces, type Rect } from '../world/structure-geometry';
import { catalogueObjectId, isDrawnAsWorldEdge, type StructurePhase } from '../world/structures';
import { mergeFloorRects, mergeTopEdgeRuns } from '../world/tile-art-runs';
import { createTileSample, type WorldRenderView } from '../world/world-view';
import type { EnvironmentTextureSet } from './environment-textures';

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
 *
 * ### What art added, and what it deliberately did not
 *
 * A cached unit is now a `Graphics` **plus a short list of pooled
 * `TileSprite`s**, and the sprites are created and released on exactly the same
 * events the `Graphics` is: a chunk or row entering view, and a new revision.
 * Panning still repaints nothing.
 *
 * The counts are bounded by *runs*, not by tiles. `mergeFloorRects` collapses a
 * chunk's floor art into greedy rectangles -- a zoned room is one sprite, not
 * one per tile -- and `mergeTopEdgeRuns` collapses a row's north wall into one
 * sprite per unbroken run. A sprite-per-tile rewrite would have put a thousand
 * objects in a chunk and thrown the cache away; this keeps both.
 *
 * **A catalogued object with artwork is the one thing here counted per *thing*
 * rather than per run,** and it is bounded by a different quantity: there is
 * one sprite per structure the row index holds, and the row index holds build
 * orders, of which a prison has as many as the player placed. Nothing merges
 * two beds, because two beds standing side by side are two beds -- the merging
 * above exists for surfaces whose repeats are indistinguishable, which is the
 * property a piece of furniture does not have.
 *
 * With no art loaded, every path below falls through to the coloured blocks the
 * layer has always drawn. That is not a degraded mode bolted on: it is the
 * declared fallback (`environment-art.ts`), it is what the first seconds of
 * every session look like while the sheets are in flight, and
 * `docs/RENDERING.md` states the rule it serves -- art failing to load leaves a
 * playable, legible tile world.
 */

interface ChunkVisual {
  readonly graphics: Phaser.GameObjects.Graphics;
  readonly sprites: Phaser.GameObjects.TileSprite[];
}

interface RowVisual {
  readonly graphics: Phaser.GameObjects.Graphics;
  readonly sprites: Phaser.GameObjects.TileSprite[];
}

export class TileLayer {
  private readonly chunks = new Map<string, ChunkVisual>();
  private readonly chunkPool: Phaser.GameObjects.Graphics[] = [];
  private readonly rows = new Map<number, RowVisual>();
  private readonly rowPool: Phaser.GameObjects.Graphics[] = [];
  private readonly spritePool: Phaser.GameObjects.TileSprite[] = [];
  /** Reused across frames so culling allocates nothing. */
  private readonly liveChunkKeys = new Set<string>();
  private readonly liveRowKeys = new Set<number>();
  private readonly sample = createTileSample();
  /** One chunk's worth of floor decisions, reused between chunk paints. */
  private floorScratch: (EnvironmentSpriteId | undefined)[] = [];

  private art: EnvironmentTextureSet | undefined;
  private rowIndex: ReadonlyMap<number, RowContent> = new Map();
  private paintedRevision = -1;

  public constructor(private readonly scene: Phaser.Scene) {}

  /** What the world is currently drawn with, or `undefined` while it is drawn as blocks. */
  public get environmentArt(): EnvironmentTextureSet | undefined {
    return this.art;
  }

  /**
   * Hands the layer its artwork, or takes it away.
   *
   * Everything already painted is dropped, because every cached unit was
   * painted under the old answer to "is there art?". The scene calls this once,
   * after the sheets have been fetched and packed -- so the first frames of a
   * session are drawn as blocks and then repainted once, rather than the boot
   * waiting on a download.
   */
  public setEnvironmentArt(art: EnvironmentTextureSet | undefined): void {
    if (this.art === art) return;
    this.art = art;
    this.releaseAll();
    // Forces the next `update` through the full rebuild, including the row
    // index, rather than leaving the caches empty and the revision "painted".
    this.paintedRevision = -1;
  }

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
    let live = this.chunks.size + this.rows.size;
    for (const visual of this.chunks.values()) live += visual.sprites.length;
    for (const visual of this.rows.values()) live += visual.sprites.length;
    return live + this.chunkPool.length + this.rowPool.length + this.spritePool.length;
  }

  public destroy(): void {
    for (const visual of this.chunks.values()) this.destroyVisual(visual);
    for (const visual of this.rows.values()) this.destroyVisual(visual);
    for (const graphics of this.chunkPool) graphics.destroy();
    for (const graphics of this.rowPool) graphics.destroy();
    for (const sprite of this.spritePool) sprite.destroy();
    this.chunks.clear();
    this.rows.clear();
    this.chunkPool.length = 0;
    this.rowPool.length = 0;
    this.spritePool.length = 0;
  }

  private destroyVisual(visual: ChunkVisual | RowVisual): void {
    visual.graphics.destroy();
    for (const sprite of visual.sprites) sprite.destroy();
  }

  private releaseAll(): void {
    for (const [key, visual] of this.chunks) {
      this.chunks.delete(key);
      this.recycle(visual, this.chunkPool);
    }
    for (const [key, visual] of this.rows) {
      this.rows.delete(key);
      this.recycle(visual, this.rowPool);
    }
  }

  private recycle(visual: ChunkVisual | RowVisual, pool: Phaser.GameObjects.Graphics[]): void {
    visual.graphics.clear();
    visual.graphics.setVisible(false);
    pool.push(visual.graphics);
    for (const sprite of visual.sprites) {
      sprite.setVisible(false);
      this.spritePool.push(sprite);
    }
    visual.sprites.length = 0;
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

  /**
   * A tiling sprite covering `rect`.
   *
   * `repeatXPx` and `repeatYPx` say how far apart the frame repeats on each
   * axis; `undefined` means "fill this extent exactly once". The two axes are
   * given separately, rather than kept to one uniform scale, because the two
   * things the sprite has to be true of pull in different directions: a frame
   * must repeat on exact tile boundaries so a floor's joints and a wall's panel
   * lines land on the grid the player builds on, and it must exactly fill the
   * block it replaced so the art and the coloured wall are the same size. Three
   * percent of aspect distortion is the price, and it is invisible next to a
   * joint that drifts across the grid.
   *
   * The extent is rounded to whole pixels first. `TileSprite`'s constructor
   * takes integers and its `setSize` does not, so a fresh sprite and a pooled
   * one handed the same fractional height would end up different sizes -- and
   * one of these is fractional: `EDGE_WALL_THICKNESS_TILES` is 0.22 of a
   * 64-pixel tile, which is 14.08. Rounding here, and deriving the scale from
   * the rounded number, is what keeps the two paths identical.
   *
   * **`alpha` is applied on every path, including the ones that always pass 1,
   * and that is not defensiveness.** These sprites are pooled: a planned
   * object's ghost at `PLANNED_ALPHA` goes back into `spritePool` still
   * carrying it, and the next caller to take it might be a floor. Setting it
   * only where it is not 1 would make a room's floor draw at 40% opacity
   * depending on what the player had queued and how the camera happened to
   * pan, which is a defect that would reproduce rarely and look like anything
   * but its cause.
   */
  private acquireSprite(
    depth: number,
    rect: Rect,
    spriteId: EnvironmentSpriteId,
    repeatXPx: number | undefined,
    repeatYPx: number | undefined,
    alpha = 1,
  ): Phaser.GameObjects.TileSprite | undefined {
    const art = this.art;
    if (art === undefined) return undefined;
    const frameName = art.frameName(spriteId);
    const size = art.frameSize(spriteId);
    if (frameName === undefined || size === undefined) return undefined;

    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    const pooled = this.spritePool.pop();
    const sprite =
      pooled ?? this.scene.add.tileSprite(rect.x, rect.y, width, height, art.textureKey, frameName).setOrigin(0, 0);
    if (pooled !== undefined) {
      pooled.setTexture(art.textureKey, frameName);
      pooled.setPosition(rect.x, rect.y);
      pooled.setSize(width, height);
      pooled.setVisible(true);
    }
    sprite.setTileScale((repeatXPx ?? width) / size.width, (repeatYPx ?? height) / size.height);
    sprite.setDepth(depth);
    sprite.setAlpha(alpha);
    return sprite;
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
        const visual: ChunkVisual = { graphics, sprites: [] };
        this.paintChunk(visual, world, chunkX, chunkY);
        this.chunks.set(key, visual);
      }
    }

    for (const [key, visual] of this.chunks) {
      if (this.liveChunkKeys.has(key)) continue;
      this.chunks.delete(key);
      this.recycle(visual, this.chunkPool);
    }
  }

  private paintChunk(visual: ChunkVisual, world: WorldRenderView, chunkX: number, chunkY: number): void {
    const size = world.chunkSize;
    const originTileX = chunkX * size;
    const originTileY = chunkY * size;
    const sample = this.sample;
    const graphics = visual.graphics;

    const art = this.art;
    // One entry per tile, reused between chunk paints for the reason
    // `TileSample` exists: a chunk is a thousand tiles and this runs on the
    // thread that draws.
    const needed = size * size;
    if (this.floorScratch.length !== needed) this.floorScratch = new Array<EnvironmentSpriteId | undefined>(needed);
    const floors = this.floorScratch;
    let hasFloorArt = false;

    graphics.clear();

    for (let localY = 0; localY < size; localY += 1) {
      const tileY = originTileY + localY;

      // Ground, merged into runs of equal colour so a 32x32 chunk costs far
      // fewer fills than it has tiles. A tile the floor art covers takes no
      // fill at all: the sprite under this `Graphics` is opaque and painting
      // a colour over it would hide the art.
      let runStart = 0;
      let runFill = -1;
      for (let localX = 0; localX <= size; localX += 1) {
        let fill = -1;
        if (localX < size) {
          world.readTile(originTileX + localX, tileY, sample);
          // Decided here rather than in a pass of its own, because this loop
          // already reads every tile. A separate pass measured 73-79 us per
          // 32x32 chunk, which is the same order as the whole revision cost
          // `buildRowIndex` pays for that chunk.
          const candidate = art === undefined ? undefined : zonedFloorSprite(sample.zoning);
          const sprite = candidate !== undefined && art?.has(candidate) === true ? candidate : undefined;
          floors[localY * size + localX] = sprite;
          if (sprite !== undefined) {
            hasFloorArt = true;
          } else {
            const appearance = terrainAppearance(sample.terrainNumericId);
            fill = ((originTileX + localX + tileY) & 1) === 0 ? appearance.fill : appearance.fillAlternate;
          }
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
          // Weaker over art. The tint is what says *which* room this is, and
          // that has to survive; at its full strength it also washes the floor
          // out until the texture underneath stops reading as a floor.
          const alpha = floors[localY * size + localX] === undefined ? ZONING_TINT_ALPHA : ZONING_TINT_ALPHA_OVER_ART;
          graphics.fillStyle(tint, alpha);
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

    if (!hasFloorArt) return;

    for (const rect of mergeFloorRects(size, (localX, localY) => floors[localY * size + localX])) {
      const sprite = this.acquireSprite(
        FLOOR_ART_DEPTH,
        {
          x: (originTileX + rect.localX) * TILE_SIZE_PX,
          y: (originTileY + rect.localY) * TILE_SIZE_PX,
          width: rect.widthTiles * TILE_SIZE_PX,
          height: rect.heightTiles * TILE_SIZE_PX,
        },
        rect.spriteId,
        TILE_SIZE_PX,
        TILE_SIZE_PX,
      );
      if (sprite !== undefined) visual.sprites.push(sprite);
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
      const depth = depthForAnchor((tileY + 1) * TILE_SIZE_PX, 'structure');
      const graphics = this.acquire(this.rowPool, depth);
      graphics.setPosition(0, 0);
      const visual: RowVisual = { graphics, sprites: [] };
      this.paintRow(visual, content, depth);
      this.rows.set(tileY, visual);
    }

    for (const [tileY, visual] of this.rows) {
      if (this.liveRowKeys.has(tileY)) continue;
      this.rows.delete(tileY);
      this.recycle(visual, this.rowPool);
    }
  }

  /**
   * `depth` is passed rather than recomputed, and the sprites share it with the
   * row's `Graphics` on purpose. Phaser sorts the display list stably, and the
   * `Graphics` is acquired first, so a wall's art draws over the coloured block
   * of anything else on the same row -- which is what a wall should do.
   */
  private paintRow(visual: RowVisual, content: RowContent, depth: number): void {
    const graphics = visual.graphics;
    graphics.clear();

    const thickness = EDGE_WALL_THICKNESS_TILES * TILE_SIZE_PX;
    const top = content.tileY * TILE_SIZE_PX;
    const edgeTileXs = new Set<number>();
    for (const edge of content.edges) edgeTileXs.add(edge.tileX);

    // North edges, merged into runs. A run is one sprite; a run with no art is
    // still painted tile by tile, so the blocks are exactly what they were.
    for (const run of mergeTopEdgeRuns(content.edges)) {
      const appearance = edgeAppearance(run.value);
      const height = appearance.heightTiles * TILE_SIZE_PX;
      const left = run.startTileX * TILE_SIZE_PX;
      const sprite = this.acquireEdgeSprite(
        depth,
        run.value,
        'face',
        slabFaces(left, top, run.lengthTiles * TILE_SIZE_PX, thickness, height).bounds,
        TILE_SIZE_PX,
      );
      if (sprite !== undefined) {
        visual.sprites.push(sprite);
        continue;
      }
      for (let index = 0; index < run.lengthTiles; index += 1) {
        this.paintSlab(graphics, left + index * TILE_SIZE_PX, top, TILE_SIZE_PX, thickness, appearance, 1);
      }
    }

    // West edges, one at a time. Two of them on neighbouring tiles are two
    // bars a tile apart, not one longer bar, so there is nothing to merge.
    for (const edge of content.edges) {
      if (edge.left === 0) continue;
      const appearance = edgeAppearance(edge.left);
      const height = appearance.heightTiles * TILE_SIZE_PX;
      const left = edge.tileX * TILE_SIZE_PX;
      const sprite = this.acquireEdgeSprite(
        depth,
        edge.left,
        'cap',
        slabFaces(left, top, thickness, TILE_SIZE_PX, height).bounds,
        TILE_SIZE_PX,
      );
      if (sprite !== undefined) {
        visual.sprites.push(sprite);
        continue;
      }
      this.paintSlab(graphics, left, top, thickness, TILE_SIZE_PX, appearance, 1);
    }

    for (const structure of content.structures) {
      // A finished wall or door is already on screen: the world's edge layers
      // carry it and the loop above drew it. Its build order is still in the
      // construction snapshot, and drawing that too puts a full-tile block
      // under a wall that is a fifth of a tile deep. Guarded on the row really
      // having an edge on that tile, so a save that predates #74 -- completed
      // orders, no edge values -- still gets its walls.
      if (isDrawnAsWorldEdge(structure) && edgeTileXs.has(structure.tileX)) continue;
      const appearance = structureAppearance(structure.definitionId);
      const alpha = alphaFor(structure.phase);
      const footprint: Rect = {
        x: structure.tileX * TILE_SIZE_PX,
        y: structure.tileY * TILE_SIZE_PX,
        width: appearance.footprintTiles.width * TILE_SIZE_PX,
        height: appearance.footprintTiles.height * TILE_SIZE_PX,
      };
      const sprite = this.acquireObjectSprite(depth, structure.definitionId, footprint, alpha);
      if (sprite !== undefined) {
        visual.sprites.push(sprite);
        continue;
      }
      this.paintSlab(graphics, footprint.x, footprint.y, footprint.width, footprint.height, appearance, alpha);
    }
  }

  /**
   * The sprite for one built or planned object, or `undefined` when this
   * structure has no artwork or no art is loaded -- in which case the caller
   * paints the coloured slab instead.
   *
   * ### Why this covers the footprint and not the slab's `bounds`
   *
   * `acquireEdgeSprite` hands `slabFaces(...).bounds` to its sprite so that a
   * wall's art and the coloured wall it replaces are the same size, and this
   * deliberately does something else: it covers exactly the tiles the
   * simulation reserved. The difference is the slab's fake height. A slab
   * fakes elevation by lifting its top face north by `heightTiles` and filling
   * the gap with a side face, and `bounds` is the union of the two -- so for
   * `object.bed` it is 2.4 tiles tall for a 1x2 object. The object sheets are
   * photographs taken from directly above; there is no elevation in them to
   * line up with that lift, and a frame stretched over `bounds` would put a
   * fifth of the bed on the tile to its north, over whatever is standing
   * there. This is the question `environment-art.ts` recorded as having no
   * answer in any ADR -- *"an object is drawn today as a two-faced slab, a
   * sprite is one flat frame, and which of those a bed is has no answer"* --
   * and the answer is that a top-down object sprite is flat and occupies its
   * footprint, because that is the rectangle the player was told it takes.
   *
   * ### Why the frame fills rather than repeats
   *
   * Both repeat arguments are `undefined`, which `acquireSprite` reads as
   * "fill this extent exactly once". A floor and a wall repeat because they
   * are surfaces of indefinite extent cut to a run; an object is one thing of
   * a known size, and repeating it would draw two half beds.
   */
  private acquireObjectSprite(
    depth: number,
    definitionId: string,
    footprint: Rect,
    alpha: number,
  ): Phaser.GameObjects.TileSprite | undefined {
    if (this.art === undefined) return undefined;
    const objectId = catalogueObjectId(definitionId);
    if (objectId === undefined) return undefined;
    const spriteId = objectSprite(objectId);
    if (spriteId === undefined) return undefined;
    return this.acquireSprite(depth, footprint, spriteId, undefined, undefined, alpha);
  }

  /**
   * The sprite for one edge, or `undefined` when this edge value has no art or
   * no art is loaded -- in which case the caller paints blocks instead.
   *
   * A face repeats along the wall every tile; a cap repeats down it every tile.
   * The other axis fills the block exactly once, which is what makes the art
   * and the block interchangeable.
   */
  private acquireEdgeSprite(
    depth: number,
    edgeValue: number,
    orientation: 'face' | 'cap',
    bounds: Rect,
    repeatPx: number,
  ): Phaser.GameObjects.TileSprite | undefined {
    const art = this.art;
    if (art === undefined) return undefined;
    const spriteId = edgeArt(edgeValue)?.[orientation];
    if (spriteId === undefined) return undefined;
    return orientation === 'face'
      ? this.acquireSprite(depth, bounds, spriteId, repeatPx, undefined)
      : this.acquireSprite(depth, bounds, spriteId, undefined, repeatPx);
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
    const faces = slabFaces(left, top, width, depth, appearance.heightTiles * TILE_SIZE_PX);

    graphics.fillStyle(appearance.sideFill, alpha);
    graphics.fillRect(faces.side.x, faces.side.y, faces.side.width, faces.side.height);

    graphics.fillStyle(appearance.topFill, alpha);
    graphics.fillRect(faces.top.x, faces.top.y, faces.top.width, faces.top.height);

    graphics.lineStyle(1, appearance.outline, alpha);
    graphics.strokeRect(faces.top.x, faces.top.y, faces.top.width, faces.top.height);
    graphics.strokeRect(faces.side.x, faces.side.y, faces.side.width, faces.side.height);
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
