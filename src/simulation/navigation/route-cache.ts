import { tileCoordinate, tileKey, type TilePosition } from '../world/coordinates';
import type { DoorRegistry } from './door';
import type { NavigationGraph } from './region-graph';
import { routeContextFingerprint, type RouteContext } from './route-context';
import { captureDoorDependencies, doorDependenciesStillHold, type DoorDependencies } from './route-dependencies';
import type { RouteFailure, RouteResult } from './route';
import { buildRouteRegionProof, canonicalRouteDoorDependenciesFromDistances, findRoute, graphFailureFromProof, type RouteRegionProof } from './router';
import type { SparseWorld } from '../world/sparse-world';
import type { SearchStats } from './local-search';
import { MAX_CACHE_WARMTH_REBUILD_EXPANSIONS, MAX_ROUTE_CACHE_WARMTH_BYTES, MAX_ROUTE_CACHE_WARMTH_KEYS, MAX_ROUTE_FAILURE_VERIFY_EXPANSIONS, MAX_SAVED_ROUTE_PATH_RUN_CHARS, cacheWarmthArrayOverhead, cacheWarmthJsonBytes } from './cache-limits';
import { loadDoorDependencies, saveDoorDependencies, type SavedDoorDependencies } from './cache-warmth';
import { routeWaypoints } from './route';
import { sliceIntoSegments } from './router';
import { edgeStanding } from './traversal';
import { checkDoorAccess, doorTraversalCost } from './route-context';

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
  readonly origin: TilePosition;
  readonly destination: TilePosition;
  readonly context: RouteContext;
  readonly result: RouteResult;
  readonly geometrySignature: string;
  /** Every door this result depended on and what the search concluded about each, captured at compute time. */
  readonly dependencies: DoorDependencies;
}

export interface RouteCacheWarmthKey {
  readonly origin: TilePosition;
  readonly destination: TilePosition;
  readonly context: RouteContext;
  readonly result: { readonly ok: true; readonly pathRuns: string; readonly totalCost: number } |
    { readonly ok: false; readonly failure: RouteFailure };
  readonly dependencies: SavedDoorDependencies;
}

function encodePath(result: Extract<RouteResult, { ok: true }>): string {
  const waypoints = routeWaypoints(result.route);
  let encoded = '';
  let run = '';
  let count = 0;
  for (let index = 1; index < waypoints.length; index += 1) {
    const previous = waypoints[index - 1]!;
    const next = waypoints[index]!;
    const direction = next.x > previous.x ? 'E' : next.x < previous.x ? 'W' : next.y > previous.y ? 'S' : 'N';
    if (direction === run) count += 1;
    else {
      if (count > 0) encoded += `${run}${count};`;
      run = direction;
      count = 1;
    }
  }
  if (count > 0) encoded += `${run}${count};`;
  return encoded;
}

function decodePath(origin: TilePosition, pathRuns: string, maxSteps: number): TilePosition[] {
  const waypoints: TilePosition[] = [{ ...origin }];
  let cursor = 0;
  while (cursor < pathRuns.length) {
    const direction = pathRuns[cursor++];
    if (direction !== 'E' && direction !== 'W' && direction !== 'N' && direction !== 'S') throw new RangeError('Cached route has an invalid path direction.');
    const start = cursor;
    while (cursor < pathRuns.length && pathRuns[cursor] !== ';') cursor += 1;
    const rawCount = pathRuns.slice(start, cursor);
    if (cursor === pathRuns.length || !/^[1-9][0-9]*$/.test(rawCount)) throw new RangeError('Cached route has an invalid path run.');
    cursor += 1;
    const count = Number(rawCount);
    if (!Number.isSafeInteger(count) || count > maxSteps - waypoints.length + 1) throw new RangeError('Cached route exceeds loaded navigation geometry.');
    for (let step = 0; step < count; step += 1) {
      const previous = waypoints[waypoints.length - 1]!;
      waypoints.push({ x: tileCoordinate(previous.x + (direction === 'E' ? 1 : direction === 'W' ? -1 : 0)), y: tileCoordinate(previous.y + (direction === 'S' ? 1 : direction === 'N' ? -1 : 0)) });
    }
  }
  return waypoints;
}

function savedEntry(entry: CacheEntry): RouteCacheWarmthKey {
  return {
    origin: { ...entry.origin }, destination: { ...entry.destination }, context: structuredClone(entry.context),
    result: entry.result.ok
      ? { ok: true, pathRuns: encodePath(entry.result), totalCost: entry.result.route.totalCost }
      : { ok: false, failure: structuredClone(entry.result.failure) },
    dependencies: saveDoorDependencies(entry.dependencies),
  };
}

function validatedRouteResult(entry: RouteCacheWarmthKey, world: SparseWorld, graph: NavigationGraph, doors: DoorRegistry): RouteResult {
  if (!entry.result.ok) return { ok: false, failure: structuredClone(entry.result.failure) };
  const waypoints = decodePath(entry.origin, entry.result.pathRuns, graph.tileToRegion.size);
  if (waypoints.length === 0 || tileKey(waypoints[0]!) !== tileKey(entry.origin) || tileKey(waypoints[waypoints.length - 1]!) !== tileKey(entry.destination)) {
    throw new RangeError('Cached route endpoints do not match its key.');
  }
  let cost = 0;
  const crossedDoors = new Set<string>();
  for (let index = 0; index < waypoints.length; index += 1) {
    const waypoint = waypoints[index]!;
    if (!graph.tileToRegion.has(tileKey(waypoint))) throw new RangeError('Cached route leaves loaded navigation geometry.');
    if (index === 0) continue;
    const previous = waypoints[index - 1]!;
    if (Math.abs(previous.x - waypoint.x) + Math.abs(previous.y - waypoint.y) !== 1) throw new RangeError('Cached route contains a non-adjacent step.');
    const standing = edgeStanding(world, doors, previous, waypoint);
    if (standing.kind === 'wall') throw new RangeError('Cached route crosses a wall.');
    if (standing.kind === 'door') {
      if (!checkDoorAccess(standing.door, entry.context).allowed) throw new RangeError('Cached route crosses a blocked door.');
      crossedDoors.add(standing.door.id);
      cost += doorTraversalCost(standing.door);
    } else cost += 1;
  }
  if (Math.abs(cost - entry.result.totalCost) > 1e-9) throw new RangeError('Cached route cost does not match traversed edges.');
  const dependencyIds = new Set(entry.dependencies.perDoor.map(([id]) => id));
  for (const id of crossedDoors) if (!dependencyIds.has(id)) throw new RangeError(`Cached route omits a crossed door dependency: ${id}`);
  return { ok: true, route: { segments: sliceIntoSegments(world, doors, graph, waypoints), totalCost: cost } };
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
  private readonly entryBytes = new Map<string, number>();
  private totalBytes = 0;
  private readonly failureWork = new Map<string, number>();
  private totalFailureWork = 0;
  private readonly positiveGroupByEntry = new Map<string, string>();
  private readonly positiveGroups = new Map<string, { count: number; weight: number }>();
  private totalPositiveWork = 0;
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private geometryInvalidations = 0;
  private lastPrunedGeometrySignature: string | undefined;
  private lastPrunedDoorRevision: number | undefined;

  private removeAccounting(key: string): void {
    this.totalBytes -= this.entryBytes.get(key) ?? 0;
    this.totalFailureWork -= this.failureWork.get(key) ?? 0;
    this.entryBytes.delete(key);
    this.failureWork.delete(key);
    const groupKey = this.positiveGroupByEntry.get(key);
    if (groupKey !== undefined) {
      const group = this.positiveGroups.get(groupKey)!;
      if (group.count === 1) {
        this.positiveGroups.delete(groupKey);
        this.totalPositiveWork -= group.weight;
      } else this.positiveGroups.set(groupKey, { ...group, count: group.count - 1 });
      this.positiveGroupByEntry.delete(key);
    }
  }

  private deleteEntry(key: string): void {
    this.removeAccounting(key);
    this.entries.delete(key);
  }

  private insertEntry(key: string, entry: CacheEntry, graph: NavigationGraph): void {
    const saved = savedEntry(entry);
    if (saved.result.ok && saved.result.pathRuns.length > MAX_SAVED_ROUTE_PATH_RUN_CHARS) { this.deleteEntry(key); return; }
    const bytes = cacheWarmthJsonBytes(saved);
    if (bytes > MAX_ROUTE_CACHE_WARMTH_BYTES) { this.deleteEntry(key); return; }
    this.removeAccounting(key);
    this.entries.set(key, entry);
    this.entryBytes.set(key, bytes);
    this.totalBytes += bytes;
    const weight = !entry.result.ok && entry.result.failure.reason === 'unreachable' ? graph.tileToRegion.size : 0;
    this.failureWork.set(key, weight);
    this.totalFailureWork += weight;
    if (graph.tileToRegion.has(tileKey(entry.origin)) && graph.tileToRegion.has(tileKey(entry.destination))) {
      const region = graph.tileToRegion.get(tileKey(entry.destination));
      if (region === undefined) throw new RangeError('Successful cached route has no destination region.');
      const groupKey = `${region}#${routeContextFingerprint(entry.context)}`;
      const group = this.positiveGroups.get(groupKey);
      if (group === undefined) {
        this.positiveGroups.set(groupKey, { count: 1, weight: 2 * graph.regionTiles.size });
        this.totalPositiveWork += 2 * graph.regionTiles.size;
      } else this.positiveGroups.set(groupKey, { ...group, count: group.count + 1 });
      this.positiveGroupByEntry.set(key, groupKey);
    }
    while (this.entries.size > MAX_ROUTE_CACHE_WARMTH_KEYS || this.totalBytes + cacheWarmthArrayOverhead(this.entries.size) > MAX_ROUTE_CACHE_WARMTH_BYTES || this.totalFailureWork + this.totalPositiveWork > MAX_ROUTE_FAILURE_VERIFY_EXPANSIONS) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.deleteEntry(oldest);
    }
  }

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
      this.deleteEntry(key);
      this.geometryInvalidations += 1;
      this.misses += 1;
      return undefined;
    }
    if (!doorDependenciesStillHold(entry.dependencies, doors, context)) {
      this.deleteEntry(key);
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
    this.pruneStale(graph, doors);
    this.insertEntry(cacheKey(origin, destination, context), {
      origin: { ...origin },
      destination: { ...destination },
      context: structuredClone(context),
      result,
      geometrySignature: graph.geometrySignature,
      dependencies: captureDoorDependencies([...dependencyDoorIds, ...crossedDoorIds(result)], doors, context),
    }, graph);
  }

  private pruneStale(graph: NavigationGraph, doors: DoorRegistry): void {
    if (this.lastPrunedGeometrySignature === graph.geometrySignature && this.lastPrunedDoorRevision === doors.accessRevision) return;
    for (const [key, entry] of this.entries) {
      if (entry.geometrySignature !== graph.geometrySignature || !doorDependenciesStillHold(entry.dependencies, doors, entry.context)) {
        this.deleteEntry(key);
      } else if (entry.dependencies.accessRevision !== doors.accessRevision) {
        const refreshed = { ...entry, dependencies: captureDoorDependencies(entry.dependencies.perDoor.keys(), doors, entry.context) };
        const bytes = cacheWarmthJsonBytes(savedEntry(refreshed));
        this.entries.set(key, refreshed);
        this.totalBytes += bytes - (this.entryBytes.get(key) ?? 0);
        this.entryBytes.set(key, bytes);
      }
    }
    while (this.totalBytes + cacheWarmthArrayOverhead(this.entries.size) > MAX_ROUTE_CACHE_WARMTH_BYTES) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.deleteEntry(oldest);
    }
    this.lastPrunedGeometrySignature = graph.geometrySignature;
    this.lastPrunedDoorRevision = doors.accessRevision;
  }

  /** Retain insertion order and the exact values used by the next budget-bound tick. */
  public getWarmthSnapshot(graph: NavigationGraph, doors: DoorRegistry): readonly RouteCacheWarmthKey[] {
    this.pruneStale(graph, doors);
    return [...this.entries.values()].map(savedEntry);
  }

  /** Validate cached answers before the first tick; only failures need a bounded search to prove their diagnostic. */
  public loadWarmthSnapshot(keys: readonly RouteCacheWarmthKey[], world: SparseWorld, graph: NavigationGraph, doors: DoorRegistry, stats?: SearchStats): void {
    if (keys.length > MAX_ROUTE_CACHE_WARMTH_KEYS) throw new RangeError('Too many route-cache warmth keys.');
    this.entries.clear();
    this.entryBytes.clear();
    this.failureWork.clear();
    this.positiveGroupByEntry.clear();
    this.positiveGroups.clear();
    this.totalBytes = 0;
    this.totalFailureWork = 0;
    this.totalPositiveWork = 0;
    this.lastPrunedGeometrySignature = graph.geometrySignature;
    this.lastPrunedDoorRevision = doors.accessRevision;
    const seen = new Set<string>();
    const proofByGroup = new Map<string, RouteRegionProof>();
    for (const key of keys) {
      const identity = cacheKey(key.origin, key.destination, key.context);
      if (seen.has(identity)) throw new RangeError(`Duplicate route-cache warmth key: ${identity}`);
      seen.add(identity);
      const dependencies = loadDoorDependencies(key.dependencies, doors, key.context);
      const result = validatedRouteResult(key, world, graph, doors);
      const work = stats ?? { expansions: 0, maxExpansions: MAX_CACHE_WARMTH_REBUILD_EXPANSIONS };
      const originRegion = graph.tileToRegion.get(tileKey(key.origin));
      const destinationRegion = graph.tileToRegion.get(tileKey(key.destination));
      let proof: RouteRegionProof | undefined;
      if (originRegion !== undefined && destinationRegion !== undefined) {
        const groupKey = `${destinationRegion}#${routeContextFingerprint(key.context)}`;
        proof = proofByGroup.get(groupKey);
        if (proof === undefined) {
          proof = buildRouteRegionProof(graph, doors, destinationRegion, key.context, work);
          proofByGroup.set(groupKey, proof);
        }
      }
      if (result.ok) {
        if (originRegion === undefined || destinationRegion === undefined || proof === undefined) throw new RangeError('Cached successful route has an invalid endpoint.');
        const expectedIds = [...canonicalRouteDoorDependenciesFromDistances(graph, originRegion, destinationRegion, proof.allowed.dist)]
          .sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
        if (JSON.stringify(expectedIds) !== JSON.stringify([...dependencies.perDoor.keys()])) {
          throw new RangeError('Cached route omits a searched door dependency.');
        }
      } else {
        const recomputedDependencies = new Set<string>();
        const graphFailure = originRegion === undefined || destinationRegion === undefined || proof === undefined
          ? undefined : graphFailureFromProof(graph, doors, originRegion, destinationRegion, key.context, proof);
        let recomputed: RouteResult;
        if (graphFailure === undefined) {
          recomputed = findRoute(world, doors, graph, key.origin, key.destination, key.context, work, recomputedDependencies);
        } else {
          recomputed = graphFailure.result;
          for (const id of graphFailure.dependencies) recomputedDependencies.add(id);
        }
        if (recomputed.ok || recomputed.failure.reason !== result.failure.reason ||
          recomputed.failure.blockedBy?.doorId !== result.failure.blockedBy?.doorId ||
          recomputed.failure.blockedBy?.reason !== result.failure.blockedBy?.reason) {
          throw new RangeError('Cached route failure differs from saved world.');
        }
        const expectedIds = [...recomputedDependencies].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
        if (JSON.stringify(expectedIds) !== JSON.stringify([...dependencies.perDoor.keys()])) {
          throw new RangeError('Cached route failure omits a searched door dependency.');
        }
      }
      this.insertEntry(identity, {
        origin: { ...key.origin }, destination: { ...key.destination }, context: structuredClone(key.context),
        result, geometrySignature: graph.geometrySignature, dependencies,
      }, graph);
      if (this.entries.size !== seen.size) throw new RangeError('Cached routes exceed the live cache byte or verification-work limit.');
    }
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
