# ADR 0077: When a route stops being valid

> **The number is provisional and this document pre-commits to renumbering.**
> `AGENTS.md`'s rule is that a number is not reserved until it appears in
> `docs/adr/README.md`, and a branch nobody has merged is invisible from that
> index — so if another branch turns up holding 0077, this file, its row and
> every citation of it get renumbered without argument, exactly as 0031, 0034,
> 0035, 0037, 0048, 0049 and 0074 each pre-committed.
>
> **The arithmetic, written out rather than asserted.** The practice ADR 0071's
> preamble records is that the assigner performs the sweep and the drafting
> agent recomputes it; both halves were done here and they **disagree**, which
> is the case worth writing down.
>
> - `max + 1` recomputed off disk at commit time, from
>   `agent/sim-001-stale-routes` with current `main` merged in, is **0075**.
>   That is also what the `Next free number` line said before this commit.
>   **It is the wrong answer**, and the reason is the one this history has been
>   tracking since 0004: disk sees only what has merged.
> - The sweep, performed on 2026-08-29 across **every** remote head rather than
>   `main` alone: `origin/main` and every `origin/wip/*` head max at **0074**;
>   `origin/agent/econ-hardlock-and-recycling` and its `wip/` shadow hold
>   **0075** and **0076**, unmerged, for the two economy decisions the owner has
>   just ruled on. Nothing on any remote head is above 0076.
> - **0072 is still held and unwritten** for the events-persistence decision. It
>   is a hold, not a gap, and it is not the next number for the same reason it
>   was not the next number for 0073 and 0074.
>
> So the lowest number that collides with nothing merged *and* nothing held is
> **0077**. The integrator assigned it having run that sweep; this agent
> recomputed `max + 1` off disk, got 0075, reported the disagreement rather than
> taking the lower number, and re-ran the branch sweep itself instead of
> accepting the assignment on trust. Both answers are recorded above because
> which of them is right is a fact about branches a worktree cannot see, and
> the recomputation's job is to *surface* that, not to settle it.
>
> **Every citation of this ADR in the code names it by title rather than by
> number, and that is deliberate.** `grep "When a route stops being valid"` is
> what finds them — `src/simulation/navigation/traversal.ts`, which carries the
> reason, and from there `navigation-system.ts`,
> `src/simulation/locomotion/locomotion.ts`,
> `src/simulation/prisoners/action-system.ts`,
> `prisoner-operations-runtime.ts` and `tests/helpers/open-ground.ts`. No count
> is given here on purpose: a sentence that states a tally is the first one to
> rot, and the grep is the answer rather than a number somebody has to maintain.
> The effect is that the renumber this preamble pre-commits to is an edit to
> the index row and this filename rather than a hunt through five modules. It
> is the cheapest form the pre-commitment above can take.
>
> `docs/NAVIGATION.md` is the one exception and carries the number *as well as*
> the title, as a relative link. That is not an oversight: relative ADR links
> from `docs/` are checked by `tests/foundation/adr-numbering-contract.test.ts`,
> which refuses a link whose label names one ADR while pointing at another — so
> a renumber that misses that line fails a test rather than rotting quietly,
> which is the opposite trade from the one the code comments want.

## Status

**Proposed, 2026-08-29. Not self-approved.**

It answers **SIM-001** from the 2026-08-29 read-only audit pass against
`4c18bc4` (v0.0.203) — *"active locomotion routes are not invalidated by later
topology changes"*, rated HIGH/HIGH — and **RED-002** from the independent
red-team pass, which reached the same code and declined to call it a defect
because it had not shown that a legitimate present-day player sequence can
leave a walk alive across the construction transition. Neither audit executed
anything. The reproduction below is the producer-side proof the second one
refused to assume, and it vindicates the first one's rating.

## Context

### What a walk was, and what it never asked

[ADR 0059](./0059-how-an-actor-gets-from-one-tile-to-the-next.md) gave a
prisoner a `LocomotionStore` between two tiles, so a route resolved by
`NavigationSystem` stopped being applied in one statement and started being
*walked*. `LocomotionStore.beginWalk` validates the **shape** of the waypoint
list it is handed — non-empty, one orthogonal tile per leg — and its own comment
says why:

> Refuses a malformed route rather than walking a straight line through whatever
> is between two distant waypoints: a route that skips a tile is a router defect,
> and a locomotion model that quietly interpolated across it would put actors
> through walls and report nothing.

It retained no geometry revision, no door access version and no route dependency
token. `advance` then incremented progress and wrote each reached waypoint into
the position store **without re-asking whether the edge was still crossable**.

Navigation's own invalidation is correct and could not help. `RouteCache` and
`FlowFieldCache` compare `NavigationGraph.geometrySignature` and per-door access
verdicts (`route-dependencies.ts`), and `isNavigationGraphStale` rebuilds the
region graph when a chunk's `geometryRevision` or `DoorRegistry.structuralRevision`
moves. All of that governs answers the subsystem still holds. **A route that has
been handed to a caller is not one of them.** By the time the waypoints are in a
walk they have left the navigation subsystem and become locomotion state, and no
counter in `src/simulation/navigation/` can reach them.

`LocomotionSystem` is order 200, `NavigationSystem` 150, `ConstructionSystem`
100 — so a wall completed on tick *n* is standing in the world before the walk
steps on tick *n*.

### The reproduction, through the real command path

Measured on `main` at ec10451 (v0.0.206), seed `0x0b1ec7`, in
`tests/integration/wall-built-mid-walk.test.ts`. The prison has one cell in the
corner diagonally opposite the delivery gate, and the cell's doorway tile is a
cul-de-sac — walled west and east — so the one edge every route into that cell
must cross is the boundary between `(28, 31)` and `(28, 30)`. The player waits
until the prisoner is walking and then drags a `wall-brick` across it, through a
real `PlaceBuildOrder`. Nothing refuses it: the tile is owned, the bricks are in
stock, and ADR 0029 decision 2 gives a traveller no claim on anything.

| tick | what happened |
| --- | --- |
| 1,541 | the prisoner's first walk begins; the order is placed on this tick |
| 1,621 | the order completes and `topEdge(28, 31)` becomes brick. **The prisoner is at `(15, 27)`, still walking, thirteen tiles short of the edge** |
| 1,657 | the prisoner crosses `(28, 31) → (28, 30)` — **thirty-six ticks after the wall was standing** |
| 1,663 | it finishes at `(28, 27)`, inside a cell nothing in the prison can reach |

The fixture is shaped to make that window **measured rather than assumed**,
because the dominant defect shape in this repository is a guard whose fixture
cannot reach the mechanism it names: here that would be a walk so short that the
edge is crossed on the tick it is built. A sixty-one-tile first errand is about
122 ticks at `DEFAULT_WALK_SUBTILE_UNITS_PER_TICK`, against roughly eighty ticks
for a `wall-brick` order to travel `approved → materials-pending → assigned →
in-progress → completed` at `ConstructionSystem`'s ten-tick cadence. The test
asserts the prisoner was **more than one tile short** when the wall completed,
which is the difference between "walked through a wall" and "crossed on the tick
it appeared".

**Why a player would report this as a ghost rather than as a wall bug.** The
fault is temporal and leaves nothing behind: the wall is correct afterwards, the
topology is correct afterwards, and **no save carries a walk** —
`PrisonerOperationsRuntime.loadSnapshot` clears every restored traveller's
route. So it looks exactly like an actor ghosting through a build that goes
away on reload, which is the hardest class of report to act on.

(That sentence read *"drops every restored traveller to `idle`"*, and issue
#882 made the phase half false of a carrier, which ADR 0093 decision 5 keeps
`'travelling'`. The load-bearing claim is unchanged: no save carries a walk,
whatever phase the actor comes back in.)

### The finding the brief did not expect: guards are not affected, and that is decided

The audit said to check guards too, on the grounds that they share locomotion
mechanics. **They do not, on this tree.** `LocomotionStore` is instantiated
exactly once, in `PrisonerOperationsRuntime`. Guards teleport on arrival —
`security/deployment-system.ts:202` writes `this.guards.setTile(guardId, postTile)`
and `security/patrol-system.ts:141` does the same for a patrol leg — and so do
job carriers, at `operations/job-system.ts:187`.

That is **not an undiscovered second instance of this defect**. It is the
stronger fault — an actor reaching a destination without traversing anything at
all — and ADR 0059 records it deliberately in its own scope section:

> **Guards, incident responders, contraband searchers and job carriers still
> teleport on arrival.** They are named in "What the code did" and not
> converted … The renderer draws no guards today, so nothing on screen
> teleports.

ADR 0059 open question 4 — *"Do guards walk, and when?"* — is where that is
handed back, and it is not reopened here. This ADR's rule simply has nothing to
bite on for a population that never crosses an edge.

**What this ADR owes that population is a mechanism, not a rule**, and decision
5 is it: the predicate is a *required* parameter, so converting guards to walk
turns the omission into a compile error rather than into a silent repeat of
SIM-001. That is not a style preference — making it required is what turned five
existing call sites red and forced each to answer, and it is the only thing that
would have caught the original defect at the moment it was introduced.

## Options considered

### A. Re-validate at traversal — **recommended**

> No actor may traverse an edge that is non-traversable at the tick on which the
> edge is crossed, regardless of when its route was calculated.

The walker asks, immediately before it is written onto the far tile, whether the
boundary in front of it is standing. **Once per tile crossed, not once per
tick**: at the shipped speed that is one predicate call every second tick per
walker, and none at all for the standing population.

**Measured cost**, `LocomotionStore.advance` with the real predicate against the
same loop without it, 20,000 ticks each, including the per-call `RouteContext`
allocation the production wiring actually makes:

| simultaneous walkers | without | with | delta | per walker per tick |
| --- | --- | --- | --- | --- |
| 50 | 3.7 µs/tick | 5.5 µs/tick | +1.7 µs/tick | 35 ns |
| 200 | 11.6 | 25.8 | +14.3 | 71 ns |
| 1,000 | 70.6 | 135.4 | +64.8 | 65 ns |

At 1,000 simultaneous walkers — twenty times any plausible in-transit count for a
5,000-prisoner capacity — that is **0.13% of a 50 ms tick at 20 Hz**. These are
**upper bounds and the machine was contended**: another agent's Playwright suite
ran throughout the measurement. An upper bound honestly labelled is worth more
here than a clean number nobody can place, because the argument this table
supports is a comparison and not a budget claim.

**The cadence that table prices is gated, not merely asserted.** "Once per tile
crossed, not once per tick" is a *count*, so unlike the microseconds beside it
it can be checked on a shared runner — which is the whole of why
`docs/BENCHMARKING.md` refuses a wall-clock threshold and this decision still
gets a standing gate. Two of them ask the question at different scales:
`tests/unit/simulation-locomotion.test.ts` records which edges a single walker
is offered over six ticks, and
`benchmarks/scenarios/actor-render-publication.mjs` reports `canCrossCalls` and
`canCrossCallsPerWalkerPerPublication` over 500 and 5,000 actors and pins the
second at exactly `1` — one call per walker per two-tick publication, and none
for the standing population.

Both were watched failing. Moving the predicate out of the crossing branch and
into the per-tick loop — plausible, because it is how option A would look if
somebody re-derived it from "re-validate every tick" rather than from this
sentence — fails the unit test on the edge list and takes `canCrossCalls` to
334 against 167 at smoke and 3,334 against 1,667 at full. That doubling is the
first row of the table above turning into the second, and nothing else in the
publication scenario moves with it.

### B. Snapshot semantics, with an exception for security barriers — rejected

Declare that a route means the world of the tick it was calculated on, and carve
out newly completed security barriers so the case above still cannot happen.

Rejected because **the exception cannot be expressed where it would have to
live**. A wall and a door occupy the same edge slot: `finalizeConstruction`
writes `DOOR_EDGE_NUMERIC_ID` into `topEdge`/`leftEdge` for a door exactly as it
writes a wall id for a wall, and `definition.ts` states that "a value with no
registered door is an ordinary, permanently impassable wall". So "is this a
security barrier" is not a question the edge layer can answer, and a rule that
enumerates which buildables count is a rule that is wrong when the eleventh
buildable lands. It also leaves every *non*-barrier case still walking through
geometry, which is a rule nobody can explain to a player.

### C. A route validity token — rejected, and this is the load-bearing comparison

Give a walk the geometry signature and door dependency set the navigation layer
*already* computes for route reuse (`route-dependencies.ts`,
`RouteCache.geometrySignature`), and drop the walk when they stop holding. This
is the option "look one module over" points at, and it is genuinely tempting:
the machinery exists and is correct.

Rejected on three counts, in ascending order of weight.

1. **It is more expensive.** A token is compared per walker per *tick* — there
   is no cheaper moment, because the token is about the whole route rather than
   about the next edge. Option A is asked per walker per *tile crossed*, which
   at the shipped speed is half as often, and the comparison it performs (two
   chunk-cell reads and a `Map` lookup) is the same order of work as the
   `accessRevision` integer compare a token would start with and cheaper than
   the per-door fallback it would fall into whenever any door anywhere had
   moved. The table above is what makes this concrete: 65 ns per walker per tick
   is the *whole* of option A's cost, so a token cannot be cheaper than it
   without being coarser than it.
2. **It is broader in exactly the wrong direction, and that is an architectural
   boundary rather than a preference.** A geometry signature is per chunk, so
   one wall completion invalidates every walk in that chunk, and every one of
   those walkers goes back to the router on the same tick. `AGENTS.md`
   boundary 9 says pathfinding must be budgeted and hierarchical; a re-planning
   burst proportional to the in-transit population, triggered by an ordinary
   player action, is precisely the unbudgeted cost it forbids. Option A stops
   only the walkers a new wall is actually in front of, and they re-plan through
   their owner's existing reconsideration cadence, so nothing new is scheduled
   at all.
3. **It is a save-format decision and option A is not.** A token that had to
   survive a restore would be a field on persisted state, which is
   [ADR 0038](./0038-what-makes-a-save-compatible.md)'s question and a
   `SAVE_SCHEMA_VERSION` conversation. Asking at the moment of crossing adds no
   state a snapshot carries, so `LocomotionStore`'s own "no save-format field is
   added by this module" paragraph survives intact. ADR 0059 open question 3
   ("Should a walk be saved?") stays open and untouched.

## Decision

1. **The rule is traversal-time.** *No actor may traverse an edge that is
   non-traversable at the tick on which the edge is crossed, regardless of when
   its route was calculated.* A route is a plan, not an entitlement.

2. **The question is asked once per tile crossed, immediately before the actor
   is written onto the far tile.** `LocomotionStore.advance` calls `canCross`
   inside its crossing loop and before `writeTile`, so an actor refused an edge
   **has never been on the far side of it** — no consumer of the position store
   and no render publication ever sees it there.

3. **A refusal stops the walk; it does not arrive.** The actor keeps the tile it
   legitimately occupies, its progress into the refused leg is discarded, and
   the walk is dropped without `onArrived` firing — an actor stopped by a wall
   is nowhere near a destination. Its owner sees `isWalking` answer `false` at
   its next reconsideration and re-plans, which for a prisoner is
   `ActionSystem.continueTravelling`'s existing "not walking, no outstanding
   request" exit. **No new plumbing is scheduled**, and that is the property
   decision 2 of option C could not have.

4. **One passability rule, one place, two door policies.** `edgeStanding`
   (`src/simulation/navigation/traversal.ts`) is the door-beats-wall-beats-open
   ordering, and `canStep` in `local-search.ts` now goes through it rather than
   holding a second copy. The *policies* legitimately differ — the bounded
   search crosses only a door the portal search upstream admitted, a walker
   consults its own `RouteContext` through `checkDoorAccess` — but the ordering
   is one sentence and is now written once. `NavigationSystem.canTraverseEdge`
   is the façade a walker asks, and it deliberately does **not** consult the
   region graph: `ensureGraph` rebuilds lazily from a geometry revision, and
   routing one actor's step through that would make a tile crossing depend on a
   whole-prison recomputation.

5. **The predicate is a required parameter, not an optional one with a
   permissive default.** A default of "always allowed" is precisely the state
   the audited tree was in, and the whole finding is that nobody noticed the
   question was never asked. Making it required turned five call sites into
   compile errors and each had to answer; `tests/helpers/open-ground.ts` is the
   named answer for fixtures that build no geometry, so that "there are no walls
   in this fixture" is a claim a reader can find rather than an inline
   `() => true`. **This is the mechanism by which ADR 0059 open question 4 — do
   guards walk — cannot reintroduce SIM-001 by omission.** When guards are given
   a `LocomotionStore`, the compiler asks.

6. **Doors are inside the rule, and this decision is written down as the
   reversible one.** `isEdgeTraversable` runs `checkDoorAccess`, so a door
   *locked* under a walker — a riot lockdown does exactly this, via
   `setControlState(sectorId, 'lockdown')` ([ADR 0057](./0057-what-a-riot-does-to-a-prisoners-day.md)) —
   now stops that walker, where before the walk continued through it. Included
   because it is **one predicate**: splitting geometry from doors would be
   inventing a second rule about what a route means, and a lockdown that
   confines is what a lockdown is for.

   **The evidence for it is negative and that is stated rather than dressed
   up.** `riot-regime-loop`, `incident-consequence-loop` and
   `incident-events-loop` all pass unchanged, which they would not if lockdown
   were stranding prisoners badly; no test was written that watches a prisoner
   meet a door locked mid-walk, because none existed to extend and building one
   was not reached.

   **The narrower alternative, argued here so nobody has to re-derive it under
   pressure**: re-validate *geometry* at traversal and trust *door state* from
   plan time. It is one line in `isEdgeTraversable` — return `true` for
   `standing.kind === 'door'` instead of consulting `checkDoorAccess` — and it
   keeps every part of the SIM-001 fix, because the reproduction is a wall. Its
   cost is that a lockdown does not confine anybody already walking, for the
   length of one journey. Take it if the failure mode under "What would change
   our mind" appears; do not take it pre-emptively, because a lockdown that
   leaks is a worse game than one that occasionally strands somebody in a
   corridor for a reconsideration cycle.

## Consequences

- **A visible correction on the tick an edge closes.** Discarding progress into
  a refused leg moves the actor back by up to one leg's worth of sub-tile units
  — half a tile at `DEFAULT_WALK_SUBTILE_UNITS_PER_TICK`, since progress is only
  ever `0` or `128` when it is read. On screen that is an actor walking up to a
  new wall and stepping back onto its own tile. It is recorded rather than
  hidden because the alternative to it is the defect.

  **The look-ahead that removes even that is named and not taken**: checking the
  *next* leg's edge at the moment a waypoint is reached would stop the actor two
  ticks earlier, on the same tile, with no step back. It changes no outcome, and
  it doubles the predicate calls. If the half-tile correction ever reads badly
  in play, this is the change to make and it costs the second row of the table
  above.

- **A stopped walker stands for up to twenty ticks** — one second at 20 Hz —
  before `ActionSystem`'s cadence re-plans it. That is the same cadence every
  other reconsideration in that system runs on, including the un-zoned-room exit
  it sits beside, so this introduces no new kind of pause. Measured in the
  fixture above the prisoner stands indefinitely, but only because the player
  had sealed off the one room in the prison: `routeFailures` climbs and there is
  genuinely nowhere to go. **That is a prison the player broke, reported
  honestly, rather than a simulation that gave up.**

- **No save-format change.** `SAVE_SCHEMA_VERSION` does not move, no migration
  is added, and no walk gains a persisted field. See option C count 3.

- **No determinism fingerprint moves.** No system is added or reordered
  (`kernel-system-order.test.ts` is untouched), no RNG stream is added or drawn
  from differently, and the predicate is a pure function of world state. The
  whole vitest suite is green including `tests/determinism/` and
  `tests/integration/`.

- **No player-facing string is added or changed.** Nothing under `src/ui/**`, no
  locale key, no refusal reason.

- **The rule is stated in `docs/NAVIGATION.md`** under "What invalidation cannot
  reach: a route that has already left", beside the cache-invalidation section
  it is the complement of — because that section was thorough about answers the
  subsystem still holds and silent about one it had handed away, and that
  silence is the shape of the gap this ADR closes.

## What would change our mind

- **Decision 6, first and most likely.** A riot with a real population showing
  prisoners piling up dead-stopped at locked doors and never re-planning to
  something reachable, or `unmetDemandCycles` climbing during a lockdown in a
  way it did not before. The narrower rule is written out in decision 6 and is
  one line.

- **The half-tile correction reading as a glitch in play** rather than as
  stopping short. The look-ahead under Consequences is the answer and its cost
  is measured.

- **A walker population that makes 65 ns per walker per tick matter.** The table
  above says that needs roughly 1,000 simultaneous walkers to reach 0.13% of a
  tick, so this would mean a prison an order of magnitude larger than anything
  measured. If it arrives, the check is already the cheapest form of the
  question; what would change is the walking speed or the tick rate, not this.

- **A second population being given locomotion and finding the required
  predicate genuinely awkward to supply.** Decision 5 is a bet that "the
  compiler asks" is worth the call-site churn. If wiring guards turns out to need
  a route context the guard systems cannot cheaply produce per tile, the shape
  to revisit is where the context comes from — not whether the question is asked.

## Out of scope

- **Whether guards, incident responders, contraband searchers or job carriers
  should walk at all.** ADR 0059 open question 4, unchanged and not reopened.
  Until it is answered those populations teleport, and no rule about traversing
  edges can apply to an actor that traverses none.
- **Whether a walk should be saved.** ADR 0059 open question 3. This decision
  deliberately needs no answer to it.
- **Whether the owner should be told a walk was stopped, rather than finding out
  at its own cadence.** A callback on refusal would let `ActionSystem` re-plan
  on the same tick instead of within twenty. It is a playability question with
  no evidence yet either way, and adding the callback later breaks nothing.
- **SIM-002**, the sibling ownership defect on the *request* side — a claim
  teardown that deletes a navigation request id instead of handing it back. It
  travelled with this work and is recorded in `docs/NAVIGATION.md` under "Giving
  a request back when its owner goes away". It needed no decision: every
  teardown that leaked was inconsistent with two that did not, so it is a fix
  rather than a choice.
