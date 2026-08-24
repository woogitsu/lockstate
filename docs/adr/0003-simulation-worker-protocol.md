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
- state deltas, snapshots, projection readouts and domain events;
- stopped acknowledgement;
- structured protocol faults.

The concrete union is the source of truth. This ADR defines the compatibility and ownership rules rather than duplicating every field.

## Amendment, 2026-08-23: `simulation/clock-state` may be unsolicited

`simulation/clock-state` was originally correlated only — the acknowledgement
of a `simulation/set-clock`. That left the advancing tick unobservable except
through a full snapshot request, so the HUD's day counter either stood still
while the simulation ran or had to be extrapolated from wall time on the main
thread, which is a second clock on the wrong side of the boundary.

`replyTo` is therefore **optional** on this message. The rule this states is
not "one exception": `replyTo` is optional on exactly those worker-to-main
messages that the worker may emit with no request behind them, and required on
every message that is only ever a reply. Two schemas are built from
`optionallyCorrelatedEnvelopeFields` today: `simulation/clock-state`, and
`protocol/error`, which decision 2 above already places in that set ("a
protocol fault may optionally identify the rejected request"). What this
amendment records is `simulation/clock-state` joining it — not that it is
alone in it. A fault that *was* prompted by a request is free to carry the
`replyTo` its schema already permits.

It keeps decision 2 rather than weakening it: an unsolicited clock state
carries no `replyTo`, because an unsolicited message must not present itself as
a request response and must not resolve a pending request that happens to share
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

## Amendment, 2026-08-24: `simulation/status-counts` publishes a projection

`src/simulation/presentation/` computes the read models the HUD panels are
written against, and until now no worker-to-main message carried any of
them. The projections take live registries and entity stores, so they can
only run inside the worker; with no message for their output the always-
visible status strip painted the literal zeros of `EMPTY_HUD_VIEW_MODEL`
for a whole session, however many prisoners the simulation held (issue
#104). `simulation/delta` was declared in the kind union with no schema and
no sender, which is not a route either.

`simulation/status-counts` is the first message that carries a projection.
It follows the `simulation/clock-state` precedent above rather than
inventing a second pattern, and takes it one step further: this message is
*only ever* a publication, so its envelope has **no `replyTo` field at
all** rather than an optional one, and `.strict()` rejects a correlated
form outright. That is the same rule the amendment above states, applied to
the other case in it -- `replyTo` is optional on exactly those messages the
worker may emit with no request behind them, and absent from those that are
never replies, which is where `simulation/delta` and `simulation/event`
already sit.

The payload is the projection's `counts` block field for field, as
validated non-negative integers, plus the `tick` they were read at and the
projection's own `schemaVersion`. It is deliberately not a
`versionedPayload`: that type exists to move an *opaque* `data` blob, and
here the message kind already names which schema the payload follows, so
declaring every field lets the boundary reject a negative or fractional
count and lets a count added to the projection without being added to the
schema fail at the decoder instead of reaching the HUD as `undefined`.
Decision 5 still holds -- the domain payload carries its own version and can
evolve without an envelope-version change.

Publication is a **read**, on a cadence, and never per tick. The worker
projects at most every 500 ms -- the interval is checked *before* the
projection runs, so a busy prison pays for at most two projections a second
rather than one on each of the ~66 tick-loop wakes -- and posts nothing at
all when none of the counts has changed. The tick stamp is what stops a
readout from being taken for a statement about a later state than the one
it describes. Measured per publication at 300 room instances and 40 guards:
0.23-0.43 ms to project and 0.03-0.05 ms to structured-clone a ~229-byte
payload, flat from 250 to 5,000 actors
(`tests/unit/worker-status-counts.test.ts`, reported not asserted).

It calls nothing on the kernel and advances nothing, which is what keeps
ADR 0009's determinism guarantee intact:
`tests/determinism/status-counts-publication.test.ts` requires sixty ticks
driven through the real worker, publishing as it goes, to end byte-identical
to the same sixty ticks stepped with no worker at all.

No list crosses this channel: the payload is eleven integers, so
`docs/HUD_PROJECTIONS.md` contract 5 has nothing to bound here yet. A
projection with rows in it must be paged before it may be published on a
timer, because a per-send cost that grows with the prison is the failure
this cadence was chosen to avoid.

The envelope version stays at `1`, and the argument for a *new kind* is not
quite the argument the amendment above made for relaxing an existing one.
There, the point was that both peers come from one build, so no old peer
exists to misread the new form. That is still true -- the worker is a Vite
worker chunk of the same bundle -- but it is no longer the whole reason. An
old peer that did somehow receive this message reads its `kind` first, does
not know it, and classifies it as `unknown-message-kind`: the decoder fails
closed before dispatch, so the outcome is a readout that never appears, not
a payload interpreted as something else. That is what this ADR's
compatibility strategy asks for -- an old peer must be unable to interpret
the message *unsafely* -- so adding a kind whose discriminant is the thing
an old peer rejects needs no increment. A change to an *existing* kind's
payload would not have this property, which is why relaxing one took the
reasoning above instead.

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
