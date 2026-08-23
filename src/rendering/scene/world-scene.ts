import Phaser from 'phaser';
import {
  KeyboardInputAdapter,
  TouchGestureTracker,
  loadInputSettings,
} from '../../input';
import { AtlasFrameIndex } from '../assets/atlas-frame-index';
import { AtlasLibrary } from '../assets/atlas-library';
import { visibleWorldBounds, zoomAtScreenPoint } from '../camera';
import type { RenderFeed } from '../feed/render-feed';
import { ActorLayer } from '../phaser/actor-layer';
import { registerAtlasTextures } from '../phaser/atlas-textures';
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
}

export class WorldScene extends Phaser.Scene {
  private feed: RenderFeed;
  private readonly loadAtlasLibrary: () => Promise<AtlasLibrary>;
  private readonly onError: (error: Error) => void;

  private readonly keyboard = new KeyboardInputAdapter(
    loadInputSettings(window.localStorage).keyboardBindings,
    () => ['world'],
  );
  private readonly touchGestures = new TouchGestureTracker();
  private panPointerId: number | undefined;
  private lastPanScreenPoint: { readonly x: number; readonly y: number } | undefined;

  private tiles: TileLayer | undefined;
  private actors: ActorLayer | undefined;
  private framedOnWorld = false;

  public constructor(options: WorldSceneOptions) {
    super('WorldScene');
    this.feed = options.feed;
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
          { scroll: { x: camera.scrollX, y: camera.scrollY }, zoom: camera.zoom },
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
          const camera = this.cameras.main;
          camera.scrollX -= gesture.deltaX / camera.zoom;
          camera.scrollY -= gesture.deltaY / camera.zoom;
        } else if (gesture?.kind === 'pinch') {
          const camera = this.cameras.main;
          const next = zoomAtScreenPoint(
            { scroll: { x: camera.scrollX, y: camera.scrollY }, zoom: camera.zoom },
            { x: gesture.centerX, y: gesture.centerY },
            camera.zoom * gesture.scale,
            ZOOM_BOUNDS,
          );
          camera.setZoom(next.zoom);
          camera.setScroll(next.scroll.x, next.scroll.y);
        }
        return;
      }
      if (this.panPointerId !== pointer.id || this.lastPanScreenPoint === undefined) return;
      const camera = this.cameras.main;
      camera.scrollX -= (pointer.x - this.lastPanScreenPoint.x) / camera.zoom;
      camera.scrollY -= (pointer.y - this.lastPanScreenPoint.y) / camera.zoom;
      this.lastPanScreenPoint = { x: pointer.x, y: pointer.y };
    });
    const finishPointer = (pointer: Phaser.Input.Pointer): void => {
      if (pointer.wasTouch) {
        this.touchGestures.end(pointer.id);
        return;
      }
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
      this.tiles = undefined;
      this.actors = undefined;
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

    const nowSeconds = time / 1000;
    const frame = this.feed.readFrame(nowSeconds);
    const range = this.visibleTiles();

    this.frameCameraOnFirstWorld(frame.world.loadedBounds);
    this.tiles?.update(frame, range);
    this.actors?.update(frame.actors, range, nowSeconds);
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
    const camera = this.cameras.main;
    return visibleTileRange(
      visibleWorldBounds(
        { scroll: { x: camera.scrollX, y: camera.scrollY }, zoom: camera.zoom },
        { width: camera.width, height: camera.height },
      ),
      1,
    );
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
