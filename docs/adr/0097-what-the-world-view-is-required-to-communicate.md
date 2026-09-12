# ADR 0097: What the world view is required to communicate

> **The number is provisional and this document pre-commits to renumbering.**
> `AGENTS.md`'s rule is that a number is not reserved until it appears in
> `docs/adr/README.md`, and a branch nobody has merged is invisible from that
> index — so if another branch turns up holding 0097, this file, its row and
> every citation of it get renumbered without argument, exactly as 0031, 0034,
> 0035, 0037, 0048, 0049, 0074, 0075, 0076, 0083 and 0096 each pre-committed.
>
> **The arithmetic, and this time the three answers agree.** The number was
> assigned centrally by the integrator, and the sweep was still performed rather
> than trusted, on 2026-09-05 from a branch cut from `origin/main` at `bd6fa32`
> (v0.0.499): `git fetch origin '+refs/heads/*:refs/remotes/origin/*' --prune`,
> then `git ls-remote --refs --heads origin` (**193 heads**) with
> `git ls-tree --name-only <head> -- docs/adr/` read out of every one of them.
>
> - The highest four-digit prefix on any head is **0096**, on `origin/main` and
>   on many heads that carry it.
> - **0095 is still held** — `origin/measure/893-coverage-and-response-draw-from-one-pool`
>   carries `0095-what-the-guard-requirement-is-a-requirement-for.md` and still
>   has no row in `docs/adr/README.md`. ADR 0096's preamble recorded that hold
>   on 2026-09-04 over 140 heads; 53 heads later it has not moved, which is
>   worth one clause rather than a silent re-derivation.
> - **Nothing at 0097 or above appears on any of the 193 heads.**
>
> So `max + 1` off **disk** is 0097, the stated **Next free number** line is
> 0097, and `max + 1` over the **sweep** is 0097. All three agree, which the
> chain in `docs/adr/README.md` records as the exception rather than the rule.
> The index's own next-free line moves to **0098** when this row lands, because
> `tests/foundation/adr-numbering-contract.test.ts` states it as one past the
> highest number *on disk*, and 0095 is still not on disk.

## Status

**Accepted by the owner on 2026-09-05, together with option A.**

**The paragraph this replaces is kept immediately below rather than
overwritten**, per `docs/AGENT_WORKFLOW.md` §4, because a reader needs to see
that this document was drafted as a question and answered as one, and by whom.

> **Proposed, 2026-09-05. Not self-approved.**
>
> The question is the owner's to settle. What is proposed below is a
> *requirement* — a sentence saying what the game's main view has to tell a
> player — together with the options that could discharge it and what each one
> costs and forecloses. Nothing here is approved, and the decisions in
> [#1021](https://github.com/woogitsu/lockstate/issues/1021) and
> [#1020](https://github.com/woogitsu/lockstate/issues/1020) collide with this
> one in ways §7 sets out.

**What the owner decided, and by what route — recorded exactly, because the
route matters to anyone reading this status later.** The decision was put to
them as four options: accept the requirement and defer the choice of option;
accept it together with option A; hold until they had read the document; or
reject the direction. They chose **"Przyjmij razem z wariantem A"** — *"Accept
together with option A"*.

**That acceptance was given against a summary of this document and of option A,
not against its full text**, and the option they chose carried that summary in
these words: *"A to nakładka na kanale delty: bump payloadu, jeden moduł
renderera, bez zmiany warstwy świata i bez bumpa schematu zapisu. Najdroższy w
kodzie, najtańszy w grafice, i jedyny, który nie dziedziczy 30-sekundowego
opóźnienia."* This note exists so that nobody later mistakes the acceptance for
a reading — the same disclosure ADR 0075 and ADR 0076 carry, for the same
reason, and it is required by `docs/AGENT_WORKFLOW.md` §3's rule that an
implementing agent does not approve its own work.

**So both halves are now settled**: the requirement in §4 holds, and **option A
is the way it is to be discharged**. §5's options B, C and D remain as recorded
rather than deleted — B and C are the costs that were declined, and D is the
sequencing note that a furnished cell answers part of the requirement on its
own, which is still true and still worth doing first.

**What acceptance does not settle**, and what a reader must not infer from it:
the weakest claim named in §10 is untouched by it. That claim — that a
30-second-stale condition cue would be worse than none — is the load-bearing
premise of decision 2 and remains a judgement about play that nobody has played.
Option A is the option that does not depend on it being right, which is a reason
the choice is safe, not a reason the claim is now established.

The decisions in [#1021](https://github.com/woogitsu/lockstate/issues/1021) and
[#1020](https://github.com/woogitsu/lockstate/issues/1020) still collide with
this one in the ways §7 sets out, and **§7's collision with #1021 is now live
rather than hypothetical**: option A is chosen, so #1021 must be told before it
picks its own mark.

Filed against [#1022](https://github.com/woogitsu/lockstate/issues/1022), which
the owner selected for work along with the other three candidates raised by the
play-test in [#1018](https://github.com/woogitsu/lockstate/pull/1018).

**No player-facing string is authored here.** `AGENTS.md` reservation 4's
2026-09-04 release makes the choice of words ours provided the sentence is true
of the code that renders it; every option below would need at least one string,
none of them has code behind it yet, so §9 lists what is owed rather than
inventing it.

## Claim tiers used below

- **MEASURED** — produced by a run of a committed instrument, or quoted from a
  merged research record that says how it was produced.
- **VERIFIED, read** — a source file was opened at the cited `file:line`, and
  where the claim rests on the exact text, the text is quoted under
  `tests/foundation/adr-quotation-verbatim-contract.test.ts`'s form so that it
  cannot drift silently.
- **REASONED** — derived from code that was opened, without a run behind it.
  Every such claim says so, because the difference is the one this document is
  most likely to be wrong about.

---

## Context

### 1. The measurement that forced the question

MEASURED, in `docs/research/2026-09-05-what-the-world-shows.md`, the record
merged as [#1018](https://github.com/woogitsu/lockstate/pull/1018) against
`main` @ `1ad253c` (v0.0.497):

- A sealed cell and a working one — same tiles, same crop, same population, same
  `roomCapacity` — differ by **6,061 pixels of 147,456 (4.11%)**. Thirty-two of
  thirty-six tiles are pixel-identical. The 3,072 differing pixels at tile
  (14,17) are **the door**; the 2,989 at row y=12 are four prisoner sprites
  overlapping slightly differently in one corner.
- Act 5: six frames over 1,144 ticks, **0 differing pixels of 409,600**.
- Act 8, the same measurement in a *ready* cell with a door and four prisoners
  who have four beds and a toilet: eight frames over 1,878 ticks, **one** change
  — the door finishing construction.

That record's own framing is the one this document takes: the pass could see the
game for the first time, because every earlier browser run lost all ten atlases
to a decode failure and passed anyway. So the 4.11% is not the artefact
[#944](https://github.com/woogitsu/lockstate/issues/944)'s "byte-identical" was.
It **survives having the art**, which is what makes it a design finding rather
than a bug report.

### 2. What the tile layer is given, exhaustively

VERIFIED, read. The renderer's whole per-tile vocabulary is six fields, and the
constructor for one of them enumerates them in a single line:

`return { loaded: false, terrainNumericId: 0, topEdge: 0, leftEdge: 0, zoning: 0, owned: false };`
(verbatim in `src/rendering/world/world-view.ts`)

`TileSample` is declared immediately above it at
`src/rendering/world/world-view.ts:36-46`, and `WorldRenderView.readTile`
(`:161-181`) fills exactly those six from the decoded chunk layers. There is no
seventh field, and no room-instance identity: `zoning` is the room *catalog*
numeric id, so two adjacent cells are indistinguishable to the painter.

Everything the tile layer draws from those six is in one method,
`TileLayer.paintChunk` (`src/rendering/phaser/tile-layer.ts:298-416`), and it
paints from three inputs and no more:

1. **The floor sprite**, chosen per tile at
   `src/rendering/phaser/tile-layer.ts:333`, from a function whose body is five
   lines and whose last line is a literal:

   `return 'env.floor.institutional';`
   (verbatim in `src/rendering/world/environment-art.ts`)

   `zonedFloorSprite` (`src/rendering/world/environment-art.ts:156-161`) branches
   on nothing except whether the zoning id names a known room. Its own docblock
   says so at `:152-154` — *"One floor for every category today."*

2. **The zoning tint**, at `src/rendering/phaser/tile-layer.ts:358-363`, at the
   time this was written one of two alphas depending only on whether art is
   under it:

   `const alpha = floors[localY * size + localX] === undefined ? ZONING_TINT_ALPHA : ZONING_TINT_ALPHA_OVER_ART;`
   (that line stood in `src/rendering/phaser/tile-layer.ts` on the commit this
   document was cut from; it does not any more.)

   **Amended 2026-09-07, kept above rather than rewritten per
   `docs/AGENT_WORKFLOW.md` §4: "one of two alphas" stopped being literally
   true the day this line changed, and this document must not restate ADR
   0101's own status to explain why -- only cite it.** ADR 0101 obliges a
   per-room alpha over floor art for eight of the eighteen room-id tints,
   because `env.floor.institutional`'s own colour leans toward several of
   those tints' complements strongly enough that the flat 0.14 blend read as
   *less* coloured than the bare floor. The line today is —

   `const alpha = floors[localY * size + localX] === undefined ? ZONING_TINT_ALPHA : zoningTintAlphaOverArt(sample.zoning);`
   (verbatim in `src/rendering/phaser/tile-layer.ts`)

   — so "one of two alphas" is now one of up to five in the shipped table
   (the flat `ZONING_TINT_ALPHA_OVER_ART`, three further per-room values
   between it and the cap, and `ZONING_TINT_ALPHA` itself, where the per-room
   search lands for four of the eight raised rooms); see `zoningTintAlphaOverArt`
   (`src/rendering/world/appearance.ts`) for the per-room table and
   `docs/adr/0098-what-says-which-room-this-is.md`'s own amendment for what
   this costs that document's pairwise-distance table. **This document's own
   decision 3 — the tint's channel belongs to identity, the boundary's to
   condition — is untouched by any of it**: which alpha a given room's tint is
   painted at is beneath that allocation, not a change to it, exactly as the
   paragraph below already says about which *table* the tint reads.

   and resolved, at the time this was written, through a table keyed by the
   room's **category**:

       return ZONING_TINT_BY_CATEGORY[room.category];

   (that line stood in `src/rendering/world/appearance.ts` on the commit this
   document was cut from; it does not any more.) **Superseded, 2026-09-06:**
   [ADR 0098](./0098-what-says-which-room-this-is.md) option A, chosen by the
   owner the same day, keys that table by the room's own catalogue id instead
   -- `ZONING_TINT_BY_ROOM_ID[room.id]` (verbatim in
   `src/rendering/world/appearance.ts`) -- for the reason ADR 0098 Context §2
   and decision 3 give. Nothing about *this* document's decision 3 (condition
   goes to the boundary, identity stays on the tint) moves: which table the
   tint reads is beneath the allocation this ADR made, not a change to it.

3. **The edge art**, `EDGE_ART_BY_NUMERIC_ID`
   (`src/rendering/world/environment-art.ts:125-128`), two rows: a wall and a
   door, each a face and a cap.

Nothing else in that method reads anything that could vary with how a room is
doing. Ownership shading (`:368-370`) and the owned-land outline (`:374-386`)
are the only other state on the tile, and both are about *land*, not about
rooms.

**So the 4.11% is not a rendering defect with a rendering fix. Room readiness,
occupancy and need satisfaction are not inputs to the view at all**, and the
door is 4.11% of the pixels because the door is the only thing in that frame
that changed a value the painter reads.

### 3. The one state indicator the world view does have, and its scope

VERIFIED, read. `alphaFor` (`src/rendering/phaser/tile-layer.ts:622-631`) draws
an unfinished build order translucent, from two constants:

`export const PLANNED_ALPHA = 0.35;` `export const BUILDING_ALPHA = 0.65;`
(both verbatim in `src/rendering/world/appearance.ts`)

That is the whole of it, and it is about *construction*, not about operation. It
is also, by #1018's account, the only thing that animated in either of the two
long runs: *"The one thing it animates is construction."*

### 4. What the simulation holds and does not send

VERIFIED, read. The state a "does it work" cue would need already exists,
already crosses the worker boundary, and already reaches the screen — on a
**different channel, into a panel**.

`RoomListRowViewModel`
(`src/simulation/presentation/room-projection.ts:322-389`) carries, per room
instance: `occupancy`, `objectCapabilities`, `concurrentUse` (the per-capability
ceiling and the live count against it), `access` — `RoomPerimeterAccess`'
`'no-way-in'` / `'gap'` / `'doorway'` vocabulary, the state
[#938](https://github.com/woogitsu/lockstate/issues/938) measured — and
`requirementSummary`, counts over the catalogue's `object` requirements. The
room's own rectangle is on the instance: `RoomInstance.anchorTile`, `width` and
`height` (`src/simulation/prisoners/room-instance-registry.ts:75-82`).

The render frame carries none of it. Its four fields are:

`readonly revision: number; readonly world: WorldRenderView; readonly structures: readonly RenderStructure[]; readonly actors: readonly RenderActor[];`
(verbatim in `src/rendering/feed/render-feed.ts`)

So the fact is produced, projected, versioned and drawn — into the Rooms panel.
**The gap is not knowledge. It is that no route exists from that knowledge to a
pixel on the map.** That matters for costing: every option below is a
*transport* decision before it is an art decision.

### 5. The channel question, which is the finding this document did not expect

VERIFIED, read, and it is the reason "reuse the existing tint machinery" is not
the cheap option it looks like.

Since ADR 0040 slice 1 the render frame arrives on **two channels with
different freshness**:

- **Actors** arrive unsolicited on `simulation/delta`, on a 100 ms ceiling,
  as a transferred `array-buffer`.
- **Geometry** — `world` and `structures`, which is everything the tile layer
  draws — arrives only in reply to a snapshot request, and the feed asks for one
  only when it believes the world can have changed:

  `const due = this.dirty || (this.clockRunning && nowSeconds >= this.nextPollAt);`
  (verbatim in `src/rendering/feed/simulation-snapshot-feed.ts`)

  with `const DEFAULT_POLL_INTERVAL_SECONDS = 30;`
  (verbatim in `src/rendering/feed/simulation-snapshot-feed.ts`)

`dirty` is set at exactly five places in that file, and they are worth listing
because the list is what decides the cost of every option below:
`simulation/ready` (`:243`), the clock *transition* into running (`:279`), an
unsolicited `clock-state` reporting a tick at or past the highest
`scheduledForTick` an acceptance named (`:304`), a `command-result` with status
`queued` (`:311`), and a request presumed lost (`:361`). `docs/RENDERING.md:170-178` states the same set
in prose.

**Every one of them is a fact about a message the main thread sent or received.
None of them is a fact about the simulation.** So a quantity that changes
because the simulation ticked — occupancy, need satisfaction, a requirement
becoming satisfied — is invisible to this channel until the 30-second
consistency poll, and invisible for ever while the clock is paused.

That is the constraint. **A condition cue drawn by the tile layer inherits a
30-second staleness bound**, and a cue that is 30 seconds stale about whether a
cell is working is worse than no cue, because it is a false one.

### 6. The undiagnosed door, diagnosed

#1018 recorded one observation with no explanation and said so plainly —
*"I do not know why the door was still drawn as a construction block after the
queue said empty"* — and named two candidate readings it could not separate: a
render phase that lags the simulation, or the queue readout emptying before the
order does. **It is the first, and the second is ruled out.**

**The second is ruled out.** VERIFIED, read: the Build panel's readout counts
every non-terminal order, declared as a tuple precisely so the judgement can be
read:

`export const PENDING_BUILD_ORDER_STATES = [ 'planned', 'approved', 'materials-pending', 'assigned', 'in-progress', ] as const;`
(verbatim in `src/simulation/presentation/construction-projection.ts`)

All five states an unfinished order can be in are counted, so `0 waiting · 0
being built` cannot be produced by an order that has not finished. The queue
readout was telling the truth.

**The first is the cause.** REASONED from the code opened in §5, and it is the
mechanism §5 describes, met in the wild:

- The two surfaces are on different channels. The Build queue is a *pull*
  projection re-read on the worker's clock heartbeat — `BuildQueueReader.read`
  (`src/ui/simulation-build-queue.ts:188-200`), whose own docblock prices the
  cadence at *"up to about four a second"*. The drawn world is the 30-second
  consistency net.
- A build order **completing** is a worker-side event. It matches none of the
  five `dirty` triggers: the command that created it was accepted many ticks
  earlier, and `awaitedCommandTick` is the tick the *order* was scheduled for,
  not the tick the crew finishes it. Since
  [#348](https://github.com/woogitsu/lockstate/issues/348) made the crew the
  constraint — one order in progress at a time — those two ticks are far apart;
  `src/simulation/presentation/construction-projection.ts:26-31` records twelve
  wall segments moving from tick 70 to tick **730** under that change.
- So between the completion and the next poll, the renderer holds a world in
  which the door is unbuilt, and paints the order's own block from the
  construction snapshot at `PLANNED_ALPHA` or `BUILDING_ALPHA`. #1018 describes
  frame 3 as *"a translucent tan block sitting in the wall line"*, which is
  those constants and not the finished door.
- There is a second, sharper failure mode in the same window, and it is worth
  naming because it produces an *opaque* block rather than a translucent one.
  The painter drops a completed wall or door only when the row it is painting
  really carries an edge on that tile:

  `if (isDrawnAsWorldEdge(structure) && edgeTileXs.has(structure.tileX)) continue;`
  (verbatim in `src/rendering/phaser/tile-layer.ts`)

  That guard exists so a save written before
  [#74](https://github.com/woogitsu/lockstate/issues/74) — completed orders, no
  edge values — still gets its walls. But its condition is also met by a
  *stale* world view: if the construction snapshot has advanced to `completed`
  while the edge layers have not, `edgeTileXs` is empty at that tile and the
  finished door is painted as a full-tile opaque slab. Whether act 8 hit this
  branch or the translucent one is not established here.

**This is not a new defect; it is a second instance of one already measured and
never filed.** `docs/research/2026-08-29-playtest-ordering-and-the-second-room.md`
§7 hypothesised exactly this mechanism for *walls* on 2026-08-29 and MEASURED
the window: the walled region was byte-identical for **9.7 seconds** after the
Build panel said the queue was empty, then changed once at +12.5 s. Its table
names three surfaces disagreeing at once, only the first current. It also named
its own weakest claim — *"that the 30-second snapshot poll is why the note is
wrong"* — and the falsification it wanted: *"mark the feed dirty on a completed
construction order and re-run the one-second transcript"*. `tests/browser/playtest-harness.ts:431-434`
carries the same finding as a working comment beside a twelve-attempt retry loop.

What this document adds is the half that record could not reach: the `dirty`
trigger list has been opened and enumerated, and **no member of it can fire on
an order completing**. That converts §7's hypothesis into a statement about the
code. It does not convert it into a reproduction — see §10.

**It should be its own issue and it is not this ADR's to fix.** It is a defect
with a named cause and a one-line candidate fix (mark the feed dirty when the
construction snapshot's completed set grows), and folding it into a design
question about what the view communicates would bury it. This document records
the diagnosis and hands it over.

### 7. What is landing beside this, and why it changes the arithmetic

Two other agents are working the same pixels right now.

**#1020 — the first real object sprite.** `SPRITE_BY_OBJECT_ID` is empty today
(`src/rendering/world/environment-art.ts:186`) and `objectArtCoverage()`
(`:203-210`) already splits the catalogue into `drawn` and `onFallback`, so the
first row is one line and an atlas entry.

**THAT SENTENCE STOPPED BEING TRUE THE SAME DAY, AND IT IS KEPT RATHER THAN
REWRITTEN BECAUSE WHAT FALSIFIED IT IS THE THING IT PREDICTED.** #1028 landed
at `01fef637` (v0.0.503): `SPRITE_BY_OBJECT_ID` now holds one row, `'object.bed'`
(`src/rendering/world/environment-art.ts:260-262`), `objectSprite` is read by
the painter inside `acquireObjectSprite` before it falls back to `paintSlab`,
and `objectArtCoverage()` is at `:280-287`. The estimate the clause carries —
one row plus an atlas entry — is what that merge actually cost, so option D's
"let #1020's first object sprites land and re-measure" is now a measurement
that can be taken rather than a wait. **That work delivers a large part of
"does it work" for free, and this document should not price an option as if it
did not exist**: a cell drawn with a recognisable bed and toilet, against a cell
drawn as a bare rectangle, communicates *requirement satisfaction* — which is
most of what the Rooms panel's "not ready" block is about — without any new
channel, because a placed object is a completed build order and already reaches
the renderer on the `structures` array.

What object art does **not** communicate is everything that changes while the
prison runs: occupancy, need satisfaction, concurrent-use pressure, and
`'no-way-in'`. Those are §4's fields and §5's channel problem, and they are what
is left for this decision after #1020 lands.

**#1021 — 18 room types share 11 category tints.** MEASURED and VERIFIED in that
issue: `ZONING_TINT_BY_CATEGORY` — which no longer exists;
`ZONING_TINT_BY_ROOM_ID` (`src/rendering/world/appearance.ts:118`) replaced it
on 2026-09-06 at `6ae68237`, with 18 rows keyed by room id — has 11 rows and
`src/content/room-catalog.ts` defines 18 rooms (VERIFIED by count:
`roomCategorySchema` at
`src/content/room-catalog.ts:9-21` enumerates eleven categories, and eighteen
distinct `id: 'room.*'` literals appear in that file), so twelve room types
collapse onto six tints and seven room types are drawn identically to another.

**The two decisions compete for one channel.** The tint is a hue washed over a
photographic floor at 14% alpha, and both "which room is this" and "is this room
working" want that same mark. #1021's cheapest direction — key the tint by room
id, 18 rows instead of 11 — consumes the hue budget entirely. Any option here
that modulates the tint's hue, value or alpha to say "ready" is spending the
same budget a second time, on top of a wash the code's own comment
(`src/rendering/world/appearance.ts:101-110`) already argued down from 0.28
because at full strength *"a photographed linoleum floor stops reading as a
floor and becomes a coloured rectangle again"*. Whichever of the two lands first
constrains the other, and neither issue can see that from where it stands.

---

## Decision

Proposed, not approved. Four parts.

### 1. What the world view is required to communicate

**The world view is required to answer three questions, in this order of
obligation, and today it answers only the first and answers it badly.**

1. **What is here** — the extent of the prison, what is built, what kind of room
   a patch of ground is. *Partly met.* The floor and edge art meet it for
   structure; #1021 establishes it is not met for room identity, and #1020's
   empty object table means it is not met for contents.
2. **Whether what is here works** — for each room a player can see: is it
   finished, can anything get into it, is it being used, is it keeping up.
   *Not met at all, and this is the decision's subject.*
3. **What is happening** — that the prison is a place where people go places.
   *Not met, and §10 records that this document has not established whether the
   cause is the renderer or the simulation.*

**Obligation 2 is the one this ADR asserts as a requirement**, on
`AGENTS.md`'s standing mandate that playability counts as correctness: a
management game whose main view is stable across the difference between a
functioning cell and a dead one is asking the player to read panels and treat
the world as wallpaper. It is not asserting that the world view must carry
*every* fact the Rooms panel carries — see decision 4.

### 2. A condition cue must ride a channel that is not the 30-second net

**Recommended.** Any mark that means "this room is working" must be refreshed on
the `simulation/delta` cadence, not on the geometry snapshot's. §5 is the whole
argument: a 30-second-stale claim about whether a cell is working is a false
claim, and the failure mode is not hypothetical — §6 is that failure mode,
already on screen, already mistaken for a rendering bug by a competent observer
with a screenshot pair.

**This has a corollary that costs a renderer module.** `TileLayer` repaints on a
change of `revision` or of visible range and on nothing else
(`src/rendering/feed/render-feed.ts:43-46`), and `revision` is deliberately
geometry-only — `SimulationSnapshotFeed.applyDelta`'s own docblock
(`src/rendering/feed/simulation-snapshot-feed.ts:395-402`) records that bumping
it for an actor delta would throw away ADR 0040 slice 1's entire saving. So a
live condition cue **must not be painted by `TileLayer`**. It belongs in a
separate display object, keyed by room instance rather than by tile, repainted
when a condition delta arrives. That is a new module in `src/rendering/`, and it
is the honest floor on the cost of every option in §8.

### 3. The mark should not be the zoning tint

**Recommended.** For §7's reason: the tint is #1021's channel, it is the only
thing distinguishing 18 room types today, and it is already at a deliberately
weakened alpha. A condition cue that modulates it forecloses #1021's cheapest
option and both marks get worse.

What is left, and what this document recommends be priced first: a mark at the
room's *boundary* rather than over its floor — the room rectangle is on the
instance (`src/simulation/prisoners/room-instance-registry.ts:75-82`) and the
painter already draws a boundary of exactly this kind for owned land, edge by
edge, at `src/rendering/phaser/tile-layer.ts:374-386`. A boundary uses a
different visual channel from a floor wash, so identity and condition stop
competing.

> **AMENDMENT, 2026-09-11 (issue #1022) — the owned-land precedent this
> paragraph cites is a technique, not a transport, and Option A is still
> unimplemented because the transport it needs does not exist.** VERIFIED,
> read, and checked against a mutation. `tile-layer.ts:374-389`'s owned-land
> outline draws by asking `world.isTileOwned(tileX, tileY ± 1)` **per tile** —
> ownership is a boolean field on `TileSample` (`owned`, one of the six fields
> `world-view.ts:36-46` enumerates), with no concept of *which parcel*, only
> *owned or not*. That is the same shape `src/rendering/world/room-labels.ts`
> uses for a room's **type**: a 4-connected flood fill over one scalar field
> (`zoning`), boundary drawn where the field's value changes. Neither reads a
> wall or a door edge, and `room-labels.ts`'s own docblock says why for its
> case: *"The renderer has no room-instance identity."* (verbatim in
> `src/rendering/world/room-labels.ts`) Its test suite pins the consequence as a passing assertion
> (`tests/unit/rendering-room-labels.test.ts:106-122`, *"gives two adjacent
> rooms of the SAME type one name, and it is true of every tile under it"*) —
> mutated here (`fillRegion`'s neighbour check forced to `continue`
> unconditionally) and watched go red, 9 of 14 in that file including this one
> (`AssertionError: expected … to have a length of 1 but got 12`), then
> reverted to a clean `git diff`.
>
> **A condition mark cannot be built the same way, and this is why it
> matters here rather than being a tidiness note.** Two adjacent `room.cell`
> instances sharing a wall are two different answers to `roomAccess`
> (ADR 0108) — one may be `'doorway'`, the other `'unreachable'` — and a mark
> derived from a per-tile scalar field the way the owned-land outline and the
> room-name flood fill both are would merge them into one boundary and one
> verdict, exactly the class of false claim this document's decision 4 and
> `AGENTS.md` reservation 4 both refuse. So decision 2's *"keyed by room
> instance rather than by tile"* is not a stylistic preference this paragraph
> can satisfy with the existing technique — it is a hard requirement the
> existing technique cannot meet, because **no room-instance identity or
> rectangle reaches the render side of the worker boundary at all today.**
> `RenderFrame` (`src/rendering/feed/render-feed.ts:42-51`) has exactly three
> data fields — `world`, `structures`, `actors` — and none of them carries a
> room instance id or rectangle; `RenderStructure` (`src/rendering/world/structures.ts`)
> is walls, doors and build orders, not rooms. `roomAccess` and the rectangle
> it is asked about both live worker-side, in `room-projection.ts`, and reach
> only the HUD's `RoomListRowViewModel` (ADR 0108's own wiring, confirmed live
> in `docs/research/2026-09-11-does-unreachable-show-in-the-world.md`) — never
> the render channel `TileLayer` reads.
>
> **What this changes about Option A's cost, which this document did not
> price.** Before a condition ordinal can ride the delta channel per
> instance, an instance's *identity and rectangle* have to reach the render
> side by some channel first — a fact Option A's costing (§8) assumed away by
> citing a same-shaped technique that in fact solves a different problem
> (a global boolean, or a room *type*, neither of which needs telling two
> instances apart). Whether that channel is a new field on the geometry
> snapshot (instance rectangles change rarely, so the 30-second net may be
> the right cadence for the shape while the condition ordinal beside it still
> needs the delta cadence decision 2 requires) or something else is a design
> question this document did not ask and should not be answered inside
> implementation code — `AGENTS.md`'s rule on architecture absent from an ADR.
> **Nothing is implemented under this ADR as of 2026-09-11** (confirmed by
> reading `RenderFrame`, `TileLayer`, the render-actors payload at
> `RENDER_ACTORS_SCHEMA_VERSION = 3` with no room-condition record, and
> `docs/adr/STATUS-QUEUE.md`'s own accounting of the window that merged this
> ADR, which lists no follow-on implementation commit); this amendment is
> filed so the next attempt starts from the real cost rather than the priced
> one.

### 4. What the world view is *not* required to carry

**Recommended, and it is the half that keeps this decision bounded.** Obligation
2 is a *warning* obligation, not a readout obligation. The world view owes the
player enough to know **which room to look at**; the Rooms panel owes the
detail, and ADR 0085's decision about what the HUD corner is for is not
reopened here. Concretely: a per-room condition ordinal small enough to be one
mark — not `concurrentUse`'s per-capability breakdown, not need percentages, not
occupancy counts.

That bound is what makes the delta payload in decision 2 small, and it is what
this document would defend hardest if the rest of it were rejected.

---

## Options, with their real costs

They differ by roughly an order of magnitude at each step, and the order is not
the order the issue guessed.

### Option A — a condition overlay, on the delta channel

**What it is.** A per-room-instance condition ordinal published beside the
actors, and a renderer module that draws one mark per room rectangle.

**Cost.**
- Simulation side: a projection reduction over state that already exists (§4),
  and a place in the render keyframe. `src/simulation/protocol/render-actors-payload.ts`
  defines `lockstate.render-actors` v1 as a fixed layout, so this is a payload
  version bump plus a writer in `src/simulation/worker/render-actors-keyframe.ts`
  — or a second `versionedPayload` kind alongside it, which ADR 0040's option 5
  priced and did not take.
- Renderer side: one new module, per decision 2. No change to `TileLayer`, no
  change to `WorldRenderView`, **no world-layer change and therefore no save
  schema version bump** — which is the property that makes this the cheapest of
  the three, and it is a property of publishing per *instance* rather than per
  *tile*.
- Art: none.

**What it does not solve.** It says a room is in trouble; it does not make the
prison look alive. Obligation 3 is untouched.

**Cheaper variant, priced honestly and not recommended.** The same overlay fed
from the existing geometry snapshot instead of a delta: no payload work at all,
perhaps a day's work in total — and it inherits §5's 30-second staleness, which
decision 2 rejects. It is listed because it is what "reuse the existing tint
machinery" actually reduces to, and because someone will propose it.

### Option B — per-state floor or edge art

**What it is.** A second floor sheet, or a second edge set, per condition:
`env.floor.institutional` and a neglected variant of it, selected inside
`zonedFloorSprite`.

**Cost, and this is the order-of-magnitude step.**
- **Art, measured against the code's own figure.** `environment-art.ts:202`
  records that *"each additional sheet is a whole ~1.5 MB download"*. A
  ready/not-ready pair for one floor is one extra sheet; a pair per category is
  eleven; and if #1021 takes its option 3 (split the floor sheets for identity)
  the two multiply — identity × condition, up to 36 sheets, tens of megabytes on
  first load. ARITHMETIC from that one constant, not measured.
- **It rides the wrong channel and cannot be moved off it.** The floor sprite is
  chosen inside the chunk paint (`src/rendering/phaser/tile-layer.ts:333`) and
  cached per chunk until the revision moves, so it is the 30-second net by
  construction. Making it live means repainting chunks on the delta cadence,
  which is precisely the cost ADR 0040 slice 1 removed.
- **It invalidates a run optimisation.** `mergeFloorRects` collapses a zoned
  room into greedy rectangles — *"a zoned room is one sprite, not one per
  tile"* (`src/rendering/phaser/tile-layer.ts:64-66`). A per-condition sprite
  choice fragments those runs as conditions change.
- It also lands in `src/rendering/world/environment-art.ts`, which is #1020's
  surface this week.

**What it buys that A does not.** It reads without a legend. A floor that looks
neglected needs no key; a coloured boundary does.

### Option C — animating occupancy

**What it is.** Make the prison look inhabited: people going places.

**Cost, and it is not a rendering cost at all.** VERIFIED, read: the transport
already exists and is proven. `RenderActor` carries continuous tile coordinates
*and* velocity (`src/rendering/feed/render-feed.ts:14-27`), arriving at a 100 ms
ceiling; ADR 0059 extrapolates between publications; and ADR 0092 MEASURED a
guard given a three-waypoint patrol route walking **2,392 of 3,000 ticks** and
publishing non-zero velocity on **2,392 of 3,000 render samples**
(`docs/adr/0092-who-decides-where-a-guard-stands.md:205-208`). Prisoners walk by
the same route: `ActionSystem` calls `beginWalk` at
`src/simulation/prisoners/action-system.ts:950`.

So if nothing moved in #1018's working cell, the renderer is not why. The cost
of option C is a **simulation** cost — whatever it takes for a prisoner in a
furnished cell to have somewhere to be — and it belongs to ADR 0042's
consequence chain and the regime work, not to a rendering decision. §10 records
that this document has *not* established which it is, and that the measurement
that would settle it is cheap.

**It is listed as an option because the issue listed it, and the honest answer
is that it is not this ADR's to take.**

### Option D — let #1020 discharge as much of obligation 2 as it can, and re-measure

**What it is.** Land the first object sprites, re-run #1018's act 8 comparison,
and see how much of the 4.11% closes without any new channel.

**Cost.** Nothing this decision has to pay. It is work already sanctioned.

**Why it is on the list.** §7's argument: a furnished cell drawn as a furnished
cell answers *"is it finished"* — the single largest component of the Rooms
panel's readiness verdict — with no transport work at all. **It cannot answer
anything that changes while the prison runs.** So D is not an alternative to A;
it is the thing that should be measured before A's payload is designed, because
it decides how small A's ordinal can be.

---

## Consequences if this stands, and what each option forecloses

**Common to all of them.** Asserting obligation 2 as a requirement makes the
world view a consumer of simulation state that is not geometry. That is a
boundary this repository has kept clean on purpose (`AGENTS.md` boundary 1:
rendering is not simulation) and the way to keep it clean is decision 4's bound
— a small derived ordinal, projected the way `room-projection.ts` already
projects, never a renderer reaching into a registry.

**Option A forecloses**: the boundary as a decoration channel. Once a room's
edge means "condition", a later decision cannot use it for selection highlight,
security sector, or the parcel outline without collision. It also puts a second
consumer on `lockstate.render-actors`' version, so ADR 0040 slice 2 (guards) and
this would want to land in one version bump rather than two.

**Option B forecloses #1021 option 3 outright.** #1021's third candidate
direction is to split the floor sheets for *identity* — which
`zonedFloorSprite`'s own docblock anticipates: *"This returns per zoning id
rather than per category so a later split -- concrete for utility and logistics,
linoleum for the rest -- is a change in this function and nowhere else."* That
sentence is true only while the function's answer depends on one thing. Making
it depend on identity *and* condition is a multiplication in the sheet budget,
and the two issues would each be reasonable and jointly unaffordable.

**Option A forecloses part of #1021 too, and this is the collision the brief
asked to be named.** Both issues aim at the same 14%-alpha wash over the same
floor. `ZONING_TINT_BY_CATEGORY` (`src/rendering/world/appearance.ts:85`) — a
constant that no longer exists, and the paragraph below is what survives its
going — is load-bearing for both decisions. Decision 3 above resolves the
collision *in
this document's favour* by moving condition to the boundary and leaving the
tint to identity — but that is a recommendation, not a settled split, and if
the owner prefers condition on the floor then #1021 must be told before it
chooses, because its cheapest option becomes unavailable.

**Read this before acting on the paragraph above. Checked 2026-09-08: both
decisions survive the move, and it is the last sentence that is spent rather
than the claim.** The table is now `ZONING_TINT_BY_ROOM_ID`
(`src/rendering/world/appearance.ts:118`), keyed by the room's own catalogue id
with 18 rows instead of 11 — #1021's cheapest direction, taken as
[ADR 0098](./0098-what-says-which-room-this-is.md) option A at `6ae68237` on
2026-09-06, the day after this document was accepted. Three consequences, and
only the third changes what a reader should do:

- **Decision 3 holds, and holds harder than when it was written.** ADR 0098 §4
  says so from the other side — *"This document accepts that allocation"* — and
  its Context §2 is an argument for decision 3 that this document did not have.
  The hue budget this paragraph prices as fully consumed is now measurably
  spent: eighteen hues at an even 20° spacing, worst pair 6.02 effective units,
  against the eleven that shared one dimension unevenly before.
- **The alpha budget has since been spent too, which this paragraph did not
  foresee.** *"The tint is a hue washed over a photographic floor at 14%
  alpha"* is now the floor of a per-room range rather than the whole of it:
  ADR 0101, accepted on 2026-09-07 and landed at `551c9804`, raises eight of
  the eighteen rooms above
  `ZONING_TINT_ALPHA_OVER_ART` towards a cap of `ZONING_TINT_ALPHA`, because at
  a flat 0.14 those eight blended to *less* colour than the untinted floor. So
  hue and alpha are both carrying identity now, and an option that modulates
  either to say "ready" is spending a budget with less left in it than this
  paragraph priced.
- **The last sentence can no longer be acted on.** #1021 has chosen. Telling it
  "before it chooses" is not available; if the owner now prefers condition on
  the floor, the cost is reopening two accepted ADRs and the shipped table they
  landed, which is a different and larger decision from the one this paragraph
  offers.

**Option C forecloses nothing in the renderer** and, if taken, would make A's
mark less necessary rather than more: a prison whose people visibly move
communicates "it works" without a legend at all. That is an argument for
measuring C's blocker before designing A, and §10 says why it has not been.

**#1020's landing changes what "the world shows" means, and every option above
is written against it.** The first object sprite is the first time the world
view will carry a fact about a room's *contents* rather than its category. Should the
owner take this document up after that lands, decision 4's ordinal should be
re-derived: whatever object art already says, the ordinal must not repeat.

---

## Open questions

1. **Whether the world view's stillness is a renderer fact or a simulation
   fact.** Option C turns on it and this document did not settle it. §8's option
   C shows the transport works for a guard with a route; it does not show that a
   prisoner in a furnished cell ever chooses a destination. **The cheap
   measurement:** read `RenderFrame.actors`' `deltaX`/`deltaY` over act 8's run
   instead of hashing pixels. #1018's own record proposes the same instrument
   for a neighbouring claim — *"read the `structures` array the scene draws
   from, or diff the two frames rather than hashing them"*.
2. **Which of §6's two branches act 8 hit** — the translucent unfinished block,
   or the opaque completed-order slab the stale-edge guard lets through. The
   screenshots exist and the two are distinguishable by alpha.
3. **What the mark is when a room is in more than one kind of trouble** —
   unfinished *and* unreachable, say. Decision 4 bounds the payload to one
   ordinal, which forces a precedence order this document does not propose.
4. **Whether obligation 2 extends to things that are not rooms** — a corridor
   nobody can pass, a delivery bay with nothing in it. Everything above is
   scoped to room instances because that is where the state lives.
5. **Whether a condition cue should be suppressed at low zoom.** #1023 is
   working the zoom surface; at 0.2 a 32×32-tile world fits the viewport
   (#1018 §4, MEASURED at 580px = 32.1 tiles) and a per-room boundary at that
   scale is a few pixels.

---

## The weakest claim in this document, named

**That a 30-second-stale condition cue would be worse than none.** It is the
load-bearing premise of decision 2, and it is a *judgement about play*, not a
measurement. Nobody has played this game with such a cue. The argument behind it
is §6 — an observer with screenshots was misled by exactly this staleness about
exactly this kind of fact — but that observer was reading a construction phase,
which changes once, and a condition cue changes constantly, so the analogy is
not tight. **If it is wrong, option A's cheap variant is the right answer and
the payload work in decision 2 is waste.** The cheapest falsification is to
build the cheap variant behind the existing snapshot channel and watch someone
play with it.

Second weakest: **§6's diagnosis is a code-path argument, not a reproduction.**
Every `dirty` trigger was opened and none of them can fire on an order
completing, and the 2026-08-29 record measured a 9.7-second window that fits.
But this document did not instrument the feed and did not re-run act 8. The
falsification the earlier record asked for is still the right one: mark the feed
dirty when the completed set grows and re-run the transcript. If the window
survives, the cause is elsewhere and §6 is wrong.

Third: **option B's art figure is arithmetic from one constant** in a comment
(`~1.5 MB` per sheet), multiplied by a sheet count nobody has authored. The
order of magnitude is what the argument needs and the exact number is not
claimed.

---

## What would change my mind

- **A measurement after #1020 lands** showing that object art alone closes most
  of the 4.11% and most of the readiness question. Then option D is the whole
  answer for a while and decision 2's payload should not be built yet.
- **Evidence that prisoners do move** in a working prison and #1018's act 5 and
  act 8 were both measuring prisons where nothing legal could happen. Then
  obligation 3 is met, obligation 2 is much less urgent, and the world view is
  already telling the player more than the pixels suggested.
- **The owner preferring condition on the floor.** Decision 3 is a
  recommendation about visual channels, and it is the decision here least
  supported by anything but taste. If it goes the other way, #1021 needs to know
  before it chooses.
