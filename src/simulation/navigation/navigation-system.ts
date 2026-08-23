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
 * Door placement and chunk loading are not wired into construction/world
 * streaming yet (see `docs/NAVIGATION.md`), so both are driven externally:
 * register doors on `.doors` directly, and call `setLoadedChunks` whenever
 * the set of loaded chunk positions changes.
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

  public pendingCount(): number {
    return this.queue.size();
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
