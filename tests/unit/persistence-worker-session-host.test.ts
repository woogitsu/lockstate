import { describe, expect, it, vi } from 'vitest';
import { WorkerFaultError, WorkerSessionHost } from '../../src/persistence/session/worker-session-host';
import { SnapshotRestoreFaultError, SnapshotRestoreRejectedError } from '../../src/persistence/session/runtime-host';
import type { SimulationClient } from '../../src/simulation/worker/client';
import { SIMULATION_PROTOCOL_VERSION } from '../../src/simulation/protocol/types';
import { SESSION_SNAPSHOT_SCHEMA_ID, SESSION_SNAPSHOT_SCHEMA_VERSION } from '../../src/simulation/runtime/restore-session';

/** Stands in for `SimulationClient` so these run in the default `node` environment with no real `Worker`. */
class FakeClient {
  public readonly sent: any[] = [];
  private listener: ((message: any) => void) | undefined;
  public sendShouldThrow: Error | undefined;

  public addListener(handler: (message: any) => void): void {
    this.listener = handler;
  }
  public removeListener(): void {
    this.listener = undefined;
  }
  public send(message: any): void {
    if (this.sendShouldThrow !== undefined) throw this.sendShouldThrow;
    this.sent.push(message);
  }
  public terminate(): void {}

  public lastMessageId(): string {
    return this.sent[this.sent.length - 1]!.messageId;
  }
  /** Simulates the worker replying to the most recent request. */
  public reply(kind: string, payload: unknown, replyTo = this.lastMessageId()): void {
    this.listener?.({ protocolVersion: SIMULATION_PROTOCOL_VERSION, messageId: 'worker-msg', replyTo, kind, payload });
  }
}

const BUNDLE = { kernel: { tick: 7, expectedSequence: 0, rngStates: [], commands: [] }, world: { version: 1, chunkSize: 32, ownedChunks: [], chunks: [] }, construction: { orders: [], undoStack: [], redoStack: [] } };

function buildHost(options?: { readonly replyTimeoutMs?: number }) {
  const client = new FakeClient();
  let counter = 0;
  const host = new WorkerSessionHost(client as unknown as SimulationClient, {
    generateMessageId: () => `msg-${++counter}`,
    generateSessionId: () => 'session-1',
    ...(options?.replyTimeoutMs === undefined ? {} : { replyTimeoutMs: options.replyTimeoutMs }),
  });
  return { client, host };
}

describe('WorkerSessionHost: correlated request/response over the protocol', () => {
  it('startNew sends an initialize with the seed and resolves on ready', async () => {
    const { client, host } = buildHost();
    const started = host.startNew(4242);
    expect(client.sent[0]).toMatchObject({ kind: 'simulation/initialize', payload: { source: { kind: 'new', masterSeed: 4242 } } });

    client.reply('simulation/ready', { sessionId: 'session-1', tick: 0, clock: { mode: 'paused' } });
    await expect(started).resolves.toBeUndefined();
  });

  it('startFromSnapshot wraps the bundle in a versioned structured-clone payload', async () => {
    const { client, host } = buildHost();
    const started = host.startFromSnapshot(BUNDLE as never);

    expect(client.sent[0].payload.source).toMatchObject({
      kind: 'snapshot',
      snapshot: { transport: 'structured-clone', schemaId: SESSION_SNAPSHOT_SCHEMA_ID, schemaVersion: SESSION_SNAPSHOT_SCHEMA_VERSION, data: BUNDLE },
    });

    client.reply('simulation/ready', { sessionId: 'session-1', tick: 7, clock: { mode: 'paused' } });
    await started;
  });

  it('capture returns the bundle from a correlated snapshot reply', async () => {
    const { client, host } = buildHost();
    const started = host.startNew(0);
    client.reply('simulation/ready', {});
    await started;

    const captured = host.capture();
    expect(client.sent[1]).toMatchObject({ kind: 'simulation/request-snapshot' });
    client.reply('simulation/snapshot', { tick: 7, reason: 'manual-save', snapshot: { transport: 'structured-clone', schemaId: SESSION_SNAPSHOT_SCHEMA_ID, schemaVersion: SESSION_SNAPSHOT_SCHEMA_VERSION, data: BUNDLE } });

    await expect(captured).resolves.toEqual(BUNDLE);
  });

  it('ignores replies that do not correlate to a pending request', async () => {
    const { client, host } = buildHost();
    const started = host.startNew(0);

    client.reply('simulation/ready', {}, 'some-other-message-id'); // wrong replyTo
    let settled = false;
    void started.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);

    client.reply('simulation/ready', {}); // correct one
    await started;
  });

  it('capture before a session is started fails rather than hanging', async () => {
    const { host } = buildHost();
    await expect(host.capture()).rejects.toThrow(/No simulation is running/);
  });
});

describe('WorkerSessionHost: failures surface as errors, never as unsettled promises', () => {
  it('a protocol/error naming our request rejects that request', async () => {
    const { client, host } = buildHost();
    const started = host.startNew(0);
    client.reply('protocol/error', { code: 'snapshot-incompatible', message: 'bad schema' });

    await expect(started).rejects.toThrow(/snapshot-incompatible.*bad schema/);
  });

  it('an unexpected reply kind rejects rather than being silently accepted', async () => {
    const { client, host } = buildHost();
    const started = host.startNew(0);
    client.reply('simulation/stopped', { tick: 0, reason: 'shutdown-requested' });

    await expect(started).rejects.toThrow(/Expected the worker to report ready/);
  });

  it('a worker that never replies times out instead of hanging forever', async () => {
    vi.useFakeTimers();
    try {
      const { host } = buildHost({ replyTimeoutMs: 1_000 });
      const started = host.startNew(0);
      const assertion = expect(started).rejects.toThrow(/did not reply within 1000ms/);
      await vi.advanceTimersByTimeAsync(1_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('a snapshot whose schema this build does not understand is rejected, not trusted', async () => {
    const { client, host } = buildHost();
    const started = host.startNew(0);
    client.reply('simulation/ready', {});
    await started;

    const captured = host.capture();
    client.reply('simulation/snapshot', { snapshot: { transport: 'structured-clone', schemaId: SESSION_SNAPSHOT_SCHEMA_ID, schemaVersion: SESSION_SNAPSHOT_SCHEMA_VERSION + 1, data: BUNDLE } });

    await expect(captured).rejects.toThrow(/this build expects/);
  });

  it('a send that throws rejects the request instead of leaving it pending', async () => {
    const { client, host } = buildHost();
    client.sendShouldThrow = new Error('worker is gone');
    await expect(host.startNew(0)).rejects.toThrow(/worker is gone/);
  });

  /**
   * Issue #103: only a `snapshot-incompatible` fault may cost the session
   * layer a generation. `SessionController.loadPrison` demotes on
   * `SnapshotRestoreRejectedError`, and demoting deletes -- so a timeout or a
   * dead worker must not produce that error, or one broken worker would
   * delete the player's newest good saves one load at a time.
   */
  it('re-raises a refused snapshot as SnapshotRestoreRejectedError, keeping the fault detail and the declared reason', async () => {
    const { client, host } = buildHost();
    const started = host.startFromSnapshot(BUNDLE as never);
    client.reply('protocol/error', {
      code: 'snapshot-incompatible',
      message: 'Snapshot could not be restored: bad world',
      recoverable: true,
      details: { snapshotRestore: 'damaged-payload' },
    });

    await expect(started).rejects.toThrow(SnapshotRestoreRejectedError);
    await expect(started).rejects.toThrow(/Snapshot could not be restored: bad world/);
    // The reason the worker declared, not one derived here from the code or
    // the message (#431).
    await expect(started).rejects.toMatchObject({ reason: 'damaged-payload' });
  });

  /**
   * The other declared save-side reason, on the same code, so the two are
   * shown to be told apart by `details` rather than by `snapshot-incompatible`
   * carrying one fixed meaning.
   */
  it('carries `unsupported-by-this-build` through unchanged rather than flattening it', async () => {
    const { client, host } = buildHost();
    const started = host.startFromSnapshot(BUNDLE as never);
    client.reply('protocol/error', {
      code: 'snapshot-incompatible',
      message: 'Cannot restore snapshot "simulation-save-payload" v99',
      recoverable: true,
      details: { snapshotRestore: 'unsupported-by-this-build' },
    });

    await expect(started).rejects.toMatchObject({ reason: 'unsupported-by-this-build' });
  });

  /**
   * #431's whole point on this boundary: a fault our own restore code caused
   * must not arrive as a verdict about the player's save.
   */
  it('raises a declared restore-code fault as SnapshotRestoreFaultError, which costs no generation', async () => {
    const { client, host } = buildHost();
    const started = host.startFromSnapshot(BUNDLE as never);
    client.reply('protocol/error', {
      code: 'internal-error',
      message: 'Restoring this snapshot threw where nothing declared a refusal: boom',
      recoverable: false,
      details: { snapshotRestore: 'restore-code-fault' },
    });

    await expect(started).rejects.toThrow(SnapshotRestoreFaultError);
    await expect(started).rejects.not.toBeInstanceOf(SnapshotRestoreRejectedError);
  });

  /**
   * A refusal that declares nothing is a producer that forgot, so no verdict
   * has been reached about the save and none is invented on its behalf.
   */
  it('does not invent a verdict for a snapshot-incompatible fault that declares no reason', async () => {
    const { client, host } = buildHost();
    const started = host.startFromSnapshot(BUNDLE as never);
    client.reply('protocol/error', { code: 'snapshot-incompatible', message: 'Snapshot could not be restored: bad world', recoverable: true });

    await expect(started).rejects.toThrow(SnapshotRestoreFaultError);
    await expect(started).rejects.not.toBeInstanceOf(SnapshotRestoreRejectedError);
  });

  it('does not blame the snapshot for a worker that never replied', async () => {
    vi.useFakeTimers();
    try {
      const { host } = buildHost({ replyTimeoutMs: 1_000 });
      const started = host.startFromSnapshot(BUNDLE as never);
      const assertion = expect(started).rejects.not.toBeInstanceOf(SnapshotRestoreRejectedError);
      await vi.advanceTimersByTimeAsync(1_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not blame the snapshot for a fault about something else', async () => {
    const { client, host } = buildHost();
    const started = host.startFromSnapshot(BUNDLE as never);
    client.reply('protocol/error', { code: 'already-initialized', message: 'Kernel is already initialized.', recoverable: false });

    await expect(started).rejects.toThrow(WorkerFaultError);
    await expect(started).rejects.not.toBeInstanceOf(SnapshotRestoreRejectedError);
  });

  it('stop rejects any still-pending request so nothing is left dangling', async () => {
    const { client, host } = buildHost();
    const started = host.startNew(0);
    client.reply('simulation/ready', {});
    await started;

    const captured = host.capture();
    const stopping = host.stop();
    client.reply('simulation/stopped', { tick: 0, reason: 'shutdown-requested' }, client.sent[2]!.messageId);
    await stopping;

    await expect(captured).rejects.toThrow(/session was stopped/);
  });
});
