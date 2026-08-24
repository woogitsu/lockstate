import { describe, expect, it } from 'vitest';
import type { MainToWorkerMessage, WorkerToMainMessage } from '../../src/simulation/protocol/types';
import { SIMULATION_PROTOCOL_VERSION } from '../../src/simulation/protocol/types';
import type { SimulationClient, WorkerMessageHandler } from '../../src/simulation/worker/client';
import { SimulationWorkerChannel } from '../../src/simulation/worker/worker-channel';

/**
 * `SimulationWorkerChannel` owns the page's worker and the rule that makes
 * issue #149 impossible: **a worker that has been handed to a session is never
 * handed to another one.**
 *
 * Every case here is about that rule or about what it costs -- who is
 * terminated, in what order, and what a reader registered once at boot sees
 * across the swap. A real `Worker` is not involved and must not be: the rule
 * is arithmetic on the main thread, and `tests/browser/app-shell.spec.ts`
 * settles the part that needs a browser (that the page really constructs a
 * second one and really repaints from it).
 */

/** The slice of `SimulationClient` the channel touches, with a log. */
class FakeClient {
  public readonly sent: MainToWorkerMessage[] = [];
  public readonly listeners: WorkerMessageHandler[] = [];
  public terminated = false;

  public constructor(public readonly id: number) {}

  public addListener(handler: WorkerMessageHandler): void {
    this.listeners.push(handler);
  }

  public send(message: MainToWorkerMessage): void {
    this.sent.push(message);
  }

  public terminate(): void {
    this.terminated = true;
  }

  /** What the worker on the other side would post. */
  public emit(): void {
    const message = {
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: `from-${this.id}`,
      kind: 'simulation/stopped',
      payload: { tick: this.id, reason: 'shutdown-requested' },
    } as WorkerToMainMessage;
    for (const listener of this.listeners) listener(message);
  }
}

interface Harness {
  readonly channel: SimulationWorkerChannel;
  readonly built: readonly FakeClient[];
  /** Terminations and constructions in the order they happened. */
  readonly events: readonly string[];
}

function harness(options: { readonly failFrom?: number } = {}): Harness {
  const built: FakeClient[] = [];
  const events: string[] = [];
  const channel = new SimulationWorkerChannel(() => {
    if (options.failFrom !== undefined && built.length >= options.failFrom) {
      events.push('construction-refused');
      throw new DOMException('Worker construction is blocked.', 'SecurityError');
    }
    const client = new FakeClient(built.length + 1);
    const terminate = client.terminate.bind(client);
    client.terminate = () => {
      events.push(`terminate-${client.id}`);
      terminate();
    };
    built.push(client);
    events.push(`construct-${client.id}`);
    return client as unknown as SimulationClient;
  });
  return { channel, built, events };
}

describe('SimulationWorkerChannel', () => {
  it('constructs the page worker once, at open', () => {
    const { channel, built } = harness();
    channel.open();
    channel.open();
    expect(built).toHaveLength(1);
    expect(channel.isOpen).toBe(true);
  });

  it('leaves the channel closed when the browser refuses to construct one', () => {
    const { channel } = harness({ failFrom: 0 });
    // Unwrapped, because `src/main.ts` catches exactly this to mount the
    // interface anyway (issue #82).
    expect(() => channel.open()).toThrow(/Worker construction is blocked\./);
    expect(channel.isOpen).toBe(false);
    expect(() => channel.send({} as MainToWorkerMessage)).toThrow(/no simulation worker on this page/);
  });

  it('gives the first session the boot worker rather than throwing it away', () => {
    const { channel, built } = harness();
    channel.open();
    expect(channel.claimForSession()).toBe(built[0]);
    expect(built).toHaveLength(1);
  });

  it('gives every session after the first a worker of its own', () => {
    const { channel, built } = harness();
    channel.open();
    const first = channel.claimForSession();
    const second = channel.claimForSession();
    const third = channel.claimForSession();

    expect(built).toHaveLength(3);
    expect(new Set([first, second, third]).size).toBe(3);
  });

  it('terminates the outgoing worker before constructing its replacement', () => {
    const { channel, events } = harness();
    channel.open();
    channel.claimForSession();
    channel.claimForSession();

    // The order is the decision: one simulation in memory at a time, and a
    // failure to construct leaves the page in the state issue #82's notice
    // describes rather than holding a worker it can never initialize again.
    expect(events).toEqual(['construct-1', 'terminate-1', 'construct-2']);
  });

  it('closes the channel when a later construction fails', () => {
    const { channel, built } = harness({ failFrom: 1 });
    channel.open();
    channel.claimForSession();

    expect(() => channel.claimForSession()).toThrow(/Worker construction is blocked\./);
    expect(channel.isOpen).toBe(false);
    expect(built[0]?.terminated).toBe(true);
    expect(() => channel.send({} as MainToWorkerMessage)).toThrow(/no simulation worker on this page/);
  });

  it('keeps a listener registered at boot attached across every worker', () => {
    const { channel, built } = harness();
    const seen: string[] = [];
    channel.addListener((message) => seen.push(message.messageId));
    channel.open();
    channel.claimForSession();
    built[0]?.emit();

    channel.claimForSession();
    built[1]?.emit();

    // The renderer's feed and the command sender are built once, at boot, and
    // must not have to know a session boundary happened.
    expect(seen).toEqual(['from-1', 'from-2']);
  });

  it('drops a message from a worker that is no longer the current one', () => {
    const { channel, built } = harness();
    const seen: string[] = [];
    channel.addListener((message) => seen.push(message.messageId));
    channel.open();
    channel.claimForSession();
    channel.claimForSession();

    // A real terminated `Worker` posts nothing, but its listener is still
    // registered on the client object, and a message already in flight when
    // the swap happened must not reach readers that have been told the
    // session ended.
    built[0]?.emit();
    built[1]?.emit();
    expect(seen).toEqual(['from-2']);
  });

  it('sends to the current worker and to no other', () => {
    const { channel, built } = harness();
    channel.open();
    channel.claimForSession();
    channel.claimForSession();
    channel.send({ messageId: 'ping' } as MainToWorkerMessage);

    expect(built[0]?.sent).toEqual([]);
    expect(built[1]?.sent).toEqual([{ messageId: 'ping' }]);
  });
});
