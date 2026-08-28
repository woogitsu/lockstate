import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../simulation/runtime/restore-session';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../simulation/runtime/new-session';
import { RESTORE_CODE_FAULT, restoreFailureReasonOf, type SnapshotRefusalReason } from '../../simulation/runtime/restore-refusal';

/**
 * Thrown by `startFromSnapshot` when the failure is attributable to the
 * *snapshot* rather than to the host: the payload decoded as a save envelope,
 * and then a declared check inside the restore path refused its contents.
 *
 * The distinction is load-bearing, not decoration. `SessionController` sets
 * the generation it just tried to load aside when it sees this error, tries
 * the next-oldest, and — **once one of them has actually restored** — demotes
 * the ones it set aside, which drops them from the retained window and deletes
 * them. So a hung, dead or mid-shutdown host must *not* raise it: everything
 * else (`WorkerSessionHost`'s reply timeout, a `send` that throws, a stopped
 * session) keeps propagating as an ordinary `Error`, costs no generation, and
 * ends the load rather than the window.
 *
 * What this error can no longer do, and #403 is the reason to say so here:
 * raising it for a cause that is really *this build's* — a bug in restore
 * code, which the worker's catch-all could not tell from a bad blob — used to
 * delete a save on every generation it refused, and a cause of that shape
 * refuses all of them. It deleted nothing even before #431, because nothing is
 * retired until a different generation has restored through the same code.
 * **Since #431 it cannot be raised for that cause at all**: an exception
 * nothing declared is a `SnapshotRestoreFaultError`, a different class, and
 * the demotion decision reads the class rather than a bound.
 *
 * `reason` is why the *save* was refused, decided at the check that refused it
 * and carried across the worker boundary in the fault's `details` — never
 * inferred from `message`. See `src/simulation/runtime/restore-refusal.ts` for
 * the two values and the argument for two.
 */
export class SnapshotRestoreRejectedError extends Error {
  public constructor(
    public readonly reason: SnapshotRefusalReason,
    message: string,
    options?: { readonly cause?: unknown },
  ) {
    super(message, options);
    this.name = 'SnapshotRestoreRejectedError';
  }
}

/**
 * Thrown by `startFromSnapshot` when the restore path threw and **nothing
 * declared a refusal** — so the fault is this build's, and no verdict has been
 * reached about the player's save at all (#431).
 *
 * It is a separate class rather than a `reason` arm on the error above, and
 * that is the point: `SessionController.loadPrison` decides demotion by
 * `instanceof SnapshotRestoreRejectedError`, so a code fault cannot reach the
 * demotion path however that method is later edited. The property #431 asks
 * for — *"a code fault must not enter the demotion path at all"* — is held by
 * the type system rather than by a second conditional somebody can drop.
 *
 * It does **not** end the load. The controller tries the next-oldest
 * generation exactly as it does for a refusal, because our defect may be
 * specific to what one generation happens to contain; what it never does is
 * retire the generation that provoked it. If the walk runs out, the first such
 * fault is thrown rather than reported as `no-valid-generation`, so the player
 * is told the load failed rather than being told their saves are unreadable.
 */
export class SnapshotRestoreFaultError extends Error {
  public constructor(message: string, options?: { readonly cause?: unknown }) {
    super(message, options);
    this.name = 'SnapshotRestoreFaultError';
  }
}

/**
 * Where a session's authoritative simulation state actually lives, from
 * the persistence layer's point of view.
 *
 * `SessionController` deliberately does **not** own a `SimulationRuntime`.
 * `AGENTS.md` assigns authoritative in-session state to the simulation
 * worker, ADR 0003 requires that saving go through the worker's snapshot
 * request/response "rather than bypassing it", and issue #19 requires that
 * "save creation consumes explicit Worker snapshots." So the controller
 * only ever asks a host for a snapshot bundle, and hands one back to
 * restore — it never reaches into a runtime, and never assumes one is on
 * its own thread.
 *
 * Two hosts implement this: `WorkerSessionHost` (production, drives the
 * real worker over the protocol) and `InProcessSessionHost` (tests and
 * headless tooling, where spinning up a `Worker` would add nothing but
 * flakiness).
 */
export interface SessionRuntimeHost {
  /** Starts a brand-new simulation. */
  startNew(masterSeed: number): Promise<void>;
  /**
   * Starts a simulation restored from a previously captured bundle.
   *
   * Three rejections, and an implementation must not blur them:
   *
   * - `SnapshotRestoreRejectedError` — a declared check refused the *bundle*.
   *   `SessionController` sets that generation aside and may retire it later.
   * - `SnapshotRestoreFaultError` — the restore path threw and nothing
   *   declared a refusal, so the fault is this build's. The controller tries
   *   the next generation and retires none.
   * - an ordinary `Error` — anything about the host itself (no reply, gone
   *   away). The controller abandons the load; the save may be perfectly good.
   */
  startFromSnapshot(bundle: SessionSnapshotBundle): Promise<void>;
  /** Captures current authoritative state. Rejects if no session is running. */
  capture(): Promise<SessionSnapshotBundle>;
  /** Tears the session down; safe to call when nothing is running. */
  stop(): Promise<void>;
}

/**
 * Runs the simulation in this process rather than a worker.
 *
 * This is not a shortcut around the worker boundary — it is the same
 * boundary, honoured through the same interface, for contexts where a
 * `Worker` is unavailable or pointless: Vitest's `node` environment, and
 * any future headless tooling. Because it goes through `capture()` /
 * `startFromSnapshot()` exactly like the worker host, a test proving
 * save/load against this host proves the same contract the worker host
 * satisfies.
 */
export class InProcessSessionHost implements SessionRuntimeHost {
  private runtime: SimulationRuntime | undefined;

  /** Exposed for tests/tooling that need to drive the simulation directly (step the kernel, submit commands). */
  public getRuntime(): SimulationRuntime | undefined {
    return this.runtime;
  }

  public async startNew(masterSeed: number): Promise<void> {
    this.runtime = createNewSimulationRuntime(masterSeed);
  }

  public async startFromSnapshot(bundle: SessionSnapshotBundle): Promise<void> {
    try {
      this.runtime = restoreSimulationRuntime(bundle).runtime;
    } catch (error) {
      // In process there is no host to blame, but there are still two things
      // to blame (#431): a declared refusal from the restore modules, and an
      // exception nothing declared. The classifier is the same one the worker
      // boundary uses, so the two hosts cannot drift on what a reason means --
      // which matters because `docs/PERSISTENCE.md` rests a whole section on
      // a test against this host proving the contract the worker host
      // satisfies. The previous session is left in place either way, exactly
      // as a worker keeps its own state when it refuses a snapshot.
      const reason = restoreFailureReasonOf(error);
      const detail = error instanceof Error ? error.message : String(error);
      if (reason === RESTORE_CODE_FAULT) {
        throw new SnapshotRestoreFaultError(`Restoring this snapshot threw where nothing declared a refusal: ${detail}`, { cause: error });
      }
      throw new SnapshotRestoreRejectedError(reason, `Snapshot could not be restored: ${detail}`, { cause: error });
    }
  }

  public async capture(): Promise<SessionSnapshotBundle> {
    if (this.runtime === undefined) throw new Error('No simulation is running; cannot capture a snapshot.');
    return captureSessionSnapshot(this.runtime);
  }

  public async stop(): Promise<void> {
    this.runtime = undefined;
  }
}
