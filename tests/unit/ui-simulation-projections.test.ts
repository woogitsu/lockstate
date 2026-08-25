import { describe, expect, it, vi } from 'vitest';
import {
  SIMULATION_PROTOCOL_VERSION,
  type MainToWorkerMessage,
  type WorkerToMainMessage,
} from '../../src/simulation/protocol/types';
import {
  ProjectionRequestError,
  SimulationProjectionRequester,
  type ProjectionMessageChannel,
} from '../../src/ui/simulation-projections';

/**
 * The main thread's half of the projection channel, proven with no worker and
 * no DOM.
 *
 * `simulation-clock.ts` and `simulation-counts.ts` are pure functions over a
 * message, so their tests are one call each. This one holds state -- a map of
 * requests waiting for a reply -- and every property worth asserting is about
 * *which* reply settles *which* request. Those are exactly the properties ADR
 * 0003 decision 2 is about, and the ones that go wrong silently: a request
 * settled by the wrong message resolves with another panel's data, and a
 * request settled by an unsolicited publication resolves with no data at all.
 */

class FakeChannel implements ProjectionMessageChannel {
  public readonly sent: MainToWorkerMessage[] = [];
  private handler: ((message: WorkerToMainMessage) => void) | undefined;
  public throwOnSend: Error | undefined;

  public addListener(handler: (message: WorkerToMainMessage) => void): void {
    this.handler = handler;
  }

  public send(message: MainToWorkerMessage): void {
    if (this.throwOnSend !== undefined) throw this.throwOnSend;
    this.sent.push(message);
  }

  public deliver(message: WorkerToMainMessage): void {
    if (this.handler === undefined) throw new Error('The requester registered no listener.');
    this.handler(message);
  }

  /** The `messageId` of the nth request, for building a correlated reply. */
  public idOf(index: number): string {
    return (this.sent[index] as { messageId: string }).messageId;
  }
}

function requester(channel: FakeChannel, ids: readonly string[] = ['req-1', 'req-2', 'req-3']): SimulationProjectionRequester {
  let next = 0;
  return new SimulationProjectionRequester(channel, {
    generateMessageId: () => ids[next++] ?? `req-${String(next)}`,
    replyTimeoutMs: 1_000,
  });
}

const view = (data: unknown) => ({
  transport: 'structured-clone' as const,
  schemaId: 'lockstate.hud-view-model.prisoner-roster',
  schemaVersion: 1,
  data: data as never,
});

const projectionReply = (replyTo: string, overrides: Record<string, unknown> = {}): WorkerToMainMessage =>
  ({
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: `reply-${replyTo}`,
    replyTo,
    kind: 'simulation/projection',
    payload: {
      projectionId: 'hud/prisoner-roster',
      tick: 42,
      page: { total: 9, offset: 0, limit: 3 },
      view: view({ rows: [{ entityId: 0 }] }),
      ...overrides,
    },
  }) as WorkerToMainMessage;

describe('the main thread asks the worker for a read model', () => {
  it('sends a request naming the projection, and only the fields it was given', async () => {
    const channel = new FakeChannel();
    const client = requester(channel);

    const pending = client.request('hud/prisoner-roster', { offset: 3, limit: 3 });
    expect(channel.sent).toHaveLength(1);
    expect(channel.sent[0]).toEqual({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'req-1',
      kind: 'simulation/request-projection',
      payload: { projectionId: 'hud/prisoner-roster', offset: 3, limit: 3 },
    });

    channel.deliver(projectionReply('req-1'));
    await expect(pending).resolves.toEqual({
      projectionId: 'hud/prisoner-roster',
      tick: 42,
      page: { total: 9, offset: 0, limit: 3 },
      view: { rows: [{ entityId: 0 }] },
    });
  });

  it('omits a window it was not asked to send, rather than sending a zero', async () => {
    // The payload is `.strict()` over optional fields, and the worker
    // distinguishes an absent `limit` (use the projection's default window)
    // from a present `0` (build no rows). A requester that filled in
    // `undefined` would fail the boundary; one that filled in `0` would ask
    // for an empty page.
    const channel = new FakeChannel();
    const client = requester(channel);

    const pending = client.request('hud/status-strip');
    expect(channel.sent[0]).toEqual({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'req-1',
      kind: 'simulation/request-projection',
      payload: { projectionId: 'hud/status-strip' },
    });
    expect(Object.keys((channel.sent[0] as { payload: object }).payload)).toEqual(['projectionId']);

    channel.deliver(projectionReply('req-1', { projectionId: 'hud/status-strip', page: undefined }));
    const reply = await pending;
    expect(reply.page).toBeUndefined();
  });

  it('settles each request with its own reply, whatever order they arrive in', async () => {
    const channel = new FakeChannel();
    const client = requester(channel);

    const first = client.request<{ readonly which: string }>('hud/prisoner-roster', { limit: 1 });
    const second = client.request<{ readonly which: string }>('hud/prisoner-roster', { limit: 2 });

    // Answered out of order on purpose: correlation is by id, not by arrival.
    channel.deliver(projectionReply('req-2', { view: view({ which: 'second' }) }));
    channel.deliver(projectionReply('req-1', { view: view({ which: 'first' }) }));

    expect((await first).view).toEqual({ which: 'first' });
    expect((await second).view).toEqual({ which: 'second' });
  });

  it('is not settled by an unsolicited publication that shares nothing but the boundary', async () => {
    // ADR 0003 decision 2: an unsolicited message must not resolve a pending
    // request. `simulation/status-counts` has no `replyTo` field at all, so the
    // only way it could settle one is a requester that resolved on any
    // message of the right shape.
    const channel = new FakeChannel();
    const client = requester(channel);
    const settled = vi.fn();

    const pending = client.request('hud/status-strip');
    void pending.then(settled, settled);

    channel.deliver({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'publication',
      kind: 'simulation/clock-state',
      payload: { tick: 7, clock: { mode: 'running', speed: 1 } },
    } as WorkerToMainMessage);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();

    channel.deliver(projectionReply('req-1', { projectionId: 'hud/status-strip' }));
    await expect(pending).resolves.toMatchObject({ tick: 42 });
  });

  it('rejects with the fault code when the worker refuses the request', async () => {
    const channel = new FakeChannel();
    const client = requester(channel);

    const pending = client.request('hud/security', { limit: 5 });
    channel.deliver({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'reply',
      replyTo: 'req-1',
      kind: 'protocol/error',
      payload: { code: 'invalid-payload', message: 'Projection "hud/security" has no list to page.', recoverable: true },
    } as WorkerToMainMessage);

    await expect(pending).rejects.toBeInstanceOf(ProjectionRequestError);
    await expect(pending).rejects.toMatchObject({ code: 'invalid-payload' });
  });

  it('rejects when the worker answers about a different projection', async () => {
    // Correlation is by `messageId`, so this cannot happen by two requests
    // crossing. It would mean a mislabelled reply, and resolving it would put
    // one panel's data in another panel.
    const channel = new FakeChannel();
    const client = requester(channel);

    const pending = client.request('hud/prisoner-roster', { limit: 1 });
    channel.deliver(projectionReply('req-1', { projectionId: 'hud/room-list' }));

    await expect(pending).rejects.toThrow(/Asked for "hud\/prisoner-roster".*answered about "hud\/room-list"/);
  });

  it('rejects when no reply arrives, rather than leaving a promise unsettled', async () => {
    vi.useFakeTimers();
    try {
      const channel = new FakeChannel();
      const client = requester(channel);
      const pending = client.request('hud/staff', { limit: 1 });
      // Attach the expectation before advancing, so the rejection is never
      // unhandled.
      const assertion = expect(pending).rejects.toThrow(/did not answer a "hud\/staff" request/);
      vi.advanceTimersByTime(1_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects immediately when the channel cannot send at all', async () => {
    const channel = new FakeChannel();
    channel.throwOnSend = new Error('the worker is gone');
    const client = requester(channel);

    await expect(client.request('hud/status-strip')).rejects.toThrow('the worker is gone');
    // And the failed request is not left in the pending map, so a later reply
    // carrying the same id settles nothing.
    client.dispose();
  });

  it('fails everything still in flight when disposed', async () => {
    const channel = new FakeChannel();
    const client = requester(channel);

    const pending = client.request('hud/incidents', { limit: 1 });
    const assertion = expect(pending).rejects.toThrow('The projection requester was disposed.');
    client.dispose();
    await assertion;
  });

  it('caches nothing: a second request for the same projection is a second message', async () => {
    // Deliberate, and the reason is a boundary rather than a performance
    // choice: a cache here would be a second copy of simulation state on the
    // main thread, which is what `AGENTS.md` boundary 1 forbids.
    const channel = new FakeChannel();
    const client = requester(channel);

    const first = client.request('hud/room-list', { limit: 2 });
    channel.deliver(projectionReply('req-1', { projectionId: 'hud/room-list' }));
    await first;

    const second = client.request('hud/room-list', { limit: 2 });
    expect(channel.sent).toHaveLength(2);
    expect(channel.idOf(1)).not.toBe(channel.idOf(0));
    channel.deliver(projectionReply('req-2', { projectionId: 'hud/room-list' }));
    await second;
  });
});
