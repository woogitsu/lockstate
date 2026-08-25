import { describe, expect, it, vi } from 'vitest';
import {
  PROTOCOL_DECODE_ERROR_CODES,
  SIMULATION_PROTOCOL_VERSION,
  workerToMainMessageSchema,
  type ProtocolDecodeErrorCode,
} from '../../src/simulation/protocol';

/**
 * What the worker entry point does with a message it cannot decode.
 *
 * `src/simulation/worker/worker.ts` is the module `src/main.ts` loads as the
 * real worker, and it was the one file on the fault path with no test at all.
 * It reported every decode failure as `invalid-message`, so the four-way
 * classification ADR 0003 requires -- "Decoders classify malformed envelopes,
 * unsupported versions, unknown kinds and invalid payloads separately" -- was
 * computed by the decoder and discarded one call later.
 *
 * The module installs itself on the worker global at import time, so each case
 * gets a fresh stub and a fresh module instance rather than sharing a state
 * machine that the previous case has already faulted.
 */

/** The part of the worker global the entry module actually uses. */
interface WorkerGlobalStub {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: (message: unknown, transfer?: readonly Transferable[]) => void;
  addEventListener: (type: string, listener: unknown) => void;
}

interface LoadedWorkerEntry {
  /** Everything the entry point has posted back to the main thread, in order. */
  readonly posted: readonly unknown[];
  /** Hands the entry point one inbound message, as the worker global would. */
  deliver(data: unknown): void;
}

async function loadWorkerEntry(): Promise<LoadedWorkerEntry> {
  const posted: unknown[] = [];
  const stub: WorkerGlobalStub = {
    onmessage: null,
    postMessage: (message) => {
      posted.push(message);
    },
    addEventListener: () => {},
  };

  vi.stubGlobal('self', stub);
  vi.resetModules();
  await import('../../src/simulation/worker/worker');

  const handler = stub.onmessage;
  if (handler === null) {
    throw new Error('the worker entry point installed no onmessage handler');
  }

  return {
    posted,
    deliver: (data: unknown) => {
      handler(new MessageEvent('message', { data }));
    },
  };
}

interface MalformedCase {
  readonly code: ProtocolDecodeErrorCode;
  readonly what: string;
  readonly input: unknown;
}

const MALFORMED: readonly MalformedCase[] = [
  {
    code: 'invalid-message',
    what: 'not an envelope at all',
    input: null,
  },
  {
    code: 'unsupported-protocol-version',
    what: 'an envelope version this build does not speak',
    input: {
      protocolVersion: SIMULATION_PROTOCOL_VERSION + 1,
      messageId: 'request-1',
      kind: 'protocol/ping',
      payload: {},
    },
  },
  {
    code: 'unknown-message-kind',
    what: 'a kind this build does not know',
    input: {
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'request-1',
      kind: 'protocol/does-not-exist',
      payload: {},
    },
  },
  {
    code: 'invalid-payload',
    what: 'a known kind whose payload fails its schema',
    input: {
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'request-1',
      kind: 'protocol/handshake',
      payload: {},
    },
  },
];

describe('the worker entry point reports why a message was rejected', () => {
  it('has a case for every code the decoder can produce, so a fifth cannot slip in untested', () => {
    expect([...new Set(MALFORMED.map((entry) => entry.code))].sort()).toEqual(
      [...PROTOCOL_DECODE_ERROR_CODES].sort(),
    );
  });

  it.each(MALFORMED.map((entry) => [entry.code, entry] as const))(
    'answers %s with exactly that fault code',
    async (_code, entry: MalformedCase) => {
      const worker = await loadWorkerEntry();

      worker.deliver(entry.input);

      expect(worker.posted, `one fault and nothing else for ${entry.what}`).toHaveLength(1);

      // The main thread validates every inbound message against this schema
      // before looking at it, so a fault carrying a code outside the enum is
      // discarded there and the real cause is lost. Parsing the posted message
      // with the same schema is what makes that checkable rather than assumed.
      const parsed = workerToMainMessageSchema.safeParse(worker.posted[0]);
      expect(parsed.success, 'the fault the worker posted is not a valid protocol message').toBe(true);
      if (!parsed.success) return;

      const message = parsed.data;
      expect(message.kind).toBe('protocol/error');
      if (message.kind !== 'protocol/error') return;

      expect(message.payload.code).toBe(entry.code);
      expect(message.payload.message).toContain(entry.code);
    },
  );
});

/**
 * What a malformed message costs the *session*, as opposed to what it is
 * called (#187 finding 1).
 *
 * The block above pins the fault code. This one pins the consequence, which
 * is the half the issue says was "deliberately not asserted there, because
 * asserting the current behaviour would pin a default nobody chose".
 *
 * The default is `SimulationWorkerStateMachine.fault`'s: `recoverable` is
 * `false` unless a call site says otherwise, and `false` transitions the
 * worker to `faulted`. `faulted` stops the tick loop and makes
 * `handleSubmitCommand` return without answering, so after one undecodable
 * envelope the prison stops advancing and every later command is dropped in
 * silence -- for a message that, by construction, never reached simulation
 * state at all. `decodeMainToWorkerMessage` returns its verdict as data and
 * calls nothing in the kernel (ADR 0003, "Validation errors are returned as
 * data and do not call simulation code"), so there is nothing half-applied
 * to protect.
 */
describe('a message the worker could not decode does not end the session', () => {
  /** A worker with a live simulation in it, and everything it has posted so far. */
  async function initializedWorker(): Promise<LoadedWorkerEntry> {
    const worker = await loadWorkerEntry();
    worker.deliver({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'initialize-1',
      kind: 'simulation/initialize',
      payload: { sessionId: 'session-1', source: { kind: 'new', masterSeed: 7 } },
    });
    expect(
      worker.posted.map((message) => (message as { kind: string }).kind),
      'the session did not start, so what follows would prove nothing',
    ).toContain('simulation/ready');
    return worker;
  }

  const kindsOf = (worker: LoadedWorkerEntry): readonly string[] =>
    worker.posted.map((message) => (message as { kind: string }).kind);

  it('reports the fault as recoverable, because the message reached no simulation state', async () => {
    const worker = await initializedWorker();

    worker.deliver(null);

    const fault = worker.posted.at(-1) as { kind: string; payload: { code: string; recoverable: boolean } };
    expect(fault.kind).toBe('protocol/error');
    expect(fault.payload.code).toBe('invalid-message');
    expect(
      fault.payload.recoverable,
      'a message that never reached simulation state was reported as an unrecoverable fault',
    ).toBe(true);
  });

  it('still answers a valid command after one undecodable envelope', async () => {
    const worker = await initializedWorker();

    worker.deliver(null);

    const before = worker.posted.length;
    worker.deliver({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'command-1',
      kind: 'simulation/submit-command',
      payload: {
        commandId: 'command-1',
        sequence: 0,
        executeAtTick: 4,
        command: { transport: 'structured-clone', schemaId: 'test', schemaVersion: 1, data: null },
      },
    });

    const answers = worker.posted.slice(before) as readonly { kind: string; replyTo?: string }[];
    expect(
      answers.map((answer) => answer.kind),
      'the worker answered nothing at all -- `handleSubmitCommand` returns silently once the state is `faulted`',
    ).toContain('simulation/command-result');
    expect(answers.find((answer) => answer.kind === 'simulation/command-result')?.replyTo).toBe('command-1');
  });

  it('still takes clock control after one undecodable envelope', async () => {
    const worker = await initializedWorker();

    worker.deliver({ protocolVersion: SIMULATION_PROTOCOL_VERSION, messageId: 'nope', kind: 'not/a/kind', payload: {} });

    const before = worker.posted.length;
    worker.deliver({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'clock-1',
      kind: 'simulation/set-clock',
      payload: { mode: 'running', speed: 1 },
    });

    const answer = worker.posted.slice(before).at(0) as { kind: string; payload: Record<string, unknown> };
    // `handleSetClock` faults with `invalid-state` outside `paused`/`running`,
    // so a faulted worker answers the play button with a second fault: the
    // prison cannot be restarted for the rest of the page's life.
    expect(answer.kind, `the clock request was answered with ${JSON.stringify(answer.payload)}`).toBe(
      'simulation/clock-state',
    );

    expect(kindsOf(worker).filter((kind) => kind === 'protocol/error')).toHaveLength(1);
  });
});
