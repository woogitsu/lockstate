import type {
  SimulationProtocolMessage,
  VersionedPayload,
} from './types';

function collectPayloadBuffer(payload: VersionedPayload): ArrayBuffer[] {
  return payload.transport === 'array-buffer' ? [payload.data] : [];
}

function assertNever(value: never): never {
  throw new Error(`Unhandled simulation protocol message: ${String(value)}`);
}

export function collectProtocolTransferables(
  message: SimulationProtocolMessage,
): ArrayBuffer[] {
  switch (message.kind) {
    case 'simulation/initialize':
      return message.payload.source.kind === 'snapshot'
        ? collectPayloadBuffer(message.payload.source.snapshot)
        : [];
    case 'simulation/submit-command':
      return collectPayloadBuffer(message.payload.command);
    case 'simulation/delta':
      return collectPayloadBuffer(message.payload.delta);
    case 'simulation/snapshot':
      return collectPayloadBuffer(message.payload.snapshot);
    case 'simulation/event':
      return collectPayloadBuffer(message.payload.event);
    // A projection reply carries an optional `versionedPayload`, so it may in
    // principle be an `ArrayBuffer` -- the same treatment `simulation/delta`
    // and `simulation/snapshot` get. Nothing in the *projection catalogue*
    // builds one: every entry there posts `transport: 'structured-clone'`,
    // which `collectPayloadBuffer` correctly reports as nothing to transfer.
    // That is no longer true of the protocol as a whole --
    // `state-machine.ts#publishRenderDelta` posts an `array-buffer` body on
    // `simulation/delta` (ADR 0040 slice 1, #414), which is this function's
    // first production caller.
    case 'simulation/projection':
      return message.payload.view === undefined ? [] : collectPayloadBuffer(message.payload.view);
    case 'protocol/handshake':
    case 'protocol/ping':
    case 'simulation/set-clock':
    case 'simulation/request-snapshot':
    // A projection id, at most two integers and at most one target. There is
    // no buffer here to transfer, and ADR 0003's transferable policy reserves
    // ownership transfer for payloads profiling shows need it.
    case 'simulation/request-projection':
    case 'simulation/shutdown':
    case 'protocol/handshake-accepted':
    case 'protocol/pong':
    case 'simulation/ready':
    case 'simulation/clock-state':
    // Eleven integers, and at most one three-field refusal record, under
    // structured clone -- 344 bytes of JSON at the largest, measured at 5,000
    // actors (`tests/unit/worker-status-counts.test.ts`). ADR 0003's
    // transferable policy reserves `ArrayBuffer` for payloads profiling shows
    // need ownership transfer, which this is the opposite of.
    case 'simulation/status-counts':
    case 'simulation/command-result':
    case 'simulation/stopped':
    case 'protocol/error':
      return [];
    default:
      return assertNever(message);
  }
}
