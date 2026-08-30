import type { SimulationContext, SystemRegistration } from '../kernel/system';
import type { ChunkPosition, TilePosition } from '../world/coordinates';
import { type ChunkState, SparseWorld } from '../world/sparse-world';
import { DoorRegistry } from './door';
import { FlowFieldCache, type FlowFieldCacheMetrics } from './flow-field';
import {
  PathRequestQueue,
  type PathRequestPriority,
  type PathRequestQueueMetrics,
  type ResolvedPathRequest,
} from './path-request-queue';
import { buildNavigationGraph, isNavigationGraphStale, type NavigationGraph } from './region-graph';
import { RouteCache, type RouteCacheMetrics } from './route-cache';
import type { RouteContext } from './route-context';
import { isEdgeTraversable } from './traversal';

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
