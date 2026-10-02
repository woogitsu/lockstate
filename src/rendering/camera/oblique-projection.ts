import type { CameraState, CameraViewport, Point, WorldBounds } from './coordinates';

/**
 * Presentation-only pose for the ground plane. World x/y still have exactly
 * the same meaning as in the top-down renderer and simulation grid. `target`
 * is the ground point below the viewport centre, not a saved world property.
 */
export interface ObliqueCameraState {
  readonly target: Point;
  readonly viewport: CameraViewport;
  readonly zoom: number;
  readonly yawRadians: number;
  /** Above the horizon, up to straight overhead. Zero has no ground inverse. */
  readonly elevationRadians: number;
}

export interface WorldPoint3D extends Point {
  /** Positive height above the ground plane, in the same units as x/y. */
  readonly z?: number;
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
}

function validate(camera: ObliqueCameraState): void {
  assertFinite(camera.target.x, 'Camera target x');
  assertFinite(camera.target.y, 'Camera target y');
  assertFinite(camera.yawRadians, 'Camera yaw');
  if (!Number.isFinite(camera.zoom) || camera.zoom <= 0) throw new RangeError('Camera zoom must be positive and finite.');
  if (!Number.isFinite(camera.viewport.width) || camera.viewport.width <= 0) throw new RangeError('Viewport width must be positive and finite.');
  if (!Number.isFinite(camera.viewport.height) || camera.viewport.height <= 0) throw new RangeError('Viewport height must be positive and finite.');
  if (!Number.isFinite(camera.elevationRadians) || camera.elevationRadians <= 0 || camera.elevationRadians > Math.PI / 2) {
    throw new RangeError('Camera elevation must be above the horizon and at most overhead.');
  }
}

/**
 * Axonometric projection of a square-grid world. Yaw rotates the ground;
 * elevation compresses ground depth and exposes object height. This does not
 * render any Phaser object by itself: every visible layer and hit test must
 * adopt the same transform before the player can change angle.
 */
export function groundToScreen(world: WorldPoint3D, camera: ObliqueCameraState): Point {
  validate(camera);
  assertFinite(world.x, 'World x');
  assertFinite(world.y, 'World y');
  const height = world.z ?? 0;
  assertFinite(height, 'World z');
  const dx = world.x - camera.target.x;
  const dy = world.y - camera.target.y;
  const cosYaw = Math.cos(camera.yawRadians);
  const sinYaw = Math.sin(camera.yawRadians);
  const across = cosYaw * dx - sinYaw * dy;
  const depth = sinYaw * dx + cosYaw * dy;
  return {
    x: camera.viewport.width / 2 + across * camera.zoom,
    y: camera.viewport.height / 2 + (depth * Math.sin(camera.elevationRadians) - height * Math.cos(camera.elevationRadians)) * camera.zoom,
  };
}

/** Ground hit for a pointer; elevated wall faces must never replace this hit. */
export function screenToGround(screen: Point, camera: ObliqueCameraState): Point {
  validate(camera);
  assertFinite(screen.x, 'Screen x');
  assertFinite(screen.y, 'Screen y');
  const across = (screen.x - camera.viewport.width / 2) / camera.zoom;
  const depth = (screen.y - camera.viewport.height / 2) / (camera.zoom * Math.sin(camera.elevationRadians));
  const cosYaw = Math.cos(camera.yawRadians);
  const sinYaw = Math.sin(camera.yawRadians);
  return {
    x: camera.target.x + cosYaw * across + sinYaw * depth,
    y: camera.target.y - sinYaw * across + cosYaw * depth,
  };
}

/** Axis-aligned world bounds containing all four projected viewport corners. */
export function visibleGroundBounds(camera: ObliqueCameraState): WorldBounds {
  const corners = [
    screenToGround({ x: 0, y: 0 }, camera),
    screenToGround({ x: camera.viewport.width, y: 0 }, camera),
    screenToGround({ x: 0, y: camera.viewport.height }, camera),
    screenToGround({ x: camera.viewport.width, y: camera.viewport.height }, camera),
  ];
  return {
    left: Math.min(...corners.map((corner) => corner.x)),
    top: Math.min(...corners.map((corner) => corner.y)),
    right: Math.max(...corners.map((corner) => corner.x)),
    bottom: Math.max(...corners.map((corner) => corner.y)),
  };
}

/** Turn about the pointer so the selected square stays beneath it. */
export function changeObliquePoseAtScreenPoint(
  camera: ObliqueCameraState,
  screen: Point,
  yawRadians: number,
  elevationRadians: number,
): ObliqueCameraState {
  const before = screenToGround(screen, camera);
  const candidate = { ...camera, yawRadians, elevationRadians };
  const after = screenToGround(screen, candidate);
  return {
    ...candidate,
    target: { x: camera.target.x + before.x - after.x, y: camera.target.y + before.y - after.y },
  };
}

/** Translate the camera so the grabbed ground point follows a middle drag. */
export function panObliqueGroundAnchorToScreen(
  camera: ObliqueCameraState,
  groundAnchor: Point,
  screen: Point,
): ObliqueCameraState {
  const underPointer = screenToGround(screen, camera);
  return {
    ...camera,
    target: {
      x: camera.target.x + groundAnchor.x - underPointer.x,
      y: camera.target.y + groundAnchor.y - underPointer.y,
    },
  };
}

/** Preserve the exact top-down framing when the oblique renderer first mounts. */
export function obliqueFromTopDown(camera: CameraState): ObliqueCameraState {
  return {
    target: {
      x: camera.scroll.x + camera.viewport.width / 2,
      y: camera.scroll.y + camera.viewport.height / 2,
    },
    viewport: camera.viewport,
    zoom: camera.zoom,
    yawRadians: 0,
    elevationRadians: Math.PI / 2,
  };
}
