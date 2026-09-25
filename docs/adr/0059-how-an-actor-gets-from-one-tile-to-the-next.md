# ADR 0059: How an actor gets from one tile to the next

## Status

**Proposed, 2026-08-28.** Written on `agent/414-delta-channel`, with the
implementation on the same branch; re-measured after merging `main` at
`6c23974`, which brought [ADR 0062](./0062-who-gets-the-room-when-more-prisoners-want-it-than-it-seats.md)
and the larger prison that moved this decision's one free parameter. Nobody has
approved it; the argument below is the whole of the warrant, and a reader who
disagrees with it should treat the decision as open.

**The number was assigned centrally before this draft existed**, per
`AGENTS.md` and `docs/AGENT_WORKFLOW.md`. **0058 and 0060 were handed out in
the same pass and returned unused** -- the keyboard work and the needs work each
declined to write an ADR rather than manufacture one -- 0061 is held by a draft
in flight, and 0062 landed on `main` on 2026-08-28 for the contention-fairness
decision this one had to be merged against. The index's `Next free number` is
therefore `0063` and not `0060`: the contract is `max` on disk `+ 1`, not the
lowest gap. If 0059 turns out to have been taken by something that has not
merged, this document, its row in `docs/adr/README.md` and every citation of it
are renumbered without argument.

**Open question 3 was ruled by the owner on 2026-09-23, and nothing else in
this document moved with it** (issue
[#1373](https://github.com/woogitsu/lockstate/issues/1373)). The owner chose,
from options a session wrote, the one labelled *"Zapisuj marsz (zalecane)"* --
"save the walk (recommended)". **That is the weaker provenance**: the label of
an option, not a sentence the owner typed. What it authorised, in the issue's
own record of it: a save carries a travelling prisoner's route, their progress
along it and any pending path requests; restoring and continuing is the same
game as never having saved; the field is optional, so older saves restore as
they did. It answers open question 3 with **Option 5** below, which this
document had recommended against; the recommendation of Option 4 is left
standing as the argument it was, and the amendment under "Determinism" records
what was built. The ADR's own status is unchanged by the ruling -- it is still
the draft described in the paragraph above -- because the owner ruled on one
question, not on the document.

---

## The decision, in one sentence

**An actor that has a resolved route walks it, one tile at a time, at a fixed
speed of one tile per two kernel ticks, with the sub-tile progress held in a
transient store that no save carries — so a position changes every tick instead
of twice per errand, and the render channel gains a real position, velocity and
heading to publish.**

---

## What the code did, and why the render channel could not fix it

Issue #414 is titled *"there is no delta channel … so actors teleport"*. **The
first half of that has been false since ADR 0040 slice 1 landed**, and the
premise is worth correcting before the decision is read:

- Actors reach the renderer on an unsolicited `simulation/delta` at a **100 ms**
  ceiling (`src/simulation/worker/state-machine.ts`'s
  `RENDER_DELTA_PUBLISH_INTERVAL_MS`, published from `publishRenderDelta` in
  `onTickLoop`). It is reached in a real session: `src/main.ts` constructs the
  feed, `src/simulation/worker/worker.ts` constructs the state machine.
- The 2 s full-snapshot poll #414 measured is **30 s** and carries geometry
  only (`src/rendering/feed/simulation-snapshot-feed.ts`'s
  `DEFAULT_POLL_INTERVAL_SECONDS`).
- The deep `isJsonValue` walk is off the render hot path: the delta's body is an
  `array-buffer` payload the boundary validates by `byteLength` alone.

**What was left is the whole of the remaining defect, and it is not transport.**
`ActionSystem.continueTravelling` wrote the destination anchor into
`PositionComponent` in the same statement that resolved the route:

```ts
// Abstracted arrival: teleport onto the destination anchor tile.
this.position.tileX[index] = instance.anchorTile.x;
this.position.tileY[index] = instance.anchorTile.y;
```

`src/simulation/prisoners/components.ts` says the same thing about the
component: *"Movement here is abstracted: an entity's position updates only on
arrival at a resolved route's destination."* The route's waypoints — which the
router had already computed — were discarded one statement earlier by
`this.navigation.clearResult(requestId)`.

So an actor's authoritative position changed **twice per errand**, and ADR 0040
measured the consequence and refused to paper over it: *"A channel at any
cadence therefore delivers fresher teleports, not walking … That needs its own
decision about simulation-side locomotion, and this ADR does not take it."* Its
open question 1 asks who takes it. This is that decision.

The same convention is stated in five other places, and they are the sweep:
`src/simulation/security/patrol-system.ts:147-150`,
`src/simulation/security/deployment-system.ts:207`,
`src/simulation/incidents/response-system.ts:629`,
`src/simulation/contraband/search-system.ts:325` and — until
[ADR 0093](./0093-a-carry-is-an-action.md) **deleted the file** —
`prisoners/job-worker-adapter.ts:30-31`. The fifth site is
therefore no longer a site: a carry is a prisoner action now and walks like
any other.

---

## Options, with their real costs

### Option 1 — publish the journey and let the renderer play it back

The simulation keeps its abstracted arrival; the channel additionally carries
"this actor went from A to B at tick *n*", and the renderer animates the walk.

- **Cost:** cheap, and wrong in the way this repository has already named. The
  renderer would be drawing a position no system holds, so a panel reading the
  projection and a sprite on the map would disagree about where a prisoner is;
  and the actor would be drawn walking a straight line through whatever is
  between A and B, because a straight line is all the renderer could invent
  without also carrying the path.
- **Rejected.** It is a renderer-side movement model — `AGENTS.md` boundary 1 —
  and `src/rendering/feed/actors-from-snapshot.ts:36-41` already refuses the
  smaller version of it.

### Option 2 — a continuous position in the kernel, floating point

An actor holds a `Float64` world position and a velocity; the arrival is a
distance test.

- **Rejected on ADR 0020.** The kernel's state must be reproducible from a seed
  and byte-comparable across a save round trip; an accumulating float is exact
  in practice and awkward to argue about, and every snapshot comparison in
  `tests/determinism/` would be comparing floats. Integers cost nothing here.

### Option 3 — tile-by-tile stepping, whole tiles only

The actor's tile changes every *k* ticks along the route; nothing sub-tile
exists.

- **Cost:** the smallest change, and it delivers the simulation half. It does
  **not** deliver the visible half: at one tile per two ticks the renderer sees
  a one-tile jump ten times a second, and it cannot smooth it, because
  extrapolating from a whole-tile position that has not moved yet makes an actor
  oscillate — draw `5 + v·t` until the tile flips, then start again from 5.
- **Rejected** for that reason: the deliverable is that the game stops looking
  like a slideshow, and this is a slower slideshow.

### Option 4 — tile-by-tile stepping with sub-tile progress (recommended)

Option 3, plus an integer offset within the current tile, in `1/256` of a tile.
The position component keeps holding the **tile** an actor occupies, so every
existing reader — projections, the navigation origin, sector occupancy — is
untouched; a new `LocomotionStore` holds where within it.

- **Cost:** one `Map` iteration per tick over the actors *in transit*, not over
  the population, plus one entry allocated per journey. The render payload grows
  from 16 to 20 bytes an actor.
- **What it buys that Option 3 does not:** a published position that advances
  every tick, so the renderer can advance it between publications from a
  published velocity rather than from a guess.
- **The price, and it is the real one:** travel takes time, and every figure in
  this repository that depends on *when* a prisoner starts an action moves. See
  "What this costs" below; thirty-five assertions across fifteen integration
  files were re-measured.

### Option 5 — Option 4, plus persisting the walk

As Option 4, with the waypoint list and the offset written into the save so a
restored session resumes mid-stride.

- **Cost:** a save-schema field and therefore ADR 0038's compatibility
  question, in the same week another branch is changing save generations.
- **Not taken**, and open question 3 records exactly what it would buy: a save
  taken mid-journey currently restores the prisoner **idle on the tile they had
  reached**, which is the rule `PrisonerOperationsRuntime.loadSnapshot` has
  always had for travellers and is now reached far more often.
- **Taken on 2026-09-23, by the owner's ruling on open question 3** (see
  "Status" and the amendment under "Determinism"). The bullet above is kept as
  it was written: it is what this document decided before the ruling, and
  "currently" in it means the code before #1373.

---

## Recommendation, and why

**Option 4.** Three reasons, in order of weight.

1. **It is the only option that makes the published position true and
   continuous at the same time.** The renderer's half of #414 has been finished
   and proven since ADR 0040 — `ActorPose`, the 8-direction atlases, the pooled
   `ActorLayer` — and was waiting on data. Option 4 is the smallest change that
   supplies data rather than a story about it.
2. **It costs no save format and no new persisted concept.** A walk is the
   second half of the transient travel state `loadSnapshot` already drops
   (`PrisonerOperationsRuntime.loadSnapshot` drops every restored traveller to
   `idle` because their path request named a queue entry a rebuilt
   `NavigationSystem` does not hold), so it is dropped for exactly that reason
   and `SAVE_SCHEMA_VERSION` does not move.
3. **It is integer arithmetic on a four-neighbour graph.**
   `src/simulation/navigation/region-graph.ts`'s `neighbors` offers four
   neighbours, so every leg of every route this repository can produce is one
   tile along one axis. There are no diagonals to normalise, no leg longer than
   a tile, and the whole step is an integer add and a compare.

---

## The parameters, and how they were chosen

### Sub-tile resolution: 256 units to a tile

A power of two, and large enough that one tick of walking is several units so
nothing rounds to nothing. It reaches the wire unconverted (see "The payload").

### Speed: 128 units a tick — one tile per two kernel ticks, ten tiles a second

**A directional default, not a locked balance decision**, in the sense
`DEFAULT_SECURITY_SECTOR_REQUIRED_GUARD_COUNT` uses the phrase. It is bounded on
both sides by measurement rather than taste, and the lower bound was hit twice
before it settled here.

**The lower bound is starvation.** An in-game day is 2,400 ticks
(`regime.ts`), the general-population timetable's meal blocks are **100 ticks**
each, and a starter prison is one 32×32 chunk whose walled rooms make a
cross-prison path fifty tiles or so. A journey that outlasts the block that sent
the prisoner on it costs them the *next* block as well, and a prisoner who is
never idle inside a 100-tick meal block never eats at all.

| units/tick | tiles/s | ticks a tile | measured |
| --- | --- | --- | --- |
| 32 | 2.5 | 8 | `prisoner-roster-readout`'s prison (a cell and a yard) starves its prisoner: hunger **0** of `NEED_MAX` after five in-game days |
| 64 | 5 | 4 | that prison is fine (hunger 238), and `room-gated-needs`'s — a cell, a shower room and a yard — starves its prisoner: hunger **0** over ten in-game days (24,000 ticks at `DAY_LENGTH_TICKS` 2,400 — this row said twenty until #443 corrected the arithmetic in five places), in a prison that has built every room the six needs ask for |
| 96 | 7.5 | 2.67 | both prisons fed (hunger 135.5), with no margin: it is the first value that works |
| **128** | **10** | **2** | both prisons fed, and the value chosen — a clean two ticks a tile, and margin over the first value that worked |
| 256 | 20 | 1 | no better, and a blur on screen |

**The upper bound is that it stops reading as walking.** A tile is 64 px
(`src/rendering/tile-metrics.ts`), so ten tiles a second is 640 px/s at 1× zoom
— about eleven pixels a frame at 60 Hz, which the extrapolation smooths into
continuous motion but which reads as hurried. That is the trade this decision
makes, and the section below says what forces it.

**What the choice costs in a running prison**, measured in the six-prisoner
contended-canteen fixture over 12,000 ticks: prisoners spent **33–56%** of their
time travelling at 2.5 tiles a second and **18–28%** at 5, against **3.5%**
under the old abstracted arrival. The fraction at the shipped ten tiles a second
was **not** measured on that fixture — it is bounded above by the 18–28% band
and the shape of the day at that speed is instead visible in the census tables
those tests now carry.

### The tension this exposes, and it is not resolved here

**A 2,400-tick day is short enough that no walking speed is both visually
credible and cheap in game time.** A day is two real minutes at 1×, so the world
runs about 720× real time; a human walking at that scale would cross the prison
in a frame. Ten tiles a second is a compromise chosen to keep the *shortest
regime block* usable, and the fact that a speed had to be raised twice to stop
prisoners starving is a statement about `DAY_LENGTH_TICKS` rather than about
locomotion: at a longer day the same walk would be a smaller fraction of a
block and the art could have the slower pace it wants. That constant's own comment
already calls itself *"a candidate value, not a locked balance decision"*.
**Open question 1.**

---

## What changes in the simulation

1. **`LocomotionStore`** (`src/simulation/locomotion/locomotion.ts`) holds a
   walk — the route's waypoints, the index of the leg being walked, the progress
   along it — and the heading each actor last walked. `beginWalk` refuses a
   route whose legs are not one tile along one axis rather than cutting a corner
   through a wall.
2. **`LocomotionSystem`** (order **200**, `intervalTicks: 1`) advances them:
   after `NavigationSystem` (150), which produces the routes, and before
   `ActionSystem` (250) and the security systems, which ask whether a walk has
   finished. A walk that ends on tick *n* is acted on at tick *n*.
3. **`ActionSystem.continueTravelling`** hands the resolved route to the store
   instead of applying it, and `arrive` — the room check and the seat claim,
   unchanged — runs when the walk ends. Arrival is delivered by callback on the
   tick it happens rather than at the next reconsideration, because
   `intervalTicks` is 20 and collecting it on that cadence would have every
   prisoner stand at the door of the room they just walked to for up to a
   second.
4. **Simultaneous arrivals are dispatched in need-urgency order**, ties by
   ascending index. `LocomotionStore` hands the set of walks that finished this
   tick over in ascending key order — ADR 0005's canonical order, so a
   population that adds no order of its own still gets a total one — and
   `ActionSystem.onWalksArrived` re-sorts it with the comparator
   [ADR 0062](./0062-who-gets-the-room-when-more-prisoners-want-it-than-it-seats.md)
   added. **That is not tidiness.** ADR 0062 sorts `update`'s *arriving* pass
   for one measured reason: ADR 0029 decision 2 takes the claim on arrival, so
   ordering the selections alone fixed nothing. A walk moves the moment of
   claiming out of that pass, and sorting here is what keeps its guarantee true
   rather than true-on-the-tick-it-was-measured.
5. **An external write to a walker's tile ends the walk.** **There are now
   none such outside `prisoners/`, and this item read *"There is one such write
   outside `prisoners/`: `PrisonerJobWorkerAdapter.setPositionTile`"* until
   [ADR 0093](./0093-a-carry-is-an-action.md).** That adapter and the
   `JobWorkerAdapter` interface behind it were **deleted** with `JobSystem`: a
   carry is a prisoner action, so it walks through `LocomotionStore` like every
   other action and `ActionSystem.routeContextFor` is already the one
   expression for the clearance a carrier's doors are judged against. The rule
   stands and has no remaining site — which is the whole of what ADR 0093
   decision 3 bought. `releasePrisoner` forgets the walk *and* the heading
   before the index is recycled.

### What the walk did to the claim rule, and why one line was added

**ADR 0029 decision 2 claims a room's seat on arrival, not at departure**, and
prices the wasted trip as cheap: *"the design that cannot leak is worth two
wasted walks"*. That was priced against an abstracted arrival, where selecting
and arriving were the same tick. With a walk between them the window is the
whole journey, so the loser of a race went back to idle, re-scored the same
hunger, picked the same canteen — `findAvailableForUse` answers about *now*, and
a seat has usually come free again — and walked the whole way a second time.
**Measured, before the fix: two of six prisoners in the contended-canteen
fixture ended a 12,000-tick run at hunger 0 and 24 of `NEED_MAX`.**

`arrive` therefore calls `beginNextAction` on a refused claim rather than
returning to idle. It cannot loop: the seat was refused because the room is at
its ceiling *now*, so `findAvailableForUse` refuses the same instance in the
next statement and ADR 0041's candidate walk falls through to the next-best
action — the cell meal the prisoner would have got had the canteen been full
when they set out.

**ADR 0029 named this exact revisit condition and named the bigger answer**:
*"if wasted trips ever become expensive — a locomotion model where walking costs
time … the answer is a reservation with an explicit expiry, not a reservation
without one."* That is **open question 2**, not this document: a reservation
changes what a room's occupancy *means*, which is ADR 0029's own first objection
to it, and the one-line reconsideration does not.

---

## The payload

`schemaVersion` and the layout version both go to **2**, and the record grows
from four words to five. ADR 0003 decision 5 puts the read model's version
inside the payload, so this is not a protocol change, not an envelope change and
not a new message kind.

| Words | Meaning |
| --- | --- |
| `u32[0]` | layout version (`2`) |
| `u32[1]` | flags; bit 0 set = keyframe |
| `u32[2]` | `recordCount` |
| `u32[3]` | `removedCount` |
| then `recordCount` × 5 words | `u32` entity id; `u32` packed fields; `i32` x; `i32` y; `i16` velocity x + `i16` velocity y |
| then `removedCount` × 1 word | `u32` entity id no longer live |

**Twenty bytes an actor**, so a 5,000-actor keyframe is **100,016 bytes**
against layout 1's 80,016 and against the 596,659-byte session bundle ADR 0040
measured this channel against.

Three choices in that table are decisions rather than encoding:

- **Position is in sub-tile units, and the scale is the simulation's own**
  (`RENDER_ACTORS_SUBTILE_UNITS` is `LOCOMOTION_SUBTILE_UNITS` re-exported).
  Converting here would invent a precision the simulation does not have, which
  is the rule `actors-from-snapshot.ts` already sets for this data.
- **Velocity is per wall-clock second, not per tick.** The receiver advances a
  published position across a gap measured in milliseconds by a frame loop. A
  per-tick velocity would make the renderer responsible for the kernel's step
  duration *and* the player's current speed multiplier, and it would be wrong
  for a frame after every speed change. The worker knows both, so the worker
  multiplies.
- **The heading is two biased two-bit signs in the packed-fields word**, not a
  direction ordinal. Which of the eight authored sprite directions a sign pair
  maps to is `src/rendering/assets/direction.ts`'s decision, made against the
  art contract's `+x` east / `+y` south frame; an ordinal on the wire would make
  the worker a second place that decides it. The word had 24 reserved bits and
  now has 20.

---

## What the renderer may do with it

**The renderer advances a published actor from the position it was published at
by the velocity that was published with it, bounded to 0.25 s, and only while
the clock runs.** Without it a prisoner walking at ten tiles a second moves in
whole-tile steps ten times a second, which is #414's stutter an order of
magnitude smaller.

**This is not the renderer-side movement model `AGENTS.md` boundary 1 forbids**,
and the distinction is worth stating as a rule rather than as a reassurance,
because the same words could describe the thing that is forbidden:

- The velocity is **published simulation state**, not a difference between two
  frames. `actors-from-snapshot.ts` refuses to difference two snapshots and that
  refusal is untouched.
- The advance is **bounded** by a constant longer than one publication interval
  and far shorter than a journey, so a worker that goes quiet leaves actors
  standing rather than sliding away.
- It is **corrected by every publication** and measured from the publication
  rather than accumulated, so a dropped frame cannot overshoot.
- It **feeds nothing**: the result is written into a sprite's position and read
  by no simulation, no projection and no command.

A field the payload does **not** carry is still a field the renderer leaves
alone: an actor that has never walked publishes heading `0, 0` and
`actors-from-delta.ts` omits `facing` rather than writing south, so
`actor-pose.ts` keeps owning the default.

---

## Determinism

The walk is integer arithmetic inside the tick loop, so it is deterministic in
the sense ADR 0020 requires, and `tests/determinism/kernel-system-order.test.ts`
pins the new system's position in the order. Two properties are worth naming
because they are the ones that could have gone wrong:

- **`LocomotionStore.walks` is a `Map` and is enumerated.** Every walk is
  advanced by the same amount and writes only its own actor's tile, so the walk
  order cannot change where anybody ends up. The one step that is not
  commutative — who takes the last seat — is lifted out of the loop and sorted.
  `tests/determinism/canonical-iteration-contract.test.ts` carries the exemption
  and that argument.
- **A save/restore round trip is not byte-identical for a prisoner who was
  walking.** It never was — travellers have always been dropped to `idle` on
  load — but the state now covers a whole journey rather than a tick or two, so
  it is reached often. Measured on `tests/integration/riot-regime-loop.test.ts`:
  a save taken mid-journey and stepped 400 ticks has both sessions performing
  the **same set of actions** and one reconsideration cycle apart in how much of
  one of them they get through — 592 ticks of association and 28 travelling
  live, against 568 and 72 restored. That test pins both censuses so the
  divergence is recorded rather than hidden, and asserts the property it exists
  for (the riot regime is in force, so the toilet is absent from both) directly.

### Amendment, 2026-09-23: the walk is saved, and the round trip is exact (#1373)

**The bullet above is superseded for every save this build writes, and kept
because it is still exactly true of a save written before.** It also turned
out to understate the cost it described: measured on `main` at `ceb6865e` on
#1373's fixture (12 cells, 12 prisoners, seed `0x586`, saves every 37 ticks
through day 2), **41 of the 41 saves taken with somebody walking restored to a
prison that had not reconverged by day 6**, while 0 of the 24 without a walker
diverged. The first difference was on the restore tick itself. *"One
reconsideration cycle"* was true of one journey and false of the prison, which
drifted from there.

What a save carries now, in one optional section `simulation.inFlight`
(`src/persistence/save-schema.ts`, `inFlightSectionSchema`):

- **the walks** -- `LocomotionStore.getSnapshot`: waypoints, the leg being
  walked, progress in `1/256` of a tile, and every heading -- for prisoners
  (keyed by component index) and for guards (keyed by `EntityId`);
- **the navigation queue** -- `NavigationSystem.getInFlightSnapshot`: waiting
  requests with the tick they were enqueued, and resolved routes not yet
  collected. **Persisted rather than re-queued by the owners**, because
  `PathRequestQueue.processTick` serves in `(effective priority, enqueuedAtTick,
  id)` order and ages by `enqueuedAtTick`: an owner re-enqueuing on load does so
  at the restore tick, which is a different service order under a binding
  `workBudget`, and a resolved-but-uncollected route has no owner-side
  equivalent at all;
- **the ids and the counters that mint them** -- prisoners' path-request ids,
  and `requestSequence` for `ActionSystem`, `DeploymentSystem`, `PatrolSystem`
  and `SearchSystem`;
- **each active search job's leg state**, which `SearchSystem.loadSnapshot`
  had always reset and which the exactness test showed diverging within fifty
  ticks once the walks were fixed.

A carried result leaves out `expansions`, `usedFlowField` and `waitedTicks`:
they describe how warm the route cache was, the restored cache starts cold, and
carrying them made a save diverge on a diagnostic nothing reads
(`NavigationSystem.getInFlightSnapshot` carries the measurement). Caches are
still not carried -- ADR 0007's line is unchanged.

**No `SAVE_SCHEMA_VERSION` bump**: the section is optional, absent means what
every earlier build did on load (walks cleared, travellers idle, queue empty --
kept verbatim as the restore path for such a save), and a live capture always
writes it, so absence is unambiguous. `docs/PERSISTENCE.md` carries the
compatibility argument under ADR 0038.

**Measured after:** `tests/determinism/restore-mid-walk-exactness.test.ts`
takes 65 saves across a day of #1373's fixture and 134 across a day with six
guards walking and sweeping, and requires of each, over the whole
`captureSessionSnapshot` through the real envelope, that the restore is a fixed
point and that the future agrees fifty ticks on and at a far checkpoint. On the
unfixed code it fails 41 and 107 saves; on this one it fails none.
`tests/integration/riot-regime-loop.test.ts` now asserts its two censuses
equal outright.

**The weakest part of the claim, stated:** the restored route cache is cold,
so a restored session's searches cost more expansions against
`workBudgetPerTick` than the continuous session's cache hits did. Where the
budget does not bind that changes nothing -- it did not bind on any save the
test takes -- but where it binds, a restored session can serve a request a
tick later than the one it was saved from. No fixture here makes it bind.

**That paragraph was the weakest claim, and it was wrong on both counts. It is
kept so the correction can be read against it, and the question is open.**
Measured on 2026-09-23:

**Subsequent resolution, 2026-09-25:** the owner chose cache warmth persistence
in #1373. ADR 0007's amendment records the pre-implementation size measurement
and deterministic key rebuild. The previous cold-cache account below remains
the measured defect that led to this choice; it is no longer current behavior.

- *"It did not bind on any save the test takes"* was true only of the
  12-prisoner fixture.
- *"A tick later"* understated the effect. In six rows of cells with 24
  prisoners, every save taken 1 to 40 ticks before a block change served a
  different set of requests. With 36 prisoners, every save taken 1 to 600
  ticks before one did.
- Replaying each binding tick's pending queue warm against cold, the served
  set differed on 13 of 331 binding ticks.

`tests/determinism/restore-mid-walk-exactness.test.ts` pins the 24-prisoner
case as a **known divergence**. It goes red when the divergence is removed.

**A fix was built and withdrawn** in the same series of commits, the revert carrying its measurements. It
charged the budget what a request costs cold, however warm the caches are. It
made both cases exact, but a warm session could then be no faster than a cold
one. `navigation.production.meal-rush` at 5,000 actors went from 26 ticks to
drain to 211, and from 51,901 counted expansions to 57,903, over its ceiling
of 54,500.

**The decision is ADR 0007's, and it has three options:**
1. **Persist the caches' warmth**: the keys of valid entries plus a
   deterministic rebuild at load, or the entries themselves. Save size and
   load time grow with distinct legs.
2. **Charge cold, as built**: exact, at the latency above.
3. **Accept the divergence**, which is bounded to ticks on which the budget
   binds.

---

## What this costs

**Thirty-five assertions across fifteen integration files moved**, counted as
`+.*expect\(` lines against `origin/main`, and every one of them is a census or
a pinned tick that a journey taking time genuinely relocates. Each is
re-measured in place with the figure it replaced named beside it. Three of them
are findings rather than numbers:

1. **Walking spreads a contended room's outcomes out again, and ADR 0062's
   exact equality did not survive it.** That ADR's contended-canteen fixture
   ended with all six prisoners bottoming out at *exactly* 177.5 of `NEED_MAX`,
   and the equality was the result: scan position no longer decided who ate.
   Six cells at six distances now put the six through six different days, so the
   floors sit within three levels of one another instead. **What #434 was about
   is intact and is now asserted rather than implied**: the spread does not
   track scan position — the prisoner last in the old ascending-index order
   holds the *best* floor of the six — and it is a third of the size of the one
   #434 removed. The assertion that read `new Set(...).size === 1` is replaced
   by those two, with the sentence it replaced quoted beside them.
2. **Two rows have left the roster panel's reachable-row list**, both of them
   `travelling` rows for actions that target the prisoner's own cell
   (`action.sleep` and `action.free-association`). Both blocks follow one the
   prisoner has already walked home for, so the journey never happens. Checked
   over three in-game days before the list was shortened.
3. **A prison whose rooms are far apart can miss a whole regime block**, and at
   half the shipped speed it missed the same one every day. This is the
   measurement behind the speed table above, and it is worth reading as a
   *design* finding rather than a calibration one: a 100-tick block is short
   enough that travel time is a first-class term in whether a need is ever
   served.

---

## What it costs at population, measured

Two population sizes, a third of them walking, on this container. The walking
fraction is the one the six-prisoner fixtures produce at the shipped speed; the
routes are made long enough that the store stays populated for the length of a
timing run, because a first draft of this measurement timed an **empty** store
and reported 0.0002 ms.

| | 500 actors, 167 walking | 5,000 actors, 1,667 walking |
| --- | --- | --- |
| payload | 10,016 bytes | 100,016 bytes |
| worker: `LocomotionStore.advance`, per tick | 0.0225 ms | 0.476 ms |
| worker: `encodeRenderActorsKeyframe`, per publication | 0.045 ms | 0.357 ms |
| main: `decodeRenderActorsPayload` | 0.015 ms | 0.068 ms |
| main: `actorsFromDelta` | 0.084 ms | 0.601 ms |

**What is flat, and it is the one #414 asked for.** The protocol boundary does
not walk an `array-buffer` body -- it validates a schema id, a content type and
a `byteLength` -- so `decodeWorkerToMainMessage` costs the same at both sizes
and the `isJsonValue` term #414 measured at 41 ms is off the render path
entirely. That was ADR 0040's win and layout 2 does not spend it: a longer
buffer is still a buffer nothing walks.

**What is not flat, stated plainly because the issue asks for it.** The
receiver's *own* read of the buffer and the `RenderActor` list it builds are
both O(population): 0.67 ms per publication at 5,000 actors, ten times a
second, is 6.7 ms of a second's main-thread budget. ADR 0040 declined to fix
that in slice 1 and named the fix -- changed-only records between keyframes --
and **this decision makes that fix worth less than it looked**: a walking actor
changes its position every tick, so the changed set at any moment is every
actor in transit rather than the handful of arrivals ADR 0040 priced it
against. At the fractions above it would still save roughly two thirds of the
send, which is worth having and is not this decision's to take.

**The per-tick worker cost is a function of the actors in transit, not of the
population**, which is the property `LocomotionStore` was shaped for: 1,667
walkers cost 0.476 ms a tick at 20 Hz, or about 1% of a second.

### 2026-08-28: the table now has a standing gate, in counted work rather than in milliseconds

Added under #410, whose subject is benchmarks that do not import the code they
are named after. Every figure above is a duration, and a duration cannot gate
anything here: `docs/BENCHMARKING.md`'s CI policy refuses a wall-clock threshold
on a shared runner, and the result contract is stricter still — the verifier
deep-equals a scenario's metrics against a fresh run, so a timing could not even
be recorded there. So `actors.production.render-publication`
(`benchmarks/scenarios/actor-render-publication.mjs`) drives this whole path —
real `EntityStore`, real `PositionComponent`, real `LocomotionStore`, real
encoder, real decoder, real `actorsFromDelta` — and bounds **what makes those
milliseconds what they are**:

- `payloadByteLength` is pinned at 10,016 and 100,016, which is this table's own
  payload row, and `payloadBytesPerActor` at the 20 bytes the whole main-thread
  figure is linear in;
- `isIndexAliveCallsPerSlot` is pinned at exactly 2, which is
  `render-actors-keyframe.ts`'s "Two passes, deliberately" made mechanical, and
  `locomotionReadCallsPerLiveActor` at exactly 1.

**The two-thirds claim above is now measured and it holds.** The scenario reports
`changedOnlyByteShare` — `renderActorsByteLength` over the actors whose position
moved this publication, against the same production function over the whole live
population — and it comes back **0.3351 at 500 actors and 0.3335 at 5,000**. A
changed-only encoding would send a third of the keyframe and save two thirds, at
this decision's walking fraction. It is reported rather than bounded, because
the encoding it prices does not exist: ADR 0040 named it and did not build it.

**What the gate deliberately does not do is re-price the four rows, and an
independent measurement is the reason.** Timed in process on the same container
on 2026-08-28, minimum of fifty samples at 5,000 actors with 1,667 walking:
`LocomotionStore.advance` **0.087 ms** on a tick where no walker crosses a tile
and **0.150 ms** on one where all of them do, against 0.476 above;
`encodeRenderActorsKeyframe` **0.510 ms** against 0.357; `decodeRenderActorsPayload`
**0.045 ms** against 0.068; `actorsFromDelta` **0.216 ms** against 0.601. Three
of the four disagree by 1.5–3×, and they disagree in *both* directions, so this
is not one machine being uniformly faster. The two fixtures differ — the
benchmark restarts its walks every publication and its non-walkers have never
walked, so they publish no facing — and neither run is the authority over the
other. **That is the finding, not a footnote to it:** two honest in-process
measurements of the same four functions on the same container differ by up to
threefold, which is precisely why the counted work is what CI holds and this
table is evidence a human reads. Re-pricing the rows needs a measurement
designed for it, and is not claimed here.

## What would change my mind

- **A day length decision.** If `DAY_LENGTH_TICKS` grows to something a player
  can watch, the speed chosen here is too fast by whatever factor the day grew
  by, and the table above should be re-run rather than scaled.
- **A real `postMessage` measurement.** The table above is in-process. If the
  transfer of a 100 KB buffer ten times a second turned out to cost more in a
  browser than the reads either side of it, the keyframe cadence is the thing to
  revisit before the record width is.
- **A room contention model.** If open question 2 is answered with a
  reservation, the one-line reconsideration in `arrive` should be deleted rather
  than kept beside it: two mechanisms for the same race is how the next defect
  gets written.
- **A second population walking.** Guards are not converted (see below). If they
  are, and the `GuardRoster`'s `Map`-keyed positions turn out to want a
  different store shape, the "one store per population" split here is the part
  to revisit.

---

## Consequences if this stands

- `docs/RENDERING.md`'s paragraph beginning *"The simulation has no motion to
  publish"* and its sentence *"What is missing is simulation-side locomotion,
  which is its own decision and is not this one"* both become false and are
  rewritten rather than annotated.
- `src/simulation/prisoners/components.ts`'s *"Movement here is abstracted: an
  entity's position updates only on arrival"* becomes false for prisoners and
  stays true for guards; the comment says which.
- `docs/PRISONER_OPERATIONS.md`'s *"no tile-by-tile locomotion simulation"* and
  its out-of-scope list need the same correction.
- `docs/NAVIGATION.md`'s scope sentence gains a locomotion consumer for the
  waypoints it produces.
- ADR 0029 decision 2's *"the design that cannot leak is worth two wasted
  walks"* is unchanged as a decision and its revisit condition is now met; ADR
  0040's open question 1 is answered.
- **[ADR 0062](./0062-who-gets-the-room-when-more-prisoners-want-it-than-it-seats.md)
  keeps its rule and loses its headline number.** Its comparator is carried into
  the arrival gate, because a walk moves the moment a seat is claimed out of the
  pass that ADR sorts; and its *"every one of the six now bottoms out at exactly
  the same hunger"* becomes a bounded spread that does not track scan position,
  because six cells at six distances are six different days. Its own test says
  both, in its own words, with the sentence it replaced quoted.
- `docs/HUD_PROJECTIONS.md`'s paging-contract exemption priced this channel at
  **16 bytes an actor** and `docs/RENDERING.md`'s benchmark table gave one
  keyframe row; both carry layout 2's 20 bytes now, with the layout-1 figures
  kept beside them because the order-of-magnitude argument each supports is
  unchanged.
- **Incident responders and contraband searchers still teleport on arrival.**
  They are named in "What the code did" and not converted: the two incident
  paths are deadline-bounded, so making their travel cost time changes whether
  an incident lapses — a balance decision with its own evidence to gather.

  **This bullet has lost two of its four nouns, and both are recorded rather
  than overwritten.** It read *"Guards, incident responders, contraband
  searchers and job carriers still teleport on arrival"*, and added the
  parenthesis *"the two security paths are inert or one-shot in a session a
  player can start (`deriveDefaultSecuritySector` authors no patrol route, so
  `PatrolSystem` never runs) ... The renderer draws no guards today, so nothing
  on screen teleports."* **Guards** went at [ADR 0088](./0088-does-a-guard-walk-to-its-post.md),
  which converted deployment travel and patrol and scoped itself to those two.
  **Job carriers** went at [ADR 0093](./0093-a-carry-is-an-action.md): a carry
  is a prisoner action and prisoner actions walk. The carrier is not a fifth
  site nobody signed — it stopped being a site at all.

## Open questions

1. **How long is a day?** Locomotion is the first system whose parameter cannot
   be chosen without one, and 2,400 ticks forced a walking speed faster than the
   art wants. Whoever answers it inherits the table under "Speed".
2. **Does a room's seat get reserved at departure, with an expiry?** ADR 0029
   names the condition, this decision meets it, and the one-line
   reconsideration in `arrive` is a mitigation rather than the answer. The
   costs ADR 0029 records are unchanged: the occupant set stops being a fact
   about the world, and four travel-failure paths gain a release.
3. **Should a walk be saved?** Not saving it costs a restored prisoner one
   reconsideration cycle and the journey they were on. Saving it costs a
   save-schema field and ADR 0038's compatibility question. Nothing in this
   branch needs the answer; a player who saves mid-day will notice it before a
   test does.
   **Answered 2026-09-23: yes** -- the owner's ruling, recorded under "Status",
   built under #1373 and described in the amendment under "Determinism". The
   question is kept as it was asked. Its first sentence priced the cost per
   journey, which was right; the prison-wide cost was 41 permanent divergences
   in 41 mid-walk saves.
4. **Do guards walk, and when?** They are the other population the render
   channel will carry (ADR 0040 slice 2), and drawing them while they teleport
   between patrol waypoints would look worse than not drawing them. The two
   decisions are therefore one decision, and neither is taken here.
