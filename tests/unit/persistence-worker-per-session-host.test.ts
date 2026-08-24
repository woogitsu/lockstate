import { describe, expect, it, vi } from 'vitest';
import { WorkerPerSessionHost } from '../../src/persistence/session/worker-per-session-host';
import { SnapshotRestoreRejectedError } from '../../src/persistence/session/runtime-host';
import type { SimulationClient } from '../../src/simulation/worker/client';
import { SIMULATION_PROTOCOL_VERSION } from '../../src/simulation/protocol/types';

/**
 * `WorkerPerSessionHost` is the layer issue #149 was missing: it turns
 * `WorkerSessionHost`'s one-worker-one-session contract into a session
 * lifecycle the composition root can drive more than once.
 *
 * The protocol itself is `persistence-worker-session-host.test.ts`'s subject
 * and is not restated here. What this file pins is the part that only exists
 * once there is a *sequence* of sessions: which worker each one runs in, what
 * happens to the one before it, and what a browser that will not construct
 * another is told.
 */

/** Stands in for `SimulationClient`, so this runs in the `node` environment with no real `Worker`. */
class FakeClient {
  public readonly sent: { readonly kind: string; readonly messageId: string }[] = [];
  private listener: ((message: unknown) => void) | undefined;
  /** A worker that never answers -- the wedged case the shutdown grace exists for. */
  public silent = false;

  public constructor(public readonly id: number) {}

  public addListener(handler: (message: unknown) => void): void {
    this.listener = handler;
  }
  public removeListener(): void {
    this.listener = undefined;
  }
  public send(message: { kind: string; messageId: string }): void {
    this.sent.push(message);
    if (this.silent) return;
    if (message.kind === 'simulation/initialize') {
      this.reply('simulation/ready', { sessionId: `session-${this.id}`, tick: 0, clock: { mode: 'paused' } }, message.messageId);
    }
    if (message.kind === 'simulation/shutdown') {
      this.reply('simulation/stopped', { tick: 0, reason: 'shutdown-requested' }, message.messageId);
    }
  }
  public terminate(): void {}

  private reply(kind: string, payload: unknown, replyTo: string): void {
    this.listener?.({ protocolVersion: SIMULATION_PROTOCOL_VERSION, messageId: `worker-${this.id}`, replyTo, kind, payload });
  }

  public kinds(): string[] {
    return this.sent.map((message) => message.kind);
  }
}

function harness(options: { readonly failFrom?: number } = {}) {
  const built: FakeClient[] = [];
  const availability: boolean[] = [];
  const host = new WorkerPerSessionHost(
    {
      claimForSession: () => {
        if (options.failFrom !== undefined && built.length >= options.failFrom) {
          throw new DOMException('Worker construction is blocked.', 'SecurityError');
        }
        const client = new FakeClient(built.length + 1);
        built.push(client);
        return client as unknown as SimulationClient;
      },
    },
    { onWorkerAvailability: (available) => availability.push(available) },
  );
  return { host, built, availability };
}

describe('WorkerPerSessionHost', () => {
  it('claims a worker per session and shuts the previous session down over the protocol first', async () => {
    const { host, built } = harness();

    await host.startNew(1);
    await host.startNew(2);

    expect(built).toHaveLength(2);
    // The outgoing worker is asked to stop before the incoming one is claimed:
    // `simulation/stopped` is how the renderer's feed and the command sender
    // learn the session ended, and both are registered on the channel for the
    // life of the page.
    expect(built[0]?.kinds()).toEqual(['simulation/initialize', 'simulation/shutdown']);
    expect(built[1]?.kinds()).toEqual(['simulation/initialize']);
  });

  it('refuses to capture when no session has been started', async () => {
    const { host, built } = harness();
    await expect(host.capture()).rejects.toThrow(/No simulation is running/);
    // And it did not take a worker to find that out.
    expect(built).toEqual([]);
  });

  it('does not wait for a wedged worker to acknowledge its own shutdown', async () => {
    vi.useFakeTimers();
    try {
      const { host, built } = harness();
      await host.startNew(1);
      const wedged = built[0];
      expect(wedged).toBeDefined();
      if (wedged !== undefined) wedged.silent = true;

      let settled = false;
      const stopping = host.stop().then(() => {
        settled = true;
      });

      await Promise.resolve();
      expect(settled).toBe(false);

      // The grace, and not the host's 15 s reply timeout: a player whose
      // worker is wedged is best served by getting a new one now.
      await vi.advanceTimersByTimeAsync(1_000);
      await stopping;
      expect(settled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports a worker it could not construct as an ordinary error, and says the page has none', async () => {
    const { host, availability } = harness({ failFrom: 1 });
    await host.startNew(1);

    const failed = host.startFromSnapshot({} as never);
    await expect(failed).rejects.toThrow(
      /The simulation worker for this session could not be started: Worker construction is blocked\./,
    );
    // Never a `SnapshotRestoreRejectedError`: `SessionController` demotes a
    // generation on that one alone, and a browser that will not start a
    // thread says nothing at all about whether the save is good.
    await expect(failed).rejects.not.toBeInstanceOf(SnapshotRestoreRejectedError);
    expect(availability).toEqual([true, false]);
  });

  it('keeps the cause of a refused construction attached', async () => {
    const { host } = harness({ failFrom: 0 });
    await expect(host.startNew(1)).rejects.toMatchObject({ cause: expect.any(DOMException) });
  });

  it('is safe to stop when nothing is running', async () => {
    const { host, built } = harness();
    await expect(host.stop()).resolves.toBeUndefined();
    expect(built).toEqual([]);
  });
});
