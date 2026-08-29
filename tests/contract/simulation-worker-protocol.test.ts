import { describe, expect, it } from 'vitest';
import {
  MAIN_TO_WORKER_MESSAGE_KINDS,
  MAX_JSON_VALUE_DEPTH,
  REFUSAL_REASONS,
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
        kind: 'simulation/request-projection',
        payload: {
          projectionId: 'hud/prisoner-roster',
          offset: 20,
          limit: 25,
        },
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
            // Deliberately **not** 158. The total counts every registered
            // instance's resident capacity, including an infirmary's medical
            // beds; this counts only the rooms intake would house somebody in.
            // A fixture that gave both the same figure could not tell a
            // decoder that read the wrong one apart from a correct one.
            accommodationCapacity: 150,
            roomOccupants: 3,
            // Three distinct figures summing to 4, which is this payload's own
            // `prisoners` -- so a decoder reading the wrong one of the three,
            // or deriving any of them from another field, cannot pass. They
            // are the guard-coverage rungs the population is standing on
            // (issue #588).
            prisonersCovered: 1,
            prisonersUnderstaffed: 2,
            prisonersUnguarded: 1,
            activeIncidents: 0,
            // Agrees with `activeIncidents: 0` above -- nothing open, nothing
            // to name (issue #506 finding 2).
            activeIncidentType: undefined,
            contrabandDiscovered: 7,
            treasuryMinorUnits: 24_920,
            // Derived from this payload's own `tick` and `roomOccupants`
            // rather than picked: three occupied places, thirteen ticks of the
            // day served, `floor(300 x 3 x 13 / 2400)` = 4 (#29). A fixture
            // that claimed a rounder figure would be asserting a state no tick
            // in this envelope could produce.
            stateIncomeAccruedTodayMinorUnits: 4,
            // Five guards on this payload's own roster at the catalogue's
            // 80-a-day guard band: 5 x 80 = 400 (ADR 0042 step 3). Chosen to
            // agree with `staff: 5` above rather than picked, for the reason
            // the accommodation comment gives -- a figure unrelated to the rest
            // of the envelope could not tell a decoder reading the wrong field
            // apart from one reading the right one.
            dailyWageBillMinorUnits: 400,
            // A prison paying its way owes nothing, which is the reading every
            // other field in this envelope describes: 24,920 in the treasury
            // and no shortfall anywhere. The non-zero case is measured against
            // a real runtime in tests/unit/economy-payroll.test.ts, not
            // asserted from a hand-written envelope.
            unpaidWagesMinorUnits: 0,
          },
        },
      },
      {
        ...responseEnvelope,
        kind: 'simulation/projection',
        payload: {
          projectionId: 'hud/prisoner-roster',
          tick: 12,
          page: { total: 140, offset: 20, limit: 25 },
          view: structuredPayload,
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
        // A typed event rather than the opaque `versionedPayload` this kind
        // used to carry: issue #507 gave the family its first producers and a
        // closed, discriminated vocabulary in its place, so that a member
        // added to it fails to compile until somebody has decided what it says
        // to a player. See `simulationEventSchema` in `protocol/types.ts`.
        payload: { tick: 12, event: { sequence: 1, tick: 11, type: 'prisoners.discharged', count: 2 } },
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
      // Present for the same reason `treasuryMinorUnits` and
      // `stateIncomeAccruedTodayMinorUnits` below are: without it every payload
      // here is already invalid for a *missing count*, so each refusal would
      // pass while proving nothing about the thing it names. Same figure as the
      // fixture at the top of this file, for the same reason it is that figure
      // there.
      accommodationCapacity: 150,
      roomOccupants: 3,
      activeIncidents: 0,
      activeIncidentType: undefined,
      contrabandDiscovered: 7,
      // Present so each refusal below is refused for the reason it names.
      // Without it every payload here is already invalid for a *missing
      // count*, so the `replyTo` case in particular would have passed while
      // proving nothing about `replyTo` (#96 added this field to the
      // projection and to the fixture at the top of this file, and this local
      // copy was left behind).
      treasuryMinorUnits: 24_920,
      // Present for the same reason `treasuryMinorUnits` is: without it every
      // payload below is already invalid for a *missing count*, so each
      // refusal would pass while proving nothing about the thing it names
      // (#29 added this field to the projection). Same figure as the fixture
      // at the top of this file, for the same reason it is that figure there.
      stateIncomeAccruedTodayMinorUnits: 4,
      // The same reason a fourth and a fifth time, and the reason this local
      // copy exists at all: ADR 0042 step 3 added two counts to the projection,
      // and until they were added here every payload below was invalid for two
      // *missing counts* -- so the `replyTo` case in particular passed while
      // proving nothing about `replyTo`. That is the failure the paragraph
      // above records #96 causing once already, repeated by #29 and repeated
      // again here; the fixture is a copy, so it has to be brought forward by
      // hand each time. Same figures as the fixture at the top of this file.
      dailyWageBillMinorUnits: 400,
      unpaidWagesMinorUnits: 0,
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

  /**
   * The refusal a status-counts publication may carry (#261).
   *
   * A sibling of `counts`, not a member of it: `counts` is the projection's
   * own block field for field, and a refusal comes from the session's
   * `RefusalLog` rather than from `src/simulation/presentation/`. It is
   * optional because "nothing has been refused" is a different fact from "a
   * refusal happened", and everything about it is closed -- a reason outside
   * the declared vocabulary and a `sequence` of zero both fail here rather
   * than reaching the HUD as a row with no sentence behind it.
   */
  it('accepts a status-counts publication carrying a refusal, and closes the vocabulary around it', () => {
    const counts = {
      prisoners: 0,
      prisonersInIntake: 0,
      prisonersHighRisk: 0,
      staff: 0,
      staffUnassigned: 0,
      rooms: 0,
      roomCapacity: 0,
      accommodationCapacity: 0,
      roomOccupants: 0,
      // A prison at tick 0 has nobody in a sector, so no rung holds anybody
      // (issue #588). Zero for the same reason every count above is.
      prisonersCovered: 0,
      prisonersUnderstaffed: 0,
      prisonersUnguarded: 0,
      activeIncidents: 0,
      activeIncidentType: undefined,
      contrabandDiscovered: 0,
      treasuryMinorUnits: 25_000,
      stateIncomeAccruedTodayMinorUnits: 0,
      // A session that has hired nobody: the whole of this fixture is a prison
      // at tick 0 with its opening balance untouched, so both payroll counts
      // (ADR 0042 step 3) are 0 for the same reason every count above is.
      dailyWageBillMinorUnits: 0,
      unpaidWagesMinorUnits: 0,
    };
    const withRefusal = (refusal: unknown): unknown => ({
      ...eventEnvelope,
      kind: 'simulation/status-counts',
      payload: { tick: 12, schemaVersion: 1, counts, refusal },
    });

    const accepted = decodeWorkerToMainMessage(withRefusal({ sequence: 3, tick: 9, reason: 'build.unowned-land' }));
    expect(accepted.ok, accepted.ok ? '' : JSON.stringify(accepted.error)).toBe(true);

    // Absent is valid and is what a session that has refused nothing sends.
    const withoutRefusal = decodeWorkerToMainMessage({
      ...eventEnvelope,
      kind: 'simulation/status-counts',
      payload: { tick: 12, schemaVersion: 1, counts },
    });
    expect(withoutRefusal.ok, withoutRefusal.ok ? '' : JSON.stringify(withoutRefusal.error)).toBe(true);

    // Every declared reason is accepted, so the enum on the wire and the
    // reasons the two systems produce cannot drift apart silently.
    for (const reason of REFUSAL_REASONS) {
      const decoded = decodeWorkerToMainMessage(withRefusal({ sequence: 1, tick: 0, reason }));
      expect(decoded.ok, `${reason} was rejected by the decoder`).toBe(true);
    }

    // A reason nobody declared. This is the case that matters: the mapping
    // that produces one is exhaustive at compile time, so the only way an
    // unknown reason reaches the wire is a build mismatch -- and it must fail
    // closed rather than paint a row whose key resolves to itself.
    expectDecodeErrorCode(decodeWorkerToMainMessage(withRefusal({ sequence: 1, tick: 0, reason: 'build.no-such-reason' })), 'invalid-payload');
    // `sequence` is 1-based because it is the refusal's ordinal *and* the
    // count of refusals so far; zero would mean "the first refusal, of which
    // there have been none".
    expectDecodeErrorCode(decodeWorkerToMainMessage(withRefusal({ sequence: 0, tick: 0, reason: 'build.unowned-land' })), 'invalid-payload');
    expectDecodeErrorCode(decodeWorkerToMainMessage(withRefusal({ sequence: 1, tick: -1, reason: 'build.unowned-land' })), 'invalid-payload');
    // `.strict()`, like every other payload here: an extra field is a build
    // that knows something this one does not, and guessing is worse than
    // dropping the readout.
    expectDecodeErrorCode(
      decodeWorkerToMainMessage(withRefusal({ sequence: 1, tick: 0, reason: 'build.unowned-land', x: 100 })),
      'invalid-payload',
    );
    // And a queue is not what this channel carries -- see `RefusalLog`.
    expectDecodeErrorCode(decodeWorkerToMainMessage(withRefusal([{ sequence: 1, tick: 0, reason: 'build.unowned-land' }])), 'invalid-payload');
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
