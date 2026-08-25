import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PROTOCOL_DECODE_ERROR_CODES,
  SIMULATION_PROTOCOL_VERSION,
  workerToMainMessageSchema,
  type ProtocolDecodeErrorCode,
  type WorkerToMainMessage,
} from '../../src/simulation/protocol';
import { SimulationClient } from '../../src/simulation/worker/client';

/**
 * What the main thread does with a worker message it cannot decode (#187
 * finding 3).
 *
 * `SimulationClient` is the only door every worker-to-main message comes
 * through, and the only reader of `decodeWorkerToMainMessage` in `src/`. A
 * message that fails that decode used to reach `console.error` and no
 * listener at all -- so `WorkerSessionHost`'s pending request waited out its
 * 15 s timeout and reported "the worker did not reply", and the HUD was told
 * nothing whatsoever. That is the misleading symptom #103 already records,
 * reached by a second route.
 *
 * The far end of #187 finding 1 makes it worse than a lost diagnostic: if the
 * message that failed to decode is the *fault report* itself, the worker's
 * only statement about what went wrong is the one message the main thread
 * throws away.
 *
 * A real `Worker` is not involved and must not be: what is under test is
 * arithmetic on the main thread, and it has to run under `environment: 'node'`
 * like the rest of `pnpm test`. The class narrows `workerOrUrl instanceof
 * Worker`, so the constructor is exercised for real by stubbing the global the
 * `instanceof` reads.
 */

/** The part of `Worker` that `SimulationClient` touches. */
class FakeWorker {
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: unknown) => void) | null = null;
  public readonly sent: unknown[] = [];
  public terminated = false;

  public postMessage(message: unknown): void {
    this.sent.push(message);
  }

  public terminate(): void {
    this.terminated = true;
  }
}

interface Harness {
  /** Everything a listener registered at construction was handed, in order. */
  readonly received: readonly WorkerToMainMessage[];
  /** Hands the client one inbound message, as the worker would. */
  deliver(data: unknown): void;
}

function harness(): Harness {
  vi.stubGlobal('Worker', FakeWorker);
  const worker = new FakeWorker();
  const client = new SimulationClient(worker as unknown as Worker);
  const received: WorkerToMainMessage[] = [];
  client.addListener((message) => received.push(message));
  return {
    received,
    deliver: (data: unknown) => {
      const handler = worker.onmessage;
      if (handler === null) throw new Error('the client installed no onmessage handler');
      handler(new MessageEvent('message', { data }));
    },
  };
}

interface UndecodableCase {
  readonly code: ProtocolDecodeErrorCode;
  readonly what: string;
  readonly input: unknown;
}

/**
 * One case per classification the decoder can return, in the
 * *worker-to-main* direction.
 *
 * The same four codes as `tests/contract/simulation-worker-entry.test.ts`
 * checks in the other direction, and deliberately the same list rather than a
 * subset: the classification is what the report is worth, and a route that
 * collapsed all four into one would be #184's defect on this side of the
 * boundary.
 */
const UNDECODABLE: readonly UndecodableCase[] = [
  { code: 'invalid-message', what: 'not an envelope at all', input: 'a string' },
  {
    code: 'unsupported-protocol-version',
    what: 'an envelope version this build does not speak',
    input: {
      protocolVersion: SIMULATION_PROTOCOL_VERSION + 1,
      messageId: 'reply-1',
      kind: 'protocol/pong',
      payload: { nonce: 'n' },
    },
  },
  {
    code: 'unknown-message-kind',
    what: 'a kind this build does not know',
    input: {
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'reply-1',
      kind: 'simulation/does-not-exist',
      payload: {},
    },
  },
  {
    code: 'invalid-payload',
    what: 'a known kind whose payload fails its schema',
    input: {
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'reply-1',
      kind: 'protocol/error',
      payload: { code: 'not-a-fault-code', message: 'boom', recoverable: false },
    },
  },
];

describe('a worker message the main thread cannot decode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('has a case for every code the decoder can produce, so a fifth cannot slip in untested', () => {
    expect([...new Set(UNDECODABLE.map((entry) => entry.code))].sort()).toEqual(
      [...PROTOCOL_DECODE_ERROR_CODES].sort(),
    );
  });

  it('still passes a decodable message straight through, so the cases below mean something', () => {
    const { received, deliver } = harness();
    deliver({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'clock-1',
      kind: 'simulation/clock-state',
      payload: { tick: 4, clock: { mode: 'paused' } },
    });
    expect(received.map((message) => message.kind)).toEqual(['simulation/clock-state']);
  });

  it.each(UNDECODABLE.map((entry) => [entry.code, entry] as const))(
    'reaches a listener as a %s fault instead of being swallowed',
    (_code, entry: UndecodableCase) => {
      const { received, deliver } = harness();

      deliver(entry.input);

      expect(
        received.map((message) => message.kind),
        `nothing was reported for ${entry.what}: the only trace is a console line`,
      ).toEqual(['protocol/error']);

      const fault = received[0]!;
      if (fault.kind !== 'protocol/error') return;
      expect(fault.payload.code, 'the decoder\'s classification was collapsed or discarded').toBe(entry.code);
      // What a listener is handed has to be a message the protocol declares,
      // or a reader that switches on `kind` cannot use it and a reader that
      // re-validates it drops it a second time.
      expect(workerToMainMessageSchema.safeParse(fault).success).toBe(true);
    },
  );

  it('does not correlate the fault to a request, because it cannot know which one', () => {
    // `WorkerSessionHost` resolves a pending request on `replyTo` alone. The
    // envelope this fault is *about* never passed its schema, so any `replyTo`
    // read off it is unvalidated input -- and settling the wrong request with
    // it would be worse than the timeout it replaces (ADR 0003 decision 2, and
    // `SimulationWorkerStateMachine.fault`'s own rule for the same case).
    const { received, deliver } = harness();
    deliver({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'reply-1',
      replyTo: 'request-1',
      kind: 'simulation/ready',
      payload: { sessionId: 'session-1', tick: -5, clock: { mode: 'paused' } },
    });
    expect(received).toHaveLength(1);
    expect((received[0] as { replyTo?: string }).replyTo).toBeUndefined();
  });
});
