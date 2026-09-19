import type { ZodError, ZodType } from 'zod';
import {
  MAIN_TO_WORKER_MESSAGE_KINDS,
  SIMULATION_PROTOCOL_VERSION,
  WORKER_TO_MAIN_MESSAGE_KINDS,
  mainToWorkerMessageSchema,
  workerToMainMessageSchema,
  type MainToWorkerMessage,
  type ProtocolFaultCode,
  type WorkerToMainMessage,
} from './types';

/**
 * Every code `classifyFailure` can return, and each one is a member of the
 * protocol's own `ProtocolFaultCode`.
 *
 * `satisfies` is what makes that a fact rather than a coincidence. This list
 * was a hand-written string union with no link to the fault enum, so a typo in
 * it compiled -- the same defect issue #139 found in
 * `SimulationWorkerStateMachine.fault`, on the same code path. It matters here
 * because these codes are reported verbatim as protocol faults by
 * `src/simulation/worker/worker.ts`, and a code the fault enum does not
 * contain does not survive the trip: `SimulationClient.handleMessage`
 * (`src/simulation/worker/client.ts:93-107`) decodes every inbound message
 * against `workerToMainMessageSchema`, so a fault whose code the enum does not
 * carry never reaches a listener *as the fault the worker sent*. The
 * diagnostic for a real failure fails its own decode, and the original cause
 * is gone with it.
 *
 * **That sentence used to end "logs to the console and notifies no listener",
 * and the silence it described is history rather than the present flow.** It
 * is named rather than dropped because it is the loss this `satisfies` clause
 * was written against, and because it is still what `console.error` alone
 * would buy. Since #301 the same method builds a `localFault`
 * (`client.ts:140-152`) out of the decoder's `ProtocolDecodeError` and fans it
 * out to every listener as a real, schema-valid `protocol/error` -- one
 * classified by the codes above, uncorrelated (no `replyTo`) and
 * `recoverable: false`. `tests/unit/simulation-worker-client.test.ts` pins
 * that for each of the four codes.
 *
 * **What the delivery does not restore is what the code said.** The listener
 * is told *that* the main thread could not read a message and how the decode
 * failed; the worker's own statement -- the fault code it chose, its message,
 * its `recoverable` -- is still unrecoverable, because the envelope carrying
 * them never passed its schema. So the list below is still the thing keeping
 * a real fault readable, and the fan-out is a floor under the failure rather
 * than a substitute for it.
 *
 * `as const` keeps the literal tuple, so the type below is these four codes
 * and not all twelve fault codes.
 */
export const PROTOCOL_DECODE_ERROR_CODES = [
  'invalid-message',
  'unsupported-protocol-version',
  'unknown-message-kind',
  'invalid-payload',
] as const satisfies readonly ProtocolFaultCode[];

export type ProtocolDecodeErrorCode = (typeof PROTOCOL_DECODE_ERROR_CODES)[number];

export interface ProtocolValidationIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface ProtocolDecodeError {
  readonly code: ProtocolDecodeErrorCode;
  readonly message: string;
  readonly issues: readonly ProtocolValidationIssue[];
}

export type ProtocolDecodeResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ProtocolDecodeError };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const mainToWorkerKinds = new Set<string>(MAIN_TO_WORKER_MESSAGE_KINDS);
const workerToMainKinds = new Set<string>(WORKER_TO_MAIN_MESSAGE_KINDS);

function classifyFailure(
  input: unknown,
  knownKinds: ReadonlySet<string>,
): ProtocolDecodeErrorCode {
  if (!isRecord(input)) {
    return 'invalid-message';
  }

  if (
    typeof input.protocolVersion !== 'number' ||
    !Number.isInteger(input.protocolVersion)
  ) {
    return 'invalid-message';
  }

  if (input.protocolVersion !== SIMULATION_PROTOCOL_VERSION) {
    return 'unsupported-protocol-version';
  }

  if (typeof input.kind !== 'string') {
    return 'invalid-message';
  }

  if (!knownKinds.has(input.kind)) {
    return 'unknown-message-kind';
  }

  return 'invalid-payload';
}

function formatIssues(error: ZodError): readonly ProtocolValidationIssue[] {
  return error.issues.map((issue) => ({
    code: issue.code,
    path:
      issue.path.length === 0
        ? '<root>'
        : issue.path.map((entry) => String(entry)).join('.'),
    message: issue.message,
  }));
}

function decode<T>(
  schema: ZodType<T>,
  input: unknown,
  knownKinds: ReadonlySet<string>,
): ProtocolDecodeResult<T> {
  try {
    const result = schema.safeParse(input);
    if (result.success) {
      return { ok: true, value: result.data };
    }

    const code = classifyFailure(input, knownKinds);
    return {
      ok: false,
      error: {
        code,
        message: `Simulation protocol message rejected: ${code}`,
        issues: formatIssues(result.error),
      },
    };
  } catch {
    return {
      ok: false,
      error: {
        code: 'invalid-message',
        message: 'Simulation protocol message rejected: invalid-message',
        issues: [],
      },
    };
  }
}

export function decodeMainToWorkerMessage(
  input: unknown,
): ProtocolDecodeResult<MainToWorkerMessage> {
  const result = decode(mainToWorkerMessageSchema, input, mainToWorkerKinds);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const value: MainToWorkerMessage = result.value;
  return { ok: true, value };
}

export function decodeWorkerToMainMessage(
  input: unknown,
): ProtocolDecodeResult<WorkerToMainMessage> {
  const result = decode(workerToMainMessageSchema, input, workerToMainKinds);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const value: WorkerToMainMessage = result.value;
  return { ok: true, value };
}
