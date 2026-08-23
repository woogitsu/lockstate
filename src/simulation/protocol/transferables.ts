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
    case 'protocol/handshake':
    case 'protocol/ping':
    case 'simulation/set-clock':
    case 'simulation/request-snapshot':
    case 'simulation/shutdown':
    case 'protocol/handshake-accepted':
    case 'protocol/pong':
    case 'simulation/ready':
    case 'simulation/clock-state':
    // Ten integers under structured clone. ADR 0003's transferable policy
    // reserves `ArrayBuffer` for payloads profiling shows need ownership
    // transfer, which this is the opposite of.
    case 'simulation/status-counts':
    case 'simulation/command-result':
    case 'simulation/stopped':
    case 'protocol/error':
      return [];
    default:
      return assertNever(message);
  }
}
