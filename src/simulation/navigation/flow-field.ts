import type { SparseWorld } from '../world/sparse-world';
import { tileKey, type TilePosition } from '../world/coordinates';
import { boundedLocalSearch, type SearchStats } from './local-search';
import type { DoorRegistry } from './door';
import type { NavigationGraph, Portal, RegionId } from './region-graph';
import { portalCannotBeCrossedBetween, runRegionDijkstra } from './region-dijkstra';
import { canonicalRouteContext, checkDoorAccess, routeContextFingerprint, type RouteContext } from './route-context';
import { captureDoorDependencies, doorDependenciesStillHold, type DoorDependencies } from './route-dependencies';
import { sliceIntoSegments } from './router';
import type { Route, RouteResult } from './route';

export interface RegionFlowFieldStep {
  /** Portal to cross from this region to move one step closer to the field's destination. */
  readonly nextPortal: Portal;
  readonly costToDestination: number;
}

/**
 * A region-granularity "flow field": for one destination region and one
 * `RouteContext`, the single next portal every other reachable region
 * should take toward it. Computed once by a single Dijkstra pass rooted at
 * the destination (`region-dijkstra.ts`) and reused by every actor headed
 * there under the same permission context -- the shared work #22 asks for
 * "where benchmarks justify it" (meal rush, lockdown return-to-cell: many
 * actors, one destination region). The destination region itself has no
 * entry; callers detect arrival by region equality.
 *
 * A region absent from `steps` (and not the destination) is either
 * unreachable or blocked for this context -- the field does not attempt to
 * distinguish those two (that diagnostic needs the origin-specific
 * permission-unaware fallback pass `findRoute` already does); callers fall
 * back to `findRoute` for an accurate failure reason, per
 * `findRouteUsingFlowField`.
 */
export interface RegionFlowField {
  readonly destinationRegion: RegionId;
  readonly contextFingerprint: string;
  /**
   * The context the field was computed for, in `canonicalRouteContext`'s shape
   * -- one per fingerprint. Kept so a restore can re-derive an unchanged
   * dependency's verdict (ADR 0007's 2026-09-23 amendment).
   */
  readonly context: RouteContext;
  readonly geometrySignature: string;
  readonly steps: ReadonlyMap<RegionId, RegionFlowFieldStep>;
  /**
   * Every door any step depends on and what the pass concluded about each,
   * captured at compute time -- mirrors `RouteCache`'s targeted invalidation.
   *
   * "Every door any step depends on" was the stated intent from the start and
   * the recorded set was the portals that ended up *in* the tree, which is not
   * the same thing: a door whose being locked is the reason a step points the
   * long way round is a door that step depends on, and opening it evicted
   * nothing (#358). A field covers every reachable region, so its dependency
   * set is the doors incident to any of them -- correspondingly wide, and
   * unavoidably so for one shared object that answers for every origin. The
   * per-route entries `RouteCache` now keeps for field-resolved requests (#359)
   * are the narrow half: each depends only on the doors within reach of its own
   * origin.
   */
  readonly doorDependencies: DoorDependencies;
}

export function computeRegionFlowField(
  graph: NavigationGraph,
  doors: DoorRegistry,
  destinationRegion: RegionId,
  context: RouteContext,
  stats?: SearchStats,
): RegionFlowField {
  const isPortalAllowed = (portal: Portal): boolean => {
    const door = doors.getById(portal.doorId);
    return door !== undefined && checkDoorAccess(door, context).allowed;
  };

  const dependencyDoorIds = new Set<string>();
  const { dist, prevPortal } = runRegionDijkstra(graph, doors, destinationRegion, isPortalAllowed, stats, undefined, dependencyDoorIds);

  const steps = new Map<RegionId, RegionFlowFieldStep>();
  for (const [regionId, portal] of prevPortal) {
    if (regionId === destinationRegion) continue;
    steps.set(regionId, { nextPortal: portal, costToDestination: dist.get(regionId) ?? Number.POSITIVE_INFINITY });
  }

  return {
    destinationRegion,
    contextFingerprint: routeContextFingerprint(context),
    context: canonicalRouteContext(context),
    geometrySignature: graph.geometrySignature,
    steps,
    doorDependencies: captureDoorDependencies(dependencyDoorIds, doors, context),
  };
}

/**
 * Doors incident to `regionId` that a route between `originRegion` and the
 * field's destination could actually cross, added to `doorDependencies`. See
 * `runRegionDijkstra` for why incidence is the rule and
 * `portalCannotBeCrossedBetween` for the one exclusion, both shared with
 * `findRoute` so the two agree on what a request depends on.
 */
function addIncidentDoors(
  graph: NavigationGraph,
  regionId: RegionId,
  originRegion: RegionId,
  destinationRegion: RegionId,
  doorDependencies: Set<string>,
): void {
  for (const portal of graph.regionPortals.get(regionId) ?? []) {
    if (portalCannotBeCrossedBetween(graph, portal, originRegion, destinationRegion)) continue;
    doorDependencies.add(portal.doorId);
  }
}

/**
 * Resolves one actor's route through a precomputed `RegionFlowField`,
 * reusing its shared region-level plan and running only the (already
 * bounded) local A* for this specific origin -- the per-actor cost a
 * shared field cannot avoid.
 *
 * Returns `undefined`, not a failure `RouteResult`, when the field cannot
 * answer this request (wrong destination, stale geometry, or the origin's
 * region isn't in `steps`): the caller should fall back to `findRoute` for
 * either a correct answer or an accurate `permission-denied` diagnosis,
 * exactly like a `RouteCache` miss.
 *
 * `doorDependencies`, when supplied, is filled with the doors *this* answer
 * depends on so the result can be cached (#359) without inheriting the whole
 * field's much wider set. It is the same rule `runRegionDijkstra` applies for
 * `findRoute` -- the doors incident to a region within the origin's
 * distance-to-destination -- read off the field's own recorded costs, which are
 * that same `dist` map. The two paths therefore record identical dependency
 * sets for identical requests, so a cached entry means the same thing whichever
 * of them produced it.
 */
export function findRouteUsingFlowField(
  field: RegionFlowField,
  world: SparseWorld,
  doors: DoorRegistry,
  graph: NavigationGraph,
  origin: TilePosition,
  destination: TilePosition,
  stats?: SearchStats,
  doorDependencies?: Set<string>,
): RouteResult | undefined {
  if (field.geometrySignature !== graph.geometrySignature) return undefined;

  const originRegion = graph.tileToRegion.get(tileKey(origin));
  if (originRegion === undefined) return { ok: false, failure: { reason: 'invalid-origin' } };
  const destinationRegion = graph.tileToRegion.get(tileKey(destination));
  if (destinationRegion === undefined) return { ok: false, failure: { reason: 'invalid-destination' } };
  if (destinationRegion !== field.destinationRegion) return undefined;

  const allowedRegions = new Set<RegionId>([originRegion]);
  const allowedDoorIds = new Set<string>();

  if (originRegion !== destinationRegion) {
    let cursor = originRegion;
    const maxSteps = field.steps.size + 1;
    for (let hop = 0; hop < maxSteps; hop += 1) {
      if (cursor === destinationRegion) break;
      const step = field.steps.get(cursor);
      if (step === undefined) return undefined; // not covered by this field -- caller falls back to findRoute
      allowedDoorIds.add(step.nextPortal.doorId);
      cursor = step.nextPortal.regionA === cursor ? step.nextPortal.regionB : step.nextPortal.regionA;
      allowedRegions.add(cursor);
      if (hop === maxSteps - 1 && cursor !== destinationRegion) {
        throw new Error('Invariant violated: RegionFlowField step chain did not reach its destination region.');
      }
    }
  }

  if (doorDependencies !== undefined && originRegion !== destinationRegion) {
    const reach = field.steps.get(originRegion)?.costToDestination ?? Number.POSITIVE_INFINITY;
    addIncidentDoors(graph, destinationRegion, originRegion, destinationRegion, doorDependencies);
    for (const [regionId, step] of field.steps) {
      if (step.costToDestination > reach) continue;
      addIncidentDoors(graph, regionId, originRegion, destinationRegion, doorDependencies);
    }
  }

  const localResult = boundedLocalSearch(world, doors, graph, origin, destination, { allowedRegions, allowedDoorIds }, stats);
  if (localResult === undefined) return { ok: false, failure: { reason: 'unreachable' } };

  const route: Route = {
    segments: sliceIntoSegments(world, doors, graph, localResult.waypoints),
    totalCost: localResult.cost,
  };
  return { ok: true, route };
}

export interface FlowFieldCacheMetrics {
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
  readonly geometryInvalidations: number;
  readonly size: number;
}

function flowFieldCacheKey(destinationRegion: RegionId, contextFingerprint: string): string {
  return `${destinationRegion}#${contextFingerprint}`;
}

/** Caches `RegionFlowField`s keyed by destination region + route-context fingerprint, mirroring `RouteCache`'s invalidation and metrics shape. */
export class FlowFieldCache {
  private readonly entries = new Map<string, RegionFlowField>();
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private geometryInvalidations = 0;

  public get(destinationRegion: RegionId, context: RouteContext, graph: NavigationGraph, doors: DoorRegistry): RegionFlowField | undefined {
    const key = flowFieldCacheKey(destinationRegion, routeContextFingerprint(context));
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
    if (!doorDependenciesStillHold(entry.doorDependencies, doors, context)) {
      this.entries.delete(key);
      this.evictions += 1;
      this.misses += 1;
      return undefined;
    }
    this.hits += 1;
    return entry;
  }

  public set(field: RegionFlowField): void {
    this.entries.set(flowFieldCacheKey(field.destinationRegion, field.contextFingerprint), field);
  }

  /**
   * Every field computed against `geometrySignature`, ascending by cache key --
   * what a save carries. The same rule and the same argument as
   * `RouteCache.entriesComputedAgainst`.
   */
  public fieldsComputedAgainst(geometrySignature: string): readonly RegionFlowField[] {
    return [...this.entries]
      .filter(([, field]) => field.geometrySignature === geometrySignature)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, field]) => field);
  }

  /** Replaces every field with `fields`, each stamped with `geometrySignature`. Counters are left alone. */
  public loadFields(fields: readonly Omit<RegionFlowField, 'geometrySignature'>[], geometrySignature: string): void {
    this.entries.clear();
    for (const field of fields) {
      const key = flowFieldCacheKey(field.destinationRegion, field.contextFingerprint);
      if (this.entries.has(key)) throw new RangeError(`Flow field appears twice in a snapshot: ${key}`);
      this.entries.set(key, { ...field, geometrySignature });
    }
  }

  public size(): number {
    return this.entries.size;
  }

  public getMetrics(): FlowFieldCacheMetrics {
    return {
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      geometryInvalidations: this.geometryInvalidations,
      size: this.entries.size,
    };
  }
}

/** Convenience wrapper: reads the flow-field cache, computes and stores on a miss -- mirrors `findRouteCached`. */
export function getOrComputeRegionFlowField(
  cache: FlowFieldCache,
  graph: NavigationGraph,
  doors: DoorRegistry,
  destinationRegion: RegionId,
  context: RouteContext,
  stats?: SearchStats,
): RegionFlowField {
  const cached = cache.get(destinationRegion, context, graph, doors);
  if (cached !== undefined) return cached;
  const field = computeRegionFlowField(graph, doors, destinationRegion, context, stats);
  cache.set(field);
  return field;
}
