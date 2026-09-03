import type { EntityId } from '../entity/entity-store';
import type { RouteFailureReason } from '../navigation/route';
import type { TilePosition } from '../world/coordinates';

export type JobLifecycleState = 'available' | 'reserved' | 'assigned' | 'travelling' | 'performing' | 'completed' | 'failed' | 'cancelled';
export type CarryLeg = 'pickup' | 'dropoff';

/**
 * Why `JobSystem` itself ended a carry job, as a closed union rather than the
 * free `string` this used to be.
 *
 * Closed for the reason `BUILD_ORDER_FAIL_REASONS` is closed: a fail reason is
 * a vocabulary, and a free `string` lets the next one be minted at a call site
 * where nobody has to decide whether it is the same fact as an existing member
 * or a new one. Both members that existed before #419 were written as bare
 * literals in `job-system.ts`, and the third -- `unknown-destination-container`
 * -- is the one whose absence #419 is about: the source leg refused an unknown
 * container id and the destination leg did not, so `ContainerRegistry.require`
 * threw `RangeError` out of a scheduled system update *after*
 * `withdrawReserved` had committed, which faults the worker and takes the
 * stock with it.
 *
 * The two `unknown-*-container` members are separate rather than one
 * `unknown-container`, because they are not the same fact: an unknown source is
 * decided before any stock moves and an unknown destination is decided with the
 * goods already in the carrier's hands, and only the second one has anything to
 * give back.
 *
 * **It does not reach the player, and it is not on the refusal wire.**
 * `RefusalReason` (`protocol/types.ts`) is the vocabulary of *command*
 * refusals, written from the kernel's command handler at the tick a command
 * executes -- and no command creates a carry job. There is deliberately no
 * `Record` mapping these onto it and no `hud.alert.refusal.carry.*` sentence;
 * see the note on `JobSystem.continuePerforming` for why giving job failures a
 * player-facing surface is a decision this change is not entitled to make.
 *
 * Persisted: `save-schema.ts`'s `carryItemJobSchema` validates `failReason` as
 * an optional `z.string()` and stays that way deliberately, for the reason
 * `build-order.ts` records for the identical pair -- narrowing the *reader*
 * would turn an unrecognised historical value into an unloadable prison rather
 * than a job that reads as failed. That is also what lets a member be added
 * here without a save bump.
 */
export const CARRY_JOB_FAIL_REASONS = [
  /**
   * The carrier left the prison mid-errand -- released, discharged or
   * otherwise destroyed while holding an assigned job
   * ([ADR 0093](../../../docs/adr/0093-a-carry-is-an-action.md) decision 4).
   *
   * **A fourth member rather than a fourth vocabulary**, which is what the
   * docblock above says this union is built for. Before ADR 0093 a departing
   * prisoner was dropped from `JobWorkerPool` and the job they held stayed
   * `'assigned'` to an id that named nobody; the pool is retired, so the
   * departure now has to end the job, and ending a job means naming why.
   */
  'carrier-departed',
  'reservation-invariant-violated',
  'unknown-destination-container',
  'unknown-source-container',
] as const;

export type CarryJobFailReason = (typeof CARRY_JOB_FAIL_REASONS)[number];

/**
 * The one concrete job kind this representative slice implements end to
 * end: move `quantity` of `itemId` from a source container to a
 * destination container, honoring the "no-teleport rule" (issue #25) --
 * both legs travel through the real `NavigationSystem` (#21/#22), never a
 * shortcut. `leg` is meaningful once `state` reaches `'assigned'` or later.
 */
export interface CarryItemJob {
  readonly id: string;
  readonly priority: number;
  readonly itemId: string;
  readonly quantity: number;
  readonly sourceContainerId: string;
  readonly sourceTile: TilePosition;
  readonly destinationContainerId: string;
  readonly destinationTile: TilePosition;
  readonly createdAtTick: number;

  state: JobLifecycleState;
  leg: CarryLeg;
  assignedWorkerId?: EntityId | undefined;
  pathRequestId?: string | undefined;
  /**
   * Either one of `JobSystem`'s own reasons or the navigation vocabulary a
   * failed leg records verbatim (`continueTravelling` passes
   * `RouteFailure.reason` straight through). Two vocabularies rather than one
   * because they are decided by two systems, and neither is rewritten into the
   * other's spelling on the way here.
   */
  failReason?: CarryJobFailReason | RouteFailureReason | undefined;
}

export interface SubmitCarryItemJobInput {
  readonly id: string;
  readonly priority: number;
  readonly itemId: string;
  readonly quantity: number;
  readonly sourceContainerId: string;
  readonly sourceTile: TilePosition;
  readonly destinationContainerId: string;
  readonly destinationTile: TilePosition;
}

/**
 * All carry jobs, keyed by id -- the generic job/task lifecycle issue #25
 * requires (available/reserved/assigned/travelling/performing/completed/
 * failed/cancelled), specialized here to one concrete payload
 * (`CarryItemJob`) rather than a fully generic job-kind registry, per this
 * issue's "representative flows prove extensibility" scope: the lifecycle
 * and assignment machinery (`job-system.ts`) is the extensible part.
 */
export const TERMINAL_JOB_STATES: readonly JobLifecycleState[] = ['completed', 'failed', 'cancelled'];

export function isTerminalJobState(state: JobLifecycleState): boolean {
  return TERMINAL_JOB_STATES.includes(state);
}

export class JobBoard {
  private readonly jobs = new Map<string, CarryItemJob>();

  /**
   * Which job each worker is currently on -- the prisoner -> job direction of
   * `assignedWorkerId`, kept as a map so `activeJobFor` is a keyed read rather
   * than a scan ([ADR 0093](../../../docs/adr/0093-a-carry-is-an-action.md)
   * decision 1).
   *
   * **Derived, not persisted**, and the same standing a use claim has under
   * ADR 0029 decision 6 for the same reason: it is a pure function of a value
   * the save already holds (`assignedWorkerId` on each non-terminal job), so
   * storing it would put a value in the payload that can disagree with the
   * state that produced it. `loadSnapshot` rebuilds it, which is what makes
   * `snapshot() -> restore()` land on the same map by construction.
   *
   * Maintained on assignment (`assignTo`) and on every terminal transition
   * (`endJob`, `cancel`), which are the only three places `assignedWorkerId`'s
   * liveness changes. It is read **by key only** -- never iterated for an
   * outcome -- so it decides nothing about order (ADR 0093 decision 6).
   */
  private readonly activeByWorker = new Map<EntityId, string>();

  public submitCarryItem(input: SubmitCarryItemJobInput, createdAtTick: number): CarryItemJob {
    if (this.jobs.has(input.id)) throw new RangeError(`Duplicate job id "${input.id}".`);
    const job: CarryItemJob = { ...input, createdAtTick, state: 'available', leg: 'pickup' };
    this.jobs.set(input.id, job);
    return job;
  }

  /**
   * The job this worker is on, or `undefined` for a worker on none.
   *
   * The prisoner -> job link ADR 0093 decision 1 puts here rather than in
   * `PrisonerColdState.currentActionTargetInstanceId`: that field is published
   * as `targetRoomInstanceId` (`presentation/prisoner-projection.ts`) and
   * resolved through the room registry, so a job id in it would be a lie in a
   * field name and the save would carry the lie.
   */
  public activeJobFor(workerId: EntityId): CarryItemJob | undefined {
    const jobId = this.activeByWorker.get(workerId);
    if (jobId === undefined) return undefined;
    const job = this.jobs.get(jobId);
    // Total rather than trusting the index: a job removed or driven terminal by
    // any path that forgot to reindex reads as "no active job" instead of
    // handing back a completed one.
    return job !== undefined && !isTerminalJobState(job.state) ? job : undefined;
  }

  /**
   * Takes the job for this worker: `available -> assigned`, `leg = 'pickup'`,
   * and the worker indexed.
   *
   * **This transition is the claim** (ADR 0093 decision 1), which is why it is
   * one method on the board rather than three assignments at a call site: the
   * board is what has to know that this worker is now busy, and a caller that
   * wrote `assignedWorkerId` itself would leave the index behind.
   *
   * Refuses -- and touches nothing -- for a job that is not `available` or a
   * worker who already holds one, so a double claim is a no-op rather than a
   * second job nobody will finish.
   */
  public assignTo(jobId: string, workerId: EntityId): boolean {
    const job = this.jobs.get(jobId);
    if (job === undefined || job.state !== 'available') return false;
    if (this.activeByWorker.has(workerId)) return false;
    job.assignedWorkerId = workerId;
    job.leg = 'pickup';
    job.state = 'assigned';
    this.activeByWorker.set(workerId, job.id);
    return true;
  }

  /**
   * Drives a job to a terminal state and drops its worker from the index.
   *
   * Every terminal transition goes through here or through `cancel`, which is
   * the same "one release site per exit" argument `ActionSystem.releaseUseClaim`
   * makes for a use claim: an index entry left behind would make the worker
   * permanently ineligible for another errand, silently and for the rest of
   * the session.
   */
  public endJob(jobId: string, state: 'completed' | 'failed', failReason?: CarryJobFailReason | RouteFailureReason): boolean {
    const job = this.jobs.get(jobId);
    if (job === undefined || isTerminalJobState(job.state)) return false;
    job.state = state;
    if (failReason !== undefined) job.failReason = failReason;
    this.forgetWorker(job);
    return true;
  }

  private forgetWorker(job: CarryItemJob): void {
    if (job.assignedWorkerId === undefined) return;
    if (this.activeByWorker.get(job.assignedWorkerId) === job.id) this.activeByWorker.delete(job.assignedWorkerId);
  }

  public getById(id: string): CarryItemJob | undefined {
    return this.jobs.get(id);
  }

  /** Deterministic: priority descending, then id ascending -- never Map iteration order. */
  public availableJobsSorted(): readonly CarryItemJob[] {
    return [...this.jobs.values()]
      .filter((job) => job.state === 'available')
      .sort((a, b) => (a.priority !== b.priority ? b.priority - a.priority : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  public activeJobs(): readonly CarryItemJob[] {
    return [...this.jobs.values()]
      .filter((job) => !isTerminalJobState(job.state))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  public allSorted(): readonly CarryItemJob[] {
    return [...this.jobs.keys()].sort().map((id) => this.jobs.get(id)!);
  }

  /** Cancels a still-active job; a no-op (returns false) for a completed/failed/already-cancelled/unknown job -- callers may race with completion. Does not itself release reservations/worker busy state (job-system.ts's cancel path does that, since only it knows what to release). */
  public cancel(id: string): boolean {
    const job = this.jobs.get(id);
    if (job === undefined || isTerminalJobState(job.state)) return false;
    job.state = 'cancelled';
    this.forgetWorker(job);
    return true;
  }

  public getSnapshot(): readonly CarryItemJob[] {
    return this.allSorted().map((job) => ({ ...job }));
  }

  /**
   * A `'travelling'` job's `pathRequestId` referenced the *previous*
   * `NavigationSystem` instance's queue -- a freshly constructed one (this
   * method's own snapshot scope) never received that request and would
   * never resolve it, leaving the job stuck in `'travelling'` forever.
   * Drop it back to `'assigned'` (clearing the stale id) so the routing is
   * requested again -- the same restore convention
   * `PrisonerOperationsRuntime.loadSnapshot` uses for mid-travel prisoners.
   *
   * **This branch is a migration path and nothing else since
   * [ADR 0093](../../../docs/adr/0093-a-carry-is-an-action.md), and the
   * sentence above named a deleted symbol until 2026-09-03.** It said the drop
   * was *"so `JobSystem.beginLeg` re-requests routing on the next scheduled
   * tick"*; `JobSystem` and `beginLeg` both went with that decision, and the
   * re-request now comes from the carrier's own next reconsideration --
   * `ActionSystem` re-selects the carry (their active job makes it providable)
   * and `beginCarryLeg` asks for the route. **No save this build writes can
   * hold a `'travelling'` job at all**: nothing in `src/` assigns that state,
   * or `'performing'`, or `'reserved'`. The three members stay in
   * `JobLifecycleState` because a save written *before* ADR 0093 can carry
   * them, which is exactly what this branch is for -- and note that
   * `'performing'` gets no equivalent normalisation, because a pre-0093 save's
   * carrier has no `action.carry` in its `actionIndex` either and
   * `CarryJobExecutor.reconcileRestoredJobs` is the path that decides such a
   * job's fate.
   */
  public loadSnapshot(snapshot: readonly CarryItemJob[]): void {
    this.jobs.clear();
    this.activeByWorker.clear();
    for (const job of snapshot) {
      const restored: CarryItemJob = { ...job };
      if (restored.state === 'travelling') {
        restored.state = 'assigned';
        restored.pathRequestId = undefined;
      }
      this.jobs.set(restored.id, restored);
      // The worker index is rebuilt here rather than saved (see
      // `activeByWorker`). Keyed by entity id and visiting each job once, so
      // restoring the same snapshot twice produces the same map rather than a
      // doubled one -- the idempotence `ActionSystem.reinstateUseClaims` argues
      // for the sibling derived value.
      if (restored.assignedWorkerId !== undefined && !isTerminalJobState(restored.state)) {
        this.activeByWorker.set(restored.assignedWorkerId, restored.id);
      }
    }
  }
}
