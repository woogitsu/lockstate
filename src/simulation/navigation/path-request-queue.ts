import type { SparseWorld } from '../world/sparse-world';
import { tileKey, type TilePosition } from '../world/coordinates';
import type { DoorRegistry } from './door';
import { findRouteCached, RouteCache } from './route-cache';
import { findRouteUsingFlowField, FlowFieldCache, getOrComputeRegionFlowField, type RegionFlowField } from './flow-field';
import type { SearchStats } from './local-search';
import { routeContextFingerprint, type RouteContext } from './route-context';
import type { NavigationGraph, RegionId } from './region-graph';
import { findRoute } from './router';
import type { RouteResult } from './route';

export type PathRequestPriority = number;

export interface PathRequestInput {
  readonly id: string;
  readonly origin: TilePosition;
  readonly destination: TilePosition;
  readonly context: RouteContext;
  /** Higher is more urgent. Caller-defined scale (e.g. 0 = routine, 2 = emergency) -- the queue treats it as an opaque ordering key. */
  readonly priority: PathRequestPriority;
}

/**
 * A request that has been enqueued and not yet resolved or cancelled.
 *
 * Module-internal on purpose: ADR 0007 originally exposed this shape through
 * `PathRequestQueue.getPending(id)`, and its 2026-08-25 amendment (#177)
 * removed that accessor because the decision it served -- "a request's status
 * is simply 'in the queue' or 'resolved'" -- is answered by
 * `NavigationSystem.getResult(id)` instead. Nothing outside this module can
 * obtain one, so exporting the type would advertise a surface that no longer
 * exists. `enqueuedAtTick` is still load-bearing: it is what
 * `effectivePriority` ages a waiting request by, and what `waitedTicks`
 * reports on the resolved payload.
 */
interface PendingPathRequest {
  readonly request: PathRequestInput;
  readonly enqueuedAtTick: number;
}

/**
 * A waiting request as a save carries it: the input, plus the tick it joined
 * the queue. Exported for the save boundary alone; `PendingPathRequest` above
 * stays module-internal for the reason its own comment gives.
 */
export interface PendingPathRequestSnapshot extends PathRequestInput {
  readonly enqueuedAtTick: number;
}

function copyRequest(request: PathRequestInput): PathRequestInput {
  const { context } = request;
  return {
    id: request.id,
    origin: { x: request.origin.x, y: request.origin.y },
    destination: { x: request.destination.x, y: request.destination.y },
    context: {
      role: context.role,
      securityClearance: context.securityClearance,
      ...(context.permissions === undefined ? {} : { permissions: [...context.permissions] }),
      ...(context.emergencyOverride === undefined ? {} : { emergencyOverride: context.emergencyOverride }),
    },
    priority: request.priority,
  };
}

export interface ResolvedPathRequest {
  readonly id: string;
  readonly result: RouteResult;
  readonly usedFlowField: boolean;
  readonly expansions: number;
  readonly waitedTicks: number;
}

export interface PathRequestQueueMetrics {
  readonly resolvedCount: number;
  readonly cancelledCount: number;
  readonly totalExpansions: number;
  readonly ticksProcessed: number;
  readonly flowFieldActivations: number;
}

export interface PathRequestQueueSnapshot {
  readonly pending: readonly { readonly request: PathRequestInput; readonly enqueuedAtTick: number }[];
}

export interface PathRequestQueueOptions {
  /** Every this many ticks a request has waited, its effective priority rises by 1 -- guarantees eventual processing under sustained overload (see docs/adr). */
  readonly agingIntervalTicks: number;
  /** Minimum currently-pending requests sharing a (destination region, context) before a shared `RegionFlowField` is computed for them instead of one `findRoute` per request. */
  readonly flowFieldActivationThreshold: number;
}

interface ProcessTickParams {
  readonly tick: number;
  /** Deterministic work-unit budget (expanded search nodes) for this tick. At least one request is always processed even if it alone exceeds the budget, so the queue always makes forward progress. */
  readonly workBudget: number;
  readonly world: SparseWorld;
  readonly doors: DoorRegistry;
  readonly graph: NavigationGraph;
  readonly routeCache: RouteCache;
  readonly flowFieldCache: FlowFieldCache;
}

function effectivePriority(entry: PendingPathRequest, tick: number, agingIntervalTicks: number): number {
  const waited = tick - entry.enqueuedAtTick;
  return entry.request.priority + Math.floor(waited / agingIntervalTicks);
}

/**
 * Deterministic per-tick path-request scheduler: priority + age-based
 * fairness, a configurable work-unit budget bounding how much pathfinding
 * happens per tick, explicit cancellation, and opportunistic shared
 * `RegionFlowField` use for destinations enough pending requests share.
 * Owns no world/graph state itself -- those are passed into `processTick`
 * each call, exactly like every other navigation function here, so a
 * `NavigationSystem` (or a benchmark) can rebuild/replace them independently.
 */
export class PathRequestQueue {
  private readonly pending = new Map<string, PendingPathRequest>();
  private resolvedCount = 0;
  private cancelledCount = 0;
  private totalExpansions = 0;
  private ticksProcessed = 0;
  private flowFieldActivations = 0;

  public constructor(private readonly options: PathRequestQueueOptions) {
    if (!Number.isInteger(options.agingIntervalTicks) || options.agingIntervalTicks < 1) {
      throw new RangeError('agingIntervalTicks must be a positive integer.');
    }
    if (!Number.isInteger(options.flowFieldActivationThreshold) || options.flowFieldActivationThreshold < 1) {
      throw new RangeError('flowFieldActivationThreshold must be a positive integer.');
    }
  }

  public enqueue(request: PathRequestInput, tick: number): void {
    if (this.pending.has(request.id)) {
      throw new Error(`Path request id already pending: ${request.id}`);
    }
    this.pending.set(request.id, { request, enqueuedAtTick: tick });
  }

  /** Removes a still-pending request. Returns false (no-op, not an error) if it was already resolved/cancelled/unknown -- callers may race with processing. */
  public cancel(id: string): boolean {
    const removed = this.pending.delete(id);
    if (removed) this.cancelledCount += 1;
    return removed;
  }

  /**
   * Queue depth: the ADR's "structured deferred status" made observable, and
   * the whole of what this class exposes about pending work.
   *
   * ADR 0007 as accepted named `getPending(id)`/`pendingIds()` here too. Its
   * 2026-08-25 amendment (#177) removed both: the decision they were named to
   * satisfy -- two states, no deferred event stream, no third state machine --
   * is satisfied by depth plus `NavigationSystem.getResult(id)`, which every
   * one of the six production callers of `requestRoute` already reads as
   * "undefined means still in the queue". A per-id listing would have been a
   * second, weaker way to ask the same question, and an unread one:
   * `tests/foundation/navigation-deferred-status-contract.test.ts` is the gate
   * that keeps it from coming back without amending the ADR again.
   */
  public size(): number {
    return this.pending.size;
  }

  /** Whether `id` is waiting. Read by a restore to tell a live request from one its owner names and no queue holds. */
  public has(id: string): boolean {
    return this.pending.has(id);
  }

  public getMetrics(): PathRequestQueueMetrics {
    return {
      resolvedCount: this.resolvedCount,
      cancelledCount: this.cancelledCount,
      totalExpansions: this.totalExpansions,
      ticksProcessed: this.ticksProcessed,
      flowFieldActivations: this.flowFieldActivations,
    };
  }

  /** Persistence view; deliberately separate from ADR 0007's live status API. */
  public getSnapshot(): PathRequestQueueSnapshot {
    return {
      pending: [...this.pending.values()].sort((a, b) => a.request.id < b.request.id ? -1 : a.request.id > b.request.id ? 1 : 0).map(({ request, enqueuedAtTick }) => ({
        request: {
          ...request,
          origin: { ...request.origin },
          destination: { ...request.destination },
          context: { ...request.context, ...(request.context.permissions === undefined ? {} : { permissions: [...request.context.permissions] }) },
        },
        enqueuedAtTick,
      })),
    };
  }

  public loadSnapshot(snapshot: PathRequestQueueSnapshot): void {
    this.pending.clear();
    for (const entry of snapshot.pending) {
      if (this.pending.has(entry.request.id)) throw new Error(`Duplicate saved path request: ${entry.request.id}`);
      this.pending.set(entry.request.id, {
        enqueuedAtTick: entry.enqueuedAtTick,
        request: {
          ...entry.request,
          origin: { ...entry.request.origin },
          destination: { ...entry.request.destination },
          context: { ...entry.request.context, ...(entry.request.context.permissions === undefined ? {} : { permissions: [...entry.request.context.permissions] }) },
        },
      });
    }
    this.resolvedCount = 0;
    this.cancelledCount = 0;
    this.totalExpansions = 0;
    this.ticksProcessed = 0;
    this.flowFieldActivations = 0;
  }

  public processTick(params: ProcessTickParams): readonly ResolvedPathRequest[] {
    this.ticksProcessed += 1;
    if (this.pending.size === 0) return [];

    const entries = [...this.pending.values()];
    entries.sort((a, b) => {
      const priorityA = effectivePriority(a, params.tick, this.options.agingIntervalTicks);
      const priorityB = effectivePriority(b, params.tick, this.options.agingIntervalTicks);
      if (priorityA !== priorityB) return priorityB - priorityA; // higher effective priority first
      if (a.enqueuedAtTick !== b.enqueuedAtTick) return a.enqueuedAtTick - b.enqueuedAtTick; // older first
      return a.request.id < b.request.id ? -1 : a.request.id > b.request.id ? 1 : 0; // deterministic final tiebreak
    });

    const groupCounts = new Map<string, number>();
    for (const entry of entries) {
      const destinationRegion = params.graph.tileToRegion.get(tileKey(entry.request.destination));
      if (destinationRegion === undefined) continue; // invalid-destination requests never qualify for field sharing
      const key = flowFieldGroupKey(destinationRegion, entry.request.context);
      groupCounts.set(key, (groupCounts.get(key) ?? 0) + 1);
    }

    const fieldsThisTick = new Map<string, RegionFlowField>();
    const resolved: ResolvedPathRequest[] = [];
    let usedBudget = 0;

    for (const entry of entries) {
      if (resolved.length > 0 && usedBudget >= params.workBudget) break;

      const stats: SearchStats = { expansions: 0 };
      const destinationRegion = params.graph.tileToRegion.get(tileKey(entry.request.destination));
      const groupKey = destinationRegion === undefined ? undefined : flowFieldGroupKey(destinationRegion, entry.request.context);
      const eligible = groupKey !== undefined && (groupCounts.get(groupKey) ?? 0) >= this.options.flowFieldActivationThreshold;

      let usedFlowField = false;

      // The route cache is asked first and flow-field sharing decides only how
      // a *miss* is computed (#359). It used to be the other way round: the
      // field branch ran ahead of the cache and never wrote to it, so the one
      // destination busy enough to trip `flowFieldActivationThreshold` -- the
      // one whose legs repeat most -- was the only destination that got no
      // cross-tick reuse at all, re-paying a full per-actor local A* every
      // tick. `findRouteCached` reads and writes the cache around whichever of
      // the two computed the answer, so the two mechanisms compose instead of
      // excluding each other: the field pays the region pass once per group per
      // tick, the cache pays the tile pass once per leg per generation.
      const result = findRouteCached(
        params.routeCache,
        (doorDependencies) => {
          if (eligible && destinationRegion !== undefined && groupKey !== undefined) {
            let field = fieldsThisTick.get(groupKey);
            if (field === undefined) {
              field = getOrComputeRegionFlowField(params.flowFieldCache, params.graph, params.doors, destinationRegion, entry.request.context, stats);
              fieldsThisTick.set(groupKey, field);
              this.flowFieldActivations += 1;
            }
            const viaField = findRouteUsingFlowField(
              field,
              params.world,
              params.doors,
              params.graph,
              entry.request.origin,
              entry.request.destination,
              stats,
              doorDependencies,
            );
            if (viaField !== undefined) {
              usedFlowField = true;
              return viaField;
            }
            // The field could not answer (unreachable or blocked for this
            // context): fall through to the full search, which owns the
            // accurate diagnosis -- and drop what the field recorded, since
            // `findRoute` records its own.
            doorDependencies.clear();
          }
          return findRoute(
            params.world,
            params.doors,
            params.graph,
            entry.request.origin,
            entry.request.destination,
            entry.request.context,
            stats,
            doorDependencies,
          );
        },
        entry.request.origin,
        entry.request.destination,
        entry.request.context,
        params.graph,
        params.doors,
      );

      this.pending.delete(entry.request.id);
      this.resolvedCount += 1;
      this.totalExpansions += stats.expansions;
      usedBudget += stats.expansions;

      resolved.push({
        id: entry.request.id,
        result,
        usedFlowField,
        expansions: stats.expansions,
        waitedTicks: params.tick - entry.enqueuedAtTick,
      });
    }

    return resolved;
  }
}

function flowFieldGroupKey(destinationRegion: RegionId, context: RouteContext): string {
  return `${destinationRegion}#${routeContextFingerprint(context)}`;
}
