import type { SimulationClient } from '../../simulation/worker/client';
import type { WorkerToMainMessage } from '../../simulation/protocol/types';
import { SIMULATION_PROTOCOL_VERSION } from '../../simulation/protocol/types';
import { SESSION_SNAPSHOT_SCHEMA_ID, SESSION_SNAPSHOT_SCHEMA_VERSION, type SessionSnapshotBundle } from '../../simulation/runtime/restore-session';
import { declaredRestoreFailureReason, RESTORE_CODE_FAULT } from '../../simulation/runtime/restore-refusal';
import { SnapshotRestoreFaultError, SnapshotRestoreRejectedError, type SessionRuntimeHost } from './runtime-host';

/** Injectable so tests are not tied to `crypto.randomUUID` availability. */
export interface WorkerSessionHostOptions {
  readonly generateMessageId?: () => string;
  readonly generateSessionId?: () => string;
  /** How long to wait for a correlated worker reply before failing. A hung worker must surface as a save failure, not an unresolved promise. */
  readonly replyTimeoutMs?: number;
}

const DEFAULT_REPLY_TIMEOUT_MS = 15_000;

/**
 * A `protocol/error` the worker sent in answer to one of our requests, with
 * its fault code and declared `details` preserved.
 *
 * The code is kept because callers act on it, and `details` is kept for the
 * same reason: `startFromSnapshot` reads the restore reason the worker
 * *declared* there and re-raises the matching class, which is what tells the
 * session layer whether the *save* was refused, the worker was unreachable, or
 * our own restore code threw. Flattening a fault into a bare `Error` would
 * leave those distinctions to string matching on a message, which is the
 * defect #431 removes.
 *
 * `details` is `unknown` rather than a decoded shape: it arrives as
 * `jsonValue` and `declaredRestoreFailureReason` is what narrows it, against
 * the closed set, without a cast.
 */
export class WorkerFaultError extends Error {
  public constructor(
    public readonly code: string,
    detail: string,
    public readonly details?: unknown,
  ) {
    super(`Simulation worker fault (${code}): ${detail}`);
    this.name = 'WorkerFaultError';
  }
}

/**
 * Drives the real simulation worker over the protocol, so the main thread
 * never owns authoritative simulation state.
 *
 * Every operation is a correlated request/response: a request carries a
 * `messageId`, and the worker's reply carries it back as `replyTo` (ADR
 * 0003's envelope contract). A `protocol/error` naming our `replyTo`
 * rejects the same pending request, so a worker that faults mid-save
 * surfaces as a failed save rather than a promise that never settles.
 */
export class WorkerSessionHost implements SessionRuntimeHost {
  private readonly pending = new Map<string, { resolve: (message: WorkerToMainMessage) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private readonly generateMessageId: () => string;
  private readonly generateSessionId: () => string;
  private readonly replyTimeoutMs: number;
  private started = false;

  public constructor(
    private readonly client: SimulationClient,
    options: WorkerSessionHostOptions = {},
  ) {
    this.generateMessageId = options.generateMessageId ?? (() => crypto.randomUUID());
    this.generateSessionId = options.generateSessionId ?? (() => `session-${crypto.randomUUID()}`);
    this.replyTimeoutMs = options.replyTimeoutMs ?? DEFAULT_REPLY_TIMEOUT_MS;
    this.client.addListener((message) => this.handleMessage(message));
  }

  private handleMessage(message: WorkerToMainMessage): void {
    const replyTo = (message as { replyTo?: string }).replyTo;
    if (replyTo === undefined) return;
    const entry = this.pending.get(replyTo);
    if (entry === undefined) return;
    this.pending.delete(replyTo);
    clearTimeout(entry.timer);

    if (message.kind === 'protocol/error') {
      const payload = message.payload as { code?: string; message?: string; details?: unknown };
      entry.reject(new WorkerFaultError(payload.code ?? 'unknown', payload.message ?? 'no detail', payload.details));
      return;
    }
    entry.resolve(message);
  }

  private request(build: (messageId: string) => Parameters<SimulationClient['send']>[0]): Promise<WorkerToMainMessage> {
    const messageId = this.generateMessageId();
    return new Promise<WorkerToMainMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(messageId);
        reject(new Error(`The simulation worker did not reply within ${this.replyTimeoutMs}ms.`));
      }, this.replyTimeoutMs);
      this.pending.set(messageId, { resolve, reject, timer });
      try {
        this.client.send(build(messageId));
      } catch (error) {
        this.pending.delete(messageId);
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  public async startNew(masterSeed: number): Promise<void> {
    await this.initialize({ kind: 'new', masterSeed });
  }

  /**
   * ### Which fault becomes which error
   *
   * The **declared reason**, not the fault code, decides — the worker writes
   * one into every restore fault's `details`
   * (`src/simulation/runtime/restore-refusal.ts`), and this reads it back.
   * That is #431's requirement that the two causes be *"distinguishable by a
   * declared value, not by string matching on an error message"*, held one
   * layer earlier than the demotion decision that consumes it.
   *
   * - A declared refusal reason → `SnapshotRestoreRejectedError` carrying it.
   *   Only that answer may cost the session layer a generation.
   * - `restore-code-fault` → `SnapshotRestoreFaultError`. Our defect; the
   *   session layer must retire nothing for it.
   * - A timeout, a dead worker or a fault about anything else → propagates
   *   unchanged, so an unreachable worker never gets a good save demoted.
   *
   * A `snapshot-incompatible` fault that declares **no** reason is treated as
   * our defect rather than as a refusal, and that is deliberate rather than
   * defensive: all three producers of that code declare one
   * (`SimulationWorkerStateMachine.handleInitialize`), so a fault without one
   * is a producer that forgot, and guessing a verdict about a player's save on
   * its behalf is the exact move this issue exists to delete.
   *
   * The worker also stays usable after refusing a snapshot: the refusal is
   * raised as recoverable, so the next generation can be handed to the same
   * worker rather than needing a new one. This host does exactly that.
   * Production wraps it in `WorkerPerSessionHost`, which takes a fresh worker
   * per attempt instead -- not because this one is spent, but because the main
   * thread cannot tell a worker that refused a snapshot apart from one that
   * faulted while restoring, and reusing the latter is issue #149 again.
   */
  public async startFromSnapshot(bundle: SessionSnapshotBundle): Promise<void> {
    try {
      await this.initialize({
        kind: 'snapshot',
        snapshot: {
          transport: 'structured-clone',
          schemaId: SESSION_SNAPSHOT_SCHEMA_ID,
          schemaVersion: SESSION_SNAPSHOT_SCHEMA_VERSION,
          data: bundle,
        },
      });
    } catch (error) {
      if (!(error instanceof WorkerFaultError)) throw error;

      const reason = declaredRestoreFailureReason(error.details);
      if (reason === RESTORE_CODE_FAULT) {
        throw new SnapshotRestoreFaultError(error.message, { cause: error });
      }
      if (reason !== undefined) {
        throw new SnapshotRestoreRejectedError(reason, error.message, { cause: error });
      }
      if (error.code === 'snapshot-incompatible') {
        throw new SnapshotRestoreFaultError(
          `The worker refused this snapshot without declaring why, so no verdict has been reached about the save: ${error.message}`,
          { cause: error },
        );
      }
      throw error;
    }
  }

  private async initialize(source: unknown): Promise<void> {
    const sessionId = this.generateSessionId();
    const reply = await this.request((messageId) => ({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId,
      kind: 'simulation/initialize',
      payload: { sessionId, source },
    }) as Parameters<SimulationClient['send']>[0]);

    if (reply.kind !== 'simulation/ready') {
      throw new Error(`Expected the worker to report ready, got "${reply.kind}".`);
    }
    this.started = true;
  }

  public async capture(): Promise<SessionSnapshotBundle> {
    if (!this.started) throw new Error('No simulation is running; cannot capture a snapshot.');

    const reply = await this.request((messageId) => ({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId,
      kind: 'simulation/request-snapshot',
      payload: { reason: 'manual-save' },
    }) as Parameters<SimulationClient['send']>[0]);

    if (reply.kind !== 'simulation/snapshot') {
      throw new Error(`Expected a snapshot reply, got "${reply.kind}".`);
    }

    const { snapshot } = reply.payload as { snapshot: { schemaId: string; schemaVersion: number; data: unknown } };
    if (snapshot.schemaId !== SESSION_SNAPSHOT_SCHEMA_ID || snapshot.schemaVersion !== SESSION_SNAPSHOT_SCHEMA_VERSION) {
      throw new Error(`Worker returned snapshot "${snapshot.schemaId}" v${snapshot.schemaVersion}; this build expects "${SESSION_SNAPSHOT_SCHEMA_ID}" v${SESSION_SNAPSHOT_SCHEMA_VERSION}.`);
    }
    return snapshot.data as SessionSnapshotBundle;
  }

  public async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    try {
      await this.request((messageId) => ({
        protocolVersion: SIMULATION_PROTOCOL_VERSION,
        messageId,
        kind: 'simulation/shutdown',
        payload: { reason: 'user-request' },
      }) as Parameters<SimulationClient['send']>[0]);
    } catch {
      // A worker that is already gone cannot acknowledge a shutdown; the
      // session is over either way, so this must not throw into teardown.
    }
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error('The simulation session was stopped.'));
    }
    this.pending.clear();
  }
}
