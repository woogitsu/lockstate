import type { EntityId } from '../entity/entity-store';
import type { SimulationEventLog } from '../events';
import type { SimulationContext, SystemRegistration } from '../kernel/system';
import type { NavigationSystem } from '../navigation/navigation-system';
import type { RouteContext } from '../navigation/route-context';
import { resolveStaffRouteContext } from '../security/access-policy';
import type { GuardRoster } from '../security/guard-roster';
import { claimableSearchGuardIds } from '../security/post-eligibility';
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
  /**
   * Mutable since ADR 0034: `GuardReleaseService` can take one guard off a job
   * without cancelling it, so the list a job names is no longer fixed for the
   * job's life. Everything that reads it -- `getSnapshot`, `claimedGuardIds`,
   * `beginTravelToCurrentTarget`, `releaseGuards` -- reads it live, so there is
   * no second copy to keep in step.
   */
  guardIds: EntityId[];
  currentTargetIndex: number;
  state: SearchJobState;
  /** `false` right after (re)entering `'travelling'` (fresh assignment, next target, or post-restore) -- `update` issues route requests exactly once per such transition. */
  travelInFlight: boolean;
  pathRequestIdsByGuard: Map<EntityId, string>;
  dwellStartedAtTick: number | undefined;
}

/**
 * One active job's progress through its current target, as the save's
 * `inFlight` section carries it (issue #1373) -- the four fields
 * `getSnapshot` has never carried and `loadSnapshot` has always reset.
 */
export interface SearchJobInFlightSnapshot {
  readonly id: string;
  readonly state: SearchJobState;
  readonly travelInFlight: boolean;
  /** `[guardId, requestId]`, ascending by guard id. */
  readonly pathRequestIdsByGuard: readonly (readonly [EntityId, string])[];
  readonly dwellStartedAtTick?: number;
}

/** What `SearchSystem.getInFlightSnapshot` carries: see that method. */
export interface SearchInFlightSnapshot {
  readonly requestSequence: number;
  /** Ascending by job id, the order `activeJobsInCanonicalOrder` walks them in. */
  readonly jobs: readonly SearchJobInFlightSnapshot[];
}

/** A search in-flight snapshot to resume, and the question the resume asks of the restored `NavigationSystem`. */
export interface SearchInFlightRestore {
  readonly snapshot: SearchInFlightSnapshot;
  readonly knowsRequest: (requestId: string) => boolean;
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
/**
 * Category name-key lookup, injected beside `CategoryConcealmentResolver` above
 * and for the same reason it is: this system reads a catalog it does not import.
 *
 * `undefined` for a category the supplied catalog does not define, rather than a
 * fabricated `${categoryId}.name`. `soleDiscoveredContrabandNameKey`
 * (`src/simulation/presentation/status-strip-projection.ts`) makes the same call
 * in the same words -- *"a projection that guessed `${categoryId}.name` would be
 * authoring keys the locale need not contain"* -- and
 * `runDetectionForCurrentTarget` then records the confiscation and says nothing,
 * which is what `createResidentRelocationNotice` does for an unresolvable room.
 */
export type CategoryNameKeyResolver = (categoryId: string) => string | undefined;

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
 * unassigned guards **less the guards issue #996 reserves for incident
 * response** (`claimableSearchGuardIds`) -- a real, finite pool, exactly the
 * "staffing diversion" the architecture notes call for, since every guard this
 * system claims is one `DeploymentSystem` cannot use to fill a sector shortage
 * that same cycle, and the reserve is what stops the diversion reaching the
 * responder pool -- drives them through the real
 * `NavigationSystem` to each target in turn (no-teleport), dwells for the
 * policy's duration, then runs one deterministic named-RNG detection check
 * per concealed item found at that target.
 *
 * Every item it finds is confiscated, recorded on the `ConfiscationLedger` as
 * evidence, counted on `itemsDiscovered`, **and named to the player** on the
 * events channel (#703 ruling 13) -- see `runDetectionForCurrentTarget`.
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
    private readonly categoryNameKey: CategoryNameKeyResolver,
    private readonly locateTarget: TargetLocationResolver,
    /**
     * The session's `SimulationEventLog`, and required rather than defaulted for
     * the reason `PrisonerDischargeSystem`, `PayrollSystem`,
     * `IncidentTriggerSystem` and `IncidentResponseSystem` all state at their
     * own constructors: an optional sink is a system that can be wired to say
     * nothing, and a fixture that forgot it would silently be measuring a prison
     * that tells the player nothing about what its searches find. Issue #703
     * ruling 13 is the sentence; this is the only route it has.
     */
    private readonly events: SimulationEventLog,
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

  /**
   * Takes `guardId` off whatever search job holds it, and answers whether one
   * did ([ADR 0034](../../../docs/adr/0034-releasing-a-claimed-guard.md)).
   *
   * **Its own bookkeeping first, the roster second.** The roster is *not*
   * touched here -- `GuardReleaseService` owns that call -- because the whole
   * point of routing a release through the claimant is that
   * `GuardRoster.unassign` on a job's guard, on its own, is precisely the bug
   * this method exists to make impossible: the job would keep naming a guard
   * that is back in the unassigned pool, `DeploymentSystem` would send it to a
   * post, `beginTravelToCurrentTarget` would keep routing it to a search target,
   * and `runDetectionForCurrentTarget` would record a confiscation as found by
   * somebody standing somewhere else. So this method removes the guard from the
   * job, and the service unassigns it exactly once, from one place.
   *
   * **A job left with no guards is cancelled**, counted on
   * `searchesCancelled` -- the same counter a route failure increments, because
   * it is the same fact about the order (it did not complete). Leaving a
   * guardless job active would be worse than cancelling it in two ways that are
   * facts about this file rather than judgements: `beginTravelToCurrentTarget`
   * would iterate nothing, so `allArrived` would stay `true` and the job would
   * march through every target dwelling on each one with nobody present, and
   * `runDetectionForCurrentTarget` reads `job.guardIds[0]!` for the
   * `foundByGuardId` on every confiscation it records.
   *
   * The path request the released guard had in flight is **given back**, both
   * halves, through `NavigationSystem.abandonRequest`. This paragraph used to
   * say the opposite -- that dropping the id was enough because *"a result
   * nothing collects is garbage the queue ages out"* -- and both clauses were
   * false: aging raises a waiting request's effective priority and never
   * evicts it, and nothing expires a resolved result. `abandonRoutes` carries
   * the measurement. `loadSnapshot` dropping all of them is still correct and
   * is a different case: a restore rebuilds the navigation system empty, so
   * there is nothing on the other side to give back to.
   *
   * Deterministic: ascending order id, so which job is inspected first is a
   * function of state rather than of insertion history, exactly as
   * `activeJobsInCanonicalOrder` requires of every other iteration here. A
   * guard can only be on one job anyway -- `assignQueuedOrders` claims from
   * `unassignedGuardIds()` -- so the order cannot change the outcome; it is
   * canonical because `tests/determinism/canonical-iteration-contract.test.ts`
   * gates the enumeration and not its effect.
   */
  public releaseGuard(guardId: EntityId): boolean {
    for (const job of this.activeJobsInCanonicalOrder()) {
      const index = job.guardIds.indexOf(guardId);
      if (index === -1) continue;
      job.guardIds.splice(index, 1);
      const requestId = job.pathRequestIdsByGuard.get(guardId);
      if (requestId !== undefined) this.navigation.abandonRequest(requestId);
      job.pathRequestIdsByGuard.delete(guardId);
      if (job.guardIds.length === 0) {
        this.active.delete(job.id);
        this.searchesCancelled += 1;
      }
      return true;
    }
    return false;
  }

  public isQueued(orderId: string): boolean {
    return this.queue.some((order) => order.id === orderId);
  }

  /**
   * Every order this system is holding: queued ones in queue order, then active
   * ones in canonical (ascending id) order.
   *
   * The read a *producer* needs, and it exists because `isQueued` and
   * `getJobState` both answer about an id the caller already knows.
   * `SectorSearchDutySystem` has to ask the opposite question -- "is a sweep of
   * this sector outstanding, whatever it is called" -- and answering it from
   * `getSnapshot()` would copy the whole queue and every job's target list to
   * read the keys. Nothing here exposes a target or a guard, so a caller cannot
   * learn from it what `projectContraband` deliberately does not publish.
   */
  public orderIds(): readonly string[] {
    return [...this.queue.map((order) => order.id), ...this.activeJobsInCanonicalOrder().map((job) => job.id)];
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
      /*
       * A search is a security duty, so the pool is the post-eligible one
       * (ADR 0053) -- a kitchen worker does not frisk a prisoner -- and it is
       * the *search* pool, which is that one less
       * `INCIDENT_RESPONSE_GUARD_RESERVE` (issue #996). A sweep in flight can
       * therefore no longer be the reason a riot has nobody to send to it.
       */
      const available = claimableSearchGuardIds(this.guards);
      if (available.length < policy.requiredGuardCount) return; // stays queued -- observable backlog, not a failure
      this.queue.shift();
      const guardIds = available.slice(0, policy.requiredGuardCount);
      for (const guardId of guardIds) this.guards.setDeploymentPhase(guardId, 'on-search');
      this.active.set(next.id, {
        id: next.id,
        scope: next.scope,
        targets: next.targets,
        guardIds: [...guardIds],
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
    // Routes first, roster second: `unassign` clears the roster's own
    // `pathRequestId`, and this job's map is the only other place the id
    // survives, so after both writes nothing knows what to give back.
    this.abandonRoutes(job);
    for (const guardId of job.guardIds) this.guards.unassign(guardId);
  }

  /**
   * Gives back every route this job still has in flight, and forgets the ids.
   *
   * Both halves, through `NavigationSystem.abandonRequest`, because which half
   * a request is in on any given tick is a race this system cannot win. The
   * comment on `releaseGuard` used to say the opposite about dropping the id --
   * *"a result nothing collects is garbage the queue ages out"* -- and it was
   * false in both of its clauses: `PathRequestQueue`'s aging raises a waiting
   * request's *effective priority* and never evicts it, and nothing at all
   * expires a resolved result (`NavigationSystem.clearResult`'s own comment
   * says so: *"the system never expires results on its own"*). So an abandoned
   * request was searched at full budget cost and then retained for the rest of
   * the session. Measured on the sibling path in `IncidentResponseSystem`,
   * where a released responder's result outlived it by 500 ticks and counting.
   */
  private abandonRoutes(job: SearchJobRecord): void {
    for (const requestId of job.pathRequestIdsByGuard.values()) this.navigation.abandonRequest(requestId);
    job.pathRequestIdsByGuard.clear();
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
    // A guard whose result had not been collected when the job moved on still
    // has one waiting; clearing the map alone left it in the navigation system
    // for good.
    this.abandonRoutes(job);
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
      /*
       * And the player is told, by name (#703 ruling 13).
       *
       * **After the ledger and the counter, never before.** The event is a
       * report of a confiscation that has happened; recording it first would
       * put a sentence on the alerts list for an item this loop could still
       * fail to confiscate. It is also the order that keeps the two figures the
       * status strip compares -- `itemsDiscovered` and the ledger's length --
       * written together, which is the guard
       * `soleDiscoveredContrabandNameKey` depends on.
       *
       * `undefined` says nothing rather than throwing, and rather than naming
       * the raw category id. A `RangeError` out of a scheduled system update is
       * the failure mode `SectorSearchDutySystem` refuses at its own site for
       * its missing policy; the confiscation itself is real either way, so the
       * count still moves and the ledger still holds the evidence. Nothing in
       * `src/` can reach it: `new-session.ts` resolves both this and
       * `categoryConcealment` from `defaultContrabandRegistry`, and the
       * concealment lookup one screen up already threw for a category id that
       * catalog does not hold.
       */
      const categoryNameKey = this.categoryNameKey(item.categoryId);
      if (categoryNameKey !== undefined) this.events.recordContrabandDiscovered(categoryNameKey, context.tick);
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
   * Every active job's leg state and the counter that names its routes (issue
   * #1373): what `getSnapshot` leaves out and `loadSnapshot` below reset on
   * every restore until then.
   *
   * **Measured, which is why it is carried and not left to the "never losing
   * search progress" argument below.** That argument is true of the *outcome*
   * and not of the *timing*: with this left out,
   * `tests/determinism/restore-mid-walk-exactness.test.ts` found 21 of its
   * saves diverging within fifty ticks -- a sweep a target behind, a guard on
   * the wrong tile, a route requested twice -- because a restored job re-walked
   * a leg it had finished and re-dwelt a target it was part-way through. Some
   * reconverged by the far checkpoint, since `contraband.detection` has no
   * other consumer to interleave with; a save-then-continue that only agrees
   * *eventually* is still not the continue the owner ruled for.
   */
  public getInFlightSnapshot(): SearchInFlightSnapshot {
    return {
      requestSequence: this.requestSequence,
      jobs: this.activeJobsInCanonicalOrder().map((job) => ({
        id: job.id,
        state: job.state,
        travelInFlight: job.travelInFlight,
        pathRequestIdsByGuard: [...job.pathRequestIdsByGuard.entries()].sort(([a], [b]) => a - b),
        ...(job.dwellStartedAtTick === undefined ? {} : { dwellStartedAtTick: job.dwellStartedAtTick }),
      })),
    };
  }

  /**
   * **Since issue #1373 this paragraph describes the restore of a save with no
   * `inFlight` section**, and of a job whose carried request the restored queue
   * does not hold; a save this build writes resumes each job where it was.
   *
   * A guard mid-leg referenced a path request against the *previous*
   * `NavigationSystem` instance's queue -- restored jobs always re-enter
   * `'travelling'` with a fresh dwell timer, matching #25/#26's "restart
   * rather than assume arrival" restore convention. A restored `'searching'`
   * job simply repeats an already-arrived-at leg (guards are already at
   * the target tile, so `beginTravelToCurrentTarget` immediately finds
   * `sameTile` true and issues no requests), extending that leg's wait by
   * at most `dwellTicksPerTarget` -- never losing search progress.
   */
  public loadSnapshot(snapshot: ReturnType<SearchSystem['getSnapshot']>, inFlight?: SearchInFlightRestore): void {
    this.queue.length = 0;
    this.queue.push(...snapshot.queue.map((order) => ({ ...order })));
    this.active.clear();
    const resumable = new Map<string, SearchJobInFlightSnapshot>();
    if (inFlight !== undefined) {
      this.requestSequence = inFlight.snapshot.requestSequence;
      for (const job of inFlight.snapshot.jobs) resumable.set(job.id, job);
    }
    for (const [id, job] of snapshot.active) {
      const progress = resumable.get(id);
      // Resumed only when every request the job names is one the restored
      // queue holds -- which is every job a save this build writes can carry.
      // Otherwise the paragraph above applies to this job as it always did.
      const resume = progress !== undefined && progress.pathRequestIdsByGuard.every(([, requestId]) => inFlight!.knowsRequest(requestId));
      this.active.set(id, {
        id,
        scope: job.scope,
        targets: job.targets,
        guardIds: [...job.guardIds],
        currentTargetIndex: job.currentTargetIndex,
        state: resume ? progress.state : 'travelling',
        travelInFlight: resume ? progress.travelInFlight : false,
        pathRequestIdsByGuard: resume ? new Map(progress.pathRequestIdsByGuard) : new Map(),
        dwellStartedAtTick: resume ? progress.dwellStartedAtTick : undefined,
      });
    }
    this.itemsDiscovered = snapshot.metrics.itemsDiscovered;
    this.itemsMissed = snapshot.metrics.itemsMissed;
    this.searchesCompleted = snapshot.metrics.searchesCompleted;
    this.searchesCancelled = snapshot.metrics.searchesCancelled;
  }
}
