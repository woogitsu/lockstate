import { describe, expect, it } from 'vitest';
import {
  MAIN_TO_WORKER_MESSAGE_KINDS,
  MAX_JSON_VALUE_DEPTH,
  SIMULATION_PROTOCOL_VERSION,
  WORKER_TO_MAIN_MESSAGE_KINDS,
  collectProtocolTransferables,
  decodeMainToWorkerMessage,
  decodeWorkerToMainMessage,
  isJsonValue,
  type MainToWorkerMessage,
  type ProtocolDecodeErrorCode,
  type WorkerToMainMessage,
} from '../../src/simulation/protocol';

const requestEnvelope = {
  protocolVersion: SIMULATION_PROTOCOL_VERSION,
  messageId: 'request-1',
} as const;

const responseEnvelope = {
  protocolVersion: SIMULATION_PROTOCOL_VERSION,
  messageId: 'response-1',
  replyTo: 'request-1',
} as const;

const eventEnvelope = {
  protocolVersion: SIMULATION_PROTOCOL_VERSION,
  messageId: 'event-1',
} as const;

const structuredPayload = {
  schemaId: 'lockstate.test.payload',
  schemaVersion: 1,
  transport: 'structured-clone',
  data: { value: 1 },
} as const;

function expectDecodeErrorCode(
  result:
    | ReturnType<typeof decodeMainToWorkerMessage>
    | ReturnType<typeof decodeWorkerToMainMessage>,
  // The decoder's own type rather than a fourth hand-written copy of the same
  // four codes: a code renamed there is a compile error here.
  expectedCode: ProtocolDecodeErrorCode,
): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.code).toBe(expectedCode);
  }
}

describe('simulation worker protocol', () => {
  it('accepts every version-1 request and response kind', () => {
    const requests: readonly MainToWorkerMessage[] = [
      {
        ...requestEnvelope,
        kind: 'protocol/handshake',
        payload: {
          clientBuildId: 'client-build',
          supportedProtocolVersions: [SIMULATION_PROTOCOL_VERSION],
          capabilities: ['array-buffer'],
        },
      },
      {
        ...requestEnvelope,
        kind: 'protocol/ping',
        payload: { nonce: 'nonce-1' },
      },
      {
        ...requestEnvelope,
        kind: 'simulation/initialize',
        payload: {
          sessionId: 'session-1',
          source: { kind: 'new', masterSeed: 42 },
        },
      },
      {
        ...requestEnvelope,
        kind: 'simulation/set-clock',
        payload: { mode: 'running', speed: 2 },
      },
      {
        ...requestEnvelope,
        kind: 'simulation/submit-command',
        payload: {
          commandId: 'command-1',
          sequence: 0,
          executeAtTick: 12,
          command: structuredPayload,
        },
      },
      {
        ...requestEnvelope,
        kind: 'simulation/request-snapshot',
        payload: { reason: 'autosave' },
      },
      {
        ...requestEnvelope,
        kind: 'simulation/shutdown',
        payload: { reason: 'user-request' },
      },
    ];

    const responses: readonly WorkerToMainMessage[] = [
      {
        ...responseEnvelope,
        kind: 'protocol/handshake-accepted',
        payload: {
          workerBuildId: 'worker-build',
          selectedProtocolVersion: SIMULATION_PROTOCOL_VERSION,
          capabilities: ['array-buffer'],
        },
      },
      {
        ...responseEnvelope,
        kind: 'protocol/pong',
        payload: { nonce: 'nonce-1' },
      },
      {
        ...responseEnvelope,
        kind: 'simulation/ready',
        payload: {
          sessionId: 'session-1',
          tick: 0,
          clock: { mode: 'paused' },
        },
      },
      {
        ...responseEnvelope,
        kind: 'simulation/clock-state',
        payload: {
          tick: 12,
          clock: { mode: 'running', speed: 2 },
        },
      },
      {
        ...responseEnvelope,
        kind: 'simulation/command-result',
        payload: {
          commandId: 'command-1',
          sequence: 0,
          status: 'queued',
          scheduledForTick: 12,
        },
      },
      {
        ...eventEnvelope,
        kind: 'simulation/delta',
        payload: { baseTick: 11, tick: 12, delta: structuredPayload },
      },
      {
        ...eventEnvelope,
        kind: 'simulation/status-counts',
        payload: {
          tick: 12,
          schemaVersion: 1,
          counts: {
            prisoners: 4,
            prisonersInIntake: 1,
            prisonersHighRisk: 2,
            staff: 5,
            staffUnassigned: 1,
            rooms: 6,
            roomCapacity: 158,
            roomOccupants: 3,
            activeIncidents: 0,
            contrabandDiscovered: 7,
            treasuryMinorUnits: 24_920,
          },
        },
      },
      {
        ...responseEnvelope,
        kind: 'simulation/snapshot',
        payload: {
          tick: 12,
          reason: 'autosave',
          snapshot: structuredPayload,
        },
      },
      {
        ...eventEnvelope,
        kind: 'simulation/event',
        payload: { tick: 12, event: structuredPayload },
      },
      {
        ...responseEnvelope,
        kind: 'simulation/stopped',
        payload: { tick: 12, reason: 'shutdown-requested' },
      },
      {
        ...eventEnvelope,
        kind: 'protocol/error',
        payload: {
          code: 'invalid-state',
          message: 'Test fault',
          recoverable: true,
        },
      },
    ];

    expect(requests.map((message) => message.kind)).toEqual(
      MAIN_TO_WORKER_MESSAGE_KINDS,
    );
    expect(responses.map((message) => message.kind)).toEqual(
      WORKER_TO_MAIN_MESSAGE_KINDS,
    );

    for (const request of requests) {
      expect(decodeMainToWorkerMessage(request)).toEqual({
        ok: true,
        value: request,
      });
    }

    for (const response of responses) {
      expect(decodeWorkerToMainMessage(response)).toEqual({
        ok: true,
        value: response,
      });
    }
  });

  it('round-trips a structured-cloned snapshot initialization request', () => {
    const message: MainToWorkerMessage = {
      ...requestEnvelope,
      kind: 'simulation/initialize',
      payload: {
        sessionId: 'session-1',
        source: {
          kind: 'snapshot',
          snapshot: {
            schemaId: 'lockstate.simulation.snapshot',
            schemaVersion: 1,
            transport: 'structured-clone',
            data: {
              prisonId: 'prison-1',
              revision: 3,
            },
          },
        },
      },
    };

    const clonedMessage: unknown = structuredClone(message);
    expect(decodeMainToWorkerMessage(clonedMessage)).toEqual({
      ok: true,
      value: message,
    });
  });

  it('classifies malformed, unsupported and unknown envelopes safely', () => {
    expectDecodeErrorCode(decodeMainToWorkerMessage(null), 'invalid-message');
    expectDecodeErrorCode(
      decodeMainToWorkerMessage({
        ...requestEnvelope,
        protocolVersion: 999,
        kind: 'protocol/ping',
        payload: { nonce: 'test' },
      }),
      'unsupported-protocol-version',
    );
    expectDecodeErrorCode(
      decodeMainToWorkerMessage({
        ...requestEnvelope,
        kind: 'simulation/not-real',
        payload: {},
      }),
      'unknown-message-kind',
    );
  });

  it('rejects a known message kind in the wrong direction', () => {
    expectDecodeErrorCode(
      decodeMainToWorkerMessage({
        ...eventEnvelope,
        kind: 'simulation/delta',
        payload: { baseTick: 1, tick: 2, delta: structuredPayload },
      }),
      'unknown-message-kind',
    );
  });

  it('rejects unknown envelope keys instead of silently stripping them', () => {
    const result = decodeMainToWorkerMessage({
      ...requestEnvelope,
      kind: 'protocol/ping',
      payload: { nonce: 'test' },
      rendererOwnedState: true,
    });

    expectDecodeErrorCode(result, 'invalid-payload');
  });

  it('enforces clock and command-result discriminants', () => {
    expectDecodeErrorCode(
      decodeMainToWorkerMessage({
        ...requestEnvelope,
        kind: 'simulation/set-clock',
        payload: { mode: 'paused', speed: 4 },
      }),
      'invalid-payload',
    );

    expectDecodeErrorCode(
      decodeWorkerToMainMessage({
        ...responseEnvelope,
        kind: 'simulation/command-result',
        payload: {
          commandId: 'command-1',
          sequence: 0,
          status: 'queued',
        },
      }),
      'invalid-payload',
    );
  });

  it('rejects deltas that do not advance beyond their base tick', () => {
    const result = decodeWorkerToMainMessage({
      ...eventEnvelope,
      kind: 'simulation/delta',
      payload: {
        baseTick: 12,
        tick: 12,
        delta: structuredPayload,
      },
    });

    expectDecodeErrorCode(result, 'invalid-payload');
    if (!result.ok) {
      expect(result.error.issues.some((issue) => issue.path === 'payload.tick')).toBe(
        true,
      );
    }
  });

  it('refuses a status-counts publication that presents itself as a reply, or that drops a count', () => {
    const counts = {
      prisoners: 4,
      prisonersInIntake: 1,
      prisonersHighRisk: 2,
      staff: 5,
      staffUnassigned: 1,
      rooms: 6,
      roomCapacity: 158,
      roomOccupants: 3,
      activeIncidents: 0,
      contrabandDiscovered: 7,
    };

    // Nothing ever requests this message, so ADR 0003 decision 2 says it must
    // not carry a `replyTo` -- and its schema has no slot for one at all,
    // rather than an optional one as `simulation/clock-state` does. A
    // fabricated `replyTo` would resolve whichever pending request on the
    // main thread happened to share the id.
    expectDecodeErrorCode(
      decodeWorkerToMainMessage({
        ...responseEnvelope,
        kind: 'simulation/status-counts',
        payload: { tick: 12, schemaVersion: 1, counts },
      }),
      'invalid-payload',
    );

    // The counts block is exhaustive and closed: a projection field that goes
    // missing, and one that is added without being declared here, both fail
    // at the boundary instead of reaching the HUD as `undefined`.
    const { staff: _dropped, ...withoutStaff } = counts;
    expectDecodeErrorCode(
      decodeWorkerToMainMessage({
        ...eventEnvelope,
        kind: 'simulation/status-counts',
        payload: { tick: 12, schemaVersion: 1, counts: withoutStaff },
      }),
      'invalid-payload',
    );
    expectDecodeErrorCode(
      decodeWorkerToMainMessage({
        ...eventEnvelope,
        kind: 'simulation/status-counts',
        payload: { tick: 12, schemaVersion: 1, counts: { ...counts, undeclared: 1 } },
      }),
      'invalid-payload',
    );

    // And a count is a count: no fractions, no negatives.
    expectDecodeErrorCode(
      decodeWorkerToMainMessage({
        ...eventEnvelope,
        kind: 'simulation/status-counts',
        payload: { tick: 12, schemaVersion: 1, counts: { ...counts, prisoners: -1 } },
      }),
      'invalid-payload',
    );
    expectDecodeErrorCode(
      decodeWorkerToMainMessage({
        ...eventEnvelope,
        kind: 'simulation/status-counts',
        payload: { tick: 12, schemaVersion: 1, counts: { ...counts, rooms: 1.5 } },
      }),
      'invalid-payload',
    );
  });

  it('accepts only finite, acyclic plain JSON values', () => {
    expect(isJsonValue({ nested: [1, true, null, 'value'] })).toBe(true);
    expect(isJsonValue({ invalid: Number.POSITIVE_INFINITY })).toBe(false);
    expect(isJsonValue(new Date())).toBe(false);

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(isJsonValue(cyclic)).toBe(false);

    const sparseArray = new Array<unknown>(2);
    sparseArray[1] = 'value';
    expect(isJsonValue(sparseArray)).toBe(false);

    const tooDeep: Record<string, unknown> = {};
    let cursor = tooDeep;
    for (let depth = 0; depth <= MAX_JSON_VALUE_DEPTH; depth += 1) {
      const next: Record<string, unknown> = {};
      cursor.next = next;
      cursor = next;
    }
    expect(isJsonValue(tooDeep)).toBe(false);

    const accessorObject: Record<string, unknown> = {};
    Object.defineProperty(accessorObject, 'dangerous', {
      enumerable: true,
      get(): never {
        throw new Error('JSON validation must not execute accessors');
      },
    });
    expect(isJsonValue(accessorObject)).toBe(false);

    expectDecodeErrorCode(
      decodeMainToWorkerMessage({
        ...requestEnvelope,
        kind: 'simulation/submit-command',
        payload: {
          commandId: 'command-1',
          sequence: 0,
          executeAtTick: 12,
          command: {
            schemaId: 'lockstate.test.command',
            schemaVersion: 1,
            transport: 'structured-clone',
            data: new Date(),
          },
        },
      }),
      'invalid-payload',
    );
  });

  it('does not execute accessors while validating arrays', () => {
    let accessorReads = 0;
    const accessorArray: unknown[] = [];
    accessorArray.length = 1;
    Object.defineProperty(accessorArray, '0', {
      enumerable: true,
      get(): number {
        accessorReads += 1;
        return 1;
      },
    });

    expect(isJsonValue(accessorArray)).toBe(false);
    expect(accessorReads).toBe(0);

    const arrayWithExtraKey: unknown[] = [1];
    Object.defineProperty(arrayWithExtraKey, 'metadata', {
      enumerable: true,
      value: 'not part of JSON array semantics',
    });
    expect(isJsonValue(arrayWithExtraKey)).toBe(false);
  });

  it('converts hostile proxy failures into a safe decode error', () => {
    const hostileEnvelope = new Proxy<Record<string, unknown>>(
      {},
      {
        get(): never {
          throw new Error('untrusted proxy trap');
        },
        ownKeys(): never {
          throw new Error('untrusted proxy trap');
        },
      },
    );

    expect(() => decodeMainToWorkerMessage(hostileEnvelope)).not.toThrow();
    expectDecodeErrorCode(
      decodeMainToWorkerMessage(hostileEnvelope),
      'invalid-message',
    );
  });

  it('validates ArrayBuffer metadata and exposes the exact transferable', () => {
    const buffer = new ArrayBuffer(16);
    const message: WorkerToMainMessage = {
      ...eventEnvelope,
      kind: 'simulation/delta',
      payload: {
        baseTick: 10,
        tick: 11,
        delta: {
          schemaId: 'lockstate.simulation.delta',
          schemaVersion: 1,
          transport: 'array-buffer',
          contentType: 'application/x-lockstate-delta',
          byteLength: buffer.byteLength,
          data: buffer,
        },
      },
    };

    expect(decodeWorkerToMainMessage(message)).toEqual({ ok: true, value: message });
    const transferables = collectProtocolTransferables(message);
    expect(transferables).toEqual([buffer]);

    const cloned: unknown = structuredClone(message, { transfer: transferables });
    expect(buffer.byteLength).toBe(0);
    expect(decodeWorkerToMainMessage(cloned)).toMatchObject({ ok: true });
  });

  it('rejects an ArrayBuffer payload with a mismatched declared length', () => {
    const result = decodeWorkerToMainMessage({
      ...eventEnvelope,
      kind: 'simulation/delta',
      payload: {
        baseTick: 10,
        tick: 11,
        delta: {
          schemaId: 'lockstate.simulation.delta',
          schemaVersion: 1,
          transport: 'array-buffer',
          contentType: 'application/x-lockstate-delta',
          byteLength: 99,
          data: new ArrayBuffer(16),
        },
      },
    });

    expectDecodeErrorCode(result, 'invalid-payload');
    if (!result.ok) {
      expect(
        result.error.issues.some(
          (issue) => issue.path === 'payload.delta.byteLength',
        ),
      ).toBe(true);
    }
  });

  it('returns no transferables for structured-clone control messages', () => {
    const message: MainToWorkerMessage = {
      ...requestEnvelope,
      kind: 'simulation/submit-command',
      payload: {
        commandId: 'command-1',
        sequence: 0,
        executeAtTick: 12,
        command: structuredPayload,
      },
    };

    expect(collectProtocolTransferables(message)).toEqual([]);
  });
});
