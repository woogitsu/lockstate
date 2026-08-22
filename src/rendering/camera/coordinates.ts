export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface CameraViewport {
  readonly width: number;
  readonly height: number;
}

export interface CameraState {
  /** World coordinate at the viewport's top-left corner. */
  readonly scroll: Point;
  readonly zoom: number;
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

function assertFinitePoint(point: Point): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError('Coordinates must be finite.');
  }
}

function assertPositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be positive and finite.`);
}

export function clampZoom(zoom: number, bounds: ZoomBounds): number {
  assertPositive(bounds.min, 'Minimum zoom');
  assertPositive(bounds.max, 'Maximum zoom');
  if (bounds.min > bounds.max) throw new RangeError('Minimum zoom cannot exceed maximum zoom.');
  if (!Number.isFinite(zoom)) throw new RangeError('Zoom must be finite.');
  return Math.min(bounds.max, Math.max(bounds.min, zoom));
}

export function screenToWorld(screen: Point, camera: CameraState): Point {
  assertFinitePoint(screen);
  assertFinitePoint(camera.scroll);
  assertPositive(camera.zoom, 'Camera zoom');
  return { x: camera.scroll.x + screen.x / camera.zoom, y: camera.scroll.y + screen.y / camera.zoom };
}

export function worldToScreen(world: Point, camera: CameraState): Point {
  assertFinitePoint(world);
  assertFinitePoint(camera.scroll);
  assertPositive(camera.zoom, 'Camera zoom');
  return { x: (world.x - camera.scroll.x) * camera.zoom, y: (world.y - camera.scroll.y) * camera.zoom };
}

export function visibleWorldBounds(camera: CameraState, viewport: CameraViewport): WorldBounds {
  assertPositive(viewport.width, 'Viewport width');
  assertPositive(viewport.height, 'Viewport height');
  const topLeft = screenToWorld({ x: 0, y: 0 }, camera);
  const bottomRight = screenToWorld({ x: viewport.width, y: viewport.height }, camera);
  return { left: topLeft.x, top: topLeft.y, right: bottomRight.x, bottom: bottomRight.y };
}

/** Changes zoom while retaining the world point below a screen-space cursor. */
export function zoomAtScreenPoint(
  camera: CameraState,
  screenPoint: Point,
  requestedZoom: number,
  bounds: ZoomBounds,
): CameraState {
  const worldPoint = screenToWorld(screenPoint, camera);
  const zoom = clampZoom(requestedZoom, bounds);
  return {
    zoom,
    scroll: {
      x: worldPoint.x - screenPoint.x / zoom,
      y: worldPoint.y - screenPoint.y / zoom,
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
