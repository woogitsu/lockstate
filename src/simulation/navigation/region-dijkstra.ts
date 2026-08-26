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
 *
 * `doorDependencies`, when supplied, is filled with **every door this search's
 * answer depends on** -- not only the doors it crossed. That is the set a
 * cache has to watch to be sure it never serves an answer a fresh search would
 * not give (#357/#358), and it is exactly the doors incident to a region
 * within reach of the answer.
 *
 * Let `d` be a door with endpoint regions `u`/`v`, and let `reach` be the
 * distance from `source` to the region the answer was asked about (`stopAt`,
 * or every reachable region when there is no early exit). If
 * `min(dist(u), dist(v)) > reach`, every path through `d` costs at least
 * `cost(d) + dist(y) > reach` for the endpoint `y` it leaves by -- so
 * unlocking `d` or making it cheaper can neither shorten the answer nor
 * introduce a new *equal-cost* route a tie-break could pick instead. A door
 * that was refused, or that was open but not worth crossing, and that touches
 * a region at or inside `reach` **can** change the answer, which is why "the
 * doors it crossed" was never the right set. The bound is `<=` and not `<`
 * precisely so that ties are covered.
 *
 * Collected from `dist` after the search rather than during expansion, because
 * a region relaxed to exactly `reach` may never be dequeued -- the early exit
 * fires first -- and still names a door that could produce a tied alternative.
 */
export function runRegionDijkstra(
  graph: NavigationGraph,
  doors: DoorRegistry,
  source: RegionId,
  isPortalAllowed: (portal: Portal) => boolean,
  stats?: SearchStats,
  stopAt?: RegionId,
  doorDependencies?: Set<string>,
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

  if (doorDependencies !== undefined) {
    const reach = stopAt === undefined ? Number.POSITIVE_INFINITY : (dist.get(stopAt) ?? Number.POSITIVE_INFINITY);
    for (const [region, distance] of dist) {
      if (distance > reach) continue;
      for (const portal of graph.regionPortals.get(region) ?? []) doorDependencies.add(portal.doorId);
    }
  }

  return { dist, prevPortal };
}
