import type { SimulationContext, SystemRegistration } from '../kernel/system';
import type { EntityId } from '../entity/entity-store';
import type { NavigationSystem } from '../navigation/navigation-system';
import type { RouteFailureReason } from '../navigation/route';
import type { RouteContext } from '../navigation/route-context';
import type { TilePosition } from '../world/coordinates';
import type { ContainerRegistry } from './inventory';
import type { CarryItemJob, CarryJobFailReason, CarryLeg, JobLifecycleState } from './job';
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

      // **Both container ids, before anything is reserved.** This is the
      // boundary: a job admitted here goes on to claim stock, occupy a worker
      // and travel, so a container id that names nothing has to be refused
      // while a refusal still costs nothing but the job. The source half has
      // always been checked; the destination half was not, and the leg it
      // belongs to is the one that runs *after* `withdrawReserved` has
      // committed -- so the unchecked id threw `RangeError` out of a scheduled
      // system update with the goods already out of the container and the
      // worker already assigned (#419).
      //
      // Checking the destination here does not make the dropoff-leg check in
      // `continuePerforming` redundant, and vice versa: a job restored from a
      // save never passes through this method at all (`JobBoard.loadSnapshot`
      // puts it back at the state it was saved in), so this alone leaves the
      // save path broken -- the same pair of paths #409 measured for an
      // unknown buildable, refused at the boundary *and* resolved leniently in
      // the tick.
      const sourceContainer = this.containers.getById(job.sourceContainerId);
      if (sourceContainer === undefined) {
        job.state = 'failed';
        job.failReason = 'unknown-source-container';
        continue;
      }

      if (this.containers.getById(job.destinationContainerId) === undefined) {
        job.state = 'failed';
        job.failReason = 'unknown-destination-container';
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

  /**
   * The dwell at a leg's destination, and then the one point on that leg where
   * the job actually touches inventory: `withdrawReserved` on pickup,
   * `deposit` on dropoff.
   *
   * **Both container lookups are lenient, because this runs inside a scheduled
   * system update and a throw here faults the worker.** They were
   * `ContainerRegistry.require`, which throws `RangeError` for an id it does
   * not hold, and that is the whole of #419. Two paths reached it and each
   * needs its own answer:
   *
   * - **Dropoff.** `withdrawReserved` has already committed on the pickup leg,
   *   so the throw landed with the source container already debited, the goods
   *   in the carrier's hands and the worker marked busy -- one unregistered
   *   container id ended the session and destroyed the stock with it. Failing
   *   the job instead routes it through `failJob`, so `compensateHeldStock`
   *   returns the carried quantity to the container it came from (ADR 0037)
   *   and the worker is freed.
   * - **Pickup.** Reached only by a job that never passed
   *   `assignAvailableJobs` -- which is to say a *restored* one, since
   *   `JobBoard.loadSnapshot` puts a job back at the state it was saved in and
   *   nothing re-runs the assignment checks over it. Nothing has been withdrawn
   *   yet, so what `compensateHeldStock` has to give back is the reservation,
   *   and if the source container is the one that is missing there is nothing
   *   to give it back to.
   *
   * A job failed either way is terminal, so `activeJobs()` stops returning it
   * and the board behind it drains normally rather than re-throwing every
   * scheduled tick.
   *
   * **No refusal is recorded, and that is a known gap rather than a decision
   * this code is entitled to make** -- the same gap `ConstructionSystem.update`
   * records for the same class of recovery in #409, and for a stronger reason
   * here. `RefusalLog` is the log of *command* refusals, written from the
   * kernel's command handler at the tick a command executes, and no command
   * creates a carry job: `simulation-refusals.test.ts` asserts the wire
   * vocabulary is exactly ten command namespaces. Giving a job failure a
   * player-facing surface means deciding what channel a *system* speaks on,
   * which is an ADR rather than a line in a system update.
   */
  private continuePerforming(job: CarryItemJob, tick: number): void {
    const startedAt = this.performingSince.get(job.id);
    if (startedAt === undefined) {
      this.performingSince.set(job.id, tick);
      return;
    }
    if (tick - startedAt < PICKUP_DROPOFF_DURATION_TICKS) return;

    if (job.leg === 'pickup') {
      const sourceContainer = this.containers.getById(job.sourceContainerId);
      if (sourceContainer === undefined) {
        this.failJob(job, 'unknown-source-container');
        return;
      }
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

    const destinationContainer = this.containers.getById(job.destinationContainerId);
    if (destinationContainer === undefined) {
      this.failJob(job, 'unknown-destination-container');
      return;
    }
    destinationContainer.deposit(job.itemId, job.quantity);
    this.performingSince.delete(job.id);
    this.workers.setBusy(job.assignedWorkerId!, false);
    job.state = 'completed';
  }

  /**
   * Undoes whatever an ended job was still holding, so neither failure nor
   * cancellation can strand a claim *or* destroy goods. **Which of the two
   * applies is decided entirely by the leg, and the two cases are
   * exhaustive** -- an active carry job is always holding exactly one of them:
   *
   * - **pickup**: the job holds the `reserve` made at assignment time and the
   *   stock is still physically in the source container. Release the claim.
   *   `Container` tracks reservations per *item*, not per job, so releasing one
   *   that was never made would wrongly free another job's real reservation for
   *   the same item -- hence the `'available'` exclusion below (a job ended
   *   while still `'available'` never reached `assignAvailableJobs`, which is
   *   the only place `Container.reserve` happens).
   * - **dropoff**: `continuePerforming` already committed `withdrawReserved`,
   *   so there is no reservation left to release and the quantity is in the
   *   carrier's hands, held by nothing but the job. Doing nothing here destroys
   *   it outright, which is the same defect `docs/OPERATIONS.md` requires the
   *   construction seam's `release` to prevent: "against a finite stock a
   *   cancelled order that had already allocated would destroy its materials
   *   permanently". Put the quantity back as stock in the container it came
   *   from.
   *
   * The dropoff case uses `deposit` rather than a reservation reversal for
   * exactly the reason `ContainerMaterialsProvider.release` does: the
   * withdrawal was committed and the reservation it consumed no longer exists.
   * Returning a quantity to the container it was withdrawn from moves nothing
   * *between* containers, so the no-teleport rule is untouched -- this is the
   * reversal of one leg, not a transfer.
   *
   * `leg`/`stateBeforeEnding` are passed in rather than read off `job` because
   * `cancel` must decide from the state as it was *before* `JobBoard.cancel`
   * overwrote it with `'cancelled'`.
   */
  private compensateHeldStock(job: CarryItemJob, leg: CarryLeg, stateBeforeEnding: JobLifecycleState): void {
    if (stateBeforeEnding === 'available') return; // holds neither a reservation nor stock
    // `deposit` rejects a non-positive quantity (`releaseReservation` tolerates
    // one), and `carryItemJobSchema` bounds a restored job's quantity to an
    // integer without requiring it to be positive -- so a corrupt save must not
    // be able to throw out of a system update here.
    if (!Number.isInteger(job.quantity) || job.quantity <= 0) return;
    const source = this.containers.getById(job.sourceContainerId);
    if (source === undefined) return;
    if (leg === 'pickup') source.releaseReservation(job.itemId, job.quantity);
    else source.deposit(job.itemId, job.quantity);
  }

  private failJob(job: CarryItemJob, reason: CarryJobFailReason | RouteFailureReason): void {
    this.compensateHeldStock(job, job.leg, job.state);
    this.performingSince.delete(job.id);
    if (job.assignedWorkerId !== undefined) this.workers.setBusy(job.assignedWorkerId, false);
    job.state = 'failed';
    job.failReason = reason;
  }

  /**
   * Cancels an active job, giving back whatever it held and freeing its worker
   * exactly like a failure would -- issue #25's "cancellation/failure releases
   * reservations consistently", which `compensateHeldStock` is the single
   * implementation of for both paths, so the two cannot drift apart per leg
   * again.
   */
  public cancel(jobId: string): boolean {
    const job = this.board.getById(jobId);
    if (job === undefined) return false;
    // Captured before `JobBoard.cancel` mutates `state` to `'cancelled'`.
    const legBeforeCancel = job.leg;
    const stateBeforeCancel = job.state;
    const wasCancellable = this.board.cancel(jobId);
    if (!wasCancellable) return false;
    this.compensateHeldStock(job, legBeforeCancel, stateBeforeCancel);
    this.performingSince.delete(job.id);
    if (job.assignedWorkerId !== undefined) this.workers.setBusy(job.assignedWorkerId, false);
    return true;
  }
}
