import Phaser from 'phaser';
import type { RenderActor, RenderFeed, RenderFrame } from '../feed/render-feed';
import { TILE_SIZE_PX, worldToTile } from '../tile-metrics';
import { VOID_COLOR, ZONING_TINT_ALPHA, UNOWNED_SHADE_ALPHA, UNOWNED_SHADE_COLOR } from '../world/appearance';
import {
  changeObliquePoseAtScreenPoint,
  screenToGround,
  type ObliqueCameraState,
} from '../camera/oblique-projection';
import { obliqueDepthForAnchor, projectedTileQuad, type TileQuad } from '../camera/oblique-geometry';
import { projectObliqueActors, projectObliqueWorldFrame, sortObliqueRaised, type ObliqueActorPoint, type ObliqueSolid, type ObliqueWorldProjection } from '../camera/oblique-world-projection';
import type { Point } from '../camera/coordinates';
import { selectObliqueModuleFrame, type ObliqueModuleCatalog } from '../assets/oblique-module-catalog';
import { ensureObliqueModuleFrameTexture } from '../phaser/oblique-module-textures';

const DEFAULT_YAW_RADIANS = -Math.PI / 4;
const DEFAULT_ELEVATION_RADIANS = Math.PI / 4;

function lowerTop(footprint: TileQuad, top: TileQuad, fraction: number): TileQuad {
  const corner = (index: 0 | 1 | 2 | 3): Point => ({
    x: footprint[index].x + (top[index].x - footprint[index].x) * fraction,
    y: footprint[index].y + (top[index].y - footprint[index].y) * fraction,
  });
  return [corner(0), corner(1), corner(2), corner(3)];
}

export interface ObliqueWorldSceneOptions {
  readonly feed: RenderFeed;
  readonly onTileSelected?: (tileX: number, tileY: number) => void;
  /** Optional Blender modules; the scene still renders valid geometry without them. */
  readonly artCatalogs?: ReadonlyMap<string, ObliqueModuleCatalog>;
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
  private readonly artCatalogs: ReadonlyMap<string, ObliqueModuleCatalog>;
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
  private artImages: Phaser.GameObjects.Image[] = [];
  private readonly pendingArtLoads = new Map<string, Promise<void>>();
  private readonly artLoadErrors: string[] = [];

  public constructor(options: ObliqueWorldSceneOptions) {
    super({ key: 'oblique-world' });
    this.feed = options.feed;
    this.onTileSelected = options.onTileSelected;
    this.artCatalogs = options.artCatalogs ?? new Map();
  }

  public preload(): void {
    const seen = new Set<string>();
    for (const catalog of this.artCatalogs.values()) {
      const frame = selectObliqueModuleFrame(catalog, {
        yawRadians: DEFAULT_YAW_RADIANS,
        elevationRadians: DEFAULT_ELEVATION_RADIANS,
      });
      if (seen.has(frame.image)) continue;
      seen.add(frame.image);
      this.load.image(frame.image, frame.image);
    }
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
      yawRadians: DEFAULT_YAW_RADIANS,
      elevationRadians: DEFAULT_ELEVATION_RADIANS,
    };
    this.input.mouse?.disableContextMenu();
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
      if (this.lastProjection !== undefined) {
        this.paintRaised(this.lastProjection);
        this.paintArt(this.lastProjection);
      }
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
  public get selectedTile(): { readonly tileX: number; readonly tileY: number } | undefined { return this.selected; }
  public get paintCounts(): { readonly ground: number; readonly raised: number } {
    return { ground: this.groundPaints, raised: this.raisedPaints };
  }
  public get artTextureKeys(): readonly string[] { return this.artImages.map((item) => item.texture.key); }
  public get loadedArtTextureCount(): number {
    const keys = new Set<string>();
    for (const catalog of this.artCatalogs.values()) for (const frame of catalog.frames) {
      if (this.textures.exists(frame.image)) keys.add(frame.image);
    }
    return keys.size;
  }
  public get artErrors(): readonly string[] { return this.artLoadErrors; }
  public get cutawayWallIds(): readonly string[] {
    return this.lastProjection?.raised
      .filter((item): item is ObliqueSolid => item.kind !== 'actor' && this.cutsAwayForSelection(item))
      .map((item) => item.id) ?? [];
  }

  /** Shared entry point for mouse drag, remappable keyboard actions and HUD buttons. */
  public setPoseRadians(yawRadians: number, elevationRadians: number, pivot?: Point): void {
    const elevation = Math.min(80 * Math.PI / 180, Math.max(20 * Math.PI / 180, elevationRadians));
    const screen = pivot ?? { x: this.pose.viewport.width / 2, y: this.pose.viewport.height / 2 };
    this.pose = changeObliquePoseAtScreenPoint(this.pose, screen, yawRadians, elevation);
    this.poseRevision += 1;
    this.repaint();
    void this.ensureArtForCurrentPose().catch((error: unknown) => { this.artLoadErrors.push(String(error)); });
  }

  /** Resolve only the authored frames nearest to the active camera pose. */
  public async ensureArtForCurrentPose(): Promise<void> {
    const pending: Promise<void>[] = [];
    for (const catalog of this.artCatalogs.values()) {
      const frame = selectObliqueModuleFrame(catalog, this.pose);
      if (this.textures.exists(frame.image)) continue;
      let task = this.pendingArtLoads.get(frame.image);
      if (task === undefined) {
        task = ensureObliqueModuleFrameTexture(this, catalog, this.pose).then(() => {
          if (this.lastProjection !== undefined && this.scene.isActive()) {
            this.paintRaised(this.lastProjection);
            this.paintArt(this.lastProjection);
          }
        }).finally(() => { this.pendingArtLoads.delete(frame.image); });
        this.pendingArtLoads.set(frame.image, task);
      }
      pending.push(task);
    }
    await Promise.all(pending);
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
    for (const item of projection.raised) {
      if (item.kind === 'actor') {
        raised.lineStyle(13 * this.pose.zoom, 0xdd8342, 1);
        raised.lineBetween(item.head.x, item.head.y + 8 * this.pose.zoom, item.foot.x, item.foot.y);
        raised.fillStyle(0xffbd78, 1);
        raised.fillCircle(item.head.x, item.head.y, 8 * this.pose.zoom);
        continue;
      }
      const cutaway = this.cutsAwayForSelection(item);
      if (this.displayArtFrame(item, cutaway) !== undefined) continue;
      const top = cutaway ? lowerTop(item.footprint, item.top, 0.18) : item.top;
      for (let side = 0; side < 4; side += 1) {
        const next = (side + 1) % 4;
        this.fillQuad(raised, [item.footprint[side]!, item.footprint[next]!, top[next]!, top[side]!], item.sideFill, item.alpha);
      }
      this.fillQuad(raised, top, item.topFill, item.alpha);
    }
  }

  /** Lower only a nearby wall between the camera and the selected ground square. */
  private cutsAwayForSelection(item: ObliqueSolid): boolean {
    if (this.selected === undefined || (item.kind !== 'north-edge' && item.kind !== 'west-edge')) return false;
    if (Math.abs(item.tileX - this.selected.tileX) > 2 || Math.abs(item.tileY - this.selected.tileY) > 2) return false;
    const selectedDepth = obliqueDepthForAnchor({
      x: (this.selected.tileX + 0.5) * TILE_SIZE_PX,
      y: (this.selected.tileY + 0.5) * TILE_SIZE_PX,
    }, this.pose.yawRadians);
    return item.viewDepth > selectedDepth + TILE_SIZE_PX * 0.25;
  }

  private cutawayArtAssetId(item: ObliqueSolid): string | undefined {
    if (item.artAssetId === 'wall.interior.module.full' || item.artAssetId === 'wall.interior.module.west.full') {
      return 'wall.interior.module.cutaway';
    }
    return undefined;
  }

  private artFrame(item: ObliqueSolid, assetId = item.artAssetId): { readonly catalog: ObliqueModuleCatalog; readonly image: string } | undefined {
    if (assetId === undefined) return undefined;
    const catalog = this.artCatalogs.get(assetId);
    if (catalog === undefined) return undefined;
    const frame = selectObliqueModuleFrame(catalog, this.pose);
    return this.textures.exists(frame.image) ? { catalog, image: frame.image } : undefined;
  }

  private displayArtFrame(item: ObliqueSolid, cutaway: boolean): { readonly catalog: ObliqueModuleCatalog; readonly image: string } | undefined {
    if (!cutaway) return this.artFrame(item);
    const assetId = this.cutawayArtAssetId(item);
    return assetId === undefined ? undefined : this.artFrame(item, assetId);
  }

  private paintArt(projection: ObliqueWorldProjection): void {
    for (const image of this.artImages) image.destroy();
    this.artImages = [];
    for (const item of projection.raised) {
      if (item.kind === 'actor') continue;
      const cutaway = this.cutsAwayForSelection(item);
      const art = this.displayArtFrame(item, cutaway);
      if (art === undefined) continue;
      const anchor = {
        x: item.footprint.reduce((sum, corner) => sum + corner.x, 0) / 4,
        y: item.footprint.reduce((sum, corner) => sum + corner.y, 0) / 4,
      };
      const [width, height] = art.catalog.resolutionPx;
      const [pivotX, pivotY] = art.catalog.pivotPx;
      const image = this.add.image(anchor.x, anchor.y, art.image)
        .setOrigin(pivotX / width, pivotY / height)
        .setScale(this.pose.zoom)
        .setAlpha(item.alpha)
        .setDepth(2 + item.viewDepth / 10_000);
      this.artImages.push(image);
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
      this.paintArt(projection);
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
