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
    // A sequence, a tick, a type from a closed vocabulary and one integer
    // beside it. This used to unwrap an `ArrayBuffer`, because the payload
    // used to be an opaque `versionedPayload`; issue #507 gave the family its
    // first producers and a typed union in its place (`simulationEventSchema`
    // in `./types` says why), and a discriminated union of plain integers has
    // no buffer to transfer at any event count.
    case 'simulation/event':
    case 'simulation/shutdown':
    case 'protocol/handshake-accepted':
    case 'protocol/pong':
    case 'simulation/ready':
    case 'simulation/clock-state':
    // The status-strip `counts` block under structured clone, beside at most
    // one refusal record and at most one zoning notice. Every member is a
    // plain integer and no member is a list, at any population -- which is the
    // property that makes the cadence safe. `statusCountsSchema` in `./types`
    // is what fixes the field set, and `tests/unit/worker-status-counts.test.ts`
    // holds the two facts a number here would only duplicate: the key count of
    // that schema, and a ceiling on the serialized payload. ADR 0003's
    // transferable policy reserves `ArrayBuffer` for payloads profiling shows
    // need ownership transfer, which this is the opposite of.
    //
    // This read "Eleven integers ... 344 bytes" until #444, and both halves had
    // gone false on 2026-08-25: `zoning` joined `refusal` as a sibling of
    // `counts`, and `stateIncomeAccruedTodayMinorUnits` made the counts twelve.
    // ADR 0003 re-measured to 380-382 in the same change and named the failure
    // mode it was avoiding -- "the word 'eleven' being edited to 'twelve' and
    // the number left alone". This is the copy that was left alone, and the
    // repair is to stop keeping a count and a measurement here at all rather
    // than to write fresher ones.
    case 'simulation/status-counts':
    case 'simulation/command-result':
    case 'simulation/stopped':
    case 'protocol/error':
      return [];
    default:
      return assertNever(message);
  }
}
