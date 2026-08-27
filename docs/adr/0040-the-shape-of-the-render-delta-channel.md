# ADR 0040: The shape of the render delta channel

## Status

**Accepted, 2026-08-26 — by the owner's explicit delegation. The owner did not
read this document.** Asked about this decision the owner answered, in Polish,
that they did not follow it and told the agent to handle it — *"nie czaję? ogarnij
to"* — and, of the accessibility decision alongside it, *"nie możesz sam tego
porobić?"* ("can't you do this yourself?"). **That is a real approval of the
judgement delegated and not of the text.** What was delegated is narrow and is
worth stating: the owner approved *that someone decide and act*, not this option
over the alternatives below. The argument in this document is the whole of the
warrant, and **a reader who disagrees with it should treat the decision as open**
rather than as settled by someone who weighed it — the same standing ADRs 0034,
0035, 0036 and 0037 carry, for the same reason.

**The number was assigned centrally** after this draft returned, per
`AGENTS.md`. The draft pre-committed to renumbering and that commitment stands:
if another branch holds this number, this document moves without argument.

**On the numbering, since this document was drafted without one.** `AGENTS.md`
assigns ADR numbers centrally after drafts return, and `docs/AGENT_WORKFLOW.md`
asks a draft to carry a placeholder and pre-commit to renumbering. This one did,
and the commitment stands. **It was not a theoretical precaution**: two agents
took 0034 within an hour in an earlier session, and 0038 was taken twice in this
one — the keyboard-route document drafted itself as 0038 on a correct enumeration
of open pull requests while 0038 had already gone to *"What makes a save
compatible"* from another unpushed worktree, and renumbered to 0039. A number is
not held until something is pushed.

> *This paragraph replaced one that still called `0040` "a placeholder … not
> defended" after the number had been assigned, and cited two line numbers that
> had since moved. It was left behind by the mechanical `NNNN` → `0040` pass that
> landed this document, and contradicted the paragraph directly above it.*

**Where the approval must be visible.** This decision does **not** go in as an
amendment to [ADR 0003](./0003-simulation-worker-protocol.md), even though 0003
governs the message surface it uses. `tests/foundation/adr-numbering-contract.test.ts`
reads one `# ADR 0040:` heading and one status keyword per file (`ADR_HEADING`,
`statusKeyword`) and reconciles it with the index table; an amendment appended to
an Accepted ADR inherits that file's `Accepted` and is invisible to every gate in
the repository — so an unapproved decision would read as approved by inspection.
[`STATUS-QUEUE.md`](./STATUS-QUEUE.md) **§2** says this in its own words — *"an amendment
inside an accepted ADR is invisible to every mechanical gate there is; this row is
the only thing that says it exists"* — and the 2026-08-26 amendment to ADR 0007
took the other route, an amendment plus a queue row. That route works; a numbered
document is preferred here because this is a new decision rather than a correction
to an existing one, and because §2's own history (*"empty, one entry, empty again,
one, two, one, and now empty for the third time"*, with two of four accepted
decisions never appearing there) is the argument for not making a decision legible
only to a reader of the queue. This document therefore needs, in the commit that
lands it: a row in `docs/adr/README.md`, a bump of that file's *next free number*,
and an entry in `docs/adr/STATUS-QUEUE.md` §2 — which §2's stated rule requires of
"any commit that adds an outstanding ADR". ADR 0003 gets **one paragraph of factual
correction** and no decision — the sentence at
`docs/adr/0003-simulation-worker-protocol.md:408-412` ("`simulation/delta` is
still not adopted and still has no sender") becomes false the day a sender lands.

---

## The decision, in one sentence

**Publish actor state to the renderer as an unsolicited `simulation/delta` on a
worker-side wall-clock cadence, carrying a versioned `array-buffer`
`versionedPayload` of fixed-width per-actor records — periodic full keyframes with
changed-only messages in between — using the message kind, the envelope, the
transferable transport and the transfer-list plumbing the protocol already has,
and adding no new message kind, no envelope field and no envelope-version bump.**

---

## What the code does today

**The renderer is fed by a borrowed save request.**
`src/rendering/feed/simulation-snapshot-feed.ts:181-186` sends
`simulation/request-snapshot` with `reason: 'consistency-check'` — the persistence
path's own message. `:62` sets the cadence to 2 s, gated at `:171` so it fires only
while the clock runs or after a command. `:193-245` throws away the previous frame
and rebuilds `world`, `structures` and `actors` from the returned session bundle.
The header at `:16-25` calls itself a placeholder for exactly this channel.

**The whole cost is boundary validation, not rendering.**
`src/simulation/worker/client.ts:94` decodes every inbound message;
`src/simulation/protocol/decode.ts:110` runs the union schema; the snapshot's body
is `jsonValueSchema` (`src/simulation/protocol/types.ts:59-66`, `:41-43`), which is
`isJsonValue` (`src/shared/json.ts:95-104`) recursing with an
`Object.getOwnPropertyDescriptor` per array element (`:52`) and per object key
(`:77`). Measured on a built prison (64 loaded chunks, 5,000 prisoners): 41.3 ms
for `isJsonValue` against 1.35 ms for `WorldRenderView.fromSnapshot`, 0.20 ms for
`actorsFromSnapshot` and 0.000 ms for `structuresFromConstruction` — **97% of the
main-thread poll is the deep walk.** At 16 chunks / 500 prisoners: 7.93 ms against
0.78 ms. These bracket #414's 10.4 / 31.0 ms and confirm its scaling claim, while
correcting its attribution: the RLE decode and repaint scale with **chunk count**,
not with population.

**`simulation/delta` is fully specified and unsent.** `types.ts:17-30` has the
kind; `:521-541` is `deltaMessageSchema`, built from `requestEnvelopeFields` so it
carries **no `replyTo`** — the "never a reply" publication form ADR 0003's
2026-08-24 amendment prescribes — with a `superRefine` enforcing `tick > baseTick`;
`:996` puts it in the decode union; `src/simulation/protocol/transferables.ts:24-25`
already unwraps an `ArrayBuffer` body from it.
`tests/foundation/message-kind-reachability-contract.test.ts:152-153` records that
nothing sends one.

**The `array-buffer` transport has existed since the protocol's first commit and
has never been used.** `types.ts:68-92`. `git log -S "transport: 'array-buffer'"
-- src` returns no commit; the only construction site in the repository is
`tests/contract/simulation-worker-protocol.test.ts:611-637`, which builds a
`simulation/delta` with an `ArrayBuffer`, decodes it, and asserts the sender's
buffer is detached by the transfer.

**The simulation has no motion to publish, and this is the premise #414 needs
corrected.** `src/simulation/prisoners/components.ts:151-157`: *"Movement here is
abstracted: an entity's position updates only on arrival at a resolved route's
destination."* `src/simulation/prisoners/action-system.ts:279-284` teleports the
prisoner onto the destination anchor tile in one tick, saying so in its own
comment; `src/simulation/security/patrol-system.ts:131-134` cites the same
convention for guards; `action-system.ts:248` discards the route's waypoints
immediately. `src/rendering/phaser/actor-layer.ts:125-130` draws at the frame's
coordinate with no interpolation. **An actor's authoritative position changes
twice per errand.** A channel at any cadence therefore delivers *fresher* teleports,
not walking. The renderer's half is finished and proven —
`src/rendering/feed/demo-actor-feed.ts:119-124` produces fractional positions and
real motion vectors and `ActorLayer` draws them — so what is missing is simulation
state, not transport.

**Guards do not need this channel at all.**
`src/simulation/runtime/session-systems.ts:216-219` already carries
`guards.records` with `tileX`/`tileY` in every bundle;
`src/rendering/feed/actors-from-snapshot.ts:49-52` states that it deliberately does
not decode them. That is a renderer-side omission with a fix in one file.

---

## Options, with their real costs

### Option 1 — leave the poll, and take `isJsonValue` off the render path only

Trust the worker's own payload: skip `jsonValueSchema` for `simulation/snapshot`
when the sender is our own worker, or decode the body lazily.

- **Cost:** the smallest change here, and it captures **97% of the measured
  main-thread win** (41.3 → ~1.4 ms at 5,000/64 chunks).
- **What it does not buy:** nothing about motion, nothing about guards, and the
  cadence stays 2 s — the poll still makes the worker capture a full session bundle
  (measured 2.75 ms at 5,000/64 chunks) and still ships 545 KB of JSON to move
  three fields per actor. Cost still scales with population; it just scales more
  cheaply.
- **The real objection:** it weakens a boundary rule by exemption rather than by
  design. ADR 0003's runtime-validation section makes the deep walk a property of
  the *envelope type*, and an exemption keyed on "we trust this sender" is a
  sentence in a comment that the next kind will quietly inherit.

### Option 2 — publish a full-population keyframe every cadence, as an `array-buffer` `simulation/delta`

One fixed-width record per live actor, every message, no diff state anywhere.

- **Cost, measured:** boundary decode **0.008–0.013 ms and flat in n** (0.0132 ms
  at 500, 0.0082 ms at 5,000 — noise), because `arrayBufferPayloadSchema`
  validates `z.instanceof(ArrayBuffer)` and a `byteLength` cross-check and never
  looks inside. Payload 80,016 bytes at 5,000 actors against 126,823 as JSON rows (both re-measured against the built encoder; this line said 60,000 and 118,891)
  and 544,869 for today's bundle. Worker-side build is one walk of the SoA prefix
  (`actorsFromSnapshot` measures that walk at 0.196 ms for 5,000).
- **New concepts:** none. Message kind, envelope, schema, transfer-list case and
  a passing contract test all exist.
- **Fails one acceptance criterion literally:** per-update payload and the
  renderer's own read still scale with population, even though *validation* no
  longer does.

### Option 3 — keyframes plus changed-only deltas over the same message (recommended)

Option 2's layout, plus: the worker keeps a mirror of the positions it last
published, emits only records whose position changed, and emits a full keyframe
periodically and on the first wake after `simulation/ready`.

- **Cost:** per-update main-thread cost becomes O(changed) for sprite writes and
  O(1) for validation. Given §"what the code does today", a prison's changed set
  per 100 ms is a handful of arrivals, so the ordinary message is a few dozen
  bytes. The keyframe's O(population) cost is paid once per keyframe interval.
- **New concepts:** two, and they are the price. (a) A worker-side **publication
  mirror** — 5,000 × 2 × Int32 = 40 KB — that is presentation cadence state, not
  simulation state, and must be excluded from the session snapshot for the same
  reason `RefusalLog` is (ADR 0003, 2026-08-24 amendment, "Compatibility"). (b) A
  **base-tick contract**, which is the thing #157 finding 5 says a delta sender
  needs beyond the schema. It is one rule: *a receiver whose last applied tick is
  not the message's `baseTick` discards the message and waits for the next
  keyframe.*
- **The drop question, answered explicitly** — see "Behaviour when the main thread
  misses a delta" below.

### Option 4 — structured-clone rows over `simulation/delta`

- **Rejected on measurement.** 0.389 ms at 500 and 2.517 ms at 5,000 to decode —
  linear, and 300× the buffer form at 5,000 — because it re-enters
  `jsonValueSchema`. It carries the problem forward in a smaller box.

### Option 5 — a new message kind, e.g. `simulation/render-frame`

- **Rejected.** `simulation/delta` already has the exact envelope this needs
  (publication, no `replyTo`, `baseTick`/`tick`, opaque versioned body,
  transfer-list case). A new kind would be the third bespoke kind ADR 0003's
  2026-08-25 amendment says the protocol must stop growing.

### Option 6 — pull `world/render-snapshot` on the existing projection channel

- **Rejected as a fix, though it should eventually be reached.**
  `src/simulation/presentation/world-projection.ts:27-45` carries chunk terrain RLE
  and **no actors at all**; every catalogue entry posts
  `transport: 'structured-clone'` (`src/simulation/worker/projection-catalog.ts:439`),
  so it pays the same deep walk; and a pull is the wrong direction for a level the
  player is always looking at — ADR 0003's 2026-08-25 amendment draws that line
  itself.

---

## Recommendation, and why

**Option 3, delivered as Option 2 first.** Three reasons, in order of weight.

1. **It needs no new concept at the protocol layer, and that is measured rather
   than asserted.** I built a `simulation/delta` with an `array-buffer` body and
   ran it through the real `workerToMainMessageSchema`: it decodes, and
   `collectProtocolTransferables` returns exactly one transferable. The correct
   fix was written on 2026-08-22 and never applied — the third time this repository
   has found the answer one module over.
2. **It removes the population term structurally rather than by exemption.**
   Option 1's win is nearly as large today, but it buys it by declaring a payload
   trusted. Option 3 buys it because `arrayBufferPayloadSchema` validates an
   envelope and a byte length, which is a property of the type, inherited by
   every future user of it, and already covered by a passing contract test.
3. **It is the shape the channel will still want when the simulation gains
   locomotion.** The layout is versioned by the payload's own `schemaVersion`
   (ADR 0003 decision 5), so adding a motion vector and a facing ordinal is a
   layout bump with no protocol change and no envelope change.

**And the recommendation includes stopping short of two of #414's criteria, on
purpose.** "Actors move continuously" is not reachable from here: the simulation
teleports on arrival by design and by documented scope. Inventing motion on the
main thread by differencing publications is precisely what
`src/rendering/feed/actors-from-snapshot.ts:36-41` already refuses, and it would be
a renderer-side movement model — `AGENTS.md` boundary 1. **That needs its own
decision about simulation-side locomotion, and this ADR does not take it.**
"Guards are rendered" is reachable *without* this channel and should be landed
separately so it is not held hostage to it.

### The payload layout

`schemaId: 'lockstate.render-actors'`, `schemaVersion: 1`,
`contentType: 'application/x-lockstate-render-actors'`. Little-endian, header then
records then removals:

| Words | Meaning |
| --- | --- |
| `u32[0]` | layout version (`1`) |
| `u32[1]` | flags; bit 0 set = keyframe (the record list is the complete live set) |
| `u32[2]` | `recordCount` |
| `u32[3]` | `removedCount` |
| then `recordCount` × 4 words | `u32` entity id, `u32` packed fields (population kind, reserved), `i32` tileX, `i32` tileY |
| then `removedCount` × 1 word | `u32` entity id no longer live |

Sixteen bytes per actor; **80,016 bytes** for a 5,000-actor keyframe, and 8,016
at 500 — the sixteen-byte header plus sixteen bytes a record, both from the table
above, measured against the built encoder.

> **Amended 2026-08-26, after slice 1 was built. This paragraph contradicted its
> own table.** It read *"Sixteen bytes per actor; 60,004 bytes for a 5,000-actor
> keyframe (measured 60,000 for the record body)"*, and §"Options" carried the
> same 60,000. Neither number can be produced by the table beside them: 60,000 ÷
> 5,000 is **twelve** bytes a record — three words, not four — and the extra
> **4** implies a **one**-word header where the table specifies four. The prose
> was computed against a layout the table does not describe. Built to the table,
> which is what shipped because dropping a word means dropping the packed-fields
> word the guards slice needs, a 5,000-actor keyframe is 80,016 bytes.
>
> **The argument is unaffected and that is worth stating plainly**: 80,016 against
> the 596,659-byte session bundle it replaces on the render path is still the
> order-of-magnitude claim this decision rests on, and still smaller than the
> 126,823 bytes the same actors cost as JSON rows.
>
> Two further corrections from the same build, both in the decision's favour:
> the `array-buffer` boundary decode measures **0.0049 ms at 500 actors and
> 0.0051 ms at 5,000** — flat, as claimed, but roughly twice as cheap as the
> 0.008–0.013 ms band stated above; and the *"skipped entirely when nothing
> changed"* rule is best defined as **a tick comparison**, not the value
> comparison `STATUS_COUNTS_PUBLISH_INTERVAL_MS` uses. No actor position can
> change without a kernel step, so an unmoved tick *is* nothing changed — and it
> is a correctness requirement rather than an optimisation, because
> `deltaMessageSchema` refuses `tick <= baseTick` and `baseTick` is the previous
> publication's tick, so publishing twice at one tick posts a message the main
> thread's own decoder throws away. Note where that skip actually fires: on the
> **first wakes after play**, because the tick loop wakes every 15 ms while the
> clock steps every 50 ms. It does *not* fire on a paused prison, because pausing
> stops the tick loop and the publication is never reached. A test written on the
> paused assumption guards nothing, and one was.
>
> **One statement in the migration path is wrong in a way that matters to slice
> 3.** It says the receiver written in slice 1 "keeps working" when the diff
> lands. It must not: a slice-1 receiver applying a changed-only record list as
> the complete live set would delete every actor that merely did not move. The
> shipped receiver refuses a non-keyframe and says so. Slice 3 **extends** the
> receiver — the base-tick rule and the keyframe/diff branch — rather than
> leaving it untouched.
>
> **Open question 3 is answered by construction**: with keyframe-only messages,
> removals are strictly redundant, because the keyframe *is* the live set and an
> id absent from it is dropped. The four words stay reserved; the question
> reopens at slice 3.
>
> Nothing in the **decision** changed under construction — options, cadence,
> transport, envelope, seam, and the refusal to invent motion all held. **This
> amendment moves no `Status` line, so no mechanical gate in this repository can
> see it**; that is the trap `docs/adr/STATUS-QUEUE.md` names, and this note is
> the only thing that records it.

`packEntityId` returns `>>> 0`
(`src/simulation/entity/entity-store.ts:66-67`), so an id is exactly one `u32`.
Tile coordinates are plain `i32` because that is exactly what the simulation holds
(`components.ts:160-161`); nothing is invented, which is the rule
`actors-from-snapshot.ts:30-47` already sets for this data.

### Cadence

A ceiling of **100 ms**, checked before the diff runs, in
`SimulationWorkerStateMachine.onTickLoop` beside the two publications already there
(`src/simulation/worker/state-machine.ts:238-256`), and **skipped entirely when
nothing changed** — the `STATUS_COUNTS_PUBLISH_INTERVAL_MS` pattern
(`:70-72`), a ceiling and not a rate. A keyframe at most every 2 s and on the first
wake after `simulation/ready`.

### Behaviour when the main thread misses a delta

Required by #414 and by #157 finding 5, so it is stated as a rule rather than
implied:

- Every message carries `tick` (the tick the positions were read at) and
  `baseTick` (the tick of this session's previous publication). The existing
  `superRefine` already enforces `tick > baseTick`, and it is why a keyframe cannot
  be expressed at tick 0 — which is fine, because a tick-0 session is exactly the
  case the `simulation/ready` snapshot already covers.
- The receiver holds `lastAppliedTick`. A **keyframe** is applied unconditionally.
  A **diff** whose `baseTick !== lastAppliedTick` is **discarded whole**; the
  previous frame stands and the next keyframe repairs it, so staleness is bounded
  by one keyframe interval and never by the session.
- A **coalesced or reordered** message is the same case: `tick <= lastAppliedTick`
  is discarded.
- A **detached buffer** cannot be replayed — the transfer moved it — which is why
  the receiver must decide from the header alone and copy nothing it does not
  apply.
- **Save/restore:** the mirror is worker-side presentation state, is not in
  `SessionSnapshotBundle`, and a restored session's first publication is a
  keyframe. A restore therefore cannot produce a diff against a base the receiver
  never held.

### Determinism

The publication is a **read**, on the `publishStatusCounts` model: it reads
`Kernel.tick` and the position SoA after the tick loop has finished stepping,
calls nothing on the kernel, steps nothing and writes nothing except its own
mirror. The mirror is not simulation state and nothing in the kernel may read it.
The executable form is the one this repository already uses twice: sixty ticks
driven through the real worker **with the channel publishing on every wake** must
end byte-identical to sixty ticks stepped with no worker at all
(`tests/determinism/status-counts-publication.test.ts`,
`tests/determinism/projection-request.test.ts` are the templates). A second test
must assert that no main-thread module can cause a publication — the channel takes
no request, so there is no feedback path to close.

---

## Migration path — no flag day

Four slices, each shippable and green on its own. The full-snapshot poll is
retired by having less and less asked of it, never by being switched off.

**Slice 1 — the transport, actors only.** Worker publishes keyframe-only
`simulation/delta` (Option 2) at the 100 ms ceiling.
`SimulationSnapshotFeed.handleMessage` gains a `case 'simulation/delta'` that
replaces `frame.actors` and leaves `world` and `structures` untouched; the existing
`revision` counter is documented as geometry-only
(`src/rendering/feed/render-feed.ts:29-34`) and does not move for an actor-only
update, so `TileLayer` does not repaint. The snapshot poll's interval relaxes from
2 s to 30 s and becomes a consistency net rather than the data path. Delete the
`UNSENT_WORKER_TO_MAIN_KINDS['simulation/delta']` entry in
`tests/foundation/message-kind-reachability-contract.test.ts:152-153` — that gate
is written to fail when a sender appears, so this is a required step and not an
afterthought. **This is the first slice**, and it alone delivers the two
criteria that are actually reachable: validation off the hot path and a
population-independent boundary cost.

**Slice 2 — guards.** Decode `simulation.security.guards.records` in
`actors-from-snapshot.ts` and emit them in the delta with a population-kind
ordinal. Independent of slice 1 and could land before it.

**Slice 3 — the diff and the mirror** (Option 3). Keyframes stay; changed-only
messages appear between them. Nothing on the wire changes shape — the flags word
was there from slice 1 — so the receiver written in slice 1 keeps working and the
base-tick rule is the only new receiver logic.

**Slice 4 — geometry, and the poll's retirement.** Carry chunk geometry
incrementally (the `geometryRevision`/`contentRevision` counters
`world-projection.ts:7-15` already exposes are the natural key). Only then does
`SimulationSnapshotFeed` stop polling for renders at all, and
`simulation/request-snapshot` returns to being the persistence path's message
alone.

---

## What would change my mind

- **Motion arriving in the simulation first.** If a locomotion decision lands
  before this one and gives actors a continuous position and a heading, the
  changed set becomes *every moving actor every tick* and Option 3's diff stops
  paying for itself against Option 2's flat keyframe. The layout is the same
  either way; the diff machinery would be the part to drop.
- **A geometry measurement I have not taken.** My claim that the renderer's own
  decode is negligible holds up to 64 loaded chunks (1.35 ms). At ≥256 chunks
  `WorldRenderView.fromSnapshot` could pass ~5 ms, which would pull slice 4 into
  slice 1 and change the payload from "actors" to "actors and geometry" from the
  start.
- **A real `postMessage` measurement contradicting the `structuredClone` proxy.**
  I measured the validation half in-process. If a browser measurement showed the
  60 KB transfer itself dominating, the argument for a keyframe cadence weakens and
  Option 3 becomes mandatory rather than recommended.
- **A decision that the boundary must inspect every worker→main payload.** The
  whole recommendation rests on `array-buffer` being an *opaque* body, priced by
  ADR 0003 decision 10. If that policy tightens, Option 1 becomes the honest
  answer and this document should be withdrawn rather than patched.

---

## Consequences if this stands

- `docs/RENDERING.md:128-142` — the paragraph beginning *"ADR-0003 publishes
  snapshots, deltas and events... only the correlated snapshot path is
  implemented"* and the one calling the feed a placeholder both become false and
  must be rewritten, not annotated.
- `docs/RENDERING.md:188-197` — *"Real motion is what a render delta channel would
  publish"* must be corrected in the same pass: the channel is not what is missing
  for motion, simulation-side locomotion is.
- `docs/adr/0003-simulation-worker-protocol.md:408-412` loses its "still no sender"
  sentence.
- `docs/HUD_PROJECTIONS.md` gains the cadence and the paging note: this channel
  carries a **bounded-width record list**, so contract 5's objection to unbounded
  lists on a timer is answered by the record width and the keyframe interval rather
  than by `offset`/`limit`.
- `src/simulation/protocol/transferables.ts:30-36`'s comment — *"Nothing builds one
  today: every catalog entry posts `transport: 'structured-clone'`"* — stays true
  of the projection catalogue and becomes false of the protocol as a whole; it
  needs one clause.
- The `array-buffer` transport acquires its first production user, four days and
  121 releases after it was written.

## Open questions

1. **Who decides simulation-side locomotion, and is it one decision or two?**
   Prisoners and guards teleport by two different code paths with the same stated
   convention. Whatever answers it inherits this channel's layout as its output
   format, so the layout should be reviewed by whoever takes it.
2. **Should the keyframe interval be time-based or change-based?** A prison in
   which nothing moves publishes nothing under the skip rule, and then a keyframe
   every 2 s is pure overhead. "Keyframe when the accumulated diff exceeds the
   keyframe's size" is the standard answer and is a concept this document did not
   want to introduce unmeasured.
3. **Does the renderer need removals at all before locomotion exists?** A released
   prisoner's slot is freed and its generation bumped, so a stale record is
   identifiable by id; the `removedCount` list may be redundant with the keyframe.
   It is in the layout because leaving a hole for it is free and adding one later
   is a version bump.
4. **`world/render-snapshot` has a route and no reader, and slice 4 would give it
   one — or delete it.** Nine of the fifteen catalogued read models are in that
   state, measured at `54418b6` and re-measured at `b710c62`.
   `tests/foundation/projection-reachability-contract.test.ts` **said ten and now
   says nine**, with the grep that re-derives it written into its header comment;
   this question had nine right before that file did. The cause turned out to be
   an arithmetic slip rather than a stale measurement — six ids are read by five
   modules, because `src/ui/simulation-room-needs.ts` requests two, so counting
   reader *files* gives ten and counting read *models* gives nine.
   `docs/HUD_PROJECTIONS.md` §9 carried the identical slip from the identical
   cause. Whether the render geometry path reuses that projection or
   replaces it should be decided in slice 4, not assumed now.
