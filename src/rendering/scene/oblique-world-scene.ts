import Phaser from 'phaser';
import type { RenderActor, RenderFeed, RenderFrame } from '../feed/render-feed';
import { TILE_SIZE_PX, worldToTile } from '../tile-metrics';
import { VOID_COLOR, ZONING_TINT_ALPHA, UNOWNED_SHADE_ALPHA, UNOWNED_SHADE_COLOR } from '../world/appearance';
import {
  changeObliquePoseAtScreenPoint,
  screenToGround,
  type ObliqueCameraState,
} from '../camera/oblique-projection';
import { projectedTileQuad, type TileQuad } from '../camera/oblique-geometry';
import { projectObliqueActors, projectObliqueWorldFrame, sortObliqueRaised, type ObliqueActorPoint, type ObliqueSolid, type ObliqueWorldProjection } from '../camera/oblique-world-projection';
import type { Point } from '../camera/coordinates';
import type { ObliqueModuleCatalog } from '../assets/oblique-module-catalog';
import { selectObliqueModuleFrame } from '../assets/oblique-module-catalog';
import { registerObliqueModuleTextures } from '../phaser/oblique-module-textures';

export interface ObliqueWorldSceneOptions {
  readonly feed: RenderFeed;
  readonly onTileSelected?: (tileX: number, tileY: number) => void;
  readonly obliqueCatalogs?: ReadonlyMap<string, ObliqueModuleCatalog>;
}

/**
 * A second, presentation-only Phaser scene for the angled renderer migration.
 * It reads the same immutable RenderFeed as WorldScene. Main.ts does not start
 * it yet: furniture art, build ghosts and measured repaint cost must join this
 * scene before players can switch to it.
 */
export class ObliqueWorldScene extends Phaser.Scene {
  private readonly feed: RenderFeed;
  private readonly onTileSelected: ((tileX: number, tileY: number) => void) | undefined;
  private groundGraphics!: Phaser.GameObjects.Graphics;
  private selectionGraphics!: Phaser.GameObjects.Graphics;
  private raisedGraphics!: Phaser.GameObjects.Graphics;
  private pose!: ObliqueCameraState;
  private framedWorld = false;
  private selected: { tileX: number; tileY: number } | undefined;
  private turnPointerId: number | undefined;
  private turnPointerAt: Point | undefined;
  private lastFrame: RenderFrame | undefined;
  private lastProjection: ObliqueWorldProjection | undefined;
  private lastPaintedRevision = -1;
  private poseRevision = 0;
  private lastPaintedPoseRevision = -1;
  private actorPositions: { id: number; tileX: number; tileY: number }[] = [];
  private groundPaints = 0;
  private raisedPaints = 0;
  private readonly obliqueCatalogs: ReadonlyMap<string, ObliqueModuleCatalog>;
  private readonly furnitureSprites = new Map<string, Phaser.GameObjects.Image>();
  private texturesReady: Promise<void> = Promise.resolve();

  public constructor(options: ObliqueWorldSceneOptions) {
    super({ key: 'oblique-world' });
    this.feed = options.feed;
    this.onTileSelected = options.onTileSelected;
    this.obliqueCatalogs = options.obliqueCatalogs ?? new Map();
  }

  public create(): void {
    this.cameras.main.setBackgroundColor(VOID_COLOR);
    this.groundGraphics = this.add.graphics().setScrollFactor(0).setDepth(0);
    this.selectionGraphics = this.add.graphics().setScrollFactor(0).setDepth(0.5);
    this.raisedGraphics = this.add.graphics().setScrollFactor(0).setDepth(1);
    this.pose = {
      target: { x: 0, y: 0 },
      viewport: { width: this.cameras.main.width, height: this.cameras.main.height },
      zoom: 1.25,
      yawRadians: -Math.PI / 4,
      elevationRadians: Math.PI / 4,
    };
    this.input.mouse?.disableContextMenu();
    this.texturesReady = registerObliqueModuleTextures(this, this.obliqueCatalogs).then(() => { this.repaint(); });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 2 && !pointer.wasTouch) {
        this.turnPointerId = pointer.id;
        this.turnPointerAt = { x: pointer.x, y: pointer.y };
        return;
      }
      if (pointer.button !== 0) return;
      const world = screenToGround({ x: pointer.x, y: pointer.y }, this.pose);
      const tileX = worldToTile(world.x);
      const tileY = worldToTile(world.y);
      this.selected = { tileX, tileY };
      this.onTileSelected?.(tileX, tileY);
      this.paintSelection();
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.id !== this.turnPointerId || this.turnPointerAt === undefined) return;
      const dx = pointer.x - this.turnPointerAt.x;
      const dy = pointer.y - this.turnPointerAt.y;
      this.turnPointerAt = { x: pointer.x, y: pointer.y };
      this.setPoseRadians(
        this.pose.yawRadians + dx * 0.005,
        this.pose.elevationRadians - dy * 0.005,
        { x: pointer.x, y: pointer.y },
      );
    });
    const stopTurn = (pointer: Phaser.Input.Pointer): void => {
      if (pointer.id !== this.turnPointerId) return;
      this.turnPointerId = undefined;
      this.turnPointerAt = undefined;
    };
    this.input.on('pointerup', stopTurn);
    this.input.on('pointerupoutside', stopTurn);
  }

  public get cameraPose(): ObliqueCameraState { return this.pose; }
  public ready(): Promise<void> { return this.texturesReady; }
  public furnitureSpriteFrame(id: string): string | undefined { return this.furnitureSprites.get(id)?.texture.key; }
  public get selectedTile(): { readonly tileX: number; readonly tileY: number } | undefined { return this.selected; }
  public get paintCounts(): { readonly ground: number; readonly raised: number } {
    return { ground: this.groundPaints, raised: this.raisedPaints };
  }

  /** Shared entry point for mouse drag, remappable keyboard actions and HUD buttons. */
  public setPoseRadians(yawRadians: number, elevationRadians: number, pivot?: Point): void {
    const elevation = Math.min(80 * Math.PI / 180, Math.max(20 * Math.PI / 180, elevationRadians));
    const screen = pivot ?? { x: this.pose.viewport.width / 2, y: this.pose.viewport.height / 2 };
    this.pose = changeObliquePoseAtScreenPoint(this.pose, screen, yawRadians, elevation);
    this.poseRevision += 1;
    this.repaint();
  }

  public override update(time: number): void {
    const viewport = { width: this.cameras.main.width, height: this.cameras.main.height };
    if (viewport.width !== this.pose.viewport.width || viewport.height !== this.pose.viewport.height) {
      this.pose = { ...this.pose, viewport };
      this.poseRevision += 1;
    }
    const frame = this.feed.readFrame(time / 1000);
    if (!this.framedWorld && frame.world.loadedBounds !== undefined) {
      const bounds = frame.world.loadedBounds;
      this.pose = {
        ...this.pose,
        target: {
          x: (bounds.minTileX + bounds.maxTileX + 1) * TILE_SIZE_PX / 2,
          y: (bounds.minTileY + bounds.maxTileY + 1) * TILE_SIZE_PX / 2,
        },
      };
      this.framedWorld = true;
      this.poseRevision += 1;
    }
    this.lastFrame = frame;
    this.repaint();
  }

  private fillQuad(graphics: Phaser.GameObjects.Graphics, quad: TileQuad, color: number, alpha = 1): void {
    graphics.fillStyle(color, alpha);
    graphics.beginPath();
    graphics.moveTo(quad[0].x, quad[0].y);
    for (let index = 1; index < 4; index += 1) graphics.lineTo(quad[index]!.x, quad[index]!.y);
    graphics.closePath();
    graphics.fillPath();
  }

  private paintGround(projection: ObliqueWorldProjection): void {
    const ground = this.groundGraphics;
    ground.clear();
    this.groundPaints += 1;
    for (const tile of projection.ground) {
      this.fillQuad(ground, tile.quad, tile.fill);
      if (tile.zoningTint !== undefined) this.fillQuad(ground, tile.quad, tile.zoningTint, ZONING_TINT_ALPHA);
      if (!tile.owned) this.fillQuad(ground, tile.quad, UNOWNED_SHADE_COLOR, UNOWNED_SHADE_ALPHA);
      ground.lineStyle(1, 0x26323b, 0.45);
      for (let side = 0; side < 4; side += 1) {
        const next = (side + 1) % 4;
        ground.lineBetween(tile.quad[side]!.x, tile.quad[side]!.y, tile.quad[next]!.x, tile.quad[next]!.y);
      }
    }
  }

  private paintSelection(): void {
    this.selectionGraphics.clear();
    if (this.selected === undefined) return;
    this.fillQuad(this.selectionGraphics, projectedTileQuad(this.selected.tileX, this.selected.tileY, this.pose), 0xe1bb57, 0.8);
  }

  private paintRaised(projection: ObliqueWorldProjection): void {
    const raised = this.raisedGraphics;
    raised.clear();
    this.raisedPaints += 1;
    const seenFurniture = new Set<string>();
    for (const item of projection.raised) {
      if (item.kind === 'actor') {
        raised.lineStyle(13 * this.pose.zoom, 0xdd8342, 1);
        raised.lineBetween(item.head.x, item.head.y + 8 * this.pose.zoom, item.foot.x, item.foot.y);
        raised.fillStyle(0xffbd78, 1);
        raised.fillCircle(item.head.x, item.head.y, 8 * this.pose.zoom);
        continue;
      }
      for (let side = 0; side < 4; side += 1) {
        const next = (side + 1) % 4;
        this.fillQuad(raised, [item.footprint[side]!, item.footprint[next]!, item.top[next]!, item.top[side]!], item.sideFill, item.alpha);
      }
      if (item.kind === 'structure' && item.assetId !== undefined) {
        seenFurniture.add(item.id);
        const catalog = this.obliqueCatalogs.get(item.assetId);
        if (catalog !== undefined) {
          const frame = selectObliqueModuleFrame(catalog, this.pose);
          let sprite = this.furnitureSprites.get(item.id);
          if (sprite === undefined && this.textures.exists(frame.image)) {
            sprite = this.add.image(item.footprint[0]!.x, item.footprint[0]!.y, frame.image);
            this.furnitureSprites.set(item.id, sprite);
          }
          if (sprite !== undefined) {
            sprite.setTexture(frame.image).setDepth(item.viewDepth).setVisible(true);
            sprite.setPosition(item.footprint[0]!.x, item.footprint[0]!.y);
            sprite.setOrigin(catalog.pivotPx[0] / Math.max(1, catalog.resolutionPx[0]), catalog.pivotPx[1] / Math.max(1, catalog.resolutionPx[1]));
            sprite.setScale((catalog.nominalPixelsPerTile * 1) / Math.max(1, catalog.resolutionPx[0]));
          }
        }
      }
    for (const [id, sprite] of this.furnitureSprites) {
      if (!seenFurniture.has(id)) sprite.setVisible(false);
    }
      this.fillQuad(raised, item.top, item.topFill, item.alpha);
    }
  }

  private actorsMoved(actors: readonly RenderActor[]): boolean {
    if (actors.length !== this.actorPositions.length) return true;
    for (let index = 0; index < actors.length; index += 1) {
      const actor = actors[index]!;
      const last = this.actorPositions[index]!;
      if (actor.id !== last.id || actor.tileX !== last.tileX || actor.tileY !== last.tileY) return true;
    }
    return false;
  }

  private rememberActors(actors: readonly RenderActor[]): void {
    this.actorPositions = actors.map(({ id, tileX, tileY }) => ({ id, tileX, tileY }));
  }

  private repaint(): void {
    const frame = this.lastFrame;
    if (frame === undefined) return;
    if (this.lastProjection === undefined || frame.revision !== this.lastPaintedRevision || this.poseRevision !== this.lastPaintedPoseRevision) {
      const projection = projectObliqueWorldFrame(frame, this.pose);
      this.lastProjection = projection;
      this.lastPaintedRevision = frame.revision;
      this.lastPaintedPoseRevision = this.poseRevision;
      this.rememberActors(frame.actors);
      this.paintGround(projection);
      this.paintSelection();
      this.paintRaised(projection);
      return;
    }
    if (!this.actorsMoved(frame.actors)) return;
    const raised: (ObliqueSolid | ObliqueActorPoint)[] = this.lastProjection.raised.filter((item) => item.kind !== 'actor');
    raised.push(...projectObliqueActors(frame.actors, this.pose));
    sortObliqueRaised(raised);
    this.lastProjection = { ...this.lastProjection, raised };
    this.rememberActors(frame.actors);
    this.paintRaised(this.lastProjection);
  }
}
