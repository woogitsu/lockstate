import type { Point, WorldBounds } from './coordinates';
import { groundToScreen, screenToGround, type ObliqueCameraState } from './oblique-projection';

export type ObliqueFitMode = 'cursor-origin' | 'cursor-center' | 'pan-locked';

export interface ScreenBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface ObliqueFitRequest {
  readonly camera: ObliqueCameraState;
  /** Floor footprint in world pixels, before any visual wall height. */
  readonly groundBounds: WorldBounds;
  /** Unobscured canvas area, excluding HUD panels. */
  readonly safeScreenBounds: ScreenBounds;
  readonly cursorScreen: Point;
  readonly mode: ObliqueFitMode;
}

export interface ObliqueFitResult {
  readonly mode: ObliqueFitMode;
  readonly camera: ObliqueCameraState;
  readonly projectedBounds: ScreenBounds;
  /** Largest zoom that could fit while respecting this mode's anchor. */
  readonly requiredZoom: number;
  /** False when the camera's minimum 0.2 zoom cannot fit the whole footprint. */
  readonly fits: boolean;
}

const MIN_ZOOM = 0.2;

function corners(bounds: WorldBounds): readonly Point[] {
  return [
    { x: bounds.left, y: bounds.top }, { x: bounds.right, y: bounds.top },
    { x: bounds.right, y: bounds.bottom }, { x: bounds.left, y: bounds.bottom },
  ];
}

function projectedBounds(points: readonly Point[]): ScreenBounds {
  return {
    left: Math.min(...points.map(point => point.x)),
    top: Math.min(...points.map(point => point.y)),
    right: Math.max(...points.map(point => point.x)),
    bottom: Math.max(...points.map(point => point.y)),
  };
}

/** Pose that maps one immutable world point to one screen point. */
function anchoredPose(camera: ObliqueCameraState, world: Point, screen: Point, zoom: number): ObliqueCameraState {
  const referencePose = { ...camera, target: world, zoom };
  const currentGround = screenToGround(screen, referencePose);
  return {
    ...referencePose,
    target: { x: world.x * 2 - currentGround.x, y: world.y * 2 - currentGround.y },
  };
}

/**
 * Compute three honest Full HD preview candidates without choosing UI policy.
 * A cursor-anchored candidate reports `fits: false` at an edge if no legal zoom
 * can show the full template; it never calls a clipped preview "fitted".
 */
export function computeObliqueFit(request: ObliqueFitRequest): ObliqueFitResult {
  const { camera, groundBounds: bounds, safeScreenBounds: safe, cursorScreen, mode } = request;
  if (![bounds.left, bounds.top, bounds.right, bounds.bottom, safe.left, safe.top, safe.right,
    safe.bottom, cursorScreen.x, cursorScreen.y].every(Number.isFinite) ||
    bounds.right <= bounds.left || bounds.bottom <= bounds.top ||
    safe.right <= safe.left || safe.bottom <= safe.top) throw new RangeError('Fit bounds must be finite, positive rectangles.');

  const worldCorners = corners(bounds);
  const worldCentre = { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
  const safeCentre = { x: (safe.left + safe.right) / 2, y: (safe.top + safe.bottom) / 2 };
  const anchorWorld = mode === 'cursor-origin' ? screenToGround(cursorScreen, camera) : worldCentre;
  const anchorScreen = mode === 'pan-locked' ? safeCentre : cursorScreen;
  const unitPose = anchoredPose(camera, anchorWorld, anchorScreen, 1);
  const unitPoints = worldCorners.map(point => groundToScreen(point, unitPose));
  let limit = Number.POSITIVE_INFINITY;
  if (mode === 'pan-locked') {
    const extent = projectedBounds(unitPoints);
    limit = Math.min((safe.right - safe.left) / (extent.right - extent.left),
      (safe.bottom - safe.top) / (extent.bottom - extent.top));
  } else if (anchorScreen.x < safe.left || anchorScreen.x > safe.right ||
      anchorScreen.y < safe.top || anchorScreen.y > safe.bottom) {
    limit = 0;
  } else {
    for (const point of unitPoints) {
      const dx = point.x - anchorScreen.x;
      const dy = point.y - anchorScreen.y;
      if (dx > 0) limit = Math.min(limit, (safe.right - anchorScreen.x) / dx);
      if (dx < 0) limit = Math.min(limit, (safe.left - anchorScreen.x) / dx);
      if (dy > 0) limit = Math.min(limit, (safe.bottom - anchorScreen.y) / dy);
      if (dy < 0) limit = Math.min(limit, (safe.top - anchorScreen.y) / dy);
    }
  }

  const requiredZoom = Math.max(0, limit);
  const zoom = Math.max(MIN_ZOOM, Math.min(camera.zoom, requiredZoom));
  const fitted = anchoredPose(camera, anchorWorld, anchorScreen, zoom);
  const screen = projectedBounds(worldCorners.map(point => groundToScreen(point, fitted)));
  const tolerance = 0.01;
  return {
    mode, camera: fitted, projectedBounds: screen, requiredZoom,
    fits: requiredZoom >= MIN_ZOOM && screen.left >= safe.left - tolerance &&
      screen.top >= safe.top - tolerance && screen.right <= safe.right + tolerance &&
      screen.bottom <= safe.bottom + tolerance,
  };
}
