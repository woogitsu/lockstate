import type { DoorRegistry } from './door';
import { FrontierHeap } from './frontier-heap';
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
 * The frontier is a `FrontierHeap` ordered by `(distance, region id)` rather
 * than the linear scan this search used until #413. `(distance, region id)` is
 * unique per frontier region, so the pair is a total order and the heap
 * dequeues exactly the region the scan would have chosen; only the cost of
 * choosing it changed, from `O(|frontier|)` to `O(log |frontier|)`. Relaxation
 * pushes a second, strictly cheaper entry instead of decreasing a key in
 * place, so the `visited` check below is what discards the superseded copy --
 * and it is checked before `stats.expansions`, because a discarded copy is not
 * a region expansion and must not be charged to ADR 0007's budget as one.
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
 *
 * One class of door inside `reach` is excluded, and only when `stopAt` names the
 * other end of a single journey: see `portalIsUncrossable`.
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
  const frontier = new FrontierHeap<RegionId, RegionId>();
  frontier.push(0, source, source);

  while (frontier.size > 0) {
    const currentRegion = frontier.minimumTieBreak;
    // The distance this entry was pushed with. It is `dist.get(currentRegion)`
    // for the entry that survives the `visited` check: any cheaper entry for
    // this region would have been dequeued first and settled it.
    const bestDist = frontier.minimumCost;
    frontier.pop();
    if (visited.has(currentRegion)) continue;
    visited.add(currentRegion);
    if (stats !== undefined) {
      stats.expansions += 1;
      if (stats.maxExpansions !== undefined && stats.expansions > stats.maxExpansions) {
        throw new RangeError('Navigation cache warmth exceeds the restore work budget.');
      }
    }
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
        frontier.push(tentative, otherRegion, otherRegion);
      }
    }
  }

  if (doorDependencies !== undefined) {
    const reach = stopAt === undefined ? Number.POSITIVE_INFINITY : (dist.get(stopAt) ?? Number.POSITIVE_INFINITY);
    for (const [region, distance] of dist) {
      if (distance > reach) continue;
      for (const portal of graph.regionPortals.get(region) ?? []) {
        if (stopAt !== undefined && portalIsUncrossable(graph, portal, source, stopAt)) continue;
        doorDependencies.add(portal.doorId);
      }
    }
  }

  return { dist, prevPortal };
}

/**
 * True when no route between `from` and `to` can cross `portal` at all,
 * whatever state its door is in -- so its state cannot change the answer and it
 * does not belong in a dependency set.
 *
 * One of the portal's endpoint regions has this portal as its **only** portal
 * and is neither end of the journey. Any route entering that region must leave
 * it by the same door, paying for it twice; dropping that excursion is a route
 * between the same two tiles that is strictly cheaper, since a door costs more
 * than nothing. Such a door is therefore on no shortest route and on no tied one
 * either.
 *
 * This is what keeps invalidation proportionate on the shape a prison actually
 * has: a corridor touches every cell door, so every route along it has every
 * cell door inside its reach, and without this rule one cell door opening would
 * evict every cached route in the block. Measured on
 * `buildCellBlockFixture(24)` with one cell door toggling every tick over ten
 * ticks: 2,670 work units without this rule against 266 with it, for identical
 * routes.
 *
 * Deliberately **not** applied when there is no `stopAt` -- that is a flow
 * field, which answers for every origin including one *inside* such a region,
 * whose step chain is that very door. A field's dependency set has to keep it.
 */
function portalIsUncrossable(graph: NavigationGraph, portal: Portal, from: RegionId, to: RegionId): boolean {
  for (const region of [portal.regionA, portal.regionB]) {
    if (region === from || region === to) continue;
    if ((graph.regionPortals.get(region) ?? []).length === 1) return true;
  }
  return false;
}

/**
 * The same exclusion, for a caller that resolved one origin through a shared
 * field rather than by running its own search (`flow-field.ts`), so both record
 * the same dependency set for the same request.
 */
export function portalCannotBeCrossedBetween(
  graph: NavigationGraph,
  portal: Portal,
  originRegion: RegionId,
  destinationRegion: RegionId,
): boolean {
  return portalIsUncrossable(graph, portal, destinationRegion, originRegion);
}
