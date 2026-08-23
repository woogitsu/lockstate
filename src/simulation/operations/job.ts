import type { EntityId } from '../entity/entity-store';
import type { TilePosition } from '../world/coordinates';

export type JobLifecycleState = 'available' | 'reserved' | 'assigned' | 'travelling' | 'performing' | 'completed' | 'failed' | 'cancelled';
export type CarryLeg = 'pickup' | 'dropoff';

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
  failReason?: string | undefined;
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
