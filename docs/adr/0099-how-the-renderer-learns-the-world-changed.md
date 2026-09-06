# ADR 0099: How the renderer learns the world changed

> **The number is provisional and this document pre-commits to renumbering.**
> `AGENTS.md`'s rule is that a number is not reserved until it appears in
> `docs/adr/README.md`, and a branch nobody has merged is invisible from that
> index — so if another branch turns up holding 0099, this file, its row and
> every citation of it get renumbered without argument, exactly as 0031, 0034,
> 0035, 0037, 0048, 0049, 0074, 0075, 0076, 0083, 0096, 0097 and 0098 each
> pre-committed.
>
> **The arithmetic, and for the third document running all three answers
> agree.** The sweep was performed rather than trusted, on 2026-09-06 from a
> branch cut from `origin/main` at `a2b3632b` (v0.0.507):
> `git fetch origin '+refs/heads/*:refs/remotes/origin/*' --prune`, then
> `git ls-remote --refs --heads origin` (**217 heads**, up from 200) with
> `git ls-tree --name-only <head> -- docs/adr/` read out of every one of them
> and **all 217 readable**.
>
> - The highest four-digit prefix on any head is **0098**, on `origin/main` and
>   on nine heads that carry it.
> - **0095 is still held** — `origin/measure/893-coverage-and-response-draw-from-one-pool`
>   (`e576b056`) carries `0095-what-the-guard-requirement-is-a-requirement-for.md`
>   and still has no row in `docs/adr/README.md`. That is the **fourth**
>   consecutive sweep — over 140, 193, 200 and 217 heads — at which it has not
>   moved, and it is worth one clause rather than a silent re-derivation.
> - **Nothing at 0099 or above appears on any of the 217 heads.**
>
> So `max + 1` off **disk** is 0099, the stated **Next free number** line is
> 0099, and `max + 1` over the **sweep** is 0099. The index's own next-free line
> moves to **0100** when this row lands, because
> `tests/foundation/adr-numbering-contract.test.ts` states it as one past the
> highest number *on disk*, and 0095 is still not on disk.
>
> **The agreement is still the exception rather than evidence the hold pattern
> is over**, and `docs/adr/README.md` says why in its own words: what makes the
> three answers agree is that the one held number sits *below* the ceiling
> rather than at it. Three agreements running is three instances of that
> configuration, not a change in the mechanism.

## Status

**Proposed, 2026-09-06. Not self-approved.**

The question is the owner's to settle, and `docs/AGENT_WORKFLOW.md` §3's rule —
*"Propose an ADR rather than deciding architecture inside implementation code,
and never self-approve one"* — is why this is a document and not a patch. What
is proposed below is a **mechanism**: what tells the renderer that the drawn
world has changed, on which channel, and how soon.

**Nothing here changes another document's `Status` line.**
[ADR 0097](./0097-what-the-world-view-is-required-to-communicate.md) is
Accepted, together with its option A, and this document is written against that
accepted decision rather than against the draft;
[ADR 0098](./0098-what-says-which-room-this-is.md) is Proposed and §7 below
says what it would owe this one and what it would not. Where this document
disagrees with either, it says so as a consequence to be priced, not as an
amendment.

Filed against [#1037](https://github.com/woogitsu/lockstate/issues/1037), split
out of [#1027](https://github.com/woogitsu/lockstate/issues/1027) after that
issue's title claim was refuted and the window it had been mistaken for was
measured five times.

**What would change my mind is at the foot of this document**, and so is its
weakest claim, per `docs/research/README.md`'s rule and the form ADRs 0097 and
0098 set.

**No player-facing string is authored here.** `AGENTS.md` reservation 4's
2026-09-04 release makes the choice of words ours provided the sentence is true
of the code that renders it. This decision authors no sentence at all: it makes
an existing one — the Build panel's *"the queue is empty"* — stop being
contradicted by the pixels beside it. Option 1a below is rejected partly
*because* it would author one, and the sentence it would have needed is the
only one this question could ever have required.

## Claim tiers used below

- **MEASURED** — produced by a run of a committed instrument, or quoted from a
  merged research record that says how it was produced.
- **VERIFIED, read** — a source file was opened, and where the claim rests on
  the exact text, the text is quoted under
  `tests/foundation/adr-quotation-verbatim-contract.test.ts`'s form so that it
  cannot drift silently.
- **ARITHMETIC** — derived from constants that were opened, with the derivation
  shown.
- **REASONED** — derived from code that was opened, without a run behind it.
  Every such claim says so, because the difference is the one this document is
  most likely to be wrong about.

---

## Context

### 1. The measurement that forces the question

MEASURED, in `docs/research/2026-09-06-what-a-finished-door-is-drawn-as.md`,
against `main` @ `02490b6e` (v0.0.505), with the instrument
`tests/browser/playtest-1027-what-a-finished-door-is-drawn-as.playtest.ts`:

A door is ordered, Play is pressed, nothing else is touched. The Build panel
stops listing the order at **t+4,612 ms** — the simulation has finished the
door. The tile keeps drawing the translucent `planned` ghost until
**t+30,393 ms**, when the thirty-second consistency poll fetches tick 607 and
the ghost goes. **The window is 25,781 ms**, and five runs of the same
instrument measured **22.0, 25.8, 26.1, 27.6 and 28.0 s** — the poll interval
minus how far into its period the order finished, which is what the mechanism
predicts.

The player is told in words that the queue is empty while the world still shows
an unbuilt door. That is the defect, and it is larger than the 9.7 seconds
`docs/research/2026-08-29-playtest-ordering-and-the-second-room.md` §7 measured
for walls, because here the two surfaces contradict each other rather than one
merely lagging.

### 2. The gap, stated exactly

VERIFIED, read. The feed asks the worker for a snapshot when one of two things
is true:

`const due = this.dirty || (this.clockRunning && nowSeconds >= this.nextPollAt);`
(verbatim in `src/rendering/feed/simulation-snapshot-feed.ts`)

with `const DEFAULT_POLL_INTERVAL_SECONDS = 30;`
(verbatim in `src/rendering/feed/simulation-snapshot-feed.ts`)

`dirty` is set at five places in that file: `simulation/ready`; the clock
transition into running —
`if (running && !this.clockRunning) this.dirty = true;`
(verbatim in `src/rendering/feed/simulation-snapshot-feed.ts`) — an unsolicited
`clock-state` reporting a tick at or past the highest `scheduledForTick` an
acceptance named; a `command-result` with status `queued`; and a request
presumed lost. `docs/RENDERING.md` states the same set in prose.

**Every one of them is a fact about a message this thread sent or received.
None is a fact about the simulation.** A build order *completing* is a fact
about the simulation and nothing else: the command that created it was accepted
hundreds of ticks earlier, and `awaitedCommandTick` is the tick the order was
*scheduled* for, not the tick the crew finished it.

**And the obvious sixth mark cannot be written.** The research record's §6 is
the argument and it is correct: the feed learns the construction snapshot *only
from the snapshot it is deciding whether to request*, so a mark that reads the
completed set has nothing to read at the moment it would have to fire. That the
five marks are all facts about messages is not an oversight; it is the only
information that reaches this object unsolicited.

### 3. What the renderer actually draws, and therefore what a signal has to be about

VERIFIED, read. This is the section that decides how wide the answer must be,
and neither #1037 nor the research record draws it.

The frame the painter reads is four fields, and two of them are the world:

`readonly revision: number; readonly world: WorldRenderView; readonly structures: readonly RenderStructure[]; readonly actors: readonly RenderActor[];`
(verbatim in `src/rendering/feed/render-feed.ts`)

and the painter is woken by exactly one of them:
`repaints on a change of revision or of visible range, and on nothing else.`
(verbatim in `src/rendering/feed/render-feed.ts`)

So what can change a pixel without a message reaching this thread is anything
that changes `world` or `structures`:

1. **The world's own layers.** `TileSample`'s six fields are enumerated in one
   line — `return { loaded: false, terrainNumericId: 0, topEdge: 0, leftEdge: 0, zoning: 0, owned: false };`
   (verbatim in `src/rendering/world/world-view.ts`) — and `readTile` fills them
   from three different places: **four** out of chunk layers (`terrainNumericId`,
   `topEdge`, `leftEdge`, `zoning`), `loaded` out of whether the chunk is
   decoded at all, and `owned` out of neither — `out.owned = this.isTileOwnedInChunk(tileX, tileY, key);`
   (verbatim in `src/rendering/world/world-view.ts`). That split is point 3
   below and §4's second hole.
2. **A build order's drawn phase.** `structuresFromConstruction` collapses eight
   lifecycle states onto three: `planned`, `building`, `built`. So an order
   changes a pixel exactly twice — when it enters `in-progress` and when it
   enters `completed` — and every other transition is invisible.
3. **Tile ownership**, which is the sixth `TileSample` field and also the
   owned-land outline.

Points 2 and 3 are the ones a naive signal misses; §4 says why, and decision 3
is what covers them.

### 4. The simulation already answers "did the geometry change", for a different consumer

VERIFIED, read, and this is the finding that makes the cheap answer cheap.

Every write to a layer the painter reads already bumps a per-chunk counter:
`setTopEdge` and `setLeftEdge` call `markGeometryChanged`, `setZoning` and
`setTerrain` call `markContentChanged`, and both counters are already published
in the render projection (`RenderChunk.geometryRevision`,
`RenderChunk.contentRevision`) and already persisted in the save schema. A
completed build order reaches them through `ConstructionSystem`:
`order.state = 'completed'; this.finalizeConstruction(order);` (verbatim in
`src/simulation/construction/system.ts`), and `finalizeConstruction` either
writes an edge — which bumps the chunk — or, for a buildable that places an
object, calls it directly: `this.markGeometryChanged(order.location);`
(verbatim in `src/simulation/construction/system.ts`).

**And something in the worker already asks this exact question of those
counters.** The navigation graph decides whether to rebuild by fingerprinting
them:

`function computeGeometrySignature(chunks: readonly ChunkState[]): string {`
(verbatim in `src/simulation/navigation/region-graph.ts`)

So "has the world's geometry changed since last time" is a question the
simulation already computes, for a consumer that is not the renderer. What is
missing is not the fact. It is a route from the fact to the feed.

**Two holes in that fact, named because they decide decision 3's shape.** Neither
counter moves for a build order's phase change (§3 point 2: `finalizeConstruction`
runs on completion only), and neither moves for ownership — `setOwned` and
`setParcelOwned` add to a set and return, and `WorldRenderView` reads ownership
from `snapshot.ownedChunks` and `snapshot.ownedParcels` rather than from a chunk
layer. Ownership happens to be safe today because buying land is a *command* and
therefore already sets `dirty`; that is a fact about who writes it, not a
property of the counters.

### 5. What channels exist, and what each is for

VERIFIED, read. Four worker→main channels reach this thread today. Their
cadences are the whole cost model of the options below.

| channel | cadence | gate | who reads it |
| --- | --- | --- | --- |
| `simulation/clock-state` | 250 ms ceiling | tick must have moved | the HUD clock, and the feed (two of its five marks) |
| `simulation/delta` | 100 ms ceiling | tick must have moved | the feed, actors only |
| `simulation/status-counts` | 500 ms ceiling | tick moved **and** a count changed | six HUD readouts |
| `simulation/event` | once per event | none — nothing coalesces it | the alerts log and the events band |

Two properties of that table are load-bearing.

**The delta channel is silent while the clock is paused**, by the same rule the
clock channel uses: `if (tick <= this._publishedDeltaTick) return;` (verbatim in
`src/simulation/worker/state-machine.ts`), and its constant's own docblock says
*"a paused prison posts nothing at all"*. That is not a hole for this decision:
a build order cannot advance without ticks, and the one geometry change a paused
prison can have is a command dispatched during the pause (ADR 0051), which
already sets `dirty` through `command-result`.

**The counts channel is change-gated, and a build order moves none of its
figures**: `if (!eventIsNew && this._publishedCounts !== null && statusCountsEqual(this._publishedCounts, counts)) return;`
(verbatim in `src/simulation/worker/state-machine.ts`). `statusCountsSchema` has
**23 fields** (counted off the schema: `prisoners` … `conditions`) and not one
of them is a build queue, a chunk revision or an order state.

> **A count that rotted, since this document had to derive the 23.** That same
> method's docblock says `a build order moves none of the fifteen figures this payload carries` (verbatim in `src/simulation/worker/state-machine.ts`). The
> claim it makes is still true — no build order moves any of them — and the
> tally in it is not: the payload carries 23 fields, of which 20 are numbers.
> This is `docs/AGENT_WORKFLOW.md` §4's rule about counts, met in the file that
> would have to change for option 1b, and it is recorded here rather than fixed
> because this branch touches nothing under `src/`.

### 6. What #1037 and the research record get wrong, in one direction each

Both corrections are in the direction of making option 2 worse, which is why
they are here rather than in a footnote.

**Correction 1, VERIFIED, read: the main thread does *not* always hold the
answer.** #1037 says *"the main thread therefore knows about the completion
within ~250 ms"*, and the research record's route 2 says the same. It is true of
the measured run and false in general, because the read is gated on which HUD
tab is showing:

`if (buildQueueReader === undefined || activeTab !== 'build') return;`
(verbatim in `src/main.ts`)

and a session does not start on that tab: `activeTab: 'overview',` (verbatim in
`src/ui/hud/hud-state.ts`). So the main thread's knowledge of the build queue
exists **only while the player is looking at the Build panel** — and a player
who orders a door and then switches to Overview to watch the prison is in the
one case where the world is the surface they are reading. Route 2 does not merely
cross a boundary; it would make the drawn world's freshness a function of which
panel is open.

**Correction 2, already recorded, restated because ADR 0097 still carries the
refuted half.** ADR 0097 §6's second bullet says a stale frame can produce *"a
full-tile opaque slab"*. The research record refutes it: zero samples at full
opacity across every run, because `SimulationSnapshotFeed.apply` builds `world`
and `structures` in one object literal from one bundle, and
`captureSessionSnapshot` takes the two snapshots in one synchronous literal of
its own. Staleness moves both halves together, so a stale frame shows a stale
*phase* — a translucent ghost — and never a completed order without its edge.
`tests/integration/completed-edge-structures-arrive-with-their-edge.test.ts`
gates that, walking 600 ticks with a real capture at each one. §7 of this
document is written to keep it true.

**One thing the record and the issue get right that is worth confirming
separately**, because it is the premise of the whole diagnosis: the queue
readout was not lying. `PENDING_BUILD_ORDER_STATES` counts all five states an
unfinished order can be in, so `0 waiting · 0 being built` cannot be produced by
an order that has not finished.

### 7. What ADR 0097's accepted option A commits, and what it does not

This is the section the brief asked to be thought hardest about, and the answer
splits three ways rather than two.

ADR 0097 was **Accepted by the owner on 2026-09-05, together with option A**,
and option A is *"a per-room-instance condition ordinal published beside the
actors, and a renderer module that draws one mark per room rectangle"*, priced
in that document as *"a payload version bump plus a writer in
`src/simulation/worker/render-actors-keyframe.ts`"*.

**The channel: yes, and it is already paid for.** `lockstate.render-actors` has
a four-word header — `export const RENDER_ACTORS_HEADER_WORDS = 4;` (verbatim in
`src/simulation/protocol/render-actors-payload.ts`) — and its own docblock states
the version rule: adding to the layout *"is a bump here and no protocol change
at all"*. Option A already commits to that bump. A fifth header word costs four
bytes per publication, 40 bytes a second at the 100 ms ceiling, one line in the
writer and one in the reader. If the two land in one bump it is one version
change instead of two; if they land apart, two layout bumps still cost no
protocol change, no envelope change and no save-schema change, and there is no
mixed-version case to reason about because `src/main.ts` builds the worker
through Vite's `?worker` import — one bundle ships both halves.

**The payload: no, and treating them as one fact would be a bug.** A condition
ordinal changes when a room stops working; a geometry signal changes when
something is built. Neither implies the other: a wall raised in open ground
changes no room's condition, and a room going over capacity changes no geometry.
Using either as a proxy for the other would produce a renderer that refreshes
the world when a cell fills up and does not when a door finishes.

**The module: no, and this is the sharpest of the three.** ADR 0097 decision 2's
corollary is explicit that its mark **must not** be painted by `TileLayer`,
because `revision` is geometry-only and bumping it for a delta *"would make
every tile in view repaint up to ten times a second to move some sprites"*. The
defect in #1037 is the opposite shape: the wrong pixels are `TileLayer`'s own,
drawn from `world` and `structures`, and fixing them *requires* a revision bump
and a repaint. 0097's new module cannot draw a door.

**So one decision discharges two ADRs only at the transport, and the saving is
real but bounded**: one shared layout bump, one shared writer, one shared
decode site. Everything above the wire is separate.

**And this decision is emphatically not ADR 0040 slice 4.** That slice is
*"carrying chunk geometry on the delta channel, and retiring the poll for
renders altogether"*, and the integration test above says what happens the day
it lands: geometry and the construction projection acquire two cadences, the
frame stops being built from one bundle, and the painter starts drawing opaque
blocks over finished doors for as long as the two channels disagree. What the
recommendation below puts on the delta channel is a **notification**, not
geometry.
The bundle stays whole.

---

## Decision

Proposed, not approved. Five parts.

### 1. The renderer is told *that* the world changed, and fetches it as it does today

**Proposed.** The signal is a notification, not a payload: the worker publishes
a marker meaning "the drawn world is not what it was", the feed treats it as a
sixth `dirty` mark, and the snapshot request that already exists does the rest.

**This is the part that keeps the gated invariant, and it is the reason to
prefer it over anything that carries geometry.** The frame is still built in one
literal from one `SessionSnapshotBundle`, so `world` and `structures` still
cannot arrive apart and
`tests/integration/completed-edge-structures-arrive-with-their-edge.test.ts`
still holds by construction rather than by care. A notification cannot split
what a single capture joins.

It also means the renderer learns nothing it can misread. The marker carries no
tile, no order id and no phase — decision 3 bounds it to that — so there is no
second interpretation of the world on this thread, which is `AGENTS.md`
boundary 1 in the form the feed's own header already keeps: *"holds nothing
authoritative"*.

### 2. The notification rides `simulation/delta`, as one header word

**Proposed.** For §7's reasons: it is the render channel, ADR 0097's accepted
option A already commits to a version bump on it, the payload is opaque to the
protocol decoder so a word costs nothing on the boundary, and its 100 ms ceiling
is the tightest of the four channels.

**What that makes the latency, ARITHMETIC from the constants in §5's table.**
The worker publishes at most 100 ms after the tick that completed the order
(`RENDER_DELTA_PUBLISH_INTERVAL_MS`); the feed sets `dirty` in the message
handler and `pump` runs on the next `readFrame`, which the scene calls from its
frame loop at 60 Hz — so under 17 ms — and the request round trip is one
`captureSessionSnapshot` plus one decode, measured under option 4 below at
**0.41 ms** for the prison a player actually has. **Call it under 200 ms**, against
22,000–28,000 ms today. The reason to state it as a bound and not a promise is
[ADR 0086](./0086-what-refreshes-a-pulled-hud-readout.md)'s lesson, as
`src/main.ts` records it: the arithmetic bounds the worker's grid under
punctual timers and a player's wait adds timer lateness that no constant here
bounds.

### 3. What the marker must cover, and what it may say

**Proposed.** The marker is a single monotone unsigned counter with no meaning
beyond inequality with the last one seen. It must move on:

- every write to a layer `WorldRenderView.readTile` reads — which §4 shows is
  already every `markGeometryChanged` and `markContentChanged` site;
- every build-order transition into `in-progress` or `completed` — §3 point 2,
  which the chunk counters do **not** cover;
- every change of tile or parcel ownership — §4's second hole, which the chunk
  counters do not cover either.

**Incremented at those write sites rather than derived by summing chunk
revisions per publication.** Both shapes work for the first bullet; only the
explicit counter covers the other two, and the derived form would additionally
put an O(chunks) walk on a 10 Hz publication for a question the write sites can
answer in O(1). §4's two holes are the argument: a signal derived from the
counters would be silent for a phase change and for a land purchase, and it
would be *correct today by coincidence* — because a purchase is a command — in
exactly the way `docs/AGENT_WORKFLOW.md` §3 warns about.

**It may not carry what changed.** Not a tile, not a chunk position, not an
order id, not a phase. A marker that named a tile would invite a partial
refresh, and a partial refresh is slice 4 by another route: it would let the
renderer hold a world assembled from more than one capture.

### 4. The thirty-second poll stays thirty seconds, and stays a consistency net

**Proposed.** Once the marker exists, the poll is doing the job its own docblock
already claims for it: it *"bounds how long a disagreement could persist between
the world this feed holds and the world the worker holds, if one ever arose by a
route neither `dirty` nor the delta covers."* Shortening it (option 4 below) buys a
2-second lie instead of a 26-second one and gives the net back its old job as
the data path.

`tests/unit/rendering-feed.test.ts`'s pinned figure — two requests over thirty
running seconds — therefore stands unchanged for an idle prison, and for a
prison being built it gains one request per **drawn phase change**, which by §3
point 2 is two per order and not one. That is the whole cost of this decision on
the wire, and it is bounded by how fast a crew can finish orders rather than by
a clock.

### 5. The renderer does not read `src/ui/`, and `src/main.ts` does not tell it

**Proposed, and it is the half that keeps the boundary where it is.** The answer
does not come from the Build panel's projection, however close to hand it is.
§6's correction is the practical reason and option 2 below prices the rest.

---

## Options, with their real costs

### Option 1 — an unsolicited worker message that names the change

Four sub-forms. They differ by an order of magnitude in what they cost to write
and by half a second in latency — 1a is immediate, 1d is bounded at 100 ms, 1c
at 250 ms, 1b at 500 ms — and half a second is noise against a 26-second
defect, so latency does not decide between them and cost does.

#### 1a — a `construction.order-completed` member of `simulation/event`

**Rejected, and the cost is a player-facing sentence per wall segment.**
`simulation/event` is a closed union and adding to it is deliberately expensive:

`export const SIMULATION_EVENT_TYPES = [ 'construction.order-cancelled', 'construction.order-cancelled-underway', 'construction.redone', 'construction.undone', 'construction.undone-spend-destroyed',`
(verbatim in `src/simulation/protocol/types.ts`)

Five `construction.*` members and no completion among them — and the reason a
sixth is not free is stated in the receiver:

`an event type added to the protocol **fails to compile here** until somebody has decided what it says to a player, how serious it is, and which surfaces it reaches.`
(verbatim in `src/ui/simulation-events.ts`)

There is no silent grade: the narrowest choice
is `surfaces: 'log-only'`, which still writes a row into the alerts log, and the
channel's own docblock says *"There is no grade below `'info'`."*

So a twelve-segment wall would put twelve rows in the alerts log to tell the
*renderer* something. That is the wrong channel for a machine-readable fact, and
the schema's docblock says so about a neighbouring case: this channel exists
because *"a member added here must **fail to compile** until somebody has
decided what it says to a player"*. A renderer wake-up has nothing to say to a
player.

**What it forecloses:** nothing structural. It is rejected on cost, not on
consequence.

#### 1b — a build-queue or revision field on `simulation/status-counts`

**Rejected.** #1037 is right that the schema carries no such field, and adding
one is mechanically cheap — `accommodationCapacity` is the precedent for adding
a field without raising `HUD_VIEW_MODEL_SCHEMA_VERSION`, and a monotone counter
would open the change gate every time it moved.

It is rejected on what the channel *is*. `projectStatusCounts` returns
`projectStatusStrip(...).counts` — this is the status strip's projection, whose
own module says *"this channel carries integers only"* and whose payload is
documented as capacity-independent scalars a player reads. A renderer's wake-up
signal is not a figure on the strip, and putting it there would make every HUD
consumer of that payload carry a field none of them read. It is also the slower
channel: a 500 ms ceiling against the delta's 100 ms.

**What it forecloses:** the counts payload's property that every field has a
reader in the HUD. Small, but it is the property the `roomCapacity` correction
in that schema's own docblock exists to protect.

#### 1c — a world epoch on `simulation/clock-state`

**The honest runner-up, and it is within noise of the recommendation.** This
channel is already unsolicited at a 250 ms ceiling, the feed already handles it,
and the feed already derives one of its five `dirty` marks from a *number* on
it — the awaited command tick. A second number read at the same site is about as
small a change as this repository has available: no payload layout, no version
of any kind, two producers to update, and one branch in `handleMessage`.

**Why it is not recommended, and it is a judgement rather than a measurement.**
250 ms against 100 ms is nothing against a 26-second defect, so latency does not
decide it. What decides it is which channel the fact belongs on: `clock-state`
is *"strictly a report"* about where the clock has got to, read by the HUD clock
and the progress bar, and `simulation/delta` is the render channel — *"This is
the data path for anything that moves"*. A geometry marker is render data. The
second reason is §7's: option A's bump is happening anyway on the delta channel,
so the marginal cost there is smaller than it looks, while on `clock-state` the
marginal cost is a field two HUD readers must now ignore.

**If the owner disagrees with that, 1c is the cheaper answer and nothing else in
this document changes.** Decisions 1, 3, 4 and 5 are all channel-independent.

#### 1d — a fifth header word on `lockstate.render-actors` (recommended)

Costed in §7 and decision 2: one layout-version bump (2 → 3), four bytes per
publication, one writer line, one reader line, one `dirty` branch. No protocol
version, no envelope change, no save-schema change, no art.

**What it forecloses:** the fifth header word, and a little of the reserved
space the layout keeps for the changed-only deltas ADR 0040 puts in slice 3. It
also puts a second consumer on this payload's version, which ADR 0097 already
noted for slice 2's guards — three things now want to land in one bump rather
than three.

### Option 2 — the answer the main thread already holds

**Rejected, on §6's correction first and the boundary second.**

`BuildQueueReader.read` asks for `hud/build-queue` on the clock heartbeat and
gets an authoritative view of the queue, so the main thread *can* know of a
completion within about 250 ms — **but only while the Build tab is showing**
(§6), and a session opens on Overview. A fix whose freshness depends on which
panel is open is not a fix for a player watching the world.

**What the boundary actually says, since #1037 asks for it precisely.**
`tests/unit/ui-orchestration-boundaries.test.ts` does not prohibit
`src/ui/` → `src/rendering/`; it *records* it. An unrecorded cross-tree
dependency fails `depends on no layer outside src/ui/ that is not recorded with
a reason`, and the remedy is a manifest entry with a `kind` and a reason of more
than 80 characters. So wiring this across would need an entry — and it would
have to argue against the sentence the one existing `rendering` entry already
carries about a value import from that tree — it
`would mean the orchestrator had started calling into the renderer rather than being handed its reports.`
(verbatim in `tests/unit/ui-orchestration-boundaries.test.ts`)

Calling something like `feed.markDirty()` is exactly a value import that calls
into the renderer. That is the intent the gate constrains, stated in the gate,
and it is the sentence a new entry would have to be written against rather than
around.

**The variant that dodges the gate is worse, not better.** `src/main.ts` is not
under `src/ui/`, so the composition root could observe the queue reply and poke
the feed with no manifest entry at all. It would also put the fix in the one
module the unit suite cannot reach: `vitest.config.ts` runs
`environment: 'node'` and `src/main.ts` touches `document`, which is why
`src/ui/affordability.ts` exists at all — its manifest entry records that the
comparison it makes *"lived inline in `src/main.ts`, which `vitest.config.ts`
cannot reach at all"*. A defect fixed there is a defect fixed where no unit test
can pin it, in a file whose only coverage is the browser suite.

**And it answers a narrower question than the one asked.** The build queue knows
about build orders. It does not know about an undo, a redo, an object removal or
a land purchase — all of which change geometry, and all of which happen to be
covered today because they are commands. A signal built on the build queue would
be the only one of §3's three sources that this route can see.

**What it forecloses:** the direction of the dependency, permanently. Once the
orchestrator drives the renderer's refresh, "the renderer is handed reports" is
no longer true of this repository and the manifest sentence above has to be
rewritten rather than defended.

### Option 3 — wait for ADR 0097's overlay module and reuse it

**Not available, and §7 is the argument.** The overlay is a separate display
object keyed by room instance, and 0097's decision 2 forbids it from being
painted by `TileLayer` precisely so an actor-cadence repaint cannot touch the
tiles. The ghost door is a tile. There is nothing to reuse above the wire.

**What it forecloses:** nothing — but taking it would mean shipping 0097's
payload bump without the four bytes that would have ridden free in it, which is
§7's bounded saving thrown away.

### Option 4 — shorten the poll

**Cheapest to write, rejected, and its price is not the one it is usually given.**

**MEASURED**, with `tests/research/1037-what-a-render-snapshot-costs.research.ts`
on this branch (`origin/main` @ `a2b3632b`, v0.0.507), Node v24.19.0, medians
over 40 samples per leg, on a container also running other agents' suites. The
four legs of one poll, in milliseconds:

| loaded chunks | worker capture | `structuredClone` | main decode | build the frame | sum |
| --- | --- | --- | --- | --- | --- |
| 1, no orders | 0.121 | 0.056 | 0.090 | 0.006 | **0.27** |
| 1, 12 orders | 0.103 | 0.087 | 0.152 | 0.010 | **0.35** |
| 1, 48 orders | 0.065 | 0.169 | 0.167 | 0.013 | **0.41** |
| 16, 48 orders | 0.170 | 0.225 | 0.293 | 0.076 | **0.76** |
| 64, 48 orders | 0.478 | 0.385 | 0.703 | 0.293 | **1.86** |
| 256, 48 orders | 1.884 | 1.065 | 2.248 | 1.388 | **6.59** |

Four runs of the instrument agree: no median in the table moved by more than
0.05 ms between them except `captureSessionSnapshot` on the two smallest rows,
where the leg is small enough that the sampler's own noise shows. The table is
the last run, taken from the file as committed.

A new prison owns **one** loaded chunk, so the first three rows are what a
player has and the rest are extrapolation arms. **The arms are a floor, not a
model of a wide prison, and the comparison that shows it is worth stating
against this document rather than for it**: ADR 0040 measured
`WorldRenderView.fromSnapshot` at 1.35 ms over 64 loaded chunks, and the
64-chunk row here builds the whole frame in 0.293 ms — about 4.6x faster, because
`widen` writes two runs per chunk where a played world has full terrain, edge
and zoning layers. So the 256-chunk row understates a real 256-chunk prison by
something of that order, and the right reading of the table is *"even a floor
this cheap makes the CPU argument against a short poll weak"* rather than
*"a wide prison costs 6.6 ms"*.

**So the CPU argument against a 2-second poll is weak, and saying so is the
point.** `docs/RENDERING.md` gives the message count directly: two requests over
thirty running seconds at 30 s, and *"the 16 that the 2 s interval this figure
replaced would have cost"*. Fourteen extra requests per thirty seconds at 0.41 ms
of measured work each is **under 6 ms per thirty seconds**, spread across two threads.
That is not a cost worth an ADR.

**The four real costs are elsewhere.**

1. **It leaves the defect in place, smaller.** A 2-second contradiction between
   the panel and the world is still a contradiction, and this is a decision
   about correctness rather than about milliseconds.
2. **The leg that is not in the table is the expensive one.** Every applied
   snapshot moves `revision`, and `revision` is what makes `TileLayer` release
   and rebuild every tile in view. ADR 0040's amendment names that cost in the
   same breath as the 121-request regression it fixed. It is Phaser and
   `environment: 'node'` cannot reach it, so this document does not have a
   number for it — which is exactly why it should not be multiplied by fifteen
   on the strength of a table that excludes it.
3. **It lowers a pinned floor.** `tests/unit/rendering-feed.test.ts` asserts
   `two requests over thirty running seconds` and its docblock explains that the
   literal is the *claim*. Changing `DEFAULT_POLL_INTERVAL_SECONDS` turns that
   red, and `docs/AGENT_WORKFLOW.md` §3 says plainly: *"Do not lower a pinned
   floor."*
4. **It spends ADR 0040 slice 1's saving to buy back its own regression.** The
   interval is 30 s *because* the actors moved off this path. Putting geometry
   back on a short interval is the shape the slice removed.

**What it forecloses:** the poll's meaning. Once it is the data path again, there
is no channel left that means "the two worlds agreed", and slice 4 loses the
baseline it would be measured against.

---

## Are options 1c and 1d within noise of each other?

**Yes, on everything a measurement can settle, and this document says so rather
than manufacturing a preference.**

- Latency: 250 ms against 100 ms, against a defect of 22,000–28,000 ms.
- Wire cost: an integer field on a JSON payload posted 4/s against four bytes on
  an opaque buffer posted 10/s. Both are noise.
- Code: one branch in `handleMessage` either way; 1c updates two producers, 1d
  updates one writer and one reader plus a layout constant.

The recommendation of 1d rests on two things that are not measurements: that a
render fact belongs on the render channel, and that ADR 0097's accepted bump
makes the marginal cost smaller there. **Both are arguments, and if the owner
weighs "fewer moving parts" above "the right channel", 1c is the answer and only
decision 2 changes.**

## How the gated invariant survives

Stated separately because the brief asks for it and because it is the property
most easily lost by a later slice.

`tests/integration/completed-edge-structures-arrive-with-their-edge.test.ts`
holds because the painter's two operands are read off one bundle. Under this
decision:

- the marker is a notification and carries no geometry, so it adds no second
  source for either operand;
- the frame is still assembled in `SimulationSnapshotFeed.apply` from one
  `SessionSnapshotBundle`, unchanged;
- the delta path still touches `actors` and nothing else, and still does not
  move `revision`;
- the only new behaviour is *when* a snapshot is asked for, and a snapshot is
  atomic by construction.

So the test passes for the same reason it passes today, and it keeps its value:
the day ADR 0040 slice 4 is taken, it goes red and names the tile and the tick.
**This decision deliberately does not take that slice**, and §7 says why.

---

## Consequences if this stands

- `docs/RENDERING.md`'s list of when the feed asks — *"once when a session
  becomes ready, after any command is accepted, again once the simulation
  reaches the tick that command was scheduled for, when the clock *starts*, and
  on a **30-second** interval while the clock is running"* — gains a sixth
  member and must be rewritten rather than annotated.
- `src/rendering/feed/simulation-snapshot-feed.ts`'s header claim that the feed
  asks *"only when the world can actually have changed"* becomes true in a
  second sense, and its enumeration of the five marks becomes an enumeration of
  six. ADR 0097 §5's list of five, and this document's own §2, both become
  historical the day it lands.
- `tests/unit/rendering-feed.test.ts` gains a case: a delta whose marker moved
  provokes exactly one request, and a delta whose marker did not provokes none.
  The second half is the one worth watching go red — a marker read
  unconditionally would put a snapshot request on every delta, which is 10 Hz
  and worse than the bug.
- ADR 0040's slice list acquires a member it did not have: a *notification*
  slice between slice 3 and slice 4, which is the slice that removes the reason
  slice 4 looked urgent.
- `lockstate.render-actors` gets a third consumer of its version. Slice 2's
  guards have landed; ADR 0097 option A and this marker have not, and they
  should land in one layout bump.
- ADR 0098 is unaffected. It competes for the floor's visual budget and this
  competes for a header word; the two do not touch. **And the thing it might
  look like it inherits, it does not**: zoning a room is a command, so the tint
  a designation paints already reaches the screen on the existing `dirty` mark
  and this decision changes nothing about it. What it does inherit is the case
  0098's option E rests on — a *placed object* is a completed build order, so
  furniture appearing in a room is exactly the change this marker makes prompt.

## Open questions

1. **Should the marker also cover what the *actors* channel cannot say?** A
   prisoner's arrival changes `frame.actors` on the delta path already, so no.
   But an object placed inside a room changes `structures` *and* a room's
   capacity, and the second reaches the HUD on a third channel. Whether one
   marker should wake both consumers is not decided here.
2. **What the counter is, exactly.** A `u32` wraps, and a session long enough to
   wrap it would compare equal once. Even if it moved on every publication at
   the 100 ms ceiling, `2**32` increments is 13.6 years of wall clock, so this is
   a footnote rather than a risk — but "monotone" and "one word" are not the same
   claim and the implementation should say which it means.
3. **Whether the poll can eventually go to zero.** Decision 4 keeps it as a net.
   If the marker provably covers every write, the net is guarding against
   nothing, and the honest way to find out is to keep it and count how often it
   ever finds a disagreement. Nothing today counts that.
4. **Whether a `dirty` mark should coalesce with the poll's schedule.** A prison
   being built rapidly would fire the marker repeatedly; `pump` already
   single-flights on `pendingMessageId`, so the worst case is one request per
   round trip, but nobody has measured a burst.
5. **Whether the same mechanism should serve the save path.** A save asks for
   its own snapshot and the feed ignores it —
   `if (message.replyTo !== this.pendingMessageId) return;` (verbatim in
   `src/rendering/feed/simulation-snapshot-feed.ts`). A marker that meant "the
   world differs from the last save" is a different question with the same
   shape, and answering both with one counter would couple them.

---

## The weakest claim in this document, named

**That the `TileLayer` rebuild is expensive enough to matter, which is the
second of option 4's four costs and the only one this document cannot price.**
`environment: 'node'` cannot reach Phaser, so the number is missing, and the
measured table under option 4 shows the legs that *can* be measured are cheap enough that
the whole CPU argument against a short poll collapses. If the rebuild turns out
to be cheap too, then option 4 is a real contender on cost and the case against
it narrows to correctness alone — cost 1, which is still sufficient, but it is
one argument rather than four. **The falsification is a browser measurement of
`TileLayer.releaseAll` plus one full paint at a realistic zoom**, which
`tests/browser/` can take and this document did not.

Second weakest: **decision 3's list of three sources is a claim of
exhaustiveness, and `docs/AGENT_WORKFLOW.md` §4 says that shape rots first.** It
is derived from `TileSample`'s six fields and `structuresFromConstruction`'s
three phases, both of which are enumerated in one line of code today — so it is
checkable rather than asserted. But a seventh field added to `TileSample` would
falsify it silently, and nothing in this repository would say so. A gate that
pinned "every producer of a `TileSample` field bumps the marker" is the thing
that would make the claim durable, and this document does not design it.

Third: **the latency figure in decision 2 is arithmetic over three constants and
one measured round trip, not an observation.** `src/main.ts`'s own correction of
the 255 ms heartbeat figure — arithmetic under punctual timers, understating a
browser's wait by about 18% — is the precedent for reading "under 200 ms" as a
floor rather than a bound.

## What would change my mind

- **A browser measurement showing the `TileLayer` rebuild is negligible.** Then
  option 4 becomes defensible on cost, and this decision is worth taking anyway
  only on correctness — which is a much shorter document than this one.
- **The owner preferring fewer moving parts to the right channel.** Then option
  1c is the answer, decisions 1, 3, 4 and 5 stand unchanged, and the delta
  channel keeps its four-word header.
- **ADR 0040 slice 4 being taken first.** Then geometry is on the delta channel,
  a notification is redundant, and the whole of this document is replaced by the
  much harder problem the integration test is waiting to describe: how a frame
  assembled from two cadences keeps the painter's two operands together. That is
  a bigger decision than this one and it should not be reached by accident.
- **Evidence that a player never watches the world while a build is
  outstanding.** §6's correction cuts both ways: if the Build tab really is
  where a player sits while building, the freshness of the world during a build
  matters less than this document assumes, and option 2's tab gate stops being
  disqualifying. Nobody has played this game.
