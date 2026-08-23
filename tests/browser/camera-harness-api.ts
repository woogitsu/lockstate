import type { WorldBounds } from '../../src/rendering/camera';

/**
 * The contract between the in-page camera harness (`camera-harness.ts`) and
 * `camera-coordinates.spec.ts`. Every value crossing `page.evaluate` must be
 * structured-clone-safe, so the harness returns plain numbers rather than
 * Phaser cameras or `Vector2`s.
 */

export interface HarnessPoint {
  readonly x: number;
  readonly y: number;
}

export interface HarnessRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * What the real camera reports about itself.
 *
 * The pure transforms in `src/rendering/camera/` assume all four of these:
 * an origin at the middle of the viewport, and a viewport whose top-left
 * corner is the canvas's. The spec asserts them rather than trusting them,
 * because #115 was a wrong assumption about exactly this.
 */
export interface CameraFacts {
  readonly originX: number;
  readonly originY: number;
  /** Viewport offset within the canvas. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly zoom: number;
  readonly scrollX: number;
  readonly scrollY: number;
}

/** One screen point converted by both the real camera and the pure functions. */
export interface ConversionSample {
  readonly screen: HarnessPoint;
  /** `camera.getWorldPoint`, which inverts the full camera matrix. */
  readonly phaserWorld: HarnessPoint;
  /** `screenToWorld` from `src/rendering/camera/`. */
  readonly pureWorld: HarnessPoint;
  /** `worldToScreen` applied to `phaserWorld`; should return `screen`. */
  readonly pureScreen: HarnessPoint;
  /** What the shipped-and-wrong top-left zoom model would have answered. */
  readonly topLeftModelWorld: HarnessPoint;
}

export interface CameraProbe {
  readonly facts: CameraFacts;
  readonly samples: readonly ConversionSample[];
  /** Phaser's own `camera.worldView`. */
  readonly phaserWorldView: HarnessRect;
  /** `visibleWorldBounds` from `src/rendering/camera/`. */
  readonly pureBounds: WorldBounds;
}

/** What a real mouse move delivered, and where the build tool would put a wall. */
export interface PointerProbe {
  readonly seen: boolean;
  /** `pointer.x`/`pointer.y` as Phaser delivered them. */
  readonly pointer: HarnessPoint;
  /** Where the page was actually clicked, in CSS pixels from the canvas corner. */
  readonly clientOffset: HarnessPoint;
  readonly phaserWorld: HarnessPoint;
  readonly pureWorld: HarnessPoint;
  /** The tile edge `pickEdgeAtWorld` resolves the pure answer to. */
  readonly edge: { readonly tileX: number; readonly tileY: number; readonly edge: string };
  /** The tile edge the real camera's answer resolves to. */
  readonly phaserEdge: { readonly tileX: number; readonly tileY: number; readonly edge: string };
}

export interface LockstateCameraHarness {
  /** Resolves once the game has booted and the scene owns a live camera. */
  ready(): Promise<void>;
  /**
   * Applies a camera state, lets a real frame render so Phaser rebuilds its
   * matrix, and reports both answers for each screen point.
   */
  probe(state: { readonly zoom: number; readonly scrollX: number; readonly scrollY: number }, screenPoints: readonly HarnessPoint[]): Promise<CameraProbe>;
  /** Forgets the last pointer event, so a following move is unambiguous. */
  resetPointer(): void;
  takePointer(): PointerProbe;
  canvasOffset(): HarnessPoint;
}

declare global {
  interface Window {
    lockstateCameraHarness: LockstateCameraHarness;
  }
}
