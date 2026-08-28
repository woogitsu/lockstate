# ADR 0059: How an actor gets from one tile to the next

## Status

**Proposed, 2026-08-28.** Written on `agent/414-delta-channel` against `main` at
`7f60b12` (v0.0.140), with the implementation on the same branch. Nobody has
approved it; the argument below is the whole of the warrant, and a reader who
disagrees with it should treat the decision as open.

**The number was assigned centrally before this draft existed**, per
`AGENTS.md` and `docs/AGENT_WORKFLOW.md`. 0058 and 0060 are held by parallel
drafts in the same pass. If 0059 turns out to have been taken by something that
has not merged, this document, its row in `docs/adr/README.md` and every
citation of it are renumbered without argument.

---

## The decision, in one sentence

**An actor that has a resolved route walks it, one tile at a time, at a fixed
speed of one tile per four kernel ticks, with the sub-tile progress held in a
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
`src/simulation/security/patrol-system.ts:131-134`,
`src/simulation/security/deployment-system.ts:191`,
`src/simulation/incidents/response-system.ts:595`,
`src/simulation/contraband/search-system.ts:298` and
`src/simulation/prisoners/job-worker-adapter.ts:30-31`.

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
  **not** deliver the visible half: at one tile per four ticks the renderer sees
  a one-tile jump five times a second, and it cannot smooth it, because
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
  "What this costs" below; twenty-five integration assertions were re-measured.

### Option 5 — Option 4, plus persisting the walk

As Option 4, with the waypoint list and the offset written into the save so a
restored session resumes mid-stride.

- **Cost:** a save-schema field and therefore ADR 0038's compatibility
  question, in the same week another branch is changing save generations.
- **Not taken**, and open question 3 records exactly what it would buy: a save
  taken mid-journey currently restores the prisoner **idle on the tile they had
  reached**, which is the rule `PrisonerOperationsRuntime.loadSnapshot` has
  always had for travellers and is now reached far more often.

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

### Speed: 64 units a tick — one tile per four kernel ticks, five tiles a second

**A directional default, not a locked balance decision**, in the sense
`DEFAULT_SECURITY_SECTOR_REQUIRED_GUARD_COUNT` uses the phrase. It is bounded on
both sides by measurement rather than taste.

**The lower bound is starvation, and it was hit.** An in-game day is 2,400 ticks
(`regime.ts`), the general-population timetable's meal blocks are **100 ticks**
each, and a starter prison is one 32×32 chunk. At the 2.5 tiles/s this was first
built with, an errand across such a prison costs more than a whole block, and a
prisoner can spend every meal block in transit. Measured on
`tests/integration/prisoner-roster-readout.test.ts`'s prison — a cell and a
yard, no canteen — over five in-game days:

| units/tick | tiles/s | hunger at the end, of `NEED_MAX` |
| --- | --- | --- |
| 32 | 2.5 | **0** |
| 64 | 5 | 238 |
| 96 | 7.5 | 166 |
| 128 | 10 | 164 |

**The upper bound is that it stops reading as walking.** A tile is 64 px
(`src/rendering/tile-metrics.ts`), so 5 tiles/s is 320 px/s at 1× zoom — a
brisk walk on screen, and about five pixels a frame at 60 Hz, which is what the
extrapolation has to smooth.

**What the choice costs in a running prison**, measured over 12,000 ticks in the
six-prisoner contended-canteen fixture: prisoners spend **18–28%** of their time
travelling at 5 tiles/s, against 33–56% at 2.5 and 3.5% under the old abstracted
arrival.

### The tension this exposes, and it is not resolved here

**A 2,400-tick day is short enough that no walking speed is both visually
credible and cheap in game time.** A day is two real minutes at 1×, so the world
runs about 720× real time; a human walking at that scale would cross the prison
in a frame. Five tiles a second is a compromise chosen to keep the *shortest
regime block* usable, and the fact that it had to be is a statement about
`DAY_LENGTH_TICKS` rather than about locomotion. That constant's own comment
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
4. **Simultaneous arrivals are dispatched in ascending key order** — ADR 0005's
   canonical entity order — because two prisoners reaching the last free seat on
   one tick are decided by who claims it first, and insertion order would make
   that a property of who set off first.
5. **An external write to a walker's tile ends the walk.** There is one such
   write outside `prisoners/`: `PrisonerJobWorkerAdapter.setPositionTile`.
   `releasePrisoner` forgets the walk *and* the heading before the index is
   recycled.

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
the clock runs.** Without it a prisoner walking at five tiles a second moves in
half-tile steps ten times a second, which is #414's stutter an order of
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
  it is reached often. Measured: a save taken mid-journey and stepped 400 ticks
  produces the same actions term for term and a phase split one reconsideration
  cycle apart (160 idle / 196 travelling live, 140 / 216 restored).

---

## What this costs

**Twenty-five integration assertions moved**, every one of them a census or a
pinned tick that a journey taking time genuinely relocates. Each is re-measured
in place with the figure it replaced named beside it. Three of them are findings
rather than numbers:

1. **Walking staggers demand, and the contended-canteen fixture stopped
   contending.** Six prisoners, one three-seat table: with an instantaneous
   arrival all six chose and arrived on the same tick and three were refused, so
   `action.eat-in-cell` appeared in every row. Now no two of them reach the
   canteen on the same tick from six cells at six different distances, the
   fallback is never reached, and the ceiling shows up as **food** instead —
   1,788 canteen ticks against the two-table control's 3,640, worst hunger 17.5
   of `NEED_MAX` against 174.5. ADR 0041's claim 3 is still guarded, at the unit
   level, by the case that stands the prisoner on the room's own anchor tile.
2. **`action.sleep` with `travelling` true has left the roster panel's
   reachable-row list.** A prisoner walks home for the association block that
   runs up against the sleep block, so they are already standing on the cell
   anchor when they are told to sleep. Verified over five in-game days.
3. **Two riot fixtures moved in opposite directions**, which is the honest shape
   of a change that alters how well needs are met: the derived-sector prison's
   `needs-pressure` fell 0.0011 and the mean need deficit at the riot tick rose
   from 0.3752 to 0.4242 in the neglected-prison fixture.

---

## What would change my mind

- **A day length decision.** If `DAY_LENGTH_TICKS` grows to something a player
  can watch, the speed chosen here is too fast by whatever factor the day grew
  by, and the table above should be re-run rather than scaled.
- **A measured cost at population.** The per-tick walk is O(actors in transit)
  and the fixtures here run six. At 5,000 prisoners with a third of them
  walking, 1,700 `Map` entries stepped per tick at 20 Hz is 34,000 iterations a
  second, which I expect to be free and have not measured on a full prison.
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
- **Guards, incident responders, contraband searchers and job carriers still
  teleport on arrival.** They are named in "What the code did" and not
  converted: the two security paths are inert or one-shot in a session a player
  can start (`deriveDefaultSecuritySector` authors no patrol route, so
  `PatrolSystem` never runs), and the two incident paths are deadline-bounded,
  so making their travel cost time changes whether an incident lapses — a
  balance decision with its own evidence to gather. The renderer draws no guards
  today, so nothing on screen teleports.

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
4. **Do guards walk, and when?** They are the other population the render
   channel will carry (ADR 0040 slice 2), and drawing them while they teleport
   between patrol waypoints would look worse than not drawing them. The two
   decisions are therefore one decision, and neither is taken here.
