import { z } from 'zod';
import { isJsonValue, type JsonValue } from '../../shared/json';

export const SIMULATION_PROTOCOL_VERSION = 1 as const;

export const MAIN_TO_WORKER_MESSAGE_KINDS = [
  'protocol/handshake',
  'protocol/ping',
  'simulation/initialize',
  'simulation/set-clock',
  'simulation/submit-command',
  'simulation/request-snapshot',
  'simulation/shutdown',
] as const;

export const WORKER_TO_MAIN_MESSAGE_KINDS = [
  'protocol/handshake-accepted',
  'protocol/pong',
  'simulation/ready',
  'simulation/clock-state',
  'simulation/command-result',
  'simulation/delta',
  'simulation/status-counts',
  'simulation/snapshot',
  'simulation/event',
  'simulation/stopped',
  'protocol/error',
] as const;

export type DeepReadonly<T> =
  T extends string | number | boolean | bigint | symbol | null | undefined
    ? T
    : T extends ArrayBuffer
      ? T
      : T extends readonly (infer Entry)[]
        ? readonly DeepReadonly<Entry>[]
        : T extends object
          ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
          : T;

export const jsonValueSchema = z.custom<JsonValue>(
  (value: unknown): value is JsonValue => isJsonValue(value),
);

export const identifierSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
export const tickSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const sequenceSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const uint32Schema = z.number().int().min(0).max(0xffff_ffff);
export const schemaVersionSchema = z.number().int().positive();
const protocolVersionSchema = z.number().int().positive();
const capabilityListSchema = z.array(identifierSchema).max(64);

const structuredClonePayloadSchema = z
  .object({
    schemaId: identifierSchema,
    schemaVersion: schemaVersionSchema,
    transport: z.literal('structured-clone'),
    data: jsonValueSchema,
  })
  .strict();

const arrayBufferPayloadSchema = z
  .object({
    schemaId: identifierSchema,
    schemaVersion: schemaVersionSchema,
    transport: z.literal('array-buffer'),
    contentType: z.string().min(1).max(128),
    byteLength: z.number().int().min(0),
    data: z.instanceof(ArrayBuffer),
  })
  .strict();

export const versionedPayloadSchema = z
  .discriminatedUnion('transport', [
    structuredClonePayloadSchema,
    arrayBufferPayloadSchema,
  ])
  .superRefine((payload, context) => {
    if (
      payload.transport === 'array-buffer' &&
      payload.byteLength !== payload.data.byteLength
    ) {
      context.addIssue({
        code: 'custom',
        message: 'byteLength must match data.byteLength',
        path: ['byteLength'],
      });
    }
  });

export type VersionedPayload = DeepReadonly<
  z.infer<typeof versionedPayloadSchema>
>;

/**
 * The twelve fault codes, as a runtime tuple.
 *
 * A `const` array with the schema derived from it, rather than the literals
 * living only inside `z.enum([...])`, for the same reason
 * `PROTOCOL_DECODE_ERROR_CODES` in `./decode.ts` is shaped this way: a test
 * cannot enumerate the members of a schema that is not exported, so the
 * vocabulary could not be checked for reachability at all. Two of these twelve
 * are currently emitted by nothing (#187 finding 2), and
 * `tests/foundation/fault-code-reachability-contract.test.ts` is what makes
 * that a checked state rather than something a reader rediscovers.
 *
 * `as const` keeps the literal tuple, so `ProtocolFaultCode` stays these
 * twelve strings and does not widen to `string`.
 */
export const PROTOCOL_FAULT_CODES = [
  'invalid-message',
  'unsupported-protocol-version',
  'unknown-message-kind',
  'invalid-payload',
  'not-initialized',
  'already-initialized',
  'duplicate-message',
  'sequence-gap',
  'invalid-state',
  'snapshot-incompatible',
  'shutting-down',
  'internal-error',
] as const;

const protocolFaultCodeSchema = z.enum(PROTOCOL_FAULT_CODES);

/**
 * The closed set of reasons the worker may refuse or abandon a request.
 *
 * Exported as a type because `SimulationWorkerStateMachine.fault` used to take
 * `code: string` and cast it into this enum, so a typo'd code compiled, shipped
 * and failed only at runtime -- as an `invalid-payload` rejection of the very
 * message that was reporting the original failure, with the real cause gone
 * (issue #139). The cast is gone; this is what replaced it.
 */
export type ProtocolFaultCode = (typeof PROTOCOL_FAULT_CODES)[number];

export const protocolFaultSchema = z
  .object({
    code: protocolFaultCodeSchema,
    message: z.string().min(1).max(2_000),
    recoverable: z.boolean(),
    details: jsonValueSchema.optional(),
  })
  .strict();

export type ProtocolFault = DeepReadonly<z.infer<typeof protocolFaultSchema>>;

const requestEnvelopeFields = {
  protocolVersion: z.literal(SIMULATION_PROTOCOL_VERSION),
  messageId: identifierSchema,
} as const;

const correlatedResponseEnvelopeFields = {
  ...requestEnvelopeFields,
  replyTo: identifierSchema,
} as const;

const optionallyCorrelatedEnvelopeFields = {
  ...requestEnvelopeFields,
  replyTo: identifierSchema.optional(),
} as const;

const speedSchema = z.union([z.literal(1), z.literal(2), z.literal(4)]);

export const clockControlSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('paused') }).strict(),
  z.object({ mode: z.literal('running'), speed: speedSchema }).strict(),
]);

const snapshotReasonSchema = z.enum([
  'manual-save',
  'autosave',
  'consistency-check',
  'shutdown',
]);

const newSimulationSourceSchema = z
  .object({
    kind: z.literal('new'),
    masterSeed: uint32Schema,
  })
  .strict();

const snapshotSimulationSourceSchema = z
  .object({
    kind: z.literal('snapshot'),
    snapshot: versionedPayloadSchema,
  })
  .strict();

const simulationSourceSchema = z.discriminatedUnion('kind', [
  newSimulationSourceSchema,
  snapshotSimulationSourceSchema,
]);

const handshakeMessageSchema = z
  .object({
    ...requestEnvelopeFields,
    kind: z.literal('protocol/handshake'),
    payload: z
      .object({
        clientBuildId: identifierSchema,
        supportedProtocolVersions: z
          .array(protocolVersionSchema)
          .min(1)
          .max(16),
        capabilities: capabilityListSchema,
      })
      .strict(),
  })
  .strict();

const pingMessageSchema = z
  .object({
    ...requestEnvelopeFields,
    kind: z.literal('protocol/ping'),
    payload: z.object({ nonce: identifierSchema }).strict(),
  })
  .strict();

const initializeMessageSchema = z
  .object({
    ...requestEnvelopeFields,
    kind: z.literal('simulation/initialize'),
    payload: z
      .object({
        sessionId: identifierSchema,
        source: simulationSourceSchema,
      })
      .strict(),
  })
  .strict();

const setClockMessageSchema = z
  .object({
    ...requestEnvelopeFields,
    kind: z.literal('simulation/set-clock'),
    payload: clockControlSchema,
  })
  .strict();

const submitCommandMessageSchema = z
  .object({
    ...requestEnvelopeFields,
    kind: z.literal('simulation/submit-command'),
    payload: z
      .object({
        commandId: identifierSchema,
        sequence: sequenceSchema,
        executeAtTick: tickSchema,
        command: versionedPayloadSchema,
      })
      .strict(),
  })
  .strict();

const requestSnapshotMessageSchema = z
  .object({
    ...requestEnvelopeFields,
    kind: z.literal('simulation/request-snapshot'),
    payload: z.object({ reason: snapshotReasonSchema }).strict(),
  })
  .strict();

const shutdownMessageSchema = z
  .object({
    ...requestEnvelopeFields,
    kind: z.literal('simulation/shutdown'),
    payload: z
      .object({
        reason: z.enum([
          'page-unload',
          'restart',
          'fatal-error',
          'user-request',
        ]),
      })
      .strict(),
  })
  .strict();

export const mainToWorkerMessageSchema = z.discriminatedUnion('kind', [
  handshakeMessageSchema,
  pingMessageSchema,
  initializeMessageSchema,
  setClockMessageSchema,
  submitCommandMessageSchema,
  requestSnapshotMessageSchema,
  shutdownMessageSchema,
]);

export type MainToWorkerMessage = DeepReadonly<
  z.infer<typeof mainToWorkerMessageSchema>
>;

const handshakeAcceptedMessageSchema = z
  .object({
    ...correlatedResponseEnvelopeFields,
    kind: z.literal('protocol/handshake-accepted'),
    payload: z
      .object({
        workerBuildId: identifierSchema,
        selectedProtocolVersion: z.literal(SIMULATION_PROTOCOL_VERSION),
        capabilities: capabilityListSchema,
      })
      .strict(),
  })
  .strict();

const pongMessageSchema = z
  .object({
    ...correlatedResponseEnvelopeFields,
    kind: z.literal('protocol/pong'),
    payload: z.object({ nonce: identifierSchema }).strict(),
  })
  .strict();

const readyMessageSchema = z
  .object({
    ...correlatedResponseEnvelopeFields,
    kind: z.literal('simulation/ready'),
    payload: z
      .object({
        sessionId: identifierSchema,
        tick: tickSchema,
        clock: clockControlSchema,
      })
      .strict(),
  })
  .strict();

/**
 * The clock, as the worker sees it.
 *
 * Sent in two situations, which is why `replyTo` is optional here. It is
 * optional on `protocol/error` for the same reason -- a fault need not have
 * been prompted by a request -- and required on every message that is only
 * ever a reply:
 *
 * - **Correlated** (`replyTo` present) -- the acknowledgement of a
 *   `simulation/set-clock`. The main thread asked; this is the answer.
 * - **Unsolicited** (`replyTo` absent) -- the worker publishing that the
 *   tick has moved on while the clock runs. ADR 0003: "Unsolicited deltas
 *   and domain events do not pretend to be request responses", so a
 *   published clock state carries no `replyTo` rather than a fabricated one.
 *
 * Without the second form the main thread can only learn the tick by asking
 * for a full session bundle, so the HUD's day counter either stands still
 * or is guessed from wall time on the wrong side of the boundary. The
 * payload is identical in both cases: whoever reads it does not need to
 * care which prompted it.
 */
const clockStateMessageSchema = z
  .object({
    ...optionallyCorrelatedEnvelopeFields,
    kind: z.literal('simulation/clock-state'),
    payload: z
      .object({
        tick: tickSchema,
        clock: clockControlSchema,
      })
      .strict(),
  })
  .strict();

const queuedCommandResultSchema = z
  .object({
    commandId: identifierSchema,
    sequence: sequenceSchema,
    status: z.literal('queued'),
    scheduledForTick: tickSchema,
  })
  .strict();

const rejectedCommandResultSchema = z
  .object({
    commandId: identifierSchema,
    sequence: sequenceSchema,
    status: z.literal('rejected'),
    fault: protocolFaultSchema,
  })
  .strict();

const commandResultMessageSchema = z
  .object({
    ...correlatedResponseEnvelopeFields,
    kind: z.literal('simulation/command-result'),
    payload: z.discriminatedUnion('status', [
      queuedCommandResultSchema,
      rejectedCommandResultSchema,
    ]),
  })
  .strict();

const deltaMessageSchema = z
  .object({
    ...requestEnvelopeFields,
    kind: z.literal('simulation/delta'),
    payload: z
      .object({
        baseTick: tickSchema,
        tick: tickSchema,
        delta: versionedPayloadSchema,
      })
      .strict()
      .superRefine((payload, context) => {
        if (payload.tick <= payload.baseTick) {
          context.addIssue({
            code: 'custom',
            message: 'tick must be greater than baseTick',
            path: ['tick'],
          });
        }
      }),
  })
  .strict();

const countSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

/**
 * The `counts` block of the status-strip projection
 * (`src/simulation/presentation/status-strip-projection.ts`), field for
 * field.
 *
 * Every field is a non-negative integer, and that is the whole payload.
 * The projection also computes a clock position and the active regime
 * blocks; neither is carried here (see `simulation/status-counts` below for
 * why).
 *
 * `.strict()` means the two definitions cannot drift apart quietly: a count
 * added to the projection and not added here is rejected by the main
 * thread's decoder as `invalid-payload`, which
 * `tests/unit/worker-status-counts.test.ts` turns into a failing test rather
 * than a HUD that stops updating.
 */
export const statusCountsSchema = z
  .object({
    prisoners: countSchema,
    prisonersInIntake: countSchema,
    prisonersHighRisk: countSchema,
    staff: countSchema,
    staffUnassigned: countSchema,
    rooms: countSchema,
    roomCapacity: countSchema,
    roomOccupants: countSchema,
    activeIncidents: countSchema,
    contrabandDiscovered: countSchema,
    /**
     * The treasury balance, in the minor units `Treasury` holds it in (#96).
     *
     * A count rather than a `BoundedValue`: it has no maximum to be a share
     * of. `countSchema`'s floor of 0 is the treasury's own invariant, not an
     * assumption made here -- `Treasury.spend` refuses rather than
     * overdrawing, so a negative balance is unreachable, and a schema that
     * admitted one would be describing a state the simulation cannot be in.
     *
     * **`HUD_VIEW_MODEL_SCHEMA_VERSION` is deliberately not bumped for this**,
     * and the reason is a limitation of that constant rather than a judgement
     * that the change is small. One number covers *every* projection in
     * `src/simulation/presentation/` -- the status strip, security, staff and
     * contraband all stamp the same value -- so raising it because the status
     * strip gained a field would assert that the other three changed too.
     *
     * Nothing reads it as a compatibility gate today: the worker and the main
     * thread are one build, and no projection is ever stored, so there is no
     * artifact that a version could disambiguate. If one is ever stored, the
     * constant needs splitting per projection before it can carry that weight,
     * and that is the change to make then rather than a bump now that would
     * be wrong about three of the four.
     */
    treasuryMinorUnits: countSchema,
  })
  .strict();

export type SimulationStatusCounts = DeepReadonly<
  z.infer<typeof statusCountsSchema>
>;

/**
 * The status-strip counts, as the worker sees them.
 *
 * **Always unsolicited.** Nothing requests it, so it has no `replyTo` field
 * at all rather than an optional one -- `.strict()` therefore rejects a
 * correlated form outright. That is the stronger half of ADR 0003 decision
 * 2 ("Unsolicited deltas and domain events do not pretend to be request
 * responses"): `simulation/clock-state` needs `replyTo` to be *optional*
 * because it is also the acknowledgement of a `simulation/set-clock`, while
 * this message, like `simulation/delta` and `simulation/event`, is only ever
 * a publication. A fabricated `replyTo` would resolve whichever pending
 * request on the main thread happened to share that id.
 *
 * `tick` is the tick the counts were read at, so a readout can never be
 * mistaken for a statement about a later state than the one it describes.
 *
 * `schemaVersion` is the projection's own
 * `HUD_VIEW_MODEL_SCHEMA_VERSION`, carried so the view-model shape can
 * evolve without an envelope-version change (ADR 0003 decision 5). There is
 * no `schemaId` beside it, unlike `versionedPayloadSchema`: that type exists
 * to describe an *opaque* `data` blob, and here the message kind already
 * names which schema the payload follows and every field of it is validated
 * above.
 */
const statusCountsMessageSchema = z
  .object({
    ...requestEnvelopeFields,
    kind: z.literal('simulation/status-counts'),
    payload: z
      .object({
        tick: tickSchema,
        schemaVersion: schemaVersionSchema,
        counts: statusCountsSchema,
      })
      .strict(),
  })
  .strict();

const snapshotMessageSchema = z
  .object({
    ...correlatedResponseEnvelopeFields,
    kind: z.literal('simulation/snapshot'),
    payload: z
      .object({
        tick: tickSchema,
        reason: snapshotReasonSchema,
        snapshot: versionedPayloadSchema,
      })
      .strict(),
  })
  .strict();

const eventMessageSchema = z
  .object({
    ...requestEnvelopeFields,
    kind: z.literal('simulation/event'),
    payload: z
      .object({
        tick: tickSchema,
        event: versionedPayloadSchema,
      })
      .strict(),
  })
  .strict();

const stoppedMessageSchema = z
  .object({
    ...correlatedResponseEnvelopeFields,
    kind: z.literal('simulation/stopped'),
    payload: z
      .object({
        tick: tickSchema,
        reason: z.enum(['shutdown-requested', 'fatal-error']),
      })
      .strict(),
  })
  .strict();

const errorMessageSchema = z
  .object({
    ...optionallyCorrelatedEnvelopeFields,
    kind: z.literal('protocol/error'),
    payload: protocolFaultSchema,
  })
  .strict();

export const workerToMainMessageSchema = z.discriminatedUnion('kind', [
  handshakeAcceptedMessageSchema,
  pongMessageSchema,
  readyMessageSchema,
  clockStateMessageSchema,
  commandResultMessageSchema,
  deltaMessageSchema,
  statusCountsMessageSchema,
  snapshotMessageSchema,
  eventMessageSchema,
  stoppedMessageSchema,
  errorMessageSchema,
]);

export type WorkerToMainMessage = DeepReadonly<
  z.infer<typeof workerToMainMessageSchema>
>;

export type SimulationProtocolMessage =
  | MainToWorkerMessage
  | WorkerToMainMessage;
