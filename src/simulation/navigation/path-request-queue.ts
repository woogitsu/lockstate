import type { SparseWorld } from '../world/sparse-world';
import { tileKey, type TilePosition } from '../world/coordinates';
import type { DoorRegistry } from './door';
import { RouteCache } from './route-cache';
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

  /**
   * Every request still waiting, **ascending by id**, with the tick it was
   * enqueued on (issue #1373, ADR 0059 option 5).
   *
   * `enqueuedAtTick` is carried because it is two thirds of the service
   * order: `processTick` sorts by effective priority -- which ages by it --
   * then by it, then by id. A restore that re-enqueued the same requests at
   * the restore tick would serve them in a different order, and a different
   * order under a binding `workBudget` is a different tick of arrival.
   *
   * Ascending by id rather than in `Map` insertion order, because `processTick`
   * sorts into a total order before it reads anything, so insertion order is
   * history rather than state and must not reach a save's checksum.
   */
  public getSnapshot(): readonly PendingPathRequestSnapshot[] {
    return [...this.pending.values()]
      .map((entry) => ({ ...copyRequest(entry.request), enqueuedAtTick: entry.enqueuedAtTick }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  /**
   * Replaces the waiting set with `snapshot`. The counters `getMetrics`
   * reports are diagnostics of this instance's own work and are left alone:
   * nothing reads them to decide anything, and no save carries them.
   */
  public loadSnapshot(snapshot: readonly PendingPathRequestSnapshot[]): void {
    this.pending.clear();
    for (const { enqueuedAtTick, ...request } of snapshot) {
      if (this.pending.has(request.id)) throw new RangeError(`Path request id appears twice in a snapshot: ${request.id}`);
      if (!Number.isInteger(enqueuedAtTick) || enqueuedAtTick < 0) throw new RangeError(`Path request ${request.id} has an invalid enqueue tick.`);
      this.pending.set(request.id, { request: copyRequest(request), enqueuedAtTick });
    }
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
    /** Groups whose region pass has been charged this tick -- once per group, at its first request served. */
    const chargedGroups = new Set<string>();
    /** Groups a leg was computed through this tick: what `flowFieldActivations` has always counted. */
    const activatedGroups = new Set<string>();
    const resolved: ResolvedPathRequest[] = [];
    let usedBudget = 0;

    for (const entry of entries) {
      if (resolved.length > 0 && usedBudget >= params.workBudget) break;

      /** The work actually done, reported as `expansions` and summed into `totalExpansions`. */
      const stats: SearchStats = { expansions: 0 };
      const destinationRegion = params.graph.tileToRegion.get(tileKey(entry.request.destination));
      const groupKey = destinationRegion === undefined ? undefined : flowFieldGroupKey(destinationRegion, entry.request.context);
      const eligible = groupKey !== undefined && (groupCounts.get(groupKey) ?? 0) >= this.options.flowFieldActivationThreshold;

      /*
       * **What the budget is charged, which since issue #1373 is not the work
       * done.** The budget is charged what this request costs *computed cold*:
       * the region pass of its group's field once per group per tick, plus its
       * own leg by the method the company it keeps this tick selects. A cache
       * hit is charged the price recorded when that leg was last computed that
       * way, not zero.
       *
       * Measured before the change: a `RouteCache` or `FlowFieldCache` hit cost
       * nothing, a restore starts both empty, and so a restored session paid
       * for searches the saved one had paid for before the save. On a tick the
       * budget binds, that moved the point at which it stopped -- through a
       * real save and restore, a 24-prisoner prison served a different set of
       * requests at a regime block change (`tests/determinism/restore-mid-walk-exactness.test.ts`).
       * Every term of the charge is a pure function of the pending set, the
       * world and the doors, so a warm cache and a cold one charge the same;
       * the caches still save the CPU, which is what they are for, and
       * `expansions` still reports that saving honestly.
       */
      let charge = 0;
      let field: RegionFlowField | undefined;
      if (eligible && destinationRegion !== undefined && groupKey !== undefined) {
        field = fieldsThisTick.get(groupKey);
        if (field === undefined) {
          // Fetched for the price even when every leg of the group is a cache
          // hit, which is usually a `FlowFieldCache` hit and costs no search.
          // `flowFieldActivations` still counts only the groups whose field a
          // leg was actually computed through -- see `activatedGroups`.
          field = getOrComputeRegionFlowField(params.flowFieldCache, params.graph, params.doors, destinationRegion, entry.request.context, stats);
          fieldsThisTick.set(groupKey, field);
        }
        if (!chargedGroups.has(groupKey)) {
          chargedGroups.add(groupKey);
          charge += field.computationExpansions;
        }
      }

      let usedFlowField = false;
      /**
       * The leg, by the method this tick selects. Also used on a cache hit whose
       * price for that method is not known yet, to measure it; the answer is
       * discarded then, because `tests/determinism/navigation-cache-agreement.test.ts`
       * and `navigation-shared-plan-equivalence.test.ts` pin that a cached
       * answer and a fresh one are the same.
       */
      const computeLeg = (legStats: SearchStats, doorDependencies: Set<string>): { readonly result: RouteResult; readonly viaField: boolean } => {
        if (field !== undefined && groupKey !== undefined) {
          if (!activatedGroups.has(groupKey)) {
            activatedGroups.add(groupKey);
            this.flowFieldActivations += 1;
          }
          const viaField = findRouteUsingFlowField(
            field,
            params.world,
            params.doors,
            params.graph,
            entry.request.origin,
            entry.request.destination,
            legStats,
            doorDependencies,
          );
          if (viaField !== undefined) return { result: viaField, viaField: true };
          // The field could not answer (unreachable or blocked for this
          // context): fall through to the full search, which owns the
          // accurate diagnosis -- and drop what the field recorded, since
          // `findRoute` records its own.
          doorDependencies.clear();
        }
        return {
          result: findRoute(
            params.world,
            params.doors,
            params.graph,
            entry.request.origin,
            entry.request.destination,
            entry.request.context,
            legStats,
            doorDependencies,
          ),
          viaField: false,
        };
      };

      // The route cache is asked first and flow-field sharing decides only how
      // a *miss* is computed (#359): the field pays the region pass once per
      // group per tick, the cache pays the tile pass once per leg per
      // generation.
      let result: RouteResult;
      const cached = params.routeCache.lookup(entry.request.origin, entry.request.destination, entry.request.context, params.graph, params.doors);
      if (cached !== undefined) {
        result = cached.result;
        const known = field !== undefined ? (cached.prices.field?.against === field ? cached.prices.field.expansions : undefined) : cached.prices.direct;
        if (known !== undefined) {
          charge += known;
        } else {
          const legStats: SearchStats = { expansions: 0 };
          computeLeg(legStats, new Set<string>());
          stats.expansions += legStats.expansions;
          charge += legStats.expansions;
          if (field !== undefined) cached.prices.field = { against: field, expansions: legStats.expansions };
          else cached.prices.direct = legStats.expansions;
        }
      } else {
        const legStats: SearchStats = { expansions: 0 };
        const doorDependencies = new Set<string>();
        const computed = computeLeg(legStats, doorDependencies);
        result = computed.result;
        usedFlowField = computed.viaField;
        stats.expansions += legStats.expansions;
        charge += legStats.expansions;
        params.routeCache.set(
          entry.request.origin,
          entry.request.destination,
          entry.request.context,
          params.graph,
          params.doors,
          result,
          doorDependencies,
          field !== undefined ? { field: { against: field, expansions: legStats.expansions } } : { direct: legStats.expansions },
        );
      }

      this.pending.delete(entry.request.id);
      this.resolvedCount += 1;
      this.totalExpansions += stats.expansions;
      usedBudget += charge;

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
