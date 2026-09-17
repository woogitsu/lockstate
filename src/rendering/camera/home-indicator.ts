import { type CameraState, type Point, type WorldBounds, visibleWorldBounds, worldToScreen } from './coordinates';

/**
 * Where to draw the "your prison is that way" marker, and which way it points.
 *
 * Screen-space, in the same viewport-relative CSS pixels `worldToScreen`
 * answers in, because the marker is chrome pinned to the viewport rather than
 * a thing standing in the world: it has to stay on screen precisely when the
 * world it refers to is not.
 */
export interface HomeIndicator {
  /** On the inset ring, on the ray from the viewport centre towards the prison. */
  readonly position: Point;
  /**
   * Radians, `atan2(dy, dx)` in screen space -- `0` pointing right, growing
   * clockwise because screen Y grows downwards.
   */
  readonly angleRadians: number;
}

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite.`);
}

/**
 * The marker for a prison that has left the viewport entirely (issue #794).
 *
 * `undefined` whenever any part of `target` is on screen, which is the whole
 * claim the marker makes: it is drawn exactly when the world the player owns
 * cannot be seen, and it stops the moment a single world unit of it can. That
 * is why the test is an intersection of `target` with `visibleWorldBounds` and
 * not a distance from the camera -- a prison larger than the viewport is one
 * the camera can be *inside*, with the centre far away and nothing to point at.
 *
 * **Why the marker rather than a pan clamp**, since this function is where that
 * choice is implemented: a clamp would have to stop the camera at some bound,
 * and every bound available here is the *materialised* world
 * (`WorldRenderView.loadedBounds`), which is smaller than the viewport for most
 * of a session's first hour -- a 32-tile starter chunk is 2,048 world units
 * against the 6,400 a 1280px viewport shows at `ZOOM_BOUNDS.min`. A clamp to a
 * rectangle smaller than the view either does nothing or pins the camera
 * still, and in both cases it takes away the pan over unowned land that
 * building outward needs (a build gesture reaches the simulation through
 * `screenToWorld`, so a tile the camera cannot reach is a tile the player
 * cannot build on). The marker removes the *lostness* without removing the
 * pan. `docs/CAMERA.md` and `world-scene.ts`'s header both record that the
 * camera is presentation; nothing here reads back into the simulation.
 *
 * @param inset How far inside the viewport edge the marker rides, in screen
 *   pixels, so the glyph is drawn whole rather than half off the canvas.
 */
export function offscreenHomeIndicator(camera: CameraState, target: WorldBounds, inset: number): HomeIndicator | undefined {
  assertFinite(target.left, 'Target left');
  assertFinite(target.top, 'Target top');
  assertFinite(target.right, 'Target right');
  assertFinite(target.bottom, 'Target bottom');
  if (target.right < target.left || target.bottom < target.top) throw new RangeError('Target bounds are inverted.');
  assertFinite(inset, 'Inset');
  if (inset < 0) throw new RangeError('Inset must not be negative.');

  const view = visibleWorldBounds(camera);
  const offscreen = target.right < view.left || target.left > view.right || target.bottom < view.top || target.top > view.bottom;
  if (!offscreen) return undefined;

  const centre = worldToScreen({ x: (target.left + target.right) / 2, y: (target.top + target.bottom) / 2 }, camera);
  const originX = camera.viewport.width / 2;
  const originY = camera.viewport.height / 2;
  const dx = centre.x - originX;
  const dy = centre.y - originY;
  // Unreachable while `offscreen` holds -- the centre of a rectangle that is
  // wholly outside the view cannot be the middle of the view -- but a zero
  // vector has no direction, and a marker with no direction is the state this
  // issue is about.
  if (dx === 0 && dy === 0) return undefined;

  const reachX = Math.max(0, originX - inset);
  const reachY = Math.max(0, originY - inset);
  const scaleX = dx === 0 ? Number.POSITIVE_INFINITY : reachX / Math.abs(dx);
  const scaleY = dy === 0 ? Number.POSITIVE_INFINITY : reachY / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);

  return {
    position: { x: originX + dx * scale, y: originY + dy * scale },
    angleRadians: Math.atan2(dy, dx),
  };
}
