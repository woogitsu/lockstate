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

const protocolFaultCodeSchema = z.enum([
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
]);

/**
 * The closed set of reasons the worker may refuse or abandon a request.
 *
 * Exported as a type because `SimulationWorkerStateMachine.fault` used to take
 * `code: string` and cast it into this enum, so a typo'd code compiled, shipped
 * and failed only at runtime -- as an `invalid-payload` rejection of the very
 * message that was reporting the original failure, with the real cause gone
 * (issue #139). The cast is gone; this is what replaced it.
 */
export type ProtocolFaultCode = z.infer<typeof protocolFaultCodeSchema>;

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
