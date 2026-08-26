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
export class JobBoard {
  private readonly jobs = new Map<string, CarryItemJob>();

  public submitCarryItem(input: SubmitCarryItemJobInput, createdAtTick: number): CarryItemJob {
    if (this.jobs.has(input.id)) throw new RangeError(`Duplicate job id "${input.id}".`);
    const job: CarryItemJob = { ...input, createdAtTick, state: 'available', leg: 'pickup' };
    this.jobs.set(input.id, job);
    return job;
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
      .filter((job) => !['completed', 'failed', 'cancelled'].includes(job.state))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  public allSorted(): readonly CarryItemJob[] {
    return [...this.jobs.keys()].sort().map((id) => this.jobs.get(id)!);
  }

  /** Cancels a still-active job; a no-op (returns false) for a completed/failed/already-cancelled/unknown job -- callers may race with completion. Does not itself release reservations/worker busy state (job-system.ts's cancel path does that, since only it knows what to release). */
  public cancel(id: string): boolean {
    const job = this.jobs.get(id);
    if (job === undefined || ['completed', 'failed', 'cancelled'].includes(job.state)) return false;
    job.state = 'cancelled';
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
   * Drop it back to `'assigned'` (clearing the stale id) so
   * `JobSystem.beginLeg` re-requests routing on the next scheduled tick --
   * the same restore convention `PrisonerOperationsRuntime.loadSnapshot`
   * uses for mid-travel prisoners.
   */
  public loadSnapshot(snapshot: readonly CarryItemJob[]): void {
    this.jobs.clear();
    for (const job of snapshot) {
      const restored: CarryItemJob = { ...job };
      if (restored.state === 'travelling') {
        restored.state = 'assigned';
        restored.pathRequestId = undefined;
      }
      this.jobs.set(restored.id, restored);
    }
  }
}
