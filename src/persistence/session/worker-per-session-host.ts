import type { SimulationClient } from '../../simulation/worker/client';
import type { SessionSnapshotBundle } from '../../simulation/runtime/restore-session';
import type { SessionRuntimeHost } from './runtime-host';
import { WorkerSessionHost, type WorkerSessionHostOptions } from './worker-session-host';

/**
 * The slice of `SimulationWorkerChannel` this host uses. Structural, so a test
 * needs no real `Worker`.
 */
export interface SessionWorkerSource {
  /** A worker that has hosted no session. Throws if one cannot be constructed. */
  claimForSession(): SimulationClient;
}

export interface WorkerPerSessionHostOptions extends WorkerSessionHostOptions {
  /**
   * Told, after every attempt to obtain a worker, whether this page has one.
   *
   * Issue #82's failure path used to run exactly once, at boot: a browser that
   * could not start a worker got the HUD with a `simulation-unavailable`
   * notice, and no later construction was possible to fail. Giving every
   * session its own worker makes it possible, so the same report has to be
   * re-entrant -- `src/main.ts` wires this to the HUD's notice, which is now
   * settable for that reason.
   *
   * `true` after every successful claim, not only after a recovery: the call
   * is idempotent on the HUD's side, and a host that only heard about failures
   * could never take the sentence back down.
   */
  readonly onWorkerAvailability?: (available: boolean) => void;
}

/**
 * How long to wait for the outgoing worker to acknowledge its own shutdown
 * before terminating it anyway.
 *
 * The acknowledgement is worth asking for: `simulation/shutdown` makes the
 * machine stop its tick loop and post `simulation/stopped`, which is what
 * tells the renderer's feed and the command sender that the session is over
 * -- so neither spends the swap posting requests at a worker that is about to
 * be killed. It is not worth *waiting* for: a live worker answers in about a
 * millisecond, and the one that does not is a wedged worker, whose player is
 * best served by getting a new one now rather than 15 seconds from now (the
 * host's own reply timeout). The worker is terminated either way.
 */
const SHUTDOWN_ACKNOWLEDGEMENT_GRACE_MS = 1_000;

/**
 * A `SessionRuntimeHost` that gives every session its own simulation worker
 * (issue #149).
 *
 * `WorkerSessionHost` drives *one* worker through *one* session, and that is
 * exactly what it should do -- the state machine accepts one
 * `simulation/initialize` and refuses the rest, because a worker holds one
 * authoritative simulation (ADR 0006). What was missing is the layer above:
 * `src/main.ts` built one host per page, so after the first `createPrison` or
 * `loadPrison` every later load in the tab was refused as
 * `already-initialized` and the player's only way forward was to reload the
 * page.
 *
 * This is that layer. Each `startNew`/`startFromSnapshot` ends the previous
 * session, claims a worker that has hosted none, and drives it through a
 * `WorkerSessionHost` of its own -- so the protocol contract below is
 * untouched and the composition above it stops being a one-shot.
 *
 * ### What it does *not* change
 *
 * The error vocabulary. `startFromSnapshot` still raises
 * `SnapshotRestoreRejectedError` only when the *snapshot* was refused, so
 * `SessionController` still demotes a generation only then. A worker that
 * could not be constructed is an ordinary `Error` and costs no generation:
 * the save may be perfectly good and deleting it would be the more expensive
 * mistake (`SnapshotRestoreRejectedError`'s own docs).
 */
export class WorkerPerSessionHost implements SessionRuntimeHost {
  private active: WorkerSessionHost | undefined;

  public constructor(
    private readonly workers: SessionWorkerSource,
    private readonly options: WorkerPerSessionHostOptions = {},
  ) {}

  public async startNew(masterSeed: number): Promise<void> {
    const host = await this.beginSession();
    await host.startNew(masterSeed);
  }

  public async startFromSnapshot(bundle: SessionSnapshotBundle): Promise<void> {
    const host = await this.beginSession();
    await host.startFromSnapshot(bundle);
  }

  /**
   * Ends the current session and takes a fresh worker for the next one.
   *
   * Note what this costs the recovery walk in `SessionController.loadPrison`:
   * a refused generation is retried against a *new* worker rather than the one
   * that refused it. That is a worker start per demoted generation -- at most
   * three, since three is what the repository retains -- and it is the price
   * of the rule being total. The worker that refused a snapshot is still
   * usable in principle (it installed no runtime and stays `uninitialized`,
   * which is why that fault is raised `recoverable`), but the main thread
   * cannot tell it apart from the one that faulted while restoring, and
   * reusing *that* one would refuse every later load exactly as #149 did.
   */
  private async beginSession(): Promise<WorkerSessionHost> {
    await this.stop();

    let client: SimulationClient;
    try {
      client = this.workers.claimForSession();
    } catch (error) {
      this.options.onWorkerAvailability?.(false);
      throw new Error(
        `The simulation worker for this session could not be started: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
    this.options.onWorkerAvailability?.(true);

    const host = new WorkerSessionHost(client, this.options);
    this.active = host;
    return host;
  }

  public async capture(): Promise<SessionSnapshotBundle> {
    const active = this.active;
    if (active === undefined) throw new Error('No simulation is running; cannot capture a snapshot.');
    return active.capture();
  }

  /**
   * Ends the current session, without claiming a replacement.
   *
   * The worker is left running and shut down rather than terminated here: the
   * channel terminates it when the next session claims one, which keeps
   * "whose worker is this" in one place. `stop()` on a host with no session is
   * a no-op, so the boot worker survives the first `beginSession` and serves
   * the first session rather than being thrown away unused.
   */
  public async stop(): Promise<void> {
    const active = this.active;
    this.active = undefined;
    if (active === undefined) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        // `WorkerSessionHost.stop` never rejects: a worker that is already
        // gone cannot acknowledge a shutdown, and the session is over either
        // way.
        active.stop(),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, SHUTDOWN_ACKNOWLEDGEMENT_GRACE_MS);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}
