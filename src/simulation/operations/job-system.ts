import type { SimulationContext, SystemRegistration } from '../kernel/system';
import type { EntityId } from '../entity/entity-store';
import type { NavigationSystem } from '../navigation/navigation-system';
import type { RouteContext } from '../navigation/route-context';
import type { TilePosition } from '../world/coordinates';
import type { ContainerRegistry } from './inventory';
import type { CarryItemJob } from './job';
import { JobBoard } from './job';

/**
 * Decouples the job system from any specific entity/component model
 * (prisoners today, staff later) -- the caller supplies how to read/move a
 * worker's position and how to derive its `RouteContext`, exactly like
 * `action-system.ts`'s `PrisonerRouteContextResolver` does for #24.
 */
export interface JobWorkerAdapter {
  getPositionTile(entityId: EntityId): TilePosition;
  setPositionTile(entityId: EntityId, tile: TilePosition): void;
  getRouteContext(entityId: EntityId): RouteContext;
}

/** Registered eligible workers and which of them are currently busy on a job -- deterministic, ascending-entity-id iteration, never Set iteration order. */
export class JobWorkerPool {
  private readonly workers = new Set<EntityId>();
  private readonly busy = new Set<EntityId>();

  public register(entityId: EntityId): void {
    this.workers.add(entityId);
  }

  public unregister(entityId: EntityId): void {
    this.workers.delete(entityId);
    this.busy.delete(entityId);
  }

  public setBusy(entityId: EntityId, isBusy: boolean): void {
    if (isBusy) this.busy.add(entityId);
    else this.busy.delete(entityId);
  }

  public isBusy(entityId: EntityId): boolean {
    return this.busy.has(entityId);
  }

  /** Deterministic: ascending entity id. */
  public idleWorkers(): readonly EntityId[] {
    return [...this.workers].filter((id) => !this.busy.has(id)).sort((a, b) => a - b);
  }

  public getSnapshot(): { readonly workers: readonly EntityId[]; readonly busy: readonly EntityId[] } {
    return { workers: [...this.workers].sort((a, b) => a - b), busy: [...this.busy].sort((a, b) => a - b) };
  }

  public loadSnapshot(snapshot: ReturnType<JobWorkerPool['getSnapshot']>): void {
    this.workers.clear();
    this.busy.clear();
    for (const id of snapshot.workers) this.workers.add(id);
    for (const id of snapshot.busy) this.busy.add(id);
  }
}

const PICKUP_DROPOFF_DURATION_TICKS = 5;

function sameTile(a: TilePosition, b: TilePosition): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * Deterministic job assignment + execution (issue #25): matches the
 * highest-priority available job to the first (ascending id) idle,
 * inventory-satisfiable worker each scheduled tick, then drives assigned
 * jobs through pickup -> travel -> dropoff, entirely through the real
 * `NavigationSystem` (no-teleport rule) and `Container`'s transactional
 * reserve/withdraw/deposit (no duplication/loss).
 */
export class JobSystem implements SystemRegistration {
  public readonly id = 'operations.jobs';
  public readonly order = 260;
  public readonly schedule = { intervalTicks: 5, phaseTicks: 0 };

  private readonly performingSince = new Map<string, number>();

  public constructor(
    public readonly board: JobBoard,
    private readonly containers: ContainerRegistry,
    private readonly workers: JobWorkerPool,
    private readonly workerAdapter: JobWorkerAdapter,
    private readonly navigation: NavigationSystem,
  ) {}

  public update(context: SimulationContext): void {
    this.assignAvailableJobs(context.tick);
    for (const job of this.board.activeJobs()) {
      if (job.state === 'assigned') this.beginLeg(job, context.tick);
      else if (job.state === 'travelling') this.continueTravelling(job, context.tick);
      else if (job.state === 'performing') this.continuePerforming(job, context.tick);
    }
  }

  private assignAvailableJobs(_tick: number): void {
    const idleWorkers = this.workers.idleWorkers();
    if (idleWorkers.length === 0) return;
    let nextWorkerIndex = 0;

    for (const job of this.board.availableJobsSorted()) {
      if (nextWorkerIndex >= idleWorkers.length) break;

      const sourceContainer = this.containers.getById(job.sourceContainerId);
      if (sourceContainer === undefined) {
        job.state = 'failed';
        job.failReason = 'unknown-source-container';
        continue;
      }

      const reservation = sourceContainer.reserve(job.itemId, job.quantity);
      if (!reservation.ok) continue; // stock not (yet) available -- stays 'available', retried next cycle (observable backpressure, not a hard failure)

      const workerId = idleWorkers[nextWorkerIndex]!;
      nextWorkerIndex += 1;
      this.workers.setBusy(workerId, true);
      job.assignedWorkerId = workerId;
      job.leg = 'pickup';
      job.state = 'assigned';
    }
  }

  /** Starts (or restarts, if already at the leg's destination) travel for the job's current leg. */
  private beginLeg(job: CarryItemJob, tick: number): void {
    const workerId = job.assignedWorkerId!;
    const destinationTile = job.leg === 'pickup' ? job.sourceTile : job.destinationTile;
    const currentTile = this.workerAdapter.getPositionTile(workerId);

    if (sameTile(currentTile, destinationTile)) {
      job.state = 'performing';
      this.performingSince.set(job.id, tick);
      return;
    }

    const requestId = `job.${job.id}.${job.leg}.${tick}`;
    this.navigation.requestRoute(requestId, currentTile, destinationTile, this.workerAdapter.getRouteContext(workerId), job.priority, tick);
    job.pathRequestId = requestId;
    job.state = 'travelling';
  }

  private continueTravelling(job: CarryItemJob, tick: number): void {
    if (job.pathRequestId === undefined) {
      this.beginLeg(job, tick);
      return;
    }
    const outcome = this.navigation.getResult(job.pathRequestId);
    if (outcome === undefined) return; // still queued/deferred in the navigation system

    this.navigation.clearResult(job.pathRequestId);
    job.pathRequestId = undefined;

    if (!outcome.result.ok) {
      this.failJob(job, outcome.result.failure.reason);
      return;
    }

    const workerId = job.assignedWorkerId!;
    const destinationTile = job.leg === 'pickup' ? job.sourceTile : job.destinationTile;
    this.workerAdapter.setPositionTile(workerId, destinationTile);
    job.state = 'performing';
    this.performingSince.set(job.id, tick);
  }

  private continuePerforming(job: CarryItemJob, tick: number): void {
    const startedAt = this.performingSince.get(job.id);
    if (startedAt === undefined) {
      this.performingSince.set(job.id, tick);
      return;
    }
    if (tick - startedAt < PICKUP_DROPOFF_DURATION_TICKS) return;

    if (job.leg === 'pickup') {
      const sourceContainer = this.containers.require(job.sourceContainerId);
      const withdrawal = sourceContainer.withdrawReserved(job.itemId, job.quantity);
      if (!withdrawal.ok) {
        // The reservation made at assignment time should always be honorable here; fail loudly rather than silently drop the job if that invariant is ever violated.
        this.failJob(job, 'reservation-invariant-violated');
        return;
      }
      this.performingSince.delete(job.id);
      job.leg = 'dropoff';
      this.beginLeg(job, tick);
      return;
    }

    this.containers.require(job.destinationContainerId).deposit(job.itemId, job.quantity);
    this.performingSince.delete(job.id);
    this.workers.setBusy(job.assignedWorkerId!, false);
    job.state = 'completed';
  }

  private failJob(job: CarryItemJob, reason: string): void {
    if (job.leg === 'pickup') this.containers.getById(job.sourceContainerId)?.releaseReservation(job.itemId, job.quantity);
    this.performingSince.delete(job.id);
    if (job.assignedWorkerId !== undefined) this.workers.setBusy(job.assignedWorkerId, false);
    job.state = 'failed';
    job.failReason = reason;
  }

  /**
   * Cancels an active job, releasing its reservation and worker exactly
   * like a failure would -- issue #25's "cancellation/failure releases
   * reservations consistently." A reservation only exists once the job
   * has actually reached `'assigned'` or later on the pickup leg
   * (`assignAvailableJobs` is where `Container.reserve` happens); a job
   * cancelled while still `'available'` never held one, and
   * `Container.releaseReservation` tracks reservations per item, not per
   * job -- releasing one that was never made would wrongly free up
   * another job's real reservation for the same item.
   */
  public cancel(jobId: string): boolean {
    const job = this.board.getById(jobId);
    if (job === undefined) return false;
    const hadReservation = job.leg === 'pickup' && job.state !== 'available';
    const wasCancellable = this.board.cancel(jobId);
    if (!wasCancellable) return false;
    if (hadReservation) this.containers.getById(job.sourceContainerId)?.releaseReservation(job.itemId, job.quantity);
    this.performingSince.delete(job.id);
    if (job.assignedWorkerId !== undefined) this.workers.setBusy(job.assignedWorkerId, false);
    return true;
  }
}
