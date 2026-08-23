import Phaser from 'phaser';
import { pickEdgeAtWorld } from '../../src/rendering/build/edge-picking';
import { screenToWorld, visibleWorldBounds, worldToScreen, type CameraState } from '../../src/rendering/camera';
import type {
  CameraProbe,
  ConversionSample,
  HarnessPoint,
  LockstateCameraHarness,
  PointerProbe,
} from './camera-harness-api';

/**
 * A real Phaser camera, in a real browser, for the one claim
 * `tests/unit/camera-coordinates.test.ts` structurally cannot make: that the
 * pure transforms in `src/rendering/camera/` agree with the Phaser build this
 * project actually installs.
 *
 * `docs/TESTING.md` keeps Phaser out of the default Vitest environment, and
 * the headless tests are therefore free to be internally consistent and
 * externally wrong -- which is what issue #115 was. Nothing in the repository
 * had ever compared the two, so the build cursor was displaced by
 * `origin x (1 / zoom - 1)` at every zoom except 1 and the whole suite stayed
 * green.
 *
 * The game config is deliberately the same shape as `src/main.ts`
 * (`Scale.RESIZE` and `CENTER_BOTH`), because two of the assumptions under
 * test -- that a pointer's coordinates are CSS pixels in canvas space, and
 * that the main camera's viewport is the whole canvas -- are properties of
 * that scale mode rather than of Phaser in general.
 */

const CANVAS_PARENT_ID = 'camera-harness-root';

interface PointerObservation {
  readonly pointer: HarnessPoint;
  readonly phaserWorld: HarnessPoint;
  readonly pureWorld: HarnessPoint;
}

let lastPointer: PointerObservation | undefined;

function cameraStateOf(camera: Phaser.Cameras.Scene2D.Camera): CameraState {
  return {
    scroll: { x: camera.scrollX, y: camera.scrollY },
    zoom: camera.zoom,
    viewport: { width: camera.width, height: camera.height },
  };
}

class CameraHarnessScene extends Phaser.Scene {
  public booted!: Promise<void>;
  private resolveBooted!: () => void;

  public constructor() {
    super({ key: 'camera-harness' });
    this.booted = new Promise<void>((resolve) => {
      this.resolveBooted = resolve;
    });
  }

  public create(): void {
    // Something must exist in the world for a screenshot to be meaningful if
    // this ever needs eyeballing; the camera maths does not depend on it.
    this.add.rectangle(0, 0, 64, 64, 0x2f6f4f).setOrigin(0, 0);

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      const camera = this.cameras.main;
      const phaserWorld = camera.getWorldPoint(pointer.x, pointer.y);
      lastPointer = {
        pointer: { x: pointer.x, y: pointer.y },
        phaserWorld: { x: phaserWorld.x, y: phaserWorld.y },
        pureWorld: screenToWorld({ x: pointer.x, y: pointer.y }, cameraStateOf(camera)),
      };
    });

    this.resolveBooted();
  }

  /**
   * Applies a camera state and waits for a real render.
   *
   * `getWorldPoint` reads `matrixCombined`, which `Camera#preRender` rebuilds
   * once per frame. Waiting for the frame rather than calling `preRender`
   * by hand keeps this the same code path the drawn game takes.
   */
  public async applyAndRender(zoom: number, scrollX: number, scrollY: number): Promise<void> {
    const camera = this.cameras.main;
    camera.setZoom(zoom);
    camera.setScroll(scrollX, scrollY);
    await new Promise<void>((resolve) => {
      this.game.events.once(Phaser.Core.Events.POST_RENDER, () => resolve());
    });
  }
}

const scene = new CameraHarnessScene();

new Phaser.Game({
  type: Phaser.AUTO,
  parent: CANVAS_PARENT_ID,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#0b0e12',
  scene: [scene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    antialias: true,
    roundPixels: false,
    pixelArt: false,
  },
});

function canvasOffset(): HarnessPoint {
  const canvas = document.querySelector('canvas');
  if (canvas === null) return { x: 0, y: 0 };
  const box = canvas.getBoundingClientRect();
  return { x: box.left, y: box.top };
}

const harness: LockstateCameraHarness = {
  async ready(): Promise<void> {
    await scene.booted;
  },

  async probe(state, screenPoints): Promise<CameraProbe> {
    await scene.applyAndRender(state.zoom, state.scrollX, state.scrollY);
    const camera = scene.cameras.main;
    const pure = cameraStateOf(camera);

    const samples: ConversionSample[] = screenPoints.map((screen) => {
      const phaserWorld = camera.getWorldPoint(screen.x, screen.y);
      const world = { x: phaserWorld.x, y: phaserWorld.y };
      return {
        screen,
        phaserWorld: world,
        pureWorld: screenToWorld(screen, pure),
        pureScreen: worldToScreen(world, pure),
        // The formula this project shipped before #115, kept here so the
        // spec can assert it is genuinely wrong rather than assert nothing.
        topLeftModelWorld: {
          x: camera.scrollX + screen.x / camera.zoom,
          y: camera.scrollY + screen.y / camera.zoom,
        },
      };
    });

    return {
      facts: {
        originX: camera.originX,
        originY: camera.originY,
        x: camera.x,
        y: camera.y,
        width: camera.width,
        height: camera.height,
        zoom: camera.zoom,
        scrollX: camera.scrollX,
        scrollY: camera.scrollY,
      },
      samples,
      phaserWorldView: {
        x: camera.worldView.x,
        y: camera.worldView.y,
        width: camera.worldView.width,
        height: camera.worldView.height,
      },
      pureBounds: visibleWorldBounds(pure),
    };
  },

  resetPointer(): void {
    lastPointer = undefined;
  },

  takePointer(): PointerProbe {
    const offset = canvasOffset();
    if (lastPointer === undefined) {
      const nowhere = { x: 0, y: 0 };
      return {
        seen: false,
        pointer: nowhere,
        clientOffset: offset,
        phaserWorld: nowhere,
        pureWorld: nowhere,
        edge: { tileX: 0, tileY: 0, edge: 'north' },
        phaserEdge: { tileX: 0, tileY: 0, edge: 'north' },
      };
    }
    return {
      seen: true,
      pointer: lastPointer.pointer,
      clientOffset: offset,
      phaserWorld: lastPointer.phaserWorld,
      pureWorld: lastPointer.pureWorld,
      edge: pickEdgeAtWorld(lastPointer.pureWorld),
      phaserEdge: pickEdgeAtWorld(lastPointer.phaserWorld),
    };
  },

  canvasOffset,
};

window.lockstateCameraHarness = harness;
