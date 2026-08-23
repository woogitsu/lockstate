import type { SimulationClient } from '../../simulation/worker/client';
import type { WorkerToMainMessage } from '../../simulation/protocol/types';
import { SIMULATION_PROTOCOL_VERSION } from '../../simulation/protocol/types';
import { SESSION_SNAPSHOT_SCHEMA_ID, SESSION_SNAPSHOT_SCHEMA_VERSION, type SessionSnapshotBundle } from '../../simulation/runtime/restore-session';
import type { SessionRuntimeHost } from './runtime-host';

/** Injectable so tests are not tied to `crypto.randomUUID` availability. */
export interface WorkerSessionHostOptions {
  readonly generateMessageId?: () => string;
  readonly generateSessionId?: () => string;
  /** How long to wait for a correlated worker reply before failing. A hung worker must surface as a save failure, not an unresolved promise. */
  readonly replyTimeoutMs?: number;
}

const DEFAULT_REPLY_TIMEOUT_MS = 15_000;

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
      const payload = message.payload as { code?: string; message?: string };
      entry.reject(new Error(`Simulation worker fault (${payload.code ?? 'unknown'}): ${payload.message ?? 'no detail'}`));
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

  public async startFromSnapshot(bundle: SessionSnapshotBundle): Promise<void> {
    await this.initialize({
      kind: 'snapshot',
      snapshot: {
        transport: 'structured-clone',
        schemaId: SESSION_SNAPSHOT_SCHEMA_ID,
        schemaVersion: SESSION_SNAPSHOT_SCHEMA_VERSION,
        data: bundle,
      },
    });
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
