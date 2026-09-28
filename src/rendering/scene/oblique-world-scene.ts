import Phaser from 'phaser';
import { pickEdgeAtWorld, type BuildEdgeId } from '../build/edge-picking';
import type { RenderActor, RenderFeed, RenderFrame } from '../feed/render-feed';
import { TILE_SIZE_PX, worldToTile } from '../tile-metrics';
import { VOID_COLOR, ZONING_TINT_ALPHA, UNOWNED_SHADE_ALPHA, UNOWNED_SHADE_COLOR } from '../world/appearance';
import {
  changeObliquePoseAtScreenPoint,
  fitObliqueGroundRectangle,
  groundToScreen,
  panObliqueCameraByScreenDelta,
  screenToGround,
  zoomObliqueCameraAtScreenPoint,
  type ObliqueCameraState,
} from '../camera/oblique-projection';
import { obliqueDepthForAnchor, projectedTileQuad, type TileQuad } from '../camera/oblique-geometry';
import { projectObliqueActors, projectObliqueWorldFrame, sortObliqueRaised, type ObliqueActorPoint, type ObliqueSolid, type ObliqueWorldProjection } from '../camera/oblique-world-projection';
import type { Point } from '../camera/coordinates';
import { selectObliqueModuleFrame, type ObliqueModuleCatalog } from '../assets/oblique-module-catalog';
import { ensureObliqueModuleFrameTexture } from '../phaser/oblique-module-textures';
import { selectObliqueWallJunctions } from './oblique-wall-junctions';
import { isRoomFacingCutawayWall } from './oblique-room-cutaway';

const DEFAULT_YAW_RADIANS = -Math.PI / 4;
const DEFAULT_ELEVATION_RADIANS = Math.PI / 4;
const ZOOM_BOUNDS = { min: 0.2, max: 3 } as const;
const ZOOM_STEP = 1.25;

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
  /** A completed left-button ground gesture, reported as whole square tiles. */
  readonly onTileGesture?: (tiles: readonly { readonly x: number; readonly y: number }[], edge: BuildEdgeId) => void;
  /** Live whole-tile drag endpoints; undefined start clears the preview. */
  readonly onTileGesturePreview?: (start: { readonly x: number; readonly y: number } | undefined, end?: { readonly x: number; readonly y: number }) => void;
  readonly onGroundHover?: (tile: { readonly tileX: number; readonly tileY: number } | undefined) => void;
  /** The HUD follows every scene-side pose change, including pointer drags. */
  readonly onPoseChanged?: (pose: ObliqueCameraState) => void;
  /** An armed construction gesture owns the pointer until it is put down. */
  readonly canRotate?: () => boolean;
  /** Optional Blender modules; the scene still renders valid geometry without them. */
  readonly artCatalogs?: ReadonlyMap<string, ObliqueModuleCatalog>;
}

/**
 * A second, presentation-only Phaser scene for the angled renderer migration.
 * It reads the same immutable RenderFeed as WorldScene. The composition root
 * starts it only for the explicit preview route while build gestures and
 * measured repaint cost are completed before ordinary players switch to it.
 */
export class ObliqueWorldScene extends Phaser.Scene {
  private readonly feed: RenderFeed;
  private readonly onTileSelected: ((tileX: number, tileY: number) => void) | undefined;
  private readonly onTileGesture: ((tiles: readonly { readonly x: number; readonly y: number }[], edge: BuildEdgeId) => void) | undefined;
  private readonly onTileGesturePreview: ((start: { readonly x: number; readonly y: number } | undefined, end?: { readonly x: number; readonly y: number }) => void) | undefined;
  private leftGesture: { readonly pointerId: number; readonly x: number; readonly y: number } | undefined;
  private readonly onGroundHover: ((tile: { readonly tileX: number; readonly tileY: number } | undefined) => void) | undefined;
  private readonly onPoseChanged: ((pose: ObliqueCameraState) => void) | undefined;
  private readonly canRotate: () => boolean;
  private readonly artCatalogs: ReadonlyMap<string, ObliqueModuleCatalog>;
  private groundGraphics!: Phaser.GameObjects.Graphics;
  private groundGridGraphics!: Phaser.GameObjects.Graphics;
  private groundComposite!: Phaser.GameObjects.RenderTexture;
  private raisedComposite!: Phaser.GameObjects.RenderTexture;
  private displayComposite!: Phaser.GameObjects.RenderTexture;
  private displayCompositeDirty = false;
  private groundHoverGraphics!: Phaser.GameObjects.Graphics;
  private selectionGraphics!: Phaser.GameObjects.Graphics;
  private raisedGraphics!: Phaser.GameObjects.Graphics;
  private pose!: ObliqueCameraState;
  private framedWorld = false;
  private selected: { tileX: number; tileY: number } | undefined;
  private turnPointerId: number | undefined;
  private turnPointerAt: Point | undefined;
  private hoverPointerAt: Point | undefined;
  private hovered: { tileX: number; tileY: number } | undefined;
  private buildGridEmphasis = false;
  private lastFrame: RenderFrame | undefined;
  private lastProjection: ObliqueWorldProjection | undefined;
  private lastPaintedRevision = -1;
  private poseRevision = 0;
  private lastPaintedPoseRevision = -1;
  private actorPositions: { id: number; tileX: number; tileY: number }[] = [];
  private groundPaints = 0;
  private groundArtPaints = 0;
  private paintedGroundTiles = 0;
  private raisedPaints = 0;
  private artImages: Phaser.GameObjects.Image[] = [];
  private groundArtImages: Phaser.GameObjects.Image[] = [];
  private actorArtImages: Phaser.GameObjects.Image[] = [];
  private readonly pendingArtLoads = new Map<string, Promise<void>>();
  private readonly artLoadErrors: string[] = [];

  public constructor(options: ObliqueWorldSceneOptions) {
    super({ key: 'oblique-world' });
    this.feed = options.feed;
    this.onTileSelected = options.onTileSelected;
    this.onTileGesture = options.onTileGesture;
    this.onTileGesturePreview = options.onTileGesturePreview;
    this.onGroundHover = options.onGroundHover;
    this.onPoseChanged = options.onPoseChanged;
    this.canRotate = options.canRotate ?? (() => true);
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
    this.groundGridGraphics = this.add.graphics().setScrollFactor(0).setDepth(0.4);
    this.groundComposite = this.add.renderTexture(0, 0, this.cameras.main.width, this.cameras.main.height)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(0.4);
    this.groundHoverGraphics = this.add.graphics().setScrollFactor(0).setDepth(0.6);
    this.selectionGraphics = this.add.graphics().setScrollFactor(0).setDepth(0.5);
    this.raisedGraphics = this.add.graphics().setScrollFactor(0).setDepth(1);
    this.raisedComposite = this.add.renderTexture(0, 0, this.cameras.main.width, this.cameras.main.height)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(1);
    this.displayComposite = this.add.renderTexture(0, 0, this.cameras.main.width, this.cameras.main.height)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(1);
    this.groundComposite.removeFromDisplayList();
    this.raisedComposite.removeFromDisplayList();
    this.groundHoverGraphics.removeFromDisplayList();
    this.selectionGraphics.removeFromDisplayList();
    const restoreComposites = (): void => {
      if (this.lastProjection !== undefined) {
        this.refreshGroundComposite();
        this.refreshRaisedComposite();
        this.refreshDisplayComposite();
      }
    };
    this.game.renderer.on(Phaser.Renderer.Events.RESTORE_WEBGL, restoreComposites);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.renderer.off(Phaser.Renderer.Events.RESTORE_WEBGL, restoreComposites);
    });
    this.pose = {
      target: { x: 0, y: 0 },
      viewport: { width: this.cameras.main.width, height: this.cameras.main.height },
      zoom: 1.25,
      yawRadians: DEFAULT_YAW_RADIANS,
      elevationRadians: DEFAULT_ELEVATION_RADIANS,
    };
    this.onPoseChanged?.(this.pose);
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.hoverPointerAt = { x: pointer.x, y: pointer.y };
      this.emitGroundHover();
      if (pointer.button === 2 && !pointer.wasTouch) {
        if (!this.canRotate()) return;
        this.turnPointerId = pointer.id;
        this.turnPointerAt = { x: pointer.x, y: pointer.y };
        return;
      }
      if (pointer.button !== 0) return;
      const world = screenToGround({ x: pointer.x, y: pointer.y }, this.pose);
      const tileX = worldToTile(world.x);
      const tileY = worldToTile(world.y);
      this.selected = { tileX, tileY };
      if (this.onTileGesture === undefined) this.onTileSelected?.(tileX, tileY);
      else {
        this.leftGesture = { pointerId: pointer.id, x: tileX, y: tileY };
        this.onTileGesturePreview?.({ x: tileX, y: tileY }, { x: tileX, y: tileY });
      }
      this.paintSelection();
      if (this.lastProjection !== undefined) {
        this.paintRaised(this.lastProjection);
        this.paintArt(this.lastProjection);
        this.refreshRaisedComposite();
      }
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.hoverPointerAt = { x: pointer.x, y: pointer.y };
      this.emitGroundHover();
      if (this.leftGesture?.pointerId === pointer.id) {
        const world = screenToGround({ x: pointer.x, y: pointer.y }, this.pose);
        this.onTileGesturePreview?.(this.leftGesture, { x: worldToTile(world.x), y: worldToTile(world.y) });
      }
      if (pointer.id !== this.turnPointerId || this.turnPointerAt === undefined) return;
      if (!this.canRotate()) {
        this.turnPointerId = undefined;
        this.turnPointerAt = undefined;
        return;
      }
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
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      stopTurn(pointer);
      const start = this.leftGesture;
      if (start === undefined || pointer.id !== start.pointerId) return;
      this.leftGesture = undefined;
      this.onTileGesturePreview?.(undefined);
      const world = screenToGround({ x: pointer.x, y: pointer.y }, this.pose);
      const endX = worldToTile(world.x);
      const endY = worldToTile(world.y);
      const width = Math.abs(endX - start.x) + 1;
      const height = Math.abs(endY - start.y) + 1;
      if (width * height > 4096) return;
      const tiles: { x: number; y: number }[] = [];
      for (let y = Math.min(start.y, endY); y <= Math.max(start.y, endY); y += 1) {
        for (let x = Math.min(start.x, endX); x <= Math.max(start.x, endX); x += 1) {
          tiles.push({ x, y });
        }
      }
      this.onTileGesture?.(tiles, pickEdgeAtWorld(world).edge);
    });
    this.input.on('pointerupoutside', (pointer: Phaser.Input.Pointer) => {
      stopTurn(pointer);
      if (pointer.id === this.leftGesture?.pointerId) {
        this.leftGesture = undefined;
        this.onTileGesturePreview?.(undefined);
      }
    });
    this.input.on('gameout', () => {
      this.hoverPointerAt = undefined;
      this.emitGroundHover();
      if (this.leftGesture !== undefined) {
        this.leftGesture = undefined;
        this.onTileGesturePreview?.(undefined);
      }
    });
  }

  public get cameraPose(): ObliqueCameraState { return this.pose; }
  public get selectedTile(): { readonly tileX: number; readonly tileY: number } | undefined { return this.selected; }
  public get paintCounts(): { readonly ground: number; readonly raised: number } {
    return { ground: this.groundPaints, raised: this.raisedPaints };
  }
  public get groundArtPaintCount(): number { return this.groundArtPaints; }
  public get groundArtImageCount(): number { return this.groundArtImages.length; }
  public get projectedGroundTileCount(): number { return this.lastProjection?.ground.length ?? 0; }
  public get paintedGroundTileCount(): number { return this.paintedGroundTiles; }
  public get visibleUncachedGroundObjectCount(): number {
    return [this.groundGraphics, this.groundGridGraphics, ...this.groundArtImages]
      .filter((object) => object.visible && object.displayList !== null).length;
  }
  public get raisedArtImageCount(): number { return this.artImages.length; }
  public get projectedRaisedObjectCount(): number { return this.lastProjection?.raised.length ?? 0; }
  public get visibleUncachedRaisedObjectCount(): number {
    return [this.raisedGraphics, ...this.artImages, ...this.actorArtImages]
      .filter((object) => object.visible && object.displayList !== null).length;
  }
  public get visibleViewportCompositeCount(): number {
    return [this.groundComposite, this.raisedComposite, this.displayComposite]
      .filter((object) => object.visible && object.displayList !== null).length;
  }
  public get artTextureKeys(): readonly string[] {
    return [...this.groundArtImages, ...this.artImages, ...this.actorArtImages].map((item) => item.texture.key);
  }
  public get actorArtPosition(): Point | undefined {
    const image = this.actorArtImages[0];
    return image === undefined ? undefined : { x: image.x, y: image.y };
  }
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

  /** Build emphasizes placement edges without repainting ground sprites. */
  public setGroundGridEmphasis(isBuildActive: boolean): void {
    if (this.buildGridEmphasis === isBuildActive) return;
    this.buildGridEmphasis = isBuildActive;
    if (this.lastProjection !== undefined) {
      this.paintGroundGrid(this.lastProjection);
      this.refreshGroundComposite();
    }
    this.paintGroundHover();
  }

  private emitGroundHover(): void {
    const world = this.hoverPointerAt === undefined ? undefined : screenToGround(this.hoverPointerAt, this.pose);
    const next = world === undefined ? undefined : { tileX: worldToTile(world.x), tileY: worldToTile(world.y) };
    if (next?.tileX === this.hovered?.tileX && next?.tileY === this.hovered?.tileY) return;
    this.hovered = next;
    this.paintGroundHover();
    this.onGroundHover?.(next);
  }

  /** Shared entry point for mouse drag, remappable keyboard actions and HUD buttons. */
  public setPoseRadians(yawRadians: number, elevationRadians: number, pivot?: Point): void {
    const elevation = Math.min(80 * Math.PI / 180, Math.max(20 * Math.PI / 180, elevationRadians));
    const screen = pivot ?? { x: this.pose.viewport.width / 2, y: this.pose.viewport.height / 2 };
    this.pose = changeObliquePoseAtScreenPoint(this.pose, screen, yawRadians, elevation);
    this.poseRevision += 1;
    this.onPoseChanged?.(this.pose);
    this.emitGroundHover();
    this.repaint();
    void this.ensureArtForCurrentPose().catch((error: unknown) => { this.artLoadErrors.push(String(error)); });
  }

  /** The visible zoom controls must change the active angled camera, not the dormant top-down scene. */
  public stepCameraZoom(direction: 'in' | 'out', pivot?: Point): void {
    const factor = direction === 'in' ? ZOOM_STEP : 1 / ZOOM_STEP;
    const zoom = Math.min(ZOOM_BOUNDS.max, Math.max(ZOOM_BOUNDS.min, this.pose.zoom * factor));
    if (zoom === this.pose.zoom) return;
    this.pose = zoomObliqueCameraAtScreenPoint(
      this.pose,
      pivot ?? { x: this.pose.viewport.width / 2, y: this.pose.viewport.height / 2 },
      zoom,
    );
    this.poseRevision += 1;
    this.onPoseChanged?.(this.pose);
    this.emitGroundHover();
    this.repaint();
  }

  /** Move the angled viewport in screen axes; mouse grabbing supplies the inverse drag. */
  public stepCameraPan(screenDx: number, screenDy: number): void {
    if (!Number.isFinite(screenDx) || !Number.isFinite(screenDy) || (screenDx === 0 && screenDy === 0)) return;
    this.pose = panObliqueCameraByScreenDelta(this.pose, screenDx, screenDy);
    this.poseRevision += 1;
    this.onPoseChanged?.(this.pose);
    this.emitGroundHover();
    this.repaint();
  }

  /** An explicit HUD action frames a selected tile area inside the usable central view. */
  public fitGroundTileArea(area: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }): void {
    if (![area.x, area.y, area.width, area.height].every(Number.isSafeInteger) || area.width <= 0 || area.height <= 0) return;
    const { width, height } = this.pose.viewport;
    this.pose = fitObliqueGroundRectangle(this.pose, {
      left: area.x * TILE_SIZE_PX,
      top: area.y * TILE_SIZE_PX,
      right: (area.x + area.width) * TILE_SIZE_PX,
      bottom: (area.y + area.height) * TILE_SIZE_PX,
    }, {
      left: width * 0.21,
      right: width * 0.79,
      top: height * 0.17,
      bottom: height * 0.83,
    }, ZOOM_BOUNDS.min, ZOOM_BOUNDS.max);
    this.poseRevision += 1;
    this.onPoseChanged?.(this.pose);
    this.emitGroundHover();
    this.repaint();
  }

  /** Point the angled view at the same loaded-world location selected on the minimap. */
  public navigateToMinimapPoint(fx: number, fy: number): boolean {
    const bounds = this.lastFrame?.world.loadedBounds;
    if (bounds === undefined || !Number.isFinite(fx) || !Number.isFinite(fy)) return false;
    const clampedX = Math.min(1, Math.max(0, fx));
    const clampedY = Math.min(1, Math.max(0, fy));
    this.pose = {
      ...this.pose,
      target: {
        x: (bounds.minTileX + clampedX * (bounds.maxTileX - bounds.minTileX + 1)) * TILE_SIZE_PX,
        y: (bounds.minTileY + clampedY * (bounds.maxTileY - bounds.minTileY + 1)) * TILE_SIZE_PX,
      },
    };
    this.poseRevision += 1;
    this.onPoseChanged?.(this.pose);
    this.emitGroundHover();
    this.repaint();
    return true;
  }

  /** Resolve only the authored frames nearest to the active camera pose. */
  public async ensureArtForCurrentPose(): Promise<void> {
    const requestedPoseRevision = this.poseRevision;
    const pending: Promise<void>[] = [];
    for (const catalog of this.artCatalogs.values()) {
      const frame = selectObliqueModuleFrame(catalog, this.pose);
      if (this.textures.exists(frame.image)) continue;
      let task = this.pendingArtLoads.get(frame.image);
      if (task === undefined) {
        task = ensureObliqueModuleFrameTexture(this, catalog, this.pose)
          .then(() => undefined)
          .finally(() => { this.pendingArtLoads.delete(frame.image); });
        this.pendingArtLoads.set(frame.image, task);
      }
      pending.push(task);
    }
    await Promise.all(pending);
    if (pending.length > 0 && requestedPoseRevision === this.poseRevision &&
        this.lastProjection !== undefined && this.scene.isActive()) {
      this.paintGroundArt(this.lastProjection);
      this.refreshGroundComposite();
      this.paintRaised(this.lastProjection);
      this.paintArt(this.lastProjection);
      this.paintActorArt(this.lastProjection);
      this.refreshRaisedComposite();
    }
  }

  public override update(time: number): void {
    const viewport = { width: this.cameras.main.width, height: this.cameras.main.height };
    if (viewport.width !== this.pose.viewport.width || viewport.height !== this.pose.viewport.height) {
      this.pose = { ...this.pose, viewport };
      this.poseRevision += 1;
      this.onPoseChanged?.(this.pose);
      this.emitGroundHover();
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
      this.onPoseChanged?.(this.pose);
      this.emitGroundHover();
    }
    this.lastFrame = frame;
    this.repaint();
    if (this.displayCompositeDirty) this.refreshDisplayComposite();
  }

  private fillQuad(graphics: Phaser.GameObjects.Graphics, quad: TileQuad, color: number, alpha = 1): void {
    graphics.fillStyle(color, alpha);
    graphics.beginPath();
    graphics.moveTo(quad[0].x, quad[0].y);
    for (let index = 1; index < 4; index += 1) graphics.lineTo(quad[index]!.x, quad[index]!.y);
    graphics.closePath();
    graphics.fillPath();
  }

  private quadVisible(quad: TileQuad): boolean {
    const xs = quad.map((corner) => corner.x);
    const ys = quad.map((corner) => corner.y);
    return Math.max(...xs) >= 0 && Math.min(...xs) <= this.pose.viewport.width &&
      Math.max(...ys) >= 0 && Math.min(...ys) <= this.pose.viewport.height;
  }

  private paintGround(projection: ObliqueWorldProjection): void {
    const ground = this.groundGraphics;
    ground.clear();
    this.groundPaints += 1;
    this.paintedGroundTiles = 0;
    for (const tile of projection.ground) {
      if (!this.quadVisible(tile.quad)) continue;
      this.paintedGroundTiles += 1;
      this.fillQuad(ground, tile.quad, tile.fill);
      if (tile.zoningTint !== undefined) this.fillQuad(ground, tile.quad, tile.zoningTint, ZONING_TINT_ALPHA);
      if (!tile.owned) this.fillQuad(ground, tile.quad, UNOWNED_SHADE_COLOR, UNOWNED_SHADE_ALPHA);
    }
  }

  private paintGroundGrid(projection: ObliqueWorldProjection): void {
    const grid = this.groundGridGraphics;
    grid.clear();
    grid.lineStyle(Math.max(1.5, this.pose.zoom), 0x26323b, this.buildGridEmphasis ? 0.65 : 0.09);
    for (const tile of projection.ground) {
      if (!this.quadVisible(tile.quad)) continue;
      for (let side = 0; side < 4; side += 1) {
        const next = (side + 1) % 4;
        grid.lineBetween(tile.quad[side]!.x, tile.quad[side]!.y, tile.quad[next]!.x, tile.quad[next]!.y);
      }
    }
  }

  private paintGroundHover(): void {
    const graphics = this.groundHoverGraphics;
    graphics.clear();
    this.displayCompositeDirty = true;
    if (!this.buildGridEmphasis || this.hovered === undefined) return;
    const quad = projectedTileQuad(this.hovered.tileX, this.hovered.tileY, this.pose);
    graphics.fillStyle(0xe1bb57, 0.12);
    graphics.lineStyle(Math.max(2, this.pose.zoom * 1.75), 0xe1bb57, 0.95);
    graphics.beginPath();
    graphics.moveTo(quad[0]!.x, quad[0]!.y);
    for (let corner = 1; corner < 4; corner += 1) graphics.lineTo(quad[corner]!.x, quad[corner]!.y);
    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();
  }

  private paintGroundArt(projection: ObliqueWorldProjection): void {
    this.groundArtPaints += 1;
    for (const image of this.groundArtImages) image.destroy();
    this.groundArtImages = [];
    for (const tile of projection.ground) {
      const anchor = {
        x: tile.quad.reduce((sum, corner) => sum + corner.x, 0) / 4,
        y: tile.quad.reduce((sum, corner) => sum + corner.y, 0) / 4,
      };
      const assets = tile.artAssetId === undefined
        ? tile.artOverlayAssetIds
        : [tile.artAssetId, ...tile.artOverlayAssetIds];
      for (const [index, assetId] of assets.entries()) {
        const catalog = this.artCatalogs.get(assetId);
        if (catalog === undefined) continue;
        const frame = selectObliqueModuleFrame(catalog, this.pose);
        if (!this.textures.exists(frame.image)) continue;
        const [width, height] = catalog.resolutionPx;
        const [pivotX, pivotY] = catalog.pivotPx;
        // The inverse-projected tile range is a bounding rectangle around the
        // angled viewport. Its corner tiles can be far outside the canvas.
        // Cull by the full sprite bounds, including art that extends past its
        // tile, so nearby artwork is never clipped at the screen edge.
        const left = anchor.x - pivotX * this.pose.zoom;
        const top = anchor.y - pivotY * this.pose.zoom;
        if (left > this.pose.viewport.width || top > this.pose.viewport.height ||
            left + width * this.pose.zoom < 0 || top + height * this.pose.zoom < 0) continue;
        this.groundArtImages.push(this.add.image(anchor.x, anchor.y, frame.image)
          .setOrigin(pivotX / width, pivotY / height)
          .setScale(this.pose.zoom)
          .setDepth(0.2 + index * 0.001));
      }
    }
  }

  /** Cache the static ground at viewport resolution instead of drawing each tile every frame. */
  private refreshGroundComposite(): void {
    this.groundComposite.resize(this.pose.viewport.width, this.pose.viewport.height);
    this.groundComposite.clear();
    this.groundComposite.draw([this.groundGraphics, ...this.groundArtImages, this.groundGridGraphics]);
    this.groundComposite.render();
    this.groundGraphics.removeFromDisplayList();
    this.groundGridGraphics.removeFromDisplayList();
    for (const image of this.groundArtImages) image.removeFromDisplayList();
    this.displayCompositeDirty = true;
  }

  /** Keep depth-sorted walls and actors in one viewport texture until their projection changes. */
  private refreshRaisedComposite(): void {
    this.raisedComposite.resize(this.pose.viewport.width, this.pose.viewport.height);
    this.raisedComposite.clear();
    const images = [...this.artImages, ...this.actorArtImages].sort((a, b) => a.depth - b.depth);
    this.raisedComposite.draw([this.raisedGraphics, ...images]);
    this.raisedComposite.render();
    this.raisedGraphics.removeFromDisplayList();
    for (const image of images) image.removeFromDisplayList();
    this.displayCompositeDirty = true;
  }

  /** Resolve the ground highlights behind raised art in one displayed viewport image. */
  private refreshDisplayComposite(): void {
    this.displayComposite.resize(this.pose.viewport.width, this.pose.viewport.height);
    this.displayComposite.clear();
    this.displayComposite.draw([
      this.groundComposite,
      this.selectionGraphics,
      this.groundHoverGraphics,
      this.raisedComposite,
    ]);
    this.displayComposite.render();
    this.displayCompositeDirty = false;
  }

  private paintSelection(): void {
    this.selectionGraphics.clear();
    this.displayCompositeDirty = true;
    if (this.selected === undefined) return;
    this.fillQuad(this.selectionGraphics, projectedTileQuad(this.selected.tileX, this.selected.tileY, this.pose), 0xe1bb57, 0.8);
  }

  private paintRaised(projection: ObliqueWorldProjection): void {
    const raised = this.raisedGraphics;
    raised.clear();
    this.raisedPaints += 1;
    const junctions = this.wallJunctions(projection);
    for (const item of projection.raised) {
      if (item.kind === 'actor') {
        if (this.actorArtFrame(item) !== undefined) continue;
        raised.lineStyle(13 * this.pose.zoom, 0xdd8342, 1);
        raised.lineBetween(item.head.x, item.head.y + 8 * this.pose.zoom, item.foot.x, item.foot.y);
        raised.fillStyle(0xffbd78, 1);
        raised.fillCircle(item.head.x, item.head.y, 8 * this.pose.zoom);
        continue;
      }
      if (junctions.consumedIds.has(item.id)) continue;
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

  /** Open the visible side of a known room; selection still reveals nearby unzoned walls. */
  private cutsAwayForSelection(item: ObliqueSolid): boolean {
    if (item.kind !== 'north-edge' && item.kind !== 'west-edge') return false;
    if (isRoomFacingCutawayWall({ kind: item.kind, tileX: item.tileX, tileY: item.tileY }, this.lastFrame?.rooms ?? [],
      this.pose.yawRadians * 180 / Math.PI, this.pose.elevationRadians * 180 / Math.PI)) return true;
    if (this.selected === undefined) return false;
    if (Math.abs(item.tileX - this.selected.tileX) > 2 || Math.abs(item.tileY - this.selected.tileY) > 2) return false;
    const selectedDepth = obliqueDepthForAnchor({
      x: (this.selected.tileX + 0.5) * TILE_SIZE_PX,
      y: (this.selected.tileY + 0.5) * TILE_SIZE_PX,
    }, this.pose.yawRadians);
    return item.viewDepth > selectedDepth + TILE_SIZE_PX * 0.25;
  }

  private cutawayArtAssetId(item: ObliqueSolid): string | undefined {
    if (item.artAssetId === 'wall.interior.module.full') return 'wall.interior.module.cutaway';
    if (item.artAssetId === 'wall.interior.module.west.full') return 'wall.interior.module.west.cutaway';
    if (item.artAssetId === 'door.interior.open.full') return 'door.interior.open.cutaway';
    if (item.artAssetId === 'door.interior.open.west.full') return 'door.interior.open.west.cutaway';
    if (item.artAssetId === 'door.shower.privacy.open.full') return 'door.shower.privacy.open.cutaway';
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

  private wallJunctions(projection: ObliqueWorldProjection) {
    return selectObliqueWallJunctions(projection.raised, (assetId) => {
      const catalog = this.artCatalogs.get(assetId);
      if (catalog === undefined) return false;
      return this.textures.exists(selectObliqueModuleFrame(catalog, this.pose).image);
    }, (edge) => this.cutsAwayForSelection(edge));
  }

  private paintArt(projection: ObliqueWorldProjection): void {
    for (const image of this.artImages) image.destroy();
    this.artImages = [];
    const junctions = this.wallJunctions(projection);
    for (const item of projection.raised) {
      if (item.kind === 'actor') continue;
      if (junctions.consumedIds.has(item.id)) continue;
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
    for (const junction of junctions.placements) {
      const catalog = this.artCatalogs.get(junction.assetId)!;
      const frame = selectObliqueModuleFrame(catalog, this.pose);
      const anchor = groundToScreen(junction.groundAnchor, this.pose);
      const [width, height] = catalog.resolutionPx;
      const [pivotX, pivotY] = catalog.pivotPx;
      const depth = obliqueDepthForAnchor(junction.groundAnchor, this.pose.yawRadians);
      this.artImages.push(this.add.image(anchor.x, anchor.y, frame.image)
        .setOrigin(pivotX / width, pivotY / height)
        .setScale(this.pose.zoom)
        .setAlpha(Math.min(...junction.incident.map((edge) => edge.alpha)))
        .setDepth(2 + depth / 10_000));
    }
  }

  private actorArtFrame(item: ObliqueActorPoint): { readonly catalog: ObliqueModuleCatalog; readonly image: string } | undefined {
    const catalog = this.artCatalogs.get(item.artAssetId);
    if (catalog === undefined) return undefined;
    const frame = selectObliqueModuleFrame(catalog, this.pose);
    return this.textures.exists(frame.image) ? { catalog, image: frame.image } : undefined;
  }

  private paintActorArt(projection: ObliqueWorldProjection): void {
    for (const image of this.actorArtImages) image.destroy();
    this.actorArtImages = [];
    for (const item of projection.raised) {
      if (item.kind !== 'actor') continue;
      const art = this.actorArtFrame(item);
      if (art === undefined) continue;
      const [width, height] = art.catalog.resolutionPx;
      const [pivotX, pivotY] = art.catalog.pivotPx;
      this.actorArtImages.push(this.add.image(item.foot.x, item.foot.y, art.image)
        .setOrigin(pivotX / width, pivotY / height)
        .setScale(this.pose.zoom)
        .setDepth(2 + item.viewDepth / 10_000));
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
      this.paintGroundGrid(projection);
      this.paintGroundArt(projection);
      this.refreshGroundComposite();
      this.paintSelection();
      this.paintGroundHover();
      this.paintRaised(projection);
      this.paintArt(projection);
      this.paintActorArt(projection);
      this.refreshRaisedComposite();
      return;
    }
    if (!this.actorsMoved(frame.actors)) return;
    const raised: (ObliqueSolid | ObliqueActorPoint)[] = this.lastProjection.raised.filter((item) => item.kind !== 'actor');
    raised.push(...projectObliqueActors(frame.actors, this.pose));
    sortObliqueRaised(raised);
    this.lastProjection = { ...this.lastProjection, raised };
    this.rememberActors(frame.actors);
    this.paintRaised(this.lastProjection);
    this.paintActorArt(this.lastProjection);
    this.refreshRaisedComposite();
  }
}
