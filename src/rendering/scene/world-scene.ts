import Phaser from 'phaser';
import type { KeyValueStore } from '../../shared/key-value-store';
import {
  KeyboardInputAdapter,
  TouchGestureTracker,
  loadInputSettings,
  resolveBrowserKeyValueStore,
} from '../../input';
import { AtlasFrameIndex } from '../assets/atlas-frame-index';
import { AtlasLibrary } from '../assets/atlas-library';
import { type CameraState, screenToWorld, visibleWorldBounds, zoomAtScreenPoint } from '../camera';
import {
  type BuildToolPort,
  type EdgeTarget,
  type WorldPoint,
  edgeRunFromDrag,
  edgeTargetsEqual,
  pickEdgeAtWorld,
} from '../build/edge-picking';
import type { RenderFeed } from '../feed/render-feed';
import { ActorLayer } from '../phaser/actor-layer';
import { registerAtlasTextures } from '../phaser/atlas-textures';
import { BuildOverlay } from '../phaser/build-overlay';
import { TileLayer } from '../phaser/tile-layer';
import { TILE_SIZE_PX, visibleTileRange, type TileRange } from '../tile-metrics';

/**
 * The world view: camera, input, tiles and actors.
 *
 * It owns no game state. Every frame it asks a `RenderFeed` for the current
 * projection of the simulation and draws that -- `AGENTS.md` boundary 1, with
 * the arrow only ever pointing one way. Panning, zooming and animation happen
 * here because they are presentation; nothing the player does with the camera
 * reaches the simulation.
 *
 * Camera input behaviour (keyboard pan, middle-drag, wheel zoom, touch
 * pan/pinch) is unchanged from the boot scene this replaces.
 */

/**
 * Zoom range in screen pixels per world unit. With a 64px tile that is a tile
 * drawn between 13 and 192 pixels: far enough out to plan a wing, close
 * enough in to see which way a prisoner is facing at nearly the resolution
 * the art was authored at.
 */
const ZOOM_BOUNDS = { min: 0.2, max: 3 } as const;

/** About nine tiles a second at zoom 1, and proportionally faster zoomed out. */
const PAN_SPEED_WORLD_UNITS_PER_MS = 0.6;

export interface WorldSceneOptions {
  readonly feed: RenderFeed;
  /** Injectable so a test or a preview can supply a batch without the network. */
  readonly loadAtlasLibrary?: () => Promise<AtlasLibrary>;
  readonly onError?: (error: Error) => void;
  /**
   * Where a build gesture goes. Absent, the world is view-only and every
   * pointer gesture keeps its old camera meaning exactly.
   *
   * The scene reports *edges*, never commands: `src/rendering/**` may not
   * submit one (pinned by `tests/unit/rendering-module-boundaries.test.ts`),
   * and the renderer must not become the thing that decides a build happened.
   */
  readonly buildTool?: BuildToolPort;

  /**
   * Where input settings are read from.
   *
   * The renderer used to reach for `window.localStorage` itself, in a class
   * field initializer -- so a browser that blocks site data threw inside this
   * constructor, at module top level, outside any `try`, and took the whole
   * boot with it (issue #199). `docs/INPUT.md` had described the arrangement
   * this option restores: the entry point supplies the store, and the seam
   * exists so tests stay headless.
   *
   * Optional with a safe default rather than required, because a harness page
   * that only wants a canvas should not have to name a storage strategy.
   */
  readonly keyValueStore?: KeyValueStore;
}

export class WorldScene extends Phaser.Scene {
  private feed: RenderFeed;
  private readonly loadAtlasLibrary: () => Promise<AtlasLibrary>;
  private readonly onError: (error: Error) => void;

  /**
   * Assigned in the constructor, not in a field initializer.
   *
   * A field initializer cannot see the constructor's `options`, so building
   * this here is what forced the old `window.localStorage` read -- and a field
   * initializer runs *inside* the constructor, which is why the throw escaped
   * to module scope rather than to a caller that could handle it (#199).
   */
  private readonly keyboard: KeyboardInputAdapter;
  private readonly touchGestures = new TouchGestureTracker();
  private panPointerId: number | undefined;
  private lastPanScreenPoint: { readonly x: number; readonly y: number } | undefined;

  private readonly buildTool: BuildToolPort | undefined;
  /** The pointer currently drawing a wall run, and the world point it pressed. */
  private buildPointerId: number | undefined;
  private buildPress: WorldPoint | undefined;
  private buildSegments: readonly EdgeTarget[] = [];
  private hoveredEdge: EdgeTarget | undefined;

  private tiles: TileLayer | undefined;
  private actors: ActorLayer | undefined;
  private buildOverlay: BuildOverlay | undefined;
  private framedOnWorld = false;

  public constructor(options: WorldSceneOptions) {
    super('WorldScene');
    this.feed = options.feed;
    this.buildTool = options.buildTool;
    this.keyboard = new KeyboardInputAdapter(
      loadInputSettings(options.keyValueStore ?? resolveBrowserKeyValueStore()).keyboardBindings,
      () => ['world'],
    );
    this.loadAtlasLibrary = options.loadAtlasLibrary ?? (() => AtlasLibrary.load());
    this.onError =
      options.onError ??
      ((error) => {
        console.warn('World renderer:', error);
      });
  }

  /**
   * Replaces the source of render frames.
   *
   * The scene starts drawing before anything asynchronous has resolved, so a
   * feed that needs the asset registry (or, later, a richer simulation
   * channel) can be swapped in once it is ready without stalling the boot.
   * It changes where frames come from, never what the renderer may do with
   * them.
   */
  public setFeed(feed: RenderFeed): void {
    this.feed = feed;
  }

  public create(): void {
    this.cameras.main.setBackgroundColor('#0b0e12');
    this.tiles = new TileLayer(this);
    this.buildOverlay = new BuildOverlay(this);

    // Phaser tracks exactly one touch pointer unless told otherwise, so a
    // second finger was never delivered and `TouchGestureTracker` could not
    // see a pinch at all: two-finger zoom has been dead since the scene was
    // written, silently, because nothing exercised it in a real browser.
    // Three is one spare beyond the two the gestures use.
    this.input.addPointer(2);

    const keyDown = (event: KeyboardEvent): void => {
      this.keyboard.keyDown(event);
    };
    const keyUp = (event: KeyboardEvent): void => {
      this.keyboard.keyUp(event);
    };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);

    this.input.on(
      'wheel',
      (pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
        const camera = this.cameras.main;
        const next = zoomAtScreenPoint(
          this.cameraState(),
          { x: pointer.x, y: pointer.y },
          camera.zoom * (deltaY > 0 ? 0.9 : 1.1),
          ZOOM_BOUNDS,
        );
        camera.setZoom(next.zoom);
        camera.setScroll(next.scroll.x, next.scroll.y);
      },
    );

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.wasTouch) {
        this.touchGestures.begin({ id: pointer.id, x: pointer.x, y: pointer.y });
        // One finger builds only while a tool is armed *and* it is the only
        // finger down; a second finger arriving hands the gesture back to the
        // camera (see `pointermove`).
        if (this.isBuildArmed() && this.activeTouchCount() === 1) this.beginBuild(pointer);
        return;
      }
      if (pointer.button === 0 && this.isBuildArmed()) {
        this.beginBuild(pointer);
        return;
      }
      if (pointer.button !== 1) return;
      this.panPointerId = pointer.id;
      this.lastPanScreenPoint = { x: pointer.x, y: pointer.y };
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.wasTouch) {
        const gesture = this.touchGestures.move({ id: pointer.id, x: pointer.x, y: pointer.y });
        if (gesture?.kind === 'pan') {
          // A one-finger drag builds while armed, and pans otherwise. Both
          // cannot be true at once, which is the whole reason arming is
          // explicit rather than inferred from a drag threshold.
          if (this.extendBuild(pointer)) return;
          const camera = this.cameras.main;
          camera.scrollX -= gesture.deltaX / camera.zoom;
          camera.scrollY -= gesture.deltaY / camera.zoom;
        } else if (gesture?.kind === 'pinch') {
          // Two fingers are always the camera, armed or not -- so a touch
          // player never loses the ability to move around while building.
          // A second finger abandons any run in progress rather than
          // committing a wall the player was actually trying to scroll past.
          this.cancelBuild();
          const camera = this.cameras.main;
          const panned = this.cameraState();
          const next = zoomAtScreenPoint(
            {
              ...panned,
              scroll: {
                x: panned.scroll.x - gesture.deltaX / camera.zoom,
                y: panned.scroll.y - gesture.deltaY / camera.zoom,
              },
            },
            { x: gesture.centerX, y: gesture.centerY },
            camera.zoom * gesture.scale,
            ZOOM_BOUNDS,
          );
          camera.setZoom(next.zoom);
          camera.setScroll(next.scroll.x, next.scroll.y);
        }
        return;
      }
      if (this.extendBuild(pointer)) return;
      // Nothing is being built and no button is down: keep the ghost under
      // the cursor so the edge rule is legible before the first click. Touch
      // never reaches here, which is why the drag preview exists as well.
      if (this.panPointerId === undefined && this.isBuildArmed()) this.previewHover(pointer);
      if (this.panPointerId !== pointer.id || this.lastPanScreenPoint === undefined) return;
      const camera = this.cameras.main;
      camera.scrollX -= (pointer.x - this.lastPanScreenPoint.x) / camera.zoom;
      camera.scrollY -= (pointer.y - this.lastPanScreenPoint.y) / camera.zoom;
      this.lastPanScreenPoint = { x: pointer.x, y: pointer.y };
    });
    const finishPointer = (pointer: Phaser.Input.Pointer): void => {
      if (pointer.wasTouch) this.touchGestures.end(pointer.id);
      if (this.commitBuild(pointer)) return;
      if (pointer.wasTouch) return;
      if (this.panPointerId !== pointer.id) return;
      this.panPointerId = undefined;
      this.lastPanScreenPoint = undefined;
    };
    this.input.on('pointerup', finishPointer);
    this.input.on('pointerupoutside', finishPointer);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      this.tiles?.destroy();
      this.actors?.destroy();
      this.buildOverlay?.destroy();
      this.tiles = undefined;
      this.actors = undefined;
      this.buildOverlay = undefined;
    });

    // Art is not correctness: a batch that fails to load must leave a playable,
    // legible tile world rather than a blank screen.
    void this.loadActorAtlases();
  }

  public override update(time: number, delta: number): void {
    const camera = this.cameras.main;
    const speed = (PAN_SPEED_WORLD_UNITS_PER_MS * delta) / camera.zoom;
    const horizontal = Number(this.keyboard.isActive('camera.right')) - Number(this.keyboard.isActive('camera.left'));
    const vertical = Number(this.keyboard.isActive('camera.down')) - Number(this.keyboard.isActive('camera.up'));
    if (horizontal !== 0 || vertical !== 0) {
      camera.scrollX += horizontal * speed;
      camera.scrollY += vertical * speed;
    }

    // Disarming while a run is in progress, or while a ghost is showing,
    // must take the ghost away -- otherwise the panel says the tool is off
    // and the world still shows a wall about to appear.
    if (!this.isBuildArmed() && (this.buildPointerId !== undefined || this.buildSegments.length > 0)) {
      this.cancelBuild();
      this.buildSegments = [];
      this.hoveredEdge = undefined;
      this.buildOverlay?.clear();
    }

    const nowSeconds = time / 1000;
    const frame = this.feed.readFrame(nowSeconds);
    const range = this.visibleTiles();

    this.frameCameraOnFirstWorld(frame.world.loadedBounds);
    this.tiles?.update(frame, range);
    this.actors?.update(frame.actors, range, nowSeconds);
  }


  // ---- build tool ---------------------------------------------------
  //
  // The interaction is **modal**, and deliberately so. The alternative --
  // discriminating a build from a pan by how far the pointer travelled --
  // fails on the gesture that matters most here: laying a wall run *is* a
  // drag, so a threshold cannot tell the two apart without guessing, and a
  // guess that goes wrong either scrolls the world when you meant to build or
  // builds a wall when you meant to look around. Arming is one visible,
  // reversible toggle in the Build panel, and while it is off every gesture
  // keeps exactly the meaning it had before.
  //
  // Nothing that used to pan stops panning: the middle-drag, the keyboard and
  // the wheel are untouched at all times, and on touch the two-finger drag
  // pans and pinches whether or not a tool is armed. Only the one-finger
  // touch drag and the desktop left-drag change meaning, and only while
  // armed.

  private isBuildArmed(): boolean {
    return this.buildTool?.isArmed() === true;
  }

  private activeTouchCount(): number {
    return this.input.manager.pointers.filter((pointer) => pointer.isDown && pointer.wasTouch).length;
  }

  /**
   * The live camera, in the shape `src/rendering/camera/` transforms.
   *
   * One reader for all four call sites (wheel zoom, pinch zoom, pointer-to-
   * world and culling) so none of them can be left behind holding a stale
   * shape -- `viewport` became mandatory in #115 precisely because a
   * conversion that does not know the viewport size is wrong at every zoom
   * except 1.
   */
  private cameraState(): CameraState {
    const camera = this.cameras.main;
    return {
      scroll: { x: camera.scrollX, y: camera.scrollY },
      zoom: camera.zoom,
      viewport: { width: camera.width, height: camera.height },
    };
  }

  /**
   * The world point under a pointer.
   *
   * `pointer.x`/`pointer.y` are logical CSS pixels in canvas space, and the
   * main camera's viewport is the whole canvas, so they need no adjustment
   * before the transform. `tests/browser/camera-coordinates.spec.ts` drives a
   * real mouse at a real camera to check both halves of that sentence.
   */
  private worldPointOf(pointer: Phaser.Input.Pointer): { readonly x: number; readonly y: number } {
    return screenToWorld({ x: pointer.x, y: pointer.y }, this.cameraState());
  }

  private beginBuild(pointer: Phaser.Input.Pointer): void {
    // The *press point* is kept, not the edge it resolved to: a drag can still
    // change which axis the run lies on, and re-deriving from the original
    // point is what lets it do that without moving the tile the player aimed
    // at. See `edgeRunFromDrag`.
    this.buildPointerId = pointer.id;
    this.buildPress = this.worldPointOf(pointer);
    this.buildSegments = [pickEdgeAtWorld(this.buildPress)];
    this.paintBuildPreview();
  }

  /** True when the move belonged to a run in progress and the camera must not act on it. */
  private extendBuild(pointer: Phaser.Input.Pointer): boolean {
    if (this.buildPointerId !== pointer.id || this.buildPress === undefined) return false;
    this.buildSegments = edgeRunFromDrag(this.buildPress, this.worldPointOf(pointer));
    this.paintBuildPreview();
    return true;
  }

  /** True when the release completed a run. */
  private commitBuild(pointer: Phaser.Input.Pointer): boolean {
    if (this.buildPointerId !== pointer.id) return false;
    const segments = this.buildSegments;
    this.buildPointerId = undefined;
    this.buildPress = undefined;
    this.buildSegments = [];
    this.hoveredEdge = undefined;
    this.buildOverlay?.clear();
    this.buildTool?.target?.(undefined);
    if (segments.length > 0) this.buildTool?.place(segments);
    return true;
  }

  /** Abandons a run without placing anything -- a second finger, or disarming mid-gesture. */
  private cancelBuild(): void {
    if (this.buildPointerId === undefined) return;
    this.buildPointerId = undefined;
    this.buildPress = undefined;
    this.buildSegments = [];
    this.buildOverlay?.clear();
    this.buildTool?.target?.(undefined);
  }

  private previewHover(pointer: Phaser.Input.Pointer): void {
    const edge = pickEdgeAtWorld(this.worldPointOf(pointer));
    if (edgeTargetsEqual(edge, this.hoveredEdge)) return;
    this.hoveredEdge = edge;
    this.buildSegments = [edge];
    this.paintBuildPreview();
  }

  private paintBuildPreview(): void {
    this.buildOverlay?.update(this.buildSegments);
    this.buildTool?.target?.(this.buildSegments);
  }

  /** Sprite and layer counts, for a diagnostics overlay or a manual budget check. */
  public get rendererStats(): { readonly actors: number; readonly pooledSprites: number; readonly tileObjects: number } {
    const stats = this.actors?.stats;
    return {
      actors: stats?.visible ?? 0,
      pooledSprites: stats?.pooled ?? 0,
      tileObjects: this.tiles?.pooledObjectCount ?? 0,
    };
  }

  private visibleTiles(): TileRange {
    return visibleTileRange(visibleWorldBounds(this.cameraState()), 1);
  }

  /** Points the camera at the prison the first time one exists, then never again. */
  private frameCameraOnFirstWorld(
    bounds: { readonly minTileX: number; readonly minTileY: number; readonly maxTileX: number; readonly maxTileY: number } | undefined,
  ): void {
    if (this.framedOnWorld || bounds === undefined) return;
    this.framedOnWorld = true;
    this.cameras.main.centerOn(
      ((bounds.minTileX + bounds.maxTileX + 1) / 2) * TILE_SIZE_PX,
      ((bounds.minTileY + bounds.maxTileY + 1) / 2) * TILE_SIZE_PX,
    );
  }

  private async loadActorAtlases(): Promise<void> {
    try {
      const library = await this.loadAtlasLibrary();
      const index = AtlasFrameIndex.fromLibrary(library);
      await registerAtlasTextures(this, index);
      // The scene may have shut down while the batch was in flight.
      if (this.tiles === undefined) return;
      this.actors = new ActorLayer(this, index);
    } catch (error) {
      this.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
