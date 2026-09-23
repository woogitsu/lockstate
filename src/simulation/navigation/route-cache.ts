import { tileKey, type TilePosition } from '../world/coordinates';
import type { DoorRegistry } from './door';
import type { NavigationGraph } from './region-graph';
import { canonicalRouteContext, routeContextFingerprint, type RouteContext } from './route-context';
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

/**
 * A counter both caches of one `NavigationSystem` share, advanced every time an
 * entry is written or answers a read (ADR 0007's amendment of 2026-09-23).
 *
 * It exists for one reader: a save that cannot afford every entry carries the
 * most recently used ones, and "most recently" has to be one order across the
 * route and flow-field caches. A counter rather than a tick because a cache is
 * never told the tick, and because two uses in one tick still have an order.
 * Nothing reads it to decide a route.
 */
export class CacheUseClock {
  private current = 0;

  public get value(): number {
    return this.current;
  }

  public advance(): number {
    this.current += 1;
    return this.current;
  }

  /** For a restore, which renumbers the entries it carried `1..n` and resumes from `n`. */
  public resumeFrom(value: number): void {
    if (!Number.isInteger(value) || value < 0) throw new RangeError('A cache use clock resumes from a non-negative integer.');
    this.current = value;
  }
}

interface CacheEntry {
  /** `CacheUseClock` value when this entry was last written or last answered a read. */
  lastUse: number;
  /**
   * The request this answers. The key already encodes it, but only as a
   * fingerprint of the context; the context itself is kept because a restore
   * re-derives an unchanged dependency's verdict from it (ADR 0007's
   * 2026-09-23 amendment).
   */
  readonly origin: TilePosition;
  readonly destination: TilePosition;
  readonly context: RouteContext;
  readonly result: RouteResult;
  readonly geometrySignature: string;
  /** Every door this result depended on and what the search concluded about each, captured at compute time. */
  readonly dependencies: DoorDependencies;
}

/** One entry, as `RouteCache.entriesComputedAgainst` reports it and `loadEntries` takes it back. */
export interface RouteCacheEntryView {
  readonly lastUse: number;
  readonly origin: TilePosition;
  readonly destination: TilePosition;
  readonly context: RouteContext;
  readonly result: RouteResult;
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

  public constructor(private readonly clock: CacheUseClock = new CacheUseClock()) {}

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
    entry.lastUse = this.clock.advance();
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
      lastUse: this.clock.advance(),
      origin: { x: origin.x, y: origin.y },
      destination: { x: destination.x, y: destination.y },
      context: canonicalRouteContext(context),
      result,
      geometrySignature: graph.geometrySignature,
      dependencies: captureDoorDependencies([...dependencyDoorIds, ...crossedDoorIds(result)], doors, context),
    });
  }

  public size(): number {
    return this.entries.size;
  }

  /**
   * Every entry computed against `geometrySignature`, ascending by cache key --
   * what a save carries (ADR 0007's 2026-09-23 amendment).
   *
   * An entry computed against any *other* signature is left out, and that
   * changes nothing a later tick can see: `get` deletes such an entry and
   * misses, which is exactly what a restored cache without it does, and a
   * signature the world has moved past never comes back (it is every loaded
   * chunk's `geometryRevision`, and those only rise). Ascending by key because
   * nothing iterates this map to decide anything, so its insertion order is
   * history rather than state.
   */
  public entriesComputedAgainst(geometrySignature: string): readonly RouteCacheEntryView[] {
    return [...this.entries]
      .filter(([, entry]) => entry.geometrySignature === geometrySignature)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, entry]) => ({
        lastUse: entry.lastUse,
        origin: entry.origin,
        destination: entry.destination,
        context: entry.context,
        result: entry.result,
        dependencies: entry.dependencies,
      }));
  }

  /**
   * Deletes every entry computed against any signature but `geometrySignature`,
   * counting each as a geometry invalidation, and returns how many went.
   *
   * `get` already deletes such an entry when it is next read and never answers
   * from it, because a signature the world has moved past does not come back
   * (see `entriesComputedAgainst`). So this changes no answer and no charge; it
   * stops the entries that are never read again from being held for ever.
   * Measured before it existed: 1,422 of the 1,427 entries a 324-prisoner
   * prison held at day 6 were of this kind, because a prison under
   * construction changes its geometry with every object it finishes.
   * `NavigationSystem` calls it when it rebuilds its graph over new geometry.
   */
  public retireEntriesNotComputedAgainst(geometrySignature: string): number {
    let retired = 0;
    for (const [key, entry] of [...this.entries]) {
      if (entry.geometrySignature === geometrySignature) continue;
      this.entries.delete(key);
      retired += 1;
    }
    this.geometryInvalidations += retired;
    return retired;
  }

  /**
   * Replaces every entry with `views`, each stamped with `geometrySignature` --
   * the restored world's, which is the one every carried entry was computed
   * against. Hit, miss and eviction counters are left alone: they are
   * diagnostics of this instance's own work, like `PathRequestQueue`'s.
   */
  public loadEntries(views: readonly RouteCacheEntryView[], geometrySignature: string): void {
    this.entries.clear();
    for (const view of views) {
      const key = cacheKey(view.origin, view.destination, view.context);
      if (this.entries.has(key)) throw new RangeError(`Route cache entry appears twice in a snapshot: ${key}`);
      this.entries.set(key, {
        lastUse: view.lastUse,
        origin: { x: view.origin.x, y: view.origin.y },
        destination: { x: view.destination.x, y: view.destination.y },
        context: canonicalRouteContext(view.context),
        result: view.result,
        geometrySignature,
        dependencies: view.dependencies,
      });
    }
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
