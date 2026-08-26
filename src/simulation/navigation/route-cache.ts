import { tileKey, type TilePosition } from '../world/coordinates';
import type { DoorRegistry } from './door';
import type { NavigationGraph } from './region-graph';
import { routeContextFingerprint, type RouteContext } from './route-context';
import { captureDoorDependencies, doorDependenciesStillHold, type DoorDependencies } from './route-dependencies';
import type { RouteResult } from './route';

function cacheKey(origin: TilePosition, destination: TilePosition, context: RouteContext): string {
  return `${tileKey(origin)}->${tileKey(destination)}#${routeContextFingerprint(context)}`;
}

/**
 * The doors a `RouteResult` visibly crossed. A floor under whatever the caller
 * supplies, never the whole dependency set: a route depends just as much on the
 * doors that were shut when it was computed, and `RouteResult.failure.blockedBy`
 * -- which this used to read for a failure -- is documented in `route.ts` as a
 * best-effort *diagnostic*, "not an exhaustive list of every door that would
 * need to change". Reading it as a dependency set is what let a cached
 * `permission-denied` outlive the lockdown that caused it (#357).
 */
function crossedDoorIds(result: RouteResult): readonly string[] {
  if (!result.ok) return [];
  return result.route.segments
    .map((segment) => segment.enteredViaDoorId)
    .filter((doorId): doorId is string => doorId !== undefined);
}

interface CacheEntry {
  readonly result: RouteResult;
  readonly geometrySignature: string;
  /** Every door this result depended on and what the search concluded about each, captured at compute time. */
  readonly dependencies: DoorDependencies;
}

/**
 * Cumulative counters for issue #22's "cache hit/miss/eviction/invalidation
 * metrics" requirement. `evictions` counts entries removed because a door the
 * entry depended on no longer gives the traversal verdict it was computed
 * under (the targeted case NAVIGATION.md documents);
 * `geometryInvalidations` counts entries removed because the whole graph's
 * geometry changed under them -- kept separate because the two have very
 * different blast radii and callers/benchmarks want to see them apart.
 */
export interface RouteCacheMetrics {
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
  readonly geometryInvalidations: number;
  readonly size: number;
}

/**
 * Caches `findRoute` results keyed by origin/destination/route-context.
 * Invalidation is deliberately two-tiered, matching the issue's
 * requirement that "a closed/locked door can invalidate connectivity
 * without rebuilding unrelated world regions":
 * - a geometry change (`NavigationGraph.geometrySignature` differs)
 *   invalidates every entry, since region/portal topology itself may have
 *   changed;
 * - a door state change invalidates only the entries whose answer that
 *   specific door could change -- the doors the search consumed, whether it
 *   crossed them, refused them or passed them over, and only when the door's
 *   traversal verdict for that entry's `RouteContext` has actually moved (see
 *   `route-dependencies.ts`). Unrelated cached routes stay intact.
 *
 * The dependency set is supplied by whoever computed the result, because only
 * the search knows which doors it consumed; `set` therefore requires it rather
 * than deriving it from the `RouteResult`, which cannot show a door that was
 * shut. #357 is what deriving it looked like.
 */
export class RouteCache {
  private readonly entries = new Map<string, CacheEntry>();
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private geometryInvalidations = 0;

  public get(
    origin: TilePosition,
    destination: TilePosition,
    context: RouteContext,
    graph: NavigationGraph,
    doors: DoorRegistry,
  ): RouteResult | undefined {
    const key = cacheKey(origin, destination, context);
    const entry = this.entries.get(key);
    if (entry === undefined) {
      this.misses += 1;
      return undefined;
    }

    if (entry.geometrySignature !== graph.geometrySignature) {
      this.entries.delete(key);
      this.geometryInvalidations += 1;
      this.misses += 1;
      return undefined;
    }
    if (!doorDependenciesStillHold(entry.dependencies, doors, context)) {
      this.entries.delete(key);
      this.evictions += 1;
      this.misses += 1;
      return undefined;
    }
    this.hits += 1;
    return entry.result;
  }

  public set(
    origin: TilePosition,
    destination: TilePosition,
    context: RouteContext,
    graph: NavigationGraph,
    doors: DoorRegistry,
    result: RouteResult,
    /** Every door the computation consumed -- `findRoute`/`findRouteUsingFlowField` fill this via their `doorDependencies` parameter. */
    dependencyDoorIds: Iterable<string>,
  ): void {
    this.entries.set(cacheKey(origin, destination, context), {
      result,
      geometrySignature: graph.geometrySignature,
      dependencies: captureDoorDependencies([...dependencyDoorIds, ...crossedDoorIds(result)], doors, context),
    });
  }

  public size(): number {
    return this.entries.size;
  }

  public getMetrics(): RouteCacheMetrics {
    return {
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      geometryInvalidations: this.geometryInvalidations,
      size: this.entries.size,
    };
  }
}

/**
 * Convenience wrapper: reads the cache, computes and stores on a miss.
 *
 * `compute` receives the set to record the doors it consumed into -- pass it to
 * `findRoute`/`findRouteUsingFlowField` as their `doorDependencies` argument.
 * A `compute` that ignores it still gets a correct entry for the doors its
 * route crossed, just a coarser one, so a caller cannot silently produce an
 * entry with no dependencies at all.
 *
 * This is the only writer of `RouteCache` in `src/`, and since #359 the only
 * reader on the request path too: flow-field sharing decides *how a miss is
 * computed* and sits inside `compute`, rather than in front of the cache where
 * it bypassed it entirely.
 */
export function findRouteCached(
  cache: RouteCache,
  compute: (doorDependencies: Set<string>) => RouteResult,
  origin: TilePosition,
  destination: TilePosition,
  context: RouteContext,
  graph: NavigationGraph,
  doors: DoorRegistry,
): RouteResult {
  const cached = cache.get(origin, destination, context, graph, doors);
  if (cached !== undefined) return cached;
  const doorDependencies = new Set<string>();
  const result = compute(doorDependencies);
  cache.set(origin, destination, context, graph, doors, result, doorDependencies);
  return result;
}
