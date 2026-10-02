import {captureObliqueView, restoreObliqueView, type RendererCameraView} from '../camera/renderer-view-memory';
import Phaser from 'phaser';
import { TouchGestureTracker } from '../../input/gestures';
import type { KeyValueStore } from '../../shared/key-value-store';
import { KeyboardInputAdapter, activeKeyboardContexts, loadInputSettings, type SemanticActionEvent } from '../../input';
import type { RenderActor, RenderFeed, RenderFrame } from '../feed/render-feed';
import { TILE_SIZE_PX, worldToTile } from '../tile-metrics';
import { VOID_COLOR, ZONING_TINT_ALPHA, UNOWNED_SHADE_ALPHA, UNOWNED_SHADE_COLOR } from '../world/appearance';
import {
  changeObliquePoseAtScreenPoint,
  panObliqueGroundAnchorToScreen,
  groundToScreen,
  screenToGround,
  zoomObliqueAtScreenPoint,
  visibleGroundBounds,
  type ObliqueCameraState,
} from '../camera/oblique-projection';
import { projectedTileQuad, type TileQuad } from '../camera/oblique-geometry';
import { projectObliqueActors, projectObliqueWorldFrame, sortObliqueRaised, type ObliqueActorPoint, type ObliqueSolid, type ObliqueWorldProjection } from '../camera/oblique-world-projection';
import type { Point } from '../camera/coordinates';
import type { ObliqueFitResult } from '../camera/oblique-fit';
import type { MinimapView } from '../../shared/minimap-view';
import { projectMinimap } from '../world/minimap-projection';
import type { ObliqueModuleCatalog } from '../assets/oblique-module-catalog';
import { selectObliqueModuleFrame } from '../assets/oblique-module-catalog';
import { edgeRunFromDrag, pickEdgeAtWorld, type BuildToolPort, type EditHistoryPort, type ToolStandDownPort, type WorldPoint } from '../build/edge-picking';
import { squareRun, type SquareBuildToolPort } from '../build/square-picking';
import { footprintRectAt, pickTileAtWorld, tileRectFromDrag, type ObjectToolPort, type RoomToolPort, type TileRect } from '../build/area-picking';
import { obliqueFloorBatches } from '../camera/oblique-ground-art';
import { ENVIRONMENT_SPRITES } from '../assets/environment-sprites';
import { RenderedArtCatalog } from '../assets/rendered-art-catalog';
import { VisibleObjectPool } from './visible-object-pool';
import { orientedObjectArtTarget } from '../world/object-art-orientation';

export interface ObliqueWorldSceneOptions {
  readonly feed: RenderFeed;
  readonly keyValueStore: KeyValueStore;
  /** Catalogs verified by the composition root before Phaser starts. */
  readonly catalogs?: ReadonlyMap<string, ObliqueModuleCatalog>;
  readonly onTileSelected?: (tileX: number, tileY: number) => void;
  readonly buildTool?: BuildToolPort & SquareBuildToolPort;
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
  private readonly buildTool: (BuildToolPort & SquareBuildToolPort) | undefined;
  private readonly editHistory: EditHistoryPort | undefined;
  private readonly toolStandDown: ToolStandDownPort | undefined;
  private readonly roomTool: RoomToolPort | undefined;
  private readonly objectTool: ObjectToolPort | undefined;
  private readonly keyboard: KeyboardInputAdapter;
  private groundGraphics!: Phaser.GameObjects.Graphics;
  private groundOverlayGraphics!: Phaser.GameObjects.Graphics;
  private floorMeshes: Phaser.GameObjects.Mesh2D[] = [];
  private selectionGraphics!: Phaser.GameObjects.Graphics;
  private gestureGraphics!: Phaser.GameObjects.Graphics;
  private raisedGraphics!: Phaser.GameObjects.Graphics;
  private readonly actorGraphics = new Map<number, Phaser.GameObjects.Graphics>();
  private readonly actorImagePool = new VisibleObjectPool(
    () => this.add.image(0, 0, '__DEFAULT').setScrollFactor(0),
    (image) => image.setVisible(false),
  );
  private pose!: ObliqueCameraState;
  private framedWorld = false;
  private frameAfterRevision = -1;
  private selected: { tileX: number; tileY: number } | undefined;
  private turnPointerId: number | undefined;
  private turnPointerAt: Point | undefined;
  private panPointerId: number | undefined;
  private panGroundAnchor: Point | undefined;
  private lastFrame: RenderFrame | undefined;
  private lastProjection: ObliqueWorldProjection | undefined;
  private lastPaintedRevision = -1;
  private poseRevision = 0;
  private lastPaintedPoseRevision = -1;
  private actorPositions: RenderActor[] = [];
  private groundPaints = 0;
  private raisedPaints = 0;
  private minimapSink: ((view: MinimapView | undefined) => void) | undefined;
  private readonly readyPromise: Promise<void>;
  private resolveReady!: () => void;
  private readonly assetTextureKeys = new Map<string, string>();
  private readonly actorTextureKeys = new Map<number, string>();
  private readonly queuedAssetTextures = new Map<string, string>();
  private readonly loadingAssetTextureKeys = new Set<string>();
  private readonly failedAssetTextureKeys = new Set<string>();
  private assetTextureLoaderRunning = false;
  private assetImages: Phaser.GameObjects.Image[] = [];
  private readonly solidImages = new Map<string, Phaser.GameObjects.Image>();
  private gesture: { pointerId: number; kind: 'build' | 'room' | 'object'; press: WorldPoint; current: WorldPoint } | undefined;
  /** Screen position stays fixed while keyboard/HUD controls change the pose. */
  private hoveredScreenPoint: Point | undefined;
  private touchGestures = new TouchGestureTracker();
  private readonly touchPointers = new Set<number>();

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
      () => activeKeyboardContexts(globalThis.document),
    );
    this.readyPromise = new Promise<void>((resolve) => { this.resolveReady = resolve; });
  }

  /** Resolves after Phaser has created the production angled scene. */
  public ready(): Promise<void> { return this.readyPromise; }

  /** The registry passed by the composition root, exposed for integration tests. */
  public captureCameraView(): RendererCameraView { return captureObliqueView(this.pose); }

  public restoreCameraView(view: RendererCameraView): void {
    this.pose = restoreObliqueView(this.pose, view);
    // A renderer replacement continues the existing view, including an empty world.
    this.framedWorld = true;
    this.frameAfterRevision = -1;
    this.poseRevision += 1;
    this.repaint();
    this.publishMinimap();
    this.paintGesturePreview();
  }

  public get obliqueCatalogs(): ReadonlyMap<string, ObliqueModuleCatalog> { return this.catalogs; }

  /** Keep the same feed port as WorldScene for demo actors and session reloads. */
  public setFeed(feed: RenderFeed): void {
    this.feed = feed;
    this.lastFrame = undefined;
    this.lastProjection = undefined;
    this.framedWorld = false;
    this.frameAfterRevision = -1;
  }

  /** Frame the next prison only after its first new world snapshot arrives. */
  public reframeForNextSession(): void {
    this.frameAfterRevision = this.lastFrame?.revision ?? 0;
    this.framedWorld = false;
  }

  /** A replacement worker must never inherit a held input from its predecessor. */
  public releaseSessionInput(): void {
    this.touchPointers.clear();
    this.touchGestures = new TouchGestureTracker();
    this.keyboard.releaseAll();
    this.turnPointerId = undefined;
    this.turnPointerAt = undefined;
    this.panPointerId = undefined;
    this.panGroundAnchor = undefined;
    this.hoveredScreenPoint = undefined;
    this.cancelGesture();
  }

  /** Connect the HUD minimap after it mounts. */
  public setMinimapSink(sink: (view: MinimapView | undefined) => void): void {
    this.minimapSink = sink;
    this.publishMinimap();
  }

  public create(): void {
    this.cameras.main.setBackgroundColor(VOID_COLOR);
    this.groundGraphics = this.add.graphics().setScrollFactor(0).setDepth(0);
    this.groundOverlayGraphics = this.add.graphics().setScrollFactor(0).setDepth(0.2);
    this.selectionGraphics = this.add.graphics().setScrollFactor(0).setDepth(0.5);
    this.gestureGraphics = this.add.graphics().setScrollFactor(0).setDepth(4);
    this.raisedGraphics = this.add.graphics().setScrollFactor(0).setDepth(1);
    this.pose = {
      target: { x: 0, y: 0 },
      viewport: { width: this.cameras.main.width, height: this.cameras.main.height },
      zoom: 1.25,
      yawRadians: -Math.PI / 4,
      elevationRadians: Math.PI / 4,
    };
    this.input.mouse?.disableContextMenu();
    this.input.addPointer(2);
    this.input.on('wheel', (pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
      this.stepCameraZoom(deltaY > 0 ? 'out' : 'in', { x: pointer.x, y: pointer.y });
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.wasTouch) {
        this.touchPointers.add(pointer.id);
        this.touchGestures.begin({ id: pointer.id, x: pointer.x, y: pointer.y });
        if (this.touchPointers.size > 1) {
          this.cancelGesture();
          this.hoveredScreenPoint = undefined;
          return;
        }
      }
      if (pointer.button === 1 && !pointer.wasTouch) {
        if (this.gesture !== undefined || this.turnPointerId !== undefined) return;
        this.panPointerId = pointer.id;
        this.panGroundAnchor = this.worldPointOf(pointer);
        this.hoveredScreenPoint = undefined;
        this.paintGesturePreview();
        return;
      }
      if (this.panPointerId !== undefined) return;
      if (pointer.button === 2 && !pointer.wasTouch) {
        if (this.gesture !== undefined) return;
        this.turnPointerId = pointer.id;
        this.turnPointerAt = { x: pointer.x, y: pointer.y };
        return;
      }
      if (pointer.button !== 0 && !pointer.wasTouch) return;
      if (this.turnPointerId !== undefined) return;
      this.hoveredScreenPoint = { x: pointer.x, y: pointer.y };
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
      if (pointer.wasTouch) {
        const motion = this.touchGestures.move({ id: pointer.id, x: pointer.x, y: pointer.y });
        if (motion?.kind === 'pinch' || (motion?.kind === 'pan' && this.gesture === undefined)) {
          this.cancelGesture();
          const current = motion.kind === 'pinch'
            ? { x: motion.centerX, y: motion.centerY } : { x: pointer.x, y: pointer.y };
          const previous = { x: current.x - motion.deltaX, y: current.y - motion.deltaY };
          const anchor = screenToGround(previous, this.pose);
          if (motion.kind === 'pinch') {
            this.pose = zoomObliqueAtScreenPoint(this.pose, previous,
              Math.min(3, Math.max(0.2, this.pose.zoom * motion.scale)));
          }
          this.pose = panObliqueGroundAnchorToScreen(this.pose, anchor, current);
          this.poseRevision += 1;
          this.hoveredScreenPoint = undefined;
          this.repaint();
          this.publishMinimap();
          return;
        }
      }
      if (pointer.id === this.panPointerId && this.panGroundAnchor !== undefined) {
        this.pose = panObliqueGroundAnchorToScreen(this.pose, this.panGroundAnchor, { x: pointer.x, y: pointer.y });
        this.poseRevision += 1;
        this.repaint();
        this.publishMinimap();
        return;
      }
      this.hoveredScreenPoint = { x: pointer.x, y: pointer.y };
      if (this.gesture?.pointerId === pointer.id) {
        this.gesture.current = this.worldPointOf(pointer);
        this.paintGesturePreview();
        return;
      }
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
      if (pointer.wasTouch) {
        this.touchPointers.delete(pointer.id);
        this.touchGestures.end(pointer.id);
      }
      if (pointer.id === this.panPointerId) {
        if ((pointer.buttons & 4) !== 0) return;
        this.panPointerId = undefined;
        this.panGroundAnchor = undefined;
        this.hoveredScreenPoint = { x: pointer.x, y: pointer.y };
        this.paintGesturePreview();
        return;
      }
      if (this.gesture?.pointerId === pointer.id) {
        if ((pointer.buttons & 1) !== 0) return;
        this.gesture.current = this.worldPointOf(pointer);
        this.commitGesture();
        return;
      }
      if (pointer.id !== this.turnPointerId) return;
      if ((pointer.buttons & 2) !== 0) return;
      this.turnPointerId = undefined;
      this.turnPointerAt = undefined;
    };
    this.input.on('pointerup', stopTurn);
    this.input.on('pointerupoutside', stopTurn);
    this.input.on('pointerout', (pointer: Phaser.Input.Pointer) => {
      if (pointer.wasTouch) {
        this.touchPointers.delete(pointer.id);
        this.touchGestures.end(pointer.id);
      }
      if (this.gesture?.pointerId === pointer.id) this.cancelGesture();
      if (pointer.id === this.panPointerId) {
        this.panPointerId = undefined;
        this.panGroundAnchor = undefined;
      }
      if (pointer.id === this.turnPointerId) {
        this.turnPointerId = undefined;
        this.turnPointerAt = undefined;
      }
      this.hoveredScreenPoint = undefined;
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
      this.touchPointers.clear();
      this.touchGestures = new TouchGestureTracker();
      this.turnPointerId = undefined;
      this.turnPointerAt = undefined;
      this.panPointerId = undefined;
      this.panGroundAnchor = undefined;
      this.hoveredScreenPoint = undefined;
      this.cancelGesture();
    };
    const cancelOnBlur = (): void => { this.keyboard.releaseAll(); cancelPointerInput(); };
    const cancelOnCaptureLoss = (event: PointerEvent): void => {
      // Native touch release loses implicit capture before Phaser receives
      // touchend. That normal release must still commit the chosen square.
      if (event.pointerType === 'touch' && event.buttons === 0) return;
      cancelPointerInput();
    };
    const canvas = this.game.canvas;
    const preventMiddleAutoScroll = (event: MouseEvent): void => {
      if (event.button === 1) event.preventDefault();
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.actorImagePool.clear();
      this.actorTextureKeys.clear();
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('focusin', disarmRovingArrows);
      window.removeEventListener('blur', cancelOnBlur);
      canvas.removeEventListener('pointercancel', cancelPointerInput);
      canvas.removeEventListener('lostpointercapture', cancelOnCaptureLoss);
      canvas.removeEventListener('mousedown', preventMiddleAutoScroll);
      canvas.removeEventListener('auxclick', preventMiddleAutoScroll);
    });
    canvas.addEventListener('mousedown', preventMiddleAutoScroll);
    canvas.addEventListener('auxclick', preventMiddleAutoScroll);
    canvas.addEventListener('pointercancel', cancelPointerInput);
    canvas.addEventListener('lostpointercapture', cancelOnCaptureLoss);
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('focusin', disarmRovingArrows);
    window.addEventListener('blur', cancelOnBlur);
    void this.loadCatalogTextures().then(() => this.loadFloorTextures()).finally(() => this.resolveReady());
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
    this.buildTool?.targetSquares?.(undefined);
    this.roomTool?.target?.(undefined);
    this.objectTool?.target?.(undefined);
  }

  private paintGesturePreview(): void {
    if (!this.gestureGraphics) return;
    const graphics = this.gestureGraphics;
    graphics.clear();
    let gesture = this.gesture;
    // A held drag keeps its pressed world square, but its endpoint follows the
    // stationary screen cursor whenever the camera projection changes.
    if (gesture !== undefined && this.hoveredScreenPoint !== undefined) {
      gesture.current = screenToGround(this.hoveredScreenPoint, this.pose);
    }
    if (gesture === undefined && this.hoveredScreenPoint !== undefined) {
      const kind = this.buildTool?.isArmed() === true ? 'build'
        : this.objectTool?.isArmed() === true && this.objectTool.footprint() !== undefined ? 'object'
        : this.roomTool?.isArmed() === true ? 'room' : undefined;
      if (kind !== undefined) {
        const world = screenToGround(this.hoveredScreenPoint, this.pose);
        gesture = { pointerId: -1, kind, press: world, current: world };
      }
    }
    if (gesture === undefined) { this.clearToolTargets(); return; }
    if (gesture.kind === 'build') {
      if (this.buildTool?.usesSquareFootprint() === true) {
        const from = pickTileAtWorld(gesture.press);
        const to = pickTileAtWorld(gesture.current);
        const squares = squareRun({ x: from.tileX, y: from.tileY }, { x: to.tileX, y: to.tileY });
        this.buildTool.targetSquares?.(squares);
        for (const square of squares) {
          const quad = projectedTileQuad(square.x, square.y, this.pose);
          this.fillQuad(graphics, quad, 0xe1bb57, 0.48);
          graphics.lineStyle(3, 0xffe19b, 1);
          for (let side = 0; side < 4; side += 1) {
            const next = (side + 1) % 4;
            graphics.lineBetween(quad[side]!.x, quad[side]!.y, quad[next]!.x, quad[next]!.y);
          }
        }
        return;
      }
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
    const squareBuild = gesture.kind === 'build' && this.buildTool?.usesSquareFootprint() === true;
    const segments = gesture.kind === 'build' && !squareBuild ? edgeRunFromDrag(gesture.press, gesture.current) : undefined;
    const squares = squareBuild ? (() => {
      const from = pickTileAtWorld(gesture.press);
      const to = pickTileAtWorld(gesture.current);
      return squareRun({ x: from.tileX, y: from.tileY }, { x: to.tileX, y: to.tileY });
    })() : undefined;
    this.cancelGesture();
    if (gesture.kind === 'build' && this.buildTool?.isArmed() === true && squares !== undefined) {
      this.buildTool.placeSquares(squares);
    } else if (gesture.kind === 'build' && this.buildTool?.isArmed() === true && segments !== undefined) {
      this.buildTool.place(segments);
    } else if (gesture.kind === 'room' && this.roomTool?.isArmed() === true && rect !== undefined) {
      this.roomTool.place(rect);
    } else if (gesture.kind === 'object' && this.objectTool?.isArmed() === true && rect !== undefined) {
      this.objectTool.place({ tileX: rect.tileX, tileY: rect.tileY, edge: pickEdgeAtWorld(gesture.current).edge });
    }
  }

  public get cameraPose(): ObliqueCameraState { return this.pose; }
  /** Apply an explicitly chosen preview candidate; no mode is selected here. */
  public applyCameraFit(fit: ObliqueFitResult): boolean {
    if (!fit.fits || fit.camera.viewport.width !== this.cameras.main.width ||
      fit.camera.viewport.height !== this.cameras.main.height) return false;
    groundToScreen({ x: 0, y: 0 }, fit.camera);
    this.pose = fit.camera;
    this.poseRevision += 1;
    this.repaint();
    this.publishMinimap();
    this.paintGesturePreview();
    return true;
  }
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
    let previewNeedsRepaint = false;
    const horizontal = Number(this.keyboard.isActive('camera.right')) - Number(this.keyboard.isActive('camera.left'));
    const vertical = Number(this.keyboard.isActive('camera.down')) - Number(this.keyboard.isActive('camera.up'));
    if (horizontal !== 0 || vertical !== 0) {
      const screen = { x: this.pose.viewport.width / 2 + horizontal * 0.6 * delta,
        y: this.pose.viewport.height / 2 + vertical * 0.6 * delta };
      this.pose = { ...this.pose, target: screenToGround(screen, this.pose) };
      this.poseRevision += 1;
      previewNeedsRepaint = true;
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
      previewNeedsRepaint = true;
    }
    const frame = this.feed.readFrame(time / 1000);
    if (this.gesture !== undefined) {
      const armed = this.gesture.kind === 'build' ? this.buildTool?.isArmed()
        : this.gesture.kind === 'room' ? this.roomTool?.isArmed() : this.objectTool?.isArmed();
      if (armed !== true) this.cancelGesture();
    }
    if (!this.framedWorld && frame.revision > this.frameAfterRevision && frame.world.loadedBounds !== undefined) {
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
      previewNeedsRepaint = true;
    }
    if (previewNeedsRepaint) this.paintGesturePreview();
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
    const overlay = this.groundOverlayGraphics;
    ground.clear();
    overlay.clear();
    for (const mesh of this.floorMeshes) mesh.destroy();
    this.floorMeshes = [];
    const painted = new Set<string>();
    if (this.game.renderer.type === Phaser.WEBGL) {
      for (const batch of obliqueFloorBatches(projection.ground)) {
        const key = `oblique-floor:${batch.assetId}`;
        if (!this.textures.exists(key)) continue;
        const mesh = new Phaser.GameObjects.Mesh2D(this, 0, 0, key, batch.vertices, batch.indices, true);
        mesh.setScrollFactor(0).setDepth(0.1).buildOrderedIndices(1, true);
        this.add.existing(mesh);
        this.floorMeshes.push(mesh);
        painted.add(batch.assetId);
      }
    }
    this.groundPaints += 1;
    for (const tile of projection.ground) {
      this.fillQuad(ground, tile.quad, tile.fill);
      const definition = tile.floorSprite === undefined ? undefined : ENVIRONMENT_SPRITES[tile.floorSprite];
      const hasArt = definition?.kind === 'rendered-art' && painted.has(definition.renderedArtId);
      if (tile.zoningTint !== undefined) this.fillQuad(overlay, tile.quad, tile.zoningTint, hasArt ? tile.zoningArtAlpha ?? ZONING_TINT_ALPHA : ZONING_TINT_ALPHA);
      if (!tile.owned) this.fillQuad(overlay, tile.quad, UNOWNED_SHADE_COLOR, UNOWNED_SHADE_ALPHA);
      overlay.lineStyle(1, 0x26323b, 0.45);
      for (let side = 0; side < 4; side += 1) {
        const next = (side + 1) % 4;
        overlay.lineBetween(tile.quad[side]!.x, tile.quad[side]!.y, tile.quad[next]!.x, tile.quad[next]!.y);
      }
    }
  }

  /** Reuse the existing Blender material catalogue; absent art keeps the
   * ordinary ground fill. Separate texture keys cannot replace object poses. */
  private async loadFloorTextures(): Promise<void> {
    let catalog: RenderedArtCatalog;
    try { catalog = await RenderedArtCatalog.load(); } catch { return; }
    const pending = new Map<string, string>();
    for (const [id, definition] of Object.entries(ENVIRONMENT_SPRITES)) {
      if ((!id.startsWith('env.floor.') && !id.startsWith('env.terrain.')) || definition.kind !== 'rendered-art') continue;
      if (!catalog.has(definition.renderedArtId)) continue;
      const key = `oblique-floor:${definition.renderedArtId}`;
      if (!this.textures.exists(key)) pending.set(key, catalog.imageUrl(definition.renderedArtId));
    }
    if (pending.size > 0) {
      for (const [key, url] of pending) this.load.image(key, url);
      await new Promise<void>((resolve) => {
        this.load.once(Phaser.Loader.Events.COMPLETE, () => resolve());
        this.load.start();
      });
    }
    this.lastPaintedPoseRevision = -1;
    this.repaint();
  }

  private paintSelection(): void {
    this.selectionGraphics.clear();
    if (this.selected === undefined) return;
    this.fillQuad(this.selectionGraphics, projectedTileQuad(this.selected.tileX, this.selected.tileY, this.pose), 0xe1bb57, 0.8);
  }

  private paintRaised(projection: ObliqueWorldProjection, preserveSolids = false): void {
    const raised = this.raisedGraphics;
    this.selectPoseTextures(projection);
    raised.clear();
    const visibleActors = new Set<number>();
    this.actorImagePool.retain(new Set(projection.raised
      .filter((item) => item.kind === 'actor' && item.assetId !== undefined
        && this.catalogs.has(item.assetId)
        && this.textures.exists(this.actorTextureKeys.get(Number(item.id)) ?? ''))
      .map((item) => Number(item.id))));
    if (!preserveSolids) {
      for (const image of this.assetImages) image.destroy();
      this.assetImages = [];
      this.solidImages.clear();
    }
    this.raisedPaints += 1;
    for (const [index, item] of projection.raised.entries()) {
      if (item.kind === 'actor') {
        if (this.paintAsset(item, index, projection.raised.length)) continue;
        visibleActors.add(item.id);
        let actors = this.actorGraphics.get(item.id);
        if (actors === undefined) {
          actors = this.add.graphics().setScrollFactor(0);
          this.actorGraphics.set(item.id, actors);
        }
        // Actors and authored solids share the already sorted world order.
        // A single graphics layer above all PNGs makes prisoners behind walls
        // appear on the wall texture, regardless of their simulation position.
        actors.clear().setDepth(2 + 0.9 * index / projection.raised.length);
        actors.lineStyle(13 * this.pose.zoom, 0xdd8342, 1);
        actors.lineBetween(item.head.x, item.head.y + 8 * this.pose.zoom, item.foot.x, item.foot.y);
        actors.fillStyle(0xffbd78, 1);
        actors.fillCircle(item.head.x, item.head.y, 8 * this.pose.zoom);
        continue;
      }
      // The prism is a fallback for assets that are absent or still loading.
      // Keeping it under an authored frame makes furniture appear to float on
      // a solid blue block, especially at shallow elevations.
      const solidKey = `${item.kind}:${item.id}`;
      const previous = preserveSolids ? this.solidImages.get(solidKey) : undefined;
      const textureKey = item.assetId === undefined ? undefined : this.assetTextureKeys.get(solidKey);
      if (previous !== undefined && textureKey !== undefined && previous.texture.key === textureKey) {
        // Actors can cross any solid in the sorted world order. Keep the
        // authored image itself, but update its depth on every actor frame.
        previous.setDepth(2 + 0.9 * index / projection.raised.length);
        continue;
      }
      if (previous !== undefined) {
        previous.destroy();
        this.solidImages.delete(solidKey);
        this.assetImages = this.assetImages.filter(image => image !== previous);
      }
      const image = this.paintAsset(item, index, projection.raised.length);
      if (image !== undefined) {
        this.solidImages.set(solidKey, image);
        continue;
      }
      for (let side = 0; side < 4; side += 1) {
        const next = (side + 1) % 4;
        this.fillQuad(raised, [item.footprint[side]!, item.footprint[next]!, item.top[next]!, item.top[side]!], item.sideFill, item.alpha);
      }
      this.fillQuad(raised, item.top, item.topFill, item.alpha);
    }
    for (const [id, graphics] of this.actorGraphics) {
      if (visibleActors.has(id)) continue;
      graphics.destroy();
      this.actorGraphics.delete(id);
    }
  }

  /** Keep each visible object on the catalog frame nearest the current camera pose. */
  private selectPoseTextures(projection: ObliqueWorldProjection): void {
    this.actorTextureKeys.clear();
    this.assetTextureKeys.clear();
    for (const item of projection.raised) {
      if (item.assetId === undefined) continue;
      const catalog = this.catalogs.get(item.assetId);
      if (catalog === undefined) continue;
      const frame = selectObliqueModuleFrame(catalog, {
        ...this.pose, yawRadians: item.assetYawRadians ?? this.pose.yawRadians,
      });
      const key = `oblique:${item.assetId}:${frame.yawDegrees}:${frame.elevationDegrees}`;
      if (this.textures.exists(key)) {
        if (item.kind === 'actor') this.actorTextureKeys.set(item.id, key);
        else this.assetTextureKeys.set(`${item.kind}:${item.id}`, key);
      } else {
        // A previous pose must never be painted onto the new geometry.
        if (!this.loadingAssetTextureKeys.has(key) && !this.failedAssetTextureKeys.has(key)) {
          this.queuedAssetTextures.set(key, frame.image);
        }
      }
    }
    this.flushAssetTextureQueue();
  }

  private flushAssetTextureQueue(): void {
    if (this.assetTextureLoaderRunning || this.queuedAssetTextures.size === 0) return;
    const batch = [...this.queuedAssetTextures];
    this.queuedAssetTextures.clear();
    this.assetTextureLoaderRunning = true;
    for (const [key, url] of batch) {
      this.loadingAssetTextureKeys.add(key);
      this.load.image(key, url);
    }
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      for (const [key] of batch) {
        this.loadingAssetTextureKeys.delete(key);
        if (!this.textures.exists(key)) this.failedAssetTextureKeys.add(key);
      }
      this.assetTextureLoaderRunning = false;
      this.lastPaintedPoseRevision = -1;
      this.repaint();
      this.flushAssetTextureQueue();
    });
    this.load.start();
  }

  /** Authored solids and pooled actors share depth and anchors; missing art uses graphics. */
  private paintAsset(item: ObliqueSolid | ObliqueActorPoint, index: number, itemCount: number): Phaser.GameObjects.Image | undefined {
    if (item.assetId === undefined) return undefined;
    const catalog = this.catalogs.get(item.assetId);
    if (catalog === undefined) return undefined;
    const textureKey = item.kind === 'actor' ? this.actorTextureKeys.get(item.id) : this.assetTextureKeys.get(`${item.kind}:${item.id}`);
    if (textureKey === undefined || !this.textures.exists(textureKey)) return undefined;
    const [targetX, targetY, targetZ] = item.kind !== 'actor' && item.orientation !== undefined && item.authoredFootprintTiles !== undefined
      ? orientedObjectArtTarget(catalog.cameraTargetTiles, item.authoredFootprintTiles, item.orientation)
      : catalog.cameraTargetTiles;
    const anchor = groundToScreen({
      x: (item.tileX + targetX) * TILE_SIZE_PX,
      y: (item.tileY + targetY) * TILE_SIZE_PX,
      z: targetZ * TILE_SIZE_PX,
    }, this.pose);
    const image = item.kind === 'actor'
      ? this.actorImagePool.acquire(item.id).setTexture(textureKey).setPosition(anchor.x, anchor.y).setVisible(true)
      : this.add.image(anchor.x, anchor.y, textureKey);
    image.setDepth(2 + 0.9 * index / itemCount);
    image.setOrigin(catalog.pivotPx[0] / catalog.resolutionPx[0], catalog.pivotPx[1] / catalog.resolutionPx[1]);
    image.setScale(TILE_SIZE_PX * this.pose.zoom / catalog.nominalPixelsPerTile);
    image.setAlpha(item.kind === 'actor' ? 1 : item.alpha);
    if (item.kind !== 'actor') this.assetImages.push(image);
    return image;
  }

  private async loadCatalogTextures(): Promise<void> {
    if (this.catalogs.size === 0) return;
    const pending: { assetId: string; key: string; url: string }[] = [];
    for (const [assetId, catalog] of this.catalogs) {
      const frame = selectObliqueModuleFrame(catalog, this.pose);
      const key = `oblique:${assetId}:${frame.yawDegrees}:${frame.elevationDegrees}`;
      pending.push({ assetId, key, url: frame.image });
      this.load.image(key, frame.image);
    }
    await new Promise<void>((resolve) => {
      this.load.once(Phaser.Loader.Events.COMPLETE, () => resolve());
      this.load.start();
    });
    this.lastPaintedPoseRevision = -1;
    this.repaint();
  }

  private actorsMoved(actors: readonly RenderActor[]): boolean {
    if (actors.length !== this.actorPositions.length) return true;
    for (let index = 0; index < actors.length; index += 1) {
      const actor = actors[index]!;
      const last = this.actorPositions[index]!;
      if (actor.id !== last.id || actor.tileX !== last.tileX || actor.tileY !== last.tileY
          || actor.assetId !== last.assetId || actor.deltaX !== last.deltaX
          || actor.deltaY !== last.deltaY || actor.facing !== last.facing) return true;
    }
    return false;
  }

  private rememberActors(actors: readonly RenderActor[]): void {
    this.actorPositions = actors.map(actor => ({ ...actor }));
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
    this.paintRaised(this.lastProjection, true);
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
