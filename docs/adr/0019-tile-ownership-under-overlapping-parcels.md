# ADR 0019: What "owned" means for a tile under overlapping parcels

## Status

**Accepted.**

The owner signed off on the one thing this ADR asked for: *an owned parcel
makes the tiles inside it owned, and an unowned parcel overlapping the same
tiles does not take that away.*

Two things were bundled in the change this ADR describes, and only one of them
needed that decision.

Removing the renderer's private copy of the ownership rule does not: it is a
straight `AGENTS.md` boundary-1 defect fix, and no reviewer needs to weigh it.
But the two copies did not agree in every case, so unifying them requires
choosing *which* answer survives — and the answer chosen here is not the one
`SparseWorld` gave.

A reviewer is being asked to sign off on one thing: **an owned parcel makes the
tiles inside it owned, and an unowned parcel overlapping the same tiles does
not take that away.**

If that goes the other way, §1 still stands: the rule keeps one implementation,
on the simulation side. `isTileOwnedBy` would then have to take every parcel
with its ownership rather than only the owned bounds, `WorldRenderView` would
have to be given the unowned parcels too, and `docs/WORLD.md`'s ownership
sentence would be rewritten — issue #120 records the replacement wording.

### What the decision was taken against, stated because it bounds the evidence

**No world a running game can reach has overlapping parcels.** `src/` has
exactly one `registerParcel` call site — `SparseWorld.fromSnapshot`,
re-registering what a save carried — and nothing creates a parcel, so the case
this ADR decides has never occurred in a running game. It was accepted on the
argument rather than on a player-visible symptom, and that is worth knowing if
the first real parcel content makes the rule feel wrong in play.

What is *not* speculative is the rule's reachability: since #215,
`ConstructionSystem.submitOrder` calls `canBuildAt`, so the ownership answer
this ADR settles is consulted on every build gesture. It is a disagreement
about one that remains unreachable.

## Context

`registerParcel` rejects a duplicate id and nothing else. Overlapping bounds
are permitted, and `getParcelAtTile`'s doc comment says so deliberately. So a
tile can sit under more than one parcel, and "is this tile owned?" needs a rule
for that case.

The repository had two, in two places, and they did not always agree.

### The simulation's rule

`SparseWorld.isTileOwned` asked `getParcelAtTile` for the *first* parcel
containing the tile in ascending-id order, and returned true only if **that
one** was owned; otherwise it fell through to chunk ownership. A tile under an
unowned `a-marsh` and an owned `z-estate` was therefore **not owned**, so
`canBuildAt` would have answered `unowned_land` for it.

### The renderer's rule

`WorldRenderView.isTileOwned` returned true if **any** owned parcel contained
the tile. It could not have implemented the other rule even if it wanted to:
`fromSnapshot` filters the snapshot's parcels down to the owned ones while
building the view, so the renderer never learns that a lower-id unowned parcel
covers the tile at all.

### Why the disagreement matters

Not because a player has seen it. Nothing in `src/` registers a parcel, so the
two answers have never been compared over an overlap in a running game — see
*Reachability* below. (When this ADR was written nothing in `src/` called
`canBuildAt` either; `ConstructionSystem.submitOrder` does since #215, which
makes the ownership answer reachable from a build gesture without making an
*overlap* reachable.)

It matters because one game rule had two implementations, and one of them lived
in the renderer. `AGENTS.md` boundary 1 says rendering is not simulation and
that Phaser must never become the source of truth for game state; a renderer
that decides an ownership question from logic of its own is that, whether or
not it happens to agree. Here it did not agree, which is the demonstration
rather than the harm: `WorldRenderView.isTileOwned` feeds `TileSample.owned` in
`readTile`, and `tile-layer.ts` draws both the unowned shading and the
owned-land outline from it, while `SparseWorld.isTileOwned` is what `canBuildAt`
consults. One question, asked on either side of the same player-facing
decision, answered by two bodies of code that had drifted apart with no test
able to notice.

The drift was narrow, which is part of why nothing noticed. The two agreed on
every tile in an owned chunk, on every tile covered by a single parcel, and on
every overlapping tile whose lowest-id covering parcel was owned. They differed
in exactly one case: a tile whose lowest-id covering parcel was unowned while a
higher-id parcel covering it was owned.

### What is *not* the reason to pick one over the other

The determinism argument in `getParcelAtTile`'s doc comment — pinned by
`tests/determinism/iteration-order.test.ts` — is about **stability across a
snapshot round trip**, not about which answer is meaningful. `snapshot()` and
`fromSnapshot` emit and re-register parcels sorted by id rather than in
insertion order, so a rule that picks *one* parcel needs a canonical sort to
answer the same way before and after a save. That constrains *how* a
first-match rule must be implemented. It says nothing about whether
first-match is the right rule, and it must not be allowed to decide the
question by itself.

### Reachability: this is latent, not live

Nothing in `src/` registers a parcel. The only `registerParcel` call site in
production code is inside `SparseWorld.fromSnapshot`, re-registering what a
save already contained; `createNewSimulationRuntime` creates a world with one
owned chunk and no parcels, and there is no content or scenario module that
defines any. `canBuildAt` has exactly one caller in `src/` —
`ConstructionSystem.submitOrder`, which refuses a build order on unowned land
(#215) — and every other call site of both is a test. That caller consults the
ownership answer; it cannot reach a disagreement about one, because reaching a
disagreement needs two parcels covering the same tile and nothing creates a
parcel.

So no player can reach the divergence today. Overlapping parcels exist only in
tests. Before this change there was one such file,
`tests/determinism/iteration-order.test.ts`, where all four parcels share
identical bounds and the only one it ever owns is the lowest-id one — exactly
the case where the two rules agree, which is why it never exposed the split.
This change adds two more overlapping-parcel worlds, in
`tests/unit/sparse-world.test.ts` and `tests/unit/rendering-world-view.test.ts`,
and those do build the case where the two rules differed.

That is why this is a defect to fix rather than an incident, and it is also
why the choice can be made cleanly: no save, no scenario and no player
expectation depends on the current answer.

## Decision

### 1. One rule, in the simulation, called by both sides

`isTileOwnedBy` (`src/simulation/world/tile-ownership.ts`) is the only
definition of tile ownership. `SparseWorld.isTileOwned` and
`WorldRenderView.isTileOwned` both call it.

It lives on the simulation side because `AGENTS.md` boundary 1 says rendering
is not simulation. A renderer that answers an ownership question from its own
logic is a second source of truth for game state whether or not it currently
agrees, so the fix is not "make the renderer's copy more faithful" — it is
"the renderer has no copy".

The alternative shape — leaving both implementations and testing them against
each other — was rejected: a test can catch a drift that already happened, and
this one did not, because no test built the world that exposes it.

### 2. The rule is: any owned parcel, or an owned chunk

> A tile is owned when at least one owned parcel contains it, or when the chunk
> holding it is owned outright.

Parcels do not veto each other. An unowned parcel overlapping an owned one is
irrelevant to the answer.

This changes `SparseWorld.isTileOwned` for overlapping parcels, and that is
what needs approval. Three things argue for it over the first-match rule:

- **It is the rule already written down.** `docs/WORLD.md` ("Parcels and land
  ownership") says ownership "returns true if the tile falls within any owned
  parcel or directly owned chunk". The renderer implemented that sentence; the
  simulation did not. It is the only prose statement of the rule in the
  repository: [ADR-0004](./0004-chunk-size-selection.md) §2.3 says `isTileOwned`
  queries "parcel ownership or direct chunk ownership without assuming 1:1
  chunk alignment", which is about parcels not being chunk-aligned and says
  nothing about overlap. And that sentence is itself the subject of issue #120,
  which observes that the documentation had silently taken the renderer's side.
  So this says the disjunction is the *documented* rule — not that it has been
  ratified.
- **The first-match rule was not coherent as a rule.** It did not treat the
  lowest-id parcel as authoritative — when that parcel was unowned it did not
  answer "unowned", it *ignored parcels entirely* and fell through to chunk
  ownership. So an unowned parcel could mask an owned parcel but not an owned
  chunk. There is no ownership semantics under which that is the intended
  answer; it is what reusing a "which parcel is here" lookup as an ownership
  test happens to compute.
- **It is what a player would expect.** Land you bought is yours. Under
  first-match, a tile inside a parcel you paid for can be unbuildable because
  some *other*, unbought rectangle with an alphabetically earlier id overlaps
  it — an id ordering the player cannot see and did not choose.

### 3. `getParcelAtTile` keeps its rule, and keeps its sort

`getParcelAtTile` still answers "which parcel is here" as the first match in
ascending-id order, and still needs the canonical sort for the round-trip
reason above. It remains the right primitive for pricing, selection and any UI
that must name a single parcel. It is no longer the ownership test.

Ownership needs no sort at all now, which is a strictly stronger determinism
property than the old rule had: disjunction over a set gives the same answer
in any iteration order, so the answer cannot depend on registration order,
insertion order, or a snapshot round trip even in principle.

### 4. Overlapping bounds stay legal

Rejecting overlaps in `registerParcel` would make the question disappear, and
it is rejected for three reasons: it would make `fromSnapshot` refuse
previously-valid saves (boundary 7 — a persistence break with no migration),
it would delete a capability `getParcelAtTile` documents as deliberate, and it
would invalidate `tests/determinism/iteration-order.test.ts`, whose whole
subject is overlapping parcels. Composite and overlapping ownership regions
are also plausible future content (a leasehold inside an estate, a right of
way), and nothing yet says they should be impossible.

## Alternatives considered

- **Make the renderer follow "first parcel by id".** Rejected. It preserves
  current simulation behaviour, which is the one virtue it has, but it keeps a
  second implementation of a game rule inside the renderer, against boundary
  1; it requires shipping *all* parcels to the view rather than the owned ones,
  and makes `readTile`'s per-tile lookup scan every parcel in the world rather
  than only the owned ones; and it makes the incoherent rule of §2 permanent
  and load-bearing.
- **Keep both implementations, add a cross-checking test.** Rejected as the
  fix, per §1. The regression test in
  `tests/unit/rendering-world-view.test.ts` is worth having and has been
  added, but as a guard on one shared rule, not as a substitute for having one.
- **Reject overlapping bounds in `registerParcel`.** Rejected per §4.
- **Leave it alone because it is unreachable.** Rejected. Unreachable today is
  what makes it *cheap* to fix, not unimportant: the first content module that
  defines parcels inherits whichever answer is in the code, and there is no
  reason for that to be the accidental one.

## Consequences

- `SparseWorld.isTileOwned` returns `true` for tiles it previously reported as
  unowned, in exactly one situation: the tile is covered by an owned parcel
  *and* by a lower-id unowned parcel. `canBuildAt` therefore permits building
  there. No existing save, scenario or content path constructs that situation.
- Saves are unaffected. Ownership is derived, not stored — snapshots carry
  `parcels` and `ownedParcels` and nothing about tiles — so no format change
  and no migration is involved, and an old save restores to the new answer.
- `WorldRenderView` continues to receive only owned parcels in its projection.
  That is now correct by construction rather than by coincidence: unowned
  parcels genuinely cannot affect the answer.
- `docs/WORLD.md` becomes accurate about the simulation rather than only about
  the renderer, and states the overlap case explicitly instead of leaving it to
  be inferred. It also marks the half of the rule this ADR proposes as pending
  rather than settled, so a rejection does not make the document false.
- The doc comment on `WorldRenderView.isTileOwned`, which PR #90 rewrote to
  *state* the divergence, is replaced: it now says where the rule lives.
- `WorldRenderView.isTileOwned` no longer brands its coordinates with
  `tileCoordinate`, so it no longer throws `RangeError` for a fractional or
  unsafe-integer coordinate. It only ever threw while the view held at least
  one owned parcel, so that was never a guarantee a caller could rely on, and
  `readTile` answers every other field for such an input silently. The branded,
  validating entry point for tile ownership is `SparseWorld.isTileOwned`, which
  takes a `TilePosition`; the reason is recorded on the renderer method.
- No performance claim in this change is measured, and none is made. The
  benchmark harness (`benchmarks/scenarios/`) has no scenario that exercises
  `SparseWorld`, `WorldRenderView` or `readTile` — the two `world.chunk-size-*`
  scenarios are standalone models that do not import the simulation — so the
  signatures chosen here (loose coordinates rather than a `TilePosition`, a
  pre-resolved `chunkIsOwned` rather than a callback, a chunk key passed in by
  `readTile`) are recorded as allocation-avoiding shape choices and nothing
  more. A benchmark scenario for the render view's tile loop would be the way
  to say more than that, and it is not part of this change.
- `SparseWorld.isTileOwned` collects the owned parcels in canonical
  (ascending-id) order, even though a disjunction cannot depend on the order it
  is walked in. `docs/DETERMINISM.md` ("Canonical iteration order") states the
  rule for anything feeding simulation state with no exception, and this ADR
  does not add one.
- Nothing prevents a future change from reintroducing a private ownership rule
  in the renderer except the test that compares the two sides tile for tile.
  That test is the enforcement mechanism, and it should be treated as one.

## Amendment, 2026-08-27: "`canBuildAt` has exactly one caller" is false and was already false at the commit the last audit verified it against; the benchmark absence is false too

*This amends **§"Reachability: this is latent, not live"** and **the Consequences
bullet about the benchmark harness**. No decision moves: §1 through §4 are the
shipped rule, `isTileOwnedBy` is still the only definition of tile ownership, and
the *conclusion* both passages support — that no player can reach an overlap —
still holds, because the `registerParcel` half of the argument is intact. What
has gone false is two counts. The form is ADR 0029's amendment and ADR 0034 §9's:
the old wording is quoted rather than overwritten.*

*Status is untouched: this ADR remains **Accepted**. Read at `792bf94`
(v0.0.121); every `file:line` below was opened on that tree and both counts were
re-grepped rather than carried over.*

### 1. Three production callers, not one

§*Reachability* says:

> `canBuildAt` has exactly one caller in `src/` — `ConstructionSystem.submitOrder`,
> which refuses a build order on unowned land (#215) — and every other call site
> of both is a test.

`grep -rn "canBuildAt" src/` at `792bf94` returns three production call sites:

- `src/simulation/construction/system.ts:266` — `submitOrder`, the one named.
- `src/simulation/rooms/zoning.ts:445` — `canBuildAt(this.world, tile,
  ZONING_REQUIREMENT)`, one tile at a time across a zoning rectangle.
- `src/simulation/objects/object-placement-service.ts:349` —
  `canBuildAt(this.world, tile, PLACEMENT_REQUIREMENT)`, per placement footprint
  tile.

**The sentence was true when this ADR was accepted and stopped being true the
same day.** `7db3127` accepted it on 2026-08-24 at 13:03 UTC (v0.0.2);
`041a379`, *"Give ZoneRoom a consumer"* (#269), added the zoning caller at 18:18
UTC (v0.0.21). `6cededc` (#320, 2026-08-25, v0.0.61) added the third.

**Worth recording for whoever refreshes issue #274**, because it is a correction
to that audit rather than to this document alone: #274's exhaustive absolute
sweep lists this claim as row 8, *"VERIFIED — `buildability.ts:16` declares,
`construction/system.ts:137` is the sole call"*, and states that every finding
was re-verified at `main` @ `3f1a144` (v0.0.22). `3f1a144` is the release commit
for `041a379` — sixteen seconds after it — and
`git show 3f1a144:src/simulation/rooms/zoning.ts` already contains
`canBuildAt(this.world, tile, ZONING_REQUIREMENT)` at its line 236. So the row
was **false at the commit it was verified against**, not merely overtaken since.
An exhaustive grep is a claim about one instant and the instant has to be the one
the reader is given.

**What this does and does not change here.** It does not touch the decision: the
overlap case still needs two parcels covering one tile, and `registerParcel`'s
half of the argument re-verifies exactly — `sparse-world.ts:505` declares it,
`:740` is the sole call and is inside `fromSnapshot` (`:674`), and
`createNewSimulationRuntime` still builds `new SparseWorld(32)` with one loaded,
owned chunk and no parcels (`src/simulation/runtime/new-session.ts:279-281`). So
"no player can reach the divergence today" survives. What changes is the *stated
blast radius* of the ownership answer this ADR settles: it is consulted on a
build gesture, on every tile of a room-zoning gesture, and on every tile of an
object placement. The rule is three times as load-bearing as the paragraph
describing it says.

### 2. A benchmark scenario does exercise `SparseWorld`

The Consequences bullet says:

> The benchmark harness (`benchmarks/scenarios/`) has no scenario that exercises
> `SparseWorld`, `WorldRenderView` or `readTile` — the two `world.chunk-size-*`
> scenarios are standalone models that do not import the simulation.

The `world.chunk-size-*` half is still exact, and `docs/BENCHMARKING.md:36` says
the same thing about them in the same words. The leading clause is not.
`benchmarks/fixtures/navigation-layouts.mjs:100` and `:212` construct
`new nav.SparseWorld(PRODUCTION_CHUNK_SIZE)` from the real module, loaded through
`benchmarks/production-modules.mjs`'s `loadNavigationModules` (`:109`), and the
three `navigation.production.*` scenarios run on them —
`docs/BENCHMARKING.md:40-41` lists those three as **production**. That landed in
`454c5a5`, *"Drive three benchmark scenarios through the real navigation
modules"* (#410), which is recent enough that this sentence had been true for
almost the whole of this ADR's life.

`WorldRenderView` and `readTile` remain unbenchmarked, so the bullet's actual
point — that this change's signature choices are unmeasured shape choices and
nothing more — is unaffected and still stands. What is now available and was not
is a harness that *could* measure the tile loop, since the resolver that gets a
`.ts` module into a `.mjs` scenario already exists.

### 3. Flagged, not corrected: this document rests on four absences

Every one holds at `792bf94`, and each is the shape that rots without being
edited. Recorded together so the next reader can re-run them in one pass:
`registerParcel` has one production call site; nothing in `src/` registers a
parcel outside a snapshot restore; `isTileOwnedBy` is the only definition of tile
ownership and both `SparseWorld.isTileOwned` (`sparse-world.ts:585`) and
`WorldRenderView.isTileOwned` (`src/rendering/world/world-view.ts:232`) call it;
and no module under `src/rendering/` implements an ownership rule of its own. The
last of those is the one the Consequences already name as enforced only by a
test — *"That test is the enforcement mechanism, and it should be treated as
one"* — and that remains the right reading. The first two are what keep the
decision latent, and the day either stops being true is the day this ADR's
reachability section has to be rewritten rather than amended.
