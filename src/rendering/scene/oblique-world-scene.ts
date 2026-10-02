import Phaser from 'phaser';
import type { KeyValueStore } from '../../shared/key-value-store';
import { KeyboardInputAdapter, isTextEntryFocused, loadInputSettings, type SemanticActionEvent } from '../../input';
import type { RenderActor, RenderFeed, RenderFrame } from '../feed/render-feed';
import { TILE_SIZE_PX, worldToTile } from '../tile-metrics';
import { VOID_COLOR, ZONING_TINT_ALPHA, UNOWNED_SHADE_ALPHA, UNOWNED_SHADE_COLOR } from '../world/appearance';
import {
  changeObliquePoseAtScreenPoint,
  screenToGround,
  zoomObliqueAtScreenPoint,
  visibleGroundBounds,
  type ObliqueCameraState,
} from '../camera/oblique-projection';
import { projectedTileQuad, type TileQuad } from '../camera/oblique-geometry';
import { projectObliqueActors, projectObliqueWorldFrame, sortObliqueRaised, type ObliqueActorPoint, type ObliqueSolid, type ObliqueWorldProjection } from '../camera/oblique-world-projection';
import type { Point } from '../camera/coordinates';
import type { MinimapView } from '../../shared/minimap-view';
import { projectMinimap } from '../world/minimap-projection';
import type { ObliqueModuleCatalog } from '../assets/oblique-module-catalog';
import { selectObliqueModuleFrame } from '../assets/oblique-module-catalog';
import { edgeRunFromDrag, pickEdgeAtWorld, type BuildToolPort, type EditHistoryPort, type ToolStandDownPort, type WorldPoint } from '../build/edge-picking';
import { footprintRectAt, pickTileAtWorld, tileRectFromDrag, type ObjectToolPort, type RoomToolPort, type TileRect } from '../build/area-picking';

export interface ObliqueWorldSceneOptions {
  readonly feed: RenderFeed;
  readonly keyValueStore: KeyValueStore;
  /** Catalogs verified by the composition root before Phaser starts. */
  readonly catalogs?: ReadonlyMap<string, ObliqueModuleCatalog>;
  readonly onTileSelected?: (tileX: number, tileY: number) => void;
  readonly buildTool?: BuildToolPort;
  readonly editHistory?: EditHistoryPort;
  readonly toolStandDown?: ToolStandDownPort;
  readonly roomTool?: RoomToolPort;
  readonly objectTool?: ObjectToolPort;
}

/**
 * A second, presentation-only Phaser scene for the angled renderer migration.
 * It reads the same immutable RenderFeed as WorldScene. The production root
 * opts into it with `?renderer=oblique`. Build, room and object gestures use
 * the same ports as WorldScene and preview on the angled ground plane.
 */
export class ObliqueWorldScene extends Phaser.Scene {
  private feed: RenderFeed;
  private readonly catalogs: ReadonlyMap<string, ObliqueModuleCatalog>;
  private readonly onTileSelected: ((tileX: number, tileY: number) => void) | undefined;
  private readonly buildTool: BuildToolPort | undefined;
  private readonly editHistory: EditHistoryPort | undefined;
  private readonly toolStandDown: ToolStandDownPort | undefined;
  private readonly roomTool: RoomToolPort | undefined;
  private readonly objectTool: ObjectToolPort | undefined;
  private readonly keyboard: KeyboardInputAdapter;
  private groundGraphics!: Phaser.GameObjects.Graphics;
  private selectionGraphics!: Phaser.GameObjects.Graphics;
  private gestureGraphics!: Phaser.GameObjects.Graphics;
  private raisedGraphics!: Phaser.GameObjects.Graphics;
  private actorGraphics!: Phaser.GameObjects.Graphics;
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
  private minimapSink: ((view: MinimapView | undefined) => void) | undefined;
  private readonly readyPromise: Promise<void>;
  private resolveReady!: () => void;
  private readonly assetTextureKeys = new Map<string, string>();
  private assetImages: Phaser.GameObjects.Image[] = [];
  private gesture: { pointerId: number; kind: 'build' | 'room' | 'object'; press: WorldPoint; current: WorldPoint } | undefined;
  private hoveredWorldPoint: WorldPoint | undefined;

  public constructor(options: ObliqueWorldSceneOptions) {
    super({ key: 'oblique-world' });
    this.feed = options.feed;
    this.catalogs = options.catalogs ?? new Map();
    this.onTileSelected = options.onTileSelected;
    this.buildTool = options.buildTool;
    this.editHistory = options.editHistory;
    this.toolStandDown = options.toolStandDown;
    this.roomTool = options.roomTool;
    this.objectTool = options.objectTool;
    this.keyboard = new KeyboardInputAdapter(
      loadInputSettings(options.keyValueStore).keyboardBindings,
      () => (isTextEntryFocused() ? ['text-entry'] : ['world']),
    );
    this.readyPromise = new Promise<void>((resolve) => { this.resolveReady = resolve; });
  }

  /** Resolves after Phaser has created the production angled scene. */
  public ready(): Promise<void> { return this.readyPromise; }

  /** The registry passed by the composition root, exposed for integration tests. */
  public get obliqueCatalogs(): ReadonlyMap<string, ObliqueModuleCatalog> { return this.catalogs; }

  /** Keep the same feed port as WorldScene for demo actors and session reloads. */
  public setFeed(feed: RenderFeed): void {
    this.feed = feed;
    this.lastFrame = undefined;
    this.lastProjection = undefined;
    this.framedWorld = false;
  }

  /** Connect the HUD minimap after it mounts. */
  public setMinimapSink(sink: (view: MinimapView | undefined) => void): void {
    this.minimapSink = sink;
    this.publishMinimap();
  }

  public create(): void {
    this.cameras.main.setBackgroundColor(VOID_COLOR);
    this.groundGraphics = this.add.graphics().setScrollFactor(0).setDepth(0);
    this.selectionGraphics = this.add.graphics().setScrollFactor(0).setDepth(0.5);
    this.gestureGraphics = this.add.graphics().setScrollFactor(0).setDepth(4);
    this.raisedGraphics = this.add.graphics().setScrollFactor(0).setDepth(1);
    this.actorGraphics = this.add.graphics().setScrollFactor(0).setDepth(3);
    this.pose = {
      target: { x: 0, y: 0 },
      viewport: { width: this.cameras.main.width, height: this.cameras.main.height },
      zoom: 1.25,
      yawRadians: -Math.PI / 4,
      elevationRadians: Math.PI / 4,
    };
    this.input.mouse?.disableContextMenu();
    this.input.on('wheel', (pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
      this.stepCameraZoom(deltaY > 0 ? 'out' : 'in', { x: pointer.x, y: pointer.y });
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 2 && !pointer.wasTouch) {
        this.turnPointerId = pointer.id;
        this.turnPointerAt = { x: pointer.x, y: pointer.y };
        return;
      }
      if (pointer.button !== 0) return;
      const world = this.worldPointOf(pointer);
      const kind = this.buildTool?.isArmed() === true ? 'build'
        : this.objectTool?.isArmed() === true && this.objectTool.footprint() !== undefined ? 'object'
        : this.roomTool?.isArmed() === true ? 'room' : undefined;
      if (kind !== undefined) {
        this.gesture = { pointerId: pointer.id, kind, press: world, current: world };
        this.paintGesturePreview();
        return;
      }
      const tileX = worldToTile(world.x);
      const tileY = worldToTile(world.y);
      this.selected = { tileX, tileY };
      this.onTileSelected?.(tileX, tileY);
      this.paintSelection();
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.gesture?.pointerId === pointer.id) {
        this.gesture.current = this.worldPointOf(pointer);
        this.paintGesturePreview();
        return;
      }
      this.hoveredWorldPoint = this.worldPointOf(pointer);
      this.paintGesturePreview();
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
      if (this.gesture?.pointerId === pointer.id) {
        this.gesture.current = this.worldPointOf(pointer);
        this.commitGesture();
        return;
      }
      if (pointer.id !== this.turnPointerId) return;
      this.turnPointerId = undefined;
      this.turnPointerAt = undefined;
    };
    this.input.on('pointerup', stopTurn);
    this.input.on('pointerupoutside', stopTurn);
    this.input.on('pointerout', (pointer: Phaser.Input.Pointer) => {
      if (this.gesture?.pointerId === pointer.id) this.cancelGesture();
      if (pointer.id === this.turnPointerId) {
        this.turnPointerId = undefined;
        this.turnPointerAt = undefined;
      }
      this.hoveredWorldPoint = undefined;
      this.paintGesturePreview();
    });
    const keyDown = (event: KeyboardEvent): void => this.handleActionEvents(this.keyboard.keyDown(event));
    const keyUp = (event: KeyboardEvent): void => { this.keyboard.keyUp(event); };
    const disarmRovingArrows = (event: FocusEvent): void => {
      const target = event.target;
      if (!(target instanceof Element) || !target.matches('[role="radio"]') ||
        target.closest('[role="radiogroup"]') === null) return;
      // A held world arrow does not emit a new keydown when focus enters the
      // list, so its normal stopPropagation cannot end the already-held pan.
      // Release only the arrows the list consumes, keeping WASD and pose keys.
      this.keyboard.releaseCodes(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
    };
    const cancelPointerInput = (): void => {
      this.turnPointerId = undefined;
      this.turnPointerAt = undefined;
      this.hoveredWorldPoint = undefined;
      this.cancelGesture();
    };
    const cancelOnBlur = (): void => { this.keyboard.releaseAll(); cancelPointerInput(); };
    const canvas = this.game.canvas;
    canvas.addEventListener('pointercancel', cancelPointerInput);
    canvas.addEventListener('lostpointercapture', cancelPointerInput);
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('focusin', disarmRovingArrows);
    window.addEventListener('blur', cancelOnBlur);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('focusin', disarmRovingArrows);
      window.removeEventListener('blur', cancelOnBlur);
      canvas.removeEventListener('pointercancel', cancelPointerInput);
      canvas.removeEventListener('lostpointercapture', cancelPointerInput);
    });
    void this.loadCatalogTextures().finally(() => this.resolveReady());
  }

  private worldPointOf(pointer: Phaser.Input.Pointer): WorldPoint {
    return screenToGround({ x: pointer.x, y: pointer.y }, this.pose);
  }

  private gestureRect(gesture: NonNullable<ObliqueWorldScene['gesture']>): TileRect | undefined {
    if (gesture.kind === 'room') return tileRectFromDrag(gesture.press, gesture.current);
    const tile = pickTileAtWorld(gesture.current);
    const footprint = this.objectTool?.footprint();
    return footprint === undefined ? undefined : footprintRectAt(tile, footprint);
  }

  private clearToolTargets(): void {
    this.buildTool?.target?.(undefined);
    this.roomTool?.target?.(undefined);
    this.objectTool?.target?.(undefined);
  }

  private paintGesturePreview(): void {
    if (!this.gestureGraphics) return;
    const graphics = this.gestureGraphics;
    graphics.clear();
    let gesture = this.gesture;
    if (gesture === undefined && this.hoveredWorldPoint !== undefined) {
      const kind = this.buildTool?.isArmed() === true ? 'build'
        : this.objectTool?.isArmed() === true && this.objectTool.footprint() !== undefined ? 'object'
        : this.roomTool?.isArmed() === true ? 'room' : undefined;
      if (kind !== undefined) gesture = { pointerId: -1, kind, press: this.hoveredWorldPoint, current: this.hoveredWorldPoint };
    }
    if (gesture === undefined) { this.clearToolTargets(); return; }
    if (gesture.kind === 'build') {
      const segments = edgeRunFromDrag(gesture.press, gesture.current);
      this.buildTool?.target?.(segments);
      for (const segment of segments) {
        const quad = projectedTileQuad(segment.tileX, segment.tileY, this.pose);
        this.fillQuad(graphics, quad, 0xe1bb57, 0.35);
        const from = quad[0];
        const to = segment.edge === 'north' ? quad[1] : quad[3];
        graphics.lineStyle(4, 0xe1bb57, 1);
        graphics.lineBetween(from.x, from.y, to.x, to.y);
      }
      return;
    }
    const rect = this.gestureRect(gesture);
    if (rect === undefined) return;
    if (gesture.kind === 'room') this.roomTool?.target?.(rect);
    else this.objectTool?.target?.(rect);
    const topLeft = projectedTileQuad(rect.tileX, rect.tileY, this.pose);
    const topRight = projectedTileQuad(rect.tileX + rect.width - 1, rect.tileY, this.pose);
    const bottomRight = projectedTileQuad(rect.tileX + rect.width - 1, rect.tileY + rect.height - 1, this.pose);
    const bottomLeft = projectedTileQuad(rect.tileX, rect.tileY + rect.height - 1, this.pose);
    this.fillQuad(graphics, [topLeft[0], topRight[1], bottomRight[2], bottomLeft[3]], 0x6dc9bb, 0.4);
  }

  private cancelGesture(): void {
    this.gesture = undefined;
    this.gestureGraphics?.clear();
    this.clearToolTargets();
  }

  private commitGesture(): void {
    const gesture = this.gesture;
    if (gesture === undefined) return;
    const rect = this.gestureRect(gesture);
    const segments = gesture.kind === 'build' ? edgeRunFromDrag(gesture.press, gesture.current) : undefined;
    this.cancelGesture();
    if (gesture.kind === 'build' && this.buildTool?.isArmed() === true && segments !== undefined) {
      this.buildTool.place(segments);
    } else if (gesture.kind === 'room' && this.roomTool?.isArmed() === true && rect !== undefined) {
      this.roomTool.place(rect);
    } else if (gesture.kind === 'object' && this.objectTool?.isArmed() === true && rect !== undefined) {
      this.objectTool.place({ tileX: rect.tileX, tileY: rect.tileY, edge: pickEdgeAtWorld(gesture.current).edge });
    }
  }

  public get cameraPose(): ObliqueCameraState { return this.pose; }
  public get selectedTile(): { readonly tileX: number; readonly tileY: number } | undefined { return this.selected; }
  public get paintCounts(): { readonly ground: number; readonly raised: number } {
    return { ground: this.groundPaints, raised: this.raisedPaints };
  }

  /** Keyboard/HUD zoom port shared with the top-down scene. */
  public stepCameraZoom(direction: 'in' | 'out', pivot?: Point): void {
    const factor = direction === 'in' ? 1.25 : 1 / 1.25;
    const zoom = Math.min(3, Math.max(0.2, this.pose.zoom * factor));
    if (zoom === this.pose.zoom) return;
    this.pose = zoomObliqueAtScreenPoint(this.pose,
      pivot ?? { x: this.pose.viewport.width / 2, y: this.pose.viewport.height / 2 }, zoom);
    this.poseRevision += 1;
    this.repaint();
    this.paintGesturePreview();
  }

  /** Move the angled ground target to a minimap fraction. */
  public navigateToMinimapPoint(fx: number, fy: number): boolean {
    const bounds = this.lastFrame?.world.loadedBounds;
    if (bounds === undefined || !Number.isFinite(fx) || !Number.isFinite(fy)) return false;
    const x = Math.min(1, Math.max(0, fx));
    const y = Math.min(1, Math.max(0, fy));
    this.pose = {
      ...this.pose,
      target: {
        x: (bounds.minTileX + x * (bounds.maxTileX - bounds.minTileX + 1)) * TILE_SIZE_PX,
        y: (bounds.minTileY + y * (bounds.maxTileY - bounds.minTileY + 1)) * TILE_SIZE_PX,
      },
    };
    this.poseRevision += 1;
    this.repaint();
    this.publishMinimap();
    this.paintGesturePreview();
    return true;
  }

  /** Move the angled ground target to a tile centre. */
  public navigateToTile(tileX: number, tileY: number): boolean {
    if (!Number.isFinite(tileX) || !Number.isFinite(tileY) || this.lastFrame?.world.loadedBounds === undefined) return false;
    this.pose = { ...this.pose, target: { x: (tileX + 0.5) * TILE_SIZE_PX, y: (tileY + 0.5) * TILE_SIZE_PX } };
    this.poseRevision += 1;
    this.repaint();
    this.publishMinimap();
    this.paintGesturePreview();
    return true;
  }

  /** Shared entry point for mouse drag, remappable keyboard actions and HUD buttons. */
  public setPoseRadians(yawRadians: number, elevationRadians: number, pivot?: Point): void {
    const elevation = Math.min(80 * Math.PI / 180, Math.max(20 * Math.PI / 180, elevationRadians));
    const screen = pivot ?? { x: this.pose.viewport.width / 2, y: this.pose.viewport.height / 2 };
    this.pose = changeObliquePoseAtScreenPoint(this.pose, screen, yawRadians, elevation);
    this.poseRevision += 1;
    this.repaint();
    this.paintGesturePreview();
  }

  private handleActionEvents(events: readonly SemanticActionEvent[]): void {
    for (const event of events) {
      if (event.phase !== 'started') continue;
      if (event.action === 'camera.zoom.in') this.stepCameraZoom('in');
      else if (event.action === 'camera.zoom.out') this.stepCameraZoom('out');
      else if (event.action === 'build.cancel') {
        const hadGesture = this.gesture !== undefined;
        this.cancelGesture();
        if (!hadGesture) this.toolStandDown?.standDown();
      } else if (event.action === 'edit.undo') this.editHistory?.undo();
      else if (event.action === 'edit.redo') this.editHistory?.redo();
    }
  }

  public override update(time: number, delta: number): void {
    const horizontal = Number(this.keyboard.isActive('camera.right')) - Number(this.keyboard.isActive('camera.left'));
    const vertical = Number(this.keyboard.isActive('camera.down')) - Number(this.keyboard.isActive('camera.up'));
    if (horizontal !== 0 || vertical !== 0) {
      const screen = { x: this.pose.viewport.width / 2 + horizontal * 0.6 * delta,
        y: this.pose.viewport.height / 2 + vertical * 0.6 * delta };
      this.pose = { ...this.pose, target: screenToGround(screen, this.pose) };
      this.poseRevision += 1;
    }
    const turn = Number(this.keyboard.isActive('camera.rotate.right')) - Number(this.keyboard.isActive('camera.rotate.left'));
    const tilt = Number(this.keyboard.isActive('camera.tilt.up')) - Number(this.keyboard.isActive('camera.tilt.down'));
    if (turn !== 0 || tilt !== 0) {
      this.setPoseRadians(this.pose.yawRadians + turn * delta * 0.0015,
        this.pose.elevationRadians + tilt * delta * 0.0015);
    }
    const viewport = { width: this.cameras.main.width, height: this.cameras.main.height };
    if (viewport.width !== this.pose.viewport.width || viewport.height !== this.pose.viewport.height) {
      this.pose = { ...this.pose, viewport };
      this.poseRevision += 1;
    }
    const frame = this.feed.readFrame(time / 1000);
    if (this.gesture !== undefined) {
      const armed = this.gesture.kind === 'build' ? this.buildTool?.isArmed()
        : this.gesture.kind === 'room' ? this.roomTool?.isArmed() : this.objectTool?.isArmed();
      if (armed !== true) this.cancelGesture();
    }
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
    this.roomTool?.setWorld?.(frame.world);
    this.repaint();
    this.publishMinimap();
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
    const actors = this.actorGraphics;
    actors.clear();
    for (const image of this.assetImages) image.destroy();
    this.assetImages = [];
    this.raisedPaints += 1;
    for (const [index, item] of projection.raised.entries()) {
      if (item.kind === 'actor') {
        actors.lineStyle(13 * this.pose.zoom, 0xdd8342, 1);
        actors.lineBetween(item.head.x, item.head.y + 8 * this.pose.zoom, item.foot.x, item.foot.y);
        actors.fillStyle(0xffbd78, 1);
        actors.fillCircle(item.head.x, item.head.y, 8 * this.pose.zoom);
        continue;
      }
      for (let side = 0; side < 4; side += 1) {
        const next = (side + 1) % 4;
        this.fillQuad(raised, [item.footprint[side]!, item.footprint[next]!, item.top[next]!, item.top[side]!], item.sideFill, item.alpha);
      }
      this.fillQuad(raised, item.top, item.topFill, item.alpha);
      this.paintAsset(item, index, projection.raised.length);
    }
  }

  /** Load and paint one authored PNG for every mapped solid; graphics remain the fail-closed fallback. */
  private paintAsset(item: ObliqueSolid, index: number, itemCount: number): void {
    if (item.assetId === undefined) return;
    const textureKey = this.assetTextureKeys.get(item.assetId);
    if (textureKey === undefined || !this.textures.exists(textureKey)) return;
    const centre = item.top.reduce((sum, point) => ({ x: sum.x + point.x / 4, y: sum.y + point.y / 4 }), { x: 0, y: 0 });
    const image = this.add.image(centre.x, centre.y, textureKey).setDepth(2 + 0.9 * index / itemCount);
    image.setOrigin(0.5, 0.75);
    image.setAlpha(item.alpha);
    this.assetImages.push(image);
  }

  private async loadCatalogTextures(): Promise<void> {
    if (this.catalogs.size === 0) return;
    const pending: { assetId: string; key: string; url: string }[] = [];
    for (const [assetId, catalog] of this.catalogs) {
      const key = `oblique:${assetId}`;
      const frame = selectObliqueModuleFrame(catalog, this.pose);
      pending.push({ assetId, key, url: frame.image });
      this.load.image(key, frame.image);
    }
    await new Promise<void>((resolve) => {
      this.load.once(Phaser.Loader.Events.COMPLETE, () => resolve());
      this.load.start();
    });
    for (const item of pending) if (this.textures.exists(item.key)) this.assetTextureKeys.set(item.assetId, item.key);
    this.repaint();
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

  private publishMinimap(): void {
    if (this.minimapSink === undefined) return;
    const frame = this.lastFrame;
    if (frame === undefined) { this.minimapSink(undefined); return; }
    const projected = projectMinimap(frame.world);
    if (projected === undefined) { this.minimapSink(undefined); return; }
    const bounds = frame.world.loadedBounds;
    if (bounds === undefined) { this.minimapSink(undefined); return; }
    const spanX = bounds.maxTileX - bounds.minTileX + 1;
    const spanY = bounds.maxTileY - bounds.minTileY + 1;
    const viewport = visibleGroundBounds(this.pose);
    this.minimapSink({
      ...projected,
      viewport: {
        x: (viewport.left / TILE_SIZE_PX - bounds.minTileX) / spanX,
        y: (viewport.top / TILE_SIZE_PX - bounds.minTileY) / spanY,
        width: (viewport.right - viewport.left) / TILE_SIZE_PX / spanX,
        height: (viewport.bottom - viewport.top) / TILE_SIZE_PX / spanY,
      },
    });
  }
}
