# ADR-0003: Versioned simulation worker protocol

- Status: Accepted
- Date: 2026-08-22

## Context

Lockstate's authoritative in-session simulation runs in a Dedicated Web Worker. Phaser, DOM UI, input, audio and interpolation remain on the browser main thread. The boundary must therefore be explicit before gameplay systems can accidentally depend on renderer-owned objects or ad-hoc `postMessage` payloads.

The protocol must support initialization from a new seed or a persisted snapshot, deterministic command ordering, pause and speed control, snapshots, compact deltas, asynchronous domain events, safe shutdown, structured faults and future schema evolution. Messages originate at a trust boundary and must be runtime validated before they can mutate simulation state.

## Decision

Use an explicitly versioned, direction-specific message protocol under `src/simulation/protocol`.

1. Every envelope contains `protocolVersion`, a stable `messageId`, a discriminating `kind` and a strictly validated payload.
2. Correlated worker replies require `replyTo`. Unsolicited deltas and domain events do not pretend to be request responses. A protocol fault may optionally identify the rejected request.
3. Main-to-worker and worker-to-main messages are separate TypeScript unions and separate Zod schemas. Unknown keys, message kinds, versions and invalid cross-field invariants are rejected instead of silently stripped.
4. The initial envelope version is `1`. A version-1 handshake advertises supported versions and capabilities before initialization. Unsupported envelope versions fail without dispatching into the simulation kernel.
5. Domain commands, snapshots, deltas and events carry an independent `schemaId` plus `schemaVersion`. Their evolution does not automatically require an envelope-version change.
6. Initialization explicitly chooses either a new simulation with a `u32` master seed or a versioned snapshot. Saving is represented by a snapshot request and correlated snapshot response.
7. Clock control is semantic: paused, or running at 1x, 2x or 4x. The fixed tick cadence and scheduler implementation remain Issue #5 decisions.
8. Player commands carry a session-local monotonic `sequence` and an `executeAtTick`. Issue #5 must order accepted commands by tick and then sequence, detect duplicates/gaps and persist enough ordering state for deterministic replay.
9. The worker returns either a queued command acknowledgement or a structured rejection. It never reports a command as applied merely because the message was received.
10. Normal control traffic uses structured clone with finite, acyclic, plain JSON-compatible values. Large measured hot-path payloads may use an `ArrayBuffer` with declared content type and byte length.
11. Public protocol message types are deeply readonly. Structured cloning gives the main thread its own projection; an `ArrayBuffer` transfer moves ownership and detaches the sender. The renderer never receives a reference to worker-owned live stores.
12. The worker adapter must remain thin: decode, validate state, dispatch into the headless kernel, validate the response and post it with the explicit transfer list. It must not contain gameplay logic.

## Message families

Main thread to worker:

- handshake and ping;
- initialize from seed or snapshot;
- set paused/running clock state;
- submit an explicitly ordered domain command;
- request a snapshot;
- request shutdown.

Worker to main thread:

- handshake acceptance and pong;
- ready and clock-state acknowledgements;
- queued/rejected command results;
- state deltas, snapshots and domain events;
- stopped acknowledgement;
- structured protocol faults.

The concrete union is the source of truth. This ADR defines the compatibility and ownership rules rather than duplicating every field.

## Amendment, 2026-08-23: `simulation/clock-state` may be unsolicited

`simulation/clock-state` was originally correlated only — the acknowledgement
of a `simulation/set-clock`. That left the advancing tick unobservable except
through a full snapshot request, so the HUD's day counter either stood still
while the simulation ran or had to be extrapolated from wall time on the main
thread, which is a second clock on the wrong side of the boundary.

`replyTo` is therefore **optional** on this message and on this message only.
It keeps decision 2 rather than weakening it: a published clock state carries
no `replyTo`, because an unsolicited message must not present itself as a
request response and must not resolve a pending request that happens to share
an id. The payload is unchanged and identical in both forms, so a reader does
not have to know which prompted it.

The envelope version stays at `1`. Both peers are emitted from one build (the
worker is a Vite worker chunk of the same bundle), so no old peer exists to
misread the new form; a peer that did would reject it as `invalid-payload`
and drop a readout, not corrupt state.

Publication is a **read**: the worker posts `Kernel.tick` and
`FixedStepClock.control` after the tick loop has finished stepping, at most
every 250 ms and only when the tick has moved. It calls nothing on the kernel.
This is what keeps clock control compatible with ADR 0009's determinism
guarantee, and `tests/determinism/clock-transport.test.ts` is the executable
form of that claim.

## Compatibility strategy

Envelope protocol version 1 is the only accepted version initially. Adding an optional domain field may remain compatible if old peers can ignore it through an explicitly versioned domain payload. Adding or changing an envelope message in a way an old peer cannot safely interpret requires either a compatibility path or an envelope-version increment with fixtures covering both sides.

Message identifiers are correlation and diagnostics identifiers, not simulation time. Wall-clock timestamps are intentionally excluded from the deterministic command contract.

## Runtime validation and failure behavior

Decoders classify malformed envelopes, unsupported versions, unknown kinds and invalid payloads separately. Validation errors are returned as data and do not call simulation code. Protocol errors are bounded structured records; untrusted payload contents are not interpolated into logs or user-facing messages automatically.

Structured-clone payloads reject non-finite numbers, sparse arrays, class instances, accessors, symbol properties, cycles and excessive nesting. Large state should move to a separately versioned binary layout rather than expanding the generic JSON envelope indefinitely.

## Transferable policy

Use structured clone for low-frequency control messages and small versioned domain payloads. Use `ArrayBuffer` only when profiling demonstrates that payload size or clone cost justifies ownership transfer. The declared byte length must equal the actual buffer length before dispatch.

`SharedArrayBuffer` is not approved by this ADR. It would require cross-origin isolation, atomic/concurrency rules and a separate performance case.

## Alternatives considered

### Unversioned ad-hoc objects

Rejected. They make compatibility failures ambiguous, weaken runtime validation and encourage renderer/simulation coupling.

### RPC or Comlink dependency

Deferred. RPC ergonomics do not remove the need for deterministic ordering, explicit versions, transfer ownership and structured failures. No dependency is justified before the protocol contract exists.

### Binary-only protocol from the first implementation

Rejected. It adds codec and migration complexity before profiling evidence exists. The selected envelope permits independently versioned binary payloads when needed.

### Main-thread authoritative simulation

Rejected by ADR-0001. It would couple rendering cadence and browser UI work to the authoritative simulation and undermine the scale target.

## Consequences

Positive:

- invalid messages fail before reaching mutable simulation state;
- direction, correlation and ownership are visible in types;
- deterministic command ordering has an explicit wire contract;
- snapshots and deltas can adopt compact buffers without redesigning every message;
- protocol tests run headlessly without Phaser, DOM UI or a real Worker.

Costs:

- every message and domain payload needs a schema and compatibility tests;
- the implementation must maintain message IDs, command sequences and correlation;
- transferred buffers cannot be reused by their sender;
- validation has a measurable cost that must be included in future benchmark scenarios.

## Follow-up boundaries

This ADR does not choose the fixed tick rate, RNG algorithm/state format, scheduler implementation, domain command schemas, snapshot schema, delta encoding or actual Worker lifecycle. Those belong to Issue #5 and later subsystem issues, using this protocol rather than bypassing it.
