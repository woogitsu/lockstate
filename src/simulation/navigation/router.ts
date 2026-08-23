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
 */
function dijkstraRegionPath(
  graph: NavigationGraph,
  doors: DoorRegistry,
  origin: RegionId,
  destination: RegionId,
  isPortalAllowed: (portal: Portal) => boolean,
  stats?: SearchStats,
): readonly Portal[] | undefined {
  if (origin === destination) return [];

  const { dist, prevPortal } = runRegionDijkstra(graph, doors, origin, isPortalAllowed, stats, destination);
  if (!dist.has(destination)) return undefined;

  const path: Portal[] = [];
  let cursor = destination;
  while (cursor !== origin) {
    const portal = prevPortal.get(cursor);
    if (portal === undefined) return undefined; // invariant: dist.has(destination) guarantees a recorded predecessor chain to origin
    path.push(portal);
    cursor = portal.regionA === cursor ? portal.regionB : portal.regionA;
  }
  path.reverse();
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
 */
export function findRoute(
  world: SparseWorld,
  doors: DoorRegistry,
  graph: NavigationGraph,
  origin: TilePosition,
  destination: TilePosition,
  context: RouteContext,
  stats?: SearchStats,
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
    );

    if (permissionAwarePath === undefined) {
      const physicalPath = dijkstraRegionPath(graph, doors, originRegion, destinationRegion, () => true, stats);
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
