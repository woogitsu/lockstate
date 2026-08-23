import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../simulation/runtime/restore-session';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../simulation/runtime/new-session';

/**
 * Thrown by `startFromSnapshot` when the failure is attributable to the
 * *snapshot* rather than to the host: the payload decoded as a save envelope
 * and then could not be restored.
 *
 * The distinction is load-bearing, not decoration. `SessionController` demotes
 * the generation it just tried to load when it sees this error, and demoting
 * drops that generation from the retained window — so a hung, dead or
 * mid-shutdown host must *not* raise it, or one broken worker would delete a
 * player's newest good saves one load at a time. Everything else
 * (`WorkerSessionHost`'s reply timeout, a `send` that throws, a stopped
 * session) keeps propagating as an ordinary `Error` and demotes nothing.
 */
export class SnapshotRestoreRejectedError extends Error {
  public constructor(message: string, options?: { readonly cause?: unknown }) {
    super(message, options);
    this.name = 'SnapshotRestoreRejectedError';
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
   * Rejects with `SnapshotRestoreRejectedError` when the *bundle* was refused,
   * and with an ordinary `Error` for anything about the host itself (no reply,
   * gone away). `SessionController` demotes a save generation on the first and
   * never on the second, so an implementation must not blur the two.
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
      // In process there is no host to blame: `restoreSimulationRuntime`
      // throwing means the bundle itself could not be restored. The previous
      // session is left in place, exactly as a worker keeps its own state
      // when it refuses a snapshot.
      throw new SnapshotRestoreRejectedError(
        `Snapshot could not be restored: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
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
