import type { EntityId } from '../entity/entity-store';
import type { RouteFailureReason } from '../navigation/route';
import type { ContainerRegistry } from './inventory';
import type { CarryItemJob, CarryJobFailReason, CarryLeg, JobLifecycleState } from './job';
import type { JobBoard } from './job';

/**
 * What a carry job *does* to stock, with no opinion about who carries it or
 * how they get there.
 *
 * ## Why this exists rather than `JobSystem`
 *
 * ADR 0093 decision 4: `JobSystem` stops being a `SystemRegistration` and its
 * lifecycle code survives as a pure executor that `prisoners.actions` calls.
 * The boundary the retired `JobWorkerAdapter` existed to keep -- `operations/`
 * knows nothing about prisoners -- survives with the arrow reversed. This
 * class is handed a `JobBoard` and a `ContainerRegistry` and **nothing that
 * names an entity model**: `EntityId` is `entity/`'s numeric handle and is the
 * one type it takes, exactly as `JobBoard` already did.
 *
 * What it deliberately does not hold, so nobody looks for it:
 *
 * - **No `NavigationSystem`.** The walk is `ActionSystem`'s on both legs
 *   (decision 3), so neither leg is begun here and no route is abandoned here.
 * - **No worker pool.** Eligibility is the regime's and busyness is the
 *   board's (decision 4), so there is nothing to mark busy.
 * - **No dwell timer.** `performingSince` is deleted; the dwell is the
 *   prisoner's `phaseStartedAtTick`, which the save carries (decision 5).
 *
 * ## Determinism
 *
 * Draws nothing, reads no clock, and iterates no `Map` or `Set` for an
 * outcome: `claimAvailableJobFor` walks `JobBoard.availableJobsSorted()`
 * (priority descending, id ascending) and `reconcileRestoredJobs` walks
 * `activeJobs()` (id ascending). Both are total orders derived from state.
 */
export class CarryJobExecutor {
  public constructor(
    public readonly board: JobBoard,
    private readonly containers: ContainerRegistry,
  ) {}

  /**
   * Gives this worker the highest-priority available job whose stock it can
   * reserve, or `undefined` when the board has none it can serve.
   *
   * `JobSystem.assignAvailableJobs` moved intact, one worker at a time instead
   * of one pass over every idle worker -- which is the whole of what decision 2
   * changes about it. The old method walked the board once per scheduled tick
   * and matched jobs to `JobWorkerPool.idleWorkers()`; the carry is now a
   * candidate one prisoner at a time, in `ActionSystem`'s own
   * urgency-then-index order, so the outer loop is the idle scan and this is
   * the body.
   *
   * **Both container ids are checked before anything is reserved**, and the
   * comment the old method carried applies here word for word: a job admitted
   * goes on to claim stock, occupy a carrier and walk, so an id that names
   * nothing is refused while a refusal still costs nothing but the job. The
   * source half was always checked; the destination half was not, and its leg
   * runs *after* `withdrawReserved` has committed -- so the unchecked id threw
   * `RangeError` out of a scheduled system update with the goods already out of
   * the container (#419).
   *
   * A job whose stock is not (yet) available stays `'available'` and is retried
   * on a later cycle: observable backpressure, not a hard failure.
   *
   * **`Container.reserve` before `assignTo`, and that ordering is the reason
   * ADR 0029's objection to claiming at selection does not apply here.** ADR
   * 0029 rejected a reservation at selection because *"a reservation has to be
   * released on the travel failure paths, and those are the paths that leak."*
   * A job is not a seat: it already carries a stock reservation that must be
   * taken before anybody walks, or two carriers set off for one crate, and its
   * release paths already exist, are total and are tested (`failJob` and
   * `cancel` through `compensateHeldStock`, ADR 0037).
   */
  public claimAvailableJobFor(workerId: EntityId): CarryItemJob | undefined {
    for (const job of this.board.availableJobsSorted()) {
      const sourceContainer = this.containers.getById(job.sourceContainerId);
      if (sourceContainer === undefined) {
        this.board.endJob(job.id, 'failed', 'unknown-source-container');
        continue;
      }

      if (this.containers.getById(job.destinationContainerId) === undefined) {
        this.board.endJob(job.id, 'failed', 'unknown-destination-container');
        continue;
      }

      const reservation = sourceContainer.reserve(job.itemId, job.quantity);
      if (!reservation.ok) continue;

      if (!this.board.assignTo(job.id, workerId)) {
        // The board refused what it had just offered: this worker already holds
        // a job, or the state moved under us. Give the reservation straight
        // back rather than leaving stock claimed by nothing -- the one path in
        // this class where a reserve is undone without a job to hang it on.
        sourceContainer.releaseReservation(job.itemId, job.quantity);
        return undefined;
      }
      return job;
    }
    return undefined;
  }

  /**
   * The pickup: commits the reservation made at claim time, and turns the job
   * round onto its drop-off leg.
   *
   * `false` means the job is over -- it has already been failed and
   * compensated, and the caller must put the carrier back to idle. `true` means
   * `job.leg` is now `'dropoff'` and there is a second walk to make.
   *
   * **The container lookup is lenient, because a throw here faults the
   * carrier.** It was `ContainerRegistry.require`, which throws `RangeError`
   * for an id it does not hold, and that is the whole of #419. This leg is
   * reached with nothing withdrawn yet, so what `compensateHeldStock` has to
   * give back is the reservation -- and if the source container is the one that
   * is missing there is nothing to give it back to.
   */
  public pickUp(job: CarryItemJob): boolean {
    const sourceContainer = this.containers.getById(job.sourceContainerId);
    if (sourceContainer === undefined) {
      this.failJob(job, 'unknown-source-container');
      return false;
    }
    const withdrawal = sourceContainer.withdrawReserved(job.itemId, job.quantity);
    if (!withdrawal.ok) {
      // The reservation made at claim time should always be honorable here;
      // fail loudly rather than silently drop the job if that invariant is ever
      // violated.
      this.failJob(job, 'reservation-invariant-violated');
      return false;
    }
    job.leg = 'dropoff';
    return true;
  }

  /**
   * The drop-off: deposits the carried quantity and completes the job.
   *
   * `false` means the job failed instead, already compensated. Lenient for the
   * reason `pickUp` is, and with the harder case: `withdrawReserved` has
   * already committed, so a throw here landed with the source container
   * debited, the goods in the carrier's hands and nothing holding them -- one
   * unregistered container id ended the session and destroyed the stock with it
   * (#419). Failing instead routes the quantity back to the container it came
   * from (ADR 0037).
   */
  public dropOff(job: CarryItemJob): boolean {
    const destinationContainer = this.containers.getById(job.destinationContainerId);
    if (destinationContainer === undefined) {
      this.failJob(job, 'unknown-destination-container');
      return false;
    }
    destinationContainer.deposit(job.itemId, job.quantity);
    this.board.endJob(job.id, 'completed');
    return true;
  }

  /**
   * Undoes whatever an ended job was still holding, so neither failure nor
   * cancellation can strand a reservation *or* destroy goods. **Which of the
   * two applies is decided entirely by the leg, and the two cases are
   * exhaustive** -- an active carry job is always holding exactly one of them:
   *
   * - **pickup**: the job holds the `reserve` made at claim time and the stock
   *   is still physically in the source container. Release the claim.
   *   `Container` tracks reservations per *item*, not per job, so releasing one
   *   that was never made would wrongly free another job's real reservation for
   *   the same item -- hence the `'available'` exclusion below (a job ended
   *   while still `'available'` never reached `claimAvailableJobFor`, which is
   *   the only place `Container.reserve` happens).
   * - **dropoff**: `pickUp` already committed `withdrawReserved`, so there is
   *   no reservation left to release and the quantity is in the carrier's
   *   hands, held by nothing but the job. Doing nothing here destroys it
   *   outright, which is the same defect `docs/OPERATIONS.md` requires the
   *   construction seam's `release` to prevent. Put the quantity back as stock
   *   in the container it came from.
   *
   * The dropoff case uses `deposit` rather than a reservation reversal for
   * exactly the reason `ContainerMaterialsProvider.release` does: the
   * withdrawal was committed and the reservation it consumed no longer exists.
   * Returning a quantity to the container it was withdrawn from moves nothing
   * *between* containers, so the no-teleport rule is untouched -- this is the
   * reversal of one leg, not a transfer.
   *
   * **ADR 0037 holds without amendment** under ADR 0093: the two cases it
   * decides are still exhaustive and this is still the one implementation for
   * both paths.
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

  /**
   * Ends a job as failed, giving back whatever it held.
   *
   * **No route is abandoned here, and that is the one thing that moved.** The
   * leg's route belongs to the carrier now, not to the job
   * (`PrisonerColdState.pathRequestId`), so `ActionSystem` hands it back on the
   * exit that reached this method -- which is what lets the four travel-failure
   * exits in `continueTravelling` gain one line each rather than four careful
   * release calls written fresh (ADR 0093 decision 1).
   *
   * **No refusal is recorded, and that is a known gap rather than a decision
   * this code is entitled to make.** `RefusalLog` is the log of *command*
   * refusals, written from the kernel's command handler at the tick a command
   * executes, and no command creates a carry job. Giving a job failure a
   * player-facing surface means deciding what channel a *system* speaks on;
   * ADR 0093 open question 3 is where that is left, and its answer is the
   * owner's.
   */
  public failJob(job: CarryItemJob, reason: CarryJobFailReason | RouteFailureReason): void {
    this.compensateHeldStock(job, job.leg, job.state);
    this.board.endJob(job.id, 'failed', reason);
  }

  /**
   * Cancels an active job, giving back whatever it held exactly like a failure
   * would -- issue #25's "cancellation/failure releases reservations
   * consistently", which `compensateHeldStock` is the single implementation of
   * for both paths, so the two cannot drift apart per leg again.
   *
   * It does **not** put the carrier back to idle: the board's terminal
   * transition is what `ActionSystem.continuePerforming` and
   * `continueTravelling` read, and they end the action on the next cycle
   * exactly as they end it for a job that failed under them.
   */
  public cancel(jobId: string): boolean {
    const job = this.board.getById(jobId);
    if (job === undefined) return false;
    // Captured before `JobBoard.cancel` mutates `state` to `'cancelled'`.
    const legBeforeCancel = job.leg;
    const stateBeforeCancel = job.state;
    if (!this.board.cancel(jobId)) return false;
    this.compensateHeldStock(job, legBeforeCancel, stateBeforeCancel);
    return true;
  }

  /**
   * Fails every restored job whose assigned carrier this session cannot serve,
   * and answers how many it ended.
   *
   * **The other half of ADR 0093 decision 5's one restore rule**, and the
   * direction that stops a leak. A carrier restored mid-errand re-selects the
   * carry on its next reconsideration cycle, because its own active job makes
   * the carry providable again (`ActionSystem.prisonProvides`) -- that closes
   * the "orphaned job" direction from the carrier's side. This closes it from
   * the board's: a job assigned to an id that no longer names a living
   * prisoner, or to one this session will never offer a carry to, would sit
   * `'assigned'` for the rest of the session holding a reservation nothing
   * would release.
   *
   * Called from the composition root's restore path, which is the one place
   * that holds both the board and the population. `availableJobsSorted` order
   * is not used here -- `activeJobs()` is id-ascending -- and the predicate is
   * a pure function of the restored population, so the set of jobs ended is a
   * function of state.
   */
  public reconcileRestoredJobs(isEligibleCarrier: (workerId: EntityId) => boolean): number {
    let ended = 0;
    for (const job of this.board.activeJobs()) {
      if (job.state === 'available') continue;
      const workerId = job.assignedWorkerId;
      if (workerId !== undefined && isEligibleCarrier(workerId)) continue;
      this.failJob(job, 'carrier-departed');
      ended += 1;
    }
    return ended;
  }
}
