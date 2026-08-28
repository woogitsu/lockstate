import type { TilePosition } from '../world/coordinates';
import type { DoorAccessDenialReason } from './route-context';
import type { RegionId } from './region-graph';

export interface RouteSegment {
  readonly regionId: RegionId;
  /** Waypoints within this region, oldest first, including the tile the actor entered on. */
  readonly waypoints: readonly TilePosition[];
  /** The door crossed to enter this segment. Absent for the route's first segment. */
  readonly enteredViaDoorId?: string;
}

export interface Route {
  readonly segments: readonly RouteSegment[];
  readonly totalCost: number;
}

export type RouteFailureReason = 'invalid-origin' | 'invalid-destination' | 'unreachable' | 'permission-denied';

export interface RouteFailure {
  readonly reason: RouteFailureReason;
  /**
   * For `permission-denied`: one door along a physically possible path that
   * blocks this context, and why. A best-effort diagnostic (the first
   * blocking door found along the shortest permission-unaware path), not
   * an exhaustive list of every door that would need to change.
   */
  readonly blockedBy?: { readonly doorId: string; readonly reason: DoorAccessDenialReason };
}

export type RouteResult = { readonly ok: true; readonly route: Route } | { readonly ok: false; readonly failure: RouteFailure };

/**
 * A route's tiles, origin first and destination last, with the region
 * boundaries flattened away.
 *
 * `sliceIntoSegments` (`router.ts`) puts every waypoint in exactly one
 * segment -- a segment break is a change of region, not a repeated tile -- so
 * concatenating the segments reproduces the `origin..destination inclusive`
 * list `boundedLocalSearch` returned before it was sliced. That is the only
 * form a walker can use: `LocomotionStore.beginWalk` steps one tile at a time
 * and has no notion of a region.
 *
 * Written here rather than in the walker because the segment shape is this
 * module's, and a reader that flattened it by hand would be a second place
 * that has to know a segment does not repeat its predecessor's last tile.
 */
export function routeWaypoints(route: Route): readonly TilePosition[] {
  if (route.segments.length === 1) return route.segments[0]!.waypoints;
  const waypoints: TilePosition[] = [];
  for (const segment of route.segments) {
    for (const waypoint of segment.waypoints) waypoints.push(waypoint);
  }
  return waypoints;
}
