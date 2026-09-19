import type { SparseWorld } from '../world/sparse-world';
import { tileKey, type TilePosition } from '../world/coordinates';
import { DoorRegistry } from './door';
import { boundedLocalSearch, type SearchStats } from './local-search';
import { type NavigationGraph, type Portal, type RegionId, resolveEdge } from './region-graph';
import { runRegionDijkstra } from './region-dijkstra';
import { checkDoorAccess, type DoorAccessDenialReason, type RouteContext } from './route-context';
import type { Route, RouteResult, RouteSegment } from './route';

export type { SearchStats } from './local-search';

/**
 * Dijkstra over the region/portal graph. `isPortalAllowed` is the only
 * thing that differs between the permission-aware search and the
 * physical-only fallback used to produce a `permission-denied` diagnosis
 * (see `findRoute`) -- both walk the identical graph and tie-break
 * identically, so results stay deterministic and comparable. Delegates its
 * search core to `region-dijkstra.ts`'s `runRegionDijkstra`, shared with
 * `flow-field.ts`'s all-targets variant.
 *
 * **Rooted at the destination, walked from the origin** (#360), which is the
 * one thing that makes a shared `RegionFlowField` the same plan this function
 * computes rather than merely an equally expensive one:
 *
 * - Total cost is symmetric, so an origin-rooted and a destination-rooted
 *   search agree on `dist` -- but not on `prevPortal`. A relaxation is a
 *   strict improvement (`region-dijkstra.ts`), so among equal-cost
 *   predecessors the recorded one is whichever was relaxed first, and "first"
 *   is frontier order *measured from the search's own source*. Rooted at the
 *   origin, the destination's predecessor is chosen by distance-from-origin;
 *   rooted at the destination, the origin's successor is chosen by
 *   distance-from-destination. Those are different quantities, so the two
 *   searches picked different doors whenever two region routes tied -- 64 of
 *   256 origin/destination pairs on a four-room ring, 20 of them at strictly
 *   higher cost. `flow-field.ts` can only be rooted at the destination (that
 *   is what makes one pass answer for every origin), so this is the end that
 *   had to move.
 * - A per-portal tie-break (record the smaller door id among equal-cost
 *   relaxations) does *not* close it: rooted at the origin that rule picks the
 *   cheapest **last** hop of a tied path, rooted at the destination it picks
 *   the cheapest **first** hop, and a path whose first hop is canonically
 *   smaller need not be the path whose last hop is. Rooting both searches at
 *   the same end is the fix; a rule stated over door ids is not.
 * - The early exit does not weaken the equivalence. `stopAt` breaks when the
 *   origin is dequeued, and every region on the returned chain has a
 *   *strictly* smaller distance-to-destination than the origin (each hop costs
 *   more than zero), so each was dequeued -- and had its predecessor
 *   finalised, since relaxation skips visited regions -- before the break. The
 *   chain is therefore identical to the one a full field records.
 *
 * `origin`/`destination` keep their caller-facing meaning and the returned
 * portals are still ordered origin -> destination; only the search direction
 * is reversed, so no `reverse()` is needed to produce that order.
 */
function dijkstraRegionPath(
  graph: NavigationGraph,
  doors: DoorRegistry,
  origin: RegionId,
  destination: RegionId,
  isPortalAllowed: (portal: Portal) => boolean,
  stats?: SearchStats,
  doorDependencies?: Set<string>,
): readonly Portal[] | undefined {
  if (origin === destination) return [];

  const { dist, prevPortal } = runRegionDijkstra(graph, doors, destination, isPortalAllowed, stats, origin, doorDependencies);
  if (!dist.has(origin)) return undefined;

  const path: Portal[] = [];
  let cursor = origin;
  while (cursor !== destination) {
    const portal = prevPortal.get(cursor);
    if (portal === undefined) return undefined; // invariant: dist.has(origin) guarantees a recorded predecessor chain to the destination
    path.push(portal);
    cursor = portal.regionA === cursor ? portal.regionB : portal.regionA;
  }
  return path;
}

function findBlockingDoor(
  physicalPath: readonly Portal[],
  doors: DoorRegistry,
  context: RouteContext,
): { readonly doorId: string; readonly reason: DoorAccessDenialReason } | undefined {
  for (const portal of physicalPath) {
    const door = doors.getById(portal.doorId);
    if (door === undefined) continue;
    const access = checkDoorAccess(door, context);
    if (!access.allowed) return { doorId: door.id, reason: access.reason };
  }
  return undefined;
}

/** Exported for `flow-field.ts`, which slices its own bounded-search waypoints into the same segment shape. */
export function sliceIntoSegments(
  world: SparseWorld,
  doors: DoorRegistry,
  graph: NavigationGraph,
  waypoints: readonly TilePosition[],
): readonly RouteSegment[] {
  const segments: RouteSegment[] = [];
  let currentRegionId: RegionId | undefined;
  let currentWaypoints: TilePosition[] = [];
  let enteredViaDoorId: string | undefined;

  for (let index = 0; index < waypoints.length; index += 1) {
    const waypoint = waypoints[index];
    if (waypoint === undefined) continue;
    const regionId = graph.tileToRegion.get(tileKey(waypoint));
    if (regionId === undefined) {
      throw new Error('Invariant violated: a waypoint returned by boundedLocalSearch has no region.');
    }

    if (currentRegionId === regionId) {
      currentWaypoints.push(waypoint);
      continue;
    }

    if (currentRegionId !== undefined) {
      segments.push({
        regionId: currentRegionId,
        waypoints: currentWaypoints,
        ...(enteredViaDoorId !== undefined ? { enteredViaDoorId } : {}),
      });

      const previousWaypoint = waypoints[index - 1];
      if (previousWaypoint !== undefined) {
        const edge = resolveEdge(world, previousWaypoint, waypoint);
        enteredViaDoorId = doors.getByEdge(edge.ownerTile, edge.side)?.id;
      }
    }

    currentRegionId = regionId;
    currentWaypoints = [waypoint];
  }

  if (currentRegionId !== undefined) {
    segments.push({
      regionId: currentRegionId,
      waypoints: currentWaypoints,
      ...(enteredViaDoorId !== undefined ? { enteredViaDoorId } : {}),
    });
  }

  return segments;
}

/**
 * Global route = a region/portal-level plan (permission-checked door by
 * door) plus one local search bounded to just the regions that plan
 * visits -- never one unbounded tile search. Never mutates `world`/
 * `doors`/`graph`.
 *
 * `doorDependencies`, when supplied, is filled with every door this answer
 * depends on -- including the ones it refused, and the ones it declined to
 * cross because something cheaper was open. `RouteCache` needs that set and
 * not the crossed doors alone; see `runRegionDijkstra` for why it is the doors
 * incident to a region within reach of the answer, and #357 for what serving
 * an answer whose blocking door was never recorded looks like.
 */
export function findRoute(
  world: SparseWorld,
  doors: DoorRegistry,
  graph: NavigationGraph,
  origin: TilePosition,
  destination: TilePosition,
  context: RouteContext,
  stats?: SearchStats,
  doorDependencies?: Set<string>,
): RouteResult {
  const originRegion = graph.tileToRegion.get(tileKey(origin));
  if (originRegion === undefined) return { ok: false, failure: { reason: 'invalid-origin' } };
  const destinationRegion = graph.tileToRegion.get(tileKey(destination));
  if (destinationRegion === undefined) return { ok: false, failure: { reason: 'invalid-destination' } };

  let allowedRegions: ReadonlySet<RegionId>;
  let allowedDoorIds: ReadonlySet<string>;

  if (originRegion === destinationRegion) {
    allowedRegions = new Set([originRegion]);
    allowedDoorIds = new Set();
  } else {
    const permissionAwarePath = dijkstraRegionPath(
      graph,
      doors,
      originRegion,
      destinationRegion,
      (portal) => {
        const door = doors.getById(portal.doorId);
        return door !== undefined && checkDoorAccess(door, context).allowed;
      },
      stats,
      doorDependencies,
    );

    if (permissionAwarePath === undefined) {
      // The physical pass decides `unreachable` versus `permission-denied` and
      // which door `blockedBy` names, so the doors *it* looked at are part of
      // this answer too and are collected into the same set.
      const physicalPath = dijkstraRegionPath(graph, doors, originRegion, destinationRegion, () => true, stats, doorDependencies);
      if (physicalPath === undefined) return { ok: false, failure: { reason: 'unreachable' } };

      const blockedBy = findBlockingDoor(physicalPath, doors, context);
      return { ok: false, failure: { reason: 'permission-denied', ...(blockedBy !== undefined ? { blockedBy } : {}) } };
    }

    const regions = new Set<RegionId>([originRegion]);
    const doorIds = new Set<string>();
    for (const portal of permissionAwarePath) {
      regions.add(portal.regionA);
      regions.add(portal.regionB);
      doorIds.add(portal.doorId);
    }
    allowedRegions = regions;
    allowedDoorIds = doorIds;
  }

  const localResult = boundedLocalSearch(world, doors, graph, origin, destination, { allowedRegions, allowedDoorIds }, stats);
  if (localResult === undefined) return { ok: false, failure: { reason: 'unreachable' } };

  const route: Route = {
    segments: sliceIntoSegments(world, doors, graph, localResult.waypoints),
    totalCost: localResult.cost,
  };
  return { ok: true, route };
}
