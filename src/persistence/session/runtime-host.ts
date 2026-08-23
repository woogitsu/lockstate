import { STARTER_SCENARIO } from '../../content/scenario-catalog';
import { applyScenario } from '../../simulation/runtime/apply-scenario';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../simulation/runtime/restore-session';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../simulation/runtime/new-session';

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
  /** Starts a simulation restored from a previously captured bundle. */
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
    const runtime = createNewSimulationRuntime(masterSeed);
    // What makes this a playable prison rather than an empty one (ADR
    // 0018). It mirrors `WorkerStateMachine.handleInitialize`'s `'new'`
    // branch exactly, which is the point: a test driving this host is
    // driving the same session a player gets.
    applyScenario(runtime, STARTER_SCENARIO);
    this.runtime = runtime;
  }

  public async startFromSnapshot(bundle: SessionSnapshotBundle): Promise<void> {
    // No scenario is applied here: a restored session's stock is whatever
    // the save carried. See `applyScenario`.
    this.runtime = restoreSimulationRuntime(bundle).runtime;
  }

  public async capture(): Promise<SessionSnapshotBundle> {
    if (this.runtime === undefined) throw new Error('No simulation is running; cannot capture a snapshot.');
    return captureSessionSnapshot(this.runtime);
  }

  public async stop(): Promise<void> {
    this.runtime = undefined;
  }
}
