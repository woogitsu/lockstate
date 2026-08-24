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
