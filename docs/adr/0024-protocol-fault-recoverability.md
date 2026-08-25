# ADR 0024: Which protocol faults end a session, and who is told

## Status

**Proposed — pending human approval.** Not accepted.

Issue #187 finding 1 asks for this decision in those words: *"is faulting what
we meant, for a message that provably touched nothing?"* — and says it "needs a
session-lifetime answer, not an implementation tweak". The owner is being asked
to sign off on one sentence:

> **A message that failed to decode never reached simulation state, so it must
> not end the session — but it must be reported to the player, and the two are
> one decision rather than two.**

The code on the branch that proposes this ADR implements it, which the index
notes is permitted and does not make it binding
([`docs/adr/README.md`](./README.md): "A `Proposed` ADR is awaiting the owner's
approval and is not binding, whether or not code already implements it").

If the decision goes the other way, the reversal target is named below and is
one argument: `worker.ts`'s `fault(...)` call drops `{ recoverable: true }` and
[ADR 0006](./0006-simulation-worker-adapter.md) state 5 stands unamended. The
*reporting* half is not part of that reversal, and section 4 says why.

## Context

Lockstate's authoritative simulation runs in a dedicated worker
([ADR 0001](./0001-core-platform.md), [ADR 0006](./0006-simulation-worker-adapter.md)).
Every message crossing that boundary is validated before dispatch
([ADR 0003](./0003-simulation-worker-protocol.md)), and a message that fails
validation is classified — malformed envelope, unsupported version, unknown
kind, invalid payload — and reported as a `protocol/error`.

`SimulationWorkerStateMachine.fault` takes a `recoverable` option that decides
whether the worker also transitions to `faulted`. It defaults to `false`, and
`faulted` is terminal: the tick loop stops, `handleSetClock` answers the play
button with `invalid-state`, and `handleSubmitCommand` returns **without
replying at all**.

Two findings on this one path, both verified against `main` at v0.0.37:

1. **The worker entry point took that default.** `src/simulation/worker/worker.ts`
   called `stateMachine.fault(result.error.code, result.error.message)` with no
   options, so any undecodable message ended the session permanently.
2. **The main thread discarded the report.** `SimulationClient.handleMessage`
   logged an undecodable worker message to `console.error` and notified no
   listener, so nothing on this thread — not `WorkerSessionHost`, not the HUD —
   learned that anything had happened.

Together: one malformed envelope stops the prison, and if the fault report
itself is what fails to decode, the player is shown nothing and a pending
request waits out its 15 s timeout before reporting the wrong cause. That
timeout is the misleading symptom #103 already records.

The closest precedent is #149, closed by #248 in the direction of *one worker
per session* ([ADR 0006](./0006-simulation-worker-adapter.md)'s 2026-08-24
amendment). It changes what a permanent fault costs — a fault can no longer
outlive the load that caused it — but it does not answer this: within one
session, a permanent fault still ends that session, and a session is a player's
prison.

## Decision

### 1. A decode failure is recoverable, and the worker keeps its session

`decodeMainToWorkerMessage` returns its verdict **as data** and calls nothing in
the kernel. [ADR 0003](./0003-simulation-worker-protocol.md) states that
directly under "Runtime validation and failure behavior": *"Validation errors
are returned as data and do not call simulation code."* So a message that failed
to decode is, by construction, a message that reached no simulation state.
There is nothing half-applied to protect and nothing to fail closed against.

That is not true of the other `fault()` call sites, and the contrast is the
argument. `internal-error` after a caught exception may have left a system
part-way through its work; `already-initialized` refuses a request that would
have replaced authoritative state. Those are real faults. A rejected envelope is
a *refused request*, which is the condition
[ADR 0006](./0006-simulation-worker-adapter.md)'s own `rejectedSnapshotFault`
already passes `recoverable: true` for, one module over, for the same reason.

The command ordering invariant does not need the fault either, and this was the
one substantive objection to recovering. If a `simulation/submit-command` is
rejected at the decoder, the main thread's sequence counter has still advanced,
so the next command arrives with a gap — and `Kernel.submitCommand` detects
exactly that and throws `CommandRejectedError('sequence-gap', …)`, which
`handleSubmitCommand` answers as a **rejected command result**. The invariant is
enforced by the kernel that owns it, at the point the gap would matter, and
reported to the sender. Faulting the worker pre-emptively protects nothing the
kernel does not already protect, and costs the session.

### 2. It is recoverable *because* it is reported, not instead of

This is the half that makes the decision defensible rather than merely
convenient, and it is why finding 1 and finding 3 are one decision.

A worker that continues **silently** after an undecodable message is arguably
worse than one that stops loudly. The simulation is authoritative: if a bad
message could leave the worker's state disagreeing with what the player is
shown, divergence is unrecoverable and a loud stop is the safer failure. That
argument is real, and it is answered by fact rather than by preference — the
message reached no state, so there is no divergence to be silent about. But it
is answered *only* while the failure is visible: a build in which one end
quietly drops messages and the other quietly keeps going is a build in which
nobody discovers the peer that is sending garbage.

So recovering is conditional on reporting, and the two ship together. Neither
half may be taken alone: reporting without recovering leaves the session dead
with a nicer message, and recovering without reporting is the silent-continue
this section rejects.

### 3. The main thread reports what it cannot read, as a protocol fault

An undecodable *worker* message is the mirror image and does **not** get the
same answer, because the main thread knows strictly less than the worker does.
The worker can say a rejected message reached no simulation state, because it
holds the state and ran the decoder before dispatch. The main thread cannot say
anything about what the worker did: it does not know what the message said, and
cannot tell an unreadable diagnostic from an unreadable `simulation/ready`.

`SimulationClient` therefore raises the failure as a `protocol/error` of its own,
carrying the decoder's classification, `recoverable: false`, and **no
`replyTo`** — the envelope it is about never passed its schema, so any `replyTo`
on it is unvalidated input, and `WorkerSessionHost` settles pending requests by
`replyTo` alone. Settling the wrong request with a fault is worse than the
timeout it would replace.

It **reports and does not act**: nothing terminates the worker. Ending an
authoritative session on the strength of one message this thread could not parse
is a decision the main thread does not have the information to make, and
[ADR 0006](./0006-simulation-worker-adapter.md) puts the session boundary on a
deliberate claim rather than on an inference.

Restating the failure as a protocol message rather than adding a channel is the
point: every existing reader handles `protocol/error` already, and a bespoke
`onUndecodableMessage` hook would be a second reporting path to keep in step
with the first — which is the shape all three of #103, #139 and #187 are.

### 4. The player-visible route is the one #283 built

A fault reaches the player through `HudViewModel.alerts`, by the route
[#283](https://github.com/matmaxalez/lockstate/pull/283) added for refusals:
`src/ui/simulation-alerts.ts` maps a stable id to a message key, the HUD
resolves the key. No second channel, and no text crosses the worker boundary —
[ADR 0011](./0011-localization-architecture.md) holds unchanged, because what
crosses is a `ProtocolFaultCode` and what leaves the translator is a
`hud.alert.fault.*` key.

**Only an uncorrelated fault is painted.** A fault carrying `replyTo` is already
answered: `WorkerSessionHost` rejects the pending promise and the caller names
the action that failed. A row for it would be the same failure told twice. The
rule follows straight from
[ADR 0003](./0003-simulation-worker-protocol.md) decision 2 — an uncorrelated
fault is exactly the one with no request behind it, and therefore the one with
no reader.

**Severity carries `recoverable`**, which is the one part of the difference a
player can act on: `warning` for a worker that rejected a message it never
applied and is still running the prison, `danger` for a main thread that can no
longer say what the worker is doing.

**Rows are keyed by fault code**, so a peer emitting malformed messages in a
loop updates one row instead of growing the list without bound
(`docs/HUD_PROJECTIONS.md` contract 5). At most twelve fault rows exist in a
session, beside at most one refusal row.

### 5. Determinism is unchanged, and that is asserted rather than argued

Nothing on this path reads a clock, draws a random number or iterates an
unordered collection into simulation state. The fault envelope's `messageId` is
a correlation id ([ADR 0003](./0003-simulation-worker-protocol.md): *"Message
identifiers are correlation and diagnostics identifiers, not simulation time"*),
and the main thread's locally raised fault numbers its ids from a counter rather
than `crypto.randomUUID()`, so no randomness source enters the simulation import
closure that `tests/determinism/ambient-nondeterminism-contract.test.ts` scans.

`tests/determinism/protocol-fault-recovery.test.ts` is the executable form of
the claim: sixty ticks of the standard scenario driven through the **real worker
entry module** while a stream of undecodable messages of every classification
arrives between wakes must end byte-identical to the same sixty ticks with none.

## Consequences

**Positive**

- One malformed message no longer costs the player their session, and the
  worker's state is the state it reports.
- Three faults that reached nobody now reach the player: the worker's decode
  fault, the worker's `internal-error` from inside the tick loop (uncorrelated,
  and previously invisible for the same reason), and the main thread's own
  inability to read a reply.
- The 15 s timeout is no longer the *only* signal on the undecodable-reply path,
  so #103's misleading "the worker did not reply" has one fewer way to happen.

**Negative**

- A worker whose peer is sending malformed messages keeps running, so a broken
  client produces a stream of warnings rather than one hard stop. Bounded by
  the per-code row: the player sees one standing warning, not a growing list.
- The alerts region is folded by default and `hud.css` drops `.hud__corner`
  below 720 px, so a fault is *reported* rather than unmissable, and on a phone
  it is not reported at all. This is not a new limitation and not one this ADR
  settles: it is the same measurement #220 made and the same owner decision
  #283 recorded as `docs/HUD_PROJECTIONS.md` gap 34, now with a second kind of
  row behind it.
- Twelve new message keys exist and not all twelve are reachable today. That is
  deliberate — the table is exhaustive over the fault enum so a code that gains
  an uncorrelated emitter cannot ship as its own raw dotted key.

## Alternatives considered

### Fail closed: keep faulting on any decode failure

Rejected, but it is the coherent alternative and this is what it argues. A
client sending garbage may be a client whose own state is already wrong, and
refusing to continue with a peer you cannot trust is a defensible posture.

It is rejected because the premise does not hold *here*: the peer is not a
separate program. Both ends of this protocol are emitted from one build — the
worker is a Vite worker chunk of the same bundle, which
[ADR 0003](./0003-simulation-worker-protocol.md) relies on twice for its
compatibility argument. A malformed message is therefore a bug in this
repository's own main thread, not evidence of a hostile or divergent peer, and
the proportionate response to a bug in the sender is to reject the message and
say so, not to destroy the receiver's authoritative state.

It is also rejected because the posture was never chosen: it was `fault()`'s
default, taken by omission at one call site, undocumented there, and — until
this change — invisible to the player when it fired. A fail-closed posture that
nobody selected and nobody can observe is not a posture.

**This is the reversal target.** If the owner prefers fail-closed, the change is
`{ recoverable: true }` at `src/simulation/worker/worker.ts`, plus deleting the
tests that assert the session survives. Sections 2 to 4 stay either way.

### Recover for some classifications and not others

Rejected. The tempting split is to recover from `invalid-payload` but fault on
`unsupported-protocol-version`, on the grounds that a version mismatch means the
peers are different builds. It does not survive contact with the reason for
recovering: the classification describes *why* the message was rejected, and
what makes recovery safe is *that* it was rejected — before dispatch, with no
simulation code called. That is equally true of all four codes.

A split would also put a second, quieter rule in the same place: four codes, two
behaviours, decided by a table nobody has a reason to consult. If a version
mismatch ever needs its own handling it needs the handshake
[ADR 0003](./0003-simulation-worker-protocol.md) decision 4 describes and
nobody sends, which is issue #274 Q4's question and not this one.

### Report the fault through a channel of the client's own

Rejected — see decision 3. A `SimulationClient.onDecodeFailure` callback would
be the third reporting path across this boundary, and the defect class this
issue belongs to is *reporting paths that exist and reach nobody*.

### Report a fault on the `.hud__unavailable` band instead of the alerts list

Deferred, not rejected, and deliberately not decided here. That band is
always laid out and survives every breakpoint, which is exactly what the alerts
list does not do — and it currently means one thing: *this page has no
simulation at all* (#82, #220). Whether a recoverable protocol fault deserves
it, and what clears it afterwards, is the product call `docs/HUD_PROJECTIONS.md`
gap 34 is already open on. Answering it inside this change would decide a HUD
question on the back of a worker one.

## Follow-up

- `docs/HUD_PROJECTIONS.md` gap 34 now covers two producers, not one.
- Nothing here dismisses a fault row: it stands until the session ends, for the
  same reason a refusal row does, and dismissal needs the same main-to-worker
  message that gap is already open on.
- [ADR 0006](./0006-simulation-worker-adapter.md) state 5 says `faulted` is
  "reached when an unhandled exception **or protocol decode error** occurs". If
  this ADR is accepted, that clause is what changes; an implementation note at
  that state records the disagreement in the meantime rather than rewriting an
  Accepted ADR on a Proposed one's authority.
