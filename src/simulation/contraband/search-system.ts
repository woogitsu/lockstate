import type { EntityId } from '../entity/entity-store';
import type { SimulationContext, SystemRegistration } from '../kernel/system';
import type { NavigationSystem } from '../navigation/navigation-system';
import type { RouteContext } from '../navigation/route-context';
import { resolveStaffRouteContext } from '../security/access-policy';
import type { GuardRoster } from '../security/guard-roster';
import type { TilePosition } from '../world/coordinates';
import { ConfiscationLedger } from './confiscation';
import { ContrabandRegistry } from './item';
import type { IntelligenceLedger, IntelligenceTargetKind } from './intelligence';
import { resolveDetectionProbability, type SearchPolicyDefinition, type SearchScope, type SearchTarget } from './search-policy';

export interface SearchOrderInput {
  readonly id: string;
  readonly scope: SearchScope;
  /** One target for `'person'`/`'cell'`/`'delivery'`; several for a `'sector'` sweep -- the caller (session/scenario, which already knows sector membership) supplies the list explicitly rather than this system inferring it. */
  readonly targets: readonly SearchTarget[];
}

export type SearchJobState = 'travelling' | 'searching';

interface SearchJobRecord {
  readonly id: string;
  readonly scope: SearchScope;
  readonly targets: readonly SearchTarget[];
  readonly guardIds: readonly EntityId[];
  currentTargetIndex: number;
  state: SearchJobState;
  /** `false` right after (re)entering `'travelling'` (fresh assignment, next target, or post-restore) -- `update` issues route requests exactly once per such transition. */
  travelInFlight: boolean;
  pathRequestIdsByGuard: Map<EntityId, string>;
  dwellStartedAtTick: number | undefined;
}

export interface SearchMetrics {
  readonly itemsDiscovered: number;
  readonly itemsMissed: number;
  readonly searchesCompleted: number;
  readonly searchesCancelled: number;
  readonly searchesQueued: number;
}

export type TargetLocationResolver = (target: SearchTarget) => TilePosition;
/** Category concealment lookup, injected rather than importing the content catalog directly -- keeps this system usable against any catalog a session provides, matching `DeploymentSystem`'s own decoupling from a specific staff-role source. */
export type CategoryConcealmentResolver = (categoryId: string) => number;

function sameTile(a: TilePosition, b: TilePosition): boolean {
  return a.x === b.x && a.y === b.y;
}

/** `'container'` holders (in-transit delivery stock) have no intelligence targeting in this slice -- informants/observations report on people and cells, not on crates. */
function intelligenceTargetKindFor(holderKind: SearchTarget['holderKind']): IntelligenceTargetKind | undefined {
  if (holderKind === 'prisoner' || holderKind === 'staff' || holderKind === 'cell') return holderKind;
  return undefined;
}

/**
 * Issue #27's search/detection loop: fills a queued order from currently-
 * unassigned guards (a real, finite, shared pool -- exactly the
 * "staffing diversion" the architecture notes call for, since every guard
 * this system claims is one `DeploymentSystem` cannot use to fill a sector
 * shortage that same cycle), drives them through the real
 * `NavigationSystem` to each target in turn (no-teleport), dwells for the
 * policy's duration, then runs one deterministic named-RNG detection check
 * per concealed item found at that target.
 */
export class SearchSystem implements SystemRegistration {
  public readonly id = 'contraband.search';
  public readonly order = 290;
  public readonly schedule = { intervalTicks: 10, phaseTicks: 0 };

  private readonly queue: SearchOrderInput[] = [];
  private readonly active = new Map<string, SearchJobRecord>();
  private requestSequence = 0;
  private itemsDiscovered = 0;
  private itemsMissed = 0;
  private searchesCompleted = 0;
  private searchesCancelled = 0;

  public constructor(
    private readonly guards: GuardRoster,
    private readonly navigation: NavigationSystem,
    private readonly contraband: ContrabandRegistry,
    private readonly intelligence: IntelligenceLedger,
    private readonly confiscations: ConfiscationLedger,
    private readonly policies: readonly SearchPolicyDefinition[],
    private readonly categoryConcealment: CategoryConcealmentResolver,
    private readonly locateTarget: TargetLocationResolver,
    private readonly routeContextResolver: (staffRoleId: string) => RouteContext = (staffRoleId) => resolveStaffRouteContext(staffRoleId),
  ) {}

  public getMetrics(): SearchMetrics {
    return { itemsDiscovered: this.itemsDiscovered, itemsMissed: this.itemsMissed, searchesCompleted: this.searchesCompleted, searchesCancelled: this.searchesCancelled, searchesQueued: this.queue.length };
  }

  public getJobState(orderId: string): SearchJobState | undefined {
    return this.active.get(orderId)?.state;
  }

  /**
   * The guards this system is currently holding on the `'on-search'`
   * deployment phase.
   *
   * Exposed because `'on-search'` is a *shared* phase with exactly one other
   * producer, `IncidentResponseSystem`, and that system needs to tell the two
   * apart in order to hand back the responders a save interrupted without
   * touching a search job's guards (issue #352). This is the read that makes
   * the distinction, rather than each system stamping an owner onto the guard
   * record -- a search job already names its guards and that naming is in the
   * payload, so there is no second source of truth to keep in step.
   *
   * Queued orders name no guards: `assignQueuedOrders` claims them at the
   * moment it activates an order, so an order still in `queue` holds nothing.
   *
   * Deterministic: ascending entity id.
   */
  public claimedGuardIds(): readonly EntityId[] {
    const claimed = new Set<EntityId>();
    for (const job of this.activeJobsInCanonicalOrder()) for (const guardId of job.guardIds) claimed.add(guardId);
    return [...claimed].sort((a, b) => a - b);
  }

  public isQueued(orderId: string): boolean {
    return this.queue.some((order) => order.id === orderId);
  }

  /** Enqueues a search -- stays queued (observably) until enough unassigned guards exist to staff it, per "searches create jobs and consume staff/time rather than resolving instantly." */
  public submitOrder(input: SearchOrderInput): void {
    if (this.queue.some((existing) => existing.id === input.id) || this.active.has(input.id)) {
      throw new RangeError(`Duplicate search order id "${input.id}".`);
    }
    if (input.targets.length === 0) throw new RangeError(`Search order "${input.id}" has no targets.`);
    this.queue.push(input);
  }

  private findPolicy(scope: SearchScope): SearchPolicyDefinition {
    const policy = this.policies.find((candidate) => candidate.scope === scope);
    if (policy === undefined) throw new RangeError(`No search policy defined for scope "${scope}".`);
    return policy;
  }

  /**
   * Active jobs in canonical order (ascending order id), never `Map`
   * insertion order.
   *
   * `advanceJob` -> `runDetectionForCurrentTarget` draws from the shared
   * `contraband.detection` RNG stream, so the order jobs are advanced in
   * decides *which* draw each concealed item is checked against. Insertion
   * order is a property of this instance's history (the order orders were
   * submitted and staffed); `getSnapshot` emits jobs sorted by id and
   * `loadSnapshot` re-inserts them in that sorted order, so a
   * snapshot -> restore round trip silently re-ordered the draws and
   * changed which items a search discovered. Under ADR 0009 that is not a
   * cosmetic difference: replay verification compares state hashes, so a
   * restored session would disagree with a continuous one and invalidate
   * its own evidence. Sorting here makes iteration order a function of
   * *state* rather than of history, which is what makes the round trip
   * lossless. Pinned by `tests/determinism/iteration-order.test.ts`.
   */
  private activeJobsInCanonicalOrder(): readonly SearchJobRecord[] {
    return [...this.active.keys()].sort().map((id) => this.active.get(id)!);
  }

  public update(context: SimulationContext): void {
    this.assignQueuedOrders(context.tick);
    for (const job of this.activeJobsInCanonicalOrder()) this.advanceJob(job, context);
  }

  private assignQueuedOrders(tick: number): void {
    while (this.queue.length > 0) {
      const next = this.queue[0]!;
      const policy = this.findPolicy(next.scope);
      const available = this.guards.unassignedGuardIds();
      if (available.length < policy.requiredGuardCount) return; // stays queued -- observable backlog, not a failure
      this.queue.shift();
      const guardIds = available.slice(0, policy.requiredGuardCount);
      for (const guardId of guardIds) this.guards.setDeploymentPhase(guardId, 'on-search');
      this.active.set(next.id, {
        id: next.id,
        scope: next.scope,
        targets: next.targets,
        guardIds,
        currentTargetIndex: 0,
        state: 'travelling',
        travelInFlight: false,
        pathRequestIdsByGuard: new Map(),
        dwellStartedAtTick: undefined,
      });
    }
  }

  private beginTravelToCurrentTarget(job: SearchJobRecord, tick: number): void {
    const destination = this.locateTarget(job.targets[job.currentTargetIndex]!);
    for (const guardId of job.guardIds) {
      const currentTile = this.guards.getTile(guardId);
      if (sameTile(currentTile, destination)) continue;
      this.requestSequence += 1;
      const requestId = `contraband.search.${job.id}.${guardId}.${this.requestSequence}`;
      const routeContext = this.routeContextResolver(this.guards.getStaffRoleId(guardId));
      this.navigation.requestRoute(requestId, currentTile, destination, routeContext, 1, tick);
      job.pathRequestIdsByGuard.set(guardId, requestId);
    }
  }

  private releaseGuards(job: SearchJobRecord): void {
    for (const guardId of job.guardIds) this.guards.unassign(guardId);
  }

  private advanceJob(job: SearchJobRecord, context: SimulationContext): void {
    if (job.state === 'travelling') {
      if (!job.travelInFlight) {
        this.beginTravelToCurrentTarget(job, context.tick);
        job.travelInFlight = true;
      }

      const destination = this.locateTarget(job.targets[job.currentTargetIndex]!);
      let allArrived = true;
      for (const guardId of job.guardIds) {
        const requestId = job.pathRequestIdsByGuard.get(guardId);
        if (requestId === undefined) continue; // already at destination, or already resolved this leg
        const outcome = this.navigation.getResult(requestId);
        if (outcome === undefined) {
          allArrived = false;
          continue;
        }
        this.navigation.clearResult(requestId);
        job.pathRequestIdsByGuard.delete(guardId);
        if (!outcome.result.ok) {
          this.releaseGuards(job);
          this.active.delete(job.id);
          this.searchesCancelled += 1;
          return;
        }
        this.guards.setTile(guardId, destination);
      }
      if (!allArrived) return;

      job.state = 'searching';
      job.dwellStartedAtTick = context.tick;
      return;
    }

    // job.state === 'searching'
    const policy = this.findPolicy(job.scope);
    const elapsed = context.tick - (job.dwellStartedAtTick ?? context.tick);
    if (elapsed < policy.dwellTicksPerTarget) return;

    this.runDetectionForCurrentTarget(job, policy, context);

    job.currentTargetIndex += 1;
    if (job.currentTargetIndex >= job.targets.length) {
      this.releaseGuards(job);
      this.active.delete(job.id);
      this.searchesCompleted += 1;
      return;
    }
    job.state = 'travelling';
    job.travelInFlight = false;
    job.pathRequestIdsByGuard.clear();
  }

  private maxIntelligenceConfidenceFor(target: SearchTarget): number {
    const kind = intelligenceTargetKindFor(target.holderKind);
    if (kind === undefined) return 0;
    let max = 0;
    for (const record of this.intelligence.forTarget(kind, target.holderId)) max = Math.max(max, record.confidence);
    return max;
  }

  private runDetectionForCurrentTarget(job: SearchJobRecord, policy: SearchPolicyDefinition, context: SimulationContext): void {
    const target = job.targets[job.currentTargetIndex]!;
    const items = this.contraband.byHolder(target.holderKind, target.holderId);
    if (items.length === 0) return;

    const intelligenceConfidence = this.maxIntelligenceConfidenceFor(target);
    const rng = context.rng.get('contraband.detection');

    for (const item of items) {
      const concealment = this.categoryConcealment(item.categoryId);
      const probability = resolveDetectionProbability(policy, concealment, intelligenceConfidence);
      const detected = rng.nextFloat() < probability;
      if (!detected) {
        this.itemsMissed += 1;
        continue;
      }
      this.contraband.confiscate(item.id);
      this.itemsDiscovered += 1;
      this.confiscations.record({
        itemId: item.id,
        categoryId: item.categoryId,
        provenance: item.provenance,
        foundAtHolder: item.holder,
        searchOrderId: job.id,
        foundByGuardId: job.guardIds[0]!,
        tick: context.tick,
      });
    }
  }

  public getSnapshot(): {
    readonly queue: readonly SearchOrderInput[];
    readonly active: readonly (readonly [string, { readonly scope: SearchScope; readonly targets: readonly SearchTarget[]; readonly guardIds: readonly EntityId[]; readonly currentTargetIndex: number }])[];
    readonly metrics: { readonly itemsDiscovered: number; readonly itemsMissed: number; readonly searchesCompleted: number; readonly searchesCancelled: number };
  } {
    return {
      queue: this.queue.map((order) => ({ ...order })),
      active: this.activeJobsInCanonicalOrder().map((job) => [job.id, { scope: job.scope, targets: job.targets, guardIds: job.guardIds, currentTargetIndex: job.currentTargetIndex }] as const),
      metrics: { itemsDiscovered: this.itemsDiscovered, itemsMissed: this.itemsMissed, searchesCompleted: this.searchesCompleted, searchesCancelled: this.searchesCancelled },
    };
  }

  /**
   * A guard mid-leg referenced a path request against the *previous*
   * `NavigationSystem` instance's queue -- restored jobs always re-enter
   * `'travelling'` with a fresh dwell timer, matching #25/#26's "restart
   * rather than assume arrival" restore convention. A restored `'searching'`
   * job simply repeats an already-arrived-at leg (guards are already at
   * the target tile, so `beginTravelToCurrentTarget` immediately finds
   * `sameTile` true and issues no requests), extending that leg's wait by
   * at most `dwellTicksPerTarget` -- never losing search progress.
   */
  public loadSnapshot(snapshot: ReturnType<SearchSystem['getSnapshot']>): void {
    this.queue.length = 0;
    this.queue.push(...snapshot.queue.map((order) => ({ ...order })));
    this.active.clear();
    for (const [id, job] of snapshot.active) {
      this.active.set(id, {
        id,
        scope: job.scope,
        targets: job.targets,
        guardIds: job.guardIds,
        currentTargetIndex: job.currentTargetIndex,
        state: 'travelling',
        travelInFlight: false,
        pathRequestIdsByGuard: new Map(),
        dwellStartedAtTick: undefined,
      });
    }
    this.itemsDiscovered = snapshot.metrics.itemsDiscovered;
    this.itemsMissed = snapshot.metrics.itemsMissed;
    this.searchesCompleted = snapshot.metrics.searchesCompleted;
    this.searchesCancelled = snapshot.metrics.searchesCancelled;
  }
}
