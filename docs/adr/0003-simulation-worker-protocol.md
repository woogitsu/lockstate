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
every 250 ms. It calls nothing on the kernel.

The clause this sentence used to carry -- "and only when the tick has moved" --
overstated what that check does on this channel. `publishClockState` does return
early when the tick has not moved, but the branch never withholds a message:
while `running`, a tick is at most 50 ms of wall time, so the interval cannot
open with the tick standing still. Instrumented over the tick-loop suite, the
early return was taken 221 times and **not once** with the interval open; the
largest elapsed time on that path was 45 ms against a 250 ms interval (#444
item 4). The interval is the gate; the equality check is belt-and-braces. The
contrast is worth keeping: `publishRenderDelta`'s identical pair of lines *is*
load-bearing, because nothing resets its published-tick fields, so on the first
wake the interval is trivially open and only the tick test stops a delta that
`deltaMessageSchema` refuses. See both docblocks in
`src/simulation/worker/state-machine.ts`.
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
#104). `simulation/delta` was declared in the kind union
(`src/simulation/protocol/types.ts:23`) with a schema (`deltaMessageSchema`,
`:521-524`) but no sender, which is not a route either. (The schema anchor read
`:400`, which is now inside `requestProjectionMessageSchema`'s payload.)

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
validated non-negative integers, plus the `tick` they were read at, the
projection's own `schemaVersion` and -- since the 2026-08-24 amendment
below -- an optional `refusal`. **It has carried a second optional sibling,
`zoning`, since #312, and no amendment here records it**; `zoningNoticeSchema`
and `statusCountsMessageSchema` in `src/simulation/protocol/types.ts` are the
definition, and `docs/adr/STATUS-QUEUE.md` §5 carries the gap as the owner's
call rather than an editor's. Read every sentence below that enumerates this
payload as naming two siblings, not one. It is deliberately not a
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
0.30-1.09 ms to project and 0.03-0.06 ms to structured-clone a 416-418 byte
payload -- the largest form the channel can send, carrying thirteen counts, a
refusal and the longest declared reason -- flat from 250 to 5,000 actors
(`tests/unit/worker-status-counts.test.ts`, reported not asserted).

**Those figures replace a `380-382` that had already stopped being current
before the thirteenth count was written**, and the correction is recorded in
both directions because the paragraph below is about exactly this failure. Run
on the tree as it stood with twelve counts, the same case measured **388-390**,
not 380-382 -- so the "18 bytes of head room" stated four paragraphs down was
10. Nobody had re-run it; the drift is digits in the values, not a field.

That byte figure **replaces** the `342-344` this paragraph used to state, and
it replaces it by re-measurement rather than by re-labelling -- the whole point
of the paragraph that follows. #29's `stateIncomeAccruedTodayMinorUnits` made
the count twelve, so the run above was re-executed and its logged
`payloadJsonBytes` read off, rather than the word "eleven" being edited to
"twelve" and the number left alone.

The `342-344` had itself replaced a `~229`, and that replacement is why this
paragraph exists. The `~229` was taken when the payload carried **ten**
counts; `treasuryMinorUnits` (#96) made it eleven and the sentence above was
updated without the measurement being re-run, so `~229` had already stopped
being a current reading *before* #261 added the refusal. The difference between
any two of these numbers is therefore not attributable to one change and is
not offered as such. The timing is a range over repeated runs on one container
and it is wide -- eight runs of the same case spanned 0.22 ms to 4.18 ms with
the byte figure never moving off 380-382 -- which is exactly why
`docs/BENCHMARKING.md` keeps this evidence reported rather than gated, and why
the byte figure is the half of it worth quoting.

What the test *asserts* is the shape and not any of these numbers -- thirteen
integers of counts, every one of them an integer scalar rather than a list, a
refusal of exactly three scalars, and a serialized payload under 436 bytes -- because the shape is the
property that makes the cadence safe, and the population cannot move it.

**The thirteenth count arrived, and the paragraph that predicted it read:**
*"The 400-byte assertion now has 18 bytes of head room rather than 56: a
thirteenth count with a name as long as the twelfth would breach it, and should
be read as this channel's soft limit making itself felt rather than as an
arbitrary threshold to raise."* It was right that the limit would be felt and
its arithmetic was one re-measurement out of date (see above). What was done
about it, so that the raise is derived and not arbitrary:

- `accommodationCapacity` costs 28 bytes of the largest declared payload, which
  now measures 416-418. The bound moved to **436**, leaving the same 18 bytes
  of head room the 400 was believed to have -- so a *fourteenth* count with a
  name as long as the thirteenth breaches this bound too. The soft limit is
  still felt, one field further along.
- The property the byte bound was standing in for is now asserted directly:
  every value in `counts` must be an integer scalar. A key count cannot see a
  field that stayed one key and became a list, and a size bound can only see
  one once it is long enough; this sees it at length zero, at any population.
  A relaxed bound needs the thing it was proxying for pinned where it cannot be
  relaxed.

That the field was worth 28 bytes at all is the argument for it, not against:
`HudCountsViewModel.prisonerCapacity` was the literal `0` until it existed, so
`occupancyTone`'s over-capacity warning could not fire in any session, and
ADR 0048 decision 2 had just made overcrowding the thing a prison riots over.
It is a *simulation* figure -- the summed resident capacity of the rooms the
session's `AccommodationPolicy` names -- so neither the pull route below nor a
main-thread derivation could have carried it.

It calls nothing on the kernel and advances nothing, which is what keeps
ADR 0009's determinism guarantee intact:
`tests/determinism/status-counts-publication.test.ts` requires sixty ticks
driven through the real worker, publishing as it goes, to end byte-identical
to the same sixty ticks stepped with no worker at all.

No list crosses this channel: the payload is the `counts` block beside at
most one refusal record and at most one zoning notice, every member of all
three a scalar and none of them a list, so `docs/HUD_PROJECTIONS.md` contract 5
has nothing to bound here yet. That sentence is now *executable* rather than
only asserted about the count of keys -- see the shape paragraph below. **That sentence read "twelve integers beside at
most one three-field refusal record" and had been half-false since #312** --
which is the same failure as the "eleven"/`344` this section spends three
paragraphs on, one field further along, so the subject is stated here and the
counting is left to `statusCountsSchema` and to
`tests/unit/worker-status-counts.test.ts`, which asserts the key count and a
ceiling on the serialized size. A projection with rows in it must be paged before
it may be published on a timer, because a per-send cost that grows with the
prison is the failure this cadence was chosen to avoid.

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

## Amendment, 2026-08-24: `simulation/status-counts` also carries the last refusal

Decision 9 says the worker "never reports a command as applied merely because
the message was received", and that is exactly what left a hole. A player
command passes two acceptances: the kernel takes the message and
`handleSubmitCommand` answers `status: 'queued'`, and then, at the command's
tick, a system decides what it *means*. The first acceptance had a wire
message; the second decision had none. So `ConstructionSystem.submitOrder`
could set `state: 'failed'` with `failReason: 'out-of-bounds'` -- reachable by
typing `100, 100` into the Build panel's unbounded coordinate fields -- and
the player saw nothing at all, because a failed order is drawn as no geometry
and the HUD's refusal line answers a *rejected* command rather than a refused
one. `ProcurementSystem.purchase` returned a `PurchaseOutcome` that the
session command handler discarded, and said so in its own comment (#96, #261).
`RoomZoningService.zone` returned a `ZoneRoomOutcome` that reached a bounded
in-worker window and stopped there.

The `payload` therefore gains an optional `refusal`:
`{ sequence, tick, reason }`, where `reason` is a `z.enum` over
`REFUSAL_REASONS` -- namespaced (`build.*`, `purchase.*`) so the two domain
vocabularies behind it cannot collide, and closed so that a reason this build
does not know fails at the decoder rather than reaching the HUD as a row with
no sentence behind it.

### Why this shape, and why not a new message kind

**The channel is a snapshot on a cadence, so what it carries has to be
snapshot-shaped.** A refusal is an event, and this publication is rate-limited
and skipped whenever nothing it reports has changed -- so a *queue* of
refusals could not be carried honestly: a reader could not distinguish a queue
that was drained from one that was never sent, and its length would grow with
the session, which contract 5 of `docs/HUD_PROJECTIONS.md` forbids on a timer.
"The last refusal was X" and "there have been N refusals" are plain readings
of the session at a tick; both survive a publication being late, repeated,
coalesced or dropped. One 1-based `sequence` carries both, and doubles as the
row identity the HUD needs so that republishing an unchanged refusal beside a
changed count updates a row instead of rebuilding it.

The refusal is a **sibling** of `counts`, not a member of it: `counts` is
documented and `.strict()`-pinned as the projection's own block field for
field, and a refusal comes from the session's `RefusalLog` rather than from
`src/simulation/presentation/`.

A refusal is **not** a `simulation/event`, and that is a decision rather than
convenience. `simulation/event` moves an opaque `versionedPayload`, so nothing
about a refusal would be validated at the boundary -- the property this
message's declared fields exist for. And an event stream makes the *reader*
responsible for state: the main thread would have to accumulate what it saw
and decide when to forget it, and a listener attached after an event was sent
would never learn of it. A snapshot needs neither. The moment the simulation
has something to say that genuinely cannot be read as state, that is when
`simulation/event` needs a schema of its own -- which is the wider question of
the routes this protocol still does not have, circled by #157 and not settled
here.

### Cost, and why the cadence still holds

A new refusal opens the interval gate early. That is bounded and stated
plainly: `RefusalLog.last` is a field read, so a wake with no refusal pays
nothing, and the gate can open at most once per refusal because the publication
records the sequence it published. The bound is therefore *one extra projection
per command the simulation refuses* -- bounded by how fast a player can press a
button. What it buys is that the refusal reaches the HUD on the same tick-loop
wake it happened on: waiting up to 500 ms would be a delay felt on the player's
own action, and pausing inside that window stops the tick loop entirely and
would strand the refusal until the clock next ran.

Publication remains a **read**: the log is written from inside the kernel's
command dispatch, and the publication only reads it.
`tests/determinism/status-counts-publication.test.ts` is unchanged and still
requires sixty ticks driven through the real worker to end byte-identical to
sixty ticks stepped with no worker at all.

### Compatibility

The envelope version stays at `1`, and this *is* a change to an existing
kind's payload -- the case the amendment above said would not have the
new-kind property. It is compatible for the narrower reason that section
already gives first: both peers are emitted from one build, so no old peer
exists. And the field is optional, so a peer built before it decodes every
message a peer built after it sends *except* one carrying a refusal, which it
would classify as `invalid-payload` and drop -- a readout that never appears,
not a payload interpreted as something else.

`RefusalLog` is **not** in the session snapshot and a restored session starts
with none. That is deliberate, and not for want of a cheap way to do it: an
optional field on the bundle needs no version bump, which is how `simulation`
and `identity` arrived. It holds a notice about an action the player took
moments ago rather than a condition of the prison, so restoring it means a
loaded prison raising an alert about a wall that failed last week, with
nothing on this channel able to dismiss it. `docs/PERSISTENCE.md` records the
exclusion and `docs/HUD_PROJECTIONS.md` gap 33 lists it alongside the other
counters that do not survive a restore.

## Amendment, 2026-08-25: `simulation/request-projection` and `simulation/projection` are the general route

The amendment above gave the status-strip counts a message. It did not give
the read-model layer a *channel*, and the difference is what issue #104 was
filed about: the clock had a kind of its own and the counts had another, so
the nine remaining projections in `src/simulation/presentation/` were nine
more protocol changes away. Two special cases in place of a pipe. A third and
fourth bespoke kind would have made this protocol grow with the read model
rather than with the boundary.

So the protocol grows **once**, and the catalogue behind it grows instead:

- `simulation/request-projection` (main-to-worker) names a `projectionId` from
  a closed vocabulary — `PROJECTION_IDS` at
  `src/simulation/protocol/types.ts:314-330`, **fifteen** members, one per line
  between the `[` and the `] as const` — with optional `offset`/`limit` and an
  optional `target` (an entity id, or a string id) for the three detail
  projections, which are `hud/prisoner-detail`, `hud/room-detail` and
  `hud/incident-detail`. (**This bullet said "twelve members today".** The
  count is the half that rotted; "three detail projections" beside it was and
  is correct, which is why the three are now named rather than tallied — a
  reader can check a name against the list and cannot check a sum. The
  vocabulary being closed is what makes the drift invisible: adding a member is
  a one-line change in `types.ts` that no gate ties back to this sentence.)
- `simulation/projection` (worker-to-main) answers exactly one of those. It
  carries the id, the tick it was read at, the page window it actually built,
  and the view model.
- `src/simulation/worker/projection-catalog.ts` binds each id to the registries
  of a live `SimulationRuntime` that answer that projection's source shape. It
  is a `Record<ProjectionId, ProjectionCatalogEntry>`, so a member added to the
  vocabulary does not compile until it has a binding.

### Correlated, not published, and why the two publications stay published

This is a **request/response pair** under decision 2, and it is the first
worker-to-main message this ADR has added whose `replyTo` is *required*. The
2026-08-23 amendment states the rule in the other direction — `replyTo` is
optional on exactly those messages the worker may emit unprompted, and absent
from those that are never replies. `simulation/projection` is never anything
but a reply, so it always carries one.

Nothing publishes a projection on a timer, and `simulation/clock-state` and
`simulation/status-counts` are deliberately **not** moved onto this route. The
line is not which projection it is, it is what kind of fact it is: a level the
player is always looking at, that changes on its own, belongs on a cadence —
nobody can ask for a number they are already reading. A list that only an open
panel cares about, in a window only that panel knows, belongs on a pull. The
two publications are the first kind. Everything the catalogue carries is the
second.

That distinction also disposes of three of the four obstacles #157 raised
against the next slice, without deciding any of them:

- **Finding 1, no page-request direction — closed.** `offset` and `limit` are
  on the request, and the reply echoes the window it built beside the true
  `total`, so "the projection honoured the window" is checkable from outside
  the projection. `MAX_PROJECTION_PAGE_LIMIT` (500) is on the schema rather
  than in the handler: without a ceiling, "the UI may choose the window" and
  "the UI may ask for all five thousand rows" are the same request.
- **Finding 2, two accessors unsafe on a timer — does not arise.**
  `ConfiscationLedger` has no windowed accessor and `IncidentLog.all()`
  materialises every incident ever recorded. Both are unsafe to read twice a
  second and neither is read at all until something asks. The catalogue reads
  the ledger through the non-consuming `all()` the projection source already
  requires and never `drain()`s; `tests/determinism/projection-request.test.ts`
  asserts that ten reads report the same ledger. **Who drains, and when,
  remains undecided** — nothing in `src/` or `tests/` calls `drain()` — and a
  pull channel does not force that decision, which is why it is not taken here.
- **Finding 3, `statusCountsEqual` does not generalise — moot on this route.**
  "Publish only what changed" is a property of a cadence. A pull channel sends
  exactly what was asked for, so there is nothing to diff and no revision
  counter is needed. Should a *row* projection ever want a cadence, finding 3's
  argument for a revision counter on the source registry stands untouched.

Finding 4 — no cell-only capacity — is unaffected *by this route*: it was a gap
in the simulation, not in the channel. **It is closed as of the
`accommodationCapacity` change** (see the amendment below): the simulation now
publishes the summed resident capacity of the rooms its `AccommodationPolicy`
names, and `HudCountsViewModel.prisonerCapacity` maps from it instead of
reporting `0`. Both directions are marked because the reasoning still holds —
the fix had to be a *simulation* figure on the cadence channel, and could not
have been the pull route or a main-thread derivation.

Decision 9 is untouched and is worth restating because this route sits next to
it: a `simulation/command-result` of `status: 'queued'` means the message was
**received**, never that it took effect. A projection reply says what the
prison looks like at a tick; it is not an acknowledgement of anything, and it
must not be read as one.

### Why the body is a `versionedPayload` and the counts' body is not

The 2026-08-24 amendment declares every field of `simulation/status-counts` and
argues against `versionedPayload` there: "the message kind already names which
schema the payload follows". That argument does not transfer. **This kind names
a family**, and `projectionId` selects the member — so declaring every field
would mean a second copy of all of `src/simulation/presentation/` written in
Zod, and a copy that drifts is precisely what the `.strict()` there exists to
prevent, reproduced eleven times over.

`versionedPayloadSchema` is the type this protocol already has for an opaque
body carried with its own `schemaId` and `schemaVersion` (decision 5), and its
`jsonValueSchema` still enforces at the boundary the property that actually
matters: finite numbers, no cycles, no class instances, bounded depth — which
is `docs/HUD_PROJECTIONS.md` contract 1's own structured-clone guarantee,
restated where it can be checked. What *is* declared and `.strict()` is the
envelope: the id against a closed enum, the tick, and the page window as three
non-negative integers.

`view` is **absent** — not null, not an error — when a detail projection was
asked about a target that no longer exists. Asking about a prisoner released
between the click and the reply is a race the UI handles.

### Publication is still a read

The handler reads `Kernel.tick` and runs a pure projection over the runtime's
registries. It calls nothing on the kernel, steps nothing, advances no clock
and writes nothing, so no number of requests can change what a tick computes.
`tests/determinism/projection-request.test.ts` requires sixty ticks driven
through the real worker **with every declared projection requested on every
tick-loop wake** to end byte-identical to the same sixty ticks stepped with no
worker at all — which is far more traffic than any panel would generate, and
deliberately so.

Three refusals happen before any projection runs, all `invalid-payload` and
all recoverable, because each rejects a request without touching simulation
state: a page window on a projection with no list, a target of the wrong kind,
and a missing target on a detail projection.

### Compatibility

The envelope version stays at `1`, by the same argument the 2026-08-24
amendment makes for adding a kind rather than changing one: an old peer reads
the `kind` first, does not know it, and classifies it as
`unknown-message-kind`, so the decoder fails closed before dispatch and the
outcome is a readout that never appears rather than a payload interpreted as
something else. Both peers are emitted from one build in any case.

`simulation/delta` was still not adopted and had no sender when this section
was written. It has one since ADR 0040 slice 1 (#414):
`state-machine.ts#publishRenderDelta` posts an unsolicited keyframe of actor
positions on the tick loop, carrying an `array-buffer` body — the first
production use of that transport, and of this kind, since the protocol's first
commit. What that changes for *this* section is nothing: a projection reply is
a **level** read at a tick, not a diff from a base tick, so nothing here needs
`baseTick`, a base-tick contract, or an answer for a receiver that missed the
base — the three things #157 finding 5 says a delta sender would still require
beyond the schema that already exists. Slice 1 needs only the first of the
three, because it publishes keyframes alone; the base-tick contract lands with
the changed-only messages that need it.

### What this does not do

It does not paint anything. No panel calls the requester yet, and the first
consumer is a separate issue — #104 draws that line itself ("Not in scope:
what to *do* with the data"). What is closed is that the read models are no
longer structurally unreachable, and that the next one added cannot quietly
join them: `PROJECTION_CATALOG` refuses to compile without a binding,
`tests/contract/worker-projection-channel.test.ts` drives every declared id
through a real state machine, and
`tests/foundation/projection-reachability-contract.test.ts` reads the exported
projections out of the read-model directory and fails on one that has no route
at all.

## Compatibility strategy

Envelope protocol version 1 is the only accepted version initially. Adding an optional domain field may remain compatible if old peers can ignore it through an explicitly versioned domain payload. Adding or changing an envelope message in a way an old peer cannot safely interpret requires either a compatibility path or an envelope-version increment with fixtures covering both sides.

Message identifiers are correlation and diagnostics identifiers, not simulation time. Wall-clock timestamps are intentionally excluded from the deterministic command contract.

### Implementation note, 2026-08-24: decision 4's handshake has no sender

Decision 4's middle sentence — "a version-1 handshake advertises supported versions and capabilities before initialization" — describes a negotiation that no production code path performs, and has never performed. Every occurrence of `protocol/handshake` or `protocol/handshake-accepted` in `src/` is the receiver, the kind union or the schema: `src/simulation/protocol/types.ts:7`, `:18`, `:206`, `:425`; `src/simulation/protocol/transferables.ts:41`, `:50`; `src/simulation/worker/state-machine.ts:607`, `:637` (`handleHandshake`), `:646`. The only senders in the repository are under `tests/` (`tests/contract/simulation-worker-entry.test.ts:103`, `tests/contract/simulation-worker-protocol.test.ts:59`, `tests/contract/worker-integration.test.ts:51`, `tests/unit/worker-state-machine.test.ts:26`), and `git log -S` over `src/` finds no commit that ever added one there. The main thread's first message to a worker is `simulation/initialize` (`src/persistence/session/worker-session-host.ts:142`), which `handleInitialize` (`state-machine.ts:665`) accepts precisely because the state is still `'uninitialized'` (`:666-668`).

**Every `src/` anchor in the paragraph above was re-measured and eight of the nine had moved**; the finding itself is unchanged, and was re-established rather than assumed. The nine used to read `types.ts:7`, `:17`, `:204`, `:304`; `transferables.ts:30`, `:35`; `state-machine.ts:417`, `:444`, `:453`, and one test anchor was one line out (`simulation-worker-protocol.test.ts:58`). The substance holds exactly: grepping `protocol/handshake` across `src/` still returns four hits in `types.ts`, two in `transferables.ts` and three in `state-machine.ts`, all receivers or declarations, and the only senders are still those four test files. Two of the old anchors are worth naming because of *where* they now land: `state-machine.ts:444` and `:453` sit inside the body of an unsolicited `simulation/status-counts` post — a different message entirely, and one whose comments discuss what ADR 0003 forbids. A reader checking the handshake claim there would have found no handshake handling at all, in a passage that reads as though it were about this ADR, and could reasonably have concluded the paragraph was stale in substance rather than in anchors. That is the cost this sweep is paying down: a drifted anchor that lands on unrelated code is a stale citation, but one that lands on *plausible* code is a false finding waiting to be reported.

Decision 4's third sentence is nevertheless true, by a route that is not the handshake: `protocolVersion: z.literal(SIMULATION_PROTOCOL_VERSION)` (`types.ts:156`) rejects any other envelope version at the decoder, before dispatch. That is why nothing is broken today — there is one envelope version, and the worker's handshake reply advertises no capabilities at all (`state-machine.ts:650`, `capabilities: []`). It is also why this is worth recording: the mechanism designed to detect a version mismatch is one nobody calls, so the day a version 2 exists it will not run.

**Decision 4 is left standing rather than rewritten, because the repair is the owner's choice and not an editor's** (issue #274, Q4; issue #118 item 1): either send the handshake from `WorkerSessionHost` and make `'ready'` a reachable state, or delete `protocol/handshake`, `protocol/handshake-accepted` and `'ready'` and amend decision 4 together with [ADR 0006](./0006-simulation-worker-adapter.md)'s states 1-2. Until one is taken, read decision 4 as the design and this note as what `main` does.

## Runtime validation and failure behavior

Decoders classify malformed envelopes, unsupported versions, unknown kinds and invalid payloads separately. Validation errors are returned as data and do not call simulation code. Protocol errors are bounded structured records; untrusted payload contents are not interpolated into logs or user-facing messages automatically.

Structured-clone payloads reject non-finite numbers, sparse arrays, class instances, accessors, symbol properties, cycles and excessive nesting. Large state should move to a separately versioned binary layout rather than expanding the generic JSON envelope indefinitely.

## Transferable policy

Use structured clone for low-frequency control messages and small versioned domain payloads. Use `ArrayBuffer` only when profiling demonstrates that payload size or clone cost justifies ownership transfer. The declared byte length must equal the actual buffer length before dispatch.

`SharedArrayBuffer` is not approved by this ADR. It would require cross-origin isolation, atomic/concurrency rules and a separate performance case. One of those three has since been delivered and this paragraph should not be read as though it had not: `public/_headers:8-9` sets `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`, and [ADR-0021](./0021-http-response-security-headers.md) records that under them the document reports `crossOriginIsolated === true`. Approval is still withheld — for the atomics/concurrency rules and the performance case, which are what remain.

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
