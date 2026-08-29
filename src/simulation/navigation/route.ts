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
