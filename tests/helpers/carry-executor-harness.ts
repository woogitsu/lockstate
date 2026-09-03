import type { EntityId } from '../../src/simulation/entity/entity-store';
import type { CarryJobExecutor } from '../../src/simulation/operations/carry-executor';
import type { CarryItemJob } from '../../src/simulation/operations/job';

/**
 * The caller `CarryJobExecutor` no longer ships with, for unit tests that
 * measure **what a carry does to stock** rather than how a carrier walks.
 *
 * ## Why this exists
 *
 * Before [ADR 0093](../../docs/adr/0093-a-carry-is-an-action.md) a carry was
 * driven by `JobSystem`, a registered system: a unit test built a `Kernel`, a
 * `NavigationSystem`, a `JobWorkerPool` and a fake `JobWorkerAdapter`, stepped
 * the kernel a few hundred times and read the board. The whole lifecycle --
 * matching, both legs' routes, the dwell and the inventory transfer -- ran
 * inside one `update`.
 *
 * ADR 0093 split that in two. The **walk** is `prisoners.actions`', and the
 * only honest way to test it is a real prison with real rooms and real routes
 * (`tests/foundation/job-production-contract.test.ts` and
 * `tests/foundation/two-authorities-one-prisoner-contract.test.ts` do exactly
 * that). What is left in `operations/` is the executor: claim with a stock
 * reservation, commit it on pickup, deposit on drop-off, and give everything
 * back on failure or cancellation. **Those are the conservation properties the
 * files using this harness were written for**, and they are the properties ADR
 * 0093 decision 4 requires to move with the code rather than be rewritten.
 *
 * ## What it deliberately is not
 *
 * **Not a second implementation of `ActionSystem`, and it must not become
 * one.** It supplies the *caller* -- the sequence of executor calls a carrier
 * makes -- and asserts nothing. Every quantity the tests using it compare
 * against is a literal written in the test, never a value read back out of a
 * container the executor just wrote, which is `docs/TESTING.md`'s rule about a
 * fixture supplying both sides of its own comparison.
 *
 * It also omits the walk entirely, and that is the point rather than a
 * shortcut: a carrier here arrives instantly, so a test using this harness
 * cannot say anything about routes, arrival timing or geometry. It says so
 * plainly instead of implying coverage it does not have.
 *
 * ## Ordering
 *
 * Ascending worker id, which is deterministic and is *not* the order the real
 * caller uses -- `ActionSystem` scans idle prisoners by descending need urgency
 * with an ascending-**index** tie-break (ADR 0062). The difference does not
 * reach these tests: a carry scores 0 for every carrier, so the urgency term is
 * constant and the tie-break is the only live term, and none of these fixtures
 * has an entity store to have an index in.
 */
export class CarryCrew {
  public constructor(
    private readonly executor: CarryJobExecutor,
    private readonly workerIds: readonly EntityId[],
  ) {}

  /** The job this carrier is on, if any -- the board's own derived answer. */
  public jobOf(workerId: EntityId): CarryItemJob | undefined {
    return this.executor.board.activeJobFor(workerId);
  }

  public isBusy(workerId: EntityId): boolean {
    return this.jobOf(workerId) !== undefined;
  }

  /**
   * One reconsideration cycle for every carrier: an idle one claims a job, one
   * on the pickup leg picks up, one on the drop-off leg drops off.
   *
   * One step per carrier per cycle, so a job takes three cycles from board to
   * storeroom -- the same shape `ActionSystem` produces, with the two walks
   * collapsed to nothing.
   */
  public step(): void {
    for (const workerId of this.workerIds) {
      const job = this.jobOf(workerId);
      if (job === undefined) {
        this.executor.claimAvailableJobFor(workerId);
        continue;
      }
      if (job.leg === 'pickup') {
        this.executor.pickUp(job);
        continue;
      }
      this.executor.dropOff(job);
    }
  }

  public run(cycles: number): void {
    for (let cycle = 0; cycle < cycles; cycle += 1) this.step();
  }

  /**
   * Runs until `reached` answers `true`, and returns whether it did within
   * `cycles`. The caller asserts on the return value, so a fixture that never
   * reached the state it meant to measure fails loudly instead of asserting
   * against a state nobody arrived at.
   */
  public runUntil(reached: () => boolean, cycles = 50): boolean {
    for (let cycle = 0; cycle < cycles; cycle += 1) {
      if (reached()) return true;
      this.step();
    }
    return reached();
  }
}
