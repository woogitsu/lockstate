export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Camera viewport size in logical CSS pixels. */
export interface CameraViewport {
  readonly width: number;
  readonly height: number;
}

export interface CameraState {
  /**
   * Phaser's `scrollX`/`scrollY`.
   *
   * This is *not* the world coordinate at the viewport's top-left corner
   * unless `zoom` is exactly 1. Phaser keeps `scroll + viewport / 2` as the
   * world point at the viewport *centre* at every zoom
   * (`BaseCamera#midPoint`, set in `Camera#preRender` from
   * `scroll + width * 0.5`), so the world point at the corner moves as the
   * player zooms. Ask `visibleWorldBounds` when the corner is what is wanted.
   */
  readonly scroll: Point;
  /** Positive screen pixels per world unit. */
  readonly zoom: number;
  /**
   * Carried in the state rather than passed alongside it because every
   * transform below needs it: zoom scales about the middle of the viewport,
   * so a screen-to-world conversion that does not know how big the viewport
   * is cannot be correct at any zoom other than 1. Issue #115 was exactly
   * that, and a caller could not forget the argument if the type would not
   * compile without it.
   */
  readonly viewport: CameraViewport;
}

export interface WorldBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface ZoomBounds {
  readonly min: number;
  readonly max: number;
}

/**
 * The point zoom scales about, as a fraction of the viewport.
 *
 * Phaser's `BaseCamera` defaults `originX` and `originY` to `0.5` — the
 * middle of the viewport — and nothing in this project changes them. A
 * constant rather than a parameter, because no caller has a reason to vary
 * it, and `tests/browser/camera-coordinates.spec.ts` reads `originX`/`originY`
 * off the real camera and fails if they ever stop matching this value.
 */
const CAMERA_ORIGIN_RATIO = 0.5;

function assertFinitePoint(point: Point): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError('Coordinates must be finite.');
  }
}

function assertPositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be positive and finite.`);
}

/**
 * Where in the viewport zoom scales about, in screen pixels.
 *
 * Validates the camera as a whole, so every public transform below gets the
 * same rejection of a zero-sized viewport, a non-finite scroll or a
 * non-positive zoom.
 */
function cameraOrigin(camera: CameraState): Point {
  assertFinitePoint(camera.scroll);
  assertPositive(camera.zoom, 'Camera zoom');
  assertPositive(camera.viewport.width, 'Viewport width');
  assertPositive(camera.viewport.height, 'Viewport height');
  return {
    x: camera.viewport.width * CAMERA_ORIGIN_RATIO,
    y: camera.viewport.height * CAMERA_ORIGIN_RATIO,
  };
}

export function clampZoom(zoom: number, bounds: ZoomBounds): number {
  assertPositive(bounds.min, 'Minimum zoom');
  assertPositive(bounds.max, 'Maximum zoom');
  if (bounds.min > bounds.max) throw new RangeError('Minimum zoom cannot exceed maximum zoom.');
  if (!Number.isFinite(zoom)) throw new RangeError('Zoom must be finite.');
  return Math.min(bounds.max, Math.max(bounds.min, zoom));
}

/**
 * The world point under a point in the camera's viewport.
 *
 * `screen` is in logical CSS pixels relative to the viewport's top-left
 * corner. The main camera's viewport is the whole canvas (`camera.x` and
 * `camera.y` are 0 and `Scale.RESIZE` keeps its size equal to the canvas), so
 * a Phaser pointer's `x`/`y` can be handed over unchanged — a claim the
 * browser spec asserts against a real camera rather than assuming.
 *
 * Zoom scales about the middle of the viewport, not its corner, which is why
 * the origin appears twice: the offset from the origin shrinks with zoom
 * while the origin itself does not move. At zoom 1 the two origin terms
 * cancel exactly, which is why #115 was invisible until a player used the
 * scroll wheel.
 */
export function screenToWorld(screen: Point, camera: CameraState): Point {
  assertFinitePoint(screen);
  const origin = cameraOrigin(camera);
  return {
    x: camera.scroll.x + origin.x + (screen.x - origin.x) / camera.zoom,
    y: camera.scroll.y + origin.y + (screen.y - origin.y) / camera.zoom,
  };
}

/** Inverse of `screenToWorld`, in the same viewport-relative CSS pixels. */
export function worldToScreen(world: Point, camera: CameraState): Point {
  assertFinitePoint(world);
  const origin = cameraOrigin(camera);
  return {
    x: (world.x - camera.scroll.x - origin.x) * camera.zoom + origin.x,
    y: (world.y - camera.scroll.y - origin.y) * camera.zoom + origin.y,
  };
}

/**
 * The world rectangle the viewport shows.
 *
 * Equal to Phaser's own `camera.worldView`, which it computes from
 * `midPoint ± viewport / (2 * zoom)`; the browser spec asserts that equality
 * on a real camera so this cannot drift from the renderer that actually draws.
 */
export function visibleWorldBounds(camera: CameraState): WorldBounds {
  const topLeft = screenToWorld({ x: 0, y: 0 }, camera);
  const bottomRight = screenToWorld({ x: camera.viewport.width, y: camera.viewport.height }, camera);
  return { left: topLeft.x, top: topLeft.y, right: bottomRight.x, bottom: bottomRight.y };
}

/**
 * Changes zoom while retaining the world point below a screen-space cursor.
 *
 * Solves `screenToWorld(screenPoint, result) === screenToWorld(screenPoint,
 * camera)` for the new scroll. The origin terms do not cancel here either:
 * anchoring on the cursor means undoing the shift that changing zoom applies
 * about the viewport's middle.
 */
export function zoomAtScreenPoint(
  camera: CameraState,
  screenPoint: Point,
  requestedZoom: number,
  bounds: ZoomBounds,
): CameraState {
  const worldPoint = screenToWorld(screenPoint, camera);
  const origin = cameraOrigin(camera);
  const zoom = clampZoom(requestedZoom, bounds);
  return {
    zoom,
    viewport: camera.viewport,
    scroll: {
      x: worldPoint.x - origin.x - (screenPoint.x - origin.x) / zoom,
      y: worldPoint.y - origin.y - (screenPoint.y - origin.y) / zoom,
    },
  };
}

export function tileRangeInBounds(bounds: WorldBounds): { readonly minX: number; readonly maxX: number; readonly minY: number; readonly maxY: number } {
  return {
    minX: Math.floor(bounds.left),
    maxX: Math.ceil(bounds.right),
    minY: Math.floor(bounds.top),
    maxY: Math.ceil(bounds.bottom),
  };
}
