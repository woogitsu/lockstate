import type { DoorRegistry } from './door';
import type { SearchStats } from './local-search';
import { doorTraversalCost } from './route-context';
import type { NavigationGraph, Portal, RegionId } from './region-graph';

export interface RegionDijkstraResult {
  readonly dist: ReadonlyMap<RegionId, number>;
  /** `prevPortal.get(id)` is the portal crossed to *arrive* at `id` from `source` along the recorded shortest path. */
  readonly prevPortal: ReadonlyMap<RegionId, Portal>;
}

/**
 * Single-source Dijkstra over the region/portal graph, rooted at `source`.
 * Shared core for `router.ts`'s single-target search (which stops early and
 * backtracks one path) and `flow-field.ts`'s all-targets field (which keeps
 * every recorded predecessor). Ties break on the region id, matching every
 * other deterministic tie-break in this module -- never iteration/insertion
 * order.
 */
export function runRegionDijkstra(
  graph: NavigationGraph,
  doors: DoorRegistry,
  source: RegionId,
  isPortalAllowed: (portal: Portal) => boolean,
  stats?: SearchStats,
  stopAt?: RegionId,
): RegionDijkstraResult {
  const dist = new Map<RegionId, number>([[source, 0]]);
  const prevPortal = new Map<RegionId, Portal>();
  const visited = new Set<RegionId>();
  const frontier = new Map<RegionId, number>([[source, 0]]);

  while (frontier.size > 0) {
    let currentRegion: RegionId | undefined;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const [region, distance] of frontier) {
      if (distance < bestDist || (distance === bestDist && (currentRegion === undefined || region < currentRegion))) {
        bestDist = distance;
        currentRegion = region;
      }
    }
    if (currentRegion === undefined) break;
    frontier.delete(currentRegion);
    if (visited.has(currentRegion)) continue;
    visited.add(currentRegion);
    if (stats !== undefined) stats.expansions += 1;
    if (stopAt !== undefined && currentRegion === stopAt) break;

    for (const portal of graph.regionPortals.get(currentRegion) ?? []) {
      if (!isPortalAllowed(portal)) continue;
      const otherRegion = portal.regionA === currentRegion ? portal.regionB : portal.regionA;
      if (visited.has(otherRegion)) continue;

      const door = doors.getById(portal.doorId);
      const cost = door === undefined ? 1 : doorTraversalCost(door);
      const tentative = bestDist + cost;
      if (tentative < (dist.get(otherRegion) ?? Number.POSITIVE_INFINITY)) {
        dist.set(otherRegion, tentative);
        prevPortal.set(otherRegion, portal);
        frontier.set(otherRegion, tentative);
      }
    }
  }

  return { dist, prevPortal };
}
