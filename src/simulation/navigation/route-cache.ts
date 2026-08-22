import { tileKey, type TilePosition } from '../world/coordinates';
import type { DoorRegistry } from './door';
import type { NavigationGraph } from './region-graph';
import type { RouteContext } from './route-context';
import type { RouteResult } from './route';

function contextFingerprint(context: RouteContext): string {
  const permissions = [...(context.permissions ?? [])].sort().join(',');
  return `${context.role}|${context.securityClearance}|${permissions}|${context.emergencyOverride === true ? '1' : '0'}`;
}

function cacheKey(origin: TilePosition, destination: TilePosition, context: RouteContext): string {
  return `${tileKey(origin)}->${tileKey(destination)}#${contextFingerprint(context)}`;
}

function collectReferencedDoorIds(result: RouteResult): readonly string[] {
  if (result.ok) {
    return result.route.segments
      .map((segment) => segment.enteredViaDoorId)
      .filter((doorId): doorId is string => doorId !== undefined);
  }
  return result.failure.blockedBy !== undefined ? [result.failure.blockedBy.doorId] : [];
}

interface CacheEntry {
  readonly result: RouteResult;
  readonly geometrySignature: string;
  /** Access version of every door this result actually depended on, captured at compute time. */
  readonly doorVersions: ReadonlyMap<string, number>;
}

/**
 * Caches `findRoute` results keyed by origin/destination/route-context.
 * Invalidation is deliberately two-tiered, matching the issue's
 * requirement that "a closed/locked door can invalidate connectivity
 * without rebuilding unrelated world regions":
 * - a geometry change (`NavigationGraph.geometrySignature` differs)
 *   invalidates every entry, since region/portal topology itself may have
 *   changed;
 * - a door state change invalidates only the entries that actually
 *   crossed (or were blocked by) that specific door, via
 *   `DoorRegistry.getAccessVersion`, leaving unrelated cached routes
 *   intact.
 */
export class RouteCache {
  private readonly entries = new Map<string, CacheEntry>();

  public get(
    origin: TilePosition,
    destination: TilePosition,
    context: RouteContext,
    graph: NavigationGraph,
    doors: DoorRegistry,
  ): RouteResult | undefined {
    const key = cacheKey(origin, destination, context);
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;

    if (entry.geometrySignature !== graph.geometrySignature) {
      this.entries.delete(key);
      return undefined;
    }
    for (const [doorId, version] of entry.doorVersions) {
      if (doors.getAccessVersion(doorId) !== version) {
        this.entries.delete(key);
        return undefined;
      }
    }
    return entry.result;
  }

  public set(
    origin: TilePosition,
    destination: TilePosition,
    context: RouteContext,
    graph: NavigationGraph,
    doors: DoorRegistry,
    result: RouteResult,
  ): void {
    const doorVersions = new Map(collectReferencedDoorIds(result).map((doorId) => [doorId, doors.getAccessVersion(doorId)]));
    this.entries.set(cacheKey(origin, destination, context), {
      result,
      geometrySignature: graph.geometrySignature,
      doorVersions,
    });
  }

  public size(): number {
    return this.entries.size;
  }
}

/** Convenience wrapper: reads the cache, computes and stores on a miss. */
export function findRouteCached(
  cache: RouteCache,
  compute: () => RouteResult,
  origin: TilePosition,
  destination: TilePosition,
  context: RouteContext,
  graph: NavigationGraph,
  doors: DoorRegistry,
): RouteResult {
  const cached = cache.get(origin, destination, context, graph, doors);
  if (cached !== undefined) return cached;
  const result = compute();
  cache.set(origin, destination, context, graph, doors, result);
  return result;
}
