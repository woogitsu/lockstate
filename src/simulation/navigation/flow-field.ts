import type { SparseWorld } from '../world/sparse-world';
import { tileKey, type TilePosition } from '../world/coordinates';
import { boundedLocalSearch, type SearchStats } from './local-search';
import type { DoorRegistry } from './door';
import type { NavigationGraph, Portal, RegionId } from './region-graph';
import { runRegionDijkstra } from './region-dijkstra';
import { checkDoorAccess, routeContextFingerprint, type RouteContext } from './route-context';
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
  readonly geometrySignature: string;
  readonly steps: ReadonlyMap<RegionId, RegionFlowFieldStep>;
  /** Access version of every door any step depends on, captured at compute time -- mirrors `RouteCache`'s targeted invalidation. */
  readonly doorVersions: ReadonlyMap<string, number>;
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

  const { dist, prevPortal } = runRegionDijkstra(graph, doors, destinationRegion, isPortalAllowed, stats);

  const steps = new Map<RegionId, RegionFlowFieldStep>();
  const doorVersions = new Map<string, number>();
  for (const [regionId, portal] of prevPortal) {
    if (regionId === destinationRegion) continue;
    steps.set(regionId, { nextPortal: portal, costToDestination: dist.get(regionId) ?? Number.POSITIVE_INFINITY });
    doorVersions.set(portal.doorId, doors.getAccessVersion(portal.doorId));
  }

  return {
    destinationRegion,
    contextFingerprint: routeContextFingerprint(context),
    geometrySignature: graph.geometrySignature,
    steps,
    doorVersions,
  };
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
 */
export function findRouteUsingFlowField(
  field: RegionFlowField,
  world: SparseWorld,
  doors: DoorRegistry,
  graph: NavigationGraph,
  origin: TilePosition,
  destination: TilePosition,
  stats?: SearchStats,
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
    for (const [doorId, version] of entry.doorVersions) {
      if (doors.getAccessVersion(doorId) !== version) {
        this.entries.delete(key);
        this.evictions += 1;
        this.misses += 1;
        return undefined;
      }
    }
    this.hits += 1;
    return entry;
  }

  public set(field: RegionFlowField): void {
    this.entries.set(flowFieldCacheKey(field.destinationRegion, field.contextFingerprint), field);
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
