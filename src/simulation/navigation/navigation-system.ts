import type { SimulationContext, SystemRegistration } from '../kernel/system';
import type { ChunkPosition, TilePosition } from '../world/coordinates';
import { type ChunkState, SparseWorld } from '../world/sparse-world';
import { DoorRegistry } from './door';
import { FlowFieldCache, type FlowFieldCacheMetrics, type FlowFieldWarmthKey } from './flow-field';
import {
  PathRequestQueue,
  type PendingPathRequestSnapshot,
  type PathRequestPriority,
  type PathRequestQueueMetrics,
  type ResolvedPathRequest,
} from './path-request-queue';
import { buildNavigationGraph, isNavigationGraphStale, type NavigationGraph } from './region-graph';
import type { Route, RouteResult } from './route';
import { RouteCache, type RouteCacheMetrics, type RouteCacheWarmthKey } from './route-cache';
import type { RouteContext } from './route-context';
import { isEdgeTraversable } from './traversal';
import { MAX_CACHE_WARMTH_REBUILD_EXPANSIONS } from './cache-limits';

/**
 * A resolved route as a save carries it: the answer, without the three
 * diagnostics of how it was reached. See `NavigationSystem.getInFlightSnapshot`
 * for why those are left out.
 */
export interface ResolvedPathRequestSnapshot {
  readonly id: string;
  readonly result: RouteResult;
}

/** What `NavigationSystem.getInFlightSnapshot` carries: see that method. */
export interface NavigationInFlightSnapshot {
  readonly pending: readonly PendingPathRequestSnapshot[];
  readonly results: readonly ResolvedPathRequestSnapshot[];
  readonly cacheWarmth?: {
    readonly geometrySignature: string;
    readonly routes: readonly RouteCacheWarmthKey[];
    readonly fields: readonly FlowFieldWarmthKey[];
  };
}

function copyRoute(route: Route): Route {
  return {
    segments: route.segments.map((segment) => ({
      regionId: segment.regionId,
      waypoints: segment.waypoints.map((waypoint) => ({ x: waypoint.x, y: waypoint.y })),
      ...(segment.enteredViaDoorId === undefined ? {} : { enteredViaDoorId: segment.enteredViaDoorId }),
    })),
    totalCost: route.totalCost,
  };
}

function copyResult(result: RouteResult): RouteResult {
  if (result.ok) return { ok: true, route: copyRoute(result.route) };
  const { failure } = result;
  return {
    ok: false,
    failure: {
      reason: failure.reason,
      ...(failure.blockedBy === undefined ? {} : { blockedBy: { doorId: failure.blockedBy.doorId, reason: failure.blockedBy.reason } }),
    },
  };
}


export interface NavigationSystemOptions {
  /** Deterministic work-unit (expanded search node) budget spent per tick; see `PathRequestQueue.processTick`. */
  readonly workBudgetPerTick: number;
  readonly agingIntervalTicks: number;
  readonly flowFieldActivationThreshold: number;
}

/**
 * Kernel-schedulable system wrapping issue #22's request queue, caches and
 * region/portal graph around issue #21's `findRoute`. Generic over request
 * identity (`id: string`) so it stays independent of any specific
 * entity/gameplay model -- #23/#24 own what a prisoner or staff member
 * *is*; this only owns getting a path from A to B for whatever asks.
 *
 * Chunk loading is not wired into world streaming yet (see
 * `docs/NAVIGATION.md`), so it is driven externally: call `setLoadedChunks`
 * whenever the set of loaded chunk positions changes. **Door placement is
 * wired**: a completed `door-wooden` order reaches `.doors` through
 * `DoorConstructionService`, which the composition root hands this system's own
 * registry to. Registering on `.doors` directly is still what a fixture or a
 * restore does.
 */
export class NavigationSystem implements SystemRegistration {
  public readonly id = 'navigation';
  public readonly order = 150;
  public readonly schedule = { intervalTicks: 1, phaseTicks: 0 };

  public readonly doors: DoorRegistry;

  private readonly routeCache = new RouteCache();
  private readonly flowFieldCache = new FlowFieldCache();
  private readonly queue: PathRequestQueue;
  private readonly results = new Map<string, ResolvedPathRequest>();
  private loadedChunkPositions: readonly ChunkPosition[] = [];
  private graph: NavigationGraph;

  public constructor(
    private readonly world: SparseWorld,
    private readonly options: NavigationSystemOptions,
    doors: DoorRegistry = new DoorRegistry(),
  ) {
    this.doors = doors;
    this.queue = new PathRequestQueue({
      agingIntervalTicks: options.agingIntervalTicks,
      flowFieldActivationThreshold: options.flowFieldActivationThreshold,
    });
    this.graph = buildNavigationGraph(this.world, this.doors, []);
  }

  public setLoadedChunks(positions: readonly ChunkPosition[]): void {
    this.loadedChunkPositions = positions;
  }

  public requestRoute(
    id: string,
    origin: TilePosition,
    destination: TilePosition,
    context: RouteContext,
    priority: PathRequestPriority,
    tick: number,
  ): void {
    this.queue.enqueue({ id, origin, destination, context, priority }, tick);
  }

  public cancelRequest(id: string): boolean {
    return this.queue.cancel(id);
  }

  public getResult(id: string): ResolvedPathRequest | undefined {
    return this.results.get(id);
  }

  /** Callers should clear a result once consumed; the system never expires results on its own. */
  public clearResult(id: string): void {
    this.results.delete(id);
  }

  /**
   * Drops a request whose owner has gone away, whichever half of the journey
   * it had reached.
   *
   * ## Why one call and not two
   *
   * A request in flight lives in exactly one of two places, and which one is a
   * race the caller cannot win: still `pending` in the queue, or already
   * resolved and sitting in `results` waiting to be collected. A teardown that
   * calls only `cancelRequest` misses the second; one that calls only
   * `clearResult` misses the first. Both existing correct teardowns --
   * `src/simulation/prisoners/release.ts` and `src/simulation/staff/dismissal.ts`
   * -- discovered that and call both, and each says so in its own comment; five
   * other teardown paths called neither and simply forgot the id.
   *
   * Measured before this method existed: releasing one of four riot responders
   * mid-travel through the real `ReleaseGuardAssignment` command left
   * `incidents.respond.incident-riot.1.2` in `results` for the rest of the
   * session, while the three responders that were not released collected and
   * cleared theirs. `SearchSystem`'s own comment asserted the opposite -- *"a
   * result nothing collects is garbage the queue ages out"* -- and that is
   * false in both halves: `PathRequestQueue`'s aging raises a waiting request's
   * *effective priority* and never evicts it, and nothing at all expires a
   * resolved result. So an abandoned request is searched at full cost and then
   * retained for ever.
   *
   * So the question "which half is it in" is answered here, once, and a
   * teardown cannot get it half right.
   *
   * `true` when something was actually dropped, so a caller that wants to count
   * abandonments can; total, like the two calls it replaces -- an id nothing
   * holds is a no-op rather than an error, because a teardown runs on paths
   * where the request may legitimately have been consumed already.
   */
  public abandonRequest(id: string): boolean {
    const cancelled = this.queue.cancel(id);
    const hadResult = this.results.delete(id);
    return cancelled || hadResult;
  }

  public pendingCount(): number {
    return this.queue.size();
  }

  /**
   * How many resolved routes are waiting to be collected.
   *
   * The counterpart to `pendingCount`, and it exists because the leak
   * `abandonRequest` closes is invisible without it: a result nothing collects
   * is indistinguishable from one that has not been collected *yet* unless a
   * test can watch the number fail to come back down. `tests/integration/security-guard-release.test.ts`
   * is what reads it.
   */
  public resultCount(): number {
    return this.results.size;
  }

  /**
   * The work in flight: requests still waiting, and resolved routes nobody has
   * collected yet (issue #1373, ADR 0059 option 5 -- the owner's ruling of
   * 2026-09-23).
   *
   * ## Why the queue is carried rather than re-asked for by its owners
   *
   * The alternative is that each of the four owners that survive a restore
   * (`ActionSystem`, `DeploymentSystem`, `PatrolSystem`, `SearchSystem`)
   * re-enqueues its request on load. That was measured against what the queue
   * does with a request, and it cannot be exact:
   *
   * - **Service order is `(effective priority, enqueuedAtTick, id)`**, and
   *   effective priority ages by `enqueuedAtTick` (`processTick`). An owner
   *   re-enqueuing on load enqueues at the *restore* tick, so a request that
   *   had aged past a newer one sorts behind it, and under a binding
   *   `workBudget` that is a different tick of service. Re-queuing "in the
   *   original order" would need each owner to remember the enqueue tick, the
   *   origin, the destination and the route context it asked with -- the whole
   *   request, stored four times in four shapes instead of once here.
   * - **A resolved result has no owner-side equivalent at all.** A route
   *   resolves at order 150 and `ActionSystem` collects it at its next
   *   reconsideration, up to twenty ticks later; a save in that window holds a
   *   route that no owner could re-ask for without paying the search again at a
   *   different tick. The later #1373 amendment saves cache membership too.
   *
   * So the queue's own contents are the save's, ids and all, and every owner
   * keeps the id it already held. The later ADR 0007 amendment carries cache
   * answers and dependencies, validated against world and doors on load.
   * The region graph remains derived.
   *
   * ## Why a result is carried without `expansions`, `usedFlowField` and `waitedTicks`
   *
   * **Measured, not tidied.** With all five fields carried, a save taken with
   * nobody's result outstanding still diverged from the continuous run: the
   * restored session's first route to the yard reported `expansions: 88`
   * where the continuous one reported `0`, because the continuous session's
   * `RouteCache` already held that leg and the restored one starts cold. The
   * route was the same; the cost of finding it was not. Those three fields
   * describe *how the search went* -- a cache's warmth, a flow field's group
   * size, how long the request queued -- and nothing in `src/` reads any of
   * them to decide anything (the owners read `result` alone). Carrying them
   * would put cache state into a save's checksum, which is exactly what ADR
   * 0007 keeps out of it. A restored result reports `0`, `false` and `0`:
   * the search that produced it happened in a session that has ended, and
   * this one did none of that work.
   *
   * **What this does not settle, and it is the weakest part of the exactness
   * claim.** The same cold cache also means the restored session's *searches*
   * cost more expansions against `workBudgetPerTick` than the continuous
   * session's hits did. While the budget does not bind that changes nothing,
   * because every waiting request is served that tick either way -- and it
   * did not bind on any save `tests/determinism/restore-mid-walk-exactness.test.ts`
   * takes. Where it binds, a restored session can serve a request a tick later
   * than the session it was saved from.
   *
   * **Corrected the same day, 2026-09-23: it binds, and the effect is not one
   * tick.** At 24 and 36 prisoners in six rows of cells, a save taken before
   * a block change served a different set of requests. That is pinned as a
   * known divergence in the test above. The fix that makes the budget ignore
   * cache warmth was built and withdrawn for its latency cost. ADR 0059's
   * amendment under "Determinism" carries the numbers and the open choice.
   *
   * **Superseded 2026-09-25:** ADR 0007's cache-warmth amendment now saves
   * validated cache answers. The budget-bound restore test requires equality.
   *
   * Deterministic: both lists ascending by id.
   */
  public getInFlightSnapshot(): NavigationInFlightSnapshot {
    const graph = this.ensureGraph();
    return {
      pending: this.queue.getSnapshot(),
      results: [...this.results.values()]
        .map((outcome) => ({ id: outcome.id, result: copyResult(outcome.result) }))
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
      cacheWarmth: {
        geometrySignature: graph.geometrySignature,
        routes: this.routeCache.getWarmthSnapshot(graph, this.doors),
        fields: this.flowFieldCache.getWarmthSnapshot(graph, this.doors),
      },
    };
  }

  /** Replaces the waiting set and the uncollected results with a snapshot's. For a restore, before any owner's `loadSnapshot` asks `knowsRequest`. */
  public loadInFlightSnapshot(snapshot: NavigationInFlightSnapshot): void {
    this.queue.loadSnapshot(snapshot.pending);
    this.results.clear();
    for (const outcome of snapshot.results) {
      if (this.results.has(outcome.id) || this.queue.has(outcome.id)) {
        throw new RangeError(`Path request id is both waiting and resolved, or resolved twice, in a snapshot: ${outcome.id}`);
      }
      this.results.set(outcome.id, { id: outcome.id, result: copyResult(outcome.result), usedFlowField: false, expansions: 0, waitedTicks: 0 });
    }
    if (snapshot.cacheWarmth !== undefined) {
      const graph = this.ensureGraph();
      if (snapshot.cacheWarmth.geometrySignature !== graph.geometrySignature) throw new RangeError('Navigation cache geometry differs from saved world.');
      const restoreWork = { expansions: 0, maxExpansions: MAX_CACHE_WARMTH_REBUILD_EXPANSIONS };
      this.flowFieldCache.loadWarmthSnapshot(snapshot.cacheWarmth.fields, graph, this.doors, restoreWork);
      this.routeCache.loadWarmthSnapshot(snapshot.cacheWarmth.routes, this.world, graph, this.doors, restoreWork);
    }
  }

  /**
   * Whether `id` names a request this system is holding, in either half.
   *
   * The question a restoring owner asks before trusting a request id its own
   * snapshot carried: a save that restored the owner's id but not the queue
   * entry would otherwise leave the actor waiting for ever on a result
   * nothing will produce -- the exact failure the old blanket reset existed to
   * prevent.
   */
  public knowsRequest(id: string): boolean {
    return this.queue.has(id) || this.results.has(id);
  }

  /**
   * Every request id this system holds, in either half, that begins with
   * `prefix` -- ascending.
   *
   * For an owner that mints its ids under a namespace and, after a restore,
   * holds no record of which ones it minted: `IncidentResponseSystem`, whose
   * response records a save does not carry (ADR 0033). Its first update after
   * a load gives back every request under its own prefix that no live record
   * names, which is the one place the ids a carried queue brought back can be
   * orphaned (issue #1373).
   */
  public requestIdsWithPrefix(prefix: string): readonly string[] {
    const waiting = this.queue.getSnapshot().map(({ id }) => id);
    const resolved = [...this.results.keys()].sort();
    return [...waiting, ...resolved].filter((id) => id.startsWith(prefix)).sort();
  }

  public getQueueMetrics(): PathRequestQueueMetrics {
    return this.queue.getMetrics();
  }

  public getRouteCacheMetrics(): RouteCacheMetrics {
    return this.routeCache.getMetrics();
  }

  public getFlowFieldCacheMetrics(): FlowFieldCacheMetrics {
    return this.flowFieldCache.getMetrics();
  }

  public getGraph(): NavigationGraph {
    return this.ensureGraph();
  }

  /**
   * Whether `context` may cross the boundary between two orthogonally adjacent
   * tiles **as the world stands on this tick**
   * (the ADR *When a route stops being valid*).
   *
   * The one question a walker asks this system, and the reason it is a method
   * here rather than a free function the caller wires itself: `world` and
   * `doors` are this system's, and a caller holding its own references to both
   * would be a second place that has to be handed the same pair and kept in
   * step with a restore. It is deliberately cheaper than everything else on
   * this class -- two chunk-cell reads and a `Map` lookup, no graph, no cache,
   * no queue -- because `LocomotionSystem` runs at 20 Hz and calls it once per
   * walker per tile crossed.
   *
   * It does **not** consult the region graph, and that is the point.
   * `ensureGraph` rebuilds lazily from a geometry revision, so routing through
   * it would make one walker's step depend on a whole-prison recomputation;
   * this asks only whether the one boundary in front of the actor is standing.
   */
  public canTraverseEdge(from: TilePosition, to: TilePosition, context: RouteContext): boolean {
    return isEdgeTraversable(this.world, this.doors, from, to, context);
  }

  private ensureGraph(): NavigationGraph {
    const chunkStates = this.loadedChunkPositions
      .map((position) => this.world.getChunk(position))
      .filter((state): state is ChunkState => state !== undefined);
    if (isNavigationGraphStale(this.graph, this.doors, chunkStates)) {
      this.graph = buildNavigationGraph(this.world, this.doors, chunkStates);
    }
    return this.graph;
  }

  public update(context: SimulationContext): void {
    const graph = this.ensureGraph();
    const resolved = this.queue.processTick({
      tick: context.tick,
      workBudget: this.options.workBudgetPerTick,
      world: this.world,
      doors: this.doors,
      graph,
      routeCache: this.routeCache,
      flowFieldCache: this.flowFieldCache,
    });
    for (const outcome of resolved) {
      this.results.set(outcome.id, outcome);
    }
  }
}
